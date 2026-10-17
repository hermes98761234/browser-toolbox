import { useMemo, useState } from 'react'
import { Btn, CsvButton, LineChart, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, Txt, money, num, pct, useToolState } from '../kit'
import { calc, costAt, sawtooth, simulate, type Inputs } from './lib/reorder-point-calculator'

interface State extends Inputs { name: string; cur: string; onHand: number }
const DEF: State = { name: 'Coffee beans 1 kg', cur: '$', onHand: 720, demand: 40, demandSd: 10, lead: 9, leadSd: 2, service: 95, days: 365, orderCost: 80, unitCost: 25, holdPct: 20 }
const PRESETS: { name: string; v: Partial<State> }[] = [
  { name: 'Café coffee beans', v: { name: 'Coffee beans 1 kg', demand: 40, demandSd: 10, lead: 9, leadSd: 2, orderCost: 80, unitCost: 25, holdPct: 20, days: 365, onHand: 720 } },
  { name: 'Online shop SKU', v: { name: 'Phone case', demand: 12, demandSd: 6, lead: 21, leadSd: 5, orderCost: 150, unitCost: 4, holdPct: 25, days: 365, onHand: 300 } },
  { name: 'Factory spare part', v: { name: 'Bearing 6204', demand: 3, demandSd: 1.5, lead: 30, leadSd: 7, orderCost: 60, unitCost: 18, holdPct: 22, days: 250, onHand: 140 } },
  { name: 'Pharmacy item', v: { name: 'Paracetamol 500 mg', demand: 85, demandSd: 20, lead: 3, leadSd: 0.5, orderCost: 25, unitCost: 1.2, holdPct: 30, days: 360, onHand: 300 } },
]
const LEVELS = [85, 90, 95, 97.5, 99, 99.5, 99.9]

