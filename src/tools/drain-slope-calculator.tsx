import { Btn, CsvButton, download, Note, num, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { fromFrac, inchFraction, inverts, manningFull, minSlopeIPC, ROUGHNESS, SLOPE_UNITS, toFrac, type SlopeUnit } from './lib/drain-slope-calculator'

type Sys = 'imp' | 'met'
interface SegRow { id: string; name: string; length: number; slope: number; ground: number }
interface S { sys: Sys; unit: SlopeUnit; mode: 'slope' | 'ends'; start: number; end: number; startGround: number; dia: number; n: number; segs: SegRow[]; quick: number; quickUnit: SlopeUnit }

const DEF: S = {
  sys: 'imp', unit: 'inft', mode: 'slope', start: 98.5, end: 96.5, startGround: 100, dia: 4, n: 0.009,
  segs: [
    { id: 'a', name: 'House → cleanout', length: 12, slope: 0.25 / 12, ground: 99.7 },
    { id: 'b', name: 'Cleanout → yard', length: 45, slope: 0.25 / 12, ground: 99.0 },
    { id: 'c', name: 'Yard → street tap', length: 28, slope: 0.125 / 12, ground: 98.2 },
  ],
  quick: 2, quickUnit: 'pct',
}

const fmtSlope = (s: number, u: SlopeUnit) => {
  const v = fromFrac(s, u)
  if (!Number.isFinite(v)) return 'flat'
  if (u === 'inft') return `${inchFraction(v)}" /ft (${num(v, 3)})`
  if (u === 'ratio') return `1 : ${num(v, 1)}`
  if (u === 'pct') return `${num(v, 2)} %`
  if (u === 'mmm') return `${num(v, 1)} mm/m`
  return `${num(v, 2)}°`
}

export default function DrainSlopeCalculator() {
  const [s, set, reset] = useToolState<S>('drain-slope-calculator', DEF)
  const imp = s.sys === 'imp'
  const lu = imp ? 'ft' : 'm'
  const totalLen = s.segs.reduce((a, x) => a + Math.max(0, x.length), 0)
  const uniform = totalLen > 0 ? (s.start - s.end) / totalLen : 0
  const segs = s.segs.map((x) => ({ ...x, length: Math.max(0, x.length), slope: s.mode === 'ends' ? uniform : x.slope }))
  const nodes = inverts(s.start, segs)
  const drop = s.start - nodes[nodes.length - 1].invert
  const overall = totalLen ? drop / totalLen : 0
  const Dm = imp ? (s.dia * 25.4) / 1000 : s.dia / 1000
  const Din = imp ? s.dia : s.dia / 25.4
  const Dlen = imp ? s.dia / 12 : s.dia / 1000 // pipe Ø in length units
  const minS = minSlopeIPC(Din)
  const grounds = [s.startGround, ...s.segs.map((x) => x.ground)]
  const covers = nodes.map((nd, i) => grounds[i] - (nd.invert + Dlen))
  const flows = segs.map((x) => manningFull(Dm, x.slope, s.n))
  const vMin = 0.6, vMax = 3
  const q = (Q: number) => (imp ? `${num(Q * 15850.3, 0)} gpm` : `${num(Q * 1000, 1)} L/s`)
  const v = (V: number) => (imp ? `${num(V * 3.28084, 2)} ft/s` : `${num(V, 2)} m/s`)
  const e = (x: number) => num(x, imp ? 2 : 3)

  const edit = (id: string, p: Partial<SegRow>) => set({ segs: s.segs.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const switchSys = (sys: Sys) => {
    if (sys === s.sys) return
    const k = sys === 'met' ? 0.3048 : 1 / 0.3048
    const r = (x: number) => Math.round(x * k * 1000) / 1000
    set({ sys, unit: sys === 'met' ? 'mmm' : 'inft', start: r(s.start), end: r(s.end), startGround: r(s.startGround), dia: sys === 'met' ? Math.round(s.dia * 25.4) : Math.round((s.dia / 25.4) * 2) / 2, segs: s.segs.map((x) => ({ ...x, length: r(x.length), ground: r(x.ground) })) })
  }

  // profile drawing
  const W = 800, H = 280, Lm = 56, Rm = 16, Tm = 20, Bm = 34
  const ys = [...nodes.map((nd) => nd.invert), ...nodes.map((nd) => nd.invert + Dlen), ...grounds]
  const y0 = Math.min(...ys) - Dlen, y1 = Math.max(...ys) + Dlen * 0.5
  const sx = (x: number) => Lm + (x / (totalLen || 1)) * (W - Lm - Rm)
  const sy = (y: number) => Tm + (1 - (y - y0) / (y1 - y0 || 1)) * (H - Tm - Bm)
  const exag = ((H - Tm - Bm) / (y1 - y0 || 1)) / ((W - Lm - Rm) / (totalLen || 1))
  const pipeTop = nodes.map((nd) => `${sx(nd.x)},${sy(nd.invert + Dlen)}`).join(' ')
  const pipeBot = [...nodes].reverse().map((nd) => `${sx(nd.x)},${sy(nd.invert)}`).join(' ')
  const svg = (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="pipe profile" xmlns="http://www.w3.org/2000/svg">
      <polygon points={`${Lm},${H - Bm} ${nodes.map((nd, i) => `${sx(nd.x)},${sy(grounds[i])}`).join(' ')} ${W - Rm},${H - Bm}`} fill="#a16207" opacity={0.18} />
      <polyline points={nodes.map((nd, i) => `${sx(nd.x)},${sy(grounds[i])}`).join(' ')} fill="none" stroke="#65a30d" strokeWidth={3} />
      <polygon points={`${pipeTop} ${pipeBot}`} fill="#0ea5e9" opacity={0.85} />
      {nodes.map((nd, i) => (
        <g key={i}>
          <line x1={sx(nd.x)} x2={sx(nd.x)} y1={sy(grounds[i])} y2={sy(nd.invert)} stroke="#64748b" strokeDasharray="3 3" />
          <circle cx={sx(nd.x)} cy={sy(nd.invert)} r={4} fill="#0369a1" />
          <text x={sx(nd.x) + (i === nodes.length - 1 ? -6 : 6)} y={sy(nd.invert) + 18} fontSize={12} fill="currentColor" textAnchor={i === nodes.length - 1 ? 'end' : 'start'}>IE {e(nd.invert)}</text>
          <text x={sx(nd.x) + (i === nodes.length - 1 ? -6 : 6)} y={sy(grounds[i]) - 6} fontSize={11} fill="#65a30d" textAnchor={i === nodes.length - 1 ? 'end' : 'start'}>GL {e(grounds[i])}</text>
        </g>
      ))}
      {segs.map((x, i) => (
        <text key={x.id} x={(sx(nodes[i].x) + sx(nodes[i + 1].x)) / 2} y={H - 14} fontSize={11} textAnchor="middle" fill="currentColor">{num(x.length, 1)} {lu} @ {fmtSlope(x.slope, s.unit).split(' (')[0]}</text>
      ))}
      <text x={W - Rm} y={14} fontSize={11} fill="currentColor" opacity={0.6} textAnchor="end">Vertical exaggeration ×{num(exag, 0)}</text>
    </svg>
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Pipe" actions={<Seg value={s.sys} onChange={switchSys} options={[['imp', 'ft / in'], ['met', 'm / mm']]} />}>
          <Row>
            <Num label="Pipe diameter" value={s.dia} onChange={(dia) => set({ dia })} unit={imp ? 'in' : 'mm'} min={0.5} />
            <Select label="Material (Manning n)" value={s.n} onChange={(n) => set({ n })} options={ROUGHNESS.map(([l, n]) => [n, `${l} — ${n}`] as [number, string])} />
          </Row>
          <Select label="Slope unit" value={s.unit} onChange={(unit) => set({ unit })} options={SLOPE_UNITS} />
        </Panel>
        <Panel title="Elevations" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['slope', 'Slopes → drop'], ['ends', 'Two inverts → slope']]} />
          <Row>
            <Num label="Start invert (upstream)" value={s.start} onChange={(start) => set({ start })} unit={lu} />
            {s.mode === 'ends' && <Num label="End invert (downstream)" value={s.end} onChange={(end) => set({ end })} unit={lu} />}
            <Num label="Ground at start" value={s.startGround} onChange={(startGround) => set({ startGround })} unit={lu} />
          </Row>
        </Panel>
        <Panel title="Runs">
          {s.segs.map((x) => (
            <div key={x.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 6, marginTop: 6 }}>
              <Row>
                <Txt label="Run" value={x.name} onChange={(name) => edit(x.id, { name })} />
                <Btn kind="ghost" onClick={() => set({ segs: s.segs.filter((z) => z.id !== x.id) })} title="Remove run">✕</Btn>
              </Row>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                <Num label="Length" value={x.length} onChange={(length) => edit(x.id, { length })} unit={lu} min={0} />
                {s.mode === 'slope'
                  ? <Num label={`Slope (${SLOPE_UNITS.find(([u]) => u === s.unit)![1]})`} value={+fromFrac(x.slope, s.unit).toFixed(4)} onChange={(val) => edit(x.id, { slope: toFrac(val, s.unit) })} min={0} />
                  : <Txt label="Slope" value={fmtSlope(uniform, s.unit)} onChange={() => undefined} />}
                <Num label="Ground at end" value={x.ground} onChange={(ground) => edit(x.id, { ground })} unit={lu} />
              </div>
            </div>
          ))}
          <Btn onClick={() => set({ segs: [...s.segs, { id: uid(), name: `Run ${s.segs.length + 1}`, length: imp ? 20 : 6, slope: s.segs[s.segs.length - 1]?.slope ?? 0.02, ground: s.segs[s.segs.length - 1]?.ground ?? s.startGround }] })}>+ Run</Btn>
        </Panel>
        <Panel title="Quick slope converter">
          <Row>
            <Num label="Value" value={s.quick} onChange={(quick) => set({ quick })} min={0} />
            <Select label="Unit" value={s.quickUnit} onChange={(quickUnit) => set({ quickUnit })} options={SLOPE_UNITS} />
          </Row>
          <Table head={['Unit', 'Equivalent']} rows={SLOPE_UNITS.map(([u, l]) => [l, fmtSlope(toFrac(s.quick, s.quickUnit), u)])} />
          <p className="muted" style={{ fontSize: 12 }}>Drop over 10 {lu}: {num(toFrac(s.quick, s.quickUnit) * 10 * (imp ? 12 : 1000), 2)} {imp ? 'in' : 'mm'}</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Total drop" value={imp ? `${num(drop * 12, 2)} in` : `${num(drop * 1000, 0)} mm`} sub={`${e(drop)} ${lu} over ${num(totalLen, 1)} ${lu}`} tone="accent" />
          <Stat label="Overall slope" value={fmtSlope(overall, s.unit).split(' (')[0]} sub={`${s.unit === 'inft' ? num(overall * 12, 3) + ' in/ft · ' : ''}${fmtSlope(overall, 'pct')} · ${fmtSlope(overall, 'ratio')}`} />
          <Stat label="Outlet invert" value={`${e(nodes[nodes.length - 1].invert)} ${lu}`} />
          <Stat label="Min. cover" value={`${imp ? num(Math.min(...covers) * 12, 1) + ' in' : num(Math.min(...covers) * 100, 0) + ' cm'}`} tone={Math.min(...covers) < (imp ? 1 : 0.3) ? 'bad' : 'good'} sub={`ground to pipe crown${Math.min(...covers) < (imp ? 1 : 0.3) ? ` · aim for ≥ ${imp ? "12 in" : "30 cm"}` : ""}`} />
        </Stats>
        <Panel title="Profile" actions={<Btn onClick={() => download('drain-profile.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="color:#0f172a;font-family:sans-serif">${document.querySelector('#drain-profile svg')?.innerHTML ?? ''}</svg>`, 'image/svg+xml')}>⬇ SVG</Btn>}>
          <div id="drain-profile">{svg}</div>
        </Panel>
        <Panel title="Invert schedule" actions={<CsvButton name="drain-inverts.csv" rows={() => [['Node', `Distance ${lu}`, `Invert ${lu}`, `Ground ${lu}`, `Cover ${lu}`], ...nodes.map((nd, i) => [i === 0 ? 'Start' : s.segs[i - 1].name, +nd.x.toFixed(3), +nd.invert.toFixed(4), grounds[i], +covers[i].toFixed(3)])]} />}>
          <Table
            head={['Run', 'Length', 'Slope', 'Drop', 'Invert in → out', 'Full-flow', 'Check']}
            rows={segs.map((x, i) => {
              const ok = x.slope >= minS - 1e-9
              const vel = flows[i].V
              return [
                x.name, `${num(x.length, 1)} ${lu}`, fmtSlope(x.slope, s.unit), imp ? `${num(x.length * x.slope * 12, 2)} in` : `${num(x.length * x.slope * 1000, 0)} mm`,
                `${e(nodes[i].invert)} → ${e(nodes[i + 1].invert)}`,
                <span key="f">{q(flows[i].Q)}<br /><span className="muted">{v(vel)}</span></span>,
                <span key="c" style={{ color: !ok || vel < vMin || vel > vMax ? 'var(--warn)' : 'var(--ok)' }}>
                  {!ok ? `Below min ${inchFraction(minS * 12)}"/ft` : vel < vMin ? 'Slow (<0.6 m/s)' : vel > vMax ? 'Fast (>3 m/s)' : '✓ OK'}
                </span>,
              ]
            })}
          />
          <p className="muted" style={{ fontSize: 12 }}>
            Minimum slope for a {num(Din, 1)}" pipe per IPC/UPC: {inchFraction(minS * 12)}" per ft ({fmtSlope(minS, 'pct')}, {fmtSlope(minS, 'ratio')}). Self-cleansing velocity ≥ 0.6 m/s (2 ft/s) when flowing full; Manning n = {s.n}.
          </p>
        </Panel>
        {covers.some((c) => c < 0) && <Note tone="err">The pipe comes above ground level at one node — raise the ground, deepen the start or reduce the slope.</Note>}
        {overall > 0.0834 && <Note tone="warn">Slopes steeper than 1" per ft can let water outrun solids; consider a drop fitting instead.</Note>}
      </div>
    </Split>
  )
}
