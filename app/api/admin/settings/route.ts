import { NextRequest } from 'next/server';
import { getAllAdminConfig, setAdminConfig, isKvConnected } from '@/lib/admin-config';

const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(ip, entry);
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

function getIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function authenticate(request: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const provided = request.headers.get('authorization')?.replace('Bearer ', '');
  return !!provided && provided === secret;
}

export async function GET(request: NextRequest) {
  const ip = getIp(request);
  if (!checkRateLimit(ip)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  if (!authenticate(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const kvConnected = await isKvConnected();
  if (!kvConnected) {
    return Response.json(
      { error: 'KV store not connected. Link a KV store in your Vercel dashboard.' },
      { status: 503 },
    );
  }

  const config = await getAllAdminConfig();
  return Response.json({ config, kvConnected });
}

export async function PUT(request: NextRequest) {
  const ip = getIp(request);
  if (!checkRateLimit(ip)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  if (!authenticate(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const kvConnected = await isKvConnected();
  if (!kvConnected) {
    return Response.json(
      { error: 'KV store not connected. Cannot save settings without persistence.' },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const allowedKeys = ['google_client_id', 'google_client_secret', 'claude_tryit_key'];
  const updates: string[] = [];

  for (const key of allowedKeys) {
    if (key in body) {
      const value = body[key];
      if (typeof value !== 'string') {
        return Response.json({ error: `Invalid value for ${key}: must be a string` }, { status: 400 });
      }
      await setAdminConfig(key, value);
      updates.push(key);
    }
  }

  const config = await getAllAdminConfig();
  return Response.json({ config, updated: updates });
}
