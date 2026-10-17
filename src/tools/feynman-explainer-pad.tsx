import { useMemo, useState } from 'react'
import { Area, Btn, Check, JsonButtons, Note, Panel, Ring, Row, Select, Slider, Split, Stat, Stats, Txt, download, num, today, uid, useToolState } from '../kit'
import { analyze, flagged, freLabel, tokenize, type Flag } from './lib/feynman-explainer-pad'

interface Gap { id: string; text: string; done: boolean }
interface Pad { id: string; topic: string; text: string; gaps: Gap[]; updated: string }
interface State { pads: Pad[]; cur: string; custom: string; acronyms: boolean; long: boolean; longSyl: number; target: number }

const SAMPLE: Pad = {
  id: 'vaccines', topic: 'How vaccines work', updated: today(),
  text: `A vaccine is like a wanted poster for a germ. It shows your body what the bad guy looks like before it ever shows up for real.

Inside the vaccine there is a harmless piece of the germ, or instructions (mRNA) that let your cells make that piece. Your immune system sees it and leverages its adaptive immunity to synthesize antibodies against the antigen.

Later, if the real germ arrives, your body already recognises it. It can fight back fast, so you get less sick or not sick at all. That is why we get vaccines before an outbreak, not during it.`,
  gaps: [
    { id: 'g1', text: 'Why do some vaccines need boosters while others last for life?', done: false },
    { id: 'g2', text: 'Explain "antibodies" without the word — maybe "tiny tags that stick to the germ"?', done: false },
    { id: 'g3', text: 'Check: does mRNA ever enter the cell nucleus? (No — find a simple way to say it.)', done: true },
  ],
}
const DEF: State = { pads: [SAMPLE], cur: 'vaccines', custom: 'synthesize, adaptive', acronyms: true, long: true, longSyl: 4, target: 6 }
const COL: Record<Exclude<Flag, null>, string> = { jargon: 'rgba(239,68,68,.25)', acronym: 'rgba(245,158,11,.3)', long: 'rgba(14,165,233,.22)' }
const NAME: Record<Exclude<Flag, null>, string> = { jargon: 'Jargon', acronym: 'Acronym', long: 'Long word' }
const STEPS = ['Pick a concept and write its name at the top.', 'Explain it in plain words, as if to a 12-year-old.', 'Where you got stuck or reached for jargon is a gap — note it, go back to the source.', 'Simplify: shorter sentences, everyday words, an analogy.']

