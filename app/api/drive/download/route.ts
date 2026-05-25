import { NextRequest } from 'next/server';
import { DriveAuthError } from '@/lib/drive';

// Google Workspace MIME types that need export (can't be downloaded directly)
const EXPORT_MIME_TYPES: Record<string, string> = {
  'application/vnd.google-apps.document': 'application/pdf',
  'application/vnd.google-apps.spreadsheet': 'application/pdf',
  'application/vnd.google-apps.presentation': 'application/pdf',
};

// Proxies a Drive file download. Handles Google Docs -> PDF export.
// POST /api/drive/download
// Authorization: Bearer <access_token>
// Body: { fileId: string, mimeType?: string }
export async function POST(request: NextRequest) {
  const accessToken = request.headers.get('authorization')?.replace('Bearer ', '') || null;

  let body: { fileId: string; mimeType?: string };
  try {
    body = await request.json() as { fileId: string; mimeType?: string };
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.fileId || typeof body.fileId !== 'string') {
    return Response.json({ error: 'Missing or invalid fileId' }, { status: 400 });
  }

  try {
    const exportMime = body.mimeType ? EXPORT_MIME_TYPES[body.mimeType] : undefined;

    let url: string;
    if (exportMime) {
      // Google Workspace file — use export endpoint
      url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(body.fileId)}/export?mimeType=${encodeURIComponent(exportMime)}&supportsAllDrives=true`;
    } else {
      // Regular file — direct download
      url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(body.fileId)}?alt=media&supportsAllDrives=true`;
    }

    const headers: Record<string, string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    const res = await fetch(url, { headers });

    // Export too large (>10MB Google limit) — Google returns 403 for oversized exports
    if (res.status === 413 || (res.status === 403 && exportMime)) {
      return Response.json(
        { error: 'export_too_large', fileId: body.fileId },
        { status: 413 },
      );
    }

    if (res.status === 401 || res.status === 403) {
      throw new DriveAuthError();
    }

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      return Response.json(
        { error: `Drive download failed (${res.status}): ${text}` },
        { status: 502 },
      );
    }

    // Stream the file bytes back with appropriate content type
    const contentType = exportMime ?? res.headers.get('content-type') ?? 'application/octet-stream';
    const bytes = await res.arrayBuffer();

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof DriveAuthError) {
      return Response.json({ error: 'Google session expired — reconnect in Setup' }, { status: 401 });
    }
    return Response.json(
      { error: `Download error: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
}
