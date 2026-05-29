-- Owner namespacing: profiles table + per-owner slug uniqueness
-- See docs/design-alpha-ready.md v1.2

-- 1. Create profiles table
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_slug text UNIQUE NOT NULL,
  display_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON profiles FOR SELECT USING (true);
CREATE POLICY "Owner manage" ON profiles FOR ALL USING (auth.uid() = id);

CREATE INDEX profiles_owner_slug_idx ON profiles(owner_slug);

-- 2. Relax shows slug uniqueness from global to per-owner
ALTER TABLE shows DROP CONSTRAINT shows_slug_key;
ALTER TABLE shows ADD CONSTRAINT shows_owner_slug_unique UNIQUE(owner_id, slug);
