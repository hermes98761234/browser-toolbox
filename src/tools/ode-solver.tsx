import { useMemo, type MouseEvent } from 'react'
import { Btn, Check, color, CsvButton, LineChart, Note, num, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { buildSystem, dopri45, PRESETS, resample, rosenbrock23, type Eq, type Param, type Sys } from './lib/ode-solver'

interface State {
  preset: string
  eqs: Eq[]
  params: Param[]
  t0: number
  t1: number
  method: 'rk45' | 'implicit'
  rtol: number
  px: [number, number]
  field: boolean
  seeds: [number, number][]
}

const fromPreset = (id: string): State => {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0]
  return { preset: p.id, eqs: p.eqs.map((e) => ({ ...e })), params: p.params.map((q) => ({ ...q })), t0: 0, t1: p.t1, method: p.method, rtol: 1e-6, px: p.px ?? [0, 1], field: true, seeds: [] }
}
const DEF = fromPreset('lv')

function timed<T>(fn: () => T): [T, number] {
  const t0 = performance.now()
  const r = fn()
  return [r, performance.now() - t0]
}

function solve(f: Sys, s: State, y0: number[]) {
  const o = { rtol: s.rtol, atol: s.rtol * 1e-3, maxSteps: 60000 }
  return s.method === 'rk45' ? dopri45(f, s.t0, y0, s.t1, o) : rosenbrock23(f, s.t0, y0, s.t1, o)
}

function Phase({ names, px, main, extra, f, s, onClick }: {
  names: string[]; px: [number, number]; main: number[][]; extra: number[][][]; f: Sys | null; s: State; onClick: (x: number, y: number) => void
}) {
  const W = 640, H = 440, L = 52, R = 14, T = 14, B = 40
  const [i, j] = px
  const all = [main, ...extra].flat().filter((p) => Number.isFinite(p[i]) && Number.isFinite(p[j]))
  let x0 = Math.min(...all.map((p) => p[i])), x1 = Math.max(...all.map((p) => p[i]))
  let y0 = Math.min(...all.map((p) => p[j])), y1 = Math.max(...all.map((p) => p[j]))
  if (!(x1 > x0)) { x0 -= 1; x1 += 1 }
  if (!(y1 > y0)) { y0 -= 1; y1 += 1 }
  const padX = (x1 - x0) * 0.08, padY = (y1 - y0) * 0.08
  x0 -= padX; x1 += padX; y0 -= padY; y1 += padY
  const sx = (x: number) => L + ((x - x0) / (x1 - x0)) * (W - L - R)
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B)
  const path = (pts: number[][]) => pts.filter((p) => Number.isFinite(p[i]) && Number.isFinite(p[j])).map((p, k) => `${k ? 'L' : 'M'}${sx(p[i]).toFixed(1)},${sy(p[j]).toFixed(1)}`).join('')
  const arrows: { x: number; y: number; dx: number; dy: number; m: number }[] = []
  if (f && s.field && names.length === 2) {
    for (let a = 0; a < 22; a++) for (let b = 0; b < 15; b++) {
      const x = x0 + ((a + 0.5) / 22) * (x1 - x0), y = y0 + ((b + 0.5) / 15) * (y1 - y0)
      const yv = [0, 0]
      yv[i] = x; yv[j] = y
      const d = f(s.t0, yv)
      const dx = d[i] / (x1 - x0) * (W - L - R), dy = -d[j] / (y1 - y0) * (H - T - B)
      const m = Math.hypot(dx, dy)
      if (Number.isFinite(m) && m > 0) arrows.push({ x: sx(x), y: sy(y), dx: dx / m, dy: dy / m, m: Math.hypot(d[i], d[j]) })
    }
  }
  const mmax = Math.max(1e-12, ...arrows.map((a) => a.m))
  const click = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px_ = ((e.clientX - r.left) / r.width) * W, py_ = ((e.clientY - r.top) / r.height) * H
    onClick(x0 + ((px_ - L) / (W - L - R)) * (x1 - x0), y0 + (1 - (py_ - T) / (H - T - B)) * (y1 - y0))
  }
  const ticks = (a: number, b: number) => Array.from({ length: 6 }, (_, k) => a + ((b - a) * k) / 5)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', cursor: names.length === 2 ? 'crosshair' : 'default', display: 'block' }} onClick={names.length === 2 ? click : undefined} role="img" aria-label="phase portrait">
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="none" stroke="var(--line)" />
      {ticks(x0, x1).map((v) => <text key={`x${v}`} x={sx(v)} y={H - B + 16} fontSize={11} textAnchor="middle" fill="var(--muted)">{num(v, 2)}</text>)}
      {ticks(y0, y1).map((v) => <text key={`y${v}`} x={L - 6} y={sy(v) + 4} fontSize={11} textAnchor="end" fill="var(--muted)">{num(v, 2)}</text>)}
      <text x={(L + W - R) / 2} y={H - 6} fontSize={12} textAnchor="middle" fill="var(--text, currentColor)">{names[i]}</text>
      <text x={14} y={T + 10} fontSize={12} fill="var(--text, currentColor)">{names[j]}</text>
      {arrows.map((a, k) => {
        const len = 9, t = Math.log1p((a.m / mmax) * 50) / Math.log(51)
        const ex = a.x + a.dx * len, ey = a.y + a.dy * len
        return (
          <g key={k} stroke={`hsl(${220 - 200 * t} 70% 55%)`} strokeWidth={1.3} opacity={0.75}>
            <line x1={a.x - a.dx * len} y1={a.y - a.dy * len} x2={ex} y2={ey} />
            <polyline fill="none" points={`${ex - 4 * a.dx + 2.5 * a.dy},${ey - 4 * a.dy - 2.5 * a.dx} ${ex},${ey} ${ex - 4 * a.dx - 2.5 * a.dy},${ey - 4 * a.dy + 2.5 * a.dx}`} />
          </g>
        )
      })}
      {extra.map((p, k) => <path key={k} d={path(p)} fill="none" stroke={color(k + 2)} strokeWidth={1.6} opacity={0.9} />)}
      <path d={path(main)} fill="none" stroke="var(--accent)" strokeWidth={2.4} />
      {main[0] && <circle cx={sx(main[0][i])} cy={sy(main[0][j])} r={4.5} fill="var(--accent)" />}
      {extra.map((p, k) => p[0] && <circle key={k} cx={sx(p[0][i])} cy={sy(p[0][j])} r={3.5} fill={color(k + 2)} />)}
    </svg>
  )
}

