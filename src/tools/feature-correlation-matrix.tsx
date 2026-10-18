import { useMemo, useState } from 'react'
import { Area, Btn, Check, CsvButton, FileDrop, fmt, Note, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { adjust, corrDistance, matrix, parseTable, sampleCsv, upgma, type Adjust, type Method, type Tree } from './lib/feature-correlation-matrix'

interface S { text: string; method: Method; order: 'cluster' | 'original' | 'alpha'; signed: boolean; adj: Adjust; alpha: number; values: boolean; lower: boolean }
const SAMPLE = sampleCsv()
const DEF: S = { text: SAMPLE, method: 'pearson', order: 'cluster', signed: false, adj: 'holm', alpha: 0.05, values: true, lower: false }

const cellFill = (r: number) => (!Number.isFinite(r) ? 'var(--panel2)' : r >= 0 ? `rgba(220,38,38,${0.08 + 0.92 * Math.abs(r)})` : `rgba(37,99,235,${0.08 + 0.92 * Math.abs(r)})`)
const fmtP = (p: number) => (!Number.isFinite(p) ? '—' : p < 1e-4 ? p.toExponential(1) : p.toFixed(4))
const strength = (r: number) => {
  const a = Math.abs(r)
  return a >= 0.8 ? 'very strong' : a >= 0.6 ? 'strong' : a >= 0.4 ? 'moderate' : a >= 0.2 ? 'weak' : 'negligible'
}

/** Dendrogram drawn above the heatmap columns; leaf x positions follow `order`. */
function dendroPaths(tree: Tree, k: number, cell: number, height: number): string[] {
  const pos = new Map<number, [number, number]>() // id -> [x, h]
  tree.order.forEach((leaf, i) => pos.set(leaf, [i * cell + cell / 2, 0]))
  const maxH = Math.max(1e-9, ...tree.merges.map((m) => m.h))
  const y = (h: number) => height - (h / maxH) * (height - 4)
  const out: string[] = []
  tree.merges.forEach((m, i) => {
    const [xa, ha] = pos.get(m.a)!, [xb, hb] = pos.get(m.b)!
    out.push(`M${xa},${y(ha)}V${y(m.h)}H${xb}V${y(hb)}`)
    pos.set(k + i, [(xa + xb) / 2, m.h])
  })
  return out
}

function Scatter({ x, y, nx, ny }: { x: number[]; y: number[]; nx: string; ny: string }) {
  const pts = x.map((v, i) => [v, y[i]] as const).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b))
  if (pts.length < 2) return null
  const W = 420, H = 260, P = 40
  const [x0, x1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))]
  const [y0, y1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))]
  const sx = (v: number) => P + ((v - x0) / (x1 - x0 || 1)) * (W - P - 10)
  const sy = (v: number) => H - P + 10 - ((v - y0) / (y1 - y0 || 1)) * (H - P - 10)
  // least-squares line
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n
  const b = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / (pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0) || 1)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W }} role="img" aria-label={`${ny} vs ${nx}`}>
      <rect x={P} y={10} width={W - P - 10} height={H - P} fill="none" stroke="var(--line)" />
      {pts.map(([a, c], i) => <circle key={i} cx={sx(a)} cy={sy(c)} r={2.8} fill="var(--accent)" opacity={0.6} />)}
      <line x1={sx(x0)} y1={sy(my + b * (x0 - mx))} x2={sx(x1)} y2={sy(my + b * (x1 - mx))} stroke="var(--warn)" strokeWidth={2} />
      <text x={(W + P) / 2} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--muted)">{nx} ({fmt(x0, 3)} – {fmt(x1, 3)})</text>
      <text x={12} y={(H - P) / 2 + 10} textAnchor="middle" fontSize={12} fill="var(--muted)" transform={`rotate(-90 12 ${(H - P) / 2 + 10})`}>{ny}</text>
    </svg>
  )
}

