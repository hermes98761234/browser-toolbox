import { useState, type DragEvent } from 'react'
import { Btn, Check, CopyButton, CsvButton, JsonButtons, Note, Panel, Row, Split, Stat, Stats, Table, uid, useToolState } from '../kit'

type Q = 'do' | 'plan' | 'delegate' | 'drop'
interface Task { id: string; title: string; q: Q; due: string; who: string; done?: string }
interface State { tasks: Task[]; archive: Task[]; soonDays: number }

const QS: { id: Q; title: string; sub: string; color: string; hint: string }[] = [
  { id: 'do', title: 'Do first', sub: 'Urgent · Important', color: '#ef4444', hint: 'Crises and deadlines. Do them today.' },
  { id: 'plan', title: 'Schedule', sub: 'Not urgent · Important', color: '#6366f1', hint: 'Goals, planning, health. Put them in your calendar.' },
  { id: 'delegate', title: 'Delegate', sub: 'Urgent · Not important', color: '#f59e0b', hint: 'Interruptions and some meetings. Hand them off.' },
  { id: 'drop', title: 'Eliminate', sub: 'Not urgent · Not important', color: '#64748b', hint: 'Time-wasters. Drop or batch them.' },
]
const qOf = (id: Q) => QS.find((q) => q.id === id)!

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
const T = (title: string, q: Q, due = '', who = ''): Task => ({ id: uid(), title, q, due, who })
const DEF: State = {
  soonDays: 2,
  tasks: [
    T('Fix production login bug', 'do', day(0)), T('Submit quarterly tax return', 'do', day(1)), T('Prepare slides for Monday client meeting', 'do', day(2)),
    T('Plan next quarter OKRs', 'plan', day(14)), T('Book annual health check-up', 'plan'), T('Learn TypeScript generics (1 h/week)', 'plan'), T('Refactor billing module', 'plan', day(21)),
    T('Reply to vendor pricing emails', 'delegate', day(1), 'Sam'), T('Schedule team offsite logistics', 'delegate', day(5), 'Priya'), T('Weekly status report formatting', 'delegate', '', 'Alex'),
    T('Reorganise bookmarks', 'drop'), T('Check social media notifications', 'drop'),
  ],
  archive: [{ ...T('Renew domain name', 'do', day(-2)), done: day(-1) }, { ...T('Write blog post draft', 'plan'), done: day(-3) }],
}

