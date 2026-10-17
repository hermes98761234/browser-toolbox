import { useMemo } from 'react'
import { Btn, Check, CopyButton, download, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { generate, render, stats, type Block, type Opts } from './lib/lorem-ipsum-generator'

const DEF: Opts & { fmt: 'text' | 'html' | 'markdown'; view: 'preview' | 'source' } = {
  bank: 'latin', kind: 'paragraphs', count: 4, classic: true, sMin: 6, sMax: 16, pMin: 3, pMax: 6, seed: 'hello', fmt: 'text', view: 'preview',
}
const KINDS: [Opts['kind'], string, string][] = [
  ['paragraphs', 'Paragraphs', 'paragraphs'], ['sentences', 'Sentences', 'sentences'], ['words', 'Words', 'words'],
  ['list', 'List', 'list items'], ['headings', 'Headings', 'headings'], ['document', 'Document', 'sections'],
]
const QUICK: [string, Partial<Opts>][] = [['Tweet', { kind: 'words', count: 40 }], ['Card blurb', { kind: 'sentences', count: 2 }], ['Blog post', { kind: 'document', count: 3 }], ['Nav menu', { kind: 'list', count: 6 }], ['Long article', { kind: 'paragraphs', count: 12 }]]

function Preview({ blocks }: { blocks: Block[] }) {
  return (
    <div style={{ lineHeight: 1.6, maxHeight: 640, overflow: 'auto' }}>
      {blocks.map((b, i) => {
        if ('items' in b) return b.t === 'ul' ? <ul key={i}>{b.items.map((x, j) => <li key={j}>{x}</li>)}</ul> : <ol key={i}>{b.items.map((x, j) => <li key={j}>{x}</li>)}</ol>
        if (b.t === 'h1') return <h2 key={i} style={{ margin: '4px 0 8px' }}>{b.text}</h2>
        if (b.t === 'h2') return <h3 key={i} style={{ margin: '14px 0 6px' }}>{b.text}</h3>
        if (b.t === 'h3') return <h4 key={i} style={{ margin: '12px 0 6px' }}>{b.text}</h4>
        return <p key={i} style={{ margin: '0 0 12px' }}>{b.text}</p>
      })}
    </div>
  )
}

export default function LoremIpsumGenerator() {
  const [s, set, reset] = useToolState('lorem-ipsum-generator', DEF)
  const blocks = useMemo(() => generate(s), [s])
  const out = useMemo(() => render(blocks, s.fmt), [blocks, s.fmt])
  const st = stats(render(blocks, 'text'))
  const unit = KINDS.find((k) => k[0] === s.kind)?.[2] ?? ''
  const bad = s.sMin > s.sMax || s.pMin > s.pMax
  const ext = { text: 'txt', html: 'html', markdown: 'md' }[s.fmt]

  return (
    <Split wide="right">
      <div>
        <Panel title="What to generate">
          <Seg value={s.kind} onChange={(kind) => set({ kind })} options={KINDS.map(([k, l]) => [k, l] as [Opts['kind'], string])} />
          <Num label={`How many ${unit}`} min={1} max={500} step={1} value={s.count} onChange={(count) => set({ count: Math.max(1, Math.min(500, Math.round(count))) })} />
          <Select label="Word bank" value={s.bank} onChange={(bank) => set({ bank })} options={[['latin', 'Classic Latin'], ['tech', 'Tech jargon'], ['space', 'Space'], ['food', 'Sweets & bakery']]} />
          <Check label="Start with “Lorem ipsum dolor sit amet…”" value={s.classic && s.bank === 'latin'} onChange={(classic) => set({ classic })} />
          <Row>{QUICK.map(([n, p]) => <Btn key={n} kind="ghost" onClick={() => set(p)}>{n}</Btn>)}</Row>
        </Panel>
        <Panel title="Shape">
          <Row>
            <Num label="Words per sentence (min)" min={2} max={40} value={s.sMin} onChange={(sMin) => set({ sMin })} />
            <Num label="(max)" min={2} max={60} value={s.sMax} onChange={(sMax) => set({ sMax })} />
          </Row>
          <Row>
            <Num label="Sentences per paragraph (min)" min={1} max={20} value={s.pMin} onChange={(pMin) => set({ pMin })} />
            <Num label="(max)" min={1} max={30} value={s.pMax} onChange={(pMax) => set({ pMax })} />
          </Row>
          {bad && <Note tone="warn">Minimum is larger than maximum — the minimum is used.</Note>}
        </Panel>
        <Panel title="Seed">
          <Row wrap={false}>
            <Txt label="Same seed → same text (handy for tests and snapshots)" value={s.seed} onChange={(seed) => set({ seed })} />
            <Btn onClick={() => set({ seed: Math.random().toString(36).slice(2, 8) })}>🎲 New</Btn>
          </Row>
          <Btn kind="ghost" onClick={reset}>Reset all</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Words" value={st.words} tone="accent" />
          <Stat label="Sentences" value={st.sentences} />
          <Stat label="Characters" value={out.length.toLocaleString('en-US')} sub={`${st.chars.toLocaleString('en-US')} as plain text`} />
          <Stat label="Size" value={`${(new TextEncoder().encode(out).length / 1024).toFixed(1)} KB`} sub={s.fmt} />
        </Stats>
        <Panel
          title="Output"
          actions={
            <>
              <Seg value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['text', 'Text'], ['html', 'HTML'], ['markdown', 'Markdown']]} />
              <CopyButton text={out} />
              <Btn onClick={() => download(`lorem-ipsum.${ext}`, out, s.fmt === 'html' ? 'text/html' : 'text/plain')}>⬇ .{ext}</Btn>
            </>
          }
        >
          <Seg value={s.view} onChange={(view) => set({ view })} options={[['preview', 'Preview'], ['source', 'Source']]} />
          <div style={{ marginTop: 10 }}>
            {s.view === 'preview' ? <Preview blocks={blocks} /> : <textarea className="k-area mono" readOnly rows={20} value={out} aria-label="Generated source" onFocus={(e) => e.target.select()} />}
          </div>
        </Panel>
      </div>
    </Split>
  )
}
