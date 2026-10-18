import { useMemo, useState, type ReactNode } from 'react'
import { BarChart, Btn, CopyButton, CsvButton, Note, Panel, Row, Select, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { analyze, consensus, gradeLabel, hardWords, heat, replaceWord, sentenceGrade, sentences, targetSpw, targetWps, type Report } from './lib/readability-analyzer'
import { freBand } from './lib/readability-scorer'

const ORIGINAL = `Volcanoes are fundamentally openings in the planet's crust through which molten rock, gases, and fragmented material are expelled. Approximately eighty percent of the Earth's surface originated from volcanic activity, and numerous islands were generated exclusively by successive eruptions. Consequently, scientists endeavor to monitor seismic variations continuously, because a substantial increase in small earthquakes frequently indicates that magma is accumulating beneath the surface. Nevertheless, determining the precise moment of an eruption remains exceedingly difficult, and communities situated adjacent to active volcanoes must establish comprehensive evacuation procedures.`

const REVISED = `A volcano is an opening in the Earth's crust. Hot melted rock, gas, and ash come out of it. About eighty percent of the Earth's surface was made by volcanoes, and many islands were built by eruption after eruption. Scientists watch for small earthquakes all the time, because a big rise in them often shows that magma is collecting underground. Nevertheless, determining the precise moment of an eruption remains exceedingly difficult, so towns near active volcanoes need clear plans to leave quickly.`

const NEWSLETTER = `Dear families, our annual science fair will commence on Friday afternoon in the gymnasium. Participation is voluntary, but we strongly encourage every student to demonstrate an experiment, a model, or a research poster. Projects should be delivered to the classroom no later than Thursday morning so that teachers can verify that all materials are appropriate and safe. Refreshments will be available, and we anticipate a substantial turnout, so please arrive early to obtain seating.`

interface State { text: string; orig: string; target: number }
const DEF: State = { text: REVISED, orig: ORIGINAL, target: 6 }

const GRADES: [number, string][] = [[2, 'Grade 2'], [3, 'Grade 3'], [4, 'Grade 4'], [5, 'Grade 5'], [6, 'Grade 6'], [7, 'Grade 7'], [8, 'Grade 8 (plain English)'], [9, 'Grade 9'], [10, 'Grade 10'], [11, 'Grade 11'], [12, 'Grade 12'], [14, 'College'], [16, 'Graduate']]

const heatBg = (h: number) => `hsla(${130 - 130 * h}, 80%, 50%, ${0.16 + h * 0.22})`

const METRICS: [string, (r: Report) => number, number, 'lower' | 'higher'][] = [
  ['Consensus grade', consensus, 1, 'lower'],
  ['Flesch–Kincaid grade', (r) => r.fk, 1, 'lower'],
  ['Flesch Reading Ease', (r) => r.fre, 1, 'higher'],
  ['Gunning Fog', (r) => r.fog, 1, 'lower'],
  ['SMOG', (r) => r.smog, 1, 'lower'],
  ['Coleman–Liau', (r) => r.cli, 1, 'lower'],
  ['ARI', (r) => r.ari, 1, 'lower'],
  ['Words per sentence', (r) => r.avgWps, 1, 'lower'],
  ['Syllables per word', (r) => r.avgSpw, 2, 'lower'],
  ['Complex words %', (r) => (r.words ? (100 * r.complex) / r.words : NaN), 1, 'lower'],
  ['Words', (r) => r.words, 0, 'lower'],
]

export default function ReadabilityAnalyzer() {
  const [s, set, reset] = useToolState('readability-analyzer', DEF)
  const [focus, setFocus] = useState<number | null>(null)
  const r = useMemo(() => analyze(s.text), [s.text])
  const ro = useMemo(() => analyze(s.orig), [s.orig])
  const ss = useMemo(() => sentences(s.text).map((x) => ({ ...x, grade: sentenceGrade(x) })), [s.text])
  const hard = useMemo(() => hardWords(s.text), [s.text])
  const g = consensus(r)
  const gap = g - s.target
  const needWps = targetWps(s.target, r.avgSpw)
  const needSpw = targetSpw(s.target, Math.min(r.avgWps, 20))
  const maxLen = Math.max(8, Math.round(needWps))
  const over = ss.filter((x) => x.grade > s.target + 1)
  const [band] = freBand(r.fre)

  // heat-map: sentences laid over the original text with gaps preserved
  const pieces: ReactNode[] = []
  let at = 0
  ss.forEach((x, i) => {
    if (x.start > at) pieces.push(<span key={`g${i}`}>{s.text.slice(at, x.start)}</span>)
    const h = heat(x.grade, s.target)
    pieces.push(
      <span key={i} title={`Sentence ${i + 1}: grade ${num(x.grade, 1)}, ${x.words.length} words`} onMouseEnter={() => setFocus(i)} onMouseLeave={() => setFocus(null)}
        style={{ background: heatBg(h), borderRadius: 4, padding: '1px 0', outline: focus === i ? '2px solid var(--accent)' : undefined, cursor: 'help' }}>
        {s.text.slice(x.start, x.end)}
      </span>,
    )
    at = x.end
  })
  if (at < s.text.length) pieces.push(<span key="tail">{s.text.slice(at)}</span>)

  return (
    <Split wide="right">
      <div>
        <Panel title="Target & text" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Target reading level" value={s.target} onChange={(target) => set({ target })} options={GRADES} />
          <label className="k-field">
            <span className="k-label">Your text (revision)</span>
            <textarea className="k-area" rows={12} value={s.text} onChange={(e) => set({ text: e.target.value })} placeholder="Paste or type the text you want to pitch at the target grade…" />
          </label>
          <Row>
            <Btn onClick={() => set({ text: REVISED, orig: ORIGINAL })}>Sample: volcano explainer</Btn>
            <Btn onClick={() => set({ text: NEWSLETTER, orig: NEWSLETTER })}>Sample: school newsletter</Btn>
            <CopyButton text={s.text} label="Copy text" />
          </Row>
        </Panel>
        <Panel title="Hard & long words" actions={<CsvButton name="hard-words.csv" rows={() => [['Word', 'Count', 'Syllables', 'Suggestions'], ...hard.map((h) => [h.word, h.count, h.syl, h.suggest.join(' / ')])]} />}>
          {hard.length === 0 ? (
            <Note tone="ok">No words of three or more syllables. Nice and plain.</Note>
          ) : (
            <Table
              head={['Word', '×', 'Syl.', 'Try instead']}
              max={25}
              rows={hard.map((h) => [
                <b key="w">{h.word}</b>,
                h.count,
                h.syl,
                <span key="s" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {h.suggest.length ? h.suggest.map((x) => (
                    <button key={x} type="button" className="k-btn" style={{ padding: '2px 8px', fontSize: 12 }} title={`Replace every “${h.word}” with “${x}”`} onClick={() => set({ text: replaceWord(s.text, h.word, x) })}>→ {x}</button>
                  )) : <span className="muted">rephrase or explain</span>}
                </span>,
              ])}
            />
          )}
          <p className="muted" style={{ fontSize: 13 }}>Click a suggestion to replace every occurrence. Some long words (names, key terms) are fine — define them once instead.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Reading level" value={gradeLabel(g)} sub={`consensus ${num(g, 1)} of 5 formulas`} tone={gap <= 0.5 ? 'good' : gap > 2 ? 'bad' : 'accent'} />
          <Stat label="vs target" value={`${gap > 0 ? '+' : ''}${num(gap, 1)}`} sub={`target ${gradeLabel(s.target)}`} tone={gap <= 0.5 ? 'good' : 'bad'} />
          <Stat label="Flesch Reading Ease" value={num(r.fre, 0)} sub={band} />
          <Stat label="Avg sentence" value={`${num(r.avgWps, 1)} words`} sub={`${r.sentences} sentences · ${r.words} words`} />
        </Stats>
        {r.words > 0 && (gap <= 0.5 ? (
          <Note tone="ok">On target: this text reads at about {gradeLabel(g).toLowerCase()} — {gradeLabel(s.target).toLowerCase()} or below. {over.length ? `${over.length} sentence${over.length > 1 ? 's are' : ' is'} still above target; see the heat-map.` : ''}</Note>
        ) : (
          <Note tone="warn">
            To reach {gradeLabel(s.target).toLowerCase()}: with your current word choice ({num(r.avgSpw, 2)} syllables/word), sentences should average <b>{needWps > 3 ? `≤ ${num(needWps, 0)} words` : 'very few words — simplify the vocabulary first'}</b> (now {num(r.avgWps, 1)}).
            {' '}Or keep sentences near {num(Math.min(r.avgWps, 20), 0)} words and cut word length to <b>{needSpw > 1 ? `≤ ${num(needSpw, 2)} syllables/word` : 'one-syllable words (not realistic) — shorten sentences too'}</b>.
            {over.length > 0 && ` Start with the ${over.length} red/orange sentence${over.length > 1 ? 's' : ''}.`}
          </Note>
        ))}
        <Panel title="Sentence difficulty heat-map">
          <div style={{ lineHeight: 1.9, fontSize: 15, whiteSpace: 'pre-wrap' }}>{pieces.length ? pieces : <span className="muted">Type some text to see it here.</span>}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 8 }} className="muted">
            <span>at/below target</span>
            <span style={{ flex: '0 0 160px', height: 10, borderRadius: 5, background: `linear-gradient(90deg, ${heatBg(0)}, ${heatBg(0.5)}, ${heatBg(1)})` }} />
            <span>4+ grades above</span>
          </div>
        </Panel>
        <Panel title={`Sentence length (words) — aim for ≤ ${maxLen} at this target`}>
          <BarChart height={200} fy={(v) => num(v, 0)} bars={ss.map((x, i) => ({ label: String(i + 1), value: x.words.length, color: x.words.length > maxLen ? '#ef4444' : focus === i ? '#6366f1' : '#10b981' }))} />
        </Panel>
        <Panel title="Revision compare" actions={<><Btn onClick={() => set({ orig: s.text })}>Use current text as original</Btn></>}>
          <Row>
            <label className="k-field" style={{ flex: 1, minWidth: 220 }}>
              <span className="k-label">Original</span>
              <textarea className="k-area" rows={5} value={s.orig} onChange={(e) => set({ orig: e.target.value })} />
            </label>
            <label className="k-field" style={{ flex: 1, minWidth: 220 }}>
              <span className="k-label">Revision (editor above)</span>
              <textarea className="k-area" rows={5} value={s.text} onChange={(e) => set({ text: e.target.value })} />
            </label>
          </Row>
          <Table
            head={['Metric', 'Original', 'Revision', 'Change']}
            rows={METRICS.map(([name, f, d, better]) => {
              const a = f(ro), b = f(r), dlt = b - a
              const good = Math.abs(dlt) < 1e-9 || name === 'Words' ? undefined : (better === 'lower' ? dlt < 0 : dlt > 0)
              return [name, num(a, d), num(b, d), <b key="d" style={{ color: good === undefined ? 'var(--muted)' : good ? 'var(--ok)' : 'var(--err)' }}>{Number.isFinite(dlt) ? `${dlt > 0 ? '+' : ''}${num(dlt, d)}` : '—'}</b>]
            })}
          />
        </Panel>
      </div>
    </Split>
  )
}
