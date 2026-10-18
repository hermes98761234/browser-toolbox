import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, CsvButton, Legend, LineChart, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, color, niceTicks, num, useToolState } from '../kit'
import { bestAngle, PLANETS, PRESETS, simulate, terminalVelocity, type Flight, type Launch } from './lib/projectile-motion-simulator'

interface State extends Launch {
  preset: number
  planet: number
  speed: number
  pins: (Launch & { label: string })[]
}
const DEF: State = { v0: 45, angle: 35, h0: 1, mass: 0.145, diameter: 0.074, cd: 0.35, rho: 1.225, g: 9.80665, wind: 0, drag: true, preset: 0, planet: 0, speed: 1, pins: [] }

function draw(cv: HTMLCanvasElement, flights: { f: Flight; c: string; dash?: boolean }[], t: number, main: Flight) {
  const dpr = Math.min(2, devicePixelRatio || 1)
  const W = cv.clientWidth, H = cv.clientHeight
  cv.width = W * dpr
  cv.height = H * dpr
  const g = cv.getContext('2d')!
  g.scale(dpr, dpr)
  const css = getComputedStyle(cv)
  const fg = css.getPropertyValue('--text') || '#111'
  const muted = css.getPropertyValue('--muted') || '#888'
  const line = css.getPropertyValue('--line') || '#ddd'
  const xs = flights.flatMap((f) => f.f.path.map((p) => p.x))
  const ys = flights.flatMap((f) => f.f.path.map((p) => p.y))
  const xmax = Math.max(1, ...xs) * 1.05, ymax = Math.max(1, ...ys) * 1.15
  const xmin = Math.min(0, ...xs)
  const L = 50, R = 14, T = 14, B = 30
  // equal-ish scaling but keep everything visible
  const sx = (W - L - R) / (xmax - xmin), sy = (H - T - B) / ymax
  const k = Math.min(sx, sy * 3) // allow up to 3:1 vertical exaggeration on long flat shots
  const ky = Math.min(sy, k * 3)
  const X = (x: number) => L + (x - xmin) * k
  const Y = (y: number) => H - B - y * ky
  g.font = '11px system-ui, sans-serif'
  g.fillStyle = muted
  g.strokeStyle = line
  g.lineWidth = 1
  for (const v of niceTicks(0, (W - L - R) / k + xmin, 8)) {
    if (v < xmin) continue
    g.beginPath(); g.moveTo(X(v), T); g.lineTo(X(v), H - B); g.stroke()
    g.fillText(`${num(v, 0)} m`, X(v) - 12, H - B + 16)
  }
  for (const v of niceTicks(0, (H - T - B) / ky, 5)) {
    g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(W - R, Y(v)); g.stroke()
    g.fillText(`${num(v, 1)}`, 6, Y(v) + 4)
  }
  g.fillStyle = 'rgba(22,163,74,0.4)'
  g.fillRect(L, H - B, W - L - R, 4)
  for (const fl of flights) {
    g.strokeStyle = fl.c
    g.lineWidth = fl.dash ? 1.5 : 2.4
    g.setLineDash(fl.dash ? [6, 5] : [])
    g.beginPath()
    fl.f.path.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y))))
    g.stroke()
  }
  g.setLineDash([])
  // apex marker
  g.fillStyle = fg
  g.beginPath(); g.arc(X(main.apexX), Y(main.apex), 3, 0, 7); g.fill()
  g.fillText(`apex ${num(main.apex, 1)} m`, X(main.apexX) + 6, Y(main.apex) - 6)
  // moving ball
  const p = main.path.find((q) => q.t >= t) ?? main.path[main.path.length - 1]
  g.fillStyle = '#ef4444'
  g.beginPath(); g.arc(X(p.x), Y(p.y), 6, 0, 7); g.fill()
  const vs = 0.6
  g.strokeStyle = '#ef4444'
  g.lineWidth = 2
  g.beginPath(); g.moveTo(X(p.x), Y(p.y)); g.lineTo(X(p.x + p.vx * vs), Y(p.y + p.vy * vs)); g.stroke()
  g.fillStyle = fg
  g.fillText(`t = ${p.t.toFixed(2)} s   v = ${Math.hypot(p.vx, p.vy).toFixed(1)} m/s`, L + 8, T + 12)
}

