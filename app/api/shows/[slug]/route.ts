import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

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

  // Fetch charts for this show
  const { data: charts } = await admin
    .from('charts')
    .select('id, song_id, role, file_name, storage_path, mime_type, file_size, updated_at')
    .eq('show_id', show.id);

  // Build public chart URLs
  const chartsWithUrls = (charts || []).map((c) => ({
    ...c,
    url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/charts/${c.storage_path}`,
  }));

  return Response.json({
    config: show.config,
    charts: chartsWithUrls,
    slug,
  });
}
