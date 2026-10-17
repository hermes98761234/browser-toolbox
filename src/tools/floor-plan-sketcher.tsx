import { useEffect, useRef, useState } from 'react'
import { Btn, Check, CsvButton, download, JsonButtons, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { area, centroid, dist, fmtArea, fmtLen, ortho, perimeter, project, snapGrid, type P } from './lib/floor-plan-sketcher'

interface Room { id: string; name: string; pts: P[]; color: string }
interface Wall { id: string; a: P; b: P }
interface Item { id: string; kind: 'door' | 'window'; x: number; y: number; w: number; rot: number }
interface Plan { rooms: Room[]; walls: Wall[]; items: Item[] }
type Mode = 'select' | 'room' | 'wall' | 'door' | 'window'
type Sel = { kind: 'room' | 'wall' | 'item'; id: string } | null
type Drag = { kind: 'vertex'; id: string; i: number } | { kind: 'room' | 'wall' | 'item'; id: string; from: P; orig: Plan } | { kind: 'end'; id: string; end: 'a' | 'b' } | null

const FILLS = ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3', '#ede9fe', '#ccfbf1', '#ffedd5']
const R = (x0: number, y0: number, x1: number, y1: number): P[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

const DEF = {
  units: 'm' as 'm' | 'ft',
  grid: 10,
  thick: 12,
  orthoOn: true,
  dims: true,
  plan: {
    rooms: [
      { id: 'liv', name: 'Living room', pts: R(0, 0, 550, 480), color: FILLS[0] },
      { id: 'kit', name: 'Kitchen', pts: R(550, 0, 950, 300), color: FILLS[2] },
      { id: 'bath', name: 'Bathroom', pts: R(550, 300, 780, 480), color: FILLS[5] },
      { id: 'hall', name: 'Hall', pts: R(780, 300, 950, 480), color: FILLS[6] },
      { id: 'bed', name: 'Bedroom', pts: R(0, 480, 550, 850), color: FILLS[4] },
      { id: 'bed2', name: 'Study', pts: [[550, 480], [950, 480], [950, 720], [820, 850], [550, 850]], color: FILLS[1] },
    ],
    walls: [{ id: 'w1', a: [180, 480], b: [180, 600] }],
    items: [
      { id: 'd1', kind: 'door', x: 950, y: 390, w: 90, rot: 90 },
      { id: 'd2', kind: 'door', x: 400, y: 480, w: 80, rot: 0 },
      { id: 'd3', kind: 'door', x: 550, y: 380, w: 80, rot: 270 },
      { id: 'd4', kind: 'door', x: 865, y: 300, w: 80, rot: 180 },
      { id: 'd5', kind: 'door', x: 600, y: 480, w: 70, rot: 180 },
      { id: 'w1', kind: 'window', x: 275, y: 0, w: 200, rot: 0 },
      { id: 'w2', kind: 'window', x: 750, y: 0, w: 140, rot: 0 },
      { id: 'w3', kind: 'window', x: 0, y: 665, w: 160, rot: 90 },
      { id: 'w4', kind: 'window', x: 685, y: 850, w: 150, rot: 0 },
    ],
  } as Plan,
}

export default function FloorPlanSketcher() {
  const [s, set, reset] = useToolState('floor-plan-sketcher', DEF)
  const svg = useRef<SVGSVGElement>(null)
  const [mode, setMode] = useState<Mode>('select')
  const [sel, setSel] = useState<Sel>(null)
  const [draft, setDraft] = useState<P[]>([])
  const [cursor, setCursor] = useState<P | null>(null)
  const [vb, setVb] = useState({ x: -150, y: -150, w: 1250, h: 1150 })
  const [hist, setHist] = useState<Plan[]>([])
  const drag = useRef<Drag>(null)
  const plan = s.plan
  const px = vb.w / 900 // world cm per screen px (approx.)

  const commit = (next: Plan, keepHist = false) => {
    if (!keepHist) setHist((h) => [...h.slice(-49), plan])
    set({ plan: next })
  }
  const undo = () => {
    const last = hist[hist.length - 1]
    if (!last) return
    setHist(hist.slice(0, -1))
    set({ plan: last })
  }
  const toWorld = (e: { clientX: number; clientY: number }): P => {
    const el = svg.current!
    const pt = el.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const w = pt.matrixTransform(el.getScreenCTM()!.inverse())
    return [w.x, w.y]
  }
  const vertices = (): P[] => [...plan.rooms.flatMap((r) => r.pts), ...plan.walls.flatMap((w) => [w.a, w.b])]
  const snap = (p: P, from?: P): P => {
    const tol = 14 * px
    let best: P | null = null, bd = tol
    for (const v of vertices()) {
      const d = dist(v, p)
      if (d < bd) [best, bd] = [v, d]
    }
    if (best) return [best[0], best[1]]
    let q = snapGrid(p, s.grid)
    if (from && s.orthoOn) q = snapGrid(ortho(from, q), s.grid / 2)
    return q
  }
  const edges = (): [P, P][] => [...plan.rooms.flatMap((r) => r.pts.map((p, i) => [p, r.pts[(i + 1) % r.pts.length]] as [P, P])), ...plan.walls.map((w) => [w.a, w.b] as [P, P])]
  /** Snap an opening onto the nearest wall and align it. */
  const placeOn = (p: P): { x: number; y: number; rot: number } => {
    let best = { x: Math.round(p[0]), y: Math.round(p[1]), rot: 0 }, bd = 40 * px
    for (const [a, b] of edges()) {
      const r = project(p, a, b)
      if (r.d < bd) {
        bd = r.d
        best = { x: Math.round(r.q[0]), y: Math.round(r.q[1]), rot: Math.round((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI) }
      }
    }
    return best
  }

  const finish = () => {
    if (mode === 'room' && draft.length >= 3) {
      const id = uid()
      commit({ ...plan, rooms: [...plan.rooms, { id, name: `Room ${plan.rooms.length + 1}`, pts: draft, color: FILLS[plan.rooms.length % FILLS.length] }] })
      setSel({ kind: 'room', id })
    }
    setDraft([])
  }
  const del = () => {
    if (!sel) return
    commit({ rooms: plan.rooms.filter((r) => r.id !== sel.id), walls: plan.walls.filter((w) => w.id !== sel.id), items: plan.items.filter((i) => i.id !== sel.id) })
    setSel(null)
  }
  const onBgDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const raw = toWorld(e)
    if (mode === 'select') return setSel(null)
    if (mode === 'door' || mode === 'window') {
      const id = uid()
      commit({ ...plan, items: [...plan.items, { id, kind: mode, ...placeOn(raw), w: mode === 'door' ? 80 : 120 }] })
      setSel({ kind: 'item', id })
      return
    }
    const p = snap(raw, draft[draft.length - 1])
    if (mode === 'room') {
      if (draft.length >= 3 && dist(p, draft[0]) < 14 * px) return finish()
      setDraft([...draft, p])
    } else if (mode === 'wall') {
      const last = draft[draft.length - 1]
      if (last && dist(last, p) > 1) commit({ ...plan, walls: [...plan.walls, { id: uid(), a: last, b: p }] })
      setDraft([p])
    }
  }
  const startDrag = (e: React.PointerEvent, d: NonNullable<Drag>) => {
    if (mode !== 'select') return
    e.stopPropagation()
    svg.current?.setPointerCapture(e.pointerId)
    setHist((h) => [...h.slice(-49), plan])
    drag.current = d
  }
  const onMove = (e: React.PointerEvent) => {
    const w = toWorld(e)
    const d = drag.current
    if (!d) {
      setCursor(mode === 'room' || mode === 'wall' ? snap(w, draft[draft.length - 1]) : w)
      return
    }
    if (d.kind === 'vertex') {
      const p = snap(w)
      set({ plan: { ...plan, rooms: plan.rooms.map((r) => (r.id === d.id ? { ...r, pts: r.pts.map((q, i) => (i === d.i ? p : q)) } : r)) } })
    } else if (d.kind === 'end') {
      const p = snap(w)
      set({ plan: { ...plan, walls: plan.walls.map((x) => (x.id === d.id ? { ...x, [d.end]: p } : x)) } })
    } else {
      const g = snapGrid([w[0] - d.from[0], w[1] - d.from[1]], s.grid)
      const mv = (p: P): P => [p[0] + g[0], p[1] + g[1]]
      const o = d.orig
      if (d.kind === 'room') set({ plan: { ...o, rooms: o.rooms.map((r) => (r.id === d.id ? { ...r, pts: r.pts.map(mv) } : r)) } })
      else if (d.kind === 'wall') set({ plan: { ...o, walls: o.walls.map((x) => (x.id === d.id ? { ...x, a: mv(x.a), b: mv(x.b) } : x)) } })
      else set({ plan: { ...o, items: o.items.map((it) => (it.id === d.id ? { ...it, ...placeOn(w) } : it)) } })
    }
  }
  const zoom = (k: number, at?: P) => {
    const c = at ?? [vb.x + vb.w / 2, vb.y + vb.h / 2]
    setVb({ x: c[0] - (c[0] - vb.x) * k, y: c[1] - (c[1] - vb.y) * k, w: vb.w * k, h: vb.h * k })
  }
  const fit = () => {
    const pts = vertices()
    if (!pts.length) return setVb({ x: -100, y: -100, w: 1200, h: 1000 })
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const m = Math.max(x1 - x0, y1 - y0) * 0.15 + 60
    setVb({ x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m })
  }

  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {})
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select')) return
      if (e.key === 'Escape' || e.key === 'Enter') finish()
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) del()
      else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) undo()
    }
    wheelRef.current = (e: WheelEvent) => {
      e.preventDefault()
      zoom(e.deltaY > 0 ? 1.1 : 0.9, toWorld(e))
    }
  })
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e)
    const w = (e: WheelEvent) => wheelRef.current(e)
    const el = svg.current
    window.addEventListener('keydown', h)
    el?.addEventListener('wheel', w, { passive: false })
    return () => {
      window.removeEventListener('keydown', h)
      el?.removeEventListener('wheel', w)
    }
  }, [])

  const fs = vb.w / 60
  const L = (cm: number) => fmtLen(cm, s.units)
  const totalArea = plan.rooms.reduce((a, r) => a + area(r.pts), 0)
  const wallLen = (() => {
    const seen = new Set<string>()
    let sum = 0
    for (const [a, b] of edges()) {
      const k = [a.join(','), b.join(',')].sort().join('|')
      if (seen.has(k)) continue
      seen.add(k)
      sum += dist(a, b)
    }
    return sum
  })()
  const dimEdges = (() => {
    const seen = new Set<string>()
    return edges().filter(([a, b]) => {
      const k = [a.join(','), b.join(',')].sort().join('|')
      if (seen.has(k) || dist(a, b) < 1) return false
      seen.add(k)
      return true
    })
  })()
  const selRoom = sel?.kind === 'room' ? plan.rooms.find((r) => r.id === sel.id) : undefined
  const selItem = sel?.kind === 'item' ? plan.items.find((i) => i.id === sel.id) : undefined
  const editRoom = (patch: Partial<Room>) => selRoom && commit({ ...plan, rooms: plan.rooms.map((r) => (r.id === selRoom.id ? { ...r, ...patch } : r)) })
  const editItem = (patch: Partial<Item>) => selItem && commit({ ...plan, items: plan.items.map((i) => (i.id === selItem.id ? { ...i, ...patch } : i)) })

  const svgText = () => {
    const el = svg.current!.cloneNode(true) as SVGSVGElement
    el.querySelectorAll('[data-ui]').forEach((n) => n.remove())
    el.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    el.setAttribute('width', '1600')
    el.setAttribute('height', String(Math.round((1600 * vb.h) / vb.w)))
    return new XMLSerializer().serializeToString(el)
  }
  const exportPng = () => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const g = c.getContext('2d')!
      g.fillStyle = '#fff'
      g.fillRect(0, 0, c.width, c.height)
      g.drawImage(img, 0, 0)
      c.toBlob((b) => b && download('floor-plan.png', b, 'image/png'))
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText())
  }

  const textAt = (x: number, y: number, t: string, rot = 0, size = fs, weight = 600, fill = '#334155') => (
    <text x={x} y={y} fontSize={size} fontWeight={weight} fill={fill} textAnchor="middle" dominantBaseline="middle" transform={rot ? `rotate(${rot} ${x} ${y})` : undefined} style={{ pointerEvents: 'none', fontFamily: 'system-ui, sans-serif' }}>{t}</text>
  )
  const preview = cursor && draft.length && (mode === 'room' || mode === 'wall') ? cursor : null

  return (
    <Split wide="right">
      <div>
        <Panel title="Tools">
          <Seg value={mode} onChange={(m) => { setDraft([]); setMode(m) }} options={[['select', '↖ Select'], ['room', '▱ Room'], ['wall', '／ Wall'], ['door', '🚪 Door'], ['window', '▭ Window']]} label="Tool" />
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
            {mode === 'select' && 'Click a room, wall, door or window to select it. Drag rooms and openings to move, drag corner handles to reshape. Delete key removes.'}
            {mode === 'room' && 'Click corners one by one. Click the first corner (or press Enter) to close the room. Points snap to the grid and to existing corners.'}
            {mode === 'wall' && 'Click to start, click again for each segment. Esc ends the chain. Ortho keeps walls at 0/45/90°.'}
            {(mode === 'door' || mode === 'window') && 'Click on a wall: the opening snaps onto it and aligns with it.'}
          </p>
          {draft.length > 0 && (
            <Row>
              {mode === 'room' && <Btn kind="primary" disabled={draft.length < 3} onClick={finish}>Close room</Btn>}
              <Btn onClick={() => setDraft([])}>{mode === 'wall' ? 'End wall' : 'Cancel'}</Btn>
            </Row>
          )}
          <Row>
            <Btn onClick={undo} disabled={!hist.length}>↶ Undo</Btn>
            <Btn kind="danger" onClick={del} disabled={!sel}>Delete</Btn>
            <Btn kind="ghost" onClick={() => { commit({ rooms: [], walls: [], items: [] }); setSel(null) }}>Clear</Btn>
            <Btn kind="ghost" onClick={() => { reset(); setSel(null); setHist([]) }}>Sample</Btn>
          </Row>
        </Panel>
        {selRoom && (
          <Panel title="Room">
            <label className="k-field"><span className="k-label">Name</span><input className="k-text" value={selRoom.name} onChange={(e) => editRoom({ name: e.target.value })} /></label>
            <Row>
              {FILLS.map((c) => <button key={c} type="button" aria-label="Room colour" onClick={() => editRoom({ color: c })} style={{ width: 28, height: 28, borderRadius: 6, background: c, border: c === selRoom.color ? '2px solid var(--accent)' : '1px solid var(--line)', cursor: 'pointer' }} />)}
            </Row>
            <p><b>{fmtArea(area(selRoom.pts), s.units)}</b> · perimeter {L(perimeter(selRoom.pts))} · {selRoom.pts.length} corners</p>
          </Panel>
        )}
        {selItem && (
          <Panel title={selItem.kind === 'door' ? 'Door' : 'Window'}>
            <Row>
              <Num label="Width" value={selItem.w} onChange={(w) => editItem({ w: Math.max(30, w) })} unit="cm" min={30} max={400} />
              <Btn onClick={() => editItem({ rot: (selItem.rot + 90) % 360 })}>⟳ Rotate / flip</Btn>
            </Row>
          </Panel>
        )}
        <Panel title="Settings">
          <Row>
            <Seg value={s.units} onChange={(units) => set({ units })} options={[['m', 'Metric'], ['ft', 'Feet & inches']]} label="Units" />
          </Row>
          <Row>
            <Num label="Grid snap" value={s.grid} onChange={(grid) => set({ grid: Math.max(1, grid) })} unit="cm" min={1} max={100} />
            <Num label="Wall thickness" value={s.thick} onChange={(thick) => set({ thick: Math.max(2, thick) })} unit="cm" min={2} max={60} />
          </Row>
          <Row>
            <Check label="Ortho (0/45/90°)" value={s.orthoOn} onChange={(orthoOn) => set({ orthoOn })} />
            <Check label="Dimensions" value={s.dims} onChange={(dims) => set({ dims })} />
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Total floor area" value={fmtArea(totalArea, s.units)} tone="accent" />
          <Stat label="Rooms" value={plan.rooms.length} />
          <Stat label="Wall length" value={L(wallLen)} sub="unique segments" />
          <Stat label="Doors / windows" value={`${plan.items.filter((i) => i.kind === 'door').length} / ${plan.items.filter((i) => i.kind === 'window').length}`} />
        </Stats>
        <Panel
          title="Plan"
          actions={
            <>
              <Btn onClick={() => zoom(0.8)} title="Zoom in">＋</Btn>
              <Btn onClick={() => zoom(1.25)} title="Zoom out">－</Btn>
              <Btn onClick={fit}>Fit</Btn>
              <Btn onClick={() => download('floor-plan.svg', svgText(), 'image/svg+xml')}>⬇ SVG</Btn>
              <Btn onClick={exportPng}>⬇ PNG</Btn>
            </>
          }
        >
          <svg
            ref={svg}
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            style={{ width: '100%', aspectRatio: `${vb.w} / ${vb.h}`, maxHeight: '70vh', background: '#fff', borderRadius: 10, border: '1px solid var(--line)', touchAction: 'none', cursor: mode === 'select' ? 'default' : 'crosshair', display: 'block' }}
            onPointerMove={onMove}
            onPointerUp={() => (drag.current = null)}
            onPointerLeave={() => setCursor(null)}
            onDoubleClick={finish}
            onContextMenu={(e) => { e.preventDefault(); finish() }}
          >
            <defs>
              <pattern id="fps-grid" width={50} height={50} patternUnits="userSpaceOnUse">
                <path d="M50 0H0V50" fill="none" stroke="#e2e8f0" strokeWidth={vb.w / 1200} />
              </pattern>
            </defs>
            <rect data-ui x={vb.x - vb.w} y={vb.y - vb.h} width={vb.w * 3} height={vb.h * 3} fill="url(#fps-grid)" onPointerDown={onBgDown} />
            {plan.rooms.map((r) => (
              <polygon key={r.id} points={r.pts.map((p) => p.join(',')).join(' ')} fill={r.color} stroke="none" onPointerDown={(e) => { if (mode !== 'select') return onBgDown(e); setSel({ kind: 'room', id: r.id }); startDrag(e, { kind: 'room', id: r.id, from: toWorld(e), orig: plan }) }} />
            ))}
            {plan.rooms.map((r) => (
              <polygon key={`w${r.id}`} points={r.pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="#1e293b" strokeWidth={s.thick} strokeLinejoin="miter" style={{ pointerEvents: 'none' }} />
            ))}
            {plan.walls.map((w) => (
              <line key={w.id} x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke={sel?.id === w.id ? '#4f46e5' : '#1e293b'} strokeWidth={s.thick} strokeLinecap="square" onPointerDown={(e) => { if (mode !== 'select') return onBgDown(e); setSel({ kind: 'wall', id: w.id }); startDrag(e, { kind: 'wall', id: w.id, from: toWorld(e), orig: plan }) }} />
            ))}
            {plan.items.map((it) => {
              const t = s.thick + 2
              const on = sel?.id === it.id
              return (
                <g key={it.id} transform={`translate(${it.x} ${it.y}) rotate(${it.rot})`} onPointerDown={(e) => { if (mode !== 'select') return; setSel({ kind: 'item', id: it.id }); startDrag(e, { kind: 'item', id: it.id, from: toWorld(e), orig: plan }) }} style={{ cursor: mode === 'select' ? 'move' : undefined }}>
                  <rect x={-it.w / 2} y={-t / 2} width={it.w} height={t} fill="#fff" stroke={on ? '#4f46e5' : 'none'} strokeWidth={2} />
                  {it.kind === 'door' ? (
                    <>
                      <line x1={-it.w / 2} y1={0} x2={-it.w / 2} y2={-it.w} stroke={on ? '#4f46e5' : '#334155'} strokeWidth={3} />
                      <path d={`M${-it.w / 2} ${-it.w} A${it.w} ${it.w} 0 0 1 ${it.w / 2} 0`} fill="none" stroke={on ? '#4f46e5' : '#94a3b8'} strokeWidth={1.5} strokeDasharray="6 4" />
                    </>
                  ) : (
                    <>
                      <rect x={-it.w / 2} y={-t / 2} width={it.w} height={t} fill="#e0f2fe" stroke={on ? '#4f46e5' : '#0369a1'} strokeWidth={2} />
                      <line x1={-it.w / 2} y1={0} x2={it.w / 2} y2={0} stroke="#0369a1" strokeWidth={1.5} />
                    </>
                  )}
                </g>
              )
            })}
            {s.dims && dimEdges.map(([a, b], i) => {
              const len = dist(a, b)
              const ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
              const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len
              const off = s.thick / 2 + fs * 0.9
              const mx = (a[0] + b[0]) / 2 + nx * off, my = (a[1] + b[1]) / 2 + ny * off
              const rot = ang > 90 || ang < -90 ? ang + 180 : ang
              return <g key={i}>{textAt(mx, my, L(len), rot, fs * 0.85, 500, '#64748b')}</g>
            })}
            {plan.rooms.map((r) => {
              const [cx, cy] = centroid(r.pts)
              return (
                <g key={`l${r.id}`}>
                  {textAt(cx, cy - fs * 0.7, r.name, 0, fs * 1.05, 700, '#0f172a')}
                  {textAt(cx, cy + fs * 0.6, fmtArea(area(r.pts), s.units), 0, fs * 0.9, 500, '#475569')}
                </g>
              )
            })}
            {selRoom && mode === 'select' && selRoom.pts.map((p, i) => (
              <circle data-ui key={i} cx={p[0]} cy={p[1]} r={7 * px} fill="#fff" stroke="#4f46e5" strokeWidth={2.5 * px} style={{ cursor: 'grab' }} onPointerDown={(e) => startDrag(e, { kind: 'vertex', id: selRoom.id, i })} />
            ))}
            {sel?.kind === 'wall' && mode === 'select' && plan.walls.filter((w) => w.id === sel.id).flatMap((w) => (['a', 'b'] as const).map((end) => (
              <circle data-ui key={end} cx={w[end][0]} cy={w[end][1]} r={7 * px} fill="#fff" stroke="#4f46e5" strokeWidth={2.5 * px} style={{ cursor: 'grab' }} onPointerDown={(e) => startDrag(e, { kind: 'end', id: w.id, end })} />
            )))}
            {draft.length > 0 && (
              <g data-ui style={{ pointerEvents: 'none' }}>
                <polyline points={[...draft, ...(preview ? [preview] : [])].map((p) => p.join(',')).join(' ')} fill={mode === 'room' ? 'rgba(79,70,229,.08)' : 'none'} stroke="#4f46e5" strokeWidth={s.thick * 0.6} strokeDasharray={`${12 * px} ${8 * px}`} />
                {draft.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={5 * px} fill="#4f46e5" />)}
                {preview && textAt(preview[0] + 40 * px, preview[1] - 18 * px, L(dist(draft[draft.length - 1], preview)), 0, fs, 700, '#4f46e5')}
              </g>
            )}
            {cursor && (mode === 'room' || mode === 'wall') && <circle data-ui cx={cursor[0]} cy={cursor[1]} r={4 * px} fill="none" stroke="#4f46e5" strokeWidth={2 * px} style={{ pointerEvents: 'none' }} />}
          </svg>
          <p className="muted" style={{ fontSize: 13 }}>Grid squares are 50 cm. Scroll to zoom. Right-click or double-click ends drawing; Ctrl+Z undoes.</p>
        </Panel>
        <Panel title="Room schedule" actions={<><CsvButton name="rooms.csv" rows={() => [['Room', `Area (${s.units === 'm' ? 'm²' : 'ft²'})`, 'Perimeter (cm)'], ...plan.rooms.map((r) => [r.name, s.units === 'm' ? +(area(r.pts) / 1e4).toFixed(2) : +(area(r.pts) / 929.0304).toFixed(1), Math.round(perimeter(r.pts))])]} /><JsonButtons name="floor-plan.json" data={plan} onLoad={(p) => p && Array.isArray(p.rooms) && commit({ rooms: p.rooms, walls: p.walls ?? [], items: p.items ?? [] })} /></>}>
          {plan.rooms.length === 0 ? <Note>No rooms yet: pick the Room tool and click the corners.</Note> : (
            <Table
              head={['Room', 'Area', 'Perimeter', 'Share']}
              rows={plan.rooms.map((r) => [<span key="n"><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: r.color, marginRight: 6, border: '1px solid var(--line)' }} />{r.name}</span>, fmtArea(area(r.pts), s.units), L(perimeter(r.pts)), `${((area(r.pts) / (totalArea || 1)) * 100).toFixed(0)}%`])}
              foot={['Total', fmtArea(totalArea, s.units), '', '100%']}
            />
          )}
        </Panel>
      </div>
    </Split>
  )
}
