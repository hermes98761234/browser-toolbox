import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, LineChart, Note, num, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { compass, dayEvents, hhmm, localMidnight, sunPosition } from './lib/golden-hour-planner'
import { daySamples, shadowLength, sunDir, sunHoursGrid, type Box } from './lib/sun-path-simulator'

const CITIES: [string, number, number, string][] = [
  ['Kyiv', 50.45, 30.52, 'Europe/Kyiv'],
  ['London', 51.507, -0.128, 'Europe/London'],
  ['New York', 40.713, -74.006, 'America/New_York'],
  ['Los Angeles', 34.052, -118.244, 'America/Los_Angeles'],
  ['Reykjavik', 64.147, -21.94, 'Atlantic/Reykjavik'],
  ['Dubai', 25.205, 55.27, 'Asia/Dubai'],
  ['Singapore', 1.352, 103.82, 'Asia/Singapore'],
  ['Tokyo', 35.68, 139.69, 'Asia/Tokyo'],
  ['Sydney', -33.869, 151.209, 'Australia/Sydney'],
  ['Cape Town', -33.925, 18.424, 'Africa/Johannesburg'],
  ['São Paulo', -23.55, -46.633, 'America/Sao_Paulo'],
]

type B = Box & { id: string; name: string }

const DEF = {
  city: 'Kyiv', lat: 50.45, lng: 30.52, zone: 'Europe/Kyiv',
  date: '2026-06-21', minute: 16 * 60 + 30,
  heat: true, path: true,
  boxes: [
    { id: 't', name: 'Tower', x: -12, z: -6, w: 14, d: 14, h: 42, rot: 0 },
    { id: 'm', name: 'Mid-rise', x: 14, z: -10, w: 26, d: 10, h: 18, rot: 20 },
    { id: 'h', name: 'House', x: 8, z: 16, w: 10, d: 8, h: 7, rot: 0 },
    { id: 'g', name: 'Garage', x: -12, z: 18, w: 6, d: 6, h: 3, rot: -10 },
  ] as B[],
}

const EXT = 50
const N = 64

function heatColor(h: number, max: number): [number, number, number] {
  if (h < 0) return [100, 116, 139]
  const t = Math.min(1, h / (max || 1))
  // dark blue → teal → yellow
  const stops = [[30, 41, 99], [20, 150, 160], [250, 204, 21]]
  const k = t < 0.5 ? 0 : 1
  const f = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5
  return [0, 1, 2].map((i) => Math.round(stops[k][i] + (stops[k + 1][i] - stops[k][i]) * f)) as [number, number, number]
}

