import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getSupabaseServer } from '@/lib/supabase-server';

// After OTP verification, link the authenticated user to any pending collaborator invites.
export async function POST() {
  const supabase = await getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  await admin.rpc('activate_invites', {
    p_user_id: user.id,
    p_email: user.email,
  });

  return Response.json({ activated: true });
}
