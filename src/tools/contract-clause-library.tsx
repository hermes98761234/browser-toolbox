import { useState, type ReactNode } from 'react'
import { Btn, Check, CopyButton, download, JsonButtons, Note, Panel, Row, Split, Stat, Stats, uid, useToolState } from '../kit'
import { assemble, docVars, move, parseTags, tagCounts, type Clause } from './lib/contract-clause-library'
import { boldRuns, makeDocx } from './lib/cover-letter-writer'

const SAMPLE: Clause[] = [
  { id: 'conf', title: 'Confidentiality', category: 'Protection', tags: ['nda', 'services', 'standard'], body: 'Each party shall keep confidential all non-public information disclosed by the other party ("Confidential Information") and use it only to perform this Agreement.\n\nThese obligations survive for {{confYears}} years after termination and do not apply to information that is public, already known to the recipient, or required to be disclosed by law.' },
  { id: 'term', title: 'Term and Termination', category: 'Term', tags: ['services', 'saas', 'standard'], body: 'This Agreement starts on {{startDate}} and continues for {{termMonths}} months unless terminated earlier.\n\nEither party may terminate this Agreement for convenience with {{noticeDays}} days\' written notice, or immediately if the other party materially breaches it and fails to cure the breach within 15 days of notice.' },
  { id: 'pay', title: 'Fees and Payment', category: 'Commercial', tags: ['services', 'saas'], body: '{{client}} shall pay {{provider}} the fees set out in the order form. Invoices are payable within {{paymentDays}} days of the invoice date in {{currency}}.\n\nLate amounts bear interest at {{lateInterest}}% per month or the maximum rate permitted by law, whichever is lower.' },
  { id: 'liab', title: 'Limitation of Liability', category: 'Risk', tags: ['services', 'saas', 'risk'], body: 'Neither party is liable for indirect, incidental, special or consequential damages, including lost profits.\n\nEach party\'s total liability under this Agreement is limited to the fees paid or payable in the {{capMonths}} months before the event giving rise to the claim. These limits do not apply to breaches of confidentiality, indemnity obligations, or gross negligence.' },
  { id: 'indem', title: 'Indemnification', category: 'Risk', tags: ['services', 'risk'], body: '{{provider}} shall defend and indemnify {{client}} against third-party claims alleging that the deliverables infringe intellectual property rights, provided that {{client}} promptly notifies {{provider}} and allows it to control the defence.' },
  { id: 'ip', title: 'Intellectual Property', category: 'Protection', tags: ['services', 'freelance'], body: 'Upon full payment, {{provider}} assigns to {{client}} all rights in the deliverables created specifically for {{client}}. {{provider}} retains its pre-existing tools, know-how and materials and grants {{client}} a non-exclusive licence to use them as part of the deliverables.' },
  { id: 'nonsol', title: 'Non-Solicitation', category: 'Protection', tags: ['services', 'employment'], body: 'During the term and for {{nonSolMonths}} months afterwards, neither party shall directly solicit for employment any employee of the other party who was involved in the services, without prior written consent.' },
  { id: 'force', title: 'Force Majeure', category: 'Boilerplate', tags: ['standard', 'boilerplate'], body: 'Neither party is liable for delay or failure caused by events beyond its reasonable control, including natural disasters, war, epidemics, or failures of public utilities. If such an event lasts more than 60 days, either party may terminate this Agreement by notice.' },
  { id: 'law', title: 'Governing Law and Jurisdiction', category: 'Boilerplate', tags: ['standard', 'boilerplate'], body: 'This Agreement is governed by the laws of {{jurisdiction}}. The courts of {{venue}} have exclusive jurisdiction over any dispute arising from it.' },
  { id: 'arb', title: 'Dispute Resolution', category: 'Boilerplate', tags: ['risk'], body: 'The parties shall first try to resolve any dispute through good-faith negotiation between senior representatives for 30 days. Unresolved disputes shall be finally settled by binding arbitration in {{venue}} under the rules of {{arbRules}}.' },
  { id: 'notice', title: 'Notices', category: 'Boilerplate', tags: ['boilerplate'], body: 'Notices must be in writing and sent to the addresses stated above (or later notified). Notices by email are effective on the business day after sending, unless a delivery failure is received.' },
  { id: 'entire', title: 'Entire Agreement', category: 'Boilerplate', tags: ['standard', 'boilerplate'], body: 'This Agreement, including its schedules, is the entire agreement between the parties on its subject matter and supersedes all prior discussions. Amendments must be in writing and signed by both parties.' },
  { id: 'sever', title: 'Severability', category: 'Boilerplate', tags: ['boilerplate'], body: 'If any provision is held invalid or unenforceable, the remaining provisions remain in full force, and the invalid provision shall be replaced by a valid one that comes closest to the parties\' intent.' },
  { id: 'sla', title: 'Service Levels', category: 'Commercial', tags: ['saas'], body: '{{provider}} shall make the service available {{uptime}}% of each calendar month, excluding scheduled maintenance announced at least 48 hours in advance. If availability falls below this level, {{client}} is entitled to a service credit of 5% of the monthly fee for each full 0.5% below target, up to 30%.' },
]

