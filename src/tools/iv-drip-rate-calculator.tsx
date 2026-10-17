import { useState } from 'react'
import { fmt, Note, Num, Panel, Row, Select, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { doseToMlHr, durationMin, gttPerMin, hm, mlHrFromGtt, mlPerHour } from './lib/iv-drip-rate-calculator'

type Mode = 'rate' | 'time' | 'gtt' | 'dose'
type DoseUnit = 'mcg/kg/min' | 'mg/kg/hr' | 'mcg/min' | 'mg/hr' | 'units/hr'

const DEF = {
  mode: 'rate' as Mode,
  volume: 1000,
  hours: 8,
  minutes: 0,
  rate: 125,
  gtt: 31,
  dropFactor: 15,
  start: '',
  dose: 5,
  doseUnit: 'mcg/kg/min' as DoseUnit,
  weight: 80,
  drug: 400,
  bag: 250,
}
const FACTORS: [string, string][] = [['10', '10 gtt/mL'], ['15', '15 gtt/mL'], ['20', '20 gtt/mL'], ['60', '60 (micro)']]
const PRESETS: [string, Partial<typeof DEF>][] = [
  ['1 L NS over 8 h', { mode: 'rate', volume: 1000, hours: 8, minutes: 0, dropFactor: 15 }],
  ['Antibiotic 100 mL / 30 min', { mode: 'rate', volume: 100, hours: 0, minutes: 30, dropFactor: 20 }],
  ['Paediatric 250 mL @ 40 mL/h', { mode: 'time', volume: 250, rate: 40, dropFactor: 60 }],
  ['Dopamine 5 mcg/kg/min', { mode: 'dose', dose: 5, doseUnit: 'mcg/kg/min', weight: 80, drug: 400, bag: 250, volume: 250, dropFactor: 60 }],
  ['Heparin 1000 units/h', { mode: 'dose', dose: 1000, doseUnit: 'units/hr', drug: 25000, bag: 500, volume: 500, dropFactor: 60 }],
]

const toMin = (t: string) => {
  const m = t.match(/^(\d{1,2}):(\d{2})$/)
  return m ? +m[1] * 60 + +m[2] : NaN
}
const clock = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  const days = Math.floor(Math.round(min) / 1440)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}${days > 0 ? ` (+${days} d)` : ''}`
}

export default function IvDripRateCalculator() {
  const [s, set, reset] = useToolState('iv-drip-rate-calculator', DEF)
  const [nowStr] = useState(() => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })
  const start = /^\d{1,2}:\d{2}$/.test(s.start) ? s.start : nowStr
  const df = s.dropFactor

  const mlHr =
    s.mode === 'rate' ? mlPerHour(s.volume, s.hours * 60 + s.minutes)
    : s.mode === 'time' ? s.rate
    : s.mode === 'gtt' ? mlHrFromGtt(s.gtt, df)
    : doseToMlHr(s.dose, s.doseUnit, s.weight, s.drug, s.bag)
  const gtt = gttPerMin(mlHr, df)
  const dur = durationMin(s.volume, mlHr)
  const valid = Number.isFinite(mlHr) && mlHr > 0 && s.volume > 0
  const end = toMin(start) + dur
  const secPerDrop = gtt > 0 ? 60 / gtt : NaN
  const conc = s.drug / s.bag

  const schedule: (string | number)[][] = []
  if (valid && Number.isFinite(dur)) {
    const step = dur > 24 * 60 ? 240 : dur > 6 * 60 ? 60 : dur > 120 ? 30 : 15
    for (let t = step; t < dur && schedule.length < 48; t += step) schedule.push([clock(toMin(start) + t), hm(t), fmt((mlHr * t) / 60, 4), fmt(s.volume - (mlHr * t) / 60, 4)])
    schedule.push([clock(end), hm(dur), fmt(s.volume, 4), '0'])
  }
  const drop = Math.max(0.15, Math.min(4, secPerDrop))

  return (
    <Split>
      <div>
        <Panel title="What do you know?">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['rate', 'Volume + time'], ['time', 'Volume + mL/hr'], ['gtt', 'Counted drops'], ['dose', 'Dose-based']]} />
          <div style={{ marginTop: 12 }}>
            <Num label="Volume to infuse" value={s.volume} onChange={(volume) => set({ volume })} unit="mL" min={0} />
            {s.mode === 'rate' && (
              <Row>
                <Num label="Hours" value={s.hours} onChange={(hours) => set({ hours: Math.max(0, hours) })} unit="h" min={0} />
                <Num label="Minutes" value={s.minutes} onChange={(minutes) => set({ minutes: Math.max(0, minutes) })} unit="min" min={0} />
              </Row>
            )}
            {s.mode === 'time' && <Num label="Ordered rate" value={s.rate} onChange={(rate) => set({ rate })} unit="mL/hr" min={0} />}
            {s.mode === 'gtt' && <Num label="Drops counted per minute" value={s.gtt} onChange={(g) => set({ gtt: g })} unit="gtt/min" min={0} hint="Count for 15 s and multiply by 4" />}
            {s.mode === 'dose' && (
              <>
                <Row>
                  <Num label="Ordered dose" value={s.dose} onChange={(dose) => set({ dose })} min={0} />
                  <Select label="Dose unit" value={s.doseUnit} onChange={(doseUnit) => set({ doseUnit })} options={['mcg/kg/min', 'mg/kg/hr', 'mcg/min', 'mg/hr', 'units/hr'] as const} />
                </Row>
                {s.doseUnit.includes('/kg') && <Num label="Patient weight" value={s.weight} onChange={(weight) => set({ weight })} unit="kg" min={0} />}
                <Row>
                  <Num label={s.doseUnit === 'units/hr' ? 'Drug in bag (units)' : 'Drug in bag (mg)'} value={s.drug} onChange={(drug) => set({ drug })} min={0} />
                  <Num label="Bag volume" value={s.bag} onChange={(bag) => set({ bag })} unit="mL" min={0} />
                </Row>
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>Concentration: <b>{fmt(conc, 4)} {s.doseUnit === 'units/hr' ? 'units' : 'mg'}/mL</b>{s.doseUnit !== 'units/hr' && ` (${fmt(conc * 1000, 4)} mcg/mL)`}</p>
              </>
            )}
          </div>
        </Panel>
        <Panel title="Administration set">
          <Seg value={String(df)} onChange={(v) => set({ dropFactor: +v })} options={FACTORS} />
          <div style={{ marginTop: 10 }}>
            <Num label="Drop factor (custom)" value={df} onChange={(dropFactor) => set({ dropFactor: Math.max(1, dropFactor) })} unit="gtt/mL" min={1} hint="Printed on the tubing package. Macrodrip 10–20, microdrip 60." />
          </div>
          <Txt label="Start time" type="time" value={start} onChange={(v) => set({ start: v })} />
        </Panel>
        <Panel title="Examples">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PRESETS.map(([n, p]) => (
              <button key={n} className="k-btn ghost" onClick={() => set(p)}>{n}</button>
            ))}
            <button className="k-btn ghost" onClick={reset}>Reset</button>
          </div>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Pump rate" value={valid ? `${fmt(mlHr, 4)} mL/hr` : '—'} tone="accent" />
          <Stat label="Drip rate" value={valid ? `${Math.round(gtt)} gtt/min` : '—'} sub={valid ? `exact ${fmt(gtt, 4)} · ${fmt(gtt / 4, 3)} per 15 s` : ''} tone="accent" />
          <Stat label="Duration" value={valid ? hm(dur) : '—'} />
          <Stat label="Finishes at" value={valid ? clock(end) : '—'} sub={`started ${start}`} />
        </Stats>
        {!valid && <Note tone="warn">Enter a volume and a duration or rate greater than zero.</Note>}
        {valid && gtt > 100 && df > 20 && <Note tone="warn">Over 100 drops per minute is too fast to count reliably. Use an infusion pump.</Note>}
        {valid && gtt < 5 && <Note tone="warn">Under 5 drops per minute risks the line clotting with a gravity set. Consider a microdrip set or a pump.</Note>}
        <Panel title="Drip chamber">
          <Row wrap={false}>
            <svg viewBox="0 0 120 220" width={120} height={220} aria-label="Animated drip chamber">
              <style>{`@keyframes ivdrop{0%{transform:translateY(0);opacity:1}80%{opacity:1}100%{transform:translateY(105px);opacity:0}}`}</style>
              <rect x={45} y={0} width={30} height={30} rx={4} fill="var(--line)" />
              <rect x={30} y={30} width={60} height={150} rx={14} fill="none" stroke="var(--muted)" strokeWidth={2} />
              <rect x={32} y={140} width={56} height={38} rx={12} fill="#60a5fa" opacity={0.5} />
              <rect x={57} y={30} width={6} height={12} fill="var(--muted)" />
              {valid && Number.isFinite(drop) && (
                <ellipse key={drop} cx={60} cy={46} rx={5} ry={7} fill="#3b82f6" style={{ animation: `ivdrop ${drop}s ease-in infinite` }} />
              )}
              <rect x={56} y={180} width={8} height={40} fill="var(--line)" />
            </svg>
            <div style={{ flex: 1 }}>
              <p style={{ marginTop: 0 }}>
                One drop every <b>{fmt(secPerDrop, 3)} s</b>. Adjust the roller clamp until you count <b>{Math.round(gtt / 4)}</b> drops in 15 seconds
                {gtt > 0 && gtt < 20 ? <> (or <b>{Math.round(gtt)}</b> in a full minute)</> : null}.
              </p>
              <Table
                head={['Formula', 'Value']}
                rows={[
                  ['mL/hr = volume ÷ hours', `${fmt(s.volume, 5)} ÷ ${fmt(dur / 60, 4)} = ${fmt(mlHr, 4)}`],
                  ['gtt/min = mL/hr × drop factor ÷ 60', `${fmt(mlHr, 4)} × ${df} ÷ 60 = ${fmt(gtt, 4)}`],
                  ['time = volume ÷ mL/hr', `${fmt(s.volume, 5)} ÷ ${fmt(mlHr, 4)} = ${fmt(dur / 60, 4)} h`],
                ]}
              />
            </div>
          </Row>
          {drop !== secPerDrop && valid && <p className="muted" style={{ fontSize: 12 }}>Animation speed is clamped for display.</p>}
        </Panel>
        {schedule.length > 0 && (
          <Panel title="Infusion schedule">
            <Table head={['Clock', 'Elapsed', 'Infused (mL)', 'Remaining (mL)']} rows={schedule} max={24} />
          </Panel>
        )}
        <Note>For education and double-checking only. Always follow the prescriber's order, your facility's protocol and the pump's drug library.</Note>
      </div>
    </Split>
  )
}
