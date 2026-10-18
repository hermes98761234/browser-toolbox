import { useCallback, useEffect, useRef, useState } from 'react'
import { Bar, Btn, CopyButton, download, Note, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, today, uid, useToolState } from '../kit'
import { addDays, bucket, BUCKETS, clock, KIND_ICON, matches, parseAction, parseEntry, toIcs, toMarkdown, type Action, type Item, type Kind, type Meeting } from './lib/meeting-notes-template'

// ---------- tiny IndexedDB store for meeting history ----------
const DBN = 'bt-meeting-notes', STORE = 'meetings'
let mem: Record<string, Meeting> | null = null // fallback when IndexedDB is unavailable (private mode)
function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no idb'))
    const r = indexedDB.open(DBN, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((res, rej) => {
    const q = fn(db.transaction(STORE, mode).objectStore(STORE))
    q.onsuccess = () => res(q.result)
    q.onerror = () => rej(q.error)
  })
}
const store = {
  all: async (): Promise<Meeting[]> => { try { return await tx('readonly', (s) => s.getAll() as IDBRequest<Meeting[]>) } catch { return Object.values(mem ?? {}) } },
  put: async (m: Meeting) => { try { await tx('readwrite', (s) => s.put(m)) } catch { (mem ??= {})[m.id] = m } },
  del: async (id: string) => { try { await tx('readwrite', (s) => s.delete(id)) } catch { if (mem) delete mem[id] } },
}

// ---------- sample data ----------
const T = today()
const items = (rows: [string, number][]): Item[] => rows.map(([title, minutes], i) => ({ id: `i${i}`, title, minutes, spent: 0 }))
const mkAction = (id: string, text: string, ref: string, done = false): Action => ({ id, ...parseAction(text, ref), done })
const PAST: Meeting[] = [
  {
    id: 'past1', title: 'Website relaunch kickoff', date: addDays(T, -9), attendees: 'Mia, Olek, Priya, Sam', ended: true,
    items: items([['Goals & scope', 15], ['Timeline', 10], ['Risks', 10]]).map((i) => ({ ...i, spent: i.minutes * 60 + 40 })),
    entries: [
      { id: 'p1', at: 0, item: 'i0', kind: 'decision', text: 'Launch with the blog and pricing pages only' },
      { id: 'p2', at: 0, item: 'i1', kind: 'note', text: 'Design freeze needs to happen two weeks before launch' },
      { id: 'p3', at: 0, item: 'i2', kind: 'question', text: 'Do we need a cookie banner rework?' },
    ],
    actions: [mkAction('pa1', 'draft sitemap @priya by ' + addDays(T, -4), addDays(T, -9)), mkAction('pa2', 'collect analytics baseline @sam in 3 days', addDays(T, -9), true), mkAction('pa3', 'legal review of cookie text @olek ' + addDays(T, 5), addDays(T, -9))],
  },
  {
    id: 'past2', title: 'Weekly ops sync', date: addDays(T, -3), attendees: 'Mia, Sam, Lee', ended: true,
    items: items([['Incidents', 10], ['On-call', 5]]).map((i) => ({ ...i, spent: i.minutes * 60 - 30 })),
    entries: [{ id: 'q1', at: 0, item: 'i0', kind: 'note', text: 'Two minor incidents, both resolved within SLA' }],
    actions: [mkAction('qa1', 'write postmortem for the DNS blip @lee tomorrow', addDays(T, -3)), mkAction('qa2', 'rotate on-call calendar @mia', addDays(T, -3))],
  },
]
const CUR: Meeting = {
  id: 'cur', title: 'Product sync', date: T, attendees: 'Mia, Olek, Priya, Sam',
  items: items([['Review open actions', 5], ['Q4 roadmap', 15], ['Hiring', 10], ['Any other business', 5]]).map((it, i) => ({ ...it, spent: [342, 265, 0, 0][i] })),
  entries: [
    { id: 'c1', at: 130, item: 'i0', kind: 'note', text: 'Sitemap draft is late; Priya needs input from sales' },
    { id: 'c2', at: 420, item: 'i1', kind: 'decision', text: 'Mobile app work moves to Q1' },
    { id: 'c3', at: 488, item: 'i1', kind: 'action', text: 'share updated roadmap slides @olek by Friday' },
    { id: 'c4', at: 590, item: 'i1', kind: 'question', text: 'Can we reuse the design system for the partner portal?' },
  ],
  actions: [mkAction('c3', 'share updated roadmap slides @olek by Friday', T)],
}
interface Clock { running: boolean; since: number; cur: number }
const DEF = { m: CUR, clock: { running: false, since: 0, cur: 1 } as Clock, seeded: false, view: 'notes' as 'notes' | 'board' | 'history' }
const KINDS: [Kind, string][] = [['note', 'Note'], ['action', 'Action'], ['decision', 'Decision'], ['question', 'Question']]

