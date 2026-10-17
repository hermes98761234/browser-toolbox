import { CsvButton, LineChart, Note, Num, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, Table, Check, Btn, num, useToolState } from '../kit'
import { budget, demandGpm, evaluateSizes, FIXTURES, frictionPsi100, MATERIALS, maxFlow, SIZES, wsfuFor } from './lib/pipe-sizing-calculator'

const DEF = {
  occ: 'priv' as 'priv' | 'pub',
  counts: { 'Bathroom group (tank WC)': 2, 'Kitchen sink': 1, Dishwasher: 1, 'Clothes washer': 1, 'Hose bibb': 2, Lavatory: 1, 'Water closet, flush tank': 1 } as Record<string, number>,
  forceValve: false,
  material: 0,
  line: 'cold' as 'cold' | 'hot',
  vmax: 8,
  supply: 60,
  elevation: 20,
  minPressure: 8,
  meterLoss: 4,
  otherLoss: 2,
  length: 120,
  fittingPct: 50,
}

const PRESETS: Record<string, Partial<typeof DEF>> = {
  'Single-family home': { occ: 'priv', counts: DEF.counts, length: 120, elevation: 20 },
  'Duplex (2 units)': { occ: 'priv', counts: { 'Bathroom group (tank WC)': 4, 'Kitchen sink': 2, Dishwasher: 2, 'Clothes washer': 2, 'Hose bibb': 2 }, length: 150, elevation: 25 },
  'Office restroom core': { occ: 'pub', counts: { 'Water closet, flushometer valve': 6, 'Urinal, flushometer valve': 3, Lavatory: 6, 'Service / mop sink': 1, 'Drinking fountain': 2 }, length: 200, elevation: 30, minPressure: 25 },
}

