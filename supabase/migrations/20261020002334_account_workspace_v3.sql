-- Account workspace v3 schema expansion. Applied to production on 2026-10-20; migration version matches Supabase history.
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
  add column if not exists next_follow_up_at date,
  add column if not exists merged_into_account_id uuid references public.crm_accounts(id) on delete set null;

-- Empty account numbers are allowed; only non-empty numbers must be unique per owner.
alter table public.crm_accounts drop constraint if exists crm_accounts_owner_id_account_number_key;
create unique index if not exists crm_accounts_owner_number_nonempty_idx
 on public.crm_accounts(owner_id, account_number)
 where account_number <> '';

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

create or replace function public.set_crm_account_address_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $account_address_updated_at$
begin
 new.updated_at := now();
 return new;
end;
$account_address_updated_at$;

drop trigger if exists crm_account_addresses_updated_at on public.crm_account_addresses;
create trigger crm_account_addresses_updated_at before update on public.crm_account_addresses
 for each row execute function public.set_crm_account_address_updated_at();

drop policy if exists "Account owners insert account change history" on public.crm_account_change_history;
create policy "Account owners insert account change history" on public.crm_account_change_history
 for insert to authenticated
 with check (exists (select 1 from public.crm_accounts a where a.id = account_id and a.owner_id = (select auth.uid())));


-- Merge records transactionally without deleting the source account or its audit history.
create or replace function public.merge_crm_accounts(source_account_id uuid, target_account_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
 source_owner uuid;
 target_owner uuid;
 target_lifecycle text;
begin
 if auth.uid() is null then
  raise exception 'A signed-in CRM owner is required';
 end if;
 if source_account_id = target_account_id then
  raise exception 'Source and target accounts must be different';
 end if;

 select owner_id into source_owner
 from public.crm_accounts where id = source_account_id;
 select owner_id, lifecycle_stage into target_owner, target_lifecycle
 from public.crm_accounts where id = target_account_id;

 if source_owner is null or target_owner is null then
  raise exception 'Source or target account was not found';
 end if;
 if source_owner <> (select auth.uid()) or target_owner <> (select auth.uid()) then
  raise exception 'Both accounts must belong to the signed-in owner';
 end if;
 if exists (select 1 from public.crm_accounts where id = source_account_id and merged_into_account_id is not null) then
  raise exception 'Source account has already been merged';
 end if;
 if target_lifecycle = 'merged' then
  raise exception 'Cannot merge into an already merged account';
 end if;

 update public.crm_contacts set account_id = target_account_id where account_id = source_account_id;
 update public.crm_opportunities set account_id = target_account_id where account_id = source_account_id;
 update public.crm_quotes set account_id = target_account_id where account_id = source_account_id;
 update public.crm_orders set account_id = target_account_id where account_id = source_account_id;
 update public.crm_account_addresses set account_id = target_account_id where account_id = source_account_id;
 update public.crm_account_activities set account_id = target_account_id where account_id = source_account_id;
 update public.crm_accounts set parent_account_id = target_account_id where parent_account_id = source_account_id and id <> source_account_id;

 update public.crm_accounts
 set status = 'inactive',
     lifecycle_stage = 'merged',
     merged_into_account_id = target_account_id,
     parent_account_id = null,
     updated_at = now()
 where id = source_account_id;
end;
$$;

revoke all on function public.merge_crm_accounts(uuid, uuid) from public;
grant execute on function public.merge_crm_accounts(uuid, uuid) to authenticated;
