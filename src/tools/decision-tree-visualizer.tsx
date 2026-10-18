import { useMemo, useState } from 'react'
import { Area, Bar, Btn, color, download, FileDrop, LineChart, Note, Panel, pct, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { iris } from './lib/pca-visualizer'
import {
  confusion, describeSplit, holdout, importance, layout, leaves, nodes, parseCsv, predictPath, pruningPath, toDataset, train,
  type Criterion, type Dataset, type Node,
} from './lib/decision-tree-visualizer'

type Src = 'iris' | 'picnic' | 'csv'
interface State { src: Src; csv: string; target: number; criterion: Criterion; maxDepth: number; minSplit: number; minLeaf: number; testPct: number; seed: number; pruneStep: number; sampleIdx: number }

const DEF: State = { src: 'iris', csv: '', target: -1, criterion: 'gini', maxDepth: 5, minSplit: 2, minLeaf: 1, testPct: 30, seed: 7, pruneStep: 0, sampleIdx: 0 }

function irisCsv(): string {
  const d = iris()
  return [[...d.features, 'species'].join(','), ...d.rows.map((r, i) => [...r, d.labels[i]].join(','))].join('\n')
}

/** Original synthetic mixed-type data: will a group go for a picnic? */
function picnicCsv(): string {
  let s = 11
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296)
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
  const out = ['sky,temp_c,wind,weekend,picnic']
  for (let i = 0; i < 80; i++) {
    const sky = pick(['sunny', 'sunny', 'cloudy', 'rain'])
    const temp = Math.round(6 + rnd() * 24)
    const wind = pick(['calm', 'breezy', 'gusty'])
    const wk = pick(['yes', 'no'])
    let go = sky !== 'rain' && temp >= 15 && wind !== 'gusty' && (wk === 'yes' || (sky === 'sunny' && temp >= 22))
    if (rnd() < 0.06) go = !go
    out.push([sky, temp, wind, wk, go ? 'yes' : 'no'].join(','))
  }
  return out.join('\n')
}

const NW = 150, NH = 74, DX = 166, DY = 112

