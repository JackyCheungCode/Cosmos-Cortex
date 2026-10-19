create table if not exists public.crm_contact_activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  kind text not null default 'note' check (kind in ('note', 'call', 'email', 'meeting')),
  subject text not null,
  body text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_owner_and_updated_at on public.crm_contact_activities;
create trigger set_owner_and_updated_at
before insert or update on public.crm_contact_activities
for each row execute function public.set_crm_owner_and_updated_at();

alter table public.crm_contact_activities enable row level security;
drop policy if exists crm_owner_all on public.crm_contact_activities;
create policy crm_owner_all on public.crm_contact_activities
for all to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create index if not exists crm_contact_activities_contact_occurred_idx
on public.crm_contact_activities (contact_id, occurred_at desc);
