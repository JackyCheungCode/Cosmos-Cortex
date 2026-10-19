import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateCrmRecordBody,
  CreateCrmRecordQueryParams,
  CreateCrmRecordResponse,
  DeleteCrmRecordParams,
  GetCrmRecordParams,
  GetCrmRecordResponse,
  GetDashboardResponse,
  ListCrmRecordsQueryParams,
  ListCrmRecordsResponse,
  UpdateCrmRecordBody,
  UpdateCrmRecordParams,
  UpdateCrmRecordResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const tableByEntity = {
  leads: "crm_leads",
  accounts: "crm_accounts",
  contacts: "crm_contacts",
  opportunities: "crm_opportunities",
  quotes: "crm_quotes",
  orders: "crm_orders",
  deliveries: "crm_deliveries",
  payments: "crm_payments",
} as const;

type CrmEntity = keyof typeof tableByEntity;
type JsonRecord = Record<string, unknown>;

const searchableFields: Record<CrmEntity, string[]> = {
  leads: ["name", "company", "email", "phone"],
  accounts: ["name", "account_number", "industry", "billing_city"],
  contacts: ["first_name", "last_name", "email", "phone", "department"],
  opportunities: ["name", "lead_source", "description"],
  quotes: ["quote_number", "notes"],
  orders: ["order_number"],
  deliveries: ["delivery_number", "carrier", "tracking_number"],
  payments: ["payment_number", "reference"],
};

const statusColumn: Record<CrmEntity, string> = {
  leads: "status",
  accounts: "status",
  contacts: "status",
  opportunities: "stage",
  quotes: "status",
  orders: "status",
  deliveries: "status",
  payments: "status",
};

class CrmHttpError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`CRM request failed with status ${status}`);
  }
}

class SupabaseHttpError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`Supabase returned status ${status}`);
  }
}

function isCrmEntity(value: unknown): value is CrmEntity {
  return typeof value === "string" && Object.hasOwn(tableByEntity, value);
}

function getSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new CrmHttpError(503, {
      error: "Supabase is not configured for this environment.",
    });
  }

  return { url: url.replace(/\/+$/, ""), anonKey };
}

function getAuthorization(req: Request): string {
  const authorization = req.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new CrmHttpError(401, {
      error: "Sign in to your CRM account to continue.",
    });
  }
  return authorization;
}

async function supabaseRequest(
  req: Request,
  path: string,
  init: RequestInit = {},
): Promise<{ payload: unknown; response: globalThis.Response }> {
  const { url, anonKey } = getSupabaseConfig();
  const authorization = getAuthorization(req);
  const headers = new Headers(init.headers);
  headers.set("apikey", anonKey);
  headers.set("authorization", authorization);
  headers.set("accept", "application/json");

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers,
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new SupabaseHttpError(response.status, payload);
  }

  return { payload, response };
}

function parseRow(entity: CrmEntity, row: JsonRecord): unknown {
  const {
    id,
    owner_id: _ownerId,
    created_at,
    updated_at,
    ...data
  } = row;
  return {
    id,
    entity,
    data,
    created_at,
    updated_at,
  };
}

function sanitizeRecordData(data: JsonRecord): JsonRecord {
  const protectedFields = new Set([
    "id",
    "owner_id",
    "created_at",
    "updated_at",
  ]);

  return Object.fromEntries(
    Object.entries(data).filter(([key]) => !protectedFields.has(key)),
  );
}

function escapePostgrestPattern(value: string): string {
  return value.replace(/[\\%_*(),]/g, "\\$&");
}

function readCount(response: globalThis.Response, fallback: number): number {
  const contentRange = response.headers.get("content-range");
  if (!contentRange) return fallback;
  const total = contentRange.split("/").at(-1);
  const parsed = Number(total);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sendError(req: Request, res: Response, error: unknown): void {
  if (error instanceof CrmHttpError || error instanceof SupabaseHttpError) {
    res.status(error.status).json(error.payload);
    return;
  }

  req.log.error({ err: error }, "CRM API request failed");
  res.status(500).json({ error: "CRM request failed unexpectedly." });
}

function withErrors(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response) => Promise<void> {
  return async (req, res): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error) {
      sendError(req, res, error);
    }
  };
}

