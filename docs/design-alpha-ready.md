# Alpha-Ready: Owner Namespacing + Offline PWA — Design Spec v1.0

## Goals

Get ShowRunr into the hands of friends/colleagues/pros for real usage. Two deliverables:
1. Clean owner-namespaced URLs: `/{owner}/{show}`
2. Full offline PWA: app shell + show data + charts cached for venue use

---

## Part 1: Owner Namespacing

### URL Structure

```
/                               -> landing (redirect to /dashboard or /sign-in)
/{owner-slug}/{show-slug}       -> show view (Perform/Mix/Config/AI)
/dashboard                      -> authenticated user's dashboard
/sign-in                        -> OTP auth
/claim                          -> "Claim your RunR" onboarding (first sign-in)
/api/*                          -> API routes (unchanged)
/admin                          -> admin panel (unchanged)
```

**Blocklist** (reserved first-segment values that cannot be owner slugs):
```
dashboard, sign-in, sign-out, claim, api, admin, about, help,
pricing, terms, privacy, settings, new, import, export
```

**Examples:**
- `stage-plot-five.vercel.app/loosely-covered/fernandos-party`
- `stage-plot-five.vercel.app/sleazzy-top/woof-camp-afterglow`
- `showrunr.com/graham/nicholson-ranch` (future, post-domain purchase)

### Data Model

#### New table: `profiles`

```sql
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_slug text UNIQUE NOT NULL,
  display_name text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON profiles FOR SELECT USING (true);
CREATE POLICY "Owner manage" ON profiles FOR ALL USING (auth.uid() = id);
```

#### Modify `shows` table

```sql
-- Relax slug uniqueness from global to per-owner
ALTER TABLE shows DROP CONSTRAINT shows_slug_key;
ALTER TABLE shows ADD CONSTRAINT shows_owner_slug_unique UNIQUE(owner_id, slug);
```

#### Seed existing users

```sql
-- Two known accounts. Slugs derived from their show contexts.
INSERT INTO profiles (id, owner_slug, display_name) VALUES
  ('5f8e...', 'graham', 'Graham'),           -- primary account
  ('08df...', 'fernando', 'Fernando')         -- stale/secondary
ON CONFLICT (id) DO NOTHING;
```

(Exact UUIDs from Supabase auth dashboard.)

### "Claim Your RunR" Onboarding

**When:** First authenticated visit where no `profiles` row exists for the user.

**Flow:**
1. Middleware checks auth session -> user exists -> query profiles table
2. No profile -> redirect to `/claim`
3. `/claim` page: simple form
   - Heading: "Claim your RunR"
   - Subheading: "Pick a handle for your ShowRunr URL"
   - Input: `showrunr.com/` + [text field] (or `stage-plot-five.vercel.app/` for now)
   - Validation: lowercase, alphanumeric + hyphens, 3-30 chars, not in blocklist, not taken
   - Optional: display name field
   - Submit -> insert into profiles -> redirect to `/dashboard`

**Implementation:** `app/claim/page.tsx` (client component) + `POST /api/profiles` (create profile endpoint).

### Route Changes

#### New route: `app/[owner]/[show]/page.tsx`
- Same component as current `app/[slug]/page.tsx` (moved, not copied)
- `useParams()` now returns `{ owner, show }` instead of `{ slug }`
- Show loading: `GET /api/shows/{owner}/{show}` (new endpoint, replaces `/api/shows/[slug]`)

#### Updated API: `GET /api/shows/[owner]/[show]/route.ts`
- Resolve owner_slug -> owner_id via profiles table
- Then resolve show by (owner_id, slug) pair
- Returns same payload as current `/api/shows/[slug]`

#### Backwards-compat redirect: `middleware.ts`
- Single-segment paths (e.g., `/woof-camp-afterglow-sleazzy-top`) that aren't in the blocklist:
  - Lookup show by global slug (query shows table)
  - If found, lookup owner's profile -> redirect 301 to `/{owner_slug}/{show_slug}`
  - If not found, 404
- This handles any shared links from the current URL scheme

#### Dashboard link updates
- Show cards link to `/{owner_slug}/{show_slug}` instead of `/{slug}`
- Dashboard API returns owner_slug alongside show data
- Share URLs updated throughout

#### `use-show.ts` slug update
- `replaceState` path changes from `/${newSlug}` to `/${ownerSlug}/${newSlug}`

### Slug collision handling

Show slugs are now unique per-owner (not globally). Two different users can both have `/friday-night`. The collision check in `POST /api/shows` and `PUT /api/shows/update` changes from global to per-owner:

```sql
-- Before: .eq('slug', slug).neq('id', id)
-- After:  .eq('slug', slug).eq('owner_id', user.id).neq('id', id)
```

---

## Part 2: Offline PWA

### Problem

Venues often have poor connectivity. The current SW only caches chart PDFs. If you lose signal, the app shell won't load — Perform mode is dead.

