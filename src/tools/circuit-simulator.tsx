import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Btn, Check, color, CsvButton, LineChart, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { type Comp, formatEng, type Kind, parseEng, type Pt, solveDC, transient, type Wave } from './lib/circuit-simulator'

type Probe = { kind: 'v'; at: Pt } | { kind: 'i'; id: string }
type Tool = 'select' | 'W' | 'R' | 'C' | 'L' | 'V' | 'I' | 'D' | 'G' | 'probe' | 'delete'
interface State { comps: Comp[]; probes: Probe[]; tStop: number; steps: number; method: 'be' | 'trap'; fromOp: boolean; showV: boolean }

const GR = 20
const W = 30, H = 19
const UNIT: Record<Kind, string> = { W: '', R: 'Ω', C: 'F', L: 'H', V: 'V', I: 'A', D: '', G: '' }
const NAME: Record<Kind, string> = { W: 'Wire', R: 'Resistor', C: 'Capacitor', L: 'Inductor', V: 'Voltage source', I: 'Current source', D: 'Diode', G: 'Ground' }
const DEFV: Record<Kind, number> = { W: 0, R: 1000, C: 1e-6, L: 1e-3, V: 5, I: 0.001, D: 0, G: 0 }
const TOOLS: [Tool, string][] = [['select', '↖ Select'], ['W', '— Wire'], ['R', 'R'], ['C', 'C'], ['L', 'L'], ['V', 'V src'], ['I', 'I src'], ['D', 'Diode'], ['G', '⏚ Gnd'], ['probe', '📈 Probe'], ['delete', '✕ Delete']]

let seq = 0
const k = (kind: Kind, a: Pt, b: Pt, value = DEFV[kind], extra: Partial<Comp> = {}): Comp => ({ id: `p${seq++}`, kind, a, b, value, ...extra })
const gnd = (p: Pt) => k('G', p, p)

const PRESETS: Record<string, () => Omit<State, 'showV'>> = {
  'RC charging': () => {
    const c = [k('V', [5, 6], [5, 14], 5, { wave: 'step' }), k('R', [5, 6], [14, 6], 1000), k('C', [14, 6], [14, 14], 1e-6), k('W', [14, 14], [5, 14]), gnd([5, 14])]
    return { comps: c, probes: [{ kind: 'v', at: [14, 6] }, { kind: 'i', id: c[1].id }], tStop: 0.005, steps: 1000, method: 'trap', fromOp: true }
  },
  'RLC ringing': () => {
    const c = [k('V', [5, 6], [5, 14], 5, { wave: 'square', freq: 250 }), k('R', [5, 6], [11, 6], 22), k('L', [11, 6], [17, 6], 0.01), k('C', [17, 6], [17, 14], 1e-6), k('W', [17, 14], [5, 14]), gnd([5, 14])]
    return { comps: c, probes: [{ kind: 'v', at: [5, 6] }, { kind: 'v', at: [17, 6] }, { kind: 'i', id: c[2].id }], tStop: 0.008, steps: 2000, method: 'trap', fromOp: false }
  },
  'Half-wave rectifier': () => {
    const c = [k('V', [5, 6], [5, 14], 10, { wave: 'sine', freq: 50 }), k('D', [5, 6], [13, 6]), k('C', [13, 6], [13, 14], 100e-6), k('W', [13, 6], [20, 6]), k('R', [20, 6], [20, 14], 1000), k('W', [20, 14], [13, 14]), k('W', [13, 14], [5, 14]), gnd([5, 14])]
    return { comps: c, probes: [{ kind: 'v', at: [5, 6] }, { kind: 'v', at: [13, 6] }, { kind: 'i', id: c[1].id }], tStop: 0.06, steps: 2400, method: 'trap', fromOp: false }
  },
  'Voltage divider': () => {
    const c = [k('V', [5, 5], [5, 15], 12), k('R', [5, 5], [13, 5], 10000), k('R', [13, 5], [13, 15], 4700), k('W', [13, 5], [21, 5]), k('R', [21, 5], [21, 15], 10000), k('W', [21, 15], [13, 15]), k('W', [13, 15], [5, 15]), gnd([5, 15])]
    return { comps: c, probes: [{ kind: 'v', at: [13, 5] }], tStop: 0.001, steps: 200, method: 'trap', fromOp: true }
  },
}
const DEF: State = { ...PRESETS['RLC ringing'](), showV: true }

