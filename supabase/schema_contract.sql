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
  threshold_percent numeric(5,2) not null default 80,
  created_at timestamptz not null default now(),
  constraint budget_targets_user_category_unique unique (user_id, category)
);

alter table public.budget_targets
  add column if not exists threshold_percent numeric(5,2) not null default 80;

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

create table if not exists public.monthly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_scope text not null default 'all',
  period_start date not null,
  period_end date not null,
  review_type text not null check (review_type in ('monthly_closeout', 'upload_snapshot')),
  triggered_by text not null check (triggered_by in ('system_monthly', 'upload', 'manual')),
  statement_id uuid references public.statements(id) on delete set null,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  review_id uuid references public.monthly_reviews(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.categorisation_suggestions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  suggested_category text not null,
  final_category text,
  confidence numeric not null check (confidence >= 0 and confidence <= 100),
  reason text,
  status text not null check (status in ('pending', 'auto_applied', 'approved', 'rejected', 'overridden')),
  model_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categorisation_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  merchant_key text not null,
  display_name text not null,
  category text not null default 'Uncategorized',
  cadence text not null check (cadence in ('weekly', 'biweekly', 'monthly', 'irregular')),
  average_amount numeric(12,2) not null,
  confidence numeric(5,2) not null check (confidence >= 0 and confidence <= 100),
  occurrence_count integer not null default 0,
  last_seen_date date,
  next_expected_date date,
  status text not null default 'active' check (status in ('active', 'ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_rules_user_account_merchant_unique unique (user_id, account_id, merchant_key)
);

create table if not exists public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  account_scope text not null default 'all',
  name text not null,
  goal_type text not null check (goal_type in ('savings_target', 'planned_purchase')),
  target_amount numeric(12,2) not null check (target_amount > 0),
  current_saved numeric(12,2) not null default 0,
  target_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

create unique index if not exists idx_monthly_reviews_idempotency
  on public.monthly_reviews (
    user_id,
    account_scope,
    period_start,
    period_end,
    review_type,
    coalesce(statement_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists idx_monthly_reviews_user_created
  on public.monthly_reviews(user_id, created_at desc);

create index if not exists idx_monthly_reviews_user_type_created
  on public.monthly_reviews(user_id, review_type, created_at desc);

create index if not exists idx_monthly_reviews_user_account_created
  on public.monthly_reviews(user_id, account_scope, created_at desc);

create index if not exists idx_review_events_user_created
  on public.review_events(user_id, created_at desc);

create index if not exists idx_review_events_review
  on public.review_events(review_id, created_at desc);

create index if not exists idx_categorisation_suggestions_user_status_created
  on public.categorisation_suggestions(user_id, status, created_at desc);

create index if not exists idx_categorisation_suggestions_transaction_created
  on public.categorisation_suggestions(transaction_id, created_at desc);

create index if not exists idx_categorisation_suggestions_user_account_status
  on public.categorisation_suggestions(user_id, account_id, status, created_at desc);

create index if not exists idx_categorisation_suggestions_run
  on public.categorisation_suggestions(run_id, created_at desc);

create index if not exists idx_categorisation_events_user_created
  on public.categorisation_events(user_id, created_at desc);

create index if not exists idx_categorisation_events_run
  on public.categorisation_events(run_id, created_at desc);

create index if not exists idx_recurring_rules_user_status
  on public.recurring_rules(user_id, status, updated_at desc);

create index if not exists idx_recurring_rules_user_next_expected
  on public.recurring_rules(user_id, next_expected_date);

create index if not exists idx_recurring_rules_user_account_status
  on public.recurring_rules(user_id, account_id, status, next_expected_date);

create index if not exists idx_financial_goals_user_status_created
  on public.financial_goals(user_id, status, created_at desc);

create index if not exists idx_financial_goals_user_target_date
  on public.financial_goals(user_id, target_date);

create index if not exists idx_financial_goals_user_scope_status
  on public.financial_goals(user_id, account_scope, status, target_date);
