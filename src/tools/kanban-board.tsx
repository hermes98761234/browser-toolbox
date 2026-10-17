import { useState } from 'react'
import { Btn, CsvButton, JsonButtons, Panel, Row, Stat, Stats, uid, useToolState } from '../kit'
import { dueState, matches, moveCard, type Card, type DueState } from './lib/kanban-board'

interface Column { id: string; name: string; wip: number }
interface Label { id: string; name: string; color: string }
interface Board { title: string; columns: Column[]; labels: Label[]; cards: Card[] }

const localDay = (offset = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const LABEL_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#64748b']
const DUE: Record<DueState, [string, string]> = { none: ['', ''], overdue: ['#ef4444', 'Overdue'], today: ['#f59e0b', 'Today'], soon: ['#eab308', 'Soon'], later: ['var(--muted)', ''] }

const c = (id: string, col: string, title: string, labels: string[], due: number | null, desc = ''): Card => ({ id, col, title, desc, labels, due: due === null ? '' : localDay(due), created: localDay(-5) })
const DEF: Board = {
  title: 'Personal projects',
  columns: [
    { id: 'backlog', name: 'Backlog', wip: 0 },
    { id: 'todo', name: 'To do', wip: 0 },
    { id: 'doing', name: 'In progress', wip: 3 },
    { id: 'done', name: 'Done', wip: 0 },
  ],
  labels: [
    { id: 'home', name: 'Home', color: LABEL_COLORS[2] },
    { id: 'work', name: 'Work', color: LABEL_COLORS[4] },
    { id: 'urgent', name: 'Urgent', color: LABEL_COLORS[0] },
    { id: 'idea', name: 'Idea', color: LABEL_COLORS[5] },
    { id: 'money', name: 'Money', color: LABEL_COLORS[1] },
  ],
  cards: [
    c('k1', 'backlog', 'Learn basic Spanish phrases', ['idea'], null, 'Before the trip in spring. 10 min a day.'),
    c('k2', 'backlog', 'Plan garden beds for next year', ['home', 'idea'], 40),
    c('k3', 'backlog', 'Research standing desks', ['work'], null),
    c('k4', 'todo', 'Renew car insurance', ['money', 'urgent'], 2, 'Compare at least three quotes.'),
    c('k5', 'todo', 'Book dentist appointment', ['home'], 9),
    c('k6', 'todo', 'Prepare quarterly report slides', ['work'], 5),
    c('k7', 'doing', 'Fix leaking kitchen tap', ['home', 'urgent'], -1, 'Washer size 1/2". Buy at hardware store.'),
    c('k8', 'doing', 'Write blog post about kanban', ['work', 'idea'], 0),
    c('k9', 'done', 'File tax return', ['money'], -12),
    c('k10', 'done', 'Clean out the garage', ['home'], -3),
  ],
}

export default function KanbanBoard() {
  const [b, set, reset] = useToolState('kanban-board', DEF)
  const [q, setQ] = useState('')
  const [only, setOnly] = useState('')
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<{ col: string; i: number } | null>(null)
  const [edit, setEdit] = useState<string | null>(null)
  const today = localDay()
  const labelNames = Object.fromEntries(b.labels.map((l) => [l.id, l.name]))
  const visible = (k: Card) => matches(k, q, labelNames) && (!only || k.labels.includes(only))
  const editing = b.cards.find((k) => k.id === edit)
  const doneCol = b.columns[b.columns.length - 1]?.id
  const overdue = b.cards.filter((k) => k.col !== doneCol && dueState(k.due, today) === 'overdue').length

  const patchCard = (id: string, p: Partial<Card>) => set({ cards: b.cards.map((k) => (k.id === id ? { ...k, ...p } : k)) })
  const addCard = (col: string) => {
    const id = uid()
    set({ cards: [...b.cards, { id, col, title: 'New card', desc: '', labels: [], due: '', created: today }] })
    setEdit(id)
  }
  const drop = () => {
    if (drag && over) set({ cards: moveCard(b.cards, drag, over.col, over.i) })
    setDrag(null)
    setOver(null)
  }
  const shift = (k: Card, dir: -1 | 1) => {
    const i = b.columns.findIndex((x) => x.id === k.col)
    const to = b.columns[i + dir]
    if (to) set({ cards: moveCard(b.cards, k.id, to.id, 0) })
  }
  const onListOver = (e: React.DragEvent<HTMLDivElement>, col: string) => {
    e.preventDefault()
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-card]')].filter((el) => el.dataset.card !== drag)
    let i = items.length
    for (let j = 0; j < items.length; j++) {
      const r = items[j].getBoundingClientRect()
      if (e.clientY < r.top + r.height / 2) {
        i = j
        break
      }
    }
    // indexes are among all column cards (hidden ones included): map from visible list
    const ids = b.cards.filter((k) => k.col === col && k.id !== drag).map((k) => k.id)
    const idx = i < items.length ? ids.indexOf(items[i].dataset.card!) : ids.length
    if (!over || over.col !== col || over.i !== idx) setOver({ col, i: idx })
  }

  return (
    <div>
      <Panel
        title={<input className="k-text" value={b.title} onChange={(e) => set({ title: e.target.value })} aria-label="Board title" style={{ fontWeight: 700, fontSize: 16, maxWidth: 320 }} />}
        actions={
          <>
            <Btn onClick={() => set({ columns: [...b.columns, { id: uid(), name: 'New column', wip: 0 }] })}>+ Column</Btn>
            <CsvButton name="kanban.csv" rows={() => [['Column', 'Title', 'Labels', 'Due', 'Description'], ...b.cards.map((k) => [b.columns.find((x) => x.id === k.col)?.name ?? '', k.title, k.labels.map((l) => labelNames[l]).join('; '), k.due, k.desc])]} />
            <JsonButtons name="kanban-board.json" data={b} onLoad={(d) => d && Array.isArray(d.columns) && Array.isArray(d.cards) && set({ ...DEF, ...d })} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </>
        }
      >
        <Row>
          <input className="k-text" placeholder="🔍 Search cards…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 260 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {b.labels.map((l) => (
              <button key={l.id} type="button" onClick={() => setOnly(only === l.id ? '' : l.id)} style={{ border: `2px solid ${l.color}`, background: only === l.id ? l.color : 'transparent', color: only === l.id ? '#fff' : 'var(--fg)', borderRadius: 999, padding: '3px 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {l.name}
              </button>
            ))}
          </div>
        </Row>
        <Stats>
          <Stat label="Cards" value={b.cards.length} />
          {b.columns.slice(1, -1).map((col) => <Stat key={col.id} label={col.name} value={b.cards.filter((k) => k.col === col.id).length} />)}
          <Stat label="Overdue" value={overdue} tone={overdue ? 'bad' : 'good'} />
          <Stat label={b.columns[b.columns.length - 1]?.name ?? 'Done'} value={`${Math.round((b.cards.filter((k) => k.col === doneCol).length / (b.cards.length || 1)) * 100)}%`} sub="of all cards" />
        </Stats>
      </Panel>

      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
        {b.columns.map((col, ci) => {
          const cards = b.cards.filter((k) => k.col === col.id)
          const shown = cards.filter(visible)
          const overWip = col.wip > 0 && cards.length > col.wip
          return (
            <section key={col.id} className="k-panel" style={{ flex: '1 0 260px', maxWidth: 380, margin: 0, padding: 10, background: overWip ? 'color-mix(in srgb, var(--err) 8%, var(--panel))' : undefined }}>
              <Row wrap={false}>
                <input className="k-text" value={col.name} onChange={(e) => set({ columns: b.columns.map((x) => (x.id === col.id ? { ...x, name: e.target.value } : x)) })} aria-label="Column name" style={{ fontWeight: 700, padding: '4px 8px' }} />
                <span title="Cards / WIP limit" style={{ whiteSpace: 'nowrap', fontWeight: 700, color: overWip ? 'var(--err)' : 'var(--muted)' }}>{cards.length}{col.wip ? `/${col.wip}` : ''}</span>
              </Row>
              <div
                onDragOver={(e) => onListOver(e, col.id)}
                onDrop={(e) => { e.preventDefault(); drop() }}
                style={{ minHeight: 60, display: 'grid', gap: 8, margin: '8px 0', padding: 2, borderRadius: 8, outline: over?.col === col.id ? '2px dashed var(--accent)' : undefined }}
              >
                {shown.map((k) => {
                  const ds = col.id === doneCol ? 'none' : dueState(k.due, today)
                  const idxAll = cards.filter((x) => x.id !== drag).findIndex((x) => x.id === k.id)
                  return (
                    <div key={k.id}>
                      {over?.col === col.id && over.i === idxAll && drag !== k.id && <div style={{ height: 4, background: 'var(--accent)', borderRadius: 2, marginBottom: 6 }} />}
                      <article
                        data-card={k.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k.id); setDrag(k.id) }}
                        onDragEnd={() => { setDrag(null); setOver(null) }}
                        onClick={() => setEdit(k.id)}
                        style={{ background: 'var(--bg)', border: '1px solid var(--line)', borderLeft: `4px solid ${b.labels.find((l) => l.id === k.labels[0])?.color ?? 'var(--line)'}`, borderRadius: 10, padding: '8px 10px', cursor: 'grab', opacity: drag === k.id ? 0.4 : 1, boxShadow: 'var(--shadow)' }}
                      >
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                          {k.labels.map((l) => { const lb = b.labels.find((x) => x.id === l); return lb ? <span key={l} style={{ background: lb.color, color: '#fff', borderRadius: 999, padding: '0 7px', fontSize: 11, fontWeight: 700 }}>{lb.name}</span> : null })}
                        </div>
                        <div style={{ fontWeight: 600, textDecoration: col.id === doneCol ? 'line-through' : undefined, opacity: col.id === doneCol ? 0.7 : 1 }}>{k.title}</div>
                        {k.desc && <div className="muted" style={{ fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.desc}</div>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12 }}>
                          {k.due && <span style={{ color: DUE[ds][0] || 'var(--muted)', fontWeight: ds === 'overdue' || ds === 'today' ? 700 : 500 }}>📅 {new Date(k.due + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{DUE[ds][1] ? ` · ${DUE[ds][1]}` : ''}</span>}
                          <span style={{ flex: 1 }} />
                          <button type="button" className="k-btn ghost" style={{ padding: '0 6px' }} disabled={ci === 0} onClick={(e) => { e.stopPropagation(); shift(k, -1) }} aria-label="Move left">←</button>
                          <button type="button" className="k-btn ghost" style={{ padding: '0 6px' }} disabled={ci === b.columns.length - 1} onClick={(e) => { e.stopPropagation(); shift(k, 1) }} aria-label="Move right">→</button>
                        </div>
                      </article>
                    </div>
                  )
                })}
                {over?.col === col.id && over.i >= cards.filter((x) => x.id !== drag).length && <div style={{ height: 4, background: 'var(--accent)', borderRadius: 2 }} />}
                {shown.length === 0 && <p className="muted" style={{ textAlign: 'center', fontSize: 13, margin: '14px 0' }}>{cards.length ? 'No matches' : 'Drop cards here'}</p>}
              </div>
              <Row wrap={false}>
                <Btn kind="ghost" onClick={() => addCard(col.id)}>+ Add card</Btn>
                <span style={{ flex: 1 }} />
                <label className="muted" style={{ fontSize: 12 }} title="Work-in-progress limit (0 = none)">WIP <input type="number" min={0} value={col.wip} onChange={(e) => set({ columns: b.columns.map((x) => (x.id === col.id ? { ...x, wip: Math.max(0, Number(e.target.value) || 0) } : x)) })} style={{ width: 44 }} /></label>
                <Btn kind="ghost" title="Delete column" disabled={b.columns.length < 2} onClick={() => { if (!cards.length || confirm(`Delete "${col.name}" and its ${cards.length} cards?`)) set({ columns: b.columns.filter((x) => x.id !== col.id), cards: b.cards.filter((k) => k.col !== col.id) }) }}>🗑</Btn>
              </Row>
            </section>
          )
        })}
      </div>

      {editing && (
        <div role="dialog" aria-modal="true" onClick={() => setEdit(null)} style={{ position: 'fixed', inset: 0, background: 'rgb(15 23 42 / .45)', zIndex: 50, display: 'grid', placeItems: 'center', padding: 16 }}>
          <div className="k-panel" onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 100%)', maxHeight: '90vh', overflow: 'auto', margin: 0 }}>
            <label className="k-field"><span className="k-label">Title</span><input className="k-text" autoFocus value={editing.title} onChange={(e) => patchCard(editing.id, { title: e.target.value })} /></label>
            <label className="k-field"><span className="k-label">Description</span><textarea className="k-area" rows={4} value={editing.desc} onChange={(e) => patchCard(editing.id, { desc: e.target.value })} /></label>
            <Row>
              <label className="k-field"><span className="k-label">Due date</span><input className="k-text" type="date" value={editing.due} onChange={(e) => patchCard(editing.id, { due: e.target.value })} /></label>
              <label className="k-field"><span className="k-label">Column</span>
                <select className="k-select" value={editing.col} onChange={(e) => set({ cards: moveCard(b.cards, editing.id, e.target.value, Infinity) })}>
                  {b.columns.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </label>
            </Row>
            <span className="k-label">Labels</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0 10px' }}>
              {b.labels.map((l) => {
                const on = editing.labels.includes(l.id)
                return <button key={l.id} type="button" onClick={() => patchCard(editing.id, { labels: on ? editing.labels.filter((x) => x !== l.id) : [...editing.labels, l.id] })} style={{ border: `2px solid ${l.color}`, background: on ? l.color : 'transparent', color: on ? '#fff' : 'var(--fg)', borderRadius: 999, padding: '3px 10px', fontSize: 13, cursor: 'pointer' }}>{on ? '✓ ' : ''}{l.name}</button>
              })}
              <button type="button" className="k-btn ghost" onClick={() => { const name = prompt('New label name'); if (name?.trim()) { const id = uid(); set({ labels: [...b.labels, { id, name: name.trim(), color: LABEL_COLORS[b.labels.length % LABEL_COLORS.length] }], cards: b.cards.map((k) => (k.id === editing.id ? { ...k, labels: [...k.labels, id] } : k)) }) } }}>+ Label</button>
            </div>
            <p className="muted" style={{ fontSize: 12 }}>Created {editing.created}</p>
            <Row>
              <Btn kind="primary" onClick={() => setEdit(null)}>Done</Btn>
              <Btn kind="danger" onClick={() => { set({ cards: b.cards.filter((k) => k.id !== editing.id) }); setEdit(null) }}>Delete card</Btn>
            </Row>
          </div>
        </div>
      )}
    </div>
  )
}
