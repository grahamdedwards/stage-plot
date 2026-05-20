# Design: Offline Chart Cache

**Status:** Draft v1.0 — awaiting review
**Depends on:** Batch Chart Resolution & Navigator (PR #2 design)
**Scope:** Download chart files for offline access at the gig

---

## Problem

Chart links point to Google Drive. No internet = no charts. This matters for:
- iPads at side-stage with no Wi-Fi
- Venues with spotty cell coverage
- Outdoor gigs (festivals, Bohemian Club grove stages)
- General Murphy's Law at showtime

The batch resolution design (PR #2) solves the *link* problem — links are in localStorage. But the *files* still live in Google Drive.

---

## Design

### Core Concept

At setup time (with connectivity), download the actual chart files and cache them in the browser. At showtime, the navigator opens cached files instead of Drive URLs.

### Storage: Cache API

**Why Cache API over IndexedDB:**
- Cache API is designed for request/response pairs — exactly what we need (URL → file)
- Works with Service Workers for true offline support
- No serialization overhead — stores binary blobs natively
- Simpler API than IndexedDB for this use case

**Storage budget:** Browsers typically allow 50-100MB+ per origin. A chart library of 30 songs x 5 roles = 150 files, mostly 1-2 page PDFs at ~100KB each = ~15MB. Well within limits.

### Download Flow

```
User clicks "Download Charts for Offline" in Setup tab
  │
  ├─ For each song with resolved charts:
  │    For each chart:
  │      1. Fetch the file from Google Drive (using access token)
  │         GET https://www.googleapis.com/drive/v3/files/{fileId}?alt=media
  │      2. Store response in Cache API
  │         cache.put(cacheKey, response)
  │      3. Update chart object with cached flag
  │
  ├─ Progress bar: "Downloading 42/87 charts..."
  │
  └─ Done: "87 charts cached (14.2 MB) — available offline"
```

### New API Route

#### `POST /api/drive/download`

Proxies a Drive file download. Needed because Drive API requires the access token, and we don't want to expose it to the Service Worker.

```ts
// Request
{
  fileId: string;
  mimeType?: string;  // for Google Docs → PDF export
}

// Response: the raw file bytes with appropriate Content-Type
```

**Google Docs handling:** Native Google Docs/Sheets/Slides can't be downloaded as-is. The endpoint detects Google MIME types and uses the export endpoint instead:
- `application/vnd.google-apps.document` → export as PDF
- `application/vnd.google-apps.spreadsheet` → export as PDF
- `application/vnd.google-apps.presentation` → export as PDF
- Everything else (PDFs, images, etc.) → direct download

### Cache Key Strategy

```
stageplot-chart://{songTitle}/{role}/{fileId}
```

Example: `stageplot-chart://superstition/guitar/1a2b3c4d5e`

Using fileId ensures cache invalidation when files are replaced in Drive.

### Service Worker

Minimal service worker that intercepts chart requests:

```
app/sw.ts (or public/sw.js)

on fetch:
  if request matches stageplot-chart://*
    → serve from Cache API
    → fallback to network (if online)
    → fallback to "offline, chart not cached" message
```

Registered on first "Download Charts" action. No service worker installed until the user opts in — keeps the app simple for users who don't need offline.

---

## UI Changes

### Setup Tab

New section below "Charts / Lead Sheets" (or within it):

```
┌──────────────────────────────────────┐
│  Offline Access                      │
│                                      │
│  Cache charts for offline use at     │
│  the gig. Requires active internet   │
│  connection to download.             │
│                                      │
│  [Download Charts for Offline]       │
│                                      │
│  Status: 87 charts cached (14.2 MB)  │
│  Last synced: May 20, 2026 3:42 PM   │
│                                      │
│  [Clear Cache]                       │
└──────────────────────────────────────┘
```

**Progress state:**
```
  Downloading charts...
  ████████████░░░░░░░░ 42/87
  [Cancel]
```

### Show Tab — Navigator Changes

The navigator overlay (from PR #2 design) gets a small enhancement:

- **Online:** chart link opens from cache (instant) or falls back to Drive URL
- **Offline:** chart opens from cache. If not cached, shows "Chart not available offline" with the role/filename so they know what's missing
- **Offline indicator:** small badge in navigator header: "Offline — using cached charts"

### Cache Management

| Action | Behavior |
|---|---|
| Download Charts | Downloads all resolved charts. Skips already-cached files (by fileId). |
| Refresh Charts (from PR #2) | Re-resolves links. Marks new/changed charts as "needs download". |
| Download after Refresh | Only downloads new/changed files. |
| Clear Cache | Removes all cached chart files. Frees storage. |
| Song removed from setlist | Cached file remains (harmless). Cleared on next "Clear Cache". |

---

## Data Model Changes

Extend the `Chart` interface:

```ts
interface Chart {
  role: string;
  url: string;           // Google Drive URL (existing)
  label?: string;
  dupeCount?: number;
  fileId?: string;        // Drive file ID (for download + cache key)
  cached?: boolean;       // true if file is in the offline cache
  mimeType?: string;      // original MIME type (for export detection)
}
```

New fields (`fileId`, `cached`, `mimeType`) populated during batch resolution.

The batch endpoint (PR #2) needs to return `fileId` and `mimeType` in addition to the current fields.

---

## Offline Detection

```ts
// Simple: navigator.onLine + online/offline events
window.addEventListener('offline', () => setIsOffline(true));
window.addEventListener('online', () => setIsOffline(false));
```

Used to:
1. Show the offline badge in the navigator
2. Route chart opens to cache vs. Drive URL
3. Disable "Download Charts" button when offline

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Download interrupted (lost connection mid-batch) | Progress saved. "Resume Download" picks up where it left off (skips already-cached). |
| Google Doc chart | Exported as PDF during download. Cached as PDF. |
| Chart updated in Drive after caching | Stale cache until "Refresh Charts" + re-download. FileId changes when file is replaced. |
| Browser clears cache (storage pressure) | `cached` flags become stale. "Download Charts" re-downloads everything. |
| Multiple shows cached | Each show has its own cache entries (keyed by song title). No conflict. |
| Storage quota exceeded | Catch the quota error, show "Not enough storage — clear other cached shows or browser data". |
| User never clicks Download | No service worker, no cache, no overhead. App works exactly as before. |

---

## Size Estimates

| Setlist size | Avg charts/song | Total files | Est. size |
|---|---|---|---|
| 15 songs (short set) | 3 | 45 | ~5 MB |
| 30 songs (full show) | 5 | 150 | ~15 MB |
| 30 songs (all 8 roles) | 8 | 240 | ~25 MB |

All well within browser storage limits (typically 50-100MB+ per origin).

---

## Implementation Order

1. Add `fileId` and `mimeType` to batch resolution response
2. Build `/api/drive/download` proxy endpoint
3. Build download manager (progress, resume, cache writes)
4. Register service worker on first download
5. Wire navigator to prefer cache over network
6. Add offline detection + badge
7. Setup tab UI (download button, status, clear cache)

---

## Out of Scope

- Syncing chart *edits* back to Drive (read-only cache)
- Automatic background sync (user-initiated only)
- Cross-device cache sharing (each device caches independently)
- Chart annotation/markup in the cached viewer
- PWA install prompt (could layer on later but not required)
