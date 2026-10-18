import { useMemo } from 'react'
import { Area, Btn, Check, CsvButton, LineChart, Note, Num, Panel, pct, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { betaFromMean, cdf, equalTailed, gammaFromMean, hdi, likelihoodDist, mean, mode, parseBatches, pdf, predictive, quantile, sd, sequence, type Dist, type Kind } from './lib/bayesian-updater'

interface Cfg { a: number; b: number; text: string; threshold: number }
interface State { kind: Kind; beta: Cfg; gamma: Cfg; normal: Cfg & { sigma: number }; mass: number; hpd: boolean; showSteps: boolean }

const DEF: State = {
  kind: 'beta',
  beta: { a: 2, b: 8, threshold: 0.15, text: '9/60 # Mon\n14/72 # Tue\n8/55 # Wed\n17/80 # Thu\n12/64 # Fri' },
  gamma: { a: 4, b: 2, threshold: 3, text: '3/1 # week 1\n5/1 # week 2\n2/1 # week 3\n4 6 3 # weeks 4–6 (one count each)' },
  normal: { a: 70, b: 10, sigma: 8, threshold: 75, text: '78 81 74 # first sample\n69 77 83 80\n76 79' },
  mass: 0.95, hpd: false, showSteps: true,
}

const META: Record<Kind, { title: string; param: string; prior: string; data: string; aLabel: string; bLabel: string; presets: [string, Partial<Cfg>][] }> = {
  beta: {
    title: 'Proportion (beta–binomial)', param: 'θ (success probability)', prior: 'Beta(α, β)',
    data: 'One batch per line: “k/n” (k successes of n trials) or a list of 0/1 outcomes. Add “# label” to name it.',
    aLabel: 'α (prior successes)', bLabel: 'β (prior failures)',
    presets: [['Uniform Beta(1,1)', { a: 1, b: 1 }], ['Jeffreys Beta(½,½)', { a: 0.5, b: 0.5 }], ['Weak around 50% Beta(2,2)', { a: 2, b: 2 }], ['Sceptical ~10% Beta(2,18)', { a: 2, b: 18 }]],
  },
  gamma: {
    title: 'Rate (gamma–Poisson)', param: 'λ (events per unit exposure)', prior: 'Gamma(shape α, rate β)',
    data: 'One batch per line: “count/exposure” (e.g. 7/2 = 7 events in 2 units) or a list of counts, one per unit.',
    aLabel: 'α (prior events)', bLabel: 'β (prior exposure)',
    presets: [['Vague Gamma(0.01, 0.01)', { a: 0.01, b: 0.01 }], ['Jeffreys-like Gamma(½, 0.001)', { a: 0.5, b: 0.001 }], ['About 2/unit, weak Gamma(4,2)', { a: 4, b: 2 }]],
  },
  normal: {
    title: 'Mean (normal–normal, known σ)', param: 'μ (population mean)', prior: 'Normal(μ₀, τ₀)',
    data: 'One batch per line: observations separated by spaces or commas.',
    aLabel: 'μ₀ (prior mean)', bLabel: 'τ₀ (prior sd)',
    presets: [['Vague N(0, 1000)', { a: 0, b: 1000 }], ['Informative N(70, 10)', { a: 70, b: 10 }]],
  },
}

const f3 = (v: number) => String(+(Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(2) : v.toFixed(4)))

export default function BayesianUpdater() {
  const [s, set, reset] = useToolState('bayesian-updater', DEF)
  const k = s.kind
  const cfg = s[k]
  const meta = META[k]
  const sigma = s.normal.sigma
  const setCfg = (p: Partial<Cfg & { sigma: number }>) => set({ [k]: { ...cfg, ...p } } as Partial<State>)
  const validPrior = cfg.a > 0 && cfg.b > 0
  const prior: Dist = { kind: k, a: cfg.a, b: cfg.b }
  const { batches, errors } = useMemo(() => parseBatches(k, cfg.text), [k, cfg.text])
  const seq = useMemo(() => (validPrior ? sequence(prior, batches, sigma) : []), [validPrior, prior.a, prior.b, prior.kind, batches, sigma]) // eslint-disable-line react-hooks/exhaustive-deps
  const post = seq.at(-1) ?? prior
  const lik = likelihoodDist(k, batches, sigma)
  const ci = (d: Dist) => (s.hpd ? hdi(d, s.mass) : equalTailed(d, s.mass))
  const [lo, hi] = validPrior ? ci(post) : [NaN, NaN]
  const pAbove = validPrior ? 1 - cdf(post, cfg.threshold) : NaN
  const pAbovePrior = validPrior ? 1 - cdf(prior, cfg.threshold) : NaN

  const range = useMemo((): [number, number] => {
    if (!validPrior) return [0, 1]
    if (k === 'beta') {
      const ds = [post, ...(lik ? [lik] : [])]
      const l = Math.min(...ds.map((d) => quantile(d, 0.0005))), h = Math.max(...ds.map((d) => quantile(d, 0.9995)))
      const priorWide = quantile(prior, 0.995) - quantile(prior, 0.005) > 0.6
      return priorWide ? [0, 1] : [Math.max(0, Math.min(l, quantile(prior, 0.005)) - 0.02), Math.min(1, Math.max(h, quantile(prior, 0.995)) + 0.02)]
    }
    const ds = [post, ...(lik ? [lik] : []), prior]
    const qs = ds.map((d) => [quantile(d, 0.002), quantile(d, 0.998)])
    // keep the prior from stretching the axis absurdly
    const core = [post, ...(lik ? [lik] : [])].map((d) => [quantile(d, 0.0005), quantile(d, 0.9995)])
    const l = Math.min(...core.map((q) => q[0])), h = Math.max(...core.map((q) => q[1]))
    const w = h - l
    const pl = Math.max(l - 1.5 * w, Math.min(...qs.map((q) => q[0]))), ph = Math.min(h + 1.5 * w, Math.max(...qs.map((q) => q[1])))
    return [k === 'gamma' ? Math.max(0, pl) : pl, ph]
  }, [validPrior, k, post, lik, prior.a, prior.b]) // eslint-disable-line react-hooks/exhaustive-deps

  const curve = (d: Dist) => Array.from({ length: 241 }, (_, i) => { const x = range[0] + ((range[1] - range[0]) * i) / 240; return [x, pdf(d, x)] as [number, number] }).map(([x, y]) => [x, Number.isFinite(y) ? Math.min(y, 1e6) : 0] as [number, number])
  const maxPost = Math.max(...curve(post).map((p) => p[1]))

  const series = validPrior ? [
    ...(s.showSteps ? seq.slice(1, -1).map((d, i) => ({ name: `after ${batches[i].label}`, points: curve(d), color: `rgba(99,102,241,${0.15 + (0.35 * (i + 1)) / seq.length})` })) : []),
    { name: `Prior ${meta.prior}`, points: curve(prior), dashed: true, color: '#64748b' },
    ...(lik ? [{ name: 'Likelihood (normalised)', points: curve(lik), dashed: true, color: '#f59e0b' }] : []),
    { name: 'Posterior', points: curve(post), area: true, color: '#6366f1' },
  ] : []

  const fd = (d: Dist) => (d.kind === 'beta' ? `Beta(${f3(d.a)}, ${f3(d.b)})` : d.kind === 'gamma' ? `Gamma(${f3(d.a)}, ${f3(d.b)})` : `N(${f3(d.a)}, ${f3(d.b)})`)
  const fx = (v: number) => (k === 'beta' ? pct(v, 1) : f3(v))

  return (
    <Split wide="right">
      <div>
        <Panel title="Model" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="What are you estimating?" value={k} onChange={(kind) => set({ kind })} options={(Object.keys(META) as Kind[]).map((x) => [x, META[x].title] as [Kind, string])} />
        </Panel>
        <Panel title={`Prior: ${meta.prior}`}>
          <Select label="Preset" value="" onChange={(v) => { const p = meta.presets.find((x) => x[0] === v); if (p) setCfg(p[1]) }} options={[['', 'Choose a prior…'], ...meta.presets.map(([n]) => [n, n] as [string, string])]} />
          <Row>
            <Num label={meta.aLabel} value={cfg.a} onChange={(a) => setCfg({ a })} min={k === 'normal' ? undefined : 0.0001} />
            <Num label={meta.bLabel} value={cfg.b} onChange={(b) => setCfg({ b })} min={0.0001} />
          </Row>
          {k === 'beta' && (
            <Row>
              <Btn onClick={() => { const d = betaFromMean(mean(prior), Math.max(2, (cfg.a + cfg.b) / 2)); setCfg({ a: +d.a.toFixed(3), b: +d.b.toFixed(3) }) }}>Halve prior strength</Btn>
              <Btn onClick={() => { const d = betaFromMean(mean(prior), (cfg.a + cfg.b) * 2); setCfg({ a: +d.a.toFixed(3), b: +d.b.toFixed(3) }) }}>Double it</Btn>
            </Row>
          )}
          {k === 'gamma' && (
            <Row>
              <Btn onClick={() => { const d = gammaFromMean(mean(prior), cfg.b / 2); setCfg({ a: +d.a.toFixed(4), b: +d.b.toFixed(4) }) }}>Halve prior strength</Btn>
              <Btn onClick={() => { const d = gammaFromMean(mean(prior), cfg.b * 2); setCfg({ a: +d.a.toFixed(4), b: +d.b.toFixed(4) }) }}>Double it</Btn>
            </Row>
          )}
          {k === 'normal' && <Num label="Known data σ (measurement sd)" value={sigma} onChange={(v) => set({ normal: { ...s.normal, sigma: v } })} min={0.0001} />}
          {!validPrior && <Note tone="err">Prior parameters must be positive.</Note>}
          {validPrior && <p className="muted" style={{ fontSize: 13 }}>Prior mean {fx(mean(prior))}, sd {f3(sd(prior))}{k === 'beta' ? ` · worth ≈ ${f3(cfg.a + cfg.b)} observations` : k === 'gamma' ? ` · worth ≈ ${f3(cfg.b)} units of exposure` : ''}.</p>}
        </Panel>
        <Panel title="Data (sequential batches)">
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>{meta.data}</p>
          <Area value={cfg.text} onChange={(text) => setCfg({ text })} rows={7} mono />
          {errors.map((e) => <Note key={e} tone="err">{e}</Note>)}
        </Panel>
        <Panel title="Summary settings">
          <Slider label="Credible mass" value={s.mass} onChange={(mass) => set({ mass })} min={0.5} max={0.99} step={0.01} show={(v) => pct(v, 0)} />
          <Seg value={s.hpd ? 'h' : 'e'} onChange={(v) => set({ hpd: v === 'h' })} options={[['e', 'Equal-tailed'], ['h', 'Highest density']]} />
          <Num label={`Threshold for P(${meta.param.split(' ')[0]} > t)`} value={cfg.threshold} onChange={(threshold) => setCfg({ threshold })} />
          <Check label="Show intermediate posteriors" value={s.showSteps} onChange={(showSteps) => set({ showSteps })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Posterior" value={fd(post)} tone="accent" sub={`${batches.length} batch${batches.length === 1 ? '' : 'es'}`} />
          <Stat label="Posterior mean" value={fx(mean(post))} sub={`sd ${f3(sd(post))} · mode ${Number.isFinite(mode(post)) ? fx(mode(post)) : '—'}`} />
          <Stat label={`${pct(s.mass, 0)} ${s.hpd ? 'HDI' : 'credible interval'}`} value={`${fx(lo)} – ${fx(hi)}`} />
          <Stat label={`P(${meta.param.split(' ')[0]} > ${k === 'beta' ? pct(cfg.threshold, 1) : cfg.threshold})`} value={pct(pAbove, 1)} sub={`prior: ${pct(pAbovePrior, 1)}`} tone={pAbove > 0.95 ? 'good' : pAbove < 0.05 ? 'bad' : undefined} />
        </Stats>
        <Panel title={`Prior, likelihood and posterior for ${meta.param}`}>
          {series.length > 0 && <LineChart series={series} height={300} fx={k === 'beta' ? (v) => pct(v, 0) : (v) => f3(v)} fy={(v) => v.toPrecision(2)} yMax={maxPost * 1.08} xMin={range[0]} xMax={range[1]} markers={[{ x: lo, label: 'lo' }, { x: hi, label: 'hi' }]} />}
          <p className="muted" style={{ fontSize: 13 }}>Posterior ∝ prior × likelihood. The posterior always lies between the prior and the likelihood, and moves towards the data as evidence accumulates. Faint curves show the posterior after each batch. {predictive(post, sigma)}.</p>
        </Panel>
        {seq.length > 1 && (
          <Panel title="Sequential updating" actions={<CsvButton name="bayesian-updates.csv" rows={() => [['step', 'batch', 'param_a', 'param_b', 'mean', 'sd', 'ci_low', 'ci_high', 'p_above_threshold'], ...seq.map((d, i) => { const [a, b] = ci(d); return [i, i ? batches[i - 1].label : 'prior', d.a, d.b, mean(d), sd(d), a, b, 1 - cdf(d, cfg.threshold)] })]} />}>
            <LineChart
              series={[
                { name: 'Upper bound', points: seq.map((d, i) => [i, ci(d)[1]]), dashed: true, color: '#94a3b8' },
                { name: 'Posterior mean', points: seq.map((d, i) => [i, mean(d)]), color: '#6366f1' },
                { name: 'Lower bound', points: seq.map((d, i) => [i, ci(d)[0]]), dashed: true, color: '#94a3b8' },
              ]}
              height={200} xLabel="update step (0 = prior)" fx={(v) => (Number.isInteger(v) ? String(v) : '')} fy={k === 'beta' ? (v) => pct(v, 0) : (v) => f3(v)} yMin={k === 'normal' ? undefined : 0}
            />
            <Table
              head={['Step', 'Batch', 'Data', 'Posterior', 'Mean', `${pct(s.mass, 0)} interval`, 'P(> t)']}
              rows={seq.map((d, i) => {
                const b = batches[i - 1]
                const [a, c] = ci(d)
                return [i, i ? b.label : 'prior', !b ? '—' : k === 'beta' ? `${b.k}/${b.n}` : k === 'gamma' ? `${b.count} / ${b.exposure}` : `n=${b.xs!.length}, x̄=${f3(b.xs!.reduce((x, y) => x + y, 0) / b.xs!.length)}`, fd(d), fx(mean(d)), `${fx(a)} – ${fx(c)}`, pct(1 - cdf(d, cfg.threshold), 1)]
              })}
            />
          </Panel>
        )}
        <Note>
          Conjugate updates: Beta(α + k, β + n − k); Gamma(α + Σx, β + Σexposure); Normal with precision 1/τ₀² + n/σ² and mean as the precision-weighted average of μ₀ and x̄. Updating one batch at a time gives exactly the same posterior as using all data at once. Everything is computed in your browser.
        </Note>
      </div>
    </Split>
  )
}
