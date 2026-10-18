import { Area, Btn, CopyButton, Note, Num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { bakeTime, convert, CUP_ML, IN3_ML, panArea, panVolume, scaleRecipe, SHAPE_NAMES, type Pan, type Shape } from './lib/cake-pan-converter'

const PRESETS: [string, Pan][] = [
  ['6" round', { shape: 'round', a: 6, b: 0, h: 3, n: 12 }],
  ['8" round', { shape: 'round', a: 8, b: 0, h: 2, n: 12 }],
  ['9" round', { shape: 'round', a: 9, b: 0, h: 2, n: 12 }],
  ['10" springform', { shape: 'round', a: 10, b: 0, h: 3, n: 12 }],
  ['8×8" square', { shape: 'square', a: 8, b: 0, h: 2, n: 12 }],
  ['9×9" square', { shape: 'square', a: 9, b: 0, h: 2, n: 12 }],
  ['9×13" rectangle', { shape: 'rect', a: 9, b: 13, h: 2, n: 12 }],
  ['Half sheet 13×18"', { shape: 'rect', a: 13, b: 18, h: 1, n: 12 }],
  ['Jelly roll 10×15"', { shape: 'rect', a: 10, b: 15, h: 1, n: 12 }],
  ['9×5" loaf', { shape: 'rect', a: 5, b: 9, h: 2.75, n: 12 }],
  ['8½×4½" loaf', { shape: 'rect', a: 4.5, b: 8.5, h: 2.75, n: 12 }],
  ['Bundt ≈ 12 cup', { shape: 'tube', a: 9.5, b: 3.75, h: 3, n: 12 }],
  ['10" angel food tube', { shape: 'tube', a: 10, b: 3.75, h: 4, n: 12 }],
  ['7×10" oval', { shape: 'oval', a: 7, b: 10, h: 2.5, n: 12 }],
  ['12-cup muffin tin', { shape: 'muffin', a: 2.75, b: 2, h: 1.375, n: 12 }],
  ['24 mini muffins', { shape: 'muffin', a: 1.75, b: 1.25, h: 0.875, n: 24 }],
]

const RECIPE = `2 1/4 cups cake flour
1 1/2 cups sugar
2 1/2 tsp baking powder
1/2 tsp salt
3/4 cup butter, softened
3 eggs
1 cup milk
2 tsp vanilla extract
Frosting: make separately`

interface State {
  unit: 'in' | 'cm'
  from: Pan
  to: Pan
  depth: number
  mode: 'area' | 'volume'
  minutes: number
  temp: number
  recipe: string
  showUnscaled: boolean
}

const DEF: State = { unit: 'in', from: PRESETS[2][1], to: PRESETS[6][1], depth: 1.25, mode: 'area', minutes: 30, temp: 350, recipe: RECIPE, showUnscaled: false }

const S = 0.3 // scene units per inch
const METAL = () => new THREE.MeshStandardMaterial({ color: 0xa8b3c4, metalness: 0.55, roughness: 0.35, side: THREE.DoubleSide })
const BATTER = (over = false) => new THREE.MeshStandardMaterial({ color: over ? 0xef4444 : 0xf2c27b, roughness: 0.85 })

function footprint(p: Pan): [number, number] {
  if (p.shape === 'muffin') {
    const cols = p.n <= 6 ? 3 : p.n <= 12 ? 4 : 6
    const rows = Math.ceil(p.n / cols)
    return [cols * (p.a + 0.4) + 0.6, rows * (p.a + 0.4) + 0.6]
  }
  if (p.shape === 'rect' || p.shape === 'oval') return [p.b, p.a]
  return [p.a, p.a]
}

/** Builds a pan (walls + base) with batter of depth `d` (in). `over` paints the part above the rim red. */
function buildPan(p: Pan, d: number): THREE.Group {
  const g = new THREE.Group()
  const h = p.h * S
  const fill = Math.min(d, p.h) * S
  const spill = Math.max(0, d - p.h) * S
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y = 0, x = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    g.add(m)
    return m
  }
  const cyl = (r: number, height: number, y: number, mat: THREE.Material, open = false, x = 0, z = 0, r2 = r) =>
    add(new THREE.CylinderGeometry(r, r2, height, 48, 1, open), mat, y, x, z)
  if (p.shape === 'round' || p.shape === 'oval') {
    const r = (p.a / 2) * S
    const sz = p.shape === 'oval' ? p.b / p.a : 1
    const parts = [cyl(r, h, h / 2, METAL(), true), cyl(r, 0.02, 0.01, METAL())]
    if (fill > 0) parts.push(cyl(r * 0.985, fill, fill / 2, BATTER()))
    if (spill > 0) parts.push(cyl(r * 0.985, spill, h + spill / 2, BATTER(true)))
    if (sz !== 1) for (const m of parts) m.scale.set(sz, 1, 1)
  } else if (p.shape === 'square' || p.shape === 'rect') {
    const w = (p.shape === 'rect' ? p.b : p.a) * S, l = p.a * S, t = 0.03
    add(new THREE.BoxGeometry(w, t, l), METAL(), t / 2)
    add(new THREE.BoxGeometry(w, h, t), METAL(), h / 2, 0, l / 2)
    add(new THREE.BoxGeometry(w, h, t), METAL(), h / 2, 0, -l / 2)
    add(new THREE.BoxGeometry(t, h, l), METAL(), h / 2, w / 2, 0)
    add(new THREE.BoxGeometry(t, h, l), METAL(), h / 2, -w / 2, 0)
    if (fill > 0) add(new THREE.BoxGeometry(w * 0.99, fill, l * 0.99), BATTER(), fill / 2)
    if (spill > 0) add(new THREE.BoxGeometry(w * 0.99, spill, l * 0.99), BATTER(true), h + spill / 2)
  } else if (p.shape === 'tube') {
    const R = (p.a / 2) * S, r = (p.b / 2) * S
    cyl(R, h, h / 2, METAL(), true)
    cyl(r, h * 1.15, (h * 1.15) / 2, METAL())
    add(new THREE.RingGeometry(r, R, 48), METAL(), 0.01).rotation.x = -Math.PI / 2
    const ring = (y0: number, height: number, over: boolean) => {
      const sh = new THREE.Shape()
      sh.absarc(0, 0, R * 0.985, 0, Math.PI * 2, false)
      const hole = new THREE.Path()
      hole.absarc(0, 0, r * 1.02, 0, Math.PI * 2, true)
      sh.holes.push(hole)
      const m = add(new THREE.ExtrudeGeometry(sh, { depth: height, bevelEnabled: false, curveSegments: 48 }), BATTER(over), y0)
      m.rotation.x = -Math.PI / 2
    }
    if (fill > 0) ring(0, fill, false)
    if (spill > 0) ring(h, spill, true)
  } else {
    const cols = p.n <= 6 ? 3 : p.n <= 12 ? 4 : 6
    const rows = Math.ceil(p.n / cols)
    const pitch = (p.a + 0.4) * S
    const [W, L] = footprint(p).map((v) => v * S)
    add(new THREE.BoxGeometry(W, 0.03, L), METAL(), h)
    const R = (p.a / 2) * S, r = (p.b / 2) * S
    for (let i = 0; i < p.n; i++) {
      const x = ((i % cols) - (cols - 1) / 2) * pitch, z = (Math.floor(i / cols) - (rows - 1) / 2) * pitch
      cyl(R, h, h / 2, METAL(), true, x, z, r)
      cyl(r, 0.02, 0.01, METAL(), false, x, z)
      if (fill > 0) {
        const rt = r + (R - r) * (fill / h)
        cyl(rt * 0.97, fill, fill / 2, BATTER(), false, x, z, r * 0.97)
      }
      if (spill > 0) cyl(R * 0.97, spill, h + spill / 2, BATTER(true), false, x, z)
    }
  }
  return g
}

