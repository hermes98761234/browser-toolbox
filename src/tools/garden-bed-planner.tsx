import { useEffect, useRef } from 'react'
import { Btn, Check, CsvButton, JsonButtons, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, num, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { autoFill, companions, conflicts, gridSpots, PLANTS, soilLitres, type Bed, type Plant } from './lib/garden-bed-planner'

type Mode = 'plant' | 'erase' | 'move'

interface State {
  garden: { w: number; d: number }
  beds: Bed[]
  plants: Plant[]
  type: string
  mode: Mode
  snap: string // 'auto' or cm
  growth: number
  showSpacing: boolean
  sel: string
}

const P = (bed: string, type: string, u: number, v: number): Plant => ({ id: uid(), bed, type, u, v })
const range = (a: number, b: number, step: number) => Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => a + i * step)

const BEDS: Bed[] = [
  { id: 'b1', name: 'Tomato bed', x: 1.6, z: 1.0, w: 2.4, d: 1.2, h: 0.3 },
  { id: 'b2', name: 'Salad bed', x: 4.6, z: 1.0, w: 2.4, d: 1.2, h: 0.3 },
  { id: 'b3', name: 'Berries', x: 1.0, z: 3.1, w: 1.2, d: 1.2, h: 0.25 },
  { id: 'b4', name: 'Squash', x: 4.6, z: 3.1, w: 1.2, d: 1.2, h: 0.4 },
]

const DEF: State = {
  garden: { w: 6.4, d: 4.2 },
  beds: BEDS,
  plants: [
    ...[0.3, 0.9, 1.5, 2.1].map((u) => P('b1', 'tomato', u, 0.3)),
    ...[0.6, 1.2, 1.8].map((u) => P('b1', 'basil', u, 0.95)),
    P('b1', 'marigold', 0.15, 1.05), P('b1', 'marigold', 2.25, 1.05),
    ...gridSpots({ w: 1.2, d: 1.2 }, 'lettuce').map(([u, v]) => P('b2', 'lettuce', u, v)),
    ...range(1.35, 2.35, 0.1).flatMap((u) => [0.3, 0.6, 0.9].map((v) => P('b2', 'carrot', u, v))),
    ...gridSpots({ w: 1.2, d: 1.2 }, 'strawberry').map(([u, v]) => P('b3', 'strawberry', u, v)),
    P('b4', 'zucchini', 0.6, 0.6),
  ],
  type: 'lettuce',
  mode: 'plant',
  snap: 'auto',
  growth: 1,
  showSpacing: true,
  sel: 'b1',
}

function plantMesh(type: string, g: number, bad: boolean): THREE.Group {
  const t = PLANTS[type]
  const grp = new THREE.Group()
  const k = 0.15 + 0.85 * g
  const H = t.height * k, R = (t.spread / 2) * k
  const mat = new THREE.MeshStandardMaterial({ color: bad ? '#dc2626' : t.color, roughness: 0.8 })
  if (t.shape === 'root') {
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(Math.max(0.01, R * 0.5), H, 5), mat)
      c.position.set(Math.cos(i * 2.1) * R * 0.3, H / 2, Math.sin(i * 2.1) * R * 0.3)
      c.rotation.z = Math.cos(i * 2.1) * 0.25
      grp.add(c)
    }
  } else if (t.shape === 'tall' || t.shape === 'vine') {
    const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, H * 1.05, 6), new THREE.MeshStandardMaterial({ color: '#a16207' }))
    stake.position.y = (H * 1.05) / 2
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat)
    body.scale.set(R, H * 0.45, R)
    body.position.y = H * 0.55
    grp.add(stake, body)
  } else {
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat)
    const hy = t.shape === 'leafy' ? Math.min(H, R) : H / 2
    body.scale.set(R, hy, R)
    body.position.y = hy * (t.shape === 'leafy' ? 0.6 : 1)
    grp.add(body)
  }
  if (t.fruit && g > 0.6) {
    const fm = new THREE.MeshStandardMaterial({ color: t.fruit, roughness: 0.4 })
    const n = t.shape === 'tall' ? 5 : 3
    for (let i = 0; i < n; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.015, R * 0.18), 8, 6), fm)
      const a = i * 2.4
      const y = t.shape === 'tall' ? H * (0.3 + 0.12 * i) : H * 0.35
      f.position.set(Math.cos(a) * R * 0.9, y, Math.sin(a) * R * 0.9)
      grp.add(f)
    }
  }
  return grp
}

