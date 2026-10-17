import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { Btn, CopyButton, CsvButton, LineChart, Note, Num, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, Table, download, useToolState } from '../kit'
import { crossing, design, eng, response, sweep, type Design, type ESeries, type Family, type Kind, type Part, type Topology } from './lib/filter-designer'

const DEF = { fam: 'butterworth' as Family, kind: 'lowpass' as Kind, topology: 'sk' as Topology, order: 4, fc: 1000, ripple: 1, rTarget: 10000, rSeries: 'E24' as ESeries, cSeries: 'E12' as ESeries, fs: 5000 }
const UNIT = { R: 'Ω', C: 'F', L: 'H' }
const SER: [ESeries, string][] = [['E6', 'E6 (20%)'], ['E12', 'E12 (10%)'], ['E24', 'E24 (5%)'], ['E96', 'E96 (1%)'], ['exact', 'Exact']]

// ---------- schematic primitives ----------
const STROKE = { stroke: 'var(--fg)', strokeWidth: 1.6, fill: 'none' }
function Comp({ k, x1, y1, x2, y2, label, side = -1 }: { k: 'R' | 'C' | 'L'; x1: number; y1: number; x2: number; y2: number; label: string; side?: number }) {
  const len = Math.hypot(x2 - x1, y2 - y1)
  const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI
  const body = k === 'R' ? <polyline points="-15,0 -12,-5 -6,5 0,-5 6,5 12,-5 15,0" />
    : k === 'C' ? <><path d="M-15,0H-3M3,0H15" /><path d="M-3,-9V9M3,-9V9" strokeWidth={2.4} /></>
    : <path d="M-15,0a3.75,3.75 0 0 1 7.5,0a3.75,3.75 0 0 1 7.5,0a3.75,3.75 0 0 1 7.5,0a3.75,3.75 0 0 1 7.5,0" />
  const vert = Math.abs(y2 - y1) > Math.abs(x2 - x1)
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  return (
    <g>
      <g transform={`translate(${mx},${my}) rotate(${ang})`} {...STROKE}>
        <path d={`M${-len / 2},0H-15M15,0H${len / 2}`} />
        {body}
      </g>
      <text x={vert ? mx + (side < 0 ? -12 : 12) : mx} y={vert ? my + 4 : my - 12} fontSize={10.5} textAnchor={vert ? (side < 0 ? 'end' : 'start') : 'middle'} fill="var(--fg)">{label}</text>
    </g>
  )
}
const W = ({ d }: { d: string }) => <path d={d} {...STROKE} />
const Dot = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={2.6} fill="var(--fg)" />
const Gnd = ({ x, y }: { x: number; y: number }) => <path d={`M${x},${y}v4M${x - 9},${y + 4}h18M${x - 5.5},${y + 8}h11M${x - 2},${y + 12}h4`} {...STROKE} />
const OpAmp = ({ x, y }: { x: number; y: number }) => (
  <g>
    <path d={`M${x},${y - 30}L${x + 60},${y}L${x},${y + 30}Z`} {...STROKE} />
    <text x={x + 5} y={y - 6} fontSize={13} fill="var(--fg)">+</text>
    <text x={x + 6} y={y + 16} fontSize={13} fill="var(--fg)">−</text>
  </g>
)

const lbl = (p: Part) => `${p.ref} ${eng(p.value, UNIT[p.kind])}`

