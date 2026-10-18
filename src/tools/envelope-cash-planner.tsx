import { useMemo, useState } from 'react'
import { Btn, color, CopyButton, CsvButton, Donut, JsonButtons, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, money, num, uid, useToolState } from '../kit'
import { breakdown, cashRound, CURRENCIES, fmtDenom, withdrawal, type Denom } from './lib/envelope-cash-planner'

interface Envelope { id: string; name: string; amount: number; maxBill: number; note: string }
interface State { code: string; denoms: Denom[]; cash: number; title: string; envelopes: Envelope[]; round: boolean }

const DEF: State = {
  code: 'USD',
  denoms: CURRENCIES[0].denoms,
  cash: 1450,
  title: 'November',
  round: true,
  envelopes: [
    { id: 'g', name: 'Groceries', amount: 520, maxBill: 20, note: 'Weekly shop + market' },
    { id: 'f', name: 'Fuel', amount: 180, maxBill: 20, note: '' },
    { id: 'd', name: 'Dining out', amount: 140, maxBill: 20, note: '' },
    { id: 'h', name: 'Household', amount: 95, maxBill: 0, note: 'Cleaning, toiletries' },
    { id: 'k', name: 'Kids & school', amount: 120, maxBill: 10, note: 'Lunch money and field trips' },
    { id: 'p', name: 'Personal spending', amount: 150, maxBill: 0, note: '' },
    { id: 's', name: 'Gifts & birthdays', amount: 75, maxBill: 0, note: '' },
    { id: 'c', name: 'Coffee & treats', amount: 37.5, maxBill: 5, note: 'Small bills only' },
  ],
}

const PRINT = `@media print{body *{visibility:hidden!important}.ecp-labels,.ecp-labels *{visibility:visible!important}.ecp-labels{position:absolute;left:0;top:0;width:100%;display:grid!important;grid-template-columns:1fr 1fr;gap:10mm}.ecp-label{break-inside:avoid;border:1.5px dashed #000!important;background:#fff!important;color:#000!important;min-height:55mm}.ecp-noprint{display:none!important}}`

