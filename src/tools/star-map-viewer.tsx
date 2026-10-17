import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { THREE, label, useStage3D } from '../kit/three'
import { PLANETS, altOf, bodies, bvColor, compass, constellations, crossings, lst, moonPhase, stars, toHorizontal, type Eq } from './lib/night-sky-planner'
import { catalogue, formatDec, formatRA, nearestConstellation, search, type SkyObject } from './lib/star-map-viewer'

const CITIES: [string, number, number][] = [
  ['London', 51.507, -0.128], ['Kyiv', 50.45, 30.523], ['Berlin', 52.52, 13.405], ['Paris', 48.857, 2.352], ['Madrid', 40.417, -3.704], ['New York', 40.713, -74.006],
  ['Chicago', 41.878, -87.63], ['Denver', 39.739, -104.99], ['Los Angeles', 34.052, -118.244], ['São Paulo', -23.551, -46.633], ['Cape Town', -33.925, 18.424],
  ['Mumbai', 19.076, 72.878], ['Tokyo', 35.676, 139.65], ['Sydney', -33.869, 151.209], ['Auckland', -36.848, 174.763],
]
interface State { place: string; lat: number; lon: number; lines: boolean; starNames: boolean; conNames: boolean; grid: boolean; ground: boolean; mag: number; red: boolean; azFix: number }
const DEF: State = { place: 'London', lat: 51.507, lon: -0.128, lines: true, starNames: true, conNames: true, grid: false, ground: true, mag: 4.5, red: false, azFix: 0 }
const R = 100
const RAD = Math.PI / 180
const CAT = stars()
const LIST = catalogue()
type Sensor = 'off' | 'on' | 'denied' | 'none'
type DOE = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }

const eqUnit = (e: Eq) => new THREE.Vector3(Math.cos(e.dec * RAD) * Math.cos(e.ra * RAD), Math.cos(e.dec * RAD) * Math.sin(e.ra * RAD), Math.sin(e.dec * RAD))
const hzVec = (alt: number, az: number, r = R) => new THREE.Vector3(r * Math.cos(alt * RAD) * Math.sin(az * RAD), r * Math.sin(alt * RAD), -r * Math.cos(alt * RAD) * Math.cos(az * RAD))
const hm = (t: number, ref?: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) + (ref !== undefined && new Date(t).toDateString() !== new Date(ref).toDateString() ? ' (next day)' : '')
const localInput = (t: number) => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16) }

function dot(color: string, ring = false) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  if (ring) {
    g.strokeStyle = color
    g.lineWidth = 5
    g.beginPath()
    g.arc(32, 32, 26, 0, Math.PI * 2)
    g.stroke()
  } else {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grd.addColorStop(0, color)
    grd.addColorStop(0.4, color)
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 64, 64)
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }))
  return sp
}

