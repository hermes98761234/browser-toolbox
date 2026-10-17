import { useId, useMemo, useState, type ReactNode } from 'react'
import { Area, BarChart, Btn, Check, CopyButton, CsvButton, FileDrop, fmt, niceTicks, Note, num, Panel, Row, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { ANSCOMBE, DELIVERY, design, fitOls, houseSample, isNumeric, parseTable, predict, qqPoints, type Fit } from './lib/linear-regression-lab'

const PRESETS: { id: string; name: string; text: string; y: string; xs: string[]; note: string }[] = [
  { id: 'delivery', name: 'Delivery time (Montgomery)', text: DELIVERY, y: 'time', xs: ['cases', 'distance'], note: 'Soft-drink delivery times vs cases stocked and walking distance (Montgomery, Peck & Vining, Ex. 3.1). Observation 9 is the classic high-leverage point.' },
  { id: 'house', name: 'House prices (with category)', text: houseSample(), y: 'price_k', xs: ['sqft', 'bedrooms', 'age', 'neighborhood'], note: 'Synthetic sales: a text column (neighborhood) is dummy-coded automatically, with the first level as reference.' },
  { id: 'anscombe', name: 'Anscombe quartet I', text: ANSCOMBE, y: 'y', xs: ['x'], note: 'Anscombe (1973): y ≈ 3.00 + 0.500·x, R² ≈ 0.667.' },
]

const DEF = { text: DELIVERY, y: 'time', xs: ['cases', 'distance'], intercept: true, conf: 0.95, pred: {} as Record<string, string>, preset: 'delivery' }

const pfmt = (p: number) => (!Number.isFinite(p) ? '' : p < 1e-4 ? '< 0.0001' : p.toFixed(4))
const stars = (p: number) => (p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : p < 0.1 ? '.' : '')

interface Pt { x: number; y: number; id?: number; hot?: boolean }
function Scatter({ pts, xLabel, yLabel, lines = [], h = 230 }: { pts: Pt[]; xLabel: string; yLabel: string; lines?: { pts: [number, number][]; dash?: boolean; color?: string }[]; h?: number }) {
  const cid = useId().replace(/:/g, '')
  const W = 360, L = 46, R = 10, T = 10, B = 34
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  let [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const px = (x1 - x0 || 1) * 0.06, py = (y1 - y0 || 1) * 0.08
  x0 -= px; x1 += px; y0 -= py; y1 += py
  const sx = (x: number) => L + ((x - x0) / (x1 - x0)) * (W - L - R)
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0)) * (h - T - B)
  const clipY = (y: number) => Math.max(y0, Math.min(y1, y))
  return (
    <svg viewBox={`0 0 ${W} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`${yLabel} vs ${xLabel}`} className="k-chart">
      <defs><clipPath id={cid}><rect x={L} y={T} width={W - L - R} height={h - T - B} /></clipPath></defs>
      {niceTicks(y0, y1, 5).filter((v) => v >= y0 && v <= y1).map((v) => (
        <g key={`y${v}`}><line className="grid" x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} /><text x={L - 4} y={sy(v) + 3} textAnchor="end" fontSize={9}>{fmt(v, 3)}</text></g>
      ))}
      {niceTicks(x0, x1, 5).filter((v) => v >= x0 && v <= x1).map((v) => (
        <text key={`x${v}`} x={sx(v)} y={h - B + 13} textAnchor="middle" fontSize={9}>{fmt(v, 3)}</text>
      ))}
      <text x={(L + W - R) / 2} y={h - 4} textAnchor="middle" className="lbl" fontSize={10}>{xLabel}</text>
      <text x={10} y={(T + h - B) / 2} textAnchor="middle" className="lbl" fontSize={10} transform={`rotate(-90 10 ${(T + h - B) / 2})`}>{yLabel}</text>
      <g clipPath={`url(#${cid})`}>
        {lines.map((l, i) => (
          <polyline key={i} points={l.pts.map(([x, y]) => `${sx(x)},${sy(clipY(y))}`).join(' ')} fill="none" stroke={l.color ?? 'var(--muted)'} strokeWidth={1.4} strokeDasharray={l.dash ? '4 3' : undefined} />
        ))}
      </g>
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={sx(p.x)} cy={sy(p.y)} r={3.4} fill={p.hot ? '#ef4444' : '#6366f1'} fillOpacity={0.75}><title>{`#${(p.id ?? i) + 1}: (${fmt(p.x, 4)}, ${fmt(p.y, 4)})`}</title></circle>
          {p.hot && <text x={sx(p.x) + 5} y={sy(p.y) - 4} fontSize={9} fill="#ef4444">{(p.id ?? i) + 1}</text>}
        </g>
      ))}
    </svg>
  )
}

