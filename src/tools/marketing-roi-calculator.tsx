import { BarChart, Btn, CsvButton, Donut, JsonButtons, money, Note, Num, num, Panel, pct, Row, Select, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { blended, breakEvenRoas, metrics, total, type Channel, type Metrics } from './lib/marketing-roi-calculator'

interface State { currency: string; margin: number; arpu: number; lifetime: number; fixed: number; sort: SortKey; channels: Channel[] }
type SortKey = 'roas' | 'profitRoi' | 'cac' | 'ltvCac' | 'net'

const ch = (name: string, spend: number, impressions: number, clicks: number, leads: number, customers: number, revenue: number): Channel => ({ id: uid(), name, spend, impressions, clicks, leads, customers, revenue })
const DEF: State = {
  currency: '$', margin: 65, arpu: 79, lifetime: 18, fixed: 3500, sort: 'roas',
  channels: [
    ch('Google Search', 12000, 410000, 16400, 1150, 168, 49800),
    ch('Meta Ads', 9000, 1250000, 13800, 860, 96, 24100),
    ch('LinkedIn Ads', 6500, 180000, 1900, 240, 31, 15400),
    ch('Email', 1200, 95000, 7200, 610, 74, 17600),
    ch('Content / SEO', 4000, 220000, 9100, 520, 58, 14900),
    ch('Affiliates', 3000, 140000, 3300, 190, 19, 4300),
  ],
}

const SORTS: [SortKey, string][] = [['roas', 'ROAS'], ['profitRoi', 'Profit ROI'], ['net', 'Net profit'], ['ltvCac', 'LTV : CAC'], ['cac', 'CAC (low first)']]

export default function MarketingRoiCalculator() {
  const [s, set, reset] = useToolState('marketing-roi-calculator', DEF)
  const m = (x: number, d = 0) => money(x, s.currency, d)
  const econ = { margin: s.margin / 100, arpu: s.arpu, lifetime: s.lifetime, fixed: s.fixed }
  const rows = s.channels.map((c) => ({ c, k: metrics(c, econ) }))
  const tot = total(s.channels)
  const tk = metrics(tot, econ)
  const bl = blended(s.channels, econ)
  const be = breakEvenRoas(econ.margin)
  const sorted = [...rows].sort((a, b) => {
    const va = a.k[s.sort], vb = b.k[s.sort]
    const na = Number.isFinite(va) ? va : s.sort === 'cac' ? Infinity : -Infinity
    const nb = Number.isFinite(vb) ? vb : s.sort === 'cac' ? Infinity : -Infinity
    return s.sort === 'cac' ? na - nb : nb - na
  })
  const losers = rows.filter((r) => r.k.roas < be)
  const ranked = rows.filter((r) => Number.isFinite(r.k.profitRoi)).sort((a, b) => b.k.profitRoi - a.k.profitRoi)
  const best = ranked[0], worst = ranked[ranked.length - 1]
  const shift = worst ? worst.c.spend * 0.2 : 0
  const gain = best && worst && best !== worst ? shift * (best.k.profitRoi - worst.k.profitRoi) : 0
  const edit = (id: string, p: Partial<Channel>) => set({ channels: s.channels.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  const cell = (c: Channel, key: keyof Channel, w = 92) => (
    <input key={key} type="number" min={0} value={c[key] as number} style={{ width: w }} aria-label={key}
      onChange={(e) => edit(c.id, { [key]: Math.max(0, Number(e.target.value) || 0) } as Partial<Channel>)} />
  )
  const tone = (k: Metrics) => (k.roas >= be * 1.5 ? 'var(--ok)' : k.roas >= be ? 'var(--warn)' : 'var(--err)')
  const p = (x: number) => (Number.isFinite(x) ? pct(x, 1) : '—')
  const r2 = (x: number, suf = '') => (Number.isFinite(x) ? `${num(x, 2)}${suf}` : '—')

  return (
    <Split wide="right">
      <div>
        <Panel title="Business economics" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
            <Num label="Fixed marketing costs" value={s.fixed} onChange={(fixed) => set({ fixed: Math.max(0, fixed) })} unit={s.currency} min={0} hint="tools, salaries, agency" />
          </Row>
          <Slider label="Gross margin" value={s.margin} min={5} max={100} unit="%" onChange={(margin) => set({ margin })} />
          <Row>
            <Num label="Revenue per customer / month" value={s.arpu} onChange={(arpu) => set({ arpu: Math.max(0, arpu) })} unit={s.currency} min={0} />
            <Num label="Customer lifetime" value={s.lifetime} onChange={(lifetime) => set({ lifetime: Math.max(0, lifetime) })} unit="mo" min={0} />
          </Row>
          <Note>
            Break-even ROAS at {s.margin}% margin is <b>{r2(be, '×')}</b>: every {s.currency}1 of ads must bring {m(be, 2)} of revenue just to pay for the goods sold. Customer lifetime value (gross profit) = {m(s.arpu)} × {s.margin}% × {s.lifetime} mo = <b>{m(tk.ltv)}</b>.
          </Note>
        </Panel>
        <Panel title="Spend vs. revenue share">
          <div className="k-label">Spend</div>
          <Donut size={150} slices={s.channels.map((c) => ({ label: c.name, value: c.spend }))} fv={(v) => m(v)} />
          <div className="k-label" style={{ marginTop: 10 }}>Revenue</div>
          <Donut size={150} slices={s.channels.map((c) => ({ label: c.name, value: c.revenue }))} fv={(v) => m(v)} />
        </Panel>
        <Panel title="Formulas">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
            <li><b>ROAS</b> = revenue ÷ ad spend</li>
            <li><b>ROI</b> = (revenue − spend) ÷ spend</li>
            <li><b>Profit ROI</b> = (revenue × margin − spend) ÷ spend</li>
            <li><b>CAC</b> = spend ÷ new customers · <b>CPL</b> = spend ÷ leads</li>
            <li><b>CPC</b> = spend ÷ clicks · <b>CPM</b> = spend ÷ impressions × 1000</li>
            <li><b>LTV : CAC</b> — aim for 3 : 1 or better</li>
            <li><b>Payback</b> = CAC ÷ (monthly revenue × margin)</li>
          </ul>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Revenue" value={m(tot.revenue)} sub={`from ${m(tot.spend)} ads + ${m(s.fixed)} fixed`} />
          <Stat label="Blended ROAS" value={r2(tk.roas, '×')} tone={tk.roas >= be ? 'good' : 'bad'} sub={`break-even ${r2(be, '×')}`} />
          <Stat label="Net profit (incl. fixed)" value={m(bl.net)} tone={bl.net >= 0 ? 'good' : 'bad'} sub={`ROI ${p(bl.roi)}`} />
          <Stat label="Blended CAC" value={m(tk.cac, 2)} sub={`${num(tot.customers, 0)} customers · LTV:CAC ${r2(tk.ltvCac)} · payback ${r2(tk.payback, ' mo')}`} tone="accent" />
        </Stats>
        <Panel title="Campaign inputs" actions={<>
          <Btn onClick={() => set({ channels: [...s.channels, ch('New channel', 1000, 50000, 1000, 50, 5, 2000)] })}>+ Channel</Btn>
          <JsonButtons name="marketing-roi.json" data={s} onLoad={(d) => d && Array.isArray(d.channels) && set({ ...DEF, ...d })} />
        </>}>
          <Table
            head={['Channel', `Spend ${s.currency}`, 'Impressions', 'Clicks', 'Leads', 'Customers', `Revenue ${s.currency}`, '']}
            rows={s.channels.map((c) => [
              <input key="n" value={c.name} onChange={(e) => edit(c.id, { name: e.target.value })} aria-label="Channel name" style={{ width: 130 }} />,
              cell(c, 'spend'), cell(c, 'impressions', 104), cell(c, 'clicks'), cell(c, 'leads', 74), cell(c, 'customers', 74), cell(c, 'revenue'),
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ channels: s.channels.filter((x) => x.id !== c.id) })}>✕</Btn>,
            ])}
            foot={['Total', m(tot.spend), num(tot.impressions, 0), num(tot.clicks, 0), num(tot.leads, 0), num(tot.customers, 0), m(tot.revenue), '']}
          />
        </Panel>
        <Panel title="Channel comparison" actions={<>
          <Select label="Rank by" value={s.sort} onChange={(sort) => set({ sort })} options={SORTS} />
          <CsvButton name="marketing-roi.csv" rows={() => [['Channel', 'Spend', 'Revenue', 'ROAS', 'ROI', 'Profit ROI', 'Net profit', 'CAC', 'CPL', 'CPC', 'CPM', 'CTR', 'Lead rate', 'Close rate', 'LTV:CAC', 'Payback months'],
            ...[...rows, { c: tot, k: tk }].map(({ c, k }) => [c.name, c.spend, c.revenue, +k.roas.toFixed(3), +k.roi.toFixed(4), +k.profitRoi.toFixed(4), +k.net.toFixed(2), +k.cac.toFixed(2), +k.cpl.toFixed(2), +k.cpc.toFixed(3), +k.cpm.toFixed(2), +k.ctr.toFixed(4), +k.leadRate.toFixed(4), +k.closeRate.toFixed(4), +k.ltvCac.toFixed(2), +k.payback.toFixed(2)])]} />
        </>}>
          <Table
            head={['#', 'Channel', 'ROAS', 'ROI', 'Profit ROI', 'Net profit', 'CAC', 'CPL', 'CPC', 'CTR', 'Close', 'LTV:CAC', 'Payback']}
            rows={sorted.map(({ c, k }, i) => [
              i + 1,
              <b key="n">{c.name}</b>,
              <b key="r" style={{ color: tone(k) }}>{r2(k.roas, '×')}</b>,
              p(k.roi),
              <span key="p" style={{ color: k.profitRoi < 0 ? 'var(--err)' : undefined }}>{p(k.profitRoi)}</span>,
              <span key="np" style={{ color: k.net < 0 ? 'var(--err)' : 'var(--ok)' }}>{m(k.net)}</span>,
              Number.isFinite(k.cac) ? m(k.cac, 2) : '—',
              Number.isFinite(k.cpl) ? m(k.cpl, 2) : '—',
              Number.isFinite(k.cpc) ? m(k.cpc, 2) : '—',
              p(k.ctr),
              p(k.closeRate),
              <span key="l" style={{ color: k.ltvCac >= 3 ? 'var(--ok)' : k.ltvCac >= 1 ? 'var(--warn)' : 'var(--err)' }}>{r2(k.ltvCac)}</span>,
              r2(k.payback, ' mo'),
            ])}
            foot={['', 'Blended', r2(tk.roas, '×'), p(tk.roi), p(tk.profitRoi), m(tk.net), m(tk.cac, 2), m(tk.cpl, 2), m(tk.cpc, 2), p(tk.ctr), p(tk.closeRate), r2(tk.ltvCac), r2(tk.payback, ' mo')]}
          />
        </Panel>
        <Panel title="ROAS by channel">
          <BarChart bars={rows.map(({ c, k }) => ({ label: c.name, value: Number.isFinite(k.roas) ? +k.roas.toFixed(2) : 0, color: k.roas >= be * 1.5 ? '#10b981' : k.roas >= be ? '#f59e0b' : '#ef4444' }))} fy={(v) => `${num(v, 1)}×`} />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Green ≥ 1.5 × break-even, amber profitable but thin, red loses money on gross profit (below {r2(be, '×')}).</p>
        </Panel>
        {losers.length > 0 && <Note tone="err">Below break-even ROAS: {losers.map((r) => `${r.c.name} (${r2(r.k.roas, '×')})`).join(', ')}. These channels lose money once cost of goods is counted — fix targeting or cut spend.</Note>}
        {best && worst && best !== worst && (
          <Note tone="ok">
            Reallocation idea: moving 20% of <b>{worst.c.name}</b> spend ({m(shift)}) to <b>{best.c.name}</b> would add about <b>{m(gain)}</b> gross profit if {best.c.name} keeps its current efficiency (profit ROI {p(best.k.profitRoi)} vs {p(worst.k.profitRoi)}). Returns usually diminish as spend grows, so test in steps.
          </Note>
        )}
      </div>
    </Split>
  )
}
