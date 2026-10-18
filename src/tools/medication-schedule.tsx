import { useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, JsonButtons, Note, Num, Panel, pct, Row, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import {
  addDays, adherence, dayAdherence, doseKey, mondayOf, scheduled, SLOTS, streak, supply, weekday, type Med, type Slot, type TakenLog,
} from './lib/medication-schedule'

const SLOT_LABEL: Record<Slot, string> = { am: 'Morning', noon: 'Noon', pm: 'Evening', bed: 'Bedtime' }
const SLOT_ICON: Record<Slot, string> = { am: '🌅', noon: '☀️', pm: '🌆', bed: '🌙' }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#64748b']
const ALL = [true, true, true, true, true, true, true]

interface State {
  meds: Med[]
  taken: TakenLog
  filled: Record<string, boolean>
  times: Record<Slot, string>
  lead: number
  notify: boolean
}

const localIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function sample(): State {
  const t = localIso()
  const taken: TakenLog = {}
  const meds: Med[] = [
    { id: 'm1', name: 'Metformin', strength: '500 mg', perSlot: { am: 1, noon: 0, pm: 1, bed: 0 }, days: ALL, onHand: 64, countDate: addDays(t, -10), color: COLORS[3] },
    { id: 'm2', name: 'Lisinopril', strength: '10 mg', perSlot: { am: 1, noon: 0, pm: 0, bed: 0 }, days: ALL, onHand: 30, countDate: addDays(t, -12), color: COLORS[0] },
    { id: 'm3', name: 'Vitamin D3', strength: '1000 IU', perSlot: { am: 0, noon: 1, pm: 0, bed: 0 }, days: [true, false, true, false, true, false, false], onHand: 90, countDate: addDays(t, -20), color: COLORS[1] },
    { id: 'm4', name: 'Atorvastatin', strength: '20 mg', perSlot: { am: 0, noon: 0, pm: 0, bed: 1 }, days: ALL, onHand: 45, countDate: addDays(t, -5), color: COLORS[5] },
  ]
  // A plausible recent history: everything taken except one missed evening dose 4 days ago.
  for (let i = 1; i <= 9; i++) {
    const d = addDays(t, -i)
    taken[d] = {}
    for (const k of scheduled(meds, d)) if (!(i === 4 && k === 'm1:pm')) taken[d][k] = true
  }
  taken[t] = { 'm1:am': true, 'm2:am': true }
  return { meds, taken, filled: {}, times: { am: '08:00', noon: '12:30', pm: '18:30', bed: '22:00' }, lead: 7, notify: false }
}
const DEF = sample()

const fmtDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

function printCard(s: State, week: string) {
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  const cell = (d: number, sl: Slot) =>
    s.meds.filter((m) => m.days[d] && m.perSlot[sl] > 0).map((m) => `<div><span class="dot" style="background:${m.color}"></span>${esc(m.name)} ×${m.perSlot[sl]}</div>`).join('') || '<span class="none">—</span>'
  const rows = SLOTS.map((sl) => `<tr><th>${SLOT_LABEL[sl]}<br><small>${s.times[sl]}</small></th>${DAYS.map((_, d) => `<td>${cell(d, sl)}<div class="box">☐</div></td>`).join('')}</tr>`).join('')
  const meds = s.meds.map((m) => `<li><span class="dot" style="background:${m.color}"></span><b>${esc(m.name)}</b> ${esc(m.strength)}</li>`).join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Pill organizer</title><style>
  body{font:12px system-ui,sans-serif;margin:16px;color:#111}h1{font-size:18px;margin:0 0 4px}table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #999;padding:6px;vertical-align:top;text-align:left}thead th{text-align:center;background:#eee}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px}.box{font-size:16px;text-align:right}.none{color:#aaa}
  ul{columns:2;padding-left:16px}small{color:#555}</style></head><body>
  <h1>Weekly pill organizer — week of ${fmtDate(week)}</h1><ul>${meds}</ul>
  <table><thead><tr><th></th>${DAYS.map((d, i) => `<th>${d}<br><small>${addDays(week, i).slice(5)}</small></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
  <p><small>Tick ☐ when taken. Follow your prescriber's and pharmacist's instructions; this card is only an organizer.</small></p></body></html>`
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;width:0;height:0;border:0'
  document.body.appendChild(f)
  f.contentDocument!.write(html)
  f.contentDocument!.close()
  setTimeout(() => {
    f.contentWindow!.print()
    setTimeout(() => f.remove(), 1000)
  }, 100)
}

export default function MedicationSchedule() {
  const [s, set, reset] = useToolState('medication-schedule', DEF)
  const today = localIso()
  const [week, setWeek] = useState(mondayOf(today))
  const [banner, setBanner] = useState('')
  const notified = useRef<Record<string, boolean>>({})

  const isTaken = (d: string, k: string) => !!s.taken[d]?.[k]
  const toggle = (d: string, keys: string[], v: boolean) =>
    set((st) => {
      const day = { ...(st.taken[d] ?? {}) }
      for (const k of keys) day[k] = v
      return { ...st, taken: { ...st.taken, [d]: day } }
    })
  const editMed = (id: string, p: Partial<Med>) => set({ meds: s.meds.map((m) => (m.id === id ? { ...m, ...p } : m)) })

  // Reminders: checked every 20 s while this tab is open.
  useEffect(() => {
    const check = () => {
      const now = new Date()
      const d = localIso(now)
      const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      for (const sl of SLOTS) {
        if (s.times[sl] > hm) continue
        const due = s.meds.filter((m) => m.days[weekday(d)] && m.perSlot[sl] > 0 && !s.taken[d]?.[doseKey(m.id, sl)])
        const tag = `${d}:${sl}`
        if (!due.length || notified.current[tag]) continue
        // Only remind within 2 hours of the slot time so old doses don't fire on page load.
        const [h, mi] = s.times[sl].split(':').map(Number)
        if (now.getHours() * 60 + now.getMinutes() - (h * 60 + mi) > 120) continue
        notified.current[tag] = true
        const msg = `${SLOT_LABEL[sl]} dose: ${due.map((m) => `${m.name} ×${m.perSlot[sl]}`).join(', ')}`
        setBanner(msg)
        if (s.notify && 'Notification' in window && Notification.permission === 'granted') new Notification('Pill reminder', { body: msg })
      }
    }
    check()
    const t = setInterval(check, 20000)
    return () => clearInterval(t)
  }, [s.meds, s.taken, s.times, s.notify])

  const enableNotify = async (v: boolean) => {
    if (v && 'Notification' in window && Notification.permission !== 'granted') await Notification.requestPermission()
    set({ notify: v })
  }

  const st = streak(s.meds, s.taken, today)
  const a7 = adherence(s.meds, s.taken, today, 7)
  const a30 = adherence(s.meds, s.taken, today, 30)
  const todayKeys = scheduled(s.meds, today)
  const todayDone = todayKeys.filter((k) => isTaken(today, k)).length
  const sup = s.meds.map((m) => ({ m, ...supply(m, today, s.lead) }))
  const urgent = sup.filter((x) => x.refillBy && x.refillBy <= today)
  const weekDates = DAYS.map((_, i) => addDays(week, i))
  const notifSupported = typeof window !== 'undefined' && 'Notification' in window

  return (
    <div>
      {banner && (
        <Note tone="warn">
          🔔 {banner} <Btn kind="ghost" onClick={() => setBanner('')}>Dismiss</Btn>
        </Note>
      )}
      <Stats>
        <Stat label="Today" value={`${todayDone} / ${todayKeys.length}`} sub="doses taken" tone={todayDone === todayKeys.length ? 'good' : 'accent'} />
        <Stat label="Streak" value={`${st} day${st === 1 ? '' : 's'}`} sub="all doses taken" tone={st >= 7 ? 'good' : undefined} />
        <Stat label="Adherence 7 d" value={a7 === null ? '—' : pct(a7, 0)} sub={`30 d: ${a30 === null ? '—' : pct(a30, 0)}`} tone={a7 !== null && a7 < 0.8 ? 'bad' : undefined} />
        <Stat label="Refills due" value={urgent.length} sub={urgent.length ? urgent.map((x) => x.m.name).join(', ') : `none within ${s.lead} d lead`} tone={urgent.length ? 'bad' : 'good'} />
      </Stats>

      <Split wide="right">
        <div>
          <Panel title={`Today · ${fmtDate(today)}`}>
            {SLOTS.map((sl) => {
              const due = s.meds.filter((m) => m.days[weekday(today)] && m.perSlot[sl] > 0)
              if (!due.length) return null
              return (
                <div key={sl} style={{ marginBottom: 10 }}>
                  <b>{SLOT_ICON[sl]} {SLOT_LABEL[sl]}</b> <span className="muted">{s.times[sl]}</span>
                  {due.map((m) => (
                    <div key={m.id} style={{ paddingLeft: 8 }}>
                      <Check
                        value={isTaken(today, doseKey(m.id, sl))}
                        onChange={(v) => toggle(today, [doseKey(m.id, sl)], v)}
                        label={<><Dot c={m.color} /> {m.name} <span className="muted">{m.strength} × {m.perSlot[sl]}</span></>}
                      />
                    </div>
                  ))}
                </div>
              )
            })}
            {!todayKeys.length && <p className="muted">Nothing scheduled today.</p>}
          </Panel>
          <Panel title="Refill countdown">
            {sup.map(({ m, left, daysLeft, runOut, refillBy }) => (
              <div key={m.id} style={{ marginBottom: 12 }}>
                <Row wrap={false}>
                  <span style={{ flex: 1 }}><Dot c={m.color} /> <b>{m.name}</b></span>
                  <span>{left} pills</span>
                </Row>
                <Bar value={daysLeft ?? 60} max={60} color={refillBy && refillBy <= today ? 'var(--err)' : daysLeft !== null && daysLeft < 14 ? 'var(--warn)' : 'var(--ok)'} />
                <div className="muted" style={{ fontSize: 13 }}>
                  {runOut ? <>Lasts {daysLeft} days · runs out {fmtDate(runOut)} · <b style={{ color: refillBy! <= today ? 'var(--err)' : undefined }}>refill by {fmtDate(refillBy!)}</b></> : 'Not scheduled — no countdown'}
                </div>
              </div>
            ))}
            <Num label="Refill lead time" value={s.lead} onChange={(lead) => set({ lead: Math.max(0, Math.round(lead)) })} unit="days" min={0} hint="How long before running out you want to reorder." />
          </Panel>
          <Panel title="Reminders">
            <Row>
              {SLOTS.map((sl) => (
                <Txt key={sl} type="time" label={`${SLOT_ICON[sl]} ${SLOT_LABEL[sl]}`} value={s.times[sl]} onChange={(v) => set({ times: { ...s.times, [sl]: v || s.times[sl] } })} />
              ))}
            </Row>
            <Check value={s.notify} onChange={(v) => void enableNotify(v)} label="Desktop notifications" />
            <Note>
              Reminders only fire <b>while this tab is open</b> (browsers don't let a web page wake itself up). Keep a phone alarm as a backup.
              {!notifSupported && ' This browser has no Notifications API, so an in-page banner is shown instead.'}
            </Note>
          </Panel>
        </div>

        <div>
          <Panel
            title="Weekly pill box"
            actions={
              <>
                <Btn onClick={() => setWeek(addDays(week, -7))}>◀</Btn>
                <Btn onClick={() => setWeek(mondayOf(today))}>This week</Btn>
                <Btn onClick={() => setWeek(addDays(week, 7))}>▶</Btn>
                <Btn onClick={() => printCard(s, week)}>🖨 Print card</Btn>
              </>
            }
          >
            <p className="muted" style={{ marginTop: 0 }}>
              Fill mode: tap the 💊 corner to mark a compartment as filled. Tap the compartment to mark its doses taken.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '78px repeat(7, minmax(78px, 1fr))', gap: 4, minWidth: 640 }}>
                <div />
                {weekDates.map((d, i) => (
                  <div key={d} style={{ textAlign: 'center', fontWeight: 700, color: d === today ? 'var(--accent)' : undefined }}>
                    {DAYS[i]} <div className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{d.slice(5)}</div>
                  </div>
                ))}
                {SLOTS.map((sl) => (
                  <Cells key={sl} sl={sl} s={s} dates={weekDates} today={today} toggle={toggle} setFilled={(k, v) => set({ filled: { ...s.filled, [k]: v } })} />
                ))}
                <div className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>Day</div>
                {weekDates.map((d) => {
                  const a = dayAdherence(s.meds, s.taken, d)
                  return <div key={d} style={{ textAlign: 'center' }}>{a === null ? '—' : d > today ? <span className="muted">·</span> : <b style={{ fontSize: 13, color: a === 1 ? 'var(--ok)' : 'var(--warn)' }}>{pct(a, 0)}</b>}</div>
                })}
              </div>
            </div>
          </Panel>

          <Panel
            title="Medications"
            actions={
              <>
                <Btn onClick={() => set({ meds: [...s.meds, { id: uid(), name: 'New medication', strength: '', perSlot: { am: 1, noon: 0, pm: 0, bed: 0 }, days: ALL, onHand: 30, countDate: today, color: COLORS[s.meds.length % COLORS.length] }] })}>+ Medication</Btn>
                <JsonButtons name="pill-organizer.json" data={s} onLoad={(d) => set(d)} />
                <Btn kind="ghost" onClick={reset}>Reset</Btn>
              </>
            }
          >
            <Table
              head={['', 'Name', 'Strength', ...SLOTS.map((x) => SLOT_ICON[x]), 'Days', 'On hand', 'Counted', '']}
              rows={s.meds.map((m) => [
                <input key="c" type="color" value={m.color} onChange={(e) => editMed(m.id, { color: e.target.value })} aria-label="Colour" style={{ width: 28, height: 24, padding: 0, border: 0, background: 'transparent' }} />,
                <input key="n" value={m.name} onChange={(e) => editMed(m.id, { name: e.target.value })} aria-label="Name" style={{ width: 120 }} />,
                <input key="s" value={m.strength} onChange={(e) => editMed(m.id, { strength: e.target.value })} aria-label="Strength" style={{ width: 70 }} />,
                ...SLOTS.map((sl) => (
                  <input key={sl} type="number" min={0} max={9} value={m.perSlot[sl]} aria-label={`${SLOT_LABEL[sl]} pills`} style={{ width: 44 }}
                    onChange={(e) => editMed(m.id, { perSlot: { ...m.perSlot, [sl]: Math.max(0, Math.min(9, Math.round(Number(e.target.value) || 0))) } })} />
                )),
                <span key="d" style={{ whiteSpace: 'nowrap' }}>
                  {DAYS.map((dn, i) => (
                    <button key={dn} type="button" title={dn} onClick={() => editMed(m.id, { days: m.days.map((x, j) => (j === i ? !x : x)) })}
                      style={{ width: 20, padding: 0, margin: 1, borderRadius: 4, border: '1px solid var(--line)', background: m.days[i] ? 'var(--accent)' : 'transparent', color: m.days[i] ? '#fff' : 'var(--muted)', fontSize: 11 }}>
                      {dn[0]}
                    </button>
                  ))}
                </span>,
                <input key="o" type="number" min={0} value={m.onHand} onChange={(e) => editMed(m.id, { onHand: Math.max(0, Math.round(Number(e.target.value) || 0)) })} aria-label="Pills on hand" style={{ width: 60 }} />,
                <input key="cd" type="date" value={m.countDate} onChange={(e) => editMed(m.id, { countDate: e.target.value || today })} aria-label="Count date" />,
                <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ meds: s.meds.filter((x) => x.id !== m.id) })}>✕</Btn>,
              ])}
            />
            <Row>
              <Btn onClick={() => set({ meds: s.meds.map((m) => ({ ...m, onHand: supply(m, today, s.lead).left, countDate: today })) })}>Recount: carry projected counts to today</Btn>
            </Row>
            <p className="muted" style={{ fontSize: 13 }}>
              "On hand" is what you counted on the "Counted" date; scheduled doses since then are subtracted automatically. After picking up a refill, add the new pills and set the date to today.
            </p>
          </Panel>
          <Note tone="warn">
            Informational organizer only — not medical advice. Always follow your prescriber's and pharmacist's directions, and ask them before changing, skipping or doubling a dose. Data stays in this browser.
          </Note>
        </div>
      </Split>
    </div>
  )
}

function Dot({ c }: { c: string }) {
  return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c, verticalAlign: 'middle' }} />
}

