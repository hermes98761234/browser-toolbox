import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, JsonButtons, Note, Panel, Row, Select, Slider, Split, Table, uid, useToolState } from '../kit'
import {
  CHALLENGES, dependents, describe, dist, distanceTo, evaluate, intersections, isCurveKind, isPointKind, nextName, project,
  type Kind, type Obj, type V, type Val,
} from './lib/geometry-construction-tool'

type ToolId = 'move' | 'point' | 'segment' | 'line' | 'ray' | 'circle' | 'compass' | 'intersect' | 'midpoint' | 'perp' | 'parallel' | 'bisector' | 'anglebis' | 'polygon' | 'distance' | 'angle' | 'hide' | 'delete'
type Need = 'P' | 'C' | 'L'
const TOOLS: { id: ToolId; icon: string; label: string; needs: Need[]; kind?: Kind; macro?: boolean; help: string }[] = [
  { id: 'move', icon: '✋', label: 'Move', needs: [], help: 'Drag free points (blue) or points on objects; drag empty space to pan; scroll to zoom.' },
  { id: 'point', icon: '•', label: 'Point', needs: ['P'], help: 'Click to place a point. Near an object it sticks to it; near a crossing it becomes the intersection.' },
  { id: 'segment', icon: '⁄', label: 'Segment', needs: ['P', 'P'], kind: 'segment', help: 'Straightedge: click two points.' },
  { id: 'line', icon: '↔', label: 'Line', needs: ['P', 'P'], kind: 'line', help: 'Straightedge: line through two points.' },
  { id: 'ray', icon: '→', label: 'Ray', needs: ['P', 'P'], kind: 'ray', help: 'Ray from the first point through the second.' },
  { id: 'circle', icon: '◯', label: 'Circle', needs: ['P', 'P'], kind: 'circle', help: 'Compass: click the centre, then a point on the circle.' },
  { id: 'compass', icon: '⊙', label: 'Compass', needs: ['P', 'P', 'P'], kind: 'compass', help: 'Transfer a length: pick two points for the radius, then the new centre.' },
  { id: 'intersect', icon: '✕', label: 'Intersect', needs: ['C', 'C'], kind: 'intersect', help: 'Click two objects to mark all their intersections.' },
  { id: 'midpoint', icon: '◦', label: 'Midpoint', needs: ['P', 'P'], kind: 'midpoint', macro: true, help: 'Macro: midpoint of two points.' },
  { id: 'perp', icon: '⊥', label: 'Perp. line', needs: ['L', 'P'], kind: 'perp', macro: true, help: 'Macro: pick a line, then a point.' },
  { id: 'parallel', icon: '∥', label: 'Parallel', needs: ['L', 'P'], kind: 'parallel', macro: true, help: 'Macro: pick a line, then a point.' },
  { id: 'bisector', icon: '⟂', label: 'Mid-perp.', needs: ['P', 'P'], kind: 'bisector', macro: true, help: 'Macro: perpendicular bisector of two points.' },
  { id: 'anglebis', icon: '∠', label: 'Bisect ∠', needs: ['P', 'P', 'P'], kind: 'anglebis', macro: true, help: 'Macro: point on one arm, vertex, point on the other arm.' },
  { id: 'polygon', icon: '⬠', label: 'Polygon', needs: [], kind: 'polygon', help: 'Click vertices; click the first vertex again to close. Shows area and perimeter.' },
  { id: 'distance', icon: '📏', label: 'Distance', needs: ['P', 'P'], kind: 'distance', help: 'Measure the distance between two points.' },
  { id: 'angle', icon: '📐', label: 'Angle', needs: ['P', 'P', 'P'], kind: 'angle', help: 'Measure an angle: point, vertex, point.' },
  { id: 'hide', icon: '👁', label: 'Hide', needs: [], help: 'Click an object to hide it (show again from the protocol).' },
  { id: 'delete', icon: '🗑', label: 'Delete', needs: [], help: 'Click an object to delete it and everything built on it.' },
]

