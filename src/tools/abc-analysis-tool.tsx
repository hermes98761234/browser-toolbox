import { useMemo, useState } from 'react'
import { Area, Btn, CsvButton, FileDrop, money, Note, Panel, pct, Row, Select, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { classify, parseNum, summarize, type Cls } from './lib/abc-analysis-tool'
import { detectDelimiter, parseCsv } from './lib/csv-json-converter'

type Mode = 'qtycost' | 'value'
interface State { csv: string; mode: Mode; nameCol: number; qtyCol: number; costCol: number; valueCol: number; a: number; b: number; cur: string }

const SAMPLE = `SKU,Description,Annual units,Unit cost
P-1001,Hydraulic pump,160,845.00
M-2040,Servo motor 2kW,185,1120.00
C-3300,PLC controller,140,1890.00
B-0120,Ball bearing 6204,5200,3.40
S-0450,Steel shaft 40mm,950,28.50
G-7710,Gearbox 1:20,60,640.00
F-0011,Hex bolt M8,48000,0.09
F-0012,Hex nut M8,51000,0.04
V-5500,Pressure valve,310,96.00
H-0800,Hose assembly 1m,1400,18.20
E-1200,Proximity sensor,720,42.00
E-1250,Photo sensor,410,58.00
K-0300,Conveyor belt 5m,75,410.00
L-0001,Grease cartridge,2600,6.10
O-0400,O-ring kit,1800,4.75
T-1100,Timing belt,520,22.00
W-0090,Cable 3x1.5 (m),9000,0.95
R-0310,Relay 24V,980,7.80
D-2200,Frequency drive 4kW,155,980.00
X-0001,Filter element,860,31.00
Y-0020,Coupling,340,44.00
Z-0100,Label roll,700,3.20
A-0505,Air cylinder,190,135.00
N-0007,Washer M8,52000,0.02
J-0303,Junction box,260,26.00
Q-0909,Safety switch,150,88.00
U-0110,Cable gland,6200,0.55
I-0042,Indicator lamp,640,5.40`

const DEF: State = { csv: SAMPLE, mode: 'qtycost', nameCol: 1, qtyCol: 2, costCol: 3, valueCol: 2, a: 80, b: 95, cur: '$' }
const CC: Record<Cls, string> = { A: '#6366f1', B: '#f59e0b', C: '#94a3b8' }
const ADVICE: Record<Cls, string> = {
  A: 'Tight control: frequent counts, accurate forecasts, close supplier relationships, low safety stock with frequent orders.',
  B: 'Moderate control: periodic review, standard reorder points, quarterly counts.',
  C: 'Simple control: larger, infrequent orders, two-bin systems, annual counts.',
}

function Pareto({ rows, a, b }: { rows: { name: string; value: number; cum: number; cls: Cls }[]; a: number; b: number }) {
  const W = 820, H = 300, L = 50, R = 46, T = 14, B = 28
  const max = Math.max(1, ...rows.map((r) => r.value))
  const bw = (W - L - R) / Math.max(1, rows.length)
  const y = (v: number) => T + (1 - v / max) * (H - T - B)
  const yc = (c: number) => T + (1 - c) * (H - T - B)
  const line = rows.map((r, i) => `${i ? 'L' : 'M'}${(L + (i + 0.5) * bw).toFixed(1)},${yc(r.cum).toFixed(1)}`).join('')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Pareto chart">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={yc(f)} y2={yc(f)} stroke="var(--line)" />
          <text x={W - R + 6} y={yc(f) + 4} fontSize={11} fill="var(--muted)">{f * 100}%</text>
          <text x={L - 6} y={yc(f) + 4} fontSize={11} fill="var(--muted)" textAnchor="end">{Intl.NumberFormat('en', { notation: 'compact' }).format(max * f)}</text>
        </g>
      ))}
      {rows.map((r, i) => (
        <rect key={i} x={L + i * bw + bw * 0.12} y={y(r.value)} width={bw * 0.76} height={H - B - y(r.value)} fill={CC[r.cls]} rx={2}>
          <title>{`${r.name}: ${r.value.toLocaleString('en')} (${r.cls}, cumulative ${(r.cum * 100).toFixed(1)}%)`}</title>
        </rect>
      ))}
      {[a, b].map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={yc(t)} y2={yc(t)} stroke="var(--err)" strokeDasharray="5 4" opacity={0.7} />
          <text x={W - R - 4} y={yc(t) - 4} fontSize={11} fill="var(--err)" textAnchor="end">{Math.round(t * 100)}%</text>
        </g>
      ))}
      <path d={line} fill="none" stroke="var(--fg)" strokeWidth={2} />
      {rows.map((r, i) => <circle key={i} cx={L + (i + 0.5) * bw} cy={yc(r.cum)} r={rows.length > 60 ? 1.5 : 3} fill="var(--fg)" />)}
      <text x={L} y={H - 8} fontSize={11} fill="var(--muted)">items ranked by value →</text>
    </svg>
  )
}

