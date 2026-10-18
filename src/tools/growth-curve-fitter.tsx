import { useMemo } from 'react'
import { Area, Btn, Check, color, CsvButton, FileDrop, LineChart, niceTicks, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { fitGrowth, model, MODELS, parsePlate, samplePlate, toLn, type FitResult, type ModelId } from './lib/growth-curve-fitter'

interface State { csv: string; blank: number; model: ModelId; well: number; compare: boolean; scale: 'ln' | 'od'; tu: string }
const DEF: State = { csv: samplePlate(), blank: 0.05, model: 'gompertz', well: 0, compare: true, scale: 'ln', tu: 'h' }

function FitPlot({ t, y, fits, scale, od0, blank, tu, lagTangent }: { t: number[]; y: number[]; fits: FitResult[]; scale: 'ln' | 'od'; od0: number; blank: number; tu: string; lagTangent: FitResult | null }) {
  const W = 640, H = 300, L = 54, R = 14, T = 12, B = 36
  const tv = (v: number) => (scale === 'ln' ? v : od0 * Math.exp(v) + blank)
  const t1 = Math.max(...t), t0 = Math.min(0, ...t)
  const curves = fits.map((f) => Array.from({ length: 160 }, (_, i) => { const x = t0 + ((t1 - t0) * i) / 159; return [x, tv(model(f.id, x, f.p))] as [number, number] }))
  const ys = [...y.map(tv), ...curves.flat().map((p) => p[1])].filter(Number.isFinite)
  let y0 = Math.min(...ys), y1 = Math.max(...ys)
  const pad = (y1 - y0) * 0.06 || 0.1
  y0 -= pad
  y1 += pad
  const sx = (x: number) => L + ((x - t0) / (t1 - t0 || 1)) * (W - L - R)
  const sy = (v: number) => T + ((y1 - v) / (y1 - y0 || 1)) * (H - T - B)
  const path = (pts: [number, number][]) => pts.filter((p) => Number.isFinite(p[1])).map(([a, b], i) => `${i ? 'L' : 'M'}${sx(a).toFixed(1)},${sy(Math.max(y0, Math.min(y1, b))).toFixed(1)}`).join('')
  let tangent: string | null = null
  if (lagTangent && scale === 'ln') {
    const [yy0, A, mu, lam] = lagTangent.p
    const xEnd = Math.min(t1, lam + A / mu)
    tangent = path([[lam, yy0], [xEnd, yy0 + mu * (xEnd - lam)]])
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="growth curve fit" style={{ fontSize: 11 }}>
      {niceTicks(y0, y1, 5).filter((v) => v >= y0 && v <= y1).map((v) => (
        <g key={v}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke="var(--line, #e2e8f0)" /><text x={L - 6} y={sy(v) + 4} textAnchor="end" fill="var(--muted, #64748b)">{+v.toFixed(3)}</text></g>
      ))}
      {niceTicks(t0, t1, 8).filter((v) => v >= t0 && v <= t1).map((v) => <text key={v} x={sx(v)} y={H - B + 16} textAnchor="middle" fill="var(--muted, #64748b)">{v}</text>)}
      <text x={(L + W) / 2} y={H - 4} textAnchor="middle" fill="var(--muted, #64748b)">time ({tu})</text>
      <text x={8} y={T + 2} fill="var(--muted, #64748b)">{scale === 'ln' ? 'ln(OD/OD₀)' : 'OD'}</text>
      {tangent && <path d={tangent} stroke="#94a3b8" strokeDasharray="5 4" fill="none" />}
      {lagTangent && scale === 'ln' && <line x1={sx(lagTangent.p[3])} x2={sx(lagTangent.p[3])} y1={T} y2={H - B} stroke="#94a3b8" strokeDasharray="2 4" />}
      {t.map((x, i) => <circle key={i} cx={sx(x)} cy={sy(tv(y[i]))} r={3} fill="none" stroke="var(--text, #334155)" strokeOpacity={0.7} />)}
      {curves.map((c, i) => <path key={fits[i].id} d={path(c)} fill="none" stroke={color(MODELS.findIndex((m) => m[0] === fits[i].id))} strokeWidth={i === 0 ? 2.6 : 1.6} strokeDasharray={i === 0 ? undefined : '6 3'} />)}
    </svg>
  )
}

export default function GrowthCurveFitter() {
  const [s, set, reset] = useToolState('growth-curve-fitter', DEF)
  const plate = useMemo(() => parsePlate(s.csv), [s.csv])
  const all = useMemo(() => {
    if ('error' in plate) return []
    return plate.wells.map((w) => {
      const d = toLn(plate.time, w.od, s.blank)
      const fits = d.t.length >= 6 ? MODELS.map(([id]) => fitGrowth(id, d.t, d.y)) : []
      return { name: w.name, ...d, fits }
    })
  }, [plate, s.blank])

  if ('error' in plate) {
    return (
      <Panel title="Plate data">
        <Note tone="err">{plate.error}</Note>
        <Area value={s.csv} onChange={(csv) => set({ csv })} rows={10} mono />
        <Btn onClick={reset}>Load the sample plate</Btn>
      </Panel>
    )
  }
  const wi = Math.min(s.well, all.length - 1)
  const cur = all[wi]
  const main = cur.fits.find((f) => f.id === s.model)
  const best = cur.fits.filter((f) => f.ok).sort((a, b) => a.aic - b.aic)[0]
  const growing = main && main.ok && main.p[1] > 0.3
  const tu = s.tu || 'h'
  const fx = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—')

  return (
    <Split wide="right">
      <div>
        <Panel title="Plate data" actions={<Btn kind="ghost" onClick={reset}>Sample</Btn>}>
          <FileDrop accept=".csv,.tsv,.txt" onFiles={async ([f]) => set({ csv: await f.text(), well: 0 })} label="Drop a plate-reader CSV: time column + one column per well" />
          <Area value={s.csv} onChange={(csv) => set({ csv })} rows={7} mono />
          <Row>
            <Num label="Blank OD (subtracted)" value={s.blank} onChange={(blank) => set({ blank })} min={0} step={0.001} />
            <Select label="Time unit" value={tu} onChange={(t) => set({ tu: t })} options={[['h', 'hours'], ['min', 'minutes'], ['d', 'days']]} />
          </Row>
        </Panel>
        <Panel title="Model">
          <Seg value={s.model} onChange={(m) => set({ model: m })} options={MODELS} />
          <Check label="Overlay the other models" value={s.compare} onChange={(compare) => set({ compare })} />
          <Seg value={s.scale} onChange={(scale) => set({ scale })} options={[['ln', 'ln(OD/OD₀)'], ['od', 'Raw OD']]} />
          <p className="muted" style={{ fontSize: 13 }}>
            Zwietering (1990) parameterisation: μ<sub>max</sub> is the steepest slope of ln(OD), λ is where that tangent crosses the starting level, A the asymptotic increase. Baranyi–Roberts (1994) uses h₀ = μ·λ for the physiological state of the inoculum. Richards adds a shape parameter ν.
          </p>
        </Panel>
      </div>
      <div>
        <Row>
          <Select label="Well" value={wi} onChange={(well) => set({ well })} options={all.map((w, i) => [i, `${w.name}${w.fits.find((f) => f.id === s.model)?.ok ? '' : ' (no fit)'}`] as [number, string])} />
        </Row>
        <Stats>
          <Stat label="μmax" value={main?.ok ? `${fx(main.p[2], 3)} /${tu}` : '—'} sub={main?.ok ? `± ${fx(main.se[2], 3)} (SE)` : ''} tone="accent" />
          <Stat label="Doubling time" value={main?.ok ? `${fx(main.td * (tu === 'h' ? 60 : 1), tu === 'h' ? 0 : 2)} ${tu === 'h' ? 'min' : tu}` : '—'} sub={main?.ok ? `ln 2 / μmax = ${fx(main.td, 2)} ${tu}` : ''} />
          <Stat label="Lag λ" value={main?.ok ? `${fx(main.p[3], 2)} ${tu}` : '—'} sub={main?.ok ? `± ${fx(main.se[3], 2)}` : ''} />
          <Stat label="Yield A" value={main?.ok ? `${fx(main.p[1], 2)} ln-units` : '—'} sub={main?.ok ? `×${fx(Math.exp(main.p[1]), 1)} fold, max OD ${fx(cur.od0 * Math.exp(main.p[0] + main.p[1]) + s.blank, 3)}` : ''} />
          <Stat label="R²" value={main ? fx(main.r2, 4) : '—'} sub={best ? `lowest AIC: ${MODELS.find((m) => m[0] === best.id)?.[1]}` : ''} tone={main && main.r2 > 0.98 ? 'good' : undefined} />
        </Stats>
        {!growing && <Note tone="warn">This well shows little or no growth (A ≈ {fx(main?.p[1] ?? NaN)} ln-units); μ and λ are not meaningful. Check the blank value, or it is a negative control.</Note>}
        <Panel title={`${cur.name}: data and fitted curve${s.compare ? 's' : ''}`}>
          <FitPlot t={cur.t} y={cur.y} fits={[...(main ? [main] : []), ...(s.compare ? cur.fits.filter((f) => f.id !== s.model && f.ok) : [])]} scale={s.scale} od0={cur.od0} blank={s.blank} tu={tu} lagTangent={main?.ok ? main : null} />
          <div className="k-legend">{MODELS.filter(([id]) => id === s.model || s.compare).map(([id, n], i) => <span key={id}><i style={{ background: color(MODELS.findIndex((m) => m[0] === id)) }} />{n}{i === 0 && id === s.model ? ' (selected)' : ''}</span>)}<span>○ data · dashed grey: max-slope tangent and lag</span></div>
        </Panel>
        <Panel title="All models for this well">
          <Table head={['Model', 'μmax', 'Doubling', 'Lag λ', 'A', 'ν', 'R²', 'RMSE', 'AIC']} rows={cur.fits.map((f) => [
            <b key="m" style={{ color: color(MODELS.findIndex((m) => m[0] === f.id)) }}>{MODELS.find((m) => m[0] === f.id)?.[1]}{best?.id === f.id ? ' ★' : ''}</b>,
            f.ok ? fx(f.p[2], 3) : 'failed', f.ok ? fx(f.td, 2) : '', f.ok ? fx(f.p[3], 2) : '', f.ok ? fx(f.p[1], 2) : '', f.id === 'richards' && f.ok ? fx(f.p[4], 2) : '', fx(f.r2, 4), fx(f.rmse, 3), fx(f.aic, 1),
          ])} />
        </Panel>
        <Panel title={`All wells (${MODELS.find((m) => m[0] === s.model)?.[1]})`} actions={<CsvButton name="growth-parameters.csv" rows={() => [['well', 'model', 'mu_max_per_' + tu, 'mu_se', 'doubling_time_' + tu, 'lag_' + tu, 'lag_se', 'A_ln', 'y0', 'nu', 'r2', 'rmse', 'aic'], ...all.flatMap((w) => w.fits.map((f) => [w.name, f.id, f.p[2], f.se[2], f.td, f.p[3], f.se[3], f.p[1], f.p[0], f.p[4] ?? '', f.r2, f.rmse, f.aic]))]} />}>
          <Table head={['Well', 'μmax', 'Doubling', 'Lag', 'A', 'R²', '']} rows={all.map((w, i) => {
            const f = w.fits.find((x) => x.id === s.model)
            const ok = f?.ok && f.p[1] > 0.3
            return [<b key="n">{w.name}</b>, ok ? fx(f!.p[2], 3) : '—', ok ? fx(f!.td, 2) : '—', ok ? fx(f!.p[3], 2) : '—', f ? fx(f.p[1], 2) : '—', f ? fx(f.r2, 3) : '—', <Btn key="v" kind="ghost" onClick={() => set({ well: i })}>{i === wi ? '●' : 'view'}</Btn>]
          })} />
          <LineChart series={all.filter((w) => w.fits.find((f) => f.id === s.model)?.ok).map((w, i) => {
            const f = w.fits.find((x) => x.id === s.model)!
            const t1 = Math.max(...w.t)
            return { name: w.name, color: color(i), points: Array.from({ length: 80 }, (_, k) => { const x = (t1 * k) / 79; return [x, model(f.id, x, f.p)] as [number, number] }) }
          })} xLabel={`time (${tu})`} yLabel="ln(OD/OD₀), fitted" height={220} fy={(v) => v.toFixed(1)} />
        </Panel>
      </div>
    </Split>
  )
}
