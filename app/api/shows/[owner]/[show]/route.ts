import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { normalizeSongKeySafe } from '@/lib/normalize';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

// GET /api/shows/[owner]/[show] — anonymous show resolution by owner + slug (no auth required)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; show: string }> },
) {
  const { owner, show } = await params;

  if (!owner || !SLUG_RE.test(owner) || !show || !SLUG_RE.test(show)) {
    return Response.json({ error: 'Invalid owner or show slug' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Resolve owner_slug -> owner_id
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('owner_slug', owner)
    .single();

  if (!profile) {
    return Response.json({ error: 'Owner not found' }, { status: 404 });
  }

  // Fetch show by (owner_id, slug) pair
  const { data: showData, error } = await admin
    .from('shows')
    .select('id, config, name, venue, show_date, owner_id')
    .eq('owner_id', profile.id)
    .eq('slug', show)
    .single();

  if (error || !showData) {
    return Response.json({ error: 'Show not found' }, { status: 404 });
  }

  // Resolve charts from owner's library by normalized song titles
  const setlist = (showData.config as { setlist?: Array<{ title: string }> })?.setlist || [];
  const songKeys = setlist
    .map((s) => normalizeSongKeySafe(s.title))
    .filter((k): k is string => k !== null);

  const chartsBySong: Record<string, Array<Record<string, unknown>>> = {};

  if (songKeys.length > 0) {
    const { data: charts } = await admin
      .from('chart_library')
      .select('id, song_key, role, file_name, storage_path, mime_type, file_size, updated_at')
      .eq('owner_id', showData.owner_id)
      .in('song_key', songKeys);

    for (const c of charts || []) {
      if (!chartsBySong[c.song_key]) chartsBySong[c.song_key] = [];
      chartsBySong[c.song_key].push({
        id: c.id,
        song_key: c.song_key,
        role: c.role,
        file_name: c.file_name,
        mime_type: c.mime_type,
        file_size: c.file_size,
        updated_at: c.updated_at,
        url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/charts/${c.storage_path}`,
      });
    }
  }

  return Response.json({
    config: showData.config,
    charts: chartsBySong,
    slug: show,
    show_id: showData.id,
    owner_id: showData.owner_id,
  });
}
