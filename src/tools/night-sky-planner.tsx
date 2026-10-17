import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { THREE, View3D, label, useStage3D } from '../kit/three'
import { PLANETS, PLANET_COLOR, altOf, bestTime, bodies, bvColor, compass, constellations, crossings, lst, moonHz, moonPhase, nightEvents, stars, toHorizontal, type Eq } from './lib/night-sky-planner'

const CITIES: [string, number, number, string][] = [
  ['London', 51.5074, -0.1278, 'Europe/London'], ['Kyiv', 50.4501, 30.5234, 'Europe/Kiev'], ['Berlin', 52.52, 13.405, 'Europe/Berlin'], ['Paris', 48.8566, 2.3522, 'Europe/Paris'],
  ['Madrid', 40.4168, -3.7038, 'Europe/Madrid'], ['Reykjavík', 64.1466, -21.9426, 'Atlantic/Reykjavik'], ['New York', 40.7128, -74.006, 'America/New_York'], ['Chicago', 41.8781, -87.6298, 'America/Chicago'],
  ['Denver', 39.7392, -104.9903, 'America/Denver'], ['Los Angeles', 34.0522, -118.2437, 'America/Los_Angeles'], ['São Paulo', -23.5505, -46.6333, 'America/Sao_Paulo'], ['Cape Town', -33.9249, 18.4241, 'Africa/Johannesburg'],
  ['Mumbai', 19.076, 72.8777, 'Asia/Kolkata'], ['Tokyo', 35.6762, 139.6503, 'Asia/Tokyo'], ['Sydney', -33.8688, 151.2093, 'Australia/Sydney'], ['Auckland', -36.8485, 174.7633, 'Pacific/Auckland'],
]
const guess = (() => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return CITIES.find((c) => c[3] === tz || (tz === 'Europe/Kyiv' && c[0] === 'Kyiv')) ?? CITIES[0]
  } catch {
    return CITIES[0]
  }
})()

interface State { place: string; lat: number; lon: number; lines: boolean; names: 'bright' | 'all' | 'none'; eqGrid: boolean; azGrid: boolean; ground: boolean; mag: number }
const DEF: State = { place: guess[0], lat: guess[1], lon: guess[2], lines: true, names: 'bright', eqGrid: false, azGrid: true, ground: true, mag: 4.5 }
const R = 100
const pad = (n: number) => String(n).padStart(2, '0')
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hm = (t: number | null) => (t === null ? '—' : new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }))
const RAD = Math.PI / 180

function eqVec(e: Eq, r = R) {
  const a = e.ra * RAD, d = e.dec * RAD
  return new THREE.Vector3(r * Math.cos(d) * Math.cos(a), r * Math.cos(d) * Math.sin(a), r * Math.sin(d))
}
/** Horizontal (alt, az) → scene vector: x east, y up, −z north. */
function hzVec(alt: number, az: number, r = R) {
  const a = alt * RAD, z = az * RAD
  return new THREE.Vector3(r * Math.cos(a) * Math.sin(z), r * Math.sin(a), -r * Math.cos(a) * Math.cos(z))
}
function disc(color: string, glow = false) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, color)
  grd.addColorStop(glow ? 0.25 : 0.45, color)
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}
function moonTexture(frac: number, ang: number) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const r = 56
  g.translate(64, 64)
  g.fillStyle = '#334155'
  g.beginPath()
  g.arc(0, 0, r, 0, Math.PI * 2)
  g.fill()
  const waxing = ang < 180
  g.fillStyle = '#f8fafc'
  g.beginPath()
  g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, !waxing) // lit limb half
  const k = 1 - 2 * frac // terminator ellipse x-radius factor
  g.ellipse(0, 0, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === waxing)
  g.fill()
  return new THREE.CanvasTexture(c)
}
function skyColor(sunAlt: number) {
  const stops: [number, string][] = [[-18, '#02040b'], [-12, '#07112a'], [-6, '#182c55'], [0, '#3d5f9a'], [8, '#6b9bd6']]
  if (sunAlt <= stops[0][0]) return new THREE.Color(stops[0][1])
  for (let i = 1; i < stops.length; i++)
    if (sunAlt <= stops[i][0]) return new THREE.Color(stops[i - 1][1]).lerp(new THREE.Color(stops[i][1]), (sunAlt - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]))
  return new THREE.Color(stops[stops.length - 1][1])
}

