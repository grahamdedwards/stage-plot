import React from 'react';

const inputs = [
  { ch: 1, inst: "Kick", mic: "Beta 52 / D6", stand: "Short Boom", notes: "" },
  { ch: 2, inst: "Snare", mic: "SM57", stand: "Short Boom", notes: "" },
  { ch: 3, inst: "Hi-Hat", mic: "Condenser", stand: "Small Boom", notes: "" },
  { ch: 4, inst: "Rack Tom", mic: "e604 / Clip", stand: "N/A", notes: "" },
  { ch: 5, inst: "Floor Tom", mic: "e604 / Clip", stand: "N/A", notes: "" },
  { ch: 6, inst: "OH L", mic: "Condenser", stand: "Tall Boom", notes: "" },
  { ch: 7, inst: "OH R", mic: "Condenser", stand: "Tall Boom", notes: "" },
  { ch: 8, inst: "Bass", mic: "DI", stand: "N/A", notes: "Terry - USL" },
  { ch: 9, inst: "Keys (Nord)", mic: "DI (Mono)", stand: "N/A", notes: "Matt - USR" },
  { ch: 10, inst: "Guitar Amp", mic: "SM57 / e906", stand: "Short Boom", notes: "Graham - DSL" },
  { ch: 11, inst: "Sax", mic: "SM57 / House", stand: "Tall Boom", notes: "Chris - DSR" },
  { ch: 12, inst: "Trumpet", mic: "SM57 / House", stand: "Tall Boom", notes: "Konstantins - DSR" },
  { ch: 13, inst: "Lead Vox", mic: "Beta 58", stand: "STRAIGHT", notes: "Rachel - DSC" },
  { ch: 14, inst: "BGV 1", mic: "SM58", stand: "BOOM", notes: "Graham - DSL" },
  { ch: 15, inst: "BGV 2", mic: "SM58", stand: "BOOM", notes: "Matt - USR" },
  { ch: 16, inst: "BGV 3", mic: "SM58", stand: "BOOM", notes: "Terry - USL" },
];

const monitors = [
  { mix: 1, name: "Rachel (DSC)", needs: "Lead Vox only" },
  { mix: 2, name: "Graham (DSL)", needs: "Lead Vox, BGVs, Keys — no guitar, bass, or drums" },
  { mix: 3, name: "Horns (DSR)", needs: "Lead Vox, BGVs, Keys — no bass or drums" },
  { mix: 4, name: "Matt (USR)", needs: "Matt BGV (Priority), Lead Vox, BGVs, Keys, Guitar (light) — no bass or drums" },
  { mix: 5, name: "Terry (USL)", needs: "Lead Vox, BGVs, Bass (light), Keys (light) — no drums or guitar" },
  { mix: 6, name: "Bill / Drums (USC)", needs: "Lead Vox (heavy), Kick, Bass, Keys (light), Guitar (light) — no other drums" },
];

