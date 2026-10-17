import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react'
import { Btn, Check, Note, Num, Panel, Row, Slider, Split, Table, useToolState } from '../kit'
import { compass } from './lib/night-sky-planner'
import { lookDirection, nearestConstellation } from './lib/star-map-viewer'
import { angleTo, arrowAngle, guidance, identify, projector, skyNow, type Look, type Thing } from './lib/sky-pointer'

type DOE = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> }
const DEF = { lat: 40.71, lon: -74.01, mag: 2.5, fov: 70, night: false, offset: 0, target: '' }
const KIND_ICON: Record<Thing['kind'], string> = { star: '★', planet: '🪐', moon: '🌙', sun: '☀️' }

export default function SkyPointer() {
  const [s, set, reset] = useToolState('sky-pointer', DEF)
  const [now, setNow] = useState(() => Date.now())
  const [look, setLook] = useState<Look>({ az: 180, alt: 35 })
  const [sensor, setSensor] = useState<'off' | 'on' | 'none' | 'denied'>('off')
  const [demo, setDemo] = useState(false)
  const [geoMsg, setGeoMsg] = useState('')
  const cv = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ x: number; y: number; look: Look } | null>(null)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(id)
  }, [])
  const ms = now + s.offset * 3600000
  const list = useMemo(() => skyNow(ms, s.lat, s.lon, s.mag), [ms, s.lat, s.lon, s.mag])
  const up = useMemo(() => list.filter((t) => t.alt > 0 && t.kind !== 'sun').sort((a, b) => a.mag - b.mag), [list])
  const sun = list.find((t) => t.kind === 'sun')
  const hit = identify(list, look, Math.max(4, s.fov / 8))
  const target = list.find((t) => t.key === s.target)
  const con = hit ? nearestConstellation(hit.eq) : null

  // First load: aim near the brightest thing that is up, so the identifier has something to show.
  const aimed = useRef(false)
  useEffect(() => {
    if (aimed.current || !up.length) return
    aimed.current = true
    const b = up.find((t) => t.alt > 8) ?? up[0]
    setLook({ az: (b.az + 3) % 360, alt: Math.max(5, b.alt - 2) })
  }, [up])

  // ---------- sensors ----------
  const startSensor = async () => {
    setDemo(false)
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
    if (sensor !== 'on') return
    let have = false
    const sm = { x: 0, y: 0, z: 0 }
    const absolute = 'ondeviceorientationabsolute' in window
    const h = (e: DeviceOrientationEvent) => {
      if (e.alpha === null || e.beta === null || e.gamma === null) return
      const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
      const d = lookDirection(typeof ios === 'number' ? 360 - ios : e.alpha, e.beta, e.gamma)
      // smooth as a unit vector (avoids the 359°→0° jump)
      const v = { x: Math.cos((d.alt * Math.PI) / 180) * Math.sin((d.az * Math.PI) / 180), y: Math.cos((d.alt * Math.PI) / 180) * Math.cos((d.az * Math.PI) / 180), z: Math.sin((d.alt * Math.PI) / 180) }
      const k = have ? 0.25 : 1
      sm.x += (v.x - sm.x) * k; sm.y += (v.y - sm.y) * k; sm.z += (v.z - sm.z) * k
      have = true
      setLook({ az: ((Math.atan2(sm.x, sm.y) * 180) / Math.PI + 360) % 360, alt: (Math.atan2(sm.z, Math.hypot(sm.x, sm.y)) * 180) / Math.PI })
    }
    const ev = absolute ? 'deviceorientationabsolute' : 'deviceorientation'
    window.addEventListener(ev, h as EventListener)
    const to = setTimeout(() => { if (!have) setSensor('none') }, 2500)
    return () => { window.removeEventListener(ev, h as EventListener); clearTimeout(to) }
  }, [sensor])

  // ---------- demo: glide from one bright object to the next ----------
  useEffect(() => {
    if (!demo || !up.length) return
    let i = 0, raf = 0, t0 = performance.now()
    let from = look
    const tour = up.slice(0, 8)
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / 2200)
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      const to = tour[i % tour.length]
      const dAz = ((to.az - from.az + 540) % 360) - 180
      setLook({ az: (from.az + dAz * e + 360) % 360, alt: from.alt + (to.alt - from.alt) * e })
      if (performance.now() - t0 > 3400) { from = { az: to.az, alt: to.alt }; i++; t0 = performance.now() }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, up])

  // ---------- drawing ----------
  useEffect(() => {
    const c = cv.current
    const g = c?.getContext('2d')
    if (!c || !g) return
    const W = (c.width = c.clientWidth * Math.min(2, devicePixelRatio))
    const H = (c.height = c.clientHeight * Math.min(2, devicePixelRatio))
    const px = W / 2 / Math.tan(((s.fov / 2) * Math.PI) / 180)
    const P = projector(look)
    const S = (az: number, alt: number) => { const p = P(az, alt); return p ? [W / 2 + p[0] * px, H / 2 - p[1] * px] as const : null }
    const sky = g.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#020617')
    sky.addColorStop(1, sun && sun.alt > -6 ? '#1e3a8a' : '#0b1736')
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)
    // alt/az grid
    g.strokeStyle = 'rgba(148,163,184,.15)'
    g.lineWidth = 1
    for (let alt = 0; alt <= 80; alt += 20) {
      g.beginPath()
      let pen = false
      for (let az = look.az - 100; az <= look.az + 100; az += 2) { const p = S(az, alt); if (p) { if (pen) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); pen = true } else pen = false }
      g.stroke()
    }
    // ground below the horizon
    const hz: (readonly [number, number])[] = []
    for (let az = look.az - 88; az <= look.az + 88; az += 2) { const p = S(az, 0); if (p) hz.push(p) }
    if (hz.length > 1) {
      g.beginPath()
      g.moveTo(hz[0][0], hz[0][1])
      hz.forEach((p) => g.lineTo(p[0], p[1]))
      g.lineTo(hz[hz.length - 1][0], H * 4); g.lineTo(hz[0][0], H * 4); g.closePath()
      g.fillStyle = '#052e16'
      g.fill()
      g.strokeStyle = '#4ade80'
      g.stroke()
    }
    g.font = `${Math.round(13 * (W / c.clientWidth))}px system-ui, sans-serif`
    g.textAlign = 'center'
    for (let az = 0; az < 360; az += 45) { const p = S(az, 0); if (p) { g.fillStyle = '#86efac'; g.fillText(compass(az), p[0], p[1] + 18 * (W / c.clientWidth)) } }
    // objects
    const dpr = W / c.clientWidth
    for (const t of [...list].sort((a, b) => b.mag - a.mag)) {
      if (t.kind === 'sun' && t.alt < -1) continue
      const p = S(t.az, t.alt)
      if (!p || p[0] < -20 || p[0] > W + 20 || p[1] < -20 || p[1] > H + 20) continue
      const r = (t.kind === 'moon' ? 12 : t.kind === 'sun' ? 14 : Math.max(1.4, 4.2 - t.mag * 0.9)) * dpr
      g.fillStyle = t.color
      g.shadowColor = t.color
      g.shadowBlur = t.kind === 'planet' || t.mag < 0.5 ? 10 * dpr : 0
      g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.fill()
      g.shadowBlur = 0
      if (t.mag < 1.6 || t.kind !== 'star') { g.fillStyle = t.alt < 0 ? 'rgba(226,232,240,.4)' : '#e2e8f0'; g.textAlign = 'left'; g.fillText(t.name, p[0] + r + 4 * dpr, p[1] + 4 * dpr) }
    }
    // reticle
    const rr = Math.tan((Math.max(4, s.fov / 8) * Math.PI) / 180) * px
    g.strokeStyle = hit ? '#facc15' : 'rgba(248,250,252,.7)'
    g.lineWidth = 2 * dpr
    g.beginPath(); g.arc(W / 2, H / 2, rr, 0, Math.PI * 2); g.stroke()
    g.beginPath(); g.moveTo(W / 2 - rr - 10 * dpr, H / 2); g.lineTo(W / 2 - rr + 6 * dpr, H / 2); g.moveTo(W / 2 + rr - 6 * dpr, H / 2); g.lineTo(W / 2 + rr + 10 * dpr, H / 2); g.stroke()
    // arrow towards the chosen target
    if (target && angleTo(look, target) > Math.max(4, s.fov / 8)) {
      const a = arrowAngle(look, target)
      const R = Math.min(W, H) * 0.36
      const x = W / 2 + Math.cos(a) * R, y = H / 2 - Math.sin(a) * R
      g.save(); g.translate(x, y); g.rotate(-a)
      g.fillStyle = '#f472b6'
      g.beginPath(); g.moveTo(22 * dpr, 0); g.lineTo(-10 * dpr, -13 * dpr); g.lineTo(-4 * dpr, 0); g.lineTo(-10 * dpr, 13 * dpr); g.closePath(); g.fill()
      g.restore()
      g.fillStyle = '#f9a8d4'; g.textAlign = 'center'
      g.fillText(target.name, x, y + (Math.sin(a) > 0 ? 34 : -26) * dpr)
    }
    g.fillStyle = 'rgba(226,232,240,.8)'; g.textAlign = 'left'
    g.fillText(`Az ${look.az.toFixed(0)}° ${compass(look.az)} · Alt ${look.alt.toFixed(0)}°`, 10 * dpr, 20 * dpr)
  }, [look, list, s.fov, hit, target, sun])

  // ---------- manual aiming ----------
  const down = (e: RPE<HTMLCanvasElement>) => {
    setDemo(false)
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, look }
  }
  const move = (e: RPE<HTMLCanvasElement>) => {
    const d = drag.current
    if (!d || sensor === 'on') return
    const k = s.fov / e.currentTarget.clientWidth
    setLook({ az: (d.look.az - (e.clientX - d.x) * k + 720) % 360, alt: Math.max(-10, Math.min(90, d.look.alt + (e.clientY - d.y) * k)) })
  }

  const locate = () => {
    if (!navigator.geolocation) return setGeoMsg('Geolocation is not available.')
    setGeoMsg('Locating…')
    navigator.geolocation.getCurrentPosition(
      (p) => { set({ lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }); setGeoMsg('Location set ✓') },
      () => setGeoMsg('Location denied — enter it manually.'),
      { timeout: 10000 },
    )
  }
  const g = target ? guidance(look, target) : null
  const timeStr = new Date(ms).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={s.night ? { filter: 'grayscale(1) sepia(1) saturate(6) hue-rotate(-45deg) brightness(0.75)', background: '#000', borderRadius: 12, padding: 8 } : undefined}>
      <Split wide="left">
        <Panel title="Point at the sky" actions={<Check label="🔴 Night mode" value={s.night} onChange={(night) => set({ night })} />}>
          <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)} style={{ width: '100%', height: 420, display: 'block', borderRadius: 10, touchAction: 'none', cursor: sensor === 'on' ? 'default' : 'grab' }} />
          <div style={{ margin: '10px 0', padding: 12, borderRadius: 10, border: '1px solid var(--line)', minHeight: 66 }}>
            {hit ? (
              <>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{KIND_ICON[hit.kind]} {hit.name}</div>
                <div className="muted">
                  {hit.kind === 'planet' ? 'Planet' : hit.kind === 'moon' ? 'The Moon' : 'Star'} · magnitude {hit.mag.toFixed(1)} · {hit.alt.toFixed(0)}° high in the {compass(hit.az)}
                  {con && hit.kind === 'star' && con.dist < 3 ? ` · in ${con.name}` : hit.kind === 'planet' && con ? ` · currently in ${con.name}` : ''}
                </div>
              </>
            ) : <div className="muted">Nothing bright inside the circle. Move the phone (or drag the sky) towards a light — or pick a target below and follow the pink arrow.</div>}
            {g && target && <div style={{ marginTop: 6 }}>🎯 <b>{target.name}</b>: {g.text}{target.alt < 0 && ' (below the horizon now)'}</div>}
          </div>
          <Row>
            {sensor === 'on' ? <Btn kind="danger" onClick={() => setSensor('off')}>Stop sensors</Btn> : <Btn kind="primary" onClick={() => void startSensor()}>📱 Use phone sensors</Btn>}
            <Btn onClick={() => { setSensor('off'); setDemo((d) => !d) }}>{demo ? '■ Stop tour' : '▶ Demo tour'}</Btn>
            {target && <Btn kind="ghost" onClick={() => set({ target: '' })}>Clear target</Btn>}
          </Row>
          {sensor === 'none' && <Note tone="warn">No orientation sensor found (desktop?). Drag the sky to aim, or run the demo tour.</Note>}
          {sensor === 'denied' && <Note tone="err">Motion-sensor permission was denied. Allow it in the browser settings, or drag to aim.</Note>}
          {sensor === 'on' && <p className="muted" style={{ fontSize: 12 }}>Hold the phone upright with the back camera towards the sky. Compasses drift near metal and cars — wave the phone in a figure-8 to recalibrate.</p>}
        </Panel>
        <div>
          <Panel title={`Bright objects up now (${up.length})`} actions={<span className="muted" style={{ fontSize: 12 }}>{timeStr}</span>}>
            {sun && sun.alt > -6 && <Note tone="warn">The Sun is {sun.alt > 0 ? 'up' : 'just below the horizon'} — only the Moon and Venus are easy to see. Try the time slider for tonight. Never point optics at the Sun.</Note>}
            <Table
              head={['', 'Object', 'Mag', 'Where']}
              rows={up.slice(0, 14).map((t) => [
                <span key="i">{KIND_ICON[t.kind]}</span>,
                <button key="n" type="button" className={`k-btn ${s.target === t.key ? 'primary' : 'ghost'}`} style={{ padding: '2px 8px' }} onClick={() => set({ target: t.key })}>{t.name}</button>,
                t.mag.toFixed(1),
                `${compass(t.az)} ${t.alt.toFixed(0)}° up`,
              ])}
            />
            <p className="muted" style={{ fontSize: 12 }}>Tap a name to get arrows to it. Lower magnitude = brighter (Venus ≈ −4, Sirius −1.5, Polaris 2).</p>
          </Panel>
          <Panel title="Where & when" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Row>
              <Num label="Latitude" value={s.lat} min={-90} max={90} step={0.01} unit="°" onChange={(lat) => set({ lat })} />
              <Num label="Longitude" value={s.lon} min={-180} max={180} step={0.01} unit="°" onChange={(lon) => set({ lon })} />
            </Row>
            <Row><Btn onClick={locate}>📍 Use my location</Btn>{geoMsg && <span className="muted">{geoMsg}</span>}</Row>
            <Slider label="Time shift" value={s.offset} min={-12} max={12} step={0.25} onChange={(offset) => set({ offset })} show={(v) => (v === 0 ? 'now' : `${v > 0 ? '+' : ''}${v} h`)} />
            <Row>
              <Slider label="Faintest shown" value={s.mag} min={0} max={3.5} step={0.1} onChange={(mag) => set({ mag })} show={(v) => `mag ${v.toFixed(1)}`} />
              <Slider label="Field of view" value={s.fov} min={30} max={100} step={5} unit="°" onChange={(fov) => set({ fov })} />
            </Row>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
