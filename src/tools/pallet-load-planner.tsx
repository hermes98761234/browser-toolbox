import { useMemo, useRef } from 'react'
import { Btn, Check, download, fmt, Note, Num, Panel, pct, Row, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { planPallet, type PlanInput } from './lib/pallet-load-planner'

const PALLETS: [string, string, number, number, number, number][] = [
  ['eur', 'EUR / EPAL 1200 × 800', 1200, 800, 144, 25],
  ['iso', 'ISO / UK 1200 × 1000', 1200, 1000, 144, 30],
  ['gma', 'US GMA 48 × 40 in', 1219, 1016, 140, 22],
  ['half', 'Half pallet 800 × 600', 800, 600, 144, 10],
  ['aus', 'Australian 1165 × 1165', 1165, 1165, 150, 30],
]
const BOXES: [string, number, number, number, number][] = [
  ['Shipping carton 400×300×250', 400, 300, 250, 12],
  ['Euro crate 600×400×300', 600, 400, 300, 18],
  ['Banana box 500×400×240', 500, 400, 240, 19],
  ['Parcel 330×220×180', 330, 220, 180, 6],
  ['Odd size 455×325×280', 455, 325, 280, 9],
]
const DEF = { pallet: 'eur', palletL: 1200, palletW: 800, palletH: 144, palletKg: 25, boxL: 400, boxW: 300, boxH: 250, boxKg: 12, maxHeight: 1800, maxKg: 1000, overhang: 0, upright: true, interlock: true }

export default function PalletLoadPlanner() {
  const [s, set, reset] = useToolState('pallet-load-planner', DEF)
  const input: PlanInput = s
  const plan = useMemo(() => planPallet(input), [input])
  const svgRef = useRef<SVGSVGElement>(null)
  const [l, w, h] = plan.dims

  const ref = useStage3D(
    (stage) => {
      const root = new THREE.Group()
      root.name = 'root'
      stage.scene.add(root)
    },
    (stage) => {
      const root = stage.scene.getObjectByName('root') as THREE.Group
      stage.clear(root)
      const k = 1 / 250
      const g = new THREE.Group()
      g.scale.setScalar(k)
      g.position.set((-s.palletL * k) / 2, 0, (-s.palletW * k) / 2)
      root.add(g)
      const wood = new THREE.MeshStandardMaterial({ color: '#c08a4b', roughness: 0.9 })
      const add = (x: number, y: number, z: number, dx: number, dy: number, dz: number, mat: THREE.Material) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(dx, dy, dz), mat)
        m.position.set(x + dx / 2, y + dy / 2, z + dz / 2)
        g.add(m)
        return m
      }
      // pallet: bottom boards, blocks, stringer boards, top deck boards
      const H = s.palletH
      const t = Math.min(22, H * 0.15)
      for (const z of [0, s.palletW / 2 - 50, s.palletW - 100]) add(0, 0, z, s.palletL, t, 100, wood)
      for (const x of [0, s.palletL / 2 - 70, s.palletL - 140]) for (const z of [0, s.palletW / 2 - 50, s.palletW - 100]) add(x, t, z, 140, H - 2 * t, 100, wood)
      const boards = Math.max(3, Math.round(s.palletW / 160))
      const bw = 100, gap = (s.palletW - boards * bw) / (boards - 1)
      for (let i = 0; i < boards; i++) add(0, H - t, i * (bw + gap), s.palletL, t, bw, wood)
      // boxes
      const colors = ['#d6a86a', '#c99a5b']
      const edge = new THREE.LineBasicMaterial({ color: '#5b4326' })
      for (let layer = 0; layer < plan.layers; layer++) {
        const count = layer === plan.layers - 1 ? plan.topLayer : plan.perLayer
        const mat = new THREE.MeshStandardMaterial({ color: colors[layer % 2], roughness: 0.8 })
        const mirror = s.interlock && layer % 2 === 1
        plan.layer.slice(0, count).forEach((r) => {
          const x = mirror ? s.palletL - r.x - r.w : r.x
          const m = add(x + 2, H + layer * h + 1, r.y + 2, r.w - 4, h - 2, r.d - 4, mat)
          const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), edge)
          e.position.copy(m.position)
          g.add(e)
        })
      }
      // height limit plane
      const lim = new THREE.Mesh(new THREE.PlaneGeometry(s.palletL + 200, s.palletW + 200), new THREE.MeshBasicMaterial({ color: '#ef4444', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }))
      lim.rotation.x = -Math.PI / 2
      lim.position.set(s.palletL / 2, s.maxHeight, s.palletW / 2)
      g.add(lim)
    },
    [plan, s.palletL, s.palletW, s.palletH, s.maxHeight, s.interlock],
    { camera: [8, 7, 9.5], target: [0, 3, 0] },
  )

  const setPallet = (id: string) => {
    const p = PALLETS.find((x) => x[0] === id)
    if (p) set({ pallet: id, palletL: p[2], palletW: p[3], palletH: p[4], palletKg: p[5] })
  }
  const sc = 300 / Math.max(s.palletL, s.palletW)
  const pad = 24
  const exportSvg = () => svgRef.current && download('pallet-pattern.svg', new XMLSerializer().serializeToString(svgRef.current), 'image/svg+xml')

  return (
    <Split wide="right">
      <div>
        <Panel title="Pallet">
          <Select label="Type" value={s.pallet} onChange={setPallet} options={[...PALLETS.map((p) => [p[0], p[1]] as const), ['custom', 'Custom'] as const]} />
          <Row>
            <Num label="Length" value={s.palletL} onChange={(palletL) => set({ palletL: Math.max(100, palletL), pallet: 'custom' })} unit="mm" min={100} />
            <Num label="Width" value={s.palletW} onChange={(palletW) => set({ palletW: Math.max(100, palletW), pallet: 'custom' })} unit="mm" min={100} />
          </Row>
          <Row>
            <Num label="Pallet height" value={s.palletH} onChange={(palletH) => set({ palletH: Math.max(0, palletH) })} unit="mm" min={0} />
            <Num label="Pallet weight" value={s.palletKg} onChange={(palletKg) => set({ palletKg: Math.max(0, palletKg) })} unit="kg" min={0} />
          </Row>
        </Panel>
        <Panel title="Box">
          <Select label="Preset" value="" onChange={(v) => { const b = BOXES.find((x) => x[0] === v); if (b) set({ boxL: b[1], boxW: b[2], boxH: b[3], boxKg: b[4] }) }} options={[['', 'Choose a preset…'] as const, ...BOXES.map((b) => [b[0], b[0]] as const)]} />
          <Row>
            <Num label="Length" value={s.boxL} onChange={(boxL) => set({ boxL: Math.max(1, boxL) })} unit="mm" min={1} />
            <Num label="Width" value={s.boxW} onChange={(boxW) => set({ boxW: Math.max(1, boxW) })} unit="mm" min={1} />
          </Row>
          <Row>
            <Num label="Height" value={s.boxH} onChange={(boxH) => set({ boxH: Math.max(1, boxH) })} unit="mm" min={1} />
            <Num label="Weight" value={s.boxKg} onChange={(boxKg) => set({ boxKg: Math.max(0, boxKg) })} unit="kg" min={0} />
          </Row>
          <Check label="This side up (don't tip boxes over)" value={s.upright} onChange={(upright) => set({ upright })} />
        </Panel>
        <Panel title="Limits">
          <Row>
            <Num label="Max load height (incl. pallet)" value={s.maxHeight} onChange={(maxHeight) => set({ maxHeight })} unit="mm" min={0} />
            <Num label="Max payload" value={s.maxKg} onChange={(maxKg) => set({ maxKg })} unit="kg" min={0} />
          </Row>
          <Num label="Allowed overhang per side" value={s.overhang} onChange={(overhang) => set({ overhang: Math.max(0, overhang) })} unit="mm" min={0} hint="Overhang weakens cartons; 0 is safest." />
          <Check label="Interlock: mirror every other layer" value={s.interlock} onChange={(interlock) => set({ interlock })} />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Boxes per pallet" value={plan.total} tone="accent" sub={`${plan.perLayer} per layer × ${plan.layers} layer${plan.layers === 1 ? '' : 's'}${plan.topLayer && plan.topLayer < plan.perLayer ? ` (top: ${plan.topLayer})` : ''}`} />
          <Stat label="Load height" value={`${fmt(plan.height, 4)} mm`} sub={`limit ${s.maxHeight} mm`} />
          <Stat label="Gross weight" value={`${fmt(plan.gross, 5)} kg`} sub={`payload ${fmt(plan.payload, 5)} kg`} tone={plan.payload > s.maxKg ? 'bad' : undefined} />
          <Stat label="Footprint use" value={pct(plan.areaUse, 1)} sub={`volume use ${pct(plan.volumeUse, 0)}`} />
        </Stats>
        {plan.perLayer === 0 && <Note tone="err">The box does not fit on this pallet. Allow overhang or untick "This side up".</Note>}
        {plan.limitedBy === 'weight' && <Note tone="warn">Weight is the limit: {Math.floor(s.maxKg / (s.boxKg || 1))} boxes reach the {s.maxKg} kg payload before the height limit.</Note>}
        {!s.upright && (l !== s.boxL || w !== s.boxW) && <Note>Best result lays boxes as {l} × {w} with {h} mm vertical.</Note>}
        <Panel title="3D stack">
          <View3D refEl={ref} height={400} />
        </Panel>
        <Panel title="Layer pattern (top view)" actions={<Btn onClick={exportSvg}>⬇ SVG</Btn>}>
          <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" viewBox={`${-pad} ${-pad} ${s.palletL * sc + pad * 2} ${s.palletW * sc + pad * 2}`} style={{ width: '100%', maxWidth: 520, display: 'block', margin: '0 auto' }} role="img" aria-label="Layer pattern">
            <rect x={-pad} y={-pad} width={s.palletL * sc + pad * 2} height={s.palletW * sc + pad * 2} fill="#ffffff" />
            <rect x={0} y={0} width={s.palletL * sc} height={s.palletW * sc} fill="#e7c9a0" stroke="#8b5e34" strokeWidth={1.5} />
            {plan.layer.map((r, i) => (
              <g key={i}>
                <rect x={r.x * sc} y={r.y * sc} width={r.w * sc} height={r.d * sc} fill={r.w === l ? '#93c5fd' : '#fcd34d'} stroke="#1e293b" strokeWidth={1} />
                <text x={(r.x + r.w / 2) * sc} y={(r.y + r.d / 2) * sc + 4} fontSize={11} textAnchor="middle" fill="#1e293b">{i + 1}</text>
              </g>
            ))}
            <text x={(s.palletL * sc) / 2} y={-8} fontSize={11} textAnchor="middle" fill="#334155">{s.palletL} mm</text>
            <text x={-8} y={(s.palletW * sc) / 2} fontSize={11} textAnchor="middle" fill="#334155" transform={`rotate(-90 ${-8} ${(s.palletW * sc) / 2})`}>{s.palletW} mm</text>
          </svg>
          <p className="muted" style={{ fontSize: 13 }}>Blue boxes run lengthwise ({l} along the {s.palletL} mm side), yellow boxes are turned 90°. Mixed orientations come from a guillotine-cut search over all combinations of box lengths.</p>
        </Panel>
        <Panel title="Summary">
          <Table
            head={['Item', 'Value']}
            rows={[
              ['Box as placed (L × W × H)', `${l} × ${w} × ${h} mm`],
              ['Boxes per layer', plan.perLayer],
              ['Full layers', plan.topLayer === plan.perLayer ? plan.layers : Math.max(0, plan.layers - 1)],
              ['Free height above load', `${fmt(s.maxHeight - plan.height, 4)} mm`],
              ['Free payload', `${fmt(s.maxKg - plan.payload, 5)} kg`],
              ['Pallets for 1,000 boxes', plan.total ? Math.ceil(1000 / plan.total) : '—'],
            ]}
          />
        </Panel>
      </div>
    </Split>
  )
}
