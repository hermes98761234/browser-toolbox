import { Bar, Btn, Check, CsvButton, Note, Num, num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { evaluate, type Material, type Rating } from './lib/wire-gauge-selector'

interface State {
  loadMode: 'A' | 'W'
  amps: number
  watts: number
  pf: number
  continuous: boolean
  material: Material
  insulation: Rating
  terminal: Rating
  ambient: number
  tempUnit: 'C' | 'F'
  conductors: number
  volts: number
  phase: '1' | '3'
  length: number
  lenUnit: 'ft' | 'm'
  maxDrop: number
}

const DEF: State = {
  loadMode: 'A', amps: 40, watts: 9600, pf: 1, continuous: true, material: 'cu', insulation: 90, terminal: 75,
  ambient: 30, tempUnit: 'C', conductors: 3, volts: 240, phase: '1', length: 120, lenUnit: 'ft', maxDrop: 3,
}

const PRESETS: [string, Partial<State>][] = [
  ['15 A lighting', { loadMode: 'A', amps: 12, continuous: true, volts: 120, phase: '1', length: 60 }],
  ['20 A kitchen', { loadMode: 'A', amps: 16, continuous: false, volts: 120, phase: '1', length: 40 }],
  ['Dryer 30 A', { loadMode: 'A', amps: 24, continuous: false, volts: 240, phase: '1', length: 50 }],
  ['EV charger 40 A', { loadMode: 'A', amps: 40, continuous: true, volts: 240, phase: '1', length: 120 }],
  ['Subpanel 100 A', { loadMode: 'A', amps: 80, continuous: false, volts: 240, phase: '1', length: 90 }],
  ['3-phase motor 15 kW', { loadMode: 'W', watts: 15000, pf: 0.85, continuous: true, volts: 480, phase: '3', length: 200 }],
]

export default function WireGaugeSelector() {
  const [s, set, reset] = useToolState('wire-gauge-selector', DEF)
  const phase = s.phase === '3' ? 3 : 1
  const amps = s.loadMode === 'A' ? s.amps : s.watts / ((phase === 3 ? Math.sqrt(3) : 1) * (s.volts || 1) * (s.pf || 1))
  const ambientC = s.tempUnit === 'C' ? s.ambient : ((s.ambient - 32) * 5) / 9
  const lengthFt = s.lenUnit === 'ft' ? s.length : s.length / 0.3048
  const r = evaluate({ amps, continuous: s.continuous, material: s.material, insulation: s.insulation, terminal: s.terminal, ambientC, conductors: s.conductors, volts: s.volts, phase, lengthFt, maxDrop: s.maxDrop })
  const maxDer = Math.max(...r.rows.map((x) => x.derated), 1)
  const bad = !(amps > 0) || !(s.volts > 0)

  return (
    <div>
      <Stats>
        <Stat label="Recommended conductor" value={bad ? '—' : r.pick ? r.pick.g.size : 'Over 750 kcmil'} tone={r.pick ? 'good' : 'bad'} sub={r.pick ? `${num(r.pick.g.mm2, 1)} mm² ${s.material === 'cu' ? 'copper' : 'aluminium'}` : 'use parallel sets'} />
        <Stat label="Smallest by ampacity" value={r.forAmpacity?.g.size ?? '—'} sub={r.pick && r.forAmpacity && r.pick !== r.forAmpacity ? 'upsized for voltage drop' : 'ampacity governs'} />
        <Stat label="Load current" value={`${num(amps, 1)} A`} sub={s.continuous ? `design ${num(r.design, 1)} A (125%)` : 'non-continuous'} />
        <Stat label="Breaker (OCPD)" value={Number.isFinite(r.ocpd) ? `${r.ocpd} A` : '—'} sub="next standard size" />
        <Stat label="Voltage drop" value={r.pick ? `${num(r.pick.dropPct, 2)}%` : '—'} sub={r.pick ? `${num(r.pick.drop, 2)} V of ${s.volts} V` : ''} />
      </Stats>
      <Split>
        <div>
          <Panel title="Load">
            <Row>
              {PRESETS.map(([n, p]) => (
                <Btn key={n} onClick={() => set(p)}>{n}</Btn>
              ))}
            </Row>
            <Seg value={s.loadMode} onChange={(loadMode) => set({ loadMode })} options={[['A', 'Current (A)'], ['W', 'Power (W)']]} />
            <Row>
              {s.loadMode === 'A' ? (
                <Num label="Load current" value={s.amps} onChange={(a) => set({ amps: a })} unit="A" min={0} />
              ) : (
                <>
                  <Num label="Load power" value={s.watts} onChange={(watts) => set({ watts })} unit="W" min={0} />
                  <Num label="Power factor" value={s.pf} onChange={(pf) => set({ pf })} min={0.1} max={1} step={0.01} />
                </>
              )}
            </Row>
            <Row>
              <Select label="System voltage" value={s.volts} onChange={(volts) => set({ volts })} options={[[12, '12 V DC'], [24, '24 V DC'], [48, '48 V DC'], [120, '120 V'], [208, '208 V'], [230, '230 V'], [240, '240 V'], [277, '277 V'], [400, '400 V'], [480, '480 V']]} />
              <Select label="Phase" value={s.phase} onChange={(p) => set({ phase: p })} options={[['1', 'Single-phase / DC'], ['3', 'Three-phase']]} />
            </Row>
            <Check label="Continuous load (3 h or more) — size at 125%" value={s.continuous} onChange={(continuous) => set({ continuous })} />
          </Panel>
          <Panel title="Conductor & installation">
            <Row>
              <Seg value={s.material} onChange={(material) => set({ material })} options={[['cu', 'Copper'], ['al', 'Aluminium']]} />
            </Row>
            <Row>
              <Select label="Insulation rating" value={s.insulation} onChange={(insulation) => set({ insulation })} options={[[60, '60 °C (TW, UF)'], [75, '75 °C (THW, THWN, XHHW)'], [90, '90 °C (THHN, XHHW-2)']]} />
              <Select label="Terminal rating" value={s.terminal} onChange={(terminal) => set({ terminal })} options={[[60, '60 °C (≤100 A default)'], [75, '75 °C']]} />
            </Row>
            <Row>
              <Num label="Ambient temperature" value={s.ambient} onChange={(ambient) => set({ ambient })} unit={`°${s.tempUnit}`} />
              <Seg value={s.tempUnit} onChange={(tempUnit) => set({ tempUnit, ambient: Math.round(tempUnit === s.tempUnit ? s.ambient : tempUnit === 'F' ? (s.ambient * 9) / 5 + 32 : ((s.ambient - 32) * 5) / 9) })} options={[['C', '°C'], ['F', '°F']]} />
            </Row>
            <Num label="Current-carrying conductors in raceway / cable" value={s.conductors} onChange={(conductors) => set({ conductors: Math.max(1, Math.round(conductors)) })} min={1} step={1} hint={`Adjustment factor ${Math.round(r.fN * 100)}% · temperature factor ${r.fT.toFixed(2)}`} />
            <Row>
              <Num label="One-way length" value={s.length} onChange={(length) => set({ length })} unit={s.lenUnit} min={0} />
              <Seg value={s.lenUnit} onChange={(lenUnit) => set({ lenUnit, length: lenUnit === s.lenUnit ? s.length : Math.round(lenUnit === 'm' ? s.length * 0.3048 : s.length / 0.3048) })} options={[['ft', 'ft'], ['m', 'm']]} />
              <Num label="Max voltage drop" value={s.maxDrop} onChange={(maxDrop) => set({ maxDrop })} unit="%" min={0.5} max={10} />
            </Row>
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Panel>
        </div>
        <div>
          {bad && <Note tone="warn">Enter a positive load and voltage.</Note>}
          {r.fT === 0 && <Note tone="err">{s.insulation} °C insulation is not permitted at this ambient temperature. Choose a higher-rated insulation.</Note>}
          <Panel title="Conductor sizes" actions={<CsvButton name="wire-gauge.csv" rows={() => [['Size', 'mm2', 'Table A', 'Derated A', 'Terminal A', 'Drop V', 'Drop %', 'OK', 'Notes'], ...r.rows.map((x) => [x.g.size, x.g.mm2, x.base, x.derated.toFixed(1), x.terminalAmp, x.drop.toFixed(2), x.dropPct.toFixed(2), x.ok ? 'yes' : 'no', x.reason])]} />}>
            <Table
              head={['Size', 'mm²', `${s.insulation} °C table`, 'Derated', 'Terminal', 'Drop', 'Status']}
              rows={r.rows.slice(0, Math.max(8, r.rows.indexOf(r.pick ?? r.rows[r.rows.length - 1]) + 4)).map((x) => {
                const isPick = x === r.pick
                return [
                  <b key="s" style={{ color: isPick ? 'var(--ok)' : undefined }}>{isPick ? '★ ' : ''}{x.g.size}</b>,
                  num(x.g.mm2, 2),
                  `${x.base} A`,
                  <div key="d" style={{ minWidth: 90 }}>
                    <div>{num(x.derated, 1)} A</div>
                    <Bar value={x.derated} max={maxDer} color={x.derated >= amps ? 'var(--ok)' : 'var(--err)'} />
                  </div>,
                  `${x.terminalAmp} A`,
                  <span key="v" style={{ color: x.okDrop ? undefined : 'var(--err)' }}>{num(x.dropPct, 2)}%</span>,
                  x.ok ? <span key="ok" style={{ color: 'var(--ok)', fontWeight: 700 }}>✓ OK</span> : <span key="no" className="muted" style={{ fontSize: 13, display: "block", minWidth: 180, maxWidth: 260, whiteSpace: "normal" }}>✗ {x.reason}</span>,
                ]
              })}
            />
          </Panel>
          <Panel title="How the size is chosen">
            <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, fontSize: 14 }}>
              <li>Ampacity from NEC Table 310.16 in the insulation column, × temperature factor ({r.fT.toFixed(2)}) × fill adjustment ({r.fN.toFixed(2)}) must carry the load.</li>
              <li>Terminal column ({Math.min(s.terminal, s.insulation)} °C, not derated) must carry {s.continuous ? '125% of the continuous load' : 'the load'}: {num(r.design, 1)} A.</li>
              <li>The conductor must be protected by the {Number.isFinite(r.ocpd) ? `${r.ocpd} A` : ''} breaker (next size up rule) and respect the small-conductor limits (14 AWG 15 A, 12 AWG 20 A, 10 AWG 30 A copper).</li>
              <li>Voltage drop = {phase === 3 ? '√3' : '2'} × L × R × I / 1000 with Chapter 9 Table 8 resistances must stay under {s.maxDrop}%.</li>
            </ol>
            <Note tone="warn">Guidance only — local codes, cable type, bundling and equipment listings may require a different size. Have a licensed electrician verify.</Note>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