export default function GardenBedPlanner() {
  const [s, set, reset] = useToolState('garden-bed-planner', DEF)
  const sRef = useRef(s)
  useEffect(() => {
    sRef.current = s
  })
  const stageRef = useRef<Stage3D | null>(null)
  const world = useRef<THREE.Group | null>(null)
  const bad = conflicts(s.plants, s.beds)
  const selBed = s.beds.find((b) => b.id === s.sel)

  const ref = useStage3D(
    (st) => {
      stageRef.current = st
      world.current = new THREE.Group()
      st.scene.add(world.current)
      const el = st.renderer.domElement
      const ray = new THREE.Raycaster()
      const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      let down: { x: number; y: number } | null = null
      let drag: { id: string; dx: number; dz: number; obj: THREE.Object3D } | null = null
      const aim = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), st.camera)
      }
      const hitTagged = (tag: string) => {
        if (!world.current) return null
        for (const h of ray.intersectObjects(world.current.children, true)) {
          let o: THREE.Object3D | null = h.object
          while (o && !o.userData[tag]) o = o.parent
          if (o) return { obj: o, point: h.point }
        }
        return null
      }
      const onDown = (e: PointerEvent) => {
        down = { x: e.clientX, y: e.clientY }
        if (sRef.current.mode !== 'move') return
        aim(e)
        const h = hitTagged('bed')
        const p = ray.ray.intersectPlane(ground, new THREE.Vector3())
        if (!h || !p) return
        st.controls.enabled = false
        el.setPointerCapture(e.pointerId)
        drag = { id: h.obj.userData.bed as string, dx: h.obj.position.x - p.x, dz: h.obj.position.z - p.z, obj: h.obj }
        set({ sel: drag.id })
      }
      const onMove = (e: PointerEvent) => {
        if (!drag) return
        aim(e)
        const p = ray.ray.intersectPlane(ground, new THREE.Vector3())
        if (!p) return
        const { garden, beds } = sRef.current
        const b = beds.find((x) => x.id === drag!.id)
        if (!b) return
        const q = (v: number) => Math.round(v * 10) / 10
        const x = Math.min(garden.w - b.w / 2, Math.max(b.w / 2, q(p.x + drag.dx + garden.w / 2)))
        const z = Math.min(garden.d - b.d / 2, Math.max(b.d / 2, q(p.z + drag.dz + garden.d / 2)))
        drag.obj.position.set(x - garden.w / 2, 0, z - garden.d / 2)
        drag.obj.userData.nx = x
        drag.obj.userData.nz = z
      }
      const onUp = (e: PointerEvent) => {
        if (drag) {
          const { id, obj } = drag
          drag = null
          st.controls.enabled = true
          if (obj.userData.nx !== undefined) set((x) => ({ ...x, beds: x.beds.map((b) => (b.id === id ? { ...b, x: obj.userData.nx as number, z: obj.userData.nz as number } : b)) }))
          return
        }
        if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return
        down = null
        aim(e)
        const cur = sRef.current
        if (cur.mode === 'erase') {
          const h = hitTagged('plant')
          if (h) set((x) => ({ ...x, plants: x.plants.filter((p) => p.id !== h.obj.userData.plant) }))
          return
        }
        const h = hitTagged('bed')
        if (!h) return
        const bedId = h.obj.userData.bed as string
        if (cur.mode !== 'plant') return set({ sel: bedId })
        const b = cur.beds.find((x) => x.id === bedId)
        if (!b) return
        let u = h.point.x + cur.garden.w / 2 - (b.x - b.w / 2)
        let v = h.point.z + cur.garden.d / 2 - (b.z - b.d / 2)
        const sp = PLANTS[cur.type].spacing
        if (cur.snap === 'auto') {
          u = sp / 2 + Math.round((u - sp / 2) / sp) * sp
          v = sp / 2 + Math.round((v - sp / 2) / sp) * sp
        } else {
          const step = Number(cur.snap) / 100
          u = Math.round(u / step) * step
          v = Math.round(v / step) * step
        }
        u = Math.min(b.w, Math.max(0, u))
        v = Math.min(b.d, Math.max(0, v))
        if (cur.plants.some((p) => p.bed === bedId && Math.hypot(p.u - u, p.v - v) < 0.01)) return
        set((x) => ({ ...x, sel: bedId, plants: [...x.plants, { id: uid(), bed: bedId, type: x.type, u, v }] }))
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
      const W = world.current
      if (!W) return
      st.clear(W)
      const cur = sRef.current
      const { garden } = cur
      const badSet = conflicts(cur.plants, cur.beds)
      const lawn = new THREE.Mesh(new THREE.PlaneGeometry(garden.w, garden.d), new THREE.MeshStandardMaterial({ color: '#4d7c0f', roughness: 1 }))
      lawn.rotation.x = -Math.PI / 2
      W.add(lawn)
      for (const b of cur.beds) {
        const g = new THREE.Group()
        g.userData.bed = b.id
        g.position.set(b.x - garden.w / 2, 0, b.z - garden.d / 2)
        const isSel = b.id === cur.sel
        const wood = new THREE.MeshStandardMaterial({ color: isSel ? '#d97706' : '#92400e', roughness: 0.9 })
        const t = 0.05
        const sides: [number, number, number, number][] = [[b.w + 2 * t, t, 0, -b.d / 2 - t / 2], [b.w + 2 * t, t, 0, b.d / 2 + t / 2], [t, b.d, -b.w / 2 - t / 2, 0], [t, b.d, b.w / 2 + t / 2, 0]]
        for (const [sw, sd, x, z] of sides) {
          const m = new THREE.Mesh(new THREE.BoxGeometry(sw, b.h, sd), wood)
          m.position.set(x, b.h / 2, z)
          g.add(m)
        }
        const soil = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h - 0.03, b.d), new THREE.MeshStandardMaterial({ color: '#3b2516', roughness: 1 }))
        soil.position.y = (b.h - 0.03) / 2
        g.add(soil)
        // 30 cm (≈ 1 ft) guide grid on the soil
        const pts: number[] = []
        const top = b.h - 0.028
        for (let u = 0.3; u < b.w - 1e-6; u += 0.3) pts.push(u - b.w / 2, top, -b.d / 2, u - b.w / 2, top, b.d / 2)
        for (let v = 0.3; v < b.d - 1e-6; v += 0.3) pts.push(-b.w / 2, top, v - b.d / 2, b.w / 2, top, v - b.d / 2)
        if (pts.length) {
          const geo = new THREE.BufferGeometry()
          geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
          g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#7c5a3c' })))
        }
        const tag = label(b.name, isSel ? '#fde68a' : '#f8fafc', 0.2)
        tag.position.set(0, b.h + 0.05, -b.d / 2 - 0.2)
        g.add(tag)
        for (const p of cur.plants.filter((x) => x.bed === b.id)) {
          const isBad = badSet.has(p.id)
          const pm = plantMesh(p.type, cur.growth, isBad)
          pm.userData.plant = p.id
          pm.position.set(p.u - b.w / 2, top, p.v - b.d / 2)
          g.add(pm)
          if (cur.showSpacing) {
            const r = PLANTS[p.type].spacing / 2
            const ring = new THREE.Mesh(
              new THREE.RingGeometry(Math.max(0.005, r - 0.008), r, 32),
              new THREE.MeshBasicMaterial({ color: isBad ? '#f87171' : '#e2e8f0', transparent: true, opacity: isBad ? 0.9 : 0.45, side: THREE.DoubleSide }),
            )
            ring.rotation.x = -Math.PI / 2
            ring.position.set(p.u - b.w / 2, top + 0.003, p.v - b.d / 2)
            g.add(ring)
          }
        }
        W.add(g)
      }
    },
    [s.beds, s.plants, s.growth, s.showSpacing, s.sel, s.garden.w, s.garden.d],
    { camera: [0.5, 5, 6], grid: false, background: '#bae6fd' },
  )

  useEffect(() => {
    const st = stageRef.current
    if (!st) return
    const span = Math.max(s.garden.w, s.garden.d)
    st.camera.position.set(span * 0.12, span * 0.72, span * 0.8)
    st.controls.target.set(0, 0, 0)
    st.controls.update()
  }, [s.garden.w, s.garden.d])

  const editBed = (id: string, p: Partial<Bed>) => set({ beds: s.beds.map((b) => (b.id === id ? { ...b, ...p } : b)) })
  const counts = Object.keys(PLANTS)
    .map((k) => ({ k, n: s.plants.filter((p) => p.type === k).length }))
    .filter((c) => c.n > 0)
  const bedArea = s.beds.reduce((a, b) => a + b.w * b.d, 0)
  const soil = s.beds.reduce((a, b) => a + soilLitres(b), 0)
  const selPlants = selBed ? s.plants.filter((p) => p.bed === selBed.id) : []
  const comp = companions([...new Set(selPlants.map((p) => p.type))])
  const fillSpots = selBed ? autoFill(selBed, s.type, s.plants) : []

  return (
    <Split wide="right">
      <div>
        <Panel title="Plant palette" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['plant', '🌱 Plant'], ['erase', '✕ Remove'], ['move', '✥ Move beds']]} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(PLANTS).map(([k, t]) => (
              <Btn key={k} kind={s.type === k ? 'primary' : 'normal'} onClick={() => set({ type: k, mode: 'plant' })} title={`Spacing ${t.spacing * 100} cm · mature ${t.height * 100} cm tall`}>
                <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 9, background: t.fruit ?? t.color, marginRight: 5 }} />
                {t.name}
              </Btn>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '8px 0' }}>
            <b>{PLANTS[s.type].name}</b>: {PLANTS[s.type].spacing * 100} cm spacing · {num(1 / PLANTS[s.type].spacing ** 2, 1)} plants/m² · {PLANTS[s.type].height * 100} cm tall when mature
          </p>
          <Select label="Grid snapping" value={s.snap} onChange={(snap) => set({ snap })} options={[['auto', 'Auto: plant spacing grid'], ['5', '5 cm'], ['10', '10 cm'], ['15', '15 cm'], ['30', '30 cm (≈ 1 ft squares)']]} />
          <Slider label="Growth preview" value={s.growth} onChange={(growth) => set({ growth })} min={0} max={1} step={0.05} show={(v) => (v >= 1 ? 'mature' : v === 0 ? 'seedling' : `${Math.round(v * 100)}%`)} unit="" />
          <Check label="Show spacing circles" value={s.showSpacing} onChange={(showSpacing) => set({ showSpacing })} />
        </Panel>
        <Panel title={selBed ? `Bed: ${selBed.name}` : 'Bed'}>
          {!selBed ? (
            <Note>Click a bed to select it.</Note>
          ) : (
            <>
              <Row>
                <Num label="Length" value={selBed.w} onChange={(w) => editBed(selBed.id, { w: Math.max(0.3, w) })} unit="m" min={0.3} />
                <Num label="Width" value={selBed.d} onChange={(d) => editBed(selBed.id, { d: Math.max(0.3, d) })} unit="m" min={0.3} />
                <Num label="Height" value={selBed.h} onChange={(h) => editBed(selBed.id, { h: Math.max(0.05, h) })} unit="m" min={0.05} />
              </Row>
              <Row>
                <Btn kind="primary" disabled={!fillSpots.length} onClick={() => set({ plants: [...s.plants, ...fillSpots.map(([u, v]) => P(selBed.id, s.type, u, v))] })}>
                  Fill free space with {PLANTS[s.type].name} ({fillSpots.length})
                </Btn>
                <Btn onClick={() => set({ plants: s.plants.filter((p) => p.bed !== selBed.id) })}>Clear bed</Btn>
                <Btn kind="danger" onClick={() => set({ beds: s.beds.filter((b) => b.id !== selBed.id), plants: s.plants.filter((p) => p.bed !== selBed.id), sel: '' })}>Delete bed</Btn>
              </Row>
              <p className="muted" style={{ fontSize: 13, margin: '6px 0' }}>
                {num(selBed.w * selBed.d, 2)} m² · {selPlants.length} plants · {num(soilLitres(selBed), 0)} L of soil
              </p>
              {comp.good.map(([a, b]) => (
                <Note key={a + b} tone="ok">👍 {PLANTS[a].name} + {PLANTS[b].name} are traditional companions.</Note>
              ))}
              {comp.bad.map(([a, b]) => (
                <Note key={a + b} tone="warn">👎 {PLANTS[a].name} and {PLANTS[b].name} are usually kept apart.</Note>
              ))}
            </>
          )}
          <Btn onClick={() => {
            const b: Bed = { id: uid(), name: `Bed ${s.beds.length + 1}`, x: Math.min(s.garden.w - 0.7, 0.8), z: Math.min(s.garden.d - 0.7, 0.8), w: 1.2, d: 1.2, h: 0.3 }
            set({ beds: [...s.beds, b], sel: b.id })
          }}>+ Add bed</Btn>
        </Panel>
        <Panel title="Garden">
          <Row>
            <Num label="Plot length" value={s.garden.w} onChange={(w) => set({ garden: { ...s.garden, w: Math.max(1, w) } })} unit="m" min={1} />
            <Num label="Plot width" value={s.garden.d} onChange={(d) => set({ garden: { ...s.garden, d: Math.max(1, d) } })} unit="m" min={1} />
          </Row>
        </Panel>
      </div>

      <div>
        <Panel title="Garden view">
          <View3D refEl={ref} height={460} />
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
            {s.mode === 'plant' ? `Click a bed to plant ${PLANTS[s.type].name.toLowerCase()} on the snap grid.` : s.mode === 'erase' ? 'Click a plant to remove it.' : 'Drag a bed to move it (snaps to 10 cm).'} Drag empty space to orbit, scroll to zoom. Red plants are too close to a neighbour.
          </p>
        </Panel>
        <Stats>
          <Stat label="Beds" value={s.beds.length} sub={`${num(bedArea, 2)} m² growing area`} />
          <Stat label="Plants" value={s.plants.length} sub={`${counts.length} varieties`} />
          <Stat label="Spacing issues" value={bad.size} tone={bad.size ? 'bad' : 'good'} sub={bad.size ? 'Plants shown in red' : 'All plants have room'} />
          <Stat label="Soil to fill beds" value={`${num(soil, 0)} L`} sub={`${num(soil / 1000, 2)} m³ · ${num(soil / 28.3168, 1)} ft³`} />
        </Stats>
        <Panel
          title="Planting list"
          actions={
            <>
              <CsvButton name="garden-plants.csv" rows={() => [['Plant', 'Count', 'Spacing cm', 'Mature height cm', 'Beds'], ...counts.map((c) => [PLANTS[c.k].name, c.n, PLANTS[c.k].spacing * 100, PLANTS[c.k].height * 100, [...new Set(s.plants.filter((p) => p.type === c.k).map((p) => s.beds.find((b) => b.id === p.bed)?.name ?? '?'))].join('; ')])]} />
              <JsonButtons name="garden-plan.json" data={s} onLoad={(d) => {
                if (d && Array.isArray(d.beds) && Array.isArray(d.plants)) set({ ...DEF, ...d })
              }} />
            </>
          }
        >
          <Table
            head={['Plant', 'Count', 'Spacing', 'Mature size', 'Beds']}
            rows={counts.map((c) => [
              <span key="n"><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 9, background: PLANTS[c.k].fruit ?? PLANTS[c.k].color, marginRight: 6 }} />{PLANTS[c.k].name}</span>,
              c.n,
              `${PLANTS[c.k].spacing * 100} cm`,
              `${PLANTS[c.k].height * 100} × ${PLANTS[c.k].spread * 100} cm`,
              [...new Set(s.plants.filter((p) => p.type === c.k).map((p) => s.beds.find((b) => b.id === p.bed)?.name ?? '?'))].join(', '),
            ])}
          />
          <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>
            Tip: put tall plants (tomatoes, cucumbers on a trellis) on the north side of a bed in the northern hemisphere so they don't shade shorter crops.
          </p>
        </Panel>
      </div>
    </Split>
  )
}
