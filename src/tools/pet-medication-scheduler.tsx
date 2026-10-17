import { useEffect, useRef, useState } from 'react'
import { Btn, CsvButton, JsonButtons, Note, Num, Panel, pct, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { localKey } from './lib/habit-tracker'
import { addDays, adherence, describe, type Dose, doses, type Med, nextDate, type Repeat } from './lib/pet-medication-scheduler'

interface State { meds: Med[]; given: Record<string, string>; lead: number; notify: boolean }

const nowHM = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

function sample(): State {
  const t = localKey()
  const M = (pet: string, name: string, dose: string, repeat: Repeat, every: number, times: string[], startBack: number, notes = '', days: number[] = []): Med =>
    ({ id: uid(), pet, name, dose, repeat, every, days, times, start: addDays(t, -startBack), end: '', notes })
  const meds = [
    M('Luna 🐕', 'Allergy tablet', '1 tablet with food', 'daily', 1, ['08:00'], 40),
    M('Luna 🐕', 'Flea & tick chewable', '1 chew (22–44 lb size)', 'monthly', 1, ['09:00'], 52, 'Give with a meal'),
    M('Luna 🐕', 'Heartworm preventive', '1 chew', 'monthly', 1, ['09:00'], 45),
    M('Milo 🐈', 'Thyroid tablet', '½ tablet (2.5 mg)', 'daily', 1, ['07:30', '19:30'], 20, 'Pill pocket works best'),
    M('Milo 🐈', 'Spot-on flea treatment', '1 pipette, back of neck', 'monthly', 1, ['18:00'], 70),
    M('Milo 🐈', 'Dewormer', '1 tablet', 'monthly', 3, ['18:00'], 80),
  ]
  const given: Record<string, string> = {}
  const nowKey = `${t}T${nowHM()}`
  let r = 5
  for (const d of doses(meds, addDays(t, -30), t)) {
    if (`${d.date}T${d.time}` > nowKey) continue
    r = (r * 9301 + 49297) % 233280
    if (r % 13 !== 0 || d.date === t) given[d.key] = `${d.date}T${d.time}`
  }
  return { meds, given, lead: 0, notify: false }
}
const DEF = sample()
const REPEATS: [Repeat, string][] = [['daily', 'Every day'], ['everyNDays', 'Every N days'], ['weekly', 'Weekly on days'], ['monthly', 'Every N months'], ['once', 'One time']]
const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const canNotify = typeof window !== 'undefined' && 'Notification' in window

export default function PetMedicationScheduler() {
  const [s, set, reset] = useToolState('pet-medication-scheduler', DEF)
  const [now, setNow] = useState(() => new Date())
  const [pet, setPet] = useState('all')
  const [editing, setEditing] = useState<string | null>(null)
  const [perm, setPerm] = useState(canNotify ? Notification.permission : 'unsupported')
  const [toast, setToast] = useState<string | null>(null)
  const notified = useRef(new Set<string>())

  const today = localKey(now)
  const nowKey = `${today}T${nowHM(now)}`
  const meds = s.meds.filter((m) => pet === 'all' || m.pet === pet)
  const pets = [...new Set(s.meds.map((m) => m.pet))]
  const upcoming = doses(meds, addDays(today, -1), addDays(today, 7))
  const overdue = upcoming.filter((d) => `${d.date}T${d.time}` < nowKey && !s.given[d.key])
  const todays = upcoming.filter((d) => d.date === today)
  const nextDose = upcoming.find((d) => `${d.date}T${d.time}` >= nowKey && !s.given[d.key])
  const adh = adherence(meds, s.given, addDays(today, -30), nowKey)

  // Reminder loop: runs only while this page is open.
  useEffect(() => {
    const tick = () => {
      const n = new Date()
      setNow(n)
      const key = `${localKey(n)}T${nowHM(n)}`
      const lead = new Date(n.getTime() + s.lead * 60000)
      const leadKey = `${localKey(lead)}T${nowHM(lead)}`
      for (const d of doses(s.meds, addDays(localKey(n), -1), localKey(lead))) {
        const at = `${d.date}T${d.time}`
        const fresh = at <= leadKey && at >= `${localKey(new Date(n.getTime() - 3600000))}T${nowHM(new Date(n.getTime() - 3600000))}`
        if (!fresh || s.given[d.key] || notified.current.has(d.key)) continue
        notified.current.add(d.key)
        const msg = `${d.med.pet}: ${d.med.name} — ${d.med.dose} (${at <= key ? 'due now' : `at ${d.time}`})`
        setToast(msg)
        if (s.notify && canNotify && Notification.permission === 'granted') {
          try { new Notification('💊 Pet medication', { body: msg, tag: d.key }) } catch { /* some mobile browsers need a service worker */ }
        }
      }
    }
    tick()
    const t = setInterval(tick, 20000)
    return () => clearInterval(t)
  }, [s.meds, s.given, s.lead, s.notify])

  const toggle = (d: Dose) => {
    const given = { ...s.given }
    if (given[d.key]) delete given[d.key]
    else given[d.key] = `${localKey()}T${nowHM()}`
    set({ given })
  }
  const editM = (id: string, p: Partial<Med>) => set({ meds: s.meds.map((m) => (m.id === id ? { ...m, ...p } : m)) })
  const history = Object.entries(s.given).map(([k, at]) => {
    const [id, when] = k.split('@')
    const m = s.meds.find((x) => x.id === id)
    return { k, when, at, m }
  }).filter((h) => h.m && (pet === 'all' || h.m.pet === pet)).sort((a, b) => b.when.localeCompare(a.when))

  const byDate = new Map<string, Dose[]>()
  for (const d of upcoming.filter((d) => d.date >= today || !s.given[d.key])) byDate.set(d.date, [...(byDate.get(d.date) ?? []), d])

  return (
    <Split wide="right">
      <div>
        <Stats>
          <Stat label="Today" value={`${todays.filter((d) => s.given[d.key]).length} / ${todays.length}`} sub="doses given" tone="accent" />
          <Stat label="Overdue" value={overdue.length} tone={overdue.length ? 'bad' : 'good'} sub={overdue.length ? 'tick when given' : 'all caught up'} />
          <Stat label="30-day adherence" value={pct(adh.done / (adh.due || 1), 0)} sub={`${adh.missed} missed of ${adh.due}`} tone={adh.due && adh.done / adh.due >= 0.9 ? 'good' : undefined} />
        </Stats>
        {toast && <Note tone="warn">🔔 {toast} <Btn kind="ghost" onClick={() => setToast(null)}>Dismiss</Btn></Note>}
        <Panel title="Reminders">
          {!canNotify ? <Note tone="warn">This browser has no Notifications API. Reminders appear as a banner on this page instead.</Note> : (
            <Row>
              <Btn kind={perm === 'granted' && s.notify ? 'primary' : 'normal'} onClick={async () => {
                if (perm !== 'granted') { const p = await Notification.requestPermission(); setPerm(p); if (p === 'granted') set({ notify: true }) } else set({ notify: !s.notify })
              }}>{perm === 'granted' ? (s.notify ? '🔔 Notifications on' : '🔕 Notifications off') : '🔔 Enable notifications'}</Btn>
              {perm === 'denied' && <span className="muted" style={{ fontSize: 12.5 }}>Blocked in browser settings — banner reminders still work.</span>}
              {perm === 'granted' && <Btn kind="ghost" onClick={() => new Notification('💊 Test reminder', { body: 'Notifications work.' })}>Test</Btn>}
            </Row>
          )}
          <Num label="Remind me early by" value={s.lead} min={0} max={240} step={5} unit="min" onChange={(lead) => set({ lead: Math.max(0, lead) })} />
          <Note>Honest limits: reminders only fire <b>while this tab is open</b> (it can be in the background). There is no server, so closed tabs, a sleeping computer or a killed mobile browser mean no alert. For critical medication, also set an alarm on your phone.</Note>
        </Panel>
        <Panel title="Next 7 days" actions={<Select label="" value={pet} onChange={setPet} options={[['all', 'All pets'], ...pets.map((p) => [p, p] as [string, string])]} />}>
          {nextDose && <p style={{ marginTop: 0 }}>Next: <b>{nextDose.med.pet} · {nextDose.med.name}</b> {nextDose.date === today ? 'today' : nextDose.date} at {nextDose.time}</p>}
          {[...byDate.entries()].map(([date, ds]) => (
            <div key={date} style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: date === today ? 'var(--accent)' : 'var(--muted)', borderBottom: '1px solid var(--line)' }}>{date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : date < today ? 'Yesterday (missed)' : new Date(date + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
              {ds.map((d) => {
                const late = `${d.date}T${d.time}` < nowKey && !s.given[d.key]
                return (
                  <label key={d.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!s.given[d.key]} onChange={() => toggle(d)} style={{ width: 18, height: 18 }} />
                    <b style={{ width: 46, color: late ? 'var(--err)' : undefined }}>{d.time}</b>
                    <span style={{ flex: 1, textDecoration: s.given[d.key] ? 'line-through' : undefined }}>{d.med.pet} · <b>{d.med.name}</b> <span className="muted">{d.med.dose}</span></span>
                    {s.given[d.key] ? <span className="muted" style={{ fontSize: 12 }}>✓ {s.given[d.key].slice(11)}</span> : late ? <span style={{ color: 'var(--err)', fontSize: 12, fontWeight: 700 }}>late</span> : null}
                  </label>
                )
              })}
            </div>
          ))}
        </Panel>
      </div>

      <div>
        <Panel title="Medications & treatments" actions={<Btn kind="primary" onClick={() => { const m: Med = { id: uid(), pet: pets[0] ?? 'My pet', name: 'New medication', dose: '1 tablet', repeat: 'daily', every: 1, days: [1], times: ['08:00'], start: today, end: '', notes: '' }; set({ meds: [...s.meds, m] }); setEditing(m.id) }}>+ Add</Btn>}>
          {meds.map((m) => (
            <div key={m.id} style={{ background: 'var(--panel2)', borderRadius: 10, padding: '8px 10px', marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <b>{m.name}</b> <span className="muted">· {m.pet}</span>
                  <div className="muted" style={{ fontSize: 12.5 }}>{m.dose} · {describe(m)}{m.end ? ` · until ${m.end}` : ''} · next {nextDate(m, today) ?? '—'}{m.notes ? ` · ${m.notes}` : ''}</div>
                </div>
                <Btn kind="ghost" onClick={() => setEditing(editing === m.id ? null : m.id)}>{editing === m.id ? 'Done' : 'Edit'}</Btn>
              </div>
              {editing === m.id && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 8 }}>
                  <Txt label="Pet" value={m.pet} onChange={(v) => editM(m.id, { pet: v })} />
                  <Txt label="Medication" value={m.name} onChange={(v) => editM(m.id, { name: v })} />
                  <Txt label="Dose" value={m.dose} onChange={(v) => editM(m.id, { dose: v })} />
                  <Select label="Repeat" value={m.repeat} onChange={(repeat) => editM(m.id, { repeat })} options={REPEATS} />
                  {(m.repeat === 'everyNDays' || m.repeat === 'monthly') && <Num label={m.repeat === 'monthly' ? 'Every N months' : 'Every N days'} value={m.every} min={1} max={365} step={1} onChange={(every) => editM(m.id, { every: Math.max(1, Math.round(every)) })} />}
                  <Txt label="Times (comma-separated)" value={m.times.join(', ')} onChange={(v) => editM(m.id, { times: v.split(/[,\s]+/).filter(Boolean) })} placeholder="08:00, 20:00" />
                  <Txt label="Start" type="date" value={m.start} onChange={(start) => start && editM(m.id, { start })} />
                  <Txt label="End (optional)" type="date" value={m.end} onChange={(end) => editM(m.id, { end })} />
                  <Txt label="Notes" value={m.notes} onChange={(notes) => editM(m.id, { notes })} />
                  {m.repeat === 'weekly' && (
                    <div style={{ display: 'flex', gap: 3, alignItems: 'end' }}>
                      {WD.map((w, i) => <button key={w} type="button" className={`k-btn ${m.days.includes(i) ? 'primary' : ''}`} style={{ padding: '4px 7px' }} onClick={() => { const days = m.days.includes(i) ? m.days.filter((x) => x !== i) : [...m.days, i].sort(); if (days.length) editM(m.id, { days }) }}>{w}</button>)}
                    </div>
                  )}
                  <div style={{ alignSelf: 'end' }}><Btn kind="danger" onClick={() => confirm(`Delete ${m.name}?`) && set({ meds: s.meds.filter((x) => x.id !== m.id) })}>Delete</Btn></div>
                  {m.times.some((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) && <Note tone="err">Use 24-hour HH:MM times, e.g. 08:00, 19:30.</Note>}
                </div>
              )}
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Monthly treatments repeat on the start date’s day (the 31st falls on the last day of short months). Always follow your veterinarian’s instructions and the product label.</p>
        </Panel>
        <Panel title="History" actions={<>
          <CsvButton name="pet-medication-log.csv" rows={() => [['Scheduled', 'Given at', 'Pet', 'Medication', 'Dose'], ...history.map((h) => [h.when.replace('T', ' '), h.at.replace('T', ' '), h.m!.pet, h.m!.name, h.m!.dose])]} />
          <JsonButtons name="pet-medications.json" data={s} onLoad={(d) => d && Array.isArray(d.meds) && set(d)} />
          <Btn kind="ghost" onClick={() => confirm('Replace everything with the sample data?') && reset()}>Sample</Btn>
        </>}>
          <Table max={15} head={['Scheduled', 'Given', 'Pet', 'Medication']} rows={history.map((h) => [h.when.replace('T', ' '), h.at.slice(0, 10) === h.when.slice(0, 10) ? h.at.slice(11) : h.at.replace('T', ' '), h.m!.pet, h.m!.name])} />
          {!history.length && <Note>Ticked doses appear here.</Note>}
        </Panel>
      </div>
    </Split>
  )
}
