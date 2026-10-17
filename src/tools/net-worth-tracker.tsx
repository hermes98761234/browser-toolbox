import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, color, CsvButton, Donut, JsonButtons, Legend, money, Note, Panel, pct, Row, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { change, cmgr, monthIndex, monthsBack, nextMonth, sortSnaps, totals, type Acct, type Snap } from './lib/net-worth-tracker'

const ASSET_CATS = ['Cash', 'Investments', 'Retirement', 'Real estate', 'Vehicles', 'Other assets']
const DEBT_CATS = ['Mortgage', 'Credit cards', 'Student loans', 'Auto loans', 'Other debt']
const CAT_COLOR: Record<string, string> = { Cash: '#0ea5e9', Investments: '#6366f1', Retirement: '#a855f7', 'Real estate': '#10b981', Vehicles: '#f59e0b', 'Other assets': '#64748b', Mortgage: '#ef4444', 'Credit cards': '#f97316', 'Student loans': '#ec4899', 'Auto loans': '#eab308', 'Other debt': '#94a3b8' }

interface State { currency: string; accounts: Acct[]; snaps: Snap[]; month: string }

function sample(): State {
  const accounts: Acct[] = [
    { id: 'chk', name: 'Checking', kind: 'asset', cat: 'Cash' },
    { id: 'sav', name: 'High-yield savings', kind: 'asset', cat: 'Cash' },
    { id: 'brk', name: 'Brokerage (index funds)', kind: 'asset', cat: 'Investments' },
    { id: '401', name: '401(k)', kind: 'asset', cat: 'Retirement' },
    { id: 'ira', name: 'Roth IRA', kind: 'asset', cat: 'Retirement' },
    { id: 'home', name: 'Home (estimate)', kind: 'asset', cat: 'Real estate' },
    { id: 'car', name: 'Car', kind: 'asset', cat: 'Vehicles' },
    { id: 'mort', name: 'Mortgage', kind: 'liability', cat: 'Mortgage' },
    { id: 'cc', name: 'Credit card', kind: 'liability', cat: 'Credit cards' },
    { id: 'stu', name: 'Student loan', kind: 'liability', cat: 'Student loans' },
    { id: 'auto', name: 'Car loan', kind: 'liability', cat: 'Auto loans' },
  ]
  const now = new Date()
  const snaps: Snap[] = []
  for (let k = 17; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const t = 17 - k
    const mkt = 1 + 0.008 * t + 0.03 * Math.sin(t / 2.2) - (t > 8 && t < 11 ? 0.06 : 0)
    snaps.push({
      month: m,
      values: {
        chk: Math.round(3200 + 600 * Math.sin(t * 1.3)), sav: 8000 + t * 650, brk: Math.round((21000 + t * 500) * mkt), '401': Math.round((58000 + t * 1150) * mkt), ira: Math.round((14500 + t * 540) * mkt),
        home: 385000 + t * 900, car: Math.max(9000, 21000 - t * 280), mort: Math.round(301000 - t * 640), cc: Math.round(1900 + 900 * Math.abs(Math.sin(t))), stu: Math.max(0, 18400 - t * 420), auto: Math.max(0, 9800 - t * 410),
      },
    })
  }
  return { currency: '$', accounts, snaps, month: snaps[snaps.length - 1].month }
}
const DEF = sample()

function Arrow({ v }: { v: number | null }) {
  if (v === null || !Number.isFinite(v)) return <span className="muted">—</span>
  const up = v >= 0
  return <span style={{ color: up ? 'var(--ok)' : 'var(--err)', fontWeight: 700, whiteSpace: 'nowrap' }}>{up ? '▲' : '▼'} {pct(Math.abs(v))}</span>
}

