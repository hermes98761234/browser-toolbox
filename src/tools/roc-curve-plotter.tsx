import { useMemo, useState } from 'react'
import { Btn, color, CsvButton, FileDrop, fmt, Legend, Note, Panel, pct, Row, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { averagePrecision, confusion, parseData, prAuc, rocAuc, rocCurve, sampleCsv, youden, type CurvePoint } from './lib/roc-curve-plotter'

const SAMPLE = sampleCsv(300)
const DEF = { text: SAMPLE, model: 0, thr: 0.5 }

interface Curve {
  name: string
  color: string
  pts: [number, number][]
}

/** Square unit plot with hover read-out. */
function UnitPlot({ curves, xLabel, yLabel, dot, baseline, tipFor }: {
  curves: Curve[]; xLabel: string; yLabel: string; dot?: [number, number]; baseline: [number, number][]; tipFor: (x: number) => string | null
}) {
  const S = 300, L = 40, T = 10, R = 10
  const W = S - L - R
  const sx = (x: number) => L + x * W
  const sy = (y: number) => T + (1 - y) * W
  const [hx, setHx] = useState<number | null>(null)
  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1]
  const tip = hx === null ? null : tipFor(hx)
  return (
    <div className="k-chart" style={{ position: 'relative', maxWidth: 420 }}>
      <svg
        viewBox={`0 0 ${S} ${S}`}
        style={{ width: '100%', height: 'auto' }}
        role="img"
        aria-label={`${yLabel} vs ${xLabel}`}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const x = ((e.clientX - r.left) / r.width) * S
          setHx(x >= L && x <= S - R ? (x - L) / W : null)
        }}
        onMouseLeave={() => setHx(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={sx(0)} x2={sx(1)} y1={sy(t)} y2={sy(t)} />
            <line className="grid" x1={sx(t)} x2={sx(t)} y1={sy(0)} y2={sy(1)} />
            <text x={L - 5} y={sy(t) + 3} textAnchor="end" fontSize={9}>{t}</text>
            <text x={sx(t)} y={sy(0) + 13} textAnchor="middle" fontSize={9}>{t}</text>
          </g>
        ))}
        <rect x={sx(0)} y={sy(1)} width={W} height={W} fill="none" stroke="var(--grid-strong)" />
        <polyline points={baseline.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' ')} fill="none" stroke="var(--muted)" strokeDasharray="4 4" />
        {curves.map((c) => (
          <polyline key={c.name} points={c.pts.map(([x, y]) => `${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')} fill="none" stroke={c.color} strokeWidth={2} strokeLinejoin="round" />
        ))}
        {dot && <circle cx={sx(dot[0])} cy={sy(dot[1])} r={5} fill="var(--panel)" stroke="var(--fg)" strokeWidth={2} />}
        {hx !== null && <line x1={sx(hx)} x2={sx(hx)} y1={sy(0)} y2={sy(1)} stroke="var(--muted)" opacity={0.5} />}
        <text x={L + W / 2} y={S - 6} textAnchor="middle" className="lbl" fontSize={10}>{xLabel}</text>
        <text x={12} y={T + W / 2} textAnchor="middle" className="lbl" fontSize={10} transform={`rotate(-90 12 ${T + W / 2})`}>{yLabel}</text>
      </svg>
      {tip && <div className="k-tip" style={{ left: 50, top: 14 }}>{tip}</div>}
      {curves.length > 1 && <Legend items={curves.map((c) => [c.name, c.color])} />}
    </div>
  )
}

function Histogram({ scores, labels, thr }: { scores: number[]; labels: number[]; thr: number }) {
  const W = 600, H = 170, L = 36, B = 22, T = 8
  const lo = Math.min(...scores), hi = Math.max(...scores)
  const nb = 30
  const w = (hi - lo) / nb || 1
  const pos = new Array(nb).fill(0), neg = new Array(nb).fill(0)
  scores.forEach((s, i) => {
    const b = Math.min(nb - 1, Math.floor((s - lo) / w))
    if (labels[i]) pos[b]++
    else neg[b]++
  })
  const max = Math.max(1, ...pos, ...neg)
  const bx = (b: number) => L + (b / nb) * (W - L - 6)
  const by = (v: number) => T + (1 - v / max) * (H - T - B)
  const tx = L + ((thr - lo) / (hi - lo || 1)) * (W - L - 6)
  return (
    <div className="k-chart">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="score distribution by class">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line className="grid" x1={L} x2={W - 6} y1={by(max * f)} y2={by(max * f)} />
            <text x={L - 5} y={by(max * f) + 3} textAnchor="end" fontSize={10}>{Math.round(max * f)}</text>
          </g>
        ))}
        {neg.map((v, b) => <rect key={`n${b}`} x={bx(b) + 1} y={by(v)} width={(W - L - 6) / nb - 2} height={H - B - by(v)} fill={color(4)} opacity={0.45} />)}
        {pos.map((v, b) => <rect key={`p${b}`} x={bx(b) + 1} y={by(v)} width={(W - L - 6) / nb - 2} height={H - B - by(v)} fill={color(2)} opacity={0.55} />)}
        <line x1={tx} x2={tx} y1={T} y2={H - B} stroke="var(--fg)" strokeWidth={2} strokeDasharray="5 3" />
        <text x={tx + 4} y={T + 10} fontSize={11} className="lbl">threshold {fmt(thr, 3)}</text>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => <text key={f} x={L + f * (W - L - 6)} y={H - 6} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'} fontSize={10}>{fmt(lo + f * (hi - lo), 3)}</text>)}
      </svg>
      <Legend items={[['Positives (label 1)', color(2)], ['Negatives (label 0)', color(4)]]} />
    </div>
  )
}

const nearest = (pts: CurvePoint[], x: number, key: 'fpr' | 'tpr') => pts.reduce((b, p) => (Math.abs(p[key] - x) < Math.abs(b[key] - x) ? p : b), pts[0])

export default function RocCurvePlotter() {
  const [s, set, reset] = useToolState('roc-curve-plotter', DEF)
  const data = useMemo(() => parseData(s.text), [s.text])
  const ok = data.labels.length > 0 && data.models.length > 0
  const P = data.labels.reduce((a, l) => a + l, 0)
  const both = P > 0 && P < data.labels.length
  const results = useMemo(
    () =>
      data.models.map((m, i) => {
        const pts = rocCurve(m.scores, data.labels)
        return { ...m, i, pts, auc: rocAuc(pts), ap: averagePrecision(pts), prauc: prAuc(pts), best: youden(pts), color: color(i) }
      }),
    [data],
  )
  const mi = Math.min(s.model, Math.max(0, results.length - 1))
  const cur = results[mi]
  const lo = cur ? Math.min(...cur.scores) : 0, hi = cur ? Math.max(...cur.scores) : 1
  const thr = Math.min(hi, Math.max(lo, s.thr))
  const cm = cur ? confusion(cur.scores, data.labels, thr) : null
  const prev = data.labels.length ? P / data.labels.length : 0

  return (
    <Split wide="right">
      <div>
        <Panel title="Scores & labels" actions={<Btn kind="ghost" onClick={reset}>Sample</Btn>}>
          <textarea className="k-area mono" rows={9} value={s.text} onChange={(e) => set({ text: e.target.value })} spellCheck={false} aria-label="CSV data" style={{ width: '100%' }} />
          <FileDrop accept=".csv,.tsv,.txt" onFiles={([f]) => void f.text().then((text) => set({ text, model: 0 }))} label="Open CSV (label + score columns)" />
          <p className="muted" style={{ fontSize: 12.5 }}>
            One row per example: a <b>label</b> column (1/0, yes/no, pos/neg) and one or more score columns (higher = more likely positive). A header row names the models.
          </p>
          {data.errors.length > 0 && <Note tone="warn">{data.errors.slice(0, 3).join(' · ')}{data.errors.length > 3 ? ` · +${data.errors.length - 3} more` : ''} (rows skipped)</Note>}
          {ok && !both && <Note tone="err">Both classes are needed: found {P} positive and {data.labels.length - P} negative rows.</Note>}
        </Panel>
        {cur && both && cm && (
          <Panel title="Decision threshold">
            {results.length > 1 && <Select label="Model" value={mi} onChange={(model) => set({ model })} options={results.map((r) => [r.i, r.name] as const)} />}
            <Slider label="Threshold (score ≥ t → positive)" value={thr} min={lo} max={hi} step={(hi - lo) / 500 || 0.001} onChange={(v) => set({ thr: v })} show={(v) => fmt(v, 4)} />
            <Row>
              <Btn onClick={() => set({ thr: cur.best.thr })}>Youden-optimal ({fmt(cur.best.thr, 3)})</Btn>
              <Btn kind="ghost" onClick={() => set({ thr: (lo + hi) / 2 })}>Midpoint</Btn>
            </Row>
            <table className="k-table" style={{ marginTop: 12, textAlign: 'center' }}>
              <thead>
                <tr><th /><th>Pred +</th><th>Pred −</th></tr>
              </thead>
              <tbody>
                <tr><th>Actual +</th><td style={{ background: 'rgb(16 185 129 / 0.18)' }}><b>{cm.tp}</b> TP</td><td style={{ background: 'rgb(239 68 68 / 0.12)' }}><b>{cm.fn}</b> FN</td></tr>
                <tr><th>Actual −</th><td style={{ background: 'rgb(239 68 68 / 0.12)' }}><b>{cm.fp}</b> FP</td><td style={{ background: 'rgb(16 185 129 / 0.18)' }}><b>{cm.tn}</b> TN</td></tr>
              </tbody>
            </table>
            <Table
              head={['Metric', 'Value']}
              rows={[
                ['Recall / TPR / sensitivity', pct(cm.tpr)],
                ['Specificity / TNR', pct(cm.tnr)],
                ['False positive rate', pct(cm.fpr)],
                ['Precision / PPV', pct(cm.precision)],
                ['Accuracy', pct(cm.accuracy)],
                ['F1 score', fmt(cm.f1, 3)],
                ['Matthews corr. (MCC)', fmt(cm.mcc, 3)],
              ]}
            />
          </Panel>
        )}
      </div>

      <div>
        {ok && both && cur && cm ? (
          <>
            <Stats>
              <Stat label={`ROC AUC · ${cur.name}`} value={fmt(cur.auc, 4)} tone="accent" sub={cur.auc >= 0.9 ? 'excellent' : cur.auc >= 0.8 ? 'good' : cur.auc >= 0.7 ? 'fair' : cur.auc > 0.55 ? 'poor' : 'no better than chance'} />
              <Stat label="Average precision" value={fmt(cur.ap, 4)} sub={`PR AUC (trapezoid) ${fmt(cur.prauc, 4)}`} />
              <Stat label="Examples" value={data.labels.length} sub={`${P} positive · prevalence ${pct(prev)}`} />
              <Stat label="Best J (TPR − FPR)" value={fmt(cur.best.tpr - cur.best.fpr, 3)} sub={`at t = ${fmt(cur.best.thr, 4)}`} />
            </Stats>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div><Panel title="ROC curve">
                <UnitPlot
                  curves={results.map((r) => ({ name: `${r.name} (${fmt(r.auc, 3)})`, color: r.color, pts: r.pts.map((p) => [p.fpr, p.tpr]) }))}
                  xLabel="False positive rate" yLabel="True positive rate"
                  baseline={[[0, 0], [1, 1]]}
                  dot={[cm.fpr, cm.tpr]}
                  tipFor={(x) => {
                    const p = nearest(cur.pts, x, 'fpr')
                    return `${cur.name}: FPR ${fmt(p.fpr, 3)} → TPR ${fmt(p.tpr, 3)} @ t=${fmt(p.thr, 4)}`
                  }}
                />
              </Panel></div>
              <div><Panel title="Precision–recall curve">
                <UnitPlot
                  curves={results.map((r) => ({ name: `${r.name} (AP ${fmt(r.ap, 3)})`, color: r.color, pts: r.pts.slice(1).map((p) => [p.tpr, p.precision]) }))}
                  xLabel="Recall" yLabel="Precision"
                  baseline={[[0, prev], [1, prev]]}
                  dot={[cm.tpr, cm.precision]}
                  tipFor={(x) => {
                    const p = nearest(cur.pts.slice(1), x, 'tpr')
                    return `${cur.name}: recall ${fmt(p.tpr, 3)} → precision ${fmt(p.precision, 3)} @ t=${fmt(p.thr, 4)}`
                  }}
                />
              </Panel></div>
            </div>
            <Panel title={`Score distribution · ${cur.name}`}>
              <Histogram scores={cur.scores} labels={data.labels} thr={thr} />
            </Panel>
            <Panel
              title="Model comparison"
              actions={<CsvButton name={`roc-${cur.name}.csv`} rows={() => [['threshold', 'tp', 'fp', 'tpr', 'fpr', 'precision'], ...cur.pts.slice(1).map((p) => [p.thr, p.tp, p.fp, p.tpr, p.fpr, p.precision])]} />}
            >
              <Table
                head={['Model', 'ROC AUC', 'Avg precision', 'Youden t', 'TPR / FPR at t', '']}
                rows={results.map((r) => [
                  <span key="n"><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: r.color, marginRight: 6 }} />{r.name}</span>,
                  <b key="a">{fmt(r.auc, 4)}</b>,
                  fmt(r.ap, 4),
                  fmt(r.best.thr, 4),
                  `${pct(r.best.tpr)} / ${pct(r.best.fpr)}`,
                  r.i === mi ? <span key="s" className="muted">selected</span> : <Btn key="s" kind="ghost" onClick={() => set({ model: r.i, thr: r.best.thr })}>Select</Btn>,
                ])}
              />
              <Note>The dashed line is a random classifier: the diagonal for ROC, the prevalence ({pct(prev)}) for precision–recall. With imbalanced classes, the PR curve shows weak models more clearly than ROC.</Note>
            </Panel>
          </>
        ) : (
          <Panel title="Curves"><Note>Paste or load scored examples with both classes to see the curves.</Note></Panel>
        )}
      </div>
    </Split>
  )
}
