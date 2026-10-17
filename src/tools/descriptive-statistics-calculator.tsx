import { useMemo } from 'react'
import { Area, Btn, color, CopyButton, CsvButton, niceTicks, Note, num, Panel, Row, Select, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { binCount, describe, histogram, parseData, QMETHODS, quantile, SAMPLE, type BinRule, type QMethod, type Stats as S } from './lib/descriptive-statistics-calculator'

interface State { text: string; qm: QMethod; conf: number; rule: BinRule; dp: number; pick: number }
const DEF: State = { text: SAMPLE, qm: 'r7', conf: 0.95, rule: 'sturges', dp: 4, pick: 0 }

function BoxPlot({ items }: { items: { name: string; st: S }[] }) {
  const lo = Math.min(...items.map((i) => i.st.min)), hi = Math.max(...items.map((i) => i.st.max))
  const pad = (hi - lo) * 0.05 || 1
  const W = 640, rowH = 46, L = 110, R = 16, H = items.length * rowH + 34
  const x = (v: number) => L + ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (W - L - R)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img" aria-label="Box plot">
      {niceTicks(lo - pad, hi + pad, 6).map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={6} y2={H - 26} stroke="var(--line)" />
          <text x={x(t)} y={H - 10} fontSize={11} textAnchor="middle" fill="var(--muted)">{num(t, 3)}</text>
        </g>
      ))}
      {items.map(({ name, st }, i) => {
        const y = 10 + i * rowH + rowH / 2
        const c = color(i)
        const wLo = st.sorted.find((v) => v >= st.fences[0]) ?? st.min, wHi = [...st.sorted].reverse().find((v) => v <= st.fences[1]) ?? st.max
        return (
          <g key={name}>
            <text x={L - 8} y={y + 4} fontSize={12} textAnchor="end" fill="currentColor">{name.length > 14 ? name.slice(0, 13) + '…' : name}</text>
            <line x1={x(wLo)} x2={x(wHi)} y1={y} y2={y} stroke={c} strokeWidth={1.5} />
            <line x1={x(wLo)} x2={x(wLo)} y1={y - 8} y2={y + 8} stroke={c} strokeWidth={1.5} />
            <line x1={x(wHi)} x2={x(wHi)} y1={y - 8} y2={y + 8} stroke={c} strokeWidth={1.5} />
            <rect x={x(st.q1)} y={y - 14} width={Math.max(1, x(st.q3) - x(st.q1))} height={28} fill={c} fillOpacity={0.25} stroke={c} strokeWidth={1.5} rx={3} />
            <line x1={x(st.median)} x2={x(st.median)} y1={y - 14} y2={y + 14} stroke={c} strokeWidth={3} />
            <path d={`M${x(st.mean)},${y - 5} l5,5 l-5,5 l-5,-5z`} fill="var(--panel)" stroke={c} strokeWidth={1.5}><title>mean {num(st.mean, 4)}</title></path>
            {st.outliers.map((o, k) => <circle key={k} cx={x(o)} cy={y} r={4} fill="none" stroke="var(--err)" strokeWidth={1.5}><title>outlier {o}</title></circle>)}
          </g>
        )
      })}
    </svg>
  )
}

function Histogram({ st, k, c }: { st: S; k: number; c: string }) {
  const bins = histogram(st.sorted, k)
  const W = 640, H = 240, L = 44, R = 10, T = 10, B = 28
  const w = bins[0].x1 - bins[0].x0
  const pdf = (v: number) => (st.n * w * Math.exp(-((v - st.mean) ** 2) / (2 * st.sdS ** 2))) / (st.sdS * Math.sqrt(2 * Math.PI))
  const top = Math.max(...bins.map((b) => b.n), pdf(st.mean) || 0) * 1.08
  const lo = bins[0].x0, hi = bins[bins.length - 1].x1
  const x = (v: number) => L + ((v - lo) / (hi - lo || 1)) * (W - L - R)
  const y = (v: number) => T + (1 - v / top) * (H - T - B)
  const curve = Number.isFinite(st.sdS) && st.sdS > 0 ? Array.from({ length: 81 }, (_, i) => { const v = lo + ((hi - lo) * i) / 80; return `${i ? 'L' : 'M'}${x(v).toFixed(1)},${y(pdf(v)).toFixed(1)}` }).join('') : ''
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img" aria-label="Histogram">
      {niceTicks(0, top, 4).map((t) => (
        <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={L - 6} y={y(t) + 4} fontSize={11} textAnchor="end" fill="var(--muted)">{t}</text></g>
      ))}
      {bins.map((b, i) => (
        <rect key={i} x={x(b.x0) + 1} y={y(b.n)} width={Math.max(1, x(b.x1) - x(b.x0) - 2)} height={y(0) - y(b.n)} fill={c} fillOpacity={0.7} rx={2}>
          <title>{`${num(b.x0, 4)} – ${num(b.x1, 4)}: ${b.n}`}</title>
        </rect>
      ))}
      {curve && <path d={curve} fill="none" stroke="var(--text, currentColor)" strokeWidth={1.8} strokeDasharray="5 3" />}
      {niceTicks(lo, hi, 6).map((t) => <text key={t} x={x(t)} y={H - 8} fontSize={11} textAnchor="middle" fill="var(--muted)">{num(t, 3)}</text>)}
    </svg>
  )
}

