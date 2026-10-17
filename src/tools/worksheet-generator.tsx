import { useMemo, useRef } from 'react'
import { Btn, Check, CopyButton, CsvButton, Note, Num, Panel, Row, Seg, Select, Slider, Split, Txt, useToolState } from '../kit'
import { generate, text, TOPICS, type Level, type Problem, type Tok, type Topic } from './lib/worksheet-generator'

const DEF = {
  title: 'Math Practice',
  instructions: 'Solve each problem. Show your work in the space provided.',
  topics: ['add', 'sub'] as Topic[],
  level: 2 as Level,
  count: 24,
  cols: 3,
  seed: 1234,
  vertical: true,
  remainders: true,
  negatives: false,
  key: true,
  header: true,
  size: 16,
}

const PRESETS: [string, Partial<typeof DEF>][] = [
  ['Grade 1 · facts to 20', { title: 'Addition & Subtraction to 20', topics: ['add', 'sub'], level: 1, count: 30, cols: 3, vertical: false }],
  ['Times tables', { title: 'Times Tables Drill', topics: ['mul'], level: 1, count: 40, cols: 4, vertical: false }],
  ['Long division', { title: 'Long Division', topics: ['div'], level: 3, count: 12, cols: 3, remainders: true }],
  ['Fractions', { title: 'Fraction Practice', topics: ['fracAdd', 'fracMul', 'simplify'], level: 2, count: 18, cols: 3 }],
  ['Pre-algebra', { title: 'Pre-Algebra Review', topics: ['order', 'equation', 'powers'], level: 2, count: 18, cols: 2 }],
  ['Decimals & %', { title: 'Decimals and Percentages', topics: ['decimal', 'percent', 'round'], level: 2, count: 21, cols: 3 }],
]

const VERTICAL: Topic[] = ['add', 'sub', 'mul', 'decimal']

const CSS = `
.ws-sheet{background:#fff;color:#111;font-family:"Segoe UI",system-ui,sans-serif;padding:28px 32px;border-radius:6px;box-shadow:0 1px 8px rgba(0,0,0,.15);max-width:820px;margin:0 auto 18px}
.ws-sheet h1{font-size:1.5em;margin:0 0 4px}
.ws-meta{display:flex;gap:18px;flex-wrap:wrap;font-size:.85em;margin:6px 0 10px}
.ws-meta span{flex:1;min-width:140px;border-bottom:1px solid #333;padding-bottom:2px}
.ws-ins{font-size:.85em;color:#333;margin:0 0 14px}
.ws-grid{display:grid;column-gap:22px;row-gap:6px}
.ws-p{display:flex;gap:8px;align-items:flex-start;padding:8px 0;break-inside:avoid}
.ws-n{font-size:.7em;color:#555;min-width:22px;padding-top:.35em}
.ws-q{display:inline-flex;align-items:center;flex-wrap:wrap;gap:.25em;line-height:1.6}
.ws-blank{display:inline-block;min-width:3.2em;border-bottom:1.5px solid #222;height:1.1em}
.ws-ans{color:#b91c1c;font-weight:700}
.ws-frac{display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;font-size:.9em;line-height:1.15;margin:0 .1em}
.ws-frac>span:first-child{border-bottom:1.5px solid currentColor;padding:0 .2em}
.ws-mixed{display:inline-flex;align-items:center;gap:.1em}
.ws-sqrt{border-top:1.5px solid currentColor;padding-left:.15em;margin-left:-.05em}
.ws-v{font-family:ui-monospace,Menlo,Consolas,monospace;text-align:right;display:inline-grid;grid-template-columns:auto auto;column-gap:.4em;line-height:1.35}
.ws-v .ws-line{grid-column:1/3;border-top:2px solid #222;min-height:1.6em}
.ws-key h2{font-size:1.15em;margin:0 0 10px}
.ws-key .ws-p{padding:3px 0}
.ws-foot{font-size:.7em;color:#777;margin-top:14px;text-align:right}
@media print{.ws-sheet{box-shadow:none;border-radius:0;max-width:none;padding:0;margin:0}.ws-sheet+.ws-sheet{break-before:page}}
`