export default function EisenhowerMatrix() {
  const [s, set, reset] = useToolState('eisenhower-matrix', DEF)
  const [title, setTitle] = useState('')
  const [urgent, setUrgent] = useState(true)
  const [important, setImportant] = useState(true)
  const [due, setDue] = useState('')
  const [over, setOver] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const today = day(0)
  const soon = day(s.soonDays)

  const add = () => {
    const t = title.trim()
    if (!t) return
    const q: Q = urgent ? (important ? 'do' : 'delegate') : important ? 'plan' : 'drop'
    set({ tasks: [...s.tasks, T(t, q, due)] })
    setTitle('')
    setDue('')
  }
  const patch = (id: string, p: Partial<Task>) => set({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) })
  /** Move task `id` into quadrant q, before task `before` (or at the end). */
  const move = (id: string, q: Q, before?: string) => set((x) => {
    const t = x.tasks.find((y) => y.id === id)
    if (!t || id === before) return x
    const rest = x.tasks.filter((y) => y.id !== id)
    const i = before ? rest.findIndex((y) => y.id === before) : -1
    const moved = { ...t, q }
    return { ...x, tasks: i < 0 ? [...rest, moved] : [...rest.slice(0, i), moved, ...rest.slice(i)] }
  })
  const complete = (t: Task) => set({ tasks: s.tasks.filter((x) => x.id !== t.id), archive: [{ ...t, done: today }, ...s.archive] })
  const drop = (q: Q, before?: string) => (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOver(null)
    const id = e.dataTransfer.getData('text/plain')
    if (id) move(id, q, before)
  }

  const flagged = s.tasks.filter((t) => t.due && t.due <= soon && (t.q === 'plan' || t.q === 'drop'))
  const asMd = () => QS.map((q) => `## ${q.title} (${q.sub})\n` + (s.tasks.filter((t) => t.q === q.id).map((t) => `- [ ] ${t.title}${t.due ? ` (due ${t.due})` : ''}${t.who ? ` → ${t.who}` : ''}`).join('\n') || '- (empty)')).join('\n\n')

  return (
    <div>
      <Stats>
        {QS.map((q) => <Stat key={q.id} label={q.title} value={s.tasks.filter((t) => t.q === q.id).length} sub={q.sub} />)}
      </Stats>
      <Panel title="Add a task">
        <Row>
          <input className="k-text" style={{ flex: '1 1 260px' }} value={title} placeholder="What needs doing?" onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} aria-label="Task" />
          <input className="k-text" type="date" style={{ width: 160 }} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
          <Check label="Urgent" value={urgent} onChange={setUrgent} />
          <Check label="Important" value={important} onChange={setImportant} />
          <Btn kind="primary" onClick={add} disabled={!title.trim()}>+ Add to “{qOf(urgent ? (important ? 'do' : 'delegate') : important ? 'plan' : 'drop').title}”</Btn>
        </Row>
      </Panel>
      {flagged.length > 0 && (
        <Note tone="warn">
          {flagged.length} non-urgent task{flagged.length > 1 ? 's are' : ' is'} due within {s.soonDays} day{s.soonDays === 1 ? '' : 's'}: {flagged.map((t) => t.title).join(', ')}. Consider moving {flagged.length > 1 ? 'them' : 'it'} to Do first.
          {' '}<Btn onClick={() => flagged.forEach((t) => move(t.id, t.q === 'plan' ? 'do' : 'delegate'))}>Promote</Btn>
        </Note>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(max(280px, 40%), 1fr))', gap: 12, margin: '12px 0' }}>
        {QS.map((q) => {
          const list = s.tasks.filter((t) => t.q === q.id)
          return (
            <section key={q.id} onDragOver={(e) => { e.preventDefault(); setOver(q.id) }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null) }} onDrop={drop(q.id)}
              style={{ border: `2px solid ${over === q.id ? q.color : 'var(--line)'}`, borderTop: `6px solid ${q.color}`, borderRadius: 12, padding: 12, background: over === q.id ? 'var(--panel2)' : 'var(--panel)', minHeight: 220 }}>
              <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                <h3 style={{ margin: 0, color: q.color }}>{q.title}</h3>
                <span className="muted" style={{ fontSize: 12 }}>{q.sub}</span>
                <b style={{ marginLeft: 'auto' }}>{list.length}</b>
              </header>
              <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>{q.hint}</p>
              {list.map((t) => {
                const late = t.due && t.due < today
                const near = t.due && !late && t.due <= soon
                return (
                  <div key={t.id} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move' }} onDrop={drop(q.id, t.id)}
                    style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 8px', marginBottom: 6, borderRadius: 8, background: 'var(--panel2)', border: '1px solid var(--line)', cursor: 'grab' }}>
                    <input type="checkbox" checked={false} onChange={() => complete(t)} title="Mark done" aria-label={`Complete ${t.title}`} style={{ marginTop: 3 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {editing === t.id ? (
                        <>
                          <input className="k-text" autoFocus value={t.title} onChange={(e) => patch(t.id, { title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && setEditing(null)} aria-label="Title" />
                          <Row>
                            <input className="k-text" type="date" style={{ width: 150 }} value={t.due} onChange={(e) => patch(t.id, { due: e.target.value })} aria-label="Due" />
                            <input className="k-text" style={{ width: 130 }} placeholder="Delegate to…" value={t.who} onChange={(e) => patch(t.id, { who: e.target.value })} aria-label="Delegate to" />
                            <Btn onClick={() => setEditing(null)}>Done</Btn>
                          </Row>
                        </>
                      ) : (
                        <div onDoubleClick={() => setEditing(t.id)} style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{t.title}</div>
                      )}
                      <div style={{ fontSize: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {t.due && <span style={{ color: late ? 'var(--err)' : near ? 'var(--warn)' : 'var(--muted)', fontWeight: late || near ? 700 : 400 }}>{late ? '⚠ overdue ' : '📅 '}{t.due}</span>}
                        {t.who && <span className="muted">→ {t.who}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 2 }}>
                      {QS.filter((o) => o.id !== q.id).map((o) => (
                        <button key={o.id} type="button" title={`Move to ${o.title}`} onClick={() => move(t.id, o.id)}
                          style={{ width: 14, height: 14, borderRadius: 3, border: 0, background: o.color, opacity: 0.55, cursor: 'pointer', padding: 0 }} />
                      ))}
                      <button type="button" title="Edit" onClick={() => setEditing(editing === t.id ? null : t.id)} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0 2px' }}>✎</button>
                      <button type="button" title="Delete" onClick={() => set({ tasks: s.tasks.filter((x) => x.id !== t.id) })} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0 2px' }}>✕</button>
                    </div>
                  </div>
                )
              })}
              {!list.length && <div className="muted" style={{ textAlign: 'center', padding: 20, border: '1px dashed var(--line)', borderRadius: 8 }}>Drop tasks here</div>}
            </section>
          )
        })}
      </div>
      <Split>
        <Panel title={`Completed (${s.archive.length})`} actions={s.archive.length > 0 && <Btn kind="ghost" onClick={() => set({ archive: [] })}>Clear archive</Btn>}>
          {s.archive.length ? (
            <Table max={10} head={['Task', 'Quadrant', 'Done', '']} rows={s.archive.map((t) => [
              <span key="t" style={{ textDecoration: 'line-through' }}>{t.title}</span>,
              <span key="q" style={{ color: qOf(t.q).color, fontWeight: 600 }}>{qOf(t.q).title}</span>,
              t.done ?? '',
              <Btn key="r" kind="ghost" onClick={() => set({ archive: s.archive.filter((x) => x.id !== t.id), tasks: [...s.tasks, { ...t, done: undefined }] })}>↺ Restore</Btn>,
            ])} />
          ) : <p className="muted">Tick a task to move it here.</p>}
        </Panel>
        <Panel title="Export & settings">
          <Row>
            <CopyButton text={asMd} label="Copy as Markdown" />
            <CsvButton name="eisenhower.csv" rows={() => [['Task', 'Quadrant', 'Due', 'Delegate to', 'Completed'], ...[...s.tasks, ...s.archive].map((t) => [t.title, qOf(t.q).title, t.due, t.who, t.done ?? ''])]} />
            <JsonButtons name="eisenhower.json" data={s} onLoad={(d) => set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset sample</Btn>
          </Row>
          <label className="k-field"><span className="k-label">Warn when non-urgent tasks are due within <b>{s.soonDays}</b> days</span>
            <input type="range" min={0} max={14} value={s.soonDays} onChange={(e) => set({ soonDays: Number(e.target.value) })} />
          </label>
          <p className="muted">Drag tasks between quadrants or onto another task to reorder. On touch screens use the coloured squares to move a task. Double-click a title to edit.</p>
        </Panel>
      </Split>
    </div>
  )
}