function StageSvg({ d, i }: { d: Design; i: number }): ReactNode {
  const st = d.stages[i]
  const ox = i * 300
  const lp = d.kind === 'lowpass'
  const [a, b, c, e] = st.parts
  const amp = (
    <>
      <OpAmp x={ox + 150} y={70} />
      <W d={`M${ox + 150},80H${ox + 140}V112H${ox + 225}V70`} />
      <W d={`M${ox + 210},70H${ox + 270}V60H${ox + 300}`} />
      <Dot x={ox + 225} y={70} />
    </>
  )
  if (st.type === 'rc')
    return (
      <g key={i}>
        <Comp k={lp ? 'R' : 'C'} x1={ox} y1={60} x2={ox + 80} y2={60} label={lbl(lp ? a : b)} />
        <W d={`M${ox + 80},60H${ox + 150}`} />
        <Dot x={ox + 100} y={60} />
        <Comp k={lp ? 'C' : 'R'} x1={ox + 100} y1={60} x2={ox + 100} y2={130} label={lbl(lp ? b : a)} />
        <Gnd x={ox + 100} y={130} />
        {amp}
      </g>
    )
  return (
    <g key={i}>
      <Comp k={lp ? 'R' : 'C'} x1={ox} y1={60} x2={ox + 60} y2={60} label={lbl(a)} side={1} />
      <Comp k={lp ? 'R' : 'C'} x1={ox + 60} y1={60} x2={ox + 120} y2={60} label={lbl(b)} side={1} />
      <W d={`M${ox + 120},60H${ox + 150}M${ox + 60},60V24`} />
      <Dot x={ox + 60} y={60} />
      <Dot x={ox + 120} y={60} />
      <Comp k={lp ? 'C' : 'R'} x1={ox + 60} y1={24} x2={ox + 240} y2={24} label={lbl(c)} />
      <W d={`M${ox + 240},24V70`} />
      <Dot x={ox + 240} y={70} />
      <Comp k={lp ? 'C' : 'R'} x1={ox + 120} y1={60} x2={ox + 120} y2={136} label={lbl(e)} side={-1} />
      <Gnd x={ox + 120} y={136} />
      {amp}
    </g>
  )
}

function Schematic({ d }: { d: Design }) {
  if (d.topology === 'lc') {
    const n = d.ladder.length
    const w = 120 + n * 70 + 70
    const x = 100 + n * 70
    return (
      <svg viewBox={`-10 0 ${w} 170`} style={{ width: '100%', minWidth: Math.min(w, 700) }}>
        <circle cx={10} cy={95} r={12} {...STROKE} />
        <text x={10} y={99} fontSize={11} textAnchor="middle" fill="var(--fg)">~</text>
        <W d="M10,83V60" />
        <W d="M10,107V150" />
        <Gnd x={10} y={150} />
        <Comp k="R" x1={10} y1={60} x2={100} y2={60} label={`R₀ ${eng(d.r0, 'Ω')}`} />
        {d.ladder.map((p, i) => {
          const x0 = 100 + i * 70
          return p.role === 'series' ? (
            <Comp key={p.ref} k={p.kind} x1={x0} y1={60} x2={x0 + 70} y2={60} label={lbl(p)} />
          ) : (
            <g key={p.ref}>
              <W d={`M${x0},60H${x0 + 70}`} />
              <Dot x={x0 + 35} y={60} />
              <Comp k={p.kind} x1={x0 + 35} y1={60} x2={x0 + 35} y2={140} label={lbl(p)} side={1} />
              <Gnd x={x0 + 35} y={140} />
            </g>
          )
        })}
        <W d={`M${x},60H${x + 40}`} />
        <Comp k="R" x1={x + 40} y1={60} x2={x + 40} y2={140} label={`R_L ${eng(d.rl, 'Ω')}`} side={1} />
        <Gnd x={x + 40} y={140} />
      </svg>
    )
  }
  const w = d.stages.length * 300 + 20
  return (
    <svg viewBox={`-20 0 ${w + 20} 160`} style={{ width: '100%', minWidth: Math.min(w, 640) }}>
      <text x={-16} y={56} fontSize={11} fill="var(--muted)">in</text>
      {d.stages.map((_, i) => <StageSvg key={i} d={d} i={i} />)}
      <text x={d.stages.length * 300 - 4} y={54} fontSize={11} fill="var(--muted)" textAnchor="end">out</text>
    </svg>
  )
}