export default function NightSkyPlanner() {
  const [s, set, reset] = useToolState('night-sky-planner', DEF)
  const [now] = useState(() => Date.now())
  const [date, setDate] = useState(() => {
    const d = new Date(now)
    if (d.getHours() < 12) d.setDate(d.getDate() - 1)
    return localDate(d)
  })
  const noon = useMemo(() => new Date(`${date}T12:00:00`).getTime(), [date])
  const [min, setMin] = useState(() => {
    const m = Math.round((now - new Date(`${date}T12:00:00`).getTime()) / 60000)
    return m >= 0 && m <= 1440 ? m : 600
  })
  const [play, setPlay] = useState(false)
  const [geoErr, setGeoErr] = useState('')
  const t = noon + min * 60000
  const sunAlt = altOf('Sun', t, s.lat, s.lon)
  const phase = moonPhase(t)

  useEffect(() => {
    if (!play) return
    const id = setInterval(() => setMin((m) => (m + 4) % 1441), 50)
    return () => clearInterval(id)
  }, [play])

  const ev = useMemo(() => nightEvents(noon, s.lat, s.lon), [noon, s.lat, s.lon])
  const moonRS = useMemo(() => crossings((x) => moonHz(x, s.lat, s.lon).alt, 0.125, noon, noon + 86400000, 900000), [noon, s.lat, s.lon])
  const plan = useMemo(() => [...PLANETS, 'Moon'].map((n) => ({ n, best: bestTime(n, noon, s.lat, s.lon) })), [noon, s.lat, s.lon])
  const objs = bodies(t)

  const look = useRef<THREE.Vector3 | null>(null)
  const ref = useStage3D(
    (st) => {
      st.controls.enableZoom = false
      st.controls.enablePan = false
      st.controls.rotateSpeed = -0.35
      const el = st.renderer.domElement
      const wheel = (e: WheelEvent) => {
        e.preventDefault()
        st.camera.fov = Math.max(12, Math.min(100, st.camera.fov * (e.deltaY > 0 ? 1.08 : 0.93)))
        st.camera.updateProjectionMatrix()
      }
      el.addEventListener('wheel', wheel, { passive: false })
      st.camera.fov = 70
      st.camera.updateProjectionMatrix()
      // equatorial group: everything fixed to the sky
      const eq = new THREE.Group()
      eq.name = 'eq'
      eq.matrixAutoUpdate = false
      st.scene.add(eq)
      const cat = stars()
      const pos = new Float32Array(cat.length * 3), col = new Float32Array(cat.length * 3), size = new Float32Array(cat.length)
      cat.forEach((x, i) => {
        eqVec(x).toArray(pos, i * 3)
        col.set(bvColor(x.bv), i * 3)
        size[i] = Math.max(2.2, 11 - 1.55 * (x.mag + 1.5))
      })
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('starColor', new THREE.BufferAttribute(col, 3))
      g.setAttribute('size', new THREE.BufferAttribute(size, 1))
      const mat = new THREE.ShaderMaterial({
        uniforms: { scale: { value: 1 }, opacity: { value: 1 } },
        vertexShader: 'attribute float size; attribute vec3 starColor; uniform float scale; varying vec3 vC; void main(){ vC=starColor; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale; }',
        fragmentShader: 'uniform float opacity; varying vec3 vC; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor=vec4(vC, smoothstep(0.5,0.05,d)*opacity); }',
        transparent: true, depthWrite: false,
      })
      const pts = new THREE.Points(g, mat)
      pts.name = 'stars'
      pts.frustumCulled = false
      eq.add(pts)
      // constellation lines
      const lp: number[] = []
      for (const c of constellations()) for (const pl of c.lines) for (let i = 1; i < pl.length; i++) lp.push(...eqVec(pl[i - 1], R * 0.995).toArray(), ...eqVec(pl[i], R * 0.995).toArray())
      const lg = new THREE.BufferGeometry()
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3))
      const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x5b7bb5, transparent: true, opacity: 0.55 }))
      lines.name = 'lines'
      eq.add(lines)
      for (const c of constellations()) {
        const v = new THREE.Vector3()
        let n = 0
        for (const pl of c.lines) for (const p of pl) { v.add(eqVec(p, 1)); n++ }
        const sp = label(c.name, '#7c93c4', 3)
        sp.position.copy(v.normalize().multiplyScalar(R * 0.97))
        ;(sp.material as THREE.SpriteMaterial).depthTest = true
        sp.name = 'clabel'
        if (n) lines.add(sp)
      }
      // equatorial grid
      const gp: number[] = []
      for (let dec = -60; dec <= 60; dec += 30) for (let ra = 0; ra < 360; ra += 5) gp.push(...eqVec({ ra, dec }, R * 0.99).toArray(), ...eqVec({ ra: ra + 5, dec }, R * 0.99).toArray())
      for (let ra = 0; ra < 360; ra += 30) for (let dec = -85; dec < 85; dec += 5) gp.push(...eqVec({ ra, dec }, R * 0.99).toArray(), ...eqVec({ ra, dec: dec + 5 }, R * 0.99).toArray())
      const gg = new THREE.BufferGeometry()
      gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3))
      const eqGrid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x0e7490, transparent: true, opacity: 0.45 }))
      eqGrid.name = 'eqGrid'
      eq.add(eqGrid)
      const starLabels = new THREE.Group()
      starLabels.name = 'starLabels'
      cat.forEach((x) => {
        if (!x.name) return
        const sp = label(x.name, '#e2e8f0', 2.6)
        sp.position.copy(eqVec(x, R * 0.98)).add(new THREE.Vector3(0, 0, -1.6))
        ;(sp.material as THREE.SpriteMaterial).depthTest = true
        sp.userData.mag = x.mag
        starLabels.add(sp)
      })
      eq.add(starLabels)
      const bodiesG = new THREE.Group()
      bodiesG.name = 'bodies'
      eq.add(bodiesG)
      // horizon frame
      const ground = new THREE.Mesh(new THREE.SphereGeometry(R * 0.9, 48, 24, 0, Math.PI * 2, Math.PI / 2 + 0.002, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b1f14, side: THREE.BackSide, transparent: true }))
      ground.name = 'ground'
      st.scene.add(ground)
      const hp: number[] = []
      const az: number[] = []
      for (let a = 0; a < 360; a += 3) hp.push(...hzVec(0, a, R * 0.89).toArray(), ...hzVec(0, a + 3, R * 0.89).toArray())
      for (const alt of [30, 60]) for (let a = 0; a < 360; a += 3) az.push(...hzVec(alt, a, R * 0.89).toArray(), ...hzVec(alt, a + 3, R * 0.89).toArray())
      for (let a = 0; a < 360; a += 45) for (let alt = 0; alt < 88; alt += 4) az.push(...hzVec(alt, a, R * 0.89).toArray(), ...hzVec(alt + 4, a, R * 0.89).toArray())
      const hg = new THREE.BufferGeometry()
      hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3))
      st.scene.add(new THREE.LineSegments(hg, new THREE.LineBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.6 })))
      const ag = new THREE.BufferGeometry()
      ag.setAttribute('position', new THREE.Float32BufferAttribute(az, 3))
      const azGrid = new THREE.LineSegments(ag, new THREE.LineBasicMaterial({ color: 0x65a30d, transparent: true, opacity: 0.3 }))
      azGrid.name = 'azGrid'
      st.scene.add(azGrid)
      ;(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const).forEach((n, i) => {
        const sp = label(n, i % 2 ? '#86efac' : '#fbbf24', i % 2 ? 2.4 : 4)
        sp.position.copy(hzVec(2.5, i * 45, R * 0.85))
        st.scene.add(sp)
      })
      st.onFrame((_t, dt) => {
        mat.uniforms.scale.value = Math.min(2.2, Math.sqrt(70 / st.camera.fov)) * Math.min(2, devicePixelRatio)
        if (look.current) {
          const want = look.current.clone().normalize().multiplyScalar(-0.01)
          st.camera.position.lerp(want, Math.min(1, dt * 5))
          if (st.camera.position.distanceTo(want) < 0.0002) look.current = null
        }
      })
      return () => el.removeEventListener('wheel', wheel)
    },
    (st) => {
      const eq = st.scene.getObjectByName('eq') as THREE.Group
      const L = lst(t, s.lon) * RAD, p = s.lat * RAD
      const cL = Math.cos(L), sL = Math.sin(L), cp = Math.cos(p), sp = Math.sin(p)
      eq.matrix.set(-sL, cL, 0, 0, cp * cL, cp * sL, sp, 0, sp * cL, sp * sL, -cp, 0, 0, 0, 0, 1)
      eq.matrixWorldNeedsUpdate = true
      st.scene.background = skyColor(sunAlt)
      const starOp = Math.max(0.05, Math.min(1, (-sunAlt + 1) / 12))
      const pts = eq.getObjectByName('stars') as THREE.Points
      ;(pts.material as THREE.ShaderMaterial).uniforms.opacity.value = starOp
      pts.geometry.setDrawRange(0, stars().filter((x) => x.mag <= s.mag).length)
      eq.getObjectByName('lines')!.visible = s.lines
      eq.getObjectByName('eqGrid')!.visible = s.eqGrid
      st.scene.getObjectByName('azGrid')!.visible = s.azGrid
      const gm = (st.scene.getObjectByName('ground') as THREE.Mesh).material as THREE.MeshBasicMaterial
      gm.opacity = s.ground ? 1 : 0.55
      gm.color.set(sunAlt > -6 ? 0x1f3d2a : 0x0b1f14)
      for (const sp of (eq.getObjectByName('starLabels') as THREE.Group).children) sp.visible = s.names === 'all' || (s.names === 'bright' && sp.userData.mag < 1.6)
      const bg = eq.getObjectByName('bodies') as THREE.Group
      st.clear(bg)
      for (const b of objs) {
        const sun = b.name === 'Sun', moon = b.name === 'Moon'
        const tex = moon ? moonTexture(phase.frac, phase.ang) : disc(b.color, sun)
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }))
        const sz = sun ? 9 : moon ? 5 : Math.max(1.6, 3.2 - 0.35 * (b.mag + 2))
        sprite.scale.set(sz, sz, 1)
        sprite.position.copy(eqVec(b.eq, R * 0.96))
        bg.add(sprite)
        if (s.names !== 'none' && !sun) {
          const lb = label(b.name, b.color, 3.4)
          lb.position.copy(eqVec(b.eq, R * 0.95)).add(new THREE.Vector3(0, 0, -(sz / 2 + 1.4)))
          ;(lb.material as THREE.SpriteMaterial).depthTest = true
          bg.add(lb)
        }
      }
    },
    [t, s.lat, s.lon, s.lines, s.names, s.eqGrid, s.azGrid, s.ground, s.mag],
    { camera: [0, -0.0035, -0.01], target: [0, 0, 0], grid: false, background: '#02040b' },
  )

  const lookAt = (name: string) => {
    const b = objs.find((o) => o.name === name)
    if (!b) return
    const h = name === 'Moon' ? moonHz(t, s.lat, s.lon) : toHorizontal(b.eq, t, s.lat, s.lon)
    look.current = hzVec(Math.max(h.alt, 18), h.az, 1)
  }
  const face = (az: number) => (look.current = hzVec(20, az, 1))
  const useGeo = () => {
    setGeoErr('')
    if (!navigator.geolocation) return setGeoErr('Geolocation is not available in this browser.')
    navigator.geolocation.getCurrentPosition(
      (p) => set({ lat: Math.round(p.coords.latitude * 1e4) / 1e4, lon: Math.round(p.coords.longitude * 1e4) / 1e4, place: 'My location' }),
      (e) => setGeoErr(`Could not get your location (${e.message}). Pick a city instead.`),
      { timeout: 10000 },
    )
  }
  const dark = ev.astro.set !== null ? [ev.astro.set, ev.astro.rise] : ev.nautical.set !== null ? [ev.nautical.set, ev.nautical.rise] : null
  const sky = sunAlt > -0.833 ? '☀️ Daylight' : sunAlt > -6 ? '🌇 Civil twilight' : sunAlt > -12 ? '🌆 Nautical twilight' : sunAlt > -18 ? '🌌 Astronomical twilight' : '🌑 Full darkness'

  return (
    <Split wide="left">
      <div>
        <Panel title={`${s.place} · ${new Date(t).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`} actions={<span className="muted">{sky}</span>}>
          <View3D refEl={ref} height={480} />
          <Row>
            {[['N', 0], ['E', 90], ['S', 180], ['W', 270]].map(([n, a]) => <Btn key={n} onClick={() => face(a as number)}>Face {n}</Btn>)}
            <span className="muted" style={{ fontSize: 13 }}>Drag to look around · scroll to zoom</span>
          </Row>
          <div style={{ marginTop: 10 }}>
            <Slider label="Time" value={min} onChange={(v) => { setPlay(false); setMin(v) }} min={0} max={1440} step={5} show={(v) => hm(noon + v * 60000)} />
            <Row>
              <Txt type="date" label="Night of" value={date} onChange={(v) => v && setDate(v)} />
              <div style={{ alignSelf: 'end', display: 'flex', gap: 6, paddingBottom: 6, flexWrap: 'wrap' }}>
                <Btn onClick={() => setMin((m) => Math.max(0, m - 60))}>−1 h</Btn>
                <Btn kind={play ? 'primary' : 'normal'} onClick={() => setPlay(!play)}>{play ? '⏸ Pause' : '▶ Time-lapse'}</Btn>
                <Btn onClick={() => setMin((m) => Math.min(1440, m + 60))}>+1 h</Btn>
                <Btn onClick={() => { const d = new Date(); if (d.getHours() < 12) d.setDate(d.getDate() - 1); const ds = localDate(d); setDate(ds); setMin(Math.round((Date.now() - new Date(`${ds}T12:00:00`).getTime()) / 60000)) }}>Now</Btn>
              </div>
            </Row>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>Times are in your device’s time zone. Positions are accurate to a few arcminutes (planets: JPL approximate elements; Moon: main lunar terms).</p>
          </div>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Sunset" value={hm(ev.sun.set)} sub={`sunrise ${hm(ev.sun.rise)}`} />
          <Stat label="Dark sky" value={dark ? `${hm(dark[0])}–${hm(dark[1])}` : 'none'} sub={ev.astro.set !== null ? 'astronomical' : ev.nautical.set !== null ? 'nautical only' : 'twilight all night'} tone={dark ? 'good' : 'bad'} />
          <Stat label="Moon" value={`${Math.round(phase.frac * 100)}%`} sub={`${phase.name} · ${moonRS.map((x) => `${x.rising ? '↑' : '↓'}${hm(x.t)}`).join(' ') || 'up/down all night'}`} tone={phase.frac < 0.3 ? 'good' : undefined} />
        </Stats>
        <Panel title="Tonight’s planets">
          <Table
            head={['', 'Now', 'Best (dark)', 'Up in dark']}
            rows={plan.map(({ n, best }) => {
              const h = n === 'Moon' ? moonHz(t, s.lat, s.lon) : toHorizontal(objs.find((o) => o.name === n)!.eq, t, s.lat, s.lon)
              const vis = best.alt > 10
              return [
                <button key="b" type="button" className="k-btn ghost" onClick={() => lookAt(n)} style={{ fontWeight: 700, padding: '2px 6px' }} title="Look at it"><span style={{ color: PLANET_COLOR[n], textShadow: '0 0 1px #000' }}>●</span> {n}</button>,
                h.alt > 0 ? `${Math.round(h.alt)}° ${compass(h.az)}` : <span key="n" className="muted">below</span>,
                vis ? `${hm(best.t)} · ${Math.round(best.alt)}°` : <span key="v" className="muted">not visible</span>,
                vis ? `${best.hours.toFixed(1)} h` : '—',
              ]
            })}
          />
          <p className="muted" style={{ fontSize: 12 }}>“Dark” = Sun below −12°. “Up” = above 10°. Click a name to point the view at it. Uranus and Neptune need binoculars or a telescope.</p>
        </Panel>
        <Panel title="Location" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="City" value={CITIES.some((c) => c[0] === s.place) ? s.place : ''} onChange={(v) => { const c = CITIES.find((x) => x[0] === v); if (c) set({ place: c[0], lat: c[1], lon: c[2] }) }} options={[['', s.place === 'My location' ? 'My location' : 'Custom'] as [string, string], ...CITIES.map((c) => [c[0], c[0]] as [string, string])]} />
          <Row>
            <Num label="Latitude" value={s.lat} onChange={(lat) => set({ lat: Math.max(-89.9, Math.min(89.9, lat)), place: 'Custom' })} unit="°" min={-90} max={90} />
            <Num label="Longitude" value={s.lon} onChange={(lon) => set({ lon: Math.max(-180, Math.min(180, lon)), place: 'Custom' })} unit="°" min={-180} max={180} />
          </Row>
          <Btn onClick={useGeo}>📍 Use my location</Btn>
          {geoErr && <Note tone="warn">{geoErr}</Note>}
        </Panel>
        <Panel title="Display">
          <Check label="Constellation lines & names" value={s.lines} onChange={(lines) => set({ lines })} />
          <Check label="Alt-azimuth grid (30°, 60°)" value={s.azGrid} onChange={(azGrid) => set({ azGrid })} />
          <Check label="Equatorial grid (RA / Dec)" value={s.eqGrid} onChange={(eqGrid) => set({ eqGrid })} />
          <Check label="Solid ground (hide objects below horizon)" value={s.ground} onChange={(ground) => set({ ground })} />
          <Select label="Labels" value={s.names} onChange={(names) => set({ names })} options={[['bright', 'Brightest stars + planets'], ['all', 'All named stars + planets'], ['none', 'None']]} />
          <Slider label="Faintest stars" value={s.mag} onChange={(mag) => set({ mag })} min={1} max={4.5} step={0.5} show={(v) => `mag ${v}`} />
          <p className="muted" style={{ fontSize: 12 }}>{stars().filter((x) => x.mag <= s.mag).length} stars from the Yale Bright Star Catalogue. City skies show about mag 3; dark rural skies mag 6+.</p>
        </Panel>
      </div>
    </Split>
  )
}
