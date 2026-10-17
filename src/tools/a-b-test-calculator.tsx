import { Btn, Check, color, CopyButton, CsvButton, LineChart, Note, Num, num, Panel, pct, Row, Seg, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { compare, normPdf, sampleSize, srm, wilson, type Sides } from './lib/a-b-test-calculator'

interface Variant { id: string; name: string; n: number; x: number }
const DEF = {
  variants: [
    { id: 'a', name: 'A · Control', n: 12480, x: 498 },
    { id: 'b', name: 'B · New checkout', n: 12515, x: 581 },
  ] as Variant[],
  conf: 0.95,
  sides: 'two' as Sides,
  bonferroni: true,
  base: 4,
  mde: 10,
  power: 0.8,
  daily: 3000,
}

/** Horizontal confidence-interval chart for conversion rates. */
function CiChart({ rows, conf }: { rows: { name: string; p: number; lo: number; hi: number; c: string }[]; conf: number }) {
  const lo = Math.min(...rows.map((r) => r.lo)), hi = Math.max(...rows.map((r) => r.hi))
  const pad = (hi - lo) * 0.15 || 0.01
  const x0 = Math.max(0, lo - pad), x1 = hi + pad
  const W = 600, L = 130, R = 20, rowH = 34
  const sx = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R)
  const ticks = Array.from({ length: 5 }, (_, i) => x0 + ((x1 - x0) * i) / 4)
  const H = rows.length * rowH + 30
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Confidence intervals">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={sx(t)} x2={sx(t)} y1={4} y2={H - 22} stroke="var(--grid)" />
          <text x={sx(t)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">{(t * 100).toFixed(2)}%</text>
        </g>
      ))}
      {rows.length > 0 && <line x1={sx(rows[0].p)} x2={sx(rows[0].p)} y1={4} y2={H - 22} stroke={rows[0].c} strokeDasharray="4 3" />}
      {rows.map((r, i) => {
        const y = 18 + i * rowH
        return (
          <g key={r.name}>
            <text x={L - 10} y={y + 4} textAnchor="end" fontSize={12} fill="var(--fg)">{r.name.length > 18 ? r.name.slice(0, 17) + '…' : r.name}</text>
            <line x1={sx(r.lo)} x2={sx(r.hi)} y1={y} y2={y} stroke={r.c} strokeWidth={8} strokeLinecap="round" opacity={0.35} />
            <circle cx={sx(r.p)} cy={y} r={6} fill={r.c} />
            <text x={sx(r.hi) + 6} y={y - 8} fontSize={10.5} fill="var(--muted)">{(r.p * 100).toFixed(2)}%</text>
          </g>
        )
      })}
      <text x={W - R} y={12} textAnchor="end" fontSize={10.5} fill="var(--muted)">{Math.round(conf * 100)}% Wilson intervals</text>
    </svg>
  )
}

