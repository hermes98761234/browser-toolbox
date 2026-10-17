import { Area, Btn, CopyButton, CsvButton, download, JsonButtons, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { allActions, build, isPresent, makeDocx, quorum, result, toMarkdown, type Action, type Block, type Item, type Minutes, type Motion, type Person, type Status, type Threshold } from './lib/meeting-minutes-template'

const P = (name: string, role: string, status: Status, voting = true): Person => ({ id: uid(), name, role, status, voting })
const MO = (text: string, mover: string, seconder: string, yes: number, no: number, abstain: number, threshold: Threshold = 'majority'): Motion => ({ id: uid(), text, mover, seconder, yes, no, abstain, threshold })
const AC = (task: string, owner: string, due: string): Action => ({ id: uid(), task, owner, due })

const DEF: Minutes = {
  org: 'Riverside Community Garden Association', body: 'Board of Directors', kind: 'Regular', date: '2026-10-15', start: '18:30', end: '20:05', place: 'Riverside Library, Room B (and video call)',
  chair: 'Maria Lopez', secretary: 'Tom Becker', quorumRule: 'majority', quorumN: 4,
  people: [
    P('Maria Lopez', 'President (Chair)', 'present'), P('Tom Becker', 'Secretary', 'present'), P('Aisha Khan', 'Treasurer', 'present'),
    P('David Park', 'Director', 'remote'), P('Sofia Rossi', 'Director', 'present'), P('Liam O’Brien', 'Director', 'excused'), P('Nora Ahmed', 'Director', 'absent'),
    P('Jake Miller', 'Volunteer coordinator', 'guest', false),
  ],
  items: [
    { id: uid(), title: 'Approval of previous minutes', presenter: 'Tom Becker', notes: 'Minutes of the September 17 meeting were circulated in advance. One typo in the treasurer’s figures was corrected.', motions: [MO('To approve the minutes of September 17, 2026 as amended.', 'Aisha Khan', 'Sofia Rossi', 5, 0, 0)], actions: [] },
    { id: uid(), title: 'Treasurer’s report', presenter: 'Aisha Khan', notes: 'Q3 income $8,420 (plot fees $6,100, plant sale $2,320); expenses $5,915.\n- Bank balance on Sept 30: $14,760.\n- Water bill up 18% after the dry summer.', motions: [], actions: [AC('Compare quotes for drip irrigation on beds 12–30', 'Aisha Khan', '2026-11-10')] },
    { id: uid(), title: 'Shed replacement', presenter: 'Sofia Rossi', notes: 'Three quotes received; the lowest compliant quote is $4,850 from Oak & Pine Builders, including removal of the old shed.\nDirectors discussed timing; work should finish before the first frost.', motions: [MO('To spend up to $5,000 from reserves on a new tool shed from Oak & Pine Builders.', 'Sofia Rossi', 'David Park', 4, 1, 0, 'two-thirds')], actions: [AC('Sign contract and book installation date', 'Maria Lopez', '2026-10-24'), AC('Empty the old shed (volunteer work day)', 'Jake Miller', '2026-10-31')] },
    { id: uid(), title: 'Plot fee increase for 2027', presenter: 'Maria Lopez', notes: 'Proposal to raise the annual plot fee from $45 to $55. Concerns were raised about affordability; a hardship waiver was suggested.', motions: [MO('To raise the 2027 plot fee to $55 with a hardship waiver programme.', 'Maria Lopez', 'Aisha Khan', 2, 2, 1)], actions: [AC('Draft hardship waiver criteria for next meeting', 'David Park', '2026-11-19')] },
  ],
  next: '2026-11-19', nextPlace: 'Riverside Library, Room B',
}

const STATUS: [Status, string][] = [['present', 'Present'], ['remote', 'Remote'], ['absent', 'Absent'], ['excused', 'Excused'], ['guest', 'Guest']]

function Preview({ blocks }: { blocks: Block[] }) {
  return (
    <div style={{ background: '#fff', color: '#1f2937', borderRadius: 8, padding: '28px 30px', boxShadow: '0 1px 4px rgba(0,0,0,.15)', fontFamily: 'Calibri, Carlito, system-ui, sans-serif', fontSize: 14, lineHeight: 1.5 }}>
      {blocks.map((b, i) => {
        if (b.t === 'table') return (
          <table key={i} style={{ width: '100%', borderCollapse: 'collapse', margin: '6px 0 12px', fontSize: 13 }}>
            <thead><tr>{b.head.map((h) => <th key={h} style={{ background: '#e7ecf5', border: '1px solid #bfbfbf', padding: '3px 6px', textAlign: 'left', width: b.widths ? `${b.widths[b.head.indexOf(h)]}%` : undefined }}>{h}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} style={{ border: '1px solid #bfbfbf', padding: '3px 6px' }}>{c}</td>)}</tr>)}</tbody>
          </table>
        )
        if (b.t === 'title') return <div key={i} style={{ textAlign: 'center', fontWeight: 700, fontSize: 21 }}>{b.text}</div>
        if (b.t === 'subtitle') return <div key={i} style={{ textAlign: 'center', fontWeight: 700, fontSize: 16 }}>{b.text}</div>
        if (b.t === 'small') return <div key={i} style={{ fontStyle: 'italic', color: '#555', fontSize: 12.5, textAlign: i < 4 ? 'center' : undefined, marginBottom: 6 }}>{b.text}</div>
        if (b.t === 'h') return <div key={i} style={{ fontWeight: 700, color: '#1f3864', borderBottom: '1px solid #bfbfbf', margin: '14px 0 6px' }}>{b.text}</div>
        if (b.t === 'bullet') return <div key={i} style={{ paddingLeft: 18, textIndent: -12 }}>• {b.text}</div>
        return <p key={i} style={{ margin: '0 0 8px', textAlign: 'justify', color: /NOT present|FAILED/.test(b.text) ? '#b91c1c' : undefined }}>{b.text}</p>
      })}
    </div>
  )
}

