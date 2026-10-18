import { useEffect, useState } from 'react'
import { BarChart, Btn, CsvButton, Donut, JsonButtons, money, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { meetingCost, perYear, THINGS, whatIf, type Freq, type Meeting, type Role, type Settings } from './lib/meeting-cost-calculator'

interface S { currency: string; set: Settings; roles: Role[]; meetings: Meeting[]; sel: string; cut: number; drop: number }
const DEF: S = {
  currency: '$',
  set: { mode: 'annual', hoursPerYear: 1880, overhead: 30, switchMin: 10, weeksPerYear: 46 },
  roles: [
    { id: 'eng', name: 'Engineer', salary: 135000 },
    { id: 'des', name: 'Designer', salary: 115000 },
    { id: 'pm', name: 'Product manager', salary: 150000 },
    { id: 'mgr', name: 'Director', salary: 210000 },
  ],
  meetings: [
    { id: 'standup', name: 'Daily stand-up', freq: 'daily', minutes: 15, prep: 0, attendees: { eng: 6, des: 1, pm: 1 } },
    { id: 'plan', name: 'Sprint planning', freq: 'biweekly', minutes: 90, prep: 15, attendees: { eng: 6, des: 1, pm: 1, mgr: 1 } },
    { id: 'retro', name: 'Retrospective', freq: 'biweekly', minutes: 60, prep: 0, attendees: { eng: 6, des: 1, pm: 1 } },
    { id: 'sync', name: 'Weekly leadership sync', freq: 'weekly', minutes: 60, prep: 20, attendees: { pm: 3, mgr: 4 } },
    { id: 'allhands', name: 'All-hands', freq: 'monthly', minutes: 60, prep: 0, attendees: { eng: 30, des: 6, pm: 5, mgr: 6 } },
    { id: 'oneone', name: '1:1s (manager × 8)', freq: 'weekly', minutes: 240, prep: 0, attendees: { mgr: 1, eng: 1 } },
  ],
  sel: 'plan', cut: 25, drop: 1,
}
const FREQ: [Freq, string][] = [['once', 'One-off'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly']]
const clock = (ms: number) => { const t = Math.floor(ms / 1000); return `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }

export default function MeetingCostCalculator() {
  const [s, set, reset] = useToolState('meeting-cost-calculator', DEF)
  const [run, setRun] = useState<{ start: number | null; acc: number }>({ start: null, acc: 0 })
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (run.start === null) return
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [run.start])
  const elapsed = run.acc + (run.start !== null ? Math.max(0, now - run.start) : 0)
  const m = (x: number, d = 0) => money(x, s.currency, d)
  const sel = s.meetings.find((x) => x.id === s.sel) ?? s.meetings[0]
  const costs = s.meetings.map((x) => ({ x, c: meetingCost(x, s.roles, s.set) }))
  const c = sel ? meetingCost(sel, s.roles, s.set) : null
  const live = c ? c.perMinute * (elapsed / 60000) + (elapsed > 0 ? c.switching + c.prep : 0) : 0
  const totalAnnual = costs.reduce((a, k) => a + k.c.annual, 0)
  const totalHours = costs.reduce((a, k) => a + k.c.annualHours, 0)
  const wi = sel ? whatIf(sel, s.roles, s.set, s.cut, s.drop) : null
  const saving = c && wi ? c.annual - wi.annual : 0
  const thing = [...THINGS].reverse().find(([, p]) => live / p >= 1) ?? THINGS[0]
  const upM = (id: string, p: Partial<Meeting>) => set({ meetings: s.meetings.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const over = sel && elapsed / 60000 > sel.minutes

  return (
    <Split wide="right">
      <div>
        <Panel title="⏱ Live meeting meter" actions={<Select label="Meeting" value={sel?.id ?? ''} onChange={(id) => { set({ sel: id }); setRun({ start: null, acc: 0 }) }} options={s.meetings.map((x) => [x.id, x.name] as [string, string])} />}>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 'clamp(40px, 9vw, 64px)', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: over ? 'var(--err)' : 'var(--accent)' }}>{m(live, 2)}</div>
            <div className="muted" style={{ fontVariantNumeric: 'tabular-nums' }}>{clock(elapsed)} elapsed · {c ? m(c.perMinute, 2) : '—'} per minute · {c?.people ?? 0} people</div>
            {c && <div style={{ height: 8, background: 'var(--line)', borderRadius: 4, margin: '10px 0', overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(100, (elapsed / 60000 / (sel!.minutes || 1)) * 100)}%`, background: over ? 'var(--err)' : 'var(--accent)', transition: 'width .1s' }} /></div>}
            {elapsed > 0 && <div style={{ fontSize: 14 }}>That is about <b>{(live / thing[1]).toFixed(1)} {thing[0]}</b>{over ? ` — ${Math.round(elapsed / 60000 - sel!.minutes)} min over the plan` : ''}</div>}
          </div>
          <Row>
            {run.start === null
              ? <Btn kind="primary" onClick={() => { const t = Date.now(); setNow(t); setRun({ start: t, acc: run.acc }) }}>{run.acc ? '▶ Resume' : '▶ Start meeting'}</Btn>
              : <Btn onClick={() => setRun({ start: null, acc: elapsed })}>⏸ Pause</Btn>}
            <Btn kind="ghost" onClick={() => setRun({ start: null, acc: 0 })}>↺ Reset</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>When you press Start, the meter jumps to the prep and context-switch cost already spent, then adds the per-minute burn rate of everyone in the room.</p>
        </Panel>

        {sel && (
          <Panel title={`Edit: ${sel.name}`}>
            <Row>
              <label className="k-field" style={{ flex: 2 }}><span className="k-label">Name</span><input className="k-text" value={sel.name} onChange={(e) => upM(sel.id, { name: e.target.value })} /></label>
              <Select label="Repeats" value={sel.freq} onChange={(freq) => upM(sel.id, { freq })} options={FREQ} />
            </Row>
            <Row>
              <Num label="Duration" value={sel.minutes} onChange={(minutes) => upM(sel.id, { minutes: Math.max(1, minutes) })} unit="min" min={1} />
              <Num label="Prep per person" value={sel.prep} onChange={(prep) => upM(sel.id, { prep: Math.max(0, prep) })} unit="min" min={0} />
            </Row>
            <Table head={['Role', 'Attendees', 'Loaded rate']} rows={s.roles.map((r) => [r.name,
              <input key="n" type="number" min={0} value={sel.attendees[r.id] ?? 0} style={{ width: 70 }} onChange={(e) => upM(sel.id, { attendees: { ...sel.attendees, [r.id]: Math.max(0, Math.round(+e.target.value || 0)) } })} aria-label={`${r.name} attendees`} />,
              `${m((s.set.mode === 'annual' ? r.salary / s.set.hoursPerYear : r.salary) * (1 + s.set.overhead / 100), 0)}/h`])} />
            <Row>
              <Btn kind="danger" onClick={() => set({ meetings: s.meetings.filter((x) => x.id !== sel.id), sel: s.meetings[0]?.id ?? '' })}>Delete meeting</Btn>
            </Row>
          </Panel>
        )}

        <Panel title="Assumptions" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Select label="Pay entered as" value={s.set.mode} onChange={(mode) => set({ set: { ...s.set, mode } })} options={[['annual', 'Annual salary'], ['hourly', 'Hourly rate']] as const} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', 'CHF ', '¥']} />
          </Row>
          <Row>
            <Num label="Paid hours / year" value={s.set.hoursPerYear} onChange={(hoursPerYear) => set({ set: { ...s.set, hoursPerYear: Math.max(1, hoursPerYear) } })} min={1} hint="2080 minus holidays & PTO" />
            <Num label="Working weeks / year" value={s.set.weeksPerYear} onChange={(weeksPerYear) => set({ set: { ...s.set, weeksPerYear: Math.max(1, Math.min(52, weeksPerYear)) } })} min={1} max={52} />
          </Row>
          <Slider label="Overhead (benefits, taxes, office)" value={s.set.overhead} onChange={(overhead) => set({ set: { ...s.set, overhead } })} min={0} max={100} unit="%" show={(v) => String(v)} />
          <Slider label="Focus lost per meeting (context switch)" value={s.set.switchMin} onChange={(switchMin) => set({ set: { ...s.set, switchMin } })} min={0} max={30} unit=" min" show={(v) => String(v)} />
          <Table head={['Role', s.set.mode === 'annual' ? 'Salary / yr' : 'Rate / h', '']} rows={s.roles.map((r) => [
            <input key="n" value={r.name} onChange={(e) => set({ roles: s.roles.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)) })} aria-label="Role" />,
            <input key="s" type="number" min={0} value={r.salary} style={{ width: 110 }} onChange={(e) => set({ roles: s.roles.map((x) => (x.id === r.id ? { ...x, salary: Math.max(0, +e.target.value || 0) } : x)) })} aria-label="Salary" />,
            <Btn key="x" kind="ghost" onClick={() => set({ roles: s.roles.filter((x) => x.id !== r.id) })}>✕</Btn>])} />
          <Btn onClick={() => set({ roles: [...s.roles, { id: uid(), name: 'New role', salary: s.set.mode === 'annual' ? 90000 : 45 }] })}>+ Role</Btn>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="This meeting" value={c ? m(c.total) : '—'} sub={c ? `${c.personHours.toFixed(1)} person-hours each time` : ''} tone="accent" />
          <Stat label="Per year" value={c ? m(c.annual) : '—'} sub={sel ? `${perYear(sel.freq, s.set.weeksPerYear)}× · ${c?.annualHours.toFixed(0)} h` : ''} />
          <Stat label="All meetings / year" value={m(totalAnnual)} sub={`${Math.round(totalHours).toLocaleString()} person-hours ≈ ${(totalHours / s.set.hoursPerYear).toFixed(1)} FTE`} tone="bad" />
          <Stat label="What-if saving" value={m(saving)} sub="per year, this meeting" tone="good" />
        </Stats>

        <Panel title="Meeting portfolio" actions={<>
          <Btn onClick={() => { const id = uid(); set({ meetings: [...s.meetings, { id, name: 'New meeting', freq: 'weekly', minutes: 30, prep: 0, attendees: { [s.roles[0]?.id ?? 'x']: 3 } }], sel: id }) }}>+ Meeting</Btn>
          <CsvButton name="meeting-costs.csv" rows={() => [['Meeting', 'Frequency', 'Minutes', 'People', 'Cost per meeting', 'Per year', 'Person-hours / yr'], ...costs.map(({ x, c: k }) => [x.name, x.freq, x.minutes, k.people, Math.round(k.total), Math.round(k.annual), Math.round(k.annualHours)])]} />
          <JsonButtons name="meetings.json" data={s} onLoad={(d) => set(d)} />
        </>}>
          <Table
            head={['Meeting', 'Repeats', 'People', 'Per meeting', 'Per year', '']}
            rows={costs.sort((a, b) => b.c.annual - a.c.annual).map(({ x, c: k }) => [
              <b key="n">{x.name}</b>, FREQ.find((f) => f[0] === x.freq)?.[1], k.people, m(k.total), m(k.annual),
              <Btn key="e" kind={x.id === sel?.id ? 'primary' : 'ghost'} onClick={() => set({ sel: x.id })}>{x.id === sel?.id ? 'Selected' : 'Select'}</Btn>,
            ])}
            foot={['Total', '', '', '', m(totalAnnual), '']}
          />
          <BarChart bars={costs.map(({ x, c: k }) => ({ label: x.name, value: Math.round(k.annual) }))} fy={(v) => m(v)} height={220} />
        </Panel>

        {c && wi && sel && (
          <Panel title={`What if… (${sel.name})`}>
            <Row>
              <Slider label="Shorten by" value={s.cut} onChange={(cut) => set({ cut })} min={0} max={75} step={5} unit="%" show={(v) => String(v)} />
              <Slider label="Remove optional attendees" value={s.drop} onChange={(drop) => set({ drop })} min={0} max={Math.max(0, c.people - 1)} show={(v) => String(v)} />
            </Row>
            <Row>
              <Donut slices={[{ label: 'Meeting time', value: c.meeting }, { label: 'Prep', value: c.prep }, { label: 'Context switching', value: c.switching }]} fv={(v) => m(v)} size={180} center={<span>{m(c.total)}</span>} />
              <div style={{ flex: 1, minWidth: 220 }}>
                <Note tone="ok">
                  {sel.minutes} → {Math.max(5, Math.round(sel.minutes * (1 - s.cut / 100)))} min with {wi.people} people: <b>{m(wi.total)}</b> per meeting instead of {m(c.total)}.<br />
                  Saves <b>{m(saving)}</b> and <b>{Math.round(c.annualHours - wi.annualHours)}</b> person-hours a year.
                </Note>
                <p className="muted" style={{ fontSize: 13 }}>Removing seats starts with the highest-paid role that still has more than one attendee. Consider sending notes to optional attendees instead.</p>
              </div>
            </Row>
          </Panel>
        )}
      </div>
    </Split>
  )
}