function Plots({ f }: { f: Fit }) {
  const idx = f.fitted.map((_, i) => i)
  const worst = new Set([...idx].sort((a, b) => Math.abs(f.stdRes[b]) - Math.abs(f.stdRes[a])).slice(0, 3))
  const cookHot = new Set(idx.filter((i) => f.cook[i] > 4 / f.n || f.cook[i] > 0.5))
  const fx = [Math.min(...f.fitted), Math.max(...f.fitted)]
  const qq = qqPoints(f.stdRes)
  const order = [...idx].sort((a, b) => f.stdRes[a] - f.stdRes[b])
  const qa = qq[0][0], qb = qq[qq.length - 1][0]
  const hMax = Math.max(...f.lev) * 1.05
  const cookLine = (D: number, sign: number): [number, number][] => Array.from({ length: 40 }, (_, k) => {
    const hh = 0.01 + ((hMax - 0.01) * k) / 39
    return [hh, sign * Math.sqrt((D * f.p * (1 - hh)) / hh)]
  })
  const yObs = f.fitted.map((v, i) => v + f.resid[i])
  const all = [...f.fitted, ...yObs]
  const lo = Math.min(...all), hi = Math.max(...all)
  const box = (title: string, el: ReactNode, tip: string) => (
    <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 8 }}>
      <b style={{ fontSize: 13 }}>{title}</b>
      {el}
      <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>{tip}</p>
    </div>
  )
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
      {box('Residuals vs fitted', <Scatter pts={idx.map((i) => ({ x: f.fitted[i], y: f.resid[i], id: i, hot: worst.has(i) }))} xLabel="Fitted" yLabel="Residual" lines={[{ pts: [[fx[0] - 1e9, 0], [fx[1] + 1e9, 0]], dash: true }]} />, 'Look for curvature (missing term) or a funnel (non-constant variance).')}
      {box('Normal Q-Q', <Scatter pts={qq.map(([t, s], k) => ({ x: t, y: s, id: order[k], hot: worst.has(order[k]) }))} xLabel="Theoretical quantile" yLabel="Std. residual" lines={[{ pts: [[qa, qa], [qb, qb]], dash: true }]} />, 'Points should hug the line if errors are normal.')}
      {box('Residuals vs leverage', <Scatter pts={idx.map((i) => ({ x: f.lev[i], y: f.stdRes[i], id: i, hot: cookHot.has(i) }))} xLabel="Leverage hᵢᵢ" yLabel="Std. residual" lines={[0.5, 1].flatMap((D) => [{ pts: cookLine(D, 1), dash: true, color: D === 1 ? '#ef4444' : '#f59e0b' }, { pts: cookLine(D, -1), dash: true, color: D === 1 ? '#ef4444' : '#f59e0b' }])} />, "Dashed contours: Cook's distance 0.5 (amber) and 1 (red). Points beyond them are influential.")}
      {box('Observed vs fitted', <Scatter pts={idx.map((i) => ({ x: f.fitted[i], y: yObs[i], id: i, hot: worst.has(i) }))} xLabel="Fitted" yLabel="Observed" lines={[{ pts: [[lo, lo], [hi, hi]], dash: true }]} />, 'Perfect predictions fall on the 45° line.')}
    </div>
  )
}