export default function SunPathSimulator() {
  const [s, set, reset] = useToolState('sun-path-simulator', DEF)
  const [play, setPlay] = useState(false)
  const start = useMemo(() => localMidnight(s.date || '2026-06-21', s.zone), [s.date, s.zone])
  const t = start + s.minute * 60000
  const pos = sunPosition(t, s.lat, s.lng)
  const ev = useMemo(() => dayEvents(start, s.lat, s.lng), [start, s.lat, s.lng])
  const samples = useMemo(() => daySamples(start, s.lat, s.lng, 15), [start, s.lat, s.lng])
  const grid = useMemo(() => (s.heat ? sunHoursGrid(s.boxes, samples.map((x) => x.dir), 15, EXT, N) : null), [s.heat, s.boxes, samples])
  const maxSun = (samples.length * 15) / 60
  const year = Number((s.date || '2026').slice(0, 4))

  useEffect(() => {
    if (!play) return
    const id = setInterval(() => set((p) => ({ ...p, minute: (p.minute + 6) % 1440 })), 60)
    return () => clearInterval(id)
  }, [play, set])

  const live = useRef({ alt: pos.alt, az: pos.az })
  useEffect(() => {
    live.current = { alt: pos.alt, az: pos.az }
  }, [pos.alt, pos.az])

  const ref = useStage3D(
    (st) => {
      st.renderer.shadowMap.enabled = true
      st.renderer.shadowMap.type = THREE.PCFSoftShadowMap
      st.scene.children.forEach((c) => {
        if (c instanceof THREE.DirectionalLight) c.intensity = 0
        if (c instanceof THREE.HemisphereLight) c.intensity = 0.45
        if (c instanceof THREE.GridHelper) c.visible = false
      })
      const sun = new THREE.DirectionalLight(0xfff4e0, 2.4)
      sun.name = 'sunlight'
      sun.castShadow = true
      sun.shadow.mapSize.set(2048, 2048)
      Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 })
      sun.shadow.bias = -0.0005
      st.scene.add(sun, sun.target)
      const ball = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 16), new THREE.MeshBasicMaterial({ color: '#fde047' }))
      ball.name = 'sunball'
      st.scene.add(ball)
      const world = new THREE.Group()
      world.name = 'world'
      st.scene.add(world)
      for (const [txt, x, z] of [['N', 0, -EXT - 6], ['S', 0, EXT + 6], ['E', EXT + 6, 0], ['W', -EXT - 6, 0]] as const) {
        const l = label(txt, '#f8fafc', 7)
        l.position.set(x, 2, z)
        st.scene.add(l)
      }
      st.onFrame(() => {
        const { alt, az } = live.current
        const d = sunDir(alt, az)
        sun.position.set(d[0] * 150, d[1] * 150, d[2] * 150)
        sun.intensity = alt > 0 ? 2.4 * Math.min(1, alt / 8 + 0.15) : 0
        ball.position.set(d[0] * 62, d[1] * 62, d[2] * 62)
        ball.visible = alt > -2
        st.scene.background = new THREE.Color(alt > 0 ? '#1e3a5f' : alt > -6 ? '#1e1b4b' : '#0b1020')
      })
    },
    (st) => {
      const world = st.scene.getObjectByName('world') as THREE.Group
      st.clear(world)
      let mat: THREE.MeshStandardMaterial
      if (grid) {
        const c = document.createElement('canvas')
        c.width = c.height = N
        const ctx = c.getContext('2d')!
        const img = ctx.createImageData(N, N)
        grid.forEach((h, i) => {
          const [r, g, b] = heatColor(h, maxSun)
          img.data.set([r, g, b, 255], i * 4)
        })
        ctx.putImageData(img, 0, 0)
        const tex = new THREE.CanvasTexture(c)
        tex.magFilter = THREE.LinearFilter
        tex.colorSpace = THREE.SRGBColorSpace
        mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
      } else mat = new THREE.MeshStandardMaterial({ color: '#4d7c0f', roughness: 1 })
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(EXT * 2, EXT * 2), mat)
      ground.rotation.x = -Math.PI / 2
      ground.receiveShadow = true
      world.add(ground)
      for (const b of s.boxes) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: 0.8 }))
        m.position.set(b.x, b.h / 2, b.z)
        m.rotation.y = (b.rot * Math.PI) / 180
        m.castShadow = m.receiveShadow = true
        world.add(m)
        const l = label(b.name, '#f8fafc', 3.2)
        l.position.set(b.x, b.h + 2.5, b.z)
        world.add(l)
      }
      if (s.path) {
        const arc = (ms: number, col: string) => {
          const pts: THREE.Vector3[] = []
          for (let m = 0; m <= 1440; m += 10) {
            const p = sunPosition(ms + m * 60000, s.lat, s.lng)
            if (p.alt < 0) continue
            const d = sunDir(p.alt, p.az)
            pts.push(new THREE.Vector3(d[0] * 62, d[1] * 62, d[2] * 62))
          }
          if (pts.length > 1) world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col })))
        }
        arc(localMidnight(`${year}-06-21`, s.zone), '#f97316')
        arc(localMidnight(`${year}-12-21`, s.zone), '#38bdf8')
        arc(start, '#fde047')
      }
    },
    [grid, s.boxes, s.path, start, s.lat, s.lng, s.zone, maxSun],
    { camera: [70, 75, 95], target: [0, 5, 0], grid: false },
  )

  const editBox = (id: string, p: Partial<B>) => set({ boxes: s.boxes.map((b) => (b.id === id ? { ...b, ...p } : b)) })
  const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const dayLen = ev.sunrise !== undefined && ev.sunset !== undefined ? (ev.sunset - ev.sunrise) / 3600000 : ev.noonAlt > 0 ? 24 : 0
  const altSeries = (ms: number) => Array.from({ length: 97 }, (_, i) => [i / 4, sunPosition(ms + i * 15 * 60000, s.lat, s.lng).alt] as [number, number])

  return (
    <Split wide="right">
      <div>
        <Panel title="Location & time" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select
            label="City"
            value={CITIES.some((c) => c[0] === s.city) ? s.city : ''}
            onChange={(city) => {
              const c = CITIES.find((x) => x[0] === city)
              if (c) set({ city, lat: c[1], lng: c[2], zone: c[3] })
            }}
            options={[['', 'Custom…'], ...CITIES.map((c) => [c[0], c[0]] as [string, string])]}
          />
          <Row>
            <Num label="Latitude" value={s.lat} onChange={(lat) => set({ lat: Math.max(-89.9, Math.min(89.9, lat)), city: '' })} unit="°" min={-90} max={90} />
            <Num label="Longitude" value={s.lng} onChange={(lng) => set({ lng, city: '' })} unit="°" min={-180} max={180} />
          </Row>
          <label className="k-field">
            <span className="k-label">Date</span>
            <input className="k-text" type="date" value={s.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
          </label>
          <Row>
            {[['Mar equinox', '03-20'], ['Jun solstice', '06-21'], ['Sep equinox', '09-22'], ['Dec solstice', '12-21']].map(([n, d]) => (
              <Btn key={n} onClick={() => set({ date: `${year}-${d}` })}>{n}</Btn>
            ))}
          </Row>
          <Slider label={`Local time (${s.zone})`} value={s.minute} onChange={(minute) => set({ minute })} min={0} max={1435} step={5} show={hm} />
          <Row>
            <Btn kind="primary" onClick={() => setPlay(!play)}>{play ? '⏸ Pause' : '▶ Play day'}</Btn>
            <Btn onClick={() => ev.sunrise && set({ minute: Math.round((ev.sunrise - start) / 60000 / 5) * 5 })}>Sunrise</Btn>
            <Btn onClick={() => set({ minute: Math.round((ev.noon - start) / 60000 / 5) * 5 })}>Solar noon</Btn>
            <Btn onClick={() => ev.sunset && set({ minute: Math.round((ev.sunset - start) / 60000 / 5) * 5 })}>Sunset</Btn>
          </Row>
        </Panel>
        <Panel title="Solar altitude through the day">
          <LineChart
            series={[
              { name: 'Selected date', points: altSeries(start), color: '#eab308' },
              { name: 'Jun 21', points: altSeries(localMidnight(`${year}-06-21`, s.zone)), color: '#f97316', dashed: true },
              { name: 'Dec 21', points: altSeries(localMidnight(`${year}-12-21`, s.zone)), color: '#0ea5e9', dashed: true },
            ]}
            xMin={0}
            xMax={24}
            yMin={-30}
            fx={(v) => `${v}h`}
            fy={(v) => `${v}°`}
            markers={[{ x: s.minute / 60, label: hm(s.minute) }]}
            height={220}
          />
          <p className="muted" style={{ fontSize: 12 }}>
            Solar noon {hhmm(ev.noon, s.zone)} at {num(ev.noonAlt, 1)}°. Positions use the SunCalc algorithm (≈0.1° accuracy); the heat map samples the sun every 15 minutes and traces shadows against every building.
          </p>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Sun altitude" value={`${num(pos.alt, 1)}°`} sub={pos.alt > 0 ? 'above horizon' : 'below horizon'} tone={pos.alt > 0 ? 'accent' : undefined} />
          <Stat label="Azimuth" value={`${num(pos.az, 1)}°`} sub={compass(pos.az)} />
          <Stat label="Shadow of 10 m" value={pos.alt > 0.5 ? `${num(shadowLength(10, pos.alt), 1)} m` : '—'} sub={pos.alt > 0 ? `toward ${compass((pos.az + 180) % 360)}` : 'no direct sun'} />
          <Stat label="Day length" value={`${Math.floor(dayLen)}h ${String(Math.round((dayLen % 1) * 60)).padStart(2, '0')}m`} sub={`${hhmm(ev.sunrise, s.zone)} – ${hhmm(ev.sunset, s.zone)}`} />
        </Stats>
        <Panel title="3D site">
          <View3D refEl={ref} height={460} />
          <Row>
            <Check label="Sun-hours heat map on the ground" value={s.heat} onChange={(heat) => set({ heat })} />
            <Check label="Sun paths (today, Jun 21 orange, Dec 21 blue)" value={s.path} onChange={(path) => set({ path })} />
          </Row>
          {s.heat && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span>0 h</span>
              <span style={{ flex: 1, height: 10, borderRadius: 5, background: 'linear-gradient(90deg, rgb(30,41,99), rgb(20,150,160), rgb(250,204,21))' }} />
              <span>{num(maxSun, 1)} h direct sun</span>
            </div>
          )}
          {pos.alt <= 0 && <Note>The sun is below the horizon at this time. Press ▶ Play day or pick sunrise.</Note>}
        </Panel>
        <Panel title="Buildings (metres)" actions={<Btn onClick={() => set({ boxes: [...s.boxes, { id: uid(), name: `Block ${s.boxes.length + 1}`, x: 0, z: 0, w: 10, d: 10, h: 12, rot: 0 }] })}>+ Building</Btn>}>
          <Table
            head={['Name', 'East', 'South', 'W', 'D', 'H', 'Rot°', '']}
            rows={s.boxes.map((b) => [
              <input key="n" value={b.name} onChange={(e) => editBox(b.id, { name: e.target.value })} style={{ width: 110 }} aria-label="Name" />,
              ...(['x', 'z', 'w', 'd', 'h', 'rot'] as const).map((k) => (
                <input key={k} type="number" value={b[k]} style={{ width: 64 }} aria-label={k} onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isFinite(v)) editBox(b.id, { [k]: k === 'w' || k === 'd' || k === 'h' ? Math.max(0.5, v) : Math.max(-EXT, Math.min(k === 'rot' ? 360 : EXT, v)) })
                }} />
              )),
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ boxes: s.boxes.filter((x) => x.id !== b.id) })}>✕</Btn>,
            ])}
          />
          <p className="muted" style={{ fontSize: 12 }}>Centre position from the site origin: East = +x, South = +z (negative = north/west). Ground covers ±{EXT} m.</p>
        </Panel>
      </div>
    </Split>
  )
}
