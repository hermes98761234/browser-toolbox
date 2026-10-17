import { Bar, Btn, CsvButton, Donut, JsonButtons, money, Note, Num, Panel, pct, Row, Seg, Select, Slider, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { breakdown, breakEvenUnits, marginToMarkup, markupToMargin, priceForMargin, priceForMarkup, pricePercentile, roundPrice, type Rounding } from './lib/pricing-calculator'

interface Item { id: string; name: string; amount: number }
interface Rival { id: string; name: string; price: number }
type Method = 'margin' | 'markup' | 'manual'
interface Inputs {
  product: string; currency: string; items: Item[]; laborMin: number; laborRate: number; overhead: number
  feePct: number; feeFixed: number; platformPct: number; method: Method; margin: number; markup: number; manual: number; rounding: Rounding
  fixedMonthly: number; volume: number; rivals: Rival[]
}
interface Scenario { id: string; name: string; data: Inputs }
interface State extends Inputs { scenarios: Scenario[] }

const DEF: State = {
  product: 'Handmade ceramic mug', currency: '$',
  items: [{ id: 'clay', name: 'Clay & glaze', amount: 3.2 }, { id: 'pack', name: 'Box & padding', amount: 1.15 }, { id: 'ship', name: 'Shipping label (avg.)', amount: 5.4 }, { id: 'kiln', name: 'Kiln energy', amount: 0.85 }],
  laborMin: 25, laborRate: 22, overhead: 1.5, feePct: 2.9, feeFixed: 0.3, platformPct: 6.5,
  method: 'margin', margin: 35, markup: 60, manual: 38, rounding: '99', fixedMonthly: 450, volume: 120,
  rivals: [{ id: 'r1', name: 'Etsy shop A', price: 32 }, { id: 'r2', name: 'Etsy shop B', price: 38 }, { id: 'r3', name: 'Local studio', price: 45 }, { id: 'r4', name: 'Mass-market store', price: 18 }],
  scenarios: [],
}
const ROUND: [Rounding, string][] = [['none', 'Exact'], ['cent', 'Up to cent'], ['99', 'Charm .99'], ['95', 'Charm .95'], ['49', '.49 / .99'], ['whole', 'Whole number'], ['5', 'Multiple of 5'], ['10', 'Multiple of 10']]

function compute(s: Inputs) {
  const labor = (s.laborMin / 60) * s.laborRate
  const cost = s.items.reduce((a, i) => a + i.amount, 0) + labor + s.overhead
  const fees = { pct: (s.feePct + s.platformPct) / 100, fixed: s.feeFixed }
  const raw = s.method === 'margin' ? priceForMargin(cost, s.margin / 100, fees) : s.method === 'markup' ? priceForMarkup(cost, s.markup / 100, fees) : s.manual
  const price = s.method === 'manual' ? raw : roundPrice(raw, s.rounding)
  const b = breakdown(price, cost, fees)
  return { labor, cost, fees, raw, price, b, be: breakEvenUnits(s.fixedMonthly, b.profit) }
}

export default function PricingCalculator() {
  const [s, set, reset] = useToolState('pricing-calculator', DEF)
  const m = (x: number) => money(x, s.currency)
  const { labor, cost, fees, raw, price, b, be } = compute(s)
  const ok = Number.isFinite(price) && price > 0
  const rivals = s.rivals.filter((r) => r.price > 0)
  const rp = rivals.map((r) => r.price)
  const avg = rp.length ? rp.reduce((a, x) => a + x, 0) / rp.length : NaN
  const maxP = Math.max(price || 0, ...rp, 1)
  const editItem = (id: string, p: Partial<Item>) => set({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) })
  const editRival = (id: string, p: Partial<Rival>) => set({ rivals: s.rivals.map((i) => (i.id === id ? { ...i, ...p } : i)) })
  const inputs = (): Inputs => { const { scenarios: _x, ...rest } = s; void _x; return rest }
  const monthlyProfit = b.profit * s.volume - s.fixedMonthly

  return (
    <Split>
      <div>
        <Panel title="Product & unit costs" actions={<Btn onClick={() => set({ items: [...s.items, { id: uid(), name: 'New cost', amount: 0 }] })}>+ Cost</Btn>}>
          <Row>
            <Txt label="Product" value={s.product} onChange={(product) => set({ product })} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
          </Row>
          <Table
            head={['Cost per unit', 'Amount', '']}
            rows={s.items.map((i) => [
              <input key="n" value={i.name} onChange={(e) => editItem(i.id, { name: e.target.value })} aria-label="Cost name" />,
              <input key="a" type="number" min={0} step="0.01" value={i.amount} onChange={(e) => editItem(i.id, { amount: Math.max(0, Number(e.target.value) || 0) })} aria-label="Amount" style={{ width: 90 }} />,
              <Btn key="x" kind="ghost" onClick={() => set({ items: s.items.filter((x) => x.id !== i.id) })} title="Remove">✕</Btn>,
            ])}
          />
          <Row>
            <Num label="Labour per unit" value={s.laborMin} onChange={(laborMin) => set({ laborMin })} min={0} unit="min" />
            <Num label="Hourly rate" value={s.laborRate} onChange={(laborRate) => set({ laborRate })} min={0} unit={s.currency.trim() + '/h'} />
            <Num label="Overhead / unit" value={s.overhead} onChange={(overhead) => set({ overhead })} min={0} unit={s.currency.trim()} hint="rent, tools, software ÷ units" />
          </Row>
        </Panel>
        <Panel title="Sales fees">
          <Row>
            <Num label="Payment fee" value={s.feePct} onChange={(feePct) => set({ feePct })} min={0} max={50} unit="%" />
            <Num label="+ fixed per sale" value={s.feeFixed} onChange={(feeFixed) => set({ feeFixed })} min={0} unit={s.currency.trim()} />
            <Num label="Marketplace fee" value={s.platformPct} onChange={(platformPct) => set({ platformPct })} min={0} max={60} unit="%" />
          </Row>
          <Row>
            {[['Stripe/PayPal', 2.9, 0.3, 0], ['Etsy', 3, 0.25, 6.5], ['Amazon', 0, 0, 15], ['eBay', 0, 0.3, 13.25], ['Shopify', 2.9, 0.3, 0], ['None', 0, 0, 0]].map(([n, a, f, p]) => (
              <Btn key={n as string} kind="ghost" onClick={() => set({ feePct: a as number, feeFixed: f as number, platformPct: p as number })}>{n}</Btn>
            ))}
          </Row>
        </Panel>
        <Panel title="Set the price">
          <Seg value={s.method} onChange={(method) => set({ method })} options={[['margin', 'Target margin'], ['markup', 'Markup on cost'], ['manual', 'My own price']]} label="Pricing method" />
          <div style={{ marginTop: 10 }}>
            {s.method === 'margin' && <Slider label="Net margin (profit ÷ price)" value={s.margin} onChange={(margin) => set({ margin })} min={0} max={90} unit="%" show={(v) => String(v)} />}
            {s.method === 'markup' && <Slider label="Markup (profit ÷ cost)" value={s.markup} onChange={(markup) => set({ markup })} min={0} max={400} step={5} unit="%" show={(v) => String(v)} />}
            {s.method === 'manual' && <Num label="Your price" value={s.manual} onChange={(manual) => set({ manual })} min={0} unit={s.currency.trim()} />}
            {s.method !== 'manual' && <Select label="Rounding" value={s.rounding} onChange={(rounding) => set({ rounding })} options={ROUND} />}
          </div>
          {s.method === 'margin' && !ok && <Note tone="err">Fees ({pct(fees.pct, 1)}) plus a {s.margin}% margin leave nothing for costs. Lower the margin.</Note>}
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
            <b>Markup ≠ margin.</b> A {s.markup}% markup is a {pct(markupToMargin(s.markup / 100), 1)} margin; a {s.margin}% margin needs a {pct(marginToMarkup(s.margin / 100), 1)} markup. Both are computed after fees.
          </p>
        </Panel>
        <Panel title="Break-even">
          <Row>
            <Num label="Fixed costs / month" value={s.fixedMonthly} onChange={(fixedMonthly) => set({ fixedMonthly })} min={0} unit={s.currency.trim()} />
            <Num label="Expected sales / month" value={s.volume} onChange={(volume) => set({ volume })} min={0} step={1} unit="units" />
          </Row>
          <p style={{ margin: 0 }}>Break-even at <b>{Number.isFinite(be) ? `${be} units` : 'never (no profit per unit)'}</b> a month. At {s.volume} units you {monthlyProfit >= 0 ? 'earn' : 'lose'} <b style={{ color: monthlyProfit >= 0 ? 'var(--ok)' : 'var(--err)' }}>{m(Math.abs(monthlyProfit))}</b> a month.</p>
          {Number.isFinite(be) && <Bar value={s.volume} max={Math.max(be, s.volume) * 1.1} color={s.volume >= be ? 'var(--ok)' : 'var(--warn)'} />}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Unit cost" value={m(cost)} sub={`incl. labour ${m(labor)}`} />
          <Stat label="Price" value={ok ? m(price) : '—'} tone="accent" sub={s.method !== 'manual' && ok && raw !== price ? `exact ${m(raw)}` : s.product} />
          <Stat label="Profit / unit" value={ok ? m(b.profit) : '—'} tone={b.profit >= 0 ? 'good' : 'bad'} sub={`after ${m(b.fees)} fees`} />
          <Stat label="Margin · markup" value={ok ? pct(b.margin, 1) : '—'} sub={ok ? `markup ${pct(b.markup, 0)}` : ''} />
        </Stats>
        {ok && b.profit < 0 && <Note tone="err">This price loses {m(-b.profit)} on every sale.</Note>}
        <Panel title="Where each sale goes">
          {ok && <Donut slices={[{ label: 'Product cost', value: cost - labor, color: '#64748b' }, { label: 'Labour', value: labor, color: '#0ea5e9' }, { label: 'Fees', value: b.fees, color: '#f59e0b' }, { label: 'Profit', value: Math.max(0, b.profit), color: '#10b981' }]} fv={m} center={<span>{m(price)}</span>} />}
        </Panel>
        <Panel title="Competitors" actions={<Btn onClick={() => set({ rivals: [...s.rivals, { id: uid(), name: 'Competitor', price: 0 }] })}>+ Competitor</Btn>}>
          <Table
            head={['Who', 'Price', 'Position', 'You vs them', '']}
            rows={[
              [<b key="y">You · {s.product}</b>, <b key="p">{ok ? m(price) : '—'}</b>, <div key="b" style={{ minWidth: 110 }}><Bar value={price || 0} max={maxP} /></div>, '', ''],
              ...s.rivals.map((r) => [
                <input key="n" value={r.name} onChange={(e) => editRival(r.id, { name: e.target.value })} aria-label="Competitor" />,
                <input key="p" type="number" min={0} step="0.01" value={r.price} onChange={(e) => editRival(r.id, { price: Math.max(0, Number(e.target.value) || 0) })} aria-label="Price" style={{ width: 80 }} />,
                <div key="b" style={{ minWidth: 110 }}><Bar value={r.price} max={maxP} color="var(--muted)" /></div>,
                <span key="d" style={{ color: price > r.price ? 'var(--warn)' : 'var(--ok)', fontWeight: 600 }}>{r.price && ok ? `${price >= r.price ? '+' : ''}${pct((price - r.price) / r.price, 0)}` : ''}</span>,
                <Btn key="x" kind="ghost" onClick={() => set({ rivals: s.rivals.filter((x) => x.id !== r.id) })} title="Remove">✕</Btn>,
              ]),
            ]}
          />
          {rp.length > 0 && ok && (
            <p style={{ marginBottom: 0 }}>
              Market range {m(Math.min(...rp))} – {m(Math.max(...rp))}, average {m(avg)}. You are <b>{pct(Math.abs(price - avg) / avg, 0)} {price >= avg ? 'above' : 'below'}</b> average and pricier than {pct(pricePercentile(price, rp), 0)} of competitors.
              {Math.min(...rp) < cost && <span className="muted"> The cheapest rival sells below your unit cost; compete on value, not price.</span>}
            </p>
          )}
        </Panel>
        <Panel title="Margin ladder">
          <Table
            head={['Margin', 'Markup', 'Price', 'Profit', 'Rounded']}
            rows={[20, 30, 40, 50, 60, 70].map((mg) => {
              const p = priceForMargin(cost, mg / 100, fees)
              return [`${mg}%`, pct(marginToMarkup(mg / 100), 0), Number.isFinite(p) ? m(p) : '—', Number.isFinite(p) ? m(p * (mg / 100)) : '—', Number.isFinite(p) ? m(roundPrice(p, s.rounding)) : '—']
            })}
          />
        </Panel>
        <Panel title="Scenarios" actions={<>
          <Btn kind="primary" onClick={() => set({ scenarios: [...s.scenarios, { id: uid(), name: `${s.product} · ${ok ? m(price) : '?'}`, data: inputs() }] })}>Save current</Btn>
          <CsvButton name="pricing-scenarios.csv" rows={() => [['Scenario', 'Unit cost', 'Price', 'Profit', 'Margin %'], ...s.scenarios.map((sc) => { const c = compute(sc.data); return [sc.name, +c.cost.toFixed(2), +c.price.toFixed(2), +c.b.profit.toFixed(2), +(c.b.margin * 100).toFixed(1)] })]} />
          <JsonButtons name="pricing.json" data={s} onLoad={(d) => set(d)} />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </>}>
          {s.scenarios.length ? (
            <Table
              head={['Scenario', 'Cost', 'Price', 'Profit', 'Margin', '']}
              rows={s.scenarios.map((sc) => {
                const c = compute(sc.data)
                return [
                  <input key="n" value={sc.name} onChange={(e) => set({ scenarios: s.scenarios.map((x) => (x.id === sc.id ? { ...x, name: e.target.value } : x)) })} aria-label="Scenario name" />,
                  money(c.cost, sc.data.currency), money(c.price, sc.data.currency), money(c.b.profit, sc.data.currency), pct(c.b.margin, 1),
                  <span key="a" style={{ whiteSpace: 'nowrap' }}><Btn kind="ghost" onClick={() => set({ ...sc.data })}>Load</Btn><Btn kind="ghost" onClick={() => set({ scenarios: s.scenarios.filter((x) => x.id !== sc.id) })} title="Delete">✕</Btn></span>,
                ]
              })}
            />
          ) : <p className="muted" style={{ margin: 0 }}>Save the current setup to compare options side by side, e.g. “wholesale vs. retail” or “Etsy vs. own shop”.</p>}
        </Panel>
      </div>
    </Split>
  )
}
