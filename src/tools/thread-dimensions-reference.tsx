import { useMemo } from 'react'
import { CsvButton, Note, num, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { basic, bestDrill, DRILLS, drillFor, identify, THREADS, threadPct, type Thread } from './lib/thread-dimensions-reference'

type Std = 'all' | 'metric' | 'unified'
interface State { q: string; std: Std; fine: boolean; sel: string; unit: 'mm' | 'in'; pct: number; mD: number; mP: number; mUnit: 'mm' | 'tpi' }
const DEF: State = { q: '', std: 'all', fine: true, sel: 'M8', unit: 'mm', pct: 75, mD: 9.9, mP: 1.5, mUnit: 'mm' }

function Profile({ t }: { t: Thread }) {
  // one-and-a-half pitches of the basic 60° profile, scaled to the box
  const b = basic(t)
  const W = 320, Hh = 150, P = t.p, s = 200 / (2 * P)
  const H = b.H
  const y = (v: number) => 20 + v * s
  const pts: string[] = []
  for (let k = -1; k <= 2; k++) {
    const x0 = 60 + k * P * s
    // basic profile: crest flat P/8 at major, flanks 5P/16 wide, root flat P/4 at minor (5H/8 deep)
    pts.push(`${x0},${y(H / 8)}`, `${x0 + (P / 8) * s},${y(H / 8)}`, `${x0 + ((7 * P) / 16) * s},${y((3 * H) / 4)}`, `${x0 + ((11 * P) / 16) * s},${y((3 * H) / 4)}`)
  }
  const pdY = y(H / 8 + (3 * H) / 8)
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} style={{ width: '100%', maxWidth: 420 }} role="img" aria-label="Thread profile">
      <defs><clipPath id="tclip"><rect x={40} y={0} width={240} height={Hh} /></clipPath></defs>
      <polygon points={`40,${Hh - 10} ${pts.join(' ')} 280,${Hh - 10}`} fill="var(--accent)" opacity={0.18} clipPath="url(#tclip)" />
      <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2} clipPath="url(#tclip)" />
      <line x1={40} x2={280} y1={y(H / 8)} y2={y(H / 8)} stroke="var(--muted)" strokeDasharray="3 3" />
      <line x1={40} x2={280} y1={pdY} y2={pdY} stroke="#10b981" strokeDasharray="5 3" />
      <line x1={40} x2={280} y1={y((3 * H) / 4)} y2={y((3 * H) / 4)} stroke="var(--muted)" strokeDasharray="3 3" />
      <text x={284} y={y(H / 8) + 4} fontSize={10} fill="var(--muted)">major</text>
      <text x={284} y={pdY + 4} fontSize={10} fill="#10b981">pitch Ø</text>
      <text x={284} y={y((3 * H) / 4) + 4} fontSize={10} fill="var(--muted)">minor</text>
      <line x1={60} x2={60 + P * s} y1={Hh - 8} y2={Hh - 8} stroke="currentColor" />
      <text x={60 + (P * s) / 2} y={Hh - 12} fontSize={10} textAnchor="middle" fill="currentColor">P = {num(t.p, 4)} mm</text>
      <text x={150} y={y(H / 8) - 4} fontSize={10} textAnchor="middle" fill="var(--muted)">60°</text>
    </svg>
  )
}

