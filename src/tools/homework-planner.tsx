import { useEffect, useRef, useState } from 'react'
import { Btn, Check, CsvButton, JsonButtons, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, uid, useToolState, PALETTE } from '../kit'
import { addDays, bucket, BUCKETS, daysLeft, dueReminders, reminderKey, sortTasks, week, ymd, weekStart, type Task } from './lib/homework-planner'

interface Subject { id: string; name: string; color: string }

const T0 = ymd(new Date())
const mk = (title: string, subject: string, kid: string, d: number, time: string, minutes: number, priority: 1 | 2 | 3, done = false): Task =>
  ({ id: uid(), title, subject, kid, due: addDays(T0, d), time, minutes, priority, done, notes: '' })
const DEF = {
  kids: ['Mia', 'Leo'],
  subjects: [
    { id: 'math', name: 'Math', color: '#6366f1' },
    { id: 'eng', name: 'English', color: '#ef4444' },
    { id: 'sci', name: 'Science', color: '#10b981' },
    { id: 'hist', name: 'History', color: '#f59e0b' },
    { id: 'art', name: 'Art', color: '#ec4899' },
    { id: 'lang', name: 'Spanish', color: '#0ea5e9' },
  ] as Subject[],
  tasks: [
    mk('Fractions worksheet p. 42', 'math', 'Mia', 0, '18:00', 30, 3),
    mk('Read chapter 5 and write a summary', 'eng', 'Mia', 1, '08:00', 45, 2),
    mk('Volcano model: buy materials', 'sci', 'Leo', 2, '17:00', 20, 2),
    mk('Vocabulary quiz prep (unit 3)', 'lang', 'Leo', 1, '08:00', 25, 3),
    mk('Timeline poster on ancient Egypt', 'hist', 'Mia', 5, '08:00', 90, 2),
    mk('Times tables practice', 'math', 'Leo', -1, '19:00', 15, 1),
    mk('Draw a still life with shading', 'art', 'Leo', 3, '08:00', 40, 1),
    mk('Spelling list week 7', 'eng', 'Leo', -2, '08:00', 15, 2, true),
    mk('Lab report: plant growth', 'sci', 'Mia', 9, '08:00', 60, 3),
  ],
  kid: '',
  show: 'open' as 'open' | 'all' | 'done',
  lead: 60,
  notify: false,
  weekOf: '',
}

