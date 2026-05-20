import { NextRequest } from 'next/server';
import { DriveAuthError, driveQuery, driveQueryAll, normalize } from '@/lib/drive';
import type { Chart } from '@/lib/types';

interface BatchRequest {
  folderId: string;
  songs: { idx: number; title: string }[];
}

interface BatchResult {
  idx: number;
  charts: Chart[];
}

// Batch-resolves charts for all songs in one pass
// POST /api/drive/batch
// Authorization: Bearer <access_token>
export async function POST(request: NextRequest) {
  const accessToken = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) {
    return Response.json({ error: 'Missing access token' }, { status: 401 });
  }

  let body: BatchRequest;
  try {
    body = await request.json() as BatchRequest;
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.folderId || typeof body.folderId !== 'string') {
    return Response.json({ error: 'Missing or invalid folderId' }, { status: 400 });
  }
  if (!Array.isArray(body.songs) || body.songs.length === 0) {
    return Response.json({ error: 'Missing or empty songs array' }, { status: 400 });
  }
  // Validate and sanitize each song entry
  body.songs = body.songs
    .filter((s): s is { idx: number; title: string } =>
      typeof s?.idx === 'number' && typeof s?.title === 'string'
    )
    .map((s) => ({ idx: s.idx, title: s.title }));
  if (body.songs.length === 0) {
    return Response.json({ error: 'No valid songs in payload' }, { status: 400 });
  }

  try {
    // 1. List all role subfolders
    const folders = await driveQuery(
      `'${body.folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      accessToken,
    );

    // 2. Fetch ALL files from each role folder once (the key optimization)
    const roleLists = await Promise.all(
      folders.map(async (folder) => {
        const files = await driveQueryAll(
          `'${folder.id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
          accessToken,
          'id, name, webViewLink, mimeType, modifiedTime',
        );
        return { role: folder.name, files };
      })
    );

    // 3. For each song, match against all role folders in memory
    const results: BatchResult[] = body.songs.map((song) => {
      const normalized = normalize(song.title);
      if (!normalized) return { idx: song.idx, charts: [] };

      const charts: Chart[] = [];

      for (const { role, files } of roleLists) {
        const matches = files.filter((f) =>
          normalize(f.name).includes(normalized) || normalized.includes(normalize(f.name))
        );

        if (matches.length > 0) {
          const sorted = matches.sort((a, b) => a.name.localeCompare(b.name));
          charts.push({
            role,
            url: sorted[0].webViewLink,
            label: sorted[0].name,
            dupeCount: matches.length,
            fileId: sorted[0].id,
            mimeType: sorted[0].mimeType,
            modifiedTime: sorted[0].modifiedTime,
          });
        }
      }

      return { idx: song.idx, charts };
    });

    return Response.json({ results });
  } catch (e) {
    if (e instanceof DriveAuthError) {
      return Response.json({ error: 'Google session expired — reconnect in Setup' }, { status: 401 });
    }
    return Response.json(
      { error: `Drive API error: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
}