export default function PipeSizingCalculator() {
  const [s, set, reset] = useToolState('pipe-sizing-calculator', DEF)
  const mat = MATERIALS[s.material] ?? MATERIALS[0]
  const fu = (f: (typeof FIXTURES)[number]) => (s.occ === 'priv' ? f.priv || f.pub : f.pub || f.priv)
  const wsfu = FIXTURES.reduce((a, f) => a + (s.counts[f.name] ?? 0) * fu(f), 0)
  const valves = s.forceValve || FIXTURES.some((f) => f.valve && (s.counts[f.name] ?? 0) > 0)
  const q = demandGpm(wsfu, valves)
  const b = budget(s)
  const rows = evaluateSizes(q, mat, s.vmax, b.allowable, b.equivLength)
  const pick = rows.find((r) => r.okV && r.okF)
  const fails = b.available <= 0
  const setCount = (name: string, v: number) => set({ counts: { ...s.counts, [name]: Math.max(0, Math.round(v)) } })
  const chartSizes = SIZES.slice(0, 6)
  const qMax = Math.max(10, q * 2)

  return (
    <Split>
      <div>
        <Panel title="Fixtures" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            {Object.keys(PRESETS).map((k) => <Btn key={k} onClick={() => set({ ...DEF, ...PRESETS[k] })}>{k}</Btn>)}
          </Row>
          <div style={{ margin: '10px 0' }}>
            <Seg value={s.occ} onChange={(occ) => set({ occ })} options={[['priv', 'Private (dwelling)'], ['pub', 'Public / commercial']]} />
          </div>
          <Table
            head={['Fixture', 'WSFU', 'Count', 'Total']}
            rows={FIXTURES.map((f) => [
              f.name,
              fu(f),
              <input key="c" className="k-text" type="number" min={0} step={1} style={{ width: 64 }} value={s.counts[f.name] ?? 0} onChange={(e) => setCount(f.name, Number(e.target.value) || 0)} />,
              num((s.counts[f.name] ?? 0) * fu(f), 2),
            ])}
            foot={['Total', '', '', <b key="t">{num(wsfu, 2)}</b>]}
          />
          <Check label="Treat as flush-valve system (auto when flushometers are present)" value={valves} onChange={(forceValve) => set({ forceValve })} />
        </Panel>
        <Panel title="Pressure budget">
          <Row>
            <Num label="Pressure at main / meter" value={s.supply} onChange={(supply) => set({ supply })} unit="psi" min={0} />
            <Num label="Height to highest fixture" value={s.elevation} onChange={(elevation) => set({ elevation })} unit="ft" />
          </Row>
          <Row>
            <Num label="Minimum at fixture" value={s.minPressure} onChange={(minPressure) => set({ minPressure })} unit="psi" min={0} hint="8 psi typical, 15–25 for flush valves" />
            <Num label="Meter loss" value={s.meterLoss} onChange={(meterLoss) => set({ meterLoss })} unit="psi" min={0} />
          </Row>
          <Row>
            <Num label="Other losses" value={s.otherLoss} onChange={(otherLoss) => set({ otherLoss })} unit="psi" min={0} hint="backflow preventer, softener, PRV…" />
            <Num label="Developed length" value={s.length} onChange={(length) => set({ length })} unit="ft" min={1} />
          </Row>
          <Slider label="Fittings allowance" value={s.fittingPct} min={0} max={100} step={5} unit="%" onChange={(fittingPct) => set({ fittingPct })} />
        </Panel>
        <Panel title="Pipe">
          <Select label="Material" value={s.material} onChange={(material) => set({ material, vmax: s.line === 'hot' ? MATERIALS[material].hotV : MATERIALS[material].coldV })} options={MATERIALS.map((m, i) => [i, `${m.name} (C = ${m.C})`] as const)} />
          <Seg value={s.line} onChange={(line) => set({ line, vmax: line === 'hot' ? mat.hotV : mat.coldV })} options={[['cold', 'Cold water'], ['hot', 'Hot water']]} />
          <Slider label="Velocity limit" value={s.vmax} min={3} max={10} step={0.5} unit=" ft/s" onChange={(vmax) => set({ vmax })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Fixture units" value={num(wsfu, 1)} sub={valves ? 'flush-valve curve' : 'flush-tank curve'} />
          <Stat label="Peak demand" value={`${num(q, 1)} gpm`} sub={`${num(q * 0.0630902, 2)} L/s`} />
          <Stat label="Allowable friction" value={fails ? '—' : `${num(b.allowable, 2)} psi`} sub="per 100 ft" />
          <Stat label="Recommended size" value={fails ? 'n/a' : pick ? `${pick.size}"` : '> 4"'} sub={pick ? `${mat.name}, ID ${pick.id}"` : undefined} tone={pick && !fails ? 'good' : 'bad'} />
        </Stats>
        {fails ? (
          <Note tone="err">The supply pressure ({s.supply} psi) cannot cover static head ({num(b.static, 1)} psi), the fixture minimum and meter/device losses. Add a booster pump or reduce losses.</Note>
        ) : (
          <Note tone="ok">
            {num(b.available, 1)} psi is available for friction over {num(b.equivLength, 0)} ft equivalent length ({s.length} ft + {s.fittingPct}% fittings).
            {pick && <> The {pick.size}" pipe flows {num(q, 1)} gpm at {num(pick.v, 1)} ft/s and loses {num(pick.drop, 1)} psi, leaving {num(b.available - pick.drop + s.minPressure, 1)} psi at the highest fixture.</>}
          </Note>
        )}
        <Panel title="All sizes at this demand" actions={<CsvButton name="pipe-sizing.csv" rows={() => [['Size in', 'ID in', 'Velocity ft/s', 'Friction psi/100ft', 'Pressure drop psi', 'OK'], ...rows.map((r) => [r.size, r.id, r.v.toFixed(2), r.f.toFixed(2), r.drop.toFixed(2), r.okV && r.okF ? 'yes' : 'no'])]} />}>
          <Table
            head={['Nominal', 'ID', 'Velocity', 'Friction /100 ft', 'Drop', '']}
            rows={rows.map((r) => [
              <b key="s">{r.size}"</b>, `${r.id}"`,
              <span key="v" style={{ color: r.okV ? undefined : 'var(--err)' }}>{num(r.v, 2)} ft/s</span>,
              <span key="f" style={{ color: r.okF ? undefined : 'var(--err)' }}>{num(r.f, 2)} psi</span>,
              `${num(r.drop, 2)} psi`,
              r === pick ? '✅ smallest OK' : r.okV && r.okF ? '✓' : r.okV ? 'too much friction' : 'too fast',
            ])}
          />
        </Panel>
        <Panel title="Friction loss vs flow">
          <LineChart
            height={260}
            xLabel="flow (gpm)"
            yLabel="psi / 100 ft"
            fx={(v) => num(v, 0)}
            fy={(v) => num(v, 0)}
            yMax={Math.max(10, Math.min(60, (fails ? 10 : b.allowable) * 2))}
            yMin={0}
            markers={[{ x: q, label: `demand ${num(q, 1)} gpm` }]}
            series={[
              ...chartSizes.map((sz, i) => ({ name: `${sz}"`, points: Array.from({ length: 41 }, (_, k) => { const qq = (k / 40) * qMax; return [qq, Math.min(60, frictionPsi100(qq, mat.id[i], mat.C))] as [number, number] }) })),
              ...(fails ? [] : [{ name: 'Allowable', points: [[0, b.allowable], [qMax, b.allowable]] as [number, number][], dashed: true, color: '#ef4444' }]),
            ]}
          />
        </Panel>
        <Panel title={`Capacity by size — ${mat.name}`}>
          <Table
            head={['Nominal', 'Max flow', 'Max WSFU', 'Limited by']}
            rows={SIZES.map((sz, i) => {
              const qv = (s.vmax * mat.id[i] ** 2) / 0.4085
              const qm = maxFlow(mat.id[i], mat.C, s.vmax, fails ? 0 : b.allowable)
              return [`${sz}"`, `${num(qm, 1)} gpm`, num(wsfuFor(qm, valves), 0), qm < qv - 1e-9 ? 'friction' : 'velocity']
            })}
          />
          <Note>
            Demand uses Hunter's probability curve (IPC Appendix E, Table E103.3(3)); friction uses Hazen-Williams, h = 4.52·Q^1.852 / (C^1.852·d^4.87) psi/ft; velocity = 0.4085·Q/d² ft/s. Always check your local code tables and the fixture manufacturer's minimum pressures.
          </Note>
        </Panel>
      </div>
    </Split>
  )
}
