import { useState } from 'react'
import { BarChart, Btn, color, CsvButton, Donut, FileDrop, JsonButtons, money, Note, Num, Panel, pct, Ring, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'

interface Entry { id: string; date: string; amount: number; cat: string; note: string }
interface State { currency: string; budget: number; cats: string[]; entries: Entry[] }

const CATS = ['Groceries', 'Dining', 'Transport', 'Housing', 'Utilities', 'Health', 'Shopping', 'Fun', 'Other']
const ICON: Record<string, string> = { Groceries: '🛒', Dining: '🍽', Transport: '🚌', Housing: '🏠', Utilities: '💡', Health: '💊', Shopping: '🛍', Fun: '🎟', Other: '📦' }
const CAT_COLOR: Record<string, string> = { Groceries: '#10b981', Dining: '#f97316', Transport: '#0ea5e9', Housing: '#6366f1', Utilities: '#eab308', Health: '#ef4444', Shopping: '#ec4899', Fun: '#a855f7', Other: '#64748b' }
const localDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)

/** Four months of realistic sample spending (deterministic). */
function sampleEntries(): Entry[] {
  let seed = 42
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const out: Entry[] = []
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 3, 1)
  const notes: Record<string, string[]> = {
    Groceries: ['Supermarket', 'Farmers market', 'Bakery'], Dining: ['Lunch', 'Pizza night', 'Coffee'], Transport: ['Fuel', 'Metro card', 'Taxi'],
    Health: ['Pharmacy', 'Gym'], Shopping: ['Clothes', 'Books', 'Home goods'], Fun: ['Cinema', 'Concert', 'Streaming'], Other: ['Gift', 'Haircut'],
  }
  for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
    const day = localDay(d)
    if (d.getDate() === 1) out.push({ id: uid(), date: day, amount: 1250, cat: 'Housing', note: 'Rent' })
    if (d.getDate() === 5) out.push({ id: uid(), date: day, amount: Math.round(90 + rnd() * 60), cat: 'Utilities', note: 'Electricity & water' })
    const n = Math.floor(rnd() * 3)
    for (let k = 0; k < n; k++) {
      const r = rnd()
      const cat = r < 0.32 ? 'Groceries' : r < 0.52 ? 'Dining' : r < 0.68 ? 'Transport' : r < 0.78 ? 'Shopping' : r < 0.88 ? 'Fun' : r < 0.95 ? 'Health' : 'Other'
      const base = { Groceries: 38, Dining: 22, Transport: 18, Shopping: 45, Fun: 25, Health: 30, Other: 35 }[cat] ?? 20
      const list = notes[cat]
      out.push({ id: uid(), date: day, amount: Math.round(base * (0.4 + rnd() * 1.3) * 100) / 100, cat, note: list[Math.floor(rnd() * list.length)] })
    }
  }
  return out.reverse()
}

const DEF: State = { currency: '$', budget: 2400, cats: CATS, entries: sampleEntries() }
const ym = (d: string) => d.slice(0, 7)
const monthName = (m: string) => new Date(m + '-15').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })

