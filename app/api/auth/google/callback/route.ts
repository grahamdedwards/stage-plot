import { NextRequest } from 'next/server';
import { getAdminConfig } from '@/lib/admin-config';

// Exchanges auth code for tokens, then redirects back to app with tokens in hash fragment
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) {
    return Response.json({ error: 'Missing code' }, { status: 400 });
  }

  // Validate CSRF state
  const state = request.nextUrl.searchParams.get('state');
  const cookieState = request.cookies.get('oauth_state')?.value;
  if (!state || !cookieState || state !== cookieState) {
    return Response.json({ error: 'Invalid state — possible CSRF' }, { status: 403 });
  }

  const clientId = await getAdminConfig('google_client_id');
  const clientSecret = await getAdminConfig('google_client_secret');
  if (!clientId || !clientSecret) {
    return Response.json({ error: 'Google OAuth not configured' }, { status: 500 });
  }

  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/google/callback`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return Response.json({ error: `Token exchange failed: ${err}` }, { status: 502 });
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  // Redirect back to app — tokens passed in hash fragment (never logged by server)
  const fragment = new URLSearchParams({
    access_token: tokens.access_token,
    ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
    expires_in: String(tokens.expires_in),
  });

  const headers = new Headers({ Location: `${origin}/#google_auth=${fragment}` });
  // Clear the state cookie
  headers.append(
    'Set-Cookie',
    'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/google/callback; Max-Age=0',
  );

  return new Response(null, { status: 302, headers });
}
