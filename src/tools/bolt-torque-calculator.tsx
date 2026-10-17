import { Bar, BarChart, Btn, Check, CsvButton, Note, num, Num, Panel, pct, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { bearingDia, equivalentK, GRADES, N_TO_LBF, NM_TO_FTLB, NUT_FACTORS, pitchDia, stressArea, THREADS, torqueLong, torqueShort, type Thread } from './lib/bolt-torque-calculator'

const DEF = {
  system: 'metric' as 'metric' | 'inch',
  thread: 'M10×1.5',
  grade: '8.8',
  load: 75,
  method: 'K' as 'K' | 'mu',
  K: 0.2,
  muT: 0.14,
  muB: 0.14,
  wrench: 5,
  kTol: 20,
  bolts: 4,
  fine: false,
}

const SHORT = ['Dry', 'Zinc', 'Blk oxide', 'Oiled', 'Cadmium', 'Anti-seize', 'MoS₂', 'PTFE/wax', 'SS dry']

export default function BoltTorqueCalculator() {
  const [s, set, reset] = useToolState('bolt-torque-calculator', DEF)
  const threads = THREADS.filter((t) => t.system === s.system)
  const t = threads.find((x) => x.id === s.thread) ?? threads[0]
  const grades = GRADES.filter((g) => g.system === s.system)
  const g = grades.find((x) => x.id === s.grade) ?? grades[0]
  const metric = s.system === 'metric'

  const As = stressArea(t)
  const proofLoad = g.proof(t.d) * As // N
  const yieldLoad = g.yield(t.d) * As
  const F = (proofLoad * s.load) / 100
  const K = s.method === 'K' ? s.K : equivalentK(t, s.muT, s.muB)
  const T = s.method === 'K' ? torqueShort(K, F, t.d) : torqueLong(t, F, s.muT, s.muB).total
  const parts = torqueLong(t, F, s.muT, s.muB)
  const stress = F / As
  const a = s.wrench / 100, b = s.kTol / 100
  const Fmin = (T * (1 - a) * 1000) / (K * (1 + b) * t.d)
  const Fmax = (T * (1 + a) * 1000) / (K * Math.max(0.05, 1 - b) * t.d)

  const force = (n: number) => (metric ? `${num(n / 1000, 2)} kN` : `${num(n * N_TO_LBF, 0)} lbf`)
  const force2 = (n: number) => (metric ? `${num(n * N_TO_LBF, 0)} lbf` : `${num(n / 1000, 2)} kN`)
  const torque = (nm: number) => (metric ? `${num(nm, nm < 10 ? 2 : 1)} N·m` : nm * NM_TO_FTLB < 20 ? `${num(nm * NM_TO_FTLB * 12, 0)} in·lb` : `${num(nm * NM_TO_FTLB, 1)} ft·lb`)
  const torque2 = (nm: number) => (metric ? `${num(nm * NM_TO_FTLB, 1)} ft·lb` : `${num(nm, 1)} N·m`)
  const mpa = (x: number) => (metric ? `${num(x, 0)} MPa` : `${num(x / 6.894757, 1)} ksi`)

  const switchSystem = (system: 'metric' | 'inch') =>
    set({ system, thread: system === 'metric' ? 'M10×1.5' : '1/2-13 UNC', grade: system === 'metric' ? '8.8' : 'SAE5' })

  const rows = threads.filter((x) => (s.fine ? /fine|UNF/.test(x.id) : !/fine|UNF/.test(x.id))).map((x: Thread) => {
    const A = stressArea(x)
    const f = (g.proof(x.d) * A * s.load) / 100
    const k = s.method === 'K' ? s.K : equivalentK(x, s.muT, s.muB)
    const tq = torqueShort(k, f, x.d)
    return { x, A, f, tq }
  })

  const lubBars = NUT_FACTORS.map(([name, k], i) => ({ label: SHORT[i] ?? name, value: Math.min(F * 3, (T * 1000) / (k * t.d)) / (metric ? 1000 : 1 / N_TO_LBF), color: (T * 1000) / (k * t.d) > yieldLoad ? '#ef4444' : undefined, full: name }))

  return (
    <Split>
      <div>
        <Panel title="Fastener" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.system} onChange={switchSystem} options={[['metric', 'Metric (ISO)'], ['inch', 'Inch (UNC/UNF)']]} />
          <Row>
            <Select label="Thread" value={t.id} onChange={(thread) => set({ thread })} options={threads.map((x) => x.id)} />
            <Select label="Property class / grade" value={g.id} onChange={(grade) => set({ grade })} options={grades.map((x) => [x.id, x.name] as [string, string])} />
          </Row>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0' }}>
            d = {num(t.d, 2)} mm · pitch {t.tpi ? `${t.tpi} TPI (${num(t.p, 3)} mm)` : `${t.p} mm`} · d₂ = {num(pitchDia(t), 2)} mm · A<sub>s</sub> = {num(As, 1)} mm²{!metric && ` (${num(As / 645.16, 4)} in²)`}
          </p>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Proof strength {mpa(g.proof(t.d))} · yield {mpa(g.yield(t.d))} · proof load {force(proofLoad)}</p>
        </Panel>
        <Panel title="Target preload">
          <Slider label="Preload as % of proof load" value={s.load} onChange={(load) => set({ load })} min={30} max={100} step={1} unit="%" show={(v) => num(v, 0)} />
          <Row>
            {[[65, 'Reused / gasketed'], [75, 'Reusable joint'], [90, 'Permanent joint']].map(([v, l]) => (
              <Btn key={v} kind={s.load === v ? 'primary' : 'normal'} onClick={() => set({ load: v as number })}>{v}% · {l}</Btn>
            ))}
          </Row>
        </Panel>
        <Panel title="Friction">
          <Seg value={s.method} onChange={(method) => set({ method })} options={[['K', 'Nut factor K'], ['mu', 'Friction μ (ISO 16047)']]} />
          {s.method === 'K' ? (
            <>
              <Num label="Nut factor K" value={s.K} onChange={(K) => set({ K })} min={0.05} max={0.4} step={0.01} hint="T = K · F · d" />
              <Select label="Condition preset" value={String(NUT_FACTORS.find(([, k]) => k === s.K)?.[1] ?? '')} onChange={(v) => v && set({ K: Number(v) })} options={[['', 'Custom…'], ...NUT_FACTORS.map(([n, k]) => [String(k), `${n} — K ${k}`] as [string, string])]} />
            </>
          ) : (
            <Row>
              <Num label="Thread friction μₜ" value={s.muT} onChange={(muT) => set({ muT })} min={0.04} max={0.4} step={0.01} />
              <Num label="Under-head friction μ_b" value={s.muB} onChange={(muB) => set({ muB })} min={0.04} max={0.4} step={0.01} />
            </Row>
          )}
          <p className="muted" style={{ fontSize: 13 }}>Equivalent nut factor K = {num(K, 3)} · bearing Ø ≈ {num(bearingDia(t), 1)} mm</p>
        </Panel>
        <Panel title="Scatter & joint">
          <Row>
            <Num label="Wrench accuracy ±" value={s.wrench} onChange={(wrench) => set({ wrench })} unit="%" min={0} max={50} />
            <Num label="Friction scatter ±" value={s.kTol} onChange={(kTol) => set({ kTol })} unit="%" min={0} max={60} />
            <Num label="Bolts in joint" value={s.bolts} onChange={(bolts) => set({ bolts: Math.max(1, Math.round(bolts)) })} min={1} />
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Tightening torque" value={torque(T)} sub={torque2(T)} tone="accent" />
          <Stat label="Preload per bolt" value={force(F)} sub={force2(F)} />
          <Stat label="Bolt stress" value={mpa(stress)} sub={`${pct(F / yieldLoad, 0)} of yield`} tone={F > yieldLoad ? 'bad' : undefined} />
          <Stat label="Joint clamp force" value={force(F * s.bolts)} sub={`${s.bolts} bolts`} />
        </Stats>
        {F > yieldLoad && <Note tone="err">Target preload exceeds the yield load — the bolt will yield. Lower the preload %.</Note>}
        <Panel title="Preload scatter">
          <p style={{ margin: '0 0 6px' }}>
            With ±{s.wrench}% torque and ±{s.kTol}% friction scatter the actual preload lands between <b>{force(Fmin)}</b> and <b>{force(Fmax)}</b>.
          </p>
          <div style={{ position: 'relative', height: 26, background: 'var(--panel2)', borderRadius: 8, border: '1px solid var(--line)' }}>
            {[[Fmin, Fmax, 'var(--accent)']].map(([lo, hi]) => {
              const max = Math.max(yieldLoad * 1.15, (hi as number) * 1.05)
              return (
                <div key="r">
                  <div style={{ position: 'absolute', left: `${((lo as number) / max) * 100}%`, width: `${(((hi as number) - (lo as number)) / max) * 100}%`, top: 4, bottom: 4, background: 'color-mix(in srgb, var(--accent) 45%, transparent)', borderRadius: 4 }} />
                  <div title="target" style={{ position: 'absolute', left: `${(F / max) * 100}%`, top: 0, bottom: 0, width: 2, background: 'var(--accent)' }} />
                  <div title="proof load" style={{ position: 'absolute', left: `${(proofLoad / max) * 100}%`, top: 0, bottom: 0, width: 2, background: 'var(--warn)' }} />
                  <div title="yield load" style={{ position: 'absolute', left: `${(yieldLoad / max) * 100}%`, top: 0, bottom: 0, width: 2, background: 'var(--err)' }} />
                </div>
              )
            })}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Blue line = target · orange = proof load · red = yield load</p>
          {Fmax > yieldLoad && <Note tone="warn">The upper end of the scatter band exceeds yield. Use a better-controlled method (angle or stretch) or lower the target.</Note>}
          {Fmin < F * 0.7 && <Note>Minimum preload is {pct(Fmin / F, 0)} of target — consider a lubricant with consistent friction.</Note>}
        </Panel>
        <Panel title="Where the torque goes">
          {[['Thread pitch (stretches the bolt)', parts.pitch, '#10b981'], ['Thread friction', parts.thread, '#f59e0b'], ['Under-head friction', parts.head, '#ef4444']].map(([l, v, c]) => (
            <div key={l as string} style={{ margin: '6px 0' }}>
              <Row wrap={false}><span style={{ flex: 1 }}>{l}</span><b>{pct((v as number) / parts.total, 0)}</b></Row>
              <Bar value={v as number} max={parts.total} color={c as string} />
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12 }}>ISO 16047 split at μₜ = {s.muT}, μ_b = {s.muB}: only ~10–15% of the wrench torque actually produces preload.</p>
        </Panel>
        <Panel title={`Preload at ${torque(T)} for different lubrication`}>
          <BarChart bars={lubBars} fy={(v) => num(v, metric ? 1 : 0)} />
          <p className="muted" style={{ fontSize: 12 }}>{metric ? 'kN' : 'lbf'}; red bars would yield the bolt. Never use a dry-thread torque value on a lubricated bolt.</p>
        </Panel>
        <Panel title={`Torque chart — ${g.name}, ${s.load}% proof, K = ${num(K, 2)}`} actions={<><Check label={metric ? 'Fine pitch' : 'UNF'} value={s.fine} onChange={(fine) => set({ fine })} /><CsvButton name="torque-chart.csv" rows={() => [['Thread', 'Stress area mm2', 'Preload N', 'Torque N·m', 'Torque ft·lb'], ...rows.map((r) => [r.x.id, +r.A.toFixed(2), Math.round(r.f), +r.tq.toFixed(2), +(r.tq * NM_TO_FTLB).toFixed(2)])]} /></>}>
          <Table
            head={['Thread', 'Aₛ mm²', 'Preload', 'Torque', '']}
            rows={rows.map((r) => [
              <b key="t" style={{ color: r.x.id === t.id ? 'var(--accent)' : undefined }}>{r.x.id}</b>, num(r.A, 1), force(r.f), torque(r.tq), <span key="2" className="muted">{torque2(r.tq)}</span>,
            ])}
          />
        </Panel>
      </div>
    </Split>
  )
}
