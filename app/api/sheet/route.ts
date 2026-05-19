import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return Response.json({ error: 'Missing ?url= parameter' }, { status: 400 });
  }

  // Extract spreadsheet ID from various Google Sheets URL formats
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    return Response.json({ error: 'Invalid Google Sheets URL' }, { status: 400 });
  }

  const spreadsheetId = match[1];
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`;

  try {
    const res = await fetch(csvUrl);
    if (!res.ok) {
      return Response.json(
        { error: `Failed to fetch sheet (${res.status})` },
        { status: 502 },
      );
    }

    const csv = await res.text();
    const rows = parseCsv(csv);

    if (rows.length < 2) {
      return Response.json({ error: 'Sheet has no data rows' }, { status: 422 });
    }

    const headers = rows[0].map((h) => h.toLowerCase().trim());
    const posIdx = headers.findIndex((h) => h.includes('pos') || h === '#');
    const titleIdx = headers.findIndex((h) => h.includes('title') || h.includes('song'));
    const leadIdx = headers.findIndex((h) => h.includes('lead') || h.includes('singer'));
    const notesIdx = headers.findIndex((h) => h.includes('note'));

    if (titleIdx === -1) {
      return Response.json(
        { error: 'Could not find a "title" or "song" column' },
        { status: 422 },
      );
    }

    const songs = rows.slice(1)
      .filter((row) => row[titleIdx]?.trim())
      .map((row, i) => ({
        position: posIdx !== -1 && row[posIdx]?.trim() ? Number(row[posIdx]) : i + 1,
        title: row[titleIdx]?.trim() ?? '',
        lead: leadIdx !== -1 ? (row[leadIdx]?.trim() ?? '') : '',
        notes: notesIdx !== -1 ? (row[notesIdx]?.trim() ?? '') : '',
      }));

    return Response.json(songs);
  } catch (e) {
    return Response.json(
      { error: `Fetch error: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        current.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        current.push(field);
        field = '';
        rows.push(current);
        current = [];
      } else {
        field += ch;
      }
    }
  }
  if (field || current.length) {
    current.push(field);
    rows.push(current);
  }
  return rows;
}
