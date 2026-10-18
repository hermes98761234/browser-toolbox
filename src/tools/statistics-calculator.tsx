import { useMemo } from 'react'
import { Area, Btn, CopyButton, Note, Num, Panel, Row, Select, Seg, Split, Stat, Stats, Table, fmt, color, useToolState } from '../kit'
import {
  anovaOneWay, chi2Cdf, chi2Inv, chiSquareGOF, chiSquareIndependence, correlation, fCdf, fInv, formatP, interpret, mannWhitney, mean, median, normCdf, normInv,
  oneProportionZ, oneSampleT, pairedT, parseNumbers, sd, tCdf, tInv, twoProportionZ, twoSampleT, wilcoxonSignedRank, zTest, type Tail, type TestResult,
} from './lib/statistics-calculator'

type TestId = 't1' | 't2' | 'welch' | 'paired' | 'z' | 'anova' | 'gof' | 'indep' | 'p1' | 'p2' | 'mw' | 'wsr' | 'pearson' | 'spearman'
const TESTS: [TestId, string][] = [
  ['t1', 'One-sample t-test'], ['t2', 'Two-sample t-test (pooled)'], ['welch', "Welch's t-test"], ['paired', 'Paired t-test'], ['z', 'One-sample z-test (σ known)'],
  ['anova', 'One-way ANOVA'], ['gof', 'χ² goodness-of-fit'], ['indep', 'χ² test of independence'], ['p1', 'One-proportion z-test'], ['p2', 'Two-proportion z-test'],
  ['mw', 'Mann–Whitney U (rank-sum)'], ['wsr', 'Wilcoxon signed-rank'], ['pearson', 'Pearson correlation'], ['spearman', 'Spearman correlation'],
]
const H0: Record<TestId, string> = {
  t1: 'the population mean equals μ₀', t2: 'both groups have the same mean', welch: 'both groups have the same mean', paired: 'the mean difference A − B is 0',
  z: 'the population mean equals μ₀', anova: 'all group means are equal', gof: 'the observed counts follow the expected proportions', indep: 'the row and column variables are independent',
  p1: 'the population proportion equals p₀', p2: 'both proportions are equal', mw: 'both groups come from the same distribution', wsr: 'differences are symmetric about 0 (or μ₀)',
  pearson: 'there is no linear correlation (ρ = 0)', spearman: 'there is no monotonic association (ρₛ = 0)',
}
const DEF = {
  test: 'welch' as TestId,
  a: '12.1 14.3 13.8 15.2 11.9 14.7 13.1 16.0 12.8 14.9 13.5 15.6',
  b: '10.4 11.8 12.2 10.9 13.0 11.1 12.6 10.2 11.7 12.9 11.3',
  groups: 'Fertilizer A: 20.1 22.4 19.8 21.7 23.0 20.9\nFertilizer B: 24.3 25.1 23.8 26.0 24.7 25.5\nControl: 18.2 19.5 17.9 18.8 20.1 19.0',
  table: '       Walk  Bike  Car\nUrban   42    35   23\nSuburb  28    17   55\nRural   12     8   80',
  obs: '48 35 15 22', exp: '0.4 0.3 0.1 0.2', cats: 'Red Blue Green Yellow',
  x1: 58, n1: 100, x2: 41, n2: 95, p0: 0.5, mu0: 12, sigma: 1.5, alpha: 0.05, tail: 'two' as Tail, conf: 0.95, yates: false,
}

function parseGroups(s: string): { name: string; v: number[] }[] {
  return s.split('\n').map((l, i) => {
    const m = /^\s*([^:]+):(.*)$/.exec(l)
    return { name: m ? m[1].trim() : `Group ${i + 1}`, v: parseNumbers(m ? m[2] : l) }
  }).filter((g) => g.v.length)
}
function parseTable(s: string): { rows: string[]; cols: string[]; t: number[][] } {
  const lines = s.split('\n').map((l) => l.trim()).filter(Boolean)
  let cols: string[] = []
  const rows: string[] = []
  const t: number[][] = []
  for (const l of lines) {
    const parts = l.split(/[\s,;\t]+/)
    const nums = parts.map(Number)
    if (nums.every((n) => !Number.isFinite(n))) { cols = parts; continue }
    const label = Number.isFinite(nums[0]) ? `Row ${rows.length + 1}` : parts[0]
    rows.push(label)
    t.push(nums.filter((n) => Number.isFinite(n)))
  }
  return { rows, cols, t }
}