const same = (p: Pt, q: Pt) => p[0] === q[0] && p[1] === q[1]
function segDist(p: [number, number], a: Pt, b: Pt) {
  const ax = a[0] * GR, ay = a[1] * GR, bx = b[0] * GR, by = b[1] * GR
  const dx = bx - ax, dy = by - ay
  const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy))) : 0
  return Math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy)
}

/** Symbol drawn along +x from 0 to len (pixels); body centred. */
function Symbol({ c, len, col }: { c: Comp; len: number; col: string }) {
  const m = len / 2
  const lead = (s: number) => <path d={`M0,0H${m - s}M${m + s},0H${len}`} stroke={col} strokeWidth={2} fill="none" />
  const st = { stroke: col, strokeWidth: 2, fill: 'none' }
  switch (c.kind) {
    case 'W':
      return <line x1={0} y1={0} x2={len} y2={0} stroke={col} strokeWidth={2} />
    case 'R': {
      let d = `M${m - 18},0`
      for (let i = 0; i < 6; i++) d += `L${m - 15 + i * 6},${i % 2 ? 7 : -7}`
      return <>{lead(18)}<path d={d + `L${m + 18},0`} {...st} /></>
    }
    case 'C':
      return <>{lead(4)}<path d={`M${m - 4},-12V12M${m + 4},-12V12`} {...st} strokeWidth={2.6} /></>
    case 'L': {
      let d = `M${m - 18},0`
      for (let i = 0; i < 4; i++) d += `a4.5,6 0 0 1 9,0`
      return <>{lead(18)}<path d={d} {...st} /></>
    }
    case 'V':
    case 'I': {
      const w = c.wave ?? 'dc'
      return (
        <>
          {lead(15)}
          <circle cx={m} cy={0} r={15} {...st} />
          {c.kind === 'I' ? (
            <path d={`M${m - 8},0H${m + 7}M${m + 2},-5L${m + 8},0L${m + 2},5`} {...st} />
          ) : w === 'sine' ? (
            <path d={`M${m - 8},0q4,-10 8,0t8,0`} {...st} />
          ) : w === 'square' ? (
            <path d={`M${m - 9},4h5v-8h8v8h5`} {...st} />
          ) : (
            <>
              <text x={m - 9} y={4} fontSize={12} fill={col} textAnchor="middle" fontWeight={700}>+</text>
              <text x={m + 8} y={4} fontSize={12} fill={col} textAnchor="middle" fontWeight={700}>−</text>
            </>
          )}
        </>
      )
    }
    case 'D':
      return <>{lead(8)}<path d={`M${m - 8},-8L${m + 7},0L${m - 8},8Z`} fill={col} stroke={col} strokeWidth={1.5} /><path d={`M${m + 8},-9V9`} {...st} strokeWidth={2.6} /></>
    default:
      return null
  }
}

