import { NextRequest } from 'next/server';

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
    // 1. List all subfolders (role folders) under the root Charts folder
    const foldersRes = await driveQuery(
      `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      accessToken,
    );

    const charts: { role: string; url: string; label: string; dupeCount: number }[] = [];

    // 2. For each role folder, search for files (not folders) matching the normalized title
    await Promise.all(
      foldersRes.map(async (folder: { id: string; name: string }) => {
        const filesRes = await driveQueryAll(
          `'${folder.id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`,
          accessToken,
          'id, name, webViewLink',
        );

        const matches = filesRes.filter((f: { name: string }) =>
          normalize(f.name).includes(normalized) || normalized.includes(normalize(f.name))
        );

        if (matches.length > 0) {
          // Take first match (alphabetical), flag dupes
          const sorted = matches.sort((a: { name: string }, b: { name: string }) =>
            a.name.localeCompare(b.name)
          );
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
    return Response.json(
      { error: `Drive API error: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
}

// Normalize: lowercase, strip punctuation, strip leading articles
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\.[^.]+$/, '')           // strip file extension
    .replace(/[^a-z0-9\s]/g, '')       // strip punctuation
    .replace(/^(the|a|an)\s+/, '')     // strip leading articles
    .replace(/\s+/g, ' ')
    .trim();
}

type DriveFile = { id: string; name: string; webViewLink: string };

async function driveQuery(
  q: string,
  accessToken: string,
  fields = 'id, name, webViewLink',
): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q,
    fields: `files(${fields})`,
    pageSize: '100',
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive query failed (${res.status}): ${text}`);
  }
  const data = await res.json() as { files: DriveFile[] };
  return data.files ?? [];
}

// Paginated version — follows nextPageToken to get all results
async function driveQueryAll(
  q: string,
  accessToken: string,
  fields = 'id, name, webViewLink',
): Promise<DriveFile[]> {
  const all: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q,
      fields: `nextPageToken, files(${fields})`,
      pageSize: '100',
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Drive query failed (${res.status}): ${text}`);
    }
    const data = await res.json() as { files: DriveFile[]; nextPageToken?: string };
    all.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return all;
}
