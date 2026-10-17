import { useMemo } from 'react'
import { Btn, Check, CsvButton, JsonButtons, money, Note, Num, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { bestOrient, layout, netArea, pack, seams, type Orient, type Piece } from './lib/drywall-estimator'

type Unit = 'ft' | 'm'
interface Op { id: string; kind: 'Door' | 'Window' | 'Other'; x: number; y: number; w: number; h: number }
interface Surf { id: string; name: string; length: number; height: number; ceiling: boolean; openings: Op[] }

const SHEETS: Record<Unit, [number, number][]> = {
  ft: [[8, 4], [9, 4], [10, 4], [12, 4], [12, 4.5]],
  m: [[2.4, 1.2], [2.5, 1.2], [2.6, 1.2], [2.7, 1.2], [3, 1.2]],
}
const PRESETS: Record<Unit, Record<'Door' | 'Window', Omit<Op, 'id' | 'kind' | 'x'>>> = {
  ft: { Door: { y: 0, w: 3, h: 6.75 }, Window: { y: 3, w: 3, h: 4 } },
  m: { Door: { y: 0, w: 0.9, h: 2.05 }, Window: { y: 0.9, w: 1.2, h: 1.2 } },
}

const room = (): Surf[] => [
  { id: 'a', name: 'North wall', length: 14, height: 8, ceiling: false, openings: [{ id: 'w1', kind: 'Window', x: 5.5, y: 3, w: 3, h: 4 }] },
  { id: 'b', name: 'East wall', length: 12, height: 8, ceiling: false, openings: [{ id: 'd1', kind: 'Door', x: 1, y: 0, w: 3, h: 6.75 }] },
  { id: 'c', name: 'South wall', length: 14, height: 8, ceiling: false, openings: [{ id: 'w2', kind: 'Window', x: 2, y: 3, w: 4, h: 4 }] },
  { id: 'd', name: 'West wall', length: 12, height: 8, ceiling: false, openings: [{ id: 'c1', kind: 'Other', x: 3, y: 0, w: 5, h: 6.75 }] },
  { id: 'e', name: 'Ceiling', length: 14, height: 12, ceiling: true, openings: [] },
]

const DEF = {
  unit: 'ft' as Unit, sheet: 3, orient: 'auto' as 'auto' | Orient, waste: 5, level: 4, inside: 4, outside: 0, currency: '$',
  surfaces: room(),
  price: { sheet: 16.5, mud: 22, tape: 6.5, screws: 9, bead: 4.5 },
}

const FT2 = 10.7639
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export default function DrywallEstimator() {
  const [s, set, reset] = useToolState('drywall-estimator', DEF)
  const u = s.unit
  const [S, W] = SHEETS[u][Math.min(s.sheet, SHEETS[u].length - 1)]
  const a2 = u === 'ft' ? 'sq ft' : 'm²'

  const r = useMemo(() => {
    const surfs = s.surfaces.filter((x) => x.length > 0 && x.height > 0)
    const per = surfs.map((sf, i) => {
      const o: Orient = s.orient === 'auto' ? bestOrient(sf, S, W) : s.orient
      const pieces = layout(sf, S, W, o, i)
      return { sf, o, pieces, seam: seams(pieces), net: netArea(sf), gross: sf.length * sf.height }
    })
    const all: Piece[] = per.flatMap((p) => p.pieces)
    const sheets = pack(all, S, W)
    return { per, all, sheets }
  }, [s.surfaces, s.orient, S, W])

  const wallNet = r.per.filter((p) => !p.sf.ceiling).reduce((a, p) => a + p.net, 0)
  const ceilNet = r.per.filter((p) => p.sf.ceiling).reduce((a, p) => a + p.net, 0)
  const net = wallNet + ceilNet
  const sqft = net * (u === 'ft' ? 1 : FT2)
  const k = 1 + s.waste / 100
  const sheetsN = Math.ceil(r.sheets.length * k)
  const wallH = Math.max(0, ...r.per.filter((p) => !p.sf.ceiling).map((p) => p.sf.height))
  const perim = r.per.filter((p) => !p.sf.ceiling).reduce((a, p) => a + p.sf.length, 0)
  const hasCeil = r.per.some((p) => p.sf.ceiling)
  const flatSeams = r.per.reduce((a, p) => a + p.seam, 0)
  const cornerLen = s.inside * wallH + (hasCeil ? perim : 0)
  const tapeLen = (flatSeams + cornerLen) * 1.1 * k
  const roll = u === 'ft' ? 500 : 150
  const screws = Math.ceil((wallNet + ceilNet * 1.25) * (u === 'ft' ? 1 : FT2) * k)
  const lvl = { 3: 0.8, 4: 1, 5: 1.4 }[s.level as 3 | 4 | 5] ?? 1
  const mudLb = sqft * 0.138 * lvl * k
  const pails = Math.ceil(mudLb / 61.7)
  const beadLen = s.outside * wallH
  const beads = Math.ceil(beadLen / (u === 'ft' ? 8 : 2.4))
  const screwLb = screws / 300
  const primer = sqft / 300
  const used = r.sheets.reduce((a, x) => a + x.used, 0)
  const eff = used / (r.sheets.length * S * W || 1)
  const m = (x: number) => money(x, s.currency)

  const materials: [string, string, number, number][] = [
    [`Drywall sheets ${S}×${W} ${u}`, `${sheetsN} sheets`, sheetsN, s.price.sheet],
    ['Drywall screws', u === 'ft' ? `${screws} (~${screwLb.toFixed(1)} lb)` : `${screws} (~${(screwLb * 0.4536).toFixed(1)} kg)`, Math.ceil(screwLb), s.price.screws],
    ['Joint compound (all-purpose)', u === 'ft' ? `${mudLb.toFixed(0)} lb → ${pails} × 4.5-gal pail` : `${(mudLb * 0.4536).toFixed(0)} kg → ${pails} × 28 kg pail`, pails, s.price.mud],
    ['Paper joint tape', `${tapeLen.toFixed(0)} ${u} → ${Math.ceil(tapeLen / roll)} × ${roll} ${u} roll`, Math.ceil(tapeLen / roll), s.price.tape],
    ['Corner bead', `${beads} × ${u === 'ft' ? "8'" : '2.4 m'}`, beads, s.price.bead],
  ]
  const total = materials.reduce((a, x) => a + x[2] * x[3], 0)

  const edit = (id: string, p: Partial<Surf>) => set({ surfaces: s.surfaces.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const editOp = (sid: string, oid: string, p: Partial<Op>) => set({ surfaces: s.surfaces.map((x) => (x.id === sid ? { ...x, openings: x.openings.map((o) => (o.id === oid ? { ...o, ...p } : o)) } : x)) })
  const addOp = (sf: Surf, kind: 'Door' | 'Window') => edit(sf.id, { openings: [...sf.openings, { id: uid(), kind, x: Math.max(0, sf.length / 2 - PRESETS[u][kind].w / 2), ...PRESETS[u][kind] }] })
  const switchUnit = (nu: Unit) => {
    if (nu === u) return
    const f = nu === 'm' ? 0.3048 : 1 / 0.3048
    const c = (v: number) => Math.round(v * f * 100) / 100
    set({ unit: nu, surfaces: s.surfaces.map((x) => ({ ...x, length: c(x.length), height: c(x.height), openings: x.openings.map((o) => ({ ...o, x: c(o.x), y: c(o.y), w: c(o.w), h: c(o.h) })) })) })
  }

  return (
    <Split>
      <div>
        <Panel title="Sheets & options" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Seg value={u} onChange={switchUnit} options={[['ft', 'Feet'], ['m', 'Metres']]} />
            <Seg value={s.orient} onChange={(orient) => set({ orient })} options={[['auto', 'Auto'], ['h', 'Horizontal'], ['v', 'Vertical']]} label="Orientation" />
          </Row>
          <Row>
            <Select label="Sheet size" value={s.sheet} onChange={(sheet) => set({ sheet })} options={SHEETS[u].map(([l, w], i) => [i, `${w} × ${l} ${u}`] as const)} />
            <Select label="Finish level" value={s.level} onChange={(level) => set({ level })} options={[[3, 'Level 3 (texture)'], [4, 'Level 4 (paint)'], [5, 'Level 5 (skim coat)']]} />
          </Row>
          <Slider label="Extra for waste & breakage" value={s.waste} min={0} max={25} unit="%" onChange={(waste) => set({ waste })} />
          <Row>
            <Num label="Inside corners" value={s.inside} onChange={(inside) => set({ inside })} min={0} step={1} />
            <Num label="Outside corners" value={s.outside} onChange={(outside) => set({ outside })} min={0} step={1} />
          </Row>
        </Panel>
        <Panel title="Walls & ceilings" actions={<JsonButtons name="drywall-project.json" data={s} onLoad={(d) => set(d)} />}>
          {s.surfaces.map((sf) => (
            <div key={sf.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10 }}>
              <Row>
                <Txt label="Name" value={sf.name} onChange={(name) => edit(sf.id, { name })} />
                <Check label="Ceiling" value={sf.ceiling} onChange={(ceiling) => edit(sf.id, { ceiling })} />
              </Row>
              <Row>
                <Num label="Length" value={sf.length} onChange={(length) => edit(sf.id, { length })} unit={u} min={0} />
                <Num label={sf.ceiling ? 'Width' : 'Height'} value={sf.height} onChange={(height) => edit(sf.id, { height })} unit={u} min={0} />
              </Row>
              {sf.openings.map((o) => (
                <div key={o.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr)) auto', gap: 6, alignItems: 'end' }}>
                  <Num label={`${o.kind} · left`} value={o.x} onChange={(x) => editOp(sf.id, o.id, { x })} min={0} />
                  <Num label={sf.ceiling ? "Top" : "Sill"} value={o.y} onChange={(y) => editOp(sf.id, o.id, { y })} min={0} />
                  <Num label="Width" value={o.w} onChange={(w) => editOp(sf.id, o.id, { w })} min={0} />
                  <Num label="Height" value={o.h} onChange={(h) => editOp(sf.id, o.id, { h })} min={0} />
                  <Btn kind="ghost" onClick={() => edit(sf.id, { openings: sf.openings.filter((x) => x.id !== o.id) })}>✕</Btn>
                </div>
              ))}
              <Row>
                {!sf.ceiling && <Btn onClick={() => addOp(sf, 'Door')}>+ Door</Btn>}
                <Btn onClick={() => addOp(sf, 'Window')}>+ {sf.ceiling ? 'Opening' : 'Window'}</Btn>
                <Btn kind="danger" onClick={() => set({ surfaces: s.surfaces.filter((x) => x.id !== sf.id) })}>Remove</Btn>
              </Row>
            </div>
          ))}
          <Row>
            <Btn kind="primary" onClick={() => set({ surfaces: [...s.surfaces, { id: uid(), name: `Wall ${s.surfaces.length + 1}`, length: u === 'ft' ? 12 : 3.6, height: u === 'ft' ? 8 : 2.4, ceiling: false, openings: [] }] })}>+ Wall</Btn>
            <Btn onClick={() => set({ surfaces: [...s.surfaces, { id: uid(), name: 'Ceiling', length: u === 'ft' ? 12 : 3.6, height: u === 'ft' ? 12 : 3.6, ceiling: true, openings: [] }] })}>+ Ceiling</Btn>
            <Btn kind="ghost" onClick={() => set({ unit: 'ft', surfaces: room() })}>Sample room</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Sheets to buy" value={sheetsN} sub={`${r.sheets.length} by layout + ${s.waste}%`} tone="accent" />
          <Stat label="Board area (net)" value={`${net.toFixed(1)} ${a2}`} sub={`walls ${wallNet.toFixed(0)} · ceiling ${ceilNet.toFixed(0)}`} />
          <Stat label="Sheet yield" value={`${(eff * 100).toFixed(0)}%`} sub="board used vs bought" tone={eff > 0.85 ? 'good' : undefined} />
          <Stat label="Estimated cost" value={m(total)} />
        </Stats>
        <Panel title="Material list" actions={<CsvButton name="drywall-materials.csv" rows={() => [['Item', 'Quantity', 'Units to buy', 'Unit price', 'Cost'], ...materials.map(([n, q, c, p]) => [n, q, c, p, (c * p).toFixed(2)]), ['Primer (PVA)', `${primer.toFixed(1)} gal`, '', '', '']]} />}>
          <Table
            head={['Item', 'Quantity', 'Unit price', 'Cost']}
            rows={materials.map(([n, q, c, p], i) => [n, q, <input key="p" className="k-text" style={{ width: 80 }} type="number" min={0} value={p} onChange={(e) => set({ price: { ...s.price, [(['sheet', 'screws', 'mud', 'tape', 'bead'] as const)[i]]: Number(e.target.value) || 0 } })} />, m(c * p)])}
            foot={['Total', '', '', m(total)]}
          />
          <Note>
            Joints to tape: {flatSeams.toFixed(0)} {u} of flat seams (from the layout) + {cornerLen.toFixed(0)} {u} of inside corners{hasCeil ? ' and wall-ceiling angle' : ''}. Primer: about {primer.toFixed(1)} gal (≈ {(primer * 3.785).toFixed(1)} L).
            Rates: ~1 screw/sq ft on walls, 1.25 on ceilings; ~0.14 lb compound/sq ft for a level-4 finish.
          </Note>
        </Panel>
        <Panel title="Sheet layout">
          <Legend2 />
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
            {r.per.map((p, i) => (
              <div key={p.sf.id}>
                <b>{LETTERS[i % 26]} · {p.sf.name}</b> <span className="muted" style={{ fontSize: 13 }}>{p.o === 'h' ? 'horizontal' : 'vertical'} · {p.pieces.length} pieces · seams {p.seam.toFixed(0)} {u}</span>
                <SurfaceSvg L={p.sf.length} H={p.sf.height} pieces={p.pieces} openings={p.sf.openings} letter={LETTERS[i % 26]} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel title={`Cut plan — ${r.sheets.filter((x) => x.parts.length > 1 || !r.all[x.parts[0].piece].full).length} sheets are cut`}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {r.sheets.map((sh, i) => (sh.parts.length > 1 || !r.all[sh.parts[0].piece].full) && (
              <svg key={i} viewBox={`-1 -1 ${S + 2} ${W + 2}`} style={{ width: 170, border: '1px solid var(--line)', borderRadius: 6 }}>
                <rect x={0} y={0} width={S} height={W} fill="var(--line)" opacity={0.6} />
                {sh.parts.map((pt, j) => {
                  const pc = r.all[pt.piece]
                  const idx = r.per[pc.surface].pieces.indexOf(pc) + 1
                  return (
                    <g key={j}>
                      <rect x={pt.x} y={pt.y} width={pt.l} height={pt.t} fill="#f59e0b" fillOpacity={0.35} stroke="#b45309" strokeWidth={S / 200} />
                      <text x={pt.x + pt.l / 2} y={pt.y + pt.t / 2} fontSize={Math.min(pt.t * 0.5, S / 14)} textAnchor="middle" dominantBaseline="middle" fill="var(--fg)">{LETTERS[pc.surface % 26]}{idx}</text>
                    </g>
                  )
                })}
              </svg>
            ))}
          </div>
          <Note>Offcuts from long runs are re-used for short pieces (best-fit guillotine packing). Grey = waste. Hang ceilings first, then walls top-down; stagger butt joints when hanging.</Note>
        </Panel>
      </div>
    </Split>
  )
}

function Legend2() {
  return (
    <div className="k-legend" style={{ marginBottom: 8 }}>
      <span><i style={{ background: '#6366f1' }} />Full sheet</span>
      <span><i style={{ background: '#f59e0b' }} />Cut piece</span>
      <span><i style={{ background: '#94a3b8' }} />Opening</span>
    </div>
  )
}

function SurfaceSvg({ L, H, pieces, openings, letter }: { L: number; H: number; pieces: Piece[]; openings: Op[]; letter: string }) {
  const sw = Math.max(L, H) / 150
  return (
    <svg viewBox={`${-sw} ${-sw} ${L + 2 * sw} ${H + 2 * sw}`} style={{ width: '100%', maxHeight: 220, display: 'block' }}>
      <g transform={`translate(0 ${H}) scale(1 -1)`}>
        {pieces.map((p, i) => (
          <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.full ? '#6366f1' : '#f59e0b'} fillOpacity={0.25} stroke={p.full ? '#4f46e5' : '#b45309'} strokeWidth={sw} />
        ))}
        {openings.map((o) => (
          <rect key={o.id} x={o.x} y={o.y} width={o.w} height={o.h} fill="#94a3b8" fillOpacity={0.7} stroke="#475569" strokeWidth={sw} strokeDasharray={`${sw * 4} ${sw * 2}`} />
        ))}
      </g>
      {pieces.map((p, i) => (
        <text key={i} x={p.x + p.w / 2} y={H - p.y - p.h / 2} fontSize={Math.min(p.h, p.w) * 0.32} textAnchor="middle" dominantBaseline="middle" fill="var(--fg)" opacity={0.8}>{letter}{i + 1}</text>
      ))}
    </svg>
  )
}
