import { getAdminConfig } from '@/lib/admin-config';

export async function GET() {
  const clientId = await getAdminConfig('google_client_id');
  const clientSecret = await getAdminConfig('google_client_secret');

  return Response.json({
    google_client_id: clientId
      ? { set: true, length: clientId.length, preview: `${clientId.slice(0, 10)}...${clientId.slice(-5)}` }
      : { set: false },
    google_client_secret: clientSecret
      ? { set: true, length: clientSecret.length, preview: `${clientSecret.slice(0, 4)}...${clientSecret.slice(-4)}` }
      : { set: false },
    env_direct: {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'set' : 'missing',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'set' : 'missing',
    },
  });
}