export default function ReorderPointCalculator() {
  const [s, set, reset] = useToolState('reorder-point-calculator', DEF)
  const [seed, setSeed] = useState(7)
  const valid = s.demand > 0 && s.lead >= 0 && s.demandSd >= 0 && s.leadSd >= 0 && s.unitCost > 0 && s.holdPct > 0 && s.orderCost >= 0 && s.service > 0 && s.service < 100
  const r = useMemo(() => calc(s), [s])
  const m = (x: number, d = 2) => money(x, s.cur, d)
  const Q = Math.max(1, Math.round(r.eoq))
  const ROP = Math.ceil(r.rop)
  const sim = useMemo(() => (valid ? simulate(s, ROP, Q, 365, seed) : null), [s, ROP, Q, seed, valid])
  const horizon = Math.min(365, Math.max(30, Math.ceil(r.cycle * 3.2)))
  const saw = valid ? sawtooth(r.eoq, r.rop, r.ss, s.demand, s.lead, horizon) : []
  const costPts = useMemo(() => {
    if (!valid) return null
    const qs = Array.from({ length: 60 }, (_, i) => r.eoq * (0.2 + (i / 59) * 2.8))
    const c = qs.map((q) => ({ q, ...costAt(q, r.D, s.orderCost, r.H) }))
    return { ord: c.map((x) => [x.q, x.ordering] as [number, number]), hold: c.map((x) => [x.q, x.holding] as [number, number]), tot: c.map((x) => [x.q, x.ordering + x.holding] as [number, number]) }
  }, [valid, r, s.orderCost])
  const position = s.onHand
  const orderNow = position <= ROP
  const daysToRop = (position - r.rop) / s.demand

  return (
    <Split>
      <div>
        <Panel title="Item" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>{PRESETS.map((p) => <Btn key={p.name} onClick={() => set(p.v)}>{p.name}</Btn>)}</Row>
          <Row>
            <Txt label="Item" value={s.name} onChange={(name) => set({ name })} />
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', '₴', 'zł', '¥']} />
          </Row>
        </Panel>
        <Panel title="Demand & lead time">
          <Row>
            <Num label="Avg demand" value={s.demand} onChange={(demand) => set({ demand })} unit="/day" min={0} />
            <Num label="Demand std dev" value={s.demandSd} onChange={(demandSd) => set({ demandSd })} unit="/day" min={0} />
          </Row>
          <Row>
            <Num label="Lead time" value={s.lead} onChange={(lead) => set({ lead })} unit="days" min={0} />
            <Num label="Lead time std dev" value={s.leadSd} onChange={(leadSd) => set({ leadSd })} unit="days" min={0} />
          </Row>
          <Slider label="Cycle service level" value={s.service} onChange={(service) => set({ service })} min={80} max={99.9} step={0.1} unit="%" show={(v) => num(v, 1)} />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Probability of not running out during a replenishment cycle → z = <b>{num(r.z, 3)}</b></p>
        </Panel>
        <Panel title="Costs (for EOQ)">
          <Row>
            <Num label="Cost per order" value={s.orderCost} onChange={(orderCost) => set({ orderCost })} unit={s.cur} min={0} />
            <Num label="Unit cost" value={s.unitCost} onChange={(unitCost) => set({ unitCost })} unit={s.cur} min={0} />
          </Row>
          <Row>
            <Num label="Holding cost" value={s.holdPct} onChange={(holdPct) => set({ holdPct })} unit="%/yr" min={0} />
            <Select label="Operating days / year" value={s.days} onChange={(days) => set({ days })} options={[[365, '365 (every day)'], [360, '360'], [312, '312 (6-day week)'], [260, '260 (5-day week)'], [250, '250 (working days)']]} />
          </Row>
        </Panel>
        <Panel title="Check current stock">
          <Num label="Inventory position (on hand + on order − backorders)" value={s.onHand} onChange={(onHand) => set({ onHand })} unit="units" min={0} />
          {valid && (orderNow ? <Note tone="err">At or below the reorder point — place an order of <b>{Q}</b> units now.</Note> : <Note tone="ok">Above the reorder point. At {num(s.demand, 1)}/day you’ll hit {ROP} in about <b>{num(daysToRop, 1)} days</b>.</Note>)}
        </Panel>
      </div>
      <div>
        {!valid && <Note tone="err">Demand, unit cost and holding cost must be above zero, and service level between 0 and 100%.</Note>}
        <Stats>
          <Stat label="Reorder point" value={num(ROP, 0)} sub={`${num(r.ltDemand, 0)} lead-time demand + safety`} tone="accent" />
          <Stat label="Safety stock" value={num(Math.ceil(r.ss), 0)} sub={`z ${num(r.z, 2)} × σ ${num(r.sigmaLT, 1)}`} />
          <Stat label="EOQ" value={num(Q, 0)} sub={`${num(r.orders, 1)} orders/yr · every ${num(r.cycle, 1)} d`} />
          <Stat label="Annual cost" value={m(r.total, 0)} sub={`avg stock ${num(r.avgInv, 0)} units`} />
        </Stats>
        <Panel title="Stock cycle">
          <LineChart
            series={[
              { name: 'On hand', points: saw, area: true },
              { name: 'Reorder point', points: [[0, r.rop], [horizon, r.rop]], dashed: true, color: '#f59e0b' },
              { name: 'Safety stock', points: [[0, r.ss], [horizon, r.ss]], dashed: true, color: '#ef4444' },
            ]}
            xLabel="days" fx={(v) => num(v, 0)} fy={(v) => num(v, 0)} height={250}
          />
          <p className="muted" style={{ fontSize: 13 }}>Order {Q} units each time stock falls to {ROP}; the order lands {s.lead} days later, just as stock reaches the safety buffer (on an average day).</p>
        </Panel>
        {costPts && (
          <Panel title="Cost vs order quantity">
            <LineChart series={[{ name: 'Total', points: costPts.tot }, { name: 'Ordering', points: costPts.ord, dashed: true }, { name: 'Holding', points: costPts.hold, dashed: true }]} markers={[{ x: r.eoq, label: `EOQ ${Q}` }]} xLabel="order quantity" fx={(v) => num(v, 0)} fy={(v) => m(v, 0)} height={220} />
          </Panel>
        )}
        <Panel title="Service level trade-off" actions={<CsvButton name="reorder-levels.csv" rows={() => [['Service %', 'z', 'Safety stock', 'Reorder point', 'Safety stock cost/yr'], ...LEVELS.map((L) => { const x = calc({ ...s, service: L }); return [L, x.z.toFixed(3), Math.ceil(x.ss), Math.ceil(x.rop), x.ssCost.toFixed(2)] })]} />}>
          <Table head={['Service', 'z', 'Safety stock', 'Reorder point', 'Holding cost of SS']} rows={LEVELS.map((L) => { const x = calc({ ...s, service: L }); const on = Math.abs(L - s.service) < 0.05; const b = (v: string | number) => (on ? <b>{v}</b> : v); return [b(`${L}%`), b(num(x.z, 3)), b(num(Math.ceil(x.ss), 0)), b(num(Math.ceil(x.rop), 0)), b(m(x.ssCost, 0) + '/yr')] })} />
        </Panel>
        {sim && (
          <Panel title="365-day simulation" actions={<Btn onClick={() => setSeed((x) => x + 1)}>🎲 Re-run</Btn>}>
            <Stats>
              <Stat label="Fill rate" value={pct(sim.fill, 2)} sub="demand served from stock" tone={sim.fill >= 0.98 ? 'good' : 'bad'} />
              <Stat label="Cycle service" value={pct(sim.csl, 1)} sub={`target ${s.service}% · ${sim.cycles} deliveries`} />
              <Stat label="Stock-out days" value={sim.stockoutDays} />
            </Stats>
            <LineChart series={[{ name: 'On hand', points: sim.trace, area: true }, { name: 'Reorder point', points: [[0, ROP], [364, ROP]], dashed: true, color: '#f59e0b' }]} xLabel="day" fx={(v) => num(v, 0)} fy={(v) => num(v, 0)} height={180} />
            <p className="muted" style={{ fontSize: 13 }}>Random daily demand and lead times (normal, with your std devs), continuous review. Results vary by run; the formula assumes normal lead-time demand.</p>
          </Panel>
        )}
      </div>
    </Split>
  )
}
