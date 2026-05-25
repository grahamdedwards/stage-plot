import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// DELETE /api/charts/delete — delete a chart (authenticated, ownership-verified)
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

  // Fetch chart (RLS enforces access — user must be owner/editor)
  const { data: chart, error } = await supabase
    .from('charts')
    .select('id, storage_path')
    .eq('id', chart_id)
    .single();

  if (error || !chart) {
    return Response.json({ error: 'Chart not found or access denied' }, { status: 404 });
  }

  const admin = getSupabaseAdmin();

  // Delete from Storage
  await admin.storage.from('charts').remove([chart.storage_path]);

  // Delete metadata row
  await supabase.from('charts').delete().eq('id', chart_id);

  return Response.json({ deleted: true });
}
