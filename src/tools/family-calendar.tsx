import { useMemo, useState } from 'react'
import { Btn, Check, FileDrop, JsonButtons, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, color, download, today, uid, useToolState } from '../kit'
import { addDays, dow, occurrences, parseIcs, toIcs, type Ev, type Freq } from './lib/family-calendar'

interface Member { id: string; name: string; color: string }
interface State { members: Member[]; events: Ev[]; hidden: string[]; view: 'month' | 'week' | 'agenda' }

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ym = (d: string) => d.slice(0, 7)
const mon = (d: string) => addDays(d, -((dow(d) + 6) % 7)) // Monday of the week

function sample(): State {
  const t = today()
  const m = mon(t)
  const ev = (p: Partial<Ev> & Pick<Ev, 'title' | 'date' | 'member'>): Ev => ({ id: uid(), start: '', end: '', freq: 'NONE', interval: 1, byday: [], until: '', count: 0, exdates: [], ...p })
  return {
    view: 'month',
    hidden: [],
    members: [
      { id: 'mom', name: 'Mom', color: color(8) },
      { id: 'dad', name: 'Dad', color: color(1) },
      { id: 'emma', name: 'Emma', color: color(5) },
      { id: 'leo', name: 'Leo', color: color(2) },
      { id: 'all', name: 'Family', color: color(3) },
    ],
    events: [
      ev({ title: 'School', date: m, start: '08:00', end: '15:00', member: 'emma', freq: 'WEEKLY', byday: [1, 2, 3, 4, 5] }),
      ev({ title: 'Soccer practice', date: addDays(m, 1), start: '17:30', end: '19:00', member: 'leo', freq: 'WEEKLY', byday: [2, 4] }),
      ev({ title: 'Yoga', date: addDays(m, 2), start: '19:00', end: '20:00', member: 'mom', freq: 'WEEKLY' }),
      ev({ title: 'Trash & recycling out', date: addDays(m, 3), start: '20:00', end: '20:15', member: 'dad', freq: 'WEEKLY' }),
      ev({ title: 'Sunday dinner at grandma', date: addDays(m, 6), start: '17:00', end: '20:00', member: 'all', freq: 'WEEKLY', interval: 2 }),
      ev({ title: 'Piano lesson', date: addDays(m, 4), start: '16:00', end: '16:45', member: 'emma', freq: 'WEEKLY' }),
      ev({ title: 'Dentist — Leo', date: addDays(t, 5), start: '10:30', end: '11:15', member: 'leo' }),
      ev({ title: 'Work trip to Berlin', date: addDays(t, 9), member: 'dad', freq: 'DAILY', count: 3 }),
      ev({ title: "Emma's birthday 🎂", date: addDays(t, 12), member: 'emma', freq: 'YEARLY' }),
      ev({ title: 'Rent due', date: `${ym(t)}-01`, member: 'mom', freq: 'MONTHLY' }),
    ],
  }
}
const DEF = sample()

const blank = (date: string, member: string): Ev => ({ id: '', title: '', date, start: '09:00', end: '10:00', member, freq: 'NONE', interval: 1, byday: [], until: '', count: 0, exdates: [] })

