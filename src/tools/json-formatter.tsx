import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Btn, Check, CopyButton, download, FileDrop, Note, num, Panel, Row, Seg, Split, Stat, Stats, useToolState } from '../kit'
import { childPath, format, repair, stats, validate } from './lib/json-formatter'
import { fmtBytes } from './lib/image-compressor'

const SAMPLE = `{
  "store": "Northwind Outfitters",
  "open": true,
  "rating": 4.7,
  "address": { "street": "12 Harbor Rd", "city": "Portsmouth", "zip": "03801", "geo": [43.0718, -70.7626] },
  "tags": ["outdoor", "camping", "repairs"],
  "manager": null,
  "products": [
    { "sku": "TN-200", "name": "Trail tent 2P", "price": 249.0, "stock": 14, "sizes": [] },
    { "sku": "SB-10", "name": "Down sleeping bag", "price": 189.5, "stock": 0, "colors": ["moss", "rust"] },
    { "sku": "HK-3", "name": "Headlamp 300 lm", "price": 39.99, "stock": 88, "battery": { "type": "Li-ion", "hours": 40 } }
  ],
  "hours": { "mon-fri": "09:00-19:00", "sat": "10:00-17:00", "sun": null }
}`
const BROKEN = `{
  // JavaScript-style object pasted from code
  name: 'Ada', langs: ['en', 'fr',],
  active: True,
  "score": 98,
  "team": "core",
}`

type Indent = '2' | '4' | 'tab' | '0'
const DEF = { text: SAMPLE, indent: '2' as Indent, sort: false, view: 'tree' as 'tree' | 'text', depth: 2 }

const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v)
const COL: Record<string, string> = { string: '#16a34a', number: '#2563eb', boolean: '#c026d3', null: '#64748b' }

function Leaf({ v }: { v: unknown }) {
  const t = typeOf(v)
  return <span style={{ color: COL[t] }}>{t === 'string' ? JSON.stringify(v) : String(v)}</span>
}

function countHits(value: unknown, ql: string): number {
  if (!ql) return 0
  let n = 0
  const walk = (v: unknown) => {
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (!Array.isArray(v) && k.toLowerCase().includes(ql)) n++; walk(x) }
    else if (String(v).toLowerCase().includes(ql)) n++
  }
  walk(value)
  return n
}

