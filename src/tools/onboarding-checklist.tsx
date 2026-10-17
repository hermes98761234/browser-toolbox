import { useState } from 'react'
import { Bar, Btn, Check, CsvButton, JsonButtons, Note, Num, Panel, Ring, Row, Select, Split, Stat, Stats, today, Txt, uid, useToolState } from '../kit'
import { addDays, addWorkdays, daysBetween, generate, PHASES, phaseOf, progress, ROLES, status, type Owner, type Task } from './lib/onboarding-checklist'

interface Hire { id: string; name: string; role: string; start: string; manager: string; buddy: string; workdays: boolean; tasks: Task[] }

const OWNERS: Owner[] = ['HR', 'IT', 'Manager', 'Buddy', 'New hire']
const OWNER_COLOR: Record<Owner, string> = { HR: '#a855f7', IT: '#0ea5e9', Manager: '#f59e0b', Buddy: '#10b981', 'New hire': '#6366f1' }
const ST_COLOR = { done: 'var(--ok)', overdue: 'var(--err)', soon: 'var(--warn)', later: 'var(--muted)' }

function sampleHire(): Hire {
  const start = addWorkdays(today(), -6)
  const tasks = generate('engineer', start, true).map((t, i) => ({ ...t, done: t.due < today() && i % 7 !== 3 }))
  return { id: 'sample', name: 'Alex Rivera', role: 'engineer', start, manager: 'Priya Shah', buddy: 'Sam Lee', workdays: true, tasks }
}

const DEF = { hires: [sampleHire()], cur: 'sample', owner: 'all' as 'all' | Owner, hideDone: false }

function printHire(h: Hire) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  const rows = PHASES.map(([ph], pi) => {
    const ts = h.tasks.filter((t) => phaseOf(t.offset) === pi)
    if (!ts.length) return ''
    return `<h2>${ph}</h2><table>${ts.map((t) => `<tr><td class="b">${t.done ? '☑' : '☐'}</td><td>${esc(t.title)}${t.note ? `<div class="n">${esc(t.note)}</div>` : ''}</td><td>${t.owner}</td><td>${t.due}</td></tr>`).join('')}</table>`
  }).join('')
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<!doctype html><title>Onboarding — ${esc(h.name)}</title><style>body{font:13px/1.4 system-ui,sans-serif;margin:24px;color:#111}h1{margin:0 0 4px}h2{font-size:15px;margin:18px 0 6px;border-bottom:2px solid #6366f1}table{width:100%;border-collapse:collapse}td{padding:5px 6px;border-bottom:1px solid #ddd;vertical-align:top}td.b{width:20px;font-size:16px}td:nth-child(3),td:nth-child(4){white-space:nowrap;width:1%;color:#555}.n{color:#666;font-size:12px}</style><h1>Onboarding: ${esc(h.name)}</h1><div>${esc(ROLES[h.role]?.label ?? h.role)} · starts ${h.start} · manager ${esc(h.manager)} · buddy ${esc(h.buddy)}</div>${rows}<script>print()</script>`)
  w.document.close()
}

