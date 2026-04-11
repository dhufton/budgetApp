# Supabase Schema Contract

This document mirrors `/Users/dylanhufton/Documents/Development/budgetApp/supabase/schema_contract.sql`.

If a table/column/constraint changes, update both files in the same PR.

## Canonical Tables

### `users`
- `id` `uuid` primary key (matches `auth.users.id`)
- `username` `text` nullable
- `created_at` `timestamptz` default `now()`

### `accounts`
- `id` `uuid` primary key
- `user_id` `uuid` not null references `users(id)`
- `name` `text` not null
- `account_type` `text` check in `current|credit|savings|other`
- `is_default` `boolean` not null default `false`
- `created_at` `timestamptz` not null default `now()`
- Unique key: `(user_id, name)`

### `statements`
- `id` `uuid` primary key
- `user_id` `uuid` not null references `users(id)`
- `account_id` `uuid` nullable references `accounts(id)`
- `storage_key` `text` not null unique
- `filename` `text` not null
- `uploaded_at` `timestamptz` not null default `now()`

### `transactions`
- `id` `uuid` primary key
- `user_id` `uuid` not null references `users(id)`
- `statement_id` `uuid` nullable references `statements(id)`
- `account_id` `uuid` nullable references `accounts(id)`
- `date` `date` not null
- `description` `text` not null
- `amount` `numeric(12,2)` not null
- `category` `text` not null default `'Uncategorized'`
- `created_at` `timestamptz` not null default `now()`

### `categories`
- `id` `uuid` primary key
- `user_id` `uuid` not null references `users(id)`
- `category` `text` not null
- `keywords` `text[]` not null default `'{}'`
- `created_at` `timestamptz` not null default `now()`
- Unique key: `(user_id, category)`

### `budget_targets`
- `id` `uuid` primary key
- `user_id` `uuid` not null references `users(id)`
- `category` `text` not null
- `target_amount` `numeric(12,2)` not null
- `threshold_percent` `numeric(5,2)` not null default `80`
- `created_at` `timestamptz` not null default `now()`
- Unique key: `(user_id, category)`

### `vendor_categories`
- `id` `uuid` primary key
- `vendor_name` `text` not null unique
- `category` `text` not null
- `updated_at` `timestamptz` not null default `now()`

### `learned_rules`
- `id` `uuid` primary key
- `user_id` `uuid` not null references `users(id)`
- `description` `text` not null
- `category` `text` not null
- `updated_at` `timestamptz` not null default `now()`
- Unique key: `(user_id, description)`

### `monthly_reviews`
- `id` `uuid` primary key
- `user_id` `uuid` not null references `users(id)`
- `account_scope` `text` not null default `'all'`
- `period_start` `date` not null
- `period_end` `date` not null
- `review_type` `text` check in `monthly_closeout|upload_snapshot`
- `triggered_by` `text` check in `system_monthly|upload|manual`
- `statement_id` `uuid` nullable references `statements(id)`
- `summary` `jsonb` not null default `'{}'::jsonb`
- `created_at` `timestamptz` not null default `now()`
- Idempotency unique key across user/scope/period/type/statement

### `review_events`
- `id` `uuid` primary key
- `user_id` `uuid` not null references `users(id)`
- `review_id` `uuid` nullable references `monthly_reviews(id)`
- `event_type` `text` not null
- `payload` `jsonb` not null default `'{}'::jsonb`
- `created_at` `timestamptz` not null default `now()`

### `categorisation_suggestions`
- `id` `uuid` primary key
- `run_id` `uuid` not null
- `user_id` `uuid` not null references `users(id)`
- `account_id` `uuid` nullable references `accounts(id)`
- `transaction_id` `uuid` not null references `transactions(id)`
- `suggested_category` `text` not null
- `final_category` `text` nullable
- `confidence` `numeric` check between `0` and `100`
- `reason` `text` nullable
- `status` `text` check in `pending|auto_applied|approved|rejected|overridden`
- `model_name` `text` nullable
- `created_at` `timestamptz` not null default `now()`
- `updated_at` `timestamptz` not null default `now()`

### `categorisation_events`
- `id` `uuid` primary key
- `run_id` `uuid` nullable
- `user_id` `uuid` not null references `users(id)`
- `account_id` `uuid` nullable references `accounts(id)`
- `event_type` `text` not null
- `payload` `jsonb` not null default `'{}'::jsonb`
- `created_at` `timestamptz` not null default `now()`

### `recurring_rules`
- `id` `uuid` primary key
- `user_id` `uuid` not null references `users(id)`
- `account_id` `uuid` not null references `accounts(id)`
- `merchant_key` `text` not null
- `display_name` `text` not null
- `category` `text` not null default `'Uncategorized'`
- `cadence` `text` check in `weekly|biweekly|monthly|irregular`
- `average_amount` `numeric(12,2)` not null
- `confidence` `numeric(5,2)` check between `0` and `100`
- `occurrence_count` `integer` not null default `0`
- `last_seen_date` `date` nullable
- `next_expected_date` `date` nullable
- `status` `text` not null default `'active'` check in `active|ignored`
- `created_at` `timestamptz` not null default `now()`
- `updated_at` `timestamptz` not null default `now()`
- Unique key: `(user_id, account_id, merchant_key)`

### `financial_goals`
- `id` `uuid` primary key
- `user_id` `uuid` not null references `users(id)`
- `account_scope` `text` not null default `'all'` (`all` or specific account id)
- `name` `text` not null
- `goal_type` `text` check in `savings_target|planned_purchase`
- `target_amount` `numeric(12,2)` not null, must be `> 0`
- `current_saved` `numeric(12,2)` not null default `0`
- `target_date` `date` not null
- `status` `text` not null default `'active'` check in `active|completed|archived`
- `notes` `text` nullable
- `created_at` `timestamptz` not null default `now()`
- `updated_at` `timestamptz` not null default `now()`

## Expected Built-In Categories

- `Bills`
- `Entertainment`
- `Food`
- `Savings`
- `Shopping`
- `Transport`
- `Transfer`
- `Uncategorized`

## Environment Contract

Required:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `B2_ENDPOINT_URL`
- `B2_KEY_ID`
- `B2_APP_KEY`
- `B2_BUCKET_NAME`
- `GROQ_API_KEY`

Optional (recommended for backend writes):
- `SUPABASE_SERVICE_ROLE_KEY`

## Source of Truth SQL

- `/Users/dylanhufton/Documents/Development/budgetApp/supabase/schema_contract.sql`
