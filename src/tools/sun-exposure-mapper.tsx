import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, CsvButton, LineChart, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, download, num, pct, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { sunPosition } from './lib/golden-hour-planner'
import { category, exposure, type Obstacle, solarMidnight, sunVec, treeParts } from './lib/sun-exposure-mapper'

const year = new Date().getFullYear()
const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const PLACES: [string, number, number][] = [
  ['London', 51.5, -0.12], ['New York', 40.71, -74.0], ['Los Angeles', 34.05, -118.24], ['Kyiv', 50.45, 30.52],
  ['Berlin', 52.52, 13.4], ['Tokyo', 35.68, 139.69], ['Sydney', -33.87, 151.21], ['Cape Town', -33.92, 18.42],
]
const DEF = {
  lat: 51.5, lng: -0.12, place: 'London',
  date: `${year}-06-21`,
  rot: 0,
  width: 20, depth: 16,
  obstacles: [
    { id: 'h', kind: 'box', name: 'House', x: 0, z: -6, w: 12, d: 4, h: 7 },
    { id: 't', kind: 'tree', name: 'Oak tree', x: 6.5, z: 4, w: 5, d: 5, h: 9 },
    { id: 'f', kind: 'box', name: 'West fence', x: -9.9, z: 0, w: 0.15, d: 16, h: 1.8 },
    { id: 's', kind: 'box', name: 'Shed', x: -6.5, z: 5.5, w: 3, d: 2.5, h: 2.4 },
    { id: 'g', kind: 'box', name: 'South hedge', x: -1, z: 7.6, w: 9, d: 0.8, h: 2.2 },
  ] as Obstacle[],
}
const STOPS = ['#1e1b4b', '#3730a3', '#0e7490', '#16a34a', '#facc15', '#f97316']
function ramp(f: number): string {
  const x = Math.min(0.9999, Math.max(0, f)) * (STOPS.length - 1)
  const i = Math.floor(x), t = x - i
  const a = new THREE.Color(STOPS[i]), b = new THREE.Color(STOPS[i + 1])
  return '#' + a.lerp(b, t).getHexString()
}
const hm = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`

export default function SunExposureMapper() {
  const [s, set, reset] = useToolState('sun-exposure-mapper', DEF)
  const [hour, setHour] = useState(14)
  const [play, setPlay] = useState(false)
  const [mode, setMode] = useState<'heat' | 'grass'>('heat')
  const [shadow, setShadow] = useState(true)
  const stageRef = useRef<Stage3D | null>(null)
  const yardG = useRef(new THREE.Group())
  const sunG = useRef(new THREE.Group())
  const light = useRef(new THREE.DirectionalLight(0xfff4d6, 2.2))

  const ex = useMemo(() => exposure({ width: s.width, depth: s.depth, cell: Math.max(0.25, Math.max(s.width, s.depth) / 48), obstacles: s.obstacles, lat: s.lat, lng: s.lng, date: s.date, rot: s.rot }), [s.width, s.depth, s.obstacles, s.lat, s.lng, s.date, s.rot])
  const t0 = solarMidnight(s.date, s.lng)
  const sp = sunPosition(t0 + hour * 3600000, s.lat, s.lng)
  const cats = { 'Full sun': 0, 'Part sun': 0, 'Part shade': 0, 'Full shade': 0 }
  ex.hours.forEach((h) => cats[category(h)]++)
  const avg = ex.hours.reduce((a, b) => a + b, 0) / (ex.hours.length || 1)

  useEffect(() => {
    if (!play) return
    const id = setInterval(() => setHour((h) => (h + 0.1) % 24), 80)
    return () => clearInterval(id)
  }, [play])

  const ref = useStage3D(
    (st) => {
      stageRef.current = st
      st.renderer.shadowMap.enabled = true
      st.renderer.shadowMap.type = THREE.PCFSoftShadowMap
      st.scene.traverse((o) => {
        if (o instanceof THREE.DirectionalLight) o.intensity = 0
        if (o instanceof THREE.HemisphereLight) o.intensity = 0.9
      })
      const l = light.current
      l.castShadow = true
      l.shadow.mapSize.set(2048, 2048)
      l.shadow.bias = -0.0005
      st.scene.add(l, l.target, yardG.current, sunG.current)
      st.scene.background = new THREE.Color('#9cc4e4')
    },
    (st) => {
      const g = yardG.current
      st.clear(g)
      // ground with heat map or grass
      const cv = document.createElement('canvas')
      cv.width = ex.nx
      cv.height = ex.nz
      const c = cv.getContext('2d')!
      for (let j = 0; j < ex.nz; j++)
        for (let i = 0; i < ex.nx; i++) {
          const h = ex.hours[j * ex.nx + i]
          c.fillStyle = mode === 'heat' ? ramp(h / Math.max(1, ex.dayLength)) : (i + j) % 2 ? '#5f9e4a' : '#64a44e'
          c.fillRect(i, j, 1, 1)
        }
      const tex = new THREE.CanvasTexture(cv)
      tex.magFilter = mode === 'heat' ? THREE.LinearFilter : THREE.NearestFilter
      tex.colorSpace = THREE.SRGBColorSpace
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(s.width, s.depth), new THREE.MeshLambertMaterial({ map: tex }))
      ground.rotation.x = -Math.PI / 2
      ground.receiveShadow = true
      g.add(ground)
      const rim = new THREE.Mesh(new THREE.PlaneGeometry(s.width * 3, s.depth * 3), new THREE.MeshLambertMaterial({ color: '#a3b18a' }))
      rim.rotation.x = -Math.PI / 2
      rim.position.y = -0.02
      rim.receiveShadow = true
      g.add(rim)
      for (const o of s.obstacles) {
        if (o.kind === 'box') {
          const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, o.w), Math.max(0.05, o.h), Math.max(0.05, o.d)), new THREE.MeshLambertMaterial({ color: /hedge/i.test(o.name) ? '#2f6b3a' : /fence/i.test(o.name) ? '#8b6b4a' : /shed/i.test(o.name) ? '#a16207' : '#e7e1d6' }))
          m.position.set(o.x, o.h / 2, o.z)
          m.castShadow = m.receiveShadow = true
          g.add(m)
        } else {
          const t = treeParts(o)
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(t.trunkR, t.trunkR * 1.3, t.trunkH, 10), new THREE.MeshLambertMaterial({ color: '#6b4423' }))
          trunk.position.set(o.x, t.trunkH / 2, o.z)
          const can = new THREE.Mesh(new THREE.SphereGeometry(t.r, 20, 14), new THREE.MeshLambertMaterial({ color: '#2f7d32' }))
          can.position.set(o.x, t.cy, o.z)
          trunk.castShadow = can.castShadow = true
          g.add(trunk, can)
        }
        const lb = label(o.name, '#0f172a', 0.9)
        lb.position.set(o.x, o.h + 0.6, o.z)
        g.add(lb)
      }
      const R = Math.max(s.width, s.depth) * 0.62
      ;['N', 'E', 'S', 'W'].forEach((n, k) => {
        const v = sunVec(0, k * 90, s.rot)
        const lb = label(n, n === 'N' ? '#b91c1c' : '#1e293b', 1.6)
        lb.position.set(v[0] * R, 0.4, v[2] * R)
        g.add(lb)
      })
      // sun path and sun
      const sg = sunG.current
      st.clear(sg)
      const R2 = Math.max(s.width, s.depth) * 0.95
      const path: THREE.Vector3[] = []
      for (let m = 0; m <= 1440; m += 10) {
        const p = sunPosition(t0 + m * 60000, s.lat, s.lng)
        if (p.alt > -1) {
          const v = sunVec(p.alt, p.az, s.rot)
          path.push(new THREE.Vector3(v[0] * R2, v[1] * R2, v[2] * R2))
        }
      }
      if (path.length > 1) sg.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(path), new THREE.LineBasicMaterial({ color: '#f59e0b' })))
      const v = sunVec(sp.alt, sp.az, s.rot)
      const sun = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), new THREE.MeshBasicMaterial({ color: sp.alt > 0 ? '#fde047' : '#64748b' }))
      sun.position.set(v[0] * R2, v[1] * R2, v[2] * R2)
      sg.add(sun)
      const l = light.current
      l.position.set(v[0] * 40, Math.max(0.5, v[1] * 40), v[2] * 40)
      l.intensity = sp.alt > 0 && shadow ? 2.2 : 0
      const half = Math.max(s.width, s.depth)
      Object.assign(l.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 120 })
      l.shadow.camera.updateProjectionMatrix()
      st.scene.background = new THREE.Color(sp.alt > 0 ? '#9cc4e4' : '#1e293b')
    },
    [ex, mode, s.obstacles, s.rot, hour, shadow, s.lat, s.lng, s.date],
    { camera: [12, 14, 17], grid: false },
  )

  const editOb = (id: string, p: Partial<Obstacle>) => set({ obstacles: s.obstacles.map((o) => (o.id === id ? { ...o, ...p } : o)) })
  const dates: [string, string][] = [[todayIso(), 'Today'], [`${year}-03-20`, 'Mar equinox'], [`${year}-06-21`, 'Jun solstice'], [`${year}-09-22`, 'Sep equinox'], [`${year}-12-21`, 'Dec solstice']]

  return (
    <div>
      <Panel
        title={`Yard at ${hm(hour)} solar time — sun ${sp.alt > 0 ? `${num(sp.alt, 0)}° high, ${num(sp.az, 0)}°` : 'below horizon'}`}
        actions={
          <>
            <Seg value={mode} onChange={setMode} options={[['heat', 'Sun-hours map'], ['grass', 'Plain yard']]} />
            <Btn onClick={() => stageRef.current && stageRef.current.renderer.domElement.toBlob((b) => b && download('yard-sun.png', b, 'image/png'))}>⬇ PNG</Btn>
          </>
        }
      >
        <View3D refEl={ref} height={460} />
        <Row wrap={false}>
          <Btn onClick={() => setPlay(!play)}>{play ? '❚❚' : '▶'}</Btn>
          <div style={{ flex: 1 }}>
            <Slider label="Time of day (solar)" value={hour} min={0} max={23.9} step={0.1} show={hm} onChange={(h) => { setPlay(false); setHour(h) }} />
          </div>
          <Check label="Live shadow" value={shadow} onChange={setShadow} />
        </Row>
        {mode === 'heat' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span>0 h</span>
            <span style={{ flex: 1, height: 10, borderRadius: 5, background: `linear-gradient(90deg, ${STOPS.join(',')})` }} />
            <span>{num(ex.dayLength, 1)} h (all day)</span>
          </div>
        )}
      </Panel>
      <Stats>
        <Stat label="Day length" value={`${num(ex.dayLength, 1)} h`} sub={s.date} />
        <Stat label="Average sun" value={`${num(avg, 1)} h`} sub="direct sun per spot" tone="accent" />
        <Stat label="Full sun (6 h+)" value={pct(cats['Full sun'] / ex.hours.length, 0)} sub="of the yard" tone="good" />
        <Stat label="Shade (< 2 h)" value={pct(cats['Full shade'] / ex.hours.length, 0)} sub="of the yard" />
      </Stats>
      <Split>
        <div>
          <Panel title="Location & date">
            <Select label="Place" value={s.place} onChange={(place) => { const p = PLACES.find((x) => x[0] === place); set(p ? { place, lat: p[1], lng: p[2] } : { place }) }} options={[...PLACES.map((p) => p[0]), 'Custom']} />
            <Row>
              <Num label="Latitude" value={s.lat} min={-89} max={89} onChange={(lat) => set({ lat, place: 'Custom' })} unit="°" />
              <Num label="Longitude" value={s.lng} min={-180} max={180} onChange={(lng) => set({ lng, place: 'Custom' })} unit="°" />
            </Row>
            <label className="k-field"><span className="k-label">Date</span><input type="date" className="k-text" value={s.date} onChange={(e) => e.target.value && set({ date: e.target.value })} /></label>
            <Row>{dates.map(([d, l]) => <Btn key={l} kind={s.date === d ? 'primary' : 'ghost'} onClick={() => set({ date: d })}>{l}</Btn>)}</Row>
            <Slider label="Yard orientation (bearing of the far edge)" value={s.rot} min={0} max={359} step={1} unit="°" onChange={(rot) => set({ rot })} />
            <Row>
              <Num label="Yard width (E–W)" value={s.width} min={2} max={100} unit="m" onChange={(width) => set({ width })} />
              <Num label="Yard depth" value={s.depth} min={2} max={100} unit="m" onChange={(depth) => set({ depth })} />
            </Row>
          </Panel>
          <Panel title="Light categories (for planting)">
            <Table
              head={['Category', 'Direct sun', 'Share', 'Area']}
              rows={(Object.keys(cats) as (keyof typeof cats)[]).map((k) => [k, { 'Full sun': '6 h +', 'Part sun': '4–6 h', 'Part shade': '2–4 h', 'Full shade': '< 2 h' }[k], pct(cats[k] / ex.hours.length, 0), `${num((cats[k] * s.width * s.depth) / ex.hours.length, 1)} m²`])}
            />
            <CsvButton name="sun-hours.csv" rows={() => [['x_m', 'z_m', 'sun_hours'], ...Array.from(ex.hours, (h, k) => [+(-s.width / 2 + ((k % ex.nx) + 0.5) * (s.width / ex.nx)).toFixed(2), +(-s.depth / 2 + (Math.floor(k / ex.nx) + 0.5) * (s.depth / ex.nz)).toFixed(2), +h.toFixed(2)])]} />
          </Panel>
        </div>
        <div>
          <Panel title="Obstacles" actions={<>
            <Btn onClick={() => set({ obstacles: [...s.obstacles, { id: uid(), kind: 'box', name: 'Wall', x: 0, z: 0, w: 3, d: 0.3, h: 2 }] })}>+ Box</Btn>
            <Btn onClick={() => set({ obstacles: [...s.obstacles, { id: uid(), kind: 'tree', name: 'Tree', x: 0, z: 0, w: 4, d: 4, h: 6 }] })}>+ Tree</Btn>
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </>}>
            <Table
              head={['Name', 'x (E)', 'z (S)', 'Width', 'Depth', 'Height', '']}
              rows={s.obstacles.map((o) => [
                <input key="n" value={o.name} onChange={(e) => editOb(o.id, { name: e.target.value })} style={{ width: 92 }} aria-label="Name" />,
                ...(['x', 'z', 'w', 'd', 'h'] as const).map((k) => (k === 'd' && o.kind === 'tree' ? <span key={k} className="muted">canopy</span> : <input key={k} type="number" step={0.5} value={o[k]} onChange={(e) => editOb(o.id, { [k]: Number(e.target.value) || 0 })} style={{ width: 56 }} aria-label={k} />)),
                <Btn key="x" kind="ghost" onClick={() => set({ obstacles: s.obstacles.filter((x) => x.id !== o.id) })}>✕</Btn>,
              ])}
            />
            <p className="muted" style={{ fontSize: 13 }}>Metres from the yard centre: x grows to the right (east when orientation is 0°), z towards the near edge. Trees use width as canopy diameter.</p>
          </Panel>
          <Panel title="Share of the yard in sun, hour by hour">
            <LineChart series={[{ name: 'In sun', points: ex.hourly.map(([h, f]) => [h, f * 100]), area: true, color: '#f59e0b' }]} xMin={0} xMax={24} yMin={0} yMax={100} fx={(v) => `${v}h`} fy={(v) => `${num(v, 0)}%`} markers={[{ x: hour, label: 'now' }]} height={200} />
          </Panel>
          <Note>Direct-sun hours are ray-cast every 10 min from each {num(ex.cell, 2)} m cell toward the sun (SunCalc formulas). Diffuse light, leaf density and terrain slope are not modelled, so treat trees as worst-case shade.</Note>
        </div>
      </Split>
    </div>
  )
}
