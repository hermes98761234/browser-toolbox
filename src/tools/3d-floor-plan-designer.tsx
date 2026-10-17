import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react'
import { Btn, color, download, fmt, JsonButtons, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { centroid, distToSegment, perimeter, polygonArea, snap, type Pt } from './lib/3d-floor-plan-designer'

interface Wall { id: string; a: Pt; b: Pt }
interface Room { id: string; name: string; pts: Pt[]; color: string }
interface State { walls: Wall[]; rooms: Room[]; height: number; thick: number; grid: number }

const W = (a: Pt, b: Pt): Wall => ({ id: uid(), a, b })
const DEF: State = {
  height: 2.7, thick: 0.15, grid: 0.25,
  walls: [
    W([0, 0], [10, 0]), W([10, 0], [10, 8]), W([10, 8], [0, 8]), W([0, 8], [0, 0]),
    W([6, 0], [6, 1.5]), W([6, 2.4], [6, 4]),
    W([7, 4], [8, 4]), W([8.9, 4], [10, 4]),
    W([0, 5], [1.5, 5]), W([2.4, 5], [5, 5]), W([5.9, 5], [7, 5]),
    W([4, 5], [4, 8]), W([7, 5], [7, 8]),
  ],
  rooms: [
    { id: 'r1', name: 'Living room', pts: [[0, 0], [6, 0], [6, 4], [7, 4], [7, 5], [0, 5]], color: color(0) },
    { id: 'r2', name: 'Kitchen', pts: [[6, 0], [10, 0], [10, 4], [6, 4]], color: color(3) },
    { id: 'r3', name: 'Bedroom', pts: [[0, 5], [4, 5], [4, 8], [0, 8]], color: color(5) },
    { id: 'r4', name: 'Bathroom', pts: [[4, 5], [7, 5], [7, 8], [4, 8]], color: color(1) },
    { id: 'r5', name: 'Study', pts: [[7, 4], [10, 4], [10, 8], [7, 8]], color: color(2) },
  ],
}

type Tool = 'wall' | 'room' | 'select'
type Sel = { kind: 'wall' | 'room'; id: string } | null

function rebuild(st: Stage3D, s: State) {
  const g = st.scene.getObjectByName('plan') as THREE.Group
  st.clear(g)
  const pts = [...s.walls.flatMap((w) => [w.a, w.b]), ...s.rooms.flatMap((r) => r.pts)]
  const cx = pts.length ? (Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2 : 0
  const cz = pts.length ? (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2 : 0
  g.position.set(-cx, 0, -cz)
  g.userData.offset = [cx, cz]
  const wallMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.85 })
  for (const w of s.walls) {
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])
    if (len < 1e-3) continue
    const m = new THREE.Mesh(new THREE.BoxGeometry(len + s.thick, s.height, s.thick), wallMat)
    m.position.set((w.a[0] + w.b[0]) / 2, s.height / 2, (w.a[1] + w.b[1]) / 2)
    m.rotation.y = -Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0])
    g.add(m)
  }
  for (const r of s.rooms) {
    if (r.pts.length < 3) continue
    const shape = new THREE.Shape(r.pts.map(([x, y]) => new THREE.Vector2(x, -y)))
    const f = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: r.color, roughness: 0.9, side: THREE.DoubleSide }))
    f.rotation.x = -Math.PI / 2
    f.position.y = 0.01
    g.add(f)
  }
}

