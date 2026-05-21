import { stringify, parse } from 'yaml';
import { renumberSetlist } from './setlist';
import type { StageSlot, InputChannel, MonitorMix, GeneralNote, SetlistSong } from './types';

// ─── Internal AppConfig shape (mirrors page.tsx) ─────────────────────────────
// Duplicated here to avoid circular deps; the canonical definition stays in page.tsx.
interface AppConfig {
  showInfo: { bandName: string; eventDate: string; venue: string };
  lineup?: string;
  stagePlot: StageSlot[];
  inputs: InputChannel[];
  monitors: MonitorMix[];
  notes: GeneralNote[];
  setlist: SetlistSong[];
  chartsRootFolderId?: string;
}

// ─── YAML show file schema ───────────────────────────────────────────────────
interface ShowFileV1 {
  format: 'showrunr/v1';
  name: string;
  date?: string;
  venue?: string;
  lineup?: string;
  stagePlot: StageSlot[];
  inputs: InputChannel[];
  monitors: MonitorMix[];
  notes: GeneralNote[];
  setlist: Omit<SetlistSong, 'id' | 'position'>[];
  chartsSource?: { provider: string; folderId: string };
}

// ─── Serialize AppConfig → YAML string ───────────────────────────────────────
export function serializeShow(config: AppConfig): string {
  const doc: ShowFileV1 = {
    format: 'showrunr/v1',
    name: config.showInfo.bandName,
    date: config.showInfo.eventDate || undefined,
    venue: config.showInfo.venue || undefined,
    lineup: config.lineup || undefined,
    stagePlot: config.stagePlot,
    inputs: config.inputs.map(({ id: _id, ...rest }) => rest),
    monitors: config.monitors.map(({ id: _id, ...rest }) => rest),
    notes: config.notes,
    setlist: config.setlist.map(({ id: _id, position: _pos, charts, ...rest }) => {
      // Omit runtime fields (id, position) and empty charts
      const song: Record<string, unknown> = { ...rest };
      if (charts && charts.length > 0) {
        song.charts = charts;
      }
      return song as Omit<SetlistSong, 'id' | 'position'>;
    }),
  };

  if (config.chartsRootFolderId) {
    doc.chartsSource = { provider: 'drive', folderId: config.chartsRootFolderId };
  }

  return stringify(doc, { lineWidth: 0 });
}

// ─── Deserialize file content → AppConfig ────────────────────────────────────
// Accepts both YAML (.yaml/.yml) and JSON (.json) based on filename extension.
export function deserializeShow(content: string, filename: string): AppConfig {
  const isYaml = /\.ya?ml$/i.test(filename);

  if (isYaml) {
    return fromYaml(content);
  }
  return fromJson(content);
}

function fromYaml(content: string): AppConfig {
  const parsed = parse(content);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid YAML — could not parse.');
  }

  validate(parsed);
  const doc = parsed as ShowFileV1;

  const config: AppConfig = {
    showInfo: {
      bandName: doc.name,
      eventDate: doc.date ?? '',
      venue: doc.venue ?? '',
    },
    lineup: doc.lineup,
    stagePlot: doc.stagePlot,
    inputs: doc.inputs,
    monitors: doc.monitors,
    notes: doc.notes,
    setlist: renumberSetlist(
      doc.setlist.map((s) => ({ ...s, position: 0 }) as SetlistSong)
    ),
  };

  if (doc.chartsSource?.folderId) {
    config.chartsRootFolderId = doc.chartsSource.folderId;
  }

  return config;
}

function fromJson(content: string): AppConfig {
  const parsed = JSON.parse(content);

  if (
    !Array.isArray(parsed.stagePlot) ||
    !Array.isArray(parsed.inputs) ||
    !Array.isArray(parsed.setlist) ||
    !Array.isArray(parsed.monitors) ||
    !Array.isArray(parsed.notes) ||
    !parsed.showInfo?.bandName
  ) {
    throw new Error('Invalid show file — missing required sections (stagePlot, inputs, setlist, monitors, notes, showInfo).');
  }

  return parsed as AppConfig;
}

// ─── Validation for YAML files ───────────────────────────────────────────────
function validate(parsed: unknown): asserts parsed is ShowFileV1 {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid show file — could not parse.');
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.name !== 'string' || !obj.name) {
    throw new Error('Invalid show file — missing "name" field.');
  }
  if (!Array.isArray(obj.stagePlot)) {
    throw new Error('Invalid show file — missing "stagePlot" array.');
  }
  if (!Array.isArray(obj.inputs)) {
    throw new Error('Invalid show file — missing "inputs" array.');
  }
  if (!Array.isArray(obj.setlist)) {
    throw new Error('Invalid show file — missing "setlist" array.');
  }
  if (!Array.isArray(obj.monitors)) {
    throw new Error('Invalid show file — missing "monitors" array.');
  }
  if (!Array.isArray(obj.notes)) {
    throw new Error('Invalid show file — missing "notes" array.');
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'show';
}
