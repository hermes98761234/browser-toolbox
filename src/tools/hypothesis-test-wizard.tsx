import { Area, Btn, CopyButton, LineChart, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Check, useToolState } from '../kit'
import {
  anova, chiGof, chiIndependence, correlation, critical, mannWhitney, oneSampleT, pairedT, parseNums, pdfOf, twoProportionZ, twoSampleT, wilcoxonSigned,
  type Alt, type TestResult,
} from './lib/hypothesis-test-wizard'

type Goal = 'means' | 'counts' | 'relation'
type TestId = 'one-t' | 'two-t' | 'paired-t' | 'mw' | 'wsr' | 'anova' | 'chi-ind' | 'chi-gof' | 'prop' | 'corr'
const NAMES: Record<TestId, string> = {
  'one-t': 'One-sample t-test', 'two-t': 'Two-sample t-test (Welch)', 'paired-t': 'Paired t-test', mw: 'Mann–Whitney U', wsr: 'Wilcoxon signed-rank',
  anova: 'One-way ANOVA', 'chi-ind': 'Chi-square independence', 'chi-gof': 'Chi-square goodness of fit', prop: 'Two-proportion z-test', corr: 'Pearson correlation',
}

const DEF = {
  goal: 'means' as Goal, groups: '2' as '1' | '2' | '3', paired: 'no' as 'no' | 'yes', normal: 'yes' as 'yes' | 'no', countKind: 'table' as 'table' | 'gof' | 'prop',
  override: '' as TestId | '',
  alpha: 0.05, alt: 'two' as Alt, mu0: 20, equalVar: false,
  a: '19.1 20.3 21.2 18.8 20.0 19.6 21.5 20.7 19.9 20.4',
  b: '21.4 22.6 20.9 23.1 21.8 22.4 20.6 22.9 21.7 22.2',
  groupsText: 'Diet A: 4.2 3.8 5.1 4.6 4.0 4.9\nDiet B: 5.3 5.9 6.2 5.1 5.7 6.0\nDiet C: 4.8 5.2 4.4 5.6 5.0 4.7',
  tableText: 'Clicked, Not clicked\n48, 452\n71, 429',
  obs: '58 42 37 63', exp: '1 1 1 1',
  x1: 71, n1: 500, x2: 48, n2: 500,
}

function pick(s: typeof DEF): TestId {
  if (s.override) return s.override
  if (s.goal === 'relation') return 'corr'
  if (s.goal === 'counts') return s.countKind === 'table' ? 'chi-ind' : s.countKind === 'gof' ? 'chi-gof' : 'prop'
  if (s.groups === '1') return 'one-t'
  if (s.groups === '3') return 'anova'
  if (s.paired === 'yes') return s.normal === 'yes' ? 'paired-t' : 'wsr'
  return s.normal === 'yes' ? 'two-t' : 'mw'
}

const fmt = (x: number, d = 4) => (Number.isFinite(x) ? Number(x.toPrecision(d)).toString() : '—')
const fp = (p: number) => (!Number.isFinite(p) ? '—' : p < 0.0001 ? '< 0.0001' : p.toFixed(4))

function DistChart({ r, alpha }: { r: TestResult; alpha: number }) {
  const pdf = pdfOf(r.dist)
  const sym = r.dist.kind === 'z' || r.dist.kind === 't'
  const c = critical(r.dist, alpha, r.alt)
  const lo = sym ? -Math.max(4, Math.abs(r.stat) + 0.5) : 0
  const hi = sym ? -lo : Math.max(c * 1.6, r.stat * 1.15, 1)
  const N = 240
  const xs = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N)
  const curve: [number, number][] = xs.map((x) => [x, pdf(x)])
  const tail = (a: number, b: number): [number, number][] => xs.filter((x) => x >= a && x <= b).map((x) => [x, pdf(x)])
  const tails: [number, number][][] = !sym || r.alt === 'greater' ? [tail(Math.abs(c), hi)] : r.alt === 'less' ? [tail(lo, c)] : [tail(lo, -c), tail(c, hi)]
  return (
    <LineChart
      height={230}
      fx={(v) => fmt(v, 3)}
      fy={(v) => fmt(v, 2)}
      yMin={0}
      series={[{ name: `${r.dist.kind} density`, points: curve, color: 'var(--accent)' }, ...tails.map((t, i) => ({ name: tails.length === 2 ? (i ? 'Upper rejection tail' : 'Lower rejection tail') : `Rejection region (α = ${alpha})`, points: t, color: '#ef4444', area: true }))]}
      markers={[{ x: Math.max(lo, Math.min(hi, r.stat)), label: `${r.statName} = ${fmt(r.stat, 3)}` }]}
    />
  )
}

