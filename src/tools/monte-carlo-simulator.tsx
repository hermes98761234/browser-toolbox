import { useEffect, useRef, useState } from 'react'
import { Bar, Btn, CsvButton, JsonButtons, LineChart, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, num, pct, useToolState } from '../kit'
import { DIST_PARAMS, validate, type DistKind, type Input, type Summary } from './lib/monte-carlo-simulator'

type Result = Omit<Summary, 'sorted'> & { cdf: [number, number][] }

interface State {
  expr: string
  outName: string
  inputs: Input[]
  n: number
  seed: number
  threshold: number
}

const EXAMPLES: Record<string, Omit<State, 'n' | 'seed'>> = {
  'Product launch profit': {
    expr: 'units * (price - unitCost) - fixed',
    outName: 'Profit ($)',
    threshold: 0,
    inputs: [
      { name: 'units', dist: 'triangular', a: 8000, b: 12000, c: 15000 },
      { name: 'price', dist: 'normal', a: 25, b: 2, c: 0 },
      { name: 'unitCost', dist: 'pert', a: 12, b: 14, c: 19 },
      { name: 'fixed', dist: 'uniform', a: 60000, b: 80000, c: 0 },
    ],
  },
  'Project duration (3 tasks)': {
    expr: 'design + build + max(test, docs)',
    outName: 'Days',
    threshold: 60,
    inputs: [
      { name: 'design', dist: 'pert', a: 8, b: 10, c: 18 },
      { name: 'build', dist: 'pert', a: 20, b: 25, c: 40 },
      { name: 'test', dist: 'triangular', a: 6, b: 8, c: 15 },
      { name: 'docs', dist: 'uniform', a: 5, b: 12, c: 0 },
    ],
  },
  'Retirement pot (20 years)': {
    expr: 'save * ((1 + r)^20 - 1) / r',
    outName: 'Pot ($)',
    threshold: 400000,
    inputs: [
      { name: 'save', dist: 'normal', a: 12000, b: 1500, c: 0 },
      { name: 'r', dist: 'normal', a: 0.05, b: 0.02, c: 0 },
    ],
  },
}

const DEF: State = { ...EXAMPLES['Product launch profit'], n: 50000, seed: 1 }
const DISTS: [DistKind, string][] = [['normal', 'Normal'], ['uniform', 'Uniform'], ['triangular', 'Triangular'], ['pert', 'PERT'], ['lognormal', 'Lognormal'], ['const', 'Constant']]
const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/
const RESERVED = new Set(['pi', 'e', 'tau', 'phi', 'sin', 'cos', 'tan', 'exp', 'ln', 'log', 'sqrt', 'abs', 'min', 'max', 'pow', 'mod', 'round', 'floor', 'ceil'])

function Histogram({ r, threshold }: { r: Result; threshold: number }) {
  const W = 640, H = 220, L = 10, B = 26
  const max = Math.max(...r.hist.map((h) => h.count), 1)
  const x0 = r.hist[0].x0, x1 = r.hist[r.hist.length - 1].x1
  const X = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (W - 2 * L)
  const lines: [string, number, string][] = [['P5', r.pct.P5, '#f97316'], ['P50', r.pct.P50, '#10b981'], ['P95', r.pct.P95, '#f97316']]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img" aria-label="histogram">
      {r.hist.map((h, i) => (
        <rect key={i} x={X(h.x0) + 0.5} width={Math.max(0.5, X(h.x1) - X(h.x0) - 1)} y={H - B - (h.count / max) * (H - B - 18)} height={(h.count / max) * (H - B - 18)} fill={h.x1 <= threshold ? '#ef4444' : 'var(--accent)'} opacity={0.8}>
          <title>{`${num(h.x0, 2)} … ${num(h.x1, 2)}: ${h.count}`}</title>
        </rect>
      ))}
      {lines.map(([n, v, c]) => (
        <g key={n}>
          <line x1={X(v)} x2={X(v)} y1={12} y2={H - B} stroke={c} strokeDasharray="4 3" strokeWidth={1.5} />
          <text x={X(v)} y={10} fontSize={11} textAnchor="middle" fill={c}>{n}</text>
        </g>
      ))}
      {[x0, (x0 + x1) / 2, x1].map((v, i) => (
        <text key={i} x={i === 0 ? L : i === 1 ? W / 2 : W - L} y={H - 6} fontSize={11} fill="var(--muted)" textAnchor={i === 0 ? 'start' : i === 1 ? 'middle' : 'end'}>{num(v, Math.abs(v) >= 1000 ? 0 : 2)}</text>
      ))}
    </svg>
  )
}

