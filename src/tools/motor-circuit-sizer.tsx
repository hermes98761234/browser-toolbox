import { Btn, Check, CopyButton, Note, num, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { DEVICES, feeder, flc, HP_1PH, HP_3PH, MOTOR_TYPES, pickConductor, sizeMotor, stdUp, V_1PH, V_3PH, maxPct, type Device, type MotorInputs, type MotorType } from './lib/motor-circuit-sizer'
import type { Material, Rating } from './lib/wire-gauge-selector'

interface FeederMotor { id: string; hp: string; type: MotorType }
interface State extends MotorInputs { device: Device; motors: FeederMotor[] }

const DEF: State = {
  phase: 3, volts: 460, hp: '25', type: 'designB', nameplate: 31, sf115: true, rise40: false, material: 'cu', insulation: 90, termination: 75, ambient: 30, ccc: 3, lengthFt: 150,
  device: 'itb',
  motors: [{ id: 'm1', hp: '25', type: 'designB' }, { id: 'm2', hp: '10', type: 'sq' }, { id: 'm3', hp: '5', type: 'sq' }],
}

const amps = (a: number) => (Number.isFinite(a) ? `${num(a, 2)} A` : '—')

export default function MotorCircuitSizer() {
  const [s, set, reset] = useToolState('motor-circuit-sizer', DEF)
  const hps: readonly string[] = s.phase === 1 ? HP_1PH : HP_3PH
  const vs: readonly number[] = s.phase === 1 ? V_1PH : V_3PH
  const r = sizeMotor(s)
  const ok = Number.isFinite(r.flc)
  const dev = r.ocpd.find((o) => o.d === s.device)!
  const devName = DEVICES.find(([d]) => d === s.device)![1]

  const fm = s.motors.map((m) => {
    const I = flc(s.phase, m.hp, s.volts)
    const pct = maxPct(m.type, s.device)
    return { ...m, I, branch: s.device === 'inst' ? (I * pct) / 100 : stdUp((I * pct) / 100) }
  })
  const valid = fm.filter((m) => Number.isFinite(m.I))
  const fd = feeder(valid.map((m) => m.I), valid.map((m) => m.branch))
  const fcond = pickConductor(fd.ampacity, s.material, s.insulation, s.termination, s.ambient, s.ccc)

  const summary = () => [
    `${s.hp} hp, ${s.volts} V, ${s.phase}-phase motor — NEC Article 430 sizing (verify with current code and the local AHJ)`,
    `FLC (Table ${s.phase === 1 ? '430.248' : '430.250'}): ${amps(r.flc)}`,
    `Conductors (430.22, 125%): ≥ ${amps(r.condReq)} → ${r.cond.gauge?.size ?? '—'} ${s.material === 'cu' ? 'Cu' : 'Al'} (${amps(r.cond.ampacity)})`,
    `${devName} (430.52): ${dev.pct}% → ${amps(dev.calc)} → ${s.device === 'inst' ? 'setting' : 'standard'} ${amps(dev.std)}`,
    `Overload (430.32): ${r.overload.pct}% of ${amps(r.overload.fla)} nameplate = ${amps(r.overload.amps)} (max ${amps(r.overload.maxAmps)})`,
    `EGC (250.122): ${r.egc}; disconnect (430.110): ≥ ${amps(r.disconnect)} and hp-rated`,
  ].join('\n')

  return (
    <>
      <div role="note" style={{ background: '#b45309', color: '#fff', borderRadius: 12, padding: '12px 16px', marginBottom: 14, lineHeight: 1.5 }}>
        <b>⚠ Planning aid only — verify every result with the current NEC edition adopted in your area and your local AHJ.</b>
        <div style={{ fontSize: 14 }}>Values follow NEC Article 430 tables (Tables 430.248/430.250, 430.52, 310.16, 250.122). Local amendments, equipment listings, motor nameplates and manufacturer instructions take precedence. Electrical work should be done by a qualified, licensed person.</div>
      </div>
      <Split>
        <div>
          <Panel title="Motor" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Seg value={String(s.phase) as '1' | '3'} onChange={(p) => { const phase = Number(p) as 1 | 3; set({ phase, volts: phase === 1 ? 230 : 460, hp: phase === 1 ? '1' : '10' }) }} options={[['1', 'Single-phase'], ['3', 'Three-phase']]} />
            <Row>
              <Select label="Horsepower" value={s.hp} onChange={(hp) => set({ hp })} options={hps.map((h) => [h, `${h} hp`] as [string, string])} />
              <Select label="Voltage" value={s.volts} onChange={(volts) => set({ volts })} options={vs.map((v) => [v, `${v} V`] as [number, string])} />
            </Row>
            <Select label="Motor type (Table 430.52)" value={s.type} onChange={(type) => set({ type })} options={MOTOR_TYPES} />
            <Num label="Nameplate full-load amps (for overloads)" value={s.nameplate} onChange={(nameplate) => set({ nameplate })} unit="A" min={0} hint="430.6(A)(2): overloads use the nameplate, not the table" />
            <Check label="Service factor 1.15 or more" value={s.sf115} onChange={(sf115) => set({ sf115 })} />
            <Check label="Temperature rise 40 °C or less" value={s.rise40} onChange={(rise40) => set({ rise40 })} />
          </Panel>
          <Panel title="Conductors">
            <Row>
              <Select label="Material" value={s.material} onChange={(material: Material) => set({ material })} options={[['cu', 'Copper'], ['al', 'Aluminum']]} />
              <Select label="Insulation" value={s.insulation} onChange={(insulation: Rating) => set({ insulation })} options={[[60, '60 °C (TW)'], [75, '75 °C (THW, XHHW wet)'], [90, '90 °C (THHN, XHHW-2)']]} />
            </Row>
            <Row>
              <Select label="Terminations (110.14(C))" value={s.termination} onChange={(termination: Rating) => set({ termination })} options={[[60, '60 °C'], [75, '75 °C']]} />
              <Num label="Ambient" value={s.ambient} onChange={(ambient) => set({ ambient })} unit="°C" />
            </Row>
            <Row>
              <Num label="Current-carrying conductors in raceway" value={s.ccc} onChange={(ccc) => set({ ccc })} min={1} step={1} />
              <Num label="One-way length" value={s.lengthFt} onChange={(lengthFt) => set({ lengthFt })} unit="ft" min={0} />
            </Row>
            <Select label="Branch protective device" value={s.device} onChange={(device) => set({ device })} options={DEVICES} />
          </Panel>
        </div>
        <div>
          {!ok ? <Note tone="err">Table {s.phase === 1 ? '430.248' : '430.250'} lists no full-load current for {s.hp} hp at {s.volts} V. Pick another voltage or horsepower.</Note> : (
            <>
              <Stats>
                <Stat label={`Table FLC (${s.phase === 1 ? '430.248' : '430.250'})`} value={amps(r.flc)} sub={`${s.hp} hp · ${s.volts} V · ${s.phase}φ`} />
                <Stat label="Branch conductors" value={r.cond.gauge?.size ?? '—'} sub={`≥ ${amps(r.condReq)} (125 %)`} tone="accent" />
                <Stat label={devName} value={s.device === 'inst' ? `≤ ${amps(dev.std)}` : `${dev.std} A`} sub={`${dev.pct} % of FLC`} />
                <Stat label="Overload trip" value={amps(r.overload.amps)} sub={`${r.overload.pct} % of nameplate`} />
              </Stats>
              <Panel title="Branch circuit" actions={<CopyButton text={summary} label="Copy summary" />}>
                <Table
                  head={['Item', 'Rule', 'Result']}
                  rows={[
                    ['Full-load current', s.phase === 1 ? 'Table 430.248' : 'Table 430.250', amps(r.flc)],
                    ['Conductor ampacity', '430.22: 125 % × FLC', `≥ ${amps(r.condReq)}`],
                    ['Conductor size', `Table 310.16, limited by ${r.cond.limit}`, r.cond.gauge ? `${r.cond.gauge.size} ${s.material === 'cu' ? 'Cu' : 'Al'}, ${amps(r.cond.ampacity)}` : r.cond.limit],
                    ['Overload relay', `430.32(A)(1): ${r.overload.pct} %; 430.32(C) up to ${r.overload.maxPct} % if it trips on start`, `${amps(r.overload.amps)} (max ${amps(r.overload.maxAmps)})`],
                    ['Disconnect', '430.110: ≥ 115 % × FLC, hp-rated', `≥ ${amps(r.disconnect)}`],
                    ['Equipment ground', 'Table 250.122 (by inverse-time breaker size)', r.egc],
                    ['Voltage drop at FLC', `${s.lengthFt} ft one way`, Number.isFinite(r.vd) ? `${num(r.vd, 2)} V (${num(r.vdPct, 2)} %)${r.vdPct > 3 ? ' — above 3 %, consider upsizing' : ''}` : '—'],
                  ]}
                />
              </Panel>
              <Panel title="Short-circuit & ground-fault protection (430.52)">
                <Table
                  head={['Device', 'Max % FLC', 'Calculated', 'Use (Ex. 1: next standard up)', 'Starting-trouble limit (Ex. 2)']}
                  rows={r.ocpd.map((o) => [
                    <b key="d" style={{ color: o.d === s.device ? 'var(--accent)' : undefined }}>{o.name}</b>, `${o.pct} %`, amps(o.calc),
                    o.d === 'inst' ? `setting ≤ ${amps(o.std)}` : `${o.std} A`, o.d === 'inst' ? `≤ ${amps(o.ex2Max)}` : `${o.ex2Max} A`,
                  ])}
                />
                <p className="muted" style={{ fontSize: 12 }}>Instantaneous-trip breakers are allowed only when adjustable and part of a listed combination motor controller (430.52(C)(3)). Ex. 2 limits (non-time-delay fuses 400 %, time-delay fuses 225 %, inverse-time breakers 400 % ≤ 100 A / 300 % above) apply only when the Ex. 1 size cannot carry the starting current.</p>
              </Panel>
            </>
          )}
          <Panel title="Feeder for several motors (430.24 / 430.62)" actions={<Btn onClick={() => set({ motors: [...s.motors, { id: uid(), hp: hps[Math.min(5, hps.length - 1)], type: 'sq' }] })}>+ Motor</Btn>}>
            <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>Same {s.volts} V {s.phase}-phase system, branch protection by {devName.toLowerCase()}.</p>
            <Table
              head={['Motor', 'Type', 'FLC', 'Branch OCPD', '']}
              rows={fm.map((m) => [
                <select key="h" className="k-select" value={m.hp} onChange={(e) => set({ motors: s.motors.map((x) => (x.id === m.id ? { ...x, hp: e.target.value } : x)) })}>{hps.map((h) => <option key={h} value={h}>{h} hp</option>)}</select>,
                <select key="t" className="k-select" value={m.type} onChange={(e) => set({ motors: s.motors.map((x) => (x.id === m.id ? { ...x, type: e.target.value as MotorType } : x)) })}>{MOTOR_TYPES.map(([v, l]) => <option key={v} value={v}>{l.split(' (')[0].split(' /')[0]}</option>)}</select>,
                amps(m.I), Number.isFinite(m.branch) ? `${num(m.branch, 1)} A` : '—',
                <Btn key="x" kind="ghost" onClick={() => set({ motors: s.motors.filter((x) => x.id !== m.id) })}>✕</Btn>,
              ])}
            />
            {valid.length > 0 && (
              <Table
                head={['Feeder item', 'Rule', 'Result']}
                rows={[
                  ['Conductor ampacity', '430.24: 125 % largest FLC + other FLCs', `≥ ${amps(fd.ampacity)} → ${fcond.gauge?.size ?? '—'}`],
                  ['Max feeder OCPD', '430.62(A): largest branch device + other FLCs', `${amps(fd.ocpdMax)} → ${Number.isFinite(fd.ocpdStd) ? `${fd.ocpdStd} A` : '—'} (next standard size down)`],
                ]}
              />
            )}
            {fm.some((m) => !Number.isFinite(m.I)) && <Note tone="warn">Some motors have no table FLC at {s.volts} V and are left out.</Note>}
          </Panel>
        </div>
      </Split>
    </>
  )
}
