import { useEffect, useMemo, useRef } from 'react'
import { Bar, Btn, Check, JsonButtons, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, money, num, pct, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { groutKg, layout, WASTE, type Pattern } from './lib/tile-layout-planner'

interface State {
  W: number; L: number; lshape: boolean; notchW: number; notchL: number
  tw: number; th: number; thick: number; grout: number // cm, cm, mm, mm
  pattern: Pattern; start: 'center' | 'corner'
  perBox: number; boxPrice: number; extra: number
  tileColor: string; groutColor: string; showCuts: boolean
}
const DEF: State = {
  W: 4.2, L: 3.4, lshape: true, notchW: 1.3, notchL: 1.1,
  tw: 60, th: 30, thick: 9, grout: 3, pattern: 'brick2', start: 'center',
  perBox: 6, boxPrice: 38, extra: 5, tileColor: '#d9cfc1', groutColor: '#7c7468', showCuts: true,
}
const PATTERNS: [Pattern, string][] = [
  ['straight', 'Straight grid'], ['brick2', 'Brick (½ offset)'], ['brick3', 'Brick (⅓ offset)'],
  ['diagonal', 'Diagonal 45°'], ['herring', 'Herringbone'], ['herring45', 'Herringbone 45°'],
]
const TILES: [string, number, number][] = [['30×30', 30, 30], ['60×60', 60, 60], ['60×30', 60, 30], ['120×20 plank', 120, 20], ['20×10 subway', 20, 10], ['10×10', 10, 10]]
const ROOMS: [string, Partial<State>][] = [
  ['Bathroom', { W: 2.4, L: 1.8, lshape: false }],
  ['Kitchen (L)', { W: 4.2, L: 3.4, lshape: true, notchW: 1.3, notchL: 1.1 }],
  ['Hallway', { W: 5, L: 1.2, lshape: false }],
  ['Living room', { W: 5.6, L: 4.2, lshape: false }],
]
const MAX_TILES = 30000

export default function TileLayoutPlanner() {
  const [s, set, reset] = useToolState('tile-layout-planner', DEF)
  const tw = Math.max(1, s.tw) / 100, th = Math.max(1, s.th) / 100
  const roomOk = s.W > 0 && s.L > 0 && s.W <= 30 && s.L <= 30
  const estimate = roomOk ? (s.W * s.L) / (tw * th) : 0
  const tooMany = estimate > MAX_TILES
  const res = useMemo(() => (roomOk && !tooMany
    ? layout({ W: s.W, L: s.L, notchW: s.lshape ? s.notchW : 0, notchL: s.lshape ? s.notchL : 0, tw, th, grout: Math.max(0, s.grout) / 1000, pattern: s.pattern, start: s.start })
    : null), [s.W, s.L, s.lshape, s.notchW, s.notchL, tw, th, s.grout, s.pattern, s.start, roomOk, tooMany])

  const area = res?.area ?? 0
  const count = res ? res.full + res.cut : 0
  const order = Math.ceil(count * (1 + s.extra / 100))
  const boxes = Math.ceil(order / Math.max(1, s.perBox))
  const bought = boxes * Math.max(1, s.perBox)
  const waste = area ? (bought * tw * th - area) / area : 0
  const areaOnly = Math.ceil((area / (tw * th)) * (1 + WASTE[s.pattern] / 100))
  const gKg = groutKg(s.tw * 10, s.th * 10, s.grout, s.thick, area)
  const buckets = res ? [
    ['Slivers (< 20 %)', res.pieces.filter((p) => p.cut && p.frac < 0.2).length],
    ['Small (20–50 %)', res.pieces.filter((p) => p.cut && p.frac >= 0.2 && p.frac < 0.5).length],
    ['Large (50–99 %)', res.pieces.filter((p) => p.cut && p.frac >= 0.5).length],
  ] as [string, number][] : []

  const sRef = useRef({ s, res })
  useEffect(() => {
    sRef.current = { s, res }
  })
  const group = useRef(new THREE.Group())
  const camKey = useRef('')
  const ref = useStage3D(
    (st) => {
      st.scene.add(group.current)
    },
    (st) => {
      const { s: v, res: r } = sRef.current
      st.clear(group.current)
      if (!r) return
      const ox = -v.W / 2, oz = -v.L / 2
      const y = Math.max(0.002, v.thick / 1000)
      // grout bed = room outline
      const shape = new THREE.Shape(r.outline.map(([x, z]) => new THREE.Vector2(x + ox, -(z + oz))))
      const bed = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: v.groutColor, roughness: 1 }))
      bed.rotation.x = -Math.PI / 2
      group.current.add(bed)
      // tiles: one merged geometry with vertex colours (fan triangulation of convex parts)
      const pos: number[] = [], col: number[] = []
      const base = new THREE.Color(v.tileColor), cutC = new THREE.Color('#f59e0b'), c = new THREE.Color()
      r.pieces.forEach((p, i) => {
        const jitter = 1 + (Math.sin(i * 91.7) * 0.5) * 0.08
        c.copy(p.cut && v.showCuts ? base.clone().lerp(cutC, 0.55) : base).multiplyScalar(jitter)
        for (const part of p.parts)
          for (let k = 1; k < part.length - 1; k++)
            for (const q of [part[0], part[k], part[k + 1]]) {
              pos.push(q[0] + ox, y, q[1] + oz)
              col.push(c.r, c.g, c.b)
            }
      })
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
      g.computeVertexNormals()
      group.current.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide })))
      // low walls along the outline
      const wallM = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.9 })
      r.outline.forEach(([x1, z1], i) => {
        const [x2, z2] = r.outline[(i + 1) % r.outline.length]
        const len = Math.hypot(x2 - x1, z2 - z1)
        const wall = new THREE.Mesh(new THREE.BoxGeometry(len + 0.08, 0.25, 0.04), wallM)
        wall.position.set((x1 + x2) / 2 + ox, 0.125, (z1 + z2) / 2 + oz)
        wall.rotation.y = -Math.atan2(z2 - z1, x2 - x1)
        group.current.add(wall)
      })
      const key = `${v.W}x${v.L}`
      if (key !== camKey.current) {
        camKey.current = key
        const m = Math.max(v.W, v.L)
        st.camera.position.set(m * 0.2, m * 0.8, m * 0.72)
        st.controls.target.set(0, 0, 0)
      }
    },
    [res, s.tileColor, s.groutColor, s.showCuts, s.thick],
    { grid: false, background: '#1e293b' },
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Room" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>{ROOMS.map(([n, p]) => <Btn key={n} onClick={() => set(p)}>{n}</Btn>)}</Row>
          <Row>
            <Num label="Width" unit="m" min={0.1} max={30} value={s.W} onChange={(W) => set({ W })} />
            <Num label="Length" unit="m" min={0.1} max={30} value={s.L} onChange={(L) => set({ L })} />
          </Row>
          <Check label="L-shaped room (cut-out in the far corner)" value={s.lshape} onChange={(lshape) => set({ lshape })} />
          {s.lshape && (
            <Row>
              <Num label="Cut-out width" unit="m" min={0} max={s.W} value={s.notchW} onChange={(notchW) => set({ notchW })} />
              <Num label="Cut-out length" unit="m" min={0} max={s.L} value={s.notchL} onChange={(notchL) => set({ notchL })} />
            </Row>
          )}
          {!roomOk && <Note tone="err">Enter a room between 0.1 and 30 m on each side.</Note>}
        </Panel>
        <Panel title="Tile & pattern">
          <Row>{TILES.map(([n, a, b]) => <Btn key={n} kind={s.tw === a && s.th === b ? 'primary' : 'normal'} onClick={() => set({ tw: a, th: b })}>{n}</Btn>)}</Row>
          <Row>
            <Num label="Tile length" unit="cm" min={1} value={s.tw} onChange={(v) => set({ tw: v })} />
            <Num label="Tile width" unit="cm" min={1} value={s.th} onChange={(v) => set({ th: v })} />
          </Row>
          <Row>
            <Num label="Grout joint" unit="mm" min={0} max={20} value={s.grout} onChange={(v) => set({ grout: v })} />
            <Num label="Tile thickness" unit="mm" min={1} value={s.thick} onChange={(v) => set({ thick: v })} />
          </Row>
          <Select label="Pattern" value={s.pattern} onChange={(pattern) => set({ pattern })} options={PATTERNS} />
          <Select label="Start point" value={s.start} onChange={(start) => set({ start })} options={[['center', 'Centred in the room (balanced cuts)'], ['corner', 'Full tile in the near-left corner']]} />
          <Row>
            <label className="k-field"><span className="k-label">Tile colour</span><input type="color" value={s.tileColor} onChange={(e) => set({ tileColor: e.target.value })} /></label>
            <label className="k-field"><span className="k-label">Grout colour</span><input type="color" value={s.groutColor} onChange={(e) => set({ groutColor: e.target.value })} /></label>
          </Row>
          <Check label="Highlight cut tiles" value={s.showCuts} onChange={(showCuts) => set({ showCuts })} />
        </Panel>
        <Panel title="Purchase">
          <Row>
            <Num label="Tiles per box" min={1} step={1} value={s.perBox} onChange={(perBox) => set({ perBox })} />
            <Num label="Price per box" min={0} value={s.boxPrice} onChange={(boxPrice) => set({ boxPrice })} />
          </Row>
          <Num label="Spare for breakage & repairs" unit="%" min={0} max={50} value={s.extra} onChange={(extra) => set({ extra })} />
          <Row><JsonButtons name="tile-layout.json" data={s} onLoad={(d) => set(d)} /></Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Floor area" value={`${num(area, 2)} m²`} sub={`${num(area * 10.7639, 1)} ft²`} />
          <Stat label="Tiles laid" value={count} sub={`${res?.full ?? 0} full · ${res?.cut ?? 0} cut`} />
          <Stat label="Order" value={`${boxes} boxes`} sub={`${bought} tiles · ${money(boxes * s.boxPrice)}`} tone="accent" />
          <Stat label="Grout" value={`${num(gKg, 1)} kg`} sub={`${s.grout} mm joint, ${s.thick} mm deep`} />
        </Stats>
        <Panel title="3D preview" actions={<span className="muted">drag to orbit · scroll to zoom</span>}>
          {tooMany ? <Note tone="warn">About {num(estimate, 0)} tiles: too many to draw. Use a larger tile or a smaller room.</Note> : <View3D refEl={ref} height={430} />}
        </Panel>
        {res && (
          <Panel title="Cuts & waste">
            {res.slivers > 0 && (
              <Note tone="warn">
                {res.slivers} sliver cut{res.slivers > 1 ? 's' : ''} (under 20 % of a tile). They look untidy and break easily. Try the other start point or nudge the grout width.
              </Note>
            )}
            <Table head={['Cut size', 'Pieces', '']} rows={buckets.map(([n, v]) => [n, v, <Bar key="b" value={v} max={Math.max(1, res.cut)} color="var(--warn)" />])} />
            <Table head={['Estimate', 'Tiles']} rows={[
              ['Layout count (full + cut pieces)', count],
              [`+ ${s.extra}% spare → order`, order],
              [`Rule of thumb: area ÷ tile + ${WASTE[s.pattern]}% for ${PATTERNS.find((p) => p[0] === s.pattern)?.[1]}`, areaOnly],
            ]} />
            <p className="muted">
              Effective waste of what you buy: <b>{pct(waste, 0)}</b>. Each cut piece is counted as one tile (offcuts are rarely reusable in patterned layouts).
              Grout estimate: ((A + B) / (A·B)) × joint × depth × 1.6 kg/dm³ × area.
            </p>
          </Panel>
        )}
      </div>
    </Split>
  )
}
