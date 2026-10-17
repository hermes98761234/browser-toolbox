import { useState, type ReactNode } from 'react'
import { BarChart, Btn, CsvButton, JsonButtons, money, Note, pct, Row, Seg, Split, Stat, Stats, Panel, Table, uid, useToolState } from '../kit'
import { addDays, bucket, daysBetween, lastTouch, pipeline, PROB, relDay, STAGES, type Activity, type Contact, type Crm, type Deal, type FollowUp, type Stage } from './lib/mini-crm'

const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const T = localToday()
const D = (n: number) => addDays(T, n)

const DEF: Crm = {
  contacts: [
    { id: 'c1', name: 'Maya Chen', company: 'Northwind Foods', email: 'maya@northwind.example', phone: '+1 415 555 0134', tags: 'decision-maker, warm', created: D(-60) },
    { id: 'c2', name: 'Lukas Weber', company: 'Alpine Outfitters', email: 'lukas@alpine.example', phone: '+49 30 555 0199', tags: 'referral', created: D(-35) },
    { id: 'c3', name: 'Priya Nair', company: 'Brightpath Clinics', email: 'priya@brightpath.example', phone: '+44 20 5550 1187', tags: 'healthcare, enterprise', created: D(-20) },
    { id: 'c4', name: 'Diego Alvarez', company: 'Casa Verde Hotels', email: 'diego@casaverde.example', phone: '+34 91 555 0102', tags: 'hospitality', created: D(-90) },
    { id: 'c5', name: 'Sara Okafor', company: 'Lumen Studio', email: 'sara@lumen.example', phone: '+234 1 555 0150', tags: 'small-biz', created: D(-22) },
  ],
  deals: [
    { id: 'd1', contactId: 'c1', title: 'Annual POS licence', value: 18000, stage: 'Negotiation', close: D(12) },
    { id: 'd2', contactId: 'c2', title: 'Webshop redesign', value: 9500, stage: 'Proposal', close: D(25) },
    { id: 'd3', contactId: 'c3', title: 'Booking system pilot', value: 24000, stage: 'Qualified', close: D(45) },
    { id: 'd4', contactId: 'c4', title: 'Wi-Fi portal', value: 6200, stage: 'Won', close: D(-10) },
    { id: 'd5', contactId: 'c5', title: 'Brand starter pack', value: 2400, stage: 'Lead', close: D(30) },
    { id: 'd6', contactId: 'c4', title: 'Loyalty app', value: 15000, stage: 'Lost', close: D(-30) },
  ],
  activities: [
    { id: 'a1', contactId: 'c1', date: D(-14), kind: 'meeting', text: 'Demo with ops team. Liked offline mode.' },
    { id: 'a2', contactId: 'c1', date: D(-3), kind: 'email', text: 'Sent revised quote with 8% multi-year discount.' },
    { id: 'a3', contactId: 'c2', date: D(-6), kind: 'call', text: 'Scoping call: 40 products, Shopify migration.' },
    { id: 'a4', contactId: 'c3', date: D(-2), kind: 'note', text: 'Needs HIPAA-compliant hosting; check with legal.' },
    { id: 'a5', contactId: 'c4', date: D(-10), kind: 'note', text: 'Signed! Kick-off planned for next month.' },
  ],
  followUps: [
    { id: 'f1', contactId: 'c1', due: D(-1), text: 'Chase signature on licence', done: false },
    { id: 'f2', contactId: 'c2', due: D(0), text: 'Send proposal PDF', done: false },
    { id: 'f3', contactId: 'c3', due: D(4), text: 'Book pilot workshop', done: false },
    { id: 'f4', contactId: 'c5', due: D(15), text: 'Intro call', done: false },
    { id: 'f5', contactId: 'c4', due: D(-12), text: 'Send contract', done: true },
  ],
}

type View = 'dash' | 'contacts' | 'deals' | 'tasks'
const ICON: Record<Activity['kind'], string> = { note: '📝', call: '📞', email: '✉️', meeting: '🤝' }
const STAGE_COLOR: Record<Stage, string> = { Lead: '#64748b', Qualified: '#0ea5e9', Proposal: '#6366f1', Negotiation: '#f59e0b', Won: '#10b981', Lost: '#ef4444' }
const BUCKET: [ReturnType<typeof bucket>, string][] = [['overdue', 'Overdue'], ['today', 'Today'], ['week', 'Next 7 days'], ['later', 'Later'], ['done', 'Done']]
const inp = { width: '100%', minWidth: 0 } as const
const m0 = (x: number) => money(x, '$', 0)

