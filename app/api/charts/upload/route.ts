import { NextRequest } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { normalizeSongKey, canonicalizeRole } from '@/lib/normalize';

// POST /api/charts/upload — upload a chart to owner's library
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const songTitle = formData.get('song_title') as string | null;
  const rawRole = formData.get('role') as string | null;

  if (!file || !songTitle || !rawRole) {
    return Response.json(
      { error: 'file, song_title, and role are required' },
      { status: 400 },
    );
  }

  // Normalize and canonicalize
  let songKey: string;
  try {
    songKey = normalizeSongKey(songTitle);
  } catch {
    return Response.json({ error: 'Invalid song title — cannot be empty or punctuation-only' }, { status: 400 });
  }

  const role = canonicalizeRole(rawRole);
  const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
  const storagePath = `${user.id}/${songKey}/${role}.${ext}`;

  const admin = getSupabaseAdmin();

  // Delete old blob if extension changed (orphan prevention)
  const { data: existing } = await supabase
    .from('chart_library')
    .select('storage_path')
    .eq('owner_id', user.id)
    .eq('song_key', songKey)
    .eq('role', role)
    .single();

  if (existing && existing.storage_path !== storagePath) {
    await admin.storage.from('charts').remove([existing.storage_path]);
  }

  // Upload to Storage
  const { error: uploadError } = await admin.storage
    .from('charts')
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  // Upsert chart metadata
  const { data: chart, error: dbError } = await supabase
    .from('chart_library')
    .upsert(
      {
        owner_id: user.id,
        song_key: songKey,
        song_title: songTitle,
        role,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type,
        file_size: file.size,
      },
      { onConflict: 'owner_id,song_key,role' },
    )
    .select('id, song_key, role, file_name, storage_path, mime_type, file_size, updated_at')
    .single();

  if (dbError) {
    await admin.storage.from('charts').remove([storagePath]);
    return Response.json({ error: dbError.message }, { status: 500 });
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/charts/${storagePath}`;

  return Response.json({ ...chart, url }, { status: 201 });
}
