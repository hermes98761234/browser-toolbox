import { useEffect, useRef, useState } from 'react'
import { Btn, CsvButton, JsonButtons, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, num, uid, useToolState } from '../kit'
import { download } from '../kitlib'
import { THREE, label, useStage3D, View3D, type Stage3D } from '../kit/three'
import { area, capacity, check, clampInside, outside, overlaps, rule, RULES, snap, type Module } from './lib/barn-layout-designer'

const mk = (type: string, name: string, x: number, z: number, w: number, d: number, count: number): Module => ({ id: uid(), type, name, x, z, w, d, count })
const SAMPLE: Module[] = [
  mk('alley', 'Feed alley', 0, 0, 4, 36, 0),
  mk('dairy', 'Cow pen 1', -5.5, -9, 7, 18, 13),
  mk('dairy', 'Cow pen 2', 5.5, -9, 7, 18, 15),
  mk('calf', 'Calf pen', -5.5, 6, 7, 6, 18),
  mk('horse', 'Stall 1', 3.75, 4.95, 3.5, 3.9, 1),
  mk('horse', 'Stall 2', 7.25, 4.95, 3.5, 3.9, 1),
  mk('sheep', 'Sheep pen', -5.5, 13.5, 7, 9, 40),
  mk('store', 'Hay store', 5.5, 12.45, 7, 11.1, 0),
]
const DEF = { W: 18, L: 36, H: 4.5, snapStep: 0.5, modules: SAMPLE, sel: '' }
const STATUS_TXT = { ok: '✓ meets guidance', tight: '⚠ slightly tight', over: '✕ overcrowded', narrow: '✕ too narrow', 'n/a': '—' }
const STATUS_COL = { ok: 'var(--ok)', tight: 'var(--warn)', over: 'var(--err)', narrow: 'var(--err)', 'n/a': 'var(--muted)' }

