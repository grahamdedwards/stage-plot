import type { SetlistSong } from './types';

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
