import { Btn, Check, Note, num, Num, Panel, Row, Seg, Split, useToolState } from '../kit'
import { advise, BELT_HEIGHT_IN, cmToIn, DEFAULT_LIMITS, inToCm, kgToLb, type Limits, lbToKg, type Stage } from './lib/car-seat-stage-guide'

interface State { unit: 'us' | 'metric'; years: number; months: number; weightLb: number; heightIn: number; limits: Limits; fit: boolean[] }
const DEF: State = { unit: 'us', years: 3, months: 4, weightLb: 33, heightIn: 38, limits: DEFAULT_LIMITS, fit: [false, false, false, false, false] }

const STAGES: { id: Stage; icon: string; name: string; who: string; tips: string[] }[] = [
  { id: 'rear', icon: '↩️', name: 'Rear-facing seat', who: 'Infants and toddlers — as long as possible', tips: ['Infant-only or convertible seat, in the back seat.', 'Harness straps at or below the shoulders; chest clip at armpit level.', 'Never in front of an active airbag.', 'Bent legs touching the vehicle seat are fine and comfortable.'] },
  { id: 'forward', icon: '➡️', name: 'Forward-facing with harness', who: 'Toddlers and preschoolers who outgrew rear-facing limits', tips: ['Always use the top tether.', 'Harness straps at or above the shoulders.', 'Pinch test: no slack at the collarbone.', 'Keep using the harness until the seat’s highest weight or height.'] },
  { id: 'booster', icon: '⬆️', name: 'Booster seat', who: 'School-age children who outgrew the harness', tips: ['Belt-positioning booster with the vehicle lap-and-shoulder belt.', 'Lap belt low across the upper thighs; shoulder belt mid-chest.', 'High-back boosters help in cars without head restraints.', 'Never use with a lap-only belt.'] },
  { id: 'belt', icon: '🔒', name: 'Seat belt', who: 'Older children whom the adult belt fits (≈ 4 ft 9 in)', tips: ['Lap-and-shoulder belt every ride; never behind the back.', 'Back seat until age 13.', 'Re-check fit in each vehicle.'] },
]

const FIT = [
  'Sits all the way back against the vehicle seat',
  'Knees bend naturally at the edge of the seat',
  'Lap belt lies low across the upper thighs, not the belly',
  'Shoulder belt crosses the middle of the chest and shoulder, not the neck',
  'Can stay seated like this for the whole trip',
]

const PRESETS: [string, Partial<State>][] = [
  ['Newborn', { years: 0, months: 1, weightLb: 9, heightIn: 21 }],
  ['1 year', { years: 1, months: 0, weightLb: 21, heightIn: 30 }],
  ['3 years', { years: 3, months: 4, weightLb: 33, heightIn: 38 }],
  ['5 years', { years: 5, months: 0, weightLb: 44, heightIn: 43 }],
  ['8 years', { years: 8, months: 0, weightLb: 67, heightIn: 50 }],
  ['11 years', { years: 11, months: 0, weightLb: 80, heightIn: 58 }],
]