export default function EnvelopeCashPlanner() {
  const [s, set, reset] = useToolState('envelope-cash-planner', DEF)
  const [custom, setCustom] = useState('')
  const cur = useMemo(() => ({ ...(CURRENCIES.find((c) => c.code === s.code) ?? CURRENCIES[0]), denoms: s.denoms }), [s.code, s.denoms])
  const m = (x: number) => money(x, cur.symbol, cur.decimals)
  const notes = s.denoms.filter((d) => d.kind === 'note' && d.on).map((d) => d.v)
  const rows = useMemo(
    () => s.envelopes.map((e) => {
      const target = s.round ? cashRound(e.amount, cur) : e.amount
      return { e, target, b: breakdown(target, cur, e.maxBill > 0 ? e.maxBill : Infinity) }
    }),
    [s.envelopes, s.round, cur],
  )
  const total = rows.reduce((a, r) => a + r.b.paid, 0)
  const short = rows.filter((r) => r.b.remainder > 1e-9)
  const wd = withdrawal(rows.map((r) => r.b))
  const bills = wd.filter(([d]) => d.kind === 'note').reduce((a, [, c]) => a + c, 0)
  const coins = wd.filter(([d]) => d.kind === 'coin').reduce((a, [, c]) => a + c, 0)
  const left = s.cash - total
  const edit = (id: string, p: Partial<Envelope>) => set({ envelopes: s.envelopes.map((e) => (e.id === id ? { ...e, ...p } : e)) })
  const slipText = () => [`Cash withdrawal — ${s.title} (${m(total)})`, ...wd.map(([d, c]) => `${String(c).padStart(4)} × ${fmtDenom(d.v, cur).padEnd(7)} = ${m(c * d.v)}`)].join('\n')

  return (
    <Split wide="right">
      <div className="ecp-noprint">
        <Panel title="Cash & currency">
          <Row>
            <Select label="Currency" value={s.code} onChange={(code) => set({ code, denoms: (CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]).denoms })} options={CURRENCIES.map((c) => [c.code, `${c.code} (${c.symbol.trim()})`] as [string, string])} />
            <Num label="Cash to divide" value={s.cash} onChange={(cash) => set({ cash: Math.max(0, cash) })} unit={cur.symbol.trim()} min={0} />
            <Txt label="Label title" value={s.title} onChange={(title) => set({ title })} />
          </Row>
          <span className="k-label">Denominations in use (tap to toggle)</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
            {s.denoms.map((d, i) => (
              <button key={`${d.kind}${d.v}${i}`} type="button" onClick={() => set({ denoms: s.denoms.map((x, j) => (j === i ? { ...x, on: !x.on } : x)) })} title={d.kind}
                style={{ padding: '5px 10px', borderRadius: d.kind === 'coin' ? 999 : 6, border: '1px solid var(--line)', cursor: 'pointer', fontWeight: 700, background: d.on ? (d.kind === 'note' ? '#16a34a' : '#ca8a04') : 'var(--panel2)', color: d.on ? '#fff' : 'var(--muted)', textDecoration: d.on ? undefined : 'line-through' }}>
                {fmtDenom(d.v, cur)}
              </button>
            ))}
          </div>
          <Row>
            <Txt label="Add denomination" value={custom} onChange={setCustom} placeholder="e.g. 2 or 0.5" />
            <Btn onClick={() => { const v = Number(custom); if (v > 0 && !s.denoms.some((d) => d.v === v)) set({ denoms: [...s.denoms, { v, kind: (v >= 5 ? 'note' : 'coin') as Denom['kind'], on: true }].sort((a, b) => b.v - a.v) }); setCustom('') }}>+ Add</Btn>
            <Btn kind="ghost" onClick={() => set({ denoms: (CURRENCIES.find((c) => c.code === s.code) ?? CURRENCIES[0]).denoms })}>Preset</Btn>
          </Row>
          <label className="k-check"><input type="checkbox" checked={s.round} onChange={(e) => set({ round: e.target.checked })} /> Round each envelope to the nearest payable amount</label>
        </Panel>
        <Panel title="Envelopes" actions={<Btn onClick={() => set({ envelopes: [...s.envelopes, { id: uid(), name: 'New envelope', amount: 50, maxBill: 0, note: '' }] })}>+ Envelope</Btn>}>
          <Table head={['Envelope', 'Amount', 'Largest note', '']} rows={s.envelopes.map((e) => [
            <input key="n" value={e.name} onChange={(ev) => edit(e.id, { name: ev.target.value })} aria-label="Envelope name" />,
            <input key="a" type="number" min={0} step="any" value={e.amount} onChange={(ev) => edit(e.id, { amount: Math.max(0, Number(ev.target.value) || 0) })} style={{ width: 90 }} aria-label="Amount" />,
            <select key="m" value={e.maxBill} onChange={(ev) => edit(e.id, { maxBill: Number(ev.target.value) })} aria-label="Largest note">
              <option value={0}>Any</option>
              {notes.map((v) => <option key={v} value={v}>≤ {fmtDenom(v, cur)}</option>)}
            </select>,
            <Btn key="x" kind="ghost" onClick={() => set({ envelopes: s.envelopes.filter((x) => x.id !== e.id) })}>✕</Btn>,
          ])} foot={['Total', m(s.envelopes.reduce((a, e) => a + e.amount, 0)), '', '']} />
          <p className="muted" style={{ fontSize: 13 }}>Limit the largest note for spending envelopes so you can pay without asking for change. The breakdown always uses the fewest pieces allowed.</p>
          <Row>
            <JsonButtons name="cash-envelopes.json" data={s} onLoad={(d) => d && Array.isArray(d.envelopes) && set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
        <Panel title="Where the cash goes">
          <Donut slices={rows.filter((r) => r.b.paid > 0).map((r) => ({ label: r.e.name, value: r.b.paid }))} fv={m} center={<b>{m(total)}</b>} />
        </Panel>
      </div>
      <div>
        <div className="ecp-noprint">
          <Stats>
            <Stat label="In envelopes" value={m(total)} sub={`${s.envelopes.length} envelopes`} tone="accent" />
            <Stat label={left >= 0 ? 'Left over' : 'Short by'} value={m(Math.abs(left))} tone={left < -1e-9 ? 'bad' : 'good'} sub={`of ${m(s.cash)} cash`} />
            <Stat label="Notes" value={num(bills, 0)} sub={`${num(coins, 0)} coins`} />
          </Stats>
          {left < -1e-9 && <Note tone="err">The envelopes need {m(-left)} more than the cash you have. Lower some amounts or add cash.</Note>}
          {short.length > 0 && <Note tone="warn">{short.map((r) => `${r.e.name}: ${m(r.b.remainder)} can't be paid with the enabled denominations`).join('; ')}.</Note>}
          <Panel title="Bank withdrawal list" actions={<><CopyButton text={slipText} label="Copy" /><CsvButton name="cash-withdrawal.csv" rows={() => [['Denomination', 'Type', 'Count', 'Subtotal'], ...wd.map(([d, c]) => [d.v, d.kind, c, +(c * d.v).toFixed(cur.decimals)])]} /></>}>
            <Table head={['Denomination', 'Count', 'Subtotal']} rows={wd.map(([d, c]) => [<b key="d" style={{ color: d.kind === 'note' ? '#16a34a' : '#ca8a04' }}>{fmtDenom(d.v, cur)} {d.kind}</b>, `× ${c}`, m(c * d.v)])} foot={['Total', `${bills + coins} pieces`, m(total)]} />
          </Panel>
        </div>
        <Panel title="Envelope labels" actions={<Btn kind="primary" onClick={() => window.print()}>🖨 Print labels</Btn>}>
          <style>{PRINT}</style>
          <div className="ecp-labels" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
            {rows.map((r, i) => (
              <div key={r.e.id} className="ecp-label" style={{ border: `2px solid ${color(i)}`, borderRadius: 10, padding: 12, background: 'var(--panel)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <b style={{ fontSize: 17 }}>{r.e.name}</b>
                  <span className="muted" style={{ fontSize: 12 }}>{s.title}</span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, margin: '2px 0 6px' }}>{m(r.b.paid)}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {r.b.counts.map(([d, c]) => (
                    <span key={d.v} style={{ fontSize: 12, padding: '2px 7px', borderRadius: d.kind === 'coin' ? 999 : 4, border: `1px solid ${d.kind === 'note' ? '#16a34a' : '#ca8a04'}` }}>{c} × {fmtDenom(d.v, cur)}</span>
                  ))}
                  {!r.b.counts.length && <span className="muted" style={{ fontSize: 12 }}>empty</span>}
                </div>
                {r.target !== r.e.amount && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>rounded from {m(r.e.amount)}</div>}
                {r.e.note && <div style={{ fontSize: 12, marginTop: 6 }}>{r.e.note}</div>}
                <div style={{ marginTop: 8, fontSize: 11 }} className="muted">Spent: ________ Left: ________</div>
              </div>
            ))}
          </div>
          <p className="muted ecp-noprint" style={{ fontSize: 13 }}>Printing shows only these labels, two per row — cut them out and tape one to each envelope.</p>
        </Panel>
      </div>
    </Split>
  )
}
