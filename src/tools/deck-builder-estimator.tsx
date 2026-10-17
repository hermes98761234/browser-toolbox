import { useRef } from 'react'
import { Btn, Check, CsvButton, money, Note, Num, Panel, Row, Select, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { bill, DEPTH, estimate, JOIST_SIZES, SPAN, type DeckInput, type JoistSize, type Prices } from './lib/deck-builder-estimator'

const DECKING = {
  pt: { name: 'Pressure-treated pine', color: '#b08d57', price: 1.35 },
  cedar: { name: 'Cedar', color: '#c26a3d', price: 3.1 },
  composite: { name: 'Composite (grey)', color: '#8b8b88', price: 4.2 },
  ipe: { name: 'Ipe hardwood', color: '#6b3e26', price: 6.5 },
} as const
type Deck = keyof typeof DECKING

const PRICES: Omit<Prices, 'decking'> = { joistLf: { '2x6': 1.1, '2x8': 1.45, '2x10': 1.95, '2x12': 2.6 }, post: 24, concreteBag: 6.5, hanger: 2.4, screwBox: 38, railingFt: 32, stringer: 22, tread: 18 }

const DEF = {
  d: { width: 16, depth: 12, height: 3, spacing: 16, joist: 'auto', postSpacing: 8, boardWidth: 5.5, gap: 0.1875, stock: 16, waste: 8, railing: true, stairs: true, stairWidth: 4 } as DeckInput,
  deck: 'pt' as Deck, prices: PRICES, show: { decking: true, railing: true },
}

const PRESETS: [string, Partial<DeckInput>][] = [
  ['Small 10×10', { width: 10, depth: 10, height: 2 }], ['Classic 16×12', { width: 16, depth: 12, height: 3 }],
  ['Big 20×14', { width: 20, depth: 14, height: 4 }], ['High 12×10', { width: 12, depth: 10, height: 8 }],
]

export default function DeckBuilderEstimator() {
  const [s, set, reset] = useToolState('deck-builder-estimator', DEF)
  const d = s.d
  const e = estimate(d)
  const p: Prices = { ...s.prices, decking: DECKING[s.deck].price }
  const items = bill(d, e, p)
  const total = items.reduce((a, r) => a + r[3], 0)
  const setD = (patch: Partial<DeckInput>) => set({ d: { ...d, ...patch } })
  const group = useRef(new THREE.Group())

  const ref = useStage3D(
    (st) => {
      st.scene.add(group.current)
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: '#3f5f3a', roughness: 1 }))
      ground.rotation.x = -Math.PI / 2
      ground.position.y = -0.01
      st.scene.add(ground)
    },
    (st) => {
      const g = group.current
      st.clear(g)
      const W = d.width, D = d.depth, H = Math.max(0.5, d.height)
      const jd = DEPTH[e.joist] / 12, bt = 1 / 12, t = 1.5 / 12
      const wood = new THREE.MeshStandardMaterial({ color: '#c8a46a', roughness: 0.9 })
      const frame = new THREE.MeshStandardMaterial({ color: '#8f7a52', roughness: 0.9 })
      const deckM = new THREE.MeshStandardMaterial({ color: DECKING[s.deck].color, roughness: 0.75 })
      const deckM2 = new THREE.MeshStandardMaterial({ color: new THREE.Color(DECKING[s.deck].color).multiplyScalar(0.9), roughness: 0.75 })
      const rail = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.6 })
      const box = (w: number, h: number, dd: number, x: number, y: number, z: number, m: THREE.Material) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m)
        mesh.position.set(x, y, z)
        g.add(mesh)
        return mesh
      }
      // house wall
      box(W + 8, H + 9, 0.6, 0, (H + 9) / 2, -0.3, new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 1 }))
      box(3, 6.8, 0.1, -W / 4, H + 3.4, 0.02, new THREE.MeshStandardMaterial({ color: '#475569' }))
      const jTop = H - bt
      box(W, jd, t, 0, jTop - jd / 2, t / 2, frame) // ledger
      box(W, jd, t, 0, jTop - jd / 2, D - t / 2, frame) // rim
      for (let i = 0; i < e.joists; i++) {
        const x = Math.min(W / 2 - t / 2, -W / 2 + t / 2 + (i * d.spacing) / 12)
        box(t, jd, D - 2 * t, x, jTop - jd / 2, D / 2, wood)
      }
      const beamZ = D - 0.5 - t
      box(W, jd, 2 * t, 0, jTop - jd - jd / 2, beamZ, frame)
      for (let i = 0; i < e.posts; i++) {
        const x = -W / 2 + 0.25 + (i * (W - 0.5)) / (e.posts - 1)
        const ph = jTop - 2 * jd
        box(5.5 / 12, ph, 5.5 / 12, x, ph / 2, beamZ, frame)
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 16), new THREE.MeshStandardMaterial({ color: '#9ca3af' }))
        f.position.set(x, 0.05, beamZ)
        g.add(f)
      }
      if (s.show.decking) {
        const bw = d.boardWidth / 12, cover = (d.boardWidth + d.gap) / 12
        for (let r = 0; r < e.rows; r++) {
          const z = Math.min(D - bw / 2, r * cover + bw / 2)
          box(W + 0.1, bt, bw, 0, H - bt / 2, z, r % 2 ? deckM : deckM2)
        }
      }
      if (d.railing && s.show.railing) {
        const rh = 3, rp = 3.5 / 12
        const sides: [number, number, number, number][] = [[-W / 2, 0, -W / 2, D], [W / 2, 0, W / 2, D]]
        const sw = d.stairs ? Math.min(d.stairWidth, W - 1) : 0
        if (sw) sides.push([-W / 2, D, -sw / 2, D], [sw / 2, D, W / 2, D])
        else sides.push([-W / 2, D, W / 2, D])
        const bal = new THREE.BoxGeometry(t, rh - 0.3, t)
        for (const [x0, z0, x1, z1] of sides) {
          const len = Math.hypot(x1 - x0, z1 - z0)
          if (len < 0.2) continue
          const n = Math.max(1, Math.ceil(len / 6))
          for (let i = 0; i <= n; i++) box(rp, rh, rp, x0 + ((x1 - x0) * i) / n, H + rh / 2, z0 + ((z1 - z0) * i) / n, rail)
          box(Math.abs(x1 - x0) || t * 2, t, Math.abs(z1 - z0) || t * 2, (x0 + x1) / 2, H + rh, (z0 + z1) / 2, rail)
          const nb = Math.floor((len * 12) / 5)
          for (let i = 1; i < nb; i++) {
            const m = new THREE.Mesh(bal, rail)
            m.position.set(x0 + ((x1 - x0) * i) / nb, H + (rh - 0.3) / 2 + 0.15, z0 + ((z1 - z0) * i) / nb)
            g.add(m)
          }
        }
      }
      if (d.stairs && e.risers) {
        const rH = e.riserH / 12, run = 10 / 12, sw = Math.min(d.stairWidth, W)
        for (let i = 1; i < e.risers; i++) box(sw, bt, 11.25 / 12, 0, H - i * rH, D + (i - 0.5) * run, deckM)
        const L = e.treads * run, ang = Math.atan2(H, L + run)
        for (let k = 0; k < e.stringers; k++) {
          const x = -sw / 2 + 0.1 + (k * (sw - 0.2)) / Math.max(1, e.stringers - 1)
          const m = box(t, 0.8, Math.hypot(H, L + run), x, H / 2 - 0.4, D + (L + run) / 2, frame)
          m.rotation.x = ang
        }
      }
      const r = Math.max(W, D, H * 2)
      st.controls.target.set(0, H / 2, D / 2)
      if (!st.camera.userData.placed) {
        st.camera.position.set(r * 0.95, H + r * 0.7, D + r * 1.05)
        st.camera.userData.placed = true
      }
    },
    [d, s.deck, s.show, e.joist, e.joists, e.posts, e.rows, e.risers, e.stringers],
    { background: '#bfdbfe', grid: false, camera: [18, 12, 26] },
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Deck size">
          <Row>
            {PRESETS.map(([n, v]) => <Btn key={n} kind="ghost" onClick={() => setD(v)}>{n}</Btn>)}
          </Row>
          <Row>
            <Num label="Width (along house)" unit="ft" min={4} max={40} value={d.width} onChange={(width) => setD({ width })} />
            <Num label="Depth (from house)" unit="ft" min={4} max={20} value={d.depth} onChange={(depth) => setD({ depth })} />
          </Row>
          <Num label="Height above ground" unit="ft" min={0.5} max={14} step={0.5} value={d.height} onChange={(height) => setD({ height })} />
        </Panel>
        <Panel title="Framing">
          <span className="k-label">Joist spacing (on centre)</span>
          <Seg value={String(d.spacing) as '12' | '16' | '24'} onChange={(v) => setD({ spacing: Number(v) as 12 | 16 | 24 })} options={[['12', '12″'], ['16', '16″'], ['24', '24″']]} />
          <Row>
            <Select label="Joist size" value={d.joist} onChange={(joist) => setD({ joist: joist as JoistSize | 'auto' })} options={[['auto', `Auto (${e.auto ?? 'too long'})`], ...JOIST_SIZES.map((j) => [j, `${j} · max ${SPAN[j][d.spacing].toFixed(1)} ft`] as [string, string])]} />
            <Num label="Max post spacing" unit="ft" min={4} max={12} value={d.postSpacing} onChange={(postSpacing) => setD({ postSpacing })} />
          </Row>
          {e.spanOk ? (
            <Note tone="ok">{e.joist} joists span {e.span.toFixed(1)} ft (limit {e.maxSpan.toFixed(1)} ft at {d.spacing}″ o.c.).</Note>
          ) : (
            <Note tone="err">{e.joist} at {d.spacing}″ o.c. only spans {e.maxSpan.toFixed(1)} ft, but needs {e.span.toFixed(1)} ft. Use larger joists, closer spacing or add a mid beam.</Note>
          )}
          {d.spacing === 24 && s.deck === 'composite' && <Note tone="warn">Most composite decking requires 16″ (or 12″ diagonal) joist spacing.</Note>}
        </Panel>
        <Panel title="Decking">
          <Select label="Material" value={s.deck} onChange={(deck) => set({ deck })} options={Object.entries(DECKING).map(([k, v]) => [k as Deck, `${v.name} · ${money(v.price)}/lf`] as [Deck, string])} />
          <Row>
            <Select label="Board length" value={d.stock} onChange={(stock) => setD({ stock })} options={[8, 10, 12, 16, 20].map((v) => [v, `${v} ft`] as [number, string])} />
            <Num label="Board width" unit="in" min={2} max={12} step={0.25} value={d.boardWidth} onChange={(boardWidth) => setD({ boardWidth })} />
            <Num label="Gap" unit="in" min={0} max={0.5} step={0.0625} value={d.gap} onChange={(gap) => setD({ gap })} />
            <Num label="Waste" unit="%" min={0} max={30} value={d.waste} onChange={(waste) => setD({ waste })} />
          </Row>
          <Check label="Railing" value={d.railing} onChange={(railing) => setD({ railing })} />
          <Check label="Stairs" value={d.stairs} onChange={(stairs) => setD({ stairs })} />
          {d.stairs && <Num label="Stair width" unit="ft" min={3} max={12} value={d.stairWidth} onChange={(stairWidth) => setD({ stairWidth })} />}
          {e.railNeeded && !d.railing && <Note tone="err">Decks more than 30″ above grade need guards (36″ high, openings under 4″).</Note>}
        </Panel>
      </div>
      <div>
        <Panel title="3D model" actions={<><Check label="Decking" value={s.show.decking} onChange={(v) => set({ show: { ...s.show, decking: v } })} /><Check label="Railing" value={s.show.railing} onChange={(v) => set({ show: { ...s.show, railing: v } })} /></>}>
          <View3D refEl={ref} height={400} />
          <p className="muted" style={{ fontSize: 12 }}>Drag to orbit, scroll to zoom. Untick decking to see joists, beam and posts.</p>
        </Panel>
        <Stats>
          <Stat label="Deck area" value={`${e.area.toFixed(0)} ft²`} sub={`${(e.area * 0.0929).toFixed(1)} m²`} />
          <Stat label="Estimated cost" value={money(total, '$', 0)} sub={`${money(total / e.area)}/ft²`} tone="accent" />
          <Stat label="Joists" value={`${e.joists} × ${e.joist}`} sub={`${e.joistLen} ft at ${d.spacing}″ o.c.`} tone={e.spanOk ? 'good' : 'bad'} />
          <Stat label="Decking" value={`${e.boards} boards`} sub={`${e.rows} rows · ${e.deckLf} lf`} />
          <Stat label="Posts / footings" value={e.posts} sub={`${e.bags} bags concrete`} />
          {d.stairs && <Stat label="Stairs" value={`${e.risers} risers`} sub={`${e.riserH.toFixed(2)}″ rise · ${e.run}″ run`} />}
        </Stats>
        <Panel title="Material list" actions={<><CsvButton name="deck-materials.csv" rows={() => [['Item', 'Qty', 'Unit', 'Cost'], ...items.map((r) => [r[0], r[1], r[2], r[3].toFixed(2)]), ['Total', '', '', total.toFixed(2)]]} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Table head={['Item', 'Qty', 'Unit', 'Cost']} rows={items.map((r) => [r[0], r[1], r[2], money(r[3])])} foot={['Total', '', '', money(total)]} />
        </Panel>
        <Panel title="Unit prices">
          <Row>
            {JOIST_SIZES.map((j) => (
              <Num key={j} label={`${j} per lf`} unit="$" min={0} value={s.prices.joistLf[j]} onChange={(v) => set({ prices: { ...s.prices, joistLf: { ...s.prices.joistLf, [j]: v } } })} />
            ))}
            <Num label="6x6 post (8 ft)" unit="$" min={0} value={s.prices.post} onChange={(post) => set({ prices: { ...s.prices, post } })} />
            <Num label="Concrete bag" unit="$" min={0} value={s.prices.concreteBag} onChange={(concreteBag) => set({ prices: { ...s.prices, concreteBag } })} />
            <Num label="Railing per ft" unit="$" min={0} value={s.prices.railingFt} onChange={(railingFt) => set({ prices: { ...s.prices, railingFt } })} />
            <Num label="Screws box" unit="$" min={0} value={s.prices.screwBox} onChange={(screwBox) => set({ prices: { ...s.prices, screwBox } })} />
          </Row>
          <Note>Spans follow IRC Table R507.5 (southern pine #2, 40 psf live load). Ledger-attached deck with one doubled beam near the outer edge. Verify with your local building department; this is a planning estimate.</Note>
        </Panel>
      </div>
    </Split>
  )
}