export default function JsonFormatter() {
  const [s, set, reset] = useToolState('json-formatter', DEF)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [selV, setSelV] = useState<{ p: string; v: unknown }>({ p: '$', v: undefined })
  const sel = selV.p
  const [q, setQ] = useState('')
  const ta = useRef<HTMLTextAreaElement>(null)

  const check = useMemo(() => validate(s.text), [s.text])
  const value = useMemo<unknown>(() => (check.ok ? JSON.parse(s.text) : undefined), [check.ok, s.text])
  const st = useMemo(() => (check.ok ? stats(value) : null), [check.ok, value])
  const indent = s.indent === 'tab' ? 'tab' : Number(s.indent)
  const out = useMemo(() => (check.ok ? format(value, indent as 0 | 2 | 4 | 'tab', s.sort) : ''), [check.ok, value, indent, s.sort])
  const minLen = useMemo(() => (check.ok ? JSON.stringify(value).length : 0), [check.ok, value])
  const bytes = new TextEncoder().encode(s.text).length
  const fixed = useMemo(() => (check.ok ? null : repair(s.text)), [check.ok, s.text])
  const fixable = fixed !== null && validate(fixed).ok

  const goto = () => {
    const e = check.error
    if (!e || !ta.current) return
    ta.current.focus()
    ta.current.setSelectionRange(e.pos, Math.min(s.text.length, e.pos + 1))
    const line = e.line - 1
    ta.current.scrollTop = Math.max(0, line * 20 - 60)
  }
  const isOpen = (p: string, d: number) => open[p] ?? d < s.depth
  const ql = q.trim().toLowerCase()
  const selValue = selV.p === '$' ? value : selV.v

  const node = (k: string | number | null, v: unknown, path: string, d: number): ReactNode => {
    const t = typeOf(v)
    const keyEl = k === null ? null : (
      <span style={{ color: typeof k === 'number' ? 'var(--muted)' : 'var(--text)', fontWeight: 600, background: ql && String(k).toLowerCase().includes(ql) ? '#fde68a' : undefined }}>{typeof k === 'number' ? k : JSON.stringify(k)}: </span>
    )
    const rowStyle = { padding: '1px 4px', borderRadius: 4, cursor: 'pointer', background: sel === path ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : undefined, whiteSpace: 'nowrap' as const }
    if (t === 'object' || t === 'array') {
      const entries: [string | number, unknown][] = t === 'array' ? (v as unknown[]).map((x, i) => [i, x]) : Object.entries(v as object)
      const o = isOpen(path, d)
      return (
        <div key={path}>
          <div style={rowStyle} onClick={() => { setSelV({ p: path, v }); setOpen((m) => ({ ...m, [path]: !o })) }}>
            <span style={{ display: 'inline-block', width: 14, color: 'var(--muted)' }}>{entries.length ? (o ? '▾' : '▸') : ''}</span>
            {keyEl}
            <span className="muted">{t === 'array' ? `[${entries.length}]` : `{${entries.length}}`}</span>
            {!o && entries.length > 0 && <span className="muted" style={{ fontSize: 12 }}> {t === 'array' ? 'items' : Object.keys(v as object).slice(0, 4).join(', ') + (entries.length > 4 ? '…' : '')}</span>}
          </div>
          {o && <div style={{ paddingLeft: 16, borderLeft: '1px dashed var(--line)', marginLeft: 6 }}>{entries.slice(0, 500).map(([ck, cv]) => node(ck, cv, childPath(path, ck), d + 1))}{entries.length > 500 && <div className="muted">… {entries.length - 500} more</div>}</div>}
        </div>
      )
    }
    const hit = ql && String(v).toLowerCase().includes(ql)
    return (
      <div key={path} style={rowStyle} onClick={() => setSelV({ p: path, v })}>
        <span style={{ display: 'inline-block', width: 14 }} />
        {keyEl}
        <span style={{ background: hit ? '#fde68a' : undefined }}><Leaf v={v} /></span>
      </div>
    )
  }
  const expandAll = (val: boolean) => {
    const m: Record<string, boolean> = {}
    const walk = (v: unknown, p: string) => {
      if (v && typeof v === 'object') { m[p] = val; for (const [k, x] of Array.isArray(v) ? v.map((x, i) => [i, x] as const) : Object.entries(v)) walk(x, childPath(p, k)) }
    }
    walk(value, '$')
    setOpen(m)
  }
  const matches = check.ok ? countHits(value, ql) : 0

  return (
    <Split>
      <div>
        <Panel title="Input" actions={<>
          <Btn kind="ghost" onClick={() => set({ text: SAMPLE })}>Sample</Btn>
          <Btn kind="ghost" onClick={() => set({ text: BROKEN })}>Broken sample</Btn>
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </>}>
          <textarea ref={ta} className="k-area mono" value={s.text} onChange={(e) => set({ text: e.target.value })} rows={20} spellCheck={false} style={{ width: '100%', fontSize: 13, lineHeight: '20px', whiteSpace: 'pre', overflowX: 'auto', borderColor: check.ok ? undefined : 'var(--err)' }} aria-label="JSON input" />
          <Row>
            <Btn kind="primary" disabled={!check.ok} onClick={() => set({ text: out || s.text })}>Format</Btn>
            <Btn disabled={!check.ok} onClick={() => set({ text: format(value, 0, s.sort) })}>Minify</Btn>
            <Btn disabled={!fixable} onClick={() => fixed && set({ text: format(JSON.parse(fixed), indent as 2, s.sort) })} title="Fix comments, trailing commas, single quotes, bare keys, True/False/None">🔧 Repair</Btn>
            <Btn kind="ghost" onClick={() => set({ text: '' })}>Clear</Btn>
          </Row>
          <FileDrop accept=".json,application/json,.txt,.geojson" onFiles={async ([f]) => set({ text: await f.text() })} label="Open a .json file" />
        </Panel>
        {check.ok ? (
          <Note tone="ok">✓ Valid JSON · {fmtBytes(bytes)}</Note>
        ) : check.error && (
          <Note tone="err">
            <b>Line {check.error.line}, column {check.error.col}:</b> {check.error.msg}
            <pre style={{ margin: '6px 0', fontSize: 12, overflowX: 'auto' }}>
              {(() => {
                const lines = s.text.split('\n')
                const L = check.error.line - 1
                const from = Math.max(0, L - 1)
                return lines.slice(from, L + 1).map((ln, i) => `${String(from + i + 1).padStart(4)} | ${ln}`).join('\n') + '\n' + ' '.repeat(7 + check.error.col - 1) + '^'
              })()}
            </pre>
            <Row>
              <Btn onClick={goto}>Go to error</Btn>
              {fixable && <Btn onClick={() => fixed && set({ text: format(JSON.parse(fixed), indent as 2, s.sort) })}>🔧 Repair automatically</Btn>}
            </Row>
          </Note>
        )}
        {check.warnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}
      </div>
      <div>
        <Stats>
          <Stat label="Size" value={fmtBytes(bytes)} sub={check.ok ? `${fmtBytes(minLen)} minified (−${num(Math.max(0, (1 - minLen / (bytes || 1)) * 100), 0)}%)` : ''} />
          <Stat label="Keys" value={st ? num(st.keys, 0) : '—'} sub={st ? `${st.objects} objects · ${st.arrays} arrays` : ''} />
          <Stat label="Values" value={st ? num(st.strings + st.numbers + st.bools + st.nulls, 0) : '—'} sub={st ? `${st.strings} str · ${st.numbers} num · ${st.bools} bool · ${st.nulls} null` : ''} />
          <Stat label="Max depth" value={st ? st.depth : '—'} tone="accent" />
        </Stats>
        <Panel title="Explore" actions={<Seg value={s.view} onChange={(view) => set({ view })} options={[['tree', 'Tree'], ['text', 'Formatted']]} />}>
          {!check.ok ? <p className="muted">Fix the error on the left to explore the document.</p> : s.view === 'tree' ? (
            <>
              <Row>
                <input className="k-text" placeholder="Search keys and values…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} aria-label="Search" />
                {ql && <b>{matches} hit{matches === 1 ? '' : 's'}</b>}
                <Btn kind="ghost" onClick={() => expandAll(true)}>Expand all</Btn>
                <Btn kind="ghost" onClick={() => expandAll(false)}>Collapse</Btn>
              </Row>
              <div className="mono" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.6, maxHeight: 520, overflow: 'auto', marginTop: 8 }}>{node(null, value, '$', 0)}</div>
              <div style={{ borderTop: '1px solid var(--line)', marginTop: 8, paddingTop: 8 }}>
                <Row>
                  <code style={{ flex: 1, wordBreak: 'break-all' }}>{sel}</code>
                  <CopyButton text={sel} label="Path" />
                  <CopyButton text={() => JSON.stringify(selValue, null, 2) ?? ''} label="Value" />
                </Row>
                <span className="muted" style={{ fontSize: 12 }}>Selected: {typeOf(selValue)}{Array.isArray(selValue) ? ` with ${selValue.length} items` : selValue && typeof selValue === 'object' ? ` with ${Object.keys(selValue).length} keys` : ''}</span>
              </div>
            </>
          ) : (
            <>
              <Row>
                <Seg value={s.indent} onChange={(v) => set({ indent: v })} options={[['2', '2 spaces'], ['4', '4 spaces'], ['tab', 'Tab'], ['0', 'Minified']]} />
                <Check label="Sort keys A→Z" value={s.sort} onChange={(sort) => set({ sort })} />
              </Row>
              <textarea className="k-area mono" readOnly value={out} rows={22} style={{ width: '100%', fontSize: 13, whiteSpace: 'pre', overflowX: 'auto', marginTop: 8 }} />
              <Row>
                <CopyButton text={out} />
                <Btn kind="primary" onClick={() => download('formatted.json', out, 'application/json')}>⬇ .json</Btn>
              </Row>
            </>
          )}
        </Panel>
        <Panel title="Tree depth">
          <Seg value={String(s.depth) as '1'} onChange={(v) => { set({ depth: Number(v) }); setOpen({}) }} options={[['1', '1 level'], ['2', '2 levels'], ['3', '3 levels'], ['99', 'All']]} />
          <p className="muted" style={{ fontSize: 13 }}>Click a node to select it and copy its JSONPath (e.g. <code>$.products[1].price</code>) or value.</p>
        </Panel>
      </div>
    </Split>
  )
}