export default function ABTestCalculator() {
  const [s, set, reset] = useToolState('a-b-test-calculator', DEF)
  const vs = s.variants
  const ctl = vs[0]
  const k = vs.length - 1
  const alpha = (1 - s.conf) / (s.bonferroni && k > 1 ? k : 1)
  const valid = vs.every((v) => v.n > 0 && v.x >= 0 && v.x <= v.n)
  const res = valid ? vs.slice(1).map((v) => ({ v, r: compare(ctl.n, ctl.x, v.n, v.x, alpha, s.sides) })) : []
  const best = res.length ? res.reduce((a, b) => (b.r.lift > a.r.lift ? b : a)) : null
  const ratio = valid ? srm(vs.map((v) => v.n)) : null
  const nNeed = sampleSize(s.base / 100, s.mde / 100, (1 - s.conf) / (s.bonferroni && k > 1 ? k : 1), s.power, s.sides)
  const totalNeed = nNeed * vs.length
  const days = totalNeed / Math.max(1, s.daily)
  const edit = (id: string, p: Partial<Variant>) => set({ variants: vs.map((v) => (v.id === id ? { ...v, ...p } : v)) })

  // normal approximation of each variant's rate (sampling distribution)
  const curves = valid
    ? vs.map((v, i) => {
        const p = v.x / v.n, sd = Math.sqrt((p * (1 - p)) / v.n) || 1e-6
        return { name: v.name, color: color(i), area: true, p, sd }
      })
    : []
  const xlo = Math.min(...curves.map((c) => c.p - 4 * c.sd)), xhi = Math.max(...curves.map((c) => c.p + 4 * c.sd))
  const series = curves.map((c) => ({ name: c.name, color: c.color, area: true, points: Array.from({ length: 121 }, (_, j) => { const x = xlo + ((xhi - xlo) * j) / 120; return [x * 100, normPdf(x, c.p, c.sd) / 100] as [number, number] }) }))

  const summary = best
    ? `${best.v.name} vs ${ctl.name}: ${pct(best.r.pA, 2)} → ${pct(best.r.pB, 2)} (${best.r.lift >= 0 ? '+' : ''}${pct(best.r.lift, 1)} lift), p = ${best.r.p < 0.0001 ? '<0.0001' : best.r.p.toFixed(4)}, ${best.r.significant ? `significant at ${Math.round(s.conf * 100)}%` : 'not significant'}.`
    : ''

  return (
    <Split>
      <div>
        <Panel title="Test results" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Table
            head={['Variant', 'Visitors', 'Conversions', 'Rate', '']}
            rows={vs.map((v, i) => [
              <input key="n" value={v.name} onChange={(e) => edit(v.id, { name: e.target.value })} aria-label="Variant name" style={{ minWidth: 0, width: '100%', borderLeft: `4px solid ${color(i)}` }} />,
              <input key="v" type="number" min={1} value={v.n} onChange={(e) => edit(v.id, { n: Math.max(0, Math.round(Number(e.target.value) || 0)) })} aria-label="Visitors" style={{ width: 90 }} />,
              <input key="c" type="number" min={0} value={v.x} onChange={(e) => edit(v.id, { x: Math.max(0, Math.round(Number(e.target.value) || 0)) })} aria-label="Conversions" style={{ width: 80 }} />,
              <b key="r">{v.n > 0 ? pct(v.x / v.n, 2) : '—'}</b>,
              i === 0 ? '' : <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ variants: vs.filter((q) => q.id !== v.id) })}>✕</Btn>,
            ])}
          />
          <Row>
            <Btn disabled={vs.length >= 6} onClick={() => set({ variants: [...vs, { id: uid(), name: `${String.fromCharCode(65 + vs.length)} · Variant`, n: ctl.n, x: ctl.x }] })}>+ Variant</Btn>
          </Row>
          {!valid && <Note tone="err">Each variant needs visitors &gt; 0 and conversions ≤ visitors.</Note>}
        </Panel>
        <Panel title="Settings">
          <Seg value={String(s.conf)} onChange={(v) => set({ conf: Number(v) })} options={[['0.8', '80%'], ['0.9', '90%'], ['0.95', '95%'], ['0.99', '99%']]} label="Confidence" />
          <div style={{ height: 8 }} />
          <Seg value={s.sides} onChange={(sides) => set({ sides })} options={[['two', 'Two-sided (B ≠ A)'], ['one', 'One-sided (B > A)']]} />
          {k > 1 && <Check label={`Bonferroni correction for ${k} comparisons (α = ${num(alpha, 4)})`} value={s.bonferroni} onChange={(bonferroni) => set({ bonferroni })} />}
          <p className="muted" style={{ fontSize: 12 }}>The first row is the control. Decide confidence and sidedness before looking at the data.</p>
        </Panel>
        <Panel title="Sample size planner">
          <Row>
            <Num label="Baseline conversion" value={s.base} onChange={(base) => set({ base })} unit="%" min={0.01} max={99} />
            <Num label="Min. detectable lift" value={s.mde} onChange={(mde) => set({ mde })} unit="% rel." />
          </Row>
          <Row>
            <Num label="Power" value={s.power} onChange={(power) => set({ power: Math.min(0.99, Math.max(0.5, power)) })} min={0.5} max={0.99} step={0.05} />
            <Num label="Daily visitors (all variants)" value={s.daily} onChange={(daily) => set({ daily })} min={1} />
          </Row>
          <Btn onClick={() => valid && set({ base: Number(((ctl.x / ctl.n) * 100).toFixed(3)) })}>Use control's rate</Btn>
          <Stats>
            <Stat label="Per variant" value={Number.isFinite(nNeed) ? nNeed.toLocaleString('en-US') : '—'} tone="accent" />
            <Stat label="Total" value={Number.isFinite(totalNeed) ? totalNeed.toLocaleString('en-US') : '—'} sub={`${vs.length} variants`} />
            <Stat label="Duration" value={Number.isFinite(days) ? `${Math.ceil(days)} days` : '—'} sub={Number.isFinite(days) ? `≈ ${num(days / 7, 1)} weeks — run full weeks` : ''} />
          </Stats>
          <p className="muted" style={{ fontSize: 12 }}>Detects {pct(s.base / 100, 2)} → {pct((s.base / 100) * (1 + s.mde / 100), 2)} with {Math.round(s.power * 100)}% power. Halving the lift roughly quadruples the sample.</p>
        </Panel>
      </div>
      <div>
        {best && (
          <>
            <Stats>
              <Stat label={`Lift (${best.v.name.split('·')[0].trim()})`} value={`${best.r.lift >= 0 ? '+' : ''}${pct(best.r.lift, 1)}`} tone={best.r.significant ? 'good' : undefined} sub={`CI ${pct(best.r.liftCI[0], 1)} … ${Number.isFinite(best.r.liftCI[1]) ? pct(best.r.liftCI[1], 1) : '∞'}`} />
              <Stat label="p-value" value={best.r.p < 0.0001 ? '< 0.0001' : best.r.p.toFixed(4)} tone={best.r.significant ? 'good' : 'bad'} sub={`z = ${best.r.z.toFixed(3)}`} />
              <Stat label="Chance to beat control" value={pct(best.r.probBBeats, 1)} tone="accent" />
              <Stat label="Observed power" value={pct(best.r.power, 0)} sub={best.r.power < 0.8 ? 'under-powered' : 'adequate'} tone={best.r.power < 0.8 ? 'bad' : undefined} />
            </Stats>
            <Note tone={best.r.significant ? (best.r.lift > 0 ? 'ok' : 'err') : 'warn'}>
              {best.r.significant
                ? best.r.lift > 0
                  ? `✓ ${best.v.name} wins: the difference is statistically significant at ${Math.round(s.conf * 100)}% confidence.`
                  : `✗ ${best.v.name} performs significantly worse than control.`
                : `No significant difference yet. Keep the test running until each variant has about ${Number.isFinite(nNeed) ? nNeed.toLocaleString('en-US') : 'enough'} visitors (see planner) — and don't stop early on a lucky peek.`}
            </Note>
          </>
        )}
        {ratio && ratio.p < 0.001 && <Note tone="err">Sample ratio mismatch: visitor counts deviate from an even split (χ² = {num(ratio.chi2, 1)}, p = {ratio.p.toExponential(1)}). Check randomisation and tracking before trusting the result.</Note>}
        <Panel title="Comparison vs control" actions={<><CopyButton text={summary} label="Copy summary" /><CsvButton name="ab-test.csv" rows={() => [['Variant', 'Visitors', 'Conversions', 'Rate', 'Abs diff', 'Lift', 'Lift CI low', 'Lift CI high', 'z', 'p', 'Significant'], [ctl.name, ctl.n, ctl.x, ctl.x / ctl.n, '', '', '', '', '', '', ''], ...res.map(({ v, r }) => [v.name, v.n, v.x, r.pB, r.diff, r.lift, r.liftCI[0], r.liftCI[1], r.z, r.p, r.significant ? 'yes' : 'no'])]} /></>}>
          <Table
            head={['Variant', 'Rate (CI)', 'Abs. diff', 'Rel. lift (CI)', 'p-value', 'P(beat A)', '']}
            rows={valid ? vs.map((v, i) => {
              const [lo, hi] = wilson(v.x, v.n, s.conf)
              const r = res[i - 1]?.r
              return [
                <span key="n" style={{ fontWeight: 700, color: color(i) }}>{v.name}</span>,
                <span key="r">{pct(v.x / v.n, 2)} <span className="muted" style={{ fontSize: 11 }}>({pct(lo, 2)}–{pct(hi, 2)})</span></span>,
                r ? `${r.diff >= 0 ? '+' : ''}${(r.diff * 100).toFixed(2)} pp` : '—',
                r ? <span key="l">{r.lift >= 0 ? '+' : ''}{pct(r.lift, 1)} <span className="muted" style={{ fontSize: 11 }}>({pct(r.liftCI[0], 1)} … {Number.isFinite(r.liftCI[1]) ? pct(r.liftCI[1], 1) : '∞'})</span></span> : 'baseline',
                r ? (r.p < 0.0001 ? '<0.0001' : r.p.toFixed(4)) : '—',
                r ? pct(r.probBBeats, 1) : '—',
                r ? <b key="s" style={{ color: r.significant ? (r.lift > 0 ? 'var(--ok)' : 'var(--err)') : 'var(--muted)' }}>{r.significant ? (r.lift > 0 ? 'Winner' : 'Loser') : 'Inconclusive'}</b> : '',
              ]
            }) : []}
          />
        </Panel>
        {valid && (
          <Panel title="Conversion rates with confidence intervals">
            <CiChart conf={s.conf} rows={vs.map((v, i) => { const [lo, hi] = wilson(v.x, v.n, s.conf); return { name: v.name, p: v.x / v.n, lo, hi, c: color(i) } })} />
          </Panel>
        )}
        {valid && (
          <Panel title="Sampling distributions">
            <LineChart series={series} height={220} xLabel="Conversion rate (%)" fx={(v) => `${v.toFixed(2)}%`} fy={(v) => num(v, 1)} />
            <p className="muted" style={{ fontSize: 12 }}>The less the curves overlap, the more confident you can be that the rates truly differ.</p>
          </Panel>
        )}
      </div>
    </Split>
  )
}
