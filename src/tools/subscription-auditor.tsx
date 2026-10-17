import { useState } from 'react'
import { Btn, CsvButton, Donut, JsonButtons, Note, Num, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, Table, Txt, download, money, pct, today, uid, useToolState } from '../kit'
import { CYCLES, daysBetween, monthly, nextRenewal, renewalsBetween, validISO, yearly, type Cycle } from './lib/subscription-auditor'

type Status = 'active' | 'trial' | 'paused' | 'cancel'
type Value = 'love' | 'ok' | 'unused'
interface Sub { id: string; name: string; category: string; price: number; cycle: Cycle; days: number; next: string; status: Status; value: Value }
type Key = 'name' | 'category' | 'monthly' | 'yearly' | 'next' | 'value' | 'status'
interface State { cur: string; remind: number; subs: Sub[]; sort: Key; desc: boolean; paused: boolean }

const T = today()
const plus = (d: number) => new Date(Date.parse(T) + d * 86400000).toISOString().slice(0, 10)
const CATS = ['Streaming', 'Music', 'Software', 'Cloud storage', 'News', 'Fitness', 'Gaming', 'Shopping', 'Education', 'Utilities', 'Other']
const DEF: State = {
  cur: '$', remind: 7, sort: 'yearly', desc: true, paused: false,
  subs: [
    { id: 's1', name: 'Netflix', category: 'Streaming', price: 15.49, cycle: 'monthly', days: 30, next: plus(4), status: 'active', value: 'love' },
    { id: 's2', name: 'Spotify', category: 'Music', price: 11.99, cycle: 'monthly', days: 30, next: plus(12), status: 'active', value: 'love' },
    { id: 's3', name: 'Adobe Creative Cloud', category: 'Software', price: 59.99, cycle: 'monthly', days: 30, next: plus(2), status: 'active', value: 'ok' },
    { id: 's4', name: 'iCloud+ 200 GB', category: 'Cloud storage', price: 2.99, cycle: 'monthly', days: 30, next: plus(20), status: 'active', value: 'love' },
    { id: 's5', name: 'Gym membership', category: 'Fitness', price: 39, cycle: 'monthly', days: 30, next: plus(9), status: 'active', value: 'unused' },
    { id: 's6', name: 'Amazon Prime', category: 'Shopping', price: 139, cycle: 'yearly', days: 30, next: plus(63), status: 'active', value: 'ok' },
    { id: 's7', name: 'Newspaper digital', category: 'News', price: 17, cycle: 'days', days: 28, next: plus(6), status: 'active', value: 'ok' },
    { id: 's8', name: 'AI assistant', category: 'Software', price: 20, cycle: 'monthly', days: 30, next: plus(15), status: 'active', value: 'love' },
    { id: 's9', name: 'Language app', category: 'Education', price: 83.99, cycle: 'yearly', days: 30, next: plus(140), status: 'active', value: 'unused' },
    { id: 's10', name: 'Game Pass', category: 'Gaming', price: 16.99, cycle: 'monthly', days: 30, next: plus(25), status: 'paused', value: 'ok' },
    { id: 's11', name: 'VPN', category: 'Utilities', price: 59.88, cycle: 'yearly', days: 30, next: plus(31), status: 'cancel', value: 'unused' },
    { id: 's12', name: 'Video editor trial', category: 'Software', price: 12.99, cycle: 'monthly', days: 30, next: plus(3), status: 'trial', value: 'ok' },
  ],
}
const STATUS: Record<Status, [string, string]> = { active: ['Active', 'var(--ok)'], trial: ['Trial', 'var(--accent)'], paused: ['Paused', 'var(--muted)'], cancel: ['Cancel', 'var(--err)'] }
const VALUE: Record<Value, string> = { love: '😍 Worth it', ok: '🙂 OK', unused: '😴 Barely use' }
const blank = (): Sub => ({ id: uid(), name: '', category: 'Streaming', price: 9.99, cycle: 'monthly', days: 30, next: T, status: 'active', value: 'ok' })
const esc = (s: string) => s.replace(/[\\;,]/g, (m) => '\\' + m)

