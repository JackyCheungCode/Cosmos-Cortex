create extension if not exists pgcrypto;

create or replace function public.set_crm_owner_and_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null then
      raise exception 'A signed-in CRM owner is required';
    end if;
    new.owner_id := auth.uid();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  company text not null default '',
  title text not null default '',
  email text not null default '',
  phone text not null default '',
  source text not null default 'other',
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'unqualified')),
  rating text not null default 'warm' check (rating in ('cold', 'warm', 'hot')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  account_number text not null default '',
  type text not null default 'customer' check (type in ('customer', 'prospect', 'partner')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  industry text not null default '',
  website text not null default '',
  phone text not null default '',
  billing_city text not null default '',
  billing_country text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, account_number)
);

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.crm_accounts(id) on delete set null,
  first_name text not null,
  last_name text not null default '',
  title text not null default '',
  department text not null default '',
  email text not null default '',
  phone text not null default '',
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.crm_accounts(id) on delete set null,
  contact_id uuid references public.crm_contacts(id) on delete set null,
  name text not null,
  stage text not null default 'prospecting' check (stage in ('prospecting', 'qualification', 'needs_analysis', 'proposal', 'negotiation', 'won', 'lost')),
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  probability smallint not null default 10 check (probability between 0 and 100),
  close_date date,
  lead_source text not null default '',
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  account_id uuid references public.crm_accounts(id) on delete set null,
  quote_number text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired')),
  issue_date date not null default current_date,
  expiration_date date,
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  tax numeric(14, 2) not null default 0 check (tax >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  currency char(3) not null default 'CNY',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, quote_number)
);

create table if not exists public.crm_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.crm_accounts(id) on delete set null,
  quote_id uuid references public.crm_quotes(id) on delete set null,
  order_number text not null,
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'processing', 'partially_shipped', 'shipped', 'completed', 'cancelled')),
  order_date date not null default current_date,
  requested_delivery_date date,
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  tax numeric(14, 2) not null default 0 check (tax >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),
  currency char(3) not null default 'CNY',
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partial', 'paid', 'overdue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, order_number)
);

create table if not exists public.crm_deliveries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.crm_orders(id),
  delivery_number text not null,
  status text not null default 'planned' check (status in ('planned', 'packed', 'shipped', 'delivered', 'exception')),
  carrier text not null default '',
  tracking_number text not null default '',
  shipped_at timestamptz,
  delivered_at timestamptz,
  delivery_address text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, delivery_number)
);