export default function FamilyCalendar() {
  const [s, set] = useToolState('family-calendar', DEF)
  const [cursor, setCursor] = useState(today())
  const [sel, setSel] = useState(today())
  const [form, setForm] = useState<Ev>(() => blank(today(), s.members[0]?.id ?? ''))
  const [msg, setMsg] = useState('')

  const member = (id: string) => s.members.find((m) => m.id === id)
  const visible = s.events.filter((e) => !s.hidden.includes(e.member))

  // Range shown by the current view.
  const first = s.view === 'month' ? mon(`${ym(cursor)}-01`) : s.view === 'week' ? mon(cursor) : cursor
  const days = s.view === 'month' ? 42 : s.view === 'week' ? 7 : 30
  const last = addDays(first, days - 1)
  const byDay = useMemo(() => {
    const map = new Map<string, Ev[]>()
    for (const e of visible) for (const d of occurrences(e, first, last)) map.set(d, [...(map.get(d) ?? []), e])
    for (const [, list] of map) list.sort((a, b) => (a.start || '00:00').localeCompare(b.start || '00:00'))
    return map
  }, [visible, first, last])

  const shift = (n: number) => {
    if (s.view === 'month') {
      const d = new Date(`${ym(cursor)}-01T00:00:00Z`)
      d.setUTCMonth(d.getUTCMonth() + n)
      setCursor(d.toISOString().slice(0, 10))
    } else setCursor(addDays(cursor, n * days))
  }
  const save = () => {
    if (!form.title.trim()) return
    if (form.id) set({ events: s.events.map((e) => (e.id === form.id ? form : e)) })
    else set({ events: [...s.events, { ...form, id: uid() }] })
    setForm(blank(form.date, form.member))
  }
  const edit = (e: Ev, d: string) => { setForm(e); setSel(d) }
  const importIcs = async (f: File) => {
    const parsed = parseIcs(await f.text())
    const members = [...s.members]
    const evs = parsed.map((p) => {
      let m = members.find((x) => x.name.toLowerCase() === p.category.toLowerCase())
      if (!m && p.category) { m = { id: uid(), name: p.category, color: color(members.length) }; members.push(m) }
      const { category, uid: _u, ...rest } = p
      void category; void _u
      return { ...rest, id: uid(), member: m?.id ?? members[0]?.id ?? '' }
    })
    set({ members, events: [...s.events, ...evs] })
    setMsg(`Imported ${evs.length} event(s) from ${f.name}.`)
  }
  const chip = (e: Ev, d: string, compact: boolean) => (
    <button
      key={e.id + d}
      onClick={(ev) => { ev.stopPropagation(); edit(e, d) }}
      title={`${e.start ? `${e.start}–${e.end} ` : ''}${e.title} (${member(e.member)?.name ?? ''})`}
      style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderRadius: 4, padding: compact ? '1px 4px' : '4px 6px', marginTop: 2, fontSize: compact ? 11 : 13, background: member(e.member)?.color ?? 'var(--accent)', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer' }}
    >
      {e.start && <b>{e.start} </b>}{e.freq !== 'NONE' && !compact ? '↻ ' : ''}{e.title}
    </button>
  )
  const title = s.view === 'month' ? new Date(`${ym(cursor)}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : `${first} → ${last}`
  const thisWeek = Array.from({ length: 7 }, (_, i) => addDays(mon(today()), i)).reduce((n, d) => n + (byDayAll(visible, d)), 0)

  return (
    <Split wide="right">
      <div>
        <Panel title={form.id ? 'Edit event' : 'New event'}>
          <Txt label="Title" value={form.title} onChange={(title) => setForm({ ...form, title })} placeholder="e.g. Swimming lesson" />
          <Row>
            <Txt label="Date" type="date" value={form.date} onChange={(date) => date && setForm({ ...form, date })} />
            <Select label="Who" value={form.member} onChange={(member) => setForm({ ...form, member })} options={s.members.map((m) => [m.id, m.name] as [string, string])} />
          </Row>
          <Check label="All day" value={!form.start} onChange={(v) => setForm({ ...form, start: v ? '' : '09:00', end: v ? '' : '10:00' })} />
          {form.start && (
            <Row>
              <Txt label="Start" type="time" value={form.start} onChange={(start) => setForm({ ...form, start })} />
              <Txt label="End" type="time" value={form.end} onChange={(end) => setForm({ ...form, end })} />
            </Row>
          )}
          <Row>
            <Select<Freq> label="Repeats" value={form.freq} onChange={(freq) => setForm({ ...form, freq, byday: freq === 'WEEKLY' && !form.byday.length ? [dow(form.date)] : form.byday })} options={[['NONE', 'Does not repeat'], ['DAILY', 'Daily'], ['WEEKLY', 'Weekly'], ['MONTHLY', 'Monthly'], ['YEARLY', 'Yearly']]} />
            {form.freq !== 'NONE' && <Num label="Every" value={form.interval} onChange={(interval) => setForm({ ...form, interval: Math.max(1, Math.round(interval)) })} min={1} unit={form.freq.toLowerCase().replace('ly', '').replace('dai', 'day') + '(s)'} />}
          </Row>
          {form.freq === 'WEEKLY' && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
              {WD.map((w, i) => (
                <button key={w} className={`k-btn ${form.byday.includes(i) ? 'primary' : ''}`} style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setForm({ ...form, byday: form.byday.includes(i) ? form.byday.filter((x) => x !== i) : [...form.byday, i] })}>{w}</button>
              ))}
            </div>
          )}
          {form.freq !== 'NONE' && (
            <Row>
              <Txt label="Until (optional)" type="date" value={form.until} onChange={(until) => setForm({ ...form, until })} />
              <Num label="Or # times" value={form.count} onChange={(count) => setForm({ ...form, count: Math.max(0, Math.round(count)) })} min={0} hint="0 = forever" />
            </Row>
          )}
          <Txt label="Notes" value={form.notes ?? ''} onChange={(notes) => setForm({ ...form, notes })} />
          <Row>
            <Btn kind="primary" onClick={save} disabled={!form.title.trim()}>{form.id ? 'Save changes' : '+ Add event'}</Btn>
            {form.id && (
              <>
                {form.freq !== 'NONE' && <Btn onClick={() => { set({ events: s.events.map((e) => (e.id === form.id ? { ...e, exdates: [...e.exdates, sel] } : e)) }); setForm(blank(sel, form.member)) }}>Delete {sel} only</Btn>}
                <Btn kind="danger" onClick={() => { set({ events: s.events.filter((e) => e.id !== form.id) }); setForm(blank(sel, form.member)) }}>Delete{form.freq !== 'NONE' ? ' all' : ''}</Btn>
                <Btn kind="ghost" onClick={() => setForm(blank(sel, form.member))}>Cancel</Btn>
              </>
            )}
          </Row>
        </Panel>
        <Panel title="Family members">
          {s.members.map((m) => (
            <div key={m.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <input type="color" value={m.color} onChange={(e) => set({ members: s.members.map((x) => (x.id === m.id ? { ...x, color: e.target.value } : x)) })} aria-label="Colour" style={{ width: 32, height: 28, border: 'none', background: 'none' }} />
              <input value={m.name} onChange={(e) => set({ members: s.members.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)) })} aria-label="Name" style={{ flex: 1, minWidth: 0 }} />
              <Check label="show" value={!s.hidden.includes(m.id)} onChange={(v) => set({ hidden: v ? s.hidden.filter((h) => h !== m.id) : [...s.hidden, m.id] })} />
              <Btn kind="ghost" title="Remove member and their events" onClick={() => set({ members: s.members.filter((x) => x.id !== m.id), events: s.events.filter((e) => e.member !== m.id) })}>✕</Btn>
            </div>
          ))}
          <Btn onClick={() => set({ members: [...s.members, { id: uid(), name: `Member ${s.members.length + 1}`, color: color(s.members.length) }] })}>+ Member</Btn>
        </Panel>
        <Panel title="Import / export">
          <FileDrop accept=".ics,text/calendar" onFiles={([f]) => void importIcs(f)} label="Import an .ics file (Google, Apple, Outlook)" />
          {msg && <Note tone="ok">{msg}</Note>}
          <Row>
            <Btn onClick={() => download('family-calendar.ics', toIcs(visible, (id) => member(id)?.name ?? ''), 'text/calendar')}>⬇ Export .ics</Btn>
            <JsonButtons name="family-calendar.json" data={s} onLoad={(d) => d && Array.isArray(d.events) && set(d)} />
            <Btn kind="ghost" onClick={() => set(sample())}>Sample data</Btn>
          </Row>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Events" value={s.events.length} sub={`${s.events.filter((e) => e.freq !== 'NONE').length} recurring`} />
          <Stat label="This week" value={thisWeek} sub="occurrences" tone="accent" />
          <Stat label="Today" value={byDayAll(visible, today())} sub={today()} />
          <Stat label="Members" value={s.members.length} />
        </Stats>
        <Panel
          title={title}
          actions={
            <>
              <Btn kind="ghost" onClick={() => shift(-1)}>‹</Btn>
              <Btn kind="ghost" onClick={() => { setCursor(today()); setSel(today()) }}>Today</Btn>
              <Btn kind="ghost" onClick={() => shift(1)}>›</Btn>
              <Seg value={s.view} onChange={(view) => set({ view })} options={[['month', 'Month'], ['week', 'Week'], ['agenda', 'Agenda']]} />
            </>
          }
        >
          {s.view === 'month' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 2 }}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => <div key={w} className="muted" style={{ fontSize: 12, fontWeight: 700, textAlign: 'center' }}>{w}</div>)}
              {Array.from({ length: 42 }, (_, i) => {
                const d = addDays(first, i)
                const list = byDay.get(d) ?? []
                const out = ym(d) !== ym(cursor)
                return (
                  <div key={d} onClick={() => { setSel(d); if (!form.id) setForm({ ...form, date: d }) }} style={{ minHeight: 86, padding: 3, borderRadius: 6, border: `1px solid ${d === sel ? 'var(--accent)' : 'var(--line)'}`, background: d === today() ? 'color-mix(in srgb, var(--accent) 10%, var(--panel))' : 'var(--panel)', opacity: out ? 0.5 : 1, cursor: 'pointer', overflow: 'hidden' }}>
                    <div style={{ fontSize: 12, fontWeight: d === today() ? 800 : 600, color: d === today() ? 'var(--accent)' : undefined }}>{+d.slice(8)}</div>
                    {list.slice(0, 3).map((e) => chip(e, d, true))}
                    {list.length > 3 && <div className="muted" style={{ fontSize: 11 }}>+{list.length - 3} more</div>}
                  </div>
                )
              })}
            </div>
          )}
          {s.view !== 'month' && (
            <div>
              {Array.from({ length: days }, (_, i) => addDays(first, i)).filter((d) => s.view === 'week' || (byDay.get(d) ?? []).length).map((d) => (
                <div key={d} onClick={() => setSel(d)} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <div style={{ width: 70, flex: 'none', color: d === today() ? 'var(--accent)' : undefined }}>
                    <b>{WD[dow(d)]}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{d.slice(5)}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {(byDay.get(d) ?? []).map((e) => chip(e, d, false))}
                    {!(byDay.get(d) ?? []).length && <span className="muted" style={{ fontSize: 13 }}>Free</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title={`Selected day · ${WD[dow(sel)]} ${sel}`} actions={<Btn onClick={() => setForm(blank(sel, form.member || s.members[0]?.id || ''))}>+ Event on this day</Btn>}>
          {byDayAll(visible, sel) ? occurrencesOn(visible, sel).map((e) => (
            <div key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
              <i style={{ width: 10, height: 10, borderRadius: 5, background: member(e.member)?.color, flex: 'none' }} />
              <b style={{ width: 96, flex: 'none' }}>{e.start ? `${e.start}–${e.end}` : 'All day'}</b>
              <span style={{ flex: 1 }}>{e.title} <span className="muted">· {member(e.member)?.name}{e.freq !== 'NONE' ? ' · repeats' : ''}</span></span>
              <Btn kind="ghost" onClick={() => edit(e, sel)}>Edit</Btn>
            </div>
          )) : <span className="muted">Nothing planned.</span>}
        </Panel>
      </div>
    </Split>
  )
}

function occurrencesOn(evs: Ev[], d: string) {
  return evs.filter((e) => occurrences(e, d, d).length).sort((a, b) => (a.start || '').localeCompare(b.start || ''))
}
function byDayAll(evs: Ev[], d: string) {
  return occurrencesOn(evs, d).length
}
