-- Push tokens table: stores FCM device tokens per user/device
create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  factory_id uuid references factory_accounts(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('android', 'ios', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

-- Index for fast lookup by user
create index if not exists push_tokens_user_id_idx on push_tokens(user_id);
create index if not exists push_tokens_factory_id_idx on push_tokens(factory_id);

-- RLS
alter table push_tokens enable row level security;

-- Users can only read/write their own tokens
create policy "Users manage own push tokens"
  on push_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role can read all tokens (for sending push notifications)
create policy "Service role reads all tokens"
  on push_tokens for select
  using (auth.role() = 'service_role');