function Tornado({ r }: { r: Result }) {
  const rows = r.tornado.filter((t) => Number.isFinite(t.lo) && Number.isFinite(t.hi))
  const all = rows.flatMap((t) => [t.lo, t.hi]).concat(r.base)
  const lo = Math.min(...all), hi = Math.max(...all)
  const W = 640, rowH = 30, N = 100, PAD = 70, H = rows.length * rowH + 24
  const X = (v: number) => N + PAD + ((v - lo) / (hi - lo || 1)) * (W - N - 2 * PAD)
  const f = (v: number) => num(v, Math.abs(v) >= 1000 ? 0 : 2)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%' }} role="img" aria-label="tornado chart">
      {rows.map((t, i) => {
        const y = 4 + i * rowH
        const a = Math.min(t.lo, t.hi, r.base), b = Math.max(t.lo, t.hi, r.base)
        return (
          <g key={t.name}>
            <text x={N - 8} y={y + 18} fontSize={12} textAnchor="end" fill="var(--text)">{t.name}</text>
            <rect x={X(Math.min(t.lo, r.base))} y={y + 4} width={Math.abs(X(t.lo) - X(r.base))} height={rowH - 8} fill="#ef4444" opacity={0.75} rx={3} />
            <rect x={X(Math.min(t.hi, r.base))} y={y + 4} width={Math.abs(X(t.hi) - X(r.base))} height={rowH - 8} fill="#10b981" opacity={0.75} rx={3} />
            <text x={X(a) - 4} y={y + 18} fontSize={10} textAnchor="end" fill="var(--muted)">{f(a)}</text>
            <text x={X(b) + 4} y={y + 18} fontSize={10} fill="var(--muted)">{f(b)}</text>
          </g>
        )
      })}
      <line x1={X(r.base)} x2={X(r.base)} y1={0} y2={H - 18} stroke="var(--text)" />
      <text x={X(r.base)} y={H - 4} fontSize={11} textAnchor="middle" fill="var(--text)">base {f(r.base)}</text>
    </svg>
  )
}