export default function OdeSolver() {
  const [s, set, reset] = useToolState('ode-solver', DEF)
  const res = useMemo(() => {
    try {
      const { f, names } = buildSystem(s.eqs, s.params)
      if (!(s.t1 !== s.t0)) throw new Error('t end must differ from t start')
      const [sol, ms] = timed(() => solve(f, s, s.eqs.map((e) => e.y0)))
      const out = resample(sol, 500)
      const extra = names.length === 2 ? s.seeds.map((p) => {
        const y = [0, 0]
        y[s.px[0]] = p[0]; y[s.px[1]] = p[1]
        return resample(solve(f, s, y), 300).y
      }) : []
      return { f, names, sol, out, ms, extra, err: '' }
    } catch (e) {
      return { err: (e as Error).message }
    }
  }, [s])
  const edit = (i: number, p: Partial<Eq>) => set({ eqs: s.eqs.map((e, k) => (k === i ? { ...e, ...p } : e)) })
  const editP = (i: number, p: Partial<Param>) => set({ params: s.params.map((e, k) => (k === i ? { ...e, ...p } : e)) })
  const preset = PRESETS.find((p) => p.id === s.preset)
  const n = s.eqs.length
  const px: [number, number] = [Math.min(s.px[0], n - 1), Math.min(s.px[1], n - 1)]

  return (
    <Split>
      <div>
        <Panel title="System" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Example" value={s.preset} onChange={(id) => set(fromPreset(id))} options={[...PRESETS.map((p) => [p.id, p.name] as [string, string]), ['custom', 'Custom']]} />
          {preset && <p className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>{preset.note}</p>}
          {s.eqs.map((e, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr) 70px 32px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <input className="k-text mono" value={`${e.name}'`} aria-label="variable" onChange={(ev) => edit(i, { name: ev.target.value.replace(/'/g, '') })} />
              <input className="k-text mono" value={e.expr} aria-label={`${e.name}' expression`} onChange={(ev) => { edit(i, { expr: ev.target.value }); if (s.preset !== 'custom') set({ preset: 'custom' }) }} />
              <input className="k-text mono" type="number" value={e.y0} title="initial value" aria-label={`${e.name}(t0)`} onChange={(ev) => edit(i, { y0: Number(ev.target.value) })} />
              <Btn kind="ghost" onClick={() => set({ eqs: s.eqs.filter((_, k) => k !== i), seeds: [] })} disabled={s.eqs.length <= 1}>✕</Btn>
            </div>
          ))}
          <div className="muted" style={{ fontSize: 12, display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr) 70px 32px', gap: 6 }}><span>variable</span><span>right-hand side (may use t)</span><span>initial value</span></div>
          <Row><Btn onClick={() => set({ eqs: [...s.eqs, { name: `u${s.eqs.length + 1}`, expr: '0', y0: 0 }], preset: 'custom', seeds: [] })}>+ Equation</Btn></Row>
          <h4 style={{ margin: '12px 0 6px' }}>Parameters</h4>
          {s.params.map((p, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 32px', gap: 6, marginBottom: 6 }}>
              <input className="k-text mono" value={p.name} aria-label="parameter name" onChange={(ev) => editP(i, { name: ev.target.value })} />
              <input className="k-text mono" type="number" value={p.value} aria-label={`${p.name} value`} onChange={(ev) => editP(i, { value: Number(ev.target.value) })} />
              <Btn kind="ghost" onClick={() => set({ params: s.params.filter((_, k) => k !== i) })}>✕</Btn>
            </div>
          ))}
          <Row><Btn onClick={() => set({ params: [...s.params, { name: `p${s.params.length + 1}`, value: 1 }] })}>+ Parameter</Btn></Row>
        </Panel>
        <Panel title="Integration">
          <Row>
            <Num label="t start" value={s.t0} onChange={(t0) => set({ t0 })} />
            <Num label="t end" value={s.t1} onChange={(t1) => set({ t1 })} />
          </Row>
          <Seg value={s.method} onChange={(method) => set({ method })} options={[['rk45', 'Dormand–Prince RK45 (explicit)'], ['implicit', 'Rosenbrock 2(3) (implicit, stiff)']]} />
          <Select label="Relative tolerance" value={s.rtol} onChange={(rtol) => set({ rtol })} options={[[1e-3, '1e-3 (fast)'], [1e-4, '1e-4'], [1e-6, '1e-6'], [1e-8, '1e-8'], [1e-10, '1e-10 (precise)']]} />
          <p className="muted" style={{ fontSize: 12 }}>Absolute tolerance = relative × 10⁻³. Functions: sin, cos, exp, ln, sqrt, abs, min, max, pow, tanh …; constants pi, e.</p>
        </Panel>
      </div>
      <div>
        {res.err ? <Note tone="err">{res.err}</Note> : res.sol && res.out && res.names && (
          <>
            <Stats>
              <Stat label="Accepted steps" value={num(res.sol.steps, 0)} sub={`${res.sol.rejected} rejected`} />
              <Stat label="f evaluations" value={num(res.sol.evals, 0)} />
              <Stat label="Solve time" value={`${num(res.ms ?? 0, 1)} ms`} />
              <Stat label="Status" value={res.sol.status === 'ok' ? 'Done' : res.sol.status === 'maxsteps' ? 'Step limit' : res.sol.status === 'stepsize' ? 'Step too small' : 'Blew up'} tone={res.sol.status === 'ok' ? 'good' : 'bad'} sub={`t reached ${num(res.sol.t[res.sol.t.length - 1], 4)}`} />
            </Stats>
            {res.sol.status === 'maxsteps' && s.method === 'rk45' && <Note tone="warn">The explicit method hit 60,000 steps — the system is probably stiff. Switch to the implicit Rosenbrock method. <Btn onClick={() => set({ method: 'implicit' })}>Switch</Btn></Note>}
            {res.sol.status === 'nonfinite' && <Note tone="err">The right-hand side is not finite at the start (division by zero or a domain error?).</Note>}
            <Panel title="Time series">
              <LineChart series={res.names.map((nm, i) => ({ name: nm, points: res.out.t.map((t, k) => [t, res.out.y[k][i]] as [number, number]) }))} xLabel="t" height={280} />
            </Panel>
            {n >= 2 && (
              <Panel title="Phase portrait" actions={<>
                <Select label="" value={px[0]} onChange={(a) => set({ px: [a, px[1]], seeds: [] })} options={res.names.map((nm, i) => [i, nm] as [number, string])} />
                <Select label="" value={px[1]} onChange={(b) => set({ px: [px[0], b], seeds: [] })} options={res.names.map((nm, i) => [i, nm] as [number, string])} />
              </>}>
                <Phase names={res.names} px={px} main={res.out.y} extra={res.extra ?? []} f={res.f ?? null} s={s} onClick={(x, y) => set({ seeds: [...s.seeds, [x, y] as [number, number]].slice(-8) })} />
                <Row>
                  {n === 2 ? <span className="muted" style={{ fontSize: 13 }}>Click the plot to start extra trajectories from that point.</span> : <span className="muted" style={{ fontSize: 13 }}>Projection of a {n}-variable system; direction field needs exactly 2 variables.</span>}
                  {n === 2 && <Check label="Direction field" value={s.field} onChange={(field) => set({ field })} />}
                  {s.seeds.length > 0 && <Btn kind="ghost" onClick={() => set({ seeds: [] })}>Clear trajectories</Btn>}
                </Row>
              </Panel>
            )}
            <Panel title="Values" actions={<CsvButton name="ode-solution.csv" rows={() => [['t', ...res.names!], ...res.sol!.t.map((t, k) => [t, ...res.sol!.y[k]])]} />}>
              <Table head={['t', ...res.names]} rows={res.out.t.filter((_, k) => k % 50 === 0 || k === res.out!.t.length - 1).map((t) => {
                const k = res.out!.t.indexOf(t)
                return [num(t, 4), ...res.out!.y[k].map((v) => num(v, 6))]
              })} />
              <p className="muted" style={{ fontSize: 12 }}>Table shows interpolated points; the CSV contains every accepted step.</p>
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