export default function FilterDesigner() {
  const [s, set, reset] = useToolState('filter-designer', DEF)
  const order = s.topology === 'rc' ? 1 : s.order
  const fc = s.fc > 0 ? s.fc : 1000
  const d = useMemo(() => design({ ...s, fc, order, rTarget: s.rTarget > 0 ? s.rTarget : 10000 }), [s, fc, order])
  const lo = fc / 100, hi = fc * 100
  const real = useMemo(() => sweep(d, lo, hi, 320), [d, lo, hi])
  const ideal = useMemo(() => sweep(d, lo, hi, 320, true), [d, lo, hi])
  const f3 = crossing(d, -3.0103, lo, hi)
  const att = (() => { const h = response(d, s.fs); return -20 * Math.log10(Math.hypot(h[0], h[1])) })()
  const dev = Math.max(0, ...real.map((p, i) => Math.abs(p.db - ideal[i].db)).filter((_v, i) => ideal[i].db > -40))
  const parts = d.topology === 'lc' ? d.ladder : d.stages.flatMap((st) => st.parts)
  const lf = (v: number) => eng(10 ** v, 'Hz')
  const bom = () => [['Ref', 'Type', 'Ideal', 'Chosen', 'Error %'], ...parts.map((p) => [p.ref, p.kind, eng(p.ideal, UNIT[p.kind]), eng(p.value, UNIT[p.kind]), (((p.value - p.ideal) / p.ideal) * 100).toFixed(2)])]
  const svgOut = () => {
    const el = document.querySelector('#fd-schematic svg')
    if (!el) return
    const cl = el.cloneNode(true) as SVGElement
    cl.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    download('filter-schematic.svg', `<?xml version="1.0"?>\n${cl.outerHTML.replaceAll('var(--fg)', '#111').replaceAll('var(--muted)', '#666')}`, 'image/svg+xml')
  }

  return (
    <Split>
      <div>
        <Panel title="Specification" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.kind} onChange={(kind) => set({ kind })} options={[['lowpass', 'Low-pass'], ['highpass', 'High-pass']]} />
          <div style={{ height: 10 }} />
          <Seg value={s.topology} onChange={(topology) => set({ topology })} options={[['rc', 'RC (1st order)'], ['sk', 'Active Sallen-Key'], ['lc', 'Passive LC']]} />
          <Select label="Response" value={s.fam} onChange={(fam) => set({ fam })} options={[['butterworth', 'Butterworth (maximally flat)'], ['chebyshev', 'Chebyshev type I (ripple)']]} />
          {s.topology !== 'rc' && <Slider label="Order" value={s.order} min={1} max={s.topology === 'lc' ? 9 : 8} onChange={(o) => set({ order: o })} show={(v) => `${v} (${v * 20} dB/decade)`} />}
          <Row>
            <Num label={s.fam === 'chebyshev' ? 'Ripple-band edge' : 'Cutoff (−3 dB)'} value={s.fc} onChange={(v) => set({ fc: v })} unit="Hz" min={0.001} />
            {s.fam === 'chebyshev' && <Num label="Passband ripple" value={s.ripple} onChange={(ripple) => set({ ripple: Math.max(0.01, ripple) })} unit="dB" min={0.01} max={6} />}
          </Row>
          <Row>
            <Num label={s.topology === 'lc' ? 'System impedance R₀' : 'Target resistance'} value={s.rTarget} onChange={(rTarget) => set({ rTarget })} unit="Ω" min={1} />
            <Num label="Check attenuation at" value={s.fs} onChange={(fs) => set({ fs })} unit="Hz" min={0.001} />
          </Row>
          <Row>
            <Select label="Resistor series" value={s.rSeries} onChange={(rSeries) => set({ rSeries })} options={SER} />
            <Select label={s.topology === 'lc' ? 'L / C series' : 'Capacitor series'} value={s.cSeries} onChange={(cSeries) => set({ cSeries })} options={SER} />
          </Row>
          <Row>
            <Btn onClick={() => set({ ...DEF, topology: 'lc', order: 5, fc: 10e6, rTarget: 50, fs: 30e6, cSeries: 'E24' })}>RF 50 Ω LC</Btn>
            <Btn onClick={() => set({ ...DEF, fam: 'chebyshev', order: 6, fc: 3400, ripple: 0.5, fs: 8000 })}>Voice band</Btn>
            <Btn onClick={() => set({ ...DEF, kind: 'highpass', order: 2, fc: 20, fs: 5 })}>Audio HPF</Btn>
          </Row>
        </Panel>
        <Panel title="Sections">
          {d.topology === 'lc' ? (
            <Note>Doubly-terminated ladder (shunt element first). Source R₀ = {eng(d.r0, 'Ω')}, load R_L = {eng(d.rl, 'Ω')}{d.rl !== d.r0 ? ' (even-order Chebyshev needs an unequal load)' : ''}.</Note>
          ) : (
            <Table head={['Stage', 'Type', 'f₀', 'Q']} rows={d.stages.map((st, i) => [i + 1, st.type === 'rc' ? '1st-order RC + buffer' : 'Sallen-Key unity gain', eng(st.f0, 'Hz'), st.Q.toFixed(4)])} />
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="−3 dB frequency" value={f3 ? eng(f3, 'Hz') : '—'} sub="with chosen parts" tone="accent" />
          <Stat label={`Attenuation @ ${eng(s.fs, 'Hz')}`} value={`${att.toFixed(1)} dB`} />
          <Stat label="Max deviation" value={`${dev.toFixed(2)} dB`} sub="rounded vs ideal" tone={dev < 1 ? "good" : "bad"} />
          <Stat label="Parts" value={parts.length + (d.topology === 'lc' ? 0 : d.stages.length)} sub={d.topology === 'lc' ? 'L + C' : `${d.stages.length} op-amp(s)`} />
        </Stats>
        <Panel title="Bode plot — magnitude">
          <LineChart height={240} xLabel="frequency" yLabel="dB" fx={lf} fy={(v) => v.toFixed(0)} yMin={Math.max(-100, Math.min(...real.map((p) => p.db)))} yMax={Math.max(3, ...real.map((p) => p.db)) }
            markers={[{ x: Math.log10(fc), label: 'fc' }]}
            series={[{ name: 'Ideal', points: ideal.map((p) => [Math.log10(p.f), Math.max(-100, p.db)]), dashed: true, color: '#94a3b8' }, { name: 'Chosen parts', points: real.map((p) => [Math.log10(p.f), Math.max(-100, p.db)]), color: '#6366f1' }]} />
        </Panel>
        <Panel title="Bode plot — phase">
          <LineChart height={180} xLabel="frequency" yLabel="°" fx={lf} fy={(v) => v.toFixed(0)} series={[{ name: 'Phase', points: real.map((p) => [Math.log10(p.f), p.phase]), color: '#10b981' }]} />
        </Panel>
        <Panel title="Schematic" actions={<Btn onClick={svgOut}>⬇ SVG</Btn>}>
          <div id="fd-schematic" style={{ overflowX: 'auto' }}><Schematic d={d} /></div>
        </Panel>
        <Panel title="Bill of materials" actions={<><CsvButton name="filter-bom.csv" rows={bom} /><CopyButton text={() => bom().map((r) => r.join('\t')).join('\n')} /></>}>
          <Table head={['Ref', 'Ideal', 'Chosen', 'Error']} rows={parts.map((p) => {
            const e = ((p.value - p.ideal) / p.ideal) * 100
            return [<b key="r">{p.ref}</b>, eng(p.ideal, UNIT[p.kind]), eng(p.value, UNIT[p.kind]), <span key="e" style={{ color: Math.abs(e) > 5 ? 'var(--warn)' : 'var(--muted)' }}>{e >= 0 ? '+' : ''}{e.toFixed(1)}%</span>]
          })} />
          <Note>Sallen-Key low-pass uses equal resistors with C₁/C₂ = 4Q²; after rounding the capacitors the resistor value is recomputed to keep f₀. High-pass uses equal capacitors with R_ground/R_feedback = 4Q². Use C0G/NP0 capacitors and 1% resistors for high-Q stages.</Note>
        </Panel>
      </div>
    </Split>
  )
}
