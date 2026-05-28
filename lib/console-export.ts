import type { InputChannel } from './types';

// ─── CSV Export ──────────────────────────────────────────────────────────────

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const CSV_HEADERS = ['Channel', 'Name', 'Mic', 'Stand', 'Notes'] as const;

export function exportPatchCsv(inputs: InputChannel[]): string {
  const BOM = '\uFEFF';
  const rows = [...inputs]
    .sort((a, b) => a.ch - b.ch)
    .map((input) =>
      [
        String(input.ch),
        escapeCsvField(input.inst),
        escapeCsvField(input.mic),
        escapeCsvField(input.stand),
        escapeCsvField(input.notes ?? ''),
      ].join(',')
    );

  return BOM + [CSV_HEADERS.join(','), ...rows].join('\n');
}

// ─── XML Export ──────────────────────────────────────────────────────────────

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlAttr(name: string, value: string | undefined): string {
  if (!value) return '';
  return ` ${name}="${escapeXmlAttr(value)}"`;
}

interface ShowInfo {
  bandName: string;
  showName?: string;
  eventDate: string;
  venue: string;
}

export function exportPatchXml(inputs: InputChannel[], showInfo: ShowInfo): string {
  const showLabel = showInfo.showName?.trim() || showInfo.bandName;
  const sorted = [...inputs].sort((a, b) => a.ch - b.ch);

  const channels = sorted
    .map(
      (input) =>
        `    <channel number="${input.ch}"${xmlAttr('name', input.inst)}${xmlAttr('mic', input.mic)}${xmlAttr('stand', input.stand)}${xmlAttr('notes', input.notes)} />`
    )
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<showrunr-patch version="1"${xmlAttr('show', showLabel)}${xmlAttr('date', showInfo.eventDate)}${xmlAttr('venue', showInfo.venue)}>`,
    '  <inputs>',
    channels,
    '  </inputs>',
    '</showrunr-patch>',
  ].join('\n');
}