export default function DescriptiveStatisticsCalculator() {
  const [s, set, reset] = useToolState('descriptive-statistics-calculator', DEF)
  const series = useMemo(() => parseData(s.text), [s.text])
  const stats = useMemo(() => series.map((x) => ({ name: x.name, skipped: x.skipped, st: describe(x.values, s.qm, s.conf) })), [series, s.qm, s.conf])
  const pick = Math.min(s.pick, Math.max(0, stats.length - 1))
  const cur = stats[pick]
  const f = (v: number) => (Number.isFinite(v) ? num(v, s.dp) : '—')
  const rows = (st: S): [string, string, string][] => [
    ['Count (n)', String(st.n), ''], ['Sum', f(st.sum), ''], ['Mean', f(st.mean), 'arithmetic average'], ['Median', f(st.median), '50th percentile'],
    ['Mode', st.modes.length ? st.modes.slice(0, 5).map(f).join(', ') + (st.modes.length > 5 ? ' …' : '') : 'none', 'most frequent value(s)'],
    ['Minimum', f(st.min), ''], ['Maximum', f(st.max), ''], ['Range', f(st.range), 'max − min'],
    ['Q1 (25th pct)', f(st.q1), ''], ['Q3 (75th pct)', f(st.q3), ''], ['IQR', f(st.iqr), 'Q3 − Q1'],
    ['Variance (sample)', f(st.varS), 'n − 1 denominator'], ['Variance (population)', f(st.varP), 'n denominator'],
    ['Std deviation (sample)', f(st.sdS), 'STDEV.S'], ['Std deviation (population)', f(st.sdP), 'STDEV.P'],
    ['Standard error', f(st.se), 's / √n'], ['Coefficient of variation', Number.isFinite(st.cv) ? `${num(st.cv * 100, 2)} %` : '—', 's / mean'],
    [`${Math.round(s.conf * 100)} % CI of mean`, `${f(st.ci[0])} … ${f(st.ci[1])}`, 't distribution'],
    ['Skewness', f(st.skew), 'adjusted G1 (Excel SKEW)'], ['Excess kurtosis', f(st.kurt), 'G2 (Excel KURT)'],
    ['Median absolute deviation', f(st.mad), 'robust spread'], ['10 % trimmed mean', f(st.trim10), ''],
    ['Geometric mean', f(st.gmean), 'positive data only'], ['Harmonic mean', f(st.hmean), 'positive data only'],
  ]
  const pcts = [1, 5, 10, 25, 50, 75, 90, 95, 99]

  return (
    <Split wide="right">
      <div>
        <Panel title="Data" actions={<><Btn kind="ghost" onClick={() => set({ text: SAMPLE, pick: 0 })}>Sample</Btn><Btn kind="ghost" onClick={() => set({ text: '' })}>Clear</Btn></>}>
          <Area value={s.text} onChange={(text) => set({ text })} rows={14} mono placeholder={'Paste numbers separated by spaces, commas or lines,\nor CSV/TSV columns with a header row'} />
          <p className="muted" style={{ fontSize: 12 }}>
            {series.length ? `${series.length} series · ${series.reduce((a, x) => a + x.values.length, 0)} values` : 'No numbers found'}
            {series.some((x) => x.skipped) && ` · ${series.reduce((a, x) => a + x.skipped, 0)} non-numeric cells ignored`}
          </p>
        </Panel>
        <Panel title="Options">
          <Select label="Quartile method" value={s.qm} onChange={(qm) => set({ qm })} options={QMETHODS} />
          <Row>
            <Select label="Confidence" value={s.conf} onChange={(conf) => set({ conf })} options={[[0.9, '90 %'], [0.95, '95 %'], [0.99, '99 %']]} />
            <Select label="Decimals" value={s.dp} onChange={(dp) => set({ dp })} options={[2, 3, 4, 6]} />
          </Row>
          <Select label="Histogram bins" value={s.rule} onChange={(rule) => set({ rule })} options={[['sturges', 'Sturges'], ['fd', 'Freedman–Diaconis'], ['scott', 'Scott'], ['sqrt', 'Square root']]} />
          <p><Btn kind="ghost" onClick={reset}>Reset all</Btn></p>
        </Panel>
      </div>
      <div>
        {!cur ? <Note tone="warn">Paste some numbers to begin.</Note> : (
          <>
            {stats.length > 1 && <div style={{ marginBottom: 10 }}><Seg value={String(pick)} onChange={(v) => set({ pick: Number(v) })} options={stats.map((x, i) => [String(i), x.name] as const)} /></div>}
            <Stats>
              <Stat label="Mean" value={f(cur.st.mean)} sub={`± ${f(cur.st.ci[1] - cur.st.mean)} (${Math.round(s.conf * 100)} % CI)`} tone="accent" />
              <Stat label="Median" value={f(cur.st.median)} sub={`IQR ${f(cur.st.iqr)}`} />
              <Stat label="Std deviation" value={f(cur.st.sdS)} sub={`sample, n = ${cur.st.n}`} />
              <Stat label="Skewness" value={f(cur.st.skew)} sub={Math.abs(cur.st.skew) < 0.5 ? 'roughly symmetric' : cur.st.skew > 0 ? 'right-skewed' : 'left-skewed'} />
            </Stats>
            <Panel title={stats.length > 1 ? 'Box plots' : 'Box plot'}>
              <BoxPlot items={stats} />
              <p className="muted" style={{ fontSize: 12 }}>Box = Q1–Q3, thick line = median, ◇ = mean, whiskers to the furthest points within 1.5 × IQR, ○ = outliers.</p>
            </Panel>
            <Panel title={`Histogram: ${cur.name}`}>
              <Histogram st={cur.st} k={binCount(cur.st, s.rule)} c={color(pick)} />
              <p className="muted" style={{ fontSize: 12 }}>{binCount(cur.st, s.rule)} bins · dashed = normal curve with the same mean and SD.</p>
            </Panel>
            <Panel title={`Summary: ${cur.name}`} actions={<CopyButton label="Copy" text={() => rows(cur.st).map((r) => `${r[0]}\t${r[1]}`).join('\n')} />}>
              <Table head={['Statistic', 'Value', '']} rows={rows(cur.st).map((r) => [r[0], <b key="v">{r[1]}</b>, <span key="n" className="muted">{r[2]}</span>])} />
            </Panel>
            <Panel title="Percentiles & checks">
              <Table head={['Percentile', ...pcts.map((p) => `P${p}`)]} rows={[[cur.name, ...pcts.map((p) => f(quantile(cur.st.sorted, p / 100, s.qm === 'tukey' ? 'r7' : s.qm)))]]} />
              {cur.st.outliers.length ? (
                <Note tone="warn">{cur.st.outliers.length} outlier(s) outside [{f(cur.st.fences[0])}, {f(cur.st.fences[1])}]: {cur.st.outliers.slice(0, 12).map(f).join(', ')}</Note>
              ) : <Note tone="ok">No outliers by the 1.5 × IQR rule.</Note>}
              <Note tone={cur.st.jbP < 0.05 ? 'warn' : 'info'}>
                Jarque–Bera normality test: JB = {num(cur.st.jb, 3)}, p ≈ {num(cur.st.jbP, 4)} ({cur.st.jbP < 0.05 ? 'evidence against normality' : 'no evidence against normality'}). Asymptotic, so treat it as rough for n &lt; 50.
              </Note>
            </Panel>
            {stats.length > 1 && (
              <Panel title="Compare series" actions={<CsvButton name="descriptive-stats.csv" rows={() => [['Statistic', ...stats.map((x) => x.name)], ...rows(stats[0].st).map((r, i) => [r[0], ...stats.map((x) => rows(x.st)[i][1])])]} />}>
                <Table head={['Statistic', ...stats.map((x) => x.name)]} rows={rows(stats[0].st).filter((_, i) => [0, 2, 3, 5, 6, 8, 9, 13, 15, 17, 18].includes(i)).map((r) => [r[0], ...stats.map((x) => rows(x.st).find((y) => y[0] === r[0])![1])])} />
              </Panel>
            )}
          </>
        )}
      </div>
    </Split>
  )
}
