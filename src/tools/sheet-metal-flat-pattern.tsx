import { Btn, Check, download, Note, num, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { bendAllowance, bendDeduction, flatPattern, kFactor, MATERIALS, setback } from './lib/sheet-metal-flat-pattern'

interface Fl { id: string; length: number; angle: number; up: boolean }
interface S { unit: 'mm' | 'in'; T: number; R: number; material: string; kAuto: boolean; K: number; dims: 'outside' | 'inside'; width: number; flanges: Fl[] }

const mk = (lens: number[], angles: [number, boolean][]): Fl[] => lens.map((length, i) => ({ id: uid(), length, angle: angles[i]?.[0] ?? 90, up: angles[i]?.[1] ?? true }))
const PRESETS: [string, number[], [number, boolean][]][] = [
  ['L-bracket', [40, 60], [[90, true]]],
  ['U-channel', [30, 80, 30], [[90, true], [90, true]]],
  ['Z-bracket', [25, 50, 25], [[90, true], [90, false]]],
  ['Hat section', [20, 30, 50, 30, 20], [[90, false], [90, true], [90, true], [90, false]]],
  ['Angled 135°', [50, 50], [[45, true]]],
]
const DEF: S = { unit: 'mm', T: 2, R: 2, material: 'ms', kAuto: true, K: 0.44, dims: 'outside', width: 60, flanges: mk([30, 80, 30], [[90, true], [90, true]]) }

export default function SheetMetalFlatPattern() {
  const [s, set, reset] = useToolState<S>('sheet-metal-flat-pattern', DEF)
  const m = MATERIALS.find((x) => x.id === s.material) ?? MATERIALS[0]
  const K = s.kAuto ? kFactor(m, s.R, s.T) : s.K
  const out = s.dims === 'outside'
  const fl = s.flanges
  const bends = fl.slice(0, -1).map((f) => ({ angle: Math.min(179, Math.max(1, f.angle)), up: f.up }))
  const fp = flatPattern(fl.map((f) => f.length), bends, s.R, s.T, K, out)
  const d = s.unit === 'mm' ? 2 : 3
  const u = s.unit
  const ba90 = bendAllowance(90, s.R, s.T, K)
  const bd90 = bendDeduction(90, s.R, s.T, K, out)
  const minFl = 4 * s.T + s.R
  const edit = (id: string, p: Partial<Fl>) => set({ flanges: fl.map((f) => (f.id === id ? { ...f, ...p } : f)) })
  const scaleUnit = (k: number) => (x: number) => Math.round(x * k * 1000) / 1000
  const switchUnit = (unit: 'mm' | 'in') => {
    if (unit === s.unit) return
    const c = scaleUnit(unit === 'in' ? 1 / 25.4 : 25.4)
    set({ unit, T: c(s.T), R: c(s.R), width: c(s.width), flanges: fl.map((f) => ({ ...f, length: c(f.length) })) })
  }

  // ---- flat pattern SVG (true scale in user units) ----
  const pad = Math.max(fp.total, s.width) * 0.08
  const fW = fp.total + pad * 2, fH = s.width + pad * 3.6
  const fs = Math.max(fW, fH) / 30
  const flatSvg = (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${-pad} ${-pad} ${fW} ${fH}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: 360 }} role="img" aria-label="flat pattern">
      <rect x={0} y={0} width={Math.max(0, fp.total)} height={s.width} fill="rgba(99,102,241,.08)" stroke="#6366f1" strokeWidth={fs / 6} />
      {fp.pieces.filter((p) => p.kind === 'bend').map((p, i) => (
        <g key={i}>
          <rect x={p.start} y={0} width={p.length} height={s.width} fill={p.bend!.up ? 'rgba(16,185,129,.25)' : 'rgba(245,158,11,.25)'} />
          <line x1={p.start + p.length / 2} x2={p.start + p.length / 2} y1={-pad * 0.3} y2={s.width + pad * 0.3} stroke={p.bend!.up ? '#059669' : '#d97706'} strokeWidth={fs / 8} strokeDasharray={`${fs / 2} ${fs / 4}`} />
          <text x={p.start + p.length / 2} y={s.width / 2} fontSize={fs} textAnchor="middle" fill="currentColor" transform={`rotate(-90 ${p.start + p.length / 2} ${s.width / 2})`} dy={-fs * 0.5}>
            {p.bend!.up ? 'UP' : 'DOWN'} {p.bend!.angle}° R{num(s.R, d)}
          </text>
        </g>
      ))}
      {fp.pieces.map((p, i) => (
        <g key={'d' + i}>
          <line x1={p.start} x2={p.start} y1={s.width + pad * 0.3} y2={s.width + pad * 1.4} stroke="currentColor" strokeWidth={fs / 12} opacity={0.5} />
          {p.kind === 'flat' && <text x={p.start + p.length / 2} y={s.width + pad * 1.15} fontSize={fs * 0.85} textAnchor="middle" fill="currentColor">{num(p.length, d)}</text>}
        </g>
      ))}
      <line x1={fp.total} x2={fp.total} y1={s.width + pad * 0.3} y2={s.width + pad * 2.8} stroke="currentColor" strokeWidth={fs / 12} opacity={0.5} />
      <line x1={0} x2={0} y1={s.width + pad * 1.4} y2={s.width + pad * 2.8} stroke="currentColor" strokeWidth={fs / 12} opacity={0.5} />
      <line x1={0} x2={fp.total} y1={s.width + pad * 2.6} y2={s.width + pad * 2.6} stroke="currentColor" strokeWidth={fs / 12} />
      <text x={fp.total / 2} y={s.width + pad * 2.45} fontSize={fs} textAnchor="middle" fill="currentColor" fontWeight={700}>{num(fp.total, d)} {u}</text>
      <text x={-pad * 0.35} y={s.width / 2} fontSize={fs * 0.85} textAnchor="middle" fill="currentColor" transform={`rotate(-90 ${-pad * 0.35} ${s.width / 2})`}>{num(s.width, d)}</text>
    </svg>
  )

  // ---- formed profile (mid-plane) ----
  const rn = s.R + s.T / 2
  const pts: [number, number][] = [[0, 0]]
  // orient so the longest flange lies horizontal
  const longest = fl.reduce((bi, f, i) => (f.length > fl[bi].length ? i : bi), 0)
  let h = -bends.slice(0, longest).reduce((a, b) => a + (b.up ? -1 : 1) * (b.angle * Math.PI) / 180, 0)
  fp.pieces.forEach((p) => {
    const [x, y] = pts[pts.length - 1]
    if (p.kind === 'flat') {
      pts.push([x + p.length * Math.cos(h), y + p.length * Math.sin(h)])
      return
    }
    const sgn = p.bend!.up ? -1 : 1 // SVG y grows downward: "up" turns counter-clockwise on screen
    const cx = x - sgn * rn * Math.sin(h), cy = y + sgn * rn * Math.cos(h)
    const a = (p.bend!.angle * Math.PI) / 180
    for (let k = 1; k <= 12; k++) {
      const hh = h + sgn * (a * k) / 12
      pts.push([cx + sgn * rn * Math.sin(hh), cy - sgn * rn * Math.cos(hh)])
    }
    h += sgn * a
  })
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys)
  const pp = Math.max(bx1 - bx0, by1 - by0, 1) * 0.08 + s.T

  const svgText = () => {
    const el = document.getElementById('smfp-flat')?.querySelector('svg')
    if (!el) return ''
    const c = el.cloneNode(true) as SVGSVGElement
    c.setAttribute('width', `${fW}${u}`)
    c.setAttribute('height', `${fH}${u}`)
    c.setAttribute('style', 'color:#000;font-family:sans-serif')
    return c.outerHTML
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Material" actions={<Seg value={s.unit} onChange={switchUnit} options={[['mm', 'mm'], ['in', 'inch']]} />}>
          <Select label="Material" value={s.material} onChange={(material) => set({ material })} options={MATERIALS.map((x) => [x.id, x.name] as [string, string])} />
          <Row>
            <Num label="Thickness T" value={s.T} onChange={(T) => set({ T })} unit={u} min={0.01} />
            <Num label="Inside radius R" value={s.R} onChange={(R) => set({ R })} unit={u} min={0} />
          </Row>
          <Check label={`Auto K-factor from table (R/T = ${num(s.R / s.T, 2)} → ${num(kFactor(m, s.R, s.T), 2)})`} value={s.kAuto} onChange={(kAuto) => set({ kAuto })} />
          {!s.kAuto && <Num label="K-factor" value={s.K} onChange={(K) => set({ K })} min={0} max={0.5} step={0.01} hint="Neutral axis position: 0 = inside face, 0.5 = mid-thickness" />}
          {s.R < m.minR * s.T && <Note tone="warn">R is below the recommended minimum of {m.minR}×T ({num(m.minR * s.T, d)} {u}) for {m.name} — risk of cracking on the outside of the bend.</Note>}
        </Panel>
        <Panel title="Flanges" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            {PRESETS.map(([n, lens, ang]) => <Btn key={n} onClick={() => set({ flanges: mk(lens.map((x) => (u === 'in' ? Math.round((x / 25.4) * 100) / 100 : x)), ang) })}>{n}</Btn>)}
          </Row>
          <Seg value={s.dims} onChange={(dims) => set({ dims })} options={[['outside', 'Outside dimensions'], ['inside', 'Inside dimensions']]} />
          {fl.map((f, i) => (
            <div key={f.id} style={{ display: 'grid', gridTemplateColumns: i < fl.length - 1 ? 'minmax(0,1fr) minmax(0,1fr) auto auto' : 'minmax(0,1fr) auto', gap: 8, alignItems: 'end', marginTop: 6 }}>
              <Num label={`Flange ${i + 1}`} value={f.length} onChange={(length) => edit(f.id, { length })} unit={u} min={0} />
              {i < fl.length - 1 && <Num label={`Bend ${i + 1} angle`} value={f.angle} onChange={(angle) => edit(f.id, { angle })} unit="°" min={1} max={179} />}
              {i < fl.length - 1 && <Btn onClick={() => edit(f.id, { up: !f.up })} title="Bend direction">{f.up ? '↑ Up' : '↓ Down'}</Btn>}
              <Btn kind="ghost" disabled={fl.length <= 2} onClick={() => set({ flanges: fl.filter((x) => x.id !== f.id) })} title="Remove flange">✕</Btn>
            </div>
          ))}
          <Row>
            <Btn onClick={() => set({ flanges: [...fl, { id: uid(), length: fl[fl.length - 1]?.length ?? 20, angle: 90, up: true }] })}>+ Flange</Btn>
          </Row>
          <Num label="Part width (along bend lines)" value={s.width} onChange={(width) => set({ width })} unit={u} min={0} />
          {fl.some((f) => f.length < minFl) && <Note tone="warn">Flanges shorter than ≈4T + R ({num(minFl, d)} {u}) are hard to form on a press brake.</Note>}
          <p className="muted" style={{ fontSize: 12 }}>Angles are bend (deflection) angles: 90° makes a right angle; 45° leaves a 135° included angle.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Flat length" value={`${num(fp.total, d)} ${u}`} sub={`blank ${num(fp.total, d)} × ${num(s.width, d)} ${u}`} tone="accent" />
          <Stat label="K-factor" value={num(K, 3)} sub={s.kAuto ? 'from table' : 'manual'} />
          <Stat label="BA @ 90°" value={`${num(ba90, 3)} ${u}`} sub="bend allowance" />
          <Stat label="BD @ 90°" value={`${num(bd90, 3)} ${u}`} sub={`bend deduction (${out ? 'outside' : 'inside'})`} />
        </Stats>
        <Panel title="Flat pattern" actions={<Btn onClick={() => download('flat-pattern.svg', svgText(), 'image/svg+xml')}>⬇ SVG (1:1)</Btn>}>
          <div id="smfp-flat">{flatSvg}</div>
          <p className="muted" style={{ fontSize: 12 }}>Green = bend up, orange = bend down; dashed lines are bend centre lines. Exported SVG is at true size in {u}.</p>
        </Panel>
        <Panel title="Formed profile">
          <svg viewBox={`${bx0 - pp} ${by0 - pp} ${bx1 - bx0 + 2 * pp} ${by1 - by0 + 2 * pp}`} style={{ width: '100%', height: 'auto', maxHeight: 260, display: 'block' }} role="img" aria-label="formed profile">
            <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#6366f1" strokeWidth={s.T} strokeLinejoin="round" />
          </svg>
        </Panel>
        <Panel title="Layout">
          <Table
            head={['Segment', 'Length', 'Starts at', 'Note']}
            rows={fp.pieces.map((p, i) => [
              p.kind === 'flat' ? `Flat ${i / 2 + 1}` : `Bend ${(i + 1) / 2}`, `${num(p.length, d)} ${u}`, `${num(p.start, d)} ${u}`,
              p.kind === 'bend' ? `${p.bend!.up ? 'Up' : 'Down'} ${p.bend!.angle}° · setback ${num(setback(p.bend!.angle, s.R, s.T, out), 3)} · BD ${num(bendDeduction(p.bend!.angle, s.R, s.T, K, out), 3)} · centre line @ ${num(p.start + p.length / 2, d)}` : '',
            ])}
            foot={['Total', `${num(fp.total, d)} ${u}`, '', `Σ flanges ${num(fl.reduce((a, f) => a + f.length, 0), d)} − Σ BD`]}
          />
        </Panel>
        <Panel title={`Bend deduction table — T = ${num(s.T, d)} ${u}, ${m.name}`}>
          <Table
            head={['R', 'K', ...[30, 45, 60, 90, 120, 135].map((a) => `${a}°`)]}
            rows={[0.5, 1, 1.5, 2, 3, 4].map((r) => {
              const R = r * s.T
              const k = s.kAuto ? kFactor(m, R, s.T) : s.K
              return [<b key="r" style={{ color: Math.abs(R - s.R) < 1e-9 ? 'var(--accent)' : undefined }}>{num(R, d)}</b>, num(k, 2), ...[30, 45, 60, 90, 120, 135].map((a) => num(bendDeduction(a, R, s.T, k, out), 3))]
            })}
          />
          <p className="muted" style={{ fontSize: 12 }}>BA = θ·(R + K·T) · setback = tan(θ/2)·(R{out ? ' + T' : ''}) · BD = 2·setback − BA</p>
        </Panel>
      </div>
    </Split>
  )
}