export default function TechnicalRider() {
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans text-gray-900">
      <div className="max-w-4xl mx-auto space-y-12">

        {/* Header */}
        <header className="text-center border-b pb-8">
          <h1 className="text-4xl font-black tracking-tight uppercase">Loosely Covered</h1>
          <p className="text-lg font-semibold text-gray-700 mt-1 uppercase tracking-wide">Technical Rider</p>
          <p className="text-xl text-gray-500 mt-1">7-Piece Band | Stage Plot &amp; Input List</p>
        </header>

        {/* Visual Stage Plot */}
        <section>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span className="w-8 h-8 bg-black text-white flex items-center justify-center rounded text-sm">1</span>
            Stage Plot
          </h2>
          <div className="relative aspect-[16/9] bg-white border-4 border-gray-200 rounded-xl shadow-inner p-4 md:p-8 overflow-hidden">

            {/* Stage Designations */}
            <div className="absolute top-4 left-4 text-xs font-bold text-gray-400">UPSTAGE RIGHT (USR)</div>
            <div className="absolute top-4 right-4 text-xs font-bold text-gray-400">UPSTAGE LEFT (USL)</div>
            <div className="absolute bottom-4 left-4 text-xs font-bold text-gray-400">DOWNSTAGE RIGHT (DSR)</div>
            <div className="absolute bottom-4 right-4 text-xs font-bold text-gray-400">DOWNSTAGE LEFT (DSL)</div>

            <div className="grid grid-cols-3 grid-rows-2 h-full gap-4 text-center">
              {/* Backline */}
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-blue-100 bg-blue-50/30 rounded-lg">
                <p className="font-bold">MATT</p>
                <p className="text-xs">Keys + BGV (Mix 4)</p>
                <div className="mt-1 px-2 py-0.5 bg-yellow-400 text-[10px] font-bold rounded">POWER</div>
              </div>
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-100 bg-gray-50 rounded-lg">
                <p className="font-bold uppercase">Bill (Drums)</p>
                <p className="text-xs">Mix 6</p>
              </div>
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-blue-100 bg-blue-50/30 rounded-lg">
                <p className="font-bold uppercase">Terry</p>
                <p className="text-xs">Bass + BGV (Mix 5)</p>
                <div className="mt-1 px-2 py-0.5 bg-yellow-400 text-[10px] font-bold rounded">POWER</div>
              </div>

              {/* Frontline */}
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-blue-100 bg-blue-50/30 rounded-lg">
                <p className="font-bold uppercase">Horns</p>
                <p className="text-xs">Sax &amp; Trumpet (Mix 3)</p>
              </div>
              <div className="flex flex-col items-center justify-center border-2 border-black bg-gray-900 text-white rounded-lg shadow-xl scale-110 z-10">
                <p className="font-bold uppercase">Rachel</p>
                <p className="text-xs">Lead Vox (Mix 1)</p>
                <p className="text-[10px] opacity-70">Straight Stand</p>
              </div>
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-blue-100 bg-blue-50/30 rounded-lg">
                <p className="font-bold uppercase">Graham</p>
                <p className="text-xs">Gtr + BGV (Mix 2)</p>
                <div className="mt-1 px-2 py-0.5 bg-yellow-400 text-[10px] font-bold rounded">POWER</div>
              </div>
            </div>

            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-white px-8 py-1 border-t-4 border-black font-black uppercase tracking-widest text-sm">
              Audience / FOH
            </div>
          </div>
        </section>

        {/* Input List */}
        <section>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span className="w-8 h-8 bg-black text-white flex items-center justify-center rounded text-sm">2</span>
            Input List
          </h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                {inputs.map((i) => (
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

        {/* Monitor Mixes + Notes */}
        <section className="grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="w-8 h-8 bg-black text-white flex items-center justify-center rounded text-sm">3</span>
              Monitor Mixes
            </h2>
            <div className="space-y-4">
              {monitors.map((m) => (
                <div key={m.mix} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                  <h3 className="font-bold flex items-center gap-2">
                    <span className="text-blue-600">Mix {m.mix}:</span> {m.name}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">{m.needs}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <span className="w-8 h-8 bg-black text-white flex items-center justify-center rounded text-sm">4</span>
              Notes
            </h2>
            <ul className="space-y-3 text-sm text-gray-700 bg-yellow-50 p-6 rounded-xl border border-yellow-200">
              <li><strong>Stands:</strong> Rachel requires a <strong>Straight Stand</strong>. All others (BGVs &amp; Horns) require <strong>Boom Stands</strong>.</li>
              <li><strong>Power:</strong> Minimum 1x AC drop required at DSL (Guitar), USL (Bass), and USR (Keys).</li>
              <li><strong>Horns:</strong> Players may use house SM57s or personal clip-ons. Provide 2x XLR and stands at DSR.</li>
              <li><strong>Keys:</strong> Matt is DI (Mono). He may use a personal monitor in addition to the house wedge (Mix 3).</li>
            </ul>
          </div>
        </section>

      </div>
    </div>
  );
}
