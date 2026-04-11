-- Auth/user bootstrap + upload duplicate scope hardening

create unique index if not exists idx_statements_user_account_filename
  on public.statements(user_id, account_id, filename);
