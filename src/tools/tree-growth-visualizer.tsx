import { useEffect, useState } from 'react'
import { Btn, LineChart, Note, Num, num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { sunPosition } from './lib/sunrise-sunset-planner'
import { sunDir } from './lib/sun-path-simulator'
import { advice, ageForHeight, autumn, leafless, rng, sizeAt, SPECIES, speciesById, type Size, type Species } from './lib/tree-growth-visualizer'

type Side = 'S' | 'N' | 'E' | 'W'
interface Tree { id: string; sp: string; side: Side; dist: number; offset: number; planted: number }
const PLACES: [string, number, number][] = [['New York', 40.71, -74.0], ['London', 51.51, -0.13], ['Berlin', 52.52, 13.4], ['Denver', 39.74, -104.99], ['Toronto', 43.65, -79.38], ['Sydney', -33.87, 151.21], ['Kyiv', 50.45, 30.52]]
const year = new Date().getFullYear()
const DATES: [string, string][] = [[`${year}-06-21`, 'Jun solstice'], [`${year}-09-22`, 'Sep equinox'], [`${year}-10-20`, 'Autumn'], [`${year}-12-21`, 'Dec solstice']]
const DEF = {
  lat: 40.71, lon: -74.0, date: `${year}-06-21`, hour: 15, age: 15,
  house: { w: 12, d: 9, h: 5.5, pitch: 30 },
  trees: [
    { id: 't1', sp: 'redmaple', side: 'S', dist: 6, offset: -3, planted: 2 },
    { id: 't2', sp: 'spruce', side: 'W', dist: 7, offset: 2, planted: 2 },
    { id: 't3', sp: 'crabapple', side: 'E', dist: 4, offset: 3, planted: 1.5 },
  ] as Tree[],
  sel: 't1',
}

function treePos(t: Tree, hw: number, hd: number): [number, number] {
  if (t.side === 'S') return [t.offset, hd / 2 + t.dist]
  if (t.side === 'N') return [t.offset, -(hd / 2 + t.dist)]
  if (t.side === 'E') return [hw / 2 + t.dist, t.offset]
  return [-(hw / 2 + t.dist), t.offset]
}

function buildTree(sp: Species, sz: Size, seed: number, bare: boolean, fall: boolean): THREE.Group {
  const g = new THREE.Group()
  const r = rng(seed)
  const bark = new THREE.MeshStandardMaterial({ color: sp.id === 'birch' ? '#d6d3d1' : '#5b4636', roughness: 0.9 })
  const leafCol = fall && !sp.ever ? sp.fall : sp.leaf
  const leaf = new THREE.MeshStandardMaterial({ color: leafCol, roughness: 0.85, flatShading: true, transparent: bare, opacity: bare ? 0.12 : 1 })
  const add = <T extends THREE.Object3D>(o: T, cast = true) => { o.castShadow = cast; o.receiveShadow = true; g.add(o); return o }
  const { h, w, trunk } = sz
  const cb = sz.crownBase
  if (sp.form === 'palm') {
    const tr = add(new THREE.Mesh(new THREE.CylinderGeometry(trunk * 0.4, trunk * 0.55, h, 10), bark))
    tr.position.y = h / 2
    const n = 14
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r()
      const fr = add(new THREE.Mesh(new THREE.ConeGeometry(w * 0.09, w * 0.55, 4), leaf))
      fr.position.set(Math.cos(a) * w * 0.22, h - w * 0.08, Math.sin(a) * w * 0.22)
      fr.rotation.set(0, -a, Math.PI / 2 + 0.5 + r() * 0.4)
      fr.scale.set(1, 1, 0.25)
    }
    return g
  }
  const trunkTop = sp.form === 'cone' || sp.form === 'column' ? h * 0.9 : cb + (h - cb) * 0.45
  const tr = add(new THREE.Mesh(new THREE.CylinderGeometry(trunk * 0.35, trunk / 2, trunkTop, 10), bark))
  tr.position.y = trunkTop / 2
  if (sp.form === 'cone') {
    const tiers = 5
    for (let i = 0; i < tiers; i++) {
      const y0 = cb + ((h - cb) * i) / (tiers + 0.6)
      const hh = ((h - cb) / tiers) * 1.9
      const rr = (w / 2) * (1 - i / (tiers + 0.5))
      const c = add(new THREE.Mesh(new THREE.ConeGeometry(rr, hh, 9), leaf), !bare)
      c.position.y = y0 + hh / 2
      c.rotation.y = r() * 3
    }
    return g
  }
  // broadleaf crowns: clumps scattered inside the crown envelope
  const ch = h - cb
  const cy = cb + ch / 2
  const clump = new THREE.IcosahedronGeometry(1, 1)
  const N = sp.form === 'column' ? 40 : 60
  const im = new THREE.InstancedMesh(clump, leaf, N)
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3()
  const scaff: THREE.Vector3[] = []
  for (let i = 0; i < N; i++) {
    let x = 0, y = 0, z = 0
    for (let k = 0; k < 20; k++) {
      x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1
      const rr = x * x + y * y + z * z
      if (rr <= 1 && rr > 0.25) break
    }
    let rx = w / 2, ry = ch / 2
    if (sp.form === 'vase') rx *= 0.55 + 0.45 * ((y + 1) / 2)
    if (sp.form === 'weeping') { ry = ch * 0.55; if (y < 0) { rx *= 1.05; y *= 1.5 } }
    const cl = (sp.form === 'column' ? 0.45 : 0.3) * Math.min(w / 2, ch / 2) * (0.7 + r() * 0.5)
    v.set(x * rx * 0.8, cy + y * ry * 0.8, z * rx * 0.8)
    if (v.y - cl < 0.2) v.y = cl + 0.2
    if (i < 7) scaff.push(v.clone())
    s.set(cl, cl * (sp.form === 'weeping' ? 1.3 : 0.85), cl)
    q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, 0))
    m.compose(v, q, s)
    im.setMatrixAt(i, m)
  }
  add(im, !bare)
  // scaffold branches (visible in winter)
  const top = new THREE.Vector3(0, trunkTop, 0)
  for (const p of scaff) {
    const len = p.distanceTo(top)
    const b = add(new THREE.Mesh(new THREE.CylinderGeometry(trunk * 0.08, trunk * 0.2, len, 6), bark))
    b.position.copy(top).add(p).multiplyScalar(0.5)
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().sub(top).normalize())
  }
  return g
}

