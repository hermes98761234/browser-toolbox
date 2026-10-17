import { useEffect, useRef } from 'react'
import { Btn, JsonButtons, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, num, pct, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'

interface Item { id: string; name: string; w: number; d: number; h: number; x: number; z: number; rot: number; color: string }
interface State { room: { w: number; d: number; h: number }; items: Item[]; sel: string; view: 'persp' | 'top'; snap: number }

const CATALOG: Omit<Item, 'id' | 'x' | 'z' | 'rot'>[] = [
  { name: 'Double bed', w: 1.6, d: 2.05, h: 0.5, color: '#94a3b8' },
  { name: 'Single bed', w: 0.95, d: 2.0, h: 0.45, color: '#94a3b8' },
  { name: 'Sofa', w: 2.1, d: 0.9, h: 0.85, color: '#6366f1' },
  { name: 'Armchair', w: 0.85, d: 0.85, h: 0.85, color: '#818cf8' },
  { name: 'Desk', w: 1.4, d: 0.7, h: 0.75, color: '#b45309' },
  { name: 'Chair', w: 0.5, d: 0.5, h: 0.9, color: '#f59e0b' },
  { name: 'Dining table', w: 1.6, d: 0.9, h: 0.75, color: '#92400e' },
  { name: 'Wardrobe', w: 1.2, d: 0.6, h: 2.1, color: '#e2e8f0' },
  { name: 'Bookshelf', w: 0.8, d: 0.3, h: 1.9, color: '#a16207' },
  { name: 'Nightstand', w: 0.45, d: 0.4, h: 0.55, color: '#a8a29e' },
  { name: 'TV stand', w: 1.6, d: 0.4, h: 0.5, color: '#334155' },
  { name: 'Coffee table', w: 1.1, d: 0.6, h: 0.42, color: '#78350f' },
  { name: 'Rug', w: 2.0, d: 1.4, h: 0.01, color: '#14b8a6' },
  { name: 'Plant', w: 0.4, d: 0.4, h: 1.2, color: '#10b981' },
]

const mk = (i: number, x: number, z: number, rot = 0): Item => ({ ...CATALOG[i], id: uid(), x, z, rot })

const DEF: State = {
  room: { w: 5, d: 4, h: 2.6 },
  view: 'persp',
  snap: 0.05,
  sel: '',
  items: [mk(2, 2.5, 3.5, 180), mk(12, 2.5, 2.4), mk(11, 2.5, 2.4), mk(10, 2.5, 0.25), mk(3, 0.6, 2.2, 270), mk(8, 4.8, 1.6, 90), mk(13, 4.7, 3.7), mk(4, 0.8, 0.4)],
}

/** Footprint size after rotation (exact for any angle). */
function foot(it: Item) {
  const a = (it.rot * Math.PI) / 180
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a))
  return { fw: it.w * c + it.d * s, fd: it.w * s + it.d * c }
}

function clampItem(it: Item, room: State['room']): Item {
  const { fw, fd } = foot(it)
  const cl = (v: number, half: number, max: number) => (2 * half >= max ? max / 2 : Math.min(max - half, Math.max(half, v)))
  return { ...it, x: cl(it.x, fw / 2, room.w), z: cl(it.z, fd / 2, room.d) }
}

function overlaps(items: Item[]): [Item, Item][] {
  const solid = items.filter((i) => i.h >= 0.05)
  const out: [Item, Item][] = []
  for (let i = 0; i < solid.length; i++)
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], b = solid[j]
      const fa = foot(a), fb = foot(b)
      if (Math.abs(a.x - b.x) < (fa.fw + fb.fw) / 2 - 0.005 && Math.abs(a.z - b.z) < (fa.fd + fb.fd) / 2 - 0.005) out.push([a, b])
    }
  return out
}

