import { useMemo, useState } from 'react'
import { Btn, Check, CopyButton, CsvButton, Note, Panel, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { ABBRS, CATS, scan, search, type Abbr, type Cat } from './lib/medical-abbreviation-lookup'

const DEF = { q: 'qd', cat: 'all' as Cat | 'all', flagged: false, mode: 'search' as 'search' | 'check', text: 'Pt c/o SOB & CP x2 days. Hx HTN, DM.\nRx: Morphine MSO4 2.0 mg IV q4h PRN pain\nInsulin glargine 10 U SQ qhs\nDigoxin .125 mg PO QD\nD/C Lasix. Eye drops 1 gtt OD BID.', recent: [] as string[] }
const EXAMPLES = ['MS', 'PT', 'q.o.d.', 'SOB', 'AS', 'chest pain', 'kidney', 'HCTZ', 'INR', 'D/C']

function Badge({ a }: { a: Abbr }) {
  if (a.flag === 'dnu') return <span style={{ background: 'var(--err)', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>⛔ Do Not Use — Joint Commission</span>
  if (a.flag === 'ismp') return <span style={{ background: 'var(--warn)', color: '#111', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>⚠ Error-prone — ISMP</span>
  return null
}

function Card({ a, onPick }: { a: Abbr; onPick: (q: string) => void }) {
  const amb = a.meanings.length > 1
  return (
    <div style={{ border: `1px solid ${a.flag === 'dnu' ? 'var(--err)' : a.flag === 'ismp' ? 'var(--warn)' : 'var(--line)'}`, borderRadius: 10, padding: '10px 14px', marginBottom: 10, background: 'var(--panel)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline' }}>
        <button type="button" onClick={() => onPick(a.abbr)} style={{ fontSize: 22, fontWeight: 800, fontFamily: 'ui-monospace, monospace', background: 'none', border: 'none', color: 'inherit', padding: 0, cursor: 'pointer' }}>{a.abbr}</button>
        <span className="muted" style={{ fontSize: 12 }}>{CATS[a.cat]}</span>
        {amb && <span style={{ border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: 6, padding: '1px 7px', fontSize: 12, fontWeight: 600 }}>Ambiguous · {a.meanings.length} meanings</span>}
        <Badge a={a} />
        <span style={{ flex: 1 }} />
        <CopyButton text={`${a.abbr}: ${a.meanings.join('; ')}`} label="Copy" />
      </div>
      {amb ? (
        <ol style={{ margin: '6px 0 0', paddingLeft: 22 }}>{a.meanings.map((m) => <li key={m}>{m}</li>)}</ol>
      ) : (
        <div style={{ marginTop: 4, fontSize: 16 }}>{a.meanings[0]}</div>
      )}
      {a.note && <div style={{ marginTop: 6, fontSize: 14 }}><b>{a.flag === 'dnu' ? 'Why not / write instead: ' : 'Risk: '}</b>{a.note}</div>}
      {amb && !a.flag && <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>Meaning depends on context — spell it out when it matters.</div>}
    </div>
  )
}

export default function MedicalAbbreviationLookup() {
  const [s, set, reset] = useToolState('medical-abbreviation-lookup', DEF)
  const [limit, setLimit] = useState(30)
  const results = useMemo(() => search(s.q).filter((a) => (s.cat === 'all' || a.cat === s.cat) && (!s.flagged || a.flag)), [s.q, s.cat, s.flagged])
  const findings = useMemo(() => scan(s.text), [s.text])
  const pick = (q: string) => {
    set({ q, mode: 'search', recent: [q, ...s.recent.filter((x) => x !== q)].slice(0, 8) })
    setLimit(30)
  }
  const dnu = ABBRS.filter((a) => a.flag === 'dnu')

  // text with highlighted findings
  const marked: React.ReactNode[] = []
  let pos = 0
  findings.forEach((f, i) => {
    if (f.at > pos) marked.push(s.text.slice(pos, f.at))
    marked.push(<mark key={i} title={f.entry?.note} style={{ background: f.kind === 'dnu' ? 'rgba(239,68,68,.3)' : 'rgba(245,158,11,.35)', color: 'inherit', borderRadius: 3, padding: '0 2px', outline: `1px solid ${f.kind === 'dnu' ? 'var(--err)' : 'var(--warn)'}` }}>{f.text}</mark>)
    pos = f.at + f.text.length
  })
  marked.push(s.text.slice(pos))

  return (
    <Split wide="right">
      <div>
        <Panel title="Find">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['search', '🔎 Look up'], ['check', '📝 Check a note']]} />
          {s.mode === 'search' ? (
            <>
              <input className="k-text" style={{ fontSize: 18, marginTop: 10 }} value={s.q} onChange={(e) => { set({ q: e.target.value }); setLimit(30) }} placeholder="Abbreviation or meaning, e.g. SOB or kidney" aria-label="Search" autoFocus />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {EXAMPLES.map((e) => <Btn key={e} kind="ghost" onClick={() => pick(e)}>{e}</Btn>)}
              </div>
              {s.recent.length > 0 && <p className="muted" style={{ fontSize: 13 }}>Recent: {s.recent.map((r, i) => <span key={r}>{i ? ', ' : ''}<a href="#" onClick={(e) => { e.preventDefault(); pick(r) }}>{r}</a></span>)}</p>}
              <label className="k-field" style={{ marginTop: 8 }}><span className="k-label">Category</span>
                <select className="k-select" value={s.cat} onChange={(e) => set({ cat: e.target.value as Cat | 'all' })}>
                  <option value="all">All categories</option>
                  {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <Check label="Only Do-Not-Use / error-prone" value={s.flagged} onChange={(flagged) => set({ flagged })} />
            </>
          ) : (
            <>
              <textarea className="k-area mono" rows={9} value={s.text} onChange={(e) => set({ text: e.target.value })} style={{ marginTop: 10 }} aria-label="Text to check" />
              <p className="muted" style={{ fontSize: 13 }}>Paste an order or note. Flags Joint Commission “Do Not Use” items (red), ISMP error-prone abbreviations (amber), trailing zeros and missing leading zeros in doses. Nothing leaves your browser.</p>
            </>
          )}
        </Panel>
        <Panel title="Joint Commission “Do Not Use” list">
          <Table head={['Do not use', 'Write instead']} rows={[
            ['U, u (unit)', '“unit”'],
            ['IU (International Unit)', '“International Unit”'],
            ['Q.D., QD, q.d., qd', '“daily”'],
            ['Q.O.D., QOD, q.o.d., qod', '“every other day”'],
            ['Trailing zero (X.0 mg)', 'X mg'],
            ['No leading zero (.X mg)', '0.X mg'],
            ['MS, MSO4, MgSO4', '“morphine sulfate” / “magnesium sulfate”'],
          ]} />
          <p className="muted" style={{ fontSize: 12 }}>A trailing zero may be used only where required to show the precision of a value (e.g. lab results, tube sizes) — never in medication orders.</p>
        </Panel>
      </div>
      <div>
        <Note tone="warn"><b>Reference only.</b> Abbreviations vary between institutions and specialties. Always confirm meaning with the author or your local approved list before acting — never use this tool to interpret a medication order on its own.</Note>
        {s.mode === 'search' ? (
          <>
            <Stats>
              <Stat label="Matches" value={results.length} />
              <Stat label="In dataset" value={ABBRS.length} />
              <Stat label="Do Not Use" value={dnu.length} tone="bad" />
              <Stat label="Error-prone (ISMP)" value={ABBRS.filter((a) => a.flag === 'ismp').length} />
            </Stats>
            <Panel title={s.q ? `Results for “${s.q}”` : 'All abbreviations'} actions={<>
              <CsvButton name="abbreviations.csv" rows={() => [['Abbreviation', 'Meanings', 'Category', 'Flag', 'Note'], ...results.map((a) => [a.abbr, a.meanings.join('; '), CATS[a.cat], a.flag === 'dnu' ? 'Do Not Use' : a.flag === 'ismp' ? 'ISMP error-prone' : '', a.note])]} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>}>
              {results.length === 0 && <Note>No match. Try fewer letters, or search by meaning (e.g. “heart”).</Note>}
              {results.slice(0, limit).map((a) => <Card key={a.abbr} a={a} onPick={pick} />)}
              {results.length > limit && <Btn onClick={() => setLimit(limit + 50)}>Show more ({results.length - limit} left)</Btn>}
            </Panel>
          </>
        ) : (
          <>
            <Stats>
              <Stat label="Do Not Use hits" value={findings.filter((f) => f.kind === 'dnu').length} tone={findings.some((f) => f.kind === 'dnu') ? 'bad' : 'good'} />
              <Stat label="Error-prone hits" value={findings.filter((f) => f.kind === 'ismp').length} />
            </Stats>
            <Panel title="Highlighted text">
              <div className="mono" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: 14 }}>{marked}</div>
            </Panel>
            <Panel title="Findings">
              {findings.length === 0 ? <Note tone="ok">No flagged abbreviations or dose-zero problems found.</Note> : (
                <Table head={['Found', 'Type', 'Problem / write instead']} rows={findings.map((f) => [
                  <b key="t" className="mono">{f.text}</b>,
                  f.kind === 'dnu' ? <span key="k" style={{ color: 'var(--err)', fontWeight: 700 }}>Do Not Use</span> : <span key="k" style={{ color: 'var(--warn)', fontWeight: 700 }}>Error-prone</span>,
                  f.entry?.note ?? '',
                ])} />
              )}
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
