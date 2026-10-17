import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, CopyButton, Donut, FileDrop, money, Note, num, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { analyze, estimate, fmtDuration, MATERIALS } from './lib/print-cost-estimator'
import { parseStl, sampleCube, sampleTorus, sampleVase } from './lib/stl-viewer'

const SAMPLES: Record<string, () => Float32Array> = {
  'Twisted vase (80 mm)': sampleVase,
  'Torus ring (80 mm)': () => sampleTorus(30, 10, 64, 32),
  'Calibration cube (20 mm)': () => sampleCube(20),
}
const DEF = {
  sample: 'Twisted vase (80 mm)', scale: 100, material: 'PLA', density: 1.24, filamentPerKg: 20, diameter: 1.75,
  layer: 0.2, line: 0.45, walls: 3, topBottom: 4, infill: 15, supports: true, supportDensity: 15,
  speed: 60, power: 150, kwh: 0.18, wearPerHour: 0.3, laborPerJob: 0, failure: 5, markup: 0, copies: 1, currency: '$',
}

/** Flat-shaded painter's-algorithm preview of the mesh, isometric-ish view. */
function Preview({ pos }: { pos: Float32Array }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const W = cv.clientWidth || 400, H = 260
    const dpr = Math.min(2, devicePixelRatio)
    cv.width = W * dpr
    cv.height = H * dpr
    const g = cv.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, W, H)
    const n = pos.length / 9
    const step = Math.max(1, Math.ceil(n / 60000))
    const ca = Math.cos(-0.7), sa = Math.sin(-0.7), cb = Math.cos(1.0), sb = Math.sin(1.0)
    // rotate about Z then tilt about X: screen x, y (up), depth
    const pr = (x: number, y: number, z: number) => {
      const x1 = x * ca - y * sa, y1 = x * sa + y * ca
      return [-x1, z * sb - y1 * cb, z * cb + y1 * sb] // depth grows toward the viewer
    }
    const tris: { p: number[]; d: number; l: number }[] = []
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (let t = 0; t < n; t += step) {
      const o = t * 9
      const a = pr(pos[o], pos[o + 1], pos[o + 2]), b = pr(pos[o + 3], pos[o + 4], pos[o + 5]), c = pr(pos[o + 6], pos[o + 7], pos[o + 8])
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2]
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
      const len = Math.hypot(nx, ny, nz) || 1
      const light = Math.abs(nx * -0.4 + ny * 0.6 + nz * 0.69) / len
      for (const q of [a, b, c]) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]) }
      tris.push({ p: [a[0], a[1], b[0], b[1], c[0], c[1]], d: a[2] + b[2] + c[2], l: light })
    }
    tris.sort((p, q) => p.d - q.d) // far first
    const k = Math.min((W - 20) / (maxX - minX || 1), (H - 20) / (maxY - minY || 1))
    const ox = W / 2 - ((minX + maxX) / 2) * k, oy = H / 2 + ((minY + maxY) / 2) * k
    for (const t of tris) {
      const v = 60 + 190 * t.l
      g.fillStyle = `rgb(${Math.round(v * 0.55)},${Math.round(v * 0.62)},${Math.round(Math.min(255, v * 1.05))})`
      g.beginPath()
      g.moveTo(ox + t.p[0] * k, oy - t.p[1] * k)
      g.lineTo(ox + t.p[2] * k, oy - t.p[3] * k)
      g.lineTo(ox + t.p[4] * k, oy - t.p[5] * k)
      g.closePath()
      g.fill()
      g.strokeStyle = g.fillStyle
      g.lineWidth = 0.5
      g.stroke()
    }
  }, [pos])
  return <canvas ref={ref} style={{ width: '100%', height: 260, display: 'block', background: 'var(--panel2)', borderRadius: 8 }} />
}