const W = 520
function NullDist({ kind, df, stat, alpha, tail }: { kind: 'z' | 't' | 'chi' | 'F'; df?: number | [number, number]; stat: number; alpha: number; tail: Tail }) {
  const pdf = (x: number) => {
    const h = 1e-4
    const cdf = kind === 'z' ? normCdf : kind === 't' ? (v: number) => tCdf(v, df as number) : kind === 'chi' ? (v: number) => chi2Cdf(v, df as number) : (v: number) => fCdf(v, (df as [number, number])[0], (df as [number, number])[1])
    return (cdf(x + h) - cdf(x - h)) / (2 * h)
  }
  const oneSided = kind === 'chi' || kind === 'F'
  let lo: number, hi: number, crit: number[]
  if (oneSided) {
    const c = kind === 'chi' ? chi2Inv(1 - alpha, df as number) : fInv(1 - alpha, (df as [number, number])[0], (df as [number, number])[1])
    lo = 0; hi = Math.max(c * 1.6, Math.min(stat * 1.15, c * 4)); crit = [c]
  } else {
    const q = (p: number) => (kind === 'z' ? normInv(p) : tInv(p, df as number))
    crit = tail === 'two' ? [q(alpha / 2), q(1 - alpha / 2)] : tail === 'less' ? [q(alpha)] : [q(1 - alpha)]
    const m = Math.max(4, Math.min(Math.abs(stat) * 1.15, 8))
    lo = -m; hi = m
  }
  const N = 160
  const xs = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N)
  const ys = xs.map((x) => (oneSided && x <= 0 ? 0 : pdf(x)))
  const ymax = Math.max(...ys.filter(Number.isFinite)) * 1.1 || 1
  const X = (x: number) => 20 + ((x - lo) / (hi - lo)) * (W - 40)
  const Y = (y: number) => 150 - (Math.min(y, ymax) / ymax) * 130
  const path = xs.map((x, i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(ys[i]).toFixed(1)}`).join('')
  const reject = (x: number) => (oneSided ? x >= crit[0] : tail === 'two' ? x <= crit[0] || x >= crit[1] : tail === 'less' ? x <= crit[0] : x >= crit[0])
  const shade = xs.map((x, i) => (reject(x) ? `M${X(x).toFixed(1)},150V${Y(ys[i]).toFixed(1)}` : '')).join('')
  const sx = Math.max(lo, Math.min(hi, stat))
  return (
    <svg viewBox={`0 0 ${W} 175`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Null distribution">
      <path d={shade} stroke="var(--err)" strokeOpacity={0.35} strokeWidth={(W - 40) / N + 0.6} />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />
      <line x1={20} x2={W - 20} y1={150} y2={150} stroke="var(--line)" />
      {crit.map((c, i) => <text key={i} x={X(c)} y={166} fontSize={10} textAnchor="middle" fill="var(--muted)">{fmt(c, 3)}</text>)}
      <line x1={X(sx)} x2={X(sx)} y1={14} y2={150} stroke="var(--fg)" strokeWidth={2} strokeDasharray="4 3" />
      <text x={X(sx)} y={11} fontSize={11} textAnchor="middle" fill="var(--fg)" fontWeight={700}>{kind === 'chi' ? 'χ²' : kind} = {fmt(stat, 4)}{sx !== stat ? ' →' : ''}</text>
    </svg>
  )
}

function BoxPlots({ groups }: { groups: { name: string; v: number[] }[] }) {
  const all = groups.flatMap((g) => g.v)
  if (!all.length) return null
  const lo = Math.min(...all), hi = Math.max(...all)
  const pad = (hi - lo) * 0.08 || 1
  const X = (x: number) => 110 + ((x - (lo - pad)) / (hi - lo + 2 * pad)) * (W - 130)
  const q = (s: number[], p: number) => { const i = (s.length - 1) * p; const f = Math.floor(i); return s[f] + (s[Math.min(f + 1, s.length - 1)] - s[f]) * (i - f) }
  return (
    <svg viewBox={`0 0 ${W} ${groups.length * 40 + 24}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Box plots">
      {groups.map((g, i) => {
        const s = [...g.v].sort((a, b) => a - b)
        const [q1, q2, q3] = [q(s, 0.25), q(s, 0.5), q(s, 0.75)]
        const iqr = q3 - q1
        const wl = s.find((v) => v >= q1 - 1.5 * iqr)!, wh = [...s].reverse().find((v) => v <= q3 + 1.5 * iqr)!
        const y = 14 + i * 40
        const c = color(i)
        return (
          <g key={i}>
            <text x={4} y={y + 15} fontSize={11} fill="var(--fg)">{g.name.slice(0, 16)}</text>
            <line x1={X(wl)} x2={X(wh)} y1={y + 11} y2={y + 11} stroke={c} />
            <rect x={X(q1)} y={y} width={Math.max(1, X(q3) - X(q1))} height={22} fill={c} fillOpacity={0.25} stroke={c} />
            <line x1={X(q2)} x2={X(q2)} y1={y} y2={y + 22} stroke={c} strokeWidth={2.5} />
            <circle cx={X(mean(s))} cy={y + 11} r={3} fill="var(--fg)" />
            {s.filter((v) => v < wl || v > wh).map((v, k) => <circle key={k} cx={X(v)} cy={y + 11} r={3} fill="none" stroke={c} />)}
          </g>
        )
      })}
      <text x={110} y={groups.length * 40 + 20} fontSize={10} fill="var(--muted)">{fmt(lo, 4)}</text>
      <text x={W - 20} y={groups.length * 40 + 20} fontSize={10} fill="var(--muted)" textAnchor="end">{fmt(hi, 4)}</text>
    </svg>
  )
}

