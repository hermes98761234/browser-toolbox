import { useEffect, useRef } from 'react'
import { Btn, Check, CsvButton, JsonButtons, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, num, pct, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { bbox, fits, isSimple, overlaps, perimeter, polygonArea, PRESETS, walls, wallClearance, type Piece, type Pt } from './lib/room-planner'

type View = 'persp' | 'top'
type WallMode = 'full' | 'cut' | 'none'
interface State { pts: Pt[]; h: number; items: Piece[]; sel: string; view: View; walls: WallMode; snap: number; dims: boolean }

const CATALOG: [string, number, number, number, string][] = [
  ['Double bed', 1.6, 2.05, 0.5, '#94a3b8'], ['Single bed', 0.95, 2.0, 0.45, '#a5b4fc'], ['Sofa', 2.1, 0.9, 0.85, '#6366f1'],
  ['Armchair', 0.85, 0.85, 0.85, '#818cf8'], ['Desk', 1.4, 0.7, 0.75, '#b45309'], ['Chair', 0.5, 0.5, 0.9, '#f59e0b'],
  ['Dining table', 1.6, 0.9, 0.75, '#92400e'], ['Wardrobe', 1.2, 0.6, 2.1, '#e2e8f0'], ['Bookshelf', 0.8, 0.3, 1.9, '#a16207'],
  ['Nightstand', 0.45, 0.4, 0.55, '#a8a29e'], ['TV stand', 1.6, 0.4, 0.5, '#334155'], ['Coffee table', 1.1, 0.6, 0.42, '#78350f'],
  ['Kitchen run', 2.4, 0.6, 0.9, '#cbd5e1'], ['Fridge', 0.7, 0.7, 1.85, '#f8fafc'], ['Rug', 2.0, 1.4, 0.01, '#14b8a6'], ['Plant', 0.4, 0.4, 1.2, '#10b981'],
]
const mk = (i: number, x: number, z: number, rot = 0): Piece => {
  const [name, w, d, h, color] = CATALOG[i]
  return { id: uid(), name, w, d, h, x, z, rot, color }
}

const DEF: State = {
  pts: PRESETS.l.pts,
  h: 2.6,
  view: 'persp',
  walls: 'cut',
  snap: 0.05,
  dims: true,
  sel: '',
  items: [mk(2, 1.6, 4.5, 180), mk(14, 1.6, 3.4), mk(11, 1.6, 3.4), mk(10, 1.6, 2.1), mk(6, 4.6, 1.4), mk(5, 4.6, 0.6), mk(5, 4.6, 2.15, 180), mk(12, 1.4, 0.3), mk(13, 3.0, 0.35), mk(15, 5.6, 2.4)],
}

/** Keeps the piece's centre inside the room's bounding box. */
function clampPiece(it: Piece, pts: Pt[]): Piece {
  const b = bbox(pts)
  return { ...it, x: Math.min(b.x1, Math.max(b.x0, it.x)), z: Math.min(b.z1, Math.max(b.z0, it.z)) }
}

/** Mitred offset of the polygon outward by t (outer face of the walls). */
function offsetPoly(pts: Pt[], t: number): Pt[] {
  const ws = walls(pts)
  return pts.map((p, i) => {
    const n1 = ws[(i - 1 + ws.length) % ws.length].n, n2 = ws[i].n
    const k = 1 + n1[0] * n2[0] + n1[1] * n2[1]
    const f = k > 0.05 ? t / k : t
    return [p[0] + (n1[0] + n2[0]) * f, p[1] + (n1[1] + n2[1]) * f] as Pt
  })
}

export default function RoomPlanner() {
  const [s, set, reset] = useToolState('room-planner', DEF)
  const sRef = useRef(s)
  useEffect(() => {
    sRef.current = s
  })
  const stageRef = useRef<Stage3D | null>(null)
  const roomG = useRef(new THREE.Group())
  const itemG = useRef(new THREE.Group())
  const sel = s.items.find((i) => i.id === s.sel)
  const editSel = (p: Partial<Piece>) => set((st) => ({ ...st, items: st.items.map((i) => (i.id === st.sel ? clampPiece({ ...i, ...p }, st.pts) : i)) }))
  const simple = isSimple(s.pts)

  const ref = useStage3D(
    (st) => {
      stageRef.current = st
      st.scene.add(roomG.current, itemG.current)
      const el = st.renderer.domElement
      const ray = new THREE.Raycaster()
      const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      let drag: { id: string; dx: number; dz: number; obj: THREE.Object3D } | null = null
      let down: { x: number; y: number; hit: boolean } | null = null
      const pick = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), st.camera)
      }
      const floorPt = () => ray.ray.intersectPlane(floor, new THREE.Vector3())
      const onDown = (e: PointerEvent) => {
        pick(e)
        let o: THREE.Object3D | null = ray.intersectObjects(itemG.current.children, true).find((h) => !h.object.userData.label)?.object ?? null
        while (o && !o.userData.id) o = o.parent
        down = { x: e.clientX, y: e.clientY, hit: !!o }
        const p = floorPt()
        if (!o || !p) return
        st.controls.enabled = false
        el.setPointerCapture(e.pointerId)
        drag = { id: o.userData.id as string, dx: o.position.x - p.x, dz: o.position.z - p.z, obj: o }
        if (sRef.current.sel !== drag.id) set({ sel: drag.id })
      }
      const onMove = (e: PointerEvent) => {
        if (!drag) return
        pick(e)
        const p = floorPt()
        const { pts, items, snap } = sRef.current
        const it = items.find((i) => i.id === drag!.id)
        if (!p || !it) return
        const b = bbox(pts)
        const q = (v: number) => (snap > 0 ? Math.round(v / snap) * snap : v)
        const c = clampPiece({ ...it, x: q(p.x + drag.dx + b.cx), z: q(p.z + drag.dz + b.cz) }, pts)
        drag.obj.position.set(c.x - b.cx, 0, c.z - b.cz)
        drag.obj.userData.x = c.x
        drag.obj.userData.z = c.z
      }
      const onUp = (e: PointerEvent) => {
        if (drag) {
          const { id, obj } = drag
          if (obj.userData.x !== undefined) set((st2) => ({ ...st2, items: st2.items.map((i) => (i.id === id ? { ...i, x: obj.userData.x as number, z: obj.userData.z as number } : i)) }))
          drag = null
          st.controls.enabled = true
        } else if (down && !down.hit && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4 && sRef.current.sel) set({ sel: '' })
        down = null
      }
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
      return () => {
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onUp)
      }
    },
    (st) => {
      const { pts, h: H, items, sel: selId, view, walls: wm, dims } = sRef.current
      st.clear(roomG.current)
      st.clear(itemG.current)
      if (pts.length < 3) return
      const b = bbox(pts)
      const W = (p: Pt) => new THREE.Vector2(p[0] - b.cx, -(p[1] - b.cz)) // shape space: y = −z
      const flat = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts.map(W))), new THREE.MeshStandardMaterial({ color: '#d6c3a5', roughness: 0.9, side: THREE.DoubleSide }))
      flat.rotation.x = -Math.PI / 2
      roomG.current.add(flat)
      // walls: outer offset polygon with the room as a hole, extruded upward
      const wallH = wm === 'cut' ? Math.min(1, H) : H
      if (wm !== 'none' && isSimple(pts)) {
        const sh = new THREE.Shape(offsetPoly(pts, 0.12).map(W))
        sh.holes.push(new THREE.Path(pts.map(W)))
        const geo = new THREE.ExtrudeGeometry(sh, { depth: view === 'top' ? 0.02 : wallH, bevelEnabled: false })
        const mat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 1, transparent: wm === 'full', opacity: wm === 'full' ? 0.35 : 1, depthWrite: wm !== 'full' })
        const wall = new THREE.Mesh(geo, mat)
        wall.rotation.x = -Math.PI / 2
        roomG.current.add(wall)
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#475569' }))
        edges.rotation.x = -Math.PI / 2
        roomG.current.add(edges)
      }
      if (dims)
        walls(pts).forEach((w) => {
          if (w.len < 0.3) return
          const t = label(`${num(w.len, 2)} m`, '#fbbf24', 0.3)
          t.position.set(w.mid[0] + w.n[0] * 0.45 - b.cx, view === 'top' ? 0.1 : wallH + 0.15, w.mid[1] + w.n[1] * 0.45 - b.cz)
          t.userData.label = true
          roomG.current.add(t)
        })
      for (const it of items) {
        const g = new THREE.Group()
        g.userData.id = it.id
        g.position.set(it.x - b.cx, 0, it.z - b.cz)
        g.rotation.y = (-it.rot * Math.PI) / 180
        const isSel = it.id === selId
        const ok = fits(it, pts)
        const hh = Math.max(0.01, it.h)
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(it.w, hh, it.d),
          new THREE.MeshStandardMaterial({ color: it.color, roughness: 0.7, emissive: isSel ? '#fbbf24' : ok ? '#000000' : '#ef4444', emissiveIntensity: isSel ? 0.35 : ok ? 0 : 0.5 }),
        )
        box.position.y = hh / 2 + (it.h < 0.05 ? 0.003 : 0)
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: isSel ? '#f59e0b' : '#1e293b' }))
        edges.position.copy(box.position)
        const front = new THREE.Mesh(new THREE.BoxGeometry(it.w * 0.6, 0.02, 0.03), new THREE.MeshBasicMaterial({ color: '#0f172a' }))
        front.position.set(0, hh + 0.011, it.d / 2 - 0.03)
        const tag = label(isSel && dims ? `${it.name} ${num(it.w * 100, 0)}×${num(it.d * 100, 0)}` : it.name, isSel ? '#fbbf24' : '#f8fafc', 0.22)
        tag.position.y = hh + 0.22
        if (it.h < 0.05) tag.position.z = -it.d / 2 + 0.2
        tag.userData.label = true
        g.add(box, edges, front, tag)
        itemG.current.add(g)
      }
      // clearance line from the selected piece to the nearest wall
      const si = items.find((i) => i.id === selId)
      if (si && dims) {
        const c = wallClearance(si, pts)
        if (c.dist > 0.01 && Number.isFinite(c.dist)) {
          const y = 0.06
          const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(c.p[0] - b.cx, y, c.p[1] - b.cz), new THREE.Vector3(c.q[0] - b.cx, y, c.q[1] - b.cz)])
          itemG.current.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#f43f5e' })))
          const t = label(`${num(c.dist * 100, 0)} cm`, '#fda4af', 0.22)
          t.position.set((c.p[0] + c.q[0]) / 2 - b.cx, 0.25, (c.p[1] + c.q[1]) / 2 - b.cz)
          t.userData.label = true
          itemG.current.add(t)
        }
      }
    },
    [s.pts, s.h, s.items, s.sel, s.view, s.walls, s.dims],
    { camera: [4, 6, 7], grid: false, background: '#1e293b' },
  )

  useEffect(() => {
    const st = stageRef.current
    if (!st || s.pts.length < 3) return
    const b = bbox(s.pts)
    const span = Math.max(b.w, b.d)
    st.controls.target.set(0, s.view === 'top' ? 0 : s.h / 4, 0)
    if (s.view === 'top') {
      st.camera.position.set(0, span * 1.5 + 0.8, 0.001)
      st.controls.enableRotate = false
    } else {
      st.camera.position.set(span * 0.4, span * 0.75 + 0.8, span * 0.9)
      st.controls.enableRotate = true
    }
    st.controls.update()
  }, [s.view, s.pts, s.h])

  const add = (i: number) => {
    const b = bbox(s.pts)
    const it = mk(i, b.cx, b.cz)
    set({ items: [...s.items, it], sel: it.id })
  }
  const setPts = (pts: Pt[]) => set((st) => ({ ...st, pts, items: st.items.map((i) => clampPiece(i, pts)) }))
  const area = polygonArea(s.pts)
  const per = perimeter(s.pts)
  const used = s.items.filter((i) => i.h >= 0.05).reduce((a, i) => a + i.w * i.d, 0)
  const clashes = overlaps(s.items)
  const outside = s.items.filter((i) => !fits(i, s.pts))
  const clr = sel ? wallClearance(sel, s.pts) : null
  const wl = walls(s.pts)

  return (
    <Split wide="right">
      <div>
        <Panel title="Room shape" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {Object.entries(PRESETS).map(([k, p]) => (
              <Btn key={k} onClick={() => setPts(p.pts)}>{p.label}</Btn>
            ))}
          </div>
          <Table
            head={['#', 'X (m)', 'Z (m)', 'Wall →', '']}
            rows={s.pts.map((p, i) => [
              i + 1,
              <input key="x" type="number" step={0.05} value={p[0]} style={{ width: 70 }} aria-label="X" onChange={(e) => setPts(s.pts.map((q, j) => (j === i ? [Number(e.target.value) || 0, q[1]] : q)))} />,
              <input key="z" type="number" step={0.05} value={p[1]} style={{ width: 70 }} aria-label="Z" onChange={(e) => setPts(s.pts.map((q, j) => (j === i ? [q[0], Number(e.target.value) || 0] : q)))} />,
              `${num(wl[i]?.len ?? 0, 2)} m`,
              <span key="b" style={{ whiteSpace: 'nowrap' }}>
                <Btn kind="ghost" title="Split this wall (insert a corner at its midpoint)" onClick={() => {
                  const n = s.pts[(i + 1) % s.pts.length]
                  const m: Pt = [Math.round(((p[0] + n[0]) / 2) * 100) / 100, Math.round(((p[1] + n[1]) / 2) * 100) / 100]
                  setPts([...s.pts.slice(0, i + 1), m, ...s.pts.slice(i + 1)])
                }}>＋</Btn>
                <Btn kind="ghost" title="Remove corner" disabled={s.pts.length <= 3} onClick={() => setPts(s.pts.filter((_, j) => j !== i))}>✕</Btn>
              </span>,
            ])}
          />
          {!simple && <Note tone="err">The walls cross each other. Fix the corner coordinates (corners go around the room in order).</Note>}
          <Row>
            <Num label="Ceiling height" value={s.h} onChange={(h) => set({ h: Math.max(1.8, h) })} unit="m" min={1.8} max={6} />
          </Row>
          <Seg label="Walls" value={s.walls} onChange={(walls) => set({ walls })} options={[['cut', 'Cutaway 1 m'], ['full', 'Full (glass)'], ['none', 'Hidden']]} />
          <div style={{ height: 8 }} />
          <Seg label="Snap" value={String(s.snap)} onChange={(v) => set({ snap: Number(v) })} options={[['0', 'Free'], ['0.05', 'Snap 5 cm'], ['0.1', '10 cm'], ['0.25', '25 cm']]} />
          <Check label="Show dimensions and wall clearance" value={s.dims} onChange={(dims) => set({ dims })} />
        </Panel>
        <Panel title="Add furniture">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATALOG.map((c, i) => (
              <Btn key={c[0]} onClick={() => add(i)}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: c[4], marginRight: 6, border: '1px solid var(--line)' }} />
                {c[0]}
              </Btn>
            ))}
          </div>
        </Panel>
        <Panel title={sel ? `Selected: ${sel.name}` : 'Selected item'}>
          {!sel ? (
            <Note>Click a piece in the 3D view or the list, then drag it across the floor.</Note>
          ) : (
            <>
              <Row>
                <Txt label="Name" value={sel.name} onChange={(name) => editSel({ name })} />
                <label className="k-field" style={{ flex: '0 0 70px' }}>
                  <span className="k-label">Color</span>
                  <input type="color" value={sel.color} onChange={(e) => editSel({ color: e.target.value })} style={{ height: 38, width: '100%', border: 0, background: 'none' }} />
                </label>
              </Row>
              <Row>
                <Num label="Width" value={sel.w} onChange={(w) => editSel({ w: Math.max(0.05, w) })} unit="m" min={0.05} />
                <Num label="Depth" value={sel.d} onChange={(d) => editSel({ d: Math.max(0.05, d) })} unit="m" min={0.05} />
                <Num label="Height" value={sel.h} onChange={(h) => editSel({ h: Math.max(0.01, h) })} unit="m" min={0.01} />
              </Row>
              <Row>
                <Num label="X" value={Math.round(sel.x * 100) / 100} onChange={(x) => editSel({ x })} unit="m" />
                <Num label="Z" value={Math.round(sel.z * 100) / 100} onChange={(z) => editSel({ z })} unit="m" />
                <Num label="Rotation" value={sel.rot} onChange={(rot) => editSel({ rot: ((rot % 360) + 360) % 360 })} unit="°" />
              </Row>
              {clr && (
                <Note tone={!fits(sel, s.pts) ? 'err' : clr.dist < 0.6 && sel.h > 0.3 && sel.h < 1.2 ? 'warn' : 'ok'}>
                  {!fits(sel, s.pts) ? 'This piece sticks through a wall.' : `Nearest wall: ${num(clr.dist * 100, 0)} cm (wall ${clr.wall + 1}).`}
                  {fits(sel, s.pts) && clr.dist > 0.02 && clr.dist < 0.6 && ' Under 60 cm is tight for walking past.'}
                </Note>
              )}
              <Row>
                <Btn onClick={() => editSel({ rot: (sel.rot + 90) % 360 })}>⟳ Rotate 90°</Btn>
                <Btn onClick={() => {
                  const c = clampPiece({ ...sel, id: uid(), x: sel.x + 0.3, z: sel.z + 0.3 }, s.pts)
                  set({ items: [...s.items, c], sel: c.id })
                }}>Duplicate</Btn>
                <Btn kind="danger" onClick={() => set({ items: s.items.filter((i) => i.id !== sel.id), sel: '' })}>Delete</Btn>
              </Row>
            </>
          )}
        </Panel>
      </div>

      <div>
        <Panel
          title="Room view"
          actions={
            <>
              <Seg value={s.view} onChange={(view) => set({ view })} options={[['persp', 'Perspective'], ['top', 'Top (plan)']]} />
              <Btn onClick={() => {
                const c = stageRef.current?.renderer.domElement
                if (!c) return
                const a = document.createElement('a')
                a.href = c.toDataURL('image/png')
                a.download = 'room-plan.png'
                a.click()
              }}>⬇ PNG</Btn>
            </>
          }
        >
          <View3D refEl={ref} height={470} />
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
            Drag furniture to move it · drag empty space to orbit · scroll to zoom · right-drag to pan. Red pieces stick through a wall; the dark strip marks each piece's front.
          </p>
        </Panel>
        <Stats>
          <Stat label="Floor area" value={`${num(area, 2)} m²`} sub={`${num(area * 10.7639, 1)} ft²`} />
          <Stat label="Perimeter" value={`${num(per, 2)} m`} sub={`${num(per * s.h, 1)} m² of wall`} />
          <Stat label="Furniture footprint" value={`${num(used, 2)} m²`} sub={`${pct(used / (area || 1), 0)} of the floor`} tone={used / (area || 1) > 0.5 ? 'bad' : 'good'} />
          <Stat label="Volume" value={`${num(area * s.h, 1)} m³`} />
        </Stats>
        {clashes.length > 0 && <Note tone="warn">Overlapping: {clashes.map(([a, b]) => `${a.name} ↔ ${b.name}`).join(', ')}. Rugs and other flat items are ignored.</Note>}
        {outside.length > 0 && <Note tone="err">Outside the room: {outside.map((i) => i.name).join(', ')}.</Note>}
        <Panel
          title={`Furniture (${s.items.length})`}
          actions={
            <>
              <CsvButton name="room-furniture.csv" rows={() => [['Item', 'Width m', 'Depth m', 'Height m', 'X m', 'Z m', 'Rotation', 'Wall clearance cm'], ...s.items.map((i) => [i.name, i.w, i.d, i.h, +i.x.toFixed(2), +i.z.toFixed(2), i.rot, Math.round(wallClearance(i, s.pts).dist * 100)])]} />
              <JsonButtons name="room-plan.json" data={s} onLoad={(d) => {
                if (d && Array.isArray(d.items) && Array.isArray(d.pts) && d.pts.length >= 3) set({ ...DEF, ...d })
              }} />
            </>
          }
        >
          <Table
            head={['Item', 'W × D × H (cm)', 'Position (m)', 'Clearance', '']}
            rows={s.items.map((i) => [
              <button key="n" type="button" className="k-btn ghost" style={{ fontWeight: i.id === s.sel ? 800 : 500, padding: '2px 4px' }} onClick={() => set({ sel: i.id })}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: i.color, marginRight: 6 }} />
                {i.name}
              </button>,
              `${num(i.w * 100, 0)} × ${num(i.d * 100, 0)} × ${num(i.h * 100, 0)}`,
              `${num(i.x)}, ${num(i.z)} · ${i.rot}°`,
              fits(i, s.pts) ? `${num(wallClearance(i, s.pts).dist * 100, 0)} cm` : <b key="c" style={{ color: 'var(--err)' }}>through wall</b>,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ items: s.items.filter((x) => x.id !== i.id), sel: s.sel === i.id ? '' : s.sel })}>✕</Btn>,
            ])}
          />
        </Panel>
      </div>
    </Split>
  )
}
