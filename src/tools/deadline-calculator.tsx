import { useMemo, useState } from 'react'
import { Area, Btn, Check, CsvButton, download, Note, Panel, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { add, businessBetween, countDays, dow, parseCustom, toDate, toIcs, ukEnglandWales, usFederal, type Cal, type Holiday, type Mode } from './lib/deadline-calculator'

interface Rule { id: string; name: string; n: number; mode: Mode }
type Region = 'us' | 'uk' | 'both' | 'none'
const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const DEF = {
  trigger: todayIso(), triggerName: 'Complaint served', region: 'us' as Region, weekend: '06', custom: '# YYYY-MM-DD Name (one per line)\n', includeStart: false, rollForward: true, remind: '1, 7',
  rules: [
    { id: 'a', name: 'Answer due', n: 21, mode: 'calendar' },
    { id: 'b', name: 'Initial disclosures', n: 30, mode: 'calendar' },
    { id: 'c', name: 'Invoice payment (10 business days)', n: 10, mode: 'business' },
    { id: 'd', name: 'Reply to notice', n: 5, mode: 'business' },
    { id: 'e', name: 'Pre-filing notice (before trigger)', n: -14, mode: 'calendar' },
  ] as Rule[],
  from: todayIso(), to: add(todayIso(), 30),
}
const WEEKENDS: [string, string][] = [['06', 'Saturday + Sunday'], ['56', 'Friday + Saturday'], ['0', 'Sunday only'], ['', 'No weekend']]
const fmtD = (d: string) => toDate(d).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function DeadlineCalculator() {
  const [s, set, reset] = useToolState('deadline-calculator', DEF)
  const [focus, setFocus] = useState<string | null>(null)
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(s.trigger)
  const custom = useMemo(() => parseCustom(s.custom), [s.custom])
  const y0 = valid ? toDate(s.trigger).getUTCFullYear() : new Date().getFullYear()
  const cal: Cal = useMemo(() => {
    const hol = new Map<string, string>()
    for (let y = y0 - 1; y <= y0 + 3; y++) {
      const list: Holiday[] = [...(s.region === 'us' || s.region === 'both' ? usFederal(y) : []), ...(s.region === 'uk' || s.region === 'both' ? ukEnglandWales(y) : [])]
      for (const h of list) hol.set(h.date, hol.has(h.date) && hol.get(h.date) !== h.name ? `${hol.get(h.date)} / ${h.name}` : h.name)
    }
    for (const h of custom.list) hol.set(h.date, h.name)
    return { weekend: s.weekend.split('').filter(Boolean).map(Number), holidays: hol }
  }, [s.region, s.weekend, custom, y0])

  const results = valid ? s.rules.map((r) => ({ r, res: countDays(s.trigger, Math.round(r.n), cal, { mode: r.mode, includeStart: s.includeStart, rollForward: s.rollForward }) })) : []
  const sorted = [...results].sort((a, b) => a.res.due.localeCompare(b.res.due))
  const today = todayIso()
  const next = sorted.find((x) => x.res.due >= today)
  const edit = (id: string, p: Partial<Rule>) => set({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...p } : r)) })
  const remind = s.remind.split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 365)
  const ics = () =>
    toIcs(results.map(({ r, res }) => ({ date: res.due, title: r.name, desc: `${Math.abs(r.n)} ${r.mode} days ${r.n < 0 ? 'before' : 'after'} ${s.triggerName} (${s.trigger}).${res.rolled ? ` Moved from ${res.rawEnd} (weekend/holiday).` : ''} Verify with the applicable rules.` })), remind)

  // Calendar months covering the trigger and every deadline
  const focusRes = results.find((x) => x.r.id === focus) ?? null
  const span = valid && results.length ? [results.reduce((a, x) => (x.res.due < a ? x.res.due : a), s.trigger), results.reduce((a, x) => (x.res.due > a ? x.res.due : a), s.trigger)] : [s.trigger, s.trigger]
  const months: [number, number][] = []
  if (valid) {
    const a = toDate(span[0]), b = toDate(span[1])
    for (let y = a.getUTCFullYear(), m = a.getUTCMonth(); (y < b.getUTCFullYear() || (y === b.getUTCFullYear() && m <= b.getUTCMonth())) && months.length < 6; m === 11 ? (y++, (m = 0)) : m++) months.push([y, m])
  }
  const dueMap = new Map<string, string[]>()
  for (const { r, res } of results) dueMap.set(res.due, [...(dueMap.get(res.due) ?? []), r.name])
  const inFocus = (d: string) => focusRes && ((d > s.trigger && d <= focusRes.res.due) || (d < s.trigger && d >= focusRes.res.due))

  const between = /^\d{4}-\d{2}-\d{2}$/.test(s.from) && /^\d{4}-\d{2}-\d{2}$/.test(s.to) ? businessBetween(s.from, s.to, cal) : NaN
  const calDays = Number.isFinite(between) ? Math.round((toDate(s.to).getTime() - toDate(s.from).getTime()) / 86400000) : NaN
  const holidaysYear = [...cal.holidays].filter(([d]) => d.startsWith(String(y0))).sort()

  return (
    <Split>
      <div>
        <Panel title="Trigger event">
          <Row>
            <Txt label="Event" value={s.triggerName} onChange={(triggerName) => set({ triggerName })} />
            <Txt label="Date" type="date" value={s.trigger} onChange={(trigger) => set({ trigger })} />
          </Row>
          {valid && <p className="muted" style={{ margin: '0 0 6px' }}>{fmtD(s.trigger)}{cal.holidays.has(s.trigger) ? ` · ${cal.holidays.get(s.trigger)}` : ''}</p>}
          <Row>
            <Select label="Holidays" value={s.region} onChange={(region) => set({ region })} options={[['us', 'US federal'], ['uk', 'UK – England & Wales'], ['both', 'US + UK'], ['none', 'None (custom only)']]} />
            <Select label="Weekend" value={s.weekend} onChange={(weekend) => set({ weekend })} options={WEEKENDS} />
          </Row>
          <Check label="Count from the next day (exclude the trigger day)" value={!s.includeStart} onChange={(v) => set({ includeStart: !v })} />
          <Check label="If a calendar-day deadline lands on a weekend/holiday, move it to the next business day" value={s.rollForward} onChange={(rollForward) => set({ rollForward })} />
          <Area label="Custom holidays / closures" value={s.custom} onChange={(c) => set({ custom: c })} rows={3} mono />
          {custom.bad > 0 && <Note tone="warn">{custom.bad} line(s) not understood. Use YYYY-MM-DD followed by a name.</Note>}
        </Panel>
        <Panel title="Business days between dates">
          <Row>
            <Txt label="From" type="date" value={s.from} onChange={(from) => set({ from })} />
            <Txt label="To" type="date" value={s.to} onChange={(to) => set({ to })} />
          </Row>
          {Number.isFinite(between) && <p style={{ margin: 0 }}><b>{between}</b> business days · {calDays} calendar days <span className="muted">(start day excluded, end day included)</span></p>}
        </Panel>
        <Panel title={`Holidays in ${y0}`}>
          <Table head={['Date', 'Holiday']} rows={holidaysYear.map(([d, n]) => [fmtD(d), n])} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Deadlines" value={results.length} />
          <Stat label="Next upcoming" value={next ? fmtD(next.res.due).replace(/^\w+, /, '') : '—'} sub={next?.r.name} tone="accent" />
          <Stat label="Days until it" value={next ? Math.round((toDate(next.res.due).getTime() - toDate(today).getTime()) / 86400000) : '—'} sub="calendar days from today" />
          <Stat label="Moved off weekend/holiday" value={results.filter((x) => x.res.rolled).length} />
        </Stats>
        <Panel
          title="Deadlines"
          actions={
            <>
              <Btn onClick={() => set({ rules: [...s.rules, { id: uid(), name: 'New deadline', n: 10, mode: 'business' }] })}>+ Deadline</Btn>
              <CsvButton name="deadlines.csv" rows={() => [['Deadline', 'Days', 'Type', 'Due date', 'Unadjusted', 'Moved'], ...sorted.map(({ r, res }) => [r.name, r.n, r.mode, res.due, res.rawEnd, res.rolled ? 'yes' : ''])]} />
              <Btn kind="primary" onClick={() => download('deadlines.ics', ics(), 'text/calendar')} disabled={!results.length}>⬇ ICS</Btn>
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          {!valid && <Note tone="err">Enter a valid trigger date.</Note>}
          <Table
            head={['Deadline', 'Days (− = before)', 'Count', 'Due', '']}
            rows={results.map(({ r, res }) => [
              <input key="n" value={r.name} onChange={(e) => edit(r.id, { name: e.target.value })} aria-label="Deadline name" style={{ minWidth: 190 }} onFocus={() => setFocus(r.id)} />,
              <input key="d" type="number" value={r.n} onChange={(e) => edit(r.id, { n: Math.round(Number(e.target.value) || 0) })} aria-label="Days" style={{ width: 70 }} onFocus={() => setFocus(r.id)} />,
              <select key="m" value={r.mode} onChange={(e) => edit(r.id, { mode: e.target.value as Mode })} aria-label="Count type"><option value="calendar">Calendar</option><option value="business">Business</option></select>,
              <button key="due" type="button" onClick={() => setFocus(focus === r.id ? null : r.id)} style={{ all: 'unset', cursor: 'pointer', minWidth: 140 }}>
                <b style={{ color: res.due < today ? 'var(--muted)' : undefined }}>{fmtD(res.due)}</b>
                {res.rolled && <div className="muted" style={{ fontSize: 12 }}>moved from {fmtD(res.rawEnd).replace(/, \d{4}$/, '')} ({cal.holidays.get(res.rawEnd) ?? 'weekend'})</div>}
                {r.mode === 'business' && res.skipped.length > 0 && <div className="muted" style={{ fontSize: 12 }}>skipped {res.skipped.length} non-business day(s)</div>}
              </button>,
              <Btn key="x" kind="ghost" onClick={() => set({ rules: s.rules.filter((x) => x.id !== r.id) })} title="Remove">✕</Btn>,
            ])}
          />
          <Row>
            <Txt label="ICS reminders (days before, comma-separated)" value={s.remind} onChange={(v) => set({ remind: v })} hint={`Alarms at 09:00 local time: ${remind.join(', ') || 'none'} day(s) before.`} />
          </Row>
          <Note tone="warn">Counting conventions differ between courts, contracts and agencies (whether the trigger day counts, what happens on holidays, filing cut-off times, extra days for service by mail, local court closures). This calculator is a planning aid — verify with the applicable rules.</Note>
        </Panel>
        <Panel title="Calendar" actions={<span className="muted" style={{ fontSize: 13 }}>{focusRes ? `Highlighting: ${focusRes.r.name}` : 'Click a due date to highlight its counting period'}</span>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
            {months.map(([y, m]) => {
              const first = `${y}-${String(m + 1).padStart(2, '0')}-01`
              const lead = (dow(first) + 6) % 7
              const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
              return (
                <div key={first}>
                  <b>{toDate(first).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</b>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="muted">{d}</span>)}
                    {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} />)}
                    {Array.from({ length: days }, (_, i) => {
                      const d = add(first, i)
                      const hol = cal.holidays.get(d), wk = cal.weekend.includes(dow(d)), due = dueMap.get(d)
                      const bg = d === s.trigger ? 'var(--accent)' : due ? 'var(--ok)' : hol ? 'color-mix(in srgb, var(--err) 25%, transparent)' : inFocus(d) ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent'
                      return (
                        <span key={d} title={[d === s.trigger ? s.triggerName : '', ...(due ?? []), hol ?? ''].filter(Boolean).join(' · ') || undefined}
                          style={{ padding: '4px 0', borderRadius: 6, background: bg, color: d === s.trigger || due ? '#fff' : wk ? 'var(--muted)' : undefined, fontWeight: d === s.trigger || due ? 700 : 400, outline: inFocus(d) && !due ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' : undefined }}>
                          {i + 1}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}><span style={{ color: 'var(--accent)' }}>■</span> trigger · <span style={{ color: 'var(--ok)' }}>■</span> deadline · <span style={{ color: 'var(--err)' }}>■</span> holiday · grey numbers = weekend. Hover a day for details.</p>
          <Row>
            <span className="muted" style={{ alignSelf: 'center' }}>What-if, move trigger:</span>
            {[-7, -1, 1, 7].map((d) => <Btn key={d} onClick={() => valid && set({ trigger: add(s.trigger, d) })}>{d > 0 ? '+' : '−'}{Math.abs(d)} d</Btn>)}
            <Btn kind="ghost" onClick={() => set({ trigger: todayIso() })}>Today</Btn>
          </Row>
        </Panel>
      </div>
    </Split>
  )
}
