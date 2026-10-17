import { useEffect, useRef, useState } from 'react'
import { Btn, CsvButton, Note, Num, Panel, Ring, Row, Slider, Split, Stat, Stats, money, niceTicks, num, pct, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { DEFAULT_PLAN, realReturn, sustainableSpending, type Plan, type SimResult } from './lib/retirement-projection'

interface State extends Plan { paths: number; cur: string }
const DEF: State = { ...DEFAULT_PLAN, paths: 4000, cur: '$' }
const RETURNS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
type SurfRow = { ret: number; p50: number[]; p10: number[]; success: number }
interface Out { fan: SimResult; rows: SurfRow[]; ms: number }

const short = (x: number, c: string) => (Math.abs(x) >= 1e6 ? `${c}${num(x / 1e6, 2)}M` : Math.abs(x) >= 1e3 ? `${c}${num(x / 1e3, 0)}k` : `${c}${num(x, 0)}`)

/** Viridis-like ramp. */
function ramp(t: number): [number, number, number] {
  const stops: [number, number, number][] = [[0.27, 0.0, 0.33], [0.23, 0.32, 0.55], [0.13, 0.57, 0.55], [0.37, 0.79, 0.38], [0.99, 0.91, 0.14]]
  const x = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1), i = Math.floor(x), f = x - i
  return [0, 1, 2].map((k) => stops[i][k] + (stops[i + 1][k] - stops[i][k]) * f) as [number, number, number]
}

function Fan({ r, retireAge, cur }: { r: SimResult; retireAge: number; cur: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 720, H = 300, L = 64, R = 12, T = 12, B = 30
  const max = Math.max(1, ...r.pct.p90) * 1.1 // the 95th band is clipped so the median stays readable
  const a0 = r.ages[0], a1 = r.ages[r.ages.length - 1]
  const x = (a: number) => L + ((a - a0) / (a1 - a0 || 1)) * (W - L - R)
  const y = (v: number) => T + (1 - Math.min(v, max) / max) * (H - T - B)
  const band = (lo: number[], hi: number[]) => `M${r.ages.map((a, i) => `${x(a)},${y(hi[i])}`).join('L')}L${[...r.ages].reverse().map((a, j) => `${x(a)},${y(lo[r.ages.length - 1 - j])}`).join('L')}Z`
  const line = (v: number[]) => `M${r.ages.map((a, i) => `${x(a)},${y(v[i])}`).join('L')}`
  const i = hover === null ? -1 : Math.max(0, Math.min(r.ages.length - 1, Math.round(hover)))
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="Fan chart of projected balance"
        onMouseMove={(e) => { const b = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - b.left) / b.width) * W; setHover(((px - L) / (W - L - R)) * (a1 - a0)) }} onMouseLeave={() => setHover(null)}>
        {niceTicks(0, max, 5).filter((v) => v <= max).map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{short(v, cur)}</text></g>)}
        {niceTicks(a0, a1, 8).filter((a) => a >= a0 && a <= a1).map((a) => <text key={a} x={x(a)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--muted)">{a}</text>)}
        <path d={band(r.pct.p5, r.pct.p95)} fill="var(--accent)" opacity={0.13} />
        <path d={band(r.pct.p10, r.pct.p90)} fill="var(--accent)" opacity={0.15} />
        <path d={band(r.pct.p25, r.pct.p75)} fill="var(--accent)" opacity={0.22} />
        <path d={line(r.pct.p50)} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
        <path d={line(r.pct.p10)} fill="none" stroke="var(--err)" strokeWidth={1.2} strokeDasharray="5 4" />
        <line x1={x(retireAge)} x2={x(retireAge)} y1={T} y2={H - B} stroke="var(--muted)" strokeDasharray="4 4" />
        <text x={x(retireAge) + 4} y={T + 12} fontSize={11} fill="var(--muted)">retire</text>
        {i >= 0 && <line x1={x(r.ages[i])} x2={x(r.ages[i])} y1={T} y2={H - B} stroke="var(--fg)" opacity={0.4} />}
      </svg>
      {i >= 0 && (
        <div className="k-tip" style={{ left: `${Math.min(70, (x(r.ages[i]) / W) * 100)}%`, top: 10 }}>
          <b>Age {r.ages[i]}</b><br />90th: {money(r.pct.p90[i], cur, 0)}<br />Median: <b>{money(r.pct.p50[i], cur, 0)}</b><br />10th: {money(r.pct.p10[i], cur, 0)}
        </div>
      )}
    </div>
  )
}

