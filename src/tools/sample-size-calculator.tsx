import { useMemo } from 'react'
import { Btn, Check, CopyButton, LineChart, Note, num, Num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { normInv, power, precisionN, sampleSize, type Design, type Inputs } from './lib/sample-size-calculator'

const DEF = {
  goal: 'test' as 'test' | 'ci',
  design: 'two-means' as Design,
  alpha: 0.05, power: 0.8, sides: 2 as 1 | 2, ratio: 1,
  diff: 5, sd: 10, tAdjust: true,
  p1: 0.3, p2: 0.4,
  dropout: 10,
  conf: 0.95, margin: 0.05, ciKind: 'prop' as 'prop' | 'mean', pExp: 0.5, ciSd: 15, pop: 0,
}

const DESIGNS: [Design, string][] = [['two-means', 'Two means'], ['one-mean', 'One mean / paired'], ['two-props', 'Two proportions'], ['one-prop', 'One proportion']]

const EXAMPLES: { name: string; p: Partial<typeof DEF> }[] = [
  { name: 'Drug lowers BP by 5 mmHg (SD 10)', p: { goal: 'test', design: 'two-means', diff: 5, sd: 10 } },
  { name: 'A/B test 10% → 12% conversion', p: { goal: 'test', design: 'two-props', p1: 0.1, p2: 0.12 } },
  { name: 'Before/after training, d = 0.4', p: { goal: 'test', design: 'one-mean', diff: 0.4, sd: 1 } },
  { name: 'Poll ±3 points at 95%', p: { goal: 'ci', ciKind: 'prop', margin: 0.03, pExp: 0.5 } },
]

export default function SampleSizeCalculator() {
  const [s, set, reset] = useToolState('sample-size-calculator', DEF)
  const isMean = s.design === 'two-means' || s.design === 'one-mean'
  const two = s.design === 'two-means' || s.design === 'two-props'
  const inp: Inputs = { design: s.design, alpha: s.alpha, power: s.power, sides: s.sides, ratio: s.ratio, diff: s.diff, sd: s.sd, tAdjust: s.tAdjust, p1: s.p1, p2: s.p2 }

  const problem =
    s.alpha <= 0 || s.alpha >= 0.5 ? 'α must be between 0 and 0.5.'
      : s.power <= s.alpha || s.power >= 1 ? 'Power must be between α and 1.'
        : two && s.ratio <= 0 ? 'Allocation ratio must be positive.'
          : isMean && (s.sd <= 0 || s.diff === 0) ? 'Need a non-zero difference and a positive SD.'
            : !isMean && (s.p1 <= 0 || s.p1 >= 1 || s.p2 <= 0 || s.p2 >= 1 || s.p1 === s.p2) ? 'Proportions must be between 0 and 1 and differ.'
              : ''

  const res = problem ? null : sampleSize(inp)
  const n1 = res ? Math.ceil(res.n1) : 0
  const n2 = res && two ? Math.ceil(res.n2) : 0
  const inflate = (n: number) => Math.ceil(n / (1 - Math.min(0.9, s.dropout / 100)))
  const total = n1 + n2
  const es = isMean ? Math.abs(s.diff) / s.sd : Math.abs(2 * Math.asin(Math.sqrt(s.p2)) - 2 * Math.asin(Math.sqrt(s.p1)))
  const esName = isMean ? "Cohen's d" : "Cohen's h"
  const esSize = es < 0.2 ? 'very small' : es < 0.5 ? 'small' : es < 0.8 ? 'medium' : 'large'

  const hiN = res ? Math.max(10, Math.ceil(res.n1 * 2.5)) : 10
  const curve = res
    ? Array.from({ length: 120 }, (_, i) => {
        const n = 2 + ((hiN - 2) * i) / 119
        return [n, power(inp, n) * 100] as [number, number]
      })
    : []

  const ciN = useMemo(() => {
    if (s.margin <= 0 || s.conf <= 0 || s.conf >= 1) return NaN
    return precisionN(s.conf, s.margin, s.ciKind === 'prop' ? { p: s.pExp, N: s.pop || undefined } : { sd: s.ciSd, N: s.pop || undefined })
  }, [s.conf, s.margin, s.ciKind, s.pExp, s.ciSd, s.pop])

  const sentence = res
    ? `With ${two ? `${n1}${s.ratio !== 1 ? ` and ${n2}` : ''} participants per group (${total} total)` : `${n1} participants`}, a ${s.sides}-sided ${isMean ? (two ? 'two-sample t-test' : 'one-sample/paired t-test') : two ? 'two-proportion z-test' : 'one-proportion z-test'} at α = ${s.alpha} has ${pct(s.power, 0)} power to detect ${isMean ? `a difference of ${s.diff} (SD ${s.sd}; d = ${es.toFixed(2)})` : `${pct(s.p1, 1)} vs ${pct(s.p2, 1)} (h = ${es.toFixed(2)})`}. Allowing ${s.dropout}% dropout, recruit ${two ? `${inflate(n1)} + ${inflate(n2)} = ${inflate(n1) + inflate(n2)}` : inflate(n1)}.`
    : ''

  return (
    <Split>
      <div>
        <Panel title="Goal" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.goal} onChange={(goal) => set({ goal })} options={[['test', 'Detect an effect (power)'], ['ci', 'Estimate with precision']]} />
          <div style={{ marginTop: 10 }}>
            <span className="k-label">Examples</span>
            <Row>
              {EXAMPLES.map((e) => (
                <Btn key={e.name} kind="ghost" onClick={() => set(e.p)}>{e.name}</Btn>
              ))}
            </Row>
          </div>
        </Panel>
        {s.goal === 'test' ? (
          <>
            <Panel title="Design">
              <Select label="Comparison" value={s.design} onChange={(design) => set({ design })} options={DESIGNS} />
              {isMean ? (
                <>
                  <Row>
                    <Num label={two ? 'Difference in means (Δ)' : 'Mean difference to detect'} value={s.diff} onChange={(diff) => set({ diff })} />
                    <Num label="Standard deviation (σ)" value={s.sd} onChange={(sd) => set({ sd })} min={0} />
                  </Row>
                  <Row>
                    {[['Small', 0.2], ['Medium', 0.5], ['Large', 0.8]].map(([n, d]) => (
                      <Btn key={n} onClick={() => set({ diff: +(Number(d) * s.sd).toFixed(4) })}>{n} (d={d})</Btn>
                    ))}
                  </Row>
                  <Check label="t-distribution correction (exact-ish for small n)" value={s.tAdjust} onChange={(tAdjust) => set({ tAdjust })} />
                </>
              ) : (
                <Row>
                  <Num label={two ? 'Proportion, group 1' : 'Null proportion p₀'} value={s.p1} onChange={(p1) => set({ p1 })} min={0} max={1} step={0.01} />
                  <Num label={two ? 'Proportion, group 2' : 'Expected proportion p₁'} value={s.p2} onChange={(p2) => set({ p2 })} min={0} max={1} step={0.01} />
                </Row>
              )}
              {two && <Num label="Allocation ratio n₂ / n₁" value={s.ratio} onChange={(ratio) => set({ ratio })} min={0.1} step={0.1} hint="1 = equal groups; 2 = twice as many in group 2" />}
            </Panel>
            <Panel title="Error rates">
              <Row>
                <Select label="Significance α" value={s.alpha} onChange={(alpha) => set({ alpha })} options={[[0.001, '0.001'], [0.005, '0.005'], [0.01, '0.01'], [0.025, '0.025'], [0.05, '0.05'], [0.1, '0.10']]} />
                <Select label="Power (1 − β)" value={s.power} onChange={(p) => set({ power: p })} options={[[0.7, '70%'], [0.8, '80%'], [0.85, '85%'], [0.9, '90%'], [0.95, '95%'], [0.99, '99%']]} />
              </Row>
              <Seg value={String(s.sides) as '1' | '2'} onChange={(v) => set({ sides: Number(v) as 1 | 2 })} options={[['2', 'Two-sided'], ['1', 'One-sided']]} />
              <Num label="Expected dropout / non-response" value={s.dropout} onChange={(dropout) => set({ dropout: Math.max(0, Math.min(90, dropout)) })} unit="%" min={0} max={90} />
            </Panel>
          </>
        ) : (
          <Panel title="Precision target">
            <Seg value={s.ciKind} onChange={(ciKind) => set({ ciKind })} options={[['prop', 'Proportion'], ['mean', 'Mean']]} />
            <Row>
              <Select label="Confidence" value={s.conf} onChange={(conf) => set({ conf })} options={[[0.8, '80%'], [0.9, '90%'], [0.95, '95%'], [0.99, '99%']]} />
              <Num label={s.ciKind === 'prop' ? 'Margin of error (± proportion)' : 'Margin of error (± units)'} value={s.margin} onChange={(margin) => set({ margin })} min={0} step={0.01} />
            </Row>
            <Row>
              {s.ciKind === 'prop' ? (
                <Num label="Expected proportion" value={s.pExp} onChange={(pExp) => set({ pExp: Math.min(1, Math.max(0, pExp)) })} min={0} max={1} step={0.05} hint="0.5 is the safe worst case" />
              ) : (
                <Num label="Standard deviation" value={s.ciSd} onChange={(ciSd) => set({ ciSd })} min={0} />
              )}
              <Num label="Population size (0 = infinite)" value={s.pop} onChange={(pop) => set({ pop: Math.max(0, Math.round(pop)) })} min={0} />
            </Row>
          </Panel>
        )}
      </div>

      <div>
        {s.goal === 'test' ? (
          problem || !res ? (
            <Note tone="err">{problem}</Note>
          ) : (
            <>
              <Stats>
                <Stat label={two ? 'Per group' : 'Sample size'} value={two && s.ratio !== 1 ? `${n1} / ${n2}` : n1} tone="accent" sub={two && s.ratio !== 1 ? 'n₁ / n₂' : undefined} />
                <Stat label="Total" value={total} />
                <Stat label={`With ${s.dropout}% dropout`} value={two ? inflate(n1) + inflate(n2) : inflate(n1)} sub="to recruit" />
                <Stat label={esName} value={es.toFixed(3)} sub={esSize} />
              </Stats>
              <Panel title="Power curve">
                <LineChart
                  series={[{ name: 'Power', points: curve, color: 'var(--accent)', area: true }]}
                  yMin={0}
                  yMax={100}
                  fx={(v) => String(Math.round(v))}
                  fy={(v) => `${Math.round(v)}%`}
                  xLabel={two ? 'n per group (group 1)' : 'n'}
                  markers={[{ x: res.n1, label: `${pct(s.power, 0)} at n=${n1}` }]}
                  height={260}
                />
              </Panel>
              <Panel title="Sensitivity: n per group for other α and power" actions={<CopyButton text={sentence} label="Copy write-up" />}>
                <Table
                  head={['Power', ...[0.01, 0.05, 0.1].map((a) => `α = ${a}`)]}
                  rows={[0.7, 0.8, 0.85, 0.9, 0.95].map((p) => [
                    <b key="p">{pct(p, 0)}</b>,
                    ...[0.01, 0.05, 0.1].map((a) => {
                      const n = Math.ceil(sampleSize({ ...inp, alpha: a, power: p }).n1)
                      const on = a === s.alpha && p === s.power
                      return <span key={a} style={on ? { fontWeight: 800, color: 'var(--accent)' } : undefined}>{n.toLocaleString()}</span>
                    }),
                  ])}
                />
                <Note tone="ok">{sentence}</Note>
                <p className="muted" style={{ fontSize: 12 }}>
                  Means use the normal formula n = (1 + 1/k)(z₁₋α/₂ + z₁₋β)²σ²/Δ², refined with t quantiles when enabled (matches G*Power). Proportions use the unpooled/pooled Fleiss formula without continuity correction.
                </p>
              </Panel>
            </>
          )
        ) : (
          <>
            <Stats>
              <Stat label="Required sample" value={Number.isFinite(ciN) ? Math.ceil(ciN).toLocaleString() : '—'} tone="accent" />
              <Stat label="Margin" value={s.ciKind === 'prop' ? `±${pct(s.margin, 1)}` : `±${s.margin}`} sub={`${pct(s.conf, 0)} confidence`} />
              <Stat label="Population" value={s.pop ? s.pop.toLocaleString() : '∞'} sub={s.pop ? 'finite correction applied' : undefined} />
            </Stats>
            <Panel title="Margin of error vs sample size">
              <LineChart
                series={[{
                  name: 'Margin',
                  points: Array.from({ length: 100 }, (_, i) => {
                    const n = 10 + i * Math.max(1, Math.ceil((Number.isFinite(ciN) ? ciN : 400) * 3 / 100))
                    const z = normInv(1 - (1 - s.conf) / 2)
                    const fpc = s.pop ? Math.sqrt(Math.max(0, (s.pop - n) / (s.pop - 1))) : 1
                    const m = (s.ciKind === 'prop' ? z * Math.sqrt((s.pExp * (1 - s.pExp)) / n) : (z * s.ciSd) / Math.sqrt(n)) * fpc
                    return [n, s.ciKind === 'prop' ? m * 100 : m] as [number, number]
                  }),
                  color: 'var(--accent)',
                }]}
                yMin={0}
                fx={(v) => String(Math.round(v))}
                fy={(v) => (s.ciKind === 'prop' ? `±${num(v, 1)}%` : `±${num(v, 2)}`)}
                markers={Number.isFinite(ciN) ? [{ x: ciN, label: `n = ${Math.ceil(ciN)}` }] : []}
                xLabel="sample size"
                height={260}
              />
              <p className="muted" style={{ fontSize: 12 }}>n₀ = z²·p(1−p)/E² (or (zσ/E)² for a mean), then n = n₀ / (1 + (n₀−1)/N) for a finite population. Halving the margin needs four times the sample.</p>
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
