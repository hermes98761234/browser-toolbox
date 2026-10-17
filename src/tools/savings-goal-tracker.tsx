import { useState } from 'react'
import { Btn, color, CsvButton, JsonButtons, LineChart, money, Note, Num, Panel, pct, Row, Select, Split, Stat, Stats, Table, today, Txt, uid, useToolState } from '../kit'
import { addMonths, daysBetween, monthsBetween, monthsToGoal, projection, requiredMonthly } from './lib/savings-goal-tracker'

interface Entry { id: string; date: string; amount: number; note: string }
interface Goal { id: string; name: string; emoji: string; target: number; start: string; deadline: string; rate: number; color: string; history: Entry[] }

const t0 = today()
const hist = (start: string, amounts: number[]): Entry[] => amounts.map((a, i) => ({ id: uid(), date: addMonths(start, i), amount: a, note: i ? 'Monthly transfer' : 'Opening balance' }))
const mkGoal = (name: string, emoji: string, target: number, startAgo: number, months: number, rate: number, amounts: number[], i: number): Goal => {
  const start = addMonths(t0, -startAgo)
  return { id: uid(), name, emoji, target, start, deadline: addMonths(t0, months), rate, color: color(i), history: hist(start, amounts) }
}
const DEF = {
  currency: '$',
  budget: 1200,
  sel: 0,
  goals: [
    mkGoal('Emergency fund', '🛟', 10000, 8, 10, 4, [2000, 500, 500, 500, 600, 600, 500, 700], 0),
    mkGoal('Japan trip', '🗾', 4500, 5, 7, 0, [300, 250, 250, 300, 250], 1),
    mkGoal('New laptop', '💻', 1800, 3, 2, 0, [400, 300, 350], 2),
    mkGoal('House deposit', '🏡', 40000, 12, 36, 4.5, [8000, 700, 700, 700, 800, 700, 700, 700, 900, 700, 700, 700], 3),
  ] as Goal[],
}

