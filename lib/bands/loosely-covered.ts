import type { BandConfig } from '../types';

const looselyCovered: BandConfig = {
  slug: 'loosely-covered',
  name: 'Loosely Covered',
  lineup: '7-Piece Band',

  stagePlot: [
    { name: 'Matt',   pos: 'USR', role: 'Keys + BGV',  mix: 4, power: true  },
    { name: 'Bill',   pos: 'USC', role: 'Drums',        mix: 6, power: false },
    { name: 'Terry',  pos: 'USL', role: 'Bass + BGV',   mix: 5, power: true  },
    { name: 'Horns',  pos: 'DSR', role: 'Sax & Tpt',   mix: 3, power: false },
    { name: 'Rachel', pos: 'DSC', role: 'Lead Vox',     mix: 1, power: false, featured: true },
    { name: 'Graham', pos: 'DSL', role: 'Gtr + BGV',    mix: 2, power: true  },
  ],

  inputs: [
    { ch: 1,  inst: 'Kick',        mic: 'Beta 52 / D6',    stand: 'Short Boom', notes: '' },
    { ch: 2,  inst: 'Snare',       mic: 'SM57',             stand: 'Short Boom', notes: '' },
    { ch: 3,  inst: 'Hi-Hat',      mic: 'Condenser',        stand: 'Small Boom', notes: '' },
    { ch: 4,  inst: 'Rack Tom',    mic: 'e604 / Clip',      stand: 'N/A',        notes: '' },
    { ch: 5,  inst: 'Floor Tom',   mic: 'e604 / Clip',      stand: 'N/A',        notes: '' },
    { ch: 6,  inst: 'OH L',        mic: 'Condenser',        stand: 'Tall Boom',  notes: '' },
    { ch: 7,  inst: 'OH R',        mic: 'Condenser',        stand: 'Tall Boom',  notes: '' },
    { ch: 8,  inst: 'Bass',        mic: 'DI',               stand: 'N/A',        notes: 'Terry - USL' },
    { ch: 9,  inst: 'Keys (Nord)', mic: 'DI (Mono)',        stand: 'N/A',        notes: 'Matt - USR' },
    { ch: 10, inst: 'Guitar Amp',  mic: 'SM57 / e906',      stand: 'Short Boom', notes: 'Graham - DSL' },
    { ch: 11, inst: 'Sax',         mic: 'SM57 / House',     stand: 'Tall Boom',  notes: 'Chris - DSR' },
    { ch: 12, inst: 'Trumpet',     mic: 'SM57 / House',     stand: 'Tall Boom',  notes: 'Konstantins - DSR' },
    { ch: 13, inst: 'Lead Vox',    mic: 'Beta 58',          stand: 'STRAIGHT',   notes: 'Rachel - DSC' },
    { ch: 14, inst: 'BGV 1',       mic: 'SM58',             stand: 'BOOM',       notes: 'Graham - DSL' },
    { ch: 15, inst: 'BGV 2',       mic: 'SM58',             stand: 'BOOM',       notes: 'Matt - USR' },
    { ch: 16, inst: 'BGV 3',       mic: 'SM58',             stand: 'BOOM',       notes: 'Terry - USL' },
  ],

  monitors: [
    { mix: 1, name: 'Rachel (DSC)',             needs: 'Lead Vox only' },
    { mix: 2, name: 'Graham (DSL)',             needs: 'Lead Vox, BGVs, Keys — no guitar, bass, or drums' },
    { mix: 3, name: 'Horns (DSR)',              needs: 'Lead Vox, BGVs, Keys — no bass or drums' },
    { mix: 4, name: 'Matt (USR)',               needs: 'Matt BGV (Priority), Lead Vox, BGVs, Keys, Guitar (light) — no bass or drums' },
    { mix: 5, name: 'Terry (USL)',              needs: 'Lead Vox, BGVs, Bass (light), Keys (light) — no drums or guitar' },
    { mix: 6, name: 'Bill / Drums (USC)',       needs: 'Lead Vox (heavy), Kick, Bass, Keys (light), Guitar (light) — no other drums' },
  ],

  notes: [
    { label: 'Stands',  text: 'Rachel requires a Straight Stand. All others (BGVs & Horns) require Boom Stands.' },
    { label: 'Power',   text: 'Minimum 1x AC drop required at DSL (Guitar), USL (Bass), and USR (Keys).' },
    { label: 'Horns',   text: 'Players may use house SM57s or personal clip-ons. Provide 2x XLR and stands at DSR.' },
    { label: 'Keys',    text: 'Matt is DI (Mono). He may use a personal monitor in addition to the house wedge (Mix 4).' },
  ],
};

export default looselyCovered;
