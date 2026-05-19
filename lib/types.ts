export type StagePosition = 'USR' | 'USC' | 'USL' | 'DSR' | 'DSC' | 'DSL';

export interface StageSlot {
  name: string;
  pos: StagePosition;
  role: string;
  mix: number;
  power?: boolean;
  featured?: boolean; // highlights the slot (e.g. lead vox)
}

export interface InputChannel {
  ch: number;
  inst: string;
  mic: string;
  stand: string;
  notes?: string;
}

export interface MonitorMix {
  mix: number;
  name: string;
  needs: string;
}

export interface GeneralNote {
  label: string;
  text: string;
}

export interface SetlistSong {
  position: number;
  title: string;
  lead: string;           // singer name(s) — e.g. "Rachel" or "Graham + Rachel"
  notes?: string;         // e.g. "key change", "guest", "spoken word"
  sceneNote?: string;     // engineer cue — e.g. "save scene after"
}

export interface BandConfig {
  slug: string;           // used in ?band= URL param
  name: string;           // band name shown in header
  lineup: string;         // e.g. "7-Piece Band"
  stagePlot: StageSlot[];
  inputs: InputChannel[];
  monitors: MonitorMix[];
  notes: GeneralNote[];
  setlist?: SetlistSong[]; // optional — omit if not needed
}