router.get(
  "/dashboard",
  withErrors(async (req, res): Promise<void> => {
    const { payload } = await supabaseRequest(req, "rpc/crm_dashboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    res.json(GetDashboardResponse.parse(payload));
  }),
);

router.get(
  "/crm",
  withErrors(async (req, res): Promise<void> => {
    const parsed = ListCrmRecordsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { entity, q, status, page, page_size: pageSize } = parsed.data;
    if (!isCrmEntity(entity)) {
      res.status(400).json({ error: "Unknown CRM module." });
      return;
    }

    const params = new URLSearchParams({
      select: "*",
      order: "created_at.desc",
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    });
    if (status) params.set(statusColumn[entity], `eq.${status}`);
    if (q?.trim()) {
      const pattern = escapePostgrestPattern(q.trim());
      params.set(
        "or",
        `(${searchableFields[entity]
          .map((field) => `${field}.ilike.*${pattern}*`)
          .join(",")})`,
      );
    }

    const { payload, response } = await supabaseRequest(
      req,
      `${tableByEntity[entity]}?${params.toString()}`,
      { headers: { prefer: "count=exact" } },
    );
    const rows = Array.isArray(payload) ? (payload as JsonRecord[]) : [];
    res.json(
      ListCrmRecordsResponse.parse({
        items: rows.map((row) => parseRow(entity, row)),
        total: readCount(response, rows.length),
        page,
        page_size: pageSize,
      }),
    );
  }),
);

router.post(
  "/crm",
  withErrors(async (req, res): Promise<void> => {
    const parsedParams = CreateCrmRecordQueryParams.safeParse(req.query);
    const parsedBody = CreateCrmRecordBody.safeParse(req.body);
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.message });
      return;
    }
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.message });
      return;
    }
    const { entity } = parsedParams.data;
    if (!isCrmEntity(entity)) {
      res.status(400).json({ error: "Unknown CRM module." });
      return;
    }

    const { payload } = await supabaseRequest(
      req,
      `${tableByEntity[entity]}?select=*`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify(sanitizeRecordData(parsedBody.data.data)),
      },
    );
    const row = Array.isArray(payload) ? payload[0] : payload;
    if (!row || typeof row !== "object") {
      throw new CrmHttpError(502, {
        error: "Supabase did not return the created CRM record.",
      });
    }
    res.status(201).json(
      CreateCrmRecordResponse.parse(parseRow(entity, row as JsonRecord)),
    );
  }),
);

router.get(
  "/crm/:entity/:id",
  withErrors(async (req, res): Promise<void> => {
    const parsed = GetCrmRecordParams.safeParse(req.params);
    if (!parsed.success || !isCrmEntity(parsed.data.entity)) {
      res.status(400).json({
        error: parsed.success ? "Unknown CRM module." : parsed.error.message,
      });
      return;
    }
    const { entity, id } = parsed.data;
    const params = new URLSearchParams({ id: `eq.${id}`, select: "*" });
    const { payload } = await supabaseRequest(
      req,
      `${tableByEntity[entity]}?${params.toString()}`,
    );
    const row = Array.isArray(payload) ? payload[0] : undefined;
    if (!row || typeof row !== "object") {
      res.status(404).json({ error: "CRM record not found." });
      return;
    }
    res.json(GetCrmRecordResponse.parse(parseRow(entity, row as JsonRecord)));
  }),
);

router.patch(
  "/crm/:entity/:id",
  withErrors(async (req, res): Promise<void> => {
    const parsedParams = UpdateCrmRecordParams.safeParse(req.params);
    const parsedBody = UpdateCrmRecordBody.safeParse(req.body);
    if (
      !parsedParams.success ||
      !parsedBody.success ||
      !isCrmEntity(parsedParams.data.entity)
    ) {
      res.status(400).json({
        error: !parsedParams.success
          ? parsedParams.error.message
          : !parsedBody.success
            ? parsedBody.error.message
            : "Unknown CRM module.",
      });
      return;
    }
    const { entity, id } = parsedParams.data;
    const params = new URLSearchParams({ id: `eq.${id}`, select: "*" });
    const { payload } = await supabaseRequest(
      req,
      `${tableByEntity[entity]}?${params.toString()}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify(sanitizeRecordData(parsedBody.data.data)),
      },
    );
    const row = Array.isArray(payload) ? payload[0] : undefined;
    if (!row || typeof row !== "object") {
      res.status(404).json({ error: "CRM record not found." });
      return;
    }
    res.json(
      UpdateCrmRecordResponse.parse(parseRow(entity, row as JsonRecord)),
    );
  }),
);

router.delete(
  "/crm/:entity/:id",
  withErrors(async (req, res): Promise<void> => {
    const parsed = DeleteCrmRecordParams.safeParse(req.params);
    if (!parsed.success || !isCrmEntity(parsed.data.entity)) {
      res.status(400).json({
        error: parsed.success ? "Unknown CRM module." : parsed.error.message,
      });
      return;
    }
    const { entity, id } = parsed.data;
    const params = new URLSearchParams({ id: `eq.${id}`, select: "id" });
    const { payload } = await supabaseRequest(
      req,
      `${tableByEntity[entity]}?${params.toString()}`,
      {
        method: "DELETE",
        headers: { prefer: "return=representation" },
      },
    );
    if (!Array.isArray(payload) || payload.length === 0) {
      res.status(404).json({ error: "CRM record not found." });
      return;
    }
    res.status(204).send();
  }),
);

export default router;