const Pt = (id: string, name: string, x: number, y: number): Obj => ({ id, kind: 'point', name, parents: [], x, y })
const SAMPLE: Obj[] = [
  Pt('A', 'A', -2, -1), Pt('B', 'B', 2, -1),
  { id: 's1', kind: 'segment', name: 'c', parents: ['A', 'B'] },
  { id: 'c1', kind: 'circle', name: 'c1', parents: ['A', 'B'] },
  { id: 'c2', kind: 'circle', name: 'c2', parents: ['B', 'A'] },
  { id: 'C', kind: 'intersect', name: 'C', parents: ['c1', 'c2'], branch: 0 },
  { id: 'D', kind: 'intersect', name: 'D', parents: ['c1', 'c2'], branch: 1 },
  { id: 's2', kind: 'segment', name: 'a', parents: ['B', 'C'] },
  { id: 's3', kind: 'segment', name: 'b', parents: ['C', 'A'] },
  { id: 'l1', kind: 'line', name: 'd', parents: ['C', 'D'] },
  { id: 'p1', kind: 'polygon', name: 'poly1', parents: ['A', 'B', 'C'] },
  { id: 'm1', kind: 'angle', name: 'm1', parents: ['B', 'A', 'C'] },
  { id: 'm2', kind: 'distance', name: 'm2', parents: ['A', 'B'] },
]

interface S { objs: Obj[]; challenge: string; vx: number; vy: number; sc: number; labels: boolean }
const DEF: S = { objs: SAMPLE, challenge: '', vx: 0, vy: 0.6, sc: 70, labels: true }
const VW = 800, VH = 560