const VAR_DEFAULTS: Record<string, string> = {
  provider: 'Brightline Studio Ltd', client: 'Northwind Foods Inc.', effectiveDate: '1 November 2026', startDate: '1 November 2026', termMonths: '12', noticeDays: '30', paymentDays: '30', currency: 'USD',
  lateInterest: '1', capMonths: '12', confYears: '3', nonSolMonths: '12', jurisdiction: 'the State of New York', venue: 'New York County', arbRules: 'the American Arbitration Association', uptime: '99.9',
}

interface State {
  clauses: Clause[]
  title: string
  preamble: string
  doc: string[]
  vars: Record<string, string>
  numbered: boolean
}

const DEF: State = {
  clauses: SAMPLE,
  title: 'Services Agreement',
  preamble: 'This Services Agreement ("Agreement") is made on {{effectiveDate}} between {{provider}} ("Provider") and {{client}} ("Client").',
  doc: ['term', 'pay', 'conf', 'ip', 'liab', 'law', 'entire'],
  vars: VAR_DEFAULTS,
  numbered: true,
}

const Tip = ({ children }: { children: ReactNode }) => (
  <div className="k-note" style={{ background: 'color-mix(in srgb, var(--accent2) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent2) 35%, transparent)' }}>{children}</div>
)
const human = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())

