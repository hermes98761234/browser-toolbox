import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, CsvButton, LineChart, niceTicks, Note, num, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { between, DISTS, plotRange, quantile } from './lib/distribution-explorer'

type Mode = 'below' | 'above' | 'between' | 'outside'
const DEF = {
  dist: 'normal',
  params: Object.fromEntries(DISTS.map((d) => [d.id, d.params.map((p) => p.def)])) as Record<string, number[]>,
  mode: 'between' as Mode,
  a: -1,
  b: 1,
  q: 0.95,
  n: 1000,
}
const fmt = (x: number, d = 4) => (Number.isFinite(x) ? (Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-4 && x !== 0) ? x.toExponential(3) : num(x, d)) : x === Infinity ? '∞' : '—')

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export default function DistributionExplorer() {
  const [s, set, reset] = useToolState('distribution-explorer', DEF)
  const [seed, setSeed] = useState(1)
  const [showSample, setShowSample] = useState(false)
  const d = DISTS.find((x) => x.id === s.dist) ?? DISTS[0]
  const p = useMemo(() => (s.params[d.id] ?? d.params.map((x) => x.def)).map((v, i) => v ?? d.params[i].def), [s.params, d])
  const valid = d.id === 'uniform' ? p[1] > p[0] : d.id === 'hyper' ? p[1] <= p[0] && p[2] <= p[0] : true
  const setP = (i: number, v: number) => set({ params: { ...s.params, [d.id]: p.map((x, j) => (j === i ? v : x)) } })
  const [x0, x1] = valid ? plotRange(d, p) : [0, 1]
  const lo = Math.min(s.a, s.b), hi = Math.max(s.a, s.b)
  const prob = !valid ? NaN : s.mode === 'below' ? between(d, p, -Infinity, s.a) : s.mode === 'above' ? (d.discrete ? 1 - d.cdf(Math.ceil(s.a) - 1, p) : 1 - d.cdf(s.a, p)) : s.mode === 'between' ? between(d, p, lo, hi) : 1 - between(d, p, lo, hi)
  const inShade = (x: number) => (s.mode === 'below' ? x <= s.a : s.mode === 'above' ? x >= s.a : s.mode === 'between' ? x >= lo && x <= hi : x < lo || x > hi)
  const mean = valid ? d.mean(p) : NaN, variance = valid ? d.variance(p) : NaN
  const median0 = valid ? quantile(d, p, 0.5) : NaN
  const median = Math.abs(median0) < 1e-9 * (Math.sqrt(variance) || 1) ? 0 : median0
  const qx = valid ? quantile(d, p, s.q) : NaN

  const curve = useMemo(() => {
    if (!valid) return []
    if (d.discrete) {
      const out: [number, number][] = []
      for (let k = Math.ceil(x0); k <= Math.floor(x1) && out.length < 600; k++) out.push([k, d.pdf(k, p)])
      return out
    }
    return Array.from({ length: 401 }, (_, i) => {
      const x = x0 + ((x1 - x0) * i) / 400
      const y = d.pdf(x, p)
      return [x, Number.isFinite(y) ? y : 0] as [number, number]
    })
  }, [d, p, x0, x1, valid])
  const sample = useMemo(() => {
    if (!showSample || !valid) return null
    const r = rng(seed)
    const xs = Array.from({ length: s.n }, () => quantile(d, p, Math.min(1 - 1e-12, Math.max(1e-12, r()))))
    const m = xs.reduce((a, b) => a + b, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1))
    return { xs, m, sd }
  }, [showSample, valid, seed, s.n, d, p])

  const [ref, W] = useWidth()
  const H = 300, L = 54, R = 14, T = 14, B = 34
  const ymaxCurve = Math.max(...curve.map((c) => c[1]), 1e-12)
  // histogram in density units
  const bins = useMemo(() => {
    if (!sample) return []
    const nb = d.discrete ? Math.min(200, Math.floor(x1) - Math.ceil(x0) + 1) : 40
    const out = new Array(Math.max(1, nb)).fill(0)
    for (const x of sample.xs) {
      const i = d.discrete ? Math.round(x) - Math.ceil(x0) : Math.floor(((x - x0) / (x1 - x0)) * nb)
      if (i >= 0 && i < nb) out[i]++
    }
    const w = d.discrete ? 1 : (x1 - x0) / nb
    return out.map((c) => c / sample.xs.length / w)
  }, [sample, d, x0, x1])
  const ymax = Math.min(Math.max(ymaxCurve, ...bins) * 1.08, ymaxCurve * 3)
  const sx = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R)
  const sy = (y: number) => T + (1 - Math.min(y, ymax) / ymax) * (H - T - B)
  const xt = niceTicks(x0, x1, Math.max(3, Math.floor(W / 80))).filter((v) => v >= x0 && v <= x1)
  const yt = niceTicks(0, ymax, 4).filter((v) => v <= ymax)
  const bw = d.discrete ? Math.max(1, ((W - L - R) / Math.max(1, x1 - x0 + 1)) * 0.8) : 0

  let shadePath = ''
  if (!d.discrete && curve.length) {
    let open = false
    for (const [x, y] of curve) {
      if (inShade(x)) {
        shadePath += open ? `L${sx(x)},${sy(y)}` : `M${sx(x)},${sy(0)}L${sx(x)},${sy(y)}`
        open = true
      } else if (open) {
        shadePath += `L${sx(x)},${sy(0)}Z`
        open = false
      }
    }
    if (open) shadePath += `L${sx(curve[curve.length - 1][0])},${sy(0)}Z`
  }
  const cdfSeries = valid ? [{ name: 'CDF', points: d.discrete ? curve.flatMap(([k]) => [[k, d.cdf(k - 1, p)], [k, d.cdf(k, p)]] as [number, number][]) : curve.map(([x]) => [x, d.cdf(x, p)] as [number, number]) }] : []
  const groups = [['Continuous', DISTS.filter((x) => !x.discrete)], ['Discrete', DISTS.filter((x) => x.discrete)]] as const

  return (
    <Split>
      <div>
        <Panel title="Distribution" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <label className="k-field">
            <span className="k-label">Family</span>
            <select className="k-select" value={d.id} onChange={(e) => {
              const nd = DISTS.find((x) => x.id === e.target.value)!
              const pp = s.params[nd.id] ?? nd.params.map((x) => x.def)
              const m = nd.mean(pp), sd = Math.sqrt(nd.variance(pp))
              const ok = Number.isFinite(m) && Number.isFinite(sd)
              set({ dist: nd.id, a: ok ? +(nd.discrete ? Math.round(m - sd) : m - sd).toFixed(2) : -1, b: ok ? +(nd.discrete ? Math.round(m + sd) : m + sd).toFixed(2) : 1 })
            }}>
              {groups.map(([g, list]) => (
                <optgroup key={g} label={g}>{list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
              ))}
            </select>
          </label>
          {d.params.map((q, i) => (
            <Slider key={q.key} label={q.label} value={p[i]} min={q.min} max={q.max} step={q.step} onChange={(v) => setP(i, q.int ? Math.round(v) : v)} show={(v) => (q.int ? String(v) : num(v, 3))} />
          ))}
          {!valid && <Note tone="err">{d.id === 'uniform' ? 'Upper bound must exceed the lower bound.' : 'K and n cannot exceed N.'}</Note>}
          <p className="k-hint" style={{ margin: 0 }}><code>{d.formula}</code> — {d.note}</p>
        </Panel>
        <Panel title="Probability">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['below', 'P(X ≤ a)'], ['above', 'P(X ≥ a)'], ['between', 'a ≤ X ≤ b'], ['outside', 'Outside']]} label="Region" />
          <Row>
            <Num label="a" value={s.a} step={d.discrete ? 1 : 'any'} onChange={(a) => set({ a })} />
            {(s.mode === 'between' || s.mode === 'outside') && <Num label="b" value={s.b} step={d.discrete ? 1 : 'any'} onChange={(b) => set({ b })} />}
          </Row>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--accent)' }}>{fmt(prob, 6)}</div>
          <p className="muted" style={{ margin: '2px 0 0' }}>{Number.isFinite(prob) ? `${num(prob * 100, 3)}% · about 1 in ${prob > 0 ? num(1 / prob, prob < 0.01 ? 0 : 2) : '∞'}` : ''}{d.discrete && ' · discrete: endpoints included'}</p>
        </Panel>
        <Panel title="Inverse (quantile)">
          <Row>
            <Num label="Cumulative probability p" value={s.q} min={0} max={1} onChange={(q) => q >= 0 && q <= 1 && set({ q })} />
            <Select label="Presets" value={String(s.q)} onChange={(v: string) => set({ q: Number(v) })} options={['0.5', '0.9', '0.95', '0.975', '0.99', '0.995'].map((v) => [v, v] as [string, string])} />
          </Row>
          <p style={{ margin: 0 }}>x such that P(X ≤ x) {d.discrete ? '≥' : '='} {s.q}: <b style={{ fontSize: 20 }}>{fmt(qx, 6)}</b></p>
          {!d.discrete && valid && <p className="muted" style={{ margin: '4px 0 0' }}>Two-sided {num(s.q * 100, 2)}% interval: [{fmt(quantile(d, p, (1 - s.q) / 2))}, {fmt(quantile(d, p, (1 + s.q) / 2))}]</p>}
          <Row>
            <Btn onClick={() => set({ mode: 'below', a: +qx.toFixed(6) })}>Shade P(X ≤ x)</Btn>
            {!d.discrete && <Btn onClick={() => set({ mode: 'between', a: +quantile(d, p, (1 - s.q) / 2).toFixed(6), b: +quantile(d, p, (1 + s.q) / 2).toFixed(6) })}>Shade central {num(s.q * 100, 1)}%</Btn>}
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Mean" value={fmt(mean)} />
          <Stat label="Std deviation" value={fmt(Math.sqrt(variance))} sub={`variance ${fmt(variance)}`} />
          <Stat label="Median" value={fmt(median)} />
          <Stat label="Shaded probability" value={fmt(prob, 4)} tone="accent" />
        </Stats>
        <Panel title={`${d.name} ${d.discrete ? 'PMF' : 'PDF'}`} actions={<>
          <Btn onClick={() => setShowSample(!showSample)}>{showSample ? 'Hide sample' : '🎲 Simulate'}</Btn>
          <CsvButton name={`${d.id}-pdf.csv`} rows={() => [['x', d.discrete ? 'pmf' : 'pdf', 'cdf'], ...curve.map(([x, y]) => [x, y, d.cdf(x, p)])]} />
        </>}>
          <div ref={ref} className="k-chart">
            {valid && (
              <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="density chart">
                {yt.map((v) => (
                  <g key={v}>
                    <line className="grid" x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} />
                    <text x={L - 6} y={sy(v) + 4} textAnchor="end">{fmt(v, 3)}</text>
                  </g>
                ))}
                {xt.map((v) => <text key={v} x={sx(v)} y={H - B + 16} textAnchor="middle">{fmt(v, 3)}</text>)}
                {sample && bins.map((c, i) => {
                  const bx0 = d.discrete ? Math.ceil(x0) + i - 0.5 : x0 + (i * (x1 - x0)) / bins.length
                  const bx1 = d.discrete ? bx0 + 1 : x0 + ((i + 1) * (x1 - x0)) / bins.length
                  return <rect key={i} x={sx(bx0)} y={sy(c)} width={Math.max(0.5, sx(bx1) - sx(bx0) - 1)} height={sy(0) - sy(c)} fill="var(--accent2)" opacity={0.25} />
                })}
                {d.discrete
                  ? curve.map(([k, y]) => <rect key={k} x={sx(k) - bw / 2} y={sy(y)} width={bw} height={Math.max(0, sy(0) - sy(y))} rx={Math.min(3, bw / 4)} fill={inShade(k) ? 'var(--accent)' : 'var(--grid-strong)'}><title>{`P(X = ${k}) = ${fmt(y, 6)}`}</title></rect>)
                  : (
                    <>
                      <path d={shadePath} fill="var(--accent)" opacity={0.28} />
                      <path d={curve.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join('')} fill="none" stroke="var(--accent)" strokeWidth={2.4} />
                    </>
                  )}
                <line className="axis" x1={L} x2={W - R} y1={sy(0)} y2={sy(0)} />
                {[s.a, ...(s.mode === 'between' || s.mode === 'outside' ? [s.b] : [])].filter((v) => v >= x0 && v <= x1).map((v, i) => (
                  <g key={i}>
                    <line x1={sx(v)} x2={sx(v)} y1={T} y2={H - B} stroke="var(--err)" strokeDasharray="5 4" />
                    <text x={sx(v) + 4} y={T + 12} className="lbl" style={{ fill: 'var(--err)' }}>{i ? 'b' : 'a'} = {fmt(v, 3)}</text>
                  </g>
                ))}
                {Number.isFinite(mean) && mean >= x0 && mean <= x1 && <line x1={sx(mean)} x2={sx(mean)} y1={sy(0)} y2={sy(0) + 6} stroke="var(--fg)" strokeWidth={2} />}
              </svg>
            )}
          </div>
          {sample && (
            <Row>
              <span className="muted">{s.n} draws (inverse-CDF sampling): sample mean <b>{fmt(sample.m)}</b>, sd <b>{fmt(sample.sd)}</b> vs theoretical {fmt(mean)} / {fmt(Math.sqrt(variance))}</span>
              <Select label="" value={s.n} onChange={(n: number) => set({ n })} options={[[100, '100'], [1000, '1,000'], [5000, '5,000']]} />
              <Btn onClick={() => setSeed(seed + 1)}>↻ Resample</Btn>
            </Row>
          )}
        </Panel>
        <Panel title="Cumulative distribution F(x) = P(X ≤ x)">
          <LineChart series={cdfSeries} height={200} yMin={0} yMax={1} fx={(v) => fmt(v, 3)} fy={(v) => num(v, 2)} markers={Number.isFinite(qx) && qx >= x0 && qx <= x1 ? [{ x: qx, label: `q(${s.q})` }] : []} />
        </Panel>
      </div>
    </Split>
  )
}