export default function PrintCostEstimator() {
  const [s, set, reset] = useToolState('print-cost-estimator', DEF)
  const [upload, setUpload] = useState<{ name: string; pos: Float32Array } | null>(null)
  const [err, setErr] = useState('')
  const sampleName = s.sample
  const base = useMemo(() => {
    if (upload) return upload.pos
    const gen = SAMPLES[sampleName] ?? sampleVase
    return gen()
  }, [upload, sampleName])
  const pos = useMemo(() => {
    if (s.scale === 100) return base
    const k = s.scale / 100
    return base.map((v) => v * k)
  }, [base, s.scale])
  const settings = { layer: s.layer, line: s.line, walls: s.walls, topBottom: s.topBottom, infill: s.infill, supports: s.supports, supportDensity: s.supportDensity }
  const { layer, line, walls, topBottom, supports } = s
  const geo = useMemo(() => analyze(pos, { layer, line, walls, topBottom, infill: 0, supports, supportDensity: 0 }), [pos, layer, line, walls, topBottom, supports])
  const e = estimate(geo, settings, s)
  const m = (x: number) => money(x, s.currency, 2)
  const bbox = useMemo(() => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < pos.length; i++) { const d = i % 3; if (pos[i] < mn[d]) mn[d] = pos[i]; if (pos[i] > mx[d]) mx[d] = pos[i] }
    return mx.map((v, d) => v - mn[d])
  }, [pos])

  const load = async (f: File) => {
    try {
      const mesh = parseStl(await f.arrayBuffer())
      setUpload({ name: f.name, pos: mesh.pos })
      setErr('')
    } catch (x) {
      setErr((x as Error).message)
    }
  }
  const summary = () =>
    [
      `Model: ${upload?.name ?? s.sample} @ ${s.scale}% × ${s.copies}`,
      `Material: ${s.material}, ${num(e.grams, 1)} g, ${num(e.meters, 2)} m of ${s.diameter} mm filament`,
      `Print time: ${fmtDuration(e.hours)}`,
      `Material ${m(e.material)} · Electricity ${m(e.electricity)} · Wear ${m(e.wear)} · Labor ${m(e.labor)}`,
      `Total ${m(e.price)}${s.copies > 1 ? ` (${m(e.perCopy)} each)` : ''}`,
    ].join('\n')

  return (
    <Split>
      <div>
        <Panel title="Model">
          <FileDrop accept=".stl" label="Drop an STL file (binary or ASCII)" onFiles={([f]) => load(f)} />
          {err && <Note tone="err">{err}</Note>}
          <Row>
            <Select label="…or a sample" value={upload ? '' : s.sample} onChange={(sample) => { setUpload(null); set({ sample }) }} options={[...(upload ? [['', `📄 ${upload.name}`] as const] : []), ...Object.keys(SAMPLES).map((k) => [k, k] as const)]} />
            <Num label="Scale" value={s.scale} onChange={(scale) => set({ scale })} unit="%" min={1} />
            <Num label="Copies" value={s.copies} onChange={(copies) => set({ copies })} min={1} step={1} />
          </Row>
          <Preview pos={pos} />
          <p className="muted" style={{ fontSize: 13 }}>
            {num(pos.length / 9, 0)} triangles · {bbox.map((v) => num(v, 1)).join(' × ')} mm · solid volume {num(geo.volume / 1000, 2)} cm³
          </p>
        </Panel>
        <Panel title="Slicer settings">
          <Row>
            <Num label="Layer height" value={s.layer} onChange={(layer) => set({ layer })} unit="mm" min={0.04} step={0.04} />
            <Num label="Line width" value={s.line} onChange={(line) => set({ line })} unit="mm" min={0.2} step={0.05} />
          </Row>
          <Row>
            <Num label="Walls (perimeters)" value={s.walls} onChange={(walls) => set({ walls })} min={1} step={1} />
            <Num label="Top/bottom layers" value={s.topBottom} onChange={(topBottom) => set({ topBottom })} min={0} step={1} />
          </Row>
          <Slider label="Infill" value={s.infill} min={0} max={100} onChange={(infill) => set({ infill })} unit="%" />
          <Check label="Supports for overhangs > 45°" value={s.supports} onChange={(supports) => set({ supports })} />
          {s.supports && <Slider label="Support density" value={s.supportDensity} min={5} max={40} onChange={(supportDensity) => set({ supportDensity })} unit="%" />}
          <Num label="Print speed" value={s.speed} onChange={(speed) => set({ speed })} unit="mm/s" min={5} hint={`≈ ${num(s.speed * s.line * s.layer, 1)} mm³/s volumetric flow`} />
        </Panel>
        <Panel title="Material & running costs" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Select label="Material" value={s.material} onChange={(material) => { const r = MATERIALS.find((x) => x[0] === material)!; set({ material, density: r[1], filamentPerKg: r[2] }) }} options={MATERIALS.map((x) => x[0])} />
            <Num label="Density" value={s.density} onChange={(density) => set({ density })} unit="g/cm³" min={0.5} />
          </Row>
          <Row>
            <Num label="Spool price per kg" value={s.filamentPerKg} onChange={(filamentPerKg) => set({ filamentPerKg })} unit={s.currency} min={0} />
            <Select label="Filament Ø" value={s.diameter} onChange={(diameter) => set({ diameter })} options={[[1.75, '1.75 mm'], [2.85, '2.85 mm']]} />
          </Row>
          <Row>
            <Num label="Printer power" value={s.power} onChange={(power) => set({ power })} unit="W" min={0} />
            <Num label="Electricity" value={s.kwh} onChange={(kwh) => set({ kwh })} unit={`${s.currency}/kWh`} min={0} />
          </Row>
          <Row>
            <Num label="Machine wear" value={s.wearPerHour} onChange={(wearPerHour) => set({ wearPerHour })} unit={`${s.currency}/h`} min={0} hint="Nozzles, belts, depreciation" />
            <Num label="Labor per job" value={s.laborPerJob} onChange={(laborPerJob) => set({ laborPerJob })} unit={s.currency} min={0} />
          </Row>
          <Row>
            <Num label="Failure allowance" value={s.failure} onChange={(failure) => set({ failure })} unit="%" min={0} />
            <Num label="Markup" value={s.markup} onChange={(markup) => set({ markup })} unit="%" min={0} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥']} />
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Total cost" value={m(e.price)} tone="accent" sub={s.copies > 1 ? `${m(e.perCopy)} per copy` : undefined} />
          <Stat label="Filament" value={`${num(e.grams, 1)} g`} sub={`${num(e.meters, 2)} m · ${s.material}`} />
          <Stat label="Print time" value={fmtDuration(e.hours)} sub={`${num(e.layers, 0)} layers`} />
          <Stat label="Electricity" value={`${num((s.power / 1000) * e.hours, 2)} kWh`} sub={m(e.electricity)} />
        </Stats>
        <Panel title="Cost breakdown" actions={<CopyButton text={summary} label="Copy quote" />}>
          <Donut
            slices={[
              { label: 'Material', value: e.material },
              { label: 'Electricity', value: e.electricity },
              { label: 'Machine wear', value: e.wear },
              { label: 'Labor', value: e.labor },
              { label: 'Failure allowance', value: e.withFailures - e.subtotal },
              { label: 'Markup', value: e.price - e.withFailures },
            ].filter((x) => x.value > 0)}
            fv={m}
            center={<span>{m(e.price)}</span>}
          />
        </Panel>
        <Panel title="Where the plastic goes">
          <Table
            head={['Part', 'Volume', 'Mass', 'Share']}
            rows={[
              ['Shell (walls + top/bottom)', e.shell, `${s.walls} walls × ${s.line} mm, ${s.topBottom} × ${s.layer} mm skins`],
              ['Infill', e.infill, `${s.infill}% of the interior`],
              ['Supports', e.support, s.supports ? `${s.supportDensity}% density under overhangs` : 'off'],
            ].map(([n, v, note]) => [
              <span key="n">{n}<br /><span className="muted" style={{ fontSize: 12 }}>{note}</span></span>,
              `${num((v as number) / 1000, 2)} cm³`,
              `${num(((v as number) / 1000) * s.density, 1)} g`,
              `${num(((v as number) / (e.plastic || 1)) * 100, 0)}%`,
            ])}
            foot={['Total', `${num(e.plastic / 1000, 2)} cm³`, `${num(e.grams, 1)} g`, '100%']}
          />
          <p className="muted" style={{ fontSize: 13 }}>
            Estimated from the mesh: each face gets a shell thickness blended between wall thickness (vertical faces) and skin thickness (horizontal faces); infill fills the rest at the chosen density. Real slicers vary ±15%.
          </p>
          {geo.overhang > 0 && !s.supports && <Note tone="warn">This model has overhangs steeper than 45° — enable supports for a realistic estimate.</Note>}
        </Panel>
        <Panel title="Infill vs. cost">
          <Table
            head={['Infill', 'Mass', 'Time', 'Cost']}
            rows={[0, 10, 15, 20, 40, 60, 100].map((inf) => {
              const st = { ...settings, infill: inf }
              const x = estimate(geo, st, s)
              return [<b key="i" style={{ color: inf === s.infill ? 'var(--accent)' : undefined }}>{inf}%</b>, `${num(x.grams, 1)} g`, fmtDuration(x.hours), m(x.price)]
            })}
          />
        </Panel>
      </div>
    </Split>
  )
}
