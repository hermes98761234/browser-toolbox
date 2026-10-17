import { BarChart, Btn, Check, CsvButton, LineChart, money, Note, num, Num, Panel, Row, Split, Stat, Stats, Table, useToolState } from '../kit'
import { amountFinanced, aprToMf, balanceAfter, carValue, leasePayment, mfToApr, payment } from './lib/car-loan-calculator'

const DEF = {
  price: 34000,
  msrp: 36000,
  taxPct: 7,
  fees: 650,
  down: 4000,
  tradeIn: 9000,
  tradeOwed: 3500,
  rebate: 1000,
  taxCredit: true,
  aprA: 6.4,
  termA: 60,
  aprB: 2.9,
  termB: 72,
  residualPct: 58,
  leaseApr: 4.8,
  leaseTerm: 36,
  acqFee: 695,
  dispFee: 395,
  dep1: 20,
  depN: 14,
}

export default function CarLoanCalculator() {
  const [s, set, reset] = useToolState('car-loan-calculator', DEF)
  const m = (x: number) => money(x, '$', 0)
  const fin = amountFinanced({ price: s.price, taxPct: s.taxPct, fees: s.fees, down: s.down, tradeIn: s.tradeIn, tradeOwed: s.tradeOwed, rebate: s.rebate, taxCredit: s.taxCredit })
  const equityIn = s.tradeIn - s.tradeOwed
  const H = s.leaseTerm
  const valueAtH = carValue(s.price, H, s.dep1, s.depN)

  const loan = (apr: number, n: number) => {
    const pmt = payment(fin.financed, apr, n)
    const total = pmt * n
    const paidH = pmt * Math.min(H, n)
    const balH = balanceAfter(fin.financed, apr, n, Math.min(H, n))
    const equityH = valueAtH - balH
    return { pmt, total, interest: total - fin.financed, paidH, balH, equityH, net: s.down + paidH - equityH }
  }
  const A = loan(s.aprA, s.termA)
  const B = loan(s.aprB, s.termB)
  const capReduction = s.down + Math.max(0, equityIn) + s.rebate
  const L = leasePayment({ capCost: s.price + s.fees + Math.max(0, -equityIn), residualPct: s.residualPct, msrp: s.msrp, moneyFactor: aprToMf(s.leaseApr), months: s.leaseTerm, taxPct: s.taxPct, acqFee: s.acqFee, capReduction, dispositionFee: s.dispFee })
  const leaseTotal = L.monthly * s.leaseTerm
  const leaseNet = s.down + leaseTotal + s.dispFee
  const options = [
    { name: `Loan A · ${s.aprA}% / ${s.termA} mo`, monthly: A.pmt, net: A.net, color: '#6366f1' },
    { name: `Loan B · ${s.aprB}% / ${s.termB} mo`, monthly: B.pmt, net: B.net, color: '#0ea5e9' },
    { name: `Lease · ${s.leaseTerm} mo`, monthly: L.monthly, net: leaseNet, color: '#f59e0b' },
  ]
  const best = options.reduce((a, o) => (o.net < a.net ? o : a))
  const underwaterA = Array.from({ length: s.termA + 1 }, (_, k) => k).find((k) => balanceAfter(fin.financed, s.aprA, s.termA, k) <= carValue(s.price, k, s.dep1, s.depN)) ?? 0
  const residualVsValue = L.residual - valueAtH
  const yearly = Array.from({ length: Math.ceil(s.termA / 12) }, (_, y) => {
    const k0 = y * 12, k1 = Math.min(s.termA, (y + 1) * 12)
    const b0 = balanceAfter(fin.financed, s.aprA, s.termA, k0), b1 = balanceAfter(fin.financed, s.aprA, s.termA, k1)
    const paid = A.pmt * (k1 - k0)
    return { y: y + 1, paid, principal: b0 - b1, interest: paid - (b0 - b1), bal: b1, value: carValue(s.price, k1, s.dep1, s.depN) }
  })

  return (
    <Split>
      <div>
        <Panel title="The car & the deal" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Num label="Negotiated price" value={s.price} onChange={(price) => set({ price })} unit="$" min={0} />
            <Num label="MSRP (for lease residual)" value={s.msrp} onChange={(msrp) => set({ msrp })} unit="$" min={0} />
          </Row>
          <Row>
            <Num label="Sales tax" value={s.taxPct} onChange={(taxPct) => set({ taxPct })} unit="%" min={0} max={20} />
            <Num label="Fees (doc, title, reg.)" value={s.fees} onChange={(fees) => set({ fees })} unit="$" min={0} />
          </Row>
          <Row>
            <Num label="Down payment" value={s.down} onChange={(down) => set({ down })} unit="$" min={0} />
            <Num label="Rebate / incentive" value={s.rebate} onChange={(rebate) => set({ rebate })} unit="$" min={0} />
          </Row>
          <Row>
            <Num label="Trade-in value" value={s.tradeIn} onChange={(tradeIn) => set({ tradeIn })} unit="$" min={0} />
            <Num label="Still owed on trade-in" value={s.tradeOwed} onChange={(tradeOwed) => set({ tradeOwed })} unit="$" min={0} />
          </Row>
          <Check label="Trade-in reduces taxable price" value={s.taxCredit} onChange={(taxCredit) => set({ taxCredit })} />
          {equityIn < 0 && <Note tone="warn">Negative equity of {m(-equityIn)} on the trade-in is rolled into the new loan.</Note>}
        </Panel>
        <Panel title="Loan offers">
          <Row>
            <Num label="Loan A APR" value={s.aprA} onChange={(aprA) => set({ aprA })} unit="%" min={0} max={40} />
            <Num label="Term" value={s.termA} onChange={(termA) => set({ termA: Math.max(1, Math.round(termA)) })} unit="mo" min={1} max={96} />
          </Row>
          <Row>
            <Num label="Loan B APR" value={s.aprB} onChange={(aprB) => set({ aprB })} unit="%" min={0} max={40} />
            <Num label="Term" value={s.termB} onChange={(termB) => set({ termB: Math.max(1, Math.round(termB)) })} unit="mo" min={1} max={96} />
          </Row>
        </Panel>
        <Panel title="Lease offer">
          <Row>
            <Num label="Residual" value={s.residualPct} onChange={(residualPct) => set({ residualPct })} unit="% MSRP" min={10} max={90} />
            <Num label="Term" value={s.leaseTerm} onChange={(leaseTerm) => set({ leaseTerm: Math.max(6, Math.round(leaseTerm)) })} unit="mo" min={6} max={60} />
          </Row>
          <Row>
            <Num label="Lease APR" value={s.leaseApr} onChange={(leaseApr) => set({ leaseApr })} unit="%" min={0} max={30} hint={`Money factor ${aprToMf(s.leaseApr).toFixed(5)} (= APR ÷ 2400)`} />
            <Num label="Money factor" value={+aprToMf(s.leaseApr).toFixed(5)} onChange={(mf) => set({ leaseApr: +mfToApr(mf).toFixed(3) })} min={0} max={0.01} step={0.00005} />
          </Row>
          <Row>
            <Num label="Acquisition fee" value={s.acqFee} onChange={(acqFee) => set({ acqFee })} unit="$" min={0} />
            <Num label="Disposition fee" value={s.dispFee} onChange={(dispFee) => set({ dispFee })} unit="$" min={0} />
          </Row>
        </Panel>
        <Panel title="Depreciation assumption">
          <Row>
            <Num label="First year" value={s.dep1} onChange={(dep1) => set({ dep1 })} unit="%" min={0} max={60} />
            <Num label="Each later year" value={s.depN} onChange={(depN) => set({ depN })} unit="%" min={0} max={40} />
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Used to estimate what the car is worth at the end of the {H}-month comparison window (≈ {m(valueAtH)}).</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Amount financed" value={m(fin.financed)} sub={`incl. ${m(fin.tax)} tax`} />
          {options.map((o) => <Stat key={o.name} label={o.name} value={`${money(o.monthly, '$', 0)}/mo`} tone={o === best ? 'good' : undefined} sub={`net cost ${m(o.net)}`} />)}
        </Stats>
        <Panel title={`Cost of driving for ${H} months`}>
          <BarChart bars={options.map((o) => ({ label: o.name.split(' · ')[0], value: Math.round(o.net), color: o.color }))} fy={(v) => m(v)} height={220} />
          <Note tone="ok"><b>{best.name.split(' · ')[0]}</b> is cheapest over {H} months: {m(best.net)} ({m(best.net / H)}/month), counting the equity you keep in a bought car.</Note>
          <Table
            head={['', 'Loan A', 'Loan B', 'Lease']}
            rows={[
              ['Monthly payment', m(A.pmt), m(B.pmt), m(L.monthly)],
              ['Cash at signing', m(s.down), m(s.down), m(s.down)],
              ['Total of payments (full term)', m(A.total), m(B.total), m(leaseTotal)],
              ['Interest / rent charge', m(A.interest), m(B.interest), m(L.rent * s.leaseTerm)],
              [`Paid in ${H} months`, m(A.paidH), m(B.paidH), m(leaseTotal + s.dispFee)],
              [`Loan balance at ${H} mo`, m(A.balH), m(B.balH), '—'],
              [`Equity at ${H} mo`, <span key="a" style={{ color: A.equityH < 0 ? 'var(--err)' : undefined }}>{m(A.equityH)}</span>, <span key="b" style={{ color: B.equityH < 0 ? 'var(--err)' : undefined }}>{m(B.equityH)}</span>, '—'],
              [<b key="n">Net cost</b>, <b key="a">{m(A.net)}</b>, <b key="b">{m(B.net)}</b>, <b key="l">{m(leaseNet)}</b>],
            ]}
          />
        </Panel>
        <Panel title="Lease breakdown">
          <Table
            head={['Item', 'Amount']}
            rows={[
              ['Residual value', `${m(L.residual)} (${s.residualPct}% of MSRP)`],
              ['Adjusted cap cost', m(L.adjCap)],
              ['Depreciation fee / mo', money(L.depreciation)],
              ['Rent charge / mo', money(L.rent)],
              ['Tax / mo', money(L.tax)],
              ['Equivalent APR', `${num(mfToApr(aprToMf(s.leaseApr)), 2)}%`],
            ]}
          />
          <p className="muted" style={{ fontSize: 13 }}>
            {residualVsValue > 0 ? `The residual is ${m(residualVsValue)} above the car's estimated value at lease end: the lease is “subsidised”, which favours leasing.` : `The residual is ${m(-residualVsValue)} below the estimated value: buying it out at lease end could be a good deal.`}
          </p>
        </Panel>
        <Panel title="Loan A: balance vs car value" actions={<CsvButton name="car-loan-schedule.csv" rows={() => [['Month', 'Payment', 'Balance', 'Est. value'], ...Array.from({ length: s.termA }, (_, i) => [i + 1, +A.pmt.toFixed(2), +balanceAfter(fin.financed, s.aprA, s.termA, i + 1).toFixed(2), Math.round(carValue(s.price, i + 1, s.dep1, s.depN))])]} />}>
          <LineChart
            series={[
              { name: 'Loan balance', points: Array.from({ length: s.termA + 1 }, (_, k) => [k, balanceAfter(fin.financed, s.aprA, s.termA, k)]), color: '#6366f1', area: true },
              { name: 'Car value', points: Array.from({ length: s.termA + 1 }, (_, k) => [k, carValue(s.price, k, s.dep1, s.depN)]), color: '#10b981' },
            ]}
            fy={(v) => m(v)}
            fx={(v) => `${Math.round(v)} mo`}
            xLabel="months"
            height={230}
          />
          {underwaterA > 0 && <Note tone="warn">You owe more than the car is worth for the first {underwaterA} months (negative equity). A bigger down payment or shorter term fixes that.</Note>}
          <Table head={['Year', 'Paid', 'Principal', 'Interest', 'Balance', 'Est. value']} rows={yearly.map((r) => [r.y, m(r.paid), m(r.principal), m(r.interest), m(r.bal), m(r.value)])} />
        </Panel>
      </div>
    </Split>
  )
}