export default function HomeworkPlanner() {
  const [s, set, reset] = useToolState('homework-planner', DEF)
  const [now, setNow] = useState(() => new Date())
  const [toast, setToast] = useState<string[]>([])
  const [form, setForm] = useState({ title: '', subject: 'math', kid: '', due: addDays(T0, 1), time: '08:00', minutes: 30, priority: 2 as 1 | 2 | 3 })
  const seen = useRef(new Set<string>())
  const today = ymd(now)
  const sub = (id: string) => s.subjects.find((x) => x.id === id) ?? { id, name: id, color: '#64748b' }
  const mine = s.tasks.filter((t) => !s.kid || t.kid === s.kid)
  const list = sortTasks(mine.filter((t) => (s.show === 'all' ? true : s.show === 'done' ? t.done : !t.done)))
  const ws = s.weekOf || today
  const days = week(mine, ws)
  const maxMin = Math.max(60, ...days.map((d) => d.minutes))
  const open = mine.filter((t) => !t.done)
  const overdue = open.filter((t) => bucket(t, now) === 'overdue').length
  const weekDone = mine.filter((t) => t.due >= ws && t.due <= addDays(ws, 6))
  const perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission

  // Clock + reminders: run only while this tab is open.
  useEffect(() => {
    const tick = () => {
      const n = new Date()
      setNow(n)
      if (!s.notify) return
      for (const t of dueReminders(s.tasks, n, s.lead, seen.current)) {
        seen.current.add(reminderKey(t))
        const msg = `${t.kid ? t.kid + ': ' : ''}${t.title} (${sub(t.subject).name}) is due at ${t.time}`
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('Homework reminder', { body: msg, tag: reminderKey(t) })
        setToast((x) => [...x.slice(-3), msg])
      }
    }
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.tasks, s.notify, s.lead])

  const edit = (id: string, p: Partial<Task>) => set({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) })
  const add = () => {
    if (!form.title.trim()) return
    set({ tasks: [...s.tasks, { id: uid(), ...form, title: form.title.trim(), kid: form.kid || s.kid || s.kids[0] || '', done: false, notes: '' }] })
    setForm({ ...form, title: '' })
  }
  const enableNotify = async (on: boolean) => {
    if (on && typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission()
    set({ notify: on })
  }
  const dl = (t: Task) => {
    const d = daysLeft(t, today)
    return t.done ? 'done' : d < 0 ? `${-d} day${d === -1 ? '' : 's'} late` : d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`
  }
  const groups = BUCKETS.map(([b, name]) => ({ b, name, tasks: list.filter((t) => bucket(t, now) === b) })).filter((g) => g.tasks.length)

  return (
    <Split wide="right">
      <div>
        <Panel title="Add assignment">
          <Txt label="What" value={form.title} onChange={(title) => setForm({ ...form, title })} placeholder="e.g. Math worksheet p. 12" />
          <Row>
            <Select label="Subject" value={form.subject} onChange={(subject) => setForm({ ...form, subject })} options={s.subjects.map((x) => [x.id, x.name] as [string, string])} />
            <Select label="For" value={form.kid || s.kid || s.kids[0] || ''} onChange={(kid) => setForm({ ...form, kid })} options={s.kids.length ? s.kids : ['']} />
          </Row>
          <Row>
            <Txt label="Due date" type="date" value={form.due} onChange={(due) => setForm({ ...form, due })} />
            <Txt label="Time" type="time" value={form.time} onChange={(time) => setForm({ ...form, time })} />
          </Row>
          <Row>
            <Num label="Estimated time" value={form.minutes} onChange={(minutes) => setForm({ ...form, minutes })} unit="min" min={0} step={5} />
            <Select label="Priority" value={form.priority} onChange={(priority) => setForm({ ...form, priority })} options={[[3, 'High'], [2, 'Normal'], [1, 'Low']]} />
          </Row>
          <Btn kind="primary" onClick={add} disabled={!form.title.trim()}>+ Add assignment</Btn>
        </Panel>
        <Panel title="Reminders">
          <Check label="Remind me before assignments are due" value={s.notify} onChange={(on) => void enableNotify(on)} />
          <Num label="Remind this long before" value={s.lead} onChange={(lead) => set({ lead })} unit="min" min={1} step={5} />
          <Note tone="warn">Reminders only work <b>while this tab is open</b> (the page has no server and no background worker). Keep the tab open, for example on a family tablet.
            {perm === 'denied' && ' Browser notifications are blocked, so reminders appear on this page only.'}
            {perm === 'unsupported' && ' This browser has no notification support, so reminders appear on this page only.'}</Note>
          {toast.map((m, i) => <Note key={i} tone="info">🔔 {m}</Note>)}
        </Panel>
        <Panel title="Kids & subjects" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label="Kids (comma separated)" value={s.kids.join(', ')} onChange={(v) => set({ kids: v.split(',').map((x) => x.trim()).filter(Boolean) })} />
          {s.subjects.map((x, i) => (
            <Row key={x.id} wrap={false}>
              <input type="color" value={x.color} onChange={(e) => set({ subjects: s.subjects.map((y) => (y.id === x.id ? { ...y, color: e.target.value } : y)) })} aria-label="Subject colour" />
              <input value={x.name} onChange={(e) => set({ subjects: s.subjects.map((y) => (y.id === x.id ? { ...y, name: e.target.value } : y)) })} aria-label="Subject name" style={{ flex: 1 }} />
              {i > 0 && <Btn kind="ghost" onClick={() => set({ subjects: s.subjects.filter((y) => y.id !== x.id) })} title="Remove subject">✕</Btn>}
            </Row>
          ))}
          <Btn onClick={() => set({ subjects: [...s.subjects, { id: uid(), name: 'New subject', color: PALETTE[s.subjects.length % PALETTE.length] }] })}>+ Subject</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Open" value={open.length} sub={`${open.reduce((a, t) => a + t.minutes, 0)} min of work`} />
          <Stat label="Overdue" value={overdue} tone={overdue ? 'bad' : 'good'} />
          <Stat label="Due in 2 days" value={open.filter((t) => daysLeft(t, today) >= 0 && daysLeft(t, today) <= 1).length} tone="accent" />
          <Stat label="Done in view" value={`${weekDone.filter((t) => t.done).length}/${weekDone.length}`} />
        </Stats>
        <Panel title={s.weekOf ? `Week of ${ws}` : 'Next 7 days'} actions={<>
          <Btn kind="ghost" onClick={() => set({ weekOf: addDays(ws, -7) })}>◀</Btn>
          <Btn kind="ghost" onClick={() => set({ weekOf: '' })}>Today</Btn>
          <Btn kind="ghost" onClick={() => set({ weekOf: weekStart(today) })}>Mon–Sun</Btn>
          <Btn kind="ghost" onClick={() => set({ weekOf: addDays(ws, 7) })}>▶</Btn>
        </>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(96px, 1fr))', gap: 6, overflowX: 'auto' }}>
            {days.map((d) => (
              <div key={d.day} style={{ border: `1px solid ${d.day === today ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8, padding: 6, minHeight: 110 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{new Date(`${d.day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                <div style={{ height: 4, background: 'var(--line)', borderRadius: 2, margin: '4px 0' }}>
                  <div style={{ width: `${(d.minutes / maxMin) * 100}%`, height: '100%', borderRadius: 2, background: d.minutes > 90 ? 'var(--warn)' : 'var(--accent)' }} />
                </div>
                <div className="muted" style={{ fontSize: 11 }}>{d.minutes} min</div>
                {d.tasks.map((t) => (
                  <div key={t.id} title={t.title} style={{ fontSize: 12, marginTop: 3, padding: '2px 5px', borderRadius: 4, borderLeft: `4px solid ${sub(t.subject).color}`, background: 'color-mix(in srgb, var(--line) 50%, transparent)', textDecoration: t.done ? 'line-through' : undefined, opacity: t.done ? 0.6 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.title}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Assignments" actions={<>
          <CsvButton name="homework.csv" rows={() => [['Kid', 'Subject', 'Assignment', 'Due', 'Time', 'Minutes', 'Priority', 'Done'], ...sortTasks(s.tasks).map((t) => [t.kid, sub(t.subject).name, t.title, t.due, t.time, t.minutes, t.priority, t.done ? 'yes' : 'no'])]} />
          <JsonButtons name="homework.json" data={s} onLoad={(d) => set(d)} />
        </>}>
          <Row>
            <Seg value={s.show} onChange={(show) => set({ show })} options={[['open', 'To do'], ['all', 'All'], ['done', 'Done']]} />
            <Seg value={s.kid} onChange={(kid) => set({ kid })} options={[['', 'Everyone'] as [string, string], ...s.kids.map((k) => [k, k] as [string, string])]} />
          </Row>
          {groups.length === 0 && <Note tone="ok">Nothing here. 🎉</Note>}
          {groups.map((g) => (
            <div key={g.b} style={{ marginTop: 10 }}>
              <div className="k-label" style={{ color: g.b === 'overdue' ? 'var(--err)' : undefined }}>{g.name} ({g.tasks.length})</div>
              {g.tasks.map((t) => (
                <div key={t.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', margin: '4px 0', borderRadius: 8, border: '1px solid var(--line)', borderLeft: `6px solid ${sub(t.subject).color}`, opacity: t.done ? 0.6 : 1 }}>
                  <input type="checkbox" checked={t.done} onChange={(e) => edit(t.id, { done: e.target.checked })} aria-label="Done" style={{ width: 20, height: 20 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, textDecoration: t.done ? 'line-through' : undefined }}>{t.priority === 3 && !t.done ? '❗ ' : ''}{t.title}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      <span style={{ color: sub(t.subject).color, fontWeight: 700 }}>{sub(t.subject).name}</span> · {t.kid} · {t.due} {t.time} · <b style={{ color: bucket(t, now) === 'overdue' ? 'var(--err)' : undefined }}>{dl(t)}</b> · ~{t.minutes} min
                    </div>
                  </div>
                  <Btn kind="ghost" onClick={() => edit(t.id, { due: addDays(t.due, 1) })} title="Move to next day">+1d</Btn>
                  <Btn kind="ghost" onClick={() => set({ tasks: s.tasks.filter((x) => x.id !== t.id) })} title="Delete">✕</Btn>
                </div>
              ))}
            </div>
          ))}
        </Panel>
      </div>
    </Split>
  )
}
