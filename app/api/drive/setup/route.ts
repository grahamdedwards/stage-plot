import { NextRequest } from 'next/server';

const CANONICAL_FOLDERS = [
  'Lyrics',
  'Guitar',
  'Bass',
  'Piano / Keys',
  'Horns',
  'Drums',
  'Conductor',
  'Other',
];

// Creates canonical role subfolders inside the given parent folder
// GET /api/drive/setup?parentFolderId=FOLDER_ID
// Authorization: Bearer <access_token>
export async function GET(request: NextRequest) {
  const accessToken = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) {
    return Response.json({ error: 'Missing access token' }, { status: 401 });
  }

  const parentFolderId = request.nextUrl.searchParams.get('parentFolderId');
  if (!parentFolderId) {
    return Response.json({ error: 'Missing parentFolderId' }, { status: 400 });
  }

  try {
    // First, list existing subfolders to avoid duplicates
    const existingRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({
        q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        pageSize: '100',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      })}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!existingRes.ok) {
      const text = await existingRes.text();
      const status = existingRes.status === 401 || existingRes.status === 403 ? 401 : 502;
      return Response.json({ error: status === 401 ? 'Google session expired — reconnect in Setup' : `Failed to list folders: ${text}` }, { status });
    }

    const existing = await existingRes.json() as { files: { id: string; name: string }[] };
    const results: { name: string; id: string; created: boolean }[] = [];

    // Reuse existing folders, create missing ones
    for (const name of CANONICAL_FOLDERS) {
      const found = (existing.files ?? []).find((f) => f.name === name);
      if (found) {
        results.push({ name, id: found.id, created: false });
        continue;
      }

      const createRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ supportsAllDrives: 'true' })}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
          }),
        },
      );

      if (!createRes.ok) {
        const text = await createRes.text();
        const status = createRes.status === 401 || createRes.status === 403 ? 401 : 502;
        return Response.json(
          { error: status === 401 ? 'Google session expired — reconnect in Setup' : `Failed to create folder "${name}": ${text}` },
          { status },
        );
      }

      const created = await createRes.json() as { id: string };
      results.push({ name, id: created.id, created: true });
    }

    return Response.json({ folders: results, parentFolderId });
  } catch (e) {
    return Response.json(
      { error: `Drive API error: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
}