export default function RetirementProjection() {
  const [s, set, reset] = useToolState('retirement-projection', DEF)
  const [out, setOut] = useState<Out | null>(null)
  const [busy, setBusy] = useState(false)
  const worker = useRef<Worker | null>(null)
  const jobId = useRef(0)
  const plan: Plan = { age: s.age, retireAge: Math.max(s.age + 1, s.retireAge), endAge: Math.max(s.retireAge + 1, s.endAge), balance: s.balance, contribution: s.contribution, contribGrowth: s.contribGrowth, spending: s.spending, otherIncome: s.otherIncome, meanReturn: s.meanReturn, volatility: s.volatility, inflation: s.inflation, fees: s.fees }
  const key = JSON.stringify([plan, s.paths])

  useEffect(() => {
    const w = new Worker(new URL('./lib/retirement-projection.worker.ts', import.meta.url), { type: 'module' })
    worker.current = w
    w.onmessage = (e: MessageEvent<Out & { id: number }>) => { if (e.data.id === jobId.current) { setOut(e.data); setBusy(false) } }
    return () => w.terminate()
  }, [])
  useEffect(() => {
    const t = setTimeout(() => {
      const id = ++jobId.current
      setBusy(true)
      const [pl, paths] = JSON.parse(key) as [Plan, number]
      worker.current?.postMessage({ id, plan: pl, paths: Math.max(500, Math.min(20000, paths)), returns: RETURNS, seed: 2026 })
    }, 200)
    return () => clearTimeout(t)
  }, [key])

  const S = 10
  const ref = useStage3D(
    (st) => { const g = new THREE.Group(); g.name = 'surf'; st.scene.add(g) },
    (st) => {
      const g = st.scene.getObjectByName('surf') as THREE.Group
      st.clear(g)
      if (!out) return
      const rows = out.rows, ages = out.fan.ages
      const nx = ages.length, nz = rows.length
      const maxB = Math.max(1, ...rows.flatMap((r) => r.p50))
      const H = 4.5
      const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3)
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i, v = Math.sqrt(rows[j].p50[i] / maxB) // √ height keeps low-return rows readable
        pos[k * 3] = (i / (nx - 1) - 0.5) * S
        pos[k * 3 + 1] = v * H
        pos[k * 3 + 2] = (0.5 - j / (nz - 1)) * S * 0.7
        const c = rows[j].p50[i] <= 0 ? [0.85, 0.2, 0.2] : ramp(v)
        col.set(c, k * 3)
      }
      const idx: number[] = []
      for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, c, b, b, c, d) }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      geo.setIndex(idx)
      geo.computeVertexNormals()
      g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6 })))
      g.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 })))
      // highlight the user's expected return (interpolated row)
      const jf = (s.meanReturn - RETURNS[0]) / (RETURNS[RETURNS.length - 1] - RETURNS[0]) * (nz - 1)
      if (jf >= 0 && jf <= nz - 1) {
        const pts = out.fan.ages.map((_, i) => new THREE.Vector3((i / (nx - 1) - 0.5) * S, Math.sqrt(out.fan.pct.p50[i] / maxB) * H + 0.03, (0.5 - jf / (nz - 1)) * S * 0.7))
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xff4d6d })))
      }
      const ri = plan.retireAge - plan.age
      const rx = (ri / (nx - 1) - 0.5) * S
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(rx, 0, -S * 0.35), new THREE.Vector3(rx, 0, S * 0.35)]), new THREE.LineBasicMaterial({ color: 0xffffff })))
      const add = (sp: THREE.Sprite, x: number, y: number, z: number) => { sp.position.set(x, y, z); g.add(sp) }
      add(label('Age →', '#e2e8f0', 0.6), 0, -0.3, S * 0.35 + 0.8)
      add(label(`${plan.age}`, '#94a3b8', 0.5), -S / 2, -0.3, S * 0.35 + 0.4)
      add(label(`${plan.endAge}`, '#94a3b8', 0.5), S / 2, -0.3, S * 0.35 + 0.4)
      add(label('retire', '#ffffff', 0.5), rx, 0.25, S * 0.35 + 0.3)
      add(label(`${RETURNS[0]}% return`, '#94a3b8', 0.5), S / 2 + 1.8, 0, S * 0.35)
      add(label(`${RETURNS[RETURNS.length - 1]}% return`, '#94a3b8', 0.5), S / 2 + 1.8, 0, -S * 0.35)
      add(label(`top: ${short(maxB, s.cur)} (√ height scale)`, '#fde047', 0.5), -S / 2 - 0.5, H + 0.3, -S * 0.35)
    },
    [out, s.meanReturn, s.cur],
    { camera: [9, 8, 11], target: [0, 1.5, 0], grid: false },
  )

  const f = out?.fan
  const ri = plan.retireAge - plan.age
  const drawPerYear = Math.max(0, plan.spending - plan.otherIncome)
  const rr = realReturn(plan)
  const safe = f ? sustainableSpending(f.pct.p10[ri], Math.max(0, rr - 0.02), plan.endAge - plan.retireAge) : 0
  const depAges = f ? f.depletion.map((n, i) => [f.ages[i], n] as [number, number]).filter(([, n]) => n > 0) : []
  const totalDep = depAges.reduce((a, [, n]) => a + n, 0)
  const cum = depAges.map(([a], i) => [a, depAges.slice(0, i + 1).reduce((t, [, n]) => t + n, 0)] as [number, number])
  const medianDep = cum.find(([, c]) => c >= totalDep / 2)?.[0]
  const m = (x: number) => money(x, s.cur, 0)

  return (
    <Split wide="left">
      <div>
        <Stats>
          <div className="k-stat" style={{ alignItems: 'center' }}><span className="k-stat-label">Plan success</span><Ring value={f?.success ?? 0} color={(f?.success ?? 0) >= 0.85 ? 'var(--ok)' : (f?.success ?? 0) >= 0.7 ? 'var(--warn)' : 'var(--err)'} /></div>
          <Stat label={`Median at ${plan.retireAge}`} value={f ? short(f.atRetirement, s.cur) : '…'} sub={f ? `10th pct ${short(f.pct.p10[ri], s.cur)}` : ''} tone="accent" />
          <Stat label="Withdrawal rate" value={f ? pct(drawPerYear / Math.max(1, f.atRetirement), 1) : '…'} sub={`${m(drawPerYear)}/yr from savings`} />
          <Stat label="Money runs out" value={totalDep ? `age ${medianDep}` : 'never'} sub={totalDep ? `median of failing paths (${pct(1 - (f?.success ?? 0), 0)})` : `in ${num(s.paths, 0)} paths`} tone={totalDep ? 'bad' : 'good'} />
        </Stats>
        <Panel title="Balance by age × expected return (median, today's money)" actions={busy ? <span className="muted">Simulating…</span> : out ? <span className="muted">{num(s.paths, 0)} paths · {num(out.ms, 0)} ms in a Web Worker</span> : null}>
          <View3D refEl={ref} height={420} />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Each row is its own Monte Carlo run at that mean return. Pink line = your assumption ({s.meanReturn}%). Red cells = median balance exhausted. Drag to orbit.</p>
        </Panel>
        <Panel title="Projection fan (5–95th percentile)" actions={f && <CsvButton name="retirement-projection.csv" rows={() => [['age', 'p5', 'p10', 'p25', 'median', 'p75', 'p90', 'p95'], ...f.ages.map((a, i) => [a, ...(['p5', 'p10', 'p25', 'p50', 'p75', 'p90', 'p95'] as const).map((k) => Math.round(f.pct[k][i]))])]} />}>
          {f ? <Fan r={f} retireAge={plan.retireAge} cur={s.cur} /> : <p className="muted">Running simulation…</p>}
          <p className="muted" style={{ fontSize: 13 }}>Bands: 25–75% (darkest), 10–90%, 5–95%. Dashed red = a bad-luck (10th percentile) path. All values in today's money after {s.inflation}% inflation and {s.fees}% fees.</p>
        </Panel>
      </div>
      <div>
        <Panel title="You" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Num label="Age" value={s.age} onChange={(age) => set({ age: Math.max(18, Math.min(90, Math.round(age))) })} min={18} max={90} step={1} />
            <Num label="Retire at" value={s.retireAge} onChange={(retireAge) => set({ retireAge: Math.round(retireAge) })} min={s.age + 1} max={90} step={1} />
            <Num label="Plan to age" value={s.endAge} onChange={(endAge) => set({ endAge: Math.min(110, Math.round(endAge)) })} min={s.retireAge + 1} max={110} step={1} />
          </Row>
          <Row>
            <Num label="Current savings" value={s.balance} onChange={(balance) => set({ balance: Math.max(0, balance) })} unit={s.cur} min={0} />
            <Num label="Saving per year" value={s.contribution} onChange={(contribution) => set({ contribution: Math.max(0, contribution) })} unit={s.cur} min={0} />
          </Row>
          <Slider label="Contributions grow (real)" value={s.contribGrowth} onChange={(contribGrowth) => set({ contribGrowth })} min={0} max={5} step={0.25} unit="%/yr" />
        </Panel>
        <Panel title="Retirement">
          <Row>
            <Num label="Spending per year" value={s.spending} onChange={(spending) => set({ spending: Math.max(0, spending) })} unit={s.cur} min={0} />
            <Num label="Pension / Social Security" value={s.otherIncome} onChange={(otherIncome) => set({ otherIncome: Math.max(0, otherIncome) })} unit={s.cur} min={0} />
          </Row>
          {f && <Note tone={f.success >= 0.85 ? 'ok' : 'warn'}>
            {f.success >= 0.85 ? 'On track. ' : 'At risk. '}A cautious spending level (10th-percentile balance, return 2 pts below your assumption) is about <b>{m(safe + plan.otherIncome)}/yr</b> including other income.
          </Note>}
        </Panel>
        <Panel title="Markets">
          <Slider label="Expected return (nominal)" value={s.meanReturn} onChange={(meanReturn) => set({ meanReturn })} min={1} max={12} step={0.25} unit="%" />
          <Slider label="Volatility (std. dev.)" value={s.volatility} onChange={(volatility) => set({ volatility })} min={0} max={30} step={0.5} unit="%" />
          <Slider label="Inflation" value={s.inflation} onChange={(inflation) => set({ inflation })} min={0} max={8} step={0.25} unit="%" />
          <Slider label="Fees" value={s.fees} onChange={(fees) => set({ fees })} min={0} max={2} step={0.05} unit="%" />
          <Slider label="Simulated paths" value={s.paths} onChange={(paths) => set({ paths })} min={500} max={20000} step={500} show={(v) => num(v, 0)} />
          <div className="k-row wrap" style={{ gap: 6 }}>
            <Btn onClick={() => set({ meanReturn: 5, volatility: 9 })}>Conservative 40/60</Btn>
            <Btn onClick={() => set({ meanReturn: 6.5, volatility: 12 })}>Balanced 60/40</Btn>
            <Btn onClick={() => set({ meanReturn: 8, volatility: 17 })}>Aggressive 90/10</Btn>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Real return after inflation and fees: <b>{pct(rr, 2)}</b>. Returns are drawn independently each year from a normal distribution — real markets have fatter tails and streaks, so treat results as a guide, not a guarantee.</p>
        </Panel>
      </div>
    </Split>
  )
}