export default function HypothesisTestWizard() {
  const [s, set, reset] = useToolState('hypothesis-test-wizard', DEF)
  const id = pick(s)
  const A = parseNums(s.a), B = parseNums(s.b)
  const groups = s.groupsText.split('\n').map((l) => l.replace(/^[^:]*:/, '')).map(parseNums).filter((g) => g.length)
  const tableLines = s.tableText.split('\n').filter((l) => l.trim())
  const header = tableLines[0] && !/\d/.test(tableLines[0]) ? tableLines[0] : null
  const table = tableLines.slice(header ? 1 : 0).map(parseNums)
  const alt = s.alt
  const r: TestResult =
    id === 'one-t' ? oneSampleT(A, s.mu0, alt, s.alpha)
    : id === 'two-t' ? twoSampleT(A, B, alt, s.equalVar, s.alpha)
    : id === 'paired-t' ? pairedT(A, B, alt, s.alpha)
    : id === 'mw' ? mannWhitney(A, B, alt)
    : id === 'wsr' ? wilcoxonSigned(A, B, alt)
    : id === 'anova' ? anova(groups)
    : id === 'chi-ind' ? chiIndependence(table)
    : id === 'chi-gof' ? chiGof(parseNums(s.obs), parseNums(s.exp))
    : id === 'prop' ? twoProportionZ(s.x1, s.n1, s.x2, s.n2, alt, s.alpha)
    : correlation(A, B, alt, s.alpha)
  const sig = r.p < s.alpha
  const oneTailOk = !['anova', 'chi-ind', 'chi-gof'].includes(id)
  const labels: Record<TestId, [string, string]> = {
    'one-t': ['Sample', ''], 'two-t': ['Group 1', 'Group 2'], mw: ['Group 1', 'Group 2'], 'paired-t': ['Before / condition 1', 'After / condition 2'], wsr: ['Before / condition 1', 'After / condition 2'],
    corr: ['X values', 'Y values'], anova: ['', ''], 'chi-ind': ['', ''], 'chi-gof': ['', ''], prop: ['', ''],
  }
  const altText = alt === 'two' ? 'differs from' : alt === 'less' ? 'is less than' : 'is greater than'
  const H: Record<TestId, [string, string]> = {
    'one-t': [`The population mean equals ${s.mu0}.`, `The population mean ${altText} ${s.mu0}.`],
    'two-t': ['Both groups have the same mean.', `Mean of group 1 ${altText} group 2.`],
    'paired-t': ['The mean difference is zero.', `Condition 1 ${altText} condition 2 on average.`],
    mw: ['Both groups come from the same distribution.', `Values in group 1 tend to be ${alt === 'two' ? 'different from' : alt === 'less' ? 'smaller than' : 'larger than'} group 2.`],
    wsr: ['The median difference is zero.', `Condition 1 ${altText} condition 2 (median difference ≠ 0).`],
    anova: ['All group means are equal.', 'At least one group mean differs.'],
    'chi-ind': ['The two categorical variables are independent.', 'The variables are associated.'],
    'chi-gof': ['Observed counts follow the expected proportions.', 'Observed counts deviate from the expected proportions.'],
    prop: ['Both proportions are equal.', `Proportion 1 ${altText} proportion 2.`],
    corr: ['There is no linear correlation (ρ = 0).', `The correlation ${alt === 'two' ? 'is non-zero' : alt === 'less' ? 'is negative' : 'is positive'}.`],
  }
  const interpretation = r.error
    ? ''
    : `${r.test}: ${r.statName}${r.df ? `(${r.df})` : ''} = ${fmt(r.stat)}, p = ${fp(r.p)}. ` +
      (sig ? `Since p < α = ${s.alpha}, reject H₀ — ${H[id][1].charAt(0).toLowerCase() + H[id][1].slice(1)}` : `Since p ≥ α = ${s.alpha}, there is not enough evidence to reject H₀ (${H[id][0].charAt(0).toLowerCase() + H[id][0].slice(1, -1)}).`) +
      (r.effect ? ` Effect size: ${r.effect[0]} = ${fmt(r.effect[1], 3)} (${r.effect[2]}).` : '') +
      (r.ci ? ` ${r.ci[2]}: [${fmt(r.ci[0])}, ${fmt(r.ci[1])}].` : '')

  return (
    <Split>
      <div>
        <Panel title="1 · What do you want to test?" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.goal} onChange={(goal) => set({ goal, override: '' })} options={[['means', 'Compare averages'], ['counts', 'Counts / proportions'], ['relation', 'Relationship']]} />
          {s.goal === 'means' && (
            <>
              <p className="k-label" style={{ margin: '12px 0 4px' }}>How many groups?</p>
              <Seg value={s.groups} onChange={(groups) => set({ groups, override: '' })} options={[['1', 'One vs. a value'], ['2', 'Two groups'], ['3', 'Three or more']]} />
              {s.groups === '2' && (
                <>
                  <p className="k-label" style={{ margin: '12px 0 4px' }}>Are the measurements paired (same subjects twice)?</p>
                  <Seg value={s.paired} onChange={(paired) => set({ paired, override: '' })} options={[['no', 'Independent'], ['yes', 'Paired']]} />
                  <p className="k-label" style={{ margin: '12px 0 4px' }}>Roughly normal data, or n ≥ 30 per group?</p>
                  <Seg value={s.normal} onChange={(normal) => set({ normal, override: '' })} options={[['yes', 'Yes'], ['no', 'No / skewed / ranks']]} />
                </>
              )}
            </>
          )}
          {s.goal === 'counts' && (
            <>
              <p className="k-label" style={{ margin: '12px 0 4px' }}>What kind of counts?</p>
              <Seg value={s.countKind} onChange={(countKind) => set({ countKind, override: '' })} options={[['table', 'Two categorical variables'], ['gof', 'One variable vs. expected'], ['prop', 'Two success rates']]} />
            </>
          )}
          {s.goal === 'relation' && <Note>Two numeric variables measured on the same subjects → Pearson correlation.</Note>}
          <Note tone="ok">
            Recommended: <b>{NAMES[id]}</b>
          </Note>
          <Select label="…or choose a test directly" value={s.override} onChange={(override) => set({ override })} options={[['', 'Use the recommendation'], ...(Object.keys(NAMES) as TestId[]).map((k) => [k, NAMES[k]] as const)]} />
        </Panel>
        <Panel title="2 · Your data">
          {['one-t', 'two-t', 'paired-t', 'mw', 'wsr', 'corr'].includes(id) && (
            <>
              <Area label={`${labels[id][0]} (${A.length} values)`} value={s.a} onChange={(a) => set({ a })} rows={3} mono />
              {id !== 'one-t' && <Area label={`${labels[id][1]} (${B.length} values)`} value={s.b} onChange={(b) => set({ b })} rows={3} mono />}
              {id === 'one-t' && <Num label="Hypothesised mean μ₀" value={s.mu0} onChange={(mu0) => set({ mu0 })} />}
              {id === 'two-t' && <Check label="Assume equal variances (Student's t)" value={s.equalVar} onChange={(equalVar) => set({ equalVar })} />}
            </>
          )}
          {id === 'anova' && <Area label={`Groups — one per line, optional “Name:” prefix (${groups.length} groups)`} value={s.groupsText} onChange={(groupsText) => set({ groupsText })} rows={5} mono />}
          {id === 'chi-ind' && <Area label="Contingency table — one row per line, optional header line" value={s.tableText} onChange={(tableText) => set({ tableText })} rows={5} mono />}
          {id === 'chi-gof' && (
            <>
              <Area label="Observed counts" value={s.obs} onChange={(obs) => set({ obs })} rows={2} mono />
              <Area label="Expected ratios (same order; e.g. 1 1 1 1 = uniform, 9 3 3 1 = Mendel)" value={s.exp} onChange={(exp) => set({ exp })} rows={2} mono />
            </>
          )}
          {id === 'prop' && (
            <>
              <Row><Num label="Group 1 successes" value={s.x1} onChange={(x1) => set({ x1 })} min={0} step={1} /><Num label="Group 1 total" value={s.n1} onChange={(n1) => set({ n1 })} min={1} step={1} /></Row>
              <Row><Num label="Group 2 successes" value={s.x2} onChange={(x2) => set({ x2 })} min={0} step={1} /><Num label="Group 2 total" value={s.n2} onChange={(n2) => set({ n2 })} min={1} step={1} /></Row>
            </>
          )}
          <Row>
            <Select label="Significance α" value={s.alpha} onChange={(alpha) => set({ alpha })} options={[[0.1, '0.10'], [0.05, '0.05'], [0.01, '0.01'], [0.001, '0.001']]} />
            {oneTailOk && <Select label="Alternative hypothesis" value={s.alt} onChange={(a) => set({ alt: a })} options={[['two', 'Two-sided (≠)'], ['less', 'Less than (<)'], ['greater', 'Greater than (>)']]} />}
          </Row>
        </Panel>
      </div>
      <div>
        {r.error ? (
          <Note tone="err">{r.error}</Note>
        ) : (
          <>
            <Stats>
              <Stat label="Test statistic" value={`${r.statName} = ${fmt(r.stat)}`} sub={r.df ? `df = ${r.df}` : undefined} />
              <Stat label="p-value" value={fp(r.p)} sub={oneTailOk ? (alt === 'two' ? 'two-sided' : 'one-sided') : 'right-tailed'} />
              <Stat label="Decision" value={sig ? 'Reject H₀' : 'Keep H₀'} tone={sig ? 'good' : undefined} sub={`at α = ${s.alpha}`} />
              {r.effect && <Stat label={r.effect[0]} value={fmt(r.effect[1], 3)} sub={`${r.effect[2]} effect`} />}
            </Stats>
            <Panel title={r.test} actions={<CopyButton text={interpretation} label="Copy report" />}>
              <Table head={['', 'Hypothesis']} rows={[['H₀', H[id][0]], ['H₁', H[id][1]]]} />
              <p style={{ lineHeight: 1.6 }}>{interpretation}</p>
              {r.ci && <Note>{r.ci[2]}: <b>[{fmt(r.ci[0])}, {fmt(r.ci[1])}]</b>{(id === 'two-t' || id === 'prop') && (r.ci[0] > 0 || r.ci[1] < 0 ? ' — excludes 0.' : ' — includes 0.')}</Note>}
            </Panel>
            <Panel title="Sampling distribution under H₀">
              <DistChart r={r} alpha={s.alpha} />
              <p className="muted" style={{ fontSize: 13 }}>Red: rejection region at α = {s.alpha} (critical value {fmt(critical(r.dist, s.alpha, r.alt), 4)}). The dashed line marks your statistic.</p>
            </Panel>
            <Panel title="Details">
              <Table head={['Quantity', 'Value']} rows={r.table} />
              {(id === 'chi-ind' || id === 'chi-gof') && <p className="muted" style={{ fontSize: 13 }}>Chi-square tests need expected counts of at least 5 in most cells; otherwise use Fisher's exact test.</p>}
              {(id === 'mw' || id === 'wsr') && <p className="muted" style={{ fontSize: 13 }}>p-value uses the normal approximation with tie correction; exact tables are better for very small samples (n &lt; 10).</p>}
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
