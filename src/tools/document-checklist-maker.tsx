import { useState } from 'react'
import { Bar, Btn, CopyButton, CsvButton, download, JsonButtons, Note, Panel, Ring, Row, Select, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { daysLeft, fromTemplate, progress, sections, TEMPLATES, toMarkdown, toPrintHtml, type Checklist, type Item, type ItemState } from './lib/document-checklist-maker'

const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const TODAY = localToday()
const NEW = '+ New section…'
const plus = (days: number) => new Date(Date.parse(TODAY + 'T12:00:00Z') + days * 864e5).toISOString().slice(0, 10)

function make(tid: string, who = ''): Checklist {
  const t = TEMPLATES.find((x) => x.id === tid)!
  return { id: uid(), title: t.name, who, due: plus(21), template: tid, items: fromTemplate(t.body) }
}
function demo(): Checklist[] {
  const a = make('mortgage', 'Alex & Jordan')
  a.items.forEach((it, i) => { if (i % 3 !== 2 && i < 9) it.state = 'done' })
  a.items[3].state = 'na'
  a.items[0].note = 'Both passports — in the blue folder'
  const b = make('visa', 'Maria')
  b.due = plus(9)
  b.items.slice(0, 4).forEach((it) => (it.state = 'done'))
  return [a, b]
}
interface S { lists: Checklist[]; sel: string; hideDone: boolean }
const DEF: S = { lists: demo(), sel: '', hideDone: false }

export default function DocumentChecklistMaker() {
  const [s, set, reset] = useToolState('document-checklist-maker', DEF)
  const [tpl, setTpl] = useState(TEMPLATES[0].id)
  const [newItem, setNewItem] = useState('')
  const [newSection, setNewSection] = useState('')
  const [secName, setSecName] = useState('')
  const c = s.lists.find((l) => l.id === s.sel) ?? s.lists[0]
  const upList = (p: Partial<Checklist>) => c && set({ lists: s.lists.map((l) => (l.id === c.id ? { ...l, ...p } : l)) })
  const upItem = (id: string, p: Partial<Item>) => c && upList({ items: c.items.map((i) => (i.id === id ? { ...i, ...p } : i)) })
  const move = (id: string, d: -1 | 1) => {
    if (!c) return
    const items = [...c.items], i = items.findIndex((x) => x.id === id), j = i + d
    if (j < 0 || j >= items.length || items[j].section !== items[i].section) return
    ;[items[i], items[j]] = [items[j], items[i]]
    upList({ items })
  }
  const p = c ? progress(c.items) : null
  const left = c ? daysLeft(c.due, TODAY) : null
  const secs = c ? sections(c.items) : []
  const print = () => {
    if (!c) return
    const w = window.open('', '_blank')
    if (!w) { download(`${c.title}.html`, toPrintHtml(c), 'text/html'); return }
    w.document.write(toPrintHtml(c))
    w.document.close()
    setTimeout(() => w.print(), 300)
  }
  const cycle = (st: ItemState): ItemState => (st === 'todo' ? 'done' : st === 'done' ? 'todo' : 'todo')

  return (
    <Split wide="right">
      <div>
        <Panel title="Your checklists">
          <div style={{ display: 'grid', gap: 6 }}>
            {s.lists.map((l) => {
              const pr = progress(l.items), dl = daysLeft(l.due, TODAY)
              return (
                <button key={l.id} type="button" className={`k-btn ${l.id === c?.id ? 'primary' : 'ghost'}`} style={{ display: 'block', textAlign: 'left' }} onClick={() => set({ sel: l.id })}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{TEMPLATES.find((t) => t.id === l.template)?.icon ?? '📋'} {l.title}</b><span>{Math.round(pr.pct * 100)}%</span></div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{l.who || 'no name'}{dl !== null ? ` · ${dl < 0 ? `${-dl} days overdue` : dl === 0 ? 'due today' : `${dl} days left`}` : ''}</div>
                </button>
              )
            })}
          </div>
        </Panel>
        <Panel title="New from template">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
            {TEMPLATES.map((t) => (
              <button key={t.id} type="button" className={`k-btn ${tpl === t.id ? 'primary' : 'ghost'}`} onClick={() => setTpl(t.id)} style={{ textAlign: 'left', whiteSpace: 'normal', lineHeight: 1.25, minWidth: 0 }}>{t.icon} {t.name}</button>
            ))}
          </div>
          <Row>
            <Btn kind="primary" onClick={() => { const n = make(tpl); set({ lists: [...s.lists, n], sel: n.id }) }}>+ Create checklist</Btn>
            <Btn onClick={() => { const n: Checklist = { id: uid(), title: 'My checklist', who: '', due: '', template: '', items: [] }; set({ lists: [...s.lists, n], sel: n.id }) }}>+ Blank</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Templates are general guidance — always confirm the exact list with the office handling your application.</p>
        </Panel>
        <Panel title="Backup" actions={<Btn kind="ghost" onClick={reset}>Reset demo</Btn>}>
          <Row><JsonButtons name="checklists.json" data={s} onLoad={(d) => set(d)} /></Row>
          <p className="muted" style={{ fontSize: 13 }}>Ticks are saved automatically in this browser.</p>
        </Panel>
      </div>

      <div>
        {!c ? <Note>Create a checklist from a template to get started.</Note> : (
          <>
            <Stats>
              <Stat label="Ready" value={`${p!.done} / ${p!.total}`} sub={p!.na ? `${p!.na} not applicable` : 'documents'} tone="accent" />
              <Stat label="Required" value={`${p!.requiredDone} / ${p!.required}`} tone={p!.requiredDone === p!.required ? 'good' : 'bad'} sub={p!.requiredDone === p!.required ? 'all required in hand' : `${p!.required - p!.requiredDone} still missing`} />
              <Stat label="Deadline" value={left === null ? '—' : left < 0 ? `${-left} d late` : `${left} days`} tone={left !== null && left < 7 && p!.pct < 1 ? 'bad' : undefined} sub={c.due || 'no due date'} />
              <div className="k-stat" style={{ alignItems: 'center' }}><Ring value={p!.pct} size={78} label={`${Math.round(p!.pct * 100)}%`} /></div>
            </Stats>
            <Panel title="Details" actions={<Btn kind="danger" onClick={() => set({ lists: s.lists.filter((l) => l.id !== c.id), sel: '' })}>Delete list</Btn>}>
              <Row>
                <Txt label="Title" value={c.title} onChange={(title) => upList({ title })} />
                <Txt label="For (applicant)" value={c.who} onChange={(who) => upList({ who })} />
                <Txt label="Due date" type="date" value={c.due} onChange={(due) => upList({ due })} />
              </Row>
            </Panel>
            <Panel title="Documents" actions={<>
              <label className="k-check"><input type="checkbox" checked={s.hideDone} onChange={(e) => set({ hideDone: e.target.checked })} /> Hide ready</label>
              <Btn kind="primary" onClick={print}>🖨 Print</Btn>
              <CopyButton text={() => toMarkdown(c)} label="Markdown" />
              <CsvButton name={`${c.title}.csv`} rows={() => [['Section', 'Document', 'Required', 'Status', 'Note'], ...c.items.map((i) => [i.section, i.text, i.required ? 'yes' : 'no', i.state, i.note])]} />
            </>}>
              {secs.map((sec) => {
                const its = c.items.filter((i) => i.section === sec)
                const sp = progress(its)
                return (
                  <div key={sec} style={{ marginBottom: 14 }}>
                    <Row wrap={false}><b style={{ flex: 1 }}>{sec}</b><span className="muted" style={{ fontSize: 13 }}>{sp.done}/{sp.total}</span></Row>
                    <Bar value={sp.pct} color={sp.pct === 1 ? 'var(--ok)' : 'var(--accent)'} />
                    {its.filter((i) => !(s.hideDone && i.state === 'done')).map((i) => (
                      <div key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid var(--line)', opacity: i.state === 'na' ? 0.5 : 1 }}>
                        <input type="checkbox" checked={i.state === 'done'} disabled={i.state === 'na'} onChange={() => upItem(i.id, { state: cycle(i.state) })} style={{ width: 20, height: 20, marginTop: 2 }} aria-label={i.text} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <input value={i.text} onChange={(e) => upItem(i.id, { text: e.target.value })} style={{ width: '100%', border: 'none', background: 'transparent', font: 'inherit', fontWeight: 600, textDecoration: i.state === 'na' ? 'line-through' : undefined, color: 'inherit' }} aria-label="Document" />
                          <input value={i.note} placeholder="note: where is it, reference no., who to ask…" onChange={(e) => upItem(i.id, { note: e.target.value })} style={{ width: '100%', border: 'none', background: 'transparent', font: 'inherit', fontSize: 12, color: 'var(--muted)' }} aria-label="Note" />
                        </div>
                        <button type="button" className="k-btn ghost" title="Required?" onClick={() => upItem(i.id, { required: !i.required })} style={{ fontSize: 11, padding: '2px 6px' }}>{i.required ? 'required' : 'optional'}</button>
                        <button type="button" className="k-btn ghost" title="Not applicable" onClick={() => upItem(i.id, { state: i.state === 'na' ? 'todo' : 'na' })} style={{ fontSize: 11, padding: '2px 6px' }}>{i.state === 'na' ? 'restore' : 'n/a'}</button>
                        <button type="button" className="k-btn ghost" onClick={() => move(i.id, -1)} title="Move up" style={{ padding: '2px 6px' }}>↑</button>
                        <button type="button" className="k-btn ghost" onClick={() => move(i.id, 1)} title="Move down" style={{ padding: '2px 6px' }}>↓</button>
                        <button type="button" className="k-btn ghost" onClick={() => upList({ items: c.items.filter((x) => x.id !== i.id) })} title="Remove" style={{ padding: '2px 6px' }}>✕</button>
                      </div>
                    ))}
                  </div>
                )
              })}
              <Row>
                <Txt label="Add document" value={newItem} onChange={setNewItem} placeholder="e.g. Marriage certificate" />
                <Select label="Section" value={newSection || secs[0] || 'General'} onChange={setNewSection} options={[...(secs.length ? secs : ['General']), NEW].map((x) => [x, x] as [string, string])} />
                {newSection === NEW && <Txt label="New section name" value={secName} onChange={setSecName} placeholder="e.g. Originals" />}
                <Btn kind="primary" disabled={!newItem.trim()} onClick={() => {
                  const sec = newSection === NEW ? secName.trim() || 'Other' : newSection || secs[0] || 'General'
                  const item: Item = { id: uid(), section: sec, text: newItem.trim(), required: true, state: 'todo', note: '' }
                  const lastIdx = c.items.map((x) => x.section).lastIndexOf(sec)
                  const items = [...c.items]
                  items.splice(lastIdx < 0 ? items.length : lastIdx + 1, 0, item)
                  upList({ items }); setNewItem(''); if (newSection === NEW) { setNewSection(sec); setSecName('') }
                }}>+ Add</Btn>
              </Row>
            </Panel>
            {p!.pct === 1 && <Note tone="ok">🎉 Everything is ready. Print the checklist and bring it along to tick off at the counter.</Note>}
          </>
        )}
      </div>
    </Split>
  )
}