export default function ThreadDimensionsReference() {
  const [s, set] = useToolState('thread-dimensions-reference', DEF)
  const L = (mm: number, d = 3) => (!Number.isFinite(mm) ? '—' : s.unit === 'mm' ? num(mm, d) : num(mm / 25.4, 4))
  const list = useMemo(() => {
    const q = s.q.trim().toLowerCase().replace(/\s+/g, '')
    return THREADS.filter((t) => (s.std === 'all' || t.std === s.std) && (s.fine || t.series === 'coarse' || t.series === 'UNC') && (!q || t.name.toLowerCase().replace(/\s+/g, '').includes(q) || t.id.toLowerCase().includes(q)))
  }, [s.q, s.std, s.fine])
  const t = THREADS.find((x) => x.id === s.sel) ?? THREADS[0]
  const b = basic(t)
  const set1 = t.std === 'metric' ? DRILLS.metric : DRILLS.inch
  const best = bestDrill(t, set1, s.pct)
  const alt = bestDrill(t, t.std === 'metric' ? DRILLS.inch : DRILLS.metric, s.pct)
  const exact = drillFor(t, s.pct)
  const ids = identify(s.mD, s.mUnit === 'mm' ? s.mP : 25.4 / s.mP)
  const u = s.unit

  return (
    <Split wide="right">
      <div>
        <Panel title="Find a thread">
          <input className="k-text" style={{ width: '100%' }} placeholder="Search: M8, 1/4-20, #10, UNF…" value={s.q} onChange={(e) => set({ q: e.target.value })} aria-label="Search threads" />
          <div style={{ margin: '8px 0' }}>
            <Seg value={s.std} onChange={(std) => set({ std })} options={[['all', 'All'], ['metric', 'ISO metric'], ['unified', 'Unified (UNC/UNF)']]} />
          </div>
          <Row>
            <label className="k-check"><input type="checkbox" checked={s.fine} onChange={(e) => set({ fine: e.target.checked })} /> Include fine pitches</label>
            <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['mm', 'mm'], ['in', 'inch']]} />
          </Row>
          <div style={{ maxHeight: 520, overflow: 'auto', marginTop: 8 }}>
            <Table
              head={['Thread', `Ø ${u}`, 'Pitch', `Tap drill`, `Clear. ${u}`]}
              rows={list.map((x) => {
                const bd = bestDrill(x, x.std === 'metric' ? DRILLS.metric : DRILLS.inch)
                return [
                  <button key="n" type="button" className="k-btn ghost" style={{ fontWeight: x.id === t.id ? 700 : 400, padding: '2px 6px' }} onClick={() => set({ sel: x.id })}>{x.name}</button>,
                  L(x.d, 2), x.tpi ? `${x.tpi} TPI` : `${x.p} mm`, bd.name.replace(/ \(.*\)/, ''), L(x.clear[1], 2),
                ]
              })}
            />
          </div>
          <p className="muted" style={{ fontSize: 12 }}>{list.length} threads · tap drill for ≈75 % thread · normal (medium) clearance hole.</p>
        </Panel>
        <Panel title="Identify a thread from measurements">
          <Row>
            <Num label="Measured outside Ø" value={s.mD} onChange={(mD) => set({ mD })} unit="mm" min={0} />
            <Num label={s.mUnit === 'mm' ? 'Pitch' : 'Threads per inch'} value={s.mP} onChange={(mP) => set({ mP })} unit={s.mUnit === 'mm' ? 'mm' : 'TPI'} min={0.1} />
          </Row>
          <Seg value={s.mUnit} onChange={(mUnit) => set({ mUnit })} options={[['mm', 'Pitch in mm'], ['tpi', 'Threads per inch']]} />
          <Table head={['Candidate', 'Ø mm', 'Pitch mm', 'Match']} rows={ids.map(({ t: x, score }) => [
            <button key="n" type="button" className="k-btn ghost" style={{ padding: '2px 6px' }} onClick={() => set({ sel: x.id })}>{x.name}</button>, num(x.d, 3), num(x.p, 4), score < 0.03 ? '✓ strong' : score < 0.12 ? 'possible' : 'weak',
          ])} />
          <p className="muted" style={{ fontSize: 12 }}>Bolts measure slightly under nominal (M10 ≈ 9.8–9.97 mm). Count crests over 10 pitches with a ruler or use a pitch gauge.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Thread" value={t.name} sub={t.std === 'metric' ? `ISO metric ${t.series}` : `Unified ${t.series} · ${num(t.d / 25.4, 4)}"`} tone="accent" />
          <Stat label="Tap drill" value={best.name.replace(/ \(.*\)/, '')} sub={`${num(best.mm, 3)} mm · ${num(best.pct, 0)} % thread`} />
          <Stat label="Clearance hole" value={`${L(t.clear[1], 2)} ${u}`} sub={`close ${L(t.clear[0], 2)}${Number.isFinite(t.clear[2]) ? ` · loose ${L(t.clear[2], 2)}` : ''}`} />
          <Stat label="Stress area" value={`${num(b.stress, 2)} mm²`} sub={`${num(b.stress / 645.16, 4)} in²`} />
        </Stats>
        <Panel title={`Basic dimensions (${u})`}>
          <Split>
            <Table
              head={['Dimension', u]}
              rows={[
                ['Major diameter (d, D)', L(t.d, 4)],
                ['Pitch', `${L(t.p, 4)}${t.tpi ? ` (${t.tpi} TPI)` : ''}`],
                ['Pitch diameter (d₂)', L(b.pitchDia, 4)],
                ['Minor Ø, external (d₃)', L(b.minorExt, 4)],
                ['Minor Ø, internal (D₁)', L(b.minorInt, 4)],
                ['Thread depth, external (h₃)', L(b.depthExt, 4)],
                ['Thread depth, internal (H₁)', L(b.depthInt, 4)],
                ['Fundamental triangle (H)', L(b.H, 4)],
              ]}
            />
            <div><Profile t={t} /></div>
          </Split>
          <p className="muted" style={{ fontSize: 12 }}>Basic profile values (no tolerance class). Bolts (6g / 2A) are slightly smaller, nuts (6H / 2B) slightly larger.</p>
        </Panel>
        <Panel title="Tap drill calculator">
          <Slider label="Target thread engagement" value={s.pct} min={50} max={90} unit=" %" onChange={(pct) => set({ pct })} show={(v) => num(v, 0)} />
          <Table
            head={['Option', 'Drill', 'mm', 'in', 'Thread %']}
            rows={[
              ['Exact size', '—', num(exact, 3), num(exact / 25.4, 4), `${s.pct} %`],
              ['Nearest standard', best.name, num(best.mm, 3), num(best.mm / 25.4, 4), `${num(best.pct, 0)} %`],
              [t.std === 'metric' ? 'Nearest inch drill' : 'Nearest metric drill', alt.name, num(alt.mm, 3), num(alt.mm / 25.4, 4), `${num(threadPct(t, alt.mm), 0)} %`],
              ['Minor Ø (100 %)', '—', num(b.minorInt, 3), num(b.minorInt / 25.4, 4), '100 %'],
            ]}
          />
          <Note>65–75 % engagement gives ~95 % of full strength with much lower tapping torque. Use ~60 % for hard or tough materials and deep holes; 75–80 % for soft metals, thin sheet or plastics. For form (roll) taps drill larger: about d − P/2.</Note>
        </Panel>
        <Panel title="Export" actions={<CsvButton name="threads.csv" rows={() => [['Thread', 'Standard', 'Series', 'Major mm', 'Pitch mm', 'TPI', 'Pitch dia mm', 'Minor ext mm', 'Minor int mm', 'Tap drill', 'Tap drill mm', 'Close mm', 'Normal mm', 'Loose mm'], ...list.map((x) => { const bb = basic(x), bd = bestDrill(x, x.std === 'metric' ? DRILLS.metric : DRILLS.inch); return [x.name, x.std, x.series, +x.d.toFixed(4), +x.p.toFixed(4), x.tpi ?? '', +bb.pitchDia.toFixed(4), +bb.minorExt.toFixed(4), +bb.minorInt.toFixed(4), bd.name, +bd.mm.toFixed(3), +x.clear[0].toFixed(2), +x.clear[1].toFixed(2), Number.isFinite(x.clear[2]) ? +x.clear[2].toFixed(2) : ''] })]} />}>
          <p className="muted" style={{ margin: 0 }}>Download the filtered list with all derived dimensions as CSV. Data: ISO 261/262 sizes, ISO 68-1 profile, ISO 273 clearance holes; ASME B1.1 unified sizes, ASME B18.2.8 clearance holes.</p>
        </Panel>
      </div>
    </Split>
  )
}
