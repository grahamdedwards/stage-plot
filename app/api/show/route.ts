import { NextRequest } from 'next/server';
import { createClient, type RedisClientType } from 'redis';

const MAX_BODY_SIZE = 500_000; // 500KB
const SHOW_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
const SLUG_RE = /^[a-z0-9-]+$/;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'show';
}

// ─── Connection pool (reuse across requests in same process) ─────────────
let pooledClient: RedisClientType | null = null;

async function getRedis(): Promise<RedisClientType | null> {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (pooledClient && pooledClient.isOpen) return pooledClient;

  try {
    pooledClient = createClient({ url });
    await pooledClient.connect();
    return pooledClient;
  } catch {
    pooledClient = null;
    return null;
  }
}

// ─── Config validation ───────────────────────────────────────────────────
function validateConfig(config: unknown): string | null {
  if (!config || typeof config !== 'object') return 'Missing config';
  const c = config as Record<string, unknown>;
  if (!c.showInfo || typeof c.showInfo !== 'object') return 'Missing showInfo';
  const si = c.showInfo as Record<string, unknown>;
  if (typeof si.bandName !== 'string') return 'Missing showInfo.bandName';
  if (!Array.isArray(c.stagePlot)) return 'Missing stagePlot array';
  if (!Array.isArray(c.inputs)) return 'Missing inputs array';
  if (!Array.isArray(c.monitors)) return 'Missing monitors array';
  if (!Array.isArray(c.notes)) return 'Missing notes array';
  if (!Array.isArray(c.setlist)) return 'Missing setlist array';
  return null;
}

// ─── GET /api/show?slug=xxx — load a published show ──────────────────────
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug || !SLUG_RE.test(slug)) {
    return Response.json({ error: 'Invalid slug' }, { status: 400 });
  }

  try {
    const client = await getRedis();
    if (!client) {
      return Response.json({ error: 'Storage not available' }, { status: 503 });
    }

    const data = await client.get(`show:${slug}`);

    if (!data) {
      return Response.json({ error: 'Show not found' }, { status: 404 });
    }

    const parsed = JSON.parse(data);
    return Response.json({ config: parsed.config, slug });
  } catch (e) {
    return Response.json(
      { error: `Load error: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}

// ─── POST /api/show — publish or update a show ──────────────────────────
export async function POST(request: NextRequest) {
  // Read body and enforce size limit (works regardless of Content-Length header)
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return Response.json({ error: 'Could not read body' }, { status: 400 });
  }
  if (rawBody.length > MAX_BODY_SIZE) {
    return Response.json({ error: 'Show data too large' }, { status: 413 });
  }

  let body: { config: unknown; slug?: string; token?: string };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const validationError = validateConfig(body.config);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  const config = body.config as Record<string, unknown>;
  const showInfo = config.showInfo as { bandName?: string; showName?: string };
  const name = showInfo.showName || showInfo.bandName || 'show';
  const baseSlug = slugify(body.slug || name);

  try {
    const client = await getRedis();
    if (!client) {
      return Response.json({ error: 'Storage not available' }, { status: 503 });
    }

    const token = body.token || crypto.randomUUID();
    const record = JSON.stringify({ config, token, updatedAt: new Date().toISOString() });

    // If caller has a token and slug, try to update their own show
    if (body.token && body.slug) {
      const slug = slugify(body.slug);
      const existing = await client.get(`show:${slug}`);
      if (existing) {
        const parsed = JSON.parse(existing);
        if (parsed.token === body.token) {
          await client.set(`show:${slug}`, record, { EX: SHOW_TTL_SECONDS });
          return Response.json({ slug, token });
        }
      }
    }

    // Create new slug — SETNX to prevent race conditions, retry with suffix
    let slug = baseSlug;
    for (let attempt = 0; attempt < 5; attempt++) {
      const created = await client.set(`show:${slug}`, record, { EX: SHOW_TTL_SECONDS, NX: true });
      if (created) {
        return Response.json({ slug, token });
      }
      const suffix = Math.random().toString(36).slice(2, 6);
      slug = `${baseSlug}-${suffix}`;
    }

    return Response.json({ error: 'Could not generate unique slug — try again' }, { status: 409 });
  } catch (e) {
    return Response.json(
      { error: `Publish error: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