export default function BarnLayoutDesigner() {
  const [s, set] = useToolState('barn-layout-designer', DEF)
  const [addType, setAddType] = useState('dairy')
  const live = useRef(s)
  useEffect(() => { live.current = s }, [s])
  const stageRef = useRef<Stage3D | null>(null)
  const sel = s.modules.find((m) => m.id === s.sel)
  const edit = (id: string, p: Partial<Module>) => set({ modules: s.modules.map((m) => (m.id === id ? { ...m, ...p } : m)) })
  const problems = new Map<string, string[]>()
  s.modules.forEach((m, i) => {
    const list: string[] = []
    if (outside(m, s.W, s.L)) list.push('outside the barn walls')
    s.modules.forEach((o, j) => { if (i !== j && overlaps(m, o)) list.push(`overlaps ${o.name}`) })
    if (list.length) problems.set(m.id, list)
  })
  const floor = s.W * s.L
  const used = s.modules.reduce((a, m) => a + area(m), 0)
  const pens = s.modules.filter((m) => rule(m.type).m2 > 0)
  const animals = pens.reduce((a, m) => a + m.count, 0)
  const cap = pens.reduce((a, m) => a + capacity(m), 0)

  const ref = useStage3D(
    (st) => {
      stageRef.current = st
      const g = new THREE.Group()
      g.name = 'barn'
      st.scene.add(g)
      const el = st.renderer.domElement
      const ray = new THREE.Raycaster()
      const ndc = new THREE.Vector2()
      const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
      let drag: { id: string; dx: number; dz: number; obj: THREE.Object3D } | null = null
      const hitPoint = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
        ray.setFromCamera(ndc, st.camera)
        return ray
      }
      const down = (e: PointerEvent) => {
        const rc = hitPoint(e)
        const hits = rc.intersectObjects(g.children, true).filter((h) => h.object.userData.moduleId)
        if (!hits.length) return
        const id = hits[0].object.userData.moduleId as string
        const obj = g.getObjectByName('m-' + id)
        const p = new THREE.Vector3()
        if (!obj || !rc.ray.intersectPlane(ground, p)) return
        drag = { id, dx: obj.position.x - p.x, dz: obj.position.z - p.z, obj }
        st.controls.enabled = false
        el.setPointerCapture(e.pointerId)
        set({ sel: id })
      }
      const move = (e: PointerEvent) => {
        if (!drag) return
        const p = new THREE.Vector3()
        if (!hitPoint(e).ray.intersectPlane(ground, p)) return
        const cur = live.current
        const m = cur.modules.find((x) => x.id === drag!.id)
        if (!m) return
        const c = clampInside({ ...m, x: snap(p.x + drag.dx, cur.snapStep), z: snap(p.z + drag.dz, cur.snapStep) }, cur.W, cur.L)
        drag.obj.position.set(c.x, 0, c.z)
        drag.obj.userData.next = c
      }
      const up = () => {
        if (!drag) return
        const c = drag.obj.userData.next as Module | undefined
        if (c) set((cur) => ({ ...cur, modules: cur.modules.map((m) => (m.id === c.id ? { ...m, x: c.x, z: c.z } : m)) }))
        drag = null
        st.controls.enabled = true
      }
      el.addEventListener('pointerdown', down)
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
      return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up) }
    },
    (st) => {
      const g = st.scene.getObjectByName('barn') as THREE.Group
      for (const o of [...g.children]) o.traverse((c) => { if (c instanceof THREE.Sprite) { c.material.map?.dispose(); c.material.dispose() } })
      st.clear(g)
      const { W, L, H } = s
      const ls = Math.max(W, L) / 30
      // floor + grid
      const floorM = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 1 }))
      floorM.rotation.x = -Math.PI / 2
      floorM.position.y = -0.01
      g.add(floorM)
      const grid = new THREE.GridHelper(Math.max(W, L), Math.round(Math.max(W, L)), 0x78716c, 0x6b625b)
      grid.position.y = 0.001
      g.add(grid)
      // walls (low, translucent) + posts
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      for (const [w, x, z, ry] of [[W, 0, -L / 2, 0], [W, 0, L / 2, 0], [L, -W / 2, 0, Math.PI / 2], [L, W / 2, 0, Math.PI / 2]] as const) {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat)
        wall.position.set(x, H / 2, z)
        wall.rotation.y = ry
        g.add(wall)
      }
      const roofEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, L)), new THREE.LineBasicMaterial({ color: 0xfdba74 }))
      roofEdge.position.y = H / 2
      g.add(roofEdge)
      const dimW = label(`${num(W, 1)} m`, '#fdba74', 1.3 * ls); dimW.position.set(0, 0.3, L / 2 + 1.2); g.add(dimW)
      const dimL = label(`${num(L, 1)} m`, '#fdba74', 1.3 * ls); dimL.position.set(W / 2 + 1.4, 0.3, 0); g.add(dimL)
      for (const m of s.modules) {
        const r = rule(m.type)
        const st2 = check(m)
        const bad = problems.has(m.id) || st2.status === 'over' || st2.status === 'narrow'
        const grp = new THREE.Group()
        grp.name = 'm-' + m.id
        grp.position.set(m.x, 0, m.z)
        const isAlley = m.type === 'alley'
        const h = isAlley ? 0.04 : m.type === 'store' ? 2.2 : 0.12
        const slab = new THREE.Mesh(new THREE.BoxGeometry(m.w - 0.06, h, m.d - 0.06), new THREE.MeshStandardMaterial({ color: r.color, roughness: 0.8, emissive: m.id === s.sel ? 0x4f46e5 : 0x000000, emissiveIntensity: 0.35 }))
        slab.position.y = h / 2
        slab.userData.moduleId = m.id
        grp.add(slab)
        if (!isAlley && m.type !== 'store') {
          // pen fence: rails around the perimeter
          const fence = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(m.w - 0.06, 1.2, m.d - 0.06)), new THREE.LineBasicMaterial({ color: bad ? 0xef4444 : m.id === s.sel ? 0xa5b4fc : 0xf5f5f4 }))
          fence.position.y = 0.6
          grp.add(fence)
        } else if (bad) {
          const o = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(m.w, h + 0.05, m.d)), new THREE.LineBasicMaterial({ color: 0xef4444 }))
          o.position.y = h / 2
          grp.add(o)
        }
        const lb = label(`${m.name}${r.m2 ? ` · ${m.count} ${m.count === 1 ? ({ calves: 'calf', cattle: 'animal' } as Record<string, string>)[r.animal] ?? r.animal.replace(/s$/, '') : r.animal}` : ''}`, bad ? '#fca5a5' : '#f8fafc', 1.1 * ls)
        lb.position.set(0, isAlley ? 0.9 : m.type === 'store' ? 3.2 : 2.1, 0)
        grp.add(lb)
        const dl = label(`${num(m.w, 1)} × ${num(m.d, 1)} m`, '#cbd5e1', 0.8 * ls)
        dl.position.set(0, isAlley ? 0.3 : m.type === 'store' ? 2.5 : 1.4, 0)
        grp.add(dl)
        g.add(grp)
      }
    },
    [s.modules, s.W, s.L, s.H, s.sel],
    { camera: [16, 22, 26], target: [0, 0, 0], grid: false, background: '#1c1917' },
  )

  const add = () => {
    const r = rule(addType)
    const w = addType === 'horse' ? 3.7 : addType === 'alley' ? 3 : 6
    const d = addType === 'horse' ? 3.7 : 6
    const m = clampInside(mk(addType, `${r.name.split(' (')[0]} ${s.modules.filter((x) => x.type === addType).length + 1}`, 0, 0, w, d, r.m2 ? Math.max(1, Math.floor((w * d) / r.m2)) : 0), s.W, s.L)
    set({ modules: [...s.modules, m], sel: m.id })
  }
  const view = (top: boolean) => {
    const st = stageRef.current
    if (!st) return
    const k = Math.max(s.W, s.L)
    if (top) st.camera.position.set(0, k * 1.35, 0.01)
    else st.camera.position.set(k * 0.45, k * 0.6, k * 0.75)
    st.controls.target.set(0, 0, 0)
  }
  const png = () => stageRef.current?.renderer.domElement.toBlob((b) => b && download('barn-layout.png', b, 'image/png'))

  return (
    <Split wide="right">
      <div>
        <Panel title="Barn shell">
          <Row>
            <Num label="Width" value={s.W} onChange={(W) => W > 2 && set({ W })} unit="m" min={3} />
            <Num label="Length" value={s.L} onChange={(L) => L > 2 && set({ L })} unit="m" min={3} />
            <Num label="Eave height" value={s.H} onChange={(H) => H > 1 && set({ H })} unit="m" min={2} />
          </Row>
          <Select label="Snap when dragging" value={s.snapStep} onChange={(v) => set({ snapStep: Number(v) })} options={[[0, 'Off'], [0.1, '0.1 m'], [0.25, '0.25 m'], [0.5, '0.5 m'], [1, '1 m']] as const} />
          <p className="k-hint">{num(s.W * 3.28084, 0)} × {num(s.L * 3.28084, 0)} ft · {num(floor, 0)} m² ({num(floor * 10.7639, 0)} ft²)</p>
        </Panel>
        <Panel title="Add module">
          <Row>
            <Select label="Type" value={addType} onChange={setAddType} options={RULES.map((r) => [r.id, r.name] as [string, string])} />
            <Btn kind="primary" onClick={add}>＋ Add</Btn>
          </Row>
          <p className="k-hint">{rule(addType).note}</p>
        </Panel>
        {sel ? (
          <Panel title={`Selected: ${sel.name}`} actions={<Btn kind="danger" onClick={() => set({ modules: s.modules.filter((m) => m.id !== sel.id), sel: '' })}>Delete</Btn>}>
            <Txt label="Name" value={sel.name} onChange={(name) => edit(sel.id, { name })} />
            <Select label="Type" value={sel.type} onChange={(type) => edit(sel.id, { type })} options={RULES.map((r) => [r.id, r.name] as [string, string])} />
            <Row>
              <Num label="Width (x)" value={sel.w} onChange={(w) => w > 0.3 && edit(sel.id, { w })} unit="m" />
              <Num label="Depth (z)" value={sel.d} onChange={(d) => d > 0.3 && edit(sel.id, { d })} unit="m" />
            </Row>
            <Row>
              <Num label="Centre x" value={sel.x} onChange={(x) => edit(sel.id, { x })} unit="m" />
              <Num label="Centre z" value={sel.z} onChange={(z) => edit(sel.id, { z })} unit="m" />
              {rule(sel.type).m2 > 0 && <Num label={`Number of ${rule(sel.type).animal}`} value={sel.count} onChange={(count) => edit(sel.id, { count: Math.max(0, Math.round(count)) })} min={0} />}
            </Row>
            <Row>
              <Btn onClick={() => edit(sel.id, { w: sel.d, d: sel.w })}>⟳ Rotate 90°</Btn>
              <Btn onClick={() => { const c = { ...sel, id: uid(), name: sel.name + ' copy', x: sel.x + sel.w }; set({ modules: [...s.modules, clampInside(c, s.W, s.L)], sel: c.id }) }}>⧉ Duplicate</Btn>
              <Btn kind="ghost" onClick={() => set({ sel: '' })}>Deselect</Btn>
            </Row>
            {rule(sel.type).m2 > 0 && (() => {
              const c = check(sel)
              return <Note tone={c.status === 'ok' ? 'ok' : c.status === 'tight' ? 'warn' : 'err'}>
                {num(area(sel), 1)} m² · {Number.isFinite(c.perAnimal) ? `${num(c.perAnimal, 2)} m² per animal vs ${rule(sel.type).m2} m² typical guidance` : `minimum side ${rule(sel.type).minSide} m`} · capacity ≈ {capacity(sel)} {rule(sel.type).animal}
              </Note>
            })()}
            {problems.get(sel.id)?.map((p) => <Note key={p} tone="err">{sel.name} {p}.</Note>)}
          </Panel>
        ) : <Note>Click a module in the 3D view (or in the table) to select it, then drag it across the floor.</Note>}
      </div>
      <div>
        <Panel title="Layout" actions={<><Btn onClick={() => view(true)}>Top view</Btn><Btn onClick={() => view(false)}>3D view</Btn><Btn onClick={png}>⬇ PNG</Btn></>}>
          <View3D refEl={ref} height={460} />
          <Stats>
            <Stat label="Floor area" value={`${num(floor, 0)} m²`} sub={`${num((used / floor) * 100, 0)}% allocated`} />
            <Stat label="Animals housed" value={animals} sub={`guidance capacity ≈ ${cap}`} tone={animals > cap ? 'bad' : 'good'} />
            <Stat label="Issues" value={problems.size + s.modules.filter((m) => ['over', 'narrow'].includes(check(m).status)).length} tone={problems.size ? 'bad' : 'good'} sub="overlaps, walls, crowding" />
          </Stats>
        </Panel>
        <Panel title="Space check" actions={<>
          <CsvButton name="barn-layout.csv" rows={() => [['Name', 'Type', 'Width m', 'Depth m', 'Area m2', 'Animals', 'm2 per animal', 'Guidance m2', 'Status'], ...s.modules.map((m) => { const c = check(m); return [m.name, rule(m.type).name, m.w, m.d, area(m).toFixed(2), m.count, Number.isFinite(c.perAnimal) ? c.perAnimal.toFixed(2) : '', rule(m.type).m2 || '', c.status] })]} />
          <JsonButtons name="barn-layout.json" data={s} onLoad={(d) => set({ ...DEF, ...d })} />
        </>}>
          <Table
            head={['Module', 'Size', 'Animals', 'm²/animal', 'Status']}
            rows={s.modules.map((m) => {
              const c = check(m)
              const issues = problems.get(m.id)
              return [
                <button key="n" type="button" className="k-btn ghost" style={{ padding: '2px 6px', fontWeight: m.id === s.sel ? 700 : 500 }} onClick={() => set({ sel: m.id })}>{m.name}</button>,
                `${num(m.w, 1)}×${num(m.d, 1)} m`,
                rule(m.type).m2 ? `${m.count} / ${capacity(m)}` : '—',
                Number.isFinite(c.perAnimal) ? `${num(c.perAnimal, 2)} (${rule(m.type).m2})` : '—',
                <span key="s" style={{ color: issues ? 'var(--err)' : STATUS_COL[c.status] }}>{issues ? '✕ ' + issues[0] : STATUS_TXT[c.status]}</span>,
              ]
            })}
          />
          <Note tone="warn">Space allowances are <b>typical guidance</b> figures, not legal minimums. Welfare codes, organic standards and local regulations vary — check yours, and add room for feeders, waterers and handling.</Note>
        </Panel>
      </div>
    </Split>
  )
}
