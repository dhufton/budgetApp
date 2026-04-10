-- Feature A: recurring spend detection + upcoming charges

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

create index if not exists idx_recurring_rules_user_status
  on public.recurring_rules(user_id, status, updated_at desc);

create index if not exists idx_recurring_rules_user_next_expected
  on public.recurring_rules(user_id, next_expected_date);

create index if not exists idx_recurring_rules_user_account_status
  on public.recurring_rules(user_id, account_id, status, next_expected_date);