function Cells({ sl, s, dates, today, toggle, setFilled }: {
  sl: Slot; s: State; dates: string[]; today: string; toggle: (d: string, keys: string[], v: boolean) => void; setFilled: (k: string, v: boolean) => void
}) {
  return (
    <>
      <div style={{ alignSelf: 'center', fontWeight: 600, fontSize: 13 }}>
        {SLOT_ICON[sl]} {SLOT_LABEL[sl]}
        <div className="muted" style={{ fontWeight: 400 }}>{s.times[sl]}</div>
      </div>
      {dates.map((d) => {
        const due = s.meds.filter((m) => m.days[weekday(d)] && m.perSlot[sl] > 0)
        const keys = due.map((m) => doseKey(m.id, sl))
        const done = keys.length > 0 && keys.every((k) => s.taken[d]?.[k])
        const fk = `${d}:${sl}`
        const filled = !!s.filled[fk]
        const missed = !done && keys.length > 0 && d < today
        return (
          <div
            key={d}
            role="button"
            tabIndex={keys.length ? 0 : -1}
            aria-pressed={done}
            onClick={() => keys.length && toggle(d, keys, !done)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && keys.length && toggle(d, keys, !done)}
            title={keys.length ? (done ? 'Taken — click to undo' : 'Click to mark taken') : 'Empty'}
            style={{
              position: 'relative', minHeight: 64, borderRadius: 10, padding: '6px 6px 4px', cursor: keys.length ? 'pointer' : 'default',
              border: `2px solid ${d === today ? 'var(--accent)' : 'var(--line)'}`,
              background: done ? 'color-mix(in srgb, var(--ok) 18%, transparent)' : missed ? 'color-mix(in srgb, var(--err) 12%, transparent)' : 'var(--panel)',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {due.flatMap((m) => Array.from({ length: m.perSlot[sl] }, (_, i) => (
                <span key={m.id + i} title={`${m.name} ${m.strength}`} style={{ width: 16, height: 9, borderRadius: 5, background: m.color, opacity: done ? 0.35 : 1 }} />
              )))}
            </div>
            {keys.length > 0 && (
              <div style={{ fontSize: 11, marginTop: 4 }}>{done ? '✓ taken' : missed ? '✗ missed' : ''}</div>
            )}
            {keys.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setFilled(fk, !filled)
                }}
                title={filled ? 'Filled' : 'Mark compartment filled'}
                style={{ position: 'absolute', right: 2, bottom: 2, border: 0, background: 'transparent', fontSize: 13, opacity: filled ? 1 : 0.3, padding: 0 }}
              >
                💊
              </button>
            )}
          </div>
        )
      })}
    </>
  )
}
