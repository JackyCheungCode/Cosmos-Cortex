interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

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

function json(payload: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(payload === null ? null : JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...Object.fromEntries(new Headers(headers).entries()),
    },
  });
}

function isCrmEntity(value: string | undefined): value is CrmEntity {
  return value !== undefined && Object.hasOwn(tableByEntity, value);
}

function parseRow(entity: CrmEntity, row: JsonRecord): JsonRecord {
  const {
    id,
    owner_id: _ownerId,
    created_at,
    updated_at,
    ...data
  } = row;
  return { id, entity, data, created_at, updated_at };
}

function sanitizeRecordData(data: JsonRecord): JsonRecord {
  const protectedFields = new Set(["id", "owner_id", "created_at", "updated_at"]);
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => !protectedFields.has(key)),
  );
}

function escapePostgrestPattern(value: string): string {
  return value.replace(/[\\%_*(),]/g, "\\$&");
}

async function callSupabase(
  request: Request,
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<{ payload: unknown; response: Response }> {
  const baseUrl = env.SUPABASE_URL?.replace(/\/+$/, "");
  const anonKey = env.SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization");
  if (!baseUrl || !anonKey) {
    throw new Response(
      JSON.stringify({ error: "Supabase is not configured for Cloudflare Pages." }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
  if (!authorization?.startsWith("Bearer ")) {
    throw new Response(
      JSON.stringify({ error: "Sign in to your CRM account to continue." }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }

  const headers = new Headers(init.headers);
  headers.set("apikey", anonKey);
  headers.set("authorization", authorization);
  headers.set("accept", "application/json");
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
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
    throw json(payload ?? { error: "Supabase request failed." }, response.status);
  }
  return { payload, response };
}


async function routeAuth(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname.replace(/\/+$/, "");
  if (path !== "/api/auth/resolve-account" && path !== "/api/auth/sign-in-username") return null;
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const baseUrl = env.SUPABASE_URL?.replace(/\/+$/, "");
  const anonKey = env.SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !anonKey || !serviceKey) return json({ error: "Account sign-in is not configured." }, 503);
  let body: { identifier?: unknown; mode?: unknown; username?: unknown; password?: unknown };
  try { body = await request.json() as typeof body; } catch { return json({ error: "Invalid request." }, 400); }
  if (path === "/api/auth/resolve-account") {
    const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
    const mode = body.mode;
    if (!identifier || identifier.length > 254 || (mode !== "email" && mode !== "username")) return json({ error: "Invalid account identifier." }, 400);
    let exists = false;
    if (mode === "username") {
      const lookup = new URL(baseUrl + "/rest/v1/crm_login_accounts");
      lookup.search = new URLSearchParams({ select: "username", username: "eq." + identifier, limit: "1" }).toString();
      const response = await fetch(lookup, { headers: { apikey: serviceKey, authorization: "Bearer " + serviceKey, accept: "application/json" } });
      if (!response.ok) return json({ error: "Account verification is temporarily unavailable." }, 503);
      const rows = await response.json() as unknown[];
      exists = Array.isArray(rows) && rows.length > 0;
    } else {
      const response = await fetch(baseUrl + "/auth/v1/admin/users?page=1&per_page=1000", { headers: { apikey: serviceKey, authorization: "Bearer " + serviceKey, accept: "application/json" } });
      if (!response.ok) return json({ error: "Account verification is temporarily unavailable." }, 503);
      const payload = await response.json() as { users?: Array<{ email?: string | null; deleted_at?: string | null }> };
      exists = (payload.users ?? []).some((user) => !user.deleted_at && user.email?.toLowerCase() === identifier.toLowerCase());
    }
    return json({ exists });
  }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || username.length > 128 || !password || password.length > 1024) return json({ error: "Invalid credentials." }, 400);
  const lookup = new URL(baseUrl + "/rest/v1/crm_login_accounts");
  lookup.search = new URLSearchParams({ select: "email", username: "eq." + username, limit: "1" }).toString();
  const mappingResponse = await fetch(lookup, { headers: { apikey: serviceKey, authorization: "Bearer " + serviceKey, accept: "application/json" } });
  if (!mappingResponse.ok) return json({ error: "Sign-in failed." }, 401);
  const mappings = await mappingResponse.json() as Array<{ email?: string }>;
  const email = Array.isArray(mappings) && mappings.length === 1 ? mappings[0]?.email : undefined;
  if (!email) return json({ error: "Sign-in failed." }, 401);
  const authResponse = await fetch(baseUrl + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const authPayload = await authResponse.json().catch(() => null) as Record<string, unknown> | null;
  if (!authResponse.ok || !authPayload?.access_token || !authPayload?.refresh_token) return json({ error: "Sign-in failed." }, 401);
  return json({ access_token: authPayload.access_token, refresh_token: authPayload.refresh_token });
}

async function routeCrm(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const method = request.method.toUpperCase();
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "/api/dashboard" && method === "GET") {
    const { payload } = await callSupabase(request, env, "rpc/crm_dashboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    return json(payload);
  }

  if (path === "/api/crm" && method === "GET") {
    const entity = url.searchParams.get("entity") ?? undefined;
    if (!isCrmEntity(entity)) return json({ error: "Unknown CRM module." }, 400);
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("page_size") || 50)),
    );
    const params = new URLSearchParams({
      select: "*",
      order: "created_at.desc",
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    });
    const status = url.searchParams.get("status");
    if (status) params.set(statusColumn[entity], `eq.${status}`);
    const q = url.searchParams.get("q")?.trim();
    if (q) {
      const pattern = escapePostgrestPattern(q);
      params.set(
        "or",
        `(${searchableFields[entity].map((field) => `${field}.ilike.*${pattern}*`).join(",")})`,
      );
    }
    const { payload, response } = await callSupabase(
      request,
      env,
      `${tableByEntity[entity]}?${params.toString()}`,
      { headers: { prefer: "count=exact" } },
    );
    const rows = Array.isArray(payload) ? (payload as JsonRecord[]) : [];
    const range = response.headers.get("content-range");
    const total = Number(range?.split("/").at(-1));
    return json({
      items: rows.map((row) => parseRow(entity, row)),
      total: Number.isFinite(total) ? total : rows.length,
      page,
      page_size: pageSize,
    });
  }

  if (path === "/api/crm" && method === "POST") {
    const entity = url.searchParams.get("entity") ?? undefined;
    if (!isCrmEntity(entity)) return json({ error: "Unknown CRM module." }, 400);
    const body = (await request.json()) as { data?: JsonRecord };
    if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
      return json({ error: "A record data object is required." }, 400);
    }
    const { payload } = await callSupabase(
      request,
      env,
      `${tableByEntity[entity]}?select=*`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify(sanitizeRecordData(body.data)),
      },
    );
    const row = Array.isArray(payload) ? payload[0] : payload;
    if (!row || typeof row !== "object") {
      return json({ error: "Supabase did not return the created CRM record." }, 502);
    }
    return json(parseRow(entity, row as JsonRecord), 201);
  }

  const recordMatch = path.match(/^\/api\/crm\/([^/]+)\/([^/]+)$/);
  if (recordMatch) {
    const [, rawEntity, id] = recordMatch;
    if (!isCrmEntity(rawEntity)) return json({ error: "Unknown CRM module." }, 400);
    const params = new URLSearchParams({ id: `eq.${id}`, select: "*" });

    if (method === "GET") {
      const { payload } = await callSupabase(
        request,
        env,
        `${tableByEntity[rawEntity]}?${params.toString()}`,
      );
      const row = Array.isArray(payload) ? payload[0] : undefined;
      return row && typeof row === "object"
        ? json(parseRow(rawEntity, row as JsonRecord))
        : json({ error: "CRM record not found." }, 404);
    }

    if (method === "PATCH") {
      const body = (await request.json()) as { data?: JsonRecord };
      if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
        return json({ error: "A record data object is required." }, 400);
      }
      const { payload } = await callSupabase(
        request,
        env,
        `${tableByEntity[rawEntity]}?${params.toString()}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            prefer: "return=representation",
          },
          body: JSON.stringify(sanitizeRecordData(body.data)),
        },
      );
      const row = Array.isArray(payload) ? payload[0] : undefined;
      return row && typeof row === "object"
        ? json(parseRow(rawEntity, row as JsonRecord))
        : json({ error: "CRM record not found." }, 404);
    }

    if (method === "DELETE") {
      params.set("select", "id");
      const { payload } = await callSupabase(
        request,
        env,
        `${tableByEntity[rawEntity]}?${params.toString()}`,
        {
          method: "DELETE",
          headers: { prefer: "return=representation" },
        },
      );
      if (!Array.isArray(payload) || payload.length === 0) {
        return json({ error: "CRM record not found." }, 404);
      }
      return new Response(null, { status: 204 });
    }
  }

  return json({ error: "Not found." }, 404);
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "access-control-allow-headers": "authorization, content-type",
      },
    });
  }

  try {
    const url = new URL(request.url);
    const authResponse = await routeAuth(request, env, url);
    if (authResponse) {
      const headers = new Headers(authResponse.headers);
      headers.set("access-control-allow-origin", "*");
      return new Response(authResponse.body, { status: authResponse.status, statusText: authResponse.statusText, headers });
    }
    const response = await routeCrm(request, env, url);
    const headers = new Headers(response.headers);
    headers.set("access-control-allow-origin", "*");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "CRM request failed unexpectedly." }, 500);
  }
}