const Tip = ({ children }: { children: ReactNode }) => (
  <div className="k-note" style={{ background: 'color-mix(in srgb, var(--accent2) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent2) 35%, transparent)' }}>{children}</div>
)
const Pill = ({ c, children }: { c: string; children: ReactNode }) => (
  <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 99, fontSize: 12, fontWeight: 700, color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>{children}</span>
)

export default function MiniCrm() {
  const [s, set, reset] = useToolState('mini-crm', DEF)
  const [view, setView] = useState<View>('dash')
  const [sel, setSel] = useState(s.contacts[0]?.id ?? '')
  const [q, setQ] = useState('')
  const [act, setAct] = useState<{ kind: Activity['kind']; text: string; date: string }>({ kind: 'note', text: '', date: T })
  const [fu, setFu] = useState({ text: '', due: D(3) })
  const [drag, setDrag] = useState('')

  const p = pipeline(s.deals)
  const who = (id: string) => s.contacts.find((c) => c.id === id)
  const open = s.followUps.filter((f) => !f.done)
  const overdue = open.filter((f) => bucket(f, T) === 'overdue')
  const editC = (id: string, patch: Partial<Contact>) => set({ contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  const editD = (id: string, patch: Partial<Deal>) => set({ deals: s.deals.map((d) => (d.id === id ? { ...d, ...patch } : d)) })
  const editF = (id: string, patch: Partial<FollowUp>) => set({ followUps: s.followUps.map((f) => (f.id === id ? { ...f, ...patch } : f)) })
  const cur = who(sel) ?? s.contacts[0]

  const addContact = () => {
    const c: Contact = { id: uid(), name: 'New contact', company: '', email: '', phone: '', tags: '', created: T }
    set({ contacts: [c, ...s.contacts] })
    setSel(c.id)
    setView('contacts')
  }
  const removeContact = (id: string) =>
    set({ contacts: s.contacts.filter((c) => c.id !== id), deals: s.deals.filter((d) => d.contactId !== id), activities: s.activities.filter((a) => a.contactId !== id), followUps: s.followUps.filter((f) => f.contactId !== id) })
  const addDeal = (contactId: string) => set({ deals: [...s.deals, { id: uid(), contactId, title: 'New deal', value: 1000, stage: 'Lead', close: D(30) }] })

  const fuRow = (f: FollowUp) => (
    <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
      <input type="checkbox" checked={f.done} onChange={(e) => editF(f.id, { done: e.target.checked })} aria-label="Done" />
      <div style={{ flex: 1, minWidth: 0, textDecoration: f.done ? 'line-through' : undefined, opacity: f.done ? 0.6 : 1 }}>
        <b>{f.text}</b>{' '}
        <button type="button" onClick={() => { setSel(f.contactId); setView('contacts') }} style={{ all: 'unset', cursor: 'pointer', color: 'var(--accent)' }}>{who(f.contactId)?.name ?? '—'}</button>
      </div>
      <span style={{ fontSize: 13, color: bucket(f, T) === 'overdue' ? 'var(--err)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{relDay(f.due, T)}</span>
      <Btn kind="ghost" title="Snooze 1 day" onClick={() => editF(f.id, { due: addDays(f.due < T ? T : f.due, 1) })}>⏰</Btn>
    </div>
  )

  const filtered = s.contacts.filter((c) => `${c.name} ${c.company} ${c.email} ${c.tags}`.toLowerCase().includes(q.toLowerCase()))
  const timeline = cur
    ? [
        ...s.activities.filter((a) => a.contactId === cur.id).map((a) => ({ date: a.date, icon: ICON[a.kind], text: a.text, id: a.id, kind: 'a' as const })),
        ...s.followUps.filter((f) => f.contactId === cur.id).map((f) => ({ date: f.due, icon: f.done ? '✅' : '⏳', text: `Follow-up: ${f.text}`, id: f.id, kind: 'f' as const })),
      ].sort((a, b) => b.date.localeCompare(a.date))
    : []

  return (
    <div>
      <Row>
        <Seg value={view} onChange={setView} options={[['dash', 'Dashboard'], ['contacts', `Contacts (${s.contacts.length})`], ['deals', 'Pipeline'], ['tasks', `Follow-ups${open.length ? ` (${open.length})` : ''}`]]} label="View" />
        <div style={{ flex: 1 }} />
        <Btn kind="primary" onClick={addContact}>+ Contact</Btn>
        <CsvButton name="contacts.csv" rows={() => [['Name', 'Company', 'Email', 'Phone', 'Tags', 'Created', 'Last touch'], ...s.contacts.map((c) => [c.name, c.company, c.email, c.phone, c.tags, c.created, lastTouch(c, s.activities)])]} />
        <JsonButtons name={`mini-crm-${T}.json`} data={s} onLoad={(d) => d && Array.isArray(d.contacts) && set({ contacts: d.contacts, deals: d.deals ?? [], activities: d.activities ?? [], followUps: d.followUps ?? [] })} />
        <Btn kind="ghost" onClick={() => confirm('Replace everything with the sample data?') && reset()}>Reset</Btn>
      </Row>
      <div style={{ height: 14 }} />

      {view === 'dash' && (
        <>
          <Stats>
            <Stat label="Open pipeline" value={m0(p.openValue)} sub={`${s.deals.filter((d) => PROB[d.stage] > 0 && PROB[d.stage] < 1).length} open deals`} />
            <Stat label="Weighted forecast" value={m0(p.weighted)} tone="accent" sub="value × stage probability" />
            <Stat label="Won" value={m0(p.wonValue)} tone="good" sub={`win rate ${pct(p.winRate, 0)}`} />
            <Stat label="Follow-ups due" value={open.filter((f) => f.due <= T).length} tone={overdue.length ? 'bad' : undefined} sub={overdue.length ? `${overdue.length} overdue` : 'nothing overdue'} />
          </Stats>
          <Split>
            <Panel title="Due now">
              {open.filter((f) => f.due <= D(7)).sort((a, b) => a.due.localeCompare(b.due)).map(fuRow)}
              {!open.some((f) => f.due <= D(7)) && <Note tone="ok">Nothing due this week. 🎉</Note>}
            </Panel>
            <div>
              <Panel title="Pipeline by stage">
                <BarChart bars={p.byStage.map((b) => ({ label: b.stage, value: b.value, color: STAGE_COLOR[b.stage] }))} fy={m0} height={220} />
              </Panel>
              <Panel title="Going cold">
                <Table
                  head={['Contact', 'Last touch', '']}
                  rows={s.contacts
                    .map((c) => [c, lastTouch(c, s.activities)] as const)
                    .filter(([, d]) => daysBetween(d, T) >= 14)
                    .sort((a, b) => a[1].localeCompare(b[1]))
                    .map(([c, d]) => [c.name, relDay(d, T), <Btn key="o" kind="ghost" onClick={() => { setSel(c.id); setView('contacts') }}>Open</Btn>])}
                />
                <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Contacts with no logged activity for 14+ days.</p>
              </Panel>
            </div>
          </Split>
        </>
      )}

      {view === 'contacts' && (
        <Split>
          <div className="k-panel">
            <input className="k-text" placeholder="Search name, company, tag…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
            {filtered.map((c) => {
              const due = s.followUps.filter((f) => f.contactId === c.id && !f.done && f.due <= T).length
              return (
                <button key={c.id} type="button" onClick={() => setSel(c.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', margin: '2px 0', borderRadius: 8, border: '1px solid', borderColor: c.id === cur?.id ? 'var(--accent)' : 'transparent', background: c.id === cur?.id ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
                  <b>{c.name}</b> {due > 0 && <Pill c="#ef4444">{due} due</Pill>}
                  <div className="muted" style={{ fontSize: 13 }}>{c.company || '—'}</div>
                </button>
              )
            })}
            {!filtered.length && <p className="muted">No contacts match.</p>}
          </div>
          {cur ? (
            <div>
              <Panel title={cur.name} actions={<Btn kind="danger" onClick={() => confirm(`Delete ${cur.name} with deals, activities and follow-ups?`) && removeContact(cur.id)}>Delete</Btn>}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  {(['name', 'company', 'email', 'phone', 'tags'] as const).map((k) => (
                    <label key={k} className="k-field">
                      <span className="k-label">{k[0].toUpperCase() + k.slice(1)}</span>
                      <input className="k-text" value={cur[k]} onChange={(e) => editC(cur.id, { [k]: e.target.value })} style={inp} />
                    </label>
                  ))}
                </div>
                <Row>
                  {cur.email && <a className="k-btn" href={`mailto:${cur.email}`}>✉️ Email</a>}
                  {cur.phone && <a className="k-btn" href={`tel:${cur.phone.replace(/\s/g, '')}`}>📞 Call</a>}
                  <span className="muted" style={{ fontSize: 13 }}>Added {relDay(cur.created, T)} · last touch {relDay(lastTouch(cur, s.activities), T)}</span>
                </Row>
              </Panel>
              <Panel title="Deals" actions={<Btn onClick={() => addDeal(cur.id)}>+ Deal</Btn>}>
                <Table
                  head={['Deal', 'Value', 'Stage', 'Close', '']}
                  rows={s.deals.filter((d) => d.contactId === cur.id).map((d) => [
                    <input key="t" value={d.title} onChange={(e) => editD(d.id, { title: e.target.value })} style={inp} aria-label="Deal title" />,
                    <input key="v" type="number" min={0} value={d.value} onChange={(e) => editD(d.id, { value: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 90 }} aria-label="Value" />,
                    <select key="s" value={d.stage} onChange={(e) => editD(d.id, { stage: e.target.value as Stage })} aria-label="Stage">{STAGES.map((x) => <option key={x}>{x}</option>)}</select>,
                    <input key="c" type="date" value={d.close} onChange={(e) => editD(d.id, { close: e.target.value })} aria-label="Close date" />,
                    <Btn key="x" kind="ghost" onClick={() => set({ deals: s.deals.filter((x) => x.id !== d.id) })} title="Remove">✕</Btn>,
                  ])}
                />
              </Panel>
              <Panel title="Timeline">
                <Row>
                  <select className="k-select" value={act.kind} onChange={(e) => setAct({ ...act, kind: e.target.value as Activity['kind'] })} aria-label="Activity type" style={{ width: 'auto' }}>
                    {(Object.keys(ICON) as Activity['kind'][]).map((k) => <option key={k} value={k}>{ICON[k]} {k}</option>)}
                  </select>
                  <input className="k-text" type="date" value={act.date} onChange={(e) => setAct({ ...act, date: e.target.value })} aria-label="Date" style={{ width: 'auto' }} />
                  <input className="k-text" placeholder="What happened?" value={act.text} onChange={(e) => setAct({ ...act, text: e.target.value })} style={{ flex: '1 1 200px' }} aria-label="Activity" />
                  <Btn kind="primary" disabled={!act.text.trim()} onClick={() => { set({ activities: [...s.activities, { id: uid(), contactId: cur.id, ...act, text: act.text.trim() }] }); setAct({ ...act, text: '' }) }}>Log</Btn>
                </Row>
                <Row>
                  <input className="k-text" type="date" value={fu.due} onChange={(e) => setFu({ ...fu, due: e.target.value })} aria-label="Follow-up date" style={{ width: 'auto' }} />
                  <input className="k-text" placeholder="Next step / reminder" value={fu.text} onChange={(e) => setFu({ ...fu, text: e.target.value })} style={{ flex: '1 1 200px' }} aria-label="Follow-up" />
                  <Btn disabled={!fu.text.trim()} onClick={() => { set({ followUps: [...s.followUps, { id: uid(), contactId: cur.id, due: fu.due, text: fu.text.trim(), done: false }] }); setFu({ ...fu, text: '' }) }}>+ Follow-up</Btn>
                </Row>
                <div style={{ borderLeft: '2px solid var(--line)', marginLeft: 10, paddingLeft: 16, marginTop: 12 }}>
                  {timeline.map((e) => (
                    <div key={e.id} style={{ position: 'relative', padding: '6px 0' }}>
                      <span style={{ position: 'absolute', left: -29, top: 4, background: 'var(--panel2)', fontSize: 16 }}>{e.icon}</span>
                      <div className="muted" style={{ fontSize: 12 }}>{e.date} · {relDay(e.date, T)}</div>
                      <div>{e.text} <button type="button" title="Delete" onClick={() => (e.kind === 'a' ? set({ activities: s.activities.filter((a) => a.id !== e.id) }) : set({ followUps: s.followUps.filter((f) => f.id !== e.id) }))} style={{ all: 'unset', cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}>✕</button></div>
                    </div>
                  ))}
                  {!timeline.length && <p className="muted">No activity yet. Log a call, email or meeting above.</p>}
                </div>
              </Panel>
            </div>
          ) : (
            <Tip>Add your first contact with <b>+ Contact</b>.</Tip>
          )}
        </Split>
      )}

      {view === 'deals' && (
        <>
          <Tip>Drag cards between columns to move deals through the pipeline. Weighted value uses the stage probability ({STAGES.map((x) => `${x} ${pct(PROB[x], 0)}`).join(', ')}).</Tip>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
            {STAGES.map((st) => {
              const ds = s.deals.filter((d) => d.stage === st)
              return (
                <div key={st} className="k-panel" style={{ marginTop: 0, minHeight: 160, borderTop: `3px solid ${STAGE_COLOR[st]}` }} onDragOver={(e) => e.preventDefault()} onDrop={() => drag && editD(drag, { stage: st })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <b>{st}</b>
                    <span className="muted" style={{ fontSize: 13 }}>{m0(ds.reduce((a, d) => a + d.value, 0))}</span>
                  </div>
                  {ds.map((d) => {
                    const late = d.close < T && st !== 'Won' && st !== 'Lost'
                    const i = STAGES.indexOf(st)
                    return (
                      <div key={d.id} draggable onDragStart={() => setDrag(d.id)} onDragEnd={() => setDrag('')} style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, padding: 8, marginBottom: 8, cursor: 'grab' }}>
                        <b style={{ fontSize: 14 }}>{d.title}</b>
                        <div className="muted" style={{ fontSize: 12 }}>{who(d.contactId)?.company || who(d.contactId)?.name}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                          <b>{m0(d.value)}</b>
                          <span style={{ fontSize: 12, color: late ? 'var(--err)' : 'var(--muted)' }}>{late ? 'overdue' : d.close}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                          <button type="button" disabled={i === 0} onClick={() => editD(d.id, { stage: STAGES[i - 1] })} style={{ all: 'unset', cursor: 'pointer', opacity: i === 0 ? 0.3 : 0.8 }} aria-label="Previous stage">◀</button>
                          <button type="button" disabled={i === STAGES.length - 1} onClick={() => editD(d.id, { stage: STAGES[i + 1] })} style={{ all: 'unset', cursor: 'pointer', opacity: i === STAGES.length - 1 ? 0.3 : 0.8 }} aria-label="Next stage">▶</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </>
      )}

      {view === 'tasks' && (
        <Split>
          <Panel title="Follow-ups">
            {BUCKET.map(([b, label]) => {
              const xs = s.followUps.filter((f) => bucket(f, T) === b).sort((x, y) => x.due.localeCompare(y.due))
              return xs.length ? (
                <div key={b} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: b === 'overdue' ? 'var(--err)' : 'var(--muted)' }}>{label} · {xs.length}</div>
                  {xs.map(fuRow)}
                </div>
              ) : null
            })}
            {!s.followUps.length && <Tip>No follow-ups yet. Add them from a contact's timeline.</Tip>}
          </Panel>
          <Panel title="Next 14 days">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {Array.from({ length: 14 }, (_, i) => {
                const day = D(i)
                const n = open.filter((f) => f.due === day).length
                const wd = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
                return (
                  <div key={day} title={`${day}: ${n} follow-up(s)`} style={{ padding: 6, borderRadius: 8, textAlign: 'center', border: '1px solid var(--line)', background: n ? `color-mix(in srgb, var(--accent) ${Math.min(60, 18 * n)}%, transparent)` : undefined }}>
                    <div className="muted" style={{ fontSize: 11 }}>{wd}</div>
                    <b>{day.slice(8)}</b>
                    <div style={{ fontSize: 12 }}>{n || ''}</div>
                  </div>
                )
              })}
            </div>
            {overdue.length > 0 && <Note tone="warn">{overdue.length} follow-up{overdue.length > 1 ? 's are' : ' is'} overdue. Use ⏰ to snooze to tomorrow.</Note>}
            <p className="muted" style={{ fontSize: 13 }}>Data is stored only in this browser. Use <b>Backup</b> regularly to keep a JSON copy.</p>
          </Panel>
        </Split>
      )}
    </div>
  )
}
