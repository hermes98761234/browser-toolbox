import { useEffect, useRef } from 'react'
import { Btn, JsonButtons, Note, Num, num, Panel, pct, Row, Seg, Slider, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { CATALOG, check, corners, doorZone, featureSeg, freeFloor, frontZone, makeItem, RULES, wallLength, type Feature, type Item, type Kind, type Room, type Rules, type Wall } from './lib/nursery-room-planner'

interface State { room: Room; items: Item[]; feats: Feature[]; rules: Rules; sel: string; walls: 'low' | 'full' | 'none'; zones: boolean; snap: number }

const DEF: State = {
  room: { w: 3.4, d: 3.0, h: 2.5 },
  items: [
    makeItem('crib', 0.335, 1.6, 270, 'crib'),
    makeItem('changer', 3.125, 1.75, 90, 'changer'),
    makeItem('wardrobe', 2.9, 0.3, 0, 'wardrobe'),
    makeItem('chair', 1.65, 2.45, 180, 'chair'),
    makeItem('bookcase', 1.95, 0.15, 0, 'books'),
    makeItem('rug', 1.6, 1.45, 0, 'rug'),
    makeItem('lamp', 2.22, 2.75, 0, 'lamp'),
    makeItem('monitor', 0.2, 0.75, 0, 'monitor'),
  ],
  feats: [
    { id: 'win', kind: 'window', wall: 'N', offset: 0.4, width: 1.0 },
    { id: 'door', kind: 'door', wall: 'S', offset: 2.4, width: 0.8 },
    { id: 'rad', kind: 'radiator', wall: 'N', offset: 0.5, width: 0.8 },
  ],
  rules: RULES,
  sel: 'crib',
  walls: 'low',
  zones: true,
  snap: 0.05,
}

const WALLS: [Wall, string][] = [['N', 'Back'], ['E', 'Right'], ['S', 'Front'], ['W', 'Left']]

function model(it: Item, warn: boolean, sel: boolean): THREE.Group {
  const g = new THREE.Group()
  const col = new THREE.Color(it.color)
  const mat = (c: THREE.ColorRepresentation = col) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, emissive: sel ? 0x4f46e5 : warn ? 0x7f1d1d : 0x000000, emissiveIntensity: sel ? 0.35 : warn ? 0.35 : 0 })
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, c?: THREE.ColorRepresentation) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c))
    m.position.set(x, y, z)
    g.add(m)
    return m
  }
  const { w, d, h } = it
  switch (it.kind) {
    case 'crib':
    case 'minicrib': {
      box(w, 0.12, d, 0, 0.32, 0, '#ffffff')
      box(w, 0.04, d, 0, 0.25, 0)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.05, h, 0.05, (sx * (w - 0.05)) / 2, h / 2, (sz * (d - 0.05)) / 2)
      for (const sz of [-1, 1]) {
        box(w, 0.04, 0.04, 0, h - 0.02, (sz * (d - 0.04)) / 2)
        const n = Math.floor(w / 0.08)
        for (let i = 1; i < n; i++) box(0.022, h - 0.3, 0.022, -w / 2 + (i * w) / n, 0.27 + (h - 0.3) / 2, (sz * (d - 0.04)) / 2)
      }
      for (const sx of [-1, 1]) box(0.03, h - 0.3, d - 0.06, (sx * (w - 0.05)) / 2, 0.27 + (h - 0.3) / 2, 0)
      break
    }
    case 'changer':
    case 'dresser':
    case 'toybox': {
      box(w, h - 0.06, d, 0, (h - 0.06) / 2 + 0.06, 0)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.04, 0.06, 0.04, (sx * (w - 0.06)) / 2, 0.03, (sz * (d - 0.06)) / 2, '#78716c')
      const rows = it.kind === 'toybox' ? 1 : 3
      for (let i = 0; i < rows; i++) {
        const y = 0.1 + ((i + 0.5) * (h - 0.16)) / rows
        box(w - 0.06, (h - 0.2) / rows - 0.03, 0.01, 0, y, d / 2 + 0.005, col.clone().offsetHSL(0, 0, -0.08))
        box(0.12, 0.02, 0.02, 0, y, d / 2 + 0.02, '#64748b')
      }
      if (it.kind === 'changer') { box(w - 0.08, 0.08, d - 0.08, 0, h + 0.04, 0, '#bae6fd'); box(w, 0.1, 0.02, 0, h + 0.05, -d / 2 + 0.01) }
      break
    }
    case 'wardrobe':
      box(w, h, d, 0, h / 2, 0)
      box(0.01, h - 0.1, 0.01, 0, h / 2, d / 2 + 0.005, '#64748b')
      for (const sx of [-1, 1]) box(0.02, 0.2, 0.03, sx * 0.05, h * 0.55, d / 2 + 0.02, '#64748b')
      break
    case 'bookcase':
      box(w, h, 0.02, 0, h / 2, -d / 2 + 0.01)
      for (const sx of [-1, 1]) box(0.02, h, d, (sx * (w - 0.02)) / 2, h / 2, 0)
      for (let i = 0; i <= 4; i++) box(w, 0.02, d, 0, 0.02 + (i * (h - 0.04)) / 4, 0)
      for (let i = 0; i < 3; i++) box(0.05, 0.22, d * 0.7, -w / 3 + i * 0.12, 0.15 + (h - 0.04) / 4, 0, ['#f87171', '#60a5fa', '#facc15'][i])
      break
    case 'chair':
      box(w - 0.2, 0.16, d - 0.15, 0, 0.36, 0.05)
      box(w - 0.2, 0.6, 0.14, 0, 0.62, -d / 2 + 0.1)
      for (const sx of [-1, 1]) box(0.12, 0.62, d - 0.05, (sx * (w - 0.12)) / 2, 0.31, 0)
      break
    case 'rug': {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.01, d), mat())
      m.position.y = 0.006
      g.add(m)
      break
    }
    case 'lamp': {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, h - 0.3), mat('#475569')); p.position.y = (h - 0.3) / 2; g.add(p)
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.3, 20, 1, true), mat()); s.position.y = h - 0.15; g.add(s)
      box(0.3, 0.03, 0.3, 0, 0.015, 0, '#475569')
      break
    }
    case 'monitor':
      box(0.05, h - 0.12, 0.05, 0, (h - 0.12) / 2, 0, '#cbd5e1')
      box(0.1, 0.12, 0.08, 0, h - 0.06, 0)
      break
    case 'plant': {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.35, w * 0.28, 0.35, 16), mat('#c2410c')); pot.position.y = 0.175; g.add(pot)
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(w * 0.55, 16, 12), mat('#16a34a')); leaf.position.y = 0.35 + w * 0.45; g.add(leaf)
      break
    }
  }
  return g
}

