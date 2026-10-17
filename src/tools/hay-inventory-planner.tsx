import { Btn, color, CsvButton, JsonButtons, LineChart, money, Note, num, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { ANIMALS, BALE_TYPES, budget, dailyPerHead, seasonDays, WASTE, type Bales, type Group } from './lib/hay-inventory-planner'

const LB = 0.45359237
const Y = new Date().getFullYear()
const DEF = {
  units: 'imperial' as 'imperial' | 'metric',
  start: `${Y}-11-01`,
  end: `${Y + 1}-04-15`,
  dm: 88,
  waste: 15,
  safety: 10,
  price: 180,
  buyType: 'Round 5×5 ft',
  groups: [
    { id: 'g1', kind: 'Beef cow', count: 12, weightKg: 600, intakePct: 2.5, pasturePct: 0 },
    { id: 'g2', kind: 'Horse', count: 3, weightKg: 500, intakePct: 2, pasturePct: 20 },
    { id: 'g3', kind: 'Sheep', count: 20, weightKg: 70, intakePct: 3, pasturePct: 0 },
  ] as Group[],
  bales: [
    { id: 'b1', type: 'Round 5×5 ft', count: 85, weightKg: 520 },
    { id: 'b2', type: 'Small square (2-string)', count: 150, weightKg: 23 },
  ] as Bales[],
}

export default function HayInventoryPlanner() {
  const [s, set, reset] = useToolState('hay-inventory-planner', DEF)
  const imp = s.units === 'imperial'
  const wU = imp ? 'lb' : 'kg'
  const toU = (kg: number) => (imp ? kg / LB : kg)
  const fromU = (v: number) => (imp ? v * LB : v)
  const tonKg = imp ? 2000 * LB : 1000
  const tonU = imp ? 'ton' : 't'
  const days = seasonDays(s.start, s.end)
  const b = budget(s.groups, s.bales, s.dm, s.waste, days, s.safety)
  const buyW = BALE_TYPES[s.buyType] ?? 500
  const toBuy = Math.ceil(b.shortfall / buyW)
  const cost = (b.shortfall / tonKg) * s.price
  const runOut = new Date(Date.parse(s.start) + Math.floor(b.daysCovered) * 86400000)
  const edG = (id: string, p: Partial<Group>) => set({ groups: s.groups.map((g) => (g.id === id ? { ...g, ...p } : g)) })
  const edB = (id: string, p: Partial<Bales>) => set({ bales: s.bales.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const fmtW = (kg: number) => `${num(toU(kg), 0)} ${wU}`
  const fmtT = (kg: number) => `${num(kg / tonKg, 1)} ${tonU}`
  const step = Math.max(1, Math.round(days / 60))
  const pts = (Array.from({ length: Math.floor(days / step) + 1 }, (_, i) => i * step))
  const reserve = s.safety / 100 * b.daily * days

  return (
    <Split wide="right">
      <div>
        <Panel title="Feeding season" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.units} onChange={(units) => set({ units })} options={[['imperial', 'lb / short ton'], ['metric', 'kg / tonne']]} label="Units" />
          <Row>
            <label className="k-field"><span className="k-label">Start feeding hay</span><input className="k-text" type="date" value={s.start} onChange={(e) => e.target.value && set({ start: e.target.value })} /></label>
            <label className="k-field"><span className="k-label">Grass is back</span><input className="k-text" type="date" value={s.end} onChange={(e) => e.target.value && set({ end: e.target.value })} /></label>
          </Row>
          {days === 0 && <Note tone="err">End date must be after start date.</Note>}
          <Row>
            <Num label="Hay dry matter" value={s.dm} onChange={(dm) => set({ dm })} unit="%" min={50} max={100} hint="typical 85–90%" />
            <Num label="Safety margin" value={s.safety} onChange={(safety) => set({ safety })} unit="%" min={0} max={100} hint="for a long winter" />
          </Row>
          <Select label="Feeding method (waste)" value={s.waste} onChange={(waste) => set({ waste })} options={[...WASTE.map(([n, w]) => [w, `${n} — ${w}%`] as const), ...(WASTE.some(([, w]) => w === s.waste) ? [] : [[s.waste, `Custom — ${s.waste}%`] as const])]} />
          <Num label="Custom waste" value={s.waste} onChange={(waste) => set({ waste })} unit="%" min={0} max={80} />
        </Panel>
        <Panel title="Herd" actions={<Btn onClick={() => set({ groups: [...s.groups, { id: uid(), kind: 'Goat', count: 5, weightKg: ANIMALS.Goat.weight, intakePct: ANIMALS.Goat.intake, pasturePct: 0 }] })}>+ Group</Btn>}>
          {s.groups.map((g, i) => (
            <div key={g.id} style={{ borderLeft: `4px solid ${color(i)}`, paddingLeft: 10, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select className="k-select" value={g.kind} onChange={(e) => { const a = ANIMALS[e.target.value]; edG(g.id, { kind: e.target.value, weightKg: a.weight, intakePct: a.intake }) }} aria-label="Animal" style={{ flex: 1 }}>
                  {Object.keys(ANIMALS).map((k) => <option key={k}>{k}</option>)}
                </select>
                <Btn kind="ghost" title="Remove" onClick={() => set({ groups: s.groups.filter((x) => x.id !== g.id) })}>✕</Btn>
              </div>
              <Row>
                <Num label="Head" value={g.count} onChange={(count) => edG(g.id, { count })} min={0} step={1} />
                <Num label="Avg weight" value={Math.round(toU(g.weightKg))} onChange={(v) => edG(g.id, { weightKg: fromU(v) })} unit={wU} min={1} />
                <Num label="DM intake" value={g.intakePct} onChange={(intakePct) => edG(g.id, { intakePct })} unit="% BW" min={0.5} max={6} step={0.1} />
                <Num label="From pasture" value={g.pasturePct} onChange={(pasturePct) => edG(g.id, { pasturePct })} unit="%" min={0} max={100} />
              </Row>
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>{fmtW(dailyPerHead(g, s.dm, s.waste))} hay offered per head per day</p>
            </div>
          ))}
        </Panel>
        <Panel title="Bales on hand" actions={<Btn onClick={() => set({ bales: [...s.bales, { id: uid(), type: 'Small square (3-string)', count: 50, weightKg: BALE_TYPES['Small square (3-string)'] }] })}>+ Bales</Btn>}>
          <Table
            head={['Bale type', 'Count', `Weight (${wU})`, 'Total', '']}
            rows={s.bales.map((x) => [
              <select key="t" value={x.type} onChange={(e) => edB(x.id, { type: e.target.value, weightKg: BALE_TYPES[e.target.value] })} aria-label="Bale type">{Object.keys(BALE_TYPES).map((k) => <option key={k}>{k}</option>)}</select>,
              <input key="c" type="number" min={0} value={x.count} onChange={(e) => edB(x.id, { count: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 70 }} aria-label="Count" />,
              <input key="w" type="number" min={1} value={Math.round(toU(x.weightKg))} onChange={(e) => edB(x.id, { weightKg: fromU(Math.max(1, Number(e.target.value) || 1)) })} style={{ width: 80 }} aria-label="Weight" />,
              fmtT(x.count * x.weightKg),
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ bales: s.bales.filter((y) => y.id !== x.id) })}>✕</Btn>,
            ])}
            foot={['Total', String(s.bales.reduce((a, x) => a + x.count, 0)), '', fmtT(b.onHand), '']}
          />
          <p className="muted" style={{ fontSize: 12 }}>Weights are typical defaults — weigh a few of yours; bale weight varies ±25% with density and moisture.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Season" value={`${days} days`} sub={`${fmtW(b.daily)} per day`} />
          <Stat label="Hay needed" value={fmtT(b.need)} sub={`incl. ${s.safety}% margin`} />
          <Stat label="On hand" value={fmtT(b.onHand)} sub={Number.isFinite(b.daysCovered) ? `lasts ${Math.floor(b.daysCovered)} days` : '—'} />
          <Stat label={b.shortfall > 0 ? 'Shortfall' : 'Surplus'} value={fmtT(b.shortfall || b.surplus)} tone={b.shortfall > 0 ? 'bad' : 'good'} sub={b.shortfall > 0 ? `${toBuy} × ${s.buyType.split(' (')[0]}` : 'you are covered'} />
        </Stats>
        {b.shortfall > 0 ? (
          <Note tone="err">At this rate your hay runs out around <b>{runOut.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</b> — {Math.max(0, days - Math.floor(b.daysCovered))} days early. Buy about {toBuy} bales ({fmtT(b.shortfall)}), roughly {money(cost, '$', 0)} at {money(s.price, '$', 0)}/{tonU}.</Note>
        ) : (
          <Note tone="ok">Enough hay for the whole season with {fmtT(b.surplus)} to spare ({Number.isFinite(b.daysCovered) ? Math.floor(b.daysCovered - days) : 0} extra days).</Note>
        )}
        <Panel title="Inventory through the season">
          <LineChart
            series={[
              { name: 'Hay left', points: pts.map((d) => [d, Math.max(0, (b.onHand - b.daily * d) / tonKg)]), color: '#10b981', area: true },
              { name: 'Needed to finish the season (+ margin)', points: pts.map((d) => [d, (b.daily * (days - d) + reserve) / tonKg]), color: '#ef4444', dashed: true },
            ]}
            xLabel="Days into the season"
            yLabel={tonU}
            fx={(v) => String(Math.round(v))}
            fy={(v) => v.toFixed(0)}
            markers={b.daysCovered < days ? [{ x: Math.floor(b.daysCovered), label: 'runs out' }] : []}
          />
        </Panel>
        <Panel title="Daily use by group" actions={<CsvButton name="hay-plan.csv" rows={() => [['Group', 'Head', `Per head/day (${wU})`, `Group/day (${wU})`, `Season (${tonU})`], ...s.groups.map((g) => { const d = dailyPerHead(g, s.dm, s.waste); return [g.kind, g.count, toU(d).toFixed(1), toU(d * g.count).toFixed(0), ((d * g.count * days) / tonKg).toFixed(2)] })]} />}>
          <Table
            head={['Group', 'Head', 'Per head/day', 'Group/day', 'Season', 'Share']}
            rows={s.groups.map((g, i) => {
              const d = dailyPerHead(g, s.dm, s.waste) * g.count
              return [<b key="k" style={{ color: color(i) }}>{g.kind}</b>, g.count, fmtW(d / (g.count || 1)), fmtW(d), fmtT(d * days), `${((d / (b.daily || 1)) * 100).toFixed(0)}%`]
            })}
          />
        </Panel>
        <Panel title="Buying the shortfall" actions={<JsonButtons name="hay-plan.json" data={s} onLoad={(d) => set(d)} />}>
          <Row>
            <Select label="Bale type to buy" value={s.buyType} onChange={(buyType) => set({ buyType })} options={Object.keys(BALE_TYPES)} />
            <Num label={`Price per ${tonU}`} value={s.price} onChange={(price) => set({ price })} unit="$" min={0} />
          </Row>
          <Table
            head={['Bale type', 'Weight', 'Bales to cover need', 'Bales to buy']}
            rows={Object.entries(BALE_TYPES).map(([t, w]) => [t, fmtW(w), num(Math.ceil(b.need / w), 0), b.shortfall > 0 ? <b key="b">{num(Math.ceil(b.shortfall / w), 0)}</b> : '0'])}
          />
        </Panel>
      </div>
    </Split>
  )
}
