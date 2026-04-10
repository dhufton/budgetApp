# Supabase Schema Contract

This project relies on the following Supabase tables and column names.

If any table/column is renamed, API routes and frontend payloads must be updated at the same time.

## Canonical Tables

### `users`
- `id` `uuid` primary key (matches `auth.users.id`)
- `username` `text` nullable
- `created_at` `timestamptz` default `now()`

### `statements`
- `id` `uuid` primary key
- `user_id` `uuid` not null references `users(id)`
- `account_id` `uuid` nullable references `accounts(id)`
- `storage_key` `text` not null unique
- `filename` `text` not null
- `uploaded_at` `timestamptz` default `now()`

### `transactions`
- `id` `uuid` primary key
- `user_id` `uuid` not null references `users(id)`
- `statement_id` `uuid` nullable references `statements(id)`
- `account_id` `uuid` nullable references `accounts(id)`
- `date` `date` not null
- `description` `text` not null
- `amount` `numeric(12,2)` not null
- `category` `text` not null default `'Uncategorized'`
- `created_at` `timestamptz` default `now()`

### `accounts`
- `id` `uuid` primary key
- `user_id` `uuid` not null references `users(id)`
- `name` `text` not null
- `account_type` `text` enum-like: `current|credit|savings|other`
- `is_default` `boolean` not null default `false`
- `created_at` `timestamptz` default `now()`
- Unique key: `(user_id, name)`

### `categories`
- `id` `uuid` primary key
- `user_id` `uuid` not null references `users(id)`
- `category` `text` not null
- `keywords` `text[]` not null default `'{}'`
- `created_at` `timestamptz` default `now()`
- Unique key: `(user_id, category)`

### `budget_targets`
- `id` `uuid` primary key
- `user_id` `uuid` not null references `users(id)`
- `category` `text` not null
- `target_amount` `numeric(12,2)` not null
- `threshold_percent` `numeric(5,2)` not null default `80`
- `created_at` `timestamptz` default `now()`
- Unique key: `(user_id, category)`

### `vendor_categories`
- `id` `uuid` primary key
- `vendor_name` `text` not null unique
- `category` `text` not null
- `updated_at` `timestamptz` default `now()`

### `learned_rules`
- `id` `uuid` primary key
- `user_id` `uuid` not null references `users(id)`
- `description` `text` not null
- `category` `text` not null
- `updated_at` `timestamptz` default `now()`
- Unique key: `(user_id, description)`

## Expected Built-In Categories

The backend treats these as built-in categories:
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

See:
- `/Users/dylanhufton/Documents/Development/budgetApp/supabase/schema_contract.sql`
