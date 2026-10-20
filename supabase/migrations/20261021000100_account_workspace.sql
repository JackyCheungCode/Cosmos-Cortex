-- Account workspace v3 schema expansion. This file is committed only; it is not applied to production.
alter table public.crm_accounts
  add column if not exists email text not null default '',
  add column if not exists annual_revenue numeric(14,2),
  add column if not exists employee_count integer,
  add column if not exists rating text not null default 'warm',
  add column if not exists source text not null default 'other',
  add column if not exists parent_account_id uuid references public.crm_accounts(id) on delete set null,
  add column if not exists billing_street text not null default '',
  add column if not exists billing_state text not null default '',
  add column if not exists billing_postal_code text not null default '',
  add column if not exists shipping_street text not null default '',
  add column if not exists shipping_city text not null default '',
  add column if not exists shipping_state text not null default '',
  add column if not exists shipping_postal_code text not null default '',
  add column if not exists shipping_country text not null default '',
  add column if not exists credit_limit numeric(14,2),
  add column if not exists payment_terms text not null default 'net_30',
  add column if not exists currency char(3) not null default 'CNY',
  add column if not exists tax_id text not null default '',
  add column if not exists description text not null default '',
  add column if not exists lifecycle_stage text not null default 'customer',
  add column if not exists health_score smallint,
  add column if not exists next_follow_up_at date;

alter table public.crm_accounts drop constraint if exists crm_accounts_type_check;
alter table public.crm_accounts add constraint crm_accounts_type_check check (type in ('customer','prospect','partner','supplier'));
alter table public.crm_accounts drop constraint if exists crm_accounts_status_check;
alter table public.crm_accounts add constraint crm_accounts_status_check check (status in ('active','inactive','frozen'));
alter table public.crm_accounts add constraint crm_accounts_parent_not_self check (parent_account_id is null or parent_account_id <> id);
alter table public.crm_accounts add constraint crm_accounts_health_score_range check (health_score is null or health_score between 0 and 100);
alter table public.crm_accounts add constraint crm_accounts_employee_count_nonnegative check (employee_count is null or employee_count >= 0);
alter table public.crm_accounts add constraint crm_accounts_revenue_nonnegative check (annual_revenue is null or annual_revenue >= 0);
alter table public.crm_accounts add constraint crm_accounts_credit_nonnegative check (credit_limit is null or credit_limit >= 0);

create index if not exists crm_accounts_parent_account_id_idx on public.crm_accounts(parent_account_id);
create index if not exists crm_accounts_lifecycle_stage_idx on public.crm_accounts(lifecycle_stage);
create index if not exists crm_accounts_next_follow_up_idx on public.crm_accounts(next_follow_up_at);

create table if not exists public.crm_account_addresses (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.crm_accounts(id) on delete cascade,
 label text not null default '',
 kind text not null default 'other' check (kind in ('billing','shipping','office','warehouse','other')),
 street text not null default '',
 city text not null default '',
 state text not null default '',
 postal_code text not null default '',
 country text not null default '',
 is_primary boolean not null default false,
 notes text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists crm_account_addresses_account_id_idx on public.crm_account_addresses(account_id);

create table if not exists public.crm_account_activities (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.crm_accounts(id) on delete cascade,
 kind text not null default 'note' check (kind in ('note','call','email','meeting','task','status_change')),
 subject text not null default '',
 body text not null default '',
 occurred_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create index if not exists crm_account_activities_account_time_idx on public.crm_account_activities(account_id, occurred_at desc);

create table if not exists public.crm_account_change_history (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.crm_accounts(id) on delete cascade,
 action text not null check (action in ('insert','update')),
 old_data jsonb,
 new_data jsonb,
 changed_at timestamptz not null default now()
);
create index if not exists crm_account_change_history_account_time_idx on public.crm_account_change_history(account_id, changed_at desc);

alter table public.crm_account_addresses enable row level security;
alter table public.crm_account_activities enable row level security;
alter table public.crm_account_change_history enable row level security;

drop policy if exists "Account owners manage account addresses" on public.crm_account_addresses;
create policy "Account owners manage account addresses" on public.crm_account_addresses
 for all to authenticated
 using (exists (select 1 from public.crm_accounts a where a.id = account_id and a.owner_id = (select auth.uid())))
 with check (exists (select 1 from public.crm_accounts a where a.id = account_id and a.owner_id = (select auth.uid())));

drop policy if exists "Account owners manage account activities" on public.crm_account_activities;
create policy "Account owners manage account activities" on public.crm_account_activities
 for all to authenticated
 using (exists (select 1 from public.crm_accounts a where a.id = account_id and a.owner_id = (select auth.uid())))
 with check (exists (select 1 from public.crm_accounts a where a.id = account_id and a.owner_id = (select auth.uid())));

drop policy if exists "Account owners read account change history" on public.crm_account_change_history;
create policy "Account owners read account change history" on public.crm_account_change_history
 for select to authenticated
 using (exists (select 1 from public.crm_accounts a where a.id = account_id and a.owner_id = (select auth.uid())));

create or replace function public.log_crm_account_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
 if tg_op = 'INSERT' then
  insert into public.crm_account_change_history(account_id, action, old_data, new_data)
  values (new.id, 'insert', null, to_jsonb(new));
  return new;
 end if;
 insert into public.crm_account_change_history(account_id, action, old_data, new_data)
 values (new.id, 'update', to_jsonb(old), to_jsonb(new));
 return new;
end;
$$;

drop trigger if exists crm_accounts_log_change on public.crm_accounts;
create trigger crm_accounts_log_change
 after insert or update on public.crm_accounts
 for each row execute function public.log_crm_account_change();

drop trigger if exists crm_account_addresses_updated_at on public.crm_account_addresses;
create trigger crm_account_addresses_updated_at before update on public.crm_account_addresses
 for each row execute function public.set_crm_owner_and_updated_at();

drop policy if exists "Account owners insert account change history" on public.crm_account_change_history;
create policy "Account owners insert account change history" on public.crm_account_change_history
 for insert to authenticated
 with check (exists (select 1 from public.crm_accounts a where a.id = account_id and a.owner_id = (select auth.uid())));
