import { NextRequest } from 'next/server';
import { SYSTEM_PROMPT, TOOLS } from '@/lib/agent';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_BODY_SIZE = 100_000; // 100KB
const TRYIT_MODEL = 'claude-sonnet-4-5-20250514';
const BYOA_MODEL = 'claude-sonnet-4-5-20250514';
const TRYIT_MAX_TOKENS = 2048;
const BYOA_MAX_TOKENS = 4096;
const TRYIT_QUOTA = 10;

// Quota store. In-memory for local dev; production should use Vercel KV
// (add @vercel/kv and swap this implementation before launch).
// Every try-it request decrements — no turn-type detection needed, which
// eliminates bypass vectors from crafted payloads.
const tryitQuota = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function consumeTryitQuota(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const ttl = 30 * 24 * 60 * 60 * 1000; // 30 days
  let entry = tryitQuota.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + ttl };
    tryitQuota.set(ip, entry);
  }
  if (entry.count >= TRYIT_QUOTA) {
    return { allowed: false, remaining: 0 };
  }
  entry.count++;
  return { allowed: true, remaining: Math.max(0, TRYIT_QUOTA - entry.count) };
}

export async function POST(request: NextRequest) {
  // Size check
  const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    return Response.json({ error: 'Request too large' }, { status: 413 });
  }

  let body: { messages: Array<{ role: string; content: unknown }>; currentConfig: unknown; configHash: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.messages || !Array.isArray(body.messages)) {
    return Response.json({ error: 'Missing messages array' }, { status: 400 });
  }

  // Determine auth mode
  const clientKey = request.headers.get('authorization')?.replace('Bearer ', '');
  const serverKey = process.env.CLAUDE_TRYIT_KEY;
  const ip = getClientIp(request);

  let apiKey: string;
  let model: string;
  let maxTokens: number;
  let tryitRemaining: number | null = null;

  if (clientKey) {
    // BYOA mode
    apiKey = clientKey;
    model = BYOA_MODEL;
    maxTokens = BYOA_MAX_TOKENS;
  } else if (serverKey) {
    // Try-it mode — every request costs quota, no bypass vectors
    const quota = consumeTryitQuota(ip);
    if (!quota.allowed) {
      return Response.json(
        { error: 'Free messages used up. Enter your own Claude API key to continue.', tryitExhausted: true },
        { status: 429, headers: { 'X-Tryit-Remaining': '0' } },
      );
    }
    tryitRemaining = quota.remaining;
    apiKey = serverKey;
    model = TRYIT_MODEL;
    maxTokens = TRYIT_MAX_TOKENS;
  } else {
    return Response.json(
      { error: 'No API key provided and try-it mode is not available.' },
      { status: 401 },
    );
  }

  // Build system prompt with current config context
  const systemWithConfig = body.currentConfig
    ? `${SYSTEM_PROMPT}\n\n<current_config>\n${JSON.stringify(body.currentConfig, null, 2)}\n</current_config>`
    : SYSTEM_PROMPT;

  // Proxy to Claude API with streaming
  try {
    const anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: systemWithConfig,
        tools: TOOLS,
        messages: body.messages,
        stream: true,
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      const status = anthropicRes.status === 401 ? 401 : 502;
      const msg = anthropicRes.status === 401
        ? 'Invalid API key. Check your key and try again.'
        : `Claude API error: ${errText}`;
      return Response.json({ error: msg }, { status });
    }

    // Stream the response through
    const responseHeaders: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    };
    if (tryitRemaining !== null) {
      responseHeaders['X-Tryit-Remaining'] = String(tryitRemaining);
    }

    return new Response(anthropicRes.body, { headers: responseHeaders });
  } catch (e) {
    return Response.json(
      { error: `Proxy error: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
}