export default function RoomPlanner() {
  const [s, set, reset] = useToolState('3d-room-planner', DEF)
  const sRef = useRef(s)
  // runs before the stage's update effect (declared later), so the scene always sees fresh state
  useEffect(() => {
    sRef.current = s
  })
  const stageRef = useRef<Stage3D | null>(null)
  const roomG = useRef(new THREE.Group())
  const itemG = useRef(new THREE.Group())
  const sel = s.items.find((i) => i.id === s.sel)
  const editSel = (p: Partial<Item>) => set((st) => ({ ...st, items: st.items.map((i) => (i.id === st.sel ? clampItem({ ...i, ...p }, st.room) : i)) }))

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
        const hit = ray.intersectObjects(itemG.current.children, true)[0]
        let o: THREE.Object3D | null = hit?.object ?? null
        while (o && !o.userData.id) o = o.parent
        down = { x: e.clientX, y: e.clientY, hit: !!o }
        if (!o) return
        const p = floorPt()
        if (!p) return
        st.controls.enabled = false
        el.setPointerCapture(e.pointerId)
        drag = { id: o.userData.id as string, dx: o.position.x - p.x, dz: o.position.z - p.z, obj: o }
        if (sRef.current.sel !== drag.id) set({ sel: drag.id })
      }
      const onMove = (e: PointerEvent) => {
        if (!drag) return
        pick(e)
        const p = floorPt()
        if (!p) return
        const { room, items, snap } = sRef.current
        const it = items.find((i) => i.id === drag!.id)
        if (!it) return
        const q = (v: number) => (snap > 0 ? Math.round(v / snap) * snap : v)
        const c = clampItem({ ...it, x: q(p.x + drag.dx + room.w / 2), z: q(p.z + drag.dz + room.d / 2) }, room)
        drag.obj.position.set(c.x - room.w / 2, 0, c.z - room.d / 2)
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
      const { room, items, sel: selId, view } = sRef.current
      const W = room.w, D = room.d, H = room.h
      st.clear(roomG.current)
      st.clear(itemG.current)
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: '#d6c3a5', roughness: 0.9 }))
      floor.rotation.x = -Math.PI / 2
      roomG.current.add(floor)
      const grid = new THREE.GridHelper(Math.max(W, D), Math.round(Math.max(W, D) / 0.5), 0x8b7355, 0xb8a588)
      grid.scale.set(W / Math.max(W, D), 1, D / Math.max(W, D))
      grid.position.y = 0.002
      roomG.current.add(grid)
      // inward-facing walls: the walls nearest the camera are culled, giving a dollhouse view
      const wallMat = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 1, side: THREE.FrontSide })
      const walls: [number, number, number, number][] = [[W, 0, -D / 2, 0], [W, 0, D / 2, Math.PI], [D, -W / 2, 0, Math.PI / 2], [D, W / 2, 0, -Math.PI / 2]]
      for (const [len, x, z, ry] of walls) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wallMat)
        m.position.set(x, H / 2, z)
        m.rotation.y = ry
        m.visible = view !== 'top'
        roomG.current.add(m)
      }
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)), new THREE.LineBasicMaterial({ color: '#64748b' }))
      outline.position.y = H / 2
      outline.visible = view !== 'top'
      roomG.current.add(outline)
      const lw = label(`${num(W, 2)} m`, '#fbbf24', 0.28)
      lw.position.set(0, 0.05, D / 2 + 0.45)
      const ld = label(`${num(D, 2)} m`, '#fbbf24', 0.28)
      ld.position.set(W / 2 + 0.6, 0.05, 0)
      roomG.current.add(lw, ld)
      for (const it of items) {
        const g = new THREE.Group()
        g.userData.id = it.id
        g.position.set(it.x - W / 2, 0, it.z - D / 2)
        g.rotation.y = (-it.rot * Math.PI) / 180
        const isSel = it.id === selId
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(it.w, Math.max(0.01, it.h), it.d),
          new THREE.MeshStandardMaterial({ color: it.color, roughness: 0.7, emissive: isSel ? '#fbbf24' : '#000000', emissiveIntensity: isSel ? 0.35 : 0 }),
        )
        box.position.y = Math.max(0.01, it.h) / 2
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: isSel ? '#f59e0b' : '#1e293b' }))
        edges.position.copy(box.position)
        // front marker: a thin strip on the +z side shows which way the piece faces
        const front = new THREE.Mesh(new THREE.BoxGeometry(it.w * 0.6, 0.02, 0.03), new THREE.MeshBasicMaterial({ color: '#0f172a' }))
        front.position.set(0, Math.max(0.01, it.h) + 0.011, it.d / 2 - 0.03)
        const tag = label(it.name, isSel ? '#fbbf24' : '#f8fafc', 0.26)
        tag.position.y = Math.max(0.01, it.h) + 0.25
        if (it.h < 0.05) tag.position.z = -it.d / 2 + 0.2 // flat items (rugs): label near the edge, clear of what sits on them
        tag.userData.isLabel = true
        g.add(box, edges, front, tag)
        itemG.current.add(g)
      }
    },
    [s.room.w, s.room.d, s.room.h, s.items, s.sel, s.view],
    { camera: [4, 5.5, 6.5], grid: false, background: '#1e293b' },
  )

  useEffect(() => {
    const st = stageRef.current
    if (!st) return
    const { w, d, h } = s.room
    const span = Math.max(w, d)
    st.controls.target.set(0, s.view === 'top' ? 0 : h / 3, 0)
    if (s.view === 'top') {
      st.camera.position.set(0, span * 1.55 + 0.5, 0.001)
      st.controls.enableRotate = false
    } else {
      st.camera.position.set(span * 0.5, span * 0.8 + 0.8, span * 1.05)
      st.controls.enableRotate = true
    }
    st.controls.update()
  }, [s.view, s.room])

  const add = (i: number) => {
    const it = clampItem({ ...CATALOG[i], id: uid(), x: s.room.w / 2, z: s.room.d / 2, rot: 0 }, s.room)
    set({ items: [...s.items, it], sel: it.id })
  }
  const roomArea = s.room.w * s.room.d
  const used = s.items.filter((i) => i.h >= 0.05).reduce((a, i) => a + i.w * i.d, 0)
  const clashes = overlaps(s.items)

  return (
    <Split wide="right">
      <div>
        <Panel title="Room" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Num label="Width" value={s.room.w} onChange={(w) => set((st) => ({ ...st, room: { ...st.room, w: Math.max(1, w) }, items: st.items.map((i) => clampItem(i, { ...st.room, w: Math.max(1, w) })) }))} unit="m" min={1} max={30} />
            <Num label="Depth" value={s.room.d} onChange={(d) => set((st) => ({ ...st, room: { ...st.room, d: Math.max(1, d) }, items: st.items.map((i) => clampItem(i, { ...st.room, d: Math.max(1, d) })) }))} unit="m" min={1} max={30} />
            <Num label="Height" value={s.room.h} onChange={(h) => set({ room: { ...s.room, h: Math.max(1.5, h) } })} unit="m" min={1.5} max={8} />
          </Row>
          <Seg label="Snap" value={String(s.snap)} onChange={(v) => set({ snap: Number(v) })} options={[['0', 'Free'], ['0.05', 'Snap 5 cm'], ['0.1', '10 cm'], ['0.25', '25 cm']]} />
        </Panel>
        <Panel title="Add furniture">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATALOG.map((c, i) => (
              <Btn key={c.name} onClick={() => add(i)}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: c.color, marginRight: 6, border: '1px solid var(--line)' }} />
                {c.name}
              </Btn>
            ))}
          </div>
        </Panel>
        <Panel title={sel ? `Selected: ${sel.name}` : 'Selected item'}>
          {!sel ? (
            <Note>Click a piece in the 3D view (or in the list) to select it, then drag it across the floor.</Note>
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
                <Num label="X (from left wall)" value={Math.round(sel.x * 100) / 100} onChange={(x) => editSel({ x })} unit="m" />
                <Num label="Z (from back wall)" value={Math.round(sel.z * 100) / 100} onChange={(z) => editSel({ z })} unit="m" />
                <Num label="Rotation" value={sel.rot} onChange={(rot) => editSel({ rot: ((rot % 360) + 360) % 360 })} unit="°" />
              </Row>
              <Row>
                <Btn onClick={() => editSel({ rot: (sel.rot + 90) % 360 })}>⟳ Rotate 90°</Btn>
                <Btn onClick={() => {
                  const c = clampItem({ ...sel, id: uid(), x: sel.x + 0.3, z: sel.z + 0.3 }, s.room)
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
          <View3D refEl={ref} height={460} />
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
            Drag furniture to move it · drag empty space to orbit · scroll or pinch to zoom · right-drag to pan. The dark strip marks each piece's front.
          </p>
        </Panel>
        <Stats>
          <Stat label="Floor area" value={`${num(roomArea, 2)} m²`} sub={`${num(roomArea * 10.7639, 1)} ft²`} />
          <Stat label="Furniture footprint" value={`${num(used, 2)} m²`} sub={`${pct(used / roomArea, 0)} of the floor`} />
          <Stat label="Free floor" value={`${num(Math.max(0, roomArea - used), 2)} m²`} tone={used / roomArea > 0.5 ? 'bad' : 'good'} sub={used / roomArea > 0.5 ? 'Feels crowded (> 50 %)' : 'Comfortable'} />
          <Stat label="Volume" value={`${num(roomArea * s.room.h, 1)} m³`} />
        </Stats>
        {clashes.length > 0 && (
          <Note tone="warn">Overlapping: {clashes.map(([a, b]) => `${a.name} ↔ ${b.name}`).join(', ')}. Rugs are ignored.</Note>
        )}
        <Panel title={`Furniture (${s.items.length})`} actions={<JsonButtons name="room-plan.json" data={s} onLoad={(d) => {
            if (d && Array.isArray(d.items) && d.room) set({ ...DEF, ...d })
          }} />}>
          <Table
            head={['Item', 'Size (W×D×H)', 'Position', 'Rot', '']}
            rows={s.items.map((i) => [
              <button key="n" type="button" className="k-btn ghost" style={{ fontWeight: i.id === s.sel ? 800 : 500, padding: '2px 4px' }} onClick={() => set({ sel: i.id })}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: i.color, marginRight: 6 }} />
                {i.name}
              </button>,
              `${num(i.w)} × ${num(i.d)} × ${num(i.h)} m`,
              `${num(i.x)}, ${num(i.z)}`,
              `${i.rot}°`,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ items: s.items.filter((x) => x.id !== i.id), sel: s.sel === i.id ? '' : s.sel })}>✕</Btn>,
            ])}
          />
        </Panel>
      </div>
    </Split>
  )
}
