'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  BandConfig,
  StagePosition,
  StageSlot,
  InputChannel,
  MonitorMix,
  SetlistSong,
  GeneralNote,
  Chart,
} from '@/lib/types';
import { ensureSetlistSongIds, moveSetlistSong, ensureInputIds, moveInput, ensureMonitorIds, moveMonitor } from '@/lib/setlist';
import {
  downloadAllCharts,
  getCacheStats,
  clearChartCache,
  registerServiceWorker,
  getCachedChartUrl,
  formatBytes,
  type DownloadProgress,
} from '@/lib/chart-cache';

// ─── Default band (imported at build time, used as fallback) ────────────────
import { getBand } from '@/lib/bands';
const fallbackBand = getBand();

// ─── Config shape stored in localStorage / URL ─────────────────────────────
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

// ─── Google tokens stored separately in localStorage ────────────────────────
const GOOGLE_TOKEN_KEY = 'stageplot-google-token';

interface GoogleToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // epoch ms
}

function getGoogleToken(): GoogleToken | null {
  try {
    const stored = localStorage.getItem(GOOGLE_TOKEN_KEY);
    if (!stored) return null;
    const token = JSON.parse(stored) as GoogleToken;
    if (token.expires_at < Date.now()) return null;
    return token;
  } catch {
    return null;
  }
}

function saveGoogleToken(token: GoogleToken) {
  localStorage.setItem(GOOGLE_TOKEN_KEY, JSON.stringify(token));
}

function clearGoogleToken() {
  localStorage.removeItem(GOOGLE_TOKEN_KEY);
}

function bandToConfig(b: BandConfig): AppConfig {
  return {
    showInfo: { bandName: b.name, eventDate: '', venue: '' },
    lineup: b.lineup,
    stagePlot: b.stagePlot.map((s) => ({ ...s })),
    inputs: b.inputs.map((i) => ({ ...i })),
    monitors: b.monitors.map((m) => ({ ...m })),
    notes: b.notes.map((n) => ({ ...n })),
    setlist: (b.setlist ?? []).map((s) => ({ ...s })),
  };
}

function configToBand(c: AppConfig): BandConfig {
  return {
    slug: 'custom',
    name: c.showInfo.bandName || 'Untitled',
    lineup: c.lineup || `${c.stagePlot.length}-Piece Band`,
    stagePlot: c.stagePlot,
    inputs: c.inputs,
    monitors: c.monitors,
    notes: c.notes,
    setlist: c.setlist,
  };
}

const STORAGE_KEY = 'stageplot-config';
const POSITIONS: StagePosition[] = ['USR', 'USC', 'USL', 'DSR', 'DSC', 'DSL'];

// ─── Singer Colors (shared between tabs) ───────────────────────────────────
const SINGER_COLORS = [
  'bg-blue-100 text-blue-800',
  'bg-purple-100 text-purple-800',
  'bg-green-100 text-green-800',
  'bg-orange-100 text-orange-800',
  'bg-pink-100 text-pink-800',
  'bg-teal-100 text-teal-800',
];

