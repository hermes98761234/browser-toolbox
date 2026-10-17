import { useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, CsvButton, JsonButtons, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, color, download, money, num, pct, useToolState } from '../kit'
import { type Opts, type Part, type Plan, type Sheet } from './lib/sheet-cut-planner'

interface State {
  unit: 'mm' | 'in' | 'cm'
  sheetW: number
  sheetH: number
  price: number
  kerf: number
  trim: number
  rotate: boolean
  minOffcut: number
  parts: Part[]
}

const DEF: State = {
  unit: 'mm',
  sheetW: 2440,
  sheetH: 1220,
  price: 58,
  kerf: 3.2,
  trim: 10,
  rotate: true,
  minOffcut: 150,
  parts: [
    { label: 'Cabinet side', w: 720, h: 560, qty: 4, rotate: true },
    { label: 'Bottom', w: 764, h: 560, qty: 2, rotate: true },
    { label: 'Shelf', w: 762, h: 540, qty: 3, rotate: true },
    { label: 'Door', w: 716, h: 396, qty: 4, rotate: false },
    { label: 'Drawer front', w: 796, h: 180, qty: 3, rotate: false },
    { label: 'Stretcher', w: 764, h: 100, qty: 4, rotate: true },
  ],
}

const SHEETS: Record<State['unit'], [string, number, number][]> = {
  mm: [['2440 × 1220 (8×4 ft)', 2440, 1220], ['2500 × 1250', 2500, 1250], ['2800 × 2070 (MDF/chip)', 2800, 2070], ['1220 × 1220', 1220, 1220]],
  cm: [['244 × 122', 244, 122], ['250 × 125', 250, 125], ['280 × 207', 280, 207]],
  in: [['96 × 48 (4×8)', 96, 48], ['120 × 60 (5×10)', 120, 60], ['60 × 60 (Baltic birch)', 60, 60], ['48 × 48', 48, 48]],
}

