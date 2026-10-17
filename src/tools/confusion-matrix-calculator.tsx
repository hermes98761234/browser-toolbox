import { useMemo, useState } from 'react'
import { Area, Bar, Btn, CopyButton, CsvButton, Note, num, Panel, pct, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { binaryMetrics, computeMetrics, matrixFromPairs } from './lib/confusion-matrix-calculator'

interface State {
  labels: string[]
  m: number[][]
  beta: number
  view: 'count' | 'row' | 'col' | 'all'
}

const PRESETS: Record<string, { labels: string[]; m: number[][] }> = {
  'Animal classifier (3)': { labels: ['Cat', 'Dog', 'Rabbit'], m: [[50, 8, 2], [6, 42, 4], [3, 5, 30]] },
  'Medical test (binary)': { labels: ['Disease', 'Healthy'], m: [[90, 10], [20, 880]] },
  'Spam filter (binary)': { labels: ['Spam', 'Ham'], m: [[412, 38], [12, 1538]] },
  'Sentiment (3)': { labels: ['Negative', 'Neutral', 'Positive'], m: [[310, 72, 18], [65, 240, 95], [12, 58, 430]] },
  'Digits 0–4 (5)': { labels: ['0', '1', '2', '3', '4'], m: [[96, 0, 1, 0, 1], [0, 110, 2, 1, 0], [2, 3, 88, 4, 2], [0, 1, 5, 91, 0], [1, 2, 1, 0, 94]] },
}

const DEF: State = { ...PRESETS['Animal classifier (3)'], beta: 1, view: 'row' }
const SAMPLE_PAIRS = `actual,predicted
cat,cat
cat,cat
cat,dog
dog,dog
dog,dog
dog,cat
rabbit,rabbit
rabbit,dog
rabbit,rabbit
cat,cat`

const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '—')