export default function FeatureCorrelationMatrix() {
  const [s, set, reset] = useToolState('feature-correlation-matrix', DEF)
  const [sel, setSel] = useState<[number, number] | null>(null)
  const [sort, setSort] = useState<'abs' | 'r' | 'p' | 'name'>('abs')
  const data = useMemo(() => parseTable(s.text), [s.text])
  const M = useMemo(() => matrix(data, s.method), [data, s.method])
  const k = data.names.length
  const tree = useMemo(() => upgma(corrDistance(M, s.signed)), [M, s.signed])
  const order = useMemo(() => {
    const idx = data.names.map((_, i) => i)
    if (s.order === 'cluster') return tree.order
    if (s.order === 'alpha') return idx.sort((a, b) => data.names[a].localeCompare(data.names[b]))
    return idx
  }, [s.order, tree, data.names])

  const pairs = useMemo(() => {
    const list: { i: number; j: number; r: number; p: number; n: number; padj: number }[] = []
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) list.push({ i, j, ...M[i][j], padj: 0 })
    const adj = adjust(list.map((x) => (Number.isFinite(x.p) ? x.p : 1)), s.adj)
    list.forEach((x, q) => (x.padj = adj[q]))
    return list
  }, [M, k, s.adj])
  const sorted = useMemo(() => {
    const l = pairs.slice()
    if (sort === 'abs') l.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    else if (sort === 'r') l.sort((a, b) => b.r - a.r)
    else if (sort === 'p') l.sort((a, b) => a.padj - b.padj)
    else l.sort((a, b) => (data.names[a.i] + data.names[a.j]).localeCompare(data.names[b.i] + data.names[b.j]))
    return l
  }, [pairs, sort, data.names])
  const padj = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of pairs) m.set(`${p.i},${p.j}`, p.padj)
    return (i: number, j: number) => (i === j ? 0 : m.get(i < j ? `${i},${j}` : `${j},${i}`) ?? NaN)
  }, [pairs])
  const sig = pairs.filter((p) => p.padj < s.alpha).length
  const top = sorted[0]
  const pick = sel && sel[0] < k && sel[1] < k ? sel : top ? [top.i, top.j] as [number, number] : null

  const cell = k > 14 ? 30 : k > 10 ? 40 : 52
  const labelW = Math.min(150, 10 + 7.2 * Math.max(4, ...data.names.map((n) => n.length)))
  const dendH = s.order === 'cluster' ? 70 : 0
  const W = labelW + k * cell + 6, H = dendH + k * cell + 6
  const rLabel = s.method === 'pearson' ? 'r' : s.method === 'spearman' ? 'ρ' : 'τ'

  return (
    <Split wide="right">
      <div>
        <Panel title="Data" actions={<><Btn kind="ghost" onClick={() => set({ text: SAMPLE })}>Sample</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <FileDrop accept=".csv,.tsv,.txt,text/csv" onFiles={async ([f]) => set({ text: await f.text() })} label="Drop a CSV/TSV with a header row" />
          <div style={{ marginTop: 8 }}>
            <Area value={s.text} onChange={(text) => set({ text })} rows={7} mono />
          </div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {data.rows} rows · {k} numeric features{data.dropped.length ? ` · ignored non-numeric: ${data.dropped.join(', ')}` : ''}. Missing cells are skipped pairwise.
          </div>
        </Panel>
        <Panel title="Options">
          <Seg value={s.method} onChange={(method) => set({ method })} options={[['pearson', 'Pearson r'], ['spearman', 'Spearman ρ'], ['kendall', 'Kendall τ-b']]} />
          <div style={{ marginTop: 10 }}>
            <Seg value={s.order} onChange={(order) => set({ order })} options={[['cluster', 'Clustered'], ['original', 'Original'], ['alpha', 'A–Z']]} />
          </div>
          <Row>
            <Select label="p-value adjustment" value={s.adj} onChange={(adj) => set({ adj })} options={[['none', 'None'], ['holm', 'Holm (FWER)'], ['bh', 'Benjamini–Hochberg (FDR)']]} />
            <Select label="Significance α" value={s.alpha} onChange={(alpha) => set({ alpha })} options={[[0.1, '0.10'], [0.05, '0.05'], [0.01, '0.01'], [0.001, '0.001']]} />
          </Row>
          <Check label="Cluster on signed distance 1 − r (otherwise 1 − |r|)" value={s.signed} onChange={(signed) => set({ signed })} />
          <Check label="Show values in cells" value={s.values} onChange={(values) => set({ values })} />
          <Check label="Lower triangle only" value={s.lower} onChange={(lower) => set({ lower })} />
          <Note>
            Pearson measures linear association; Spearman (ranks) and Kendall (concordant pairs) capture any monotonic trend and resist outliers.
            p-values: t-test with n − 2 df for r and ρ, normal approximation with tie correction for τ-b. Clustering is average linkage (UPGMA).
          </Note>
        </Panel>
      </div>
      <div>
        {k < 2 ? (
          <Note tone="warn">Need at least two numeric columns with three or more values each.</Note>
        ) : (
          <>
            <Stats>
              <Stat label="Features" value={k} sub={`${pairs.length} pairs`} />
              <Stat label={`Significant (α = ${s.alpha})`} value={sig} sub={s.adj === 'none' ? 'unadjusted' : s.adj === 'holm' ? 'Holm-adjusted' : 'BH-adjusted'} tone="accent" />
              {top && <Stat label="Strongest pair" value={`${rLabel} = ${top.r.toFixed(2)}`} sub={`${data.names[top.i]} × ${data.names[top.j]}`} />}
            </Stats>
            <Panel
              title={`${s.method[0].toUpperCase() + s.method.slice(1)} correlation heatmap`}
              actions={<CsvButton name={`correlation-${s.method}.csv`} rows={() => [['', ...order.map((i) => data.names[i])], ...order.map((i) => [data.names[i], ...order.map((j) => +M[i][j].r.toFixed(6))])]} />}
            >
              <div style={{ overflowX: 'auto' }}>
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', maxWidth: 'none' }} role="img" aria-label="Correlation heatmap">
                  {dendH > 0 && (
                    <g transform={`translate(${labelW},0)`}>
                      {dendroPaths(tree, k, cell, dendH - 6).map((d, i) => <path key={i} d={d} fill="none" stroke="var(--muted)" strokeWidth={1.3} />)}
                    </g>
                  )}
                  {order.map((i, a) => (
                    <text key={i} x={labelW - 6} y={dendH + a * cell + cell / 2 + 4} textAnchor="end" fontSize={12} fill="var(--fg)">{data.names[i]}</text>
                  ))}
                  {order.map((i, a) =>
                    order.map((j, b) => {
                      if (s.lower && b > a) return null
                      const c = M[i][j]
                      const on = pick && ((pick[0] === i && pick[1] === j) || (pick[0] === j && pick[1] === i))
                      const ps = padj(i, j)
                      return (
                        <g key={`${i}-${j}`} onClick={() => i !== j && setSel([i, j])} style={{ cursor: i !== j ? 'pointer' : 'default' }}>
                          <title>{`${data.names[i]} × ${data.names[j]}\n${rLabel} = ${fmt(c.r, 4)}\np = ${fmtP(c.p)}${s.adj !== 'none' ? ` (adj ${fmtP(ps)})` : ''}\nn = ${c.n}`}</title>
                          <rect x={labelW + b * cell} y={dendH + a * cell} width={cell - 1} height={cell - 1} fill={cellFill(c.r)} stroke={on ? 'var(--fg)' : 'none'} strokeWidth={2} rx={2} />
                          {s.values && cell >= 30 && (
                            <text x={labelW + b * cell + cell / 2} y={dendH + a * cell + cell / 2 + 4} textAnchor="middle" fontSize={cell >= 40 ? 12 : 10} fill={Math.abs(c.r) > 0.55 ? '#fff' : 'var(--fg)'}>
                              {i === j ? '1' : c.r.toFixed(2).replace(/^(-?)0\./, '$1.')}{i !== j && ps < s.alpha ? '*' : ''}
                            </text>
                          )}
                        </g>
                      )
                    }),
                  )}
                </svg>
              </div>
              <Row>
                <span className="muted" style={{ fontSize: 12 }}>−1</span>
                <div style={{ flex: 1, maxWidth: 260, height: 10, borderRadius: 5, background: 'linear-gradient(90deg, rgb(37,99,235), rgba(37,99,235,.08) 49%, rgba(220,38,38,.08) 51%, rgb(220,38,38))' }} />
                <span className="muted" style={{ fontSize: 12 }}>+1 · * = significant after adjustment · click a cell for its scatter plot</span>
              </Row>
            </Panel>
            {pick && (
              <Panel title={`${data.names[pick[1]]} vs ${data.names[pick[0]]}`}>
                <Row>
                  <Scatter x={data.cols[pick[0]]} y={data.cols[pick[1]]} nx={data.names[pick[0]]} ny={data.names[pick[1]]} />
                  <div style={{ minWidth: 180 }}>
                    <Stats>
                      <Stat label={rLabel} value={fmt(M[pick[0]][pick[1]].r, 3)} sub={`${strength(M[pick[0]][pick[1]].r)} ${M[pick[0]][pick[1]].r >= 0 ? 'positive' : 'negative'}`} />
                      <Stat label="p (raw)" value={fmtP(M[pick[0]][pick[1]].p)} sub={`adjusted ${fmtP(padj(pick[0], pick[1]))} · n = ${M[pick[0]][pick[1]].n}`} />
                    </Stats>
                  </div>
                </Row>
              </Panel>
            )}
            <Panel
              title="Pairs"
              actions={
                <>
                  <Select label="Sort by" value={sort} onChange={setSort} options={[['abs', `|${rLabel}| descending`], ['r', `${rLabel} descending`], ['p', 'adjusted p'], ['name', 'name']]} />
                  <CsvButton name={`correlation-pairs-${s.method}.csv`} rows={() => [['feature_a', 'feature_b', rLabel, 'p', 'p_adjusted', 'n'], ...sorted.map((p) => [data.names[p.i], data.names[p.j], +p.r.toFixed(6), p.p, p.padj, p.n])]} />
                </>
              }
            >
              <Table
                max={60}
                head={['Feature A', 'Feature B', rLabel, '', 'p', 'p adj.', 'n']}
                rows={sorted.map((p) => [
                  <a key="a" href="#" onClick={(e) => { e.preventDefault(); setSel([p.i, p.j]) }}>{data.names[p.i]}</a>,
                  data.names[p.j],
                  <b key="r" style={{ color: p.r >= 0 ? 'rgb(220,38,38)' : 'rgb(37,99,235)' }}>{p.r.toFixed(3)}</b>,
                  <span key="s" className="muted">{strength(p.r)}</span>,
                  fmtP(p.p),
                  <span key="pa" style={{ fontWeight: p.padj < s.alpha ? 700 : 400 }}>{fmtP(p.padj)}</span>,
                  p.n,
                ])}
              />
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
