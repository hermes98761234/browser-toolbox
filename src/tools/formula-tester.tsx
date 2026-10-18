import { useMemo, useState } from 'react'
import { Btn, CsvButton, JsonButtons, Note, Panel, Row, Select, Split, Stat, Stats, useToolState } from '../kit'
import { DOCS, sampleCells } from './lib/formula-tester-docs'
import { closure, colName, ERR_HELP, general, graph, isArr, key, refsOf, Sheet, XErr, type Scalar, type V } from './lib/formula-tester'

const ROWS = 16
const COLS = 10
const EXAMPLES = ['=SUMIFS(G2:G9,A2:A9,"North",D2:D9,">5")', '=XLOOKUP("Dev",B2:B9,G2:G9)', '=INDEX(C2:C9,MATCH(MAX(D2:D9),D2:D9,0))', '=TEXT(SUM(G2:G9)/COUNT(G2:G9),"$#,##0.00")', '=IF(COUNTIF(A2:A9,"East")>1,"Several","One")', '=SUMPRODUCT((C2:C9="Widget")*G2:G9)', '=D2:D9*2']

interface S { cells: Record<string, string>; formula: string; sel: string }
const DEF: S = { cells: sampleCells(), formula: EXAMPLES[0], sel: 'J2' }

const showV = (v: Scalar) => general(v)
const cls = (v: Scalar) => (v instanceof XErr ? 'err' : typeof v === 'number' ? 'num' : typeof v === 'boolean' ? 'bool' : '')

