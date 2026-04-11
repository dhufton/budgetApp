-- Feature: Goals + Affordability Planner (V1)

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

create index if not exists idx_financial_goals_user_status_created
  on public.financial_goals(user_id, status, created_at desc);

create index if not exists idx_financial_goals_user_target_date
  on public.financial_goals(user_id, target_date);

create index if not exists idx_financial_goals_user_scope_status
  on public.financial_goals(user_id, account_scope, status, target_date);
