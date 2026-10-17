import { Btn, CsvButton, download, Note, Num, Panel, Ring, Row, Select, Slider, Split, Stat, Stats, Table, Txt, today, useToolState } from '../kit'
import { dueDate, fromDay, gestationalAge, isDate, lmpEquivalent, MILESTONES, naegeleCalendar, sizeAt, toDay, toIcs, trimester, type Input, type Method } from './lib/due-date-calculator'

const T = today()
const DEF: Input & { asOf: string } = { method: 'lmp', date: fromDay(toDay(T) - 130), cycle: 28, usWeeks: 8, usDays: 2, asOf: '' }
const METHODS: [Method, string][] = [['lmp', 'First day of last period (LMP)'], ['conception', 'Conception date'], ['ivf3', 'IVF: day-3 embryo transfer'], ['ivf5', 'IVF: day-5 blastocyst transfer'], ['ultrasound', 'Dating ultrasound']]
const DATE_LABEL: Record<Method, string> = { lmp: 'First day of last menstrual period', conception: 'Conception date', ivf3: 'Transfer date', ivf5: 'Transfer date', ultrasound: 'Date of the ultrasound' }
const long = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const short = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const TRI = ['#a855f7', '#0ea5e9', '#10b981']

export default function DueDateCalculator() {
  const [s, set, reset] = useToolState('due-date-calculator', DEF)
  const ok = isDate(s.date)
  const input: Input = ok ? s : DEF
  const lmp = lmpEquivalent(input)
  const edd = dueDate(input)
  const asOf = isDate(s.asOf) ? s.asOf : T
  const ga = gestationalAge(lmp, asOf)
  const toGo = toDay(edd) - toDay(asOf)
  const conception = fromDay(toDay(lmp) + 14)
  const size = sizeAt(ga.weeks)
  const future = toDay(s.date) > toDay(T)
  const wk = (w: number) => fromDay(toDay(lmp) + w * 7)
  const weeks = Array.from({ length: 39 }, (_, i) => i + 4)
  const events = [
    ...MILESTONES.map((m) => ({ date: wk(m.from), end: fromDay(toDay(wk(m.to)) - 1), title: m.title, note: m.note })),
    { date: edd, title: 'Estimated due date (40 weeks)', note: 'Only about 1 in 20 babies arrive on the due date itself.' },
  ]

  return (
    <Split>
      <div>
        <Panel title="Calculate from">
          <Select label="Method" value={s.method} onChange={(method) => set({ method })} options={METHODS} />
          <Txt label={DATE_LABEL[s.method]} type="date" value={s.date} onChange={(date) => set({ date })} />
          {!ok && <Note tone="err">Enter a valid date.</Note>}
          {ok && future && <Note tone="warn">That date is in the future.</Note>}
          {s.method === 'lmp' && <Slider label="Average cycle length" value={s.cycle} onChange={(cycle) => set({ cycle })} min={21} max={45} unit=" days" show={(v) => String(v)} />}
          {s.method === 'ultrasound' && (
            <Row>
              <Num label="Gestational age at scan" value={s.usWeeks} onChange={(usWeeks) => set({ usWeeks: Math.max(4, Math.min(42, Math.round(usWeeks))) })} unit="weeks" min={4} max={42} step={1} />
              <Num label="+ days" value={s.usDays} onChange={(usDays) => set({ usDays: Math.max(0, Math.min(6, Math.round(usDays))) })} unit="days" min={0} max={6} step={1} />
            </Row>
          )}
          <Txt label="Show progress as of" type="date" value={asOf} onChange={(v) => set({ asOf: v === T ? '' : v })} hint="Defaults to today" />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </Panel>
        <Panel title="How it is calculated">
          <p style={{ marginTop: 0 }}>
            {s.method === 'lmp' && <>Naegele’s rule: due date = first day of the last period + 280 days (40 weeks){s.cycle !== 28 ? <>, shifted by {s.cycle - 28 > 0 ? '+' : ''}{s.cycle - 28} days for a {s.cycle}-day cycle</> : <> — on the calendar, + 1 year − 3 months + 7 days ({short(naegeleCalendar(s.date))})</>}.</>}
            {s.method === 'conception' && <>Due date = conception + 266 days (38 weeks). Pregnancy is still counted from two weeks before conception.</>}
            {s.method === 'ivf3' && <>Due date = day-3 transfer + 263 days.</>}
            {s.method === 'ivf5' && <>Due date = day-5 transfer + 261 days.</>}
            {s.method === 'ultrasound' && <>Due date = scan date + (280 − gestational age at the scan). An early (first-trimester) ultrasound is the most accurate way to date a pregnancy.</>}
          </p>
          <p className="muted" style={{ marginBottom: 0 }}>Estimated conception: {short(conception)} · Pregnancy counted from: {short(lmp)}</p>
        </Panel>
        <Note tone="warn">For information only — this is not medical advice. Screening windows and recommendations differ between countries and individual pregnancies. Always confirm dates and care plans with your midwife, doctor or other clinician.</Note>
      </div>
      <div>
        <Stats>
          <Stat label="Estimated due date" value={short(edd)} sub={long(edd)} tone="accent" />
          <Stat label={asOf === T ? 'Today' : `On ${short(asOf)}`} value={ga.total < 0 ? '—' : `${ga.weeks}w ${ga.days}d`} sub={ga.total < 0 ? 'before pregnancy start' : ga.total >= 0 && ga.weeks < 43 ? `trimester ${trimester(ga.total)}` : 'past 42 weeks'} />
          <Stat label="Days to go" value={toGo >= 0 ? toGo : `+${-toGo}`} sub={toGo >= 0 ? `${Math.floor(toGo / 7)} weeks ${toGo % 7} days` : 'days past due date'} />
          <Stat label="Term window" value={short(wk(37))} sub={`37w to 41w 6d: until ${short(fromDay(toDay(wk(42)) - 1))}`} />
        </Stats>
        <Panel title="Progress">
          <Row wrap={false}>
            <Ring value={Math.max(0, Math.min(1, ga.total / 280))} size={110} label={`${Math.round(Math.max(0, Math.min(1, ga.total / 280)) * 100)}%`} />
            <div style={{ flex: 1 }}>
              <svg viewBox="0 0 600 54" width="100%" role="img" aria-label="Pregnancy progress by trimester">
                {[[0, 14], [14, 28], [28, 42]].map(([a, b], i) => <rect key={i} x={(a / 42) * 600} y={8} width={((b - a) / 42) * 600 - 2} height={18} rx={5} fill={TRI[i]} opacity={0.25} />)}
                <rect x={0} y={8} width={Math.max(0, Math.min(42, ga.total / 7) / 42) * 600} height={18} rx={5} fill={TRI[trimester(Math.max(0, ga.total)) - 1]} opacity={0.55} />
                {[0, 14, 28].map((a, i) => <text key={a} x={(a / 42) * 600 + 6} y={21} fontSize={12} fill="currentColor">Trimester {i + 1}</text>)}
                <line x1={(40 / 42) * 600} x2={(40 / 42) * 600} y1={2} y2={32} stroke="var(--err)" strokeWidth={2} />
                {[0, 10, 20, 30, 40].map((w) => <text key={w} x={(w / 42) * 600} y={46} fontSize={11} fill="var(--muted)" textAnchor={w ? 'middle' : 'start'}>{w}w</text>)}
              </svg>
              {size && ga.weeks <= 42 && <p style={{ margin: '4px 0 0' }}>Around week {size[0]} the baby is roughly the size of a <b>{size[1][0]}</b>: about {size[1][1]} cm{size[0] <= 12 ? ' crown–rump' : ''}, {size[1][2] >= 1000 ? `${(size[1][2] / 1000).toFixed(1)} kg` : `${size[1][2]} g`} (averages; individual growth varies).</p>}
            </div>
          </Row>
        </Panel>
        <Panel title="Week by week" actions={<>
          <Btn onClick={() => download('pregnancy-milestones.ics', toIcs(events), 'text/calendar')}>📅 Calendar (.ics)</Btn>
          <CsvButton name="pregnancy-weeks.csv" rows={() => [['Week', 'Starts', 'Ends', 'Trimester', 'Milestones'], ...weeks.map((w) => [w, wk(w), fromDay(toDay(wk(w + 1)) - 1), trimester(w * 7), MILESTONES.filter((m) => w >= m.from && w < m.to).map((m) => m.title).join('; ')])]} />
        </>}>
          <Table
            head={['Week', 'Dates', 'Tri.', 'Informational milestones']}
            rows={weeks.map((w) => {
              const cur = ga.weeks === w
              const ms = MILESTONES.filter((m) => w >= m.from && w < m.to)
              return [
                <b key="w" style={{ color: cur ? 'var(--accent)' : undefined }}>{cur ? '▶ ' : ''}{w}</b>,
                <span key="d" style={{ whiteSpace: 'nowrap', fontWeight: cur ? 700 : undefined }}>{short(wk(w))} – {short(fromDay(toDay(wk(w + 1)) - 1))}</span>,
                <span key="t" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: TRI[trimester(w * 7) - 1] }} title={`Trimester ${trimester(w * 7)}`} />,
                <span key="m" style={{ fontSize: 13 }}>{w === 40 && <b>Estimated due date ({short(edd)}). </b>}{ms.map((m) => <span key={m.title} title={m.note} className={m.from === w ? undefined : 'muted'}>{m.title}{m.from === w ? '' : ' (cont.)'}. </span>)}</span>,
              ]
            })}
          />
        </Panel>
      </div>
    </Split>
  )
}
