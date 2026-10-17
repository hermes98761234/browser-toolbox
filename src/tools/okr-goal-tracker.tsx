import { Bar, Btn, CsvButton, JsonButtons, LineChart, Note, Panel, pct, Row, Select, Split, Stat, Stats, Table, today, uid, useToolState } from '../kit'
import { carryOver, elapsed, grade, health, history, krProgress, nextQuarter, objProgress, quarterOf, quarterProgress, quarterRange, type Health, type KeyResult, type Objective } from './lib/okr-goal-tracker'

const T = today()
const Q = quarterOf(T)
const PQ = quarterOf(new Date(Date.parse(quarterRange(Q)[0]) - 86400000).toISOString().slice(0, 10))
const day = (q: string, n: number) => new Date(Date.parse(quarterRange(q)[0]) + n * 86400000).toISOString().slice(0, 10)
const k = (title: string, start: number, target: number, unit: string, vals: number[], q = Q, weight = 1): KeyResult => {
  const max = Math.max(0, Math.floor((Date.parse(T) - Date.parse(quarterRange(q)[0])) / 86400000))
  const log = vals.map((value, i) => ({ date: day(q, q === Q ? Math.min(max, i * 7) : i * 14), value }))
  return { id: uid(), title, start, target, current: vals.length ? vals[vals.length - 1] : start, unit, weight, log }
}
const DEF = {
  view: Q,
  closed: [PQ] as string[],
  objectives: [
    { id: 'o1', title: 'Delight new customers in their first week', owner: 'Product', quarter: Q, krs: [k('Activation rate', 38, 55, '%', [38, 41, 44]), k('Median time to first value', 26, 10, 'min', [26, 22, 19]), k('Onboarding NPS', 21, 40, '', [21, 25])] },
    { id: 'o2', title: 'Build a predictable revenue engine', owner: 'Sales', quarter: Q, krs: [k('New ARR', 0, 400, 'k$', [0, 60, 135], Q, 2), k('Qualified pipeline', 0, 1200, 'k$', [0, 380, 520]), k('Win rate', 18, 25, '%', [18, 18, 19])] },
    { id: 'o3', title: 'Make the platform boringly reliable', owner: 'Engineering', quarter: Q, krs: [k('Uptime', 99.5, 99.95, '%', [99.5, 99.9, 99.93]), k('P1 incidents per month', 6, 1, '', [6, 3, 2]), k('Deploys per week', 4, 15, '', [4, 9, 12])] },
    { id: 'p1', title: 'Launch the self-serve plan', owner: 'Product', quarter: PQ, krs: [k('Self-serve signups', 0, 1000, '', [0, 300, 650, 820], PQ), k('Checkout conversion', 1.5, 4, '%', [1.5, 2.5, 3.6], PQ)] },
    { id: 'p2', title: 'Hire the platform team', owner: 'Engineering', quarter: PQ, krs: [k('Engineers hired', 0, 4, '', [0, 1, 3, 4], PQ)] },
  ] as Objective[],
}
const HC: Record<Health, [string, string]> = { 'on-track': ['var(--ok)', 'On track'], 'at-risk': ['var(--warn)', 'At risk'], 'off-track': ['var(--err)', 'Off track'], done: ['var(--accent)', 'Done'] }
const GC = { good: 'var(--ok)', ok: 'var(--warn)', low: 'var(--err)' }
const Chip = ({ h }: { h: Health }) => <span style={{ display: 'inline-block', alignSelf: 'center', lineHeight: '18px', fontSize: 12, fontWeight: 700, color: '#fff', background: HC[h][0], padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{HC[h][1]}</span>
const numIn = (v: number, on: (n: number) => void, label: string, w = 70) => <input type="number" value={v} step="any" onChange={(e) => e.target.value !== '' && Number.isFinite(+e.target.value) && on(+e.target.value)} aria-label={label} style={{ width: w }} />

export default function OkrGoalTracker() {
  const [s, set, reset] = useToolState('okr-goal-tracker', DEF)
  const quarters = [...new Set([Q, ...s.objectives.map((o) => o.quarter), s.view])].sort().reverse()
  const os = s.objectives.filter((o) => o.quarter === s.view)
  const exp = elapsed(s.view, T)
  const score = quarterProgress(os)
  const allKr = os.flatMap((o) => o.krs)
  const hk = allKr.map((x) => health(krProgress(x), exp))
  const closed = s.closed.includes(s.view)
  const editO = (id: string, p: Partial<Objective>) => set({ objectives: s.objectives.map((o) => (o.id === id ? { ...o, ...p } : o)) })
  const editK = (o: Objective, kid: string, p: Partial<KeyResult>) => editO(o.id, { krs: o.krs.map((x) => {
    if (x.id !== kid) return x
    const n = { ...x, ...p }
    if (p.current !== undefined) n.log = [...x.log.filter((c) => c.date !== T), { date: T, value: p.current }].sort((a, b) => a.date.localeCompare(b.date))
    return n
  }) })
  const [qa, qb] = quarterRange(s.view)
  const qDays = (Date.parse(qb) - Date.parse(qa)) / 86400000 + 1
  const series = os.map((o) => ({ name: o.title.length > 28 ? o.title.slice(0, 27) + '…' : o.title, points: history(o).map(([d, p]) => [(Date.parse(d) - Date.parse(qa)) / 86400000, p * 100] as [number, number]) })).filter((x) => x.points.length)

  return (
    <Split wide="left">
      <div>
        <Panel title="Quarter" actions={<Select label="" value={s.view} onChange={(view) => set({ view })} options={quarters.map((q) => [q, `${q}${s.closed.includes(q) ? ' (archived)' : q === Q ? ' (current)' : ''}`] as [string, string])} />}>
          <Row>
            <span className="muted">{qa} → {qb} · {pct(exp, 0)} of the quarter elapsed</span>
          </Row>
          {closed && <Note>This quarter is archived. Final score: <b>{pct(score, 0)}</b>. You can still edit it.</Note>}
        </Panel>
        {os.map((o, oi) => {
          const p = objProgress(o)
          return (
            <Panel key={o.id} title={`Objective ${oi + 1}`} actions={<><Chip h={health(p, exp)} /><b>{pct(p, 0)}</b><Btn kind="ghost" title="Delete objective" onClick={() => confirm('Delete this objective?') && set({ objectives: s.objectives.filter((x) => x.id !== o.id) })}>✕</Btn></>}>
              <input className="k-text" value={o.title} onChange={(e) => editO(o.id, { title: e.target.value })} aria-label="Objective" style={{ width: '100%', fontSize: 17, fontWeight: 700, marginBottom: 8, boxSizing: 'border-box' }} />
              <Row>
                <span className="muted" style={{ fontSize: 13 }}>Owner</span>
                <input value={o.owner} onChange={(e) => editO(o.id, { owner: e.target.value })} aria-label="Owner" style={{ width: 140 }} />
                <div style={{ flex: 1, minWidth: 120, position: 'relative' }}>
                  <Bar value={p} color={HC[health(p, exp)][0]} />
                  <span title="Expected pace" style={{ position: 'absolute', left: `${exp * 100}%`, top: -3, bottom: -3, width: 2, background: 'var(--muted)' }} />
                </div>
              </Row>
              <Table
                head={['Key result', 'Start', 'Target', 'Current', 'Unit', 'Wt', 'Progress', '']}
                rows={o.krs.map((x) => {
                  const kp = krProgress(x)
                  return [
                    <input key="t" value={x.title} onChange={(e) => editK(o, x.id, { title: e.target.value })} aria-label="Key result" style={{ minWidth: 170, width: '100%' }} />,
                    numIn(x.start, (v) => editK(o, x.id, { start: v }), 'Start', 64),
                    numIn(x.target, (v) => editK(o, x.id, { target: v }), 'Target', 64),
                    numIn(x.current, (v) => editK(o, x.id, { current: v }), 'Current (check-in)', 72),
                    <input key="u" value={x.unit} onChange={(e) => editK(o, x.id, { unit: e.target.value })} aria-label="Unit" style={{ width: 40 }} />,
                    numIn(x.weight, (v) => editK(o, x.id, { weight: Math.max(0, v) }), 'Weight', 44),
                    <div key="p" style={{ minWidth: 90 }} title={`${x.log.length} check-ins`}><b style={{ fontSize: 13 }}>{pct(kp, 0)}</b><Bar value={kp} color={HC[health(kp, exp)][0]} /></div>,
                    <Btn key="x" kind="ghost" title="Remove key result" onClick={() => editO(o.id, { krs: o.krs.filter((y) => y.id !== x.id) })}>✕</Btn>,
                  ]
                })}
              />
              <Btn onClick={() => editO(o.id, { krs: [...o.krs, { id: uid(), title: 'New key result', start: 0, target: 100, current: 0, unit: '%', weight: 1, log: [] }] })}>+ Key result</Btn>
            </Panel>
          )
        })}
        <Row>
          <Btn kind="primary" onClick={() => set({ objectives: [...s.objectives, { id: uid(), title: 'New objective', owner: '', quarter: s.view, krs: [{ id: uid(), title: 'Measurable key result', start: 0, target: 100, current: 0, unit: '%', weight: 1, log: [] }] }] })}>+ Objective</Btn>
        </Row>
      </div>
      <div>
        <Stats>
          <Stat label={`${s.view} score`} value={pct(score, 0)} sub={`pace ${pct(exp, 0)}`} tone={grade(score) === 'good' ? 'good' : 'accent'} />
          <Stat label="Key results" value={allKr.length} sub={`${hk.filter((h) => h === 'on-track' || h === 'done').length} on track · ${hk.filter((h) => h === 'off-track').length} off`} />
        </Stats>
        <Panel title="Progress by objective">
          {os.map((o) => {
            const p = objProgress(o)
            return (
              <div key={o.id} style={{ marginBottom: 10 }}>
                <Row wrap={false}><span style={{ flex: 1, fontSize: 14 }}>{o.title}</span><b>{pct(p, 0)}</b></Row>
                <div style={{ position: 'relative' }}>
                  <Bar value={p} color={HC[health(p, exp)][0]} />
                  <span style={{ position: 'absolute', left: `${exp * 100}%`, top: -3, bottom: -3, width: 2, background: 'var(--muted)' }} />
                </div>
              </div>
            )
          })}
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>Grey tick = where linear pace says you should be today. Typing a new “Current” value records a check-in for today.</p>
        </Panel>
        {series.length > 0 && (
          <Panel title="Check-in history">
            <LineChart series={series} height={220} xMin={0} xMax={qDays} yMin={0} yMax={100} xLabel="Day of quarter" fy={(v) => `${Math.round(v)}%`} fx={(v) => `${Math.round(v)}`} markers={exp > 0 && exp < 1 ? [{ x: exp * qDays, label: 'today' }] : []} />
          </Panel>
        )}
        <Panel title="Quarterly archive" actions={<CsvButton name="okrs.csv" rows={() => [['Quarter', 'Objective', 'Owner', 'Key result', 'Start', 'Target', 'Current', 'Unit', 'Weight', 'Progress'], ...s.objectives.flatMap((o) => o.krs.map((x) => [o.quarter, o.title, o.owner, x.title, x.start, x.target, x.current, x.unit, x.weight, +krProgress(x).toFixed(3)]))]} />}>
          <Table head={['Quarter', 'Objectives', 'Score', '']} rows={quarters.map((q) => {
            const qs = s.objectives.filter((o) => o.quarter === q)
            const sc = quarterProgress(qs)
            return [<b key="q">{q}</b>, qs.length, <span key="s" style={{ color: GC[grade(sc)], fontWeight: 700 }}>{pct(sc, 0)}</span>, s.view === q ? <span key="v" className="muted">viewing</span> : <Btn key="v" kind="ghost" onClick={() => set({ view: q })}>Open</Btn>]
          })} />
          {!closed && os.length > 0 && (
            <Btn onClick={() => {
              if (!confirm(`Archive ${s.view} and carry unfinished work into ${nextQuarter(s.view)}?`)) return
              set({ closed: [...s.closed, s.view], objectives: [...s.objectives, ...carryOver(s.objectives, s.view, uid)], view: nextQuarter(s.view) })
            }}>Close {s.view} → carry over to {nextQuarter(s.view)}</Btn>
          )}
          <Row>
            <JsonButtons name="okrs.json" data={s} onLoad={(d) => d && Array.isArray(d.objectives) && set({ ...DEF, ...d })} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
        <Note>Good OKRs are ambitious: scoring 60–70% is usually a success. Keep 2–5 key results per objective, each measurable with a start and target.</Note>
      </div>
    </Split>
  )
}
