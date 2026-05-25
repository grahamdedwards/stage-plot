import { NextRequest } from 'next/server';
import { createClient } from 'redis';

const MAX_BODY_SIZE = 500_000; // 500KB
const SHOW_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'show';
}

async function getRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const client = createClient({ url });
  await client.connect();
  return client;
}

// ─── GET /api/show?slug=xxx — load a published show ──────────────────────
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return Response.json({ error: 'Invalid slug' }, { status: 400 });
  }

  let client;
  try {
    client = await getRedis();
    if (!client) {
      return Response.json({ error: 'Storage not available' }, { status: 503 });
    }

    const data = await client.get(`show:${slug}`);
    await client.disconnect();

    if (!data) {
      return Response.json({ error: 'Show not found' }, { status: 404 });
    }

    const parsed = JSON.parse(data);
    return Response.json({ config: parsed.config, slug });
  } catch (e) {
    try { await client?.disconnect(); } catch { /* ignore */ }
    return Response.json(
      { error: `Load error: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}

// ─── POST /api/show — publish or update a show ──────────────────────────
export async function POST(request: NextRequest) {
  const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    return Response.json({ error: 'Show data too large' }, { status: 413 });
  }

  let body: { config: Record<string, unknown>; slug?: string; token?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.config || typeof body.config !== 'object') {
    return Response.json({ error: 'Missing config' }, { status: 400 });
  }

  const showInfo = body.config.showInfo as { bandName?: string; showName?: string } | undefined;
  const name = showInfo?.showName || showInfo?.bandName || 'show';
  let slug = body.slug || slugify(name);

  let client;
  try {
    client = await getRedis();
    if (!client) {
      return Response.json({ error: 'Storage not available' }, { status: 503 });
    }

    const existing = await client.get(`show:${slug}`);

    if (existing) {
      const parsed = JSON.parse(existing);
      // If slug is taken by someone else (different token), generate a unique slug
      if (body.token && parsed.token === body.token) {
        // Owner updating — same slug, same token
      } else if (!body.token || parsed.token !== body.token) {
        // Slug taken — append random suffix
        const suffix = Math.random().toString(36).slice(2, 6);
        slug = `${slug}-${suffix}`;
      }
    }

    const token = body.token || crypto.randomUUID();
    const record = JSON.stringify({ config: body.config, token, updatedAt: new Date().toISOString() });

    await client.set(`show:${slug}`, record, { EX: SHOW_TTL_SECONDS });
    await client.disconnect();

    return Response.json({ slug, token });
  } catch (e) {
    try { await client?.disconnect(); } catch { /* ignore */ }
    return Response.json(
      { error: `Publish error: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