function Value({ v, compact }: { v: V; compact?: boolean }) {
  if (isArr(v) && compact) {
    const items = v.arr.map((r) => r.map(showV).join(', '))
    const txt = `{${items.join('; ')}}`
    return <span title={txt}>{txt.length > 90 ? txt.slice(0, 88) + '…}' : txt}</span>
  }
  if (isArr(v))
    return (
      <table className="ft-arr">
        <tbody>
          {v.arr.slice(0, 20).map((r, i) => (
            <tr key={i}>{r.slice(0, 10).map((x, j) => <td key={j} className={cls(x)}>{showV(x)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    )
  return <span className={cls(v)}>{v === null ? '(blank)' : typeof v === 'string' ? `“${v}”` : showV(v)}</span>
}

export default function FormulaTester() {
  const [s, set, reset] = useToolState('formula-tester', DEF)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('All')
  const [showSteps, setShowSteps] = useState(true)
  const sheet = useMemo(() => new Sheet(s.cells, ROWS, COLS), [s.cells])
  const g = useMemo(() => graph(sheet), [sheet])
  const res = useMemo(() => sheet.run(s.formula), [sheet, s.formula])
  const used = useMemo(() => new Set(res.ast ? refsOf(res.ast) : []), [res])
  const prec = closure(g.prec, s.sel)
  const dep = closure(g.dep, s.sel)
  const selRaw = s.cells[s.sel] ?? ''
  const setCell = (k: string, raw: string) => set((x) => { const cells = { ...x.cells }; if (raw === '') delete cells[k]; else cells[k] = raw; return { ...x, cells } })
  const errCode = isArr(res.value) ? null : res.value instanceof XErr ? res.value.code : null
  const cats = ['All', ...new Set(DOCS.map((d) => d[1]))]
  const list = DOCS.filter((d) => (cat === 'All' || d[1] === cat) && (!q || `${d[0]} ${d[3]}`.toLowerCase().includes(q.toLowerCase())))
  const fnsInFormula = [...new Set([...s.formula.toUpperCase().matchAll(/([A-Z][A-Z0-9.]*)\s*\(/g)].map((m) => m[1]))]
  const formulas = Object.values(s.cells).filter((v) => v.startsWith('=')).length
  const errors = Object.keys(s.cells).filter((k) => sheet.value(k) instanceof XErr).length

  return (
    <div>
      <style>{`.ft-grid{border-collapse:collapse;font-size:13px;min-width:100%}.ft-grid th{background:var(--panel2);color:var(--muted);font-weight:600;padding:3px 6px;border:1px solid var(--line);position:sticky;top:0}
.ft-grid td{border:1px solid var(--line);padding:3px 6px;min-width:64px;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:cell}
.ft-grid td.sel{outline:2px solid var(--accent);outline-offset:-2px}.ft-grid td.p{background:color-mix(in srgb,#0ea5e9 18%,transparent)}.ft-grid td.d{background:color-mix(in srgb,#10b981 18%,transparent)}
.ft-grid td.u{box-shadow:inset 0 0 0 2px #f59e0b}.ft-grid td.f{font-style:italic}.num{font-variant-numeric:tabular-nums}.ft-grid td.num{text-align:right}.err{color:var(--err);font-weight:700}.bool{color:#a855f7}
.ft-arr{border-collapse:collapse;margin-top:4px}.ft-arr td{border:1px solid var(--line);padding:2px 8px;font-size:13px}.ft-steps{font-family:var(--mono);font-size:12.5px;margin:0;padding:0;list-style:none}.ft-steps li{padding:2px 0;border-bottom:1px dashed var(--line)}`}</style>
      <Panel title="Formula bar" actions={<Btn onClick={() => setCell(s.sel, s.formula)} title="Write this formula into the selected cell">Put into {s.sel}</Btn>}>
        <input className="k-text" style={{ width: '100%', fontFamily: 'var(--mono)', fontSize: 16 }} value={s.formula} onChange={(e) => set({ formula: e.target.value })} spellCheck={false} aria-label="Formula" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          <span className="muted" style={{ fontSize: 13 }}>Examples:</span>
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => set({ formula: ex })} style={{ fontFamily: 'var(--mono)', fontSize: 12, border: '1px solid var(--line)', borderRadius: 999, background: 'var(--panel2)', color: 'var(--fg)', padding: '2px 10px', cursor: 'pointer' }}>
              {ex.length > 40 ? ex.slice(0, 38) + '…' : ex}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 8 }}>
          <span className="muted">Result</span>
          <b style={{ fontSize: 22 }}><Value v={res.value} /></b>
          {isArr(res.value) && <span className="muted">array {res.value.arr.length}×{res.value.arr[0]?.length ?? 0} (spills in Excel 365)</span>}
        </div>
        {res.error && <Note tone="err">Syntax: {res.error}</Note>}
        {errCode && !res.error && <Note tone="warn"><b>{errCode}</b> — {ERR_HELP[errCode] ?? 'Error.'}</Note>}
        {fnsInFormula.length > 0 && (
          <p style={{ fontSize: 13, margin: '8px 0 0' }}>
            {fnsInFormula.map((f) => { const d = DOCS.find((x) => x[0] === f); return <span key={f} style={{ display: 'block' }}><b>{f}</b>{d ? <> — <code>{d[2]}</code>: {d[3]}</> : <span className="err"> — not supported (#NAME?)</span>}</span> })}
          </p>
        )}
        {res.steps.length > 0 && (
          <details open={showSteps} onToggle={(e) => setShowSteps((e.target as HTMLDetailsElement).open)} style={{ marginTop: 8 }}>
            <summary style={{ cursor: 'pointer' }}>Step-by-step evaluation ({res.steps.length} steps, innermost first)</summary>
            <ol className="ft-steps">
              {res.steps.slice(0, 60).map((st, i) => (
                <li key={i} style={{ paddingLeft: Math.min(st.depth, 8) * 12 }}>{st.text} → <Value v={st.value} compact /></li>
              ))}
            </ol>
          </details>
        )}
      </Panel>

      <Panel
        title="Sample data"
        actions={
          <>
            <CsvButton name="sheet-values.csv" rows={() => Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => showV(sheet.value(key(r, c)))))} />
            <JsonButtons name="formula-sheet.json" data={s.cells} onLoad={(cells) => set({ cells })} />
            <Btn kind="ghost" onClick={() => set({ cells: {} })}>Clear</Btn>
            <Btn kind="ghost" onClick={reset}>Sample</Btn>
          </>
        }
      >
        <Row wrap={false}>
          <b style={{ minWidth: 40 }}>{s.sel}</b>
          <input className="k-text" style={{ flex: 1, fontFamily: 'var(--mono)' }} value={selRaw} onChange={(e) => setCell(s.sel, e.target.value)} placeholder="Type a value or =formula" aria-label={`Cell ${s.sel}`} />
        </Row>
        <div className="k-table-wrap" style={{ maxHeight: 520, overflow: 'auto', marginTop: 8 }}>
          <table className="ft-grid">
            <thead>
              <tr><th />{Array.from({ length: COLS }, (_, c) => <th key={c}>{colName(c)}</th>)}</tr>
            </thead>
            <tbody>
              {Array.from({ length: ROWS }, (_, r) => (
                <tr key={r}>
                  <th>{r + 1}</th>
                  {Array.from({ length: COLS }, (_, c) => {
                    const k = key(r, c)
                    const raw = s.cells[k] ?? ''
                    const v = sheet.value(k)
                    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())
                    const c2 = [k === s.sel && 'sel', prec.has(k) && 'p', dep.has(k) && 'd', used.has(k) && 'u', raw.startsWith('=') && 'f', date ? '' : cls(v)].filter(Boolean).join(' ')
                    return <td key={c} className={c2} title={raw.startsWith('=') ? raw : undefined} onClick={() => set({ sel: k })}>{date ? raw : showV(v)}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
          Click a cell to edit it above. <span style={{ background: 'color-mix(in srgb,#0ea5e9 25%,transparent)', padding: '0 4px' }}>blue</span> = cells the selected cell depends on,{' '}
          <span style={{ background: 'color-mix(in srgb,#10b981 25%,transparent)', padding: '0 4px' }}>green</span> = cells that depend on it, <span style={{ boxShadow: 'inset 0 0 0 2px #f59e0b', padding: '0 4px' }}>orange</span> = used by the formula bar.
          Type dates as YYYY-MM-DD; they become date serial numbers.
        </p>
      </Panel>
      <Split>
        <div>
          <Panel title={`Dependencies of ${s.sel}`}>
            <Stats>
              <Stat label="Formulas" value={formulas} />
              <Stat label="Errors" value={errors} tone={errors ? 'bad' : 'good'} />
              <Stat label="Feeds from" value={prec.size} sub="cells (direct + indirect)" />
              <Stat label="Feeds into" value={dep.size} sub="cells" />
            </Stats>
            {g.cycles.length > 0 && <Note tone="err">Circular reference: {g.cycles.join(' → ')}</Note>}
            <p style={{ fontSize: 13 }}>
              <b>Direct inputs:</b> {(g.prec.get(s.sel) ?? []).join(', ') || '—'}<br />
              <b>Used directly by:</b> {(g.dep.get(s.sel) ?? []).join(', ') || '—'}<br />
              <b>Calculation order:</b> <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{g.order.join(' → ') || '—'}</span>
            </p>
          </Panel>
        </div>

        <div>
          <Panel title="Function reference">
            <Row>
              <input className="k-text" style={{ flex: 1 }} placeholder={`Search ${DOCS.length} functions…`} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search functions" />
              <Select label="Category" value={cat} onChange={setCat} options={cats} />
            </Row>
            <div style={{ maxHeight: 560, overflow: 'auto', marginTop: 8 }}>
              {list.map(([name, c, syn, plain, ex]) => (
                <div key={name} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                  <Row wrap={false}>
                    <b style={{ flex: 1 }}>{name} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{c}</span></b>
                    <button type="button" className="k-btn ghost" style={{ fontSize: 12 }} onClick={() => set({ formula: ex })}>Try</button>
                  </Row>
                  <code style={{ fontSize: 12 }}>{syn}</code>
                  <div style={{ fontSize: 13 }}>{plain}</div>
                  <code className="muted" style={{ fontSize: 12 }}>{ex}</code>
                </div>
              ))}
              {!list.length && <p className="muted">No function matches “{q}”.</p>}
            </div>
          </Panel>
          <Note>
            Engine written for this tool (no HyperFormula): Excel operator precedence (−2^2 = 4), text/number/boolean comparison rules, wildcards in criteria (* ? ~), array maths
            like <code>(A2:A9="North")*D2:D9</code>, and the 1900 date system (serial 1 = 1 Jan 1900; dates before March 1900 differ from Excel by one day).
          </Note>
        </div>
      </Split>
    </div>
  )
}