export default function MonteCarloSimulator() {
  const [s, set, reset] = useToolState('monte-carlo-simulator', DEF)
  const [res, setRes] = useState<{ r?: Result; error?: string; ms?: number; busy: boolean }>({ busy: true })
  const worker = useRef<Worker | null>(null)
  const reqId = useRef(0)

  const nameErr = s.inputs.map((i, k) => (!NAME_RE.test(i.name) ? 'invalid name' : RESERVED.has(i.name) ? 'reserved name' : s.inputs.findIndex((j) => j.name === i.name) !== k ? 'duplicate' : validate(i)))
  const hasErr = nameErr.some(Boolean)

  useEffect(() => {
    const w = new Worker(new URL('./lib/monte-carlo-simulator.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: Result; error?: string; ms?: number }>) => {
      if (e.data.id !== reqId.current) return
      setRes(e.data.ok ? { r: e.data.result, ms: e.data.ms, busy: false } : { error: e.data.error, busy: false })
    }
    worker.current = w
    return () => w.terminate()
  }, [])

  useEffect(() => {
    if (hasErr) return
    const t = setTimeout(() => {
      const id = ++reqId.current
      setRes((p) => ({ ...p, busy: true }))
      worker.current?.postMessage({ id, expr: s.expr, inputs: s.inputs, n: s.n, seed: s.seed, threshold: s.threshold })
    }, 250)
    return () => clearTimeout(t)
  }, [s.expr, s.inputs, s.n, s.seed, s.threshold, hasErr])

  const edit = (k: number, p: Partial<Input>) => set({ inputs: s.inputs.map((x, i) => (i === k ? { ...x, ...p } : x)) })
  const r = res.r
  const P = (v: number) => num(v, Math.abs(v) >= 1000 ? 0 : 3)

  return (
    <Split>
      <div>
        <Panel title="Model" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Example" value="" onChange={(k) => k && set({ ...EXAMPLES[k] })} options={[['', 'Load an example…'], ...Object.keys(EXAMPLES).map((k) => [k, k] as [string, string])]} />
          <Txt label="Output formula" value={s.expr} onChange={(expr) => set({ expr })} hint="Use input names with + − × ÷ ^ and functions like min, max, sqrt, exp, ln, abs." />
          <Row>
            <Txt label="Output name" value={s.outName} onChange={(outName) => set({ outName })} />
            <Num label="Risk threshold" value={s.threshold} onChange={(threshold) => set({ threshold })} hint="P(output < threshold)" />
          </Row>
        </Panel>
        <Panel title="Uncertain inputs" actions={<Btn onClick={() => set({ inputs: [...s.inputs, { name: `x${s.inputs.length + 1}`, dist: 'normal', a: 0, b: 1, c: 0 }] })}>+ Input</Btn>}>
          {s.inputs.map((inp, k) => {
            const labels = DIST_PARAMS[inp.dist]
            return (
              <div key={k} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8, marginBottom: 8 }}>
                <Row>
                  <Txt label="Name" value={inp.name} onChange={(name) => edit(k, { name })} />
                  <Select label="Distribution" value={inp.dist} onChange={(dist) => edit(k, { dist })} options={DISTS} />
                  <Btn kind="ghost" onClick={() => set({ inputs: s.inputs.filter((_, i) => i !== k) })} title="Remove">✕</Btn>
                </Row>
                <Row>
                  <Num label={labels[0]} value={inp.a} onChange={(a) => edit(k, { a })} />
                  {labels[1] && <Num label={labels[1]} value={inp.b} onChange={(b) => edit(k, { b })} />}
                  {labels[2] && <Num label={labels[2]} value={inp.c} onChange={(c) => edit(k, { c })} />}
                </Row>
                {nameErr[k] && <Note tone="err">{inp.name}: {nameErr[k]}</Note>}
              </div>
            )
          })}
        </Panel>
        <Panel title="Simulation">
          <Row>
            <Select label="Iterations" value={s.n} onChange={(n) => set({ n })} options={[[1000, '1,000'], [10000, '10,000'], [50000, '50,000'], [200000, '200,000'], [1000000, '1,000,000']]} />
            <Num label="Random seed" value={s.seed} onChange={(seed) => set({ seed: Math.round(seed) })} step={1} />
          </Row>
          <Row>
            <Btn onClick={() => set({ seed: Math.floor(Math.random() * 1e6) })}>🎲 New seed</Btn>
            <JsonButtons name="monte-carlo-model.json" data={s} onLoad={(d) => set(d)} />
          </Row>
        </Panel>
      </div>
      <div>
        {res.error && <Note tone="err">Formula error: {res.error}</Note>}
        {hasErr && <Note tone="warn">Fix the highlighted inputs to run the simulation.</Note>}
        {r && (
          <>
            <Stats>
              <Stat label={`Mean ${s.outName}`} value={P(r.mean)} sub={`σ = ${P(r.sd)}`} tone="accent" />
              <Stat label="P5 – P95" value={`${P(r.pct.P5)} – ${P(r.pct.P95)}`} sub="90 % interval" />
              <Stat label={`P(< ${num(s.threshold)})`} value={pct(r.pBelow, 1)} tone={r.pBelow > 0.2 ? 'bad' : 'good'} />
              <Stat label="Runs" value={num(r.valid, 0)} sub={`${res.busy ? 'running…' : `${num(res.ms ?? 0, 0)} ms in a Web Worker`}`} />
            </Stats>
            {r.valid < r.n && <Note tone="warn">{num(r.n - r.valid, 0)} runs produced an undefined result (e.g. division by zero) and were ignored.</Note>}
            <Panel title={`Distribution of ${s.outName}`}>
              <Histogram r={r} threshold={s.threshold} />
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>Red bars fall below the risk threshold.</p>
            </Panel>
            <Panel title="Sensitivity tornado (each input P10 → P90, others at median)">
              <Tornado r={r} />
              <Table head={['Input', 'Rank correlation with output', '']} rows={r.spearman.map((x) => [x.name, num(x.rho, 3), <div key="b" style={{ minWidth: 120 }}><Bar value={Math.abs(x.rho)} max={1} color={x.rho < 0 ? '#ef4444' : '#10b981'} /></div>])} />
            </Panel>
            <Panel title="Percentiles & cumulative probability" actions={<CsvButton name="monte-carlo-percentiles.csv" rows={() => [['Percentile', s.outName], ...Object.entries(r.pct).map(([k, v]) => [k, v])]} />}>
              <Table head={Object.keys(r.pct)} rows={[Object.values(r.pct).map((v) => P(v))]} />
              <LineChart series={[{ name: 'P(output ≤ x)', points: r.cdf }]} fy={(v) => pct(v, 0)} fx={(v) => num(v, 2)} yMin={0} yMax={1} height={200} xLabel={s.outName} />
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
