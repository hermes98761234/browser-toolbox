import { useRef, useState } from 'react'
import { Btn, color, CsvButton, download, JsonButtons, Note, num, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { angles, area, centroid, edges, type P, parseWalk, perimeter, selfIntersects, toM2, type Unit, UNITS } from './lib/room-area-calculator'

interface Room { id: string; name: string; pts: P[]; height: number }
interface State { unit: Unit; snap: number; waste: number; rooms: Room[]; active: string }

const DEF: State = {
  unit: 'm',
  snap: 0.25,
  waste: 10,
  active: 'liv',
  rooms: [
    { id: 'liv', name: 'Living room', pts: [[0, 0], [6, 0], [6, 4], [4, 4], [4, 5.5], [0, 5.5]], height: 2.7 },
    { id: 'kit', name: 'Kitchen', pts: [[6, 0], [9.5, 0], [9.5, 4], [6, 4]], height: 2.7 },
    { id: 'bed', name: 'Bedroom', pts: [[4, 4], [9.5, 4], [9.5, 7], [8, 8.5], [4, 8.5]], height: 2.7 },
    { id: 'bath', name: 'Bathroom', pts: [[0, 5.5], [4, 5.5], [4, 8.5], [0, 8.5]], height: 2.5 },
  ],
}

const niceStep = (span: number) => {
  const raw = span / 16
  const p = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? p * 10
}

export default function RoomAreaCalculator() {
  const [s, set, reset] = useToolState('room-area-calculator', DEF)
  const [mode, setMode] = useState<'edit' | 'draw'>('edit')
  const [drawing, setDrawing] = useState<P[]>([])
  const [drag, setDrag] = useState<{ room: string; i: number; view: number[] } | null>(null)
  const [walk, setWalk] = useState('E 4, N 3, W 1.5, N 1, W 2.5, S 4')
  const svgRef = useRef<SVGSVGElement>(null)
  const u = UNITS[s.unit].short
  const room = s.rooms.find((r) => r.id === s.active) ?? s.rooms[0]
  const snap = (v: number) => (s.snap > 0 ? Math.round(v / s.snap) * s.snap : +v.toFixed(3))

  // view box (world y-up, svg y-down); frozen while dragging
  const all = [...s.rooms.flatMap((r) => r.pts), ...drawing]
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1])
  const live = all.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : [0, 0, 10, 8]
  const span0 = Math.max(live[2] - live[0], live[3] - live[1], 4)
  const pad = span0 * 0.12
  const view = drag?.view ?? [live[0] - pad, live[1] - pad, Math.max(live[2] - live[0], 4) + 2 * pad, Math.max(live[3] - live[1], 3) + 2 * pad]
  const [vx, vy, vw, vh] = view
  const span = Math.max(vw, vh)
  const hs = span / 90 // handle size
  const step = niceStep(span)

  const world = (e: { clientX: number; clientY: number }): P => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svgRef.current!.getScreenCTM()!.inverse())
    return [p.x, -p.y]
  }
  const setRoom = (id: string, patch: Partial<Room>) => set({ rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) })

  const onDown = (e: React.PointerEvent) => {
    const w = world(e)
    if (mode === 'draw') {
      const q: P = [snap(w[0]), snap(w[1])]
      if (drawing.length >= 3 && Math.hypot(q[0] - drawing[0][0], q[1] - drawing[0][1]) < hs * 2.5) return finish()
      setDrawing([...drawing, q])
    }
  }
  const startDrag = (e: React.PointerEvent, roomId: string, i: number, insert?: P) => {
    if (mode !== 'edit') return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    if (insert) {
      const r = s.rooms.find((x) => x.id === roomId)!
      setRoom(roomId, { pts: [...r.pts.slice(0, i), insert, ...r.pts.slice(i)] })
    }
    set({ active: roomId })
    setDrag({ room: roomId, i, view })
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return
    const w = world(e)
    const r = s.rooms.find((x) => x.id === drag.room)
    if (!r) return
    const q: P = [snap(w[0]), snap(w[1])]
    if (q[0] !== r.pts[drag.i]?.[0] || q[1] !== r.pts[drag.i]?.[1]) setRoom(r.id, { pts: r.pts.map((p, j) => (j === drag.i ? q : p)) })
  }
  const finish = () => {
    if (drawing.length < 3) return
    const id = uid()
    set({ rooms: [...s.rooms, { id, name: `Room ${s.rooms.length + 1}`, pts: drawing, height: room?.height ?? 2.5 }], active: id })
    setDrawing([])
    setMode('edit')
  }

  const conv = (a: number) => (s.unit === 'm' || s.unit === 'cm' ? toM2(a, s.unit) : toM2(a, s.unit) / 0.09290304)
  const areaUnit = s.unit === 'm' || s.unit === 'cm' ? 'm²' : 'ft²'
  const stats = s.rooms.map((r) => {
    const A = conv(area(r.pts))
    const Pm = perimeter(r.pts)
    const hU = s.unit === 'cm' ? r.height / 100 : s.unit === 'in' ? r.height / 12 : r.height // height in m or ft
    const PmU = s.unit === 'cm' ? Pm / 100 : s.unit === 'in' ? Pm / 12 : Pm
    return { r, A, P: PmU, V: A * hU, walls: PmU * hU, bad: selfIntersects(r.pts) }
  })
  const lenUnit = s.unit === 'm' || s.unit === 'cm' ? 'm' : 'ft'
  const volUnit = lenUnit === 'm' ? 'm³' : 'ft³'
  const tot = stats.reduce((a, x) => ({ A: a.A + x.A, V: a.V + x.V }), { A: 0, V: 0 })
  const cur = stats.find((x) => x.r.id === room?.id)
  const altArea = (A: number) => (areaUnit === 'm²' ? `${num(A / 0.09290304, 1)} ft²` : `${num(A * 0.09290304, 2)} m²`)

  const exportSvg = () => {
    const el = svgRef.current
    if (!el) return
    const clone = el.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.style.background = '#fff'
    download('floor-plan.svg', clone.outerHTML.replace(/var\(--[a-z0-9-]+\)/g, '#334155'), 'image/svg+xml')
  }

  const walkRes = parseWalk(walk)
  return (
    <Split wide="left">
      <div>
        <Panel
          title="Floor plan"
          actions={
            <>
              <Seg value={mode} onChange={(m) => { setMode(m); setDrawing([]) }} options={[['edit', '✥ Edit'], ['draw', '✎ Draw room']]} label="Mode" />
              <Btn onClick={exportSvg}>⬇ SVG</Btn>
            </>
          }
        >
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, background: 'var(--panel)', overflow: 'hidden' }}>
            <svg ref={svgRef} viewBox={`${vx} ${-(vy + vh)} ${vw} ${vh}`} style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 520, touchAction: 'none', cursor: mode === 'draw' ? 'crosshair' : 'default' }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => setDrag(null)}>
              {Array.from({ length: Math.ceil(vw / step) + 2 }, (_, i) => {
                const x = Math.floor(vx / step) * step + i * step
                return <line key={'x' + i} x1={x} x2={x} y1={-(vy + vh)} y2={-vy} stroke="var(--grid)" strokeWidth={span / 900} />
              })}
              {Array.from({ length: Math.ceil(vh / step) + 2 }, (_, i) => {
                const y = Math.floor(vy / step) * step + i * step
                return <line key={'y' + i} y1={-y} y2={-y} x1={vx} x2={vx + vw} stroke="var(--grid)" strokeWidth={span / 900} />
              })}
              {s.rooms.map((r, ri) => {
                const on = r.id === room?.id
                const c = color(ri)
                const ct = centroid(r.pts)
                const el = edges(r.pts)
                const ccw = r.pts.length > 2 && area(r.pts) > 0 && angles(r.pts).length > 0
                return (
                  <g key={r.id}>
                    <polygon points={r.pts.map((p) => `${p[0]},${-p[1]}`).join(' ')} fill={c} fillOpacity={on ? 0.22 : 0.1} stroke={c} strokeWidth={on ? span / 220 : span / 400} strokeLinejoin="round" onPointerDown={(e) => { if (mode === 'edit') { e.stopPropagation(); set({ active: r.id }) } }} style={{ cursor: mode === 'edit' ? 'pointer' : undefined }} />
                    <text x={ct[0]} y={-ct[1]} fontSize={span / 38} textAnchor="middle" fill="var(--fg)" fontWeight={700} pointerEvents="none">{r.name}</text>
                    <text x={ct[0]} y={-ct[1] + span / 30} fontSize={span / 44} textAnchor="middle" fill="var(--muted)" pointerEvents="none">{num(stats[ri].A, 2)} {areaUnit}</text>
                    {on && ccw && r.pts.map((p, i) => {
                      const q = r.pts[(i + 1) % r.pts.length]
                      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2
                      const L = el[i] || 1
                      // outward normal for label offset (sign by orientation)
                      const sgn = (r.pts.reduce((a, v, k) => a + v[0] * r.pts[(k + 1) % r.pts.length][1] - r.pts[(k + 1) % r.pts.length][0] * v[1], 0) > 0) ? 1 : -1
                      const nx = (sgn * (q[1] - p[1])) / L, ny = (sgn * -(q[0] - p[0])) / L
                      return (
                        <g key={i}>
                          <text x={mx + nx * span / 40} y={-(my + ny * span / 40)} fontSize={span / 50} textAnchor="middle" dominantBaseline="middle" fill={c} fontWeight={700} pointerEvents="none">{num(el[i], 2)}</text>
                          <circle cx={mx} cy={-my} r={hs * 0.8} fill="var(--panel)" stroke={c} strokeWidth={span / 600} strokeDasharray={`${hs / 2} ${hs / 3}`} style={{ cursor: 'copy' }} onPointerDown={(e) => startDrag(e, r.id, i + 1, [snap(mx), snap(my)])}><title>Drag to add a corner</title></circle>
                        </g>
                      )
                    })}
                    {on && mode === 'edit' && r.pts.map((p, i) => (
                      <circle key={'v' + i} cx={p[0]} cy={-p[1]} r={hs * 1.2} fill={c} stroke="#fff" strokeWidth={span / 500} style={{ cursor: 'move' }} onPointerDown={(e) => startDrag(e, r.id, i)} onDoubleClick={() => r.pts.length > 3 && setRoom(r.id, { pts: r.pts.filter((_, j) => j !== i) })}>
                        <title>{`(${p[0]}, ${p[1]}) — drag to move, double-click to delete`}</title>
                      </circle>
                    ))}
                  </g>
                )
              })}
              {drawing.length > 0 && (
                <g>
                  <polyline points={drawing.map((p) => `${p[0]},${-p[1]}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={span / 250} strokeDasharray={`${hs} ${hs / 2}`} />
                  {drawing.map((p, i) => <circle key={i} cx={p[0]} cy={-p[1]} r={hs * (i === 0 ? 1.6 : 1)} fill="var(--accent)" />)}
                </g>
              )}
            </svg>
          </div>
          <Row>
            <p className="k-hint" style={{ flex: 1, margin: '6px 0 0' }}>
              {mode === 'draw'
                ? `Click to place corners (snap ${s.snap} ${u}); click the first corner or “Finish” to close. ${drawing.length} corner(s) so far.`
                : `Grid = ${step} ${u}. Drag corners, drag ○ edge handles to add corners, double-click a corner to remove it, click a room to select it.`}
            </p>
            {mode === 'draw' && <><Btn kind="primary" disabled={drawing.length < 3} onClick={finish}>Finish room</Btn><Btn kind="ghost" onClick={() => setDrawing(drawing.slice(0, -1))}>Undo point</Btn></>}
          </Row>
        </Panel>

        <Panel title="Room schedule" actions={<>
          <CsvButton name="room-schedule.csv" rows={() => [['Room', `Area (${areaUnit})`, `Perimeter (${lenUnit})`, `Height (${u})`, `Volume (${volUnit})`, `Wall area (${areaUnit})`, `Flooring +${s.waste}% (${areaUnit})`], ...stats.map((x) => [x.r.name, +x.A.toFixed(3), +x.P.toFixed(3), x.r.height, +x.V.toFixed(3), +x.walls.toFixed(3), +(x.A * (1 + s.waste / 100)).toFixed(3)]), ['Total', +tot.A.toFixed(3), '', '', +tot.V.toFixed(3), '', +(tot.A * (1 + s.waste / 100)).toFixed(3)]]} />
          <JsonButtons name="rooms.json" data={s} onLoad={(d) => d && Array.isArray(d.rooms) && set(d)} />
          <Btn onClick={() => window.print()}>Print</Btn>
        </>}>
          <Table
            head={['Room', 'Area', 'Perimeter', 'Height', 'Volume', `+${s.waste}% flooring`, '']}
            rows={stats.map((x, i) => [
              <span key="n" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: color(i), flex: 'none' }} /><input value={x.r.name} onChange={(e) => setRoom(x.r.id, { name: e.target.value })} onFocus={() => set({ active: x.r.id })} aria-label="Room name" /></span>,
              <b key="a">{num(x.A, 2)} {areaUnit}</b>,
              `${num(x.P, 2)} ${lenUnit}`,
              <input key="h" type="number" min={0} step={0.1} value={x.r.height} onChange={(e) => setRoom(x.r.id, { height: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 70 }} aria-label="Ceiling height" />,
              `${num(x.V, 2)} ${volUnit}`,
              `${num(x.A * (1 + s.waste / 100), 2)} ${areaUnit}`,
              <Btn key="x" kind="ghost" title="Remove room" onClick={() => set({ rooms: s.rooms.filter((r) => r.id !== x.r.id) })}>✕</Btn>,
            ])}
            foot={['Total', `${num(tot.A, 2)} ${areaUnit}`, '', '', `${num(tot.V, 2)} ${volUnit}`, `${num(tot.A * (1 + s.waste / 100), 2)} ${areaUnit}`, '']}
          />
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label={`${room?.name ?? 'Room'} area`} value={`${num(cur?.A ?? 0, 2)} ${areaUnit}`} sub={altArea(cur?.A ?? 0)} tone="accent" />
          <Stat label="Perimeter" value={`${num(cur?.P ?? 0, 2)} ${lenUnit}`} sub={`${room?.pts.length ?? 0} corners`} />
          <Stat label="Wall area" value={`${num(cur?.walls ?? 0, 1)} ${areaUnit}`} sub="perimeter × height, no openings" />
          <Stat label="All rooms" value={`${num(tot.A, 2)} ${areaUnit}`} sub={altArea(tot.A)} />
        </Stats>
        {cur?.bad && <Note tone="err">This outline crosses itself, so the shoelace area is not the floor area. Reorder the corners.</Note>}
        <Panel title="Settings" actions={<Btn kind="ghost" onClick={() => { reset(); setDrawing([]) }}>Reset</Btn>}>
          <Row>
            <Select label="Coordinate unit" value={s.unit} onChange={(unit: Unit) => set({ unit })} options={Object.entries(UNITS).map(([k, v]) => [k as Unit, v.label] as [Unit, string])} />
            <Num label="Snap" unit={u} value={s.snap} min={0} onChange={(snap) => snap >= 0 && set({ snap })} />
            <Num label="Waste" unit="%" value={s.waste} min={0} max={50} onChange={(waste) => set({ waste })} />
          </Row>
        </Panel>
        {room && (
          <Panel title={`Corners · ${room.name}`} actions={<Btn onClick={() => { const last = room.pts[room.pts.length - 1]; setRoom(room.id, { pts: [...room.pts, [last[0] + 1, last[1]]] }) }}>+ Corner</Btn>}>
            <Table
              head={['#', `x (${u})`, `y (${u})`, 'Wall to next', 'Angle', '']}
              rows={room.pts.map((p, i) => [
                i + 1,
                <input key="x" type="number" step="any" value={p[0]} onChange={(e) => setRoom(room.id, { pts: room.pts.map((q, j) => (j === i ? [Number(e.target.value) || 0, q[1]] : q)) })} style={{ width: 72 }} aria-label="x" />,
                <input key="y" type="number" step="any" value={p[1]} onChange={(e) => setRoom(room.id, { pts: room.pts.map((q, j) => (j === i ? [q[0], Number(e.target.value) || 0] : q)) })} style={{ width: 72 }} aria-label="y" />,
                `${num(edges(room.pts)[i], 3)} ${u}`,
                `${num(angles(room.pts)[i], 1)}°`,
                <Btn key="d" kind="ghost" disabled={room.pts.length <= 3} onClick={() => setRoom(room.id, { pts: room.pts.filter((_, j) => j !== i) })}>✕</Btn>,
              ])}
            />
          </Panel>
        )}
        <Panel title="Measure by walking the walls">
          <Txt label="Wall runs (compass letter + length, or angle@length)" value={walk} onChange={setWalk} placeholder="E 4, N 3, W 1.5, N 1, W 2.5, S 4" />
          {walkRes.error ? <Note tone="err">{walkRes.error}</Note> : (
            <>
              <p className="muted" style={{ margin: '0 0 8px' }}>
                {walkRes.pts.length} corners · area {num(conv(area(walkRes.pts)), 2)} {areaUnit}
                {walkRes.gap > 1e-6 && ` · closing wall ${num(walkRes.gap, 3)} ${u} added`}
              </p>
              <Row>
                <Btn kind="primary" disabled={walkRes.pts.length < 3} onClick={() => {
                  const id = uid()
                  const ox = live[2] + 1, oy = live[1]
                  set({ rooms: [...s.rooms, { id, name: `Room ${s.rooms.length + 1}`, pts: walkRes.pts.map((p) => [+(p[0] + ox).toFixed(4), +(p[1] + oy).toFixed(4)]), height: 2.5 }], active: id })
                }}>Add as new room</Btn>
                {room && <Btn disabled={walkRes.pts.length < 3} onClick={() => setRoom(room.id, { pts: walkRes.pts.map((p) => [+(p[0] + room.pts[0][0]).toFixed(4), +(p[1] + room.pts[0][1]).toFixed(4)]) })}>Replace selected</Btn>}
              </Row>
            </>
          )}
          <Note>Area uses the shoelace formula: A = ½ |Σ (xᵢ·yᵢ₊₁ − xᵢ₊₁·yᵢ)| — exact for any simple polygon, including L-shapes and angled walls.</Note>
        </Panel>
      </div>
    </Split>
  )
}
