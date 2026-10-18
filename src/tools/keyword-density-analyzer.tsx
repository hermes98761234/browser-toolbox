import { useMemo, type ReactNode } from 'react'
import { Area, Bar, Btn, Check, CsvButton, Note, Num, Panel, pct, Row, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { focus, level, ngrams, sentencesOfWords, type Gram } from './lib/keyword-density-analyzer'

const SAMPLE = `Rainwater Harvesting for a Small Garden

Collecting rainwater is one of the simplest ways to make a garden more resilient. A single rain barrel under a downspout can capture hundreds of litres from a modest roof during one summer storm, and that rainwater is soft, free of chlorine and close to room temperature, which most plants appreciate.

Start by measuring the roof area that drains into the gutter you plan to use. Every square metre of roof sheds roughly one litre of water for each millimetre of rain, so a twenty square metre shed roof can fill a 200 litre rain barrel after a ten millimetre shower. Choose a rain barrel with a tight lid and a fine mesh screen to keep out leaves and mosquitoes.

Place the rain barrel on a sturdy, level stand. Raising it half a metre gives enough pressure for a watering can or a slow drip line. If you want more storage, link two or three barrels with a short overflow hose so that the first barrel fills the next one.

Use harvested rainwater on vegetables, flower beds and potted plants, ideally in the early morning. Avoid using roof water on leafy greens shortly before harvest if your roof has old coatings, and clean the gutters each spring. With a little planning, rainwater harvesting can cover much of the watering a small garden needs in a typical summer.`

const DEF = { text: SAMPLE, n: '1' as '1' | '2' | '3' | 'all', stop: true, minLen: 3, numbers: false, extra: '', minCount: 2, key: 'rainwater', sort: 'count' as keyof Gram, desc: true }

function highlight(text: string, phrase: string): ReactNode[] {
  const words = sentencesOfWords(phrase).flat()
  if (!words.length) return [text]
  const esc = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("[\\s'’-]+")
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${esc})(?![\\p{L}\\p{N}])`, 'giu')
  const out: ReactNode[] = []
  let last = 0
  for (const mt of text.matchAll(re)) {
    out.push(text.slice(last, mt.index))
    out.push(<mark key={mt.index}>{mt[0]}</mark>)
    last = mt.index! + mt[0].length
  }
  out.push(text.slice(last))
  return out
}

export default function KeywordDensityAnalyzer() {
  const [s, set, reset] = useToolState('keyword-density-analyzer', DEF)
  const opts = useMemo(() => ({ stop: s.stop, minLen: Math.max(1, s.minLen), numbers: s.numbers, extraStop: s.extra.split(/[,\n]/) }), [s.stop, s.minLen, s.numbers, s.extra])
  const all = useMemo(() => [1, 2, 3].map((n) => ngrams(s.text, n, opts)), [s.text, opts])
  const total = all[0].total
  const grams = (s.n === 'all' ? all.flatMap((r) => r.grams) : all[+s.n - 1].grams).filter((g) => g.count >= Math.max(1, s.minCount))
  const sorted = [...grams].sort((a, b) => {
    const va = a[s.sort], vb = b[s.sort]
    const c = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
    return (s.desc ? -c : c) || b.count - a.count
  })
  const allWords = sentencesOfWords(s.text).flat()
  const unique = new Set(allWords).size
  const top = all[0].grams[0]
  const f = focus(s.text, s.key)
  const lv = level(f.density)
  const maxD = Math.max(0.0001, ...sorted.map((g) => g.density))
  const head = (k: keyof Gram, label: string) => (
    <button type="button" className="k-btn ghost" style={{ padding: '2px 4px', fontWeight: 700 }} onClick={() => set({ sort: k, desc: s.sort === k ? !s.desc : k !== 'phrase' })}>
      {label}{s.sort === k ? (s.desc ? ' ▼' : ' ▲') : ''}
    </button>
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Text" actions={<><Btn kind="ghost" onClick={() => set({ text: SAMPLE })}>Sample</Btn><Btn kind="ghost" onClick={() => set({ text: '' })}>Clear</Btn></>}>
          <Area value={s.text} onChange={(text) => set({ text })} rows={14} placeholder="Paste an article, page copy or product description…" />
        </Panel>
        <Panel title="Focus keyword">
          <Txt label="Keyword or phrase" value={s.key} onChange={(key) => set({ key })} placeholder="e.g. rain barrel" />
          {s.key.trim() && (
            <>
              <Stats>
                <Stat label="Occurrences" value={f.count} />
                <Stat label="Density" value={pct(f.density, 2)} tone={lv === 'ok' ? 'good' : 'bad'} sub={lv === 'low' ? 'below 0.5%' : lv === 'high' ? 'above 2.5%' : '0.5–2.5% range'} />
              </Stats>
              {f.count === 0 && <Note tone="warn">The keyword does not appear in the text.</Note>}
              {lv === 'high' && <Note tone="warn">That's a lot of repetition. Readers and search engines may treat it as keyword stuffing; use synonyms and related phrases instead.</Note>}
              {f.count > 0 && <Note tone={f.firstAt < 100 ? 'ok' : 'warn'}>First appears at word {f.firstAt + 1}{f.firstAt < 100 ? ' (within the first 100 words, good).' : '. Try to mention it earlier.'}</Note>}
            </>
          )}
          <Note>Density = occurrences × words in the phrase ÷ total words. There is no magic number; 0.5–2.5% is a common, natural-reading range.</Note>
        </Panel>
        <Panel title="Options" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Check label="Ignore common stop words (the, and, of…)" value={s.stop} onChange={(stop) => set({ stop })} />
          <Check label="Count numbers" value={s.numbers} onChange={(numbers) => set({ numbers })} />
          <Row>
            <Num label="Min. word length" value={s.minLen} onChange={(minLen) => set({ minLen })} min={1} max={10} step={1} />
            <Num label="Min. occurrences" value={s.minCount} onChange={(minCount) => set({ minCount })} min={1} step={1} />
          </Row>
          <Txt label="Also ignore (comma separated)" value={s.extra} onChange={(extra) => set({ extra })} placeholder="e.g. can, one" />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Words" value={total.toLocaleString('en-US')} />
          <Stat label="Unique words" value={unique.toLocaleString('en-US')} sub={total ? `lexical variety ${pct(unique / total, 0)}` : undefined} />
          <Stat label="Sentences" value={sentencesOfWords(s.text).length} />
          <Stat label="Top keyword" value={top ? top.phrase : '—'} tone="accent" sub={top ? `${top.count}× · ${pct(top.density, 1)}` : undefined} />
        </Stats>
        <Panel title="Frequency table" actions={<>
          <Seg value={s.n} onChange={(n) => set({ n })} options={[['1', 'Words'], ['2', '2-word'], ['3', '3-word'], ['all', 'All']]} />
          <CsvButton name="keyword-density.csv" rows={() => [['Phrase', 'Words', 'Count', 'Density %', 'First position'], ...sorted.map((g) => [g.phrase, g.n, g.count, (g.density * 100).toFixed(2), g.first + 1])]} />
        </>}>
          {sorted.length === 0 ? <Note>No phrases reach {s.minCount} occurrence{s.minCount === 1 ? '' : 's'}. Lower "Min. occurrences" or add more text.</Note> : (
            <Table max={60}
              head={[head('phrase', 'Phrase'), head('n', 'Words'), head('count', 'Count'), head('density', 'Density'), '']}
              rows={sorted.map((g) => [
                <button key="p" type="button" className="k-btn ghost" style={{ padding: '2px 4px', fontWeight: g.phrase === s.key.toLowerCase().trim() ? 800 : 500 }} onClick={() => set({ key: g.phrase })} title="Use as focus keyword">{g.phrase}</button>,
                g.n, <b key="c">{g.count}</b>, pct(g.density, 2),
                <div key="b" style={{ minWidth: 90 }}><Bar value={g.density} max={maxD} color={level(g.density) === 'high' ? 'var(--warn)' : 'var(--accent)'} /></div>,
              ])}
            />
          )}
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Click a column to sort, or a phrase to make it the focus keyword. Phrases never cross sentence boundaries; with stop words ignored, a phrase may contain them inside ("cup of tea") but not at its ends.</p>
        </Panel>
        {s.key.trim() && f.count > 0 && (
          <Panel title={`Where “${s.key.trim()}” appears`}>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 340, overflow: 'auto', fontSize: 14 }}>{highlight(s.text, s.key)}</div>
          </Panel>
        )}
      </div>
    </Split>
  )
}
