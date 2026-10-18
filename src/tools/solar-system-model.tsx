import { useEffect, useRef, useState } from 'react'
import { Btn, Check, Note, num, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, Table, today, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { bodyRadius, centuries, dayLength, distAu, helio, lightMinutes, nextEvent, noonAltitude, OBLIQUITY, orbitPoints, PLANETS, scalePos, season, SUN_RADIUS_KM, sunDec, type Scale } from './lib/solar-system-model'

const DEF = { date: today(), speed: 10, scale: 'visible' as Scale, mult: 1000, follow: 'Sun', labels: true, orbits: true, lat: 50 }
const SPEEDS: [number, string][] = [[0.0417, '1 hour/s'], [1, '1 day/s'], [10, '10 days/s'], [30, '1 month/s'], [100, '100 days/s'], [365, '1 year/s'], [3650, '10 years/s']]
const DAY = 86400000
const toThree = (p: [number, number, number]) => new THREE.Vector3(p[0], p[2], -p[1])
const fmtDate = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

/** Side view of Earth with the Sun to the right: tilt toward/away from the Sun, terminator, chosen latitude. */
function SeasonDiagram({ dec, lat }: { dec: number; lat: number }) {
  const R = 80, cx = 120, cy = 110
  const rot = dec // clockwise = top of the axis leans toward the Sun (right) when the Sun is north (dec > 0)
  const latY = -R * Math.sin((lat * Math.PI) / 180), latX = R * Math.cos((lat * Math.PI) / 180)
  const dayH = dayLength(lat, dec)
  return (
    <svg viewBox="0 0 330 220" style={{ width: '100%', maxWidth: 420 }} role="img" aria-label="Earth tilt diagram">
      {[-60, -30, 0, 30, 60].map((y) => <line key={y} x1={250} x2={330} y1={cy + y} y2={cy + y} stroke="#facc15" strokeWidth={2} opacity={0.7} />)}
      <text x={326} y={34} textAnchor="end" fill="#eab308" fontSize={13} fontWeight={700}>← Sunlight</text>
      <circle cx={cx} cy={cy} r={R} fill="#1e3a8a" />
      <path d={`M${cx},${cy - R} A${R},${R} 0 0 1 ${cx},${cy + R} Z`} fill="#60a5fa" />
      <g transform={`rotate(${rot} ${cx} ${cy})`}>
        <line x1={cx} y1={cy - R - 22} x2={cx} y2={cy + R + 22} stroke="currentColor" strokeWidth={2} strokeDasharray="5 3" />
        <text x={cx + 4} y={cy - R - 10} fontSize={12} fill="currentColor">N</text>
        <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="#fde68a" strokeWidth={1.5} opacity={0.8} />
        <line x1={cx - latX} y1={cy + latY} x2={cx + latX} y2={cy + latY} stroke="#f472b6" strokeWidth={3} />
        <circle cx={cx + latX} cy={cy + latY} r={4} fill="#f472b6" />
      </g>
      <text x={8} y={212} fontSize={12} fill="currentColor">Pink: {num(lat, 1)}° latitude · {num(dayH, 1)} h daylight</text>
      <text x={8} y={18} fontSize={12} fill="currentColor">Tilt toward Sun: {num(dec, 1)}°</text>
    </svg>
  )
}

export default function SolarSystemModel() {
  const [s, set, reset] = useToolState('solar-system-model', DEF)
  const start = Date.parse(`${/^\d{4}-\d\d-\d\d$/.test(s.date) ? s.date : today()}T12:00:00Z`)
  const [t, setT] = useState(start)
  const [playing, setPlaying] = useState(true)
  const live = useRef({ t: start, playing: true, speed: s.speed, follow: s.follow, scale: s.scale, mult: s.mult, last: 0 })
  const bodies = useRef<Record<string, THREE.Object3D>>({})
  const prevTarget = useRef(new THREE.Vector3())
  const stageRef = useRef<Stage3D | null>(null)

  useEffect(() => {
    Object.assign(live.current, { playing, speed: s.speed, follow: s.follow, scale: s.scale, mult: s.mult })
  })
  const jump = (ms: number) => {
    live.current.t = ms
    setT(ms)
  }

  const ref = useStage3D(
    (st) => {
      stageRef.current = st
      st.scene.background = new THREE.Color('#020617')
      st.scene.traverse((o) => {
        if (o instanceof THREE.HemisphereLight) o.intensity = 0.35
        if (o instanceof THREE.DirectionalLight) o.intensity = 0
      })
      st.scene.add(new THREE.PointLight(0xffffff, 3.2, 0, 0))
      // a few background stars
      const sp = new Float32Array(1500 * 3)
      for (let i = 0; i < sp.length; i += 3) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(1500 + Math.random() * 500)
        sp.set([v.x, v.y, v.z], i)
      }
      const sg = new THREE.BufferGeometry()
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
      st.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: '#cbd5e1', size: 2, sizeAttenuation: false })))
      st.onFrame((_, dt) => {
        const L = live.current
        if (L.playing) {
          L.t += dt * L.speed * DAY
          if (performance.now() - L.last > 100) {
            L.last = performance.now()
            setT(L.t)
          }
        }
        const T = centuries(L.t)
        for (const p of PLANETS) {
          const o = bodies.current[p.name]
          if (o) o.position.copy(toThree(scalePos(helio(p.name, T), L.scale)))
        }
        const f = L.follow === 'Sun' ? new THREE.Vector3() : bodies.current[L.follow]?.position
        if (f) {
          const d = f.clone().sub(prevTarget.current)
          st.camera.position.add(d)
          st.controls.target.copy(f)
          prevTarget.current.copy(f)
        }
      })
    },
    (st) => {
      const old = st.scene.getObjectByName('sys')
      if (old) {
        st.scene.remove(old)
        st.clear(old)
      }
      const g = new THREE.Group()
      g.name = 'sys'
      const sunR = s.scale === 'true' ? bodyRadius(SUN_RADIUS_KM, 'true', Math.min(s.mult, 40)) : 2.4
      g.add(new THREE.Mesh(new THREE.SphereGeometry(sunR, 48, 24), new THREE.MeshBasicMaterial({ color: '#fde047' })))
      const glow = new THREE.Mesh(new THREE.SphereGeometry(sunR * 1.35, 32, 16), new THREE.MeshBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.18 }))
      g.add(glow)
      const T = centuries(live.current.t)
      bodies.current = {}
      for (const p of PLANETS) {
        if (s.orbits) {
          const pts = orbitPoints(p.name, live.current.t, 240).map((q) => toThree(scalePos(q, s.scale)))
          g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: p.color, transparent: true, opacity: 0.45 })))
        }
        const r = bodyRadius(p.radiusKm, s.scale, s.mult)
        const body = new THREE.Group()
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.8 }))
        body.add(mesh)
        if (p.name === 'Earth') {
          // spin axis fixed in space: celestial pole = ecliptic (0, sin ε, cos ε)
          const e = (OBLIQUITY * Math.PI) / 180
          const axis = toThree([0, Math.sin(e), Math.cos(e)]).normalize()
          const ax = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.06, r * 0.06, r * 3.2, 8), new THREE.MeshBasicMaterial({ color: '#f472b6' }))
          ax.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)
          body.add(ax)
          const eq = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.03, 6, 48), new THREE.MeshBasicMaterial({ color: '#fde68a' }))
          eq.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis)
          body.add(eq)
        }
        if (p.name === 'Saturn') {
          const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.25, r * 2.3, 64), new THREE.MeshStandardMaterial({ color: '#d6c08a', side: THREE.DoubleSide, transparent: true, opacity: 0.75 }))
          ring.rotation.x = -Math.PI / 2 + (26.7 * Math.PI) / 180
          body.add(ring)
        }
        if (s.labels) {
          const l = label(p.name, '#e2e8f0', 1)
          const m = l.material as THREE.SpriteMaterial
          m.sizeAttenuation = false
          l.scale.multiplyScalar(0.035)
          l.position.y = r * 1.6 + (s.scale === 'true' ? 0 : 0.4)
          l.center.set(0.5, 0)
          body.add(l)
        }
        body.position.copy(toThree(scalePos(helio(p.name, T), s.scale)))
        g.add(body)
        bodies.current[p.name] = body
      }
      st.scene.add(g)
    },
    [s.scale, s.mult, s.labels, s.orbits],
    { camera: [0, 55, 70], grid: false },
  )

  const focus = (name: string) => {
    set({ follow: name })
    live.current.follow = name
    const st = stageRef.current
    const b = name === 'Sun' ? null : bodies.current[name]
    if (!st) return
    const target = b ? b.position.clone() : new THREE.Vector3()
    const p = PLANETS.find((x) => x.name === name)
    const dist = p ? Math.max(4, bodyRadius(p.radiusKm, s.scale, s.mult) * 10) : s.scale === 'true' ? 120 : 70
    const dir = st.camera.position.clone().sub(st.controls.target).normalize()
    st.camera.position.copy(target).add(dir.multiplyScalar(dist))
    st.controls.target.copy(target)
    prevTarget.current.copy(target)
  }

  const T = centuries(t)
  const earth = helio('Earth', T)
  const dec = sunDec(t)
  const ev = nextEvent(t)
  const rows = PLANETS.map((p) => {
    const h = helio(p.name, T)
    const fromEarth = distAu([h[0] - earth[0], h[1] - earth[1], h[2] - earth[2]])
    const lon = ((Math.atan2(h[1], h[0]) * 180) / Math.PI + 360) % 360
    return [
      <b key="n" style={{ color: p.color }}>{p.name}</b>,
      num(distAu(h), 3),
      p.name === 'Earth' ? '—' : num(fromEarth, 2),
      p.name === 'Earth' ? '—' : `${num(lightMinutes(fromEarth), 1)} min`,
      `${num(lon, 1)}°`,
      p.periodD < 1000 ? `${num(p.periodD, 1)} d` : `${num(p.periodD / 365.25, 2)} y`,
      `${num(p.tilt, 1)}°`,
    ]
  })

  return (
    <Split wide="right">
      <div>
        <Panel title="Time">
          <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtDate(t)}</div>
          <Row>
            <Btn kind="primary" onClick={() => setPlaying(!playing)}>{playing ? '❚❚ Pause' : '▶ Play'}</Btn>
            <Btn onClick={() => jump(t - 30 * DAY)}>−30 d</Btn>
            <Btn onClick={() => jump(t + 30 * DAY)}>+30 d</Btn>
            <Btn onClick={() => jump(Date.now())}>Now</Btn>
          </Row>
          <Select label="Speed" value={s.speed} onChange={(speed) => set({ speed })} options={SPEEDS} />
          <label className="k-field"><span className="k-label">Jump to date</span>
            <input className="k-text" type="date" value={s.date} onChange={(e) => { set({ date: e.target.value }); const ms = Date.parse(`${e.target.value}T12:00:00Z`); if (Number.isFinite(ms)) jump(ms) }} />
          </label>
          <p className="muted" style={{ fontSize: 12 }}>Positions use J2000 Keplerian elements with secular rates (JPL approximate, best 1800–2050; error up to a few arc-minutes).</p>
        </Panel>
        <Panel title="View">
          <Seg value={s.scale} onChange={(scale) => { set({ scale }); const st = stageRef.current; if (st) st.camera.position.sub(st.controls.target).setLength(scale === 'true' ? 420 : 90).add(st.controls.target) }} options={[['visible', 'Visible scale (√ distance)'], ['true', 'True distances']]} />
          {s.scale === 'true' && <Slider label="Planet size ×" value={s.mult} onChange={(mult) => set({ mult })} min={1} max={3000} step={1} show={(v) => num(v, 0)} />}
          {s.scale === 'true' && <Note>At real size (×1) Earth is 0.00004 AU across — invisible. Sizes are magnified; distances stay true (1 AU = 10 units).</Note>}
          <Select label="Follow" value={s.follow} onChange={focus} options={['Sun', ...PLANETS.map((p) => p.name)]} />
          <Check label="Labels" value={s.labels} onChange={(labels) => set({ labels })} />
          <Check label="Orbits" value={s.orbits} onChange={(orbits) => set({ orbits })} />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </Panel>
        <Panel title="Seasons on Earth">
          <SeasonDiagram dec={dec} lat={s.lat} />
          <Slider label="Your latitude" value={s.lat} onChange={(lat) => set({ lat })} min={-90} max={90} step={0.5} unit="°" />
          <Stats>
            <Stat label="Season" value={<span style={{ fontSize: 16 }}>{season(t, s.lat)}</span>} />
            <Stat label="Daylight" value={`${num(dayLength(s.lat, dec), 1)} h`} />
            <Stat label="Noon Sun" value={`${num(noonAltitude(s.lat, dec), 1)}°`} sub="altitude" />
          </Stats>
          <Note>Next: <b>{ev.name}</b> on {fmtDate(ev.t)}. Seasons come from the 23.44° tilt (pink axis in 3D), not from distance — Earth is closest to the Sun in early January.</Note>
        </Panel>
      </div>
      <div>
        <Panel title="Solar system">
          <View3D refEl={ref} height={520} />
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Drag to orbit, scroll to zoom. Pink rod = Earth's spin axis, which keeps pointing the same way all year.</p>
        </Panel>
        <Stats>
          <Stat label="Earth–Sun" value={`${num(distAu(earth), 4)} AU`} sub={`${num(distAu(earth) * 149.598, 2)} million km`} />
          <Stat label="Sun declination" value={`${num(dec, 2)}°`} sub="subsolar latitude" tone="accent" />
          <Stat label="Day of year" value={Math.floor((t - Date.UTC(new Date(t).getUTCFullYear(), 0, 1)) / DAY) + 1} />
        </Stats>
        <Panel title="Planets right now">
          <Table head={['Planet', 'From Sun (AU)', 'From Earth (AU)', 'Light time', 'Helio. longitude', 'Orbit period', 'Axial tilt']} rows={rows} />
        </Panel>
      </div>
    </Split>
  )
}
