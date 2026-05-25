import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// POST /api/charts/upload — upload a chart file (authenticated, ownership-verified)
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const showId = formData.get('show_id') as string | null;
  const songId = formData.get('song_id') as string | null;
  const role = formData.get('role') as string | null;

  if (!file || !showId || !songId || !role) {
    return Response.json(
      { error: 'file, show_id, song_id, and role are required' },
      { status: 400 },
    );
  }

  // Verify user is owner or editor BEFORE uploading to Storage.
  // Check ownership first, then collaborator role.
  const { data: show } = await supabase
    .from('shows')
    .select('id, owner_id')
    .eq('id', showId)
    .single();

  if (!show) {
    return Response.json({ error: 'Show not found or access denied' }, { status: 403 });
  }

  if (show.owner_id !== user.id) {
    // Not owner — check if editor collaborator
    const { data: collab } = await supabase
      .from('show_collaborators')
      .select('role')
      .eq('show_id', showId)
      .eq('user_id', user.id)
      .single();

    if (!collab || collab.role !== 'editor') {
      return Response.json({ error: 'Permission denied — only owners and editors can upload charts' }, { status: 403 });
    }
  }

  // Construct storage path (server-side only — prevents path traversal)
  const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
  const storagePath = `${showId}/${songId}/${role.toLowerCase()}.${ext}`;

  const admin = getSupabaseAdmin();

  // Upload to Storage (upsert — replaces existing chart for same song+role)
  const { error: uploadError } = await admin.storage
    .from('charts')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  // Upsert chart metadata row
  const { data: chart, error: dbError } = await supabase
    .from('charts')
    .upsert(
      {
        show_id: showId,
        song_id: songId,
        role,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type,
        file_size: file.size,
        uploaded_by: user.id,
      },
      { onConflict: 'show_id,song_id,role' },
    )
    .select('id, song_id, role, file_name, storage_path, mime_type, file_size, updated_at')
    .single();

  if (dbError) {
    // Clean up the uploaded file if DB insert fails
    await admin.storage.from('charts').remove([storagePath]);
    return Response.json({ error: dbError.message }, { status: 500 });
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/charts/${storagePath}`;

  return Response.json({ ...chart, url }, { status: 201 });
}