export default function CircuitSimulator() {
  const [s, set, reset] = useToolState('circuit-simulator', DEF)
  const [tool, setTool] = useState<Tool>('select')
  const [sel, setSel] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ from: Pt; to: Pt; move?: { id: string; a: Pt; b: Pt } } | null>(null)
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null)
  const [hist, setHist] = useState<Comp[][]>([])
  const svgRef = useRef<SVGSVGElement>(null)

  const commit = (comps: Comp[], probes = s.probes) => {
    setHist((h) => [...h.slice(-40), s.comps])
    set({ comps, probes })
  }
  const undo = () => {
    const prev = hist[hist.length - 1]
    if (!prev) return
    setHist(hist.slice(0, -1))
    set({ comps: prev })
  }

  const names = useMemo(() => {
    const cnt: Record<string, number> = {}
    const m = new Map<string, string>()
    for (const c of s.comps) if (c.kind !== 'W' && c.kind !== 'G') m.set(c.id, `${c.kind}${(cnt[c.kind] = (cnt[c.kind] ?? 0) + 1)}`)
    return m
  }, [s.comps])
  const dc = useMemo(() => solveDC(s.comps), [s.comps])
  const tr = useMemo(() => (s.comps.some((c) => c.kind === 'V' || c.kind === 'I') ? transient(s.comps, { tStop: s.tStop, dt: s.tStop / Math.max(10, s.steps), method: s.method, fromOp: s.fromOp }) : null), [s.comps, s.tStop, s.steps, s.method, s.fromOp])

  const gridPt = (e: { clientX: number; clientY: number }): { g: Pt; raw: [number, number] } => {
    const svg = svgRef.current!
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse())
    return { g: [Math.max(0, Math.min(W, Math.round(p.x / GR))), Math.max(0, Math.min(H, Math.round(p.y / GR)))], raw: [p.x, p.y] }
  }
  const hit = (raw: [number, number]) => {
    let best: Comp | null = null, bd = 9
    for (const c of s.comps) {
      const d = c.kind === 'G' ? Math.hypot(raw[0] - c.a[0] * GR, raw[1] - c.a[1] * GR - 10) - 4 : segDist(raw, c.a, c.b)
      if (d < bd) {
        bd = d
        best = c
      }
    }
    return best
  }

  const onDown = (e: React.PointerEvent) => {
    const { g, raw } = gridPt(e)
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    if (tool === 'select') {
      const c = hit(raw)
      setSel(c?.id ?? null)
      setDraft(null)
      if (c) setDrag({ from: g, to: g, move: { id: c.id, a: c.a, b: c.b } })
    } else if ('WRCLVID'.includes(tool)) setDrag({ from: g, to: g })
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return
    const { g } = gridPt(e)
    if (!same(g, drag.to)) setDrag({ ...drag, to: g })
  }
  const onUp = (e: React.PointerEvent) => {
    const { g, raw } = gridPt(e)
    const d = drag
    setDrag(null)
    if (d?.move) {
      const dx = g[0] - d.from[0], dy = g[1] - d.from[1]
      if (dx || dy) commit(s.comps.map((c) => (c.id === d.move!.id ? { ...c, a: [c.a[0] + dx, c.a[1] + dy], b: [c.b[0] + dx, c.b[1] + dy] } : c)))
      return
    }
    if (d && 'WRCLVID'.includes(tool)) {
      let b = g
      if (same(d.from, g)) {
        if (tool === 'W') return
        b = [Math.min(W, g[0] + 4), g[1]]
      }
      const c: Comp = { id: uid(), kind: tool as Kind, a: d.from, b, value: DEFV[tool as Kind], ...(tool === 'V' ? { wave: 'dc' as Wave, freq: 1000 } : {}) }
      commit([...s.comps, c])
      if (tool !== 'W') {
        setSel(c.id)
      }
      return
    }
    if (tool === 'G') commit([...s.comps, { id: uid(), kind: 'G', a: g, b: g, value: 0 }])
    else if (tool === 'delete') {
      const c = hit(raw)
      if (c) commit(s.comps.filter((x) => x.id !== c.id), s.probes.filter((p) => p.kind === 'v' || p.id !== c.id))
    } else if (tool === 'probe') {
      const c = hit(raw)
      const nearEnd = s.comps.flatMap((x) => [x.a, x.b]).find((p) => Math.hypot(raw[0] - p[0] * GR, raw[1] - p[1] * GR) < 9)
      if (nearEnd || c?.kind === 'W') {
        const at = nearEnd ?? c!.a
        const node = dc.nl.nodeOf.get(`${at[0]},${at[1]}`)
        const exists = s.probes.find((p) => p.kind === 'v' && dc.nl.nodeOf.get(`${p.at[0]},${p.at[1]}`) === node)
        set({ probes: exists ? s.probes.filter((p) => p !== exists) : [...s.probes, { kind: 'v', at }] })
      } else if (c && c.kind !== 'G') {
        const exists = s.probes.find((p) => p.kind === 'i' && p.id === c.id)
        set({ probes: exists ? s.probes.filter((p) => p !== exists) : [...s.probes, { kind: 'i', id: c.id }] })
      }
    }
  }

  const selC = s.comps.find((c) => c.id === sel) ?? null
  const edit = (patch: Partial<Comp>) => selC && commit(s.comps.map((c) => (c.id === selC.id ? { ...c, ...patch } : c)))
  const nodeV = (p: Pt) => dc.v[dc.nl.nodeOf.get(`${p[0]},${p[1]}`) ?? 0] ?? 0

  // probe series
  const probeName = (p: Probe, i: number) => (p.kind === 'v' ? `V(P${i + 1})` : `I(${names.get(p.id) ?? '?'})`)
  const vSeries = tr ? s.probes.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === 'v').map(({ p, i }) => {
    const at = (p as { at: Pt }).at
    const nd = tr.nl.nodeOf.get(`${at[0]},${at[1]}`) ?? 0
    return { name: probeName(p, i), color: color(i), points: tr.t.map((t, j) => [t, tr.v[j][nd] ?? 0] as [number, number]) }
  }) : []
  const iSeries = tr ? s.probes.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === 'i' && tr.i.has((p as { id: string }).id)).map(({ p, i }) => ({ name: probeName(p, i), color: color(i), points: tr.t.map((t, j) => [t, tr.i.get((p as { id: string }).id)![j]] as [number, number]) })) : []

  // junction dots & node voltage labels
  const deg = new Map<string, number>()
  for (const c of s.comps) if (c.kind !== 'G') for (const p of [c.a, c.b]) deg.set(`${p[0]},${p[1]}`, (deg.get(`${p[0]},${p[1]}`) ?? 0) + 1)
  const netLabel = new Map<number, Pt>()
  for (const c of s.comps) for (const p of [c.a, c.b]) {
    const nd = dc.nl.nodeOf.get(`${p[0]},${p[1]}`)
    if (nd && (!netLabel.has(nd) || p[1] < netLabel.get(nd)![1] || (p[1] === netLabel.get(nd)![1] && p[0] > netLabel.get(nd)![0]))) netLabel.set(nd, p)
  }

  const rows = s.comps.filter((c) => c.kind !== 'W' && c.kind !== 'G').map((c) => {
    const [a, b] = dc.nl.term.get(c.id) ?? [0, 0]
    const v = (dc.v[a] ?? 0) - (dc.v[b] ?? 0)
    const i = dc.i.get(c.id) ?? 0
    const p = c.kind === 'V' || c.kind === 'I' ? -(c.kind === 'V' ? v * i : v * -i) : v * i
    return { c, v, i, p }
  })
  const fmtV = (x: number) => formatEng(x, 'V')
  const fmtT = (x: number) => formatEng(x, 's', 2)
  let preview: ReactNode = null
  if (drag && !drag.move && !same(drag.from, drag.to)) {
    const c: Comp = { id: 'pv', kind: tool as Kind, a: drag.from, b: drag.to, value: 0 }
    const len = Math.hypot(drag.to[0] - drag.from[0], drag.to[1] - drag.from[1]) * GR
    const ang = (Math.atan2(drag.to[1] - drag.from[1], drag.to[0] - drag.from[0]) * 180) / Math.PI
    preview = <g transform={`translate(${drag.from[0] * GR},${drag.from[1] * GR}) rotate(${ang})`} opacity={0.6}><Symbol c={c} len={len} col="var(--accent)" /></g>
  }
  const off = drag?.move ? [drag.to[0] - drag.from[0], drag.to[1] - drag.from[1]] : [0, 0]

  return (
    <Split wide="left">
      <div>
      <Panel
        title="Schematic"
        actions={
          <>
            <select className="k-select" style={{ width: 'auto' }} value="" aria-label="Load example" onChange={(e) => {
              const p = e.target.value
              if (!p) return
              setHist((h) => [...h, s.comps])
              set({ ...PRESETS[p]() })
              setSel(null)
            }}>
              <option value="">Load example…</option>
              {Object.keys(PRESETS).map((p) => <option key={p}>{p}</option>)}
            </select>
            <Btn onClick={undo} disabled={!hist.length}>↶ Undo</Btn>
            <Btn kind="ghost" onClick={() => commit([], [])}>Clear</Btn>
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </>
        }
      >
        <div className="k-seg" style={{ flexWrap: 'wrap', marginBottom: 8 }}>
          {TOOLS.map(([t, l]) => (
            <button key={t} type="button" className={tool === t ? 'on' : ''} onClick={() => setTool(t)}>{l}</button>
          ))}
        </div>
        <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--panel)' }}>
          <svg ref={svgRef} viewBox={`-10 -10 ${W * GR + 20} ${H * GR + 20}`} style={{ display: 'block', width: '100%', minWidth: 480, touchAction: 'none', cursor: tool === 'select' ? 'default' : 'crosshair', userSelect: 'none' }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
            <defs>
              <pattern id="cs-grid" width={GR} height={GR} patternUnits="userSpaceOnUse" x={-GR / 2} y={-GR / 2}>
                <circle cx={GR / 2} cy={GR / 2} r={1.1} fill="var(--grid-strong)" />
              </pattern>
            </defs>
            <rect x={-10} y={-10} width={W * GR + 20} height={H * GR + 20} fill="url(#cs-grid)" />
            {s.comps.map((c) => {
              const moving = drag?.move?.id === c.id
              const a: Pt = moving ? [c.a[0] + off[0], c.a[1] + off[1]] : c.a
              const b: Pt = moving ? [c.b[0] + off[0], c.b[1] + off[1]] : c.b
              const col = c.id === sel ? 'var(--accent)' : 'var(--fg)'
              if (c.kind === 'G')
                return (
                  <g key={c.id} transform={`translate(${a[0] * GR},${a[1] * GR})`} stroke={col} strokeWidth={2}>
                    <path d="M0,0V10M-11,10H11M-7,15H7M-3,20H3" fill="none" />
                  </g>
                )
              const len = Math.hypot(b[0] - a[0], b[1] - a[1]) * GR
              const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
              const nm = names.get(c.id)
              const mx = ((a[0] + b[0]) / 2) * GR, my = ((a[1] + b[1]) / 2) * GR
              const vert = Math.abs(b[0] - a[0]) < Math.abs(b[1] - a[1])
              const ip = s.probes.findIndex((p) => p.kind === 'i' && p.id === c.id)
              return (
                <g key={c.id}>
                  <g transform={`translate(${a[0] * GR},${a[1] * GR}) rotate(${ang})`}>
                    <Symbol c={c} len={len} col={col} />
                    {ip >= 0 && <path d={`M${len / 2 - 30},-14H${len / 2 + 30}M${len / 2 + 24},-19L${len / 2 + 30},-14L${len / 2 + 24},-9`} stroke={color(ip)} strokeWidth={2.4} fill="none" />}
                  </g>
                  {nm && (
                    <text x={mx + (vert ? 22 : 0)} y={my + (vert ? 4 : -20)} textAnchor={vert ? 'start' : 'middle'} fontSize={11.5} fill="var(--muted)">
                      <tspan fontWeight={700} fill="var(--fg)">{nm}</tspan> {c.kind !== 'D' && `${formatEng(c.value, UNIT[c.kind])}`}
                      {c.kind === 'V' && c.wave && c.wave !== 'dc' ? ` ${c.wave}${c.wave === 'sine' || c.wave === 'square' ? ` ${formatEng(c.freq ?? 1000, 'Hz')}` : ''}` : ''}
                    </text>
                  )}
                </g>
              )
            })}
            {[...deg.entries()].filter(([, d]) => d >= 3).map(([kk]) => {
              const [x, y] = kk.split(',').map(Number)
              return <circle key={kk} cx={x * GR} cy={y * GR} r={3.5} fill="var(--fg)" />
            })}
            {[...deg.entries()].filter(([, d]) => d === 1).map(([kk]) => {
              const [x, y] = kk.split(',').map(Number)
              return <circle key={'o' + kk} cx={x * GR} cy={y * GR} r={3} fill="var(--panel)" stroke="var(--muted)" />
            })}
            {s.showV && [...netLabel.entries()].map(([nd, p]) => (
              <text key={nd} x={p[0] * GR + 5} y={p[1] * GR - 6} fontSize={11} fill="var(--accent2)" fontWeight={700}>{fmtV(dc.v[nd] ?? 0)}</text>
            ))}
            {s.probes.map((p, i) => p.kind === 'v' && (
              <g key={i} transform={`translate(${p.at[0] * GR},${p.at[1] * GR})`}>
                <path d="M0,0L-6,-14H6Z" fill={color(i)} />
                <text x={0} y={-17} fontSize={10.5} textAnchor="middle" fill={color(i)} fontWeight={800}>P{i + 1}</text>
              </g>
            ))}
            {preview}
          </svg>
        </div>
        <p className="k-hint" style={{ margin: '6px 0 0' }}>
          Pick a part and drag between grid dots (a tap places it 4 cells wide). Select mode drags parts; Probe mode taps a node (voltage) or a part (current). Sources: + is the start point; diodes point from start (anode) to end.
        </p>
      </Panel>
          {selC && selC.kind !== 'W' && selC.kind !== 'G' ? (
            <Panel title={`${names.get(selC.id)} · ${NAME[selC.kind]}`} actions={<>
              <Btn onClick={() => edit({ a: selC.b, b: selC.a })} title="Swap terminals">⇄ Flip</Btn>
              <Btn kind="danger" onClick={() => {
                commit(s.comps.filter((c) => c.id !== selC.id), s.probes.filter((p) => p.kind === 'v' || p.id !== selC.id))
                setSel(null)
              }}>Delete</Btn>
            </>}>
              {selC.kind !== 'D' && (
                <label className="k-field">
                  <span className="k-label">Value ({UNIT[selC.kind]}) — accepts 4.7k, 10u, 100n, 2meg</span>
                  <input className="k-text" value={draft?.id === selC.id ? draft.text : formatEng(selC.value, '').replace(' ', '')} onChange={(e) => {
                    setDraft({ id: selC.id, text: e.target.value })
                    const v = parseEng(e.target.value)
                    if (v !== null && (v > 0 || selC.kind === 'V' || selC.kind === 'I')) edit({ value: v })
                  }} />
                </label>
              )}
              {selC.kind === 'V' && (
                <Row>
                  <Select label="Waveform" value={selC.wave ?? 'dc'} onChange={(wave: Wave) => edit({ wave })} options={[['dc', 'DC'], ['step', 'Step at t=0'], ['sine', 'Sine (amplitude)'], ['square', 'Square 0 ↔ V']]} />
                  {(selC.wave === 'sine' || selC.wave === 'square') && <Num label="Frequency" unit="Hz" value={selC.freq ?? 1000} min={0.001} onChange={(freq) => freq > 0 && edit({ freq })} />}
                </Row>
              )}
              {selC.kind === 'D' && <Note>Silicon diode model: Is = 10 fA, n = 1 (Shockley equation, solved by Newton–Raphson).</Note>}
              <p className="muted" style={{ margin: 0 }}>DC: {fmtV(nodeV(selC.a) - nodeV(selC.b))} across, {formatEng(dc.i.get(selC.id) ?? 0, 'A')} through.</p>
            </Panel>
          ) : (
            <Panel title="Part properties"><p className="muted" style={{ margin: 0 }}>Select a part (Select tool) to edit its value, waveform or orientation.</p></Panel>
          )}
          <Panel title="Transient analysis">
            <Row>
              <Num label="Stop time" unit="ms" value={+(s.tStop * 1000).toPrecision(6)} min={0.000001} onChange={(v) => v > 0 && set({ tStop: v / 1000 })} />
              <Num label="Steps" value={s.steps} min={10} max={20000} step={10} onChange={(v) => v >= 10 && v <= 20000 && set({ steps: Math.round(v) })} hint={`Δt = ${fmtT(s.tStop / s.steps)}`} />
            </Row>
            <Seg value={s.method} onChange={(method) => set({ method })} options={[['trap', 'Trapezoidal'], ['be', 'Backward Euler']]} label="Integration" />
            <Check label="Start from DC operating point (else all caps/inductors empty)" value={s.fromOp} onChange={(fromOp) => set({ fromOp })} />
            <Check label="Show DC node voltages on schematic" value={s.showV} onChange={(showV) => set({ showV })} />
          </Panel>
        </div>
        <div>
          {!dc.nl.grounded && s.comps.length > 0 && <Note tone="warn">No ground symbol: the − side of the first source is used as 0 V.</Note>}
          {!dc.ok && <Note tone="err">{dc.error}</Note>}
          {tr?.error && <Note tone="err">{tr.error}</Note>}
          <Stats>
            <Stat label="Nodes" value={Math.max(0, dc.nl.n - 1)} sub="plus ground" />
            <Stat label="Parts" value={rows.length} sub={`${s.comps.filter((c) => c.kind === 'W').length} wires`} />
            <Stat label="Power delivered (DC)" value={formatEng(-rows.filter((r) => r.c.kind === 'V' || r.c.kind === 'I').reduce((a, r) => a + r.p, 0), 'W')} tone="accent" sub="by all sources" />
          </Stats>
          <Panel title="Probe voltages" actions={tr && <CsvButton name="transient.csv" rows={() => [['t', ...vSeries.map((x) => x.name), ...iSeries.map((x) => x.name)], ...tr.t.map((t, j) => [t, ...vSeries.map((x) => x.points[j][1]), ...iSeries.map((x) => x.points[j][1])])]} />}>
            {vSeries.length ? <LineChart series={vSeries} fx={fmtT} fy={fmtV} xLabel="time" height={240} /> : <p className="muted">Use the Probe tool and tap a node.</p>}
          </Panel>
          {iSeries.length > 0 && (
            <Panel title="Probe currents">
              <LineChart series={iSeries} fx={fmtT} fy={(v) => formatEng(v, 'A')} xLabel="time" height={200} />
            </Panel>
          )}
          <Panel title="DC operating point">
            <Table
              head={['Part', 'Value', 'Voltage', 'Current', 'Power']}
              rows={rows.map((r) => [<b key="n">{names.get(r.c.id)}</b>, r.c.kind === 'D' ? 'Si diode' : formatEng(r.c.value, UNIT[r.c.kind]), fmtV(r.v), formatEng(r.i, 'A'), formatEng(r.p, 'W')])}
            />
            <p className="k-hint">Power is absorbed (+) or delivered (−). Sources use their DC value (step = final value, sine/square = 0); capacitors are open, inductors shorted.</p>
          </Panel>
        </div>
    </Split>
  )
}
