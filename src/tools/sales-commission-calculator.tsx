import { useState } from 'react'
import { Bar, Btn, Check, CsvButton, JsonButtons, LineChart, money, Note, Num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { bounds, commission, settle, targetIncentive, type Basis, type Method, type Tier } from './lib/sales-commission-calculator'

interface Rep { id: string; name: string; quota: number; sales: number; balance: number }
interface State { currency: string; basis: Basis; method: Method; tiers: Tier[]; cap: number; draw: number; recoverable: boolean; reps: Rep[] }

const PRESETS: [string, Partial<State>][] = [
  ['Flat 5%', { basis: 'amount', method: 'marginal', tiers: [{ upTo: 0, rate: 5 }], cap: 0 }],
  ['3 tiers on revenue', { basis: 'amount', method: 'marginal', tiers: [{ upTo: 50000, rate: 4 }, { upTo: 120000, rate: 7 }, { upTo: 0, rate: 10 }], cap: 0 }],
  ['Quota + accelerators', { basis: 'quota', method: 'marginal', tiers: [{ upTo: 50, rate: 3 }, { upTo: 100, rate: 8 }, { upTo: 150, rate: 12 }, { upTo: 0, rate: 15 }], cap: 30000 }],
  ['Retroactive step', { basis: 'quota', method: 'retro', tiers: [{ upTo: 80, rate: 4 }, { upTo: 100, rate: 6 }, { upTo: 0, rate: 9 }], cap: 0 }],
]
const DEF: State = {
  currency: '$', basis: 'quota', method: 'marginal', cap: 30000, draw: 2500, recoverable: true,
  tiers: [{ upTo: 50, rate: 3 }, { upTo: 100, rate: 8 }, { upTo: 150, rate: 12 }, { upTo: 0, rate: 15 }],
  reps: [
    { id: 'a', name: 'Avery Lin', quota: 150000, sales: 183400, balance: 0 },
    { id: 'b', name: 'Bruno Costa', quota: 150000, sales: 141250, balance: 0 },
    { id: 'c', name: 'Chen Wei', quota: 120000, sales: 61800, balance: 1200 },
    { id: 'd', name: 'Dana Okafor', quota: 180000, sales: 296000, balance: 0 },
    { id: 'e', name: 'Elif Kaya', quota: 100000, sales: 24500, balance: 0 },
    { id: 'f', name: 'Farah Haddad', quota: 120000, sales: 125900, balance: 3400 },
  ],
}

export default function SalesCommissionCalculator() {
  const [s, set, reset] = useToolState('sales-commission-calculator', DEF)
  const [sel, setSel] = useState(s.reps[0]?.id ?? '')
  const m = (x: number, d = 0) => money(x, s.currency, d)
  const plan = { basis: s.basis, method: s.method, tiers: s.tiers, cap: s.cap }
  const rows = s.reps.map((r) => {
    const c = commission(r.sales, r.quota, plan)
    const st = settle(c.total, s.draw, s.recoverable, r.balance)
    return { r, c, st }
  })
  const cur = rows.find((x) => x.r.id === sel) ?? rows[0]
  const tot = (f: (x: (typeof rows)[number]) => number) => rows.reduce((a, x) => a + f(x), 0)
  const teamSales = tot((x) => x.r.sales), teamPay = tot((x) => x.st.payout), teamComm = tot((x) => x.c.total)
  const editRep = (id: string, p: Partial<Rep>) => set({ reps: s.reps.map((r) => (r.id === id ? { ...r, ...p } : r)) })
  const editTier = (i: number, p: Partial<Tier>) => set({ tiers: s.tiers.map((t, j) => (j === i ? { ...t, ...p } : t)) })
  const unit = s.basis === 'quota' ? '% quota' : s.currency
  const sortedOk = s.tiers.slice(0, -1).every((t, i, a) => t.upTo > 0 && (i === 0 || t.upTo > a[i - 1].upTo))

  // Curve for the selected rep: payout vs sales from 0 to 2× quota (or 2× the top ceiling).
  const q = cur?.r.quota ?? 100000
  const xMax = Math.max(q * 2, (cur?.r.sales ?? 0) * 1.15, ...bounds(s.tiers, s.basis, q).filter((b) => Number.isFinite(b.hi)).map((b) => b.hi * 1.2))
  const pts = (method: Method) => Array.from({ length: 161 }, (_, k) => { const x = (k / 160) * xMax; return [x, commission(x, q, { ...plan, method }).total] as [number, number] })

  return (
    <Split wide="right">
      <div>
        <Panel title="Commission plan" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>{PRESETS.map(([n, p]) => <Btn key={n} onClick={() => set(p)}>{n}</Btn>)}</Row>
          <p className="k-label" style={{ margin: '10px 0 4px' }}>Tier ceilings are</p>
          <Seg value={s.basis} onChange={(basis) => set({ basis })} options={[['quota', '% of quota'], ['amount', 'Sales amounts']]} />
          <p className="k-label" style={{ margin: '10px 0 4px' }}>Rates apply</p>
          <Seg value={s.method} onChange={(method) => set({ method })} options={[['marginal', 'Marginal (per slice)'], ['retro', 'Retroactive (whole amount)']]} />
          <Table
            head={['Tier', `Up to (${unit})`, 'Rate %', '']}
            rows={s.tiers.map((t, i) => [
              i + 1,
              i === s.tiers.length - 1 ? <span key="u" className="muted">and above</span> : <input key="u" type="number" min={0} value={t.upTo} onChange={(e) => editTier(i, { upTo: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 100 }} aria-label="Tier ceiling" />,
              <input key="r" type="number" min={0} step={0.1} value={t.rate} onChange={(e) => editTier(i, { rate: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 70 }} aria-label="Rate" />,
              <Btn key="x" kind="ghost" disabled={s.tiers.length < 2} onClick={() => set({ tiers: s.tiers.filter((_, j) => j !== i) })} title="Remove tier">✕</Btn>,
            ])}
          />
          <Btn onClick={() => { const last = s.tiers[s.tiers.length - 2]?.upTo ?? 0; const t = [...s.tiers]; t.splice(t.length - 1, 0, { upTo: last ? Math.round(last * 1.5) : s.basis === 'quota' ? 100 : 100000, rate: t[t.length - 1].rate }); set({ tiers: t }) }}>+ Tier</Btn>
          {!sortedOk && <Note tone="warn">Tier ceilings should be positive and increasing; they are sorted automatically for the maths.</Note>}
          <Row>
            <Num label="Cap per rep (0 = none)" value={s.cap} onChange={(cap) => set({ cap })} unit={s.currency} min={0} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
          </Row>
          <Row>
            <Num label="Monthly draw" value={s.draw} onChange={(draw) => set({ draw })} unit={s.currency} min={0} />
            <Check label="Recoverable draw" value={s.recoverable} onChange={(recoverable) => set({ recoverable })} />
          </Row>
          <Note>
            {s.method === 'marginal' ? 'Marginal: every slice of sales earns its own tier rate, so pay rises smoothly.' : 'Retroactive: crossing a ceiling re-prices the whole amount at the new rate, creating a jump (“cliff”) that motivates reps to push over the line.'}{' '}
            {s.draw > 0 && (s.recoverable ? 'A recoverable draw is an advance: shortfalls carry forward and are recovered from later excess commission.' : 'A non-recoverable draw is a guaranteed minimum: shortfalls are forgiven.')}
          </Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Team sales" value={m(teamSales)} sub={`${pct(teamSales / (tot((x) => x.r.quota) || 1), 0)} of quota`} />
          <Stat label="Commission earned" value={m(teamComm)} sub={`${pct(teamComm / (teamSales || 1), 2)} cost of sales`} />
          <Stat label="Paid this period" value={m(teamPay)} tone="accent" sub={`draw top-ups ${m(tot((x) => x.st.drawTopUp))}`} />
          <Stat label="At / over quota" value={`${rows.filter((x) => x.c.attainment >= 1).length} / ${rows.length}`} tone="good" />
        </Stats>
        <Panel
          title="Reps"
          actions={
            <>
              <Btn onClick={() => set({ reps: [...s.reps, { id: uid(), name: 'New rep', quota: 100000, sales: 0, balance: 0 }] })}>+ Rep</Btn>
              <CsvButton name="commissions.csv" rows={() => [['Rep', 'Quota', 'Sales', 'Attainment %', 'Tier', 'Gross commission', 'Capped commission', 'Effective rate %', 'Draw top-up', 'Recovered', 'Payout', 'Balance carried'], ...rows.map(({ r, c, st }) => [r.name, r.quota, r.sales, +(c.attainment * 100).toFixed(1), c.tier + 1, +c.gross.toFixed(2), +c.total.toFixed(2), +(c.effRate * 100).toFixed(2), +st.drawTopUp.toFixed(2), +st.recovered.toFixed(2), +st.payout.toFixed(2), +st.balance.toFixed(2)])]} />
              <JsonButtons name="commission-plan.json" data={s} onLoad={(d) => set(d)} />
            </>
          }
        >
          <Table
            head={['Rep', 'Quota', 'Sales', 'Attainment', 'Commission', 'Draw / recovery', 'Payout', 'Carry', '']}
            rows={rows.map(({ r, c, st }) => [
              <input key="n" value={r.name} onChange={(e) => editRep(r.id, { name: e.target.value })} onFocus={() => setSel(r.id)} style={{ width: 110, fontWeight: r.id === cur?.r.id ? 700 : 400 }} aria-label="Rep name" />,
              <input key="q" type="number" min={0} value={r.quota} onChange={(e) => editRep(r.id, { quota: Math.max(0, Number(e.target.value) || 0) })} onFocus={() => setSel(r.id)} style={{ width: 84 }} aria-label="Quota" />,
              <input key="s" type="number" min={0} value={r.sales} onChange={(e) => editRep(r.id, { sales: Math.max(0, Number(e.target.value) || 0) })} onFocus={() => setSel(r.id)} style={{ width: 84 }} aria-label="Sales" />,
              <div key="a" style={{ minWidth: 90 }}>
                <b style={{ color: c.attainment >= 1 ? 'var(--ok)' : c.attainment < 0.5 ? 'var(--err)' : undefined }}>{pct(c.attainment, 0)}</b> <span className="muted">T{c.tier + 1}</span>
                <Bar value={c.attainment} max={1.5} color={c.attainment >= 1 ? 'var(--ok)' : 'var(--accent)'} />
              </div>,
              <span key="c">{m(c.total)}{c.capped && <span className="muted" title={`Gross ${m(c.gross)}`}> (capped)</span>}<br /><span className="muted" style={{ fontSize: 12 }}>{pct(c.effRate, 2)} eff.</span></span>,
              <span key="d">{st.drawTopUp > 0 ? <span style={{ color: 'var(--warn)' }}>+{m(st.drawTopUp)} draw</span> : st.recovered > 0 ? <span>−{m(st.recovered)} recovered</span> : '—'}</span>,
              <b key="p">{m(st.payout)}</b>,
              <span key="b" style={{ color: st.balance > 0 ? 'var(--err)' : undefined }}>{st.balance > 0 ? m(st.balance) : '—'}</span>,
              <span key="x"><Btn kind="ghost" onClick={() => setSel(r.id)} title="Show breakdown">⌕</Btn><Btn kind="ghost" onClick={() => set({ reps: s.reps.filter((x) => x.id !== r.id) })} title="Remove">✕</Btn></span>,
            ])}
            foot={['Total', m(tot((x) => x.r.quota)), m(teamSales), pct(teamSales / (tot((x) => x.r.quota) || 1), 0), m(teamComm), '', m(teamPay), m(tot((x) => x.st.balance)), '']}
          />
          <p className="muted" style={{ fontSize: 13 }}>“Carry” is the opening draw balance for the rep (enter last period’s unrecovered draw); the column shows the balance carried into next period.</p>
        </Panel>
        {cur && (
          <Panel title={`Breakdown — ${cur.r.name}`}>
            <Table
              head={['Tier', 'Sales slice', 'Rate', 'Commission']}
              rows={cur.c.parts.map((p) => [`T${p.tier + 1}`, `${m(p.from)} – ${m(p.to)}${s.method === 'retro' ? ' (whole amount)' : ''}`, `${p.rate}%`, m(p.amount, 2)])}
              foot={['', cur.c.capped ? `Capped at ${m(s.cap)}` : 'Total', pct(cur.c.effRate, 2) + ' eff.', m(cur.c.total, 2)]}
            />
            <p className="muted">Target incentive at 100% quota: <b>{m(targetIncentive(cur.r.quota, plan))}</b>. {s.method === 'marginal' ? 'Switching to retroactive' : 'Switching to marginal'} would pay {m(commission(cur.r.sales, cur.r.quota, { ...plan, method: s.method === 'marginal' ? 'retro' : 'marginal' }).total)}.</p>
            <LineChart
              series={[{ name: 'Marginal', points: pts('marginal'), color: '#6366f1' }, { name: 'Retroactive', points: pts('retro'), color: '#f59e0b', dashed: true }]}
              xLabel="Sales" fx={(v) => m(v)} fy={(v) => m(v)}
              markers={[{ x: q, label: 'Quota' }, { x: cur.r.sales, label: cur.r.name.split(' ')[0] }]}
            />
          </Panel>
        )}
      </div>
    </Split>
  )
}
