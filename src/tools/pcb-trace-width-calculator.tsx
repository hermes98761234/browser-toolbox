import { CsvButton, LineChart, Note, num, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { currentFor, riseFor, solve, UM_PER_MIL, widthFor, type Layer } from './lib/pcb-trace-width-calculator'

type Unit = 'mm' | 'mil'
interface State { mode: 'width' | 'current'; current: number; rise: number; ambient: number; oz: number; layer: Layer; length: number; width: number; unit: Unit }

const DEF: State = { mode: 'width', current: 2, rise: 10, ambient: 25, oz: 1, layer: 'external', length: 50, width: 0.5, unit: 'mm' }
const OZ: [number, string][] = [[0.5, '0.5 oz (17 µm)'], [1, '1 oz (35 µm)'], [2, '2 oz (70 µm)'], [3, '3 oz (105 µm)'], [4, '4 oz (140 µm)']]
const MM_PER_MIL = UM_PER_MIL / 1000

export default function PcbTraceWidthCalculator() {
  const [s, set, reset] = useToolState('pcb-trace-width-calculator', DEF)
  const toMil = (v: number) => (s.unit === 'mm' ? v / MM_PER_MIL : v)
  const fromMil = (v: number) => (s.unit === 'mm' ? v * MM_PER_MIL : v)
  const L = (v: number, d = s.unit === 'mm' ? 3 : 1) => `${num(fromMil(v), d)} ${s.unit}`
  const lenMil = toMil(s.length)

  const widthMil = s.mode === 'width' ? widthFor(s.current, s.rise, s.oz, s.layer) : toMil(s.width)
  const I = s.mode === 'width' ? s.current : currentFor(widthMil, s.rise, s.oz, s.layer)
  const r = solve(I, s.rise, s.oz, s.layer, lenMil, s.ambient, widthMil)
  const other: Layer = s.layer === 'external' ? 'internal' : 'external'
  const otherW = widthFor(I, s.rise, s.oz, other)
  const outOfRange = I > (s.layer === 'external' ? 35 : 17.5) || widthMil > 400 || s.rise < 10 || s.rise > 100 || s.oz < 0.5 || s.oz > 3

  const currents = [0.25, 0.5, 1, 1.5, 2, 3, 4, 5, 7.5, 10, 15, 20]
  const rises = [10, 20, 30]
  const tableRows = currents.map((c) => [`${c} A`, ...rises.flatMap((dT) => [L(widthFor(c, dT, s.oz, 'external')), L(widthFor(c, dT, s.oz, 'internal'))])])

  const curve = (layer: Layer, dT: number) => Array.from({ length: 60 }, (_, i) => {
    const c = 0.1 + (i / 59) * Math.max(5, I * 2)
    return [c, fromMil(widthFor(c, dT, s.oz, layer))] as [number, number]
  })

  return (
    <Split>
      <div>
        <Panel title="Solve for">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['width', 'Width from current'], ['current', 'Current from width']]} />
          <Row>
            {s.mode === 'width' ? (
              <Num label="Current" value={s.current} onChange={(current) => set({ current })} unit="A" min={0.01} max={100} />
            ) : (
              <Num label="Trace width" value={s.width} onChange={(width) => set({ width })} unit={s.unit} min={0.01} />
            )}
            <Num label="Allowed temperature rise" value={s.rise} onChange={(rise) => set({ rise })} unit="°C" min={1} max={150} />
          </Row>
          <Row>
            <Num label="Ambient temperature" value={s.ambient} onChange={(ambient) => set({ ambient })} unit="°C" />
            <Num label="Trace length" value={s.length} onChange={(length) => set({ length })} unit={s.unit} min={0} />
          </Row>
          <Select label="Copper weight" value={s.oz} onChange={(oz) => set({ oz })} options={OZ} />
          <Seg value={s.layer} onChange={(layer) => set({ layer })} options={[['external', 'External (outer) layer'], ['internal', 'Internal layer']]} />
          <div style={{ marginTop: 8 }}>
            <Seg value={s.unit} onChange={(unit) => set({ unit, width: unit === s.unit ? s.width : unit === 'mm' ? +(s.width * MM_PER_MIL).toFixed(3) : +(s.width / MM_PER_MIL).toFixed(1), length: unit === s.unit ? s.length : unit === 'mm' ? +(s.length * MM_PER_MIL).toFixed(2) : +(s.length / MM_PER_MIL).toFixed(0) })} options={[['mm', 'Millimetres'], ['mil', 'Mils (thou)']]} />
          </div>
          <p><button type="button" className="k-btn ghost" onClick={reset}>Reset</button></p>
        </Panel>
        <Panel title="Formulas (IPC-2221)">
          <p style={{ fontSize: 14 }}>
            <code>I = k · ΔT<sup>0.44</sup> · A<sup>0.725</sup></code> with A in mil², k = 0.048 (external) or 0.024 (internal).<br />
            Width = A / thickness, thickness = oz × 1.378 mil (35 µm per oz).<br />
            <code>R = ρ·L / (W·t) · (1 + α(T − 20 °C))</code>, ρ = 1.724×10⁻⁸ Ω·m, α = 0.00393 /°C, T = ambient + rise.
          </p>
          <Note>IPC-2221 is the classic, conservative chart fit. The newer IPC-2152 accounts for board thickness, planes and copper nearby and often allows narrower internal traces. Add margin for vias, necks and high-current connectors.</Note>
        </Panel>
      </div>
      <div>
        <Stats>
          {s.mode === 'width' ? (
            <Stat label="Minimum trace width" value={L(r.width)} sub={`${num(r.width, 1)} mil · ${num(r.width * MM_PER_MIL, 3)} mm`} tone="accent" />
          ) : (
            <Stat label="Maximum current" value={`${num(I, 2)} A`} sub={`at ${s.rise} °C rise`} tone="accent" />
          )}
          <Stat label="Cross-section" value={`${num(r.area, 1)} mil²`} sub={`${num(r.area * 0.00064516, 4)} mm²`} />
          <Stat label="Resistance" value={r.R < 1 ? `${num(r.R * 1000, 2)} mΩ` : `${num(r.R, 3)} Ω`} sub={`at ${num(r.tTrace, 0)} °C`} />
          <Stat label="Voltage drop" value={`${num(r.drop * 1000, 1)} mV`} sub={`${num(r.power * 1000, 1)} mW dissipated`} />
        </Stats>
        {outOfRange && <Note tone="warn">Outside the IPC-2221 chart range (up to 35 A external / 17.5 A internal, 400 mil wide, 10–100 °C rise, 0.5–3 oz). Treat the result as an extrapolation.</Note>}
        <Panel title="Comparison">
          <Table
            head={['', 'Width', 'Current', 'Rise at this current']}
            rows={[
              [`${s.layer} (selected)`, L(widthMil), `${num(I, 2)} A`, `${num(riseFor(I, widthMil, s.oz, s.layer), 1)} °C`],
              [`${other}, same current`, L(otherW), `${num(I, 2)} A`, `${num(s.rise, 1)} °C`],
              [`${s.layer}, this width, 2 oz copper`, L(widthMil), `${num(currentFor(widthMil, s.rise, 2, s.layer), 2)} A`, `${num(riseFor(I, widthMil, 2, s.layer), 1)} °C`],
              [`${s.layer}, this width, 2× rise`, L(widthMil), `${num(currentFor(widthMil, s.rise * 2, s.oz, s.layer), 2)} A`, `${num(s.rise * 2, 0)} °C`],
            ]}
          />
        </Panel>
        <Panel title={`Width vs current (${s.oz} oz)`}>
          <LineChart
            height={250}
            xLabel="current (A)"
            yLabel={`width (${s.unit})`}
            fx={(v) => num(v, 1)}
            series={[
              { name: `External ${s.rise} °C`, points: curve('external', s.rise) },
              { name: `Internal ${s.rise} °C`, points: curve('internal', s.rise), dashed: true },
              { name: `External ${s.rise * 2} °C`, points: curve('external', s.rise * 2), color: '#10b981' },
            ]}
            markers={[{ x: I, label: `${num(I, 2)} A` }]}
          />
        </Panel>
        <Panel title={`Quick table: minimum widths, ${s.oz} oz copper`} actions={<CsvButton name="trace-widths.csv" rows={() => [['Current', ...rises.flatMap((d) => [`Ext ${d}°C`, `Int ${d}°C`])], ...tableRows]} />}>
          <Table head={['Current', ...rises.flatMap((d) => [`Ext ΔT ${d}`, `Int ΔT ${d}`])]} rows={tableRows} />
        </Panel>
      </div>
    </Split>
  )
}
