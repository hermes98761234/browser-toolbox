import { useMemo } from 'react'
import { Area, Bar, Btn, Check, CopyButton, download, FileDrop, Note, Panel, pct, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { summarize, wordCount, type Method } from './lib/text-summarizer'

const SAMPLE = `Cities around the world are planting trees at a pace not seen in decades. Urban forests, once treated as decoration, are now viewed as essential infrastructure that cools streets, cleans air and manages stormwater.

The cooling effect is the main driver. On a summer afternoon, a shaded street can be several degrees cooler than an exposed one, because leaves block sunlight and release water vapour. Researchers measuring surface temperatures in Phoenix found that asphalt under a tree canopy was more than 20 °C cooler than asphalt in full sun. During heat waves, that difference can reduce hospital admissions among older residents.

Trees also intercept rain. A mature canopy can hold a large share of a light shower on its leaves and bark, slowing the water that reaches drains. Cities with combined sewer systems value this, since heavy storms can overwhelm treatment plants and push raw sewage into rivers. Planting trees is often cheaper than building larger pipes.

Air quality benefits are real but more modest than many campaigns suggest. Leaves capture fine particles and absorb some ozone, yet the effect on a whole city's air is usually a few percent. Some species even emit compounds that contribute to ozone formation on hot days, so planners now choose species carefully.

The hardest problem is survival. Young street trees face compacted soil, road salt, vandalism and drought, and in many cities a large fraction die within the first few years. Programs that fund watering and maintenance for at least three years see much higher survival rates than programs that only pay for planting.

Equity has become a central concern. Satellite studies show that low-income neighbourhoods often have far less canopy than wealthy ones, and they are measurably hotter as a result. Several cities now direct new planting to the hottest and least shaded blocks first, and they hire local residents to care for the trees.

Urban forests take decades to mature, so today's decisions shape the climate of streets for the rest of the century. The cities seeing the best results treat trees like any other public asset: they inventory them, budget for their upkeep, and measure the services they provide.`

const DEF = { text: SAMPLE, method: 'textrank' as Method, mode: 'pct' as 'pct' | 'n', pct: 25, n: 4, lead: false, mmr: true, show: 'highlight' as 'highlight' | 'summary' }

export default function TextSummarizer() {
  const [s, set, reset] = useToolState('text-summarizer', DEF)
  const pre = useMemo(() => summarize(s.text, { method: s.method, count: 1, lead: false, mmr: false }).sentences.length, [s.text, s.method])
  const count = s.mode === 'n' ? Math.min(s.n, pre) : Math.max(1, Math.round((pre * s.pct) / 100))
  const r = useMemo(() => summarize(s.text, { method: s.method, count, lead: s.lead, mmr: s.mmr }), [s.text, s.method, count, s.lead, s.mmr])
  const summary = r.chosen.map((i) => r.sentences[i]).join(' ')
  const wIn = wordCount(s.text), wOut = wordCount(summary)
  const chosen = new Set(r.chosen)

  return (
    <Split wide="right">
      <div>
        <Panel title="Text" actions={<><Btn kind="ghost" onClick={() => set({ text: SAMPLE })}>Sample</Btn><Btn kind="ghost" onClick={() => set({ text: '' })}>Clear</Btn></>}>
          <Area value={s.text} onChange={(text) => set({ text })} rows={14} placeholder="Paste an article, report or notes (a few paragraphs or more works best)…" />
          <FileDrop accept=".txt,.md,text/plain" label="…or drop a .txt / .md file" onFiles={async ([f]) => set({ text: await f.text() })} />
        </Panel>
        <Panel title="Settings">
          <div className="k-label">Algorithm</div>
          <Seg value={s.method} onChange={(method) => set({ method })} options={[['textrank', 'TextRank (graph)'], ['tfidf', 'TF-IDF (term weight)']]} />
          <p className="muted" style={{ fontSize: 13 }}>{s.method === 'textrank' ? 'Builds a graph where sentences sharing important words are linked, then ranks them with PageRank: central sentences win.' : 'Scores each sentence by how many document-wide important words (frequent here, rare across sentences) it contains.'}</p>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['pct', 'Percent of sentences'], ['n', 'Fixed number']]} />
          {s.mode === 'pct' ? <Slider label="Summary length" value={s.pct} onChange={(v) => set({ pct: v })} min={5} max={60} step={5} unit="%" show={(v) => String(v)} /> : <Slider label="Sentences" value={s.n} onChange={(n) => set({ n })} min={1} max={Math.max(1, Math.min(20, pre))} step={1} show={(v) => String(v)} />}
          <Check label="Reduce redundancy (MMR): skip sentences that repeat already chosen ones" value={s.mmr} onChange={(mmr) => set({ mmr })} />
          <Check label="Lead bias: favour early sentences (good for news articles)" value={s.lead} onChange={(lead) => set({ lead })} />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Sentences" value={`${r.chosen.length} / ${r.sentences.length}`} tone="accent" />
          <Stat label="Words" value={`${wOut} / ${wIn}`} sub={wIn ? `${pct(1 - wOut / wIn, 0)} shorter` : ''} />
          <Stat label="Reading time" value={`${Math.max(1, Math.round(wOut / 230))} min`} sub={`was ${Math.max(1, Math.round(wIn / 230))} min`} />
        </Stats>
        {r.sentences.length < 3 && <Note tone="warn">Extractive summaries need several sentences to choose from. Paste a longer text.</Note>}
        <Panel title="Summary" actions={<><CopyButton text={summary} /><Btn onClick={() => download('summary.txt', summary + '\n')}>⬇ .txt</Btn></>}>
          <p style={{ lineHeight: 1.65, marginTop: 0 }}>{summary || <span className="muted">No text yet.</span>}</p>
          <Note>Extractive summary: these are the original sentences, chosen by a statistical score and kept in their original order. Nothing is rewritten or interpreted, so check that key context (numbers, negations, who said what) survived.</Note>
        </Panel>
        {r.keywords.length > 0 && (
          <Panel title="Key terms">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {r.keywords.map(([w, v], i) => <span key={w} style={{ padding: '3px 10px', borderRadius: 999, background: 'color-mix(in srgb, var(--accent) 14%, transparent)', fontSize: 13 + Math.max(0, 4 - i / 3), fontWeight: 600 }} title={`weight ${v.toFixed(1)}`}>{w}</span>)}
            </div>
          </Panel>
        )}
        <Panel title="Sentence scores" actions={<Seg value={s.show} onChange={(show) => set({ show })} options={[['highlight', 'All'], ['summary', 'Chosen only']]} />}>
          {r.sentences.map((t, i) => (!chosen.has(i) && s.show === 'summary' ? null : (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, padding: '6px 4px', borderBottom: '1px solid var(--line)', background: chosen.has(i) ? 'color-mix(in srgb, #f59e0b 14%, transparent)' : undefined, borderRadius: 4 }}>
              <div style={{ fontSize: 12 }}><b>{Math.round(r.scores[i] * 100)}</b><Bar value={r.scores[i]} color={chosen.has(i) ? '#f59e0b' : 'var(--muted)'} /></div>
              <span style={{ fontSize: 14, opacity: chosen.has(i) ? 1 : 0.7 }}>{t}</span>
            </div>
          )))}
          <p className="muted" style={{ fontSize: 12 }}>Scores are relative (best sentence = 100). Highlighted sentences form the summary{s.mmr ? '; with MMR a lower-scoring sentence can replace a near-duplicate' : ''}.</p>
        </Panel>
      </div>
    </Split>
  )
}
