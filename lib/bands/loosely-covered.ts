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

  // Full song library — trim to actual setlist order before each show
  setlist: [
    { position: 1,  title: 'Valerie',                    lead: 'Rachel', notes: 'E — Amy Winehouse; Graham/Matt BGV' },
    { position: 2,  title: 'Smooth Operator',            lead: 'Rachel', notes: 'Dm — Sade' },
    { position: 3,  title: 'Crazy',                      lead: 'Rachel', notes: 'Cm — Gnarls Barkley / Scary Pockets version' },
    { position: 4,  title: 'Mercy',                      lead: 'Rachel', notes: 'Gm — Duffy' },
    { position: 5,  title: "Ain't Nobody",               lead: 'Rachel', notes: 'Eb — Chaka Khan; Graham/Matt BGV' },
    { position: 6,  title: 'Exs and Ohs',               lead: 'Rachel', notes: 'Em — Elle King' },
    { position: 7,  title: 'Miss You',                   lead: 'Rachel', notes: 'Am — Rolling Stones; layer in Hozier' },
    { position: 8,  title: 'Good Kisser',                lead: 'Rachel', notes: 'Bb — Lake Street Dive; Graham/Matt BGV' },
    { position: 9,  title: 'F**k You',                  lead: 'Rachel', notes: 'C — Gnarls Barkley; Graham/Matt BGV' },
    { position: 10, title: 'September',                  lead: 'Rachel', notes: 'Db — Earth Wind & Fire; Graham/Matt BGV' },
    { position: 11, title: 'Dancing Queen',              lead: 'Rachel', notes: 'A — ABBA' },
    { position: 12, title: 'Hard to Handle',             lead: 'Matt',   notes: 'B — Black Crowes' },
    { position: 13, title: 'Tell Me Something Good',     lead: 'Rachel', notes: 'Ab — Chaka Khan' },
    { position: 14, title: 'Use Me',                     lead: 'Rachel', notes: 'E — Bill Withers' },
    { position: 15, title: 'About Damn Time',            lead: 'Rachel', notes: 'Eb — Lizzo' },
    { position: 16, title: 'Rock Steady',                lead: 'Rachel', notes: 'Am — Aretha' },
    { position: 17, title: 'Groove Is In the Heart',     lead: 'Rachel', notes: 'Db — Dee Lite' },
    { position: 18, title: 'I Wanna Dance with Somebody', lead: 'Rachel', notes: 'F# — Whitney Houston' },
    { position: 19, title: 'Uptown Funk',                lead: 'Rachel', notes: 'D — Bruno Mars' },
    { position: 20, title: 'Brick House',                lead: 'Matt',   notes: 'Am — Commodores' },
    { position: 21, title: 'I Want You Back',            lead: 'Rachel', notes: 'G — Jackson Five; Graham BGV' },
    { position: 22, title: 'Kiss',                       lead: 'Rachel', notes: 'A — Prince' },
    { position: 23, title: 'I Will Survive',             lead: 'Rachel', notes: 'Am — Cake' },
    { position: 24, title: 'Hold the Line',              lead: 'Rachel', notes: 'F# — Toto; Graham BGV' },
    { position: 25, title: 'Long Train Runnin\'',        lead: 'Rachel', notes: 'Gm — Doobie Brothers; Graham BGV' },
    { position: 26, title: 'Hit Me with Your Best Shot', lead: 'Rachel', notes: 'E — Pat Benatar' },
    { position: 27, title: 'Love Shack',                 lead: 'Graham', notes: 'C — The B-52s' },
    { position: 28, title: 'Rebel Yell',                 lead: 'Rachel', notes: 'Bm — Billy Idol' },
    { position: 29, title: 'Superstition',               lead: 'Rachel', notes: 'E — Stevie Wonder' },
    { position: 30, title: 'When You Get Back',          lead: 'Matt',   notes: 'Gm — Jon Cleary' },
  ],
};

export default looselyCovered;