export default function MeetingNotesTemplate() {
  const [s, set, reset] = useToolState('meeting-notes-template', DEF)
  const [now, setNow] = useState(() => Date.now())
  const [kind, setKind] = useState<Kind>('note')
  const [line, setLine] = useState('')
  const [hist, setHist] = useState<Meeting[]>([])
  const [q, setQ] = useState('')
  const [peek, setPeek] = useState('')
  const [owner, setOwner] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const m = s.m
  const c = s.clock

  const reload = useCallback(() => { void store.all().then((all) => setHist(all.sort((a, b) => b.date.localeCompare(a.date)))) }, [])
  useEffect(() => {
    void (async () => {
      if (!s.seeded) {
        if (!(await store.all()).length) for (const p of PAST) await store.put(p)
        set({ seeded: true })
      }
      reload()
    })()
  }, [s.seeded, set, reload])
  useEffect(() => {
    if (!c.running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [c.running])

  const setM = (p: Partial<Meeting> | ((mm: Meeting) => Meeting)) => set((st) => ({ ...st, m: typeof p === 'function' ? p(st.m) : { ...st.m, ...p } }))
  const live = (i: number) => m.items[i].spent + (c.running && i === c.cur ? Math.max(0, now - c.since) / 1000 : 0)
  const totalSpent = m.items.reduce((a, _, i) => a + live(i), 0)
  const planned = m.items.reduce((a, i) => a + i.minutes * 60, 0)
  // commit running time into the current item, then apply a clock change
  const bank = (next: Partial<Clock>) => set((st) => {
    const t = Date.now()
    const its = st.clock.running ? st.m.items.map((it, i) => (i === st.clock.cur ? { ...it, spent: it.spent + (t - st.clock.since) / 1000 } : it)) : st.m.items
    return { ...st, m: { ...st.m, items: its }, clock: { ...st.clock, ...next, since: t } }
  })
  const goto = (i: number) => bank({ cur: Math.max(0, Math.min(m.items.length - 1, i)) })

  const capture = () => {
    const raw = line.trim()
    if (!raw) return
    const p = /^\s*[adqn]\s*[:)]/i.test(raw) || /^\s*(\[\s?\]|todo\b)/i.test(raw) ? parseEntry(raw) : { kind, text: raw }
    const id = uid()
    const item = m.items[c.cur]?.id ?? ''
    setM((mm) => ({
      ...mm,
      entries: [...mm.entries, { id, at: Math.round(totalSpent), item, kind: p.kind, text: p.text }],
      actions: p.kind === 'action' ? [...mm.actions, { id, ...parseAction(p.text, mm.date), done: false }] : mm.actions,
    }))
    setLine('')
    setKind('note')
  }
  const endMeeting = async () => {
    bank({ running: false })
    const t = Date.now()
    const its = c.running ? m.items.map((it, i) => (i === c.cur ? { ...it, spent: it.spent + (t - c.since) / 1000 } : it)) : m.items
    await store.put({ ...m, items: its, id: m.id === 'cur' ? uid() : m.id, ended: true })
    set((st) => ({ ...st, m: { id: uid(), title: st.m.title, date: T, attendees: st.m.attendees, items: st.m.items.map((i) => ({ ...i, spent: 0 })), entries: [], actions: [] }, clock: { running: false, since: 0, cur: 0 } }))
    reload()
  }

  // open-actions board: history + current meeting
  type BoardAction = Action & { meeting: string; mid: string }
  const boardAll: BoardAction[] = [
    ...m.actions.map((a) => ({ ...a, meeting: `${m.title} (current)`, mid: '' })),
    ...hist.filter((h) => h.id !== m.id).flatMap((h) => h.actions.map((a) => ({ ...a, meeting: `${h.title} · ${h.date}`, mid: h.id }))),
  ]
  const owners = [...new Set(boardAll.map((a) => a.owner).filter(Boolean))].sort()
  const board = boardAll.filter((a) => !a.done && (!owner || a.owner === owner))
  const toggle = async (a: BoardAction) => {
    if (!a.mid) return setM((mm) => ({ ...mm, actions: mm.actions.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)) }))
    const h = hist.find((x) => x.id === a.mid)
    if (h) { await store.put({ ...h, actions: h.actions.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)) }); reload() }
  }
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const cur = m.items[c.cur]
  const curLeft = cur ? cur.minutes * 60 - live(c.cur) : 0
  const md = toMarkdown(m)
  const peeked = hist.find((h) => h.id === peek)

  return (
    <Split wide="right">
      <div>
        <Panel title="Meeting">
          <Txt label="Title" value={m.title} onChange={(title) => setM({ title })} />
          <Row>
            <Txt label="Date" type="date" value={m.date} onChange={(date) => date && setM({ date })} />
            <Txt label="Attendees" value={m.attendees} onChange={(attendees) => setM({ attendees })} placeholder="Mia, Olek, …" />
          </Row>
        </Panel>
        <Panel title="Agenda & timeboxes" actions={<Btn onClick={() => setM({ items: [...m.items, { id: uid(), title: 'New topic', minutes: 5, spent: 0 }] })}>+ Item</Btn>}>
          {m.items.map((it, i) => {
            const sp = live(i)
            const over = sp > it.minutes * 60
            return (
              <div key={it.id} style={{ padding: '6px 8px', borderRadius: 8, marginBottom: 6, border: `1px solid ${i === c.cur ? 'var(--accent)' : 'var(--line)'}` }}>
                <Row wrap={false}>
                  <input value={it.title} onChange={(e) => setM((mm) => ({ ...mm, items: mm.items.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x)) }))} aria-label="Agenda item" style={{ flex: 1, minWidth: 0 }} />
                  <input type="number" min={1} value={it.minutes} onChange={(e) => setM((mm) => ({ ...mm, items: mm.items.map((x) => (x.id === it.id ? { ...x, minutes: Math.max(1, Number(e.target.value) || 1) } : x)) }))} aria-label="Minutes" style={{ width: 56 }} />
                  <span className="muted" style={{ fontSize: 12 }}>min</span>
                  <Btn kind="ghost" onClick={() => goto(i)} title="Make current">▶</Btn>
                  <Btn kind="ghost" onClick={() => { setM((mm) => ({ ...mm, items: mm.items.filter((x) => x.id !== it.id) })); if (c.cur >= m.items.length - 1) set((st) => ({ ...st, clock: { ...st.clock, cur: Math.max(0, st.m.items.length - 1) } })) }} title="Remove">✕</Btn>
                </Row>
                <Bar value={sp} max={it.minutes * 60} color={over ? 'var(--err)' : i === c.cur ? 'var(--accent)' : 'var(--ok)'} />
                <div className="muted" style={{ fontSize: 11 }}>{clock(sp)} / {it.minutes}:00{over && <b style={{ color: 'var(--err)' }}> · over by {clock(sp - it.minutes * 60)}</b>}</div>
              </div>
            )
          })}
        </Panel>
        <Panel title="Export">
          <Row>
            <CopyButton text={md} label="Copy Markdown" />
            <Btn onClick={() => download(`${(m.title || 'meeting').replace(/\W+/g, '-')}-${m.date}.md`, md, 'text/markdown')}>⬇ .md</Btn>
            <Btn disabled={!m.actions.some((a) => a.due)} onClick={() => download('meeting-actions.ics', toIcs(m.actions.map((a) => ({ ...a, meeting: m.title })), stamp), 'text/calendar')}>📅 Actions .ics</Btn>
          </Row>
          <Row>
            <Btn onClick={() => download('meeting-history.json', JSON.stringify({ format: 'bt-meeting-notes', meetings: hist }, null, 2), 'application/json')}>⬇ Backup history</Btn>
            <label className="k-btn">⬆ Restore<input type="file" accept=".json" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = ''
              if (!f) return
              try { const d = JSON.parse(await f.text()) as { meetings?: Meeting[] }; for (const x of d.meetings ?? []) if (x && x.id && Array.isArray(x.actions)) await store.put(x); reload() } catch { /* ignore bad file */ }
            }} /></label>
            <Btn kind="ghost" onClick={reset}>Reset draft</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label={cur ? `Now: ${cur.title}` : 'No agenda'} value={cur ? clock(curLeft) : '—'} sub={curLeft < 0 ? 'over time — wrap up' : 'left in this timebox'} tone={curLeft < 0 ? 'bad' : 'accent'} />
          <Stat label="Meeting clock" value={clock(totalSpent)} sub={`of ${Math.round(planned / 60)} min planned`} tone={totalSpent > planned ? 'bad' : undefined} />
          <Stat label="Actions" value={m.actions.filter((a) => !a.done).length} sub={`${m.actions.filter((a) => !a.owner).length} without owner`} />
          <Stat label="Open across meetings" value={boardAll.filter((a) => !a.done).length} sub={`${boardAll.filter((a) => !a.done && bucket(a.due, T) === 'overdue').length} overdue`} />
        </Stats>
        <Panel title="Live notes" actions={<>
          <Btn kind={c.running ? 'danger' : 'primary'} onClick={() => bank({ running: !c.running })}>{c.running ? '⏸ Pause' : totalSpent > 0 ? '▶ Resume' : '▶ Start meeting'}</Btn>
          <Btn onClick={() => goto(c.cur + 1)} disabled={c.cur >= m.items.length - 1}>Next item ⏭</Btn>
          <Btn kind="ghost" onClick={() => void endMeeting()}>End & save</Btn>
        </>}>
          <Seg value={s.view} onChange={(view) => set({ view })} options={[['notes', '📝 Notes'], ['board', '☐ Open actions'], ['history', '🗂 History']]} />
          {s.view === 'notes' && (
            <>
              <div style={{ display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap' }}>
                <Seg value={kind} onChange={setKind} options={KINDS} />
                <input
                  ref={input}
                  className="k-text"
                  style={{ flex: 1, minWidth: 220 }}
                  value={line}
                  placeholder={`Type and press Enter · prefixes A: D: Q: · @owner, "by fri"`}
                  onChange={(e) => setLine(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); capture() }
                    if ((e.ctrlKey || e.metaKey) && /^[1-4]$/.test(e.key)) { e.preventDefault(); setKind(KINDS[Number(e.key) - 1][0]) }
                    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goto(c.cur + 1) }
                  }}
                  aria-label="Quick capture"
                />
                <Btn kind="primary" onClick={capture} disabled={!line.trim()}>Add</Btn>
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Shortcuts: <b>A:</b> action · <b>D:</b> decision · <b>Q:</b> question · Ctrl+1–4 switch type · Alt+→ next agenda item. Actions pick up <b>@owner</b> and dates like “fri”, “tomorrow”, “next week”, “in 3 days”, “Nov 3”.</p>
              {m.items.map((it, i) => {
                const es = m.entries.filter((e) => e.item === it.id)
                if (!es.length && i !== c.cur) return null
                return (
                  <div key={it.id} style={{ marginBottom: 10 }}>
                    <h4 style={{ margin: '8px 0 4px' }}>{i === c.cur ? '▶ ' : ''}{it.title}</h4>
                    {es.map((e) => (
                      <div key={e.id} style={{ display: 'flex', gap: 8, padding: '3px 0', alignItems: 'baseline' }}>
                        <span style={{ width: 18, textAlign: 'center', fontWeight: 800, color: e.kind === 'action' ? 'var(--accent)' : e.kind === 'decision' ? 'var(--ok)' : e.kind === 'question' ? 'var(--warn)' : 'var(--muted)' }}>{KIND_ICON[e.kind]}</span>
                        <span className="muted" style={{ fontSize: 11, minWidth: 38 }}>{clock(e.at)}</span>
                        <span style={{ flex: 1 }}>{e.text}</span>
                        <Btn kind="ghost" onClick={() => setM((mm) => ({ ...mm, entries: mm.entries.filter((x) => x.id !== e.id), actions: mm.actions.filter((x) => x.id !== e.id) }))} title="Remove">✕</Btn>
                      </div>
                    ))}
                    {!es.length && <div className="muted" style={{ fontSize: 13 }}>Nothing captured yet.</div>}
                  </div>
                )
              })}
              <h4 style={{ margin: '14px 0 4px' }}>Action items</h4>
              {m.actions.length ? (
                <Table head={['', 'Task', 'Owner', 'Due', '']} rows={m.actions.map((a) => [
                  <input key="d" type="checkbox" checked={a.done} onChange={() => setM((mm) => ({ ...mm, actions: mm.actions.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)) }))} aria-label="Done" />,
                  <input key="t" value={a.task} onChange={(e) => setM((mm) => ({ ...mm, actions: mm.actions.map((x) => (x.id === a.id ? { ...x, task: e.target.value } : x)) }))} aria-label="Task" style={{ minWidth: 160, textDecoration: a.done ? 'line-through' : undefined }} />,
                  <input key="o" value={a.owner} placeholder="owner" onChange={(e) => setM((mm) => ({ ...mm, actions: mm.actions.map((x) => (x.id === a.id ? { ...x, owner: e.target.value.replace(/^@/, '') } : x)) }))} aria-label="Owner" style={{ width: 80 }} />,
                  <input key="u" type="date" value={a.due} onChange={(e) => setM((mm) => ({ ...mm, actions: mm.actions.map((x) => (x.id === a.id ? { ...x, due: e.target.value } : x)) }))} aria-label="Due" />,
                  <Btn key="x" kind="ghost" onClick={() => setM((mm) => ({ ...mm, actions: mm.actions.filter((x) => x.id !== a.id) }))} title="Remove">✕</Btn>,
                ])} />
              ) : <Note>Capture a line starting with “A:” to create an action item.</Note>}
            </>
          )}
          {s.view === 'board' && (
            <>
              <Row>
                <Select label="Owner" value={owner} onChange={setOwner} options={[['', 'Everyone'], ...owners.map((o) => [o, `@${o}`] as [string, string])]} />
                <Btn onClick={() => download('open-actions.ics', toIcs(board, stamp), 'text/calendar')} disabled={!board.some((a) => a.due)}>📅 Export .ics</Btn>
                <CopyButton text={() => board.map((a) => `- [ ] ${a.task}${a.owner ? ` — @${a.owner}` : ''}${a.due ? ` (due ${a.due})` : ''} · ${a.meeting}`).join('\n')} label="Copy as Markdown" />
              </Row>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 10 }}>
                {BUCKETS.map(([b, name]) => {
                  const list = board.filter((a) => bucket(a.due, T) === b).sort((x, y) => x.due.localeCompare(y.due))
                  return (
                    <div key={b} style={{ background: 'var(--line)', borderRadius: 10, padding: 8, minHeight: 80 }}>
                      <b style={{ color: b === 'overdue' && list.length ? 'var(--err)' : undefined }}>{name} <span className="muted">{list.length}</span></b>
                      {list.map((a) => (
                        <div key={a.mid + a.id} style={{ background: 'var(--panel)', borderRadius: 8, padding: 8, marginTop: 6, fontSize: 13 }}>
                          <label style={{ display: 'flex', gap: 6 }}><input type="checkbox" checked={a.done} onChange={() => void toggle(a)} /> <span>{a.task}</span></label>
                          <div className="muted" style={{ fontSize: 11 }}>{a.owner ? `@${a.owner}` : 'no owner'}{a.due ? ` · ${a.due}` : ''}</div>
                          <div className="muted" style={{ fontSize: 11 }}>{a.meeting}</div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </>
          )}
          {s.view === 'history' && (
            <>
              <Txt label="Search meetings, notes and actions" value={q} onChange={setQ} placeholder="e.g. roadmap @mia" />
              <Table head={['Date', 'Meeting', 'Open actions', '']} rows={hist.filter((h) => matches(h, q)).map((h) => [
                h.date,
                <a key="t" href="#" onClick={(e) => { e.preventDefault(); setPeek(peek === h.id ? '' : h.id) }}>{h.title}</a>,
                h.actions.filter((a) => !a.done).length,
                <span key="x" style={{ whiteSpace: 'nowrap' }}>
                  <Btn kind="ghost" onClick={() => { set({ m: h, clock: { running: false, since: 0, cur: 0 }, view: 'notes' }) }} title="Load into the editor">Open</Btn>
                  <Btn kind="ghost" onClick={() => void store.del(h.id).then(reload)} title="Delete">✕</Btn>
                </span>,
              ])} />
              {peeked && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, background: 'var(--line)', padding: 10, borderRadius: 8 }}>{toMarkdown(peeked)}</pre>}
              <p className="muted" style={{ fontSize: 12 }}>History lives in this browser's IndexedDB. “End & save” stores the current meeting and starts a fresh one with the same agenda.</p>
            </>
          )}
        </Panel>
        <Panel title="Timebox overview">
          <Table
            head={['Agenda item', 'Planned', 'Used', 'Δ']}
            rows={m.items.map((it, i) => {
              const d = live(i) - it.minutes * 60
              return [it.title, `${it.minutes} min`, clock(live(i)), <span key="d" style={{ color: d > 0 ? 'var(--err)' : 'var(--ok)' }}>{d > 0 ? '+' : ''}{clock(d)}</span>]
            })}
            foot={['Total', `${Math.round(planned / 60)} min`, clock(totalSpent), clock(totalSpent - planned)]}
          />
        </Panel>
      </div>
    </Split>
  )
}
