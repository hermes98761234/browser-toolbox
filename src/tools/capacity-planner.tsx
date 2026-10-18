import { useMemo } from 'react'
import { Btn, CsvButton, LineChart, Note, Num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { little, solve, staffFor, type Model, type QueueResult } from './lib/capacity-planner'

type RateU = 's' | 'min' | 'h'
type TimeU = 'ms' | 's' | 'min'
const RS: Record<RateU, number> = { s: 1, min: 60, h: 3600 }
const TS: Record<TimeU, number> = { ms: 0.001, s: 1, min: 60 }

interface Scenario { id: string; name: string; model: Model; lambda: number; svc: number; c: number; K: number }
interface State {
  model: Model; rateU: RateU; timeU: TimeU; lambda: number; svc: number; c: number; K: number
  slT: number; slTarget: number; maxRho: number
  lL: string; lLam: string; lW: string
  scenarios: Scenario[]
}

const PRESETS: { name: string; s: Partial<State> }[] = [
  { name: 'Web API (8 workers)', s: { model: 'mmc', rateU: 's', timeU: 'ms', lambda: 160, svc: 40, c: 8, K: 64, slT: 50, slTarget: 95, maxRho: 85 } },
  { name: 'Call centre (80/20)', s: { model: 'mmc', rateU: 'h', timeU: 's', lambda: 240, svc: 180, c: 14, K: 40, slT: 20, slTarget: 80, maxRho: 90 } },
  { name: 'Single DB disk', s: { model: 'mm1', rateU: 's', timeU: 'ms', lambda: 120, svc: 6, c: 1, K: 32, slT: 10, slTarget: 90, maxRho: 80 } },
  { name: 'Thread pool + bounded queue', s: { model: 'mmck', rateU: 's', timeU: 'ms', lambda: 260, svc: 30, c: 8, K: 24, slT: 30, slTarget: 95, maxRho: 85 } },
  { name: 'Supermarket checkouts', s: { model: 'mmc', rateU: 'h', timeU: 'min', lambda: 150, svc: 2.5, c: 7, K: 30, slT: 3, slTarget: 90, maxRho: 90 } },
]

const DEF: State = {
  ...(PRESETS[0].s as State),
  lL: '', lLam: '120', lW: '0.25',
  scenarios: [],
}

const MODELS: [Model, string][] = [['mm1', 'M/M/1'], ['mmc', 'M/M/c'], ['mmck', 'M/M/c/K']]

export default function CapacityPlanner() {
  const [s, set, reset] = useToolState('capacity-planner', DEF)
  const lam = s.lambda / RS[s.rateU] // per second
  const svcS = s.svc * TS[s.timeU]
  const mu = svcS > 0 ? 1 / svcS : NaN
  const c = s.model === 'mm1' ? 1 : Math.max(1, Math.round(s.c))
  const K = Math.max(c, Math.round(s.K))
  const r = solve(s.model, lam, mu, c, K)
  const slT = s.slT * TS[s.timeU]
  const ft = (sec: number) => (Number.isFinite(sec) ? `${(sec / TS[s.timeU]).toLocaleString('en-US', { maximumFractionDigits: sec / TS[s.timeU] < 10 ? 2 : 1 })} ${s.timeU}` : '∞')
  const fr = (perSec: number) => `${(perSec * RS[s.rateU]).toLocaleString('en-US', { maximumFractionDigits: 1 })}/${s.rateU}`
  const valid = lam >= 0 && svcS > 0

  const need = useMemo(() => (valid ? staffFor(lam, mu, slT, s.slTarget / 100, s.maxRho / 100) : NaN), [valid, lam, mu, slT, s.slTarget, s.maxRho])

  const staffing = useMemo(() => {
    if (!valid) return []
    const start = s.model === 'mm1' ? 1 : Math.max(s.model === 'mmck' ? 1 : Math.floor(lam / mu) + 1, Math.min(c, Number.isFinite(need) ? need : c) - 2)
    const n = s.model === 'mm1' ? 1 : 9
    return Array.from({ length: n }, (_, i) => start + i).map((k) => ({ k, q: solve(s.model === 'mm1' ? 'mmc' : s.model, lam, mu, k, Math.max(k, K)) }))
  }, [valid, s.model, c, need, lam, mu, K])

  const curves = useMemo(() => {
    if (!valid) return null
    const cap = c * mu
    const xs = Array.from({ length: 80 }, (_, i) => (cap * (s.model === 'mmck' ? 1.6 : 0.985) * (i + 1)) / 80)
    const mean: [number, number][] = [], p95: [number, number][] = [], thr: [number, number][] = [], off: [number, number][] = []
    for (const x of xs) {
      const q = solve(s.model, x, mu, c, K)
      if (!q.stable) continue
      const X = x * RS[s.rateU]
      mean.push([X, q.W / TS[s.timeU]])
      p95.push([X, (q.waitQuantile(0.95) + svcS) / TS[s.timeU]])
      thr.push([X, q.throughput * RS[s.rateU]])
      off.push([X, X])
    }
    return { mean, p95, thr, off, cap: cap * RS[s.rateU] }
  }, [valid, c, mu, K, s.model, s.rateU, s.timeU, svcS])

  const lit = little(s.lL === '' ? NaN : Number(s.lL), s.lLam === '' ? NaN : Number(s.lLam), s.lW === '' ? NaN : Number(s.lW))
  const blanks = [s.lL, s.lLam, s.lW].filter((v) => v === '').length

  const scen = s.scenarios.map((sc) => {
    const l = sc.lambda / RS[s.rateU], m = 1 / (sc.svc * TS[s.timeU])
    return { sc, q: solve(sc.model, l, m, sc.model === 'mm1' ? 1 : sc.c, Math.max(sc.c, sc.K)) }
  })

  const statsFor = (q: QueueResult) => [pct(q.rho), pct(q.pWait), ft(q.Wq), ft(q.waitQuantile(0.95)), ft(q.W), q.L.toFixed(2), pct(q.slWithin(slT))]

  return (
    <Split wide="right">
      <div>
        <Panel title="Workload" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Preset" value="" onChange={(v) => { const p = PRESETS.find((x) => x.name === v); if (p) set(p.s) }} options={[['', 'Choose an example…'], ...PRESETS.map((p) => [p.name, p.name] as [string, string])]} />
          <Seg value={s.model} onChange={(model) => set({ model })} options={MODELS} label="Queue model" />
          <Row>
            <Num label="Arrival rate λ" value={s.lambda} onChange={(lambda) => set({ lambda })} min={0} />
            <Select label="per" value={s.rateU} onChange={(rateU) => set({ rateU })} options={[['s', 'second'], ['min', 'minute'], ['h', 'hour']]} />
          </Row>
          <Row>
            <Num label="Mean service time 1/μ" value={s.svc} onChange={(svc) => set({ svc })} min={0} />
            <Select label="unit" value={s.timeU} onChange={(timeU) => set({ timeU })} options={[['ms', 'ms'], ['s', 'seconds'], ['min', 'minutes']]} />
          </Row>
          <Row>
            {s.model !== 'mm1' && <Num label="Servers c" value={s.c} onChange={(v) => set({ c: v })} min={1} step={1} />}
            {s.model === 'mmck' && <Num label="System limit K" value={s.K} onChange={(v) => set({ K: v })} min={1} step={1} hint="in service + queued" />}
          </Row>
        </Panel>
        <Panel title="Service-level target">
          <Row>
            <Num label="Wait at most" value={s.slT} onChange={(slT) => set({ slT })} unit={s.timeU} min={0} />
            <Num label="for" value={s.slTarget} onChange={(slTarget) => set({ slTarget })} unit="% of requests" min={1} max={99.99} />
          </Row>
          <Num label="Max utilisation" value={s.maxRho} onChange={(maxRho) => set({ maxRho })} unit="%" min={1} max={100} hint="headroom for bursts; 70–85 % is common" />
          {Number.isFinite(need) ? (
            <Note tone={c >= need ? 'ok' : 'warn'}>
              Erlang C staffing: <b>{need} server{need > 1 ? 's' : ''}</b> needed for {s.slTarget}% of requests to wait ≤ {s.slT} {s.timeU} at ≤ {s.maxRho}% utilisation.
              {s.model !== 'mm1' && c !== need && <> <Btn onClick={() => set({ c: need })}>Use {need}</Btn></>}
            </Note>
          ) : <Note tone="warn">Enter a positive service time.</Note>}
        </Panel>
        <Panel title="Little's law  L = λ · W">
          <p className="muted" style={{ marginTop: 0 }}>Leave exactly one box empty; it is solved from the other two (any consistent units).</p>
          <Row>
            <Txt type="number" label="L (items in system)" value={blanks === 1 && s.lL === '' ? lit.L.toPrecision(4) : s.lL} onChange={(lL) => set({ lL })} />
            <Txt type="number" label="λ (arrivals / time)" value={blanks === 1 && s.lLam === '' ? lit.lambda.toPrecision(4) : s.lLam} onChange={(lLam) => set({ lLam })} />
            <Txt type="number" label="W (time in system)" value={blanks === 1 && s.lW === '' ? lit.W.toPrecision(4) : s.lW} onChange={(lW) => set({ lW })} />
          </Row>
          <Row>
            <Btn onClick={() => set({ lL: '' })}>Solve L</Btn>
            <Btn onClick={() => set({ lLam: '' })}>Solve λ</Btn>
            <Btn onClick={() => set({ lW: '' })}>Solve W</Btn>
          </Row>
          {blanks === 1 ? (
            <Note tone="ok">L = <b>{lit.L.toPrecision(4)}</b>, λ = <b>{lit.lambda.toPrecision(4)}</b>, W = <b>{lit.W.toPrecision(4)}</b></Note>
          ) : <Note tone="info">Clear one field to solve it.</Note>}
          <p className="muted" style={{ fontSize: 13 }}>Holds for any stable system regardless of distributions: e.g. 120 req/s × 0.25 s ⇒ 30 requests in flight.</p>
        </Panel>
      </div>

      <div>
        {!valid ? <Note tone="err">Service time must be positive and arrival rate non-negative.</Note> : !r.stable ? (
          <Note tone="err">
            Unstable: offered load {r.a.toFixed(2)} Erlangs ≥ {c} server{c > 1 ? 's' : ''}. The queue grows without bound. You need at least {Math.floor(r.a) + 1} servers (or faster service).
          </Note>
        ) : null}
        <Stats>
          <Stat label="Utilisation ρ" value={pct(r.rho)} tone={r.rho > s.maxRho / 100 ? 'bad' : 'good'} sub={`${r.a.toFixed(2)} Erlangs offered`} />
          <Stat label="Mean response W" value={ft(r.W)} sub={`wait Wq ${ft(r.Wq)} + service ${ft(svcS)}`} tone="accent" />
          <Stat label="P(wait > 0)" value={pct(r.pWait)} sub={`p95 wait ${ft(r.waitQuantile(0.95))}`} />
          <Stat label="In system L" value={Number.isFinite(r.L) ? r.L.toFixed(2) : '∞'} sub={`queued Lq ${Number.isFinite(r.Lq) ? r.Lq.toFixed(2) : '∞'}`} />
          <Stat label={`Waited ≤ ${s.slT} ${s.timeU}`} value={pct(r.slWithin(slT))} tone={r.slWithin(slT) >= s.slTarget / 100 ? 'good' : 'bad'} sub={`target ${s.slTarget}%`} />
          <Stat label="Throughput" value={fr(r.throughput)} sub={s.model === 'mmck' ? `${pct(r.pBlock, 2)} rejected` : `capacity ${fr(c * mu)}`} />
        </Stats>

        {curves && (
          <Panel title={`Response time vs arrival rate (c = ${c})`}>
            <LineChart
              series={[{ name: 'Mean response W', points: curves.mean }, { name: 'p95 response (wait p95 + mean service)', points: curves.p95, dashed: true, color: '#f59e0b' }]}
              xLabel={`arrival rate (per ${s.rateU})`} yLabel={`time (${s.timeU})`} fy={(v) => v.toPrecision(3)}
              yMax={Math.min(curves.p95.at(-1)?.[1] ?? 1, Math.max((svcS / TS[s.timeU]) * 4, r.stable ? ((r.waitQuantile(0.95) + svcS) / TS[s.timeU]) * 3 : 0))}
              markers={[{ x: s.lambda, label: 'now' }]}
            />
            <p className="muted" style={{ fontSize: 13 }}>The “hockey stick”: latency is flat at low load and explodes as utilisation approaches 100 %. Keep the operating point well left of the knee.</p>
          </Panel>
        )}
        {curves && s.model === 'mmck' && (
          <Panel title="Throughput vs offered load (bounded queue)">
            <LineChart series={[{ name: 'Offered', points: curves.off, dashed: true, color: '#64748b' }, { name: 'Carried (admitted)', points: curves.thr }]} xLabel={`offered (per ${s.rateU})`} yLabel={`per ${s.rateU}`} markers={[{ x: s.lambda, label: 'now' }]} />
          </Panel>
        )}

        <Panel title="Staffing table" actions={<CsvButton name="staffing.csv" rows={() => [['servers', 'utilisation', 'P(wait)', 'mean wait s', 'p95 wait s', 'mean response s', 'L', 'service level', 'rejected'], ...staffing.map(({ k, q }) => [k, q.rho, q.pWait, q.Wq, q.waitQuantile(0.95), q.W, q.L, q.slWithin(slT), q.pBlock])]} />}>
          <Table
            head={['Servers', 'Util.', 'P(wait)', 'Avg wait', 'p95 wait', 'Response', 'L', `≤ ${s.slT} ${s.timeU}`, ...(s.model === 'mmck' ? ['Rejected'] : [])]}
            rows={staffing.map(({ k, q }) => {
              const ok = q.stable && q.rho <= s.maxRho / 100 && q.slWithin(slT) >= s.slTarget / 100
              const cells = q.stable ? [...statsFor(q)] : ['≥100%', '100%', '∞', '∞', '∞', '∞', '0%']
              return [<b key="k" style={{ color: k === c ? 'var(--accent)' : undefined }}>{k}{k === c ? ' ◀' : ''}</b>, ...cells.map((v, j) => (j === 6 ? <span key={j} style={{ color: ok ? 'var(--ok)' : 'var(--err)', fontWeight: 700 }}>{v}</span> : v)), ...(s.model === 'mmck' ? [pct(q.pBlock, 2)] : [])]
            })}
          />
        </Panel>

        <Panel title="Scenario comparison" actions={<>
          <Btn kind="primary" onClick={() => set({ scenarios: [...s.scenarios, { id: uid(), name: `${MODELS.find((m) => m[0] === s.model)?.[1]} λ=${s.lambda} c=${c}`, model: s.model, lambda: s.lambda, svc: s.svc, c, K }] })}>+ Save current</Btn>
          {s.scenarios.length > 0 && <Btn kind="ghost" onClick={() => set({ scenarios: [] })}>Clear</Btn>}
        </>}>
          {scen.length === 0 ? <p className="muted">Save a few what-if variations (more servers, faster service, peak traffic) to compare them side by side. Units follow the current settings.</p> : (
            <Table
              head={['Scenario', 'λ', 'Service', 'c', 'Util.', 'P(wait)', 'Avg wait', 'p95 wait', 'Response', 'L', 'SL', '']}
              rows={scen.map(({ sc, q }) => [
                <input key="n" value={sc.name} onChange={(e) => set({ scenarios: s.scenarios.map((x) => (x.id === sc.id ? { ...x, name: e.target.value } : x)) })} aria-label="Scenario name" style={{ width: 150 }} />,
                sc.lambda, `${sc.svc} ${s.timeU}`, sc.model === 'mmck' ? `${sc.c}/K${sc.K}` : sc.c,
                ...(q.stable ? statsFor(q) : ['unstable', '', '', '', '', '', '']),
                <Btn key="x" kind="ghost" onClick={() => set({ scenarios: s.scenarios.filter((x) => x.id !== sc.id) })}>✕</Btn>,
              ])}
            />
          )}
        </Panel>
        <Note>
          Assumes Poisson arrivals and exponential service times (the “M/M” in Kendall notation). Real services with steadier service times queue less (M/D/c ≈ half the wait); bursty traffic queues more. Use these numbers as a first-order sizing guide and confirm with load tests.
        </Note>
      </div>
    </Split>
  )
}
