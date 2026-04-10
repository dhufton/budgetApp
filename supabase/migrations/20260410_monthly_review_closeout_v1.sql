-- Feature 2: Monthly Review / Budget Closeout (V1)

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

-- Idempotency for review creation:
-- one review per user/account/period/type, and for upload snapshots also per statement.
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