export default function FeynmanExplainerPad() {
  const [s, set, reset] = useToolState('feynman-explainer-pad', DEF)
  const [gap, setGap] = useState('')
  const pad = s.pads.find((p) => p.id === s.cur) ?? s.pads[0]
  const opts = useMemo(() => ({ custom: s.custom.split(/[,\n]/), acronyms: s.acronyms, long: s.long, longSyl: s.longSyl }), [s.custom, s.acronyms, s.long, s.longSyl])
  const text = pad?.text ?? ''
  const st = useMemo(() => analyze(text), [text])
  const toks = useMemo(() => tokenize(text, opts), [text, opts])
  const terms = useMemo(() => flagged(text, opts), [text, opts])
  const jargonCount = terms.filter((t) => t.flag !== 'long').reduce((a, t) => a + t.count, 0)

  const editPad = (p: Partial<Pad>) => set({ pads: s.pads.map((x) => (x.id === pad.id ? { ...x, ...p, updated: today() } : x)) })
  const addGap = (t: string) => t.trim() && editPad({ gaps: [...pad.gaps, { id: uid(), text: t.trim(), done: false }] })
  const newPad = () => {
    const p: Pad = { id: uid(), topic: 'New concept', text: '', gaps: [], updated: today() }
    set({ pads: [...s.pads, p], cur: p.id })
  }
  const exportMd = () => {
    const md = `# ${pad.topic}\n\n${pad.text}\n\n## Knowledge gaps\n${pad.gaps.map((g) => `- [${g.done ? 'x' : ' '}] ${g.text}`).join('\n')}\n\n_Reading ease ${num(st.fre, 0)} · grade ${num(st.fk, 1)}_\n`
    download(`${pad.topic.replace(/\W+/g, '-').toLowerCase() || 'explanation'}.md`, md, 'text/markdown')
  }
  if (!pad) return <Btn onClick={reset}>Reset</Btn>

  const gradeOk = st.fk <= s.target
  const ease = Math.max(0, Math.min(100, st.fre)) / 100
  return (
    <Split wide="left">
      <div>
        <Panel title="Explanation" actions={<><Select label="" value={pad.id} onChange={(cur) => set({ cur })} options={s.pads.map((p) => [p.id, p.topic || 'Untitled'] as [string, string])} /><Btn onClick={newPad}>+ New</Btn></>}>
          <Txt label="Concept" value={pad.topic} onChange={(topic) => editPad({ topic })} placeholder="e.g. Compound interest" />
          <Area value={pad.text} onChange={(t) => editPad({ text: t })} rows={11} placeholder="Explain it as if to a curious 12-year-old…" />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Autosaved in this browser · last edit {pad.updated}</p>
        </Panel>
        <Panel title="Review" actions={<span style={{ fontSize: 12 }}>{(Object.keys(COL) as Exclude<Flag, null>[]).map((k) => <span key={k} style={{ background: COL[k], padding: '1px 6px', borderRadius: 4, marginLeft: 6 }}>{NAME[k]}</span>)}</span>}>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 16 }}>
            {toks.map(([t, f], i) => f ? <mark key={i} title={`${NAME[f]} — click to add a gap note`} onClick={() => addGap(`Explain "${t}" in plain words`)} style={{ background: COL[f], color: 'inherit', borderRadius: 3, padding: '0 2px', cursor: 'pointer' }}>{t}</mark> : <span key={i}>{t}</span>)}
          </div>
          {st.longSentences.length > 0 && <Note tone="warn">{st.longSentences.length} sentence(s) over 25 words — try splitting: “{st.longSentences[0].slice(0, 90)}{st.longSentences[0].length > 90 ? '…' : ''}”</Note>}
        </Panel>
        <Panel title="Knowledge gaps" actions={<span className="muted">{pad.gaps.filter((g) => !g.done).length} open</span>}>
          <Row wrap={false}>
            <div style={{ flex: 1 }}><Txt label="" value={gap} onChange={setGap} placeholder="Where did you get stuck? What would a kid ask next?" /></div>
            <Btn kind="primary" onClick={() => { addGap(gap); setGap('') }} disabled={!gap.trim()}>Add</Btn>
          </Row>
          {pad.gaps.map((g) => (
            <div key={g.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)' }}>
              <input type="checkbox" checked={g.done} aria-label="Resolved" onChange={() => editPad({ gaps: pad.gaps.map((x) => (x.id === g.id ? { ...x, done: !x.done } : x)) })} />
              <span style={{ flex: 1, textDecoration: g.done ? 'line-through' : undefined, opacity: g.done ? 0.6 : 1 }}>{g.text}</span>
              <Btn kind="ghost" onClick={() => editPad({ gaps: pad.gaps.filter((x) => x.id !== g.id) })}>✕</Btn>
            </div>
          ))}
          {!pad.gaps.length && <p className="muted">No gaps yet. Click any highlighted word to add one.</p>}
        </Panel>
      </div>
      <div>
        <Panel title="Readability">
          <Row>
            <Ring value={ease} size={110} color={st.fre >= 60 ? 'var(--ok)' : st.fre >= 40 ? 'var(--warn)' : 'var(--err)'} label={<span style={{ textAlign: 'center' }}><b style={{ fontSize: 22 }}>{num(st.fre, 0)}</b><br /><small>ease</small></span>} />
            <div style={{ flex: 1 }}>
              <b>{freLabel(st.fre)}</b>
              <p className="muted" style={{ margin: '4px 0' }}>Flesch Reading Ease (0–100, higher is easier). Aim for 70+ when explaining to a beginner.</p>
            </div>
          </Row>
          <Stats>
            <Stat label="Grade level" value={num(st.fk, 1)} sub={`Flesch–Kincaid · target ≤ ${s.target}`} tone={gradeOk ? 'good' : 'bad'} />
            <Stat label="Gunning fog" value={num(st.fog, 1)} sub="years of schooling" />
            <Stat label="Jargon & acronyms" value={jargonCount} tone={jargonCount ? 'bad' : 'good'} />
            <Stat label="Words" value={st.words} sub={`${st.sentences} sentences · ${num(st.wps, 1)} w/s`} />
          </Stats>
          <Slider label="Target grade" value={s.target} onChange={(target) => set({ target })} min={3} max={12} />
        </Panel>
        <Panel title="Flagged terms">
          {terms.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {terms.slice(0, 40).map((t) => (
                <button key={t.term} type="button" className="k-btn" style={{ background: COL[t.flag], padding: '4px 8px' }} title={`${NAME[t.flag]} · click to add a gap note`} onClick={() => addGap(`Explain "${t.term}" in plain words`)}>
                  {t.term}{t.count > 1 && <small> ×{t.count}</small>}
                </button>
              ))}
            </div>
          ) : <Note tone="ok">No jargon spotted. A kid could follow this!</Note>}
        </Panel>
        <Panel title="Detection settings" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label="My jargon words (comma-separated)" value={s.custom} onChange={(custom) => set({ custom })} hint="Terms from your field that a beginner wouldn’t know." />
          <Check label="Flag ALL-CAPS acronyms" value={s.acronyms} onChange={(acronyms) => set({ acronyms })} />
          <Check label="Flag long words" value={s.long} onChange={(long) => set({ long })} />
          {s.long && <Slider label="Long word = syllables ≥" value={s.longSyl} onChange={(longSyl) => set({ longSyl })} min={3} max={6} />}
        </Panel>
        <Panel title="The Feynman technique">
          <ol style={{ margin: 0, paddingLeft: 20 }}>{STEPS.map((x) => <li key={x} style={{ marginBottom: 4 }}>{x}</li>)}</ol>
        </Panel>
        <Panel title="Save">
          <Row>
            <Btn onClick={exportMd}>⬇ Markdown</Btn>
            <JsonButtons name="feynman-pads.json" data={s} onLoad={(d) => d && Array.isArray(d.pads) && set(d)} />
            <Btn kind="danger" disabled={s.pads.length < 2} onClick={() => { const rest = s.pads.filter((p) => p.id !== pad.id); set({ pads: rest, cur: rest[0].id }) }}>Delete pad</Btn>
          </Row>
        </Panel>
      </div>
    </Split>
  )
}