export default function ProjectileMotionSimulator() {
  const [s, set, reset] = useToolState('projectile-motion-simulator', DEF)
  const cvRef = useRef<HTMLCanvasElement>(null)
  const [playKey, setPlayKey] = useState(0)
  const main = useMemo(() => simulate(s), [s])
  const vac = useMemo(() => simulate({ ...s, drag: false, wind: 0 }), [s])
  const pins = useMemo(() => s.pins.map((p) => simulate(p)), [s.pins])
  const best = useMemo(() => bestAngle(s), [s])

  useEffect(() => {
    const cv = cvRef.current
    if (!cv) return
    const flights = [...pins.map((f, i) => ({ f, c: color(i + 2) })), ...(s.drag ? [{ f: vac, c: '#94a3b8', dash: true }] : []), { f: main, c: '#6366f1' }]
    let raf = 0
    const t0 = performance.now()
    const tick = () => {
      const t = ((performance.now() - t0) / 1000) * s.speed
      draw(cv, flights, t, main)
      if (t < main.time + 0.5) raf = requestAnimationFrame(tick)
    }
    tick()
    const ro = new ResizeObserver(() => draw(cv, flights, main.time, main))
    ro.observe(cv)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [main, vac, pins, s.drag, s.speed, playKey])

  const speedSeries = [
    { name: 'speed (m/s)', points: main.path.map((p) => [p.t, Math.hypot(p.vx, p.vy)] as [number, number]) },
    { name: 'height (m)', points: main.path.map((p) => [p.t, p.y] as [number, number]) },
  ]

  return (
    <Split>
      <div>
        <Panel title="Projectile" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select
            label="Preset"
            value={s.preset}
            onChange={(i) => set({ preset: i, ...(i >= 0 ? { mass: PRESETS[i].mass, diameter: PRESETS[i].diameter, cd: PRESETS[i].cd, v0: PRESETS[i].v0 } : {}) })}
            options={[...PRESETS.map((p, i) => [i, p.name] as [number, string]), [-1, 'Custom']]}
          />
          <Row>
            <Num label="Mass" value={s.mass} onChange={(mass) => set({ mass, preset: -1 })} unit="kg" min={0.0001} />
            <Num label="Diameter" value={s.diameter} onChange={(diameter) => set({ diameter, preset: -1 })} unit="m" min={0} />
            <Num label="Drag coefficient Cd" value={s.cd} onChange={(cd) => set({ cd, preset: -1 })} min={0} step={0.01} hint="sphere ≈ 0.47, dimpled golf ball ≈ 0.25" />
          </Row>
        </Panel>
        <Panel title="Launch">
          <Slider label="Speed" value={s.v0} onChange={(v0) => set({ v0 })} min={1} max={300} step={0.5} unit=" m/s" />
          <Slider label="Angle" value={s.angle} onChange={(angle) => set({ angle })} min={-30} max={90} step={0.5} unit="°" />
          <Row>
            <Num label="Launch height" value={s.h0} onChange={(h0) => set({ h0: Math.max(0, h0) })} unit="m" min={0} />
            <Num label="Wind (+ tail)" value={s.wind} onChange={(wind) => set({ wind })} unit="m/s" />
          </Row>
          <Btn onClick={() => set({ angle: +best.toFixed(1) })}>Use optimal angle ({num(best, 1)}°)</Btn>
        </Panel>
        <Panel title="Environment">
          <Select
            label="World"
            value={s.planet}
            onChange={(i) => set({ planet: i, ...(i >= 0 ? { g: PLANETS[i][1], rho: PLANETS[i][2] } : {}) })}
            options={[...PLANETS.map((p, i) => [i, p[0]] as [number, string]), [-1, 'Custom']]}
          />
          <Row>
            <Num label="Gravity g" value={s.g} onChange={(g) => set({ g, planet: -1 })} unit="m/s²" min={0.01} />
            <Num label="Air density ρ" value={s.rho} onChange={(rho) => set({ rho, planet: -1 })} unit="kg/m³" min={0} />
          </Row>
          <Check label="Air drag (quadratic, F = ½ρCdAv²)" value={s.drag} onChange={(drag) => set({ drag })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Range" value={`${num(main.range, 1)} m`} sub={s.drag ? `vacuum: ${num(vac.range, 1)} m` : undefined} tone="accent" />
          <Stat label="Max height" value={`${num(main.apex, 2)} m`} sub={`at x = ${num(main.apexX, 1)} m`} />
          <Stat label="Flight time" value={`${num(main.time, 2)} s`} />
          <Stat label="Impact" value={`${num(main.impactSpeed, 1)} m/s`} sub={`${num(main.impactAngle, 1)}° below horizontal`} />
        </Stats>
        <Panel
          title="Trajectory"
          actions={
            <>
              <Btn onClick={() => setPlayKey(playKey + 1)}>▶ Replay</Btn>
              <Select label="" value={s.speed} onChange={(speed) => set({ speed })} options={[[0.25, '¼×'], [0.5, '½×'], [1, '1× real time'], [2, '2×'], [5, '5×']]} />
              <Btn onClick={() => set({ pins: [...s.pins.slice(-4), { ...s, label: `${num(s.v0, 0)} m/s @ ${num(s.angle, 1)}°${s.drag ? '' : ' (no drag)'}` }] })}>📌 Pin</Btn>
            </>
          }
        >
          <canvas ref={cvRef} style={{ width: '100%', height: 340, display: 'block' }} />
          <Legend items={[['current', '#6366f1'], ...(s.drag ? [['vacuum (no drag)', '#94a3b8'] as [string, string]] : []), ...s.pins.map((p, i) => [p.label, color(i + 2)] as [string, string])]} />
          {s.pins.length > 0 && <Btn kind="ghost" onClick={() => set({ pins: [] })}>Clear pins</Btn>}
        </Panel>
        <Panel title="Speed and height over time" actions={<CsvButton name="trajectory.csv" rows={() => [['t (s)', 'x (m)', 'y (m)', 'vx (m/s)', 'vy (m/s)'], ...main.path.map((p) => [p.t.toFixed(3), p.x.toFixed(3), p.y.toFixed(3), p.vx.toFixed(3), p.vy.toFixed(3)])]} />}>
          <LineChart series={speedSeries} xLabel="time (s)" fx={(v) => num(v, 1)} fy={(v) => num(v, 0)} height={200} />
        </Panel>
        <Panel title="Comparison">
          <Table
            head={['Shot', 'Range', 'Apex', 'Time', 'Impact speed']}
            rows={[
              ['Current', `${num(main.range, 1)} m`, `${num(main.apex, 1)} m`, `${num(main.time, 2)} s`, `${num(main.impactSpeed, 1)} m/s`],
              ...(s.drag ? [['Same, no drag', `${num(vac.range, 1)} m`, `${num(vac.apex, 1)} m`, `${num(vac.time, 2)} s`, `${num(vac.impactSpeed, 1)} m/s`]] : []),
              ...pins.map((f, i) => [s.pins[i].label, `${num(f.range, 1)} m`, `${num(f.apex, 1)} m`, `${num(f.time, 2)} s`, `${num(f.impactSpeed, 1)} m/s`]),
            ]}
          />
          {s.drag && s.rho > 0 && <Note>Terminal velocity of this object: <b>{num(terminalVelocity(s), 1)} m/s</b>. Drag removed {num((1 - main.range / vac.range) * 100, 0)} % of the vacuum range. Integrated with 4th-order Runge–Kutta (2 ms steps).</Note>}
        </Panel>
      </div>
    </Split>
  )
}