function Scatter({ x, y }: { x: number[]; y: number[] }) {
  const n = Math.min(x.length, y.length)
  if (n < 2) return null
  const [x0, x1, y0, y1] = [Math.min(...x), Math.max(...x), Math.min(...y), Math.max(...y)]
  const X = (v: number) => 30 + ((v - x0) / (x1 - x0 || 1)) * (W - 50)
  const Y = (v: number) => 200 - ((v - y0) / (y1 - y0 || 1)) * 180
  const mx = mean(x.slice(0, n)), my = mean(y.slice(0, n))
  let sxy = 0, sxx = 0
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2 }
  const b = sxy / sxx, a = my - b * mx
  return (
    <svg viewBox={`0 0 ${W} 215`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Scatter plot">
      <rect x={30} y={20} width={W - 50} height={180} fill="none" stroke="var(--line)" />
      <line x1={X(x0)} x2={X(x1)} y1={Y(a + b * x0)} y2={Y(a + b * x1)} stroke="var(--accent)" strokeWidth={2} />
      {x.slice(0, n).map((v, i) => <circle key={i} cx={X(v)} cy={Y(y[i])} r={4} fill="var(--accent2)" fillOpacity={0.75} />)}
      <text x={30} y={212} fontSize={10} fill="var(--muted)">A (x)</text>
      <text x={4} y={16} fontSize={10} fill="var(--muted)">B (y)</text>
    </svg>
  )
}

