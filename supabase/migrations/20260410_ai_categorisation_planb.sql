-- AI categorisation Plan B (robust review workflow)

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

create index if not exists idx_categorisation_suggestions_user_status_created
  on public.categorisation_suggestions(user_id, status, created_at desc);

create index if not exists idx_categorisation_suggestions_transaction_created
  on public.categorisation_suggestions(transaction_id, created_at desc);

create index if not exists idx_categorisation_suggestions_user_account_status
  on public.categorisation_suggestions(user_id, account_id, status, created_at desc);

create index if not exists idx_categorisation_suggestions_run
  on public.categorisation_suggestions(run_id, created_at desc);

create table if not exists public.categorisation_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,
  user_id uuid not null references public.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_categorisation_events_user_created
  on public.categorisation_events(user_id, created_at desc);

create index if not exists idx_categorisation_events_run
  on public.categorisation_events(run_id, created_at desc);