export default function SubscriptionAuditor() {
  const [s, set, reset] = useToolState('subscription-auditor', DEF)
  const [form, setForm] = useState<Sub>(blank)
  const [editing, setEditing] = useState(false)
  const m = (x: number, d = 2) => money(x, s.cur, d)
  const counts = (x: Sub) => x.status === 'active' || x.status === 'trial' || (s.paused && x.status === 'paused')
  const rows = s.subs.map((x) => ({ x, mo: monthly(x.price, x.cycle, x.days), yr: yearly(x.price, x.cycle, x.days), nx: nextRenewal(x.next, x.cycle, T, x.days) }))
  const live = rows.filter((r) => counts(r.x))
  const totalYr = live.reduce((a, r) => a + r.yr, 0)
  const save = rows.filter((r) => r.x.status === 'cancel' || (counts(r.x) && r.x.value === 'unused'))
  const saveYr = save.reduce((a, r) => a + r.yr, 0)
  const soon = rows.filter((r) => r.x.status !== 'paused' && validISO(r.nx) && daysBetween(T, r.nx) <= s.remind).sort((a, b) => a.nx.localeCompare(b.nx))
  const dir = s.desc ? -1 : 1
  const sorted = [...rows].sort((a, b) => {
    const k = s.sort
    const v = k === 'monthly' ? a.mo - b.mo : k === 'yearly' ? a.yr - b.yr : k === 'next' ? a.nx.localeCompare(b.nx) : String(a.x[k]).localeCompare(String(b.x[k]))
    return v * dir
  })
  const byCat = Object.entries(live.reduce<Record<string, number>>((a, r) => ({ ...a, [r.x.category]: (a[r.x.category] ?? 0) + r.yr }), {})).sort((a, b) => b[1] - a[1])
  const top3 = [...live].sort((a, b) => b.yr - a.yr).slice(0, 3)
  const head = (k: Key, l: string) => (
    <button type="button" onClick={() => set({ sort: k, desc: s.sort === k ? !s.desc : k === 'monthly' || k === 'yearly' })} style={{ all: 'unset', cursor: 'pointer', fontWeight: 700 }}>
      {l}{s.sort === k ? (s.desc ? ' ▼' : ' ▲') : ''}
    </button>
  )
  const submit = () => {
    if (!form.name.trim() || !(form.price >= 0) || !validISO(form.next)) return
    set({ subs: editing ? s.subs.map((x) => (x.id === form.id ? form : x)) : [...s.subs, form] })
    setForm(blank())
    setEditing(false)
  }
  const exportIcs = () => {
    const end = new Date(Date.parse(T) + 365 * 86400000).toISOString().slice(0, 10)
    const ev: string[] = []
    for (const r of rows) {
      if (r.x.status === 'paused') continue
      for (const d of renewalsBetween(r.x.next, r.x.cycle, T, end, r.x.days).slice(0, r.x.status === 'trial' ? 1 : 60)) {
        const dd = d.replace(/-/g, '')
        ev.push('BEGIN:VEVENT', `UID:${r.x.id}-${dd}@browser-toolbox`, `DTSTAMP:${T.replace(/-/g, '')}T000000Z`, `DTSTART;VALUE=DATE:${dd}`,
          `SUMMARY:${esc(`${r.x.status === 'trial' ? 'Trial ends' : 'Renews'}: ${r.x.name} ${m(r.x.price)}`)}`,
          'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(r.x.name)} renews tomorrow`, 'TRIGGER:-P1D', 'END:VALARM', 'END:VEVENT')
      }
    }
    download('subscription-renewals.ics', ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Subscription Auditor//EN', ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n', 'text/calendar')
  }

  return (
    <Split wide="right">
      <div>
        <Panel title={editing ? 'Edit subscription' : 'Add subscription'}>
          <Txt label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} placeholder="e.g. Netflix" />
          <Row>
            <Num label="Price" value={form.price} onChange={(price) => setForm({ ...form, price })} unit={s.cur} min={0} />
            <Select label="Billed" value={form.cycle} onChange={(cycle) => setForm({ ...form, cycle })} options={CYCLES} />
          </Row>
          {form.cycle === 'days' && <Num label="Every" value={form.days} onChange={(days) => setForm({ ...form, days: Math.max(1, Math.round(days)) })} unit="days" min={1} />}
          <Row>
            <Txt type="date" label="Next renewal" value={form.next} onChange={(next) => setForm({ ...form, next })} />
            <Select label="Category" value={form.category} onChange={(category) => setForm({ ...form, category })} options={CATS} />
          </Row>
          <Row>
            <Select label="Status" value={form.status} onChange={(status) => setForm({ ...form, status })} options={Object.entries(STATUS).map(([k, v]) => [k as Status, v[0]] as [Status, string])} />
            <Select label="Value to me" value={form.value} onChange={(value) => setForm({ ...form, value })} options={Object.entries(VALUE) as [Value, string][]} />
          </Row>
          <p className="muted" style={{ margin: '0 0 8px' }}>= {m(monthly(form.price, form.cycle, form.days))}/month · {m(yearly(form.price, form.cycle, form.days))}/year</p>
          <Row>
            <Btn kind="primary" onClick={submit} disabled={!form.name.trim() || !validISO(form.next)}>{editing ? 'Save changes' : '+ Add'}</Btn>
            {editing && <Btn onClick={() => { setForm(blank()); setEditing(false) }}>Cancel</Btn>}
          </Row>
        </Panel>
        <Panel title={`Renewing in the next ${s.remind} days`}>
          <Slider label="Remind me within" value={s.remind} onChange={(remind) => set({ remind })} min={1} max={31} unit=" days" />
          {soon.length ? soon.map((r) => {
            const d = daysBetween(T, r.nx)
            return (
              <Note key={r.x.id} tone={r.x.status === 'trial' || r.x.status === 'cancel' ? 'warn' : 'info'}>
                <b>{r.x.name}</b> {r.x.status === 'trial' ? 'trial ends and starts billing' : r.x.status === 'cancel' ? 'renews — cancel before' : 'renews'} {d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`} ({r.nx}) · {m(r.x.price)}
              </Note>
            )
          }) : <p className="muted">Nothing renews in this window. 🎉</p>}
          <Btn onClick={exportIcs}>📅 Add renewals to calendar (.ics)</Btn>
        </Panel>
        <Panel title="Settings" actions={<Btn kind="ghost" onClick={reset}>Sample data</Btn>}>
          <Row>
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ', 'A$', 'C$']} />
          </Row>
          <label className="k-check"><input type="checkbox" checked={s.paused} onChange={(e) => set({ paused: e.target.checked })} /> Count paused subscriptions in totals</label>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Per month" value={m(totalYr / 12)} sub={`${live.length} counted`} tone="accent" />
          <Stat label="Per year" value={m(totalYr, 0)} sub={`${m(totalYr / 365.25)} a day`} />
          <Stat label="Possible savings" value={m(saveYr, 0) + '/yr'} sub={`${save.length} to cancel or unused`} tone={saveYr ? 'good' : undefined} />
          <Stat label="Next 30 days" value={m(rows.filter((r) => counts(r.x)).reduce((a, r) => a + renewalsBetween(r.x.next, r.x.cycle, T, new Date(Date.parse(T) + 30 * 86400000).toISOString().slice(0, 10), r.x.days).length * r.x.price, 0))} sub="due to be charged" />
        </Stats>
        <Panel title="All subscriptions" actions={<><CsvButton name="subscriptions.csv" rows={() => [['Name', 'Category', 'Price', 'Cycle', 'Monthly', 'Yearly', 'Next renewal', 'Status', 'Value'], ...sorted.map((r) => [r.x.name, r.x.category, r.x.price, r.x.cycle === 'days' ? `every ${r.x.days} days` : r.x.cycle, r.mo.toFixed(2), r.yr.toFixed(2), r.nx, r.x.status, r.x.value])]} /><JsonButtons name="subscriptions.json" data={s} onLoad={(d) => d && Array.isArray(d.subs) && set(d)} /></>}>
          <Table
            head={[head('name', 'Name'), head('monthly', 'Monthly'), head('yearly', 'Yearly'), head('next', 'Next'), head('value', 'Value'), head('status', 'Status'), '']}
            rows={sorted.map((r) => {
              const d = daysBetween(T, r.nx)
              const dim = !counts(r.x)
              return [
                <span key="n" style={{ opacity: dim ? 0.55 : 1 }}><b>{r.x.name}</b><br /><small className="muted">{r.x.category} · {m(r.x.price)}/{r.x.cycle === 'days' ? `${r.x.days}d` : CYCLES.find((c) => c[0] === r.x.cycle)![1].toLowerCase()}</small></span>,
                m(r.mo), <b key="y">{m(r.yr, 0)}</b>,
                <span key="d" style={{ color: d <= s.remind && r.x.status !== 'paused' ? 'var(--warn)' : undefined }}>{r.nx}<br /><small className="muted">in {d} d</small></span>,
                <select key="v" value={r.x.value} title={VALUE[r.x.value]} aria-label="Value" onChange={(e) => set({ subs: s.subs.map((x) => (x.id === r.x.id ? { ...x, value: e.target.value as Value } : x)) })}>{Object.entries(VALUE).map(([k, v]) => <option key={k} value={k} title={v}>{v.split(' ')[0]}</option>)}</select>,
                <select key="s" value={r.x.status} aria-label="Status" style={{ color: STATUS[r.x.status][1], fontWeight: 700 }} onChange={(e) => set({ subs: s.subs.map((x) => (x.id === r.x.id ? { ...x, status: e.target.value as Status } : x)) })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select>,
                <span key="a" style={{ whiteSpace: 'nowrap' }}><Btn kind="ghost" onClick={() => { setForm(r.x); setEditing(true) }} title="Edit">✎</Btn><Btn kind="ghost" onClick={() => set({ subs: s.subs.filter((x) => x.id !== r.x.id) })} title="Delete">✕</Btn></span>,
              ]
            })}
            foot={['Total (counted)', m(totalYr / 12), m(totalYr, 0), '', '', '', '']}
          />
        </Panel>
        <Panel title="Insights">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, alignItems: 'start' }}>
            <Donut slices={byCat.map(([label, value]) => ({ label, value }))} fv={(v) => m(v, 0)} center={<span>{m(totalYr, 0)}<br /><small>per year</small></span>} size={200} />
            <div>
              {top3.length > 0 && <p>Your top {top3.length} ({top3.map((r) => r.x.name).join(', ')}) make up <b>{pct(top3.reduce((a, r) => a + r.yr, 0) / (totalYr || 1), 0)}</b> of spending.</p>}
              {saveYr > 0 && <p>Cancelling what you marked <i>Cancel</i> or <i>Barely use</i> frees <b>{m(saveYr, 0)}</b> a year — {m(saveYr / 12)} a month.</p>}
              {live.some((r) => r.x.cycle === 'monthly' && r.yr > 100) && <p>Many services discount annual plans by 15–20%. Switching your monthly plans over {m(100, 0)}/yr could save about <b>{m(live.filter((r) => r.x.cycle === 'monthly' && r.yr > 100).reduce((a, r) => a + r.yr, 0) * 0.16, 0)}</b>/yr.</p>}
              <Seg value={s.desc ? 'd' : 'a'} onChange={(v) => set({ desc: v === 'd' })} options={[['d', 'Sort high → low'], ['a', 'Low → high']]} label="Sort direction" />
            </div>
          </div>
        </Panel>
      </div>
    </Split>
  )
}
