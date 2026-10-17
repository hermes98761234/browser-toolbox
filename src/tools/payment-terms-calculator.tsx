import type { ReactNode } from 'react'
import { Area, BarChart, Btn, CsvButton, LineChart, money, Note, Num, Panel, pct, Row, Seg, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { decide, effectiveCost, nominalCost, parseTerms } from './lib/payment-terms-calculator'

interface State {
  terms: string
  amount: number
  rate: number
  payDay: number
  stretch: boolean
  year: 365 | 360
  view: 'buyer' | 'seller'
  compare: string
  sales: number
  takeShare: number
  lateDays: number
  wacc: number
}

const DEF: State = {
  terms: '2/10 net 30',
  amount: 25000,
  rate: 9,
  payDay: 30,
  stretch: false,
  year: 365,
  view: 'buyer',
  compare: '2/10 net 30\n1/10 net 30\n2/15 net 45\n1/10 net 60\n3/10 net 90\nnet 45',
  sales: 1200000,
  takeShare: 40,
  lateDays: 12,
  wacc: 11,
}

const Tip = ({ children }: { children: ReactNode }) => (
  <div className="k-note" style={{ background: 'color-mix(in srgb, var(--accent2) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent2) 35%, transparent)' }}>{children}</div>
)
const PRESETS = ['2/10 net 30', '1/10 net 30', '2/10 net 60', '1/15 net 45', '3/10 EOM', 'net 30']

export default function PaymentTermsCalculator() {
  const [s, set, reset] = useToolState('payment-terms-calculator', DEF)
  const t = parseTerms(s.terms)
  const m = (x: number) => money(x, '$', 2)
  const rate = s.rate / 100
  const payDay = t ? (s.stretch ? Math.max(t.discDays + 1, s.payDay) : t.netDays) : 0
  const d = t ? decide(t, s.amount, rate, payDay, s.year) : null

  const cmp = s.compare
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({ raw: l, t: parseTerms(l) }))
  const rows = cmp.map(({ raw, t: x }) => {
    if (!x) return { raw, x, dd: null }
    return { raw, x, dd: decide(x, s.amount, rate, x.netDays, s.year) }
  })

  // Cost of forgoing the discount as a function of the day you actually pay.
  const curve = t && t.discount > 0
    ? Array.from({ length: t.netDays + 45 - t.discDays }, (_, i) => t.discDays + 1 + i).filter((day) => day - t.discDays >= Math.max(2, (t.netDays - t.discDays) / 4)).map((day) => [day, Math.min(3, effectiveCost(t.discount, t.discDays, day, s.year)) * 100] as [number, number])
    : []

  // Seller view: what offering the discount costs vs what faster cash is worth.
  const seller = (() => {
    if (!t) return null
    const p = s.takeShare / 100
    const avgPayNo = t.netDays + s.lateDays
    const dsoBefore = avgPayNo
    const dsoAfter = p * t.discDays + (1 - p) * avgPayNo
    const discountCost = s.sales * p * t.discount
    const cashFreed = (s.sales / s.year) * (dsoBefore - dsoAfter)
    const financingSaved = cashFreed * (s.wacc / 100)
    return { dsoBefore, dsoAfter, discountCost, cashFreed, financingSaved, net: financingSaved - discountCost, offerCost: nominalCost(t.discount, t.discDays, avgPayNo, s.year) }
  })()

  return (
    <Split>
      <div>
        <Panel title="Terms" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.view} onChange={(view) => set({ view })} options={[['buyer', 'I am paying (buyer)'], ['seller', 'I am offering (seller)']]} label="Perspective" />
          <div style={{ height: 8 }} />
          <Txt label="Payment terms" value={s.terms} onChange={(terms) => set({ terms })} placeholder="2/10 net 30" hint={t ? `Read as: ${t.discount ? `${pct(t.discount, 2)} discount if paid within ${t.discDays} days, otherwise ` : ''}full amount due in ${t.netDays} days${t.eom ? ' (counted from end of month)' : ''}.` : undefined} />
          {!t && <Note tone="err">Could not read these terms. Try “2/10 net 30”, “1.5/15 n/45” or “net 60”.</Note>}
          <Row>
            {PRESETS.map((p) => (
              <Btn key={p} kind="ghost" onClick={() => set({ terms: p })}>{p}</Btn>
            ))}
          </Row>
          {s.view === 'buyer' ? (
            <>
              <Row>
                <Num label="Invoice amount" value={s.amount} onChange={(amount) => set({ amount })} unit="$" min={0} />
                <Num label="Your borrowing rate (APR)" value={s.rate} onChange={(v) => set({ rate: v })} unit="%" min={0} />
              </Row>
              <label className="k-check">
                <input type="checkbox" checked={s.stretch} onChange={(e) => set({ stretch: e.target.checked, payDay: t?.netDays ?? 30 })} /> I would actually pay on a different day (stretching payables)
              </label>
              {s.stretch && t && <Slider label="Pay on day" value={payDay} onChange={(v) => set({ payDay: v })} min={t.discDays + 1} max={t.netDays + 60} step={1} show={(v) => String(v)} />}
            </>
          ) : (
            <>
              <Row>
                <Num label="Annual credit sales" value={s.sales} onChange={(sales) => set({ sales })} unit="$" min={0} />
                <Num label="Your cost of capital" value={s.wacc} onChange={(wacc) => set({ wacc })} unit="%" min={0} />
              </Row>
              <Slider label="Customers who take the discount" value={s.takeShare} onChange={(takeShare) => set({ takeShare })} min={0} max={100} unit="%" show={(v) => String(v)} />
              <Num label="Average days late (non-discount payers)" value={s.lateDays} onChange={(lateDays) => set({ lateDays })} unit="days" min={0} />
            </>
          )}
          <div className="k-label" style={{ fontSize: 13, fontWeight: 650, margin: '10px 0 6px' }}>Day count</div>
          <Row>
            <Seg value={String(s.year) as '365' | '360'} onChange={(v) => set({ year: Number(v) as 365 | 360 })} options={[['365', '365 days'], ['360', '360 (banker)']]} label="Day count" />
          </Row>
        </Panel>
        <Panel title="The formulas">
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            <div><b>Nominal cost</b> = d ⁄ (1 − d) × {s.year} ⁄ (N − D)</div>
            <div><b>Effective annual rate</b> = (1 + d ⁄ (1 − d))<sup>{s.year} ⁄ (N − D)</sup> − 1</div>
            <div className="muted" style={{ fontSize: 13 }}>d = discount, D = discount days, N = day you actually pay. Skipping the discount is like borrowing (1 − d) of the invoice for N − D days at this rate.</div>
          </div>
          <Tip>Rule of thumb: if the cost of forgoing the discount is higher than your borrowing rate, take the discount — even if you must draw on a credit line to do it.</Tip>
        </Panel>
      </div>

      <div>
        {s.view === 'buyer' && t && d && (
          <>
            <Stats>
              <Stat label="Cost of skipping (nominal)" value={t.discount ? pct(d.nominal, 1) : '0%'} sub="simple APR" />
              <Stat label="Effective annual rate" value={t.discount ? pct(d.effective, 1) : '0%'} tone="accent" sub="compounded" />
              <Stat label="Discount on this invoice" value={m(d.discountAmt)} sub={`pay ${m(d.payEarly)} by day ${t.discDays}`} />
              <Stat label={d.takeIt ? 'Net gain if you take it' : 'Better to wait'} value={t.discount ? m(Math.abs(d.netSaving)) : '—'} tone={d.takeIt ? 'good' : 'bad'} sub={t.discount ? `after ${m(d.interest)} interest for ${d.borrowDays} days` : 'no discount offered'} />
            </Stats>
            {t.discount > 0 ? (
              d.takeIt ? (
                <Note tone="ok">Take the discount. Skipping it costs {pct(d.effective, 1)} a year, far more than borrowing at {pct(rate, 1)}. Paying {m(d.payEarly)} on day {t.discDays} instead of {m(s.amount)} on day {payDay} saves {m(d.netSaving)} even after interest.</Note>
              ) : (
                <Note tone="warn">Pay on day {payDay}. Your money costs {pct(rate, 1)}, more than the {pct(d.nominal, 1)} the discount is worth over {d.borrowDays} days.</Note>
              )
            ) : (
              <Tip>No early-payment discount: pay on day {t.netDays} (as late as allowed) to keep cash longer.</Tip>
            )}
            {curve.length > 0 && (
              <Panel title="Cost of skipping vs. the day you pay">
                <LineChart
                  series={[
                    { name: 'Effective annual cost of skipping', points: curve, area: true },
                    { name: 'Your borrowing rate', points: curve.map(([x]) => [x, s.rate]), dashed: true, color: '#ef4444' },
                  ]}
                  xLabel="day you pay"
                  fy={(v) => `${Math.round(v)}%`}
                  fx={(v) => `${Math.round(v)}`}
                  markers={[{ x: t.netDays, label: `net ${t.netDays}` }]}
                  height={250}
                />
                <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Paying late (stretching) lowers the implied rate — but damages supplier relations and may trigger late fees. Capped at 300% for display.</p>
              </Panel>
            )}
          </>
        )}

        {s.view === 'seller' && t && seller && (
          <>
            <Stats>
              <Stat label="Implied cost of offering" value={t.discount ? pct(seller.offerCost, 1) : '0%'} tone={seller.offerCost > s.wacc / 100 ? 'bad' : 'good'} sub={`vs ${s.wacc}% cost of capital`} />
              <Stat label="DSO" value={`${seller.dsoBefore.toFixed(0)} → ${seller.dsoAfter.toFixed(1)} d`} sub="days sales outstanding" />
              <Stat label="Cash freed" value={money(seller.cashFreed, '$', 0)} tone="accent" />
              <Stat label="Net per year" value={money(seller.net, '$', 0)} tone={seller.net >= 0 ? 'good' : 'bad'} sub={`${money(seller.financingSaved, '$', 0)} saved − ${money(seller.discountCost, '$', 0)} discounts`} />
            </Stats>
            {seller.net >= 0 ? (
              <Note tone="ok">Offering {t.label} pays off: faster cash saves more financing cost than the discounts you give away.</Note>
            ) : (
              <Note tone="warn">At a {s.wacc}% cost of capital, the discount costs more than the cash it brings in sooner. Consider a smaller discount or a shorter window — unless you need the liquidity or want to cut bad-debt risk.</Note>
            )}
          </>
        )}

        <Panel title="Compare terms" actions={<CsvButton name="payment-terms.csv" rows={() => [['Terms', 'Discount', 'Disc days', 'Net days', 'Nominal cost', 'EAR', 'Discount $', 'Net gain if taken $', 'Decision'], ...rows.map((r) => (r.x && r.dd ? [r.x.label, r.x.discount, r.x.discDays, r.x.netDays, r.dd.nominal.toFixed(4), r.dd.effective.toFixed(4), r.dd.discountAmt.toFixed(2), r.dd.netSaving.toFixed(2), r.x.discount ? (r.dd.takeIt ? 'take' : 'skip') : 'n/a'] : [r.raw, 'invalid']))]} />}>
          <Row>
            <div style={{ flex: '1 1 160px' }}>
              <Area value={s.compare} onChange={(compare) => set({ compare })} rows={6} mono />
            </div>
            <div style={{ flex: '2 1 280px', minWidth: 0 }}>
              <BarChart bars={rows.filter((r) => r.x && r.dd).map((r) => ({ label: r.x!.label, value: Math.min(200, r.dd!.effective * 100), color: r.dd!.takeIt ? '#10b981' : '#94a3b8' }))} fy={(v) => `${Math.round(v)}%`} height={200} />
            </div>
          </Row>
          <Table
            head={['Terms', 'Nominal', 'EAR', 'Discount', 'Net gain', 'Decision']}
            rows={rows.map((r) =>
              r.x && r.dd
                ? [
                    <b key="t">{r.x.label}</b>,
                    r.x.discount ? pct(r.dd.nominal, 1) : '—',
                    r.x.discount ? pct(r.dd.effective, 1) : '—',
                    m(r.dd.discountAmt),
                    r.x.discount ? <span key="n" style={{ color: r.dd.netSaving >= 0 ? 'var(--ok)' : 'var(--err)' }}>{m(r.dd.netSaving)}</span> : '—',
                    r.x.discount ? (r.dd.takeIt ? '✅ take' : '⏳ pay at net') : 'pay at net',
                  ]
                : [r.raw, <span key="e" style={{ color: 'var(--err)' }}>can't parse</span>, '', '', '', ''],
            )}
          />
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Uses the invoice amount and borrowing rate above; green bars beat your {s.rate}% borrowing rate.</p>
        </Panel>
      </div>
    </Split>
  )
}