export default function ContractClauseLibrary() {
  const [s, set, reset] = useToolState('contract-clause-library', DEF)
  const [q, setQ] = useState('')
  const [tag, setTag] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; from: number | null } | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const byId = (id: string) => s.clauses.find((c) => c.id === id)
  const inDoc = s.doc.map(byId).filter((c): c is Clause => !!c)
  const vars = docVars(s.preamble, inDoc)
  const missing = vars.filter((v) => !s.vars[v]?.trim())
  const text = assemble(s.title, s.preamble, inDoc, s.vars, s.numbered)
  const words = (text.match(/[\p{L}\p{N}'’-]+/gu) ?? []).length
  const tags = tagCounts(s.clauses)
  const shown = s.clauses.filter((c) => (!tag || c.tags.includes(tag)) && `${c.title} ${c.category} ${c.body} ${c.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
  const edit = (id: string, patch: Partial<Clause>) => set({ clauses: s.clauses.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  const fileBase = (s.title || 'contract').replace(/[^\w -]/g, '').trim() || 'contract'

  const drop = (at: number) => {
    if (!drag) return
    if (drag.from === null) {
      if (!s.doc.includes(drag.id)) set({ doc: [...s.doc.slice(0, at), drag.id, ...s.doc.slice(at)] })
    } else set({ doc: move(s.doc, drag.from, at > drag.from ? at - 1 : at) })
    setDrag(null)
    setOver(null)
  }
  const addClause = () => {
    const c: Clause = { id: uid(), title: 'New clause', category: 'Custom', tags: ['custom'], body: 'Write the clause text here. Use {{placeholders}} for names, dates and amounts.' }
    set({ clauses: [c, ...s.clauses] })
    setEditing(c.id)
  }

  return (
    <div>
      <Stats>
        <Stat label="Clauses in library" value={s.clauses.length} />
        <Stat label="In this document" value={inDoc.length} tone="accent" />
        <Stat label="Words" value={words} sub={`≈ ${Math.max(1, Math.round(words / 450))} page(s)`} />
        <Stat label="Unfilled variables" value={missing.length} tone={missing.length ? 'bad' : 'good'} />
      </Stats>
      <Split>
        <div>
          <Panel title="Clause library" actions={<><Btn onClick={addClause}>+ Clause</Btn><JsonButtons name="clause-library.json" data={s} onLoad={(d) => d && Array.isArray(d.clauses) && set(d)} /><Btn kind="ghost" onClick={() => confirm('Reset library and document to the samples?') && reset()}>Reset</Btn></>}>
            <input className="k-text" placeholder="Search clauses…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: '100%' }} aria-label="Search" />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
              {[['', s.clauses.length] as [string, number], ...tags].map(([t, n]) => (
                <button key={t || 'all'} type="button" onClick={() => setTag(t)} style={{ padding: '2px 10px', borderRadius: 99, border: '1px solid var(--line)', background: tag === t ? 'var(--accent)' : 'var(--panel)', color: tag === t ? '#fff' : 'inherit', font: 'inherit', fontSize: 12, cursor: 'pointer' }}>
                  {t || 'all'} <span style={{ opacity: 0.7 }}>{n}</span>
                </button>
              ))}
            </div>
            {shown.map((c) => {
              const used = s.doc.includes(c.id)
              return (
                <div key={c.id} draggable={editing !== c.id} onDragStart={() => setDrag({ id: c.id, from: null })} onDragEnd={() => { setDrag(null); setOver(null) }} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, marginBottom: 8, background: 'var(--panel)', cursor: editing === c.id ? 'default' : 'grab', opacity: used ? 0.65 : 1 }}>
                  {editing === c.id ? (
                    <>
                      <input className="k-text" value={c.title} onChange={(e) => edit(c.id, { title: e.target.value })} style={{ width: '100%', fontWeight: 700 }} aria-label="Title" />
                      <Row>
                        <input className="k-text" value={c.category} onChange={(e) => edit(c.id, { category: e.target.value })} placeholder="Category" style={{ flex: 1 }} aria-label="Category" />
                        <input className="k-text" defaultValue={c.tags.join(', ')} onBlur={(e) => edit(c.id, { tags: parseTags(e.target.value) })} placeholder="tags, comma separated" style={{ flex: 2 }} aria-label="Tags" />
                      </Row>
                      <textarea className="k-area" rows={6} value={c.body} onChange={(e) => edit(c.id, { body: e.target.value })} style={{ width: '100%', marginTop: 6 }} aria-label="Clause text" />
                      <Row>
                        <Btn kind="primary" onClick={() => setEditing(null)}>Done</Btn>
                        <Btn kind="danger" onClick={() => { set({ clauses: s.clauses.filter((x) => x.id !== c.id), doc: s.doc.filter((x) => x !== c.id) }); setEditing(null) }}>Delete</Btn>
                      </Row>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <b style={{ flex: 1 }}>{c.title}</b>
                        <Btn kind="ghost" onClick={() => setEditing(c.id)} title="Edit">✎</Btn>
                        <Btn kind={used ? 'ghost' : 'normal'} disabled={used} onClick={() => set({ doc: [...s.doc, c.id] })}>{used ? '✓ added' : '+ Add'}</Btn>
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>{c.category} · {c.tags.map((t) => `#${t}`).join(' ')}</div>
                      <div style={{ fontSize: 13, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.body}</div>
                    </>
                  )}
                </div>
              )
            })}
            {!shown.length && <p className="muted">No clauses match.</p>}
          </Panel>
        </div>

        <div>
          <Panel title="Document">
            <input className="k-text" value={s.title} onChange={(e) => set({ title: e.target.value })} style={{ width: '100%', fontWeight: 700, fontSize: 16 }} aria-label="Document title" />
            <textarea className="k-area" rows={2} value={s.preamble} onChange={(e) => set({ preamble: e.target.value })} style={{ width: '100%', marginTop: 6 }} aria-label="Preamble" />
            <Check label="Number clauses (1., 1.1)" value={s.numbered} onChange={(numbered) => set({ numbered })} />
            <div
              onDragOver={(e) => { e.preventDefault(); if (over === null) setOver(s.doc.length) }}
              onDrop={() => drop(over ?? s.doc.length)}
              style={{ border: `2px dashed ${drag ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 12, padding: 8, minHeight: 80, marginTop: 8 }}
            >
              {inDoc.map((c, i) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => setDrag({ id: c.id, from: i })}
                  onDragEnd={() => { setDrag(null); setOver(null) }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setOver(e.clientY < r.top + r.height / 2 ? i : i + 1) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, background: 'var(--panel)', border: '1px solid var(--line)', marginBottom: 4, cursor: 'grab', boxShadow: over === i && drag ? '0 -3px 0 var(--accent)' : over === i + 1 && i === inDoc.length - 1 && drag ? '0 3px 0 var(--accent)' : undefined }}
                >
                  <span className="muted" style={{ width: 22 }}>{i + 1}.</span>
                  <b style={{ flex: 1, fontSize: 14 }}>{c.title}</b>
                  <button type="button" onClick={() => set({ doc: move(s.doc, i, i - 1) })} disabled={i === 0} style={{ all: 'unset', cursor: 'pointer', opacity: i === 0 ? 0.3 : 0.8 }} aria-label="Move up">▲</button>
                  <button type="button" onClick={() => set({ doc: move(s.doc, i, i + 1) })} disabled={i === inDoc.length - 1} style={{ all: 'unset', cursor: 'pointer', opacity: i === inDoc.length - 1 ? 0.3 : 0.8 }} aria-label="Move down">▼</button>
                  <button type="button" onClick={() => set({ doc: s.doc.filter((x) => x !== c.id) })} style={{ all: 'unset', cursor: 'pointer', opacity: 0.6 }} aria-label="Remove">✕</button>
                </div>
              ))}
              <p className="muted" style={{ fontSize: 13, textAlign: 'center', margin: 6 }}>{inDoc.length ? 'Drag to reorder · drop library clauses here' : 'Drag clauses here from the library'}</p>
            </div>
          </Panel>

          {vars.length > 0 && (
            <Panel title="Variables">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}>
                {vars.map((v) => (
                  <label key={v} className="k-field">
                    <span className="k-label" style={{ color: s.vars[v]?.trim() ? undefined : 'var(--warn)' }}>{human(v)}</span>
                    <input className="k-text" value={s.vars[v] ?? ''} onChange={(e) => set({ vars: { ...s.vars, [v]: e.target.value } })} />
                  </label>
                ))}
              </div>
            </Panel>
          )}

          <Panel
            title="Preview"
            actions={
              <>
                <CopyButton text={text.replace(/\*\*/g, '')} />
                <Btn onClick={() => download(`${fileBase}.txt`, text.replace(/\*\*/g, ''))}>⬇ TXT</Btn>
                <Btn kind="primary" disabled={!inDoc.length} onClick={() => download(`${fileBase}.docx`, new Blob([makeDocx(text, { font: 'Times New Roman', sizePt: 11, title: s.title })], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))}>⬇ DOCX</Btn>
              </>
            }
          >
            {missing.length > 0 && <Note tone="warn">Unfilled: {missing.map(human).join(', ')} — they appear as [name] in the export.</Note>}
            <div style={{ background: '#fff', color: '#111827', borderRadius: 6, boxShadow: '0 2px 12px rgba(0,0,0,.12)', padding: 'clamp(16px, 5%, 40px)', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 14, lineHeight: 1.55, maxHeight: 560, overflow: 'auto' }}>
              {text.split(/\n{2,}/).map((p, i) => (
                <p key={i} style={{ margin: '0 0 10px', textAlign: i === 0 && s.title ? 'center' : undefined }}>
                  {boldRuns(p).map((r, j) => (r.b ? <b key={j}>{r.t}</b> : <span key={j}>{r.t}</span>))}
                </p>
              ))}
            </div>
            <Tip>This library is a drafting aid, not legal advice. Have a qualified lawyer review contracts before signing.</Tip>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