create table if not exists public.crm_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid not null references public.crm_orders(id),
  payment_number text not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency char(3) not null default 'CNY',
  payment_date date not null default current_date,
  method text not null default 'bank_transfer',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  reference text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, payment_number)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'crm_leads',
    'crm_accounts',
    'crm_contacts',
    'crm_opportunities',
    'crm_quotes',
    'crm_orders',
    'crm_deliveries',
    'crm_payments'
  ]
  loop
    execute format(
      'drop trigger if exists set_owner_and_updated_at on public.%I',
      table_name
    );
    execute format(
      'create trigger set_owner_and_updated_at before insert or update on public.%I for each row execute function public.set_crm_owner_and_updated_at()',
      table_name
    );
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists crm_owner_all on public.%I', table_name);
    execute format(
      'create policy crm_owner_all on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      table_name
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end;
$$;

create index if not exists crm_leads_owner_created_idx on public.crm_leads (owner_id, created_at desc);
create index if not exists crm_accounts_owner_created_idx on public.crm_accounts (owner_id, created_at desc);
create index if not exists crm_contacts_owner_created_idx on public.crm_contacts (owner_id, created_at desc);
create index if not exists crm_opportunities_owner_stage_idx on public.crm_opportunities (owner_id, stage);
create index if not exists crm_quotes_owner_status_idx on public.crm_quotes (owner_id, status);
create index if not exists crm_orders_owner_status_idx on public.crm_orders (owner_id, status);
create index if not exists crm_deliveries_owner_status_idx on public.crm_deliveries (owner_id, status);
create index if not exists crm_payments_owner_status_idx on public.crm_payments (owner_id, status);

create or replace function public.crm_dashboard()
returns jsonb
language sql
security invoker
set search_path = public
as $$
with opportunity_stages as (
  select
    stage,
    count(*)::integer as count,
    coalesce(sum(amount), 0)::numeric(14, 2) as amount
  from public.crm_opportunities
  where stage not in ('won', 'lost')
  group by stage
),
monthly_revenue as (
  select
    to_char(date_trunc('month', payment_date), 'YYYY-MM') as month,
    sum(amount)::numeric(14, 2) as amount
  from public.crm_payments
  where status = 'paid'
    and payment_date >= date_trunc('month', current_date) - interval '5 months'
  group by date_trunc('month', payment_date)
  order by date_trunc('month', payment_date)
),
recent as (
  select id, 'leads'::text as entity,
    jsonb_build_object('name', name, 'company', company, 'status', status) as data,
    created_at, updated_at
  from public.crm_leads
  union all
  select id, 'accounts',
    jsonb_build_object('name', name, 'type', type, 'industry', industry),
    created_at, updated_at
  from public.crm_accounts
  union all
  select id, 'contacts',
    jsonb_build_object('first_name', first_name, 'last_name', last_name, 'email', email),
    created_at, updated_at
  from public.crm_contacts
  union all
  select id, 'opportunities',
    jsonb_build_object('name', name, 'stage', stage, 'amount', amount),
    created_at, updated_at
  from public.crm_opportunities
  union all
  select id, 'quotes',
    jsonb_build_object('quote_number', quote_number, 'status', status, 'total', total),
    created_at, updated_at
  from public.crm_quotes
  union all
  select id, 'orders',
    jsonb_build_object('order_number', order_number, 'status', status, 'total', total),
    created_at, updated_at
  from public.crm_orders
  union all
  select id, 'deliveries',
    jsonb_build_object('delivery_number', delivery_number, 'status', status, 'carrier', carrier),
    created_at, updated_at
  from public.crm_deliveries
  union all
  select id, 'payments',
    jsonb_build_object('payment_number', payment_number, 'status', status, 'amount', amount),
    created_at, updated_at
  from public.crm_payments
)
select jsonb_build_object(
  'lead_count', (select count(*)::integer from public.crm_leads),
  'qualified_lead_count', (select count(*)::integer from public.crm_leads where status = 'qualified'),
  'open_opportunity_count', (select count(*)::integer from public.crm_opportunities where stage not in ('won', 'lost')),
  'pipeline_value', (select coalesce(sum(amount), 0)::numeric(14, 2) from public.crm_opportunities where stage not in ('won', 'lost')),
  'weighted_pipeline_value', (
    select coalesce(sum(amount * probability / 100), 0)::numeric(14, 2)
    from public.crm_opportunities where stage not in ('won', 'lost')
  ),
  'won_revenue', (select coalesce(sum(amount), 0)::numeric(14, 2) from public.crm_opportunities where stage = 'won'),
  'quote_count', (select count(*)::integer from public.crm_quotes where status in ('draft', 'sent')),
  'open_order_count', (select count(*)::integer from public.crm_orders where status in ('confirmed', 'processing', 'partially_shipped')),
  'orders_to_ship', (select count(*)::integer from public.crm_deliveries where status in ('planned', 'packed')),
  'outstanding_balance', (
    select coalesce(sum(greatest(o.total - coalesce(p.paid, 0), 0)), 0)::numeric(14, 2)
    from public.crm_orders o
    left join (
      select order_id, sum(amount) as paid
      from public.crm_payments where status = 'paid' group by order_id
    ) p on p.order_id = o.id
    where o.status <> 'cancelled'
  ),
  'monthly_revenue', coalesce((
    select jsonb_agg(jsonb_build_object('month', month, 'amount', amount) order by month)
    from monthly_revenue
  ), '[]'::jsonb),
  'opportunities_by_stage', coalesce((
    select jsonb_agg(jsonb_build_object('stage', stage, 'count', count, 'amount', amount) order by stage)
    from opportunity_stages
  ), '[]'::jsonb),
  'recent_records', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', id,
        'entity', entity,
        'data', data,
        'created_at', created_at,
        'updated_at', updated_at
      ) order by created_at desc
    )
    from (select * from recent order by created_at desc limit 8) latest
  ), '[]'::jsonb)
);
$$;

grant execute on function public.crm_dashboard() to authenticated;
