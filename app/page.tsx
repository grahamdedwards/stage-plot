import { getBand } from '@/lib/bands';
import type { StagePosition, BandConfig } from '@/lib/types';

const POSITION_ORDER: StagePosition[] = ['USR', 'USC', 'USL', 'DSR', 'DSC', 'DSL'];

function StagePlot({ band }: { band: BandConfig }) {
  const slotMap = Object.fromEntries(band.stagePlot.map((s) => [s.pos, s]));

  return (
    <div className="bg-white border-4 border-gray-200 rounded-xl shadow-inner overflow-hidden">
      {/* Upstage label */}
      <div className="flex justify-between px-3 pt-2 pb-1">
        <span className="text-[10px] font-bold text-gray-400">USR</span>
        <span className="text-[10px] font-bold text-gray-500 tracking-widest">↑ UPSTAGE</span>
        <span className="text-[10px] font-bold text-gray-400">USL</span>
      </div>

      {/* Backline row */}
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

      {/* Divider */}
      <div className="mx-3 border-t-2 border-dashed border-gray-300 my-1" />

      {/* Frontline row */}
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
                  <p className={`font-bold text-sm leading-tight uppercase ${isFeatured ? '' : ''}`}>{slot.name}</p>
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

      {/* Downstage / FOH label */}
      <div className="flex justify-between px-3 pb-2 pt-1">
        <span className="text-[10px] font-bold text-gray-400">DSR</span>
        <span className="text-[10px] font-bold text-gray-500 tracking-widest">↓ AUDIENCE / FOH</span>
        <span className="text-[10px] font-bold text-gray-400">DSL</span>
      </div>
    </div>
  );
}

export default function TechnicalRider() {
  // In a future version, slug comes from searchParams (?band=loosely-covered)
  // For now, always loads the default band
  const band = getBand();

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans text-gray-900">
      <div className="max-w-4xl mx-auto space-y-12">

        {/* Header */}
        <header className="text-center border-b pb-8">
          <h1 className="text-4xl font-black tracking-tight uppercase">{band.name}</h1>
          <p className="text-lg font-semibold text-gray-700 mt-1 uppercase tracking-wide">Technical Rider</p>
          <p className="text-xl text-gray-500 mt-1">{band.lineup} | Stage Plot &amp; Input List</p>
        </header>

        {/* Stage Plot */}
        <section>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <span className="w-8 h-8 bg-black text-white flex items-center justify-center rounded text-sm">1</span>
            Stage Plot
          </h2>
          <StagePlot band={band} />
        </section>

        {/* Input List */}
        <section>
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

        {/* Monitor Mixes + Notes */}
        <section className="grid md:grid-cols-2 gap-8">
          <div>
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

          <div>
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

      </div>
    </div>
  );
}