function Toks({ ts, answer }: { ts: Tok[]; answer?: Tok[] }) {
  return (
    <span className="ws-q">
      {ts.map((t, i) => {
        if (typeof t === 'string') return <span key={i}>{t}</span>
        if ('blank' in t) return answer ? <span key={i} className="ws-ans"><Toks ts={answer} /></span> : <span key={i} className="ws-blank" />
        if ('f' in t)
          return (
            <span key={i} className="ws-mixed">
              {t.w && <span>{t.w}</span>}
              <span className="ws-frac"><span>{t.f[0]}</span><span>{t.f[1]}</span></span>
            </span>
          )
        if ('sup' in t) return <span key={i}>{t.sup[0]}<sup>{t.sup[1]}</sup></span>
        return <span key={i}>√<span className="ws-sqrt">{t.sqrt}</span></span>
      })}
    </span>
  )
}

function Item({ p, i, answer, vertical }: { p: Problem; i: number; answer?: boolean; vertical: boolean }) {
  return (
    <div className="ws-p">
      <span className="ws-n">{i + 1}.</span>
      {vertical && p.v && !answer ? (
        <span className="ws-v">
          <span />
          <span>{p.v[0]}</span>
          <span>{p.v[1]}</span>
          <span>{p.v[2]}</span>
          <span className="ws-line" />
        </span>
      ) : answer && !p.q.some((t) => typeof t === 'object' && 'blank' in t) ? (
        <span className="ws-q"><Toks ts={p.q} /> <span className="ws-ans">→ <Toks ts={p.a} /></span></span>
      ) : (
        <Toks ts={p.q} answer={answer ? p.a : undefined} />
      )}
    </div>
  )
}