export default function MeetingMinutesTemplate() {
  const [s, set, reset] = useToolState('meeting-minutes-template', DEF)
  const q = quorum(s)
  const blocks = build(s)
  const motions = s.items.flatMap((it) => it.motions)
  const carried = motions.filter((m) => result(m) === 'carried').length
  const failed = motions.filter((m) => result(m) === 'failed').length
  const actions = allActions(s)
  const names = s.people.map((p) => p.name)
  const voters = s.people.filter((p) => p.voting && isPresent(p)).length
  const fname = `minutes-${s.date || 'meeting'}`
  const editP = (id: string, p: Partial<Person>) => set({ people: s.people.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const editI = (id: string, p: Partial<Item>) => set({ items: s.items.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const editM = (it: Item, id: string, p: Partial<Motion>) => editI(it.id, { motions: it.motions.map((m) => (m.id === id ? { ...m, ...p } : m)) })
  const editA = (it: Item, id: string, p: Partial<Action>) => editI(it.id, { actions: it.actions.map((a) => (a.id === id ? { ...a, ...p } : a)) })
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= s.items.length) return
    const items = [...s.items]
    ;[items[i], items[j]] = [items[j], items[i]]
    set({ items })
  }
  const printIt = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const html = blocks.map((b) => b.t === 'table'
      ? `<table><tr>${b.head.map((h) => `<th>${h}</th>`).join('')}</tr>${b.rows.map((r) => `<tr>${r.map((c) => `<td>${c.replace(/</g, '&lt;')}</td>`).join('')}</tr>`).join('')}</table>`
      : `<div class="${b.t}">${b.t === 'bullet' ? '• ' : ''}${b.text.replace(/</g, '&lt;')}</div>`).join('')
    w.document.write(`<!doctype html><title>${fname}</title><style>body{font:14px/1.5 Calibri,system-ui,sans-serif;max-width:720px;margin:32px auto}.title{text-align:center;font-weight:700;font-size:22px}.subtitle{text-align:center;font-weight:700;font-size:17px}.small{font-style:italic;color:#555;text-align:center}.h{font-weight:700;color:#1f3864;border-bottom:1px solid #bbb;margin:16px 0 6px}.p{margin:0 0 8px;text-align:justify}.bullet{padding-left:18px}table{width:100%;border-collapse:collapse;margin:6px 0 12px}td,th{border:1px solid #bbb;padding:3px 6px;text-align:left}th{background:#e7ecf5}</style>${html}<script>print()</script>`)
    w.document.close()
  }

  return (
    <Split>
      <div>
        <Panel title="Meeting details" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label="Organization" value={s.org} onChange={(org) => set({ org })} />
          <Row>
            <Txt label="Body" value={s.body} onChange={(body) => set({ body })} placeholder="Board of Directors" />
            <Select label="Meeting type" value={s.kind} onChange={(kind) => set({ kind })} options={['Regular', 'Special', 'Annual General', 'Emergency', 'Committee']} />
          </Row>
          <Row>
            <Txt label="Date" type="date" value={s.date} onChange={(date) => set({ date })} />
            <Txt label="Called to order" type="time" value={s.start} onChange={(start) => set({ start })} />
            <Txt label="Adjourned" type="time" value={s.end} onChange={(end) => set({ end })} />
          </Row>
          <Txt label="Location" value={s.place} onChange={(place) => set({ place })} />
          <Row>
            <Select label="Chair" value={s.chair} onChange={(chair) => set({ chair })} options={names.includes(s.chair) ? names : [s.chair, ...names]} />
            <Select label="Secretary / recorder" value={s.secretary} onChange={(secretary) => set({ secretary })} options={names.includes(s.secretary) ? names : [s.secretary, ...names]} />
          </Row>
          <Row>
            <Txt label="Next meeting" type="date" value={s.next} onChange={(next) => set({ next })} />
            <Txt label="Next meeting place" value={s.nextPlace} onChange={(nextPlace) => set({ nextPlace })} />
          </Row>
        </Panel>
        <Panel title={`Attendees (${s.people.length})`} actions={<Btn onClick={() => set({ people: [...s.people, P('New member', 'Director', 'present')] })}>+ Person</Btn>}>
          <Table
            head={['Name', 'Role', 'Attendance', 'Votes', '']}
            rows={s.people.map((p) => [
              <input key="n" value={p.name} onChange={(e) => editP(p.id, { name: e.target.value })} aria-label="Name" style={{ width: 120 }} />,
              <input key="r" value={p.role} onChange={(e) => editP(p.id, { role: e.target.value })} aria-label="Role" style={{ width: 105 }} />,
              <select key="s" value={p.status} onChange={(e) => editP(p.id, { status: e.target.value as Status })} aria-label="Attendance" style={{ minWidth: 100 }}>{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>,
              <input key="v" type="checkbox" checked={p.voting} onChange={(e) => editP(p.id, { voting: e.target.checked })} aria-label="Voting member" />,
              <Btn key="x" kind="ghost" onClick={() => set({ people: s.people.filter((x) => x.id !== p.id) })}>✕</Btn>,
            ])}
          />
          <Row>
            <Select label="Quorum rule" value={s.quorumRule} onChange={(quorumRule) => set({ quorumRule })} options={[['majority', 'Majority of voting members'], ['number', 'Fixed number']]} />
            {s.quorumRule === 'number' && <Num label="Members required" value={s.quorumN} onChange={(quorumN) => set({ quorumN: Math.max(0, Math.round(quorumN)) })} min={0} />}
          </Row>
          <Note tone={q.ok ? 'ok' : 'err'}>{q.have} of {q.members} voting members present, {q.need} needed — {q.ok ? 'quorum present ✓' : 'no quorum: decisions will need ratification'}.</Note>
        </Panel>
        <Panel title="Agenda, motions & actions" actions={<Btn onClick={() => set({ items: [...s.items, { id: uid(), title: 'New agenda item', presenter: '', notes: '', motions: [], actions: [] }] })}>+ Agenda item</Btn>}>
          {s.items.map((it, i) => (
            <details key={it.id} open={i === s.items.length - 1} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', marginBottom: 8 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{i + 1}. {it.title} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>· {it.motions.length} motion{it.motions.length === 1 ? '' : 's'} · {it.actions.length} action{it.actions.length === 1 ? '' : 's'}</span></summary>
              <Row>
                <Txt label="Title" value={it.title} onChange={(title) => editI(it.id, { title })} />
                <Txt label="Presenter" value={it.presenter} onChange={(presenter) => editI(it.id, { presenter })} />
              </Row>
              <Area label="Discussion (start a line with “- ” for a bullet)" value={it.notes} onChange={(notes) => editI(it.id, { notes })} rows={3} />
              {it.motions.map((m, k) => {
                const r = result(m)
                return (
                  <div key={m.id} style={{ background: 'var(--bg)', borderRadius: 8, padding: 8, margin: '6px 0' }}>
                    <Row>
                      <b style={{ flex: 1 }}>Motion {i + 1}.{k + 1}</b>
                      <span style={{ fontWeight: 800, color: r === 'carried' ? 'var(--ok)' : r === 'failed' ? 'var(--err)' : 'var(--muted)' }}>{r.toUpperCase()}</span>
                      <Btn kind="ghost" onClick={() => editI(it.id, { motions: it.motions.filter((x) => x.id !== m.id) })}>✕</Btn>
                    </Row>
                    <Area value={m.text} onChange={(text) => editM(it, m.id, { text })} rows={2} />
                    <Row>
                      <Select label="Moved by" value={m.mover} onChange={(mover) => editM(it, m.id, { mover })} options={['', ...names]} />
                      <Select label="Seconded by" value={m.seconder} onChange={(seconder) => editM(it, m.id, { seconder })} options={['', ...names]} />
                      <Select label="Needs" value={m.threshold} onChange={(threshold) => editM(it, m.id, { threshold })} options={[['majority', 'Majority'], ['two-thirds', 'Two-thirds'], ['unanimous', 'Unanimous']]} />
                    </Row>
                    <Row>
                      <Num label="In favour" value={m.yes} onChange={(yes) => editM(it, m.id, { yes: Math.max(0, Math.round(yes)) })} min={0} />
                      <Num label="Opposed" value={m.no} onChange={(no) => editM(it, m.id, { no: Math.max(0, Math.round(no)) })} min={0} />
                      <Num label="Abstain" value={m.abstain} onChange={(abstain) => editM(it, m.id, { abstain: Math.max(0, Math.round(abstain)) })} min={0} />
                    </Row>
                    {m.yes + m.no + m.abstain > voters && <Note tone="warn">{m.yes + m.no + m.abstain} votes recorded but only {voters} voting members are present.</Note>}
                    <Btn kind="ghost" onClick={() => editM(it, m.id, { yes: voters, no: 0, abstain: 0 })}>All present in favour ({voters})</Btn>
                  </div>
                )
              })}
              {it.actions.map((a) => (
                <Row key={a.id}>
                  <input className="k-text" value={a.task} onChange={(e) => editA(it, a.id, { task: e.target.value })} placeholder="Action" aria-label="Action" style={{ flex: 2, minWidth: 140 }} />
                  <select className="k-select" value={a.owner} onChange={(e) => editA(it, a.id, { owner: e.target.value })} aria-label="Owner" style={{ flex: 1, minWidth: 110 }}>{['', ...names].map((n) => <option key={n} value={n}>{n || 'Owner…'}</option>)}</select>
                  <input className="k-text" type="date" value={a.due} onChange={(e) => editA(it, a.id, { due: e.target.value })} aria-label="Due" style={{ width: 150 }} />
                  <Btn kind="ghost" onClick={() => editI(it.id, { actions: it.actions.filter((x) => x.id !== a.id) })}>✕</Btn>
                </Row>
              ))}
              <Row>
                <Btn onClick={() => editI(it.id, { motions: [...it.motions, MO('To …', '', '', 0, 0, 0)] })}>+ Motion</Btn>
                <Btn onClick={() => editI(it.id, { actions: [...it.actions, AC('', '', '')] })}>+ Action item</Btn>
                <Btn kind="ghost" onClick={() => move(i, -1)} title="Move up">↑</Btn>
                <Btn kind="ghost" onClick={() => move(i, 1)} title="Move down">↓</Btn>
                <Btn kind="danger" onClick={() => set({ items: s.items.filter((x) => x.id !== it.id) })}>Delete item</Btn>
              </Row>
            </details>
          ))}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Attendance" value={`${s.people.filter(isPresent).length} / ${s.people.filter((p) => p.status !== 'guest').length}`} sub={`${s.people.filter((p) => p.status === 'guest').length} guest(s)`} />
          <Stat label="Quorum" value={q.ok ? 'Yes' : 'No'} tone={q.ok ? 'good' : 'bad'} sub={`${q.have} present, ${q.need} needed`} />
          <Stat label="Motions" value={`${carried} carried`} sub={`${failed} failed · ${motions.length - carried - failed} pending`} tone="accent" />
          <Stat label="Action items" value={actions.length} sub={`${new Set(actions.map((a) => a.owner).filter(Boolean)).size} owners`} />
        </Stats>
        <Panel title="Minutes" actions={<>
          <Btn kind="primary" onClick={() => download(`${fname}.docx`, new Blob([makeDocx(blocks) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))}>⬇ DOCX</Btn>
          <Btn onClick={() => download(`${fname}.md`, toMarkdown(blocks), 'text/markdown')}>⬇ Markdown</Btn>
          <CopyButton text={() => toMarkdown(blocks)} />
          <Btn onClick={printIt}>🖨 Print / PDF</Btn>
        </>}>
          <Preview blocks={blocks} />
        </Panel>
        <Panel title="Action item follow-up" actions={<>
          <CsvButton name={`${fname}-actions.csv`} rows={() => [['Agenda item', 'Action', 'Owner', 'Due'], ...actions.map((a) => [a.item, a.task, a.owner, a.due])]} />
          <JsonButtons name={`${fname}.json`} data={s} onLoad={(d) => d && Array.isArray(d.people) && Array.isArray(d.items) && set({ ...DEF, ...d })} />
        </>}>
          <Table head={['Action', 'Owner', 'Due']} rows={[...actions].sort((a, b) => (a.due || '9').localeCompare(b.due || '9')).map((a) => [a.task || '—', a.owner || '—', a.due || '—'])} />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Tip: paste this list into “Business arising” on the next meeting’s agenda.</p>
        </Panel>
      </div>
    </Split>
  )
}