export default function OnboardingChecklist() {
  const [s, set] = useToolState('onboarding-checklist', DEF)
  const [newTask, setNewTask] = useState({ title: '', owner: 'Manager' as Owner, offset: 5 })
  const now = today()
  const h = s.hires.find((x) => x.id === s.cur) ?? s.hires[0]
  const up = (p: Partial<Hire>) => set({ hires: s.hires.map((x) => (x.id === h.id ? { ...x, ...p } : x)) })

  /** Rebuild due dates after role/start/day-mode changes, keeping ticks, notes and custom tasks. */
  const rebuild = (p: Partial<Hire>) => {
    const n = { ...h, ...p }
    const old = new Map(h.tasks.map((t) => [t.title, t]))
    const base = generate(n.role, n.start, n.workdays).map((t) => ({ ...t, done: old.get(t.title)?.done ?? false, note: old.get(t.title)?.note ?? '' }))
    const custom = h.tasks.filter((t) => t.custom).map((t) => ({ ...t, due: n.workdays ? addWorkdays(n.start, t.offset) : addDays(n.start, t.offset) }))
    up({ ...p, tasks: [...base, ...custom].sort((a, b) => a.due.localeCompare(b.due)) })
  }
  const editTask = (id: string, p: Partial<Task>) => up({ tasks: h.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) })

  if (!h) return <Btn onClick={() => set(DEF)}>Start</Btn>
  const pr = progress(h.tasks)
  const overdue = h.tasks.filter((t) => status(t, now) === 'overdue').length
  const dayN = daysBetween(h.start, now)
  const visible = h.tasks.filter((t) => (s.owner === 'all' || t.owner === s.owner) && (!s.hideDone || !t.done))

  return (
    <Split>
      <div>
        <Panel title="New hire" actions={<Btn onClick={() => { const nh: Hire = { id: uid(), name: 'New hire', role: 'generic', start: addWorkdays(now, 10), manager: '', buddy: '', workdays: true, tasks: generate('generic', addWorkdays(now, 10), true) }; set({ hires: [...s.hires, nh], cur: nh.id }) }}>+ Hire</Btn>}>
          {s.hires.length > 1 && <Select label="Checklist" value={h.id} onChange={(cur) => set({ cur })} options={s.hires.map((x) => [x.id, `${x.name} · ${x.start}`] as [string, string])} />}
          <Row>
            <Txt label="Name" value={h.name} onChange={(name) => up({ name })} />
            <Select label="Role template" value={h.role} onChange={(role) => rebuild({ role })} options={Object.entries(ROLES).map(([k, v]) => [k, v.label] as [string, string])} />
          </Row>
          <Row>
            <Txt label="Start date" type="date" value={h.start} onChange={(start) => start && rebuild({ start })} />
            <Txt label="Manager" value={h.manager} onChange={(manager) => up({ manager })} />
            <Txt label="Buddy" value={h.buddy} onChange={(buddy) => up({ buddy })} />
          </Row>
          <Check label="Count working days only (skip weekends)" value={h.workdays} onChange={(workdays) => rebuild({ workdays })} />
          <Row>
            <Btn onClick={() => rebuild({})}>↻ Recalculate dates</Btn>
            {s.hires.length > 1 && <Btn kind="danger" onClick={() => set({ hires: s.hires.filter((x) => x.id !== h.id), cur: s.hires.find((x) => x.id !== h.id)!.id })}>Delete checklist</Btn>}
          </Row>
        </Panel>
        <Panel title="Progress by phase">
          {PHASES.map(([ph], pi) => {
            const ts = h.tasks.filter((t) => phaseOf(t.offset) === pi)
            const p = progress(ts)
            return ts.length ? (
              <div key={ph} style={{ marginBottom: 10 }}>
                <Row wrap={false}><b style={{ flex: 1 }}>{ph}</b><span>{p.done}/{p.total}</span></Row>
                <Bar value={p.share} color={p.share === 1 ? 'var(--ok)' : 'var(--accent)'} />
              </div>
            ) : null
          })}
        </Panel>
        <Panel title="Add a task">
          <Txt label="Task" value={newTask.title} onChange={(title) => setNewTask({ ...newTask, title })} placeholder="e.g. Meet the finance team" />
          <Row>
            <Select label="Owner" value={newTask.owner} onChange={(owner) => setNewTask({ ...newTask, owner })} options={OWNERS} />
            <Num label="Day offset" value={newTask.offset} onChange={(offset) => setNewTask({ ...newTask, offset: Math.round(offset) })} hint="0 = first day, −5 = a week before" />
          </Row>
          <Btn kind="primary" disabled={!newTask.title.trim()} onClick={() => {
            const due = h.workdays ? addWorkdays(h.start, newTask.offset) : addDays(h.start, newTask.offset)
            up({ tasks: [...h.tasks, { id: uid(), title: newTask.title.trim(), owner: newTask.owner, offset: newTask.offset, due, done: false, note: '', custom: true }].sort((a, b) => a.due.localeCompare(b.due)) })
            setNewTask({ ...newTask, title: '' })
          }}>Add task</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Progress" value={<Ring value={pr.share} size={64} />} sub={`${pr.done} of ${pr.total} tasks`} />
          <Stat label={dayN >= 0 ? 'Day' : 'Starts in'} value={dayN >= 0 ? `${dayN + 1}` : `${-dayN} days`} sub={`start ${h.start}`} tone="accent" />
          <Stat label="Overdue" value={overdue} tone={overdue ? 'bad' : 'good'} />
          <Stat label="Due in 3 days" value={h.tasks.filter((t) => status(t, now) === 'soon').length} />
        </Stats>
        {overdue > 0 && <Note tone="warn">{overdue} task{overdue > 1 ? 's are' : ' is'} overdue — follow up with the owners.</Note>}
        <Panel
          title="Checklist"
          actions={
            <>
              <Btn onClick={() => printHire(h)}>🖨 Print</Btn>
              <CsvButton name={`onboarding-${h.name.replace(/\W+/g, '-')}.csv`} rows={() => [['Phase', 'Task', 'Owner', 'Due', 'Done', 'Note'], ...h.tasks.map((t) => [PHASES[phaseOf(t.offset)][0], t.title, t.owner, t.due, t.done ? 'yes' : 'no', t.note])]} />
              <JsonButtons name="onboarding.json" data={s} onLoad={(d) => d.hires?.length && set(d)} />
            </>
          }
        >
          <Row>
            <Select label="Owner" value={s.owner} onChange={(owner) => set({ owner })} options={[['all', 'Everyone'], ...OWNERS.map((o) => [o, o] as [Owner, string])]} />
            <div style={{ alignSelf: 'end' }}><Check label="Hide done" value={s.hideDone} onChange={(hideDone) => set({ hideDone })} /></div>
          </Row>
          {PHASES.map(([ph], pi) => {
            const ts = visible.filter((t) => phaseOf(t.offset) === pi)
            if (!ts.length) return null
            return (
              <div key={ph} style={{ marginTop: 14 }}>
                <h4 style={{ margin: '0 0 6px', borderBottom: '2px solid var(--accent)', paddingBottom: 4 }}>{ph}</h4>
                {ts.map((t) => {
                  const st = status(t, now)
                  return (
                    <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--line)', alignItems: 'start' }}>
                      <input type="checkbox" checked={t.done} onChange={(e) => editTask(t.id, { done: e.target.checked })} aria-label={t.title} style={{ marginTop: 3 }} />
                      <div>
                        <div style={{ textDecoration: t.done ? 'line-through' : undefined, opacity: t.done ? 0.6 : 1 }}>{t.title}</div>
                        <input value={t.note} onChange={(e) => editTask(t.id, { note: e.target.value })} placeholder="note…" aria-label="Note" style={{ border: 0, background: 'transparent', fontSize: 12, color: 'var(--muted)', width: '100%', padding: 0 }} />
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        <span style={{ background: OWNER_COLOR[t.owner], color: '#fff', borderRadius: 99, padding: '1px 8px', fontWeight: 700 }}>{t.owner}</span>
                        <div style={{ color: ST_COLOR[st], marginTop: 3, fontWeight: st === 'overdue' ? 700 : 400 }}>{st === 'overdue' ? 'overdue · ' : ''}{t.due}</div>
                        {t.custom && <button type="button" className="k-btn ghost" style={{ padding: '0 4px', fontSize: 11 }} onClick={() => up({ tasks: h.tasks.filter((x) => x.id !== t.id) })}>remove</button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
          {!visible.length && <p className="muted">Nothing to show — all done? 🎉</p>}
        </Panel>
      </div>
    </Split>
  )
}
