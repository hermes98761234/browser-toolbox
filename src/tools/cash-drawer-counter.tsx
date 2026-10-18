import { useMemo } from 'react'
import { Btn, CopyButton, CsvButton, money, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, today, uid, useToolState } from '../kit'
import { CURRENCIES, dkey, expected, fmtDenom, keepFloat, pieces, rollSize, status, total, type Line } from './lib/cash-drawer-counter'

interface Log { id: string; date: string; register: string; cashier: string; counted: number; expected: number; variance: number; deposit: number }
const SAMPLE_USD: Record<string, [number, number]> = {
  'note:100': [2, 0], 'note:50': [3, 0], 'note:20': [24, 0], 'note:10': [17, 0], 'note:5': [21, 0], 'note:1': [46, 0],
  'coin:0.25': [33, 1], 'coin:0.1': [27, 0], 'coin:0.05': [18, 0], 'coin:0.01': [41, 1],
}
const DEF = {
  cur: 'USD', register: 'Register 1', cashier: 'Alex', date: today(),
  counts: SAMPLE_USD as Record<string, [number, number]>,
  float: 200, sales: 1005.6, paidIn: 0, paidOut: 18.5, refunds: 12.99, tolerance: 1,
  log: [] as Log[],
}

export default function CashDrawerCounter() {
  const [s, set, reset] = useToolState('cash-drawer-counter', DEF)
  const cur = CURRENCIES.find((c) => c.code === s.cur) ?? CURRENCIES[0]
  const m = (x: number) => money(x, cur.symbol, cur.decimals)
  const lines: Line[] = cur.denoms.map((d) => ({ d, loose: s.counts[dkey(d)]?.[0] ?? 0, rolls: s.counts[dkey(d)]?.[1] ?? 0 }))
  const counted = total(lines, cur)
  const exp = expected(s)
  const variance = Math.round((counted - exp) * 10 ** cur.decimals) / 10 ** cur.decimals
  const st = status(variance, s.tolerance)
  const hasRolls = cur.denoms.some((d) => rollSize(cur.code, d) > 0)
  const notes = total(lines.filter((l) => l.d.kind === 'note'), cur)
  const kept = useMemo(() => {
    const target = Math.min(s.float, counted)
    if (Math.round(target * 10 ** cur.decimals) > 300000) return null
    return keepFloat(lines.map((l) => ({ v: l.d.v, n: pieces(l, cur.code) })), target, cur.decimals)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.counts, s.float, s.cur, counted])
  const deposit = kept ? counted - kept.amount : counted - s.float

  const setCount = (k: string, i: 0 | 1, v: number) => {
    const cur2 = s.counts[k] ?? [0, 0]
    const next: [number, number] = [...cur2] as [number, number]
    next[i] = Math.max(0, Math.floor(v) || 0)
    set({ counts: { ...s.counts, [k]: next } })
  }
  const step = (k: string, d: number) => setCount(k, 0, (s.counts[k]?.[0] ?? 0) + d)

  const slipText = () => [
    `CASH DRAWER COUNT — ${s.register}`,
    `Date: ${s.date}   Cashier: ${s.cashier}`,
    '',
    ...lines.filter((l) => pieces(l, cur.code) > 0).map((l) => `${fmtDenom(l.d.v, cur).padEnd(8)} x ${String(pieces(l, cur.code)).padStart(5)} = ${m(l.d.v * pieces(l, cur.code)).padStart(12)}`),
    '',
    `Counted:       ${m(counted)}`,
    `Opening float: ${m(s.float)}`,
    `Cash sales:    ${m(s.sales)}`,
    `Paid in:       ${m(s.paidIn)}`,
    `Paid out:      ${m(s.paidOut)}`,
    `Cash refunds:  ${m(s.refunds)}`,
    `Expected:      ${m(exp)}`,
    `Variance:      ${variance >= 0 ? '+' : ''}${m(variance)} (${st.toUpperCase()})`,
    `Deposit:       ${m(deposit)}   Float kept: ${m(kept?.amount ?? s.float)}`,
    '',
    'Counted by: ____________   Verified by: ____________',
  ].join('\n')

  const print = () => {
    const w = window.open('', '_blank', 'width=420,height=700')
    if (!w) return
    const pre = w.document.createElement('pre')
    pre.textContent = slipText()
    pre.style.cssText = 'font: 13px/1.45 ui-monospace, Menlo, Consolas, monospace; margin: 16px;'
    w.document.title = `Drawer count ${s.date}`
    w.document.body.appendChild(pre)
    w.focus()
    w.print()
  }

  const tone = st === 'balanced' ? 'good' : 'bad'

  return (
    <Split wide="left">
      <div>
        <Panel title="Count the drawer" actions={<>
          <Btn onClick={() => set({ counts: {} })}>Clear counts</Btn>
          <Btn kind="ghost" onClick={reset}>Sample</Btn>
        </>}>
          <Row>
            <Select label="Currency" value={s.cur} onChange={(c) => set({ cur: c, counts: c === s.cur ? s.counts : {} })} options={CURRENCIES.map((c) => [c.code, `${c.code} (${c.symbol.trim()})`] as [string, string])} />
            <label className="k-field"><span className="k-label">Register</span><input className="k-text" value={s.register} onChange={(e) => set({ register: e.target.value })} /></label>
            <label className="k-field"><span className="k-label">Cashier</span><input className="k-text" value={s.cashier} onChange={(e) => set({ cashier: e.target.value })} /></label>
            <label className="k-field"><span className="k-label">Date</span><input className="k-text" type="date" value={s.date} onChange={(e) => set({ date: e.target.value })} /></label>
          </Row>
          <Table
            head={['Denomination', 'Loose count', ...(hasRolls ? ['Rolls'] : []), 'Pieces', 'Amount']}
            rows={lines.map((l) => {
              const k = dkey(l.d)
              const rs = rollSize(cur.code, l.d)
              const amt = l.d.v * pieces(l, cur.code)
              return [
                <span key="d" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ display: 'inline-block', width: l.d.kind === 'note' ? 30 : 18, height: 18, borderRadius: l.d.kind === 'note' ? 3 : 9, background: l.d.kind === 'note' ? '#86efac' : '#fcd34d', border: '1px solid rgba(0,0,0,.25)' }} />
                  <b>{fmtDenom(l.d.v, cur)}</b><span className="muted" style={{ fontSize: 12 }}>{l.d.kind}</span>
                </span>,
                <span key="c" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <Btn kind="ghost" onClick={() => step(k, -1)} title="One less">−</Btn>
                  <input type="number" min={0} inputMode="numeric" value={l.loose || ''} placeholder="0" onChange={(e) => setCount(k, 0, Number(e.target.value))} style={{ width: 70 }} aria-label={`Count of ${fmtDenom(l.d.v, cur)}`} />
                  <Btn kind="ghost" onClick={() => step(k, 1)} title="One more">+</Btn>
                </span>,
                ...(hasRolls ? [rs ? <span key="r" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><input type="number" min={0} value={l.rolls || ''} placeholder="0" onChange={(e) => setCount(k, 1, Number(e.target.value))} style={{ width: 54 }} aria-label="Rolls" /><span className="muted" style={{ fontSize: 12 }}>× {rs}</span></span> : <span key="r" className="muted">—</span>] : []),
                pieces(l, cur.code),
                <b key="a">{m(amt)}</b>,
              ]
            })}
            foot={['Total', '', ...(hasRolls ? [''] : []), lines.reduce((a, l) => a + pieces(l, cur.code), 0), m(counted)]}
          />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Counted" value={m(counted)} sub={`notes ${m(notes)} · coins ${m(counted - notes)}`} tone="accent" />
          <Stat label="Expected" value={m(exp)} />
          <Stat label={st === 'balanced' ? 'Balanced' : st === 'over' ? 'Over' : 'Short'} value={`${variance > 0 ? '+' : ''}${m(variance)}`} tone={tone} sub={`tolerance ±${m(s.tolerance)}`} />
        </Stats>
        <Panel title="Expected cash">
          <Row>
            <Num label="Opening float" value={s.float} onChange={(float) => set({ float })} unit={cur.symbol.trim()} min={0} />
            <Num label="Cash sales (POS)" value={s.sales} onChange={(sales) => set({ sales })} unit={cur.symbol.trim()} min={0} />
          </Row>
          <Row>
            <Num label="Paid in" value={s.paidIn} onChange={(paidIn) => set({ paidIn })} unit={cur.symbol.trim()} min={0} />
            <Num label="Paid out" value={s.paidOut} onChange={(paidOut) => set({ paidOut })} unit={cur.symbol.trim()} min={0} />
          </Row>
          <Row>
            <Num label="Cash refunds" value={s.refunds} onChange={(refunds) => set({ refunds })} unit={cur.symbol.trim()} min={0} />
            <Num label="Tolerance ±" value={s.tolerance} onChange={(tolerance) => set({ tolerance })} unit={cur.symbol.trim()} min={0} />
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Expected = float + cash sales + paid in − paid out − refunds = <b>{m(exp)}</b></p>
          {st !== 'balanced' && <Note tone="warn">Drawer is {st} by {m(Math.abs(variance))}. Recount the largest notes first, check for unrecorded paid-outs, refunds or no-sale openings, and look for notes stuck under the tray.</Note>}
        </Panel>
        <Panel title="Float & deposit">
          {kept ? (
            <>
              <Stats>
                <Stat label="Leave in drawer" value={m(kept.amount)} sub={kept.amount < Math.min(s.float, counted) - 1e-9 ? 'exact float not possible' : 'exact float'} />
                <Stat label="Deposit" value={m(deposit)} tone="good" />
              </Stats>
              <Table head={['Denomination', 'Keep', 'Deposit']} rows={lines.map((l, i) => [fmtDenom(l.d.v, cur), kept.keep[i] || '', (pieces(l, cur.code) - kept.keep[i]) || '']).filter((r) => r[1] !== '' || r[2] !== '')} />
              <p className="muted" style={{ fontSize: 12 }}>The float keeps as many small notes and coins as possible so the next shift can make change.</p>
            </>
          ) : <Note>Float too large to optimise; deposit = counted − float = {m(deposit)}.</Note>}
        </Panel>
        <Panel title="Close out" actions={<>
          <Btn onClick={print}>🖨 Print slip</Btn>
          <CopyButton text={slipText} label="Copy slip" />
        </>}>
          <Btn kind="primary" onClick={() => set({ log: [{ id: uid(), date: s.date, register: s.register, cashier: s.cashier, counted, expected: exp, variance, deposit }, ...s.log].slice(0, 200) })}>Save to shift log</Btn>
          {s.log.length > 0 && (
            <>
              <Table head={['Date', 'Register', 'Cashier', 'Counted', 'Variance', 'Deposit', '']} rows={s.log.map((x) => [x.date, x.register, x.cashier, m(x.counted), <b key="v" style={{ color: Math.abs(x.variance) <= s.tolerance ? 'var(--ok)' : 'var(--err)' }}>{x.variance > 0 ? '+' : ''}{m(x.variance)}</b>, m(x.deposit), <Btn key="d" kind="ghost" onClick={() => set({ log: s.log.filter((y) => y.id !== x.id) })}>✕</Btn>])} max={20} />
              <Row>
                <CsvButton name="drawer-log.csv" rows={() => [['Date', 'Register', 'Cashier', 'Counted', 'Expected', 'Variance', 'Deposit'], ...s.log.map((x) => [x.date, x.register, x.cashier, x.counted, x.expected, x.variance, x.deposit])]} />
                <span className="muted" style={{ fontSize: 13 }}>Net variance: {m(s.log.reduce((a, x) => a + x.variance, 0))} over {s.log.length} counts</span>
              </Row>
            </>
          )}
        </Panel>
      </div>
    </Split>
  )
}