export default function ConfusionMatrixCalculator() {
  const [s, set, reset] = useToolState('confusion-matrix-calculator', DEF)
  const [pairs, setPairs] = useState(SAMPLE_PAIRS)
  const [msg, setMsg] = useState('')
  const k = s.labels.length
  const r = useMemo(() => computeMetrics(s.m, s.labels, s.beta), [s.m, s.labels, s.beta])
  const rowSum = s.m.map((row) => row.reduce((a, b) => a + b, 0))
  const colSum = s.labels.map((_, j) => s.m.reduce((a, row) => a + row[j], 0))
  const bin = k === 2 ? binaryMetrics(s.m[0][0], s.m[0][1], s.m[1][0], s.m[1][1]) : null

  const setCell = (i: number, j: number, v: number) => set({ m: s.m.map((row, a) => (a === i ? row.map((c, b) => (b === j ? Math.max(0, Math.round(v) || 0) : c)) : row)) })
  const resize = (n: number) => {
    n = Math.max(2, Math.min(12, n))
    const labels = Array.from({ length: n }, (_, i) => s.labels[i] ?? `Class ${i + 1}`)
    const m = labels.map((_, i) => labels.map((__, j) => s.m[i]?.[j] ?? 0))
    set({ labels, m })
  }
  const share = (i: number, j: number) => {
    const v = s.m[i][j]
    return s.view === 'row' ? v / (rowSum[i] || 1) : s.view === 'col' ? v / (colSum[j] || 1) : v / (r.n || 1)
  }
  const cellBg = (i: number, j: number) => {
    const t = s.m[i][j] / (rowSum[i] || 1)
    const a = Math.min(0.85, 0.08 + t * 0.9)
    return i === j ? `rgba(16,185,129,${a})` : `rgba(239,68,68,${s.m[i][j] ? Math.max(0.1, a) : 0.04})`
  }
  const g = (key: 'precision' | 'recall' | 'f1' | 'fbeta', avg: 'macro' | 'weighted') => r[avg][key]
  const metricRows = (): (string | number)[][] => [
    ['Class', 'Support', 'TP', 'FP', 'FN', 'TN', 'Precision', 'Recall', 'F1', `F${s.beta}`, 'Specificity'],
    ...r.perClass.map((c) => [c.label, c.support, c.tp, c.fp, c.fn, c.tn, f3(c.precision), f3(c.recall), f3(c.f1), f3(c.fbeta), f3(c.specificity)]),
    ['Macro avg', r.n, '', '', '', '', f3(r.macro.precision), f3(r.macro.recall), f3(r.macro.f1), f3(r.macro.fbeta), ''],
    ['Weighted avg', r.n, '', '', '', '', f3(r.weighted.precision), f3(r.weighted.recall), f3(r.weighted.f1), f3(r.weighted.fbeta), ''],
    ['Micro avg', r.n, '', '', '', '', f3(r.micro.precision), f3(r.micro.recall), f3(r.micro.f1), '', ''],
  ]

  return (
    <div>
      <Stats>
        <Stat label="Accuracy" value={pct(r.accuracy)} tone="accent" sub={`${num(r.n, 0)} samples`} />
        <Stat label="Macro F1" value={f3(r.macro.f1)} sub={`weighted ${f3(r.weighted.f1)}`} />
        <Stat label="Balanced accuracy" value={pct(r.balancedAccuracy)} sub="mean recall" />
        <Stat label="Cohen's κ" value={f3(r.kappa)} sub={r.kappa > 0.8 ? 'almost perfect' : r.kappa > 0.6 ? 'substantial' : r.kappa > 0.4 ? 'moderate' : r.kappa > 0.2 ? 'fair' : 'slight / none'} />
        <Stat label="MCC" value={f3(r.mcc)} sub="−1 … +1" />
      </Stats>
      <Split>
        <div>
          <Panel title="Setup">
            <Row>
              {Object.keys(PRESETS).map((p) => (
                <Btn key={p} onClick={() => set({ ...PRESETS[p] })}>{p}</Btn>
              ))}
            </Row>
            <div style={{ height: 10 }} />
            <Row>
              <span>Classes: <b>{k}</b></span>
              <Btn onClick={() => resize(k - 1)} disabled={k <= 2}>− Class</Btn>
              <Btn onClick={() => resize(k + 1)} disabled={k >= 12}>+ Class</Btn>
              <Btn kind="ghost" onClick={() => set({ m: s.m.map((row) => row.map(() => 0)) })}>Clear counts</Btn>
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </Row>
            <Slider label="F-beta: β =" value={s.beta} onChange={(beta) => set({ beta })} min={0.25} max={4} step={0.25} />
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>β &gt; 1 weights recall more (missing positives is costly); β &lt; 1 favours precision.</p>
          </Panel>
          <Panel title="Build from predictions" actions={<Btn kind="primary" onClick={() => {
            const b = matrixFromPairs(pairs)
            if (b.labels.length < 2) {
              setMsg('Need at least two distinct labels.')
              return
            }
            if (b.labels.length > 12) {
              setMsg(`Found ${b.labels.length} labels; the matrix supports up to 12.`)
              return
            }
            set({ labels: b.labels, m: b.m })
            setMsg(`Built a ${b.labels.length}×${b.labels.length} matrix from ${b.pairs} pairs${b.skipped ? ` (${b.skipped} lines skipped)` : ''}.`)
          }}>Build matrix</Btn>}>
            <Area value={pairs} onChange={setPairs} rows={8} mono placeholder="actual,predicted" />
            <p className="muted" style={{ fontSize: 13, margin: '6px 0' }}>One <code>actual,predicted</code> pair per line (comma, tab, semicolon or space). A header row is ignored.</p>
            {msg && <Note tone={msg.startsWith('Built') ? 'ok' : 'warn'}>{msg}</Note>}
          </Panel>
          <Panel title="What the metrics mean">
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6, fontSize: 14 }}>
              <li><b>Precision</b> = TP / (TP + FP): of everything predicted as the class, how much was right.</li>
              <li><b>Recall</b> (sensitivity) = TP / (TP + FN): how much of the class was found.</li>
              <li><b>F1</b> is the harmonic mean of precision and recall.</li>
              <li><b>Macro</b> averages classes equally; <b>weighted</b> by support; <b>micro</b> pools all counts (equals accuracy for single-label tasks).</li>
              <li><b>κ</b> corrects accuracy for chance agreement; <b>MCC</b> stays honest on imbalanced data.</li>
            </ul>
          </Panel>
        </div>
        <div>
          <Panel
            title="Confusion matrix"
            actions={
              <>
                <Seg value={s.view} onChange={(view) => set({ view })} options={[['count', 'Counts'], ['row', 'Row %'], ['col', 'Col %'], ['all', '% of total']]} />
                <CopyButton label="Copy CSV" text={() => [['actual \\ predicted', ...s.labels], ...s.m.map((row, i) => [s.labels[i], ...row])].map((r) => r.join(',')).join('\n')} />
              </>
            }
          >
            <div className="k-table-wrap">
              <table className="k-table" style={{ textAlign: 'center' }}>
                <thead>
                  <tr>
                    <th style={{ fontSize: 12 }} className="muted">Actual ↓ / Predicted →</th>
                    {s.labels.map((l, j) => (
                      <th key={j} style={{ textAlign: 'center' }}>{l}</th>
                    ))}
                    <th style={{ textAlign: 'center' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {s.m.map((row, i) => (
                    <tr key={i}>
                      <th>
                        <input value={s.labels[i]} aria-label={`Class ${i + 1} name`} onChange={(e) => set({ labels: s.labels.map((l, a) => (a === i ? e.target.value : l)) })} style={{ width: 96, fontWeight: 700 }} />
                      </th>
                      {row.map((v, j) => (
                        <td key={j} style={{ background: cellBg(i, j), padding: 4, outline: i === j ? '2px solid rgba(16,185,129,.6)' : undefined, outlineOffset: -2 }}>
                          <input type="number" min={0} value={v} aria-label={`actual ${s.labels[i]} predicted ${s.labels[j]}`} onChange={(e) => setCell(i, j, Number(e.target.value))} style={{ width: 64, textAlign: 'center', background: 'transparent' }} />
                          {s.view !== 'count' && <div style={{ fontSize: 12, fontWeight: 700 }}>{pct(share(i, j), 1)}</div>}
                        </td>
                      ))}
                      <td className="muted">{rowSum[i]}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    {colSum.map((c, j) => (
                      <td key={j}>{c}</td>
                    ))}
                    <td>{r.n}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>Green diagonal = correct predictions, red = confusions; colour intensity follows the row share.</p>
          </Panel>
          <Panel title="Per-class metrics" actions={<CsvButton name="classification-report.csv" rows={metricRows} />}>
            <Table
              head={['Class', 'Support', 'Precision', 'Recall', 'F1', `Fβ (β=${s.beta})`, 'Specificity', 'TP / FP / FN']}
              rows={r.perClass.map((c) => [
                <b key="l">{c.label}</b>,
                c.support,
                ...[c.precision, c.recall, c.f1].map((v, q) => (
                  <div key={q} style={{ minWidth: 70 }}>
                    <div>{f3(v)}</div>
                    <Bar value={Number.isFinite(v) ? v : 0} color={['#6366f1', '#0ea5e9', '#10b981'][q]} />
                  </div>
                )),
                f3(c.fbeta),
                f3(c.specificity),
                <span key="c" className="muted">{c.tp} / {c.fp} / {c.fn}</span>,
              ])}
            />
            <Table
              head={['Average', 'Precision', 'Recall', 'F1', `Fβ (β=${s.beta})`]}
              rows={[
                ['Macro', f3(g('precision', 'macro')), f3(g('recall', 'macro')), f3(g('f1', 'macro')), f3(g('fbeta', 'macro'))],
                ['Weighted', f3(g('precision', 'weighted')), f3(g('recall', 'weighted')), f3(g('f1', 'weighted')), f3(g('fbeta', 'weighted'))],
                ['Micro', f3(r.micro.precision), f3(r.micro.recall), f3(r.micro.f1), '—'],
              ]}
            />
            {r.perClass.some((c) => c.predicted === 0 && c.support > 0) && <Note tone="warn">Some classes were never predicted, so their precision is undefined (—) and left out of macro averages.</Note>}
          </Panel>
          {bin && (
            <Panel title={`Binary diagnostics (positive class: ${s.labels[0]})`} actions={<Btn onClick={() => set({ labels: [s.labels[1], s.labels[0]], m: [[s.m[1][1], s.m[1][0]], [s.m[0][1], s.m[0][0]]] })}>⇄ Swap positive class</Btn>}>
              <Table
                head={['Statistic', 'Value', 'Statistic', 'Value']}
                rows={[
                  ['Sensitivity (TPR)', pct(bin.tpr), 'Specificity (TNR)', pct(bin.tnr)],
                  ['Precision (PPV)', pct(bin.ppv), 'NPV', pct(bin.npv)],
                  ['False positive rate', pct(bin.fpr), 'False negative rate', pct(bin.fnr)],
                  ['False discovery rate', pct(bin.fdr), 'Prevalence', pct(bin.prevalence)],
                  ['LR+', f3(bin.lrPlus), 'LR−', f3(bin.lrMinus)],
                  ['Diagnostic odds ratio', num(bin.dor, 2), 'Informedness (Youden J)', f3(bin.informedness)],
                  ['Markedness', f3(bin.markedness), 'MCC', f3(r.mcc)],
                ]}
              />
            </Panel>
          )}
        </div>
      </Split>
    </div>
  )
}
