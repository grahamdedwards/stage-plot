import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

const RESERVED_SLUGS = new Set([
  'dashboard', 'sign-in', 'sign-out', 'api', 'admin',
  'settings', 'new', 'import', 'export', 'about', 'help',
  'pricing', 'terms', 'privacy', 'favicon.ico', 'robots.txt',
]);

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'show';
}

// PUT /api/shows/update — save show config (authenticated, RLS-enforced)
export async function PUT(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id, config, name, venue, show_date } = await request.json();

  if (!id || !config) {
    return Response.json({ error: 'id and config are required' }, { status: 400 });
  }

  const effectiveName = name || config.showInfo?.showName || config.showInfo?.bandName || 'Untitled';

  // Check if name changed — regenerate slug if so
  // Fetch owner_id too: collision scope must be per-owner, not per-caller (Codex finding #2)
  const { data: current } = await supabase
    .from('shows')
    .select('name, slug, owner_id')
    .eq('id', id)
    .single();

  let newSlug: string | undefined;

  if (current && current.name !== effectiveName) {
    const baseSlug = slugify(effectiveName);
    let slug = baseSlug;

    if (RESERVED_SLUGS.has(slug)) {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    // Check for collision (skip if slug hasn't changed)
    if (slug !== current.slug) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: existing } = await supabase
          .from('shows')
          .select('id')
          .eq('slug', slug)
          .eq('owner_id', current.owner_id)
          .neq('id', id)
          .single();

        if (!existing) break;
        slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
      }
      newSlug = slug;
    }
  }

  const updatePayload: Record<string, unknown> = {
    config,
    name: effectiveName,
    venue: venue || config.showInfo?.venue || null,
    show_date: show_date || config.showInfo?.eventDate || null,
  };

  if (newSlug) {
    updatePayload.slug = newSlug;
  }

  const { data, error } = await supabase
    .from('shows')
    .update(updatePayload)
    .eq('id', id)
    .select('updated_at, slug')
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 403 });
  }

  return Response.json({ updated_at: data.updated_at, slug: data.slug });
}