export default function StarMapViewer() {
  const [s, set, reset] = useToolState('star-map-viewer', DEF)
  const [t, setT] = useState(() => Date.now())
  const [live, setLive] = useState(true)
  const [sensor, setSensor] = useState<Sensor>('off')
  const [sel, setSel] = useState<SkyObject | null>(null)
  const [q, setQ] = useState('')
  const [hud, setHud] = useState({ alt: 30, az: 180, fov: 70, aim: '' })
  const [geoMsg, setGeoMsg] = useState('')
  const view = useRef({ yaw: 180, pitch: 30, fov: 70, goal: null as null | { yaw: number; pitch: number } })
  const dev = useRef({ q: new THREE.Quaternion(), have: false })
  const devOn = sensor === 'on'
  const devRef = useRef(devOn)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    devRef.current = devOn
  }, [devOn])
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => setT(Date.now()), 15000)
    return () => clearInterval(id)
  }, [live])

  const objs = useMemo(() => bodies(t).map((b): SkyObject => ({ key: `b${b.name}`, name: b.name, kind: b.name === 'Moon' ? 'moon' : b.name === 'Sun' ? 'sun' : 'planet', eq: b.eq, mag: b.mag })), [t])
  const sunAlt = altOf('Sun', t, s.lat, s.lon)
  const all = useMemo(() => [...objs, ...LIST], [objs])
  const results = search(all, q)
  const hz = (e: Eq) => toHorizontal(e, t, s.lat, s.lon)
  const selNow = sel ? (sel.kind === 'star' || sel.kind === 'constellation' ? sel : objs.find((o) => o.key === sel.key) ?? sel) : null

  const goTo = (o: SkyObject) => {
    setSel(o)
    setQ('')
    const h = hz(o.eq)
    view.current.goal = { yaw: h.az, pitch: Math.max(-30, Math.min(85, h.alt)) }
  }

  // ---------- device orientation ----------
  const startSensor = async () => {
    const D = (window as unknown as { DeviceOrientationEvent?: DOE }).DeviceOrientationEvent
    if (!D) return setSensor('none')
    try {
      if (typeof D.requestPermission === 'function' && (await D.requestPermission()) !== 'granted') return setSensor('denied')
    } catch {
      return setSensor('denied')
    }
    setSensor('on')
  }
  useEffect(() => {
    if (!devOn) return
    const euler = new THREE.Euler(), q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)), zee = new THREE.Vector3(0, 0, 1), yee = new THREE.Vector3(0, 1, 0)
    const target = new THREE.Quaternion()
    const absolute = 'ondeviceorientationabsolute' in window
    const h = (e: DeviceOrientationEvent) => {
      const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
      if (e.alpha === null || e.beta === null || e.gamma === null) return
      const alpha = typeof ios === 'number' ? 360 - ios : e.alpha
      euler.set(e.beta * RAD, alpha * RAD, -e.gamma * RAD, 'YXZ')
      target.setFromEuler(euler).multiply(q1).multiply(q0.setFromAxisAngle(zee, -((screen.orientation?.angle ?? 0) * RAD)))
      target.premultiply(new THREE.Quaternion().setFromAxisAngle(yee, -s.azFix * RAD))
      if (!dev.current.have) dev.current.q.copy(target)
      else dev.current.q.slerp(target, 0.35)
      dev.current.have = true
    }
    const ev = absolute ? 'deviceorientationabsolute' : 'deviceorientation'
    window.addEventListener(ev, h as EventListener)
    const to = setTimeout(() => { if (!dev.current.have) setSensor('none') }, 2500)
    const d = dev.current
    return () => {
      window.removeEventListener(ev, h as EventListener)
      clearTimeout(to)
      d.have = false
    }
  }, [devOn, s.azFix])

  // ---------- 3D ----------
  const pickList = useRef<SkyObject[]>([])
  const ref = useStage3D(
    (st) => {
      st.controls.enabled = false
      ;(st.controls as unknown as { update: () => boolean }).update = () => false
      st.camera.position.set(0, 0, 0)
      const el = st.renderer.domElement
      el.style.touchAction = 'none'
      const eq = new THREE.Group()
      eq.name = 'eq'
      eq.matrixAutoUpdate = false
      st.scene.add(eq)
      const pos = new Float32Array(CAT.length * 3), col = new Float32Array(CAT.length * 3), size = new Float32Array(CAT.length)
      CAT.forEach((x, i) => {
        eqUnit(x).multiplyScalar(R).toArray(pos, i * 3)
        col.set(bvColor(x.bv), i * 3)
        size[i] = Math.max(2, 11 - 1.6 * (x.mag + 1.5))
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
      const lp: number[] = []
      for (const c of constellations()) for (const pl of c.lines) for (let i = 1; i < pl.length; i++) lp.push(...eqUnit(pl[i - 1]).multiplyScalar(R * 0.995).toArray(), ...eqUnit(pl[i]).multiplyScalar(R * 0.995).toArray())
      const lg = new THREE.BufferGeometry()
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3))
      const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x5b7bb5, transparent: true, opacity: 0.6 }))
      lines.name = 'lines'
      eq.add(lines)
      const conL = new THREE.Group()
      conL.name = 'conNames'
      for (const o of LIST) if (o.kind === 'constellation') {
        const sp = label(o.name.toUpperCase(), '#7c93c4', 3.2)
        sp.position.copy(eqUnit(o.eq).multiplyScalar(R * 0.97))
        conL.add(sp)
      }
      eq.add(conL)
      const starL = new THREE.Group()
      starL.name = 'starNames'
      CAT.forEach((x) => {
        if (!x.name) return
        const sp = label(x.name, '#e2e8f0', 3)
        sp.position.copy(eqUnit(x).multiplyScalar(R * 0.98)).add(new THREE.Vector3(0, 0, -1.4))
        sp.center.set(-0.08, 0.5)
        sp.userData.mag = x.mag
        starL.add(sp)
      })
      eq.add(starL)
      const bodiesG = new THREE.Group()
      bodiesG.name = 'bodies'
      eq.add(bodiesG)
      const marker = dot('#facc15', true)
      marker.name = 'marker'
      marker.scale.set(6, 6, 1)
      marker.visible = false
      eq.add(marker)
      // horizon frame
      const ground = new THREE.Mesh(new THREE.SphereGeometry(R * 0.9, 48, 24, 0, Math.PI * 2, Math.PI / 2 + 0.002, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b1f14, side: THREE.BackSide, transparent: true, opacity: 0.88 }))
      ground.name = 'ground'
      st.scene.add(ground)
      const hp: number[] = [], gp: number[] = []
      for (let a = 0; a < 360; a += 3) hp.push(...hzVec(0, a, R * 0.89).toArray(), ...hzVec(0, a + 3, R * 0.89).toArray())
      for (const alt of [30, 60]) for (let a = 0; a < 360; a += 3) gp.push(...hzVec(alt, a, R * 0.89).toArray(), ...hzVec(alt, a + 3, R * 0.89).toArray())
      for (let a = 0; a < 360; a += 30) for (let alt = 0; alt < 88; alt += 4) gp.push(...hzVec(alt, a, R * 0.89).toArray(), ...hzVec(alt + 4, a, R * 0.89).toArray())
      const mk = (arr: number[], color: number, op: number, name: string) => {
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
        const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op }))
        l.name = name
        st.scene.add(l)
      }
      mk(hp, 0x4ade80, 0.7, 'horizon')
      mk(gp, 0x65a30d, 0.35, 'grid')
      ;['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].forEach((n, i) => {
        const sp = label(n, i % 2 ? '#86efac' : '#fbbf24', i % 2 ? 2.4 : 4)
        sp.position.copy(hzVec(2.5, i * 45, R * 0.85))
        st.scene.add(sp)
      })

      // pointer: drag to look around, pinch / wheel to zoom, tap to identify
      const ptrs = new Map<number, { x: number; y: number }>()
      let down = { x: 0, y: 0, moved: 0 }, pinch = 0
      const onDown = (e: PointerEvent) => {
        el.setPointerCapture(e.pointerId)
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
        down = { x: e.clientX, y: e.clientY, moved: 0 }
        if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y) }
      }
      const onMove = (e: PointerEvent) => {
        const p = ptrs.get(e.pointerId)
        if (!p) return
        const v = view.current
        if (ptrs.size === 2) {
          ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
          const [a, b] = [...ptrs.values()]
          const d = Math.hypot(a.x - b.x, a.y - b.y)
          if (pinch > 0) v.fov = Math.max(10, Math.min(110, v.fov * (pinch / d)))
          pinch = d
          down.moved = 99
          return
        }
        const dx = e.clientX - p.x, dy = e.clientY - p.y
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
        down.moved += Math.abs(dx) + Math.abs(dy)
        if (devRef.current) return
        const k = v.fov / (el.clientHeight || 400)
        v.yaw = (v.yaw - dx * k + 360) % 360
        v.pitch = Math.max(-89, Math.min(89, v.pitch + dy * k))
        v.goal = null
      }
      const onUp = (e: PointerEvent) => {
        ptrs.delete(e.pointerId)
        if (down.moved > 6 || ptrs.size) return
        const r = el.getBoundingClientRect()
        pick(e.clientX - r.left, e.clientY - r.top, r.width, r.height)
      }
      const pick = (x: number, y: number, w: number, h: number) => {
        eq.updateMatrixWorld()
        const cands: SkyObject[] = [...pickList.current]
        let best: { o: SkyObject; d: number } | null = null
        const v = new THREE.Vector3()
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(st.camera.quaternion)
        for (const o of cands) {
          v.copy(eqUnit(o.eq)).applyMatrix4(eq.matrixWorld)
          if (v.dot(fwd) <= 0) continue
          v.project(st.camera)
          const px = (v.x + 1) / 2 * w, py = (1 - v.y) / 2 * h
          const d = Math.hypot(px - x, py - y) + (o.kind === 'constellation' ? 14 : Math.max(-8, o.mag) * 1.5)
          if (Math.hypot(px - x, py - y) < 28 && (!best || d < best.d)) best = { o, d }
        }
        if (best) setSel(best.o)
      }
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        view.current.fov = Math.max(10, Math.min(110, view.current.fov * (e.deltaY > 0 ? 1.1 : 0.9)))
      }
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onUp)
      el.addEventListener('pointercancel', onUp)
      el.addEventListener('wheel', onWheel, { passive: false })

      const fwd = new THREE.Vector3()
      let acc = 0
      st.onFrame((_t, dt) => {
        const v = view.current
        if (v.goal && !devRef.current) {
          let dy = ((v.goal.yaw - v.yaw + 540) % 360) - 180
          const dp = v.goal.pitch - v.pitch
          const k = Math.min(1, dt * 4)
          v.yaw = (v.yaw + dy * k + 360) % 360
          v.pitch += dp * k
          dy = Math.abs(dy)
          if (dy < 0.05 && Math.abs(dp) < 0.05) v.goal = null
        }
        if (devRef.current && dev.current.have) st.camera.quaternion.copy(dev.current.q)
        else st.camera.quaternion.setFromEuler(new THREE.Euler(v.pitch * RAD, -v.yaw * RAD, 0, 'YXZ'))
        if (Math.abs(st.camera.fov - v.fov) > 0.01) {
          st.camera.fov = v.fov
          st.camera.updateProjectionMatrix()
        }
        mat.uniforms.scale.value = 1.35 * Math.min(2.4, Math.sqrt(70 / v.fov)) * Math.min(2, devicePixelRatio)
        acc += dt
        if (acc > 0.15) {
          acc = 0
          fwd.set(0, 0, -1).applyQuaternion(st.camera.quaternion)
          if (devRef.current) {
            v.pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y))) / RAD
            v.yaw = ((Math.atan2(fwd.x, -fwd.z) / RAD) + 360) % 360
          }
          // what is in the crosshair?
          const inv = new THREE.Matrix4().copy(eq.matrix).invert()
          const d = fwd.clone().applyMatrix4(inv).normalize()
          let aim = '', bd = 2.5 * RAD
          for (const o of pickList.current) {
            if (o.kind === 'constellation') continue
            const a = Math.acos(Math.max(-1, Math.min(1, eqUnit(o.eq).dot(d))))
            if (a < bd) { bd = a; aim = o.name }
          }
          if (!aim) aim = 'in ' + nearestConstellation({ ra: ((Math.atan2(d.y, d.x) / RAD) + 360) % 360, dec: Math.asin(d.z) / RAD }).name
          setHud({ alt: v.pitch, az: v.yaw, fov: v.fov, aim })
        }
      })
      return () => {
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onUp)
        el.removeEventListener('pointercancel', onUp)
        el.removeEventListener('wheel', onWheel)
      }
    },
    (st) => {
      const eq = st.scene.getObjectByName('eq') as THREE.Group
      const L = lst(t, s.lon) * RAD, p = s.lat * RAD
      const cL = Math.cos(L), sL = Math.sin(L), cp = Math.cos(p), sp = Math.sin(p)
      eq.matrix.set(-sL, cL, 0, 0, cp * cL, cp * sL, sp, 0, sp * cL, sp * sL, -cp, 0, 0, 0, 0, 1)
      eq.matrixWorldNeedsUpdate = true
      const night = Math.max(0, Math.min(1, (-sunAlt - 0) / 12))
      st.scene.background = new THREE.Color('#02040b').lerp(new THREE.Color('#4f7cc0'), 1 - night)
      const pts = eq.getObjectByName('stars') as THREE.Points
      const m = pts.material as THREE.ShaderMaterial
      m.uniforms.opacity.value = Math.max(0.08, night)
      const sizes = pts.geometry.getAttribute('size') as THREE.BufferAttribute
      CAT.forEach((x, i) => sizes.setX(i, x.mag <= s.mag ? Math.max(2, 11 - 1.6 * (x.mag + 1.5)) : 0))
      sizes.needsUpdate = true
      eq.getObjectByName('lines')!.visible = s.lines
      eq.getObjectByName('conNames')!.visible = s.conNames
      const sn = eq.getObjectByName('starNames')!
      sn.visible = s.starNames
      sn.children.forEach((c) => (c.visible = (c.userData.mag as number) <= Math.min(s.mag, 2.6)))
      st.scene.getObjectByName('grid')!.visible = s.grid
      st.scene.getObjectByName('ground')!.visible = s.ground
      const bg = eq.getObjectByName('bodies') as THREE.Group
      st.clear(bg)
      for (const b of bodies(t)) {
        const sp = dot(b.color)
        const big = b.name === 'Sun' || b.name === 'Moon'
        sp.scale.setScalar(big ? 5 : 2.2)
        sp.position.copy(eqUnit(b.eq).multiplyScalar(R * 0.96))
        bg.add(sp)
        const lb = label(b.name === 'Moon' ? `Moon · ${moonPhase(t).name}` : b.name, b.color, 3.2)
        lb.center.set(-0.15, 0.5)
        lb.position.copy(sp.position)
        bg.add(lb)
      }
      const mk = eq.getObjectByName('marker') as THREE.Sprite
      mk.visible = !!selNow
      if (selNow) mk.position.copy(eqUnit(selNow.eq).multiplyScalar(R * 0.95))
    },
    [t, s.lat, s.lon, s.mag, s.lines, s.conNames, s.starNames, s.grid, s.ground, sunAlt, selNow?.key, selNow?.eq.ra],
    { background: '#02040b', grid: false, camera: [0, 0, 0] },
  )
  useEffect(() => {
    pickList.current = [...objs, ...CAT.map((x, i): SkyObject => ({ key: `s${i}`, name: x.name ?? '', kind: 'star', eq: { ra: x.ra, dec: x.dec }, mag: x.mag })).filter((o) => o.mag <= s.mag), ...LIST.filter((o) => o.kind === 'constellation')]
  }, [objs, s.mag])

  // selected object details
  const info = useMemo(() => {
    if (!selNow) return null
    const h = toHorizontal(selNow.eq, t, s.lat, s.lon)
    const altF = (x: number) => (selNow.kind === 'star' || selNow.kind === 'constellation' ? toHorizontal(selNow.eq, x, s.lat, s.lon).alt : altOf(selNow.name, x, s.lat, s.lon))
    const cr = crossings(altF, selNow.kind === 'sun' || selNow.kind === 'moon' ? -0.833 : -0.5667, t, t + 86400000, 900000)
    let top = { t, alt: -90 }
    for (let x = t; x <= t + 86400000; x += 600000) { const a = altF(x); if (a > top.alt) top = { t: x, alt: a } }
    return { h, rise: cr.find((c) => c.rising)?.t ?? null, set: cr.find((c) => !c.rising)?.t ?? null, top, con: nearestConstellation(selNow.eq).name }
  }, [selNow, t, s.lat, s.lon])

  const visible = useMemo(() => [...objs.filter((o) => o.kind !== 'sun'), ...LIST.filter((o) => o.kind === 'star')]
    .map((o) => ({ o, h: toHorizontal(o.eq, t, s.lat, s.lon) })).filter((x) => x.h.alt > 5).sort((a, b) => a.o.mag - b.o.mag).slice(0, 12), [objs, t, s.lat, s.lon])

  // guidance in phone mode: which way to turn to find the selection
  let guide = ''
  if (devOn && info) {
    const daz = ((info.h.az - hud.az + 540) % 360) - 180, dalt = info.h.alt - hud.alt
    guide = Math.abs(daz) < 3 && Math.abs(dalt) < 3 ? `🎯 ${selNow!.name} is in the crosshair` : `${Math.abs(daz) >= 3 ? `${daz > 0 ? '→ right' : '← left'} ${Math.abs(daz).toFixed(0)}°` : ''} ${Math.abs(dalt) >= 3 ? `${dalt > 0 ? '↑ up' : '↓ down'} ${Math.abs(dalt).toFixed(0)}°` : ''}`
  }

  const kindLabel = (o: SkyObject) => (o.kind === 'star' ? 'Star' : o.kind === 'planet' ? 'Planet' : o.kind === 'moon' ? 'Moon' : o.kind === 'sun' ? 'Sun' : 'Constellation')

  return (
    <div style={s.red ? { filter: 'grayscale(1) sepia(1) saturate(8) hue-rotate(-40deg) brightness(0.75)' } : undefined}>
      <Split wide="left">
        <div>
          <div ref={wrap} style={{ position: 'relative', background: '#02040b', borderRadius: 12, overflow: 'hidden' }}>
            <div ref={ref} className="k-3d" style={{ height: 'min(70vh, 560px)', minHeight: 360 }} />
            <div style={{ position: 'absolute', left: '50%', top: '50%', width: 34, height: 34, margin: -17, border: '2px solid rgba(250,204,21,.8)', borderRadius: '50%', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', left: 10, top: 8, color: '#e2e8f0', fontSize: 13, textShadow: '0 1px 2px #000', pointerEvents: 'none', lineHeight: 1.5 }}>
              <b>{compass(hud.az)} {hud.az.toFixed(0)}°</b> · alt {hud.alt.toFixed(0)}° · fov {hud.fov.toFixed(0)}°<br />
              <span style={{ color: '#facc15' }}>⌖ {hud.aim}</span>
            </div>
            {guide && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 52, textAlign: 'center', color: '#fde68a', fontWeight: 800, fontSize: 20, textShadow: '0 1px 3px #000', pointerEvents: 'none' }}>{guide}</div>}
            <div style={{ position: 'absolute', right: 8, bottom: 8, display: 'flex', gap: 6 }}>
              <Btn onClick={() => (view.current.fov = Math.max(10, view.current.fov * 0.8))} title="Zoom in">＋</Btn>
              <Btn onClick={() => (view.current.fov = Math.min(110, view.current.fov * 1.25))} title="Zoom out">－</Btn>
              <Btn onClick={() => { void wrap.current?.requestFullscreen?.() }} title="Full screen">⛶</Btn>
            </div>
            <div style={{ position: 'absolute', left: 8, bottom: 8 }}>
              {devOn ? <Btn kind="primary" onClick={() => setSensor('off')}>✋ Drag mode</Btn> : <Btn kind="primary" onClick={startSensor}>📱 Point at the sky</Btn>}
            </div>
          </div>
          {sensor === 'denied' && <Note tone="err">Motion sensor access was denied. On iPhone allow Motion &amp; Orientation access for this site and try again.</Note>}
          {sensor === 'none' && <Note tone="warn">No orientation sensor found (desktop?). Drag the sky to look around, scroll or pinch to zoom, tap a star to identify it.</Note>}
          {devOn && <Note>Hold the phone up and look “through” it. If the view is rotated relative to the real sky, correct the compass below (metal and magnets nearby disturb it).</Note>}
          <Panel title="Find an object">
            <input className="k-text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stars, planets, constellations… e.g. Vega, Jupiter, Orion" aria-label="Search sky objects" style={{ width: '100%' }} onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) goTo(results[0]) }} />
            {results.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {results.map((o) => { const h = hz(o.eq); return <Btn key={o.key} onClick={() => goTo(o)}>{o.name} <span className="muted">{kindLabel(o)} · {h.alt > 0 ? `${h.alt.toFixed(0)}° up` : 'below horizon'}</span></Btn> })}
              </div>
            )}
          </Panel>
        </div>
        <div>
          {selNow && info ? (
            <Panel title={`${selNow.name || 'Unnamed star'}`} actions={<><Btn onClick={() => goTo(selNow)}>Center</Btn><Btn kind="ghost" onClick={() => setSel(null)}>✕</Btn></>}>
              <p className="muted" style={{ marginTop: 0 }}>{kindLabel(selNow)}{selNow.kind !== 'constellation' ? ` in ${info.con}` : ''}{selNow.kind === 'moon' ? ` · ${moonPhase(t).name}, ${Math.round(moonPhase(t).frac * 100)}% lit` : ''}</p>
              <Stats>
                <Stat label="Altitude" value={`${info.h.alt.toFixed(1)}°`} tone={info.h.alt > 0 ? 'good' : 'bad'} sub={info.h.alt > 0 ? 'above horizon' : 'below horizon'} />
                <Stat label="Azimuth" value={`${info.h.az.toFixed(1)}°`} sub={compass(info.h.az)} />
                {selNow.kind !== 'constellation' && <Stat label="Magnitude" value={selNow.mag.toFixed(1)} sub={selNow.mag < 1.5 ? 'very bright' : selNow.mag < 3 ? 'easy naked-eye' : 'needs dark sky'} />}
              </Stats>
              <Table head={['', '']} rows={[
                ['Right ascension', formatRA(selNow.eq.ra)], ['Declination', formatDec(selNow.eq.dec)],
                ['Next rise', info.rise ? hm(info.rise, t) : info.h.alt > 0 ? 'never sets (circumpolar)' : 'does not rise'],
                ['Highest', `${hm(info.top.t, t)} at ${info.top.alt.toFixed(0)}°`], ['Next set', info.set ? hm(info.set, t) : '—'],
              ]} />
            </Panel>
          ) : (
            <Note>Tap any star or planet in the sky to identify it, or search by name.</Note>
          )}
          <Panel title="Time & place">
            <Row>
              <label className="k-field"><span className="k-label">Date & time</span><input className="k-text" type="datetime-local" value={localInput(t)} onChange={(e) => { const v = new Date(e.target.value).getTime(); if (Number.isFinite(v)) { setT(v); setLive(false) } }} /></label>
            </Row>
            <Row>
              <Btn onClick={() => { setT(t - 3600000); setLive(false) }}>−1 h</Btn>
              <Btn onClick={() => { setT(t + 3600000); setLive(false) }}>+1 h</Btn>
              <Btn kind={live ? 'primary' : 'normal'} onClick={() => { setT(Date.now()); setLive(true) }}>Now{live ? ' (live)' : ''}</Btn>
            </Row>
            {sunAlt > -6 && <Note tone="warn">The Sun is {sunAlt > 0 ? 'up' : 'just below the horizon'} ({sunAlt.toFixed(0)}°): stars are faded. Try a later time.</Note>}
            <Select label="City" value={s.place} onChange={(place) => { const c = CITIES.find((x) => x[0] === place); if (c) set({ place, lat: c[1], lon: c[2] }) }} options={[...CITIES.map((c) => c[0]), ...(CITIES.some((c) => c[0] === s.place) ? [] : [s.place])]} />
            <Row>
              <Num label="Latitude" value={s.lat} min={-90} max={90} onChange={(lat) => set({ lat, place: 'Custom' })} />
              <Num label="Longitude" value={s.lon} min={-180} max={180} onChange={(lon) => set({ lon, place: 'Custom' })} />
            </Row>
            <Btn onClick={() => { setGeoMsg('Locating…'); navigator.geolocation?.getCurrentPosition((p) => { set({ lat: Math.round(p.coords.latitude * 1000) / 1000, lon: Math.round(p.coords.longitude * 1000) / 1000, place: 'My location' }); setGeoMsg('') }, () => setGeoMsg('Location unavailable.')) }}>📍 Use my location</Btn> <span className="muted">{geoMsg}</span>
          </Panel>
          <Panel title="Display">
            <Check label="Constellation lines" value={s.lines} onChange={(lines) => set({ lines })} />
            <Check label="Constellation names" value={s.conNames} onChange={(conNames) => set({ conNames })} />
            <Check label="Bright star names" value={s.starNames} onChange={(starNames) => set({ starNames })} />
            <Check label="Alt-azimuth grid" value={s.grid} onChange={(grid) => set({ grid })} />
            <Check label="Ground (hide below horizon)" value={s.ground} onChange={(ground) => set({ ground })} />
            <Check label="Red night-vision mode" value={s.red} onChange={(red) => set({ red })} />
            <Slider label="Faintest stars" value={s.mag} min={1} max={4.5} step={0.5} show={(v) => `mag ${v}`} onChange={(mag) => set({ mag })} />
            <Slider label="Compass correction (phone mode)" value={s.azFix} min={-45} max={45} unit="°" onChange={(azFix) => set({ azFix })} />
            <Btn kind="ghost" onClick={reset}>Reset settings</Btn>
          </Panel>
          <Panel title="Brightest objects up now">
            <Table head={['Object', 'Mag', 'Where']} rows={visible.map(({ o, h }) => [<a key="n" href="#" onClick={(e) => { e.preventDefault(); goTo(o) }}>{o.name}</a>, o.mag.toFixed(1), `${compass(h.az)} · ${h.alt.toFixed(0)}° up`])} />
            <p className="muted" style={{ fontSize: 12 }}>{CAT.length} stars to magnitude 4.5 (Yale Bright Star Catalogue via d3-celestial, BSD-3-Clause) · planets from JPL Keplerian elements · {PLANETS.length} planets.</p>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
