import { Btn, Check, CsvButton, JsonButtons, LineChart, Note, Num, Panel, Row, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { dayNum, earliestEntry, firstViolation, isoOf, maxStay, presence, regainDate, usedOn, validIso, type Trip } from './lib/visa-day-counter'

interface State {
  trips: Trip[]
  limit: number
  window: number
  check: string
  planEntry: string
  planLen: number
}

const localIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const T0 = dayNum(localIso())
const DEF: State = {
  trips: [
    { id: 't1', entry: isoOf(T0 - 160), exit: isoOf(T0 - 146), note: 'Italy — conference + holiday' },
    { id: 't2', entry: isoOf(T0 - 105), exit: isoOf(T0 - 82), note: 'Spain & Portugal' },
    { id: 't3', entry: isoOf(T0 - 40), exit: isoOf(T0 - 31), note: 'Germany — work' },
    { id: 't4', entry: isoOf(T0 + 30), exit: isoOf(T0 + 44), note: 'France (planned)', planned: true },
  ],
  limit: 90,
  window: 180,
  check: '',
  planEntry: isoOf(T0 + 60),
  planLen: 30,
}

const fmt = (n: number) => new Date(n * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const short = (n: number) => new Date(n * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export default function VisaDayCounter() {
  const [s, set, reset] = useToolState('visa-day-counter', DEF)
  const today = dayNum(localIso())
  const check = validIso(s.check) ? dayNum(s.check) : today
  const L = Math.max(1, Math.round(s.limit)), W = Math.max(L, Math.round(s.window))
  const all = presence(s.trips)
  const past = presence(s.trips.filter((t) => !t.planned))
  const used = usedOn(all, check, W)
  const stay = maxStay(all, check, L, W)
  const full = earliestEntry(all, check, L, L, W)
  const viol = firstViolation(all, L, W)
  const edit = (id: string, p: Partial<Trip>) => set({ trips: s.trips.map((t) => (t.id === id ? { ...t, ...p } : t)) })
  const sorted = [...s.trips].sort((a, b) => a.entry.localeCompare(b.entry))

  // planner
  const pe = validIso(s.planEntry) ? dayNum(s.planEntry) : null
  const plen = Math.max(1, Math.round(s.planLen))
  const planOk = pe !== null ? maxStay(all, pe, L, W, plen) >= plen : false
  const planAlt = pe !== null && !planOk ? earliestEntry(all, pe, plen, L, W) : null
  const planMax = pe !== null ? maxStay(all, pe, L, W) : 0

  // chart
  const days = [...all]
  const x0 = Math.min(check - W, ...days) - 5
  const x1 = Math.max(check + 120, ...days.map((d) => d + 30))
  const pts: [number, number][] = []
  for (let d = x0; d <= x1; d++) pts.push([d, usedOn(all, d, W)])

  // window strip & drop-offs
  const strip = Array.from({ length: W }, (_, i) => check - W + 1 + i)
  const drops: [number, number][] = []
  for (const d of strip) if (all.has(d) && d + W > check) {
    const free = d + W
    const last = drops[drops.length - 1]
    if (last && last[0] + last[1] === free) last[1]++
    else drops.push([free, 1])
  }
  const regain10 = regainDate(past, today, Math.min(10, L), L, W)

  return (
    <div>
      <Stats>
        <Stat label={`Used on ${short(check)}`} value={`${used} / ${L}`} sub={`days in the ${W}-day window ending that day`} tone={used > L ? 'bad' : 'accent'} />
        <Stat label="Remaining" value={Math.max(0, L - used)} sub="days left in that window" tone={L - used <= 0 ? 'bad' : 'good'} />
        <Stat label={`Max stay entering ${short(check)}`} value={`${stay} day${stay === 1 ? '' : 's'}`} sub={stay ? `leave by ${fmt(check + stay - 1)}` : 'entry not allowed that day'} tone={stay === 0 ? 'bad' : undefined} />
        <Stat label={`Next full ${L}-day stay`} value={full === null ? '—' : full <= check ? 'now' : short(full)} sub={full === null ? '' : fmt(full)} />
      </Stats>

      {viol !== null ? (
        <Note tone="err">⚠ Your trips break the rule on <b>{fmt(viol)}</b>: that day would be day {usedOn(all, viol, W)} in the {W}-day window. {s.trips.some((t) => t.planned && dayNum(t.entry) <= viol && dayNum(t.exit) >= viol) ? 'It falls inside a planned trip — shorten or move it.' : ''}</Note>
      ) : (
        <Note tone="ok">✓ All {s.trips.length} trips stay within {L} days in any {W}-day period.</Note>
      )}

      <Split wide="right">
        <div>
          <Panel title="Check a date">
            <Txt type="date" label="Date to check (empty = today)" value={s.check} onChange={(check) => set({ check })} />
            <Row>
              <Btn onClick={() => set({ check: '' })}>Today</Btn>
            </Row>
            <p className="muted" style={{ fontSize: 13 }}>Window: {fmt(check - W + 1)} → {fmt(check)}. Both entry and exit days count as full days.</p>
          </Panel>
          <Panel title="Plan a trip">
            <Row>
              <Txt type="date" label="Entry" value={s.planEntry} onChange={(planEntry) => set({ planEntry })} />
              <Num label="Length" value={s.planLen} unit="days" min={1} max={L} step={1} onChange={(planLen) => planLen >= 1 && set({ planLen })} />
            </Row>
            {pe === null ? <Note tone="warn">Pick an entry date.</Note> : planOk ? (
              <Note tone="ok">✓ A {plen}-day stay from {fmt(pe)} to {fmt(pe + plen - 1)} fits. You could stay up to {planMax} days from that entry.</Note>
            ) : (
              <Note tone="err">✗ Only {planMax} day{planMax === 1 ? '' : 's'} possible from {fmt(pe)}. {planAlt !== null ? <>Earliest entry for {plen} days: <b>{fmt(planAlt)}</b>.</> : `A stay longer than ${L} days is never allowed.`}</Note>
            )}
            <Btn kind="primary" disabled={pe === null} onClick={() => pe !== null && set({ trips: [...s.trips, { id: uid(), entry: isoOf(pe), exit: isoOf(pe + plen - 1), note: 'Planned trip', planned: true }] })}>+ Add as planned trip</Btn>
          </Panel>
          <Panel title="Rule">
            <Row>
              <Num label="Days allowed" value={s.limit} min={1} step={1} onChange={(limit) => limit >= 1 && set({ limit })} />
              <Num label="Rolling window" value={s.window} unit="days" min={1} step={1} onChange={(window) => window >= 1 && set({ window })} />
            </Row>
            <p className="muted" style={{ fontSize: 13 }}>Default is the Schengen short-stay rule (90 days in any 180). The same counter works for other rolling rules.</p>
          </Panel>
        </div>
        <div>
          <Panel title="Days used over time">
            <LineChart
              series={[
                { name: 'Days used in window', points: pts, area: true, color: '#6366f1' },
                { name: `Limit (${L})`, points: [[x0, L], [x1, L]], dashed: true, color: '#ef4444' },
              ]}
              fx={(v) => short(Math.round(v))}
              fy={(v) => String(Math.round(v))}
              yMin={0}
              yMax={Math.max(L + 10, ...pts.map((p) => p[1]))}
              markers={[{ x: today, label: 'today' }, ...(check !== today ? [{ x: check, label: 'check' }] : [])]}
              height={240}
            />
          </Panel>
          <Panel title={`The ${W}-day window ending ${short(check)}`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(9px, 1fr))', gap: 2 }}>
              {strip.map((d) => (
                <span key={d} title={`${fmt(d)}${all.has(d) ? ' — in zone' : ''}`} style={{ height: 16, borderRadius: 2, background: all.has(d) ? (past.has(d) ? 'var(--accent)' : '#f59e0b') : 'var(--line)', outline: d === today ? '2px solid var(--err)' : undefined }} />
              ))}
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              <span style={{ color: 'var(--accent)' }}>■</span> stayed · <span style={{ color: '#f59e0b' }}>■</span> planned · red outline = today
            </p>
            {drops.length > 0 && (
              <>
                <b>Days coming back</b>
                <ul style={{ margin: '4px 0', paddingLeft: 18, fontSize: 14 }}>
                  {drops.slice(0, 6).map(([d, n]) => <li key={d}>{fmt(d)}{n > 1 ? ` – ${fmt(d + n - 1)}` : ''}: +{n} day{n > 1 ? 's' : ''}</li>)}
                </ul>
              </>
            )}
            {regain10 !== null && regain10 > today && <p className="muted" style={{ fontSize: 13 }}>Without new travel you'll have {Math.min(10, L)}+ free days again on {fmt(regain10)}.</p>}
          </Panel>
          <Panel
            title="Trips"
            actions={
              <>
                <Btn onClick={() => set({ trips: [...s.trips, { id: uid(), entry: localIso(), exit: localIso(), note: '' }] })}>+ Trip</Btn>
                <CsvButton name="trips.csv" rows={() => [['Entry', 'Exit', 'Days', 'Planned', 'Note'], ...sorted.map((t) => [t.entry, t.exit, validIso(t.entry) && validIso(t.exit) ? dayNum(t.exit) - dayNum(t.entry) + 1 : '', t.planned ? 'yes' : '', t.note])]} />
                <JsonButtons name="visa-trips.json" data={s} onLoad={(d) => set(d)} />
                <Btn kind="ghost" onClick={reset}>Reset</Btn>
              </>
            }
          >
            <Table
              head={['Entry', 'Exit', 'Days', 'Note', 'Planned', '']}
              rows={sorted.map((t) => {
                const bad = !validIso(t.entry) || !validIso(t.exit) || dayNum(t.exit) < dayNum(t.entry)
                return [
                  <input key="e" type="date" value={t.entry} onChange={(e) => edit(t.id, { entry: e.target.value })} aria-label="Entry date" />,
                  <input key="x" type="date" value={t.exit} onChange={(e) => edit(t.id, { exit: e.target.value })} aria-label="Exit date" />,
                  bad ? <span key="d" style={{ color: 'var(--err)' }}>exit before entry</span> : dayNum(t.exit) - dayNum(t.entry) + 1,
                  <input key="n" value={t.note} onChange={(e) => edit(t.id, { note: e.target.value })} aria-label="Note" style={{ minWidth: 140 }} />,
                  <Check key="p" label="" value={!!t.planned} onChange={(planned) => edit(t.id, { planned })} />,
                  <Btn key="r" kind="ghost" title="Remove" onClick={() => set({ trips: s.trips.filter((x) => x.id !== t.id) })}>✕</Btn>,
                ]
              })}
            />
            <p className="muted" style={{ fontSize: 13 }}>Trips are saved in this browser only. Overlapping trips and same-day exit/re-entry are counted once.</p>
          </Panel>
        </div>
      </Split>
      <Note tone="warn">
        Planning aid only — <b>check the official rules</b> (e.g. the European Commission's short-stay calculator and your border authority) before you travel. Time on a residence permit or national long-stay visa doesn't count, some nationalities have bilateral agreements, and the border guard's entry/exit records are what count.
      </Note>
    </div>
  )
}