/** Stacked area chart: assets stacked above zero, debts below, net worth as a line. */
function StackChart({ rows, cats, fy }: { rows: { month: string; byCat: Record<string, number>; net: number }[]; cats: { name: string; debt: boolean }[]; fy: (v: number) => string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(640)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = 300, L = 64, R = 16, T = 10, B = 26
  const up = rows.map((r) => cats.filter((c) => !c.debt).reduce((s, c) => s + (r.byCat[c.name] ?? 0), 0))
  const dn = rows.map((r) => cats.filter((c) => c.debt).reduce((s, c) => s + (r.byCat[c.name] ?? 0), 0))
  const hi = Math.max(1, ...up), lo = -Math.max(0, ...dn)
  const X = (i: number) => L + (rows.length > 1 ? (i / (rows.length - 1)) * (W - L - R) : (W - L - R) / 2)
  const Y = (v: number) => T + ((hi - v) / (hi - lo || 1)) * (H - T - B)
  const layers: { name: string; d: string; c: string }[] = []
  for (const debt of [false, true]) {
    const acc = rows.map(() => 0)
    for (const c of cats.filter((x) => x.debt === debt)) {
      const base = [...acc]
      rows.forEach((r, i) => (acc[i] += (debt ? -1 : 1) * (r.byCat[c.name] ?? 0)))
      const top = rows.map((_, i) => `${X(i).toFixed(1)},${Y(acc[i]).toFixed(1)}`)
      const bot = rows.map((_, i) => `${X(i).toFixed(1)},${Y(base[i]).toFixed(1)}`).reverse()
      layers.push({ name: c.name, d: `M${top.join('L')}L${bot.join('L')}Z`, c: CAT_COLOR[c.name] ?? color(layers.length) })
    }
  }
  const step = Math.ceil(rows.length / Math.max(2, Math.floor((W - L) / 70)))
  const ticks = [lo, lo / 2, 0, hi / 3, (2 * hi) / 3, hi].filter((v, i, a) => a.indexOf(v) === i)
  return (
    <div ref={ref} className="k-chart">
      <svg width={W} height={H} onMouseMove={(e) => setHover(Math.round(((e.nativeEvent.offsetX - L) / (W - L - R)) * (rows.length - 1)))} onMouseLeave={() => setHover(null)} role="img" aria-label="Net worth over time">
        {ticks.map((v) => (
          <g key={v}>
            <line className="grid" x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} />
            <text x={L - 6} y={Y(v) + 4} textAnchor="end">{fy(v)}</text>
          </g>
        ))}
        {layers.map((l) => <path key={l.name} d={l.d} fill={l.c} opacity={0.78}><title>{l.name}</title></path>)}
        <line className="axis" x1={L} x2={W - R} y1={Y(0)} y2={Y(0)} />
        <path d={rows.map((r, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(r.net).toFixed(1)}`).join('')} fill="none" stroke="var(--fg)" strokeWidth={2.5} />
        {rows.map((r, i) => <circle key={r.month} cx={X(i)} cy={Y(r.net)} r={hover === i ? 5 : 2.5} fill="var(--fg)" />)}
        {rows.map((r, i) => (i % step === 0 || i === rows.length - 1 ? <text key={r.month} x={X(i)} y={H - 8} textAnchor={i === rows.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'}>{r.month.slice(2)}</text> : null))}
        {hover !== null && hover >= 0 && hover < rows.length && <line x1={X(hover)} x2={X(hover)} y1={T} y2={H - B} stroke="var(--muted)" strokeDasharray="3 3" />}
      </svg>
      {hover !== null && hover >= 0 && hover < rows.length && (
        <div className="k-tip" style={{ left: Math.min(X(hover) + 12, W - 200), top: 10 }}>
          <b>{rows[hover].month}</b> · net {fy(rows[hover].net)}
          {cats.map((c) => (rows[hover].byCat[c.name] ? <div key={c.name}><i style={{ background: CAT_COLOR[c.name] }} /> {c.name}: {c.debt ? '−' : ''}{fy(rows[hover].byCat[c.name])}</div> : null))}
        </div>
      )}
      <Legend items={[['Net worth', 'var(--fg)'], ...cats.map((c) => [c.name, CAT_COLOR[c.name] ?? '#888'] as [string, string])]} />
    </div>
  )
}

export default function NetWorthTracker() {
  const [s, set, reset] = useToolState<State>('net-worth-tracker', DEF)
  const m = (x: number) => money(x, s.currency, 0)
  const snaps = useMemo(() => sortSnaps(s.snaps), [s.snaps])
  const rows = useMemo(() => snaps.map((x) => totals(s.accounts, x)), [snaps, s.accounts])
  const cur = snaps.find((x) => x.month === s.month) ?? snaps[snaps.length - 1]
  const ci = snaps.indexOf(cur)
  const prev = ci > 0 ? snaps[ci - 1] : null
  const t = cur ? totals(s.accounts, cur) : null
  const tp = prev ? totals(s.accounts, prev) : null
  const yr = cur ? monthsBack(snaps, cur.month, 12) : null
  const ty = yr ? totals(s.accounts, yr) : null
  const first = rows[0]
  const growth = t && first ? cmgr(first.net, t.net, monthIndex(t.month) - monthIndex(first.month)) : null
  const cats = useMemo(() => [...ASSET_CATS, ...DEBT_CATS].filter((c) => s.accounts.some((a) => a.cat === c)).concat([...new Set(s.accounts.map((a) => a.cat))].filter((c) => !ASSET_CATS.includes(c) && !DEBT_CATS.includes(c))).map((c) => ({ name: c, debt: s.accounts.some((a) => a.cat === c && a.kind === 'liability') })), [s.accounts])

  const setVal = (id: string, v: number) => set({ snaps: s.snaps.map((x) => (x.month === cur.month ? { ...x, values: { ...x.values, [id]: v } } : x)) })
  const addSnapshot = () => {
    const last = snaps[snaps.length - 1]
    const month = last ? nextMonth(last.month) : new Date().toISOString().slice(0, 7)
    set({ snaps: [...s.snaps, { month, values: { ...(last?.values ?? {}) } }], month })
  }
  const addAcct = (kind: Acct['kind']) => {
    const a: Acct = { id: uid(), name: kind === 'asset' ? 'New asset' : 'New debt', kind, cat: kind === 'asset' ? 'Other assets' : 'Other debt' }
    set({ accounts: [...s.accounts, a] })
  }
  const liquid = t ? (t.byCat.Cash ?? 0) + (t.byCat.Investments ?? 0) : 0

  const accRows = (kind: Acct['kind']) => s.accounts.filter((a) => a.kind === kind).map((a) => {
    const v = Number(cur?.values[a.id]) || 0
    const pv = prev ? Number(prev.values[a.id]) || 0 : null
    const ch = pv === null ? null : change(v, pv)
    return [
      <input key="n" value={a.name} onChange={(e) => set({ accounts: s.accounts.map((x) => (x.id === a.id ? { ...x, name: e.target.value } : x)) })} aria-label="Account name" style={{ minWidth: 130 }} />,
      <select key="c" value={a.cat} onChange={(e) => set({ accounts: s.accounts.map((x) => (x.id === a.id ? { ...x, cat: e.target.value } : x)) })} aria-label="Category" style={{ minWidth: 120 }}>
        {(kind === 'asset' ? ASSET_CATS : DEBT_CATS).map((c) => <option key={c}>{c}</option>)}
      </select>,
      <input key="v" type="number" min={0} value={v} onChange={(e) => setVal(a.id, Math.abs(Number(e.target.value) || 0))} aria-label="Balance" style={{ width: 110 }} />,
      kind === 'liability' && ch !== null ? <Arrow key="a" v={-ch} /> : <Arrow key="a" v={ch} />,
      <Btn key="x" kind="ghost" title="Delete account" onClick={() => confirm(`Delete “${a.name}” and its history?`) && set({ accounts: s.accounts.filter((x) => x.id !== a.id) })}>✕</Btn>,
    ]
  })

  return (
    <div>
      <Stats>
        <Stat label={`Net worth · ${cur?.month ?? ''}`} value={t ? m(t.net) : '—'} sub={t ? `${m(t.assets)} assets − ${m(t.liabilities)} debts` : ''} tone="accent" />
        <Stat label="vs. last month" value={t && tp ? m(t.net - tp.net) : '—'} sub={<Arrow v={t && tp ? change(t.net, tp.net) : null} />} />
        <Stat label="vs. a year ago" value={t && ty ? m(t.net - ty.net) : '—'} sub={<Arrow v={t && ty ? change(t.net, ty.net) : null} />} />
        <Stat label="Debt-to-asset" value={t ? pct(t.liabilities / (t.assets || 1), 0) : '—'} sub={growth !== null ? `avg growth ${pct(growth, 2)}/month` : `liquid ${m(liquid)}`} tone={t && t.liabilities / (t.assets || 1) > 0.6 ? 'bad' : 'good'} />
      </Stats>
      <Panel title="Net worth over time" actions={<><CsvButton name="net-worth.csv" rows={() => [['Month', ...s.accounts.map((a) => `${a.name} (${a.kind})`), 'Assets', 'Liabilities', 'Net worth'], ...snaps.map((x, i) => [x.month, ...s.accounts.map((a) => Number(x.values[a.id]) || 0), rows[i].assets, rows[i].liabilities, rows[i].net])]} /><JsonButtons name="net-worth.json" data={s} onLoad={(d) => set(d)} /><Btn kind="ghost" onClick={() => confirm('Replace your data with the sample?') && reset()}>Sample</Btn></>}>
        {rows.length ? <StackChart rows={rows} cats={cats} fy={(v) => `${v < 0 ? '−' : ''}${Math.abs(v) >= 1e6 ? `${s.currency}${(Math.abs(v) / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e3 ? `${s.currency}${Math.round(Math.abs(v) / 1e3)}k` : m(Math.abs(v))}`} /> : <div className="k-chart empty">Add a snapshot to start.</div>}
      </Panel>
      <Split>
        <div>
          <Panel title="Snapshot" actions={<Btn kind="primary" onClick={addSnapshot}>+ Next month</Btn>}>
            <Row>
              <Select label="Month" value={cur?.month ?? ''} onChange={(month) => set({ month })} options={snaps.map((x) => x.month).reverse()} />
              <label className="k-field">
                <span className="k-label">Rename month</span>
                <input className="k-text" type="month" value={cur?.month ?? ''} onChange={(e) => e.target.value && !snaps.some((x) => x.month === e.target.value) && set({ snaps: s.snaps.map((x) => (x.month === cur.month ? { ...x, month: e.target.value } : x)), month: e.target.value })} />
              </label>
              <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ', 'C$', 'A$']} />
            </Row>
            <p className="k-hint">“Next month” copies the latest balances so you only update what changed. Enter debts as positive amounts owed.</p>
            {snaps.length > 1 && <Btn kind="danger" onClick={() => confirm(`Delete snapshot ${cur.month}?`) && set({ snaps: s.snaps.filter((x) => x.month !== cur.month), month: snaps[Math.max(0, ci - 1)].month })}>Delete this snapshot</Btn>}
          </Panel>
          <Panel title={`Assets · ${t ? m(t.assets) : ''}`} actions={<Btn onClick={() => addAcct('asset')}>+ Asset</Btn>}>
            <Table head={['Account', 'Category', `Balance (${s.currency.trim()})`, 'MoM', '']} rows={accRows('asset')} />
          </Panel>
          <Panel title={`Liabilities · ${t ? m(t.liabilities) : ''}`} actions={<Btn onClick={() => addAcct('liability')}>+ Debt</Btn>}>
            <Table head={['Account', 'Category', `Owed (${s.currency.trim()})`, 'MoM', '']} rows={accRows('liability')} />
            <p className="k-hint">For debts, ▲ green means the balance went down.</p>
          </Panel>
        </div>
        <div>
          <Panel title="Asset allocation">
            {t && <Donut slices={ASSET_CATS.filter((c) => (t.byCat[c] ?? 0) > 0 && s.accounts.some((a) => a.cat === c && a.kind === 'asset')).map((c) => ({ label: c, value: t.byCat[c], color: CAT_COLOR[c] }))} fv={m} center={<span>{m(t.assets)}</span>} />}
          </Panel>
          <Panel title="History">
            <Table
              max={24}
              head={['Month', 'Assets', 'Debts', 'Net worth', 'Change']}
              rows={rows.slice().reverse().map((r, i, arr) => [
                <button key="m" type="button" className={`k-btn ${r.month === cur?.month ? 'primary' : 'ghost'}`} style={{ padding: '2px 8px' }} onClick={() => set({ month: r.month })}>{r.month}</button>,
                m(r.assets), m(r.liabilities), <b key="n">{m(r.net)}</b>,
                <Arrow key="c" v={arr[i + 1] ? change(r.net, arr[i + 1].net) : null} />,
              ])}
            />
          </Panel>
          {t && t.net < 0 && <Note tone="warn">Net worth is negative — common early in a career or after buying a home. Track the trend, not the single number.</Note>}
          <Note>Data stays in this browser (localStorage). Use Backup to save a JSON copy and Restore on another device.</Note>
        </div>
      </Split>
    </div>
  )
}
