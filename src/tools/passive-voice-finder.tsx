import { useMemo, type ReactNode } from 'react'
import { Area, Btn, Check, CopyButton, Note, Panel, Split, Stat, Stats, useToolState } from '../kit'
import { analyze, flesch, sentences, tokenize, type Hit, type Kind } from './lib/passive-voice-finder'

const SAMPLE = `The new policy was announced by the board on Monday. It was really quite surprising to most of the staff, and several concerns were raised almost immediately.

Mistakes were made during the rollout. The documents had been badly prepared, and the deadline was simply ignored. I think the team was tired, and it seems the plan was never properly reviewed by legal.

Next quarter, we will publish clear guidelines. Managers should explain the changes to their teams, and HR will answer questions every Friday.`

interface State { text: string; show: Record<Kind, boolean> }
const DEF: State = { text: SAMPLE, show: { passive: true, adjectival: true, adverb: true, hedge: true } }

const STYLE: Record<Kind, { bg: string; line: string; label: string; tip: (h: Hit) => string }> = {
  passive: { bg: 'rgba(239,68,68,.16)', line: '#ef4444', label: 'Passive voice', tip: (h) => (h.agent ? `Make “${h.agent}” the subject and use an active verb.` : 'Who did it? Name the actor and make it the subject.') },
  adjectival: { bg: 'rgba(245,158,11,.16)', line: '#f59e0b', label: 'Maybe passive (adjective-like)', tip: () => 'Often fine (“I am tired”). Check whether someone did this.' },
  adverb: { bg: 'rgba(99,102,241,.16)', line: '#6366f1', label: 'Weak adverb', tip: (h) => `Cut “${h.text}” or choose a stronger verb or adjective.` },
  hedge: { bg: 'rgba(16,185,129,.16)', line: '#10b981', label: 'Hedge', tip: () => 'Hedging weakens your point. State it directly.' },
}

export default function PassiveVoiceFinder() {
  const [s, set, reset] = useToolState('passive-voice-finder', DEF)
  const all = useMemo(() => analyze(s.text), [s.text])
  const hits = all.filter((h) => s.show[h.kind])
  const words = tokenize(s.text).length
  const sents = sentences(s.text)
  const passiveSents = sents.filter((x) => analyze(x).some((h) => h.kind === 'passive')).length
  const count = (k: Kind) => all.filter((h) => h.kind === k).length
  const passPct = sents.length ? passiveSents / sents.length : 0
  const advPer100 = words ? (count('adverb') / words) * 100 : 0
  const fre = flesch(s.text)
  const grade = fre >= 70 ? 'Easy' : fre >= 50 ? 'Fairly hard' : fre >= 30 ? 'Hard' : 'Very hard'

  const marked: ReactNode[] = []
  let pos = 0
  hits.forEach((h, i) => {
    if (h.start < pos) return
    if (h.start > pos) marked.push(s.text.slice(pos, h.start))
    const st = STYLE[h.kind]
    marked.push(
      <mark key={i} title={`${st.label}: ${st.tip(h)}`} style={{ background: st.bg, color: 'inherit', borderBottom: `2px solid ${st.line}`, borderRadius: 3, padding: '0 1px' }}>
        {s.text.slice(h.start, h.end)}
      </mark>,
    )
    pos = h.end
  })
  marked.push(s.text.slice(pos))

  const report = () =>
    [`Passive sentences: ${passiveSents}/${sents.length} (${Math.round(passPct * 100)}%)`, `Weak adverbs: ${count('adverb')} (${advPer100.toFixed(1)} per 100 words)`, `Flesch reading ease: ${fre.toFixed(0)}`, '', ...hits.map((h) => `- [${STYLE[h.kind].label}] "${h.text}": ${STYLE[h.kind].tip(h)}`)].join('\n')

  return (
    <Split>
      <div>
        <Panel title="Your text" actions={<><Btn kind="ghost" onClick={() => set({ text: '' })}>Clear</Btn><Btn kind="ghost" onClick={reset}>Sample</Btn></>}>
          <Area value={s.text} onChange={(text) => set({ text })} rows={16} placeholder="Paste or type your text here…" />
          <p className="muted" style={{ fontSize: 13 }}>{words} words · {sents.length} sentences · analysed in your browser</p>
        </Panel>
        <Panel title="Highlight">
          {(Object.keys(STYLE) as Kind[]).map((k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Check label={<span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: STYLE[k].bg, border: `2px solid ${STYLE[k].line}`, marginRight: 6, verticalAlign: -1 }} />{STYLE[k].label}</span>} value={s.show[k]} onChange={(v) => set({ show: { ...s.show, [k]: v } })} />
              <b style={{ marginLeft: 'auto' }}>{count(k)}</b>
            </div>
          ))}
          <Note>
            Passive voice = a form of <i>be</i> or <i>get</i> + past participle (“was written”, “got fired”), with optional adverbs in between. It is not always wrong. Use it when the actor is unknown or unimportant. Aim for under 10% passive sentences in most writing.
          </Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Passive sentences" value={`${passiveSents} / ${sents.length}`} sub={`${Math.round(passPct * 100)}% (aim < 10%)`} tone={passPct > 0.1 ? 'bad' : 'good'} />
          <Stat label="Weak adverbs" value={count('adverb')} sub={`${advPer100.toFixed(1)} per 100 words`} tone={advPer100 > 2 ? 'bad' : 'good'} />
          <Stat label="Reading ease" value={fre.toFixed(0)} sub={`Flesch · ${grade}`} tone="accent" />
        </Stats>
        <Panel title="Marked text" actions={<CopyButton text={report} label="Copy report" />}>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: 16 }}>{s.text ? marked : <span className="muted">Nothing to analyse yet.</span>}</div>
        </Panel>
        <Panel title={`Suggestions (${hits.length})`}>
          {hits.length === 0 && <Note tone="ok">No issues found. Clear, active writing!</Note>}
          {hits.slice(0, 60).map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: STYLE[h.kind].line, minWidth: 92, textTransform: 'uppercase' }}>{STYLE[h.kind].label.replace(' (adjective-like)', '?')}</span>
              <span>
                <b>“{h.text}”</b> <span className="muted">{STYLE[h.kind].tip(h)}</span>
              </span>
            </div>
          ))}
          {hits.length > 60 && <p className="muted">…and {hits.length - 60} more.</p>}
        </Panel>
      </div>
    </Split>
  )
}