export default function SheetCutPlanner() {
  const [s, set, reset] = useToolState('sheet-cut-planner', DEF)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)
  const [effort, setEffort] = useState(80)
  const worker = useRef<Worker | null>(null)
  const seq = useRef(0)
  const svgs = useRef<(SVGSVGElement | null)[]>([])

  useEffect(() => {
    const w = new Worker(new URL('./lib/sheet-cut-planner.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ id: number; plan: Plan }>) => {
      if (e.data.id === seq.current) {
        setPlan(e.data.plan)
        setBusy(false)
      }
    }
    worker.current = w
    return () => w.terminate()
  }, [])

  const opts: Opts = { sheetW: s.sheetW, sheetH: s.sheetH, kerf: s.kerf, trim: s.trim, rotate: s.rotate }
  const valid = s.sheetW > 0 && s.sheetH > 0 && s.kerf >= 0 && s.trim >= 0 && 2 * s.trim < Math.min(s.sheetW, s.sheetH)
  const key = JSON.stringify([opts, s.parts, effort])
  useEffect(() => {
    if (!valid) return
    const t = setTimeout(() => {
      const id = ++seq.current
      setBusy(true)
      worker.current?.postMessage({ id, parts: JSON.parse(key)[1] as Part[], opts: JSON.parse(key)[0] as Opts, restarts: effort })
    }, 200)
    return () => clearTimeout(t)
  }, [key, valid, effort])

  const u = s.unit
  const edit = (i: number, patch: Partial<Part>) => set({ parts: s.parts.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  const nPieces = s.parts.reduce((a, p) => a + Math.max(0, p.qty), 0)
  const offcuts = (sh: Sheet) => sh.free.filter((r) => Math.min(r.w, r.h) >= s.minOffcut)
  const area = (x: number) => (u === 'mm' ? `${num(x / 1e6, 2)} m²` : u === 'cm' ? `${num(x / 1e4, 2)} m²` : `${num(x / 144, 1)} ft²`)

  const svgText = (i: number) => {
    const el = svgs.current[i]
    return el ? new XMLSerializer().serializeToString(el).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" style="background:#fff;font-family:sans-serif"') : ''
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Stock sheet" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Units" value={u} onChange={(unit) => set({ unit })} options={[['mm', 'Millimetres'], ['cm', 'Centimetres'], ['in', 'Inches']]} />
          <Row>
            <Num label="Length" value={s.sheetW} onChange={(sheetW) => set({ sheetW })} unit={u} min={1} />
            <Num label="Width" value={s.sheetH} onChange={(sheetH) => set({ sheetH })} unit={u} min={1} />
          </Row>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0 10px' }}>
            {SHEETS[u].map(([n, w, h]) => (
              <button key={n} className="k-btn ghost" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => set({ sheetW: w, sheetH: h })}>{n}</button>
            ))}
          </div>
          <Row>
            <Num label="Saw kerf" value={s.kerf} onChange={(kerf) => set({ kerf })} unit={u} min={0} />
            <Num label="Edge trim (each side)" value={s.trim} onChange={(trim) => set({ trim })} unit={u} min={0} />
          </Row>
          <Row>
            <Num label="Price / sheet" value={s.price} onChange={(price) => set({ price })} min={0} />
            <Num label="Keep offcuts ≥" value={s.minOffcut} onChange={(minOffcut) => set({ minOffcut })} unit={u} min={0} />
          </Row>
          <Check label="Allow rotating parts (where grain allows)" value={s.rotate} onChange={(rotate) => set({ rotate })} />
          {!valid && <Note tone="err">Check the sheet size, kerf and trim.</Note>}
        </Panel>
        <Panel
          title={`Parts (${nPieces} pieces)`}
          actions={<Btn onClick={() => set({ parts: [...s.parts, { label: `Part ${s.parts.length + 1}`, w: u === 'in' ? 24 : 600, h: u === 'in' ? 12 : 300, qty: 1, rotate: true }] })}>+ Part</Btn>}
        >
          <Table
            head={['Label', 'L', 'W', 'Qty', '↻', '']}
            rows={s.parts.map((p, i) => [
              <span key="l" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <i style={{ width: 10, height: 10, borderRadius: 3, background: color(i), flex: 'none' }} />
                <input value={p.label} onChange={(e) => edit(i, { label: e.target.value })} aria-label="Label" style={{ width: 96 }} />
              </span>,
              <input key="w" type="number" min={0} value={p.w} onChange={(e) => edit(i, { w: Math.max(0, Number(e.target.value) || 0) })} aria-label="Length" style={{ width: 58 }} />,
              <input key="h" type="number" min={0} value={p.h} onChange={(e) => edit(i, { h: Math.max(0, Number(e.target.value) || 0) })} aria-label="Width" style={{ width: 58 }} />,
              <input key="q" type="number" min={0} step={1} value={p.qty} onChange={(e) => edit(i, { qty: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} aria-label="Quantity" style={{ width: 42 }} />,
              <input key="r" type="checkbox" checked={p.rotate} onChange={(e) => edit(i, { rotate: e.target.checked })} aria-label="Rotation allowed" title="Unchecked = grain runs along the length" />,
              <Btn key="x" kind="ghost" onClick={() => set({ parts: s.parts.filter((_, j) => j !== i) })} title="Remove">✕</Btn>,
            ])}
          />
          <p className="muted" style={{ fontSize: 13 }}>Untick <b>Rotate</b> for parts whose grain must run along the sheet length (doors, visible panels).</p>
          <Row>
            <JsonButtons name="cut-plan.json" data={s} onLoad={(d) => set(d)} />
          </Row>
        </Panel>
        <Panel title="Optimizer">
          <Select label="Search effort" value={effort} onChange={setEffort} options={[[10, 'Quick (10 restarts)'], [80, 'Normal (80 restarts)'], [400, 'Thorough (400 restarts)']]} />
          <p className="muted" style={{ fontSize: 13 }}>
            Runs in a Web Worker: several sort orders × 3 fit rules × 4 guillotine split rules plus random restarts. Every layout is guillotine-cuttable — each cut goes edge to edge, as on a panel or table saw.
          </p>
        </Panel>
      </div>

      <div>
        {plan && (
          <Stats>
            <Stat label="Sheets needed" value={plan.sheets.length} tone="accent" sub={busy ? 'optimizing…' : plan.heuristic} />
            <Stat label="Material yield" value={pct(1 - plan.waste)} sub={`${area(plan.area)} of ${area(plan.sheetArea)}`} tone={plan.waste < 0.25 ? 'good' : undefined} />
            <Stat label="Waste" value={pct(plan.waste)} tone={plan.waste > 0.35 ? 'bad' : undefined} />
            <Stat label="Cost" value={money(plan.sheets.length * s.price)} sub={`≈ ${plan.cuts} saw cuts`} />
          </Stats>
        )}
        {plan && plan.unplaced.length > 0 && (
          <Note tone="err">
            {plan.unplaced.length} piece(s) don't fit on the sheet: {[...new Set(plan.unplaced.map((p) => `${p.label} ${p.w}×${p.h}`))].join(', ')}
          </Note>
        )}
        {plan?.sheets.map((sh, i) => {
          const fs = Math.max(s.sheetW, s.sheetH) / 55
          const offs = offcuts(sh)
          return (
            <Panel
              key={i}
              title={`Sheet ${i + 1} of ${plan.sheets.length}`}
              actions={
                <>
                  <span className="muted" style={{ fontSize: 13 }}>{sh.placed.length} parts · {pct(sh.used, 0)} used</span>
                  <Btn onClick={() => download(`sheet-${i + 1}.svg`, svgText(i), 'image/svg+xml')}>⬇ SVG</Btn>
                </>
              }
            >
              <Bar value={sh.used} />
              <svg
                ref={(el) => { svgs.current[i] = el }}
                viewBox={`${-fs * 0.5} ${-fs * 0.5} ${s.sheetW + fs} ${s.sheetH + fs}`}
                style={{ width: '100%', height: 'auto', display: 'block', marginTop: 8 }}
                role="img"
                aria-label={`Layout of sheet ${i + 1}`}
              >
                <rect x={0} y={0} width={s.sheetW} height={s.sheetH} fill="#d9b382" stroke="#7a5a32" strokeWidth={fs / 6} />
                {s.trim > 0 && <rect x={s.trim} y={s.trim} width={s.sheetW - 2 * s.trim} height={s.sheetH - 2 * s.trim} fill="none" stroke="#7a5a32" strokeDasharray={`${fs / 2} ${fs / 3}`} strokeWidth={fs / 12} />}
                {offs.map((r, j) => (
                  <g key={`o${j}`}>
                    <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#hatch${i})`} opacity={0.6} />
                    {r.w > fs * 6 && r.h > fs * 1.5 && <text x={r.x + r.w / 2} y={r.y + r.h / 2 + fs * 0.35} fontSize={fs * 0.8} textAnchor="middle" fill="#5b4326">offcut {num(r.w, 1)}×{num(r.h, 1)}</text>}
                  </g>
                ))}
                <defs>
                  <pattern id={`hatch${i}`} width={fs} height={fs} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <line x1={0} y1={0} x2={0} y2={fs} stroke="#7a5a32" strokeWidth={fs / 8} />
                  </pattern>
                </defs>
                {sh.placed.map((p, j) => {
                  const small = Math.min(p.w, p.h) < fs * 2.2
                  const vert = p.h > p.w * 1.6 && p.w < fs * 8
                  return (
                    <g key={j}>
                      <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={color(p.part)} fillOpacity={0.85} stroke="#1f2937" strokeWidth={fs / 10} />
                      {!small && (
                        <g transform={vert ? `rotate(-90 ${p.x + p.w / 2} ${p.y + p.h / 2})` : undefined}>
                          <text x={p.x + p.w / 2} y={p.y + p.h / 2 - fs * 0.15} fontSize={fs} textAnchor="middle" fill="#fff" fontWeight={700}>{p.label}{p.rotated ? ' ↻' : ''}</text>
                          <text x={p.x + p.w / 2} y={p.y + p.h / 2 + fs * 1.05} fontSize={fs * 0.85} textAnchor="middle" fill="#fff">{num(p.w, 1)} × {num(p.h, 1)}</text>
                        </g>
                      )}
                      {small && <title>{`${p.label} ${p.w}×${p.h}`}</title>}
                    </g>
                  )
                })}
              </svg>
              {offs.length > 0 && (
                <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
                  Usable offcuts: {offs.map((r) => `${num(r.w, 1)}×${num(r.h, 1)}`).join(', ')}
                </p>
              )}
            </Panel>
          )
        })}
        {plan && (
          <Panel
            title="Cut list"
            actions={
              <>
                <CsvButton name="cut-list.csv" rows={() => [['Sheet', 'Part', 'X', 'Y', `Length (${u})`, `Width (${u})`, 'Rotated'], ...plan.sheets.flatMap((sh, i) => sh.placed.map((p) => [i + 1, p.label, num(p.x, 1), num(p.y, 1), p.w, p.h, p.rotated ? 'yes' : 'no']))]} />
                <Btn onClick={() => window.print()}>🖨 Print</Btn>
              </>
            }
          >
            <Table
              max={40}
              head={['Sheet', 'Part', 'Size', 'Position (x, y)', '']}
              rows={plan.sheets.flatMap((sh, i) => sh.placed.map((p) => [i + 1, <b key="p" style={{ color: color(p.part) }}>{p.label}</b>, `${p.w} × ${p.h} ${u}`, `${num(p.x, 1)}, ${num(p.y, 1)}`, p.rotated ? '↻ rotated' : '']))}
            />
          </Panel>
        )}
        {!plan && <Note>Optimizing…</Note>}
      </div>
    </Split>
  )
}
