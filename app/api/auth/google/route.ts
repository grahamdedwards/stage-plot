import { NextRequest } from 'next/server';
import { getAdminConfig } from '@/lib/admin-config';

// Redirects to Google OAuth consent screen
export async function GET(request: NextRequest) {
  const clientId = await getAdminConfig('google_client_id');
  if (!clientId) {
    const origin = request.nextUrl.origin;
    return Response.redirect(`${origin}/#error=google_not_configured`);
  }

  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/google/callback`;

  // Generate CSRF state token — random hex, stored in short-lived cookie
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    // drive.file: read/write files created by this app (folder creation)
    // drive.readonly: read all files (chart search across role folders)
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  const headers = new Headers({ Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  headers.append(
    'Set-Cookie',
    `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/google/callback; Max-Age=600`,
  );

  return new Response(null, { status: 302, headers });
}