export default function DecisionTreeVisualizer() {
  const [s, set, reset] = useToolState('decision-tree-visualizer', DEF)
  const [hover, setHover] = useState<number | null>(null)
  const text = s.src === 'iris' ? irisCsv() : s.src === 'picnic' ? picnicCsv() : s.csv
  const rows = useMemo(() => parseCsv(text), [text])
  const head = useMemo(() => rows[0] ?? [], [rows])
  const target = s.target >= 0 && s.target < head.length ? s.target : head.length - 1
  const d: Dataset | null = useMemo(() => (rows.length > 2 && head.length > 1 ? toDataset(rows, target) : null), [rows, head.length, target])

  const model = useMemo(() => {
    if (!d || d.classes.length < 2) return null
    if (d.classes.length > 30) return { error: `Target "${head[target]}" has ${d.classes.length} distinct values: pick a categorical class column.` }
    const h = holdout(d, s.testPct / 100, s.seed)
    if (h.train.length < 4) return { error: 'Too few training rows.' }
    const full = train(d, h.train, { criterion: s.criterion, maxDepth: s.maxDepth, minSplit: s.minSplit, minLeaf: s.minLeaf })
    const path = pruningPath(full).map((p) => ({ ...p, trainAcc: confusion(p.tree, d, h.train).acc, testAcc: h.test.length ? confusion(p.tree, d, h.test).acc : NaN }))
    return { h, full, path }
  }, [d, head, target, s.testPct, s.seed, s.criterion, s.maxDepth, s.minSplit, s.minLeaf])

  if (!d || !model || 'error' in model) {
    return (
      <Panel title="Data">
        <Note tone="warn">{model && 'error' in model ? model.error : 'Need a CSV with a header row, at least 3 data rows and a class column with ≥ 2 values.'}</Note>
        <Btn onClick={reset}>Load the Iris sample</Btn>
        {s.src === 'csv' && <Area value={s.csv} onChange={(csv) => set({ csv })} rows={8} mono />}
      </Panel>
    )
  }

  const step = Math.min(s.pruneStep, model.path.length - 1)
  const cur = model.path[step]
  const tree = cur.tree
  const imp = importance(tree, d.features.length)
  const trainC = confusion(tree, d, model.h.train)
  const testC = confusion(tree, d, model.h.test)
  const lay = layout(tree, DX, DY)
  const depth = Math.max(...nodes(tree).map((n) => n.depth))
  const sampleRows = model.h.test.length ? model.h.test : model.h.train
  const sIdx = sampleRows[Math.min(s.sampleIdx, sampleRows.length - 1)]
  const path = predictPath(tree, d.X[sIdx])
  const onPath = new Set(path.map((n) => n.id))
  const fnum = (v: number) => String(+v.toFixed(3))
  const W = lay.width + 20, H = lay.height + 10

  const svgEl = (
    <svg width={W} height={H} viewBox={`-${NW / 2 - DX / 2 + 10} -10 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" style={{ fontFamily: 'system-ui, sans-serif' }}>
      {lay.placed.filter((p) => p.parent).map((p) => {
        const a = p.parent!, hot = onPath.has(p.node.id) && onPath.has(a.node.id)
        const isLeft = a.node.left === p.node
        const x1 = a.x + DX / 2, y1 = a.y + NH, x2 = p.x + DX / 2, y2 = p.y
        return (
          <g key={`e${p.node.id}`}>
            <path d={`M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`} fill="none" stroke={hot ? '#f59e0b' : '#94a3b8'} strokeWidth={hot ? 3.5 : 1.4} />
            <text x={(x1 + x2) / 2 + (isLeft ? -6 : 6)} y={(y1 + y2) / 2} textAnchor={isLeft ? 'end' : 'start'} fontSize={11} fill="#64748b">{isLeft ? 'yes' : 'no'}</text>
          </g>
        )
      })}
      {lay.placed.map(({ node: n, x, y }) => {
        const leaf = !n.left, hot = onPath.has(n.id)
        const x0 = x + DX / 2 - NW / 2
        let acc = 0
        return (
          <g key={n.id} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}>
            <rect x={x0} y={y} width={NW} height={NH} rx={8} fill={leaf ? color(n.pred) + '22' : 'var(--panel, #fff)'} stroke={hot ? '#f59e0b' : leaf ? color(n.pred) : '#94a3b8'} strokeWidth={hot ? 3 : 1.2} />
            <text x={x0 + NW / 2} y={y + 17} textAnchor="middle" fontSize={12} fontWeight={700} fill="currentColor">
              {leaf ? `→ ${d.classes[n.pred]}` : describeSplit(d, n, fnum)}
            </text>
            <text x={x0 + NW / 2} y={y + 34} textAnchor="middle" fontSize={11} fill="#64748b">
              {s.criterion} {n.impurity.toFixed(3)} · n={n.n}
            </text>
            {n.counts.map((c, k) => {
              const w = (c / n.n) * (NW - 16)
              const r = <rect key={k} x={x0 + 8 + acc} y={y + 44} width={w} height={10} fill={color(k)}><title>{`${d.classes[k]}: ${c}`}</title></rect>
              acc += w
              return r
            })}
            <text x={x0 + NW / 2} y={y + 68} textAnchor="middle" fontSize={10.5} fill="#64748b">
              [{n.counts.join(', ')}]
            </text>
          </g>
        )
      })}
    </svg>
  )
  const hovered = hover !== null ? nodes(tree).find((n) => n.id === hover) : null

  const exportSvg = () => {
    const el = document.getElementById('dt-svg')?.innerHTML ?? ''
    download('decision-tree.svg', el.replace('<svg', '<svg style="background:#fff;color:#0f172a"').replace(/var\(--panel, #fff\)/g, '#fff'), 'image/svg+xml')
  }

  const findPath = (t: Node, lf: Node, acc: string[]): string[] | null => {
    if (t === lf) return acc
    if (!t.left || !t.right) return null
    const sp = describeSplit(d, t, fnum)
    return findPath(t.left, lf, [...acc, sp]) ?? findPath(t.right, lf, [...acc, `NOT(${sp})`])
  }
  const rules = leaves(tree).map((leaf) => ({ conds: findPath(tree, leaf, []) ?? [], leaf }))

  return (
    <div>
      <Split>
        <div>
          <Panel title="Data" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Seg value={s.src} onChange={(src) => set({ src, target: -1, pruneStep: 0, sampleIdx: 0, csv: src === 'csv' && !s.csv ? picnicCsv() : s.csv })} options={[['iris', 'Iris (150)'], ['picnic', 'Picnic (mixed types)'], ['csv', 'Your CSV']]} />
            {s.src === 'csv' && (
              <>
                <FileDrop accept=".csv,.tsv,.txt" onFiles={async ([f]) => set({ csv: await f.text(), target: -1, pruneStep: 0 })} label="Drop a CSV (header row, one class column)" />
                <Area value={s.csv} onChange={(csv) => set({ csv })} rows={6} mono />
              </>
            )}
            <Select label="Class (target) column" value={target} onChange={(t) => set({ target: t, pruneStep: 0, sampleIdx: 0 })} options={head.map((h, i) => [i, h] as [number, string])} />
            <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
              {d.X.length} rows · {d.classes.length} classes · features: {d.features.map((f, i) => `${f} (${d.numeric[i] ? 'num' : 'cat'})`).join(', ')}
            </p>
          </Panel>
          <Panel title="Training">
            <Seg value={s.criterion} onChange={(criterion) => set({ criterion, pruneStep: 0 })} options={[['gini', 'Gini impurity'], ['entropy', 'Entropy (info gain)']]} />
            <Slider label="Max depth" value={s.maxDepth} onChange={(maxDepth) => set({ maxDepth, pruneStep: 0 })} min={1} max={12} />
            <Row>
              <Slider label="Min samples to split" value={s.minSplit} onChange={(minSplit) => set({ minSplit, pruneStep: 0 })} min={2} max={40} />
              <Slider label="Min samples per leaf" value={s.minLeaf} onChange={(minLeaf) => set({ minLeaf, pruneStep: 0 })} min={1} max={20} />
            </Row>
            <Row>
              <Slider label="Holdout" value={s.testPct} onChange={(testPct) => set({ testPct, pruneStep: 0, sampleIdx: 0 })} min={0} max={50} step={5} unit="%" />
              <Slider label="Shuffle seed" value={s.seed} onChange={(seed) => set({ seed, pruneStep: 0 })} min={1} max={50} />
            </Row>
            <Slider label="Cost-complexity pruning α" value={step} onChange={(pruneStep) => set({ pruneStep })} min={0} max={model.path.length - 1} show={(i) => `${model.path[i].alpha.toFixed(4)} (${model.path[i].leaves} leaves)`} />
            <Btn onClick={() => {
              let b = 0
              model.path.forEach((p, i) => { if (p.testAcc > model.path[b].testAcc + 1e-9) b = i })
              set({ pruneStep: b })
            }} disabled={!model.h.test.length}>Pick α with best holdout accuracy</Btn>
          </Panel>
        </div>
        <div>
          <Stats>
            <Stat label="Train accuracy" value={pct(trainC.acc)} sub={`${model.h.train.length} rows`} />
            <Stat label="Holdout accuracy" value={model.h.test.length ? pct(testC.acc) : '—'} tone="accent" sub={`${model.h.test.length} rows`} />
            <Stat label="Leaves" value={leaves(tree).length} sub={`depth ${depth}`} />
            <Stat label="Prediction for sample" value={d.classes[path.at(-1)!.pred]} tone={d.classes[path.at(-1)!.pred] === d.y[sIdx] ? 'good' : 'bad'} sub={`actual ${d.y[sIdx]}`} />
          </Stats>
          <Panel title="Pruning path: accuracy % vs α">
            <LineChart
              series={[
                { name: 'Train', points: model.path.map((p, i) => [i, p.trainAcc * 100]) },
                ...(model.h.test.length ? [{ name: 'Holdout', points: model.path.map((p, i) => [i, p.testAcc * 100] as [number, number]) }] : []),
              ]}
              xLabel="pruning step (increasing α → fewer leaves)" yMax={100} fx={(v) => (Number.isInteger(v) ? `${model.path[v]?.leaves ?? ''}L` : '')} fy={(v) => v.toFixed(0)}
              markers={[{ x: step, label: 'selected' }]} height={200}
            />
          </Panel>
        </div>
      </Split>

      <Panel title="Tree" actions={<>
        <Btn onClick={exportSvg}>⬇ SVG</Btn>
      </>}>
        <Row>
          <Select label="Highlight path for row" value={Math.min(s.sampleIdx, sampleRows.length - 1)} onChange={(sampleIdx) => set({ sampleIdx })} options={sampleRows.map((r, i) => [i, `#${r + 1} · ${d.y[r]} · ${d.X[r].map((v) => (typeof v === 'number' ? fnum(v) : v)).join(', ')}`] as [number, string])} />
        </Row>
        <p className="muted" style={{ fontSize: 13 }}>
          {path.slice(0, -1).map((n, i) => `${describeSplit(d, n, fnum)} → ${path[i + 1] === n.left ? 'yes' : 'no'}`).join('  ·  ')} ⇒ <b>{d.classes[path.at(-1)!.pred]}</b>
          {hovered && <> &nbsp;|&nbsp; hovered node: {hovered.n} rows, {hovered.counts.map((c, k) => `${d.classes[k]} ${c}`).join(', ')}</>}
        </p>
        <div id="dt-svg" style={{ overflowX: 'auto', paddingBottom: 6 }}>{svgEl}</div>
        <div className="k-legend">{d.classes.map((c, k) => <span key={c}><i style={{ background: color(k) }} />{c}</span>)}</div>
      </Panel>

      <Split>
        <Panel title="Feature importance (mean decrease in impurity)">
          {d.features.map((f, i) => ({ f, v: imp[i] })).sort((a, b) => b.v - a.v).map(({ f, v }) => (
            <div key={f} style={{ marginBottom: 8 }}>
              <Row wrap={false}><span style={{ flex: 1 }}>{f}</span><b>{pct(v)}</b></Row>
              <Bar value={v} max={1} />
            </div>
          ))}
        </Panel>
        <Panel title={`Confusion matrix (${model.h.test.length ? 'holdout' : 'training'})`}>
          {(() => {
            const C = model.h.test.length ? testC : trainC
            const mx = Math.max(1, ...C.m.flat())
            return (
              <Table
                head={['actual ↓ / predicted →', ...d.classes, 'recall']}
                rows={C.m.map((row, i) => [
                  <b key="a">{d.classes[i]}</b>,
                  ...row.map((v, j) => <span key={j} style={{ display: 'inline-block', minWidth: 34, textAlign: 'center', padding: '2px 6px', borderRadius: 6, background: `${i === j ? '#10b981' : '#ef4444'}${Math.round((v / mx) * 200).toString(16).padStart(2, '0')}` }}>{v}</span>),
                  pct(row[i] / (row.reduce((a, b) => a + b, 0) || 1), 0),
                ])}
              />
            )
          })()}
        </Panel>
      </Split>
      <Panel title="Rules (one per leaf)">
        <Table head={['If', 'Then', 'n', 'Purity']} rows={rules.map(({ conds, leaf }) => [conds.join(' AND ') || '(always)', <b key="c" style={{ color: color(leaf.pred) }}>{d.classes[leaf.pred]}</b>, leaf.n, pct(leaf.counts[leaf.pred] / leaf.n, 0)])} />
        <Note>CART grows binary splits greedily (numeric: best midpoint threshold; categorical: best subset, found by ordering categories by class share). Minimal cost-complexity pruning collapses the “weakest link” subtree whose error increase per removed leaf is smallest; α is that trade-off. Iris data: R. A. Fisher (1936), UCI ML Repository, CC BY 4.0.</Note>
      </Panel>
    </div>
  )
}
