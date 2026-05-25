-- ShowRunr Supabase Schema
-- Run this in the Supabase SQL Editor to initialize the database.
-- Requires: moddatetime extension (enabled by default on Supabase)

create extension if not exists moddatetime schema extensions;

-- ============================================================================
-- TABLES
-- ============================================================================

create table shows (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  owner_id uuid not null references auth.users(id),
  config jsonb not null,
  name text not null,
  venue text,
  show_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table shows enable row level security;

create trigger set_shows_updated_at
  before update on shows
  for each row execute function extensions.moddatetime(updated_at);

create index shows_owner_idx on shows(owner_id);
create index shows_slug_idx on shows(slug);

-- ---

create table show_collaborators (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references shows(id) on delete cascade,
  user_id uuid references auth.users(id),
  email text not null,
  role text not null check (role in ('editor', 'viewer')),
  invited_at timestamptz default now(),
  accepted_at timestamptz,
  unique(show_id, email)
);

alter table show_collaborators enable row level security;

-- ---

create table user_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  claude_api_key text,
  updated_at timestamptz default now()
);

alter table user_secrets enable row level security;

-- ---

create table charts (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references shows(id) on delete cascade,
  song_id uuid not null,
  role text not null,
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  file_size integer not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(show_id, song_id, role)
);

alter table charts enable row level security;

create trigger set_charts_updated_at
  before update on charts
  for each row execute function extensions.moddatetime(updated_at);

-- ---

create table tryit_quota (
  ip_hash text primary key,
  message_count integer default 0,
  window_start timestamptz default now()
);

alter table tryit_quota enable row level security;
-- No policies on tryit_quota: only admin client + security definer function can access.

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- shows
create policy "Owner read own shows"
  on shows for select
  using (auth.uid() = owner_id);

create policy "Collaborator read"
  on shows for select
  using (
    exists (
      select 1 from show_collaborators
      where show_id = shows.id
        and user_id = auth.uid()
    )
  );

create policy "Owner insert"
  on shows for insert
  with check (auth.uid() = owner_id);

create policy "Owner update"
  on shows for update
  using (auth.uid() = owner_id);

create policy "Editor update"
  on shows for update
  using (
    exists (
      select 1 from show_collaborators
      where show_id = shows.id
        and user_id = auth.uid()
        and role = 'editor'
    )
  );

create policy "Owner delete"
  on shows for delete
  using (auth.uid() = owner_id);

-- show_collaborators
create policy "Owner manage collaborators"
  on show_collaborators for all
  using (
    exists (
      select 1 from shows
      where shows.id = show_collaborators.show_id
        and shows.owner_id = auth.uid()
    )
  );

create policy "Collaborator read own"
  on show_collaborators for select
  using (user_id = auth.uid());

-- user_secrets (no SELECT policy — server-only reads via admin client)
create policy "User write own secrets"
  on user_secrets for insert
  with check (auth.uid() = user_id);

create policy "User update own secrets"
  on user_secrets for update
  using (auth.uid() = user_id);

-- charts
create policy "Chart read"
  on charts for select
  using (
    exists (
      select 1 from shows
      where shows.id = charts.show_id
        and (
          shows.owner_id = auth.uid()
          or exists (
            select 1 from show_collaborators
            where show_id = shows.id
              and user_id = auth.uid()
          )
        )
    )
  );

create policy "Chart insert"
  on charts for insert
  with check (
    exists (
      select 1 from shows
      where shows.id = charts.show_id
        and (
          shows.owner_id = auth.uid()
          or exists (
            select 1 from show_collaborators
            where show_id = shows.id
              and user_id = auth.uid()
              and role = 'editor'
          )
        )
    )
  );

create policy "Chart update"
  on charts for update
  using (
    exists (
      select 1 from shows
      where shows.id = charts.show_id
        and (
          shows.owner_id = auth.uid()
          or exists (
            select 1 from show_collaborators
            where show_id = shows.id
              and user_id = auth.uid()
              and role = 'editor'
          )
        )
    )
  );

create policy "Chart delete"
  on charts for delete
  using (
    exists (
      select 1 from shows
      where shows.id = charts.show_id
        and (
          shows.owner_id = auth.uid()
          or exists (
            select 1 from show_collaborators
            where show_id = shows.id
              and user_id = auth.uid()
              and role = 'editor'
          )
        )
    )
  );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Try-it quota: atomic increment with window reset
create or replace function increment_tryit(p_ip_hash text, p_limit integer, p_window_days integer)
returns integer as $$
declare
  current_count integer;
begin
  insert into tryit_quota (ip_hash, message_count, window_start)
  values (p_ip_hash, 1, now())
  on conflict (ip_hash) do update
  set message_count = case
    when tryit_quota.window_start < now() - (p_window_days || ' days')::interval
    then 1
    else tryit_quota.message_count + 1
  end,
  window_start = case
    when tryit_quota.window_start < now() - (p_window_days || ' days')::interval
    then now()
    else tryit_quota.window_start
  end
  returning message_count into current_count;

  return current_count;
end;
$$ language plpgsql security definer;

-- Revoke execute from all non-service roles
revoke execute on function increment_tryit from public, anon, authenticated;

-- Activate pending invites: link user_id to collaborator rows matching their email
create or replace function activate_invites(p_user_id uuid, p_email text)
returns void as $$
begin
  update show_collaborators
  set user_id = p_user_id,
      accepted_at = now()
  where email = p_email
    and user_id is null;
end;
$$ language plpgsql security definer;

revoke execute on function activate_invites from public, anon, authenticated;

-- ============================================================================
-- STORAGE BUCKET
-- ============================================================================
-- Create via Supabase dashboard or CLI:
--   supabase storage create charts --public
-- The bucket should be PUBLIC (anyone can download chart PDFs via URL).
-- Writes are handled exclusively through server-side API routes (admin client).
