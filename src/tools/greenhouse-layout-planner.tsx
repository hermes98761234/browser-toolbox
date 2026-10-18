import { useMemo } from 'react'
import { CsvButton, LineChart, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, Txt, num, pct, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { layoutBenches, plantGrid, roofY, stats, type GhOpts } from './lib/greenhouse-layout-planner'
import { sunPosition } from './lib/sunrise-sunset-planner'

interface State extends GhOpts {
  shape: 'gable' | 'hoop'
  eave: number
  ridge: number
  bay: number
  benchH: number
  lat: number
  date: string
  hour: number
  orient: number // ridge bearing, degrees from north
}

const DEF: State = {
  length: 12, width: 7.2, layout: 'longitudinal', benchW: 1.5, aisle: 0.75, mainAisle: 1.2, endClear: 0.9, spacing: 0.25, pattern: 'triangular', edge: 0.03,
  shape: 'gable', eave: 2.2, ridge: 3.8, bay: 1.5, benchH: 0.8, lat: 50, date: '2026-03-20', hour: 10, orient: 90,
}

const PRESETS: Record<string, Partial<State>> = {
  'Hobby 3×4 m': { length: 4, width: 3, shape: 'gable', eave: 1.6, ridge: 2.4, bay: 0.8, layout: 'longitudinal', benchW: 0.75, aisle: 0.7, endClear: 0.2, spacing: 0.15, pattern: 'square' },
  'Hoop house 30×9 m': { length: 30, width: 9, shape: 'hoop', eave: 1.6, ridge: 4, bay: 1.8, layout: 'peninsula', benchW: 1.2, aisle: 0.6, mainAisle: 1.5, endClear: 1.2, spacing: 0.3, pattern: 'triangular' },
  'Nursery 12×7.2 m': { length: 12, width: 7.2, shape: 'gable', eave: 2.2, ridge: 3.8, bay: 1.5, layout: 'longitudinal', benchW: 1.5, aisle: 0.75, endClear: 0.9, spacing: 0.25, pattern: 'triangular' },
}

/** Cross-section profile (z, y) from the left eave over the roof to the right eave. */
function profile(s: State, n = 24): [number, number][] {
  const w = s.width / 2
  if (s.shape === 'gable') return [[-w, 0], [-w, s.eave], [0, s.ridge], [w, s.eave], [w, 0]]
  const pts: [number, number][] = [[-w, 0]]
  for (let i = 0; i <= n; i++) pts.push([-w + (s.width * i) / n, roofY('hoop', s.width, s.eave, s.ridge, -w + (s.width * i) / n)])
  pts.push([w, 0])
  return pts
}

export default function GreenhouseLayoutPlanner() {
  const [s, set, reset] = useToolState('greenhouse-layout-planner', DEF)
  const bad = s.length <= 0 || s.width <= 0 || s.eave <= 0 || s.ridge < s.eave || s.spacing <= 0 || s.bay <= 0
  const benches = useMemo(() => (bad ? [] : layoutBenches(s)), [s, bad])
  const st = useMemo(() => stats(s, benches), [s, benches])
  const prof = useMemo(() => profile(s), [s])
  // cross-section area by the shoelace formula → air volume for heating/ventilation sizing
  const section = Math.abs(prof.reduce((a, [z, y], i) => { const [z2, y2] = prof[(i + 1) % prof.length]; return a + z * y2 - z2 * y }, 0)) / 2
  const volume = section * s.length
  const dayMs = Date.parse(`${s.date}T00:00:00Z`)
  const sun = sunPosition(dayMs + s.hour * 3600000, s.lat, 0)
  const curve = (d: number) => Array.from({ length: 49 }, (_, i) => [i / 2, Math.max(-5, sunPosition(d + (i / 2) * 3600000, s.lat, 0).elevation)] as [number, number])
  const year = s.date.slice(0, 4)

  const ref = useStage3D(
    (stg) => {
      stg.renderer.shadowMap.enabled = true
      stg.renderer.shadowMap.type = THREE.PCFSoftShadowMap
      const sunL = new THREE.DirectionalLight(0xfff1d6, 2)
      sunL.name = 'sun'
      sunL.castShadow = true
      sunL.shadow.mapSize.set(2048, 2048)
      stg.scene.add(sunL, sunL.target)
    },
    (stg) => {
      let g = stg.scene.getObjectByName('gh') as THREE.Group | undefined
      if (!g) {
        g = new THREE.Group()
        g.name = 'gh'
        stg.scene.add(g)
      }
      stg.clear(g)
      if (bad) return
      const L = s.length, W = s.width
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(L + 2, W + 2), new THREE.MeshStandardMaterial({ color: 0x8d8170, roughness: 1 }))
      floor.rotation.x = -Math.PI / 2
      floor.receiveShadow = true
      g.add(floor)
      // frame arches
      const steel = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.6, roughness: 0.4 })
      const bays = Math.max(1, Math.round(L / s.bay))
      const arch = prof.slice(0, -1).map(([z, y]) => new THREE.Vector3(0, y, z))
      arch.push(new THREE.Vector3(0, 0, W / 2))
      for (let i = 0; i <= bays; i++) {
        const path = new THREE.CurvePath<THREE.Vector3>()
        for (let k = 0; k < arch.length - 1; k++) path.add(new THREE.LineCurve3(arch[k], arch[k + 1]))
        const tube = new THREE.Mesh(new THREE.TubeGeometry(path, arch.length * 2, 0.035, 6, false), steel)
        tube.position.x = -L / 2 + (L * i) / bays
        tube.castShadow = true
        g.add(tube)
      }
      for (const [z, y] of [prof[1], prof[Math.floor(prof.length / 2)], prof[prof.length - 2]]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(L, 0.05, 0.05), steel)
        p.position.set(0, y, z)
        p.castShadow = true
        g.add(p)
      }
      // glazing: extruded profile + end walls
      const glass = new THREE.MeshStandardMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, roughness: 0.1 })
      const shape = new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(z, y)))
      const skin = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false }), glass)
      skin.rotation.y = Math.PI / 2
      skin.position.x = -L / 2
      g.add(skin)
      // door frame at the +x gable
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2, 1), new THREE.MeshStandardMaterial({ color: 0x334155 }))
      door.position.set(L / 2, 1, 0)
      g.add(door)
      // benches
      const top = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.4, roughness: 0.5 })
      const legM = new THREE.MeshStandardMaterial({ color: 0x475569 })
      for (const b of benches) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(b.lx, 0.05, b.lz), top)
        slab.position.set(b.x, s.benchH, b.z)
        slab.castShadow = slab.receiveShadow = true
        g.add(slab)
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, s.benchH, 0.05), legM)
          leg.position.set(b.x + dx * (b.lx / 2 - 0.08), s.benchH / 2, b.z + dz * (b.lz / 2 - 0.08))
          g.add(leg)
        }
      }
      // plants (instanced, capped)
      const pts: [number, number][] = []
      for (const b of benches) {
        const along = b.lx >= b.lz
        for (const [u, v] of plantGrid(Math.max(b.lx, b.lz), Math.min(b.lx, b.lz), s.spacing, s.pattern, s.edge)) {
          if (pts.length >= 12000) break
          pts.push(along ? [b.x - b.lx / 2 + u, b.z - b.lz / 2 + v] : [b.x - b.lx / 2 + v, b.z - b.lz / 2 + u])
        }
      }
      const r = Math.min(0.25, s.spacing * 0.38)
      const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshStandardMaterial({ color: 0x22a34a, roughness: 0.8 }), Math.max(1, pts.length))
      const pot = new THREE.InstancedMesh(new THREE.CylinderGeometry(r * 0.7, r * 0.55, r * 1.1, 8), new THREE.MeshStandardMaterial({ color: 0xb45309 }), Math.max(1, pts.length))
      const m = new THREE.Matrix4()
      pts.forEach(([x, z], i) => {
        m.makeTranslation(x, s.benchH + 0.025 + r * 0.55, z)
        pot.setMatrixAt(i, m)
        m.makeTranslation(x, s.benchH + 0.025 + r * 1.1 + r * 0.7, z)
        inst.setMatrixAt(i, m)
      })
      inst.count = pot.count = pts.length
      inst.castShadow = pot.castShadow = true
      g.add(inst, pot)
      // compass + sun
      const rel = ((sun.azimuth - s.orient) * Math.PI) / 180, el = (Math.max(2, sun.elevation) * Math.PI) / 180
      const sunL = stg.scene.getObjectByName('sun') as THREE.DirectionalLight
      const R = Math.max(L, W)
      sunL.position.set(Math.cos(rel) * Math.cos(el) * R * 2, Math.sin(el) * R * 2, Math.sin(rel) * Math.cos(el) * R * 2)
      sunL.intensity = sun.elevation > 0 ? 2.2 : 0.15
      const cam = sunL.shadow.camera
      cam.left = cam.bottom = -R
      cam.right = cam.top = R
      cam.far = R * 5
      cam.updateProjectionMatrix()
      const nRel = (-s.orient * Math.PI) / 180
      const n = label('N', '#f87171', 0.7)
      n.position.set(Math.cos(nRel) * (R / 2 + 1.5), 0.4, Math.sin(nRel) * (R / 2 + 1.5))
      g.add(n)
      const sunBall = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshBasicMaterial({ color: sun.elevation > 0 ? 0xfacc15 : 0x64748b }))
      sunBall.position.copy(sunL.position).setLength(R * 0.9 + 3)
      g.add(sunBall)
    },
    [s, benches, prof, sun.azimuth, sun.elevation, bad],
    { camera: [-9, 9, 13], target: [0, 1, 0], background: '#cfe3f1', grid: false },
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Greenhouse">
          <Row>{Object.keys(PRESETS).map((k) => <button key={k} type="button" className="k-btn" onClick={() => set(PRESETS[k])}>{k}</button>)}</Row>
          <Seg value={s.shape} onChange={(shape) => set({ shape })} options={[['gable', 'Gable (glass)'], ['hoop', 'Hoop / tunnel']]} />
          <Row>
            <Num label="Length" value={s.length} onChange={(length) => set({ length })} unit="m" min={1} max={100} />
            <Num label="Width" value={s.width} onChange={(width) => set({ width })} unit="m" min={1} max={30} />
            <Num label="Eave / side height" value={s.eave} onChange={(eave) => set({ eave })} unit="m" min={0.5} max={8} />
            <Num label="Ridge height" value={s.ridge} onChange={(ridge) => set({ ridge })} unit="m" min={0.5} max={12} />
            <Num label="Frame spacing" value={s.bay} onChange={(bay) => set({ bay })} unit="m" min={0.3} max={6} />
          </Row>
          {bad && <Note tone="err">Check the sizes: positive dimensions, ridge at least as high as the eaves.</Note>}
        </Panel>
        <Panel title="Benches & aisles">
          <Seg value={s.layout} onChange={(layout) => set({ layout })} options={[['longitudinal', 'Long benches'], ['peninsula', 'Peninsula (cross) benches']]} />
          <Row>
            <Num label="Bench width" value={s.benchW} onChange={(benchW) => set({ benchW })} unit="m" min={0.3} max={3} hint="≤ 0.9 m if reached from one side" />
            <Num label="Bench height" value={s.benchH} onChange={(benchH) => set({ benchH })} unit="m" min={0.2} max={1.5} />
            <Num label={s.layout === 'peninsula' ? 'Aisle between benches' : 'Aisle width'} value={s.aisle} onChange={(aisle) => set({ aisle })} unit="m" min={0.3} max={3} />
            {s.layout === 'peninsula' && <Num label="Main aisle" value={s.mainAisle} onChange={(mainAisle) => set({ mainAisle })} unit="m" min={0.5} max={4} />}
            <Num label="Clearance at each end" value={s.endClear} onChange={(endClear) => set({ endClear })} unit="m" min={0} max={5} />
          </Row>
        </Panel>
        <Panel title="Plant spacing">
          <Seg value={s.pattern} onChange={(pattern) => set({ pattern })} options={[['square', 'Square grid'], ['triangular', 'Triangular (offset rows)']]} />
          <Row>
            <Num label="Centre-to-centre spacing" value={Math.round(s.spacing * 1000) / 10} onChange={(v) => set({ spacing: v / 100 })} unit="cm" min={2} max={200} />
            <Num label="Edge margin" value={Math.round(s.edge * 1000) / 10} onChange={(v) => set({ edge: v / 100 })} unit="cm" min={0} max={50} />
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Triangular spacing fits ≈ 15% more plants at the same distance and gives each plant a rounder footprint.</p>
        </Panel>
        <Panel title="Sun">
          <Row>
            <Num label="Latitude" value={s.lat} onChange={(lat) => set({ lat: Math.max(-66, Math.min(66, lat)) })} unit="°" min={-66} max={66} />
            <Txt label="Date" type="date" value={s.date} onChange={(date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && set({ date })} />
            <Select label="Ridge runs" value={s.orient} onChange={(orient) => set({ orient })} options={[[90, 'East – West'], [0, 'North – South'], [45, 'NE – SW'], [135, 'NW – SE']]} />
          </Row>
          <Slider label="Solar time" value={s.hour} onChange={(hour) => set({ hour })} min={4} max={20} step={0.25} show={(v) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`} />
          <button type="button" className="k-btn ghost" onClick={reset}>Reset all</button>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Plants" value={num(st.plants, 0)} sub={`${num(st.perM2, 1)} per m² of bench`} tone="accent" />
          <Stat label="Bench area" value={`${num(st.bench, 1)} m²`} sub={`${pct(st.util, 0)} of ${num(st.floor, 1)} m² floor`} tone={st.util >= 0.6 ? 'good' : undefined} />
          <Stat label="Benches" value={benches.length} sub={s.layout === 'peninsula' ? 'cross benches' : 'long benches'} />
          <Stat label="Air volume" value={`${num(volume, 0)} m³`} sub={`section ${num(section, 1)} m²`} />
          <Stat label="Sun" value={sun.elevation > 0 ? `${num(sun.elevation, 0)}° high` : 'below horizon'} sub={`azimuth ${num(sun.azimuth, 0)}°`} />
        </Stats>
        <Panel title="3D view">
          <View3D refEl={ref} height={440} />
          <p className="muted" style={{ fontSize: 13 }}>Drag to orbit, scroll to zoom. The red N marks north; shadows follow the sun at the chosen latitude, date and solar time.</p>
        </Panel>
        <Panel title="Sun elevation over the day">
          <LineChart height={210} xMin={0} xMax={24} yMin={-5} fx={(v) => `${v}h`} fy={(v) => `${num(v, 0)}°`} markers={[{ x: s.hour, label: 'now' }]}
            series={[
              { name: s.date, points: curve(dayMs), color: '#f59e0b', area: true },
              { name: 'Jun 21', points: curve(Date.parse(`${year}-06-21T00:00:00Z`)), color: '#94a3b8', dashed: true },
              { name: 'Dec 21', points: curve(Date.parse(`${year}-12-21T00:00:00Z`)), color: '#0ea5e9', dashed: true },
            ]} />
          <Note>{Math.abs(s.lat) >= 40 ? 'At this latitude an East–West ridge lets in more low winter sun through the long south-facing roof; North–South gives more even light across benches during the day.' : 'Near the tropics a North–South ridge gives the most even light and less midday heat on one side.'}</Note>
        </Panel>
        <Panel title="Bench schedule" actions={<CsvButton name="greenhouse-benches.csv" rows={() => [['Bench', 'Centre x (m)', 'Centre z (m)', 'Length (m)', 'Width (m)', 'Area (m²)', 'Plants'], ...benches.map((b, i) => [i + 1, b.x.toFixed(2), b.z.toFixed(2), Math.max(b.lx, b.lz).toFixed(2), Math.min(b.lx, b.lz).toFixed(2), (b.lx * b.lz).toFixed(2), plantGrid(Math.max(b.lx, b.lz), Math.min(b.lx, b.lz), s.spacing, s.pattern, s.edge).length])]} />}>
          <Table head={['#', 'Size', 'Area', 'Plants']} max={12} rows={benches.map((b, i) => [i + 1, `${num(Math.max(b.lx, b.lz), 2)} × ${num(Math.min(b.lx, b.lz), 2)} m`, `${num(b.lx * b.lz, 2)} m²`, plantGrid(Math.max(b.lx, b.lz), Math.min(b.lx, b.lz), s.spacing, s.pattern, s.edge).length])} />
          {benches.length === 0 && !bad && <Note tone="warn">No bench fits — reduce the bench width, aisles or end clearance.</Note>}
        </Panel>
      </div>
    </Split>
  )
}
