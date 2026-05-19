'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  BandConfig,
  StagePosition,
  StageSlot,
  InputChannel,
  MonitorMix,
  SetlistSong,
  GeneralNote,
} from '@/lib/types';

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
export default function Page() {
  const [tab, setTab] = useState<'show' | 'setup'>('show');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printSections, setPrintSections] = useState({
    stagePlot: true,
    inputList: true,
    monitorMixes: true,
    notes: true,
    setlist: true,
  });

  // ── Load config: URL param > localStorage > fallback ──────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlConfig = params.get('config');
    if (urlConfig) {
      const decoded = decodeConfig(urlConfig);
      if (decoded) {
        setConfig(decoded);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(decoded));
        setLoaded(true);
        return;
      }
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setConfig(JSON.parse(stored));
      } catch {
        setConfig(bandToConfig(fallbackBand));
      }
    } else {
      setConfig(bandToConfig(fallbackBand));
    }
    setLoaded(true);
  }, []);

  // ── Persist to localStorage on change ─────────────────────────────────
  useEffect(() => {
    if (loaded && config) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  }, [config, loaded]);

  const updateConfig = useCallback((fn: (prev: AppConfig) => AppConfig) => {
    setConfig((prev) => (prev ? fn(prev) : prev));
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

  if (!loaded || !config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

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
        <ShowTab band={band} printSections={printSections} showInfo={config.showInfo} />
      ) : (
        <SetupTab config={config} updateConfig={updateConfig} />
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

function ShowTab({ band, printSections, showInfo }: { band: BandConfig; printSections: Record<string, boolean>; showInfo: { bandName: string; eventDate: string; venue: string } }) {
  const colorMap = new Map<string, string>();
  if (band.setlist?.length) {
    band.setlist.forEach((s) => {
      s.lead.split('+').map((n) => n.trim()).forEach((n) => getSingerColor(n, colorMap));
    });
  }
  const legend = Array.from(colorMap.entries());

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-12">
        <header className="text-center border-b pb-8">
          <h1 className="text-4xl font-black tracking-tight uppercase">{band.name}</h1>
          {(showInfo.venue || showInfo.eventDate) && (
            <p className="text-lg font-semibold text-gray-700 mt-1">
              {showInfo.venue}{showInfo.venue && showInfo.eventDate ? ' · ' : ''}{showInfo.eventDate}
            </p>
          )}
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
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-black text-white flex items-center justify-center rounded text-sm">5</span>
              Run Order / Setlist
            </h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {legend.map(([name, color]) => (
                <span key={name} className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>{name}</span>
              ))}
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 font-bold w-10">#</th>
                    <th className="px-4 py-3 font-bold">Song</th>
                    <th className="px-4 py-3 font-bold">Lead</th>
                    <th className="px-4 py-3 font-bold hidden sm:table-cell">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {band.setlist.map((song) => {
                    const singers = song.lead.split('+').map((n) => n.trim());
                    return (
                      <tr key={song.position} className="hover:bg-gray-50">
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SETUP TAB
// ════════════════════════════════════════════════════════════════════════════

const inputCls = 'w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black bg-white';
const labelCls = 'block text-xs font-bold text-gray-500 uppercase mb-1';
const sectionCls = 'bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6';
const btnAdd = 'px-3 py-1.5 text-xs font-bold bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 transition-colors';
const btnRemove = 'px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors';

function SetupTab({
  config,
  updateConfig,
}: {
  config: AppConfig;
  updateConfig: (fn: (prev: AppConfig) => AppConfig) => void;
}) {
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState('');

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
          position: s.position,
          title: s.title,
          lead: s.lead,
          notes: s.notes,
        })),
      }));
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
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500">Name</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500">Position</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500">Role</th>
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500 w-14">Ch</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500">Instrument</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500">Mic/DI</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500">Stand</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500">Notes</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {config.inputs.map((inp, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        className={inputCls}
                        value={inp.ch}
                        onChange={(e) =>
                          updateConfig((p) => {
                            const arr = [...p.inputs];
                            arr[idx] = { ...arr[idx], ch: Number(e.target.value) };
                            return { ...p, inputs: arr };
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className={inputCls}
                        value={inp.inst}
                        onChange={(e) =>
                          updateConfig((p) => {
                            const arr = [...p.inputs];
                            arr[idx] = { ...arr[idx], inst: e.target.value };
                            return { ...p, inputs: arr };
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className={inputCls}
                        value={inp.mic}
                        onChange={(e) =>
                          updateConfig((p) => {
                            const arr = [...p.inputs];
                            arr[idx] = { ...arr[idx], mic: e.target.value };
                            return { ...p, inputs: arr };
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className={inputCls}
                        value={inp.stand}
                        onChange={(e) =>
                          updateConfig((p) => {
                            const arr = [...p.inputs];
                            arr[idx] = { ...arr[idx], stand: e.target.value };
                            return { ...p, inputs: arr };
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className={inputCls}
                        value={inp.notes ?? ''}
                        onChange={(e) =>
                          updateConfig((p) => {
                            const arr = [...p.inputs];
                            arr[idx] = { ...arr[idx], notes: e.target.value };
                            return { ...p, inputs: arr };
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
                            inputs: p.inputs.filter((_, i) => i !== idx),
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
                inputs: [
                  ...p.inputs,
                  { ch: p.inputs.length + 1, inst: '', mic: '', stand: '', notes: '' },
                ],
              }))
            }
          >
            + Add Row
          </button>
        </section>

        {/* ── 4. Monitor Mixes ────────────────────────────────────────── */}
        <section className={sectionCls}>
          <h2 className="text-lg font-bold mb-4">Monitor Mixes</h2>
          <div className="space-y-3">
            {config.monitors.map((mon, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center border-b border-gray-100 pb-3">
                <div className="w-20 shrink-0">
                  <label className={labelCls}>Mix #</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={mon.mix}
                    onChange={(e) =>
                      updateConfig((p) => {
                        const arr = [...p.monitors];
                        arr[idx] = { ...arr[idx], mix: Number(e.target.value) };
                        return { ...p, monitors: arr };
                      })
                    }
                  />
                </div>
                <div className="flex-1">
                  <label className={labelCls}>Name</label>
                  <input
                    className={inputCls}
                    value={mon.name}
                    onChange={(e) =>
                      updateConfig((p) => {
                        const arr = [...p.monitors];
                        arr[idx] = { ...arr[idx], name: e.target.value };
                        return { ...p, monitors: arr };
                      })
                    }
                  />
                </div>
                <div className="flex-[2]">
                  <label className={labelCls}>Needs</label>
                  <input
                    className={inputCls}
                    value={mon.needs}
                    onChange={(e) =>
                      updateConfig((p) => {
                        const arr = [...p.monitors];
                        arr[idx] = { ...arr[idx], needs: e.target.value };
                        return { ...p, monitors: arr };
                      })
                    }
                  />
                </div>
                <div className="pt-5">
                  <button
                    className={btnRemove}
                    onClick={() =>
                      updateConfig((p) => ({
                        ...p,
                        monitors: p.monitors.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    X
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            className={`${btnAdd} mt-3`}
            onClick={() =>
              updateConfig((p) => ({
                ...p,
                monitors: [
                  ...p.monitors,
                  { mix: p.monitors.length + 1, name: '', needs: '' },
                ],
              }))
            }
          >
            + Add Mix
          </button>
        </section>

        {/* ── 5. Setlist ──────────────────────────────────────────────── */}
        <section className={sectionCls}>
          <h2 className="text-lg font-bold mb-4">Setlist</h2>

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

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500 w-12">#</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500">Title</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500">Lead</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500">Notes</th>
                  <th className="text-left px-2 py-2 text-xs font-bold text-gray-500 w-24">Scene Note</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {config.setlist.map((song, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        className={inputCls}
                        value={song.position}
                        onChange={(e) =>
                          updateConfig((p) => {
                            const arr = [...p.setlist];
                            arr[idx] = { ...arr[idx], position: Number(e.target.value) };
                            return { ...p, setlist: arr };
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className={inputCls}
                        value={song.title}
                        onChange={(e) =>
                          updateConfig((p) => {
                            const arr = [...p.setlist];
                            arr[idx] = { ...arr[idx], title: e.target.value };
                            return { ...p, setlist: arr };
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className={inputCls}
                        value={song.lead}
                        onChange={(e) =>
                          updateConfig((p) => {
                            const arr = [...p.setlist];
                            arr[idx] = { ...arr[idx], lead: e.target.value };
                            return { ...p, setlist: arr };
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className={inputCls}
                        value={song.notes ?? ''}
                        onChange={(e) =>
                          updateConfig((p) => {
                            const arr = [...p.setlist];
                            arr[idx] = { ...arr[idx], notes: e.target.value };
                            return { ...p, setlist: arr };
                          })
                        }
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className={inputCls}
                        value={song.sceneNote ?? ''}
                        onChange={(e) =>
                          updateConfig((p) => {
                            const arr = [...p.setlist];
                            arr[idx] = { ...arr[idx], sceneNote: e.target.value };
                            return { ...p, setlist: arr };
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
                            setlist: p.setlist.filter((_, i) => i !== idx),
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
                setlist: [
                  ...p.setlist,
                  { position: p.setlist.length + 1, title: '', lead: '', notes: '' },
                ],
              }))
            }
          >
            + Add Song
          </button>
        </section>
      </div>
    </div>
  );
}
