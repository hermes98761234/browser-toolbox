import { useMemo, useState } from 'react'
import { Area, Btn, CopyButton, CsvButton, download, JsonButtons, money, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { addDays, conflicts, dow, freeSlots, occurrences, toHM, toIcs, toMin, utilisation, weekStart, type Appt, type Business, type Client, type Hours, type Occ, type Repeat, type Service, type Status } from './lib/appointment-book'

interface State { biz: Business; services: Service[]; clients: Client[]; appts: Appt[]; hours: Hours; buffer: number; view: 'week' | 'month' | 'list'; cursor: string; currency: string }

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const T = localToday()
const W = weekStart(T)
const mk = (id: string, clientId: string, serviceId: string, d: number, start: string, minutes: number, extra: Partial<Appt> = {}): Appt => ({ id, clientId, serviceId, date: addDays(W, d), start, minutes, status: 'confirmed', notes: '', repeat: 'none', count: 1, skip: [], ...extra })
const DEF: State = {
  biz: { name: 'Lumen Physio Studio', email: 'desk@lumen.example', address: '12 Harbour Street, Suite 4' },
  services: [
    { id: 'ini', name: 'Initial assessment', minutes: 60, price: 85, color: '#6366f1' },
    { id: 'fol', name: 'Follow-up session', minutes: 45, price: 60, color: '#0ea5e9' },
    { id: 'mas', name: 'Sports massage', minutes: 30, price: 40, color: '#10b981' },
    { id: 'rev', name: 'Video review call', minutes: 20, price: 0, color: '#f59e0b' },
  ],
  clients: [
    { id: 'c1', name: 'Ann Lee', email: 'ann.lee@example.com', phone: '+1 555 0101' },
    { id: 'c2', name: 'Marco Bianchi', email: 'marco@example.com', phone: '+39 333 1234' },
    { id: 'c3', name: 'Oksana Kovalenko', email: 'oksana.k@example.com', phone: '+380 67 555 0000' },
    { id: 'c4', name: 'Sam Patel', email: 'sam.patel@example.com', phone: '' },
    { id: 'c5', name: 'Jonas Berg', email: '', phone: '+46 70 123 45 67' },
  ],
  appts: [
    mk('a1', 'c1', 'ini', 0, '09:00', 60),
    mk('a2', 'c2', 'fol', 0, '10:30', 45, { repeat: 'weekly', count: 6, notes: 'Knee rehab plan, week 3' }),
    mk('a3', 'c3', 'mas', 1, '13:00', 30),
    mk('a4', 'c4', 'fol', 2, '09:30', 45, { repeat: 'biweekly', count: 4 }),
    mk('a5', 'c5', 'rev', 2, '16:00', 20, { status: 'booked' }),
    mk('a6', 'c1', 'fol', 3, '11:00', 45, { repeat: 'weekly', count: 8 }),
    mk('a7', 'c3', 'ini', 4, '14:00', 60, { status: 'booked', notes: 'Referred by Dr. Novak' }),
    mk('a8', 'c2', 'mas', 4, '14:30', 30, { status: 'booked', notes: 'Double-booked on purpose — see conflicts' }),
    mk('a9', 'c4', 'mas', -3, '15:00', 30, { status: 'done' }),
    mk('a10', 'c5', 'fol', -2, '10:00', 45, { status: 'no-show' }),
  ],
  hours: [null, [540, 1080], [540, 1080], [600, 1140], [540, 1080], [540, 960], [600, 780]],
  buffer: 10, view: 'week', cursor: T, currency: '$',
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STATUS: Status[] = ['booked', 'confirmed', 'done', 'no-show', 'cancelled']
const blank = (s: State): Appt => ({ id: '', clientId: s.clients[0]?.id ?? '', serviceId: s.services[0]?.id ?? '', date: T, start: '10:00', minutes: s.services[0]?.minutes ?? 60, status: 'booked', notes: '', repeat: 'none', count: 6, skip: [] })
/** Side-by-side lanes for overlapping bookings in one day column. */
function lanes(list: Occ[]): { o: Occ; lane: number; of: number }[] {
  const sorted = [...list].sort((a, b) => a.startMin - b.startMin)
  const out: { o: Occ; lane: number; of: number }[] = []
  let group: { o: Occ; lane: number; of: number }[] = [], ends: number[] = [], groupEnd = -1
  const flush = () => { for (const g of group) g.of = ends.length; out.push(...group); group = []; ends = [] }
  for (const o of sorted) {
    if (o.startMin >= groupEnd) flush()
    let lane = ends.findIndex((e) => e <= o.startMin)
    if (lane < 0) { lane = ends.length; ends.push(o.endMin) } else ends[lane] = o.endMin
    group.push({ o, lane, of: 1 })
    groupEnd = Math.max(groupEnd, o.endMin)
  }
  flush()
  return out
}
const longDate = (d: string) => new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

export default function AppointmentBook() {
  const [s, set, reset] = useToolState('appointment-book', DEF)
  const [form, setForm] = useState<Appt>(() => blank(s))
  const [occDate, setOccDate] = useState('')
  const [newClient, setNewClient] = useState('')
  const [tab, setTab] = useState<'book' | 'setup'>('book')
  const [nowMin] = useState(() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() })
  const svc = (id: string) => s.services.find((x) => x.id === id)
  const cli = (id: string) => s.clients.find((x) => x.id === id)
  const m = (x: number) => money(x, s.currency, 0)

  const ws = weekStart(s.cursor)
  const range = s.view === 'month' ? [s.cursor.slice(0, 8) + '01', addDays(s.cursor.slice(0, 8) + '01', 41)] : s.view === 'week' ? [ws, addDays(ws, 6)] : [T, addDays(T, 60)]
  const occs = useMemo(() => occurrences(s.appts, addDays(range[0], -7), addDays(range[1], 7)), [s.appts, range[0], range[1]]) // eslint-disable-line react-hooks/exhaustive-deps
  const weekOccs = occs.filter((o) => o.date >= ws && o.date <= addDays(ws, 6))
  const clash = conflicts(weekOccs.filter((o) => o.appt.status !== 'no-show'), s.buffer)
  const util = utilisation(weekOccs, s.hours, ws, 7)
  const revenue = weekOccs.filter((o) => o.appt.status !== 'no-show').reduce((a, o) => a + (svc(o.appt.serviceId)?.price ?? 0), 0)
  const allPast = occurrences(s.appts, addDays(T, -90), addDays(T, -1), true)
  const noShow = allPast.filter((o) => o.appt.status === 'no-show').length
  const slots = useMemo(() => freeSlots(occurrences(s.appts, T, addDays(T, 21)), s.hours, T, 21, form.minutes, s.buffer, 15, { date: T, min: nowMin }, 18), [s.appts, s.hours, s.buffer, form.minutes, nowMin])

  const save = () => {
    if (!form.clientId || !form.serviceId) return
    const a = { ...form, id: form.id || uid() }
    set({ appts: form.id ? s.appts.map((x) => (x.id === form.id ? a : x)) : [...s.appts, a] })
    setForm(a)
  }
  const edit = (o: Occ) => { setForm(o.appt); setOccDate(o.date); setTab('book') }
  const startAt = (date: string, min: number) => { setForm({ ...blank(s), serviceId: form.serviceId, minutes: form.minutes, clientId: form.clientId || s.clients[0]?.id, date, start: toHM(min) }); setOccDate('') }
  const addClient = () => {
    if (!newClient.trim()) return
    const c: Client = { id: uid(), name: newClient.trim(), email: '', phone: '' }
    set({ clients: [...s.clients, c] }); setForm({ ...form, clientId: c.id }); setNewClient('')
  }
  const ics = (list: Occ[], name: string) => download(name, toIcs(list, s.services, s.clients, s.biz), 'text/calendar')
  const confirmText = (a: Appt, date: string) => {
    const c = cli(a.clientId), v = svc(a.serviceId)
    return `Hi ${c?.name.split(' ')[0] ?? 'there'}, this confirms your ${v?.name ?? 'appointment'} at ${s.biz.name} on ${longDate(date)} at ${a.start} (${a.minutes} min)${s.biz.address ? `, ${s.biz.address}` : ''}.${a.repeat !== 'none' ? ` It repeats ${a.repeat} (${a.count} sessions).` : ''} Reply to reschedule. See you then!`
  }

  // ---------- week grid ----------
  const open = s.hours.filter(Boolean) as [number, number][]
  const dayStart = Math.floor(Math.min(...open.map((h) => h[0]), ...weekOccs.map((o) => o.startMin)) / 60) * 60
  const dayEnd = Math.ceil(Math.max(...open.map((h) => h[1]), ...weekOccs.map((o) => o.endMin)) / 60) * 60
  const PX = 1.1 // px per minute
  const clashIds = new Set(clash.flatMap(([a, b]) => [a.appt.id + a.date, b.appt.id + b.date]))
  const week = (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(7, minmax(92px, 1fr))', minWidth: 720, fontSize: 12 }}>
        <div />
        {Array.from({ length: 7 }, (_, i) => { const d = addDays(ws, i); return <div key={d} style={{ textAlign: 'center', padding: 4, fontWeight: 700, color: d === T ? 'var(--accent)' : undefined }}>{DAYS[dow(d)]} {+d.slice(8)}</div> })}
        <div style={{ position: 'relative', height: (dayEnd - dayStart) * PX }}>
          {Array.from({ length: (dayEnd - dayStart) / 60 + 1 }, (_, i) => <div key={i} className="muted" style={{ position: 'absolute', top: i * 60 * PX - 7, right: 4 }}>{toHM(dayStart + i * 60).slice(0, 2)}h</div>)}
        </div>
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(ws, i), h = s.hours[dow(d)]
          return (
            <div key={d} style={{ position: 'relative', height: (dayEnd - dayStart) * PX, borderLeft: '1px solid var(--line)', background: `repeating-linear-gradient(var(--line) 0 1px, transparent 1px ${60 * PX}px)`, cursor: 'copy' }}
              onClick={(e) => { if (e.target !== e.currentTarget) return; const y = e.nativeEvent.offsetY; startAt(d, dayStart + Math.floor(y / PX / 15) * 15) }}>
              {h ? <>
                <div style={{ position: 'absolute', inset: `0 0 auto 0`, height: Math.max(0, (h[0] - dayStart) * PX), background: 'var(--line)', opacity: 0.5, pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', inset: `${(h[1] - dayStart) * PX}px 0 0 0`, background: 'var(--line)', opacity: 0.5, pointerEvents: 'none' }} />
              </> : <div style={{ position: 'absolute', inset: 0, background: 'var(--line)', opacity: 0.5, pointerEvents: 'none' }} />}
              {lanes(weekOccs.filter((o) => o.date === d)).map(({ o, lane, of }) => {
                const v = svc(o.appt.serviceId), bad = clashIds.has(o.appt.id + o.date)
                return (
                  <button key={o.appt.id + o.date} type="button" onClick={() => edit(o)} title={`${cli(o.appt.clientId)?.name} · ${v?.name}`}
                    style={{ position: 'absolute', left: `calc(${(lane / of) * 100}% + 2px)`, width: `calc(${100 / of}% - 4px)`, top: (o.startMin - dayStart) * PX, height: Math.max(18, (o.endMin - o.startMin) * PX - 2), background: v?.color ?? '#64748b', opacity: o.appt.status === 'done' || o.appt.status === 'no-show' ? 0.5 : 1, color: '#fff', border: bad ? '2px solid #ef4444' : form.id === o.appt.id ? '2px solid var(--text, #111)' : 'none', borderRadius: 6, padding: '1px 4px', textAlign: 'left', overflow: 'hidden', fontSize: 11, lineHeight: 1.2, cursor: 'pointer', textDecoration: o.appt.status === 'no-show' ? 'line-through' : undefined }}>
                    <b>{toHM(o.startMin)}</b> {cli(o.appt.clientId)?.name}{o.appt.repeat !== 'none' ? ' ↻' : ''}{o.appt.status === 'booked' ? ' ?' : ''}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )

  const month = (() => {
    const first = s.cursor.slice(0, 8) + '01', start = weekStart(first)
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, fontSize: 12 }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <b key={d} style={{ textAlign: 'center' }}>{d}</b>)}
        {Array.from({ length: 42 }, (_, i) => {
          const d = addDays(start, i), list = occs.filter((o) => o.date === d)
          return (
            <div key={d} onClick={() => set({ cursor: d, view: 'week' })} style={{ minHeight: 64, border: '1px solid var(--line)', borderRadius: 6, padding: 4, cursor: 'pointer', opacity: d.slice(0, 7) === first.slice(0, 7) ? 1 : 0.45, outline: d === T ? '2px solid var(--accent)' : undefined }}>
              <div style={{ fontWeight: 700 }}>{+d.slice(8)}</div>
              {list.slice(0, 3).map((o) => <div key={o.appt.id} style={{ background: svc(o.appt.serviceId)?.color, color: '#fff', borderRadius: 3, padding: '0 3px', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden' }}>{o.appt.start} {cli(o.appt.clientId)?.name.split(' ')[0]}</div>)}
              {list.length > 3 && <div className="muted">+{list.length - 3} more</div>}
            </div>
          )
        })}
      </div>
    )
  })()

  const upcoming = occs.filter((o) => o.date >= T).slice(0, 60)
  const listView = (
    <Table head={['When', 'Client', 'Service', 'Status', '']} rows={upcoming.map((o) => [
      `${longDate(o.date)} ${toHM(o.startMin)}–${toHM(o.endMin)}`, cli(o.appt.clientId)?.name ?? '?', svc(o.appt.serviceId)?.name ?? '?', o.appt.status,
      <Btn key="e" kind="ghost" onClick={() => edit(o)}>Edit</Btn>,
    ])} />
  )

  const series = form.id ? s.appts.find((a) => a.id === form.id) : undefined
  return (
    <Split wide="right">
      <div>
        <Seg value={tab} onChange={setTab} options={[['book', '📅 Booking'], ['setup', '⚙ Setup']]} />
        {tab === 'book' ? (
          <>
            <Panel title={form.id ? 'Edit appointment' : 'New appointment'} actions={form.id ? <Btn kind="ghost" onClick={() => { setForm(blank(s)); setOccDate('') }}>+ New</Btn> : undefined}>
              <Select label="Client" value={form.clientId} onChange={(clientId) => setForm({ ...form, clientId })} options={s.clients.map((c) => [c.id, c.name] as [string, string])} />
              <Row><Txt label="…or add client" value={newClient} onChange={setNewClient} placeholder="Full name" /><Btn onClick={addClient} disabled={!newClient.trim()}>Add</Btn></Row>
              <Select label="Service" value={form.serviceId} onChange={(serviceId) => setForm({ ...form, serviceId, minutes: svc(serviceId)?.minutes ?? form.minutes })} options={s.services.map((v) => [v.id, `${v.name} · ${v.minutes} min${v.price ? ' · ' + m(v.price) : ''}`] as [string, string])} />
              <Row>
                <Txt label="Date" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} />
                <Txt label="Start" type="time" value={form.start} onChange={(start) => setForm({ ...form, start })} />
                <Num label="Minutes" value={form.minutes} onChange={(minutes) => setForm({ ...form, minutes: Math.max(5, Math.round(minutes)) })} min={5} step={5} />
              </Row>
              <Row>
                <Select label="Repeat" value={form.repeat} onChange={(repeat: Repeat) => setForm({ ...form, repeat })} options={[['none', 'Does not repeat'], ['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['monthly', 'Monthly']] as const} />
                {form.repeat !== 'none' && <Num label="Sessions" value={form.count} onChange={(count) => setForm({ ...form, count: Math.max(1, Math.round(count)) })} min={1} max={520} />}
                <Select label="Status" value={form.status} onChange={(status: Status) => setForm({ ...form, status })} options={STATUS} />
              </Row>
              <Area label="Notes" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} rows={2} />
              {s.hours[dow(form.date)] === null && <Note tone="warn">{DAYS[dow(form.date)]} is a closed day.</Note>}
              <Row>
                <Btn kind="primary" onClick={save}>{form.id ? 'Save changes' : 'Book'}</Btn>
                {form.id && <Btn kind="danger" onClick={() => { set({ appts: s.appts.filter((a) => a.id !== form.id) }); setForm(blank(s)) }}>Delete{form.repeat !== 'none' ? ' series' : ''}</Btn>}
                {series && series.repeat !== 'none' && occDate && <Btn onClick={() => { set({ appts: s.appts.map((a) => (a.id === series.id ? { ...a, skip: [...a.skip, occDate] } : a)) }); setOccDate('') }}>Skip {longDate(occDate)}</Btn>}
              </Row>
              {form.id && (
                <Row>
                  <Btn onClick={() => ics(occurrences([form], '0000-01-01', '9999-12-31'), `${(cli(form.clientId)?.name ?? 'client').replace(/\W+/g, '-')}-${form.date}.ics`)}>⬇ .ics for client</Btn>
                  <CopyButton text={() => confirmText(form, occDate || form.date)} label="Copy confirmation" />
                  {cli(form.clientId)?.email && <a className="k-btn ghost" href={`mailto:${cli(form.clientId)!.email}?subject=${encodeURIComponent('Your appointment at ' + s.biz.name)}&body=${encodeURIComponent(confirmText(form, occDate || form.date))}`}>✉ Email</a>}
                </Row>
              )}
            </Panel>
            <Panel title={`Next free slots · ${form.minutes} min`}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {slots.map((x) => <Btn key={x.date + x.start} kind="ghost" onClick={() => setForm({ ...form, id: '', date: x.date, start: toHM(x.start), skip: [] })}>{longDate(x.date)} {toHM(x.start)}</Btn>)}
                {!slots.length && <span className="muted">No free slots in the next 3 weeks.</span>}
              </div>
              <p className="muted" style={{ fontSize: 13 }}>Respects working hours, a {s.buffer}-minute buffer and every recurring booking. Click a slot, then Book.</p>
            </Panel>
          </>
        ) : (
          <>
            <Panel title="Business">
              <Txt label="Name" value={s.biz.name} onChange={(name) => set({ biz: { ...s.biz, name } })} />
              <Row>
                <Txt label="Email (organizer)" value={s.biz.email} onChange={(email) => set({ biz: { ...s.biz, email } })} />
                <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', 'CHF ']} />
              </Row>
              <Txt label="Address" value={s.biz.address} onChange={(address) => set({ biz: { ...s.biz, address } })} />
              <Num label="Buffer between appointments" value={s.buffer} onChange={(buffer) => set({ buffer: Math.max(0, buffer) })} unit="min" min={0} />
            </Panel>
            <Panel title="Working hours">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const h = s.hours[d]
                const setH = (v: [number, number] | null) => set({ hours: s.hours.map((x, i) => (i === d ? v : x)) })
                return (
                  <Row key={d} wrap={false}>
                    <b style={{ width: 40 }}>{DAYS[d]}</b>
                    <label className="k-check"><input type="checkbox" checked={!!h} onChange={(e) => setH(e.target.checked ? [540, 1020] : null)} /> open</label>
                    {h && <><input className="k-text" type="time" value={toHM(h[0])} onChange={(e) => setH([toMin(e.target.value), h[1]])} style={{ width: 110 }} /> – <input className="k-text" type="time" value={toHM(h[1])} onChange={(e) => setH([h[0], toMin(e.target.value)])} style={{ width: 110 }} /></>}
                  </Row>
                )
              })}
            </Panel>
            <Panel title="Services" actions={<Btn onClick={() => set({ services: [...s.services, { id: uid(), name: 'New service', minutes: 30, price: 0, color: '#a855f7' }] })}>+ Service</Btn>}>
              <Table head={['Name', 'Min', 'Price', 'Colour', '']} rows={s.services.map((v) => {
                const up = (p: Partial<Service>) => set({ services: s.services.map((x) => (x.id === v.id ? { ...x, ...p } : x)) })
                return [
                  <input key="n" value={v.name} onChange={(e) => up({ name: e.target.value })} aria-label="Service name" />,
                  <input key="m" type="number" value={v.minutes} min={5} step={5} style={{ width: 60 }} onChange={(e) => up({ minutes: Math.max(5, +e.target.value || 5) })} aria-label="Minutes" />,
                  <input key="p" type="number" value={v.price} min={0} style={{ width: 70 }} onChange={(e) => up({ price: Math.max(0, +e.target.value || 0) })} aria-label="Price" />,
                  <input key="c" type="color" value={v.color} onChange={(e) => up({ color: e.target.value })} aria-label="Colour" />,
                  <Btn key="x" kind="ghost" onClick={() => set({ services: s.services.filter((x) => x.id !== v.id) })}>✕</Btn>,
                ]
              })} />
            </Panel>
            <Panel title="Clients">
              <Table head={['Name', 'Email', 'Phone', 'Visits']} rows={s.clients.map((c) => {
                const up = (p: Partial<Client>) => set({ clients: s.clients.map((x) => (x.id === c.id ? { ...x, ...p } : x)) })
                return [
                  <input key="n" value={c.name} onChange={(e) => up({ name: e.target.value })} aria-label="Name" />,
                  <input key="e" value={c.email} onChange={(e) => up({ email: e.target.value })} aria-label="Email" />,
                  <input key="p" value={c.phone} onChange={(e) => up({ phone: e.target.value })} aria-label="Phone" style={{ width: 130 }} />,
                  occurrences(s.appts.filter((a) => a.clientId === c.id), '0000-01-01', T).length,
                ]
              })} />
            </Panel>
          </>
        )}
      </div>

      <div>
        <Stats>
          <Stat label="This week" value={weekOccs.length} sub={`${(util.booked / 60).toFixed(1)} h booked`} />
          <Stat label="Utilisation" value={`${util.open ? Math.round((util.booked / util.open) * 100) : 0}%`} sub={`${(util.open / 60).toFixed(0)} h open`} tone="accent" />
          <Stat label="Expected revenue" value={m(revenue)} sub="this week" tone="good" />
          <Stat label="Conflicts" value={clash.length} tone={clash.length ? 'bad' : 'good'} sub={allPast.length ? `no-show rate ${Math.round((noShow / allPast.length) * 100)}%` : ''} />
        </Stats>
        <Panel
          title={s.view === 'month' ? new Date(s.cursor + 'T12:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : s.view === 'week' ? `Week of ${longDate(ws)}` : 'Upcoming'}
          actions={<>
            <Btn kind="ghost" onClick={() => set({ cursor: addDays(s.cursor, s.view === 'month' ? -28 : -7) })}>‹</Btn>
            <Btn kind="ghost" onClick={() => set({ cursor: T })}>Today</Btn>
            <Btn kind="ghost" onClick={() => set({ cursor: addDays(s.cursor, s.view === 'month' ? 35 : 7) })}>›</Btn>
            <Seg value={s.view} onChange={(view) => set({ view })} options={[['week', 'Week'], ['month', 'Month'], ['list', 'List']]} />
          </>}
        >
          {clash.length > 0 && <Note tone="err">{clash.map(([a, b]) => `${longDate(a.date)}: ${cli(a.appt.clientId)?.name} ${toHM(a.startMin)} overlaps ${cli(b.appt.clientId)?.name} ${toHM(b.startMin)}${s.buffer ? ` (incl. ${s.buffer} min buffer)` : ''}`).join(' · ')}</Note>}
          {s.view === 'week' ? week : s.view === 'month' ? month : listView}
          {s.view === 'week' && <p className="muted" style={{ fontSize: 13 }}>Click an empty spot to start a booking at that time; click a booking to edit it. ↻ = recurring, ? = not yet confirmed, red border = overlap.</p>}
        </Panel>
        <Panel title="Export & backup" actions={<Btn kind="ghost" onClick={reset}>Reset demo</Btn>}>
          <Row>
            <Btn kind="primary" onClick={() => ics(occurrences(s.appts, T, addDays(T, 365)), 'appointments.ics')}>⬇ Calendar (.ics, next 12 months)</Btn>
            <CsvButton name="appointments.csv" rows={() => [['Date', 'Start', 'End', 'Client', 'Email', 'Phone', 'Service', 'Price', 'Status', 'Notes'], ...occurrences(s.appts, addDays(T, -365), addDays(T, 365), true).map((o) => { const c = cli(o.appt.clientId), v = svc(o.appt.serviceId); return [o.date, toHM(o.startMin), toHM(o.endMin), c?.name ?? '', c?.email ?? '', c?.phone ?? '', v?.name ?? '', v?.price ?? 0, o.appt.status, o.appt.notes] })]} />
            <JsonButtons name="appointment-book.json" data={s} onLoad={(d) => set(d)} />
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Data stays in this browser (localStorage). Use Backup regularly; .ics files import into Google Calendar, Apple Calendar and Outlook with a 2-hour reminder.</p>
        </Panel>
      </div>
    </Split>
  )
}
