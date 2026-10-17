import { Bar, Btn, CsvButton, fmt, LineChart, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { AWG, currentFromPower, drop, maxLength, METALS, METRIC, type DropInput, type Metal, type System } from './lib/voltage-drop-calculator'

interface State {
  system: System; V: number; loadMode: 'A' | 'kW'; I: number; P: number; pf: number
  L: number; unit: 'm' | 'ft'; metal: Metal; gauge: 'metric' | 'awg'; size: string; parallel: number
  tempC: number; x: number; limit: number
}

const DEF: State = {
  system: '1ph', V: 230, loadMode: 'A', I: 20, P: 4.6, pf: 0.95, L: 28, unit: 'm', metal: 'cu', gauge: 'metric', size: '4 mm²', parallel: 1, tempC: 70, x: 0.08, limit: 3,
}

const PRESETS: [string, Partial<State>][] = [
  ['EU socket 230 V', { system: '1ph', V: 230, loadMode: 'A', I: 16, pf: 0.95, gauge: 'metric', size: '2.5 mm²', L: 25 }],
  ['US branch 120 V', { system: '1ph', V: 120, loadMode: 'A', I: 16, pf: 0.95, gauge: 'awg', size: '12 AWG', L: 100, unit: 'ft' }],
  ['EV charger 11 kW', { system: '3ph', V: 400, loadMode: 'kW', P: 11, pf: 0.99, gauge: 'metric', size: '6 mm²', L: 40 }],
  ['Motor 400 V 30 kW', { system: '3ph', V: 400, loadMode: 'kW', P: 30, pf: 0.85, gauge: 'metric', size: '16 mm²', L: 80 }],
  ['Solar DC 48 V', { system: 'dc', V: 48, loadMode: 'A', I: 40, gauge: 'metric', size: '16 mm²', L: 12 }],
  ['12 V car / boat', { system: 'dc', V: 12, loadMode: 'A', I: 15, gauge: 'awg', size: '10 AWG', L: 6, unit: 'm' }],
]

export default function VoltageDropCalculator() {
  const [s, set, reset] = useToolState('voltage-drop-calculator', DEF)
  const sizes = s.gauge === 'metric' ? METRIC : AWG
  const size = sizes.find((z) => z.label === s.size) ?? sizes[3]
  const Lm = s.unit === 'ft' ? s.L * 0.3048 : s.L
  const I = s.loadMode === 'A' ? s.I : currentFromPower(s.system, s.P * 1000, s.V, s.pf || 1)
  const inp: DropInput = { system: s.system, V: s.V, I, L: Lm, mm2: size.mm2, parallel: Math.max(1, Math.round(s.parallel)), metal: s.metal, tempC: s.tempC, pf: s.pf, x: s.x }
  const valid = s.V > 0 && I >= 0 && Lm >= 0 && Number.isFinite(I)
  const r = drop(inp)
  const maxL = maxLength(inp, s.limit)
  const all = sizes.map((z) => ({ z, d: drop({ ...inp, mm2: z.mm2 }) }))
  const minOk = all.find((a) => a.d.pct <= s.limit)
  const tone = r.pct <= s.limit ? 'good' : 'bad'
  const lenU = (m: number) => (s.unit === 'ft' ? `${fmt(m / 0.3048, 4)} ft` : `${fmt(m, 4)} m`)
  const idx = sizes.indexOf(size)
  const chartSizes = [sizes[idx - 1], size, sizes[idx + 1], sizes[idx + 2]].filter(Boolean)
  const maxLen = Math.max(Lm * 2, 10)
  const series = chartSizes.map((z) => ({
    name: z.label,
    points: Array.from({ length: 41 }, (_, k) => {
      const L = (maxLen * k) / 40
      return [s.unit === 'ft' ? L / 0.3048 : L, drop({ ...inp, mm2: z.mm2, L }).pct] as [number, number]
    }),
    dashed: z !== size,
  }))
  const pe = s.system === 'dc' ? 1 : s.pf

  return (
    <Split>
      <div>
        <Panel title="Circuit" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.system} onChange={(system) => set({ system, V: system === '3ph' ? 400 : system === 'dc' ? 48 : 230 })} options={[['1ph', 'Single-phase AC'], ['3ph', 'Three-phase AC'], ['dc', 'DC']]} />
          <Row>
            <Num label={s.system === '3ph' ? 'Line-to-line voltage' : 'Supply voltage'} value={s.V} unit="V" min={1} onChange={(V) => set({ V })} />
            {s.system !== 'dc' && <Num label="Power factor cos φ" value={s.pf} min={0.1} max={1} step={0.01} onChange={(pf) => set({ pf })} />}
          </Row>
          <Row>
            <div className="k-field" style={{ flex: '0 0 auto' }}>
              <span className="k-label">Load given as</span>
              <Seg value={s.loadMode} onChange={(loadMode) => set({ loadMode })} options={[['A', 'Current'], ['kW', 'Power']]} />
            </div>
            {s.loadMode === 'A' ? <Num label="Load current" value={s.I} unit="A" min={0} onChange={(v) => set({ I: v })} /> : <Num label="Load power" value={s.P} unit="kW" min={0} onChange={(P) => set({ P })} />}
          </Row>
          <Row>
            <Num label="One-way length" value={s.L} unit={s.unit} min={0} onChange={(L) => set({ L })} />
            <Select label="Unit" value={s.unit} onChange={(unit) => set({ unit, L: +(unit === 'ft' ? s.L / 0.3048 : s.L * 0.3048).toFixed(1) })} options={[['m', 'metres'], ['ft', 'feet']]} />
          </Row>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PRESETS.map(([n, p]) => <Btn key={n} onClick={() => set(p)}>{n}</Btn>)}
          </div>
        </Panel>
        <Panel title="Conductor">
          <Row>
            <Select label="Material" value={s.metal} onChange={(metal) => set({ metal })} options={[['cu', 'Copper'], ['al', 'Aluminium']]} />
            <Select label="Size standard" value={s.gauge} onChange={(gauge) => set({ gauge, size: gauge === 'metric' ? '4 mm²' : '10 AWG' })} options={[['metric', 'mm² (IEC)'], ['awg', 'AWG / kcmil']]} />
          </Row>
          <Row>
            <Select label="Conductor size" value={size.label} onChange={(sz) => set({ size: sz })} options={sizes.map((z) => [z.label, s.gauge === 'awg' ? `${z.label} (${fmt(z.mm2, 3)} mm²)` : z.label] as [string, string])} />
            <Num label="Parallel sets" value={s.parallel} min={1} max={12} step={1} onChange={(parallel) => set({ parallel })} />
          </Row>
          <Row>
            <Select label="Conductor temperature" value={s.tempC} onChange={(tempC) => set({ tempC })} options={[[20, '20 °C (reference)'], [60, '60 °C'], [70, '70 °C (PVC)'], [75, '75 °C (THWN)'], [90, '90 °C (XLPE)']]} />
            {s.system !== 'dc' && <Num label="Reactance" value={s.x} unit="Ω/km" min={0} step={0.01} onChange={(x) => set({ x })} />}
          </Row>
          <Select label="Allowed drop" value={s.limit} onChange={(limit) => set({ limit })} options={[[1, '1 %'], [2, '2 % (DC / solar)'], [3, '3 % (branch circuit, lighting)'], [4, '4 %'], [5, '5 % (feeder + branch total)'], [8, '8 %']]} />
          <p className="muted" style={{ fontSize: 12 }}>ρ({s.tempC} °C) = {fmt(METALS[s.metal].rho20 * (1 + METALS[s.metal].alpha * (s.tempC - 20)), 5)} Ω·mm²/m · R = {fmt(r.R * 1000, 4)} Ω/km per conductor</p>
        </Panel>
      </div>
      <div>
        {!valid && <Note tone="err">Enter a positive voltage, length and load.</Note>}
        <Stats>
          <Stat label="Voltage drop" value={`${fmt(r.Vd, 4)} V`} sub={`${fmt(r.pct, 3)} % of ${s.V} V`} tone={tone} />
          <Stat label="Voltage at load" value={`${fmt(r.Vend, 4)} V`} />
          <Stat label="Load current" value={`${fmt(I, 4)} A`} sub={s.loadMode === 'kW' ? `from ${s.P} kW` : `${fmt((s.system === '3ph' ? Math.sqrt(3) : 1) * s.V * I * pe / 1000, 3)} kW`} />
          <Stat label="Cable loss" value={`${fmt(r.loss, 4)} W`} sub={`${fmt((r.loss / Math.max(1e-9, (s.system === '3ph' ? Math.sqrt(3) : 1) * s.V * I * pe)) * 100, 3)} % of load power`} />
        </Stats>
        <Panel title="Verdict">
          <div style={{ marginBottom: 8 }}>
            <Row wrap={false}>
              <b style={{ flex: 1 }}>{fmt(r.pct, 3)} % drop</b>
              <span className="muted">limit {s.limit} %</span>
            </Row>
            <Bar value={r.pct} max={Math.max(s.limit * 2, r.pct)} color={r.pct <= s.limit ? 'var(--ok)' : 'var(--err)'} />
          </div>
          {r.pct <= s.limit ? (
            <Note tone="ok">{size.label} {METALS[s.metal].name.toLowerCase()} is fine: the run can be up to <b>{lenU(maxL)}</b> before exceeding {s.limit} %.</Note>
          ) : (
            <Note tone="err">
              Too much drop for {size.label}. {minOk ? <>Use at least <b>{minOk.z.label}</b> ({fmt(minOk.d.pct, 3)} %)</> : 'No single size in the table is enough — add parallel sets'}, or keep the run under <b>{lenU(maxL)}</b>.
            </Note>
          )}
          {r.pct > 5 && <Note tone="warn">Above 5 % many devices (motors, chargers, LED drivers) misbehave; NEC and IEC 60364 recommend ≤ 5 % feeder + branch.</Note>}
          <p className="muted" style={{ fontSize: 12 }}>Voltage drop only — always also check the cable's ampacity and protective device rating for your installation method.</p>
        </Panel>
        <Panel title="Drop vs. length">
          <LineChart series={series} xLabel={`one-way length (${s.unit})`} yLabel="% drop" fy={(v) => `${fmt(v, 2)}%`} markers={[{ x: s.L, label: 'your run' }]} />
        </Panel>
        <Panel title="All sizes" actions={<CsvButton name="voltage-drop.csv" rows={() => [['size', 'mm2', 'drop_V', 'drop_pct', 'loss_W', 'max_length_m'], ...all.map((a) => [a.z.label, +a.z.mm2.toFixed(3), +a.d.Vd.toFixed(3), +a.d.pct.toFixed(3), +a.d.loss.toFixed(2), +maxLength({ ...inp, mm2: a.z.mm2 }, s.limit).toFixed(1)])]} />}>
          <Table
            head={['Size', 'Drop', '%', 'Loss', `Max length @ ${s.limit}%`]}
            rows={all.map((a) => {
              const ok = a.d.pct <= s.limit
              const cur = a.z === size
              return [
                <button key="s" type="button" className="k-btn ghost" style={{ padding: '2px 6px', fontWeight: cur ? 800 : 500, color: cur ? 'var(--accent)' : undefined }} onClick={() => set({ size: a.z.label })}>{a.z.label}</button>,
                `${fmt(a.d.Vd, 3)} V`,
                <span key="p" style={{ color: ok ? 'var(--ok)' : 'var(--err)', fontWeight: 700 }}>{fmt(a.d.pct, 3)}%</span>,
                `${fmt(a.d.loss, 3)} W`,
                lenU(maxLength({ ...inp, mm2: a.z.mm2 }, s.limit)),
              ]
            })}
          />
          <p className="muted" style={{ fontSize: 12 }}>Formulas: single-phase/DC V<sub>d</sub> = 2·I·L·(R cos φ + X sin φ); three-phase V<sub>d</sub> = √3·I·L·(R cos φ + X sin φ). R = ρ(T)/A with ρ<sub>20</sub> = 0.017241 (Cu) / 0.028264 (Al) Ω·mm²/m.</p>
        </Panel>
      </div>
    </Split>
  )
}
