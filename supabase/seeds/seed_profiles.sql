-- Seed profiles for existing users.
-- Run manually after migration 005. Replace UUIDs with values from Supabase auth dashboard.
-- This file is env-specific — do NOT rely on it in CI or branch DBs.

INSERT INTO profiles (id, owner_slug, display_name) VALUES
  ('<primary-user-uuid>', 'graham', 'Graham'),
  ('<secondary-user-uuid>', 'fernando', 'Fernando')
ON CONFLICT (id) DO NOTHING;
