-- Multi-account v1 migration
create extension if not exists "pgcrypto";

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  account_type text not null check (account_type in ('current', 'credit', 'savings', 'other')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint accounts_user_name_unique unique (user_id, name)
);

alter table public.statements add column if not exists account_id uuid;
alter table public.transactions add column if not exists account_id uuid;

-- Ensure each user has a default account.
insert into public.accounts (user_id, name, account_type, is_default)
select u.id, 'Primary Account', 'current', true
from public.users u
left join public.accounts a
  on a.user_id = u.id and a.is_default = true
where a.id is null;

-- Backfill statements account_id from default account.
update public.statements s
set account_id = a.id
from public.accounts a
where s.account_id is null
  and a.user_id = s.user_id
  and a.is_default = true;

-- Backfill transactions account_id via statement first.
update public.transactions t
set account_id = s.account_id
from public.statements s
where t.account_id is null
  and t.statement_id = s.id
  and s.account_id is not null;

-- Remaining transactions get default account.
update public.transactions t
set account_id = a.id
from public.accounts a
where t.account_id is null
  and a.user_id = t.user_id
  and a.is_default = true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'statements_account_fk') then
    alter table public.statements
      add constraint statements_account_fk
      foreign key (account_id) references public.accounts(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_account_fk') then
    alter table public.transactions
      add constraint transactions_account_fk
      foreign key (account_id) references public.accounts(id) on delete set null;
  end if;
end $$;

create index if not exists idx_transactions_user_account_date
  on public.transactions(user_id, account_id, date desc);

create index if not exists idx_statements_user_account_uploaded
  on public.statements(user_id, account_id, uploaded_at desc);

create index if not exists idx_accounts_user
  on public.accounts(user_id);
