import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

const RESERVED_SLUGS = new Set([
  'dashboard', 'sign-in', 'sign-out', 'claim', 'api', 'admin',
  'about', 'help', 'pricing', 'terms', 'privacy', 'settings',
  'new', 'import', 'export',
]);

// POST /api/profiles — claim owner slug (onboarding)
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { owner_slug, display_name } = await request.json();

  if (!owner_slug || typeof owner_slug !== 'string') {
    return Response.json({ error: 'owner_slug is required' }, { status: 400 });
  }

  const slug = owner_slug.toLowerCase().trim();

  if (!SLUG_RE.test(slug)) {
    return Response.json(
      { error: 'Handle must be 3-30 characters, lowercase letters, numbers, and hyphens only' },
      { status: 400 },
    );
  }

  if (RESERVED_SLUGS.has(slug)) {
    return Response.json({ error: 'That handle is reserved' }, { status: 409 });
  }

  // Check if user already has a profile
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single();

  if (existing) {
    return Response.json({ error: 'Profile already exists' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      owner_slug: slug,
      display_name: display_name || null,
    })
    .select('owner_slug, display_name')
    .single();

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'That handle is already taken' }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data, { status: 201 });
}

// GET /api/profiles — get current user's profile
export async function GET() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data } = await supabase
    .from('profiles')
    .select('owner_slug, display_name')
    .eq('id', user.id)
    .single();

  if (!data) {
    return Response.json({ error: 'No profile' }, { status: 404 });
  }

  return Response.json(data);
}