export default function LinearRegressionLab() {
  const [s, set, reset] = useToolState('linear-regression-lab', DEF)
  const [showAll, setShowAll] = useState(false)
  const table = useMemo(() => parseTable(s.text), [s.text])
  const numericCols = table.cols.filter((_, j) => isNumeric(table, j))
  const y = table.cols.includes(s.y) ? s.y : numericCols[0] ?? ''
  const xs = useMemo(() => s.xs.filter((x) => table.cols.includes(x) && x !== y), [s.xs, table, y])
  const res = useMemo(() => {
    if (!y || !xs.length) return { err: 'Choose a numeric response and at least one predictor.' }
    try {
      const d = design(table, y, xs, s.intercept)
      return { d, f: fitOls(d, s.conf) }
    } catch (e) {
      return { err: (e as Error).message }
    }
  }, [table, y, xs, s.intercept, s.conf])
  const f = res.f, d = res.d
  const preset = PRESETS.find((p) => p.id === s.preset)

  const means = useMemo(() => {
    const m: Record<string, number> = {}
    if (d) for (const x of xs) if (!d.levels[x]) {
      const j = table.cols.indexOf(x)
      m[x] = d.rowsUsed.reduce((a, i) => a + Number(table.rows[i][j]), 0) / (d.rowsUsed.length || 1)
    }
    return m
  }, [d, xs, table])
  const x0 = useMemo(() => {
    if (!d) return null
    const row: number[] = s.intercept ? [1] : []
    for (const x of xs) {
      if (d.levels[x]) {
        const v = s.pred[x] ?? d.levels[x][0]
        for (const lv of d.levels[x].slice(1)) row.push(v === lv ? 1 : 0)
      } else row.push(s.pred[x] !== undefined && s.pred[x] !== '' ? Number(s.pred[x]) : means[x])
    }
    return row
  }, [d, xs, s.pred, s.intercept, means])
  const pr = f && x0 && x0.every(Number.isFinite) ? predict(f, x0) : null
  const maxLev = f ? Math.max(...f.lev) : 0

  const eq = f ? `${y} = ${f.coefs.map((c, i) => `${i === 0 ? (c.b < 0 ? '−' : '') : c.b < 0 ? ' − ' : ' + '}${num(Math.abs(c.b), 4)}${c.name === '(Intercept)' ? '' : `·${c.name}`}`).join('')}` : ''
  const influential = f ? f.cook.map((c, i) => ({ i, c })).filter(({ i, c }) => c > 4 / f.n || f.lev[i] > (2 * f.p) / f.n || Math.abs(f.studRes[i]) > 3).sort((a, b) => b.c - a.c) : []

  return (
    <Split>
      <div>
        <Panel title="Data" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            {PRESETS.map((p) => (
              <Btn key={p.id} kind={s.preset === p.id ? 'primary' : 'normal'} onClick={() => set({ preset: p.id, text: p.text, y: p.y, xs: p.xs, pred: {} })}>{p.name}</Btn>
            ))}
          </Row>
          <Area value={s.text} onChange={(text) => set({ text, preset: '' })} rows={9} mono />
          <FileDrop accept=".csv,.tsv,.txt" label="Load CSV / TSV with a header row" onFiles={async ([file]) => {
            const text = await file.text()
            const t = parseTable(text)
            const nums = t.cols.filter((_, j) => isNumeric(t, j))
            set({ text, preset: '', y: nums[0] ?? '', xs: t.cols.filter((c) => c !== nums[0]).slice(0, 4), pred: {} })
          }} />
          {preset && <p className="muted" style={{ fontSize: 13 }}>{preset.note}</p>}
          <p className="muted" style={{ fontSize: 13 }}>{table.rows.length} rows · {table.cols.length} columns{d && d.dropped > 0 ? ` · ${d.dropped} rows skipped (missing/invalid values)` : ''}</p>
        </Panel>
        <Panel title="Model">
          <Select label="Response (y)" value={y} onChange={(v) => set({ y: v, xs: s.xs.filter((x) => x !== v) })} options={numericCols.length ? numericCols : ['']} />
          <span className="k-label">Predictors</span>
          <Row>
            {table.cols.filter((c) => c !== y).map((c) => (
              <Check key={c} label={<>{c}{!numericCols.includes(c) && <span className="muted"> (categorical)</span>}</>} value={xs.includes(c)} onChange={(on) => set({ xs: on ? [...xs, c] : xs.filter((x) => x !== c) })} />
            ))}
          </Row>
          <Row>
            <Check label="Intercept" value={s.intercept} onChange={(intercept) => set({ intercept })} />
            <Select label="Confidence level" value={s.conf} onChange={(conf) => set({ conf })} options={[[0.9, '90%'], [0.95, '95%'], [0.99, '99%']]} />
          </Row>
        </Panel>
        {f && d && x0 && (
          <Panel title="Predict a new observation">
            <Row>
              {xs.map((x) => d.levels[x] ? (
                <Select key={x} label={x} value={s.pred[x] ?? d.levels[x][0]} onChange={(v) => set({ pred: { ...s.pred, [x]: v } })} options={d.levels[x]} />
              ) : (
                <label key={x} className="k-field"><span className="k-label">{x}</span>
                  <span className="k-input"><input type="number" value={s.pred[x] ?? String(+(means[x] ?? 0).toPrecision(5))} onChange={(e) => set({ pred: { ...s.pred, [x]: e.target.value } })} /></span>
                </label>
              ))}
            </Row>
            {pr ? (
              <>
                <Stats>
                  <Stat label={`Predicted ${y}`} value={num(pr.yhat, 4)} tone="accent" />
                  <Stat label={`${Math.round(s.conf * 100)}% CI (mean)`} value={`${num(pr.ci[0], 3)} … ${num(pr.ci[1], 3)}`} sub={`SE ${num(pr.seFit, 4)}`} />
                  <Stat label={`${Math.round(s.conf * 100)}% prediction interval`} value={`${num(pr.pi[0], 3)} … ${num(pr.pi[1], 3)}`} sub={`SE ${num(pr.sePred, 4)}`} />
                </Stats>
                {pr.leverage > maxLev && <Note tone="warn">This point lies outside the data's hull (h₀₀ = {num(pr.leverage, 3)} &gt; max hᵢᵢ = {num(maxLev, 3)}): you are extrapolating.</Note>}
              </>
            ) : <Note tone="warn">Enter numeric values for every predictor.</Note>}
          </Panel>
        )}
      </div>
      <div>
        {res.err && <Note tone="err">{res.err}</Note>}
        {f && d && (
          <>
            <Stats>
              <Stat label="R²" value={num(f.r2, 4)} sub={`adj. ${num(f.adjR2, 4)}`} tone="accent" />
              <Stat label="Residual SE (σ̂)" value={num(f.sigma, 4)} sub={`${f.dfRes} df`} />
              <Stat label="F statistic" value={num(f.F, 2)} sub={`p ${pfmt(f.Fp)} on ${f.dfModel} & ${f.dfRes} df`} tone={f.Fp < 0.05 ? 'good' : 'bad'} />
              <Stat label="n" value={f.n} sub={`AIC ${num(f.aic, 2)} · BIC ${num(f.bic, 2)}`} />
            </Stats>
            <Panel title="Fitted equation" actions={<CopyButton text={eq} />}>
              <p style={{ fontFamily: 'var(--mono, monospace)', fontSize: 14, overflowWrap: 'anywhere' }}>{eq}</p>
            </Panel>
            <Panel title="Coefficients" actions={<CsvButton name="coefficients.csv" rows={() => [['term', 'estimate', 'std_error', 't', 'p', 'ci_low', 'ci_high', 'vif'], ...f.coefs.map((c) => [c.name, c.b, c.se, c.t, c.p, c.lo, c.hi, Number.isFinite(c.vif) ? c.vif : ''])]} />}>
              <Table
                head={['Term', 'Estimate', 'Std. error', 't', 'p-value', '', `${Math.round(s.conf * 100)}% CI`, 'VIF']}
                rows={f.coefs.map((c) => [
                  <b key="n">{c.name}</b>, fmt(c.b, 5), fmt(c.se, 4), num(c.t, 3), pfmt(c.p), <b key="s" style={{ color: 'var(--accent)' }}>{stars(c.p)}</b>,
                  `${fmt(c.lo, 4)} … ${fmt(c.hi, 4)}`,
                  Number.isFinite(c.vif) ? <span key="v" style={{ color: c.vif > 10 ? 'var(--err)' : c.vif > 5 ? 'var(--warn)' : undefined }}>{num(c.vif, 2)}</span> : '—',
                ])}
              />
              <p className="muted" style={{ fontSize: 12 }}>Significance: *** p&lt;0.001 · ** p&lt;0.01 · * p&lt;0.05 · . p&lt;0.1. VIF &gt; 5 hints at multicollinearity, &gt; 10 is serious. Solved by Householder QR (no normal equations), so it stays accurate with correlated predictors.</p>
            </Panel>
            <Panel title="Analysis of variance (sequential, type I)">
              <Table
                head={['Source', 'df', 'Sum of squares', 'Mean square', 'F', 'p-value']}
                rows={f.anova.map((a) => [a.term, a.df, fmt(a.ss, 6), fmt(a.ms, 6), Number.isFinite(a.F) ? num(a.F, 3) : '', pfmt(a.p)])}
                foot={[f.intercept ? 'Total (corrected)' : 'Total (uncorrected)', f.n - (f.intercept ? 1 : 0), fmt(f.sst, 6), '', '', '']}
              />
              <p className="muted" style={{ fontSize: 12 }}>Each row is the extra sum of squares when the term is added after the ones above it, so the order of predictors matters. Overall model: F = {num(f.F, 3)}, p {pfmt(f.Fp)}.</p>
            </Panel>
            <Panel title="Diagnostic plots">
              <Plots f={f} />
            </Panel>
            <Panel title="Assumption checks">
              <Table
                head={['Test', 'Statistic', 'p-value', 'Reading']}
                rows={[
                  ['Breusch–Pagan (heteroscedasticity)', Number.isFinite(f.bp.stat) ? `χ² = ${num(f.bp.stat, 3)} (${f.bp.df} df)` : '—', pfmt(f.bp.p), Number.isFinite(f.bp.p) ? (f.bp.p < 0.05 ? '⚠ variance changes with predictors' : '✓ constant variance plausible') : 'needs intercept'],
                  ['Jarque–Bera (normality)', `JB = ${num(f.jb.stat, 3)}`, pfmt(f.jb.p), f.jb.p < 0.05 ? '⚠ residuals look non-normal' : '✓ normality plausible'],
                  ['Durbin–Watson (autocorrelation)', `d = ${num(f.dw, 3)}`, '', f.dw < 1.5 ? '⚠ positive autocorrelation' : f.dw > 2.5 ? '⚠ negative autocorrelation' : '✓ ≈ 2, no autocorrelation'],
                  ['Skewness / kurtosis of residuals', `${num(f.jb.skew, 3)} / ${num(f.jb.kurt, 3)}`, '', 'normal: 0 / 3'],
                ]}
              />
            </Panel>
            <Panel title="Influential observations" actions={
              <>
                <Btn onClick={() => setShowAll(!showAll)}>{showAll ? 'Only flagged' : 'All rows'}</Btn>
                <CsvButton name="diagnostics.csv" rows={() => [['obs', 'observed', 'fitted', 'residual', 'std_residual', 'student_residual', 'leverage', 'cooks_d'], ...f.fitted.map((v, i) => [d.rowsUsed[i] + 1, v + f.resid[i], v, f.resid[i], f.stdRes[i], f.studRes[i], f.lev[i], f.cook[i]])]} />
              </>
            }>
              <BarChart height={160} bars={f.cook.map((c, i) => ({ label: String(d.rowsUsed[i] + 1), value: c, color: c > 4 / f.n ? '#ef4444' : '#6366f1' }))} fy={(v) => fmt(v, 2)} />
              <p className="muted" style={{ fontSize: 12 }}>Cook's distance per observation (red: above 4/n = {num(4 / f.n, 3)}). Leverage cut-off 2p/n = {num((2 * f.p) / f.n, 3)}.</p>
              <Table
                max={30}
                head={['Obs', 'Observed', 'Fitted', 'Residual', 'Studentized', 'Leverage', "Cook's D"]}
                rows={(showAll ? f.cook.map((c, i) => ({ i, c })) : influential).map(({ i, c }) => [
                  d.rowsUsed[i] + 1, fmt(f.fitted[i] + f.resid[i], 5), fmt(f.fitted[i], 5), fmt(f.resid[i], 4),
                  <span key="r" style={{ color: Math.abs(f.studRes[i]) > 3 ? 'var(--err)' : undefined }}>{num(f.studRes[i], 3)}</span>,
                  <span key="h" style={{ color: f.lev[i] > (2 * f.p) / f.n ? 'var(--warn)' : undefined }}>{num(f.lev[i], 4)}</span>,
                  <b key="c" style={{ color: c > 1 ? 'var(--err)' : c > 4 / f.n ? 'var(--warn)' : undefined }}>{num(c, 4)}</b>,
                ])}
              />
              {!showAll && !influential.length && <Note tone="ok">No observation exceeds the usual leverage, residual or Cook's distance cut-offs.</Note>}
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
