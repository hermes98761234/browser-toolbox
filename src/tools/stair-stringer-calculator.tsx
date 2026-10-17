import { Btn, Check, CsvButton, download, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { checks, CODES, compute, fmtFtIn, fmtIn, lumber } from './lib/stair-stringer-calculator'

const DEF = { unit: 'in' as 'in' | 'mm', code: 'irc', rise: 108, maxRiser: 7.75, tread: 10, nosing: 1, stock: 11.25, treadThk: 1, flushTop: true, width: 36, spacing: 16, head: 82 }
const PRESETS: [string, Partial<typeof DEF>][] = [
  ['Basement stair', { rise: 108, tread: 10, maxRiser: 7.75, code: 'irc', width: 36, flushTop: true }],
  ['Deck (2×6 treads)', { rise: 40, tread: 11.25, maxRiser: 7.5, nosing: 0, treadThk: 1.5, width: 48, code: 'irc', flushTop: false }],
  ['Porch, 3 steps', { rise: 21, tread: 11, maxRiser: 7.75, width: 48, flushTop: false }],
  ['Commercial (IBC)', { rise: 144, tread: 11, maxRiser: 7, width: 44, code: 'ibc', spacing: 16 }],
]
const STOCK: [number, string][] = [[7.25, '2×8 (7¼″)'], [9.25, '2×10 (9¼″)'], [11.25, '2×12 (11¼″)'], [13.25, '2×14 (13¼″)']]

export default function StairStringerCalculator() {
  const [s, set, reset] = useToolState('stair-stringer-calculator', DEF)
  const mm = s.unit === 'mm'
  const L = (x: number) => (mm ? `${Math.round(x * 25.4)} mm` : fmtIn(x))
  const LL = (x: number) => (mm ? `${(x * 25.4 / 1000).toFixed(3)} m` : fmtFtIn(x))
  const N = (label: string, k: keyof typeof DEF, hint?: string, min = 0) => (
    <Num label={label} value={+(Number(s[k]) * (mm ? 25.4 : 1)).toFixed(mm ? 0 : 3)} onChange={(v) => set({ [k]: v / (mm ? 25.4 : 1) })} unit={mm ? 'mm' : 'in'} min={min} hint={hint} />
  )
  const code = CODES[s.code] ?? CODES.irc
  const inp = { rise: Math.max(1, s.rise), maxRiser: Math.max(1, s.maxRiser), tread: Math.max(1, s.tread), nosing: s.nosing, stock: s.stock, treadThk: s.treadThk, flushTop: s.flushTop }
  const o = compute(inp)
  const cks = checks(inp, o, code, s.head, s.width, s.code === 'ukpriv')
  const fails = cks.filter((c) => c.ok === false)
  const nStr = Math.max(2, Math.ceil((s.width - 1.5) / Math.max(4, s.spacing)) + 1)

  // ----- SVG layout drawing (inches, y up) -----
  const svg = (() => {
    const { n, treads, riser: R } = o
    const T = inp.tread
    const th = Math.atan2(R, T)
    const pts: [number, number][] = [[0, 0]]
    for (let k = 0; k < n; k++) {
      pts.push([k * T, (k + 1) * R])
      if (k < treads) pts.push([(k + 1) * T, (k + 1) * R])
    }
    const xEnd = pts[pts.length - 1][0]
    const yb = (x: number) => R + (x * R) / T - inp.stock / Math.cos(th)
    const x0 = ((inp.stock / Math.cos(th) - R) * T) / R
    const poly = [...pts, [xEnd, yb(xEnd)], [x0, 0]] as [number, number][]
    const minX = Math.min(-14, x0 - 4), maxX = xEnd + 26, maxY = n * R + 16, minY = -12
    const W = 760, sc = W / (maxX - minX), H = Math.min(560, (maxY - minY) * sc)
    const k = Math.min(sc, H / (maxY - minY))
    const X = (x: number) => (x - minX) * k, Y = (y: number) => H - (y - minY) * k
    const p = (q: [number, number][]) => q.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')
    // throat line at first full notch
    const cx = T, cy = R // inside corner of the second notch
    const tx = cx + Math.sin(th) * o.throat, ty = cy - Math.cos(th) * o.throat
    const fs = Math.max(12, Math.min(14, k * 1.4))
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 560, background: 'var(--chart-bg, transparent)', borderRadius: 8 }} role="img" aria-label="Stringer layout">
        <defs>
          <pattern id="ssc-wood" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform={`rotate(${-o.angle})`}>
            <rect width="8" height="8" fill="#e7c48f" />
            <line x1="0" y1="2" x2="8" y2="2" stroke="#d4a86a" strokeWidth="1" />
          </pattern>
          <marker id="ssc-ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10z" fill="var(--muted)" /></marker>
        </defs>
        <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="var(--fg)" strokeWidth={2} />
        <rect x={X(xEnd)} y={Y(n * R)} width={W - X(xEnd)} height={Math.max(4, 1.5 * k)} fill="var(--muted)" opacity={0.6} />
        <rect x={X(xEnd)} y={Y(n * R)} width={Math.max(4, 1.5 * k)} height={Math.max(8, 9.25 * k)} fill="var(--muted)" opacity={0.85} />
        <text x={X(xEnd) + 12} y={Y(n * R) - 6} fontSize={fs} fill="var(--muted)">upper floor / header</text>
        <polygon points={p(poly)} fill="url(#ssc-wood)" stroke="#92400e" strokeWidth={1.5} />
        {inp.treadThk > 0 && <polygon points={p([[0, 0], [0, inp.treadThk], [x0 + (inp.treadThk * T) / R, inp.treadThk], [x0, 0]])} fill="#ef4444" opacity={0.55} />}
        {Array.from({ length: treads }, (_, i) => (
          <rect key={i} x={X(i * T - inp.nosing)} y={Y((i + 1) * R + inp.treadThk)} width={(T + inp.nosing) * k} height={inp.treadThk * k} fill="#a16207" opacity={0.35} stroke="#a16207" strokeDasharray="3 2" />
        ))}
        <line x1={X(cx)} y1={Y(cy)} x2={X(tx)} y2={Y(ty)} stroke="#2563eb" strokeWidth={2} />
        <text x={X(tx) + 6} y={Y(ty) + fs} fontSize={fs} fill="#2563eb">throat {L(o.throat)}</text>
        <line x1={X(-6)} x2={X(-6)} y1={Y(0)} y2={Y(n * R)} stroke="var(--muted)" markerStart="url(#ssc-ar)" markerEnd="url(#ssc-ar)" />
        <text x={X(-7)} y={Y((n * R) / 2)} fontSize={fs} fill="var(--fg)" textAnchor="end" transform={`rotate(-90 ${X(-7)} ${Y((n * R) / 2)})`}>total rise {L(inp.rise)}</text>
        <line x1={X(0)} x2={X(xEnd)} y1={Y(-6)} y2={Y(-6)} stroke="var(--muted)" markerStart="url(#ssc-ar)" markerEnd="url(#ssc-ar)" />
        <text x={(X(0) + X(xEnd)) / 2} y={Y(-6) + fs + 2} fontSize={fs} fill="var(--fg)" textAnchor="middle">total run {L(o.run)}</text>
        <text x={X(T / 2)} y={Y(R) - 6} fontSize={fs} fill="var(--fg)" textAnchor="middle">{L(T)}</text>
        <text x={X(0) - 4} y={Y(R / 2) + 4} fontSize={fs} fill="var(--fg)" textAnchor="end">{L(R)}</text>
        <text x={X(0) - 4} y={Y(0) + fs + 2} fontSize={fs} fill="#b91c1c" textAnchor="end">drop {L(inp.treadThk)}</text>
        <text x={X(xEnd * 0.55)} y={Y(yb(xEnd * 0.55)) + 18} fontSize={fs} fill="#92400e" transform={`rotate(${-o.angle} ${X(xEnd * 0.55)} ${Y(yb(xEnd * 0.55)) + 18})`}>{STOCK.find((x) => x[0] === inp.stock)?.[1] ?? L(inp.stock)} · {LL(o.stringerLen)}</text>
      </svg>
    )
  })()

  const steps = Array.from({ length: o.n }, (_, i) => ({ k: i + 1, h: (i + 1) * o.riser, x: Math.min(i + 1, o.treads) * inp.tread }))
  const boardFt = lumber(o.stringerLen + 6)

  const exportSvg = () => {
    const el = document.querySelector('svg[aria-label="Stringer layout"]')
    if (el) download('stair-stringer.svg', `<?xml version="1.0"?>\n${el.outerHTML.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" style="color:#111;--fg:#111;--muted:#666"')}`, 'image/svg+xml')
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Presets">
          <Row>{PRESETS.map(([n, p]) => <Btn key={n} onClick={() => set(p)}>{n}</Btn>)}</Row>
        </Panel>
        <Panel title="Measurements" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['in', 'Inches'], ['mm', 'Millimetres']]} />
          {N('Total rise (finished floor to finished floor)', 'rise', 'Measure plumb from lower finished floor to upper finished floor', 1)}
          <Row>
            {N('Target tread depth (run)', 'tread', 'Excluding nosing', 1)}
            {N('Nosing overhang', 'nosing')}
          </Row>
          <Row>
            {N('Maximum riser', 'maxRiser', `Code max ${L(code.maxRiser)}`, 1)}
            {N('Tread thickness', 'treadThk', 'Drop the stringer by this')}
          </Row>
          <Select label="Stringer stock" value={s.stock} onChange={(stock) => set({ stock })} options={STOCK} />
          <Check label="Top step is the upper floor (one fewer tread than risers)" value={s.flushTop} onChange={(flushTop) => set({ flushTop })} />
        </Panel>
        <Panel title="Code & layout checks">
          <Select label="Building code" value={s.code} onChange={(c) => set({ code: c, maxRiser: Math.min(s.maxRiser, CODES[c].maxRiser) })} options={Object.entries(CODES).map(([k, c]) => [k, c.name] as [string, string])} />
          <Row>
            {N('Stair width', 'width', undefined, 1)}
            {N('Headroom', 'head', 'Lowest ceiling above nosing line')}
          </Row>
          {N('Max stringer spacing', 'spacing', '16″ for 5/4 decking, 18″ for 2× treads', 4)}
          <p className="k-hint">Always confirm with your local building department; local amendments often differ.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Risers" value={`${o.n} × ${L(o.riser)}`} sub={`${o.treads} treads × ${L(inp.tread)}`} tone="accent" />
          <Stat label="Total run" value={L(o.run)} sub={mm ? '' : fmtFtIn(o.run)} />
          <Stat label="Angle" value={`${o.angle.toFixed(1)}°`} sub={`2R+T = ${(o.twoRT * (mm ? 25.4 : 1)).toFixed(mm ? 0 : 2)}${mm ? ' mm' : '″'}`} />
          <Stat label="Stringer length" value={LL(o.stringerLen)} sub={`buy ${nStr} × ${boardFt} ft boards`} tone={fails.length ? 'bad' : 'good'} />
        </Stats>
        {fails.length ? <Note tone="err">{fails.length} check{fails.length > 1 ? 's' : ''} failed: {fails.map((f) => f.label).join(', ')}.</Note> : <Note tone="ok">All dimensional checks pass for {code.name}.</Note>}
        <Panel title="Stringer layout" actions={<Btn onClick={exportSvg}>⬇ SVG</Btn>}>
          {svg}
          <p className="k-hint">Set a framing square to <b>{L(o.riser)}</b> on the tongue and <b>{L(inp.tread)}</b> on the blade (use stair gauges) and step it along the board {o.n} times. Cut <b style={{ color: 'var(--err)' }}>{L(inp.treadThk)}</b> off the bottom (red) so the first step matches the others once treads are on.</p>
        </Panel>
        <Panel title="Code checks">
          <Table head={['Check', 'Result', 'Details']} rows={cks.map((c) => [c.label, c.ok === null ? <span key="i" className="muted">info</span> : c.ok ? <b key="o" style={{ color: 'var(--ok)' }}>✓ pass</b> : <b key="f" style={{ color: 'var(--err)' }}>✗ fail</b>, c.detail])} />
        </Panel>
        <Panel title="Marking table" actions={<CsvButton name="stair-layout.csv" rows={() => [['Step', `Height to tread top (${s.unit})`, `Horizontal from first riser (${s.unit})`], ...steps.map((st) => [st.k, +(st.h * (mm ? 25.4 : 1)).toFixed(2), +(st.x * (mm ? 25.4 : 1)).toFixed(2)])]} />}>
          <Table max={30} head={['Step', 'Height (finished)', 'Run from 1st riser']} rows={steps.map((st) => [st.k, L(st.h), L(st.x)])} />
          <Note>Cut list: {nStr} stringers from {boardFt} ft {STOCK.find((x) => x[0] === s.stock)?.[1] ?? 'boards'} · {o.treads} treads {L(s.width)} long × {L(inp.tread + inp.nosing)} deep · {o.n} riser boards {L(o.riser - inp.treadThk)} high (if closed risers).</Note>
        </Panel>
      </div>
    </Split>
  )
}