export default function StatisticsCalculator() {
  const [s, set, reset] = useToolState('statistics-calculator', DEF)
  const A = useMemo(() => parseNumbers(s.a), [s.a])
  const B = useMemo(() => parseNumbers(s.b), [s.b])
  const groups = useMemo(() => parseGroups(s.groups), [s.groups])
  const tbl = useMemo(() => parseTable(s.table), [s.table])
  const needsA = ['t1', 't2', 'welch', 'paired', 'z', 'mw', 'wsr', 'pearson', 'spearman'].includes(s.test)
  const needsB = ['t2', 'welch', 'paired', 'mw', 'pearson', 'spearman'].includes(s.test) || (s.test === 'wsr' && B.length > 0)
  const pairedish = ['paired', 'pearson', 'spearman'].includes(s.test) || (s.test === 'wsr' && B.length > 0)

  const { res, err } = useMemo((): { res: TestResult | null; err: string } => {
    try {
      const tl = s.tail
      const need = (c: boolean, m: string) => { if (!c) throw new Error(m) }
      switch (s.test) {
        case 't1': need(A.length >= 2, 'Enter at least 2 values in sample A.'); return { res: oneSampleT(A, s.mu0, tl, s.conf), err: '' }
        case 'z': need(A.length >= 1 && s.sigma > 0, 'Enter values and a positive σ.'); return { res: zTest(A, s.mu0, s.sigma, tl, s.conf), err: '' }
        case 't2': case 'welch': need(A.length >= 2 && B.length >= 2, 'Each sample needs at least 2 values.'); return { res: twoSampleT(A, B, s.test === 'welch', tl, s.conf), err: '' }
        case 'paired': need(A.length === B.length && A.length >= 2, `Paired data need equal lengths (A has ${A.length}, B has ${B.length}).`); return { res: pairedT(A, B, tl, s.conf), err: '' }
        case 'mw': need(A.length >= 2 && B.length >= 2, 'Each sample needs at least 2 values.'); return { res: mannWhitney(A, B, tl), err: '' }
        case 'wsr': if (B.length) need(A.length === B.length, 'Paired data need equal lengths.'); need(A.length >= 2, 'Enter at least 2 values.'); return { res: wilcoxonSignedRank(A, B.length ? B : null, s.mu0, tl), err: '' }
        case 'pearson': case 'spearman': need(A.length === B.length && A.length >= 3, `Need equal-length x and y with n ≥ 3 (A has ${A.length}, B has ${B.length}).`); return { res: correlation(A, B, s.test, tl, s.conf), err: '' }
        case 'anova': need(groups.length >= 2 && groups.every((g) => g.v.length >= 2), 'Enter at least 2 groups, each with 2+ values.'); return { res: anovaOneWay(groups.map((g) => g.v)), err: '' }
        case 'gof': {
          const o = parseNumbers(s.obs), e = parseNumbers(s.exp)
          need(o.length >= 2, 'Enter at least 2 observed counts.')
          need(!e.length || e.length === o.length, 'Expected proportions must match the number of categories (or leave empty for equal).')
          return { res: chiSquareGOF(o, e.length ? e : undefined), err: '' }
        }
        case 'indep': {
          need(tbl.t.length >= 2 && tbl.t.every((r) => r.length === tbl.t[0].length && r.length >= 2), 'Enter a table with at least 2 rows and 2 columns of equal length.')
          need(tbl.t.flat().every((v) => v >= 0), 'Counts must be non-negative.')
          return { res: chiSquareIndependence(tbl.t, s.yates), err: '' }
        }
        case 'p1': need(s.n1 > 0 && s.x1 >= 0 && s.x1 <= s.n1 && s.p0 > 0 && s.p0 < 1, 'Need 0 ≤ x ≤ n and 0 < p₀ < 1.'); return { res: oneProportionZ(s.x1, s.n1, s.p0, tl, s.conf), err: '' }
        case 'p2': need(s.n1 > 0 && s.n2 > 0 && s.x1 <= s.n1 && s.x2 <= s.n2, 'Need 0 ≤ x ≤ n for both groups.'); return { res: twoProportionZ(s.x1, s.n1, s.x2, s.n2, tl, s.conf), err: '' }
      }
    } catch (e) { return { res: null, err: (e as Error).message } }
    return { res: null, err: '' }
  }, [s, A, B, groups, tbl])

  const distKind: 'z' | 't' | 'chi' | 'F' | null = !res ? null : res.statLabel === 'z' ? 'z' : res.statLabel === 't' ? 't' : res.statLabel === 'χ²' ? 'chi' : res.statLabel === 'F' ? 'F' : null
  const mwZ = res && (s.test === 'mw' || s.test === 'wsr') ? Number(res.extra?.find((e) => e[0] === 'z')?.[1]) : NaN
  const sig = res ? res.p < s.alpha : false
  const dfText = res?.df === undefined ? '' : Array.isArray(res.df) ? `${res.df[0]}, ${res.df[1]}` : fmt(res.df, 5)
  const report = res ? `${res.name}: ${res.statLabel}${dfText ? `(${dfText})` : ''} = ${fmt(res.stat, 4)}, p = ${formatP(res.p)}${res.effect ? `, ${res.effect.label} = ${fmt(res.effect.value, 3)}` : ''}${res.ci ? `, ${Math.round(s.conf * 100)}% CI [${fmt(res.ci[0], 4)}, ${fmt(res.ci[1], 4)}]` : ''}` : ''
  const tailNA = ['anova', 'gof', 'indep'].includes(s.test)
  const desc = (name: string, v: number[]) => [name, v.length, fmt(mean(v), 5), v.length > 1 ? fmt(sd(v), 5) : '—', fmt(median(v), 5), fmt(Math.min(...v), 5), fmt(Math.max(...v), 5)]

  return (
    <Split wide="right">
      <div>
        <Panel title="Test & data" actions={<Btn kind="ghost" onClick={reset}>Example data</Btn>}>
          <Select label="Test" value={s.test} onChange={(test) => set({ test })} options={TESTS} />
          <p className="k-hint">H₀: {H0[s.test]}.</p>
          {needsA && <Area label={s.test === 'pearson' || s.test === 'spearman' ? 'Variable A (x)' : s.test === 'paired' ? 'Condition A (before)' : 'Sample A'} value={s.a} onChange={(a) => set({ a })} rows={3} mono />}
          {(needsB || s.test === 'wsr') && <Area label={s.test === 'wsr' ? 'Sample B (optional — paired)' : pairedish ? (s.test === 'paired' ? 'Condition B (after)' : 'Variable B (y)') : 'Sample B'} value={s.b} onChange={(b) => set({ b })} rows={3} mono />}
          {s.test === 'anova' && <Area label="Groups — one per line, “Name: values”" value={s.groups} onChange={(groups) => set({ groups })} rows={5} mono />}
          {s.test === 'gof' && (<>
            <Area label="Category names (optional)" value={s.cats} onChange={(cats) => set({ cats })} rows={1} mono />
            <Area label="Observed counts" value={s.obs} onChange={(obs) => set({ obs })} rows={2} mono />
            <Area label="Expected proportions (empty = equal)" value={s.exp} onChange={(exp) => set({ exp })} rows={2} mono />
          </>)}
          {s.test === 'indep' && (<>
            <Area label="Contingency table (optional header row and row labels)" value={s.table} onChange={(table) => set({ table })} rows={5} mono />
            {tbl.t.length === 2 && tbl.t[0]?.length === 2 && <label className="k-check"><input type="checkbox" checked={s.yates} onChange={(e) => set({ yates: e.target.checked })} /> Yates continuity correction (2×2)</label>}
          </>)}
          {(s.test === 'p1' || s.test === 'p2') && (
            <Row>
              <Num label={s.test === 'p1' ? 'Successes x' : 'Successes x₁'} value={s.x1} onChange={(x1) => set({ x1 })} min={0} />
              <Num label={s.test === 'p1' ? 'Trials n' : 'Trials n₁'} value={s.n1} onChange={(n1) => set({ n1 })} min={1} />
              {s.test === 'p1' ? <Num label="p₀" value={s.p0} onChange={(p0) => set({ p0 })} min={0} max={1} /> : <>
                <Num label="Successes x₂" value={s.x2} onChange={(x2) => set({ x2 })} min={0} />
                <Num label="Trials n₂" value={s.n2} onChange={(n2) => set({ n2 })} min={1} />
              </>}
            </Row>
          )}
          <Row>
            {(s.test === 't1' || s.test === 'z' || (s.test === 'wsr' && !B.length)) && <Num label="Hypothesised mean μ₀" value={s.mu0} onChange={(mu0) => set({ mu0 })} />}
            {s.test === 'z' && <Num label="Known σ" value={s.sigma} onChange={(sigma) => set({ sigma })} min={0} />}
            <Select label="Significance α" value={s.alpha} onChange={(alpha) => set({ alpha: Number(alpha) })} options={[[0.1, '0.10'], [0.05, '0.05'], [0.01, '0.01'], [0.001, '0.001']] as const} />
            <Select label="Confidence" value={s.conf} onChange={(conf) => set({ conf: Number(conf) })} options={[[0.9, '90%'], [0.95, '95%'], [0.99, '99%']] as const} />
          </Row>
          {!tailNA && <Seg label="Alternative" value={s.tail} onChange={(tail) => set({ tail })} options={[['two', 'two-sided ≠'], ['less', 'less <'], ['greater', 'greater >']]} />}
          <p className="k-hint">Paste numbers separated by spaces, commas, tabs or new lines (a spreadsheet column works).</p>
        </Panel>
        {needsA && (A.length > 0 || B.length > 0) && (
          <Panel title="Descriptive statistics">
            <Table head={['', 'n', 'mean', 'SD', 'median', 'min', 'max']} rows={[...(A.length ? [desc('A', A)] : []), ...(needsB && B.length ? [desc('B', B)] : [])]} />
          </Panel>
        )}
      </div>
      <div>
        <Panel title={res?.name ?? 'Result'} actions={res && <CopyButton text={report} label="APA-style line" />}>
          {err && <Note tone="err">{err}</Note>}
          {res && (<>
            <Stats>
              <Stat label={`Statistic ${res.statLabel}`} value={fmt(res.stat, 5)} sub={dfText ? `df = ${dfText}` : undefined} />
              <Stat label="p-value" value={formatP(res.p)} tone={sig ? 'good' : undefined} sub={sig ? `significant at α = ${s.alpha}` : `not significant at α = ${s.alpha}`} />
              {res.effect && <Stat label={res.effect.label} value={fmt(res.effect.value, 4)} sub={`${res.effect.size} effect`} tone="accent" />}
              {res.ci && <Stat label={`${Math.round(s.conf * 100)}% CI`} value={`[${fmt(res.ci[0], 4)}, ${fmt(res.ci[1], 4)}]`} sub={res.ciLabel} />}
            </Stats>
            <Note tone={sig ? 'ok' : 'info'}>
              <b>In plain language:</b> {interpret(res.p, s.alpha)} Assuming H₀ ({H0[s.test]}) were true, a result at least this extreme would occur {res.p < 0.001 ? 'less than 0.1%' : `about ${(res.p * 100).toFixed(res.p < 0.01 ? 2 : 1)}%`} of the time.
              {res.effect && <> The effect size is <b>{res.effect.size}</b> ({res.effect.label} = {fmt(res.effect.value, 3)}){res.effect.size === 'negligible' && sig ? ' — significant but possibly not practically important' : ''}.</>}
            </Note>
            {(res.notes ?? []).map((n, i) => <Note key={i} tone="warn">{n}</Note>)}
            {distKind && <><h4 style={{ margin: '12px 0 4px' }}>Null distribution — shaded area is the rejection region (α = {s.alpha})</h4><NullDist kind={distKind} df={res.df} stat={res.stat} alpha={s.alpha} tail={distKind === 'chi' || distKind === 'F' ? 'greater' : s.tail} /></>}
            {Number.isFinite(mwZ) && <><h4 style={{ margin: '12px 0 4px' }}>Normal approximation (z)</h4><NullDist kind="z" stat={mwZ} alpha={s.alpha} tail={s.tail} /></>}
            {res.extra && <Table head={['Detail', 'Value']} rows={res.extra.map(([k, v]) => [k, v])} />}
          </>)}
        </Panel>
        {res && (
          <Panel title="Data">
            {(s.test === 'pearson' || s.test === 'spearman') ? <Scatter x={A} y={B} /> :
              s.test === 'anova' ? <BoxPlots groups={groups} /> :
              s.test === 'gof' ? (() => {
                const o = parseNumbers(s.obs), e = parseNumbers(s.exp), names = s.cats.split(/[\s,;]+/).filter(Boolean)
                const tot = o.reduce((a, b) => a + b, 0), es = e.length === o.length ? e.reduce((a, b) => a + b, 0) : o.length
                return <Table head={['Category', 'Observed', 'Expected', '(O−E)²/E']} rows={o.map((v, i) => { const ex = (tot * (e.length === o.length ? e[i] : 1)) / es; return [names[i] ?? `#${i + 1}`, v, fmt(ex, 4), fmt((v - ex) ** 2 / ex, 4)] })} />
              })() :
              s.test === 'indep' ? (() => {
                const rs = tbl.t.map((r) => r.reduce((a, b) => a + b, 0)), cs = tbl.t[0].map((_, j) => tbl.t.reduce((a, r) => a + r[j], 0)), N = rs.reduce((a, b) => a + b, 0)
                return <Table head={['', ...tbl.t[0].map((_, j) => tbl.cols[j] ?? `C${j + 1}`), 'Total']} rows={[...tbl.t.map((r, i) => [tbl.rows[i], ...r.map((v, j) => `${v} (${fmt((rs[i] * cs[j]) / N, 3)})`), rs[i]]), ['Total', ...cs, N]]} />
              })() :
              s.test === 'p1' || s.test === 'p2' ? <Note>Proportion tests use the normal approximation; the confidence interval uses the {s.test === 'p1' ? 'Wilson score' : 'Wald'} method.</Note> :
              <BoxPlots groups={s.test === 'paired' && A.length === B.length ? [{ name: 'A', v: A }, { name: 'B', v: B }, { name: 'A − B', v: A.map((v, i) => v - B[i]) }] : needsB && B.length ? [{ name: 'A', v: A }, { name: 'B', v: B }] : [{ name: 'A', v: A }]} />}
            {s.test === 'indep' && <p className="k-hint">Cells show observed (expected) counts.</p>}
          </Panel>
        )}
        <Note>Checks: t-tests assume roughly normal data (or n ≳ 30); Student's t also assumes equal variances — Welch's is the safer default. Rank tests (Mann–Whitney, Wilcoxon) drop the normality assumption. Distribution functions here are computed in your browser and checked against R reference values.</Note>
      </div>
    </Split>
  )
}
