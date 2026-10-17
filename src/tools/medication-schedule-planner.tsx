import { useEffect, useRef, useState } from 'react'
import { Btn, Check, CsvButton, JsonButtons, Note, Panel, pct, Row, Select, Split, Stat, Stats, Txt, uid, useToolState, color } from '../kit'
import { addDays, adherence, dosesOn, minutesUntil, nextDose, slots, validTime, weekday, type Freq, type Med } from './lib/medication-schedule-planner'

const localISO = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const nowHM = () => new Date().toTimeString().slice(0, 5)
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const FOOD: Record<Med['food'], string> = { any: '', with: 'with food', before: 'before food', after: 'after food' }

const T0 = localISO()
const mk = (name: string, dose: string, purpose: string, times: string[], extra: Partial<Med> = {}, i = 0): Med => ({
  id: uid(), name, dose, purpose, times, freq: 'daily', weekdays: [1], every: 2, start: T0, end: '', food: 'any', color: color(i), notes: '', ...extra,
})

const DEF = {
  patient: 'Mom (Helen)',
  meds: [
    mk('Lisinopril', '10 mg tablet', 'Blood pressure', ['08:00'], {}, 0),
    mk('Metformin', '500 mg tablet', 'Diabetes', ['08:00', '20:00'], { food: 'with' }, 1),
    mk('Atorvastatin', '20 mg tablet', 'Cholesterol', ['21:00'], {}, 2),
    mk('Alendronate', '70 mg tablet', 'Bone density', ['07:00'], { freq: 'weekdays', weekdays: [1], food: 'before', notes: 'Full glass of water, stay upright 30 min' }, 3),
    mk('Vitamin D3', '1000 IU', 'Supplement', ['12:00'], { food: 'with' }, 5),
    mk('Paracetamol', '500 mg', 'Pain (as needed)', ['—'], { freq: 'prn', notes: 'Max 4 g per day' }, 4),
  ],
  taken: {} as Record<string, string>,
  remind: false,
  lead: 0,
  weekStart: T0,
}

const PRESETS: [string, string[]][] = [
  ['Once daily', ['08:00']],
  ['Twice (BID)', ['08:00', '20:00']],
  ['3× (TID)', ['08:00', '14:00', '20:00']],
  ['4× (QID)', ['08:00', '12:00', '16:00', '20:00']],
  ['Every 8 h', ['06:00', '14:00', '22:00']],
  ['Bedtime', ['22:00']],
]

const describeFreq = (m: Med) =>
  m.freq === 'daily' ? 'every day' : m.freq === 'prn' ? 'as needed' : m.freq === 'interval' ? `every ${m.every} days` : m.weekdays.map((d) => DAYS[d]).join(', ') || 'no days picked'

