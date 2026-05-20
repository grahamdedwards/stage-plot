import { NextRequest } from 'next/server';
import { DriveAuthError, driveQuery, driveQueryAll, normalize } from '@/lib/drive';

// Searches each role subfolder for files fuzzy-matching the song title
// GET /api/drive?folderId=ROOT_FOLDER_ID&songTitle=Song+Name
// Authorization: Bearer <access_token>
export async function GET(request: NextRequest) {
  const accessToken = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) {
    return Response.json({ error: 'Missing access token' }, { status: 401 });
  }

  const folderId = request.nextUrl.searchParams.get('folderId');
  const songTitle = request.nextUrl.searchParams.get('songTitle');
  if (!folderId || !songTitle) {
    return Response.json({ error: 'Missing folderId or songTitle' }, { status: 400 });
  }

  const normalized = normalize(songTitle);

  try {
    const foldersRes = await driveQuery(
      `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      accessToken,
    );

    const charts: { role: string; url: string; label: string; dupeCount: number }[] = [];

    await Promise.all(
      foldersRes.map(async (folder) => {
        const filesRes = await driveQueryAll(
          `'${folder.id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
          accessToken,
          'id, name, webViewLink',
        );

        const matches = filesRes.filter((f) =>
          normalize(f.name).includes(normalized) || normalized.includes(normalize(f.name))
        );

        if (matches.length > 0) {
          const sorted = matches.sort((a, b) => a.name.localeCompare(b.name));
          charts.push({
            role: folder.name,
            url: sorted[0].webViewLink,
            label: sorted[0].name,
            dupeCount: matches.length,
          });
        }
      })
    );

    return Response.json(charts);
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
