import { useDeferredValue, useMemo } from 'react'
import { Area, Bar, Btn, Check, CopyButton, Note, Panel, pct, Ring, Row, Seg, Split, useToolState } from '../kit'
import { alignSentences, compare, copiedPhrases, diffWords, words, type Op } from './lib/paraphrase-similarity-checker'

const SAMPLES: [string, string, string][] = [
  [
    'Good paraphrase',
    'Photosynthesis is the process by which green plants use sunlight to convert carbon dioxide and water into glucose and oxygen. This process takes place mainly in the chloroplasts of leaf cells. Without it, most life on Earth could not exist.',
    'Plants capture light energy and turn CO2 and water into sugar, releasing oxygen as a by-product. The work happens chiefly inside chloroplasts, the tiny green structures in leaves. Nearly every food chain on the planet depends on this reaction.',
  ],
  [
    'Light paraphrase',
    'The Industrial Revolution began in Britain in the late eighteenth century and transformed manufacturing, transport and daily life. Factories replaced small workshops, and cities grew rapidly as people moved from the countryside in search of work.',
    'The Industrial Revolution started in Britain in the late eighteenth century and changed manufacturing, transport and everyday life. Factories replaced small workshops, and cities grew quickly as people left the countryside looking for jobs.',
  ],
  [
    'Near copy',
    'Sleep plays a vital role in memory consolidation, allowing the brain to strengthen the connections formed during the day.',
    'Sleep plays a crucial role in memory consolidation, allowing the brain to strengthen connections formed during the day.',
  ],
]

const DEF = { src: SAMPLES[0][1], rew: SAMPLES[0][2], synonyms: true, stopwords: false, view: 'side' as 'side' | 'inline' }

const MEASURES: [keyof ReturnType<typeof compare>, string, string][] = [
  ['tri', 'Copied 3-word phrases', 'Share of your 3-grams found verbatim in the source'],
  ['bi', 'Copied word pairs', 'Share of your 2-grams found in the source'],
  ['uni', 'Shared vocabulary', 'Content words (stemmed) reused from the source'],
  ['tfidf', 'TF-IDF cosine', 'Weighted vocabulary similarity; rare words count more'],
  ['rouge', 'ROUGE-L', 'Longest common word subsequence (structure kept in order)'],
  ['chars', 'Character 4-grams', 'Jaccard of letter shingles; catches small spelling tweaks'],
  ['order', 'Word order', 'Do shared words appear in the same order? (1 = identical order)'],
]

const tone = (v: number) => (v >= 0.7 ? 'var(--err)' : v >= 0.45 ? 'var(--warn)' : 'var(--ok)')

function Diff({ ops, side }: { ops: Op[]; side: 'src' | 'rew' | 'both' }) {
  return (
    <div style={{ lineHeight: 1.8, fontSize: 15 }}>
      {ops.map((o, i) => {
        if (o.t === 'eq') return <mark key={i} style={{ background: 'color-mix(in srgb, var(--warn) 30%, transparent)', color: 'inherit', borderRadius: 3, padding: '0 1px' }}>{o.s} </mark>
        if (o.t === 'del' && side !== 'rew') return <span key={i} style={{ color: side === 'both' ? 'var(--err)' : 'var(--muted)', textDecoration: side === 'both' ? 'line-through' : undefined }}>{o.s} </span>
        if (o.t === 'add' && side !== 'src') return <span key={i} style={{ color: side === 'both' ? 'var(--ok)' : undefined, fontWeight: side === 'both' ? 600 : undefined }}>{o.s} </span>
        return null
      })}
    </div>
  )
}

