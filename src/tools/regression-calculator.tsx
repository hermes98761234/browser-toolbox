import { useId, useMemo } from 'react'
import { Area, Btn, Check, color, CopyButton, CsvButton, FileDrop, fmt, niceTicks, Note, num, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { parseDisplay, render, type Measure } from './lib/latex-equation-editor'
import { compare, latex, MODEL_NAMES, parseXY, PRESETS, tCrit, type Fit, type ModelId } from './lib/regression-calculator'

const DEF = { text: PRESETS[0].text, preset: 'kepler', model: 'auto' as ModelId | 'auto', degree: 2, conf: 0.95, overlay: false, logx: false, logy: false, at: 12 }
const ORDER: ModelId[] = ['linear', 'poly', 'exp', 'power', 'log', 'logistic']

let ctx: CanvasRenderingContext2D | null = null
const measure: Measure = (t, px, italic, bold, font) => {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return t.length * px * 0.55
  ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${px}px ${font}`
  return ctx.measureText(t).width
}

function Plot({ x, y, curves, xName, yName, logx, logy, h = 300, zeroLine }: {
  x: number[]; y: number[]; curves: { f: (v: number) => number; color: string; dash?: boolean; width?: number }[]; xName: string; yName: string; logx?: boolean; logy?: boolean; h?: number; zeroLine?: boolean
}) {
  const cid = useId().replace(/:/g, '')
  const W = 640, L = 58, R = 12, T = 12, B = 40
  const tx = (v: number) => (logx ? Math.log10(v) : v), ty = (v: number) => (logy ? Math.log10(v) : v)
  const X = x.map(tx), Y = y.map(ty)
  let [x0, x1] = [Math.min(...X), Math.max(...X)]
  const pad = (x1 - x0 || 1) * 0.05
  x0 -= pad
  x1 += pad
  const raw0 = logx ? 10 ** x0 : x0, raw1 = logx ? 10 ** x1 : x1
  const samples = Array.from({ length: 241 }, (_, i) => (logx ? 10 ** (x0 + ((x1 - x0) * i) / 240) : raw0 + ((raw1 - raw0) * i) / 240))
  const cy = curves.map((c) => samples.map((v) => ty(c.f(v))))
  const finite = [...Y, ...cy.flat()].filter(Number.isFinite)
  let [y0, y1] = [Math.min(...Y), Math.max(...Y)]
  const ext = Math.max(...finite.map(Math.abs)) && finite.length ? [Math.min(y0, ...finite), Math.max(y1, ...finite)] : [y0, y1]
  const spanY = y1 - y0 || 1
  y0 = Math.max(ext[0], y0 - spanY * 0.6) - spanY * 0.05
  y1 = Math.min(ext[1], y1 + spanY * 0.6) + spanY * 0.05
  if (zeroLine) {
    const m = Math.max(Math.abs(y0), Math.abs(y1))
    y0 = -m
    y1 = m
  }
  const sx = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R)
  const sy = (v: number) => T + (1 - (v - y0) / (y1 - y0 || 1)) * (h - T - B)
  const lbl = (v: number, log?: boolean) => (log ? fmt(10 ** v, 3) : fmt(v, 4))
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="k-chart" style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={`${yName} vs ${xName}`}>
      <defs><clipPath id={cid}><rect x={L} y={T} width={W - L - R} height={h - T - B} /></clipPath></defs>
      {niceTicks(y0, y1, 6).filter((v) => v >= y0 && v <= y1).map((v) => <g key={`y${v}`}><line className="grid" x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} /><text x={L - 5} y={sy(v) + 3} fontSize={10} textAnchor="end">{lbl(v, logy)}</text></g>)}
      {niceTicks(x0, x1, 7).filter((v) => v >= x0 && v <= x1).map((v) => <text key={`x${v}`} x={sx(v)} y={h - B + 15} fontSize={10} textAnchor="middle">{lbl(v, logx)}</text>)}
      {zeroLine && <line x1={L} x2={W - R} y1={sy(0)} y2={sy(0)} stroke="var(--muted)" strokeDasharray="4 3" />}
      <text x={(L + W - R) / 2} y={h - 6} fontSize={11} textAnchor="middle" className="lbl">{xName}{logx ? ' (log)' : ''}</text>
      <text x={12} y={(T + h - B) / 2} fontSize={11} textAnchor="middle" className="lbl" transform={`rotate(-90 12 ${(T + h - B) / 2})`}>{yName}{logy ? ' (log)' : ''}</text>
      <g clipPath={`url(#${cid})`}>
        {cy.map((ys, k) => {
          let d = ''
          let pen = false
          ys.forEach((v, i) => {
            if (!Number.isFinite(v)) {
              pen = false
              return
            }
            d += `${pen ? 'L' : 'M'}${sx(tx(samples[i])).toFixed(1)},${sy(Math.max(y0 - 10 * (y1 - y0), Math.min(y1 + 10 * (y1 - y0), v))).toFixed(1)}`
            pen = true
          })
          return <path key={k} d={d} fill="none" stroke={curves[k].color} strokeWidth={curves[k].width ?? 2.4} strokeDasharray={curves[k].dash ? '5 4' : undefined} opacity={curves[k].dash ? 0.75 : 1} />
        })}
      </g>
      {X.map((v, i) => Number.isFinite(v) && Number.isFinite(Y[i]) && <circle key={i} cx={sx(v)} cy={sy(Y[i])} r={4} fill="var(--panel, #fff)" stroke="#0f172a" strokeWidth={1.6}><title>{`(${x[i]}, ${y[i]})`}</title></circle>)}
    </svg>
  )
}

export default function RegressionCalculator() {
  const [s, set, reset] = useToolState('regression-calculator', DEF)
  const d = useMemo(() => parseXY(s.text), [s.text])
  const all = useMemo(() => (d.x.length >= 3 ? compare(d.x, d.y, s.degree) : []), [d, s.degree])
  const ranked = all.filter((c) => c.fit).sort((a, b) => a.fit!.aicc - b.fit!.aicc)
  const bestA = ranked[0]?.fit?.aicc ?? 0
  const wsum = ranked.reduce((t, c) => t + Math.exp(-(c.fit!.aicc - bestA) / 2), 0)
  const chosenId: ModelId = s.model === 'auto' ? ranked[0]?.model ?? 'linear' : s.model
  const chosen = all.find((c) => c.model === chosenId)
  const f: Fit | null = chosen?.fit ?? null
  const eq = f ? latex(f, d.yName, d.xName) : ''
  let svg = ''
  try {
    if (eq) svg = render(parseDisplay(eq), { size: 26, display: true, measure }).svg
  } catch {
    svg = ''
  }
  const preset = PRESETS.find((p) => p.id === s.preset)
  const tc = f ? tCrit(s.conf, f.n - f.k) : 0
  const yAt = f ? f.predict(s.at) : NaN

  return (
    <Split wide="right">
      <div>
        <Panel title="Data (x, y)" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {PRESETS.map((p) => <Btn key={p.id} kind={s.preset === p.id ? 'primary' : 'normal'} onClick={() => { const pd = parseXY(p.text); set({ preset: p.id, text: p.text, model: 'auto', degree: p.degree ?? 2, at: +(Math.max(...pd.x) * 1.1).toPrecision(3), logx: false, logy: false }) }}>{p.name}</Btn>)}
          </div>
          <Area value={s.text} onChange={(text) => set({ text, preset: '' })} rows={10} mono />
          <FileDrop accept=".csv,.tsv,.txt" label="Load a 2-column CSV" onFiles={async ([file]) => set({ text: await file.text(), preset: '', model: 'auto' })} />
          {preset && <p className="muted" style={{ fontSize: 13 }}>{preset.note}</p>}
          <p className="muted" style={{ fontSize: 12 }}>{d.x.length} points{d.skipped ? ` · ${d.skipped} lines skipped` : ''}. First line may be a header (x name, y name).</p>
          {d.x.length < 3 && <Note tone="err">Enter at least 3 numeric (x, y) pairs.</Note>}
        </Panel>
        <Panel title="Model">
          <Select label="Curve" value={s.model} onChange={(model) => set({ model })} options={[['auto', `Auto (best AICc${ranked[0] ? `: ${MODEL_NAMES[ranked[0].model]}` : ''})`], ...ORDER.map((m) => [m, MODEL_NAMES[m]] as [ModelId, string])]} />
          {chosenId === 'poly' && <Slider label="Polynomial degree" value={s.degree} onChange={(degree) => set({ degree })} min={2} max={6} step={1} show={(v) => v.toFixed(0)} />}
          <Row>
            <Seg value={String(s.conf)} onChange={(v) => set({ conf: Number(v) })} options={[['0.9', '90%'], ['0.95', '95%'], ['0.99', '99%']]} />
            <Check label="Overlay all models" value={s.overlay} onChange={(overlay) => set({ overlay })} />
          </Row>
          <Row>
            <Check label="Log x axis" value={s.logx} onChange={(logx) => set({ logx })} />
            <Check label="Log y axis" value={s.logy} onChange={(logy) => set({ logy })} />
          </Row>
          {chosen?.error && <Note tone="err">{MODEL_NAMES[chosenId]}: {chosen.error}</Note>}
        </Panel>
        {f && (
          <Panel title="Predict">
            <Num label={`${d.xName} =`} value={s.at} onChange={(at) => set({ at })} />
            <Stat label={`Predicted ${d.yName}`} value={Number.isFinite(yAt) ? fmt(yAt, 6) : '—'} sub={s.at < Math.min(...d.x) || s.at > Math.max(...d.x) ? '⚠ extrapolation outside the data range' : 'within the data range'} tone="accent" />
          </Panel>
        )}
      </div>
      <div>
        {f && (
          <>
            <Stats>
              <Stat label="R²" value={num(f.r2, 5)} sub={`adj. ${num(f.adjR2, 5)}`} tone="accent" />
              <Stat label="RMSE" value={fmt(f.rmse, 4)} sub={`SSE ${fmt(f.sse, 4)}`} />
              <Stat label="AICc" value={num(f.aicc, 2)} sub={`BIC ${num(f.bic, 2)}`} />
              <Stat label="Model" value={MODEL_NAMES[f.model]} sub={f.model === 'poly' ? `degree ${f.degree}` : ranked[0]?.model === f.model ? 'best by AICc' : `Δ AICc ${num(f.aicc - bestA, 2)}`} tone={ranked[0]?.model === f.model ? 'good' : undefined} />
            </Stats>
            <Panel title="Fitted equation" actions={<CopyButton text={eq} label="Copy LaTeX" />}>
              <div style={{ overflowX: 'auto', padding: '6px 0', textAlign: 'center', color: 'var(--fg)' }} dangerouslySetInnerHTML={{ __html: svg || eq }} />
            </Panel>
            <Panel title="Fit">
              <Plot x={d.x} y={d.y} xName={d.xName} yName={d.yName} logx={s.logx && d.x.every((v) => v > 0)} logy={s.logy && d.y.every((v) => v > 0)} curves={[
                ...(s.overlay ? ranked.filter((c) => c.model !== f.model).map((c) => ({ f: c.fit!.predict, color: color(ORDER.indexOf(c.model)), dash: true, width: 1.6 })) : []),
                { f: f.predict, color: color(ORDER.indexOf(f.model)) },
              ]} />
              {s.overlay && <div className="k-legend">{ranked.map((c) => <span key={c.model}><i style={{ background: color(ORDER.indexOf(c.model)) }} />{MODEL_NAMES[c.model]}</span>)}</div>}
            </Panel>
            <Panel title="Residuals">
              <Plot x={d.x} y={f.resid} xName={d.xName} yName="residual" curves={[]} h={180} zeroLine logx={s.logx && d.x.every((v) => v > 0)} />
              <p className="muted" style={{ fontSize: 12 }}>A good model leaves residuals scattered randomly around zero. A curved pattern means the shape is wrong; try another model.</p>
            </Panel>
            <Panel title="Parameters">
              <Table head={['Parameter', 'Estimate', 'Std. error', `${Math.round(s.conf * 100)}% CI`]} rows={f.params.map((p, i) => [f.names[i], fmt(p, 6), Number.isFinite(f.se[i]) ? fmt(f.se[i], 4) : '—', Number.isFinite(f.se[i]) ? `${fmt(p - tc * f.se[i], 5)} … ${fmt(p + tc * f.se[i], 5)}` : '—'])} />
              <p className="muted" style={{ fontSize: 12 }}>{f.model === 'exp' || f.model === 'power' || f.model === 'logistic' ? 'Fitted by Levenberg–Marquardt in original units (not log-transformed), so large y values are not down-weighted. Errors use the linearised covariance.' : 'Exact least squares via QR on centred, scaled x (stable for large x values).'}</p>
            </Panel>
          </>
        )}
        <Panel title="Model comparison" actions={<CsvButton name="regression-models.csv" rows={() => [['model', 'params', 'r2', 'adj_r2', 'rmse', 'aicc', 'bic', 'weight'], ...ranked.map((c) => [MODEL_NAMES[c.model], c.fit!.k, c.fit!.r2, c.fit!.adjR2, c.fit!.rmse, c.fit!.aicc, c.fit!.bic, Math.exp(-(c.fit!.aicc - bestA) / 2) / wsum])]} />}>
          <Table head={['Model', 'k', 'R²', 'Adj. R²', 'RMSE', 'Δ AICc', 'Akaike weight', '']} rows={[
            ...ranked.map((c) => {
              const w = Math.exp(-(c.fit!.aicc - bestA) / 2) / wsum
              return [
                <b key="m" style={{ color: color(ORDER.indexOf(c.model)) }}>{MODEL_NAMES[c.model]}{c.model === 'poly' ? ` (deg ${c.fit!.degree})` : ''}</b>, c.fit!.k, num(c.fit!.r2, 4), num(c.fit!.adjR2, 4), fmt(c.fit!.rmse, 4),
                Number.isFinite(c.fit!.aicc) ? num(c.fit!.aicc - bestA, 2) : '—', `${num(w * 100, 1)} %`,
                <Btn key="b" kind={c.model === chosenId ? 'primary' : 'ghost'} onClick={() => set({ model: c.model })}>{c.model === chosenId ? 'Shown' : 'Show'}</Btn>,
              ]
            }),
            ...all.filter((c) => !c.fit).map((c) => [MODEL_NAMES[c.model], '', '', '', '', '', <span key="e" className="muted">{c.error}</span>, '']),
          ]} />
          <p className="muted" style={{ fontSize: 12 }}>R² always rises with more parameters; AICc penalises them, so the lowest AICc (Δ = 0) is the best trade-off. Akaike weights are the relative likelihood of each model. For multiple predictors, ANOVA and influence diagnostics use the Linear Regression Lab.</p>
        </Panel>
      </div>
    </Split>
  )
}
