# Backlog: Song Library Manager

> Status: Backlog (design doc needed before build)

## Problem

Currently zero visibility or management of songs and charts outside individual show files. Users can only create songs inline within a show. No way to browse, search, or manage the account-wide song catalog.

## Requirements

- Account-wide song library with full CRUD: create, edit, and delete songs and charts independent of any show
- Add existing library songs to a show (not just inline creation within a show file)
- Browse all songs across shows — see which have charts attached, which shows reference each song
- Search and filter by title, key, chart status
- Chart management: upload, replace, and delete charts from the library view

## Notes

- Charts are per-song (not per-show), as songs can be reused across shows — the library is the natural home for chart management
- `chart_library` table already exists in Supabase (migration 003) — this feature surfaces it with proper UI
