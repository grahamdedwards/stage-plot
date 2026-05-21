# Design: Vercel KV Foundation + Admin Settings

**Status:** Draft v1.0
**Depends on:** None (foundational infrastructure)
**Scope:** Add Vercel KV as the persistence layer; build an admin settings panel for operator self-service configuration; migrate try-it quota from in-memory to KV

---

## Problem

ShowRunr currently has zero server-side persistence. Three things break because of this:

1. **Operator config requires Vercel access.** Google OAuth credentials (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and the Claude try-it key (`CLAUDE_TRYIT_KEY`) are env vars set in the Vercel dashboard. Non-technical operators (e.g. a band manager who buys a managed ShowRunr instance) can't configure their own app without access to the hosting provider. That's a non-starter.

2. **Try-it quota resets on cold starts.** The in-memory `Map` in `app/api/agent/chat/route.ts` is process-local. Every new serverless function instance gets a fresh map. A user can burn through their 10 free messages, wait for the instance to recycle, and get 10 more. The Anthropic usage limits on the server key are the only safety net.

3. **No foundation for slug URLs.** Persistent show URLs (e.g. `showrunr.ai/loosely-covered`) — prioritized in the backlog — require a key-value store for `slug → config` mapping. Building KV now lays that foundation.

---

## Hosting Model Context

ShowRunr uses a **hybrid free/paid model** (Model C from session 22 discussion):

- **Free tier:** Current app as-is. localStorage, shareable URLs, BYOA for AI. Zero backend cost.
- **Paid tier:** Managed instance per customer. Operator gets their own Vercel deployment with KV, admin panel, and optional try-it mode. The "purchase" includes hosting. Costs are directly attributable and recoverable.

This design targets the **paid tier** infrastructure. Free tier is unaffected — it continues to work with zero backend.

---

## Design

### 1. Persistence Layer: Vercel KV

**What:** Add `@vercel/kv` (Upstash Redis, managed by Vercel) as the single persistence dependency.

**Why KV over Postgres:**
- Our data is key-value shaped: config keys, quota counters, slug lookups
- No relational queries needed
- Zero schema migrations
- Sub-millisecond reads
- Native Vercel integration (one-click provision, auto-injected env vars)
- Free tier (3k requests/day) covers development; Pro included tier (30k/day) covers production

**KV key namespace:**

| Key pattern | Value | Purpose |
|---|---|---|
| `admin:google_client_id` | string | Google OAuth client ID |
| `admin:google_client_secret` | string | Google OAuth client secret |
| `admin:claude_tryit_key` | string | Claude API key for try-it mode |
| `quota:{ip}` | `{ count: number }` | Try-it usage counter (TTL-based expiry) |

Slug URL keys (`show:{slug}`) are out of scope for this PR but will use the same KV instance.

### 2. Admin Settings Panel

**Route:** `/admin` (new Next.js page)

**Auth gate:** Single `ADMIN_SECRET` env var — the one env var the operator sets in Vercel during initial deployment. This is the bootstrap key that unlocks everything else.

**Flow:**

```
Operator visits /admin
  │
  ├─ Prompted for admin secret (simple password input)
  │
  ├─ Client sends secret in request header to /api/admin/settings
  │   Server compares against process.env.ADMIN_SECRET
  │   Match → 200 + current settings from KV
  │   Mismatch → 401
  │
  ├─ Settings form displayed:
  │   ┌─────────────────────────────────────────┐
  │   │  Google Drive Integration               │
  │   │  ├─ Client ID:     [_______________]    │
  │   │  └─ Client Secret: [_______________]    │
  │   │                                         │
  │   │  AI Show Designer (Try-It Mode)         │
  │   │  └─ Claude API Key: [_______________]   │
  │   │                                         │
  │   │  Status:                                │
  │   │  ├─ Google OAuth: Configured ✓          │
  │   │  ├─ Try-It Mode:  Not configured        │
  │   │  └─ KV Store:     Connected ✓           │
  │   │                                         │
  │   │              [ Save Settings ]          │
  │   └─────────────────────────────────────────┘
  │
  └─ On save: POST /api/admin/settings with updated values
      Server writes to KV, returns confirmation
```

**Security considerations:**
- `ADMIN_SECRET` is never stored in KV — it stays in `process.env` as the root of trust
- Admin secret is sent via `Authorization` header (not query param, not body) — avoids logging
- Settings values (especially `google_client_secret` and `claude_tryit_key`) are secrets — API returns masked values for display (`sk-ant-...****`), full values only on write
- `/admin` page is `'use client'` — no SSR, no secrets in HTML source
- No session/cookie — admin re-authenticates on each visit (acceptable for low-frequency admin access)
- Rate-limit the admin endpoint: 5 attempts per minute per IP to prevent brute-force

### 3. API Route Changes

All API routes that currently read `process.env` will be updated to read from KV first, falling back to `process.env`. This preserves backward compatibility for deployments that still use env vars directly.

**Helper module: `lib/admin-config.ts`**

```ts
import { kv } from '@vercel/kv';

export async function getAdminConfig(key: string): Promise<string | null> {
  try {
    const kvValue = await kv.get<string>(`admin:${key}`);
    if (kvValue) return kvValue;
  } catch {
    // KV not configured or unavailable — fall through to env var
  }
  return process.env[key.toUpperCase()] || null;
}
```

**Routes affected:**

| Route | Current | After |
|---|---|---|
| `app/api/auth/google/route.ts` | `process.env.GOOGLE_CLIENT_ID` | `await getAdminConfig('google_client_id')` |
| `app/api/auth/google/callback/route.ts` | `process.env.GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` | `await getAdminConfig(...)` for both |
| `app/api/agent/chat/route.ts` | `process.env.CLAUDE_TRYIT_KEY` | `await getAdminConfig('claude_tryit_key')` |

### 4. Try-It Quota Migration

Replace the in-memory `Map` with KV-backed quota tracking.

**Current** (in-memory, resets on cold start):
```ts
const tryitQuota = new Map<string, { count: number; resetAt: number }>();
```

**After** (KV, persists across instances):
```ts
async function consumeTryitQuota(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  const key = `quota:${ip}`;
  const count = await kv.incr(key);

  // Set TTL on first use (30 days)
  if (count === 1) {
    await kv.expire(key, 30 * 24 * 60 * 60);
  }

  if (count > TRYIT_QUOTA) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: Math.max(0, TRYIT_QUOTA - count) };
}
```

**Why `incr` + `expire`:** Redis `INCR` is atomic — no race conditions between concurrent requests. `EXPIRE` sets a TTL so quota entries auto-clean. No manual `resetAt` tracking needed; Redis handles it.

---

## New API Endpoints

### `GET /api/admin/settings`

- **Auth:** `Authorization: Bearer {ADMIN_SECRET}`
- **Response:** Current config values (secrets masked)
- **Rate limit:** 5 requests/min/IP

### `PUT /api/admin/settings`

- **Auth:** `Authorization: Bearer {ADMIN_SECRET}`
- **Body:** `{ google_client_id?: string, google_client_secret?: string, claude_tryit_key?: string }`
- **Behavior:** Writes non-empty values to KV. Empty string = delete key (unconfigure).
- **Response:** Updated config (secrets masked)
- **Rate limit:** 5 requests/min/IP

---

## Deployment / Operator Setup

After this PR, the operator setup flow becomes:

1. Deploy ShowRunr to Vercel (fork or from template)
2. In Vercel dashboard: create a KV store, link it to the project
3. Set one env var: `ADMIN_SECRET=<choose-a-strong-passphrase>`
4. Deploy
5. Visit `https://your-app.vercel.app/admin`
6. Enter admin secret
7. Configure Google OAuth + Claude try-it key in the UI
8. Done — no further Vercel dashboard interaction needed

For development: `ADMIN_SECRET` goes in `.env.local`. KV works locally via the Vercel CLI (`vercel env pull` populates the KV connection env vars).

---

## File Inventory

| File | Action |
|---|---|
| `package.json` | Add `@vercel/kv` dependency |
| `lib/admin-config.ts` | New — KV read helper with env var fallback |
| `app/admin/page.tsx` | New — admin settings UI |
| `app/api/admin/settings/route.ts` | New — GET/PUT admin config |
| `app/api/auth/google/route.ts` | Modify — use `getAdminConfig` |
| `app/api/auth/google/callback/route.ts` | Modify — use `getAdminConfig` |
| `app/api/agent/chat/route.ts` | Modify — use `getAdminConfig` + KV quota |

---

## Out of Scope

- Slug URLs (`show:{slug}` keys) — separate design doc, uses same KV instance
- User accounts / multi-tenant isolation — ruled out per Model C decision
- Admin session persistence (cookies/JWT) — not needed for low-frequency admin access
- KV-backed show storage (replacing localStorage) — future, if needed
- Pricing / billing integration — business decision, separate from infra

---

## Open Questions

1. **Should `/admin` be discoverable?** Currently there's no link to it from the main app. Operators know it exists from setup docs. Security-through-obscurity isn't security, but it does reduce surface area. The auth gate is the real protection. Recommendation: no link, document in README/setup guide.

2. **KV unavailable gracefully?** If the KV store isn't provisioned (e.g. free tier user who didn't set it up), all `getAdminConfig` calls fall through to `process.env`. The app works exactly as it does today. Zero regression risk.
