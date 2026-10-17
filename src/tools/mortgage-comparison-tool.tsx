import { useMemo } from 'react'
import { Btn, color, CsvButton, JsonButtons, LineChart, money, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { amortize, breakEven, costAt, summarize, type Offer } from './lib/mortgage-comparison-tool'

type O = Offer & { id: string }
const mk = (name: string, rate: number, years: number, fees: number, armYears = 0, armRate = 0): O => ({ id: uid(), name, principal: 320000, rate, years, fees, armYears, armRate, extra: 0 })
const DEF = {
  currency: '$', horizon: 7, view: 0,
  offers: [mk('Bank A — 30y fixed', 6.5, 30, 4000), mk('Bank B — 30y + 1 point', 6.125, 30, 7200), mk('Credit union — 15y', 5.75, 15, 3500), mk('Lender C — 5/6 ARM', 5.75, 30, 3800, 5, 7.75)],
}

export default function MortgageComparisonTool() {
  const [s, set, reset] = useToolState('mortgage-comparison-tool', DEF)
  const m = (x: number, d = 0) => money(x, s.currency, d)
  const data = useMemo(() => s.offers.map((o) => { const rows = amortize(o); return { o, rows, sum: summarize(o, rows) } }), [s.offers])
  const H = Math.round(s.horizon * 12)
  const atH = data.map((d) => costAt(d.o, d.rows, H))
  const best = (vals: number[]) => vals.indexOf(Math.min(...vals.filter(Number.isFinite)))
  const bestTotal = best(data.map((d) => d.sum.total - d.o.principal))
  const bestH = best(atH)
  const bestPay = best(data.map((d) => d.sum.monthly))
  const edit = (id: string, p: Partial<O>) => set({ offers: s.offers.map((o) => (o.id === id ? { ...o, ...p } : o)) })
  const view = data[Math.min(s.view, data.length - 1)]
  const years = view ? Array.from({ length: Math.ceil(view.rows.length / 12) }, (_, y) => {
    const r = view.rows.slice(y * 12, y * 12 + 12)
    return [y + 1, m(r.reduce((a, x) => a + x.payment, 0)), m(r.reduce((a, x) => a + x.principal, 0)), m(r.reduce((a, x) => a + x.interest, 0)), m(r[r.length - 1].balance)]
  }) : []
  const yr = (v: number) => `${Math.round(v / 12)}y`

  return (
    <div>
      <Stats>
        <Stat label="Lowest monthly payment" value={data[bestPay] ? m(data[bestPay].sum.monthly) : '—'} sub={data[bestPay]?.o.name} />
        <Stat label="Cheapest over full term" value={data[bestTotal] ? m(data[bestTotal].sum.total - data[bestTotal].o.principal) : '—'} sub={`${data[bestTotal]?.o.name ?? ''} · interest + fees`} tone="good" />
        <Stat label={`Cheapest if you sell after ${s.horizon} y`} value={data[bestH] ? m(atH[bestH]) : '—'} sub={data[bestH]?.o.name} tone="accent" />
      </Stats>
      <Panel title="Offers" actions={<>
        <Btn disabled={s.offers.length >= 6} onClick={() => set({ offers: [...s.offers, mk(`Offer ${s.offers.length + 1}`, 6.25, 30, 3000)] })}>+ Offer</Btn>
        <Btn onClick={() => set({ offers: s.offers.map((o) => ({ ...o, principal: s.offers[0].principal })) })} title="Copy the first offer's loan amount to all">= Same amount</Btn>
        <JsonButtons name="mortgage-offers.json" data={s} onLoad={(d) => set(d)} />
        <Btn kind="ghost" onClick={reset}>Reset</Btn>
      </>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          {data.map(({ o, sum }, i) => (
            <div key={o.id} style={{ border: '1px solid var(--line)', borderTop: `4px solid ${color(i)}`, borderRadius: 10, padding: 10 }}>
              <Row wrap={false}>
                <input value={o.name} onChange={(e) => edit(o.id, { name: e.target.value })} style={{ flex: 1, fontWeight: 700, minWidth: 0 }} aria-label="Offer name" />
                <Btn kind="ghost" disabled={s.offers.length <= 1} onClick={() => set({ offers: s.offers.filter((x) => x.id !== o.id) })} title="Remove">✕</Btn>
              </Row>
              <Num label="Loan amount" value={o.principal} unit={s.currency} min={1000} onChange={(principal) => edit(o.id, { principal })} />
              <Row>
                <Num label="Rate" value={o.rate} unit="%" min={0} max={30} onChange={(rate) => edit(o.id, { rate })} />
                <Num label="Term" value={o.years} unit="y" min={1} max={50} step={1} onChange={(years) => edit(o.id, { years: Math.max(1, Math.round(years)) })} />
              </Row>
              <Num label="Fees + points (cash)" value={o.fees} unit={s.currency} min={0} onChange={(fees) => edit(o.id, { fees })} />
              <Row>
                <Num label="ARM fixed for" value={o.armYears} unit="y" min={0} step={1} onChange={(armYears) => edit(o.id, { armYears: Math.max(0, Math.round(armYears)) })} hint="0 = fixed rate" />
                {o.armYears > 0 && <Num label="Rate after" value={o.armRate} unit="%" min={0} onChange={(armRate) => edit(o.id, { armRate })} />}
              </Row>
              <Num label="Extra principal / month" value={o.extra} unit={s.currency} min={0} onChange={(extra) => edit(o.id, { extra })} />
              <div style={{ marginTop: 6, fontSize: 14 }}>
                <b style={{ fontSize: 20 }}>{m(sum.monthly, 2)}</b><span className="muted"> /month{o.armYears > 0 ? ' (intro)' : ''}</span>
                <div className="muted">APR {sum.apr.toFixed(3)}% · {Math.floor(sum.months / 12)}y {sum.months % 12}m</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 200 }}>
          <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', 'CHF ', 'C$', 'A$']} />
        </div>
      </Panel>
      <Panel title="Side by side">
        <Slider label="Planning horizon (sell / refinance after)" value={s.horizon} min={1} max={30} step={1} unit=" years" onChange={(horizon) => set({ horizon })} />
        <Table head={['', ...data.map((d, i) => <span key={i} style={{ color: color(i), fontWeight: 700 }}>{d.o.name}</span>)]} rows={[
          ['Monthly payment', ...data.map((d, i) => <b key={i} style={{ color: i === bestPay ? 'var(--ok)' : undefined }}>{m(d.sum.monthly, 2)}</b>)],
          ['Payment after ARM reset', ...data.map((d) => (d.o.armYears > 0 && d.rows[d.o.armYears * 12] ? m(d.rows[d.o.armYears * 12].payment, 2) : '—'))],
          ['APR (incl. fees)', ...data.map((d) => `${d.sum.apr.toFixed(3)}%`)],
          ['Total interest', ...data.map((d) => m(d.sum.interest))],
          ['Upfront fees', ...data.map((d) => m(d.o.fees))],
          ['Total paid (loan + interest + fees)', ...data.map((d, i) => <b key={i} style={{ color: i === bestTotal ? 'var(--ok)' : undefined }}>{m(d.sum.total)}</b>)],
          [`Cost of borrowing after ${s.horizon} y`, ...data.map((_, i) => <b key={i} style={{ color: i === bestH ? 'var(--ok)' : undefined }}>{m(atH[i])}</b>)],
          [`Balance left after ${s.horizon} y`, ...data.map((d) => m(d.rows[H - 1]?.balance ?? 0))],
          [`Break-even vs ${data[0]?.o.name ?? ''}`, ...data.map((d, i) => {
            if (i === 0) return '—'
            const { cheaperAtStart: c, month: be } = breakEven(d.o, d.rows, data[0].o, data[0].rows)
            const t = `${Math.floor(be / 12)}y ${be % 12}m`
            return c ? (be < 0 ? 'cheaper throughout' : `cheaper until ${t}`) : be < 0 ? 'never catches up' : `pays off after ${t}`
          })],
        ]} />
        <Note>Cost of borrowing = fees + interest paid up to the horizon (principal repaid is your equity, not a cost). Points only pay off if you keep the loan past the break-even date.</Note>
      </Panel>
      <Split>
        <Panel title="Remaining balance">
          <LineChart series={data.map((d, i) => ({ name: d.o.name, color: color(i), points: [[0, d.o.principal] as [number, number], ...d.rows.filter((_, k) => k % 3 === 2 || k === d.rows.length - 1).map((r) => [r.month, r.balance] as [number, number])] }))} fx={yr} fy={(v) => m(v)} markers={[{ x: H, label: `${s.horizon}y` }]} />
        </Panel>
        <Panel title="Cumulative cost (fees + interest)">
          <LineChart series={data.map((d, i) => {
            let c = d.o.fees
            const pts: [number, number][] = [[0, c]]
            d.rows.forEach((r) => { c += r.interest; if (r.month % 3 === 0 || r.month === d.rows.length) pts.push([r.month, c]) })
            return { name: d.o.name, color: color(i), points: pts }
          })} fx={yr} fy={(v) => m(v)} markers={[{ x: H, label: `${s.horizon}y` }]} />
        </Panel>
      </Split>
      <Panel title="Amortization schedule" actions={<>
        <Select label="" value={Math.min(s.view, data.length - 1)} onChange={(v) => set({ view: v })} options={data.map((d, i) => [i, d.o.name] as [number, string])} />
        {view && <CsvButton name="amortization.csv" rows={() => [['Month', 'Payment', 'Principal', 'Interest', 'Balance'], ...view.rows.map((r) => [r.month, r.payment.toFixed(2), r.principal.toFixed(2), r.interest.toFixed(2), r.balance.toFixed(2)])]} />}
      </>}>
        <Table head={['Year', 'Paid', 'Principal', 'Interest', 'Balance']} rows={years} />
      </Panel>
    </div>
  )
}
