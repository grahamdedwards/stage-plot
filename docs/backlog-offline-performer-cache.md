# Backlog: Offline Performer Cache

**Priority:** High
**Status:** Backlog — needs design spec before build
**Depends on:** Supabase chart library (built), role filter (built)
**Replaces:** Current Google Drive offline cache (`lib/chart-cache.ts`, `public/sw.js`, `OfflineSection` in Config tab)

---

## Problem

The current offline cache is hardwired to Google Drive: it requires a Google OAuth token, calls `/api/drive/download`, and only shows in Config tab when `canResolveCharts` (Google connected). This is legacy from our pre-Supabase architecture.

Google Drive as chart source has multiple problems:
- Complex setup (OAuth, folder ID, Drive API scopes)
- Only the show owner has Drive access — performers can't cache charts independently
- No clean way to give each performer their own Drive auth for offline
- Supabase chart library is now the canonical source

## Goal

Any performer viewing a show can cache charts to their device for offline use at the gig, scoped to their role.

## Key Design Constraints

1. **Performer-scoped, not owner-scoped.** Each performer invokes offline mode on their own device. No owner auth required — charts are already accessible via the show's public URL.

2. **Role-filtered by default.** A guitarist doesn't need the keys charts. Cache only the charts matching the performer's active role filter. This is the most resource-efficient path — a 10-song set with 5 roles has 50 charts; a single role filter reduces that to ~10.

3. **Fallback: cache all if role = "all."** If no role filter is set, cache everything.

4. **Auto-cleanup.** Cached charts shouldn't accumulate forever. Three eviction triggers (any one suffices):
   - **Show date passes:** auto-evict after the event date (next app load after show date)
   - **Manual clear:** performer taps "Clear offline cache"
   - **Next show save:** when the show data changes (new setlist saved), stale cache is replaced

5. **UX location:** The "go offline" action should be accessible from the **Perform tab** (where performers actually are at showtime), not buried in Config. Possibly a small icon/button near the role filter.

6. **Source: Supabase chart library.** Charts are fetched from Supabase storage (already public URLs on the show's chart objects). No proxy route needed — just fetch the URL and cache the response.

## What Gets Cached

- Chart PDF/image blobs (via Cache API, same approach as current implementation)
- Setlist metadata (song titles, keys, order) — small JSON, can go in localStorage or Cache API
- Role filter selection (sessionStorage, already persisted)

## What Does NOT Get Cached

- Full show config (stage plot, inputs, monitors, notes) — not needed at showtime for a performer
- Other performers' charts (unless role = all)

## Eviction Strategy

```
On app load:
  If show.eventDate < today:
    Delete cache for this show
    Show toast: "Offline cache cleared — show date passed"

On show save (owner):
  Invalidate cache version key
  Next performer load detects stale cache, prompts re-download

On manual clear:
  Performer taps "Clear offline cache" — immediate delete
```

## Migration: Deprecate Google Drive Offline

The current Google Drive offline infrastructure should be deprecated as part of this work:
- Remove `OfflineSection` from Config tab (or repurpose for Supabase)
- Remove `/api/drive/download` proxy route
- Keep `lib/chart-cache.ts` utilities (Cache API helpers are reusable) — refactor to remove Google-specific code
- Keep `public/sw.js` service worker (still needed for Cache API intercept)

The broader Google Drive deprecation (charts setup, OAuth, folder config) is a separate effort. This backlog item only removes the Drive-specific offline path.

## Open Questions

- Should the performer see a "ready for offline" indicator on the Perform tab? (e.g., green dot or checkmark next to role filter)
- Pre-cache strategy: likely both — auto-download in background on first load AND surface a manual "Download for offline" button so performers can verify/force. Not mutually exclusive.
- Cache size budget per show? Current estimate: 10 charts x ~100KB = ~1MB per role. Minimal.
- Should the service worker also cache the app shell (HTML/JS/CSS) for full offline PWA, or just charts? (Full PWA is a bigger scope — see design-alpha-ready.md Phase 2)

---

*Created: 2026-05-30*