export default function AbcAnalysisTool() {
  const [s, set, reset] = useToolState('abc-analysis-tool', DEF)
  const [filter, setFilter] = useState<Cls | ''>('')
  const table = useMemo(() => {
    const t = s.csv.trim()
    return t ? parseCsv(t, detectDelimiter(t)) : []
  }, [s.csv])
  const head = table[0] ?? []
  const body = table.slice(1).filter((r) => r.some((c) => c.trim()))
  const opts = head.map((h, i) => [i, h || `Column ${i + 1}`] as [number, string])

  const items = body.map((r, i) => {
    const value = s.mode === 'qtycost' ? parseNum(r[s.qtyCol]) * parseNum(r[s.costCol]) : parseNum(r[s.valueCol])
    return { name: (r[s.nameCol] ?? '').trim() || `Row ${i + 2}`, value, row: r }
  })
  const bad = items.filter((i) => !Number.isFinite(i.value) || i.value < 0).length
  const a = s.a / 100, b = Math.max(s.b, s.a + 1) / 100
  const ranked = classify(items, a, b)
  const sum = summarize(ranked)
  const total = ranked.reduce((x, r) => x + r.item.value, 0)
  const m = (v: number) => money(v, s.cur, 0)
  const shown = filter ? ranked.filter((r) => r.cls === filter) : ranked

  return (
    <Split wide="right">
      <div>
        <Panel title="Data" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <FileDrop accept=".csv,.tsv,.txt,text/csv" onFiles={async ([f]) => set({ csv: await f.text() })} label="Drop an inventory CSV or click to choose" />
          <Area value={s.csv} onChange={(csv) => set({ csv })} rows={8} mono />
          <p className="muted" style={{ fontSize: 12.5 }}>{body.length} rows · {head.length} columns. Paste from a spreadsheet (tabs) or CSV; the first row must be headers.</p>
        </Panel>
        <Panel title="Columns">
          <Select label="Item name" value={s.nameCol} onChange={(nameCol) => set({ nameCol })} options={opts} />
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['qtycost', 'Units × unit cost'], ['value', 'Value column']]} />
          {s.mode === 'qtycost' ? (
            <Row>
              <Select label="Annual units" value={s.qtyCol} onChange={(qtyCol) => set({ qtyCol })} options={opts} />
              <Select label="Unit cost" value={s.costCol} onChange={(costCol) => set({ costCol })} options={opts} />
            </Row>
          ) : (
            <Select label="Annual value" value={s.valueCol} onChange={(valueCol) => set({ valueCol })} options={opts} />
          )}
          {bad > 0 && <Note tone="warn">{bad} row(s) have no usable number and were skipped.</Note>}
        </Panel>
        <Panel title="Class limits">
          <Slider label="A items up to" value={s.a} onChange={(v) => set({ a: v, b: Math.max(s.b, v + 1) })} min={50} max={90} unit="% of value" show={(v) => String(v)} />
          <Slider label="B items up to" value={Math.max(s.b, s.a + 1)} onChange={(v) => set({ b: v })} min={s.a + 1} max={99} unit="% of value" show={(v) => String(v)} />
          <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', '₴', 'zł', '¥', 'CHF ']} />
          <Note>Classic split is 80 / 15 / 5 % of value. Items are ranked by annual consumption value (units × cost); an item stays in the class where its cumulative share begins.</Note>
        </Panel>
      </div>

      <div>
        <Stats>
          {sum.map((g) => (
            <Stat key={g.cls} label={<><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: CC[g.cls], marginRight: 6 }} />Class {g.cls}</>} value={`${g.count} items`} sub={`${pct(g.itemShare, 0)} of items · ${pct(g.valueShare, 1)} of value`} />
          ))}
          <Stat label="Total value" value={m(total)} sub={`${ranked.length} items`} tone="accent" />
        </Stats>
        <Panel title="Pareto chart">
          {ranked.length ? <Pareto rows={ranked.map((r) => ({ name: r.item.name, value: r.item.value, cum: r.cum, cls: r.cls }))} a={a} b={b} /> : <Note tone="warn">No items yet.</Note>}
          <div className="k-legend">
            {(['A', 'B', 'C'] as Cls[]).map((c) => <span key={c}><i style={{ background: CC[c] }} />Class {c}</span>)}
            <span><i style={{ background: 'var(--fg)' }} />Cumulative share</span>
          </div>
        </Panel>
        <Panel title="What to do with each class">
          {sum.map((g) => (
            <p key={g.cls} style={{ margin: '0 0 8px' }}>
              <b style={{ color: CC[g.cls] }}>{g.cls}</b> — {g.count} items, {m(g.value)}. <span className="muted">{ADVICE[g.cls]}</span>
            </p>
          ))}
        </Panel>
        <Panel
          title="Classified items"
          actions={
            <>
              <Seg value={filter || 'all'} onChange={(v) => setFilter(v === 'all' ? '' : (v as Cls))} options={[['all', 'All'], ['A', 'A'], ['B', 'B'], ['C', 'C']]} />
              <CsvButton name="abc-analysis.csv" rows={() => [[...head, 'Annual value', 'Share %', 'Cumulative %', 'Rank', 'Class'], ...ranked.map((r) => [...(r.item.row as string[]), +r.item.value.toFixed(2), +(r.share * 100).toFixed(2), +(r.cum * 100).toFixed(2), r.rank, r.cls])]} />
            </>
          }
        >
          <Table
            head={['#', 'Item', 'Value', 'Share', 'Cumulative', 'Class']}
            rows={shown.map((r) => [r.rank, r.item.name, m(r.item.value), pct(r.share, 1), pct(r.cum, 1), <b key="c" style={{ color: CC[r.cls] }}>{r.cls}</b>])}
            max={100}
          />
        </Panel>
      </div>
    </Split>
  )
}