export default function CarSeatStageGuide() {
  const [s, set, reset] = useToolState('car-seat-stage-guide', DEF)
  const us = s.unit === 'us'
  const ageMonths = s.years * 12 + s.months
  const a = advise({ ageMonths, weightLb: s.weightLb, heightIn: s.heightIn }, s.limits, s.fit.every(Boolean))
  const lim = (p: Partial<Limits>) => set({ limits: { ...s.limits, ...p } })
  const W = (lb: number) => (us ? `${num(lb, 0)} lb` : `${num(lbToKg(lb), 1)} kg`)
  const H = (inch: number) => (us ? `${num(inch, 1)} in` : `${num(inToCm(inch), 0)} cm`)
  const wIn = (lb: number) => (us ? +lb.toFixed(1) : +lbToKg(lb).toFixed(1))
  const hIn = (i: number) => (us ? +i.toFixed(1) : +inToCm(i).toFixed(0))
  const wOut = (v: number) => (us ? v : kgToLb(v))
  const hOut = (v: number) => (us ? v : cmToIn(v))
  const idx = STAGES.findIndex((x) => x.id === a.stage)

  return (
    <Split>
      <div>
        <Panel title="Child" actions={<Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['us', 'lb / in'], ['metric', 'kg / cm']]} />}>
          <Row>{PRESETS.map(([n, p]) => <Btn key={n} kind="ghost" onClick={() => set(p)}>{n}</Btn>)}</Row>
          <Row>
            <Num label="Age (years)" value={s.years} min={0} max={17} step={1} onChange={(years) => set({ years: Math.max(0, Math.round(years)) })} />
            <Num label="+ months" value={s.months} min={0} max={11} step={1} onChange={(months) => set({ months: Math.min(11, Math.max(0, Math.round(months))) })} />
          </Row>
          <Row>
            <Num label="Weight" value={wIn(s.weightLb)} min={0} unit={us ? 'lb' : 'kg'} onChange={(v) => set({ weightLb: wOut(v) })} />
            <Num label="Height" value={hIn(s.heightIn)} min={0} unit={us ? 'in' : 'cm'} onChange={(v) => set({ heightIn: hOut(v) })} />
          </Row>
        </Panel>
        <Panel title="Your seat’s limits (from its label/manual)" actions={<Btn kind="ghost" onClick={() => set({ limits: DEFAULT_LIMITS })}>Typical</Btn>}>
          <Row>
            <Num label="Rear-facing max weight" value={wIn(s.limits.rearMaxLb)} min={0} unit={us ? 'lb' : 'kg'} onChange={(v) => lim({ rearMaxLb: wOut(v) })} />
            <Num label="Rear-facing max height" value={hIn(s.limits.rearMaxIn)} min={0} unit={us ? 'in' : 'cm'} onChange={(v) => lim({ rearMaxIn: hOut(v) })} />
          </Row>
          <Row>
            <Num label="Harness max weight" value={wIn(s.limits.harnessMaxLb)} min={0} unit={us ? 'lb' : 'kg'} onChange={(v) => lim({ harnessMaxLb: wOut(v) })} />
            <Num label="Harness max height" value={hIn(s.limits.harnessMaxIn)} min={0} unit={us ? 'in' : 'cm'} onChange={(v) => lim({ harnessMaxIn: hOut(v) })} />
          </Row>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Defaults ({W(DEFAULT_LIMITS.rearMaxLb)} / {H(DEFAULT_LIMITS.rearMaxIn)} rear-facing, {W(DEFAULT_LIMITS.harnessMaxLb)} / {H(DEFAULT_LIMITS.harnessMaxIn)} harness) are only common example values. Many seats differ — enter the numbers printed on yours.</p>
        </Panel>
        <Panel title="5-step seat-belt fit test" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          {FIT.map((f, i) => <Check key={f} label={`${i + 1}. ${f}`} value={s.fit[i] ?? false} onChange={(v) => set({ fit: s.fit.map((x, j) => (j === i ? v : x)) })} />)}
          <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>Do this in the actual vehicle without a booster. All five must be true; until then keep using the booster.</p>
        </Panel>
      </div>

      <div>
        <Panel title="Suggested stage">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
            {STAGES.map((st, i) => (
              <div key={st.id} style={{ border: `2px solid ${i === idx ? 'var(--accent)' : 'var(--line)'}`, background: i === idx ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--panel2)', borderRadius: 12, padding: 10, opacity: i < idx ? 0.55 : 1 }}>
                <div style={{ fontSize: 24 }}>{st.icon}</div>
                <b>{i + 1}. {st.name}</b>
                <div className="muted" style={{ fontSize: 12 }}>{i < idx ? 'outgrown' : i === idx ? 'current stage' : 'later'}</div>
              </div>
            ))}
          </div>
          <h3 style={{ margin: '4px 0' }}>{STAGES[idx].icon} {STAGES[idx].name}</h3>
          <p className="muted" style={{ marginTop: 0 }}>{STAGES[idx].who}</p>
          <ul style={{ paddingLeft: 20, lineHeight: 1.5 }}>{a.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          {a.warnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}
          <Note>Next step: {a.next}</Note>
          <h4 style={{ marginBottom: 4 }}>Checklist for this stage</h4>
          <ul style={{ paddingLeft: 20, lineHeight: 1.5, marginTop: 0 }}>{STAGES[idx].tips.map((t) => <li key={t}>{t}</li>)}</ul>
          {ageMonths < 156 && <Note tone="ok">🪑 Back seat: children under 13 should ride in the back seat.</Note>}
          <p className="muted" style={{ fontSize: 13 }}>Belt height mark: {H(BELT_HEIGHT_IN)} — {s.heightIn >= BELT_HEIGHT_IN ? 'reached.' : `${H(BELT_HEIGHT_IN - s.heightIn)} to go.`}</p>
        </Panel>
        <Note tone="warn">
          <b>Informational only.</b> This guide summarises the general stages recommended by the American Academy of Pediatrics (AAP) and the US National Highway Traffic Safety Administration (NHTSA). It does not evaluate any specific product. Always follow your car seat’s manual and labels, your vehicle owner’s manual and the child-restraint laws where you drive — they may set stricter or different rules. A certified child passenger safety technician can check your installation.
        </Note>
      </div>
    </Split>
  )
}