export default function ParaphraseSimilarityChecker() {
  const [s, set, reset] = useToolState('paraphrase-similarity-checker', DEF)
  const src = useDeferredValue(s.src)
  const rew = useDeferredValue(s.rew)
  const tooLong = words(src).length > 3000 || words(rew).length > 3000
  const opts = useMemo(() => ({ synonyms: s.synonyms, stopwords: s.stopwords }), [s.synonyms, s.stopwords])
  const r = useMemo(() => compare(src, rew, opts), [src, rew, opts])
  const ops = useMemo(() => (tooLong ? [] : diffWords(src, rew)), [src, rew, tooLong])
  const phrases = useMemo(() => (tooLong ? [] : copiedPhrases(src, rew, 4)), [src, rew, tooLong])
  const align = useMemo(() => alignSentences(src, rew, opts), [src, rew, opts])
  const wsrc = words(src).length, wrew = words(rew).length
  const kept = ops.filter((o) => o.t === 'eq').reduce((a, o) => a + o.s.split(' ').length, 0)
  const empty = !wsrc || !wrew

  const report = () =>
    [`Paraphrase similarity: ${pct(r.overall, 0)} (${r.verdict})`, ...MEASURES.map(([k, n]) => `${n}: ${pct(r[k] as number, 0)}`), phrases.length ? `Copied phrases: ${phrases.map((p) => `"${p}"`).join('; ')}` : 'No copied phrases of 4+ words.'].join('\n')

  return (
    <div>
      <Split>
        <Panel title={`Source text · ${wsrc} words`} actions={<Btn kind="ghost" onClick={() => set({ src: '', rew: '' })}>Clear</Btn>}>
          <Area value={s.src} onChange={(v) => set({ src: v })} rows={8} placeholder="Paste the original passage…" />
        </Panel>
        <Panel title={`Your rewrite · ${wrew} words`} actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Area value={s.rew} onChange={(v) => set({ rew: v })} rows={8} placeholder="Paste your paraphrase…" />
        </Panel>
      </Split>
      <Row>
        <span className="muted">Examples:</span>
        {SAMPLES.map(([n, a, b]) => (
          <Btn key={n} onClick={() => set({ src: a, rew: b })}>{n}</Btn>
        ))}
        <Check label="Treat common synonyms as equal" value={s.synonyms} onChange={(synonyms) => set({ synonyms })} />
        <Check label="Count stopwords" value={s.stopwords} onChange={(stopwords) => set({ stopwords })} />
      </Row>
      {tooLong && <Note tone="warn">Very long texts (&gt; 3000 words): the diff and phrase search are skipped to keep the page responsive.</Note>}
      {empty ? (
        <Note>Paste both texts to compare them.</Note>
      ) : (
        <Split wide="right">
          <Panel title="Overlap score" actions={<CopyButton text={report} label="Copy report" />}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
              <Ring value={r.overall} size={110} color={tone(r.overall)} />
              <div>
                <b style={{ fontSize: 20, color: tone(r.overall) }}>{r.verdict}</b>
                <div className="muted" style={{ fontSize: 13 }}>{kept} of {wrew} words sit in runs shared with the source</div>
              </div>
            </div>
            {MEASURES.map(([k, n, hint]) => (
              <div key={k} style={{ marginBottom: 8 }} title={hint}>
                <Row wrap={false}>
                  <span style={{ flex: 1 }}>{n}</span>
                  <b>{pct(r[k] as number, 0)}</b>
                </Row>
                <Bar value={r[k] as number} color={k === 'order' ? 'var(--accent)' : tone(r[k] as number)} />
              </div>
            ))}
            <Note tone="info">
              These are <b>lexical</b> measures: they count shared words, phrases and order, not meaning. A rewrite can score low and still copy the
              idea (cite it!), or score high because of unavoidable terms like names and numbers.
            </Note>
          </Panel>
          <div>
            <Panel title="Highlighted overlap" actions={<Seg value={s.view} onChange={(view) => set({ view })} options={[['side', 'Side by side'], ['inline', 'Inline diff']]} />}>
              {s.view === 'side' ? (
                <Split>
                  <div>
                    <h4 style={{ margin: '0 0 4px' }}>Source</h4>
                    <Diff ops={ops} side="src" />
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 4px' }}>Rewrite</h4>
                    <Diff ops={ops} side="rew" />
                  </div>
                </Split>
              ) : (
                <Diff ops={ops} side="both" />
              )}
              <p className="muted" style={{ fontSize: 13 }}>
                <mark style={{ background: 'color-mix(in srgb, var(--warn) 30%, transparent)', color: 'inherit' }}>Highlighted</mark> words are unchanged and in the same order.
                {s.view === 'inline' && <> <span style={{ color: 'var(--err)', textDecoration: 'line-through' }}>removed</span> · <b style={{ color: 'var(--ok)' }}>added</b></>}
              </p>
            </Panel>
            <Panel title={`Copied phrases (4+ words) · ${phrases.length}`}>
              {phrases.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {phrases.slice(0, 12).map((p) => (
                    <li key={p}>“{p}” <span className="muted">· {p.split(' ').length} words</span></li>
                  ))}
                </ul>
              ) : (
                <Note tone="ok">No run of four or more identical words. Nice work.</Note>
              )}
            </Panel>
            <Panel title="Sentence by sentence">
              {align.map((a, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <Row wrap={false}>
                    <span style={{ flex: 1 }}>{a.rewrite}</span>
                    <b style={{ color: tone(a.score), minWidth: 44, textAlign: 'right' }}>{pct(a.score, 0)}</b>
                  </Row>
                  <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>↔ {a.source && a.score > 0 ? a.source : 'no source sentence shares content words'}</div>
                </div>
              ))}
            </Panel>
          </div>
        </Split>
      )}
    </div>
  )
}
