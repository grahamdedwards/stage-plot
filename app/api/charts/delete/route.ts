import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// DELETE /api/charts/delete — delete a chart (authenticated, owner/editor only)
export async function DELETE(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { chart_id } = await request.json();

  if (!chart_id) {
    return Response.json({ error: 'chart_id is required' }, { status: 400 });
  }

  // Fetch storage_path BEFORE delete (need it for Storage cleanup)
  const { data: chart } = await supabase
    .from('charts')
    .select('id, storage_path')
    .eq('id', chart_id)
    .single();

  if (!chart) {
    return Response.json({ error: 'Chart not found or access denied' }, { status: 404 });
  }

  // DB delete FIRST — RLS "Chart delete" policy enforces owner/editor access.
  // If user is a viewer, this will return 0 rows affected (RLS blocks it).
  const { error: deleteError, count } = await supabase
    .from('charts')
    .delete({ count: 'exact' })
    .eq('id', chart_id);

  if (deleteError || count === 0) {
    return Response.json({ error: 'Permission denied — only owners and editors can delete charts' }, { status: 403 });
  }

  // Only delete from Storage AFTER DB delete succeeds (no orphaned state)
  const admin = getSupabaseAdmin();
  await admin.storage.from('charts').remove([chart.storage_path]);

  return Response.json({ deleted: true });
}
