import { useRef } from 'react'
import { Btn, color, CsvButton, JsonButtons, money, Note, Num, Panel, pct, Row, Seg, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { optimize, type Cut, type Stock } from './lib/lumber-cut-optimizer'

type Unit = 'in' | 'mm' | 'cm'
interface CutRow extends Cut { id: string }
interface StockRow extends Stock { id: string }
interface State { unit: Unit; kerf: number; trim: number; currency: string; cuts: CutRow[]; stocks: StockRow[] }

const DEF: State = {
  unit: 'in',
  kerf: 0.125,
  trim: 0.5,
  currency: '$',
  cuts: [
    { id: 'a', label: 'Side', len: 72, qty: 2 },
    { id: 'b', label: 'Shelf', len: 34.5, qty: 5 },
    { id: 'c', label: 'Top', len: 36, qty: 1 },
    { id: 'd', label: 'Kick board', len: 34.5, qty: 1 },
    { id: 'e', label: 'Cleat', len: 16, qty: 4 },
    { id: 'f', label: 'Face trim', len: 22, qty: 3 },
  ],
  stocks: [
    { id: 's1', len: 96, price: 9.48, qty: 0 },
    { id: 's2', len: 120, price: 12.98, qty: 0 },
    { id: 's3', len: 144, price: 15.98, qty: 0 },
  ],
}

const fmtLen = (v: number, u: Unit) => {
  if (u !== 'in') return `${Number(v.toFixed(1))} ${u}`
  const ft = Math.floor(v / 12)
  const inch = Number((v - ft * 12).toFixed(3))
  return v >= 12 ? `${v}″ (${ft}′${inch ? ` ${inch}″` : ''})` : `${v}″`
}

export default function LumberCutOptimizer() {
  const [s, set, reset] = useToolState('lumber-cut-optimizer', DEF)
  const diagRef = useRef<HTMLDivElement>(null)
  const plan = optimize(s.cuts, s.stocks, Math.max(0, s.kerf), Math.max(0, s.trim))
  const labels = [...new Set(s.cuts.map((c) => c.label))]
  const col = (l: string) => color(labels.indexOf(l))
  const maxLen = Math.max(1, ...plan.boards.map((b) => b.stock))
  const m = (x: number) => money(x, s.currency)
  const u = s.unit
  const editCut = (id: string, p: Partial<CutRow>) => set({ cuts: s.cuts.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  const editStock = (id: string, p: Partial<StockRow>) => set({ stocks: s.stocks.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  const buy = s.stocks.map((st) => ({ st, n: plan.boards.filter((b) => b.stock === st.len).length })).filter((x) => x.n > 0)
  const offcuts = plan.boards.map((b) => b.offcut).filter((o) => o > 0).sort((a, b) => b - a)
  const RH = 30
  const svgW = 640

  const print = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const rows = plan.boards.map((b, i) => `<tr><td>${i + 1}</td><td>${fmtLen(b.stock, u)}</td><td>${b.pieces.map((p) => `${p.label} ${fmtLen(p.len, u)}`).join(' → ')}</td><td>${fmtLen(Number(b.offcut.toFixed(3)), u)}</td><td>☐</td></tr>`).join('')
    w.document.write(`<!doctype html><title>Cut list</title><style>body{font:14px system-ui;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:6px;text-align:left}svg{width:100%;height:auto}</style>
<h1>Cut list</h1><p>Kerf ${s.kerf} ${u}, end trim ${s.trim} ${u}. Buy: ${buy.map((x) => `${x.n} × ${fmtLen(x.st.len, u)}`).join(', ')}. Cost ${m(plan.cost)}, waste ${pct(plan.waste)}.</p>
${diagRef.current?.innerHTML ?? ''}<table><tr><th>#</th><th>Board</th><th>Cuts in order</th><th>Offcut</th><th>Done</th></tr>${rows}</table>`)
    w.document.close()
    w.focus()
    w.print()
  }

  return (
    <Split>
      <div>
        <Panel title="Settings">
          <div className="k-field">
            <span className="k-label">Units</span>
            <Seg value={u} onChange={(unit) => set(unit === 'in' ? { unit, kerf: 0.125, trim: 0.5 } : { unit, kerf: unit === 'mm' ? 3 : 0.3, trim: unit === 'mm' ? 10 : 1 })} options={[['in', 'inches'], ['mm', 'mm'], ['cm', 'cm']]} />
          </div>
          <Row>
            <Num label="Saw kerf" value={s.kerf} onChange={(kerf) => set({ kerf })} unit={u} min={0} hint="Blade width lost per cut" />
            <Num label="End trim per board" value={s.trim} onChange={(trim) => set({ trim })} unit={u} min={0} hint="Squaring the factory end" />
          </Row>
        </Panel>
        <Panel title="Cuts needed" actions={<Btn onClick={() => set({ cuts: [...s.cuts, { id: uid(), label: `Part ${s.cuts.length + 1}`, len: u === 'in' ? 24 : 600, qty: 1 }] })}>+ Cut</Btn>}>
          <Table
            head={['Label', `Length (${u})`, 'Qty', '']}
            rows={s.cuts.map((c) => [
              <span key="l" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><i style={{ width: 10, height: 10, borderRadius: 3, background: col(c.label), flex: 'none' }} /><input value={c.label} onChange={(e) => editCut(c.id, { label: e.target.value })} aria-label="Label" style={{ width: 110 }} /></span>,
              <input key="n" type="number" min={0} step="any" value={c.len} onChange={(e) => editCut(c.id, { len: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 80 }} aria-label="Length" />,
              <input key="q" type="number" min={0} step={1} value={c.qty} onChange={(e) => editCut(c.id, { qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 56 }} aria-label="Quantity" />,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ cuts: s.cuts.filter((x) => x.id !== c.id) })}>✕</Btn>,
            ])}
          />
        </Panel>
        <Panel title="Stock boards available" actions={<Btn onClick={() => set({ stocks: [...s.stocks, { id: uid(), len: u === 'in' ? 168 : 4800, price: 0, qty: 0 }] })}>+ Stock</Btn>}>
          <Table
            head={[`Length (${u})`, `Price (${s.currency})`, 'On hand', '']}
            rows={s.stocks.map((st) => [
              <input key="l" type="number" min={0} value={st.len} onChange={(e) => editStock(st.id, { len: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 80 }} aria-label="Stock length" />,
              <input key="p" type="number" min={0} step="any" value={st.price} onChange={(e) => editStock(st.id, { price: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 80 }} aria-label="Price" />,
              <input key="q" type="number" min={0} step={1} value={st.qty} onChange={(e) => editStock(st.id, { qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={{ width: 56 }} aria-label="Quantity on hand" />,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ stocks: s.stocks.filter((x) => x.id !== st.id) })}>✕</Btn>,
            ])}
          />
          <p className="muted" style={{ fontSize: 13 }}>On hand 0 = unlimited (buy as needed). Price 0 = minimise total length instead of cost.</p>
          <Row>
            <JsonButtons name="cut-list.json" data={s} onLoad={(d) => set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Boards to buy" value={plan.boards.length} sub={buy.map((x) => `${x.n} × ${fmtLen(x.st.len, u).split(' (')[0]}`).join(' · ')} tone="accent" />
          <Stat label="Cost" value={m(plan.cost)} />
          <Stat label="Waste" value={pct(plan.waste)} sub={`${Number((plan.bought - plan.needed).toFixed(2))} ${u} incl. kerf & trim`} tone={plan.waste < 0.15 ? 'good' : 'bad'} />
          <Stat label="Yield" value={pct(1 - plan.waste)} sub={`${Number(plan.needed.toFixed(2))} of ${Number(plan.bought.toFixed(2))} ${u}`} />
        </Stats>
        {plan.unplaced.length > 0 && <Note tone="err">{plan.unplaced.length} piece(s) don't fit any stock (longest needs {fmtLen(plan.unplaced[0].len + s.trim, u)}). Add longer stock or raise “on hand”.</Note>}
        <Panel title="Cutting diagram" actions={<><Btn onClick={print}>🖨 Print cut list</Btn><CsvButton name="cut-list.csv" rows={() => [['Board', 'Stock', 'Cut order', 'Offcut'], ...plan.boards.map((b, i) => [i + 1, b.stock, b.pieces.map((p) => `${p.label} ${p.len}`).join(' | '), Number(b.offcut.toFixed(3))])]} /></>}>
          <div ref={diagRef}>
            <svg viewBox={`0 0 ${svgW + 60} ${plan.boards.length * (RH + 10) + 4}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Cutting diagram">
              <defs>
                <pattern id="lco-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="8" height="8" fill="#e2e8f0" />
                  <line x1="0" y1="0" x2="0" y2="8" stroke="#94a3b8" strokeWidth="3" />
                </pattern>
              </defs>
              {plan.boards.map((b, i) => {
                const k = svgW / maxLen
                const y = i * (RH + 10) + 2
                let x = 40 + s.trim * k
                return (
                  <g key={i}>
                    <text x={30} y={y + RH / 2 + 5} textAnchor="end" fontSize={14} fontWeight={700} fill="currentColor">{i + 1}</text>
                    <rect x={40} y={y} width={b.stock * k} height={RH} fill="url(#lco-hatch)" stroke="#64748b" rx={3} />
                    {s.trim > 0 && <rect x={40} y={y} width={s.trim * k} height={RH} fill="#475569" />}
                    {b.pieces.map((p, j) => {
                      const w = p.len * k
                      const el = (
                        <g key={j}>
                          <rect x={x} y={y} width={w} height={RH} fill={col(p.label)} stroke="#0f172a" strokeWidth={0.5} />
                          {w > 34 && <text x={x + w / 2} y={y + RH / 2 + 5} textAnchor="middle" fontSize={13} fill="#fff" fontWeight={600}>{w > 90 ? `${p.label} ${p.len}` : p.len}</text>}
                          <title>{`${p.label}: ${p.len} ${u}`}</title>
                        </g>
                      )
                      x += w + s.kerf * k
                      return el
                    })}
                    <text x={40 + b.stock * k + 6} y={y + RH / 2 + 5} fontSize={12} fill="currentColor">{b.stock}</text>
                  </g>
                )
              })}
            </svg>
          </div>
        </Panel>
        <Panel title="Cut list">
          <Table
            head={['#', 'Board', 'Cuts in order', 'Offcut']}
            rows={plan.boards.map((b, i) => [
              i + 1,
              <b key="b" style={{ whiteSpace: 'nowrap' }}>{fmtLen(b.stock, u)}</b>,
              <span key="c">{b.pieces.map((p, j) => <span key={j} style={{ display: 'inline-block', margin: '1px 3px', padding: '1px 6px', borderRadius: 5, background: col(p.label), color: '#fff', fontSize: 12 }}>{p.label} {p.len}</span>)}</span>,
              <span key="o" className="muted">{Number(b.offcut.toFixed(3))} {u}</span>,
            ])}
          />
          <p className="muted" style={{ fontSize: 13 }}>
            {plan.strategy}. Usable offcuts: {offcuts.slice(0, 6).map((o) => Number(o.toFixed(2))).join(', ') || 'none'} {u}. Cut the longest pieces first, and measure each piece from a freshly squared end.
          </p>
        </Panel>
      </div>
    </Split>
  )
}