export default function FloorPlanDesigner3D() {
  const [s, set, reset] = useToolState('3d-floor-plan-designer', DEF)
  const [tool, setTool] = useState<Tool>('wall')
  const [draft, setDraft] = useState<Pt[]>([])
  const [cursor, setCursor] = useState<Pt | null>(null)
  const [sel, setSel] = useState<Sel>(null)
  const [drag, setDrag] = useState<Pt | null>(null)
  const [walk, setWalk] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const keys = useRef(new Set<string>())
  const walkRef = useRef({ on: false, yaw: 0, pitch: 0, look: false, lx: 0, ly: 0 })
  const stateRef = useRef(s)
  useEffect(() => {
    stateRef.current = s
  }, [s])
  const stage = useRef<Stage3D | null>(null)

  const ref = useStage3D(
    (st) => {
      stage.current = st
      const g = new THREE.Group()
      g.name = 'plan'
      st.scene.add(g)
      const el = st.renderer.domElement
      const w = walkRef.current
      const down = (e: PointerEvent) => { if (w.on) { w.look = true; w.lx = e.clientX; w.ly = e.clientY } }
      const move = (e: PointerEvent) => {
        if (!w.on || !w.look) return
        w.yaw -= (e.clientX - w.lx) * 0.005
        w.pitch = Math.max(-1.2, Math.min(1.2, w.pitch - (e.clientY - w.ly) * 0.005))
        w.lx = e.clientX; w.ly = e.clientY
      }
      const up = () => { w.look = false }
      el.addEventListener('pointerdown', down)
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      st.onFrame((_t, dt) => {
        if (!w.on) return
        const k = keys.current
        const sp = (k.has('shift') ? 3.2 : 1.6) * dt
        const fx = -Math.sin(w.yaw), fz = -Math.cos(w.yaw)
        let mx = 0, mz = 0
        if (k.has('w') || k.has('arrowup')) { mx += fx; mz += fz }
        if (k.has('s') || k.has('arrowdown')) { mx -= fx; mz -= fz }
        if (k.has('a')) { mx += fz; mz -= fx }
        if (k.has('d')) { mx -= fz; mz += fx }
        if (k.has('arrowleft')) w.yaw += 1.8 * dt
        if (k.has('arrowright')) w.yaw -= 1.8 * dt
        const cam = st.camera
        if (mx || mz) {
          const n = Math.hypot(mx, mz)
          const [ox, oz] = (st.scene.getObjectByName('plan')!.userData.offset as [number, number]) ?? [0, 0]
          const ss = stateRef.current
          const tryMove = (nx: number, nz: number) => {
            const px = nx + ox, pz = nz + oz
            return !ss.walls.some((wl) => distToSegment(px, pz, wl.a[0], wl.a[1], wl.b[0], wl.b[1]) < ss.thick / 2 + 0.25)
          }
          const nx = cam.position.x + (mx / n) * sp, nz = cam.position.z + (mz / n) * sp
          if (tryMove(nx, nz)) cam.position.set(nx, 1.6, nz)
          else if (tryMove(nx, cam.position.z)) cam.position.x = nx
          else if (tryMove(cam.position.x, nz)) cam.position.z = nz
        }
        const d = new THREE.Vector3(Math.cos(w.pitch) * -Math.sin(w.yaw), Math.sin(w.pitch), Math.cos(w.pitch) * -Math.cos(w.yaw))
        st.controls.target.copy(cam.position).add(d)
      })
      return () => {
        el.removeEventListener('pointerdown', down)
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
    },
    (st) => rebuild(st, s),
    [s.walls, s.rooms, s.height, s.thick],
    { camera: [0, 13, 11], target: [0, 0, 0] },
  )

  // keyboard for walking + Escape to finish drawing
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select')) return
      if (walkRef.current.on && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(e.key.toLowerCase())) {
        keys.current.add(e.key.toLowerCase())
        e.preventDefault()
      }
      if (e.key === 'Escape') setDraft([])
    }
    const ku = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [])

  const toggleWalk = () => {
    const canvas = ref.current?.querySelector('canvas')
    const w = walkRef.current
    w.on = !walk
    setWalk(!walk)
    const st = stage.current
    if (!st) return
    st.controls.enabled = !w.on
    if (w.on) {
      // start in the middle of the first room, looking along -z
      const [ox, oz] = (st.scene.getObjectByName('plan')!.userData.offset as [number, number]) ?? [0, 0]
      const r = s.rooms[0]
      const c = r ? centroid(r.pts) : [ox, oz]
      st.camera.position.set(c[0] - ox, 1.6, c[1] - oz)
      // face the direction with the longest clear view
      let bestYaw = 0, bestD = -1
      for (let k = 0; k < 16; k++) {
        const yaw = (k / 16) * Math.PI * 2
        const dx = -Math.sin(yaw), dz = -Math.cos(yaw)
        let d = 0
        while (d < 20 && !s.walls.some((wl) => distToSegment(c[0] + dx * d, c[1] + dz * d, wl.a[0], wl.a[1], wl.b[0], wl.b[1]) < s.thick / 2)) d += 0.1
        if (d > bestD) { bestD = d; bestYaw = yaw }
      }
      w.yaw = bestYaw; w.pitch = -0.12
      canvas?.focus()
    } else {
      st.camera.position.set(0, 13, 11)
      st.controls.target.set(0, 0, 0)
    }
  }

  // ---------- 2D editor ----------
  const all = [...s.walls.flatMap((w) => [w.a, w.b]), ...s.rooms.flatMap((r) => r.pts), ...draft]
  const VW = Math.max(14, Math.ceil(Math.max(0, ...all.map((p) => p[0])) + 3))
  const VH = Math.max(10, Math.ceil(Math.max(0, ...all.map((p) => p[1])) + 3))
  const toWorld = (e: RPE): Pt => {
    const svg = svgRef.current!
    const p = svg.createSVGPoint()
    p.x = e.clientX; p.y = e.clientY
    const q = p.matrixTransform(svg.getScreenCTM()!.inverse())
    const qx = q.x - 1, qy = q.y - 1 // content is translated by (1, 1)
    // snap to nearby endpoints first, then to the grid
    const ends = [...s.walls.flatMap((w) => [w.a, w.b]), ...s.rooms.flatMap((r) => r.pts), ...draft]
    let best: Pt | null = null, bd = 0.3
    for (const v of ends) { const d = Math.hypot(v[0] - qx, v[1] - qy); if (d < bd) { bd = d; best = v } }
    return best ? [best[0], best[1]] : [+snap(qx, s.grid).toFixed(3), +snap(qy, s.grid).toFixed(3)]
  }
  const onDown = (e: RPE) => {
    if (walk) return
    const p = toWorld(e)
    if (tool === 'wall') {
      if (e.button === 2) return setDraft([])
      if (draft.length) {
        const a = draft[draft.length - 1]
        if (a[0] !== p[0] || a[1] !== p[1]) set({ walls: [...s.walls, W(a, p)] })
      }
      setDraft([p])
    } else if (tool === 'room') {
      if (draft.length >= 3 && Math.hypot(draft[0][0] - p[0], draft[0][1] - p[1]) < 0.01) {
        set({ rooms: [...s.rooms, { id: uid(), name: `Room ${s.rooms.length + 1}`, pts: draft, color: color(s.rooms.length) }] })
        setDraft([])
      } else setDraft([...draft, p])
    }
  }
  const onMove = (e: RPE) => {
    const p = toWorld(e)
    setCursor(p)
    if (drag) {
      const mv = (q: Pt): Pt => (q[0] === drag[0] && q[1] === drag[1] ? p : q)
      set({ walls: s.walls.map((w) => ({ ...w, a: mv(w.a), b: mv(w.b) })), rooms: s.rooms.map((r) => ({ ...r, pts: r.pts.map(mv) })) })
      setDrag(p)
    }
  }
  const selWall = sel?.kind === 'wall' ? s.walls.find((w) => w.id === sel.id) : undefined
  const selRoom = sel?.kind === 'room' ? s.rooms.find((r) => r.id === sel.id) : undefined
  const del = () => {
    if (!sel) return
    if (sel.kind === 'wall') set({ walls: s.walls.filter((w) => w.id !== sel.id) })
    else set({ rooms: s.rooms.filter((r) => r.id !== sel.id) })
    setSel(null)
  }
  const len = (w: Wall) => Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])
  const totalArea = s.rooms.reduce((a, r) => a + polygonArea(r.pts), 0)
  const wallLen = s.walls.reduce((a, w) => a + len(w), 0)
  const last = draft[draft.length - 1]

  const svgText = () => svgRef.current?.outerHTML ?? ''

  return (
    <div>
      <Stats>
        <Stat label="Floor area" value={`${fmt(totalArea, 4)} m²`} sub={`${fmt(totalArea * 10.7639, 4)} ft²`} tone="accent" />
        <Stat label="Rooms" value={s.rooms.length} />
        <Stat label="Wall length" value={`${fmt(wallLen, 4)} m`} sub={`${s.walls.length} segments`} />
        <Stat label="Wall surface" value={`${fmt(wallLen * s.height * 2, 4)} m²`} sub="both sides, for paint" />
      </Stats>
      <Split wide="left">
        <Panel
          title="Plan (2D)"
          actions={
            <>
              <Seg value={tool} onChange={(t) => { setTool(t); setDraft([]) }} options={[['wall', '✏ Walls'], ['room', '⬠ Rooms'], ['select', '☝ Select']]} />
              <Btn onClick={() => download('floor-plan.svg', svgText(), 'image/svg+xml')}>⬇ SVG</Btn>
            </>
          }
        >
          <svg
            ref={svgRef}
            xmlns="http://www.w3.org/2000/svg"
            viewBox={`0 0 ${VW + 1} ${VH + 1}`}
            style={{ width: '100%', background: 'var(--panel2)', borderRadius: 10, touchAction: 'none', cursor: tool === 'select' ? 'default' : 'crosshair', userSelect: 'none' }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={() => setDrag(null)}
            onPointerLeave={() => { setCursor(null); setDrag(null) }}
            onContextMenu={(e) => { e.preventDefault(); setDraft([]) }}
            onDoubleClick={() => setDraft([])}
          >
            <g transform="translate(1 1)">
              {Array.from({ length: VW + 1 }, (_, i) => <line key={`x${i}`} x1={i} x2={i} y1={0} y2={VH} stroke="var(--line)" strokeWidth={i % 5 ? 0.01 : 0.03} />)}
              {Array.from({ length: VH + 1 }, (_, i) => <line key={`y${i}`} y1={i} y2={i} x1={0} x2={VW} stroke="var(--line)" strokeWidth={i % 5 ? 0.01 : 0.03} />)}
              {Array.from({ length: Math.floor(VW / 5) + 1 }, (_, i) => <text key={`t${i}`} x={i * 5} y={VH - 0.2} fontSize={0.35} fill="var(--muted)" textAnchor="middle">{i * 5} m</text>)}
              {s.rooms.map((r) => {
                const c = centroid(r.pts)
                const on = sel?.kind === 'room' && sel.id === r.id
                return (
                  <g key={r.id} onPointerDown={(e) => { if (tool === 'select') { e.stopPropagation(); setSel({ kind: 'room', id: r.id }) } }}>
                    <polygon points={r.pts.map((p) => p.join(',')).join(' ')} fill={r.color} fillOpacity={on ? 0.45 : 0.22} stroke={on ? r.color : 'none'} strokeWidth={0.06} />
                    <text x={c[0]} y={c[1] - 0.1} fontSize={0.36} textAnchor="middle" fill="var(--fg)" fontWeight={700}>{r.name}</text>
                    <text x={c[0]} y={c[1] + 0.35} fontSize={0.3} textAnchor="middle" fill="var(--muted)">{fmt(polygonArea(r.pts), 3)} m²</text>
                  </g>
                )
              })}
              {s.walls.map((w) => {
                const on = sel?.kind === 'wall' && sel.id === w.id
                const mx = (w.a[0] + w.b[0]) / 2, my = (w.a[1] + w.b[1]) / 2
                const horiz = Math.abs(w.b[0] - w.a[0]) >= Math.abs(w.b[1] - w.a[1])
                return (
                  <g key={w.id} onPointerDown={(e) => { if (tool === 'select') { e.stopPropagation(); setSel({ kind: 'wall', id: w.id }) } }}>
                    <line x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke={on ? 'var(--accent)' : 'var(--fg)'} strokeWidth={Math.max(0.08, s.thick)} strokeLinecap="square" />
                    {len(w) >= 0.8 && <text x={mx + (horiz ? 0 : 0.2)} y={my + (horiz ? -0.18 : 0.1)} fontSize={0.26} fill="var(--muted)" textAnchor={horiz ? 'middle' : 'start'}>{fmt(len(w), 3)}</text>}
                  </g>
                )
              })}
              {tool === 'select' && [...new Map(s.walls.flatMap((w) => [w.a, w.b]).map((p) => [p.join(','), p])).values()].map((p) => (
                <circle key={p.join(',')} cx={p[0]} cy={p[1]} r={0.14} fill="var(--panel)" stroke="var(--accent)" strokeWidth={0.04} style={{ cursor: 'move' }} onPointerDown={(e) => { e.stopPropagation(); setDrag(p) }} />
              ))}
              {draft.length > 0 && <polyline points={draft.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={0.06} strokeDasharray={tool === 'room' ? '0.15 0.1' : undefined} />}
              {last && cursor && (
                <>
                  <line x1={last[0]} y1={last[1]} x2={cursor[0]} y2={cursor[1]} stroke="var(--accent)" strokeWidth={0.05} strokeDasharray="0.15 0.1" />
                  <text x={cursor[0] + 0.2} y={cursor[1] - 0.2} fontSize={0.3} fill="var(--accent)">{fmt(Math.hypot(cursor[0] - last[0], cursor[1] - last[1]), 3)} m</text>
                </>
              )}
              {cursor && !walk && tool !== 'select' && <circle cx={cursor[0]} cy={cursor[1]} r={0.09} fill="var(--accent)" />}
            </g>
          </svg>
          <Note>
            {tool === 'wall' && 'Click to start a wall, click again to place each corner. Right-click, double-click or Esc ends the chain. Points snap to the grid and to existing wall ends.'}
            {tool === 'room' && 'Click the corners of a room, then click the first corner again to close it. Its area is added to the totals.'}
            {tool === 'select' && 'Click a wall or room to select it. Drag the round handles to move corners — connected walls and rooms follow.'}
          </Note>
          {sel && (
            <Row>
              {selRoom && <Txt label="Room name" value={selRoom.name} onChange={(name) => set({ rooms: s.rooms.map((r) => (r.id === selRoom.id ? { ...r, name } : r)) })} />}
              {selWall && <span>Wall length <b>{fmt(len(selWall), 4)} m</b></span>}
              <Btn kind="danger" onClick={del}>Delete {sel.kind}</Btn>
            </Row>
          )}
        </Panel>
        <div>
          <Panel title={walk ? 'Walk-through' : '3D view'} actions={<Btn kind={walk ? 'primary' : 'normal'} onClick={toggleWalk}>{walk ? '⟲ Orbit view' : '🚶 Walk through'}</Btn>}>
            <View3D refEl={ref} height={360} />
            {walk ? (
              <>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8 }}>
                  {([['arrowleft', '⟲'], ['w', '▲'], ['s', '▼'], ['arrowright', '⟳']] as const).map(([k, l]) => (
                    <button key={k} type="button" className="k-btn" style={{ minWidth: 48 }} onPointerDown={() => keys.current.add(k)} onPointerUp={() => keys.current.delete(k)} onPointerLeave={() => keys.current.delete(k)}>{l}</button>
                  ))}
                </div>
                <p className="muted" style={{ fontSize: 12 }}>W A S D / arrow keys to move (Shift = faster), drag to look around. Walls block you.</p>
              </>
            ) : <p className="muted" style={{ fontSize: 12 }}>Drag to orbit, scroll to zoom. Walls are extruded from the plan.</p>}
          </Panel>
          <Panel title="Settings" actions={<><JsonButtons name="floor-plan.json" data={s} onLoad={(d) => set(d)} /><Btn kind="ghost" onClick={() => { reset(); setSel(null) }}>Sample</Btn><Btn kind="danger" onClick={() => { set({ walls: [], rooms: [] }); setSel(null) }}>Clear</Btn></>}>
            <Row>
              <Num label="Wall height" value={s.height} unit="m" min={1} max={10} onChange={(height) => height > 0 && set({ height })} />
              <Num label="Wall thickness" value={s.thick} unit="m" min={0.05} max={1} onChange={(thick) => thick > 0 && set({ thick })} />
              <Select label="Snap grid" value={s.grid} onChange={(grid) => set({ grid })} options={[[0.05, '5 cm'], [0.1, '10 cm'], [0.25, '25 cm'], [0.5, '50 cm'], [1, '1 m']]} />
            </Row>
          </Panel>
          <Panel title="Room areas">
            <Table
              head={['Room', 'Area', 'Perimeter', 'Share']}
              rows={s.rooms.map((r) => [
                <span key="n"><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: r.color, marginRight: 6 }} />{r.name}</span>,
                `${fmt(polygonArea(r.pts), 4)} m²`, `${fmt(perimeter(r.pts), 4)} m`, `${fmt((polygonArea(r.pts) / (totalArea || 1)) * 100, 3)}%`,
              ])}
              foot={['Total', `${fmt(totalArea, 4)} m²`, '', '100%']}
            />
          </Panel>
        </div>
      </Split>
    </div>
  )
}
