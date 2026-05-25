# Design: Chart Library — Owner-Scoped, Reusable Across Shows

**Status:** Draft v1.1 — Post-adversarial review (5 findings addressed)
**Depends on:** Supabase backend (PR #44, merged)
**Scope:** Replace show-scoped chart storage with an owner-scoped chart library. Charts are uploaded once, reused across all shows. Auto-matched to setlist songs by normalized title.

---

## The Problem

Charts are currently tied to `show_id + song_id`. Every show generates fresh song UUIDs. This means:

1. **Re-upload tax:** Same band, same songs, new show → re-upload all charts
2. **Orphan waste:** Remove a song from setlist → chart rows and Storage files orphan
3. **No memory:** Add "Valerie" to a new show → no charts, even though you uploaded them last week
4. **Song identity is per-show:** UUIDs are meaningless outside their show context

Bands play the same 30-50 songs across dozens of gigs. The chord chart for "Valerie" doesn't change between Tuesday's rehearsal and Saturday's gig. Charts belong to the **owner's repertoire**, not to any single show.

---

## Design: Chart Library

### Core Concept

Charts live in an **owner-scoped library**, indexed by normalized song title. When a song appears in any show's setlist, its charts are resolved from the library automatically — zero configuration per show.

```
Owner's Chart Library
  "valerie" → [Guitar.pdf, Lyrics.pdf, Keys.pdf]
  "superstition" → [Guitar.pdf, Horns.pdf]
  "crazy" → [Guitar.pdf, Lyrics.pdf]

Show A setlist: Valerie, Superstition, Crazy
  → all charts auto-resolved from library

Show B setlist: Valerie, Crazy, Sweet Child
  → Valerie + Crazy resolved; Sweet Child has no charts yet
```

### Data Model

#### Replace `charts` table with `chart_library`

```sql
-- Drop the show-scoped charts table
drop table if exists charts;

-- Owner-scoped chart library
create table chart_library (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  song_key text not null,          -- normalized song title (lowercase, stripped)
  song_title text not null,        -- display title (original casing, for UI)
  role text not null,              -- 'Guitar', 'Lyrics', 'Keys', 'Bass', 'Horns', etc.
  file_name text not null,         -- original filename
  storage_path text not null,      -- path in Supabase Storage
  mime_type text not null,
  file_size integer not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(owner_id, song_key, role) -- one chart per song per role per owner
);

alter table chart_library enable row level security;

create trigger set_chart_library_updated_at
  before update on chart_library
  for each row execute function extensions.moddatetime(updated_at);

create index chart_library_owner_idx on chart_library(owner_id);
create index chart_library_song_key_idx on chart_library(owner_id, song_key);
```

#### Song Key Normalization

One canonical normalizer, shared between server and client (`lib/normalize.ts`). Matches the existing Drive batch resolution logic including leading article stripping:

```typescript
const LEADING_ARTICLES = /^(the|a|an)\s+/i;

export function normalizeSongKey(title: string): string {
  const key = title
    .toLowerCase()
    .replace(LEADING_ARTICLES, '')  // "The Thrill Is Gone" → "thrill is gone"
    .replace(/[^a-z0-9\s]/g, '')   // strip punctuation and diacritics
    .replace(/\s+/g, ' ')          // collapse whitespace
    .trim();

  if (!key) {
    throw new Error(`Cannot normalize song title to a valid key: "${title}"`);
  }

  return key;
}

// "Valerie" → "valerie"
// "Don't Stop Believin'" → "dont stop believin"
// "The Thrill Is Gone" → "thrill is gone"
// "Sweet Child O' Mine" → "sweet child o mine"
```

**Finding #5 fixes:**
- Strips leading articles (consistent with existing Drive `normalize()` in `lib/drive.ts:69`)
- Throws on empty result (prevents collapsing multiple songs into one bucket)
- Single implementation shared server + client (no drift)
- Diacritics: stripped by the `[^a-z0-9\s]` regex. Songs with non-Latin titles ("Despacito" → "despacito") work fine. Purely-emoji or purely-punctuation titles rejected (edge case, acceptable).

The upload route and slug resolution both import from `lib/normalize.ts` — one source of truth.

#### Storage Path (Changed)

```
Bucket: charts (public read, write via API route only)

Old path: {show_id}/{song_id}/{role}.{ext}
New path: {owner_id}/{song_key}/{canonical_role}.{ext}

Example:
  abc123-user-id/valerie/guitar.pdf
  abc123-user-id/valerie/lyrics.pdf
  abc123-user-id/superstition/horns.pdf
```

Owner-scoped paths. No show ID in the path — charts are show-independent.

**Role canonicalization (Finding #4):** Roles are lowercased and restricted to an allowlist to prevent path collisions and semantic duplicates:

```typescript
const ALLOWED_ROLES = ['guitar', 'lyrics', 'keys', 'bass', 'horns', 'drums', 'other'] as const;

function canonicalizeRole(input: string): string {
  const lower = input.toLowerCase().trim();
  if (ALLOWED_ROLES.includes(lower as any)) return lower;
  return 'other';  // unknown roles map to "other"
}
```

Users see the original role label in the UI (stored in `role` column), but the storage path uses the canonical form. If we need more roles later, we extend the allowlist — not a schema change.

**Orphan prevention on re-upload (Finding #4):** When upserting a chart with a different file extension than the existing one, the upload route deletes the old Storage blob first:

```typescript
// Before upload: check if existing chart has a different storage_path
const { data: existing } = await supabase
  .from('chart_library')
  .select('storage_path')
  .eq('owner_id', user.id)
  .eq('song_key', songKey)
  .eq('role', role)
  .single();

if (existing && existing.storage_path !== newStoragePath) {
  await admin.storage.from('charts').remove([existing.storage_path]);
}

// Then upload new blob + upsert DB row
```

No orphaned blobs — old extension files are cleaned up before the new upload lands.

#### RLS Policies

```sql
-- Owner can read their own charts
create policy "Owner read own charts"
  on chart_library for select
  using (auth.uid() = owner_id);

-- Collaborators can read charts for songs in shows they have access to
-- (resolved via the show's setlist, not a direct FK)
-- For simplicity: collaborators read the owner's full library for shows they're on
create policy "Collaborator read charts"
  on chart_library for select
  using (
    exists (
      select 1 from show_collaborators sc
      join shows s on s.id = sc.show_id
      where s.owner_id = chart_library.owner_id
        and sc.user_id = auth.uid()
    )
  );

-- Only owner can write (upload/update/delete)
create policy "Owner write charts"
  on chart_library for insert
  with check (auth.uid() = owner_id);

create policy "Owner update charts"
  on chart_library for update
  using (auth.uid() = owner_id);

create policy "Owner delete charts"
  on chart_library for delete
  using (auth.uid() = owner_id);
```

**Note:** Collaborator read uses a join through `show_collaborators → shows` to find shows where the chart owner is also the show owner. This gives collaborators read access to the owner's charts for any show they're invited to. Uses `is_show_owner` pattern if recursion is a concern — but since `chart_library` doesn't reference `shows` in its own policies, and `show_collaborators` is only checked one-way here, there's no cycle.

### Anonymous Slug Resolution (Charts)

When an anonymous viewer loads a show via slug, the API route (admin client) resolves charts:

```typescript
// In GET /api/shows/[slug]
const { data: show } = await admin.from('shows').select('*').eq('slug', slug).single();

// Resolve charts from owner's library by matching setlist song titles
const songKeys = show.config.setlist.map((s) => normalizeSongKey(s.title));

const { data: charts } = await admin
  .from('chart_library')
  .select('*')
  .eq('owner_id', show.owner_id)
  .in('song_key', songKeys);
```

No auth needed from the viewer — the admin client handles it server-side.

---

## Chart Resolution Flow

### On Show Load (Any Context)

```
Load show config (setlist with song titles)
  ↓
For each song, compute song_key = normalize(title)
  ↓
Query chart_library WHERE owner_id = show.owner_id AND song_key IN (...)
  ↓
Group results by song_key
  ↓
Attach charts to each setlist song in memory (ephemeral, not persisted in config)
  ↓
Render in Show tab (chart viewer, navigator, etc.)
```

Charts are resolved at load time, not stored in the show config. This means:
- Upload a chart → it immediately appears in all shows with that song
- Delete a chart → it disappears from all shows
- Rename a song slightly ("Valerie" → "Valerie (Amy ver.)") → charts still match if normalization is the same, or don't match if it's genuinely different

### On Song Add/Remove

- **Add song to setlist:** Charts auto-resolve from library on next load/render. No action needed.
- **Remove song from setlist:** Charts remain in library (they belong to the repertoire, not the show). No orphans, no cleanup needed.

---

## Upload UX (Revised)

### Inline on Setlist Row (Replaces Separate Chart Section)

Charts live directly on the setlist song row in the Setup tab — no separate "Charts" section that redundantly lists the same songs. The scene note column is replaced by the chart area (scene notes were rarely used; charts are used constantly):

```
  #  Title         Lead     Key   Charts
  1  Valerie       Rachel   E     [Guitar] [Lyrics] [+ Chart]
  2  Superstition  Graham   Ebm   [Guitar] [Horns]  [+ Chart]
  3  Sweet Child   Matt     D     [+ Chart]
```

Each song row shows:
- Chart pills (role labels) for existing charts — click to view inline (all users)
- `[+ Chart]` button — **owner only** — file picker → auto-detect role from filename → upload → pill appears
- `[x]` on each pill — **owner only** — delete chart from library

**Collaborator visibility (Finding #2):** Editors and viewers see chart pills (read-only) but NOT the upload/delete controls. The chart library is owner-managed. Collaborators benefit from the owner's charts but don't modify the library. The `[+ Chart]` button and `[x]` delete buttons are conditionally rendered based on `isOwner`. This is enforced in both UI (hide controls) and backend (RLS: only owner can insert/update/delete).

**What this replaces:**
- The standalone `ChartUploadSection` component (separate list of songs)
- The scene note column (moved to the song's expandable notes field if needed)

**Why this is better:**
- One row = one song = everything about that song
- No context-switching between "setlist setup" and "chart management"
- Immediately obvious which songs have charts and which don't
- The chart pills double as the navigation entry point (click pill → open chart viewer)

### Bulk Upload

"Upload Charts" button in the setlist section header → drop zone for multiple files → filename matching against setlist songs → confirm role assignments → upload all.

Same UX concept as before, but results appear inline on the song rows immediately after upload.

### Library View (New, Optional — Future)

A "My Charts" page in the dashboard showing the full library:

```
My Chart Library (47 songs, 112 charts)

  Valerie          Guitar.pdf  Lyrics.pdf  Keys.pdf
  Superstition     Guitar.pdf  Horns.pdf
  Crazy            Guitar.pdf  Lyrics.pdf
  Sweet Child      Guitar.pdf
  ...
```

This is a nice-to-have for repertoire management. The inline setlist UI is the primary interaction surface. The library view provides cross-show visibility ("what charts do I have for songs not on tonight's setlist?").

---

## Migration from Current Schema

### Migration Strategy (Finding #3 — Rollout-Safe)

The `charts` table is currently empty (no uploads through Supabase yet). The migration guards against accidental data loss:

```sql
-- Guard: abort if charts table has data (shouldn't happen, but belt + suspenders)
do $$
begin
  if (select count(*) from charts) > 0 then
    raise exception 'charts table is not empty — use backfill migration instead of drop';
  end if;
end $$;

-- Safe to drop (table confirmed empty)
drop table charts;

-- Create chart_library (schema from above)
-- ... (full CREATE TABLE + RLS + indexes)
```

**Steps:**
1. Run guarded migration SQL (fails safely if table has data)
2. Update API routes (upload, delete, slug resolution)
3. Update UI component (inline on setlist row, owner-only controls)
4. Deploy

**If charts table ever has data (future migrations):**
The safe pattern is: create `chart_library` alongside `charts`, dual-write during transition, backfill existing rows with verified normalization, validate, then drop `charts`. Not needed now but documented for when we're past dev phase.

---

## API Route Changes

### POST /api/charts/upload (Revised)

```typescript
// Input: file, song_title, role
// (No more show_id or song_id — library is show-independent)

const songKey = normalizeSongKey(songTitle);
const storagePath = `${user.id}/${songKey}/${role.toLowerCase()}.${ext}`;

// Upload to Storage
await admin.storage.from('charts').upload(storagePath, file, { upsert: true });

// Upsert to chart_library
await supabase.from('chart_library').upsert({
  owner_id: user.id,
  song_key: songKey,
  song_title: songTitle,  // preserve original casing
  role,
  file_name: file.name,
  storage_path: storagePath,
  mime_type: file.type,
  file_size: file.size,
}, { onConflict: 'owner_id,song_key,role' });
```

### DELETE /api/charts/delete (Revised)

```typescript
// Input: chart_id
// Only owner can delete (RLS enforced)

// DB delete first (RLS enforced)
const { data: chart } = await supabase
  .from('chart_library')
  .delete()
  .eq('id', chartId)
  .select('storage_path')
  .single();

// Then Storage cleanup
await admin.storage.from('charts').remove([chart.storage_path]);
```

### GET /api/shows/[slug] (Revised Chart Resolution)

```typescript
// After fetching show config...
const songKeys = show.config.setlist
  .map((s) => normalizeSongKey(s.title))
  .filter(Boolean);

const { data: charts } = await admin
  .from('chart_library')
  .select('id, song_key, role, file_name, storage_path, mime_type, file_size, updated_at')
  .eq('owner_id', show.owner_id)
  .in('song_key', songKeys);

// Group by song_key into a plain object (Finding #1: Map won't JSON.stringify)
const chartsBySong: Record<string, Array<{...}>> = {};
for (const c of charts || []) {
  const key = c.song_key;
  if (!chartsBySong[key]) chartsBySong[key] = [];
  chartsBySong[key].push({
    id: c.id,
    song_key: key,
    role: c.role,
    file_name: c.file_name,
    mime_type: c.mime_type,
    file_size: c.file_size,
    updated_at: c.updated_at,
    url: `${SUPABASE_URL}/storage/v1/object/public/charts/${c.storage_path}`,
  });
}

// Return as plain object — serializes correctly to JSON
return Response.json({ config: show.config, charts: chartsBySong, slug });
```

Client matches charts to setlist by computing `normalizeSongKey(song.title)` for each song and indexing into the `charts` object:

```typescript
const songKey = normalizeSongKey(song.title);
const songCharts = data.charts[songKey] || [];
```

---

## What This Fixes

| Problem | Before | After |
|---|---|---|
| Re-upload tax | Upload per show | Upload once, available everywhere |
| Orphan files | Remove song → orphaned charts | Remove song → charts stay in library |
| No memory | New show = blank slate | New show auto-resolves from library |
| Song identity | Ephemeral UUID per show | Normalized title (stable, meaningful) |

---

## What This Design Intentionally Does NOT Cover

- **Shared chart libraries** — one owner's charts shared with another owner. Out of scope. Each owner has their own library. Collaborators can VIEW the owner's charts but not contribute to their library (they'd upload to their own).
- **Chart versioning** — "I updated the horn chart, can I see the old one?" No version history. Upsert replaces. YAML export is the backup mechanism.
- **Duplicate song titles** — "Crazy" by Patsy Cline vs. "Crazy" by Gnarls Barkley. Same `song_key` = same charts. If this becomes a real problem, add an optional `artist` field to disambiguation. For a cover band's repertoire of 30-50 songs, collisions are rare.
- **Chart suggestions / AI matching** — "You uploaded 'Valerie' charts — this song 'Valerie (Zutons ver.)' might be the same." Future feature, not now.

---

## Implementation Plan

1. SQL migration: drop `charts`, create `chart_library`, policies
2. Update `/api/charts/upload` — remove show_id/song_id, add song_title, use normalization
3. Update `/api/charts/delete` — query `chart_library` instead of `charts`
4. Update `/api/shows/[slug]` — resolve charts from `chart_library` by owner + song_key
5. Update `[slug]/page.tsx` — match charts to setlist by normalized title on load
6. Update `ChartUploadSection` — pass song title instead of song_id, remove show_id requirement
7. Update `lib/show-file.ts` — song IDs still in v2 format for setlist ordering, but chart linkage is now by title (IDs no longer used for chart FK)

All in one PR. The old `charts` table is empty, so no data migration needed.

---

## Adversarial Cross-Check (Codex Review — 1 round, 5 findings)

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | **CRITICAL** | Slug response returns a JS `Map` which won't serialize to JSON — chart data dropped on the wire | Replaced with plain `Record<string, Array<...>>` object. Serializes correctly. |
| 2 | **HIGH** | Upload/delete UI shown to all users but RLS restricts writes to owner only — confusing UX | `[+ Chart]` and `[x]` buttons conditionally rendered for `isOwner` only. Collaborators see read-only pills. Enforced in both UI and backend. |
| 3 | **HIGH** | Migration drops `charts` table without guarding against non-empty state | Added `DO $$ ... IF count > 0 THEN RAISE EXCEPTION` guard. Documented dual-write pattern for future migrations with data. |
| 4 | **MEDIUM** | Re-upload with different file extension orphans old Storage blob; free-text role creates path collisions | Upload route deletes old blob before uploading new one. Roles canonicalized via allowlist (`guitar`, `lyrics`, `keys`, `bass`, `horns`, `drums`, `other`). |
| 5 | **MEDIUM** | Normalizer differs from existing Drive logic (missing article stripping), can return empty key | Unified normalizer in `lib/normalize.ts`: strips leading articles, throws on empty result, shared between server and client. |