function getSingerColor(name: string, colorMap: Map<string, string>): string {
  if (!colorMap.has(name)) {
    const color = SINGER_COLORS[colorMap.size % SINGER_COLORS.length];
    colorMap.set(name, color);
  }
  return colorMap.get(name)!;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function encodeConfig(c: AppConfig): string {
  return btoa(encodeURIComponent(JSON.stringify(c)));
}

function decodeConfig(s: string): AppConfig | null {
  try {
    return JSON.parse(decodeURIComponent(atob(s)));
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
function withStableIds(config: AppConfig): AppConfig {
  const setlist = ensureSetlistSongIds(config.setlist);
  const inputs = ensureInputIds(config.inputs);
  const monitors = ensureMonitorIds(config.monitors);
  const changed = setlist !== config.setlist || inputs !== config.inputs || monitors !== config.monitors;
  return changed ? { ...config, setlist, inputs, monitors } : config;
}

function initConfig(): AppConfig {
  if (typeof window === 'undefined') return withStableIds(bandToConfig(fallbackBand));
  const params = new URLSearchParams(window.location.search);
  const urlConfig = params.get('config');
  if (urlConfig) {
    const decoded = decodeConfig(urlConfig);
    if (decoded) {
      const cfg = withStableIds(decoded);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
      return cfg;
    }
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try { return withStableIds(JSON.parse(stored)); } catch { /* fall through */ }
  }
  return withStableIds(bandToConfig(fallbackBand));
}

function initGoogleToken(): GoogleToken | null {
  if (typeof window === 'undefined') return null;
  if (window.location.hash.startsWith('#google_auth=')) {
    const fragment = new URLSearchParams(window.location.hash.slice('#google_auth='.length));
    const accessToken = fragment.get('access_token');
    const expiresIn = fragment.get('expires_in');
    if (accessToken && expiresIn) {
      const token: GoogleToken = {
        access_token: accessToken,
        refresh_token: fragment.get('refresh_token') ?? undefined,
        expires_at: Date.now() + Number(expiresIn) * 1000,
      };
      saveGoogleToken(token);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return token;
    }
  }
  return getGoogleToken();
}

export default function Page() {
  const [tab, setTab] = useState<'show' | 'setup'>('show');
  const [config, setConfig] = useState<AppConfig>(initConfig);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [googleToken, setGoogleToken] = useState<GoogleToken | null>(initGoogleToken);
  const [printSections, setPrintSections] = useState({
    stagePlot: true,
    inputList: true,
    monitorMixes: true,
    notes: true,
    setlist: true,
  });
  const [isOffline, setIsOffline] = useState(() =>
    typeof window !== 'undefined' ? !navigator.onLine : false
  );

  // ── Persist to localStorage on change ─────────────────────────────────
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);

  // ── Offline detection ─────────────────────────────────────────────────
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  const updateConfig = useCallback((fn: (prev: AppConfig) => AppConfig) => {
    setConfig((prev) => fn(prev));
  }, []);

  const handleCopyLink = useCallback(() => {
    if (!config) return;
    const encoded = encodeConfig(config);
    const url = `${window.location.origin}${window.location.pathname}?config=${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  }, [config]);

  const band = configToBand(config);

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center">
          <button
            onClick={() => setTab('show')}
            className={`flex-1 py-3 text-center font-bold text-sm uppercase tracking-wide transition-colors ${
              tab === 'show'
                ? 'border-b-2 border-black text-black'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Show
          </button>
          <button
            onClick={() => setTab('setup')}
            className={`flex-1 py-3 text-center font-bold text-sm uppercase tracking-wide transition-colors ${
              tab === 'setup'
                ? 'border-b-2 border-black text-black'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            Setup
          </button>
          {tab === 'show' && (
            <button
              onClick={() => setShowPrintModal(true)}
              className="px-4 py-2 text-xs font-bold bg-white text-black border border-black rounded hover:bg-gray-100 transition-colors whitespace-nowrap print:hidden"
            >
              Print / Save PDF
            </button>
          )}
          <button
            onClick={handleCopyLink}
            className="px-4 py-2 mr-2 text-xs font-bold bg-black text-white rounded hover:bg-gray-800 transition-colors whitespace-nowrap"
          >
            {copyFeedback ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      {tab === 'show' ? (
        <ShowTab band={band} setlist={config.setlist} printSections={printSections} showInfo={config.showInfo} isOffline={isOffline} onReorder={(from, to) => updateConfig((p) => ({ ...p, setlist: moveSetlistSong(p.setlist, from, to) }))} />
      ) : (
        <SetupTab config={config} updateConfig={updateConfig} googleToken={googleToken} onDisconnectGoogle={() => { clearGoogleToken(); setGoogleToken(null); }} />
      )}

      {/* ── Print Modal ─────────────────────────────────────────────── */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 print:hidden">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold mb-4">Print / Save PDF</h3>
            <p className="text-sm text-gray-500 mb-4">Select sections to include:</p>
            <div className="space-y-3">
              {([
                ['stagePlot', 'Stage Plot'],
                ['inputList', 'Input List'],
                ['monitorMixes', 'Monitor Mixes'],
                ['notes', 'Notes'],
                ['setlist', 'Setlist / Run Order'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={printSections[key]}
                    onChange={(e) =>
                      setPrintSections((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium">{label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowPrintModal(false);
                  setTimeout(() => window.print(), 100);
                }}
                className="flex-1 px-4 py-2 text-sm font-bold bg-black text-white rounded hover:bg-gray-800 transition-colors"
              >
                Print
              </button>
              <button
                onClick={() => setShowPrintModal(false)}
                className="flex-1 px-4 py-2 text-sm font-bold bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors border border-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SHOW TAB — existing rider view
// ════════════════════════════════════════════════════════════════════════════

function StagePlotView({ band }: { band: BandConfig }) {
  const slotMap = Object.fromEntries(band.stagePlot.map((s) => [s.pos, s]));

  return (
    <div className="bg-white border-4 border-gray-200 rounded-xl shadow-inner overflow-hidden">
      <div className="flex justify-between px-3 pt-2 pb-1">
        <span className="text-[10px] font-bold text-gray-400">USR</span>
        <span className="text-[10px] font-bold text-gray-500 tracking-widest">UPSTAGE</span>
        <span className="text-[10px] font-bold text-gray-400">USL</span>
      </div>
      <div className="grid grid-cols-3 gap-2 px-3 pb-2">
        {(['USR', 'USC', 'USL'] as StagePosition[]).map((pos) => {
          const slot = slotMap[pos];
          return (
            <div key={pos} className="flex flex-col items-center border-2 border-dashed border-blue-100 bg-blue-50/30 rounded-lg p-2 text-center gap-0.5">
              {slot ? (
                <>
                  <p className="font-bold text-sm leading-tight uppercase">{slot.name}</p>
                  <p className="text-[11px] text-gray-600 leading-tight">{slot.role}</p>
                  <p className="text-[10px] text-gray-400">Mix {slot.mix}</p>
                </>
              ) : (
                <p className="text-[10px] text-gray-300 italic">empty</p>
              )}
              <div className="h-5 flex items-center justify-center">
                {slot?.power && (
                  <span className="px-1.5 py-0.5 bg-yellow-400 text-[9px] font-bold rounded">POWER</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mx-3 border-t-2 border-dashed border-gray-300 my-1" />
      <div className="grid grid-cols-3 gap-2 px-3 pt-2 pb-2">
        {(['DSR', 'DSC', 'DSL'] as StagePosition[]).map((pos) => {
          const slot = slotMap[pos];
          const isFeatured = slot?.featured;
          return (
            <div
              key={pos}
              className={`flex flex-col items-center rounded-lg p-2 text-center gap-0.5 border-2 ${
                isFeatured
                  ? 'border-black bg-gray-900 text-white shadow-lg'
                  : 'border-dashed border-blue-100 bg-blue-50/30'
              }`}
            >
              {slot ? (
                <>
                  <p className="font-bold text-sm leading-tight uppercase">{slot.name}</p>
                  <p className={`text-[11px] leading-tight ${isFeatured ? 'opacity-80' : 'text-gray-600'}`}>{slot.role}</p>
                  <p className={`text-[10px] ${isFeatured ? 'opacity-60' : 'text-gray-400'}`}>Mix {slot.mix}</p>
                </>
              ) : (
                <p className="text-[10px] text-gray-300 italic">empty</p>
              )}
              <div className="h-5 flex items-center justify-center">
                {slot?.power && (
                  <span className="px-1.5 py-0.5 bg-yellow-400 text-[9px] font-bold rounded text-black">POWER</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between px-3 pb-2 pt-1">
        <span className="text-[10px] font-bold text-gray-400">DSR</span>
        <span className="text-[10px] font-bold text-gray-500 tracking-widest">AUDIENCE / FOH</span>
        <span className="text-[10px] font-bold text-gray-400">DSL</span>
      </div>
    </div>
  );
}

function ShowTab({ band, setlist, printSections, showInfo, isOffline, onReorder }: { band: BandConfig; setlist: SetlistSong[]; printSections: Record<string, boolean>; showInfo: { bandName: string; eventDate: string; venue: string }; isOffline: boolean; onReorder: (from: number, to: number) => void }) {
  const colorMap = new Map<string, string>();
  if (band.setlist?.length) {
    band.setlist.forEach((s) => {
      s.lead.split('+').map((n) => n.trim()).forEach((n) => getSingerColor(n, colorMap));
    });
  }
  const legend = Array.from(colorMap.entries());

  // Navigator state
  const [navigatorSongIdx, setNavigatorSongIdx] = useState<number | null>(null);
  const [roleFilter, setRoleFilter] = useState<string>(() => {
    if (typeof window === 'undefined') return 'all';
    return sessionStorage.getItem('stageplot-role-filter') ?? 'all';
  });
  const handleRoleChange = useCallback((role: string) => {
    setRoleFilter(role);
    sessionStorage.setItem('stageplot-role-filter', role);
  }, []);

  // Reorder mode
  const [reorderMode, setReorderMode] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );
  const songIds = setlist.map((s) => s.id!);
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = songIds.indexOf(active.id as string);
    const to = songIds.indexOf(over.id as string);
    if (from !== -1 && to !== -1) onReorder(from, to);
  }, [songIds, onReorder]);

  // Show chart column if any song has charts (resolved) — column stays visible even
  // if zero matches so users see the gray "none" state and can still open navigator
  const showChartsColumn = band.setlist?.some((s) => s.charts !== undefined) ?? false;

  // Collect all unique roles across all songs for filter dropdown
  const allRoles = Array.from(new Set(
    (band.setlist ?? []).flatMap((s) => (s.charts ?? []).map((c) => c.role))
  )).sort();

  // Reset stale filter if the persisted role no longer exists in current charts
  const effectiveRoleFilter = roleFilter === 'all' || allRoles.includes(roleFilter) ? roleFilter : 'all';

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-12">
        <header className="text-center border-b pb-8">
          <h1 className="text-4xl font-black tracking-tight uppercase">{band.name}</h1>
          <p className="text-lg font-semibold text-gray-700 mt-1">
            {showInfo.venue && showInfo.eventDate
              ? `${showInfo.venue} · ${showInfo.eventDate}`
              : showInfo.venue || showInfo.eventDate || 'Set venue & date in Setup'}
          </p>
          <p className="text-sm text-gray-400 mt-1 uppercase tracking-wide">{band.lineup}</p>
        </header>

        <section className={printSections.stagePlot ? '' : 'no-print'}>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span className="w-8 h-8 bg-black text-white flex items-center justify-center rounded text-sm">1</span>
            Stage Plot
          </h2>
          <StagePlotView band={band} />
        </section>

        <section className={printSections.inputList ? '' : 'no-print'}>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span className="w-8 h-8 bg-black text-white flex items-center justify-center rounded text-sm">2</span>
            Input List
          </h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 font-bold w-12">Ch</th>
                  <th className="px-4 py-3 font-bold">Source</th>
                  <th className="px-4 py-3 font-bold">Mic/DI</th>
                  <th className="px-4 py-3 font-bold">Stand</th>
                  <th className="px-4 py-3 font-bold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {band.inputs.map((i) => (
                  <tr key={i.ch} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono">{i.ch}</td>
                    <td className="px-4 py-2 font-bold">{i.inst}</td>
                    <td className="px-4 py-2 text-gray-600">{i.mic}</td>
                    <td className="px-4 py-2 text-gray-600">{i.stand}</td>
                    <td className="px-4 py-2 italic text-gray-500">{i.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`grid md:grid-cols-2 gap-8 ${!printSections.monitorMixes && !printSections.notes ? 'no-print' : ''}`}>
          <div className={printSections.monitorMixes ? '' : 'no-print'}>
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="w-8 h-8 bg-black text-white flex items-center justify-center rounded text-sm">3</span>
              Monitor Mixes
            </h2>
            <div className="space-y-4">
              {band.monitors.map((m) => (
                <div key={m.mix} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                  <h3 className="font-bold flex items-center gap-2">
                    <span className="text-blue-600">Mix {m.mix}:</span> {m.name}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">{m.needs}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={printSections.notes ? '' : 'no-print'}>
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="w-8 h-8 bg-black text-white flex items-center justify-center rounded text-sm">4</span>
              Notes
            </h2>
            <ul className="space-y-3 text-sm text-gray-700 bg-yellow-50 p-6 rounded-xl border border-yellow-200">
              {band.notes.map((n) => (
                <li key={n.label}><strong>{n.label}:</strong> {n.text}</li>
              ))}
            </ul>
          </div>
        </section>

        {band.setlist && band.setlist.length > 0 && (
          <section className={printSections.setlist ? '' : 'no-print'}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <span className="w-8 h-8 bg-black text-white flex items-center justify-center rounded text-sm">5</span>
                Run Order / Setlist
              </h2>
              <div className="flex items-center gap-2 print:hidden">
                {allRoles.length > 0 && (
                  <select
                    value={effectiveRoleFilter}
                    onChange={(e) => handleRoleChange(e.target.value)}
                    className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white"
                  >
                    <option value="all">All Parts</option>
                    {allRoles.map((r) => <option key={r} value={r}>My Charts: {r}</option>)}
                  </select>
                )}
                <button
                  onClick={() => setReorderMode(!reorderMode)}
                  className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                    reorderMode
                      ? 'bg-black text-white hover:bg-gray-800'
                      : 'bg-gray-100 border border-gray-300 hover:bg-gray-200'
                  }`}
                >
                  {reorderMode ? 'Done' : 'Reorder'}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {legend.map(([name, color]) => (
                <span key={name} className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>{name}</span>
              ))}
              {effectiveRoleFilter !== 'all' && (
                <span className="ml-auto text-xs text-gray-500 print:hidden">
                  {(band.setlist ?? []).filter((s) => (s.charts ?? []).some((c) => c.role === effectiveRoleFilter)).length} of {band.setlist?.length ?? 0} songs have {effectiveRoleFilter} charts
                </span>
              )}
            </div>
            {reorderMode ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={songIds} strategy={verticalListSortingStrategy}>
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="w-8 print:hidden"></th>
                          <th className="px-4 py-3 font-bold w-10">#</th>
                          <th className="px-4 py-3 font-bold">Song</th>
                          <th className="px-4 py-3 font-bold">Lead</th>
                          <th className="px-4 py-3 font-bold hidden sm:table-cell">Notes</th>
                          {showChartsColumn && <th className="px-4 py-3 font-bold w-12">Charts</th>}
                          <th className="w-12 print:hidden"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {band.setlist.map((song, idx) => (
                          <ShowSortableRow
                            key={song.id!}
                            song={song}
                            idx={idx}
                            total={band.setlist?.length ?? 0}
                            showChartsColumn={showChartsColumn}
                            colorMap={colorMap}
                            onNavigate={setNavigatorSongIdx}
                            onMoveUp={() => onReorder(idx, idx - 1)}
                            onMoveDown={() => onReorder(idx, idx + 1)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 font-bold w-10">#</th>
                    <th className="px-4 py-3 font-bold">Song</th>
                    <th className="px-4 py-3 font-bold">Lead</th>
                    <th className="px-4 py-3 font-bold hidden sm:table-cell">Notes</th>
                    {showChartsColumn && <th className="px-4 py-3 font-bold w-12">Charts</th>}
                  </tr>
                </thead>
                  <tbody className="divide-y">
                    {band.setlist.map((song, idx) => {
                      const singers = song.lead.split('+').map((n) => n.trim());
                      const songCharts = song.charts ?? [];
                      const hasDupes = songCharts.some((c) => (c.dupeCount ?? 0) > 1);
                      const hasRoleChart = effectiveRoleFilter === 'all' || songCharts.some((c) => c.role === effectiveRoleFilter);
                      return (
                        <tr key={song.id ?? song.position} className={`hover:bg-gray-50 transition-opacity ${hasRoleChart ? '' : 'opacity-30'}`}>
                          <td className="px-4 py-2 font-mono text-gray-400">{song.position}</td>
                          <td className="px-4 py-2 font-medium">
                            {song.title}
                            {song.sceneNote && (
                              <span className="ml-2 text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-semibold">
                                {song.sceneNote}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex flex-wrap gap-1">
                              {singers.map((singer) => (
                                <span key={singer} className={`px-1.5 py-0.5 rounded text-xs font-semibold ${getSingerColor(singer, colorMap)}`}>
                                  {singer}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-gray-500 italic text-xs hidden sm:table-cell">
                            {song.notes}
                          </td>
                          {showChartsColumn && (
                            <td className="px-4 py-2">
                              <button
                                onClick={() => setNavigatorSongIdx(idx)}
                                className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
                                  songCharts.length > 0
                                    ? hasDupes
                                      ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                    : 'text-gray-200 hover:text-gray-400 hover:bg-gray-100'
                                }`}
                                title={songCharts.length > 0 ? `${songCharts.length} chart${songCharts.length > 1 ? 's' : ''}` : 'No charts'}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                                </svg>
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
              </table>
              </div>
            )}

            {/* Chart Navigator Overlay */}
            {navigatorSongIdx !== null && band.setlist[navigatorSongIdx] && (
              <ChartNavigator
                setlist={band.setlist}
                currentIdx={navigatorSongIdx}
                roleFilter={effectiveRoleFilter}
                allRoles={allRoles}
                isOffline={isOffline}
                onChangeIdx={setNavigatorSongIdx}
                onChangeRole={handleRoleChange}
                onClose={() => setNavigatorSongIdx(null)}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CHART NAVIGATOR — full-screen overlay for showtime chart browsing
// ════════════════════════════════════════════════════════════════════════════

const ROLE_COLORS: Record<string, string> = {
  'Lyrics': 'bg-purple-100 text-purple-800',
  'Guitar': 'bg-red-100 text-red-800',
  'Bass': 'bg-green-100 text-green-800',
  'Piano / Keys': 'bg-blue-100 text-blue-800',
  'Horns': 'bg-yellow-100 text-yellow-800',
  'Drums': 'bg-orange-100 text-orange-800',
  'Conductor': 'bg-gray-100 text-gray-800',
  'Other': 'bg-gray-100 text-gray-600',
};

function ChartNavigator({
  setlist, currentIdx, roleFilter, allRoles, isOffline, onChangeIdx, onChangeRole, onClose,
}: {
  setlist: SetlistSong[];
  currentIdx: number;
  roleFilter: string;
  allRoles: string[];
  isOffline: boolean;
  onChangeIdx: (idx: number) => void;
  onChangeRole: (role: string) => void;
  onClose: () => void;
}) {
  const song = setlist[currentIdx];
  const charts = (song?.charts ?? []).filter(
    (c) => roleFilter === 'all' || c.role === roleFilter
  );

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && currentIdx > 0) onChangeIdx(currentIdx - 1);
      if (e.key === 'ArrowRight' && currentIdx < setlist.length - 1) onChangeIdx(currentIdx + 1);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentIdx, setlist.length, onChangeIdx, onClose]);

  // Touch swipe
  useEffect(() => {
    let startX = 0;
    const onStart = (e: TouchEvent) => { startX = e.touches[0].clientX; };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 60) {
        if (dx < 0 && currentIdx < setlist.length - 1) onChangeIdx(currentIdx + 1);
        if (dx > 0 && currentIdx > 0) onChangeIdx(currentIdx - 1);
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [currentIdx, setlist.length, onChangeIdx]);

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <button onClick={onClose} className="text-sm font-bold text-gray-600 hover:text-black">
          &larr; Back to Setlist
        </button>
        <div className="flex items-center gap-2">
          {isOffline && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded">
              OFFLINE
            </span>
          )}
          <select
            value={roleFilter}
            onChange={(e) => onChangeRole(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
          >
            <option value="all">All Roles</option>
            {allRoles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {/* Song info */}
      <div className="px-4 pt-4 pb-2 text-center">
        <p className="text-xs text-gray-400 uppercase">Song {currentIdx + 1} of {setlist.length}</p>
        <h2 className="text-xl font-bold mt-1">{song.title}</h2>
        {song.lead && <p className="text-sm text-gray-500 mt-0.5">{song.lead}</p>}
      </div>

      {/* Charts list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {charts.length > 0 ? (
          <div className="space-y-2 max-w-lg mx-auto">
            {charts.map((chart) => (
              <ChartLink key={`${chart.role}-${chart.url}`} chart={chart} isOffline={isOffline} />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm italic">
            {roleFilter !== 'all'
              ? `No ${roleFilter} chart for this song`
              : 'No charts for this song'}
          </div>
        )}
      </div>

      {/* Prev / Next */}
      <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
        <button
          onClick={() => onChangeIdx(currentIdx - 1)}
          disabled={currentIdx === 0}
          className="px-4 py-2 text-sm font-bold rounded bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          &larr; Prev
        </button>
        <button
          onClick={() => onChangeIdx(currentIdx + 1)}
          disabled={currentIdx >= setlist.length - 1}
          className="px-4 py-2 text-sm font-bold rounded bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next &rarr;
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CHART LINK — resolves cached URL or falls back to Drive URL
// ════════════════════════════════════════════════════════════════════════════

function ChartLink({ chart, isOffline }: { chart: Chart; isOffline: boolean }) {
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCachedChartUrl(chart).then((url) => {
      if (!cancelled) {
        // Revoke previous blob URL before setting new one
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = url;
        setCachedUrl(url);
        setChecked(true);
      } else if (url) {
        URL.revokeObjectURL(url);
      }
    }).catch(() => {
      if (!cancelled) setChecked(true);
    });
    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [chart.fileId, chart.modifiedTime]); // eslint-disable-line react-hooks/exhaustive-deps

  const color = ROLE_COLORS[chart.role] ?? 'bg-gray-100 text-gray-700';
  const href = cachedUrl ?? chart.url;
  const unavailable = isOffline && !cachedUrl && checked;

  if (unavailable) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50 opacity-60">
        <span className={`px-2 py-1 rounded text-xs font-bold shrink-0 ${color}`}>
          {chart.role}
        </span>
        <span className="text-sm text-gray-500 truncate flex-1">{chart.label ?? chart.role}</span>
        <span className="px-2 py-0.5 bg-gray-200 text-gray-500 text-[10px] font-bold rounded shrink-0">
          online only
        </span>
      </div>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
    >
      <span className={`px-2 py-1 rounded text-xs font-bold shrink-0 ${color}`}>
        {chart.role}
      </span>
      <span className="text-sm text-gray-800 truncate flex-1">{chart.label ?? chart.role}</span>
      {cachedUrl && (
        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded shrink-0">
          cached
        </span>
      )}
      {(chart.dupeCount ?? 0) > 1 && (
        <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-bold rounded shrink-0">
          {chart.dupeCount} found
        </span>
      )}
      <span className="text-gray-400 text-sm shrink-0">&rarr;</span>
    </a>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SETUP TAB
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// SHOW SORTABLE ROW (used in Show tab reorder mode)
// ════════════════════════════════════════════════════════════════════════════

function ShowSortableRow({
  song, idx, total, showChartsColumn, colorMap, onNavigate, onMoveUp, onMoveDown,
}: {
  song: SetlistSong;
  idx: number;
  total: number;
  showChartsColumn: boolean;
  colorMap: Map<string, string>;
  onNavigate: (idx: number) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: song.id! });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const singers = song.lead.split('+').map((n) => n.trim());
  const songCharts = song.charts ?? [];
  const hasDupes = songCharts.some((c) => (c.dupeCount ?? 0) > 1);

  return (
    <tr ref={setNodeRef} style={style} className="hover:bg-gray-50">
      <td className="px-2 py-2 cursor-grab print:hidden" {...attributes} {...listeners}>
        <span className="text-gray-300 text-sm select-none">&#x2630;</span>
      </td>
      <td className="px-4 py-2 font-mono text-gray-400">{song.position}</td>
      <td className="px-4 py-2 font-medium">
        {song.title}
        {song.sceneNote && (
          <span className="ml-2 text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-semibold">
            {song.sceneNote}
          </span>
        )}
      </td>
      <td className="px-4 py-2">
        <div className="flex flex-wrap gap-1">
          {singers.map((singer) => (
            <span key={singer} className={`px-1.5 py-0.5 rounded text-xs font-semibold ${getSingerColor(singer, colorMap)}`}>
              {singer}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-2 text-gray-500 italic text-xs hidden sm:table-cell">
        {song.notes}
      </td>
      {showChartsColumn && (
        <td className="px-4 py-2">
          <button
            onClick={() => onNavigate(idx)}
            className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
              songCharts.length > 0
                ? hasDupes ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                : 'text-gray-200'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
            </svg>
          </button>
        </td>
      )}
      <td className="px-2 py-2 print:hidden">
        <div className="flex flex-col items-center">
          <button className="px-1 py-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed" disabled={idx === 0} onClick={onMoveUp}>&uarr;</button>
          <button className="px-1 py-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed" disabled={idx === total - 1} onClick={onMoveDown}>&darr;</button>
        </div>
      </td>
    </tr>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SORTABLE SETLIST TABLE (shared DnD logic for Setup tab)
// ════════════════════════════════════════════════════════════════════════════

function SetupSetlistTable({
  setlist, canResolveCharts, onReorder, onUpdate, onDelete, onAdd,
}: {
  setlist: SetlistSong[];
  canResolveCharts: boolean;
  onReorder: (from: number, to: number) => void;
  onUpdate: (idx: number, field: string, value: string) => void;
  onDelete: (idx: number) => void;
  onAdd: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const songIds = setlist.map((s) => s.id!);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = songIds.indexOf(active.id as string);
    const to = songIds.indexOf(over.id as string);
    if (from !== -1 && to !== -1) onReorder(from, to);
  };

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={songIds} strategy={verticalListSortingStrategy}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="w-8"></th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500 w-10">#</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500 min-w-[160px]">Title</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500 min-w-[100px]">Lead</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500">Notes</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500 w-24">Scene Note</th>
                  <th className="w-16"></th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {setlist.map((song, idx) => (
                  <SetupSortableRow
                    key={song.id!}
                    song={song}
                    idx={idx}
                    total={setlist.length}
                    canResolveCharts={canResolveCharts}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onMoveUp={() => onReorder(idx, idx - 1)}
                    onMoveDown={() => onReorder(idx, idx + 1)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </SortableContext>
      </DndContext>
      <button
        className="px-3 py-1.5 text-xs font-bold bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 transition-colors mt-3"
        onClick={onAdd}
      >
        + Add Song
      </button>
    </>
  );
}

const inputCls = 'w-full px-2 py-2.5 sm:py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black bg-white';
const arrowBtn = 'px-1 py-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed';

function SetupSortableRow({
  song, idx, total, canResolveCharts, onUpdate, onDelete, onMoveUp, onMoveDown,
}: {
  song: SetlistSong;
  idx: number;
  total: number;
  canResolveCharts: boolean;
  onUpdate: (idx: number, field: string, value: string) => void;
  onDelete: (idx: number) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: song.id! });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const hasSongCharts = (song.charts?.length ?? 0) > 0;
  const hasSongDupes = song.charts?.some((c) => (c.dupeCount ?? 0) > 1) ?? false;

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-gray-100">
      <td className="px-1 py-1 cursor-grab" {...attributes} {...listeners}>
        <span className="text-gray-300 text-sm select-none">&#x2630;</span>
      </td>
      <td className="px-2 py-1 relative">
        {canResolveCharts && (
          <span className={`absolute top-1 left-0.5 w-1.5 h-1.5 rounded-full ${
            hasSongDupes ? 'bg-orange-400' : hasSongCharts ? 'bg-green-400' : 'bg-gray-300'
          }`} />
        )}
        <span className="text-xs font-mono text-gray-400">{song.position}</span>
      </td>
      <td className="px-2 py-1">
        <input className={inputCls} value={song.title} onChange={(e) => onUpdate(idx, 'title', e.target.value)} />
      </td>
      <td className="px-2 py-1">
        <input className={inputCls} value={song.lead} onChange={(e) => onUpdate(idx, 'lead', e.target.value)} />
      </td>
      <td className="px-2 py-1">
        <input className={inputCls} value={song.notes ?? ''} onChange={(e) => onUpdate(idx, 'notes', e.target.value)} />
      </td>
      <td className="px-2 py-1">
        <input className={inputCls} value={song.sceneNote ?? ''} onChange={(e) => onUpdate(idx, 'sceneNote', e.target.value)} />
      </td>
      <td className="px-1 py-1">
        <div className="flex flex-col items-center">
          <button className={arrowBtn} disabled={idx === 0} onClick={onMoveUp} title="Move up">&uarr;</button>
          <button className={arrowBtn} disabled={idx === total - 1} onClick={onMoveDown} title="Move down">&darr;</button>
        </div>
      </td>
      <td className="px-2 py-1">
        <button className="px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors" onClick={() => onDelete(idx)}>X</button>
      </td>
    </tr>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SORTABLE INPUT TABLE (Setup tab)
// ════════════════════════════════════════════════════════════════════════════

function SetupInputTable({
  inputs, onReorder, onUpdate, onDelete, onAdd,
}: {
  inputs: import('@/lib/types').InputChannel[];
  onReorder: (from: number, to: number) => void;
  onUpdate: (idx: number, field: string, value: string) => void;
  onDelete: (idx: number) => void;
  onAdd: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );
  const inputIds = inputs.map((inp) => inp.id!);
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = inputIds.indexOf(active.id as string);
    const to = inputIds.indexOf(over.id as string);
    if (from !== -1 && to !== -1) onReorder(from, to);
  };

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={inputIds} strategy={verticalListSortingStrategy}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="w-8"></th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500 w-14">Ch</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500 min-w-[140px]">Instrument</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500 min-w-[100px]">Mic/DI</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500">Stand</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500">Notes</th>
                  <th className="w-16"></th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {inputs.map((inp, idx) => (
                  <SortableInputRow
                    key={inp.id!}
                    input={inp}
                    idx={idx}
                    total={inputs.length}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    onMoveUp={() => onReorder(idx, idx - 1)}
                    onMoveDown={() => onReorder(idx, idx + 1)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </SortableContext>
      </DndContext>
      <button className={`${btnAdd} mt-3`} onClick={onAdd}>+ Add Row</button>
    </>
  );
}

function SortableInputRow({
  input: inp, idx, total, onUpdate, onDelete, onMoveUp, onMoveDown,
}: {
  input: import('@/lib/types').InputChannel;
  idx: number;
  total: number;
  onUpdate: (idx: number, field: string, value: string) => void;
  onDelete: (idx: number) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: inp.id! });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <tr ref={setNodeRef} style={style} className="border-b border-gray-100">
      <td className="px-1 py-1 cursor-grab" {...attributes} {...listeners}>
        <span className="text-gray-300 text-sm select-none">&#x2630;</span>
      </td>
      <td className="px-2 py-1">
        <span className="text-xs font-mono text-gray-400">{inp.ch}</span>
      </td>
      <td className="px-2 py-1">
        <input className={inputCls} value={inp.inst} onChange={(e) => onUpdate(idx, 'inst', e.target.value)} />
      </td>
      <td className="px-2 py-1">
        <input className={inputCls} value={inp.mic} onChange={(e) => onUpdate(idx, 'mic', e.target.value)} />
      </td>
      <td className="px-2 py-1">
        <input className={inputCls} value={inp.stand} onChange={(e) => onUpdate(idx, 'stand', e.target.value)} />
      </td>
      <td className="px-2 py-1">
        <input className={inputCls} value={inp.notes ?? ''} onChange={(e) => onUpdate(idx, 'notes', e.target.value)} />
      </td>
      <td className="px-1 py-1">
        <div className="flex flex-col items-center">
          <button className={arrowBtn} disabled={idx === 0} onClick={onMoveUp} title="Move up">&uarr;</button>
          <button className={arrowBtn} disabled={idx === total - 1} onClick={onMoveDown} title="Move down">&darr;</button>
        </div>
      </td>
      <td className="px-2 py-1">
        <button className="px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors" onClick={() => onDelete(idx)}>X</button>
      </td>
    </tr>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SORTABLE MONITOR TABLE (Setup tab)
// ════════════════════════════════════════════════════════════════════════════

function SetupMonitorTable({
  monitors, onReorder, onUpdate, onDelete, onAdd,
}: {
  monitors: import('@/lib/types').MonitorMix[];
  onReorder: (from: number, to: number) => void;
  onUpdate: (idx: number, field: string, value: string) => void;
  onDelete: (idx: number) => void;
  onAdd: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );
  const monitorIds = monitors.map((mon) => mon.id!);
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = monitorIds.indexOf(active.id as string);
    const to = monitorIds.indexOf(over.id as string);
    if (from !== -1 && to !== -1) onReorder(from, to);
  };

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={monitorIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {monitors.map((mon, idx) => (
              <SortableMonitorRow
                key={mon.id!}
                monitor={mon}
                idx={idx}
                total={monitors.length}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onMoveUp={() => onReorder(idx, idx - 1)}
                onMoveDown={() => onReorder(idx, idx + 1)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button className={`${btnAdd} mt-3`} onClick={onAdd}>+ Add Mix</button>
    </>
  );
}

function SortableMonitorRow({
  monitor: mon, idx, total, onUpdate, onDelete, onMoveUp, onMoveDown,
}: {
  monitor: import('@/lib/types').MonitorMix;
  idx: number;
  total: number;
  onUpdate: (idx: number, field: string, value: string) => void;
  onDelete: (idx: number) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: mon.id! });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center border-b border-gray-100 pb-3">
      <div className="cursor-grab shrink-0 pt-5 sm:pt-0 self-center" {...attributes} {...listeners}>
        <span className="text-gray-300 text-sm select-none">&#x2630;</span>
      </div>
      <div className="w-16 shrink-0">
        <label className={labelCls}>Mix #</label>
        <span className="text-sm font-mono text-gray-500">{mon.mix}</span>
      </div>
      <div className="flex-1">
        <label className={labelCls}>Name</label>
        <input className={inputCls} value={mon.name} onChange={(e) => onUpdate(idx, 'name', e.target.value)} />
      </div>
      <div className="flex-[2]">
        <label className={labelCls}>Needs</label>
        <input className={inputCls} value={mon.needs} onChange={(e) => onUpdate(idx, 'needs', e.target.value)} />
      </div>
      <div className="pt-5 flex items-center gap-1">
        <div className="flex flex-col items-center">
          <button className={arrowBtn} disabled={idx === 0} onClick={onMoveUp} title="Move up">&uarr;</button>
          <button className={arrowBtn} disabled={idx === total - 1} onClick={onMoveDown} title="Move down">&darr;</button>
        </div>
        <button className={btnRemove} onClick={() => onDelete(idx)}>X</button>
      </div>
    </div>
  );
}

const labelCls = 'block text-xs font-bold text-gray-500 uppercase mb-1';
const sectionCls = 'bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6';
const btnAdd = 'px-3 py-1.5 text-xs font-bold bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 transition-colors';
const btnRemove = 'px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors';

function SetupTab({
  config,
  updateConfig,
  googleToken,
  onDisconnectGoogle,
}: {
  config: AppConfig;
  updateConfig: (fn: (prev: AppConfig) => AppConfig) => void;
  googleToken: GoogleToken | null;
  onDisconnectGoogle: () => void;
}) {
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [driveSetupLoading, setDriveSetupLoading] = useState(false);
  const [driveError, setDriveError] = useState('');
  const [folderIdInput, setFolderIdInput] = useState(config.chartsRootFolderId ?? '');
  const [chartsResolving, setChartsResolving] = useState(false);
  const [chartsError, setChartsError] = useState('');

  // Count songs with resolved charts
  const chartsMatchCount = config.setlist.filter((s) => s.charts && s.charts.length > 0).length;
  const canResolveCharts = !!googleToken && !!config.chartsRootFolderId && config.setlist.length > 0;

  // Version guard: prevents out-of-order batch responses from overwriting newer data
  const resolveVersionRef = useRef(0);

  const resolveCharts = useCallback(async () => {
    if (!googleToken || !config.chartsRootFolderId || config.setlist.length === 0) return;
    const version = ++resolveVersionRef.current;
    setChartsResolving(true);
    setChartsError('');
    try {
      const res = await fetch('/api/drive/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${googleToken.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderId: config.chartsRootFolderId,
          songs: config.setlist.map((s, idx) => ({ idx, title: s.title })),
        }),
      });
      // Discard if a newer resolve was started while this one was in flight
      if (version !== resolveVersionRef.current) return;
      if (res.status === 401) {
        setChartsError('Google session expired — reconnect Drive');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        setChartsError(data.error ?? `Error (${res.status})`);
        return;
      }
      const data = await res.json() as { results: { idx: number; charts: Chart[] }[] };
      if (version !== resolveVersionRef.current) return;
      updateConfig((p) => {
        const newSetlist = [...p.setlist];
        for (const r of data.results) {
          if (newSetlist[r.idx]) {
            newSetlist[r.idx] = { ...newSetlist[r.idx], charts: r.charts };
          }
        }
        return { ...p, setlist: newSetlist };
      });
    } catch {
      if (version === resolveVersionRef.current) {
        setChartsError('Network error resolving charts');
      }
    } finally {
      if (version === resolveVersionRef.current) {
        setChartsResolving(false);
      }
    }
  }, [googleToken, config.chartsRootFolderId, config.setlist, updateConfig]);

  // Auto-resolve charts when setlist titles or folder ID change (debounced 1s)
  const resolveSignature = `${config.chartsRootFolderId ?? ''}\n${config.setlist.map((s) => s.title).join('\0')}`;
  const prevSignatureRef = useRef(resolveSignature);
  const resolveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear charts and invalidate in-flight requests when Drive is disconnected
    if (!config.chartsRootFolderId) {
      resolveVersionRef.current++;
      const hasCharts = config.setlist.some((s) => s.charts);
      if (hasCharts) {
        updateConfig((p) => ({
          ...p,
          setlist: p.setlist.map((s) => ({ ...s, charts: undefined })),
        }));
      }
      prevSignatureRef.current = resolveSignature;
      return;
    }

    if (!canResolveCharts) return;
    if (resolveSignature === prevSignatureRef.current) return;
    prevSignatureRef.current = resolveSignature;

    // Invalidate any in-flight request from the previous signature
    resolveVersionRef.current++;
    if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
    resolveTimerRef.current = setTimeout(() => {
      resolveCharts();
    }, 1000);

    return () => { if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current); };
  }, [resolveSignature, canResolveCharts, resolveCharts, config.chartsRootFolderId, config.setlist, updateConfig]);

  // Extract folder ID from URL or bare ID
  const parseFolderId = (input: string): string | null => {
    const trimmed = input.trim();
    // Match /folders/FOLDER_ID or /d/FOLDER_ID patterns in Drive URLs
    const urlMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (urlMatch) return urlMatch[1];
    const dMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (dMatch) return dMatch[1];
    // Bare ID (no slashes, reasonable length)
    if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
    return null;
  };

  const handleSetupDrive = async () => {
    if (!googleToken || !folderIdInput.trim()) return;
    const folderId = parseFolderId(folderIdInput);
    if (!folderId) {
      setDriveError('Invalid folder URL or ID. Paste a Google Drive folder link or its ID.');
      return;
    }
    setDriveSetupLoading(true);
    setDriveError('');
    try {
      const res = await fetch(
        `/api/drive/setup?parentFolderId=${encodeURIComponent(folderId)}`,
        { headers: { Authorization: `Bearer ${googleToken.access_token}` } },
      );
      const data = await res.json();
      if (!res.ok) {
        setDriveError(data.error || 'Failed to setup Drive folders');
        return;
      }
      updateConfig((p) => ({ ...p, chartsRootFolderId: folderId }));
    } catch {
      setDriveError('Network error');
    } finally {
      setDriveSetupLoading(false);
    }
  };

  const handleLoadSheet = async () => {
    if (!sheetUrl.trim()) return;
    setSheetLoading(true);
    setSheetError('');
    try {
      const res = await fetch(`/api/sheet?url=${encodeURIComponent(sheetUrl)}`);
      const data = await res.json();
      if (!res.ok) {
        setSheetError(data.error || 'Failed to load sheet');
        return;
      }
      updateConfig((prev) => ({
        ...prev,
        setlist: (data as { position: number; title: string; lead: string; notes: string }[]).map((s) => ({
          id: crypto.randomUUID(),
          position: s.position,
          title: s.title,
          lead: s.lead,
          notes: s.notes,
        })),
      }));
      // Auto-resolve charts after setlist import (fires on next render via effect)
    } catch {
      setSheetError('Network error');
    } finally {
      setSheetLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* ── 1. Show Info ────────────────────────────────────────────── */}
        <section className={sectionCls}>
          <h2 className="text-lg font-bold mb-4">Show Info</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Band Name</label>
              <input
                className={inputCls}
                value={config.showInfo.bandName}
                onChange={(e) =>
                  updateConfig((p) => ({
                    ...p,
                    showInfo: { ...p.showInfo, bandName: e.target.value },
                  }))
                }
              />
            </div>
            <div>
              <label className={labelCls}>Event Date</label>
              <input
                type="date"
                className={inputCls}
                value={config.showInfo.eventDate}
                onChange={(e) =>
                  updateConfig((p) => ({
                    ...p,
                    showInfo: { ...p.showInfo, eventDate: e.target.value },
                  }))
                }
              />
            </div>
            <div>
              <label className={labelCls}>Venue / Location</label>
              <input
                className={inputCls}
                value={config.showInfo.venue}
                onChange={(e) =>
                  updateConfig((p) => ({
                    ...p,
                    showInfo: { ...p.showInfo, venue: e.target.value },
                  }))
                }
              />
            </div>
          </div>
        </section>

        {/* ── 2. Stage Plot ───────────────────────────────────────────── */}
        <section className={sectionCls}>
          <h2 className="text-lg font-bold mb-4">Stage Plot</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500 min-w-[100px]">Name</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500">Position</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500 min-w-[100px]">Role</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500 w-16">Mix</th>
                  <th className="text-center px-2 py-2 text-xs font-bold text-gray-500 w-14">Power</th>
                  <th className="text-center px-2 py-2 text-xs font-bold text-gray-500 w-14">Feat.</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {config.stagePlot.map((slot, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="px-2 py-1">
                      <input
                        className={inputCls}
                        value={slot.name}
                        onChange={(e) =>
                          updateConfig((p) => {
                            const arr = [...p.stagePlot];
                            arr[idx] = { ...arr[idx], name: e.target.value };
                            return { ...p, stagePlot: arr };
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        className={inputCls}
                        value={slot.pos}
                        onChange={(e) =>
                          updateConfig((p) => {
                            const arr = [...p.stagePlot];
                            arr[idx] = { ...arr[idx], pos: e.target.value as StagePosition };
                            return { ...p, stagePlot: arr };
                          })
                        }
                      >
                        {POSITIONS.map((pos) => (
                          <option key={pos} value={pos}>{pos}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className={inputCls}
                        value={slot.role}
                        onChange={(e) =>
                          updateConfig((p) => {
                            const arr = [...p.stagePlot];
                            arr[idx] = { ...arr[idx], role: e.target.value };
                            return { ...p, stagePlot: arr };
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        className={inputCls}
                        value={slot.mix}
                        onChange={(e) =>
                          updateConfig((p) => {
                            const arr = [...p.stagePlot];
                            arr[idx] = { ...arr[idx], mix: Number(e.target.value) };
                            return { ...p, stagePlot: arr };
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={slot.power ?? false}
                        onChange={(e) =>
                          updateConfig((p) => {
                            const arr = [...p.stagePlot];
                            arr[idx] = { ...arr[idx], power: e.target.checked };
                            return { ...p, stagePlot: arr };
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1 text-center">
                      <input
                        type="checkbox"
                        checked={slot.featured ?? false}
                        onChange={(e) =>
                          updateConfig((p) => {
                            const arr = [...p.stagePlot];
                            arr[idx] = { ...arr[idx], featured: e.target.checked };
                            return { ...p, stagePlot: arr };
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      <button
                        className={btnRemove}
                        onClick={() =>
                          updateConfig((p) => ({
                            ...p,
                            stagePlot: p.stagePlot.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        X
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className={`${btnAdd} mt-3`}
            onClick={() =>
              updateConfig((p) => ({
                ...p,
                stagePlot: [
                  ...p.stagePlot,
                  { name: '', pos: 'DSC' as StagePosition, role: '', mix: p.stagePlot.length + 1 },
                ],
              }))
            }
          >
            + Add Row
          </button>
        </section>

        {/* ── 3. Input List ───────────────────────────────────────────── */}
        <section className={sectionCls}>
          <h2 className="text-lg font-bold mb-4">Input List</h2>
          <SetupInputTable
            inputs={config.inputs}
            onReorder={(from, to) => updateConfig((p) => ({ ...p, inputs: moveInput(p.inputs, from, to) }))}
            onUpdate={(idx, field, value) => updateConfig((p) => {
              const arr = [...p.inputs];
              arr[idx] = { ...arr[idx], [field]: field === 'ch' ? Number(value) : value };
              return { ...p, inputs: arr };
            })}
            onDelete={(idx) => updateConfig((p) => ({
              ...p,
              inputs: p.inputs.filter((_, i) => i !== idx).map((inp, i) => ({ ...inp, ch: i + 1 })),
            }))}
            onAdd={() => updateConfig((p) => ({
              ...p,
              inputs: [...p.inputs, { id: crypto.randomUUID(), ch: p.inputs.length + 1, inst: '', mic: '', stand: '', notes: '' }],
            }))}
          />
        </section>

        {/* ── 4. Monitor Mixes ────────────────────────────────────────── */}
        <section className={sectionCls}>
          <h2 className="text-lg font-bold mb-4">Monitor Mixes</h2>
          <SetupMonitorTable
            monitors={config.monitors}
            onReorder={(from, to) => updateConfig((p) => ({ ...p, monitors: moveMonitor(p.monitors, from, to) }))}
            onUpdate={(idx, field, value) => updateConfig((p) => {
              const arr = [...p.monitors];
              arr[idx] = { ...arr[idx], [field]: field === 'mix' ? Number(value) : value };
              return { ...p, monitors: arr };
            })}
            onDelete={(idx) => updateConfig((p) => ({
              ...p,
              monitors: p.monitors.filter((_, i) => i !== idx).map((mon, i) => ({ ...mon, mix: i + 1 })),
            }))}
            onAdd={() => updateConfig((p) => ({
              ...p,
              monitors: [...p.monitors, { id: crypto.randomUUID(), mix: p.monitors.length + 1, name: '', needs: '' }],
            }))}
          />
        </section>

        {/* ── 5. Setlist ──────────────────────────────────────────────── */}
        <section className={sectionCls}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Setlist</h2>
            {canResolveCharts && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  Charts: {chartsMatchCount}/{config.setlist.length} matched
                </span>
                <button
                  onClick={resolveCharts}
                  disabled={chartsResolving}
                  className="px-3 py-1 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {chartsResolving ? 'Resolving...' : 'Refresh Charts'}
                </button>
              </div>
            )}
          </div>
          {chartsError && (
            <p className="text-xs text-red-600 mb-3">{chartsError}</p>
          )}

          {/* How it works — Sheet import */}
          <details className="mb-4 text-sm">
            <summary className="cursor-pointer text-xs font-bold text-gray-400 uppercase hover:text-gray-600">How it works</summary>
            <ol className="mt-2 ml-4 list-decimal space-y-1 text-gray-600">
              <li>Create a Google Sheet with columns: <strong>#</strong> (or Position), <strong>Title</strong> (or Song), <strong>Lead</strong> (or Singer), and optionally <strong>Notes</strong>.</li>
              <li>Make the sheet publicly viewable: <em>Share &rarr; Anyone with the link &rarr; Viewer</em>.</li>
              <li>Copy the sheet URL and paste it below.</li>
            </ol>
          </details>

          {/* Google Sheet loader */}
          <div className="flex flex-col sm:flex-row gap-2 mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <input
              className={`${inputCls} flex-1`}
              placeholder="Google Sheet URL..."
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
            />
            <button
              className="px-4 py-1.5 text-xs font-bold bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 whitespace-nowrap"
              onClick={handleLoadSheet}
              disabled={sheetLoading}
            >
              {sheetLoading ? 'Loading...' : 'Load from Google Sheet'}
            </button>
          </div>
          {sheetError && (
            <p className="text-xs text-red-600 mb-3">{sheetError}</p>
          )}

          <SetupSetlistTable
            setlist={config.setlist}
            canResolveCharts={canResolveCharts}
            onReorder={(from, to) => updateConfig((p) => ({ ...p, setlist: moveSetlistSong(p.setlist, from, to) }))}
            onUpdate={(idx, field, value) => updateConfig((p) => {
              const arr = [...p.setlist];
              arr[idx] = { ...arr[idx], [field]: value };
              return { ...p, setlist: arr };
            })}
            onDelete={(idx) => updateConfig((p) => ({
              ...p,
              setlist: p.setlist.filter((_, i) => i !== idx).map((s, i) => ({ ...s, position: i + 1 })),
            }))}
            onAdd={() => updateConfig((p) => ({
              ...p,
              setlist: [...p.setlist, { id: crypto.randomUUID(), position: p.setlist.length + 1, title: '', lead: '', notes: '' }],
            }))}
          />
        </section>

        {/* ── 6. Google Drive Charts ────────────────────────────────────── */}
        <section className={sectionCls}>
          <h2 className="text-lg font-bold mb-4">Charts / Lead Sheets</h2>

          {/* How it works — Charts */}
          <details className="mb-4 text-sm">
            <summary className="cursor-pointer text-xs font-bold text-gray-400 uppercase hover:text-gray-600">How it works</summary>
            <div className="mt-2 space-y-2 text-gray-600">
              <p>Charts are matched automatically from a Google Drive folder. The folder structure is:</p>
              <pre className="bg-gray-50 border border-gray-200 rounded p-2 text-xs overflow-x-auto">
{`Your Charts Folder/
  Lyrics/        ← lyric sheets
  Guitar/        ← chord charts
  Bass/          ← bass charts
  Piano / Keys/  ← keys charts
  Horns/         ← horn parts
  Drums/         ← drum charts
  Conductor/     ← full scores
  Other/         ← anything else`}
              </pre>
              <ol className="ml-4 list-decimal space-y-1">
                <li>Click <strong>Connect Google Drive</strong> and authorize read access.</li>
                <li>Create (or pick) a folder in Drive for your charts. Copy the folder URL.</li>
                <li>Paste it below and click <strong>Setup Chart Folders</strong> &mdash; the app creates the role subfolders for you.</li>
                <li>Drop chart files into the matching role folder. Name files after the song (e.g., &ldquo;Superstition.pdf&rdquo; in <code className="text-xs bg-gray-100 px-1 rounded">Guitar/</code>).</li>
                <li>On the <strong>Show</strong> tab, each song in the setlist gets a music-note icon. Tap it to see matched charts.</li>
              </ol>
            </div>
          </details>

          {!googleToken ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Connect Google Drive to auto-match charts to songs by role (Lyrics, Guitar, Bass, etc.).
              </p>
              <a
                href="/api/auth/google"
                className="inline-block px-4 py-2 text-sm font-bold bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Connect Google Drive
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded">Connected</span>
                <button
                  onClick={() => {
                    onDisconnectGoogle();
                    updateConfig((p) => ({ ...p, chartsRootFolderId: undefined }));
                  }}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  Disconnect
                </button>
              </div>

              {config.chartsRootFolderId ? (
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs text-gray-500 mb-1">Charts folder ID</p>
                  <p className="text-sm font-mono text-gray-700 break-all">{config.chartsRootFolderId}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    Paste the Google Drive folder URL (or ID) where your Charts folder should live.
                    The app will create role subfolders automatically.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      className={`${inputCls} flex-1`}
                      placeholder="Google Drive folder URL or ID..."
                      value={folderIdInput}
                      onChange={(e) => setFolderIdInput(e.target.value)}
                    />
                    <button
                      className="px-4 py-1.5 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                      onClick={handleSetupDrive}
                      disabled={driveSetupLoading || !folderIdInput.trim()}
                    >
                      {driveSetupLoading ? 'Setting up...' : 'Setup Chart Folders'}
                    </button>
                  </div>
                  {driveError && <p className="text-xs text-red-600">{driveError}</p>}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── 7. Offline Access ──────────────────────────────────────────── */}
        {canResolveCharts && (
          <OfflineSection
            charts={config.setlist.flatMap((s) => s.charts ?? [])}
            googleToken={googleToken}
          />
        )}

        {/* ── 8. Export / Import ───────────────────────────────────────────── */}
        <section className={sectionCls}>
          <h2 className="text-lg font-bold mb-4">Export / Import</h2>
          <p className="text-sm text-gray-600 mb-4">
            Save your show as a <code>.json</code> file for backup or sharing between devices.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className="px-4 py-2 text-sm font-bold bg-black text-white rounded hover:bg-gray-800 transition-colors"
              onClick={() => {
                const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const slug = config.showInfo.bandName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'show';
                a.download = `${slug}.showrunr.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export Show (.json)
            </button>
            <label className="px-4 py-2 text-sm font-bold bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 transition-colors cursor-pointer">
              Import Show (.json)
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    try {
                      const parsed = JSON.parse(reader.result as string) as AppConfig;
                      if (!parsed.stagePlot || !parsed.inputs || !parsed.setlist) {
                        alert('Invalid show file — missing required sections.');
                        return;
                      }
                      updateConfig(() => withStableIds(parsed));
                    } catch {
                      alert('Could not read file — invalid JSON.');
                    }
                  };
                  reader.readAsText(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </section>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// OFFLINE SECTION (Setup tab — download charts for gig-day use)
// ════════════════════════════════════════════════════════════════════════════

function OfflineSection({
  charts,
  googleToken,
}: {
  charts: Chart[];
  googleToken: GoogleToken | null;
}) {
  const [cacheStats, setCacheStats] = useState<{ count: number; bytes: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load cache stats on mount and after operations
  const refreshStats = useCallback(() => {
    getCacheStats().then(setCacheStats).catch(() => setCacheStats(null));
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const handleDownload = async () => {
    if (!googleToken || charts.length === 0) return;
    setDownloading(true);
    setProgress(null);

    try {
      // Register SW before first download
      await registerServiceWorker();

      const controller = new AbortController();
      abortRef.current = controller;

      const result = await downloadAllCharts(
        charts,
        googleToken.access_token,
        (p) => setProgress({ ...p }),
        controller.signal,
      );

      setProgress(result);
    } finally {
      setDownloading(false);
      abortRef.current = null;
      refreshStats();
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const handleClear = async () => {
    await clearChartCache();
    setCacheStats({ count: 0, bytes: 0 });
    setProgress(null);
  };

  const cacheableCount = charts.filter((c) => c.fileId && c.modifiedTime).length;

  return (
    <section className={sectionCls}>
      <h2 className="text-lg font-bold mb-4">Offline Access</h2>
      <p className="text-sm text-gray-600 mb-4">
        Cache charts for offline use at the gig. Requires an active internet connection to download.
      </p>

      {downloading ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-black h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress && progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
            <span className="text-xs font-mono text-gray-500 shrink-0">
              {progress ? `${progress.done}/${progress.total}` : 'Starting...'}
            </span>
          </div>
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-xs font-bold bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            onClick={handleDownload}
            disabled={cacheableCount === 0}
            className="px-4 py-2 text-sm font-bold bg-black text-white rounded hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            Download Charts for Offline
          </button>

          {progress && !downloading && (
            <div className="text-xs text-gray-600 space-y-1">
              <p>
                {progress.done - progress.failed.length - progress.skipped} downloaded,
                {progress.skipped > 0 && ` ${progress.skipped} already cached,`}
                {progress.failed.length > 0 && ` ${progress.failed.length} failed,`}
                {progress.aborted && ' cancelled'}
              </p>
              {progress.failed.length > 0 && (
                <p className="text-amber-600">
                  {progress.failed.length} chart{progress.failed.length > 1 ? 's' : ''} could not be downloaded — these require internet
                </p>
              )}
            </div>
          )}

          {cacheStats && cacheStats.count > 0 && (
            <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-sm">
                <span className="font-bold">{cacheStats.count}</span>
                <span className="text-gray-500"> chart{cacheStats.count !== 1 ? 's' : ''} cached</span>
                {cacheStats.bytes > 0 && (
                  <span className="text-gray-400"> ({formatBytes(cacheStats.bytes)})</span>
                )}
              </div>
              <button
                onClick={handleClear}
                className="px-3 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
              >
                Clear Cache
              </button>
            </div>
          )}

          {cacheableCount === 0 && (
            <p className="text-xs text-gray-400 italic">
              No charts to cache. Resolve charts first by connecting Google Drive above.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
