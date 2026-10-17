import { useState } from 'react'
import { Btn, CsvButton, JsonButtons, money, Note, Num, num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { estimate, WALL_TYPES, wallAreas, type Opening, type Wall, type WallType } from './lib/brick-wall-estimator'

const BRICKS: [string, number, number, number, number][] = [
  // name, length, width, height (mm), default joint (mm)
  ['UK standard 215×102.5×65', 215, 102.5, 65, 10],
  ['US modular 194×92×57', 194, 92, 57, 10],
  ['US standard 203×92×57', 203, 92, 57, 10],
  ['US queen 194×70×70', 194, 70, 70, 10],
  ['EU NF 240×115×71', 240, 115, 71, 10],
  ['EU DF 240×115×52', 240, 115, 52, 10],
  ['EU 2DF 240×115×113', 240, 115, 113, 10],
  ['Australian 230×110×76', 230, 110, 76, 10],
  ['Custom', 215, 100, 65, 10],
]

interface State {
  unit: 'm' | 'ft'
  brickName: string
  bl: number
  bw: number
  bh: number
  joint: number
  type: WallType
  waste: number
  mortarWaste: number
  mix: string
  tiesPerM2: number
  bagKg: number
  cur: string
  pBrick: number
  pBag: number
  pSand: number
  pTie: number
  walls: Wall[]
  sel: string
}

const DEF: State = {
  unit: 'm', brickName: BRICKS[0][0], bl: 215, bw: 102.5, bh: 65, joint: 10, type: 'cavity', waste: 5, mortarWaste: 10, mix: '1:5',
  tiesPerM2: 2.5, bagKg: 25, cur: '$', pBrick: 0.65, pBag: 9.5, pSand: 55, pTie: 0.35,
  sel: 'front',
  walls: [
    { id: 'front', name: 'Front wall', length: 9.6, height: 2.6, count: 1, openings: [{ id: 'd', label: 'Door', w: 1.0, h: 2.1, count: 1 }, { id: 'w1', label: 'Window', w: 1.5, h: 1.2, count: 2 }] },
    { id: 'side', name: 'Side walls', length: 7.2, height: 2.6, count: 2, openings: [{ id: 'w2', label: 'Window', w: 1.2, h: 1.2, count: 1 }] },
    { id: 'back', name: 'Back wall', length: 9.6, height: 2.6, count: 1, openings: [{ id: 'p', label: 'Patio door', w: 2.4, h: 2.1, count: 1 }, { id: 'w3', label: 'Window', w: 1.2, h: 1.0, count: 1 }] },
  ],
}

const MIXES: [string, string][] = [['1:3', '1:3 — strong (below ground, retaining)'], ['1:4', '1:4 — general, exposed'], ['1:5', '1:5 — general walling'], ['1:6', '1:6 — internal / sheltered']]

function WallPreview({ wall, s }: { wall: Wall; s: State }) {
  const W = wall.length, H = wall.height
  const bl = (s.bl + s.joint) / 1000, bh = (s.bh + s.joint) / 1000
  if (!(W > 0 && H > 0) || W / bl > 400 || H / bh > 200) return <Note>Wall too large to draw.</Note>
  // place openings evenly; doors (h ≥ 1.8 m) start at floor level, windows at 0.9 m sill
  const ops: { x: number; y: number; w: number; h: number; label: string }[] = []
  const list = wall.openings.flatMap((o) => Array.from({ length: Math.max(0, Math.min(20, o.count)) }, () => o))
  list.forEach((o, i) => {
    const cx = (W * (i + 1)) / (list.length + 1)
    const w = Math.min(o.w, W), h = Math.min(o.h, H)
    const y = o.h >= 1.8 ? 0 : Math.min(0.9, Math.max(0, H - h - 0.2))
    ops.push({ x: Math.max(0, Math.min(W - w, cx - w / 2)), y, w, h, label: o.label })
  })
  const rects: React.ReactNode[] = []
  const courses = Math.ceil(H / bh)
  for (let c = 0; c < courses; c++) {
    const off = c % 2 ? bl / 2 : 0
    for (let x = -off; x < W; x += bl) {
      const x0 = Math.max(0, x), x1 = Math.min(W, x + bl - s.joint / 1000)
      const y0 = H - (c + 1) * bh + s.joint / 1000
      if (x1 <= x0) continue
      rects.push(<rect key={`${c}-${x.toFixed(3)}`} x={x0} y={Math.max(0, y0)} width={x1 - x0} height={Math.min(bh - s.joint / 1000, H - c * bh)} fill={(c * 7 + Math.round(x / bl) * 3) % 5 ? '#b45309' : '#9a3412'} />)
    }
  }
  return (
    <svg viewBox={`-0.2 -0.2 ${W + 0.4} ${H + 0.75}`} style={{ width: '100%', maxHeight: 300, display: 'block' }} role="img" aria-label={`${wall.name} elevation`}>
      <rect x={0} y={0} width={W} height={H} fill="#d6d3d1" />
      {rects}
      {ops.map((o, i) => (
        <g key={i}>
          <rect x={o.x} y={H - o.y - o.h} width={o.w} height={o.h} fill="#bae6fd" stroke="#0f172a" strokeWidth={0.03} />
          <rect x={o.x - 0.15} y={H - o.y - o.h - 0.15} width={o.w + 0.3} height={0.15} fill="#57534e" />
          <text x={o.x + o.w / 2} y={H - o.y - o.h / 2} fontSize={0.22} textAnchor="middle" fill="#0f172a">{o.label}</text>
        </g>
      ))}
      <text x={W / 2} y={H + 0.38} fontSize={0.24} textAnchor="middle" fill="var(--muted)">{num(W, 2)} m × {num(H, 2)} m · stretcher bond</text>
    </svg>
  )
}

export default function BrickWallEstimator() {
  const [s, set, reset] = useToolState('brick-wall-estimator', DEF)
  const [printing, setPrinting] = useState(false)
  const u = s.unit === 'ft' ? 0.3048 : 1
  const [c, sd] = s.mix.split(':').map(Number)
  const e = estimate(s.walls, { brick: { l: s.bl, w: s.bw, h: s.bh }, joint: s.joint, type: s.type, waste: s.waste, mortarWaste: s.mortarWaste, cement: c, sand: sd, tiesPerM2: s.tiesPerM2, bagKg: s.bagKg })
  const m = (x: number) => money(x, s.cur)
  const area = (x: number) => (s.unit === 'ft' ? `${num(x / 0.092903, 1)} ft²` : `${num(x, 2)} m²`)
  const sandT = e.sandKg / 1000
  const cost = { bricks: e.bricksOrder * s.pBrick, cement: e.cementBags * s.pBag, sand: Math.ceil(sandT * 10) / 10 * s.pSand, ties: e.ties * s.pTie }
  const total = cost.bricks + cost.cement + cost.sand + cost.ties
  const editWall = (id: string, p: Partial<Wall>) => set({ walls: s.walls.map((w) => (w.id === id ? { ...w, ...p } : w)) })
  const editOpening = (w: Wall, id: string, p: Partial<Opening>) => editWall(w.id, { openings: w.openings.map((o) => (o.id === id ? { ...o, ...p } : o)) })
  const sel = s.walls.find((w) => w.id === s.sel) ?? s.walls[0]
  const len = (x: number) => +(x / u).toFixed(3)
  const shopping: [string, string, string, string][] = [
    ['Bricks', `${num(e.bricksOrder, 0)}`, `${num(e.bricks, 0)} + ${s.waste}% waste`, m(cost.bricks)],
    [`Cement (${s.bagKg} kg bags)`, `${e.cementBags} bags`, `${num(e.cementKg, 0)} kg`, m(cost.cement)],
    ['Building sand', `${num(Math.ceil(sandT * 10) / 10, 1)} t`, `${num(e.sandKg, 0)} kg`, m(cost.sand)],
    ...(s.type === 'cavity' ? [['Wall ties', `${e.ties}`, `${s.tiesPerM2}/m² + jambs`, m(cost.ties)] as [string, string, string, string]] : []),
    ...e.lintels.map((l) => [`Lintel — ${l.label}`, `${l.count} × ${num(l.length, 2)} m`, 'incl. bearings', '—'] as [string, string, string, string]),
  ]

  return (
    <div>
      <Stats>
        <Stat label="Bricks to order" value={num(e.bricksOrder, 0)} tone="accent" sub={`${num(e.perM2, 1)} per m² · ${s.waste}% waste`} />
        <Stat label="Net wall area" value={area(e.net)} sub={`${area(e.gross)} gross − ${area(e.openings)} openings`} />
        <Stat label="Mortar (wet)" value={`${num(e.mortarWet, 2)} m³`} sub={`${e.cementBags} bags cement · ${num(sandT, 2)} t sand`} />
        {s.type === 'cavity' && <Stat label="Wall ties" value={e.ties} sub="incl. extra ties at openings" />}
        <Stat label="Material cost" value={m(total)} sub={`${m(total / (e.net || 1))} per m²`} />
      </Stats>
      <Split>
        <div>
          <Panel title="Brick & bond">
            <Select
              label="Brick size"
              value={s.brickName}
              onChange={(brickName) => {
                const b = BRICKS.find((x) => x[0] === brickName)!
                set(brickName === 'Custom' ? { brickName } : { brickName, bl: b[1], bw: b[2], bh: b[3], joint: b[4] })
              }}
              options={BRICKS.map((b) => b[0])}
            />
            <Row>
              <Num label="Length" value={s.bl} onChange={(bl) => set({ bl, brickName: 'Custom' })} unit="mm" min={50} />
              <Num label="Width" value={s.bw} onChange={(bw) => set({ bw, brickName: 'Custom' })} unit="mm" min={30} />
              <Num label="Height" value={s.bh} onChange={(bh) => set({ bh, brickName: 'Custom' })} unit="mm" min={30} />
            </Row>
            <Slider label="Mortar joint" value={s.joint} onChange={(joint) => set({ joint })} min={3} max={15} step={1} unit=" mm" />
            <Select label="Wall construction" value={s.type} onChange={(type) => set({ type })} options={WALL_TYPES.map(([v, l]) => [v, l] as [WallType, string])} />
            {s.type === 'cavity' && (
              <Seg value={String(s.tiesPerM2) as '2.5' | '4.9'} onChange={(v) => set({ tiesPerM2: Number(v) })} options={[['2.5', 'Ties 900×450 mm (2.5/m²)'], ['4.9', 'Ties 450×450 mm (4.9/m²)']]} />
            )}
            <Row>
              <Num label="Brick waste" value={s.waste} onChange={(waste) => set({ waste })} unit="%" min={0} max={50} />
              <Num label="Mortar waste" value={s.mortarWaste} onChange={(mortarWaste) => set({ mortarWaste })} unit="%" min={0} max={50} />
            </Row>
            <Select label="Mortar mix (cement : sand)" value={s.mix} onChange={(mix) => set({ mix })} options={MIXES} />
          </Panel>
          <Panel title="Prices">
            <Row>
              <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', '₴', 'zł', 'A$']} />
              <Num label="Cement bag" value={s.bagKg} onChange={(bagKg) => set({ bagKg })} unit="kg" min={1} />
            </Row>
            <Row>
              <Num label="Per brick" value={s.pBrick} onChange={(pBrick) => set({ pBrick })} unit={s.cur} min={0} />
              <Num label="Per cement bag" value={s.pBag} onChange={(pBag) => set({ pBag })} unit={s.cur} min={0} />
              <Num label="Sand per tonne" value={s.pSand} onChange={(pSand) => set({ pSand })} unit={s.cur} min={0} />
              <Num label="Per wall tie" value={s.pTie} onChange={(pTie) => set({ pTie })} unit={s.cur} min={0} />
            </Row>
          </Panel>
        </div>
        <div>
          <Panel
            title="Walls"
            actions={
              <>
                <Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['m', 'metres'], ['ft', 'feet']]} />
                <Btn onClick={() => {
                  const id = uid()
                  set({ walls: [...s.walls, { id, name: `Wall ${s.walls.length + 1}`, length: 4, height: 2.4, count: 1, openings: [] }], sel: id })
                }}>+ Wall</Btn>
              </>
            }
          >
            {s.walls.map((w) => {
              const a = wallAreas(w)
              return (
                <div key={w.id} onClick={() => set({ sel: w.id })} style={{ border: `1px solid ${w.id === sel?.id ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 10, padding: 10, marginBottom: 10 }}>
                  <Row>
                    <input value={w.name} onChange={(ev) => editWall(w.id, { name: ev.target.value })} aria-label="Wall name" style={{ fontWeight: 700, flex: 1, minWidth: 120 }} />
                    <span className="muted">net {area(a.net)}</span>
                    <Btn kind="ghost" title="Remove wall" onClick={() => set({ walls: s.walls.filter((x) => x.id !== w.id) })}>✕</Btn>
                  </Row>
                  <Row>
                    <Num label="Length" value={len(w.length)} onChange={(v) => editWall(w.id, { length: Math.max(0, v * u) })} unit={s.unit} min={0} />
                    <Num label="Height" value={len(w.height)} onChange={(v) => editWall(w.id, { height: Math.max(0, v * u) })} unit={s.unit} min={0} />
                    <Num label="Count" value={w.count} onChange={(v) => editWall(w.id, { count: Math.max(0, Math.round(v)) })} min={0} step={1} />
                  </Row>
                  {w.openings.map((o) => (
                    <Row key={o.id}>
                      <input value={o.label} onChange={(ev) => editOpening(w, o.id, { label: ev.target.value })} aria-label="Opening name" style={{ width: 110 }} />
                      <label className="muted">W <input type="number" min={0} step={0.1} value={len(o.w)} onChange={(ev) => editOpening(w, o.id, { w: Math.max(0, Number(ev.target.value) * u || 0) })} style={{ width: 70 }} /></label>
                      <label className="muted">H <input type="number" min={0} step={0.1} value={len(o.h)} onChange={(ev) => editOpening(w, o.id, { h: Math.max(0, Number(ev.target.value) * u || 0) })} style={{ width: 70 }} /></label>
                      <label className="muted">× <input type="number" min={0} step={1} value={o.count} onChange={(ev) => editOpening(w, o.id, { count: Math.max(0, Math.round(Number(ev.target.value) || 0)) })} style={{ width: 56 }} /></label>
                      <Btn kind="ghost" title="Remove opening" onClick={() => editWall(w.id, { openings: w.openings.filter((x) => x.id !== o.id) })}>✕</Btn>
                    </Row>
                  ))}
                  <Row>
                    <Btn kind="ghost" onClick={() => editWall(w.id, { openings: [...w.openings, { id: uid(), label: 'Window', w: 1.2, h: 1.2, count: 1 }] })}>+ Window</Btn>
                    <Btn kind="ghost" onClick={() => editWall(w.id, { openings: [...w.openings, { id: uid(), label: 'Door', w: 0.9, h: 2.1, count: 1 }] })}>+ Door</Btn>
                  </Row>
                  {a.openings >= w.length * w.height * w.count && w.length * w.height > 0 && <Note tone="warn">Openings cover the whole wall.</Note>}
                </div>
              )
            })}
          </Panel>
          {sel && (
            <Panel title={`Elevation — ${sel.name}`}>
              <WallPreview wall={sel} s={s} />
              <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
                {e.courses} courses at {s.bh + s.joint} mm gauge · wall thickness {num(e.thickness, 1)} mm{s.type === 'cavity' ? ' + cavity' : ''}. Click a wall to preview it.
              </p>
            </Panel>
          )}
        </div>
      </Split>
      <Panel
        title="Shopping list"
        actions={
          <>
            <CsvButton name="brick-wall-materials.csv" rows={() => [['Item', 'Quantity', 'Notes', 'Cost'], ...shopping, ['Total', '', '', m(total)]]} />
            <Btn onClick={() => {
              setPrinting(true)
              setTimeout(() => {
                window.print()
                setPrinting(false)
              }, 50)
            }}>🖨 Print</Btn>
            <JsonButtons name="brick-walls.json" data={s} onLoad={(d) => set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </>
        }
      >
        <Table head={['Item', 'Quantity', 'Notes', 'Cost']} rows={shopping} foot={['Total', '', '', m(total)]} />
        {!printing && (
          <p className="muted" style={{ fontSize: 13 }}>
            Mortar: wall volume minus brick volume (solid frogless bricks), ×{1.33} for dry materials; cement 1440 kg/m³, sand 1600 kg/m³. Lintels include 150 mm bearing each side (200 mm for spans over 1.2 m). Always confirm structural lintels and tie spacing with local building codes.
          </p>
        )}
      </Panel>
    </div>
  )
}
