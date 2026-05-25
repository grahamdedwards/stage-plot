-- Fix infinite recursion between shows and show_collaborators RLS policies.
-- The issue: shows SELECT policies check show_collaborators, and
-- show_collaborators policies check shows → infinite loop.
-- Fix: security definer helper that bypasses RLS for ownership checks.

-- Helper function: checks if current user owns a show (bypasses RLS)
create or replace function is_show_owner(p_show_id uuid)
returns boolean as $$
  select exists (
    select 1 from shows where id = p_show_id and owner_id = auth.uid()
  );
$$ language sql security definer;

-- Helper function: checks if current user is a collaborator on a show (bypasses RLS)
create or replace function is_show_collaborator(p_show_id uuid, p_role text default null)
returns boolean as $$
  select exists (
    select 1 from show_collaborators
    where show_id = p_show_id
      and user_id = auth.uid()
      and (p_role is null or role = p_role)
  );
$$ language sql security definer;

-- Drop existing policies that cause recursion
drop policy if exists "Collaborator read" on shows;
drop policy if exists "Editor update" on shows;
drop policy if exists "Owner manage collaborators" on show_collaborators;
drop policy if exists "Chart read" on charts;
drop policy if exists "Chart insert" on charts;
drop policy if exists "Chart update" on charts;
drop policy if exists "Chart delete" on charts;

-- Recreate shows policies using helper functions (no cross-table RLS)
create policy "Collaborator read"
  on shows for select
  using (is_show_collaborator(id));

create policy "Editor update"
  on shows for update
  using (is_show_collaborator(id, 'editor'));

-- Recreate show_collaborators policy using helper function
create policy "Owner manage collaborators"
  on show_collaborators for all
  using (is_show_owner(show_id));

-- Recreate chart policies using helper functions
create policy "Chart read"
  on charts for select
  using (is_show_owner(show_id) or is_show_collaborator(show_id));

create policy "Chart insert"
  on charts for insert
  with check (is_show_owner(show_id) or is_show_collaborator(show_id, 'editor'));

create policy "Chart update"
  on charts for update
  using (is_show_owner(show_id) or is_show_collaborator(show_id, 'editor'));

create policy "Chart delete"
  on charts for delete
  using (is_show_owner(show_id) or is_show_collaborator(show_id, 'editor'));