export default function WorksheetGenerator() {
  const [s, set, reset] = useToolState('worksheet-generator', DEF)
  const sheetRef = useRef<HTMLDivElement>(null)
  const topics = useMemo(() => (s.topics.length ? s.topics : (['add'] as Topic[])), [s.topics])
  const problems = useMemo(() => {
    // Spread the requested count across topics, then interleave so mixed sheets alternate.
    const per = topics.map((_, i) => Math.floor(s.count / topics.length) + (i < s.count % topics.length ? 1 : 0))
    const lists = topics.map((t, i) => generate(t, s.level, per[i], s.seed + i * 101, { remainders: s.remainders, negatives: s.negatives }).map((p) => ({ ...p, t })))
    const out: (Problem & { t: Topic })[] = []
    for (let k = 0; out.length < s.count && k < s.count; k++) for (const l of lists) if (l[k]) out.push(l[k])
    return out
  }, [topics, s.count, s.level, s.seed, s.remainders, s.negatives])

  const allVertical = s.vertical && topics.every((t) => VERTICAL.includes(t))
  const cols = Math.max(1, Math.min(5, s.cols))
  const toggle = (t: Topic) => set({ topics: s.topics.includes(t) ? s.topics.filter((x) => x !== t) : [...s.topics, t] })

  const print = () => {
    const html = sheetRef.current?.innerHTML ?? ''
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${s.title.replace(/</g, '&lt;')}</title><style>@page{margin:14mm}body{margin:0;font-size:${s.size}px}${CSS}</style></head><body>${html}<script>onload=()=>setTimeout(()=>print(),200)</script></body></html>`)
    w.document.close()
  }

  const sheet = (answer: boolean) => (
    <div className={`ws-sheet ${answer ? 'ws-key' : ''}`} style={{ fontSize: s.size }}>
      {answer ? <h2>Answer key — {s.title}</h2> : <h1>{s.title}</h1>}
      {!answer && s.header && (
        <div className="ws-meta">
          <span>Name:</span>
          <span>Date:</span>
          <span style={{ flex: '0 0 130px', minWidth: 130 }}>Score: &nbsp;&nbsp;&nbsp;&nbsp; / {problems.length}</span>
        </div>
      )}
      {!answer && s.instructions && <p className="ws-ins">{s.instructions}</p>}
      <div className="ws-grid" style={{ gridTemplateColumns: `repeat(${answer ? Math.min(4, cols + 1) : cols}, minmax(0, 1fr))`, rowGap: answer ? 2 : allVertical ? 18 : 10 }}>
        {problems.map((p, i) => (
          <Item key={i} p={p} i={i} answer={answer} vertical={s.vertical && VERTICAL.includes(p.t)} />
        ))}
      </div>
      <div className="ws-foot">{TOPICS[topics[0]]}{topics.length > 1 ? ` + ${topics.length - 1} more` : ''} · level {s.level} · set #{s.seed}</div>
    </div>
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Presets">
          <Row>
            {PRESETS.map(([n, p]) => (
              <Btn key={n} onClick={() => set({ ...p, seed: Math.floor(Math.random() * 99999) })}>{n}</Btn>
            ))}
          </Row>
        </Panel>
        <Panel title="Problems" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 2 }}>
            {(Object.keys(TOPICS) as Topic[]).map((t) => (
              <Check key={t} label={TOPICS[t]} value={s.topics.includes(t)} onChange={() => toggle(t)} />
            ))}
          </div>
          {!s.topics.length && <Note tone="warn">Pick at least one topic (showing Addition).</Note>}
          <div style={{ margin: '10px 0' }}>
            <Seg value={String(s.level) as '1' | '2' | '3'} onChange={(v) => set({ level: Number(v) as Level })} options={[['1', 'Easy'], ['2', 'Medium'], ['3', 'Hard']]} />
          </div>
          <Row>
            <Num label="Number of problems" value={s.count} onChange={(count) => set({ count: Math.max(1, Math.min(100, Math.round(count))) })} min={1} max={100} step={1} />
            <Num label="Set number (seed)" value={s.seed} onChange={(seed) => set({ seed: Math.round(seed) })} step={1} hint="Same number = same sheet" />
          </Row>
          <Btn kind="primary" onClick={() => set({ seed: Math.floor(Math.random() * 99999) })}>🎲 New problems</Btn>
          <div style={{ marginTop: 10 }}>
            <Check label="Column (vertical) layout for + − × and decimals" value={s.vertical} onChange={(vertical) => set({ vertical })} />
            <Check label="Division with remainders (medium/hard)" value={s.remainders} onChange={(remainders) => set({ remainders })} />
            <Check label="Allow negative results in subtraction" value={s.negatives} onChange={(negatives) => set({ negatives })} />
          </div>
        </Panel>
        <Panel title="Page">
          <Txt label="Title" value={s.title} onChange={(title) => set({ title })} />
          <Txt label="Instructions" value={s.instructions} onChange={(instructions) => set({ instructions })} />
          <Slider label="Columns" value={cols} onChange={(c) => set({ cols: c })} min={1} max={5} show={(v) => String(v)} />
          <Slider label="Font size" value={s.size} onChange={(size) => set({ size })} min={12} max={24} unit=" px" show={(v) => String(v)} />
          <Check label="Name / date / score line" value={s.header} onChange={(header) => set({ header })} />
          <Check label="Answer key on a separate page" value={s.key} onChange={(key) => set({ key })} />
          <Select label="Quick count" value={s.count} onChange={(count) => set({ count })} options={[[s.count, `${s.count} (current)`], [12, '12 – one page, roomy'], [20, '20'], [30, '30'], [40, '40 – drill'], [60, '60 – speed test']] as [number, string][]} />
        </Panel>
      </div>
      <div>
        <Panel
          title={`Preview · ${problems.length} problems`}
          actions={
            <>
              <Btn kind="primary" onClick={print}>🖨 Print / PDF</Btn>
              <CopyButton label="Copy text" text={() => problems.map((p, i) => `${i + 1}. ${text(p.q)}`).join('\n') + '\n\nAnswers:\n' + problems.map((p, i) => `${i + 1}. ${text(p.a)}`).join('\n')} />
              <CsvButton name="worksheet.csv" rows={() => [['#', 'Topic', 'Problem', 'Answer'], ...problems.map((p, i) => [i + 1, TOPICS[p.t], text(p.q), text(p.a)])]} />
            </>
          }
        >
          <style>{CSS}</style>
          <div ref={sheetRef} style={{ background: 'var(--bg2)', padding: 12, borderRadius: 8, overflowX: 'auto' }}>
            {sheet(false)}
            {s.key && sheet(true)}
          </div>
          <p className="k-hint">Print opens a clean page with the worksheet and answer key on separate sheets — choose “Save as PDF” in the print dialog to keep a copy.</p>
        </Panel>
      </div>
    </Split>
  )
}
