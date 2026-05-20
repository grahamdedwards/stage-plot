import type { SetlistSong, InputChannel, MonitorMix } from './types';

export function ensureSetlistSongIds(setlist: SetlistSong[]): SetlistSong[] {
  return setlist.map((s) =>
    s.id ? s : { ...s, id: crypto.randomUUID() }
  );
}

export function moveSetlistSong(setlist: SetlistSong[], from: number, to: number): SetlistSong[] {
  if (from === to || from < 0 || to < 0 || from >= setlist.length || to >= setlist.length) {
    return setlist;
  }
  const arr = [...setlist];
  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);
  return renumberSetlist(arr);
}

export function renumberSetlist(setlist: SetlistSong[]): SetlistSong[] {
  return setlist.map((s, i) => (s.position === i + 1 ? s : { ...s, position: i + 1 }));
}

// ── Input channel reorder ─────────────────────────────────────────────────

export function ensureInputIds(inputs: InputChannel[]): InputChannel[] {
  return inputs.map((inp) =>
    inp.id ? inp : { ...inp, id: crypto.randomUUID() }
  );
}

export function moveInput(inputs: InputChannel[], from: number, to: number): InputChannel[] {
  if (from === to || from < 0 || to < 0 || from >= inputs.length || to >= inputs.length) {
    return inputs;
  }
  const arr = [...inputs];
  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);
  return arr.map((inp, i) => (inp.ch === i + 1 ? inp : { ...inp, ch: i + 1 }));
}

// ── Monitor mix reorder ───────────────────────────────────────────────────

export function ensureMonitorIds(monitors: MonitorMix[]): MonitorMix[] {
  return monitors.map((mon) =>
    mon.id ? mon : { ...mon, id: crypto.randomUUID() }
  );
}

export function moveMonitor(monitors: MonitorMix[], from: number, to: number): MonitorMix[] {
  if (from === to || from < 0 || to < 0 || from >= monitors.length || to >= monitors.length) {
    return monitors;
  }
  const arr = [...monitors];
  const [moved] = arr.splice(from, 1);
  arr.splice(to, 0, moved);
  return arr.map((mon, i) => (mon.mix === i + 1 ? mon : { ...mon, mix: i + 1 }));
}