export default function MedicationSchedulePlanner() {
  const [s, set, reset] = useToolState('medication-schedule-planner', DEF)
  const [sel, setSel] = useState(s.meds[0]?.id ?? '')
  const [newTime, setNewTime] = useState('12:00')
  const [banner, setBanner] = useState('')
  const [, tick] = useState(0)
  const fired = useRef(new Set<string>())
  const today = localISO()
  const hm = nowHM()
  const med = s.meds.find((m) => m.id === sel)
  const todays = dosesOn(s.meds, today)
  const nd = nextDose(s.meds, today, hm)
  const week = Array.from({ length: 7 }, (_, i) => addDays(s.weekStart, i))
  const adh = adherence(s.meds, s.taken, addDays(today, -6), today)
  const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission

  const edit = (p: Partial<Med>) => med && set({ meds: s.meds.map((m) => (m.id === med.id ? { ...m, ...p } : m)) })
  const toggle = (key: string) => set((st) => {
    const taken = { ...st.taken }
    if (taken[key]) delete taken[key]
    else taken[key] = nowHM()
    return { ...st, taken }
  })

  // Reminder loop: runs while the page is open.
  useEffect(() => {
    const id = setInterval(() => {
      tick((n) => n + 1)
      if (!s.remind) return
      const now = new Date()
      const d = localISO(now), t = now.toTimeString().slice(0, 5)
      for (const x of dosesOn(s.meds, d)) {
        const mins = minutesUntil(t, x.time)
        if (mins <= s.lead && mins > s.lead - 2 && !s.taken[x.key] && !fired.current.has(x.key)) {
          fired.current.add(x.key)
          const msg = `${x.time} · ${x.med.name} ${x.med.dose}${FOOD[x.med.food] ? ` (${FOOD[x.med.food]})` : ''}`
          setBanner(`⏰ Time for: ${msg}`)
          if (perm === 'granted') new Notification('Medication reminder', { body: msg, tag: x.key })
        }
      }
    }, 20000)
    return () => clearInterval(id)
  }, [s.remind, s.lead, s.meds, s.taken, perm])

  const enableReminders = async (on: boolean) => {
    if (on && typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission()
    set({ remind: on })
  }

  return (
    <div>
      <style>{`@media print { body * { visibility: hidden !important } .med-print, .med-print * { visibility: visible !important } .med-print { position: absolute; left: 0; top: 0; width: 100% } .med-noprint { display: none !important } }`}</style>
      <Stats>
        <Stat label="Medications" value={s.meds.length} sub={`${s.meds.filter((m) => m.freq === 'prn').length} as needed`} />
        <Stat label="Doses today" value={todays.length} sub={`${todays.filter((d) => s.taken[d.key]).length} taken`} />
        <Stat label="Next dose" value={nd ? nd.dose.time : '—'} sub={nd ? `${nd.dose.med.name}${nd.date !== today ? ` · ${DAYS[weekday(nd.date)]}` : ''}` : 'nothing scheduled'} tone="accent" />
        <Stat label="Last 7 days" value={adh.due ? pct(adh.rate, 0) : '—'} sub={`${adh.done} of ${adh.due} doses ticked`} tone={adh.due && adh.rate >= 0.9 ? 'good' : undefined} />
      </Stats>
      {banner && <Note tone="warn">{banner} <Btn kind="ghost" onClick={() => setBanner('')}>Dismiss</Btn></Note>}
      <Split>
        <div>
          <Panel title="Medications" actions={<Btn onClick={() => { const m = mk('New medication', '', '', ['08:00'], {}, s.meds.length); set({ meds: [...s.meds, m] }); setSel(m.id) }}>+ Add</Btn>}>
            <Txt label="Schedule for" value={s.patient} onChange={(patient) => set({ patient })} />
            <div style={{ display: 'grid', gap: 6 }}>
              {s.meds.map((m) => (
                <button key={m.id} type="button" className="k-btn" onClick={() => setSel(m.id)} style={{ justifyContent: 'flex-start', textAlign: 'left', borderColor: m.id === sel ? 'var(--accent)' : undefined, borderLeft: `6px solid ${m.color}` }}>
                  <span style={{ flex: 1 }}>
                    <b>{m.name}</b> <span className="muted">{m.dose}</span>
                    <br />
                    <span className="muted" style={{ fontSize: 12 }}>{m.freq === 'prn' ? 'as needed' : `${m.times.filter(validTime).join(', ')} · ${describeFreq(m)}`}{FOOD[m.food] && ` · ${FOOD[m.food]}`}</span>
                  </span>
                </button>
              ))}
            </div>
          </Panel>
          {med && (
            <Panel title={`Edit · ${med.name}`} actions={<Btn kind="danger" onClick={() => { set({ meds: s.meds.filter((m) => m.id !== med.id) }); setSel(s.meds.find((m) => m.id !== med.id)?.id ?? '') }}>Delete</Btn>}>
              <Row>
                <Txt label="Name" value={med.name} onChange={(name) => edit({ name })} />
                <Txt label="Dose" value={med.dose} onChange={(dose) => edit({ dose })} placeholder="e.g. 500 mg tablet" />
              </Row>
              <Row>
                <Txt label="Purpose" value={med.purpose} onChange={(purpose) => edit({ purpose })} />
                <Select label="Food" value={med.food} onChange={(food) => edit({ food })} options={[['any', 'No restriction'], ['with', 'With food'], ['before', 'Before food'], ['after', 'After food']]} />
              </Row>
              <Row>
                <Select label="How often" value={med.freq} onChange={(freq: Freq) => edit({ freq })} options={[['daily', 'Every day'], ['weekdays', 'Certain weekdays'], ['interval', 'Every N days'], ['prn', 'As needed (PRN)']]} />
                {med.freq === 'interval' && <Txt label="Every (days)" type="number" value={String(med.every)} onChange={(v) => edit({ every: Math.max(1, Math.round(Number(v) || 1)) })} />}
              </Row>
              {med.freq === 'weekdays' && (
                <Row>
                  {DAYS.map((d, i) => (
                    <Check key={d} label={d} value={med.weekdays.includes(i)} onChange={(on) => edit({ weekdays: on ? [...med.weekdays, i].sort() : med.weekdays.filter((x) => x !== i) })} />
                  ))}
                </Row>
              )}
              {med.freq !== 'prn' && (
                <>
                  <span className="k-label">Times</span>
                  <Row>
                    {med.times.filter(validTime).map((t) => (
                      <Btn key={t} onClick={() => edit({ times: med.times.filter((x) => x !== t) })} title="Remove time">{t} ✕</Btn>
                    ))}
                    <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} aria-label="New time" className="k-text" style={{ width: 120 }} />
                    <Btn kind="primary" disabled={!validTime(newTime) || med.times.includes(newTime)} onClick={() => edit({ times: [...med.times.filter(validTime), newTime].sort() })}>+ Time</Btn>
                  </Row>
                  <Row>
                    {PRESETS.map(([n, t]) => (
                      <Btn key={n} kind="ghost" onClick={() => edit({ times: t })}>{n}</Btn>
                    ))}
                  </Row>
                </>
              )}
              <Row>
                <Txt label="Start" type="date" value={med.start} onChange={(start) => edit({ start })} />
                <Txt label="End (optional)" type="date" value={med.end} onChange={(end) => edit({ end })} />
                <label className="k-field"><span className="k-label">Color</span><input type="color" value={med.color} onChange={(e) => edit({ color: e.target.value })} style={{ height: 38, width: 56 }} /></label>
              </Row>
              <Txt label="Notes / instructions" value={med.notes} onChange={(notes) => edit({ notes })} />
            </Panel>
          )}
          <Panel title="Reminders">
            <Check label="Remind me while this page is open" value={s.remind} onChange={(on) => void enableReminders(on)} />
            <Select label="Remind" value={s.lead} onChange={(lead) => set({ lead })} options={[[0, 'At dose time'], [5, '5 min before'], [15, '15 min before'], [30, '30 min before']]} />
            <Row>
              <Btn onClick={() => (perm === 'granted' ? new Notification('Medication reminder', { body: 'Test: reminders are working.' }) : setBanner('⏰ Test reminder (system notifications are off, so it shows here).'))}>Test reminder</Btn>
              <span className="muted" style={{ fontSize: 13 }}>Notifications: <b>{perm}</b></span>
            </Row>
            <Note>Browsers only run reminders while this tab is open. For critical doses, also set a phone alarm.</Note>
          </Panel>
        </div>
        <div>
          <Panel title={`Today · ${DAYS[weekday(today)]} ${today}`}>
            {slots(todays).map(([t, ds]) => (
              <div key={t} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)', opacity: t < hm && ds.every((d) => s.taken[d.key]) ? 0.55 : 1 }}>
                <b style={{ width: 52, color: t < hm && ds.some((d) => !s.taken[d.key]) ? 'var(--err)' : undefined }}>{t}</b>
                <div style={{ flex: 1, display: 'grid', gap: 4 }}>
                  {ds.map((d) => (
                    <label key={d.key} style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!s.taken[d.key]} onChange={() => toggle(d.key)} />
                      <i style={{ width: 10, height: 10, borderRadius: 5, background: d.med.color, flex: 'none' }} />
                      <span style={{ textDecoration: s.taken[d.key] ? 'line-through' : undefined }}>
                        <b>{d.med.name}</b> {d.med.dose}
                        {FOOD[d.med.food] && <span className="muted"> · {FOOD[d.med.food]}</span>}
                        {s.taken[d.key] && <span className="muted"> · taken {s.taken[d.key]}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {!todays.length && <Note>No scheduled doses today.</Note>}
            {s.meds.some((m) => m.freq === 'prn') && (
              <p className="muted" style={{ fontSize: 13 }}>As needed: {s.meds.filter((m) => m.freq === 'prn').map((m) => `${m.name} ${m.dose}${m.notes ? ` (${m.notes})` : ''}`).join('; ')}</p>
            )}
          </Panel>
          <Panel
            title="Weekly chart"
            actions={
              <span className="med-noprint" style={{ display: 'contents' }}>
                <Btn onClick={() => set({ weekStart: addDays(s.weekStart, -7) })}>◀</Btn>
                <Btn onClick={() => set({ weekStart: today })}>This week</Btn>
                <Btn onClick={() => set({ weekStart: addDays(s.weekStart, 7) })}>▶</Btn>
                <Btn kind="primary" onClick={() => window.print()}>🖨 Print</Btn>
              </span>
            }
          >
            <div className="med-print">
              <h3 style={{ margin: '0 0 6px' }}>Medication chart · {s.patient} · {week[0]} → {week[6]}</h3>
              <div className="k-table-wrap">
                <table className="k-table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Medication</th>
                      {week.map((d) => <th key={d} style={{ textAlign: 'center' }}>{DAYS[weekday(d)]}<br /><span className="muted">{d.slice(5)}</span></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[...new Map(week.flatMap((d) => dosesOn(s.meds, d)).map((x) => [`${x.time}|${x.med.id}`, x])).values()]
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map((x) => (
                        <tr key={x.time + x.med.id}>
                          <td><b>{x.time}</b></td>
                          <td style={{ borderLeft: `4px solid ${x.med.color}` }}>{x.med.name} <span className="muted">{x.med.dose}{FOOD[x.med.food] && `, ${FOOD[x.med.food]}`}</span></td>
                          {week.map((d) => {
                            const due = dosesOn(s.meds, d).some((y) => y.med.id === x.med.id && y.time === x.time)
                            const key = `${d}|${x.med.id}|${x.time}`
                            return (
                              <td key={d} style={{ textAlign: 'center', cursor: due ? 'pointer' : undefined }} onClick={() => due && toggle(key)}>
                                {due ? <span style={{ fontSize: 18 }}>{s.taken[key] ? '☑' : '☐'}</span> : <span className="muted">·</span>}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ fontSize: 12 }}>Tick each box when the dose is given. {s.meds.filter((m) => m.notes).map((m) => `${m.name}: ${m.notes}.`).join(' ')}</p>
            </div>
            <Row>
              <CsvButton name="medication-schedule.csv" rows={() => [['Medication', 'Dose', 'Purpose', 'Times', 'Frequency', 'Food', 'Start', 'End', 'Notes'], ...s.meds.map((m) => [m.name, m.dose, m.purpose, m.freq === 'prn' ? 'as needed' : m.times.filter(validTime).join(' '), describeFreq(m), FOOD[m.food], m.start, m.end, m.notes])]} />
              <JsonButtons name="medications.json" data={s} onLoad={(d) => set(d)} />
              <Btn kind="ghost" onClick={() => confirm('Reset to the sample schedule? Your list will be replaced.') && reset()}>Reset</Btn>
            </Row>
          </Panel>
          <Note tone="warn">Planning aid only. Follow the prescription label and ask a pharmacist about timing, interactions and missed doses.</Note>
        </div>
      </Split>
    </div>
  )
}