export default function NurseryRoomPlanner() {
  const [s, set, reset] = useToolState('nursery-room-planner', DEF)
  const sRef = useRef(s)
  useEffect(() => { sRef.current = s })
  const stageRef = useRef<Stage3D | null>(null)
  const roomG = useRef(new THREE.Group())
  const itemG = useRef(new THREE.Group())
  const R = s.room
  const checks = check(R, s.items, s.feats, s.rules)
  const flagged = new Set(checks.filter((c) => c.level !== 'ok').flatMap((c) => c.ids))
  const sel = s.items.find((i) => i.id === s.sel)
  const clampItem = (it: Item): Item => ({ ...it, x: Math.min(R.w, Math.max(0, it.x)), z: Math.min(R.d, Math.max(0, it.z)) })
  const editSel = (p: Partial<Item>) => set((st) => ({ ...st, items: st.items.map((i) => (i.id === st.sel ? clampItem({ ...i, ...p }) : i)) }))
  const editFeat = (id: string, p: Partial<Feature>) => set({ feats: s.feats.map((f) => (f.id === id ? { ...f, ...p } : f)) })

  const ref = useStage3D(
    (st) => {
      stageRef.current = st
      st.scene.add(roomG.current, itemG.current)
      const el = st.renderer.domElement
      const ray = new THREE.Raycaster()
      const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      let drag: { id: string; dx: number; dz: number; obj: THREE.Object3D } | null = null
      const pick = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), st.camera)
      }
      const onDown = (e: PointerEvent) => {
        pick(e)
        let o: THREE.Object3D | null = ray.intersectObjects(itemG.current.children, true).find((h) => !h.object.userData.label)?.object ?? null
        while (o && !o.userData.id) o = o.parent
        const p = ray.ray.intersectPlane(floor, new THREE.Vector3())
        if (!o || !p) return
        st.controls.enabled = false
        el.setPointerCapture(e.pointerId)
        drag = { id: o.userData.id as string, dx: o.position.x - p.x, dz: o.position.z - p.z, obj: o }
        if (sRef.current.sel !== drag.id) set({ sel: drag.id })
      }
      const onMove = (e: PointerEvent) => {
        if (!drag) return
        pick(e)
        const p = ray.ray.intersectPlane(floor, new THREE.Vector3())
        const { room, snap } = sRef.current
        if (!p) return
        const q = (v: number) => (snap > 0 ? Math.round(v / snap) * snap : v)
        const x = Math.min(room.w, Math.max(0, q(p.x + drag.dx + room.w / 2))), z = Math.min(room.d, Math.max(0, q(p.z + drag.dz + room.d / 2)))
        drag.obj.position.set(x - room.w / 2, 0, z - room.d / 2)
        drag.obj.userData.x = x
        drag.obj.userData.z = z
      }
      const onUp = () => {
        if (!drag) return
        const { id, obj } = drag
        if (obj.userData.x !== undefined) set((s2) => ({ ...s2, items: s2.items.map((i) => (i.id === id ? { ...i, x: obj.userData.x as number, z: obj.userData.z as number } : i)) }))
        drag = null
        st.controls.enabled = true
      }
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
      return () => { el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp) }
    },
    (st) => {
      const { room, items, feats, sel: selId, walls, zones, rules } = sRef.current
      st.clear(roomG.current)
      st.clear(itemG.current)
      const ox = room.w / 2, oz = room.d / 2
      const fl = new THREE.Mesh(new THREE.BoxGeometry(room.w, 0.02, room.d), new THREE.MeshStandardMaterial({ color: '#e7d7bd', roughness: 0.9 }))
      fl.position.y = -0.01
      roomG.current.add(fl)
      const wallH = walls === 'low' ? 1.0 : room.h
      const wm = new THREE.MeshStandardMaterial({ color: '#fdf2f8', roughness: 1, transparent: walls === 'full', opacity: walls === 'full' ? 0.4 : 1, depthWrite: walls !== 'full' })
      if (walls !== 'none') {
        const t = 0.1
        ;([[room.w + 2 * t, room.d / 2 + t / 2, 0, true], [room.w + 2 * t, -(room.d / 2 + t / 2), 0, true], [room.d, 0, room.w / 2 + t / 2, false], [room.d, 0, -(room.w / 2 + t / 2), false]] as const).forEach(([len, z, x, alongX]) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : t, wallH, alongX ? t : len), wm)
          m.position.set(x, wallH / 2, z)
          roomG.current.add(m)
        })
      }
      const segMesh = (f: Feature, y0: number, y1: number, color: string, depth = 0.12) => {
        const [a, b] = featureSeg(room, f)
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        const along = f.wall === 'N' || f.wall === 'S'
        const m = new THREE.Mesh(new THREE.BoxGeometry(along ? len : depth, y1 - y0, along ? depth : len), new THREE.MeshStandardMaterial({ color, roughness: 0.4, transparent: true, opacity: 0.85 }))
        const inset = f.kind === 'radiator' ? depth / 2 + 0.01 : 0
        const nx = f.wall === 'W' ? inset : f.wall === 'E' ? -inset : 0, nz = f.wall === 'N' ? inset : f.wall === 'S' ? -inset : 0
        m.position.set((a[0] + b[0]) / 2 - ox + nx, (y0 + y1) / 2, (a[1] + b[1]) / 2 - oz + nz)
        roomG.current.add(m)
      }
      for (const f of feats) {
        if (f.kind === 'window') segMesh(f, Math.min(0.9, wallH - 0.2), Math.max(Math.min(2.1, wallH) + 0.02, 1.0), '#7dd3fc', 0.14)
        if (f.kind === 'radiator') segMesh(f, 0.12, 0.7, '#f8fafc', 0.1)
        if (f.kind === 'door') {
          segMesh(f, 0, Math.min(2.05, wallH) + 0.02, '#a16207', 0.13)
          const z = doorZone(room, f)
          const zm = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.d), new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.18, depthWrite: false }))
          zm.rotation.x = -Math.PI / 2
          zm.position.set(z.x - ox, 0.012, z.z - oz)
          roomG.current.add(zm)
        }
        const lb = label(f.kind === 'window' ? 'window' : f.kind === 'door' ? 'door' : 'radiator', '#0f172a', 0.18)
        const [a, b] = featureSeg(room, f)
        lb.position.set((a[0] + b[0]) / 2 - ox, Math.max(1.15, wallH + 0.15) + (f.kind === 'radiator' ? 0.25 : 0), (a[1] + b[1]) / 2 - oz)
        roomG.current.add(lb)
      }
      const warned = new Set(check(room, items, feats, rules).filter((c) => c.level !== 'ok').flatMap((c) => c.ids))
      for (const it of items) {
        const warn = warned.has(it.id)
        const g = model(it, warn, it.id === selId)
        g.position.set(it.x - ox, 0, it.z - oz)
        g.rotation.y = -(it.rot * Math.PI) / 180
        g.userData.id = it.id
        itemG.current.add(g)
        if (zones && CATALOG[it.kind].front > 0) {
          const z = frontZone(it, CATALOG[it.kind].front)
          const zm = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.d), new THREE.MeshBasicMaterial({ color: warn ? '#ef4444' : '#10b981', transparent: true, opacity: 0.22, depthWrite: false }))
          zm.rotation.x = -Math.PI / 2
          zm.rotation.z = -(it.rot * Math.PI) / 180
          zm.position.set(z.x - ox, 0.014, z.z - oz)
          roomG.current.add(zm)
        }
        if (it.id === selId) {
          const t = label(`${it.name} ${num(it.w * 100, 0)}×${num(it.d * 100, 0)}`, '#4f46e5', 0.2)
          t.position.set(it.x - ox, it.h + 0.3, it.z - oz)
          t.userData.label = true
          itemG.current.add(t)
        }
      }
    },
    [s],
    { camera: [2.3, 3.1, 3.3], target: [0, 0.3, 0.1], background: '#f1f5f9', grid: false },
  )

  const errs = checks.filter((c) => c.level === 'err').length, warns = checks.filter((c) => c.level === 'warn').length
  const crib = s.items.find((i) => i.kind === 'crib' || i.kind === 'minicrib')

  return (
    <Split wide="right">
      <div>
        <Panel title="Room">
          <Row>
            <Num label="Width" unit="m" min={1.5} max={8} step={0.05} value={R.w} onChange={(w) => set({ room: { ...R, w } })} />
            <Num label="Depth" unit="m" min={1.5} max={8} step={0.05} value={R.d} onChange={(d) => set({ room: { ...R, d } })} />
            <Num label="Height" unit="m" min={2} max={4} step={0.05} value={R.h} onChange={(h) => set({ room: { ...R, h } })} />
          </Row>
          {s.feats.map((f) => (
            <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px 70px 30px', gap: 6, alignItems: 'end', marginBottom: 6 }}>
              <label className="k-field"><span className="k-label">{f.kind === 'window' ? '🪟' : f.kind === 'door' ? '🚪' : '♨️'} Type</span>
                <select className="k-select" value={f.kind} onChange={(e) => editFeat(f.id, { kind: e.target.value as Feature['kind'] })}>{['window', 'door', 'radiator'].map((k) => <option key={k}>{k}</option>)}</select></label>
              <label className="k-field"><span className="k-label">Wall</span>
                <select className="k-select" value={f.wall} onChange={(e) => editFeat(f.id, { wall: e.target.value as Wall })}>{WALLS.map(([w, n]) => <option key={w} value={w}>{n}</option>)}</select></label>
              <label className="k-field"><span className="k-label">From</span><input className="k-text" type="number" step={0.05} min={0} max={wallLength(R, f.wall)} value={f.offset} onChange={(e) => editFeat(f.id, { offset: Math.max(0, Number(e.target.value) || 0) })} /></label>
              <label className="k-field"><span className="k-label">Width</span><input className="k-text" type="number" step={0.05} min={0.2} value={f.width} onChange={(e) => editFeat(f.id, { width: Math.max(0.2, Number(e.target.value) || 0.2) })} /></label>
              <Btn kind="ghost" title="Remove" onClick={() => set({ feats: s.feats.filter((x) => x.id !== f.id) })}>✕</Btn>
            </div>
          ))}
          <Btn onClick={() => set({ feats: [...s.feats, { id: uid(), kind: 'window', wall: 'W', offset: 0.5, width: 1 }] })}>+ Window / door / radiator</Btn>
          <p className="muted" style={{ fontSize: 13 }}>“From” is measured from the left end of the back/front wall, or from the back end of the side walls.</p>
        </Panel>
        <Panel title="Add furniture">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(Object.keys(CATALOG) as Kind[]).map((k) => (
              <Btn key={k} onClick={() => { const it = makeItem(k, R.w / 2, R.d / 2); set({ items: [...s.items, it], sel: it.id }) }}>+ {CATALOG[k].name}</Btn>
            ))}
          </div>
        </Panel>
        <Panel title="Guidance distances">
          <Slider label="Cot ↔ window" value={s.rules.window} min={0.3} max={1.5} step={0.05} unit=" m" onChange={(window) => set({ rules: { ...s.rules, window } })} />
          <Slider label="Cot ↔ radiator / heater" value={s.rules.heater} min={0.3} max={1.5} step={0.05} unit=" m" onChange={(heater) => set({ rules: { ...s.rules, heater } })} />
          <Slider label="Cot ↔ climbable furniture" value={s.rules.climb} min={0.3} max={1.2} step={0.05} unit=" m" onChange={(climb) => set({ rules: { ...s.rules, climb } })} />
          <Slider label="Cot ↔ corded items" value={s.rules.cord} min={0.5} max={1.5} step={0.05} unit=" m" onChange={(cord) => set({ rules: { ...s.rules, cord } })} />
          <Slider label="Walkway in front of storage" value={s.rules.walkway} min={0.5} max={1.0} step={0.05} unit=" m" onChange={(walkway) => set({ rules: { ...s.rules, walkway } })} />
          <Note tone="warn">These distances are general guidance for planning, not a safety standard. Always follow the furniture manufacturer’s instructions and your local safe-sleep advice.</Note>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Floor area" value={`${num(R.w * R.d, 1)} m²`} />
          <Stat label="Free floor" value={pct(freeFloor(R, s.items), 0)} />
          <Stat label="Issues" value={errs + warns} tone={errs ? 'bad' : warns ? 'accent' : 'good'} sub={`${errs} conflicts · ${warns} warnings`} />
          <Stat label="Cot position" value={crib ? `${num(crib.x, 2)}, ${num(crib.z, 2)} m` : '—'} />
        </Stats>
        <Panel
          title="3D nursery"
          actions={
            <>
              <Seg value={s.walls} onChange={(walls) => set({ walls })} options={[['low', 'Low walls'], ['full', 'See-through'], ['none', 'No walls']]} />
              <Btn kind="ghost" onClick={() => set({ zones: !s.zones })}>{s.zones ? 'Hide zones' : 'Show zones'}</Btn>
            </>
          }
        >
          <View3D refEl={ref} height={440} />
          <p className="muted" style={{ fontSize: 13 }}>Drag furniture on the floor; orbit with the background. Green/red patches show the access space in front of each piece; orange is the door swing.</p>
        </Panel>
        {sel && (
          <Panel title={`Selected: ${sel.name}`} actions={<><Btn onClick={() => editSel({ rot: (sel.rot + 90) % 360 })}>⟳ Rotate</Btn><Btn onClick={() => { const c = { ...sel, id: uid(), x: Math.min(R.w, sel.x + 0.3) }; set({ items: [...s.items, c], sel: c.id }) }}>Duplicate</Btn><Btn kind="danger" onClick={() => set({ items: s.items.filter((i) => i.id !== sel.id), sel: '' })}>Delete</Btn></>}>
            <Row>
              <Txt label="Name" value={sel.name} onChange={(name) => editSel({ name })} />
              <Num label="X" unit="m" step={0.05} value={Math.round(sel.x * 100) / 100} onChange={(x) => editSel({ x })} />
              <Num label="Z" unit="m" step={0.05} value={Math.round(sel.z * 100) / 100} onChange={(z) => editSel({ z })} />
            </Row>
            <Row>
              <Num label="Width" unit="cm" min={5} value={Math.round(sel.w * 100)} onChange={(v) => editSel({ w: Math.max(0.05, v / 100) })} />
              <Num label="Depth" unit="cm" min={5} value={Math.round(sel.d * 100)} onChange={(v) => editSel({ d: Math.max(0.05, v / 100) })} />
              <Num label="Height" unit="cm" min={1} value={Math.round(sel.h * 100)} onChange={(v) => editSel({ h: Math.max(0.01, v / 100) })} />
            </Row>
            <p className="muted" style={{ fontSize: 13 }}>Footprint corners: {corners(sel).map(([x, z]) => `(${num(Math.abs(x) < 0.005 ? 0 : x, 2)}, ${num(Math.abs(z) < 0.005 ? 0 : z, 2)})`).join(' ')}</p>
          </Panel>
        )}
        <Panel title="Safety & layout checks" actions={<><JsonButtons name="nursery-layout.json" data={s} onLoad={(d) => d && Array.isArray(d.items) && set(d)} /><Btn kind="ghost" onClick={() => { const c = stageRef.current?.renderer.domElement; if (c) { const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'nursery.png'; a.click() } }}>PNG</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          {checks.map((c, i) => (
            <div key={i} onClick={() => c.ids[0] && set({ sel: c.ids[0] })} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)', cursor: c.ids.length ? 'pointer' : undefined, fontSize: 14 }}>
              <span>{c.level === 'err' ? '⛔' : c.level === 'warn' ? '⚠️' : '✅'}</span>
              <span style={{ color: c.level === 'err' ? 'var(--err)' : undefined }}>{c.text}</span>
            </div>
          ))}
          {flagged.size === 0 && <Note tone="ok">No issues found with the current guidance distances.</Note>}
        </Panel>
      </div>
    </Split>
  )
}