export default function TreeGrowthVisualizer() {
  const [s, set, reset] = useToolState('tree-growth-visualizer', DEF)
  const [play, setPlay] = useState<'' | 'day' | 'grow'>('')
  const sel = s.trees.find((t) => t.id === s.sel) ?? s.trees[0]
  const editT = (p: Partial<Tree>) => sel && set({ trees: s.trees.map((t) => (t.id === sel.id ? { ...t, ...p } : t)) })
  const month = Number(s.date.slice(5, 7)) - 1
  const ms = Date.parse(`${s.date}T00:00:00Z`) + (s.hour - s.lon / 15) * 3600e3
  const sun = Number.isFinite(ms) ? sunPosition(ms, s.lat, s.lon) : { elevation: 45, azimuth: 180 }
  const bare = leafless(month, s.lat), fall = autumn(month, s.lat)
  const sizes = s.trees.map((t) => sizeAt(speciesById(t.sp), s.age, t.planted))

  useEffect(() => {
    if (!play) return
    const id = setInterval(() => {
      if (play === 'day') set((st) => ({ ...st, hour: st.hour >= 19.5 ? 5 : st.hour + 0.25 }))
      else set((st) => ({ ...st, age: st.age >= 60 ? 0 : st.age + 1 }))
    }, play === 'day' ? 120 : 250)
    return () => clearInterval(id)
  }, [play, set])

  const setup = (st: Stage3D) => {
    st.renderer.shadowMap.enabled = true
    st.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    st.scene.traverse((o) => {
      if ((o as THREE.DirectionalLight).isDirectionalLight) (o as THREE.DirectionalLight).intensity = 0
      if ((o as THREE.HemisphereLight).isHemisphereLight) (o as THREE.HemisphereLight).intensity = 0.9
    })
    const light = new THREE.DirectionalLight(0xfff4e0, 2.4)
    light.name = 'sunlight'
    light.castShadow = true
    light.shadow.mapSize.set(2048, 2048)
    Object.assign(light.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 })
    light.shadow.bias = -0.0005
    light.shadow.camera.updateProjectionMatrix()
    st.scene.add(light, light.target)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: '#86a865', roughness: 1 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    st.scene.add(ground)
    const n = label('N', '#f8fafc', 2)
    n.position.set(0, 0.5, -40)
    st.scene.add(n)
    const world = new THREE.Group()
    world.name = 'world'
    st.scene.add(world)
  }
  const update = (st: Stage3D) => {
    const world = st.scene.getObjectByName('world') as THREE.Group
    const light = st.scene.getObjectByName('sunlight') as THREE.DirectionalLight
    if (!world || !light) return
    st.clear(world)
    const up = sun.elevation > 0
    const d = sunDir(Math.max(sun.elevation, 0.5), sun.azimuth)
    light.position.set(d[0] * 80, d[1] * 80, d[2] * 80)
    light.intensity = up ? 2.4 * Math.min(1, sun.elevation / 10 + 0.2) : 0
    st.scene.background = new THREE.Color(up ? (sun.elevation < 8 ? '#f59e0b' : '#7dd3fc') : '#0f172a').lerp(new THREE.Color('#0f172a'), up ? 0.35 : 0)
    // house
    const { w, d: dd, h, pitch } = s.house
    const wall = new THREE.MeshStandardMaterial({ color: '#e7e5e4', roughness: 0.9 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), wall)
    body.position.y = h / 2
    body.castShadow = body.receiveShadow = true
    world.add(body)
    const rh = Math.tan((pitch * Math.PI) / 180) * (dd / 2)
    const shape = new THREE.Shape([new THREE.Vector2(-dd / 2 - 0.4, 0), new THREE.Vector2(dd / 2 + 0.4, 0), new THREE.Vector2(0, rh + 0.25)])
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: w + 0.6, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: '#7f1d1d', roughness: 0.8 }))
    roof.rotation.y = Math.PI / 2
    roof.position.set(-w / 2 - 0.3, h, 0)
    roof.castShadow = roof.receiveShadow = true
    world.add(roof)
    const glass = new THREE.MeshStandardMaterial({ color: '#1e3a8a', roughness: 0.2 })
    for (let i = 0; i < 3; i++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 0.05), glass)
      win.position.set(-w / 3 + (i * w) / 3, h * 0.55, dd / 2 + 0.03)
      world.add(win)
    }
    // trees
    s.trees.forEach((t, i) => {
      const sp = speciesById(t.sp)
      const sz = sizes[i]
      const g = buildTree(sp, sz, i * 977 + sp.id.length * 31, bare && !sp.ever, fall)
      const [x, z] = treePos(t, w, dd)
      g.position.set(x, 0, z)
      world.add(g)
      const l = label(`${sp.name} · ${num(sz.h, 1)} m`, t.id === s.sel ? '#fde047' : '#f8fafc', 1.5)
      l.position.set(x, sz.h + 1.2, z)
      world.add(l)
      if (t.id === s.sel) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(sp.w / 2 - 0.08, sp.w / 2, 64), new THREE.MeshBasicMaterial({ color: '#fde047', transparent: true, opacity: 0.8, side: THREE.DoubleSide }))
        ring.rotation.x = -Math.PI / 2
        ring.position.set(x, 0.03, z)
        world.add(ring)
      }
    })
  }
  const ref = useStage3D(setup, update, [s.trees, s.age, s.house, s.hour, s.date, s.lat, s.lon, s.sel], { camera: [24, 15, 27], target: [0, 4, 0], grid: false })

  const tallest = sizes.reduce((m, z) => Math.max(m, z.h), 0)
  const shadowLen = sun.elevation > 0 ? tallest / Math.tan((sun.elevation * Math.PI) / 180) : Infinity
  const selSp = sel ? speciesById(sel.sp) : SPECIES[0]
  const selSize = sel ? sizes[s.trees.indexOf(sel)] : null
  const adv = sel && selSize ? advice(selSp, sel.dist, selSize) : null
  const curve = s.trees.map((t, i) => ({ name: speciesById(t.sp).name, points: Array.from({ length: 61 }, (_, a) => [a, sizeAt(speciesById(t.sp), a, t.planted).h] as [number, number]), color: ['#16a34a', '#0ea5e9', '#f97316', '#a855f7', '#ef4444', '#eab308'][i % 6] }))

  return (
    <Split wide="right">
      <div>
        <Panel title="Trees" actions={<Btn disabled={s.trees.length >= 6} onClick={() => { const t: Tree = { id: uid(), sp: 'birch', side: 'S', dist: 8, offset: 4, planted: 2 }; set({ trees: [...s.trees, t], sel: t.id }) }}>+ Tree</Btn>}>
          <Row>
            {s.trees.map((t) => <Btn key={t.id} kind={t.id === sel?.id ? 'primary' : 'ghost'} onClick={() => set({ sel: t.id })}>{speciesById(t.sp).name}</Btn>)}
          </Row>
          {sel && (
            <>
              <Select label="Species" value={sel.sp} onChange={(sp) => editT({ sp })} options={SPECIES.map((x) => [x.id, `${x.name} — ${x.h} m × ${x.w} m${x.ever ? ' (evergreen)' : ''}`] as [string, string])} />
              <Row>
                <Select label="Side of house" value={sel.side} onChange={(side) => editT({ side })} options={[['S', 'South'], ['N', 'North'], ['E', 'East'], ['W', 'West']]} />
                <Num label="Distance from wall" value={sel.dist} onChange={(dist) => editT({ dist: Math.max(0.5, dist) })} unit="m" min={0.5} />
              </Row>
              <Row>
                <Num label="Offset along wall" value={sel.offset} onChange={(offset) => editT({ offset })} unit="m" />
                <Num label="Height when planted" value={sel.planted} onChange={(planted) => editT({ planted: Math.max(0.3, planted) })} unit="m" min={0.3} />
              </Row>
              <Btn kind="ghost" onClick={() => set({ trees: s.trees.filter((t) => t.id !== sel.id), sel: s.trees.find((t) => t.id !== sel.id)?.id ?? '' })}>Remove this tree</Btn>
            </>
          )}
        </Panel>
        <Panel title="House">
          <Row>
            <Num label="Width (E–W)" value={s.house.w} onChange={(w) => set({ house: { ...s.house, w: Math.max(3, w) } })} unit="m" min={3} />
            <Num label="Depth (N–S)" value={s.house.d} onChange={(d) => set({ house: { ...s.house, d: Math.max(3, d) } })} unit="m" min={3} />
          </Row>
          <Row>
            <Num label="Eave height" value={s.house.h} onChange={(h) => set({ house: { ...s.house, h: Math.max(2, h) } })} unit="m" min={2} />
            <Num label="Roof pitch" value={s.house.pitch} onChange={(pitch) => set({ house: { ...s.house, pitch: Math.max(0, Math.min(60, pitch)) } })} unit="°" min={0} max={60} />
          </Row>
        </Panel>
        <Panel title="Sun & shadows">
          <Select label="Location" value={`${s.lat},${s.lon}`} onChange={(v) => { const [lat, lon] = v.split(',').map(Number); set({ lat, lon }) }} options={[...PLACES.map(([n, la, lo]) => [`${la},${lo}`, n] as [string, string]), ...(PLACES.some(([, la, lo]) => la === s.lat && lo === s.lon) ? [] : [[`${s.lat},${s.lon}`, 'Custom'] as [string, string]])]} />
          <Row>
            <Num label="Latitude" value={s.lat} onChange={(lat) => set({ lat: Math.max(-66, Math.min(66, lat)) })} min={-66} max={66} />
            <Num label="Longitude" value={s.lon} onChange={(lon) => set({ lon })} min={-180} max={180} />
          </Row>
          <Row>{DATES.map(([d, n]) => <Btn key={d} kind={s.date === d ? 'primary' : 'ghost'} onClick={() => set({ date: d })}>{n}</Btn>)}</Row>
          <Txt label="Date" type="date" value={s.date} onChange={(date) => date && set({ date })} />
          <Slider label="Solar time" value={s.hour} onChange={(hour) => set({ hour })} min={5} max={20} step={0.25} show={(v) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`} />
          <Btn onClick={() => setPlay(play === 'day' ? '' : 'day')}>{play === 'day' ? '⏸ Stop' : '▶ Animate the day'}</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Years after planting" value={s.age} sub={`${bare ? 'leafless season' : fall ? 'autumn colour' : 'in leaf'}`} tone="accent" />
          <Stat label="Tallest tree" value={`${num(tallest, 1)} m`} sub={`${num(tallest * 3.28084, 0)} ft`} />
          <Stat label="Its shadow" value={Number.isFinite(shadowLen) ? `${num(shadowLen, 1)} m` : 'night'} sub={`sun ${num(sun.elevation, 0)}° high, az ${num(sun.azimuth, 0)}°`} />
          <Stat label="Selected canopy" value={selSize ? `${num(selSize.w, 1)} m` : '—'} sub={`mature ${selSp.w} m wide`} />
        </Stats>
        <Panel title="3D yard" actions={<><Btn onClick={() => { if (play === 'grow') setPlay(''); else { if (s.age >= 60) set({ age: 0 }); setPlay('grow') } }}>{play === 'grow' ? '⏸ Pause' : '▶ Grow'}</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Slider label="Years after planting" value={s.age} onChange={(age) => set({ age })} min={0} max={60} />
          <View3D refEl={ref} height={460} />
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Drag to orbit. Yellow ring = mature canopy footprint of the selected tree. Deciduous crowns turn see-through in their leafless months, so winter sun reaches the house.</p>
        </Panel>
        {adv && sel && (
          <Panel title={`${selSp.name}: placement check`}>
            <Note tone={adv.ok ? 'ok' : 'warn'}>{adv.ok ? '✓' : '⚠'} Recommended minimum distance from the house: <b>{num(adv.minDist, 1)} m</b> (you have {num(sel.dist, 1)} m).{adv.overhang > 0 && <> At year {s.age} the canopy already overhangs the wall by {num(adv.overhang, 1)} m.</>}</Note>
            {adv.notes.map((n, i) => <Note key={i}>{n}</Note>)}
            <Table head={['Milestone', 'Years after planting']} rows={[0.5, 0.75, 0.9].map((f) => [`${Math.round(f * 100)} % of mature height (${num(selSp.h * f, 1)} m)`, ageForHeight(selSp, selSp.h * f, sel.planted) ?? '> 200']).concat([[`Reaches the eaves (${s.house.h} m)`, ageForHeight(selSp, s.house.h, sel.planted) ?? 'never']])} />
          </Panel>
        )}
        <Panel title="Height over time">
          <LineChart series={curve} xLabel="years after planting" yLabel="height (m)" fx={(v) => num(v, 0)} fy={(v) => num(v, 0)} markers={[{ x: s.age, label: `year ${s.age}` }]} />
          <Note>Growth follows a Chapman–Richards curve fitted to typical mature sizes; soil, water, climate and pruning easily change real trees by ±30 %.</Note>
        </Panel>
      </div>
    </Split>
  )
}
