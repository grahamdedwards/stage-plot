import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

// DELETE /api/shows/delete — delete a show and its charts (owner only)
export async function DELETE(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await request.json();

  if (!id) {
    return Response.json({ error: 'id is required' }, { status: 400 });
  }

  // Verify ownership (RLS policy: only owner can delete)
  const { data: show, error: fetchError } = await supabase
    .from('shows')
    .select('id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single();

  if (fetchError || !show) {
    return Response.json({ error: 'Show not found or not owner' }, { status: 404 });
  }

  // Delete the show row — cascades to collaborators in Postgres.
  // Charts live in chart_library (owner-scoped, not show-scoped) — NOT deleted with the show.
  const { error } = await supabase
    .from('shows')
    .delete()
    .eq('id', id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ deleted: true });
}
