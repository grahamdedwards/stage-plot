import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { normalizeSongKeySafe } from '@/lib/normalize';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

// GET /api/shows/[slug] — anonymous slug resolution (no auth required)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  if (!slug || !SLUG_RE.test(slug)) {
    return Response.json({ error: 'Invalid slug' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // Fetch show config
  const { data: show, error } = await admin
    .from('shows')
    .select('id, config, name, venue, show_date, owner_id')
    .eq('slug', slug)
    .single();

  if (error || !show) {
    return Response.json({ error: 'Show not found' }, { status: 404 });
  }

  // Resolve charts from owner's library by normalized song titles
  const setlist = (show.config as { setlist?: Array<{ title: string }> })?.setlist || [];
  const songKeys = setlist
    .map((s) => normalizeSongKeySafe(s.title))
    .filter((k): k is string => k !== null);

  const chartsBySong: Record<string, Array<Record<string, unknown>>> = {};

  if (songKeys.length > 0) {
    const { data: charts } = await admin
      .from('chart_library')
      .select('id, song_key, role, file_name, storage_path, mime_type, file_size, updated_at')
      .eq('owner_id', show.owner_id)
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
    config: show.config,
    charts: chartsBySong,
    slug,
  });
}
