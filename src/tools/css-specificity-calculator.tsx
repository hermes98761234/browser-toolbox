import { useMemo, useState, type ReactNode } from 'react'
import { Area, CopyButton, CsvButton, Note, Panel, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { breakdown, cmp, extractSelectors, fmtSpec, parseSelectorList, SelectorError, specificity, type Complex, type Spec } from './lib/css-specificity-calculator'

const SAMPLE_SELECTORS = `#nav .menu > li:hover a
.btn.btn-primary:not(:disabled)
button:is(.primary, #cta)::after
:where(#app) .card h2
ul li:nth-child(2n+1 of .visible)
article:has(> img, figure .caption)
a[href^="https://"]:not([href*="example.com"])
input[type="checkbox" i]:checked + label
body > main#content p::first-line
*
:root
.sidebar :where(ul, ol) li
html body div.wrapper div.content p span`

const SAMPLE_CSS = `/* Paste a stylesheet — every rule's selectors are listed */
.btn { padding: 8px 14px; }
.btn.btn-primary, .btn[data-variant="primary"] { background: #4f46e5; }
#checkout .btn { font-weight: 700; }

@media (min-width: 768px) {
  nav ul > li a:hover { text-decoration: underline; }
  :where(.prose) p { max-width: 65ch; }
}

.card {
  border-radius: 12px;
  & .title { font-size: 1.25rem; }
  &:has(img) { padding: 0; }
}

@layer components {
  .alert:is(.warning, .error) .icon::before { content: "!"; }
}

@keyframes pulse { from { opacity: 1 } to { opacity: .4 } }`

interface S { mode: 'list' | 'css'; list: string; css: string }
const DEF: S = { mode: 'list', list: SAMPLE_SELECTORS, css: SAMPLE_CSS }

interface Row { i: number; text: string; line: number; context: string; sel?: Complex; spec?: Spec; err?: string; errPos?: number }

const COL = { a: '#dc2626', b: '#d97706', c: '#2563eb', z: 'var(--muted)' }
const kindCol = (spec: Spec) => (spec[0] ? COL.a : spec[1] ? COL.b : spec[2] ? COL.c : COL.z)

function Pill({ s }: { s: Spec }) {
  const box = (v: number, c: string, t: string) => (
    <span title={t} style={{ minWidth: 26, padding: '2px 6px', textAlign: 'center', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: v ? '#fff' : 'var(--muted)', background: v ? c : 'transparent' }}>{v}</span>
  )
  return (
    <span style={{ display: 'inline-flex', border: '1px solid var(--line)', borderRadius: 6, overflow: 'hidden', fontSize: 13 }}>
      {box(s[0], COL.a, 'IDs')}{box(s[1], COL.b, 'classes, attributes, pseudo-classes')}{box(s[2], COL.c, 'types, pseudo-elements')}
    </span>
  )
}

/** Selector text with each top-level simple selector coloured by the column it counts in. */
function Colored({ sel }: { sel: Complex }) {
  const parts = sel.compounds.flatMap((c) => c.parts)
  const base = parts[0]?.pos ?? 0
  const out: ReactNode[] = []
  let at = 0
  const bd = breakdown(sel)
  parts.forEach((p, k) => {
    const st = p.pos - base
    if (st > at) out.push(<span key={`g${k}`} style={{ color: 'var(--muted)' }}>{sel.text.slice(at, st)}</span>)
    out.push(<span key={k} style={{ color: kindCol(bd[k].spec), fontWeight: bd[k].spec.some(Boolean) ? 700 : 400 }}>{p.text}</span>)
    at = st + p.text.length
  })
  if (at < sel.text.length) out.push(<span key="end">{sel.text.slice(at)}</span>)
  return <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{out}</code>
}

export default function CssSpecificityCalculator() {
  const [s, set, reset] = useToolState('css-specificity-calculator', DEF)
  const [pick, setPick] = useState(0)

  const rows = useMemo<Row[]>(() => {
    const items = s.mode === 'list'
      ? s.list.split('\n').map((t, i) => ({ selector: t.trim(), line: i + 1, context: '' })).filter((x) => x.selector && !x.selector.startsWith('//'))
      : extractSelectors(s.css)
    return items.map((it, i) => {
      try {
        const list = parseSelectorList(it.selector)
        // a line may hold a comma-separated list: specificity is per selector, show the max and keep the first parse for inspection
        const best = list.reduce((m, c) => (cmp(specificity(c), specificity(m)) > 0 ? c : m), list[0])
        return { i, text: it.selector, line: it.line, context: it.context, sel: best, spec: specificity(best) }
      } catch (e) {
        return { i, text: it.selector, line: it.line, context: it.context, err: e instanceof Error ? e.message : String(e), errPos: e instanceof SelectorError ? e.pos : undefined }
      }
    })
  }, [s.mode, s.list, s.css])

  const ok = rows.filter((r) => r.spec)
  const sorted = [...ok].sort((x, y) => cmp(y.spec!, x.spec!) || y.i - x.i)
  const bad = rows.filter((r) => r.err)
  const top = sorted[0]
  const withId = ok.filter((r) => r.spec![0] > 0).length
  const cur = rows.find((r) => r.i === pick && r.sel) ?? top
  const bd = cur?.sel ? breakdown(cur.sel) : []

  return (
    <Split wide="right">
      <div>
        <Panel title="Selectors" actions={<button type="button" className="k-btn ghost" onClick={reset}>Reset</button>}>
          <Seg value={s.mode} onChange={(mode) => { set({ mode }); setPick(0) }} options={[['list', 'One per line'], ['css', 'Paste stylesheet']] as const} label="Input" />
          <div style={{ height: 10 }} />
          {s.mode === 'list'
            ? <Area value={s.list} onChange={(list) => set({ list })} rows={14} mono placeholder="#id .class > a:hover" />
            : <Area value={s.css} onChange={(css) => set({ css })} rows={18} mono placeholder=".a { color: red }" />}
          <p className="muted" style={{ fontSize: 13 }}>
            {s.mode === 'list' ? 'Lines starting with // are ignored. A comma-separated line is scored by its most specific selector.' : 'Rules inside @media, @supports, @layer, @container and CSS nesting are included; @keyframes steps are skipped. & counts as zero here (it takes the parent’s specificity).'}
          </p>
        </Panel>

        {cur?.sel && (
          <Panel title="Breakdown">
            <div style={{ fontSize: 15, marginBottom: 10 }}><Colored sel={cur.sel} /></div>
            <Table
              head={['Part', 'Counts as', 'a-b-c']}
              rows={bd.map((p) => [<code key="c">{p.text}</code>, <span key="w" className="muted" style={{ fontSize: 13 }}>{p.why}</span>, <Pill key="p" s={p.spec} />])}
              foot={['Total', '', <Pill key="t" s={cur.spec!} />]}
            />
            <p className="muted" style={{ fontSize: 13 }}>
              Columns compare left to right: one ID beats any number of classes, one class beats any number of types. Combinators and <code>*</code> add nothing.
            </p>
          </Panel>
        )}

        <Note>
          Specificity only decides between rules of the same origin, importance and cascade layer. <code>!important</code>, inline <code>style=""</code>, unlayered vs. <code>@layer</code> styles and <code>@scope</code> proximity are checked first; equal specificity → the later rule wins.
        </Note>
      </div>

      <div>
        <Stats>
          <Stat label="Selectors" value={ok.length} sub={bad.length ? `${bad.length} invalid` : 'all valid'} tone={bad.length ? 'bad' : undefined} />
          <Stat label="Most specific" value={top ? fmtSpec(top.spec!) : '—'} sub={top ? <code style={{ fontSize: 12 }}>{top.text.length > 30 ? top.text.slice(0, 29) + '…' : top.text}</code> : ''} tone="accent" />
          <Stat label="Use an ID" value={withId} sub={withId ? 'hard to override' : 'nice and flat'} tone={withId > ok.length / 3 ? 'bad' : 'good'} />
          <Stat label="Zero specificity" value={ok.filter((r) => !r.spec!.some(Boolean)).length} sub="e.g. :where(…), *" />
        </Stats>

        {bad.length > 0 && (
          <Note tone="err">
            {bad.map((r) => (
              <div key={r.i}>
                <b>Line {r.line}:</b> {r.err}
                {r.errPos !== undefined && <div><code style={{ whiteSpace: 'pre' }}>{r.text}{'\n'}{' '.repeat(r.errPos)}^</code></div>}
              </div>
            ))}
          </Note>
        )}

        <Panel title="Ranked — most specific first" actions={<>
          <CopyButton text={() => sorted.map((r) => `${fmtSpec(r.spec!)}\t${r.text}`).join('\n')} label="Copy" />
          <CsvButton name="specificity.csv" rows={() => [['Rank', 'Selector', 'IDs (a)', 'Classes (b)', 'Types (c)', 'Line', 'Context'], ...sorted.map((r, k) => [k + 1, r.text, r.spec![0], r.spec![1], r.spec![2], r.line, r.context])]} />
        </>}>
          <Table
            head={['#', 'Selector', 'a-b-c', 'Line']}
            max={200}
            rows={sorted.map((r, k) => {
              const prev = sorted[k - 1], next = sorted[k + 1]
              const tieUp = prev && cmp(prev.spec!, r.spec!) === 0, tieDown = next && cmp(next.spec!, r.spec!) === 0
              return [
                <span key="n" className="muted">{tieUp ? '=' : k + 1}</span>,
                <button key="s" type="button" onClick={() => setPick(r.i)} style={{ all: 'unset', cursor: 'pointer', display: 'block', padding: '2px 4px', borderRadius: 4, outline: cur?.i === r.i ? '2px solid var(--accent)' : 'none' }}>
                  <Colored sel={r.sel!} />
                  {r.context && <div className="muted" style={{ fontSize: 11 }}>{r.context}</div>}
                  {(tieUp || tieDown) && <div className="muted" style={{ fontSize: 11 }}>tie — {tieUp ? 'the earlier one loses' : 'wins when written later'}</div>}
                </button>,
                <Pill key="p" s={r.spec!} />,
                <span key="l" className="muted">{r.line}</span>,
              ]
            })}
          />
          <p className="muted" style={{ fontSize: 13 }}>Click a selector to see its breakdown. Ties are ordered by source position — the later rule wins.</p>
        </Panel>

        <Panel title="Rules of thumb">
          <div style={{ display: 'grid', gap: 6, fontSize: 14 }}>
            <div><b style={{ color: COL.a }}>a</b> — ID selectors <code>#x</code></div>
            <div><b style={{ color: COL.b }}>b</b> — classes <code>.x</code>, attributes <code>[x]</code>, pseudo-classes <code>:hover</code>, <code>:nth-child()</code></div>
            <div><b style={{ color: COL.c }}>c</b> — element types <code>p</code>, pseudo-elements <code>::before</code> (also legacy <code>:before</code>)</div>
            <div><code>:is()</code>, <code>:not()</code>, <code>:has()</code> count as their most specific argument; <code>:where()</code> is always 0-0-0; <code>:nth-child(An+B of S)</code> is one class plus the most specific <code>S</code>.</div>
          </div>
        </Panel>
      </div>
    </Split>
  )
}
