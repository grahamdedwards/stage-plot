-- Migration 003: Replace show-scoped charts with owner-scoped chart_library
-- Safe: guards against non-empty charts table before drop

-- Guard: abort if charts table has data
do $$
begin
  if (select count(*) from charts) > 0 then
    raise exception 'charts table is not empty — use backfill migration instead of drop';
  end if;
end $$;

-- Drop the show-scoped charts table (confirmed empty)
drop table charts;

-- Owner-scoped chart library
create table chart_library (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  song_key text not null,
  song_title text not null,
  role text not null check (role in ('guitar', 'lyrics', 'keys', 'bass', 'horns', 'drums', 'other')),
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  file_size integer not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(owner_id, song_key, role)
);

alter table chart_library enable row level security;

create trigger set_chart_library_updated_at
  before update on chart_library
  for each row execute function extensions.moddatetime(updated_at);

create index chart_library_owner_idx on chart_library(owner_id);
create index chart_library_song_key_idx on chart_library(owner_id, song_key);

-- RLS Policies

create policy "Owner read own charts"
  on chart_library for select
  using (auth.uid() = owner_id);

-- Collaborators can read the owner's full library (explicit product decision)
create policy "Collaborator read charts"
  on chart_library for select
  using (
    exists (
      select 1 from show_collaborators sc
      join shows s on s.id = sc.show_id
      where s.owner_id = chart_library.owner_id
        and sc.user_id = auth.uid()
    )
  );

create policy "Owner write charts"
  on chart_library for insert
  with check (auth.uid() = owner_id);

create policy "Owner update charts"
  on chart_library for update
  using (auth.uid() = owner_id);

create policy "Owner delete charts"
  on chart_library for delete
  using (auth.uid() = owner_id);