### Strategy: Cache layers

| Layer | What | Strategy | When cached |
|-------|------|----------|-------------|
| App shell | HTML, JS, CSS, fonts | **Precache on SW install** | First visit / SW update |
| Show data | JSON config for a show | **Cache on view** (network-first) | When user opens a show |
| Charts | PDF files | **Existing** (user-triggered download) | Manual "Download for offline" |

### Service Worker Upgrade

Replace the minimal `sw.js` with a proper caching SW:

```
public/sw.js -> generated or hand-written with:
  1. PRECACHE: app shell assets (/_next/static/*, key HTML routes)
  2. RUNTIME: network-first for /api/shows/* (cache response on success)
  3. RUNTIME: cache-first for /_next/static/* (immutable hashes)
  4. EXISTING: cache-only for /api/chart-cache/* (unchanged)
```

**Approach: Hand-written SW** (not Workbox/next-pwa). Reasons:
- We already have a custom SW for charts
- The app is small — precache list is manageable
- No build-time plugin complexity
- Full control over caching strategy

### SW Implementation Details

#### Install event — precache app shell
```javascript
const APP_CACHE = 'showrunr-app-v1';
const SHOW_CACHE = 'showrunr-shows-v1';

// Populated at build time via a simple script that lists /_next/static output
const APP_SHELL_URLS = [
  '/',
  '/dashboard',
  '/sign-in',
  // /_next/static chunks will be added by build script
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => cache.addAll(APP_SHELL_URLS))
  );
  self.skipWaiting();
});
```

#### Fetch event — routing
```javascript
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Chart cache (existing behavior)
  if (url.pathname.startsWith('/api/chart-cache/')) {
    event.respondWith(chartCacheHandler(event));
    return;
  }

  // Show data API — network-first, cache fallback
  if (url.pathname.match(/^\/api\/shows\/[^/]+\/[^/]+$/)) {
    event.respondWith(networkFirst(event, SHOW_CACHE));
    return;
  }

  // Static assets — cache-first (hashed filenames)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(event, APP_CACHE));
    return;
  }

  // Navigation requests — network-first with app shell fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(navigationHandler(event));
    return;
  }
});
```

#### Show data caching
When a user opens `/{owner}/{show}`, the fetch to `/api/shows/{owner}/{show}` is intercepted:
1. Try network first
2. On success, clone response into `SHOW_CACHE`
3. On network failure, serve from cache
4. Cache key: the request URL

This means: **open a show once while online, and it's available offline forever** (until cache is cleared or updated).

#### Offline indicator
- Small banner at top of Perform tab: "Offline — showing cached data"
- Only appears when `navigator.onLine === false`
- Non-blocking — the show still works

### Build-time asset manifest

Next.js generates hashed filenames in `/_next/static/`. We need a small build script that:
1. Runs after `next build`
2. Lists all files in `.next/static/`
3. Writes them as a JSON array to `public/asset-manifest.json`
4. The SW fetches this manifest on install and precaches all entries

Add to `package.json`:
```json
"scripts": {
  "build": "next build && node scripts/generate-sw-manifest.js"
}
```

### Manifest.ts updates

```typescript
start_url: '/dashboard',  // was '/'
id: '/dashboard',         // stable PWA identity
```

### Install prompt

Add a small "Add to Home Screen" prompt on Perform tab for eligible browsers:
- Listen for `beforeinstallprompt` event
- Show a dismissable banner: "Install ShowRunr for offline access"
- Store dismissal in localStorage (don't nag)
- Only show on Perform tab (that's where musicians are at the gig)

---

## Implementation Plan

### Phase 1: Owner namespacing (PR A)
1. Migration 005: profiles table + shows constraint change + seed existing users
2. `POST /api/profiles` endpoint (claim handle)
3. `app/claim/page.tsx` onboarding page
4. Move `app/[slug]/page.tsx` -> `app/[owner]/[show]/page.tsx`
5. New `app/api/shows/[owner]/[show]/route.ts`
6. Middleware: legacy slug redirect + profile check
7. Dashboard: update links to `/{owner}/{show}` format
8. `use-show.ts`: update replaceState path
9. Update slug collision checks to per-owner scope

### Phase 2: Offline PWA (PR B)
1. `scripts/generate-sw-manifest.js` — build-time asset list
2. Rewrite `public/sw.js` — precache + runtime caching
3. Show data caching in SW fetch handler
4. Offline indicator component
5. Update `manifest.ts` (start_url, id)
6. Install prompt on Perform tab
7. Update build script in package.json

### Migration safety
- Only 3 shows, 2 users — low risk
- Backwards-compat redirects ensure no broken links
- Profile seed uses known UUIDs from Supabase dashboard
- Can run migration + deploy atomically on Vercel

---

## Open Questions

None — ready to build on approval.