export default function CakePanConverter() {
  const [s, set, reset] = useToolState('cake-pan-converter', DEF)
  const k = s.unit === 'cm' ? 2.54 : 1
  const L = (inch: number, d = 1) => `${num(inch * k, d)} ${s.unit}`
  const c = convert(s.from, s.to, s.depth, s.mode)
  const t2 = bakeTime(s.minutes, s.depth, c.depthScaled)
  const lines = scaleRecipe(s.recipe, c.factor)
  const vol = (p: Pan) => (panVolume(p) * IN3_ML) / CUP_ML
  const area = (p: Pan) => panArea(p) * k * k

  const ref = useStage3D(
    (st: Stage3D) => {
      const root = new THREE.Group()
      root.name = 'pans'
      st.scene.add(root)
      const counter = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 }))
      counter.rotation.x = -Math.PI / 2
      counter.position.y = -0.01
      st.scene.add(counter)
    },
    (st: Stage3D) => {
      const root = st.scene.getObjectByName('pans')!
      st.clear(root)
      const [w1] = footprint(s.from), [w2] = footprint(s.to)
      const gap = 1.5
      const x1 = -(w2 + gap) / 2 * S, x2 = (w1 + gap) / 2 * S
      const a = buildPan(s.from, s.depth)
      a.position.x = x1
      const b = buildPan(s.to, s.showUnscaled ? c.depthUnscaled : c.depthScaled)
      b.position.x = x2
      root.add(a, b)
      const la = label('Original', '#e2e8f0', 0.4)
      la.position.set(x1, Math.max(s.from.h, 2) * S + 0.9, 0)
      const lb = label(s.showUnscaled ? 'New pan · unscaled batter' : 'New pan · scaled', '#fde68a', 0.4)
      lb.position.set(x2, Math.max(s.to.h, 2) * S + 0.9, 0)
      root.add(la, lb)
      const span = (w1 + w2 + gap) * S
      st.camera.position.set(0, span * 0.5 + 0.8, span * 0.62 + 0.8)
      st.controls.target.set(0, 0.3, 0)
    },
    [s.from, s.to, s.depth, s.showUnscaled, c.depthScaled, c.depthUnscaled],
    { camera: [0, 5, 7], background: '#1e293b', grid: false },
  )

  const panEditor = (which: 'from' | 'to') => {
    const p = s[which]
    const up = (patch: Partial<Pan>) => set({ [which]: { ...p, ...patch } } as Partial<State>)
    const dim = (lab: string, key: 'a' | 'b' | 'h', min = 0.25) => (
      <Num label={lab} value={Math.round(p[key] * k * 100) / 100} unit={s.unit} min={min * k} onChange={(v) => v > 0 && up({ [key]: v / k })} />
    )
    return (
      <>
        <Select
          label="Preset"
          value={PRESETS.find(([, q]) => JSON.stringify(q) === JSON.stringify(p))?.[0] ?? 'custom'}
          onChange={(name) => { const hit = PRESETS.find(([n]) => n === name); if (hit) set({ [which]: hit[1] } as Partial<State>) }}
          options={[['custom', 'Custom…'], ...PRESETS.map(([n]) => [n, n] as [string, string])]}
        />
        <Select label="Shape" value={p.shape} onChange={(shape: Shape) => up({ shape, b: shape === 'tube' ? Math.min(p.b || 3.5, p.a * 0.6) || 3.5 : shape === 'muffin' ? p.a * 0.75 : p.b || p.a * 1.4 })} options={Object.entries(SHAPE_NAMES) as [Shape, string][]} />
        <Row>
          {p.shape === 'round' && dim('Diameter', 'a')}
          {p.shape === 'square' && dim('Side', 'a')}
          {(p.shape === 'rect' || p.shape === 'oval') && <>{dim('Width', 'a')}{dim('Length', 'b')}</>}
          {p.shape === 'tube' && <>{dim('Outer diameter', 'a')}{dim('Tube diameter', 'b')}</>}
          {p.shape === 'muffin' && <>{dim('Cup top Ø', 'a')}{dim('Cup bottom Ø', 'b')}<Num label="Cups" value={p.n} min={1} max={48} step={1} onChange={(n) => n >= 1 && up({ n: Math.round(n) })} /></>}
          {dim(p.shape === 'muffin' ? 'Cup depth' : 'Height', 'h')}
        </Row>
        <p className="muted" style={{ margin: '4px 0 10px', fontSize: 13 }}>
          Base area {num(area(p), 1)} {s.unit}² · holds {num(vol(p), 1)} cups ({num((panVolume(p) * IN3_ML) / 1000, 2)} L) to the brim
        </p>
      </>
    )
  }

  const fillTone = c.fill > 0.75 ? 'bad' : c.fill < 0.3 ? 'accent' : 'good'
  const unscaledOver = c.depthUnscaled > s.to.h * 0.75
  return (
    <Split>
      <div>
        <Panel title="Your recipe's pan" actions={<Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['in', 'inches'], ['cm', 'cm']]} />}>
          {panEditor('from')}
          <Num label="Batter depth in this pan" value={Math.round(s.depth * k * 100) / 100} unit={s.unit} min={0.1} onChange={(v) => v > 0 && set({ depth: v / k })} hint="Layer cakes ≈ 1–1.5 in, brownies ≈ 1 in, loaves ≈ 2 in. Leave about ⅓ of the pan for rising." />
        </Panel>
        <Panel title="Pan you want to use" actions={<Btn onClick={() => set({ from: s.to, to: s.from })}>⇄ Swap</Btn>}>
          {panEditor('to')}
        </Panel>
        <Panel title="Scaling rule">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['area', 'Same batter depth (area)'], ['volume', 'Same fill level (volume)']]} />
          <p className="muted" style={{ fontSize: 13 }}>
            {s.mode === 'area'
              ? 'Scales by base area so the cake is as thick as before — baking time stays close to the original. Best for layer cakes, brownies and sheet cakes.'
              : 'Scales by pan volume so the new pan is filled to the same fraction. Use it when the pans have different heights (Bundt, tube, springform).'}
          </p>
          <Row>
            <Num label="Original bake time" value={s.minutes} unit="min" min={1} onChange={(minutes) => minutes > 0 && set({ minutes })} />
            <Num label="Oven temperature" value={s.temp} unit="°F" min={200} onChange={(temp) => set({ temp })} />
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Multiply recipe by" value={`× ${num(c.factor, 2)}`} sub={`area ×${num(c.areaRatio, 2)} · volume ×${num(c.volRatio, 2)}`} tone="accent" />
          <Stat label="New batter depth" value={L(c.depthScaled, 2)} sub={`${pct(c.fill, 0)} of pan height`} tone={fillTone} />
          <Stat label="Bake time (estimate)" value={`${Math.round(t2 * 0.9)}–${Math.round(t2 * 1.05)} min`} sub={`start checking at ${Math.round(t2 * 0.85)} min`} />
          <Stat label="Unscaled recipe would be" value={L(c.depthUnscaled, 2)} sub="deep in the new pan" tone={unscaledOver ? 'bad' : undefined} />
        </Stats>
        <Panel title="Pan comparison" actions={<Btn onClick={() => set({ showUnscaled: !s.showUnscaled })}>{s.showUnscaled ? 'Show scaled batter' : 'Show unscaled batter'}</Btn>}>
          <View3D refEl={ref} height={340} />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Drag to orbit · drawn to scale · red = batter above the rim.</p>
        </Panel>
        {c.fill > 0.75 && <Note tone="err">The scaled batter fills {pct(c.fill, 0)} of the new pan — it will likely overflow. Use a taller pan, bake the extra as cupcakes, or switch to “same fill level”.</Note>}
        {c.fill < 0.3 && <Note tone="warn">The batter will be thin ({L(c.depthScaled, 2)}). Bake time drops a lot; watch for over-browning.</Note>}
        {(s.to.shape === 'rect' && s.to.a * s.to.b > 120) || (s.to.shape === 'round' && s.to.a >= 10) || s.to.shape === 'tube' ? (
          <Note>Large or deep pans bake unevenly: consider {s.temp - 25}°F instead of {s.temp}°F, a heating core or flower nail in the centre, and baking strips around the rim.</Note>
        ) : null}
        <Panel title={`Scaled recipe × ${num(c.factor, 2)}`} actions={<CopyButton text={() => lines.map((l) => l.line).join('\n')} label="Copy" />}>
          <Area value={s.recipe} onChange={(recipe) => set({ recipe })} rows={5} placeholder="Paste ingredient lines, one per line" />
          <Table
            head={['Original', 'Scaled']}
            rows={s.recipe.split('\n').map((orig, i) => [orig, <span key="s"><b>{lines[i]?.line}</b>{lines[i]?.note && <div className="muted" style={{ fontSize: 12 }}>{lines[i].note}</div>}</span>]).filter((r) => r[0] !== '')}
          />
          <Row>
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
        <Note>Estimates assume straight-sided pans; real pans flare slightly and Bundt flutes take up space, so fill no more than ⅔ full. The bake-time range is a rule of thumb (time ∝ depth^1.3) — always test with a skewer.</Note>
      </div>
    </Split>
  )
}
