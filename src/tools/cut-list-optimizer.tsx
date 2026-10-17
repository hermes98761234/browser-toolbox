import { useMemo } from 'react'
import { Btn, color, CsvButton, JsonButtons, money, Note, num, Num, Panel, Row, Seg, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { optimize, type Part, type Sheet, type Stock } from './lib/cut-list-optimizer'

interface Priced extends Stock { price: number }
const DEF = {
  mode: 'sheet' as 'sheet' | 'board',
  unit: 'mm',
  kerf: 3.2,
  trim: 5,
  sheetStock: [{ id: 's1', name: 'Plywood 18 mm', w: 2440, h: 1220, qty: 5, price: 65 }] as Priced[],
  sheetParts: [
    { id: 'p1', name: 'Side', w: 720, h: 560, qty: 2, rotate: true },
    { id: 'p2', name: 'Top / bottom', w: 864, h: 560, qty: 2, rotate: true },
    { id: 'p3', name: 'Shelf', w: 862, h: 520, qty: 3, rotate: true },
    { id: 'p4', name: 'Door', w: 716, h: 446, qty: 2, rotate: false },
    { id: 'p5', name: 'Back', w: 900, h: 720, qty: 1, rotate: true },
    { id: 'p6', name: 'Drawer front', w: 446, h: 180, qty: 3, rotate: false },
  ] as Part[],
  boardStock: [{ id: 'b1', name: '2×4 8 ft', w: 2438, h: 1, qty: 20, price: 4.5 }, { id: 'b2', name: '2×4 12 ft', w: 3658, h: 1, qty: 10, price: 7.9 }] as Priced[],
  boardParts: [
    { id: 'q1', name: 'Leg', w: 900, h: 1, qty: 4, rotate: false },
    { id: 'q2', name: 'Long rail', w: 1800, h: 1, qty: 4, rotate: false },
    { id: 'q3', name: 'Short rail', w: 600, h: 1, qty: 6, rotate: false },
    { id: 'q4', name: 'Brace', w: 450, h: 1, qty: 4, rotate: false },
  ] as Part[],
}

function SheetSvg({ sh, idx, board, colorOf, stockName, unit }: { sh: Sheet; idx: number; board: boolean; colorOf: (id: string) => string; stockName: string; unit: string }) {
  const H = board ? sh.w * 0.04 : sh.h
  const pad = sh.w * 0.012
  const fs = board ? H * 0.42 : Math.max(sh.w, sh.h) * 0.022
  const area = sh.parts.reduce((a, q) => a + q.w * q.h, 0)
  return (
    <figure style={{ margin: '0 0 14px', breakInside: 'avoid' }}>
      <figcaption style={{ fontSize: 13, marginBottom: 4 }}>
        <b>#{idx + 1} · {stockName}</b> <span className="muted">{board ? `${num(sh.w)} ${unit}` : `${num(sh.w)} × ${num(sh.h)} ${unit}`} · {sh.parts.length} parts · {((area / (sh.w * sh.h)) * 100).toFixed(0)}% used{board ? ` · offcut ${num(sh.w - Math.max(0, ...sh.parts.map((q) => q.x + q.w)), 0)} ${unit}` : ` · ${sh.cuts} cuts`}</span>
      </figcaption>
      <svg viewBox={`${-pad} ${-pad} ${sh.w + 2 * pad} ${H + 2 * pad}`} style={{ width: '100%', display: 'block' }} role="img" aria-label={`Cutting diagram ${idx + 1}`}>
        <defs>
          <pattern id={`hatch${idx}`} width={fs} height={fs} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={fs} stroke="var(--muted)" strokeWidth={fs * 0.08} opacity={0.4} />
          </pattern>
        </defs>
        <rect x={0} y={0} width={sh.w} height={H} fill={`url(#hatch${idx})`} stroke="var(--fg)" strokeWidth={sh.w * 0.002} />
        {sh.parts.map((q, i) => {
          const y = board ? 0 : q.y, h = board ? H : q.h
          const big = !board && Math.min(q.w, h) > fs * 2.2
          return (
            <g key={i}>
              <rect x={q.x} y={y} width={q.w} height={h} fill={colorOf(q.partId)} fillOpacity={0.8} stroke="var(--fg)" strokeWidth={sh.w * 0.0015} />
              {q.w > fs * (board ? 6 : 3) && (
                <text x={q.x + q.w / 2} y={y + h / 2} textAnchor="middle" fontSize={fs} fill="#fff" fontWeight={700}>
                  <tspan x={q.x + q.w / 2} dy={big ? -fs * 0.3 : fs * 0.35}>{q.name}{q.rotated ? ' ⟲' : ''}{board ? ` · ${num(q.w)}` : ''}</tspan>
                  {big && <tspan x={q.x + q.w / 2} dy={fs * 1.15} fontWeight={400}>{board ? num(q.w) : `${num(q.w)}×${num(q.h)}`}</tspan>}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

export default function CutListOptimizer() {
  const [s, set, reset] = useToolState('cut-list-optimizer', DEF)
  const board = s.mode === 'board'
  const stock = board ? s.boardStock : s.sheetStock
  const parts = board ? s.boardParts : s.sheetParts
  const stockKey = board ? 'boardStock' : 'sheetStock'
  const partKey = board ? 'boardParts' : 'sheetParts'
  const res = useMemo(() => optimize(stock.filter((x) => x.w > 0 && x.h > 0), parts.filter((p) => p.w > 0 && p.h > 0).map((p) => (board ? { ...p, h: 1, rotate: false } : p)), Math.max(0, s.kerf), board ? 0 : Math.max(0, s.trim)), [stock, parts, s.kerf, s.trim, board])
  const colorOf = (id: string) => color(Math.max(0, parts.findIndex((p) => p.id === id)))
  const stockOf = (id: string) => stock.find((x) => x.id === id)
  const cost = res.sheets.reduce((a, sh) => a + (stockOf(sh.stockId)?.price ?? 0), 0)
  const editS = (id: string, p: Partial<Priced>) => set({ [stockKey]: stock.map((x) => (x.id === id ? { ...x, ...p } : x)) } as Partial<typeof DEF>)
  const editP = (id: string, p: Partial<Part>) => set({ [partKey]: parts.map((x) => (x.id === id ? { ...x, ...p } : x)) } as Partial<typeof DEF>)
  const nIn = (v: number, on: (n: number) => void, label: string, w = 76) => <input type="number" min={0} value={v} onChange={(e) => on(Math.max(0, Number(e.target.value) || 0))} style={{ width: w }} aria-label={label} />
  const totalParts = parts.reduce((a, p) => a + p.qty, 0)
  const counts = new Map<string, number>()
  for (const sh of res.sheets) counts.set(sh.stockId, (counts.get(sh.stockId) ?? 0) + 1)

  return (
    <Split wide="right">
      <div>
        <Panel title="Material" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['sheet', '▭ Sheets (2D)'], ['board', '▬ Boards (1D)']]} label="Mode" />
          <Row>
            <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['mm', 'mm'], ['cm', 'cm'], ['in', 'in']]} label="Unit" />
            <Num label="Saw kerf" value={s.kerf} onChange={(kerf) => set({ kerf })} unit={s.unit} min={0} />
            {!board && <Num label="Edge trim" value={s.trim} onChange={(trim) => set({ trim })} unit={s.unit} min={0} />}
          </Row>
        </Panel>
        <Panel title={board ? 'Stock boards' : 'Stock sheets'} actions={<Btn onClick={() => set({ [stockKey]: [...stock, { id: uid(), name: board ? 'Board' : 'Sheet', w: board ? 2400 : 2440, h: board ? 1 : 1220, qty: 5, price: 0 }] } as Partial<typeof DEF>)}>+ Stock</Btn>}>
          <Table
            head={['Name', 'Length', ...(board ? [] : ['Width']), 'Qty', 'Price', '']}
            rows={stock.map((x) => [
              <input key="n" value={x.name} onChange={(e) => editS(x.id, { name: e.target.value })} aria-label="Stock name" style={{ width: 110 }} />,
              nIn(x.w, (w) => editS(x.id, { w }), 'Length'),
              ...(board ? [] : [nIn(x.h, (h) => editS(x.id, { h }), 'Width')]),
              nIn(x.qty, (qty) => editS(x.id, { qty }), 'Quantity', 52),
              nIn(x.price, (price) => editS(x.id, { price }), 'Price', 60),
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ [stockKey]: stock.filter((y) => y.id !== x.id) } as Partial<typeof DEF>)}>✕</Btn>,
            ])}
          />
          <p className="muted" style={{ fontSize: 12 }}>Stock is used in the listed order — put the size you prefer to buy first.</p>
        </Panel>
        <Panel title="Parts" actions={<Btn onClick={() => set({ [partKey]: [...parts, { id: uid(), name: `Part ${parts.length + 1}`, w: board ? 500 : 400, h: board ? 1 : 300, qty: 1, rotate: !board }] } as Partial<typeof DEF>)}>+ Part</Btn>}>
          <Table
            head={['', 'Name', 'Length', ...(board ? [] : ['Width', 'Rotate']), 'Qty', '']}
            rows={parts.map((p) => [
              <i key="c" style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: colorOf(p.id) }} />,
              <input key="n" value={p.name} onChange={(e) => editP(p.id, { name: e.target.value })} aria-label="Part name" style={{ width: 110 }} />,
              nIn(p.w, (w) => editP(p.id, { w }), 'Length'),
              ...(board ? [] : [nIn(p.h, (h) => editP(p.id, { h }), 'Width'), <input key="r" type="checkbox" checked={p.rotate} onChange={(e) => editP(p.id, { rotate: e.target.checked })} title="Allow rotation (uncheck to keep grain direction)" aria-label="Allow rotation" />]),
              nIn(p.qty, (qty) => editP(p.id, { qty: Math.round(qty) }), 'Quantity', 52),
              <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ [partKey]: parts.filter((y) => y.id !== p.id) } as Partial<typeof DEF>)}>✕</Btn>,
            ])}
          />
          {!board && <p className="muted" style={{ fontSize: 12 }}>Uncheck “Rotate” for parts where the grain direction matters (length runs along the sheet length).</p>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label={board ? 'Boards' : 'Sheets'} value={res.sheets.length} sub={[...counts].map(([id, n]) => `${n}× ${stockOf(id)?.name ?? ''}`).join(', ')} tone="accent" />
          <Stat label="Parts placed" value={`${totalParts - res.unplaced.length} / ${totalParts}`} tone={res.unplaced.length ? 'bad' : 'good'} />
          <Stat label="Waste" value={`${(res.waste * 100).toFixed(1)}%`} sub="offcuts + kerf" tone={res.waste > 0.3 ? 'bad' : undefined} />
          <Stat label="Material cost" value={money(cost)} sub={res.sheets.length ? `${money(cost / Math.max(1, totalParts))} per part` : ''} />
        </Stats>
        {res.unplaced.length > 0 && <Note tone="err">Not placed: {res.unplaced.map((u) => `${u.name} (${board ? num(u.w) : `${num(u.w)}×${num(u.h)}`})`).join(', ')} — bigger than the stock, or out of stock quantity.</Note>}
        <Panel
          title="Cutting diagrams"
          actions={
            <>
              <CsvButton name="cut-list.csv" rows={() => [['Stock #', 'Stock', 'Part', 'X', 'Y', 'Length', 'Width', 'Rotated'], ...res.sheets.flatMap((sh, i) => sh.parts.map((q) => [i + 1, stockOf(sh.stockId)?.name ?? '', q.name, q.x, board ? 0 : q.y, q.w, board ? '' : q.h, q.rotated ? 'yes' : '']))]} />
              <JsonButtons name="cut-list.json" data={s} onLoad={(d) => set(d)} />
              <Btn onClick={() => window.print()}>🖨 Print</Btn>
            </>
          }
        >
          {res.sheets.map((sh, i) => <SheetSvg key={i} sh={sh} idx={i} board={board} colorOf={colorOf} stockName={stockOf(sh.stockId)?.name ?? ''} unit={s.unit} />)}
          {!res.sheets.length && <Note>Add stock and parts to see the diagrams.</Note>}
          <p className="muted" style={{ fontSize: 12 }}>Guillotine layouts: every cut runs edge to edge, as on a table or panel saw. Best of {10} heuristics ({res.heuristic}). ⟲ = rotated part. Hatched = offcut.</p>
        </Panel>
      </div>
    </Split>
  )
}