export default function ExpenseTracker() {
  const [s, set, reset] = useToolState('expense-tracker', DEF)
  const today = localDay()
  const [form, setForm] = useState({ amount: 0, cat: 'Groceries', note: '', date: today })
  const [month, setMonth] = useState(ym(today))
  const [off, setOff] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')
  const m = (x: number) => money(x, s.currency)
  const catColor = (c: string) => CAT_COLOR[c] ?? color(Math.max(0, s.cats.indexOf(c)) + 3)
  const active = s.cats.filter((c) => !off.includes(c))
  const visible = s.entries.filter((e) => active.includes(e.cat) || !s.cats.includes(e.cat))

  const months = [...new Set([ym(today), ...s.entries.map((e) => ym(e.date))])].sort()
  const last12 = months.slice(-12)
  const inMonth = visible.filter((e) => ym(e.date) === month)
  const total = inMonth.reduce((a, e) => a + e.amount, 0)
  const prevM = months[months.indexOf(month) - 1]
  const daysIn = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  const daysSoFar = month === ym(today) ? Number(today.slice(8, 10)) : daysIn
  // compare like with like: for the running month only the same days of the previous month count
  const prevTotal = prevM ? visible.filter((e) => ym(e.date) === prevM && (daysSoFar === daysIn || Number(e.date.slice(8, 10)) <= daysSoFar)).reduce((a, e) => a + e.amount, 0) : NaN
  const byCat = active.map((c) => ({ label: `${ICON[c] ?? '•'} ${c}`, value: inMonth.filter((e) => e.cat === c).reduce((a, e) => a + e.amount, 0), color: catColor(c) })).filter((x) => x.value > 0)
  const top = [...byCat].sort((a, b) => b.value - a.value)[0]
  const allTotal = s.entries.filter((e) => ym(e.date) === month).reduce((a, e) => a + e.amount, 0)
  // pace: fixed bills (housing, utilities) count once, everyday spending is extrapolated
  const variable = s.entries.filter((e) => ym(e.date) === month && e.cat !== 'Housing' && e.cat !== 'Utilities').reduce((a, e) => a + e.amount, 0)
  const projected = month === ym(today) ? allTotal + (variable / daysSoFar) * (daysIn - daysSoFar) : allTotal

  const add = () => {
    if (!(form.amount > 0)) return setErr('Enter an amount greater than zero.')
    setErr('')
    set({ entries: [{ id: uid(), date: form.date || today, amount: Math.round(form.amount * 100) / 100, cat: form.cat, note: form.note.trim() }, ...s.entries].sort((a, b) => b.date.localeCompare(a.date)) })
    setForm({ ...form, amount: 0, note: '' })
    setMonth(ym(form.date || today))
  }
  const edit = (id: string, p: Partial<Entry>) => set({ entries: s.entries.map((e) => (e.id === id ? { ...e, ...p } : e)) })

  const importCsv = async (f: File) => {
    const lines = (await f.text()).split(/\r?\n/).filter((l) => l.trim())
    const rows = lines.map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"')))
    const head = rows[0].map((h) => h.toLowerCase())
    const ix = (k: string) => head.findIndex((h) => h.includes(k))
    const [di, ai, ci, ni] = [ix('date'), ix('amount'), ix('cat'), ix('note')]
    if (di < 0 || ai < 0) return setErr('CSV needs at least "date" and "amount" columns.')
    const add2: Entry[] = rows.slice(1).map((r) => ({ id: uid(), date: r[di]?.slice(0, 10), amount: Math.abs(Number(r[ai]?.replace(/[^\d.-]/g, ''))), cat: r[ci] || 'Other', note: r[ni] ?? '' }))
      .filter((e) => /^\d{4}-\d\d-\d\d$/.test(e.date) && e.amount > 0)
    const newCats = [...new Set(add2.map((e) => e.cat))].filter((c) => !s.cats.includes(c))
    set({ entries: [...add2, ...s.entries].sort((a, b) => b.date.localeCompare(a.date)), cats: [...s.cats, ...newCats] })
    setErr('')
  }

  const list = inMonth.filter((e) => !q || `${e.note} ${e.cat} ${e.amount}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <Split>
      <div>
        <Panel title="Quick add">
          <Row>
            <Num label="Amount" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} unit={s.currency} min={0} />
            <Txt label="Date" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} />
          </Row>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
            {s.cats.map((c) => (
              <button key={c} type="button" className={`k-btn ${form.cat === c ? 'primary' : ''}`} onClick={() => setForm({ ...form, cat: c })} style={{ padding: '4px 10px' }}>
                {ICON[c] ?? '•'} {c}
              </button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); add() }}>
            <Txt label="Note (optional)" value={form.note} onChange={(note) => setForm({ ...form, note })} placeholder="e.g. Weekly shop" />
            <Btn kind="primary" onClick={add}>＋ Add expense</Btn>
          </form>
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="Monthly budget">
          <Row>
            <Ring value={allTotal / (s.budget || 1)} label={pct(allTotal / (s.budget || 1), 0)} color={allTotal > s.budget ? 'var(--err)' : projected > s.budget ? 'var(--warn)' : 'var(--ok)'} />
            <div style={{ flex: 1, minWidth: 160 }}>
              <Num label="Budget per month" value={s.budget} onChange={(budget) => set({ budget: Math.max(0, budget) })} unit={s.currency} min={0} />
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {allTotal > s.budget ? `Over budget by ${m(allTotal - s.budget)}` : `${m(s.budget - allTotal)} left`}
                {month === ym(today) && ` · on pace for ${m(projected)}`}
              </p>
            </div>
          </Row>
        </Panel>
        <Panel title="Data">
          <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', '₹', 'CHF ']} />
          <Row>
            <CsvButton name="expenses.csv" rows={() => [['date', 'amount', 'category', 'note'], ...s.entries.map((e) => [e.date, e.amount, e.cat, e.note])]} />
            <JsonButtons name="expenses.json" data={s} onLoad={(d) => d && Array.isArray(d.entries) && set({ ...DEF, ...d })} />
            <Btn kind="ghost" onClick={() => confirm('Delete all entries?') && set({ entries: [] })}>Clear all</Btn>
            <Btn kind="ghost" onClick={reset}>Sample data</Btn>
          </Row>
          <FileDrop accept=".csv" onFiles={(f) => void importCsv(f[0])} label="Import CSV (date, amount, category, note)" />
        </Panel>
      </div>
      <div>
        <Row>
          <Btn kind="ghost" disabled={months.indexOf(month) <= 0} onClick={() => setMonth(months[months.indexOf(month) - 1])}>◀</Btn>
          <b style={{ fontSize: 18, minWidth: 130, textAlign: 'center' }}>{new Date(month + '-15').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b>
          <Btn kind="ghost" disabled={months.indexOf(month) >= months.length - 1} onClick={() => setMonth(months[months.indexOf(month) + 1])}>▶</Btn>
        </Row>
        <Stats>
          <Stat label="Spent this month" value={m(total)} tone="accent" sub={`${inMonth.length} expenses`} />
          <Stat label="vs previous month" value={Number.isFinite(prevTotal) && prevTotal > 0 ? `${total >= prevTotal ? '+' : '−'}${pct(Math.abs(total - prevTotal) / prevTotal, 0)}` : '—'} sub={Number.isFinite(prevTotal) ? `${m(prevTotal)}${daysSoFar < daysIn ? ` in days 1–${daysSoFar}` : ''}` : 'no data'} tone={Number.isFinite(prevTotal) ? (total > prevTotal ? 'bad' : 'good') : undefined} />
          <Stat label="Daily average" value={m(total / daysSoFar)} sub={`over ${daysSoFar} days`} />
          <Stat label="Top category" value={top ? top.label : '—'} sub={top ? `${m(top.value)} · ${pct(top.value / (total || 1), 0)}` : undefined} />
        </Stats>
        <Panel title="Category filter" actions={<><Btn kind="ghost" onClick={() => setOff([])}>All</Btn><Btn kind="ghost" onClick={() => setOff(s.cats)}>None</Btn></>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {s.cats.map((c) => {
              const on = !off.includes(c)
              return (
                <button key={c} type="button" onClick={() => setOff(on ? [...off, c] : off.filter((x) => x !== c))} className="k-btn" style={{ padding: '3px 10px', opacity: on ? 1 : 0.45, borderColor: catColor(c) }}>
                  <i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 9, background: catColor(c), marginRight: 6 }} />{c}
                </button>
              )
            })}
          </div>
        </Panel>
        <Panel title="Monthly spending">
          <BarChart
            bars={last12.map((mm) => ({ label: monthName(mm), value: active.map((c) => visible.filter((e) => ym(e.date) === mm && e.cat === c).reduce((a, e) => a + e.amount, 0)) }))}
            stacks={active.map((c) => ({ name: c, color: catColor(c) }))}
            fy={(v) => money(v, s.currency, 0)}
          />
        </Panel>
        <Panel title="By category">
          {byCat.length ? <Donut slices={byCat} fv={(v) => money(v, s.currency, 0)} center={<b>{money(total, s.currency, 0)}</b>} /> : <p className="muted">No expenses in this month for the selected categories.</p>}
        </Panel>
        <Panel title="Entries" actions={<input className="k-text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" style={{ width: 140 }} />}>
          <Table
            max={40}
            head={['Date', 'Category', 'Note', 'Amount', '']}
            rows={list.map((e) => [
              <input key="d" type="date" value={e.date} onChange={(ev) => ev.target.value && edit(e.id, { date: ev.target.value })} aria-label="Date" />,
              <select key="c" value={e.cat} onChange={(ev) => edit(e.id, { cat: ev.target.value })} aria-label="Category">{s.cats.map((c) => <option key={c}>{c}</option>)}</select>,
              <input key="n" value={e.note} onChange={(ev) => edit(e.id, { note: ev.target.value })} aria-label="Note" style={{ minWidth: 100 }} />,
              <input key="a" type="number" min={0} step="0.01" value={e.amount} onChange={(ev) => edit(e.id, { amount: Math.max(0, Number(ev.target.value) || 0) })} aria-label="Amount" style={{ width: 90 }} />,
              <Btn key="x" kind="ghost" onClick={() => set({ entries: s.entries.filter((x) => x.id !== e.id) })} title="Delete">✕</Btn>,
            ])}
            foot={['Total', '', `${list.length} items`, m(list.reduce((a, e) => a + e.amount, 0)), '']}
          />
        </Panel>
      </div>
    </Split>
  )
}
