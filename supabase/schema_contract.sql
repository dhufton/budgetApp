-- Supabase schema contract for budgetApp.
-- Apply manually in Supabase SQL editor, or via migration workflow.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key,
  username text,
  created_at timestamptz not null default now()
);

create table if not exists public.statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid,
  storage_key text not null unique,
  filename text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  account_type text not null check (account_type in ('current', 'credit', 'savings', 'other')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  constraint accounts_user_name_unique unique (user_id, name)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  statement_id uuid references public.statements(id) on delete set null,
  account_id uuid,
  date date not null,
  description text not null,
  amount numeric(12,2) not null,
  category text not null default 'Uncategorized',
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  keywords text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  constraint categories_user_category_unique unique (user_id, category)
);

create table if not exists public.budget_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  target_amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  constraint budget_targets_user_category_unique unique (user_id, category)
);

create table if not exists public.vendor_categories (
  id uuid primary key default gen_random_uuid(),
  vendor_name text not null unique,
  category text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.learned_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  description text not null,
  category text not null,
  updated_at timestamptz not null default now(),
  constraint learned_rules_user_description_unique unique (user_id, description)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'statements_account_fk'
  ) then
    alter table public.statements
      add constraint statements_account_fk
      foreign key (account_id) references public.accounts(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_account_fk'
  ) then
    alter table public.transactions
      add constraint transactions_account_fk
      foreign key (account_id) references public.accounts(id) on delete set null;
  end if;
end $$;

create index if not exists idx_transactions_user_date
  on public.transactions(user_id, date desc);

create index if not exists idx_transactions_user_category
  on public.transactions(user_id, category);
create index if not exists idx_transactions_user_account_date
  on public.transactions(user_id, account_id, date desc);

create index if not exists idx_statements_user
  on public.statements(user_id);
create index if not exists idx_statements_user_account_uploaded
  on public.statements(user_id, account_id, uploaded_at desc);
create index if not exists idx_accounts_user
  on public.accounts(user_id);

create index if not exists idx_categories_user
  on public.categories(user_id);

create index if not exists idx_budget_targets_user
  on public.budget_targets(user_id);

create index if not exists idx_learned_rules_user
  on public.learned_rules(user_id);
