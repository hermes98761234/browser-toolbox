import { useMemo, useState } from 'react'
import { Area, Btn, Check, CopyButton, download, FileDrop, Note, Panel, pct, Row, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { guessKeys, join, parseTable, toCsvText, type JoinType } from './lib/csv-joiner'

const CUSTOMERS = `customer_id,name,city,segment
C001,Acme Corp,Berlin,Enterprise
C002,Blue Fox Ltd,London,SMB
C003,Cedar & Co,Paris,SMB
C004,Delta Labs,Kyiv,Enterprise
C005,Echo Studio,Madrid,Startup
C006,Fjord AS,Oslo,Startup`

const ORDERS = `order_id,customer_id,date,total
O-1001,C001,2026-09-02,1250.00
O-1002,C003,2026-09-05,310.50
O-1003,C001,2026-09-11,880.00
O-1004,C004,2026-09-14,4200.00
O-1005,C009,2026-09-20,75.25
O-1006,c002,2026-09-28,640.00
O-1007,C004,2026-10-01,990.00`

const DEF = { left: CUSTOMERS, right: ORDERS, leftName: 'customers.csv', rightName: 'orders.csv', type: 'left' as JoinType, pairs: [['customer_id', 'customer_id']] as [string, string][], ignoreCase: true, trim: true, coalesce: true, sfxL: '_left', sfxR: '_right' }

const TYPES: [JoinType, string, string][] = [
  ['inner', 'Inner', 'Only rows whose key exists in both files.'],
  ['left', 'Left', 'Every left row; right columns filled where a match exists.'],
  ['right', 'Right', 'Every right row; left columns filled where a match exists.'],
  ['full', 'Full outer', 'Everything from both sides, matched where possible.'],
  ['anti', 'Left anti', 'Left rows with NO match on the right (what is missing?).'],
  ['ranti', 'Right anti', 'Right rows with NO match on the left (orphans).'],
]

/** Venn diagram of the selected join. */
function Venn({ type }: { type: JoinType }) {
  const a = type === 'left' || type === 'full' || type === 'anti'
  const b = type === 'right' || type === 'full' || type === 'ranti'
  const mid = type !== 'anti' && type !== 'ranti'
  const on = 'var(--accent)'
  return (
    <svg width={120} height={70} viewBox="0 0 120 70" aria-label={`${type} join diagram`}>
      <defs>
        <clipPath id="vA"><circle cx={45} cy={35} r={28} /></clipPath>
      </defs>
      <circle cx={45} cy={35} r={28} fill={a ? on : 'transparent'} opacity={0.55} />
      <circle cx={75} cy={35} r={28} fill={b ? on : 'transparent'} opacity={0.55} />
      <circle cx={75} cy={35} r={28} clipPath="url(#vA)" fill={mid ? on : 'var(--panel)'} opacity={mid ? 0.9 : 1} />
      <circle cx={45} cy={35} r={28} fill="none" stroke="var(--fg)" strokeWidth={1.2} />
      <circle cx={75} cy={35} r={28} fill="none" stroke="var(--fg)" strokeWidth={1.2} />
      <text x={30} y={39} fontSize={11} fill="var(--fg)">L</text>
      <text x={84} y={39} fontSize={11} fill="var(--fg)">R</text>
    </svg>
  )
}

export default function CsvJoiner() {
  const [s, set, reset] = useToolState('csv-joiner', DEF)
  const [tab, setTab] = useState<'result' | 'ul' | 'ur'>('result')
  const [filter, setFilter] = useState('')
  const L = useMemo(() => parseTable(s.left), [s.left])
  const R = useMemo(() => parseTable(s.right), [s.right])
  const pairs = s.pairs.map(([a, b]) => [L.header.indexOf(a), R.header.indexOf(b)] as const)
  const valid = pairs.length > 0 && pairs.every(([a, b]) => a >= 0 && b >= 0)
  const res = useMemo(
    () => (valid ? join(L, R, { type: s.type, leftKeys: pairs.map((p) => p[0]), rightKeys: pairs.map((p) => p[1]), ignoreCase: s.ignoreCase, trim: s.trim, coalesceKeys: s.coalesce, suffix: [s.sfxL, s.sfxR] }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [L, R, s.type, JSON.stringify(s.pairs), s.ignoreCase, s.trim, s.coalesce, s.sfxL, s.sfxR, valid],
  )

  const autoKeys = (left: string, right: string) => {
    const a = parseTable(left), b = parseTable(right)
    const [i, j] = guessKeys(a.header, b.header)
    return [[a.header[i] ?? '', b.header[j] ?? '']] as [string, string][]
  }
  const load = async (side: 'left' | 'right', f: File) => {
    const text = await f.text()
    const left = side === 'left' ? text : s.left
    const right = side === 'right' ? text : s.right
    set({ [side]: text, [`${side}Name`]: f.name, pairs: autoKeys(left, right) } as Partial<typeof DEF>)
  }
  const editPair = (k: number, side: 0 | 1, v: string) => set({ pairs: s.pairs.map((p, i) => (i === k ? ((side ? [p[0], v] : [v, p[1]]) as [string, string]) : p)) })

  const view = !res ? null
    : tab === 'result' ? { header: res.header, rows: res.rows, origin: res.origin }
    : tab === 'ul' ? { header: L.header, rows: res.unmatchedLeft.map((i) => L.rows[i]), origin: null }
    : { header: R.header, rows: res.unmatchedRight.map((i) => R.rows[i]), origin: null }
  const q = filter.trim().toLowerCase()
  const shownIdx = view ? view.rows.map((_, i) => i).filter((i) => !q || view.rows[i].some((c) => c.toLowerCase().includes(q))) : []
  const base = (n: string) => n.replace(/\.[^.]+$/, '')
  const outName = `${base(s.leftName)}-${s.type}-${base(s.rightName)}.csv`
  const ORIGIN_C = { both: 'var(--ok)', left: 'var(--accent2)', right: 'var(--warn)' }

  return (
    <Split>
      <div>
        {(['left', 'right'] as const).map((side) => {
          const t = side === 'left' ? L : R
          return (
            <Panel key={side} title={`${side === 'left' ? 'Left' : 'Right'} table · ${s[`${side}Name`]}`} actions={<span className="muted">{t.rows.length} rows · {t.header.length} cols</span>}>
              <FileDrop accept=".csv,.tsv,.txt,text/csv" onFiles={(f) => void load(side, f[0])} label="Drop a CSV / TSV file (or click)" />
              <div style={{ height: 8 }} />
              <Area value={s[side]} onChange={(v) => set({ [side]: v } as Partial<typeof DEF>)} rows={6} mono />
            </Panel>
          )
        })}
        <Panel title="Join on" actions={<Btn kind="ghost" onClick={reset}>Sample</Btn>}>
          {s.pairs.map(([a, b], k) => (
            <Row key={k} wrap={false}>
              <label className="k-field" style={{ flex: 1 }}>
                <span className="k-label">Left key {s.pairs.length > 1 ? k + 1 : ''}</span>
                <select className="k-select" value={a} onChange={(e) => editPair(k, 0, e.target.value)}>
                  {!L.header.includes(a) && <option value={a}>— choose —</option>}
                  {L.header.map((h) => <option key={h}>{h}</option>)}
                </select>
              </label>
              <span style={{ alignSelf: 'end', padding: '0 0 10px' }}>=</span>
              <label className="k-field" style={{ flex: 1 }}>
                <span className="k-label">Right key</span>
                <select className="k-select" value={b} onChange={(e) => editPair(k, 1, e.target.value)}>
                  {!R.header.includes(b) && <option value={b}>— choose —</option>}
                  {R.header.map((h) => <option key={h}>{h}</option>)}
                </select>
              </label>
              {s.pairs.length > 1 && <Btn kind="ghost" title="Remove key" onClick={() => set({ pairs: s.pairs.filter((_, i) => i !== k) })}>✕</Btn>}
            </Row>
          ))}
          <Row>
            <Btn onClick={() => set({ pairs: [...s.pairs, [L.header[0] ?? '', R.header[0] ?? '']] })}>+ Composite key column</Btn>
            <Btn onClick={() => set({ pairs: autoKeys(s.left, s.right) })}>Auto-detect</Btn>
          </Row>
          <Check label="Ignore case (C002 = c002)" value={s.ignoreCase} onChange={(ignoreCase) => set({ ignoreCase })} />
          <Check label="Trim spaces around keys" value={s.trim} onChange={(trim) => set({ trim })} />
          <Check label="Merge key columns into one" value={s.coalesce} onChange={(coalesce) => set({ coalesce })} />
          <Row>
            <Txt label="Suffix for clashing left columns" value={s.sfxL} onChange={(sfxL) => set({ sfxL })} />
            <Txt label="…right columns" value={s.sfxR} onChange={(sfxR) => set({ sfxR })} />
          </Row>
        </Panel>
      </div>
      <div>
        <Panel title="Join type">
          <Row wrap={false}>
            <Venn type={s.type} />
            <div style={{ flex: 1 }}>
              <Seg value={s.type} onChange={(type) => set({ type })} options={TYPES.map(([v, l]) => [v, l] as const)} />
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>{TYPES.find((t) => t[0] === s.type)?.[2]}</p>
            </div>
          </Row>
        </Panel>
        {!valid && <Note tone="err">Pick key columns that exist in both tables.</Note>}
        {res && (
          <>
            <Stats>
              <Stat label="Result rows" value={res.rows.length} tone="accent" sub={`${res.header.length} columns`} />
              <Stat label="Left matched" value={`${res.matchedLeft} / ${L.rows.length}`} sub={pct(res.matchedLeft / (L.rows.length || 1), 0)} tone={res.unmatchedLeft.length ? undefined : 'good'} />
              <Stat label="Right matched" value={`${res.matchedRight} / ${R.rows.length}`} sub={pct(res.matchedRight / (R.rows.length || 1), 0)} />
              <Stat label="Unmatched" value={`${res.unmatchedLeft.length} L · ${res.unmatchedRight.length} R`} tone={res.unmatchedLeft.length + res.unmatchedRight.length ? 'bad' : 'good'} />
            </Stats>
            {res.manyToMany > 0 && <Note tone="warn">{res.manyToMany} left key{res.manyToMany > 1 ? 's match' : ' matches'} several right rows, so those left rows are repeated (one-to-many). That's expected for e.g. customers → orders.</Note>}
            {res.blankKeys > 0 && <Note tone="warn">{res.blankKeys} left row(s) have an empty key; empty keys never match.</Note>}
            <Panel
              title="Preview"
              actions={
                <>
                  <CopyButton text={() => toCsvText(view!.header, view!.rows)} />
                  <Btn kind="primary" onClick={() => download(tab === 'result' ? outName : tab === 'ul' ? `unmatched-${s.leftName}` : `unmatched-${s.rightName}`, toCsvText(view!.header, view!.rows), 'text/csv')}>⬇ CSV</Btn>
                </>
              }
            >
              <Row>
                <Seg value={tab} onChange={setTab} options={[['result', `Result (${res.rows.length})`], ['ul', `Unmatched left (${res.unmatchedLeft.length})`], ['ur', `Unmatched right (${res.unmatchedRight.length})`]]} />
                <Txt label="" value={filter} onChange={setFilter} placeholder="Filter rows…" />
              </Row>
              {view && (
                <Table
                  head={[...(view.origin ? [''] : []), ...view.header]}
                  rows={shownIdx.map((i) => [
                    ...(view.origin ? [<span key="o" title={view.origin[i]} style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: ORIGIN_C[view.origin[i]] }} />] : []),
                    ...view.rows[i].map((c, j) => (c === '' ? <span key={j} className="muted">∅</span> : c)),
                  ])}
                  max={200}
                />
              )}
              {tab === 'result' && (
                <p className="muted" style={{ fontSize: 12 }}>
                  <span style={{ color: ORIGIN_C.both }}>●</span> matched &nbsp; <span style={{ color: ORIGIN_C.left }}>●</span> left only &nbsp; <span style={{ color: ORIGIN_C.right }}>●</span> right only · ∅ = empty cell
                </p>
              )}
            </Panel>
          </>
        )}
        <Note>Joins run entirely in your browser with a hash index, so tens of thousands of rows join instantly. Delimiters (comma, semicolon, tab, pipe) are detected automatically.</Note>
      </div>
    </Split>
  )
}