export default function GeometryConstructionTool() {
  const [s, set] = useToolState('geometry-construction-tool', DEF)
  const [tool, setTool] = useState<ToolId>('move')
  const [pick, setPick] = useState<string[]>([])
  const [undo, setUndo] = useState<Obj[][]>([])
  const [redo, setRedo] = useState<Obj[][]>([])
  const [step, setStep] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [hover, setHover] = useState<V | null>(null)
  const drag = useRef<{ id: string | null; last: V; moved: boolean } | null>(null)
  const svg = useRef<SVGSVGElement>(null)

  const objs = s.objs
  const shown = step === null ? objs : objs.slice(0, step)
  const vals = useMemo(() => evaluate(objs), [objs])
  const ch = CHALLENGES.find((c) => c.id === s.challenge)
  const solved = ch ? ch.check(objs, vals) : false
  const given = useMemo(() => new Set(ch?.given.map((g) => g.id) ?? []), [ch])
  const tools = TOOLS.filter((t) => !(ch && t.macro))
  const toolInfo = TOOLS.find((t) => t.id === tool)!

  useEffect(() => {
    if (!playing) return
    const h = setInterval(() => {
      setStep((k) => {
        const n = (k ?? 0) + 1
        if (n >= objs.length) {
          setPlaying(false)
          return null
        }
        return n
      })
    }, 700)
    return () => clearInterval(h)
  }, [playing, objs.length])

  // ---------- coordinates ----------
  const X = (x: number) => VW / 2 + (x - s.vx) * s.sc
  const Y = (y: number) => VH / 2 - (y - s.vy) * s.sc
  const toWorld = (e: { clientX: number; clientY: number }): V => {
    const el = svg.current!
    const pt = el.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const m = el.getScreenCTM()
    const v = m ? pt.matrixTransform(m.inverse()) : pt
    return { x: s.vx + (v.x - VW / 2) / s.sc, y: s.vy - (v.y - VH / 2) / s.sc }
  }
  const tol = 12 / s.sc

  const commit = (next: Obj[]) => {
    setUndo((u) => [...u.slice(-99), objs])
    setRedo([])
    set({ objs: next })
  }

  const nearestPoint = (q: V) => {
    let best: string | null = null, bd = tol
    for (const o of objs) {
      if (o.hidden || !isPointKind(o.kind)) continue
      const v = vals.get(o.id)
      if (v?.type === 'point' && dist(v.p, q) < bd) { bd = dist(v.p, q); best = o.id }
    }
    return best
  }
  const nearCurves = (q: V, lineOnly = false) => objs
    .filter((o) => !o.hidden && isCurveKind(o.kind) && (!lineOnly || vals.get(o.id)?.type === 'line'))
    .map((o) => ({ id: o.id, d: vals.get(o.id) ? distanceTo(vals.get(o.id)!, q) : Infinity }))
    .filter((c) => c.d < tol * 0.8)
    .sort((a, b) => a.d - b.d)

  /** Returns an existing or newly created point id for a click (smart snapping), plus objects to add. */
  const pointAt = (q: V, list: Obj[]): string => {
    const hit = nearestPoint(q)
    if (hit) return hit
    const cs = nearCurves(q)
    if (cs.length >= 2) {
      const a = vals.get(cs[0].id)!, b = vals.get(cs[1].id)!
      const xs = intersections(a, b)
      const k = xs.findIndex((p) => dist(p, q) < tol * 1.5)
      if (k >= 0) {
        const o: Obj = { id: uid(), kind: 'intersect', name: nextName([...objs, ...list], 'intersect'), parents: [cs[0].id, cs[1].id], branch: k }
        list.push(o)
        return o.id
      }
    }
    if (cs.length) {
      const pr = project(vals.get(cs[0].id)!, q)!
      const o: Obj = { id: uid(), kind: 'on', name: nextName([...objs, ...list], 'on'), parents: [cs[0].id], t: pr.t }
      list.push(o)
      return o.id
    }
    const o: Obj = { id: uid(), kind: 'point', name: nextName([...objs, ...list], 'point'), parents: [], x: +q.x.toFixed(4), y: +q.y.toFixed(4) }
    list.push(o)
    return o.id
  }

  const objectAt = (q: V) => nearestPoint(q) ?? nearCurves(q)[0]?.id ?? objs.find((o) => {
    const v = vals.get(o.id)
    return v?.type === 'measure' && dist(v.at, q) < tol * 2
  })?.id ?? null

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (step !== null) return
    const q = toWorld(e)
    if (tool === 'move') {
      const id = nearestPoint(q)
      const o = objs.find((x) => x.id === id)
      const movable = o && (o.kind === 'point' || o.kind === 'on') && !(given.has(o.id) && o.kind === 'point' && ch)
      drag.current = { id: movable ? id : null, last: q, moved: false }
      if (movable) setUndo((u) => [...u.slice(-99), objs])
      svg.current?.setPointerCapture(e.pointerId)
      return
    }
    if (tool === 'hide' || tool === 'delete') {
      const id = objectAt(q)
      if (!id) return
      if (tool === 'hide') commit(objs.map((o) => (o.id === id ? { ...o, hidden: true } : o)))
      else {
        if (given.has(id)) return
        const dead = dependents(objs, id)
        commit(objs.filter((o) => !dead.has(o.id)))
      }
      return
    }
    const added: Obj[] = []
    if (tool === 'polygon') {
      const id = pointAt(q, added)
      if (pick.length >= 3 && id === pick[0]) {
        commit([...objs, { id: uid(), kind: 'polygon', name: nextName(objs, 'polygon'), parents: pick }])
        setPick([])
      } else {
        if (added.length) commit([...objs, ...added])
        setPick([...pick, id])
      }
      return
    }
    if (tool === 'intersect') {
      const c = nearCurves(q)[0]
      if (!c) return
      const np = [...pick, c.id]
      if (np.length < 2) return setPick(np)
      setPick([])
      if (np[0] === np[1]) return
      const xs = intersections(vals.get(np[0])!, vals.get(np[1])!)
      const n = Math.max(xs.length, vals.get(np[0])?.type === 'circle' || vals.get(np[1])?.type === 'circle' ? 2 : 1)
      const list = [...objs]
      for (let k = 0; k < n; k++) list.push({ id: uid(), kind: 'intersect', name: nextName(list, 'intersect'), parents: np, branch: k })
      commit(list)
      return
    }
    const need = toolInfo.needs[pick.length]
    let id: string | null
    if (need === 'P') id = pointAt(q, added)
    else id = nearCurves(q, need === 'L')[0]?.id ?? null
    if (!id) return
    const np = [...pick, id]
    if (np.length < toolInfo.needs.length) {
      if (added.length) commit([...objs, ...added])
      setPick(np)
      return
    }
    setPick([])
    const base = [...objs, ...added]
    if (tool === 'point') {
      if (added.length) commit(base)
      return
    }
    if (new Set(np).size < np.length && tool !== 'compass') {
      if (added.length) commit(base)
      return
    }
    commit([...base, { id: uid(), kind: toolInfo.kind!, name: nextName(base, toolInfo.kind!), parents: np }])
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const q = toWorld(e)
    setHover(q)
    const d = drag.current
    if (!d) return
    d.moved = true
    if (d.id) {
      const o = objs.find((x) => x.id === d.id)!
      if (o.kind === 'point') set({ objs: objs.map((x) => (x.id === d.id ? { ...x, x: +q.x.toFixed(4), y: +q.y.toFixed(4) } : x)) })
      else {
        const pr = project(vals.get(o.parents[0])!, q)
        if (pr) set({ objs: objs.map((x) => (x.id === d.id ? { ...x, t: pr.t } : x)) })
      }
    } else {
      set({ vx: s.vx - (q.x - d.last.x), vy: s.vy - (q.y - d.last.y) })
    }
  }
  const onUp = () => {
    if (drag.current?.id && !drag.current.moved) setUndo((u) => u.slice(0, -1))
    drag.current = null
  }

  useEffect(() => {
    const el = svg.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      set((st) => ({ ...st, sc: Math.min(400, Math.max(10, st.sc * (e.deltaY < 0 ? 1.12 : 1 / 1.12))) }))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [set])

  // ---------- rendering ----------
  const big = (Math.hypot(VW, VH) / s.sc) * 2
  const center = { x: s.vx, y: s.vy }
  const lineEnds = (v: Extract<Val, { type: 'line' }>): [V, V] => {
    const len = Math.hypot(v.d.x, v.d.y)
    const u = { x: v.d.x / len, y: v.d.y / len }
    const t0 = (center.x - v.p.x) * u.x + (center.y - v.p.y) * u.y
    const a = v.kind === 'line' ? t0 - big : 0
    const b = v.kind === 'segment' ? len : Math.max(0, t0) + big
    return [{ x: v.p.x + u.x * a, y: v.p.y + u.y * a }, { x: v.p.x + u.x * b, y: v.p.y + u.y * b }]
  }
  const sel = new Set(pick)
  const fmt2 = (x: number) => x.toFixed(2)
  const draw = (o: Obj, layer: 'fill' | 'curve' | 'point') => {
    const v = vals.get(o.id)
    if (!v || o.hidden) return null
    const hl = sel.has(o.id)
    if (layer === 'fill' && v.type === 'polygon') {
      const c = v.pts.reduce((a, p) => ({ x: a.x + p.x / v.pts.length, y: a.y + p.y / v.pts.length }), { x: 0, y: 0 })
      return (
        <g key={o.id}>
          <polygon points={v.pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')} fill="rgba(99,102,241,.14)" stroke="rgba(99,102,241,.5)" />
          <text x={X(c.x)} y={Y(c.y)} textAnchor="middle" fontSize={12} fill="var(--accent)">Area {fmt2(v.area)}</text>
        </g>
      )
    }
    if (layer === 'curve') {
      const stroke = hl ? '#f59e0b' : given.has(o.id) ? 'var(--fg)' : o.kind === 'circle' || o.kind === 'compass' ? '#0ea5e9' : 'var(--fg)'
      const dash = ['perp', 'parallel', 'bisector', 'anglebis'].includes(o.kind) ? '6 4' : undefined
      if (v.type === 'line') {
        const [a, b] = lineEnds(v)
        const mid = o.kind === 'segment' ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null
        return (
          <g key={o.id}>
            <line x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} stroke={stroke} strokeWidth={hl ? 3 : 1.6} strokeDasharray={dash} />
            {s.labels && mid && <text x={X(mid.x) + 6} y={Y(mid.y) - 6} fontSize={12} fontStyle="italic" fill="var(--muted)">{o.name}</text>}
          </g>
        )
      }
      if (v.type === 'circle') return <circle key={o.id} cx={X(v.c.x)} cy={Y(v.c.y)} r={v.r * s.sc} fill="none" stroke={stroke} strokeWidth={hl ? 3 : 1.4} />
      if (v.type === 'measure') {
        if (v.unit === 'deg') {
          const [a, o2, c] = v.pts
          const r = 26 / s.sc
          const a1 = Math.atan2(a.y - o2.y, a.x - o2.x), a2 = Math.atan2(c.y - o2.y, c.x - o2.x)
          let d = a2 - a1
          while (d > Math.PI) d -= 2 * Math.PI
          while (d < -Math.PI) d += 2 * Math.PI
          const p1 = { x: o2.x + r * Math.cos(a1), y: o2.y + r * Math.sin(a1) }, p2 = { x: o2.x + r * Math.cos(a1 + d), y: o2.y + r * Math.sin(a1 + d) }
          const lm = { x: o2.x + 2.1 * r * Math.cos(a1 + d / 2), y: o2.y + 2.1 * r * Math.sin(a1 + d / 2) }
          return (
            <g key={o.id}>
              <path d={`M${X(p1.x)},${Y(p1.y)} A${r * s.sc},${r * s.sc} 0 0 ${d > 0 ? 0 : 1} ${X(p2.x)},${Y(p2.y)}`} fill="none" stroke="#10b981" strokeWidth={2} />
              <text x={X(lm.x)} y={Y(lm.y) + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#10b981">{v.value.toFixed(1)}°</text>
            </g>
          )
        }
        const [a, b] = v.pts
        return <text key={o.id} x={X(v.at.x)} y={Y(v.at.y) + 18} textAnchor="middle" fontSize={12} fontWeight={700} fill="#10b981">{`${objs.find((x) => x.id === o.parents[0])?.name}${objs.find((x) => x.id === o.parents[1])?.name} = ${dist(a, b).toFixed(3)}`}</text>
      }
    }
    if (layer === 'point' && v.type === 'point') {
      const fill = hl ? '#f59e0b' : o.kind === 'point' ? (given.has(o.id) && ch ? 'var(--fg)' : '#6366f1') : o.kind === 'on' ? '#38bdf8' : 'var(--fg)'
      return (
        <g key={o.id}>
          <circle cx={X(v.p.x)} cy={Y(v.p.y)} r={o.kind === 'point' || o.kind === 'on' ? 5 : 4} fill={fill} stroke="var(--panel)" strokeWidth={1.5} />
          {s.labels && <text x={X(v.p.x) + 7} y={Y(v.p.y) - 7} fontSize={13} fontWeight={700} fill="var(--fg)">{o.name}</text>}
        </g>
      )
    }
    return null
  }

  const exportSvg = () => {
    const el = svg.current
    if (!el) return
    const cs = getComputedStyle(document.documentElement)
    const xml = new XMLSerializer().serializeToString(el).replace(/var\((--[\w-]+)\)/g, (_, v: string) => cs.getPropertyValue(v).trim() || '#888')
    download('construction.svg', xml, 'image/svg+xml')
  }
  const loadChallenge = (id: string) => {
    const c = CHALLENGES.find((x) => x.id === id)
    setUndo([])
    setRedo([])
    setPick([])
    setStep(null)
    set({ challenge: id, objs: c ? structuredClone(c.given) : SAMPLE, vx: 0, vy: 0.6, sc: 70 })
    setTool(c ? 'circle' : 'move')
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Tools">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 6 }}>
            {tools.map((t) => (
              <button key={t.id} type="button" className={`k-btn ${tool === t.id ? 'primary' : ''}`} onClick={() => { setTool(t.id); setPick([]) }} title={t.help} style={{ justifyContent: 'flex-start' }}>
                <span style={{ width: 18, display: 'inline-block' }}>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>
          <Note>{toolInfo.help}{pick.length > 0 && <> — selected {pick.length}{tool === 'polygon' ? ' vertices' : `/${toolInfo.needs.length}`}</>}</Note>
          <Row>
            <Btn onClick={() => { if (!undo.length) return; setRedo((r) => [...r, objs]); set({ objs: undo[undo.length - 1] }); setUndo((u) => u.slice(0, -1)); setPick([]) }} disabled={!undo.length}>↶ Undo</Btn>
            <Btn onClick={() => { if (!redo.length) return; setUndo((u) => [...u, objs]); set({ objs: redo[redo.length - 1] }); setRedo((r) => r.slice(0, -1)) }} disabled={!redo.length}>↷ Redo</Btn>
            <Btn kind="ghost" onClick={() => commit(ch ? structuredClone(ch.given) : [])}>Clear</Btn>
          </Row>
          <Check label="Show labels" value={s.labels} onChange={(labels) => set({ labels })} />
        </Panel>
        <Panel title="Classic challenges">
          <Select label="Challenge" value={s.challenge} onChange={loadChallenge} options={[['', 'Free construction (sample: Euclid I.1)'], ...CHALLENGES.map((c) => [c.id, c.title] as [string, string])]} />
          {ch ? (
            solved ? <Note tone="ok">✓ Solved in {objs.length - ch.given.length} steps! Try it with fewer.</Note> : <Note>{ch.goal} Only compass and straightedge tools are available; macros are hidden.</Note>
          ) : (
            <div className="muted" style={{ fontSize: 13 }}>Pick a challenge to practise compass-and-straightedge constructions. Results are checked exactly.</div>
          )}
        </Panel>
        <Panel title="Construction protocol" actions={<JsonButtons name="construction.json" data={s} onLoad={(d) => set(d)} />}>
          <Row>
            <Btn onClick={() => { setStep(0); setPlaying(true) }} disabled={playing}>▶ Replay</Btn>
            {step !== null && <Btn kind="ghost" onClick={() => { setPlaying(false); setStep(null) }}>Show all</Btn>}
          </Row>
          {objs.length > 0 && <Slider label="Step" value={step ?? objs.length} onChange={(v) => { setPlaying(false); setStep(v >= objs.length ? null : v) }} min={0} max={objs.length} show={(v) => `${v} / ${objs.length}`} />}
          <Table
            max={80}
            head={['#', 'Name', 'Definition', '']}
            rows={objs.map((o, i) => {
              const v = vals.get(o.id)
              const val = !v ? 'undefined' : v.type === 'point' ? `(${fmt2(v.p.x)}, ${fmt2(v.p.y)})` : v.type === 'circle' ? `r = ${fmt2(v.r)}` : v.type === 'measure' ? (v.unit === 'deg' ? `${v.value.toFixed(2)}°` : v.value.toFixed(3)) : v.type === 'polygon' ? `A = ${fmt2(v.area)}, P = ${fmt2(v.perimeter)}` : ''
              return [
                <span key="i" style={{ opacity: step !== null && i >= step ? 0.35 : 1 }}>{i + 1}</span>,
                <b key="n">{o.name}</b>,
                <span key="d" style={{ opacity: step !== null && i >= step ? 0.35 : 1 }}>{describe(o, objs)}<br /><span className="muted" style={{ fontSize: 12 }}>{val}</span></span>,
                o.hidden ? <Btn key="h" kind="ghost" onClick={() => commit(objs.map((x) => (x.id === o.id ? { ...x, hidden: false } : x)))}>show</Btn> : '',
              ]
            })}
          />
        </Panel>
      </div>
      <div>
        <Panel title={ch ? ch.title : 'Construction'} actions={<><Btn onClick={() => set({ vx: 0, vy: 0.6, sc: 70 })}>⌖ Fit</Btn><Btn onClick={exportSvg}>⬇ SVG</Btn></>}>
          <svg
            ref={svg}
            viewBox={`0 0 ${VW} ${VH}`}
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: '100%', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, touchAction: 'none', cursor: tool === 'move' ? 'grab' : 'crosshair', userSelect: 'none' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={() => setHover(null)}
            role="img"
            aria-label="Construction canvas"
          >
            <rect x={0} y={0} width={VW} height={VH} fill="var(--panel)" />
            {Array.from({ length: 41 }, (_, i) => i - 20).map((k) => (
              <g key={k} opacity={0.5}>
                <line x1={X(Math.round(s.vx) + k)} x2={X(Math.round(s.vx) + k)} y1={0} y2={VH} stroke="var(--grid)" />
                <line y1={Y(Math.round(s.vy) + k)} y2={Y(Math.round(s.vy) + k)} x1={0} x2={VW} stroke="var(--grid)" />
              </g>
            ))}
            {shown.map((o) => draw(o, 'fill'))}
            {shown.map((o) => draw(o, 'curve'))}
            {shown.map((o) => draw(o, 'point'))}
            {hover && pick.length > 0 && tool !== 'intersect' && (() => {
              const last = vals.get(pick[pick.length - 1])
              return last?.type === 'point' ? <line x1={X(last.p.x)} y1={Y(last.p.y)} x2={X(hover.x)} y2={Y(hover.y)} stroke="#f59e0b" strokeDasharray="4 4" /> : null
            })()}
          </svg>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Blue points are free, light-blue points slide along their object, dark points are constructed. Everything updates live when you drag. Dashed lines are macro results.
            {hover && <> · cursor ({hover.x.toFixed(2)}, {hover.y.toFixed(2)})</>}
          </div>
        </Panel>
      </div>
    </Split>
  )
}
