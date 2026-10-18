import { useMemo, useState } from 'react'
import { BarChart, Btn, Check, CsvButton, LineChart, money, Note, Num, Panel, pct, Row, Seg, Select, Slider, Split, Stat, Stats, num, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { calibrate, DEFAULT_SYS, fitPanels, instant, seasonalTemps, simulate, type System } from './lib/solar-panel-estimator'

// [name, lat, lon, clearness, mean °C, seasonal half-range °C]
const CITIES: [string, number, number, number, number, number][] = [
  ['Phoenix, US', 33.45, -112.07, 0.92, 24, 10],
  ['Los Angeles, US', 34.05, -118.24, 0.86, 18.5, 4.5],
  ['Denver, US', 39.74, -104.99, 0.82, 10.5, 11],
  ['Miami, US', 25.76, -80.19, 0.78, 25, 4],
  ['New York, US', 40.71, -74.01, 0.66, 13, 12],
  ['Toronto, CA', 43.65, -79.38, 0.6, 9, 13],
  ['Madrid, ES', 40.42, -3.7, 0.83, 15, 10],
  ['London, UK', 51.51, -0.13, 0.46, 11.5, 7],
  ['Berlin, DE', 52.52, 13.4, 0.53, 10, 9.5],
  ['Kyiv, UA', 50.45, 30.52, 0.55, 8.5, 12],
  ['Cape Town, ZA', -33.92, 18.42, 0.8, 17, 4.5],
  ['Sydney, AU', -33.87, 151.21, 0.75, 18, 5],
]
const CLIMATES: [string, number][] = [['Desert, almost always clear', 0.92], ['Sunny', 0.82], ['Mixed sun and cloud', 0.68], ['Often cloudy', 0.55], ['Cloudy maritime', 0.46]]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const AZ: [string, string][] = [['90', 'E'], ['135', 'SE'], ['180', 'S'], ['225', 'SW'], ['270', 'W'], ['0', 'N']]

interface State {
  city: string
  lat: number
  lon: number
  clear: number[]
  temp: number[]
  source: string
  roofW: number
  roofL: number
  pitch: number
  azimuth: number
  setback: number
  watt: number
  pw: number
  ph: number
  portrait: boolean
  maxPanels: number
  losses: number
  price: number
  costW: number
  incentive: number
  usage: number
  doy: number
  hour: number
}

const c0 = CITIES[2]
const DEF: State = {
  city: c0[0], lat: c0[1], lon: c0[2], clear: Array(12).fill(c0[3]), temp: seasonalTemps(c0[4], c0[5], c0[1]).map((t) => Math.round(t * 10) / 10), source: 'climate preset',
  roofW: 10, roofL: 5.2, pitch: 30, azimuth: 180, setback: 0.4, watt: 410, pw: 1.13, ph: 1.72, portrait: true, maxPanels: 0,
  losses: 14, price: 0.17, costW: 2.8, incentive: 0, usage: 9000, doy: 172, hour: 10.5,
}

const SC = 0.6 // scene units per metre
const dir = (el: number, az: number) => new THREE.Vector3(Math.cos(el * Math.PI / 180) * Math.sin(az * Math.PI / 180), Math.sin(el * Math.PI / 180), -Math.cos(el * Math.PI / 180) * Math.cos(az * Math.PI / 180))

export default function SolarPanelEstimator() {
  const [s, set, reset] = useToolState('solar-panel-estimator', DEF)
  const [busy, setBusy] = useState('')
  const fit = fitPanels(s.roofW, s.roofL, s.pw, s.ph, s.portrait, s.setback)
  const count = s.maxPanels > 0 ? Math.min(fit.count, Math.round(s.maxPanels)) : fit.count
  const kWp = (count * s.watt) / 1000
  const sys: System = { ...DEFAULT_SYS, lat: s.lat, lon: s.lon, tilt: s.pitch, azimuth: s.azimuth, kWp, clear: s.clear, temp: s.temp, losses: s.losses / 100 }
  const { lat, lon, pitch, azimuth, clear, temp, losses } = s
  const y = useMemo(
    () => simulate({ ...DEFAULT_SYS, lat, lon, tilt: pitch, azimuth, kWp, clear, temp, losses: losses / 100 }, 30),
    [lat, lon, pitch, azimuth, kWp, clear, temp, losses],
  )
  const dayStart = Date.UTC(2025, 0, s.doy)
  const toMs = (solarHour: number) => dayStart + (solarHour - s.lon / 15) * 3600000
  const now = instant(sys, toMs(s.hour))
  const profile: [number, number][] = []
  for (let h = 0; h <= 24; h += 0.25) profile.push([h, instant(sys, toMs(h)).ac / 1000])
  const dayKWh = profile.reduce((a, [, v]) => a + v * 0.25, 0)
  const gross = kWp * 1000 * s.costW
  const net = gross * (1 - s.incentive / 100)
  const save = Math.min(y.annualKWh, s.usage) * s.price + Math.max(0, y.annualKWh - s.usage) * s.price * 0.3
  const payback = save > 0 ? net / save : Infinity

  const fetchIrr = async () => {
    const yr = new Date().getFullYear() - 1
    setBusy('Contacting archive-api.open-meteo.com…')
    try {
      const u = `https://archive-api.open-meteo.com/v1/archive?latitude=${s.lat.toFixed(3)}&longitude=${s.lon.toFixed(3)}&start_date=${yr}-01-01&end_date=${yr}-12-31&daily=shortwave_radiation_sum,temperature_2m_mean&timezone=GMT`
      const r = await fetch(u)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = (await r.json()) as { daily?: { time: string[]; shortwave_radiation_sum: (number | null)[]; temperature_2m_mean: (number | null)[] } }
      const d = j.daily
      if (!d) throw new Error('no data')
      const g = Array(12).fill(0), t = Array(12).fill(0), n = Array(12).fill(0)
      d.time.forEach((day, i) => {
        const m = Number(day.slice(5, 7)) - 1
        const sw = d.shortwave_radiation_sum[i], tm = d.temperature_2m_mean[i]
        if (sw === null || tm === null) return
        g[m] += sw / 3.6 // MJ/m² → kWh/m²
        t[m] += tm
        n[m]++
      })
      setBusy('Calibrating the model month by month…')
      await new Promise((res) => setTimeout(res, 20))
      const clear = g.map((v, m) => (n[m] ? Math.min(1.1, calibrate(s.lat, s.lon, m, v / n[m])) : s.clear[m]))
      const temp = t.map((v, m) => (n[m] ? Math.round((v / n[m]) * 10) / 10 : s.temp[m]))
      set({ clear, temp, source: `Open-Meteo measured ${yr} (GHI ${num(g.reduce((a, b) => a + b, 0), 0)} kWh/m²)` })
      setBusy('')
    } catch (e) {
      setBusy(`Could not fetch irradiance (${(e as Error).message}). The climate preset is still used.`)
    }
  }

  const ref = useStage3D(
    (st: Stage3D) => {
      for (const o of st.scene.children) if (o instanceof THREE.DirectionalLight) o.intensity = 0.35
      const g = new THREE.Group()
      g.name = 'world'
      st.scene.add(g)
      const sunLight = new THREE.DirectionalLight(0xfff3c4, 1.8)
      sunLight.name = 'sunlight'
      st.scene.add(sunLight)
    },
    (st: Stage3D) => {
      const world = st.scene.getObjectByName('world')!
      st.clear(world)
      const pitch = (s.pitch * Math.PI) / 180
      const W = s.roofW * SC, L = s.roofL * SC
      const D = 2 * L * Math.cos(pitch), H = L * Math.sin(pitch), wallH = 2.7 * SC
      const house = new THREE.Group()
      house.rotation.y = Math.PI - (s.azimuth * Math.PI) / 180
      const wall = new THREE.Mesh(new THREE.BoxGeometry(W, wallH, D), new THREE.MeshStandardMaterial({ color: 0xe7e5e4 }))
      wall.position.y = wallH / 2
      house.add(wall)
      const tri = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, H)])
      const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: W * 0.999, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0xd6d3d1 }))
      gable.rotation.y = Math.PI / 2
      gable.position.set(-W / 2, wallH, 0)
      house.add(gable)
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.8 })
      const slope = (sign: 1 | -1) => {
        const r = new THREE.Group()
        r.position.set(0, wallH, (sign * D) / 2)
        r.rotation.x = sign * pitch
        const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.08, L + 0.05), roofMat)
        slab.position.set(0, 0.04, (-sign * L) / 2)
        r.add(slab)
        house.add(r)
        return r
      }
      const sunSide = slope(1)
      slope(-1)
      const pw = fit.pw * SC, ph = fit.ph * SC, gap = 0.02 * SC
      const arrW = fit.cols * (pw + gap) - gap
      const panelMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.4, roughness: 0.25, emissive: 0x0b1a40 })
      const frameMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.6 })
      for (let i = 0; i < count; i++) {
        const c = i % Math.max(1, fit.cols), rr = Math.floor(i / Math.max(1, fit.cols))
        const x = -arrW / 2 + pw / 2 + c * (pw + gap)
        const z = -(s.setback * SC + ph / 2 + rr * (ph + gap))
        const frame = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.05, ph), frameMat)
        frame.position.set(x, 0.1, z)
        const cell = new THREE.Mesh(new THREE.BoxGeometry(pw * 0.94, 0.06, ph * 0.95), panelMat)
        cell.position.set(x, 0.11, z)
        sunSide.add(frame, cell)
      }
      world.add(house)
      const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0x3f6212 }))
      ground.rotation.x = -Math.PI / 2
      ground.position.y = -0.01
      world.add(ground)
      // compass labels
      for (const [t, az] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]] as const) {
        const l = label(t, '#f8fafc', 0.6)
        l.position.copy(dir(0, az).multiplyScalar(11)).setY(0.4)
        world.add(l)
      }
      // sun path for the chosen day + sun
      const pts: THREE.Vector3[] = []
      for (let h = 0; h <= 24; h += 0.25) {
        const p = instant(sys, dayStart + (h - s.lon / 15) * 3600000)
        if (p.el > -2) pts.push(dir(p.el, p.az).multiplyScalar(8))
      }
      if (pts.length > 1) world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xfacc15 })))
      const sp = dir(now.el, now.az).multiplyScalar(8)
      const sun = new THREE.Mesh(new THREE.SphereGeometry(0.45, 24, 16), new THREE.MeshBasicMaterial({ color: now.el > 0 ? 0xfde047 : 0x64748b }))
      sun.position.copy(sp)
      world.add(sun)
      const light = st.scene.getObjectByName('sunlight') as THREE.DirectionalLight
      light.position.copy(sp)
      light.intensity = now.el > 0 ? 1.8 : 0.1
    },
    [s.roofW, s.roofL, s.pitch, s.azimuth, s.setback, s.pw, s.ph, s.portrait, count, s.doy, s.hour, s.lat, s.lon],
    { camera: [11, 9, 14], target: [0, 2.2, 0], background: '#0c1a2e', grid: false },
  )

  const pickCity = (name: string) => {
    const c = CITIES.find((x) => x[0] === name)
    if (c) set({ city: c[0], lat: c[1], lon: c[2], clear: Array(12).fill(c[3]), temp: seasonalTemps(c[4], c[5], c[1]).map((t) => Math.round(t * 10) / 10), source: 'climate preset' })
  }
  const avgClear = s.clear.reduce((a, b) => a + b, 0) / 12
  const dateLabel = new Date(dayStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const hh = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

  return (
    <Split wide="right">
      <div>
        <Panel title="Location & climate">
          <Select label="City preset" value={CITIES.some((c) => c[0] === s.city) ? s.city : ''} onChange={pickCity} options={[['', 'Custom location'], ...CITIES.map((c) => [c[0], c[0]] as [string, string])]} />
          <Row>
            <Num label="Latitude" value={s.lat} min={-66} max={66} onChange={(lat) => Math.abs(lat) <= 66 && set({ lat, city: '' })} unit="°" />
            <Num label="Longitude" value={s.lon} min={-180} max={180} onChange={(lon) => Math.abs(lon) <= 180 && set({ lon, city: '' })} unit="°E" />
          </Row>
          <Select
            label="Typical sky"
            value={CLIMATES.find(([, c]) => s.clear.every((x) => x === c))?.[0] ?? 'custom'}
            onChange={(n) => { const c = CLIMATES.find((x) => x[0] === n); if (c) set({ clear: Array(12).fill(c[1]), source: 'climate preset' }) }}
            options={[['custom', s.source.startsWith('Open') ? 'Measured (monthly)' : 'City preset / custom'], ...CLIMATES.map(([n]) => [n, n] as [string, string])]}
          />
          <p className="muted" style={{ fontSize: 13, margin: '4px 0' }}>Average clearness {pct(avgClear, 0)} · source: {s.source}</p>
          <Btn onClick={() => void fetchIrr()}>☁ Fetch last year's measured sunlight</Btn>
          <p className="muted" style={{ fontSize: 12 }}>Optional: sends only the coordinates to Open-Meteo's free archive API (archive-api.open-meteo.com), then calibrates the model to last year's monthly solar radiation and temperatures. Nothing is sent unless you press the button.</p>
          {busy && <Note tone={busy.startsWith('Could') ? 'warn' : 'info'}>{busy}</Note>}
        </Panel>
        <Panel title="Roof plane">
          <Row>
            <Num label="Roof width (along eave)" value={s.roofW} unit="m" min={1} onChange={(roofW) => roofW >= 1 && roofW <= 40 && set({ roofW })} />
            <Num label="Slope length (eave → ridge)" value={s.roofL} unit="m" min={1} onChange={(roofL) => roofL >= 1 && roofL <= 20 && set({ roofL })} />
          </Row>
          <Slider label="Pitch" value={s.pitch} min={0} max={60} unit="°" onChange={(pitch) => set({ pitch })} />
          <Slider label="Facing (azimuth)" value={s.azimuth} min={0} max={359} step={1} unit="°" onChange={(azimuth) => set({ azimuth })} />
          <Seg value={AZ.find(([a]) => +a === s.azimuth)?.[0] ?? ''} onChange={(a) => set({ azimuth: +a })} options={AZ} label="Facing" />
          <Num label="Edge setback (fire code / wind)" value={s.setback} unit="m" min={0} onChange={(setback) => setback >= 0 && set({ setback })} />
        </Panel>
        <Panel title="Panels & system">
          <Row>
            <Num label="Panel power" value={s.watt} unit="W" min={50} onChange={(watt) => watt > 0 && set({ watt })} />
            <Num label="Width" value={s.pw} unit="m" min={0.3} onChange={(pw) => pw > 0.2 && set({ pw })} />
            <Num label="Height" value={s.ph} unit="m" min={0.3} onChange={(ph) => ph > 0.2 && set({ ph })} />
          </Row>
          <Row>
            <Check label="Portrait orientation" value={s.portrait} onChange={(portrait) => set({ portrait })} />
            <Num label="Limit panels (0 = fill roof)" value={s.maxPanels} min={0} step={1} onChange={(maxPanels) => maxPanels >= 0 && set({ maxPanels })} />
          </Row>
          <Num label="System losses" value={s.losses} unit="%" min={0} max={50} onChange={(losses) => losses >= 0 && losses <= 50 && set({ losses })} hint="Wiring, soiling, mismatch, availability. 14 % is a common default; inverter (96 %) and heat are modelled separately." />
        </Panel>
        <Panel title="Money">
          <Row>
            <Num label="Electricity price" value={s.price} unit="/kWh" min={0} onChange={(price) => set({ price })} />
            <Num label="Installed cost" value={s.costW} unit="/W" min={0} onChange={(costW) => set({ costW })} />
          </Row>
          <Row>
            <Num label="Incentives / tax credit" value={s.incentive} unit="%" min={0} max={100} onChange={(incentive) => set({ incentive })} />
            <Num label="Your annual use" value={s.usage} unit="kWh" min={0} onChange={(usage) => set({ usage })} />
          </Row>
          <p className="muted" style={{ fontSize: 12 }}>Exported surplus is valued at 30 % of the retail price (a rough net-billing assumption).</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Panels" value={count} sub={`${fit.cols} × ${fit.rows} fit · ${num(count * fit.pw * fit.ph, 1)} m²`} />
          <Stat label="System size" value={`${num(kWp, 2)} kWp`} />
          <Stat label="Yearly output (est.)" value={`${num(y.annualKWh, 0)} kWh`} sub={`${num(y.specific, 0)} kWh per kWp`} tone="accent" />
          <Stat label="Covers" value={pct(y.annualKWh / (s.usage || 1), 0)} sub="of your annual use" tone={y.annualKWh >= s.usage ? 'good' : undefined} />
          <Stat label="Saves per year" value={money(save, '$', 0)} sub={`net cost ${money(net, '$', 0)}`} />
          <Stat label="Simple payback" value={Number.isFinite(payback) ? `${num(payback, 1)} yr` : '—'} sub={`CO₂ avoided ≈ ${num(y.annualKWh * 0.4 / 1000, 1)} t/yr`} tone={payback < 10 ? 'good' : payback > 20 ? 'bad' : undefined} />
        </Stats>
        <Panel title="Roof model & sun">
          <View3D refEl={ref} height={360} />
          <Row>
            <div style={{ flex: 1, minWidth: 200 }}><Slider label="Day" value={s.doy} min={1} max={365} show={() => dateLabel} onChange={(doy) => set({ doy })} /></div>
            <div style={{ flex: 1, minWidth: 200 }}><Slider label="Solar time" value={s.hour} min={4} max={20} step={0.25} show={hh} onChange={(hour) => set({ hour })} /></div>
          </Row>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Sun {num(now.el, 1)}° high at {num(now.az, 0)}° · plane-of-array {num(now.poa, 0)} W/m² (clear-sky × {pct(s.clear[new Date(dayStart).getUTCMonth()], 0)}) · output {num(now.ac / 1000, 2)} kW · cell ≈ {num(now.cell, 0)} °C
          </p>
        </Panel>
        <Panel title="Monthly production (estimate)" actions={<CsvButton name="solar-estimate.csv" rows={() => [['Month', 'kWh', 'POA kWh/m2', 'Clearness', 'Temp C'], ...MONTHS.map((m, i) => [m, Math.round(y.monthlyKWh[i]), Math.round(y.monthlyPOA[i]), s.clear[i], s.temp[i]])]} />}>
          <BarChart bars={MONTHS.map((m, i) => ({ label: m, value: Math.round(y.monthlyKWh[i]) }))} fy={(v) => `${num(v, 0)}`} height={220} />
        </Panel>
        <Panel title={`Output on ${dateLabel} · ${num(dayKWh, 1)} kWh`}>
          <LineChart series={[{ name: 'AC power', points: profile, area: true, color: '#f59e0b' }]} xMin={4} xMax={20} fx={(v) => `${v}h`} fy={(v) => `${num(v, 1)} kW`} xLabel="local solar time" height={200} markers={[{ x: s.hour, label: 'now' }]} />
        </Panel>
        <Row><Btn kind="ghost" onClick={reset}>Reset</Btn></Row>
        <Note tone="warn">
          This is an <b>estimate</b> from a simplified model (clear-sky sun geometry × typical cloudiness, isotropic diffuse light, temperature and system losses). It ignores shading from trees, chimneys and neighbours, snow, and panel degradation (~0.5 %/yr). Real yearly output usually lands within ±10–15 %; get a site survey before buying.
        </Note>
      </div>
    </Split>
  )
}
