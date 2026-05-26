import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// DELETE /api/charts/delete — delete a chart from owner's library
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

  // DB delete first — RLS "Owner delete charts" enforces ownership
  const { data: chart, error: deleteError } = await supabase
    .from('chart_library')
    .delete()
    .eq('id', chart_id)
    .select('storage_path')
    .single();

  if (deleteError || !chart) {
    return Response.json({ error: 'Chart not found or permission denied' }, { status: 403 });
  }

  // Storage cleanup after DB confirms deletion
  const admin = getSupabaseAdmin();
  await admin.storage.from('charts').remove([chart.storage_path]);

  return Response.json({ deleted: true });
}