function BigRing({ value, c, children }: { value: number; c: string; children: React.ReactNode }) {
  const size = 112, r = size / 2 - 9, L = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
      <svg width={size} height={size} role="img" aria-label={`${Math.round(value * 100)}% saved`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={11} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth={11} strokeLinecap="round" strokeDasharray={`${Math.min(1, Math.max(0, value)) * L} ${L}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .5s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', lineHeight: 1.1 }}>{children}</div>
    </div>
  )
}

export default function SavingsGoalTracker() {
  const [s, set, reset] = useToolState('savings-goal-tracker', DEF)
  const [amt, setAmt] = useState<Record<string, number>>({})
  const m = (x: number, d = 0) => money(x, s.currency, d)
  const now = today()

  const info = s.goals.map((g) => {
    const saved = g.history.reduce((a, e) => a + e.amount, 0)
    const monthsLeft = monthsBetween(now, g.deadline)
    const days = daysBetween(now, g.deadline)
    const need = requiredMonthly(g.target, saved, monthsLeft, g.rate)
    const elapsed = Math.max(1, monthsBetween(g.start, now))
    const opening = g.history[0]?.amount ?? 0
    const pace = Math.max(0, (saved - opening) / elapsed) // average monthly deposit after the opening balance
    const eta = monthsToGoal(g.target, saved, pace, g.rate)
    const done = saved >= g.target
    const onTrack = done || (Number.isFinite(eta) && eta <= Math.ceil(monthsLeft))
    return { g, saved, monthsLeft, days, need, pace, eta, done, onTrack, frac: g.target > 0 ? saved / g.target : 0 }
  })
  const sel = info[Math.min(s.sel, info.length - 1)]
  const totSaved = info.reduce((a, x) => a + x.saved, 0)
  const totTarget = s.goals.reduce((a, g) => a + g.target, 0)
  const totNeed = info.filter((x) => !x.done && Number.isFinite(x.need)).reduce((a, x) => a + x.need, 0)

  const editGoal = (id: string, p: Partial<Goal>) => set({ goals: s.goals.map((g) => (g.id === id ? { ...g, ...p } : g)) })
  const deposit = (g: Goal, a: number) => {
    if (!a) return
    editGoal(g.id, { history: [...g.history, { id: uid(), date: now, amount: a, note: a > 0 ? 'Deposit' : 'Withdrawal' }] })
    setAmt({ ...amt, [g.id]: 0 })
  }

  // Projection chart for the selected goal
  const chart = (() => {
    if (!sel) return []
    const horizon = Math.max(1, Math.min(240, Math.ceil(Math.max(sel.monthsLeft, Number.isFinite(sel.eta) ? sel.eta : 0)) + 1))
    const pts = (arr: number[]) => arr.map((v, i) => [i, v] as [number, number])
    const series = [
      { name: 'Target', points: [[0, sel.g.target], [horizon, sel.g.target]] as [number, number][], color: 'var(--muted)', dashed: true },
      { name: `Current pace (${m(sel.pace)}/mo)`, points: pts(projection(sel.saved, sel.pace, sel.g.rate, horizon)), color: sel.onTrack ? '#10b981' : '#f59e0b' },
    ]
    if (!sel.done && Number.isFinite(sel.need)) series.push({ name: `Required (${m(sel.need)}/mo)`, points: pts(projection(sel.saved, sel.need, sel.g.rate, Math.max(1, Math.ceil(sel.monthsLeft)))), color: sel.g.color })
    return series
  })()

  return (
    <div>
      <Stats>
        <Stat label="Total saved" value={m(totSaved)} sub={`of ${m(totTarget)} · ${pct(totSaved / (totTarget || 1), 0)}`} tone="accent" />
        <Stat label="Needed per month" value={m(totNeed)} sub={`to hit every deadline`} />
        <Stat label="Your monthly budget" value={m(s.budget)} sub={s.budget >= totNeed ? `${m(s.budget - totNeed)} spare ✓` : `${m(totNeed - s.budget)} short`} tone={s.budget >= totNeed ? 'good' : 'bad'} />
        <Stat label="Goals reached" value={`${info.filter((x) => x.done).length} / ${info.length}`} sub={`${info.filter((x) => !x.onTrack).length} behind schedule`} />
      </Stats>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 12 }}>
        {info.map((x, i) => (
          <section key={x.g.id} className="k-panel" style={{ cursor: 'pointer', outline: i === s.sel ? `2px solid ${x.g.color}` : undefined, margin: 0 }} onClick={() => set({ sel: i })}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <BigRing value={x.frac} c={x.g.color}>
                <div><div style={{ fontSize: 26 }}>{x.g.emoji}</div><b>{Math.floor(x.frac * 100)}%</b></div>
              </BigRing>
              <div style={{ minWidth: 0, flex: 1 }}>
                <b style={{ fontSize: 16 }}>{x.g.name}</b>
                <div style={{ fontSize: 14 }}>{m(x.saved)} <span className="muted">/ {m(x.g.target)}</span></div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {x.done ? '🎉 Goal reached!' : x.days > 0 ? `⏳ ${x.days} days left (${new Date(x.g.deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})` : `⚠ deadline passed ${-x.days} days ago`}
                </div>
                {!x.done && <div style={{ fontSize: 13, marginTop: 2 }}>Save <b>{Number.isFinite(x.need) ? m(x.need) : '—'}</b>/month</div>}
                <span style={{ fontSize: 12, fontWeight: 700, color: x.onTrack ? 'var(--ok)' : 'var(--warn)' }}>{x.done ? '' : x.onTrack ? '● On track' : '● Behind pace'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
              <input className="k-text" type="number" min={0} placeholder="Amount" value={amt[x.g.id] || ''} onChange={(e) => setAmt({ ...amt, [x.g.id]: Number(e.target.value) || 0 })} style={{ flex: 1, minWidth: 0 }} aria-label={`Amount for ${x.g.name}`} />
              <Btn kind="primary" disabled={!amt[x.g.id]} onClick={() => deposit(x.g, Math.abs(amt[x.g.id] || 0))}>+ Add</Btn>
              <Btn disabled={!amt[x.g.id]} onClick={() => deposit(x.g, -Math.abs(amt[x.g.id] || 0))}>− Take</Btn>
            </div>
          </section>
        ))}
      </div>

      {sel && (
        <Split wide="right">
          <div>
            <Panel title={`${sel.g.emoji} Edit goal`} actions={<Btn kind="danger" onClick={() => { if (confirm(`Delete “${sel.g.name}”?`)) set({ goals: s.goals.filter((g) => g.id !== sel.g.id), sel: 0 }) }}>Delete</Btn>}>
              <Row>
                <Txt label="Name" value={sel.g.name} onChange={(name) => editGoal(sel.g.id, { name })} />
                <Txt label="Emoji" value={sel.g.emoji} onChange={(emoji) => editGoal(sel.g.id, { emoji: [...emoji].slice(-2).join('') })} />
              </Row>
              <Row>
                <Num label="Target" value={sel.g.target} unit={s.currency} min={1} onChange={(target) => editGoal(sel.g.id, { target })} />
                <Num label="Interest (APR)" value={sel.g.rate} unit="%" min={0} step={0.1} onChange={(rate) => editGoal(sel.g.id, { rate })} />
              </Row>
              <Row>
                <Txt label="Started" type="date" value={sel.g.start} onChange={(start) => editGoal(sel.g.id, { start })} />
                <Txt label="Deadline" type="date" value={sel.g.deadline} onChange={(deadline) => editGoal(sel.g.id, { deadline })} />
              </Row>
              <label className="k-field"><span className="k-label">Colour</span><input type="color" value={sel.g.color} onChange={(e) => editGoal(sel.g.id, { color: e.target.value })} style={{ width: 56, height: 32, border: 'none', background: 'none' }} /></label>
              {!sel.done && (
                <Note tone={sel.onTrack ? 'ok' : 'warn'}>
                  {Number.isFinite(sel.need) ? <>To reach {m(sel.g.target)} by the deadline, save <b>{m(sel.need, 2)}</b> a month{sel.g.rate ? ` (with ${sel.g.rate}% interest)` : ''}. </> : <>The deadline has passed. </>}
                  At your current pace of {m(sel.pace)}/month you'll get there {Number.isFinite(sel.eta) ? <>in <b>{sel.eta} months</b> ({new Date(addMonths(now, sel.eta) + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})</> : <b>never — start depositing</b>}.
                </Note>
              )}
            </Panel>
            <Panel title="Settings" actions={<Btn kind="ghost" onClick={reset}>Reset all</Btn>}>
              <Row>
                <Num label="I can save per month" value={s.budget} unit={s.currency} min={0} onChange={(budget) => set({ budget })} />
                <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
              </Row>
              <Row>
                <Btn onClick={() => set({ goals: [...s.goals, { id: uid(), name: 'New goal', emoji: '🎯', target: 1000, start: now, deadline: addMonths(now, 12), rate: 0, color: color(s.goals.length), history: [] }], sel: s.goals.length })}>+ New goal</Btn>
                <JsonButtons name="savings-goals.json" data={s} onLoad={(d) => d && Array.isArray(d.goals) && set(d)} />
              </Row>
              {totNeed > 0 && s.budget > 0 && (
                <Table
                  head={['Goal', 'Needs / mo', 'Fair share of budget']}
                  rows={info.filter((x) => !x.done && Number.isFinite(x.need)).map((x) => [`${x.g.emoji} ${x.g.name}`, m(x.need), m(Math.min(x.need, (x.need / totNeed) * s.budget))])}
                />
              )}
            </Panel>
          </div>
          <div>
            <Panel title={`Projection · ${sel.g.name}`}>
              <LineChart series={chart} xLabel="months from today" fy={(v) => m(v)} fx={(v) => String(Math.round(v))} markers={sel.monthsLeft > 0 ? [{ x: sel.monthsLeft, label: 'deadline' }] : []} height={280} />
            </Panel>
            <Panel title="History" actions={<CsvButton name={`${sel.g.name.replace(/\W+/g, '-')}.csv`} rows={() => [['Date', 'Amount', 'Note'], ...sel.g.history.map((e) => [e.date, e.amount, e.note])]} />}>
              <Table
                max={12}
                head={['Date', 'Amount', 'Note', '']}
                rows={[...sel.g.history].reverse().map((e) => [
                  e.date,
                  <b key="a" style={{ color: e.amount < 0 ? 'var(--err)' : 'var(--ok)' }}>{e.amount < 0 ? '−' : '+'}{m(Math.abs(e.amount), 2)}</b>,
                  <input key="n" value={e.note} onChange={(ev) => editGoal(sel.g.id, { history: sel.g.history.map((h) => (h.id === e.id ? { ...h, note: ev.target.value } : h)) })} aria-label="Note" />,
                  <Btn key="x" kind="ghost" title="Remove entry" onClick={() => editGoal(sel.g.id, { history: sel.g.history.filter((h) => h.id !== e.id) })}>✕</Btn>,
                ])}
                foot={['Balance', m(sel.saved, 2), '', '']}
              />
            </Panel>
          </div>
        </Split>
      )}
    </div>
  )
}
