import { createClient } from 'redis';

function mask(val: string | null | undefined): { set: boolean; length?: number; preview?: string } {
  if (!val) return { set: false };
  return { set: true, length: val.length, preview: `${val.slice(0, 6)}...${val.slice(-4)}` };
}

export async function GET() {
  // Check env vars directly
  const envId = process.env.GOOGLE_CLIENT_ID;
  const envSecret = process.env.GOOGLE_CLIENT_SECRET;

  // Check Redis directly
  let redisId: string | null = null;
  let redisSecret: string | null = null;
  let redisStatus = 'not configured';

  const url = process.env.REDIS_URL;
  if (url) {
    try {
      const client = createClient({ url });
      await client.connect();
      redisId = await client.get('admin:google_client_id');
      redisSecret = await client.get('admin:google_client_secret');
      redisStatus = 'connected';
      await client.disconnect();
    } catch (e) {
      redisStatus = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return Response.json({
    source_priority: 'Redis wins over env vars when both exist',
    redis: {
      status: redisStatus,
      google_client_id: mask(redisId),
      google_client_secret: mask(redisSecret),
    },
    env_vars: {
      google_client_id: mask(envId),
      google_client_secret: mask(envSecret),
    },
  });
}
