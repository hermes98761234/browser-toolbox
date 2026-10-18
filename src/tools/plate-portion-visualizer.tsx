import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { Btn, Check, CsvButton, Note, num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { FOODS, food, handGuide, moundRadius, portions, sectorCentroid, USABLE, type Group, type Portion, type Section } from './lib/plate-portion-visualizer'

const GROUP_NAME: Record<Group, string> = { veg: 'Vegetables', protein: 'Protein', grain: 'Grains & starch' }
const PRESETS: { name: string; fr: [number, number, number]; note: string }[] = [
  { name: 'Healthy plate', fr: [50, 25, 25], note: 'Half vegetables, a quarter lean protein and a quarter whole grains or starchy food — the common everyday guideline.' },
  { name: 'Easy / rest day', fr: [50, 25, 25], note: 'On light-activity days most athlete plate models match the everyday healthy plate.' },
  { name: 'Moderate training', fr: [34, 33, 33], note: 'More grains for fuel: roughly a third each of vegetables, protein and grains.' },
  { name: 'Hard training day', fr: [25, 25, 50], note: 'Endurance-heavy days: half the plate becomes carbohydrate-rich grains and starch.' },
  { name: 'Lower-carb', fr: [55, 30, 15], note: 'Smaller starch portion, more vegetables and a slightly larger protein portion.' },
]
const PLATES: [number, string][] = [[20, 'Side / kids plate 20 cm'], [23, 'Standard 23 cm (9 in)'], [26, 'Dinner plate 26 cm'], [28, 'Large dinner 28 cm'], [30, 'Oversized 30 cm']]

const DEF = {
  dia: 23,
  fr: [50, 25, 25] as [number, number, number],
  foods: ['broccoli', 'chicken', 'brownrice'] as [string, string, string],
  heap: 1,
  fruit: true,
  milk: false,
  water: true,
  labels: true,
  preset: 'Healthy plate',
}

/** Deterministic pseudo-random numbers so the scene does not jump on every render. */
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const pos = (deg: number, d: number, y: number) => new THREE.Vector3(Math.cos((deg * Math.PI) / 180) * d, y, -Math.sin((deg * Math.PI) / 180) * d)
const OFFSET = 90 // vegetables start at the top-left

function scatter(p: Portion, r: number, n: number, rand: () => number) {
  const out: [number, number][] = []
  for (let k = 0; k < n * 40 && out.length < n; k++) {
    const d = Math.sqrt(rand()) * r * 0.9
    const a = OFFSET + p.startDeg + 4 + rand() * Math.max(1, p.spanDeg - 8)
    const v = pos(a, d, 0)
    // keep away from the dividing lines
    const edge = Math.min(Math.abs(a - OFFSET - p.startDeg), Math.abs(OFFSET + p.startDeg + p.spanDeg - a)) * (Math.PI / 180) * d
    if (p.spanDeg < 359 && edge < 1.1) continue
    out.push([v.x, v.z])
  }
  return out
}

function buildFood(g: THREE.Group, p: Portion, r: number, i: number) {
  const f = p.food
  const rand = rng(97 + i * 31 + Math.round(p.ml))
  const m = (c: string, rough = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: rough })
  const mid = OFFSET + p.startDeg + p.spanDeg / 2
  const c = sectorCentroid(r * 0.95, p.spanDeg)
  if (f.group === 'veg') {
    const unit = f.id === 'salad' ? 14 : 10
    const n = Math.max(4, Math.min(90, Math.round(p.ml / unit)))
    const pts = scatter(p, r, n, rand)
    pts.forEach(([x, z], k) => {
      const y = 0.6 + (k / n) * (f.height - 1.2) * 0.8 * rand()
      if (f.id === 'salad') {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 6), m(k % 3 ? '#4ade80' : '#a3e635'))
        leaf.scale.set(1, 0.25, 0.7)
        leaf.rotation.set(rand() * 0.8, rand() * 6, rand() * 0.8)
        leaf.position.set(x, y + 0.3, z)
        g.add(leaf)
      } else if (f.id === 'roastveg') {
        const b = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 1.4), m(['#ef4444', '#facc15', '#65a30d'][k % 3]))
        b.rotation.set(rand(), rand() * 6, rand())
        b.position.set(x, y + 0.3, z)
        g.add(b)
      } else if (k % 4 === 3) {
        const carrot = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.5, 14), m('#f97316'))
        carrot.rotation.set(rand() * 1.2, 0, rand() * 1.2)
        carrot.position.set(x, y + 0.3, z)
        g.add(carrot)
      } else {
        const fl = new THREE.Group()
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.4, 8), m('#86efac'))
        stem.position.y = 0.7
        const head = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), m('#15803d', 1))
        head.position.y = 1.6
        head.scale.y = 0.75
        fl.add(stem, head)
        fl.rotation.set((rand() - 0.5) * 0.8, rand() * 6, (rand() - 0.5) * 0.8)
        fl.position.set(x, y - 0.2, z)
        g.add(fl)
      }
    })
    return
  }
  if (f.group === 'protein' && f.id !== 'beans') {
    const h = f.height
    const A = p.ml / h
    const w = Math.sqrt(A * 1.5), d = A / w
    const box = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(0.9, h / 2.2)), m(f.color, 0.65))
    const at = pos(mid, c, 0.4 + h / 2)
    box.position.copy(at)
    box.rotation.y = ((mid + 90) * Math.PI) / 180
    g.add(box)
    if (f.id === 'chicken' || f.id === 'salmon') {
      for (let k = -2; k <= 2; k++) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, d * 0.8), m(f.id === 'salmon' ? '#fed7aa' : '#b45309'))
        line.position.set(k * w * 0.18, h / 2 + 0.02, 0)
        box.add(line)
      }
    }
    return
  }
  // grains, starch and beans: a mound with surface pieces
  const h = f.height
  const R = Math.min(r * 0.9, moundRadius(p.ml, h))
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), m(f.color, 0.95))
  mound.scale.set(R, h, R * 0.85)
  const at = pos(mid, Math.min(c, r - R * 0.8), 0.35)
  mound.position.copy(at)
  mound.rotation.y = ((mid + 90) * Math.PI) / 180
  g.add(mound)
  const n = f.id === 'potato' ? 7 : f.id === 'pasta' ? 26 : 40
  for (let k = 0; k < n; k++) {
    const a = rand() * Math.PI * 2, t = Math.sqrt(rand()) * 0.85
    const y = at.y + h * Math.sqrt(Math.max(0, 1 - t * t))
    let piece: THREE.Mesh
    if (f.id === 'potato') piece = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 0), m('#fcd34d'))
    else if (f.id === 'pasta') piece = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2, 8, 1, true), m('#d97706'))
    else if (f.id === 'beans') piece = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), m(k % 2 ? '#7c2d12' : '#a16207'))
    else piece = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.35, 2, 4), m('#fef3c7'))
    piece.position.set(at.x + Math.cos(a) * t * R, y, at.z + Math.sin(a) * t * R * 0.85)
    piece.rotation.set(rand() * 3, rand() * 3, rand() * 3)
    g.add(piece)
  }
}

export default function PlatePortionVisualizer() {
  const [s, set, reset] = useToolState('plate-portion-visualizer', DEF)
  const sections: Section[] = (['veg', 'protein', 'grain'] as Group[]).map((group, i) => ({ group, frac: s.fr[i], food: s.foods[i] }))
  const ps = portions(s.dia, sections, s.heap)
  const total = ps.reduce((a, p) => a + p.kcal, 0)
  const fruitKcal = s.fruit ? 95 : 0, milkKcal = s.milk ? 125 : 0
  const big = portions(30, sections, s.heap).reduce((a, p) => a + p.kcal, 0)
  const preset = PRESETS.find((p) => p.name === s.preset)

  const ref = useStage3D(
    () => undefined,
    (st) => {
      let g = st.scene.getObjectByName('plate') as THREE.Group | undefined
      if (!g) {
        g = new THREE.Group()
        g.name = 'plate'
        st.scene.add(g)
      }
      st.clear(g)
      const R = s.dia / 2, r = R * USABLE
      const table = new THREE.Mesh(new THREE.BoxGeometry(90, 2, 60), new THREE.MeshStandardMaterial({ color: '#a8754a', roughness: 0.9 }))
      table.position.y = -1
      g.add(table)
      const prof = [new THREE.Vector2(0, 0.01), new THREE.Vector2(r * 0.9, 0.01), new THREE.Vector2(r * 1.02, 0.3), new THREE.Vector2(R * 0.98, 1.3), new THREE.Vector2(R, 1.4), new THREE.Vector2(R * 0.98, 1.45), new THREE.Vector2(r * 1.0, 0.55), new THREE.Vector2(0, 0.4)]
      const plate = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.35, side: THREE.DoubleSide }))
      g.add(plate)
      ps.forEach((p, i) => {
        if (p.spanDeg < 0.5) return
        const tint = new THREE.Mesh(new THREE.CircleGeometry(r, 48, ((OFFSET + p.startDeg) * Math.PI) / 180, (p.spanDeg * Math.PI) / 180), new THREE.MeshBasicMaterial({ color: p.food.color, transparent: true, opacity: 0.22 }))
        tint.rotation.x = -Math.PI / 2
        tint.position.y = 0.42
        g.add(tint)
        if (p.spanDeg < 359.5) {
          const a = OFFSET + p.startDeg
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([pos(a, 0, 0.45), pos(a, r, 0.45)]), new THREE.LineBasicMaterial({ color: '#64748b' }))
          g.add(line)
        }
        buildFood(g, p, r, i)
        if (s.labels) {
          const t = label(`${GROUP_NAME[p.group]} · ${Math.round(p.grams)} g`, '#f8fafc', 1.3)
          t.position.copy(pos(OFFSET + p.startDeg + p.spanDeg / 2, sectorCentroid(r, p.spanDeg) * 1.1, 7))
          g.add(t)
        }
      })
      const glass = (x: number, z: number, fill: string | null, ml: number) => {
        const gl = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.2, 12, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.28, side: THREE.DoubleSide, roughness: 0.1 }))
        gl.position.set(x, 6, z)
        g.add(gl)
        const h = ml / (Math.PI * 3.3 * 3.3)
        const liq = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.15, h, 32), new THREE.MeshStandardMaterial({ color: fill ?? '#7dd3fc', transparent: !fill, opacity: fill ? 1 : 0.55 }))
        liq.position.set(x, h / 2 + 0.1, z)
        g.add(liq)
      }
      if (s.water) glass(R + 7, -R * 0.55, null, 250)
      if (s.milk) glass(R + 7, R * 0.45, '#fafafa', 250)
      if (s.fruit) {
        const apple = new THREE.Mesh(new THREE.SphereGeometry(3.7, 32, 20), new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.45 }))
        apple.scale.y = 0.9
        apple.position.set(-R - 6, 3.4, R * 0.35)
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.5, 6), new THREE.MeshStandardMaterial({ color: '#713f12' }))
        stem.position.set(-R - 6, 7.2, R * 0.35)
        g.add(apple, stem)
      }
    },
    [s.dia, s.fr.join(), s.foods.join(), s.heap, s.fruit, s.milk, s.water, s.labels],
    { camera: [0, 22, 21], grid: false, background: '#1e293b' },
  )

  const setFr = (i: number, v: number) => {
    const fr = [...s.fr] as [number, number, number]
    fr[i] = v
    set({ fr, preset: 'Custom' })
  }
  const sum = s.fr.reduce((a, b) => a + b, 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="Plate model" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            {PRESETS.map((p) => (
              <Btn key={p.name} kind={s.preset === p.name ? 'primary' : 'normal'} onClick={() => set({ fr: p.fr, preset: p.name })}>{p.name}</Btn>
            ))}
          </Row>
          {preset && <p className="k-hint">{preset.note}</p>}
          <Select label="Plate size" value={s.dia} onChange={(dia) => set({ dia })} options={PLATES} />
          <Slider label="Plate diameter" value={s.dia} onChange={(dia) => set({ dia })} min={16} max={34} step={0.5} unit=" cm" />
          <Slider label="Mound height" value={s.heap} onChange={(heap) => set({ heap })} min={0.5} max={1.6} step={0.05} show={(v) => `×${v.toFixed(2)}`} />
        </Panel>
        <Panel title="Sections">
          {(['veg', 'protein', 'grain'] as Group[]).map((gr, i) => (
            <div key={gr} style={{ marginBottom: 6 }}>
              <Slider label={GROUP_NAME[gr]} value={s.fr[i]} onChange={(v) => setFr(i, v)} min={0} max={100} step={1} unit={`% → ${Math.round((s.fr[i] / (sum || 1)) * 100)}%`} show={(v) => String(v)} />
              <Select label="Food" value={s.foods[i]} onChange={(id) => { const foods = [...s.foods] as [string, string, string]; foods[i] = id; set({ foods }) }} options={FOODS.filter((f) => f.group === gr).map((f) => [f.id, f.name] as [string, string])} />
            </div>
          ))}
          {sum !== 100 && <p className="k-hint">Shares add up to {sum}%; they are scaled to fill the plate.</p>}
        </Panel>
        <Panel title="On the side">
          <Check label="Piece of fruit (medium apple, ≈ 95 kcal)" value={s.fruit} onChange={(fruit) => set({ fruit })} />
          <Check label="Glass of milk or yogurt drink, 250 ml (≈ 125 kcal)" value={s.milk} onChange={(milk) => set({ milk })} />
          <Check label="Glass of water" value={s.water} onChange={(water) => set({ water })} />
          <Check label="Show labels in 3D" value={s.labels} onChange={(labels) => set({ labels })} />
        </Panel>
      </div>
      <div>
        <Panel title="Your plate in 3D">
          <View3D refEl={ref} height={440} />
          <p className="k-hint">Drag to rotate, scroll or pinch to zoom. Food shapes are scaled to the estimated volume of each portion (1 scene unit = 1 cm).</p>
        </Panel>
        <Stats>
          <Stat label="Plate energy" value={`${Math.round(total)} kcal`} sub={fruitKcal + milkKcal ? `${Math.round(total + fruitKcal + milkKcal)} kcal with sides` : 'plate only'} tone="accent" />
          <Stat label="Food volume" value={`${num(ps.reduce((a, p) => a + p.cups, 0), 1)} cups`} sub={`${Math.round(ps.reduce((a, p) => a + p.ml, 0))} ml`} />
          <Stat label="Vs. a 30 cm plate" value={s.dia < 30 ? `−${Math.round((1 - total / big) * 100)}%` : s.dia > 30 ? `+${Math.round((total / big - 1) * 100)}%` : 'same'} sub="same proportions, same mound" />
        </Stats>
        <Panel title="Portions" actions={<CsvButton name="plate-portions.csv" rows={() => [['Group', 'Food', 'Share %', 'Volume ml', 'Cups', 'Grams', 'kcal'], ...ps.map((p) => [GROUP_NAME[p.group], p.food.name, Math.round((p.spanDeg / 360) * 100), Math.round(p.ml), p.cups.toFixed(2), Math.round(p.grams), Math.round(p.kcal)])]} />}>
          <Table
            head={['Section', 'Food', 'Share', 'Amount', 'Hand guide', 'kcal']}
            rows={ps.map((p) => [
              <span key="g"><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: p.food.color, marginRight: 6 }} />{GROUP_NAME[p.group]}</span>,
              food(p.food.id).name,
              `${Math.round((p.spanDeg / 360) * 100)}%`,
              `${Math.round(p.grams)} g · ${num(p.cups, 1)} cup`,
              handGuide(p),
              Math.round(p.kcal),
            ])}
            foot={['Total', '', '100%', `${Math.round(ps.reduce((a, p) => a + p.grams, 0))} g`, '', Math.round(total)]}
          />
          <Note>Hand guide: a clenched fist ≈ 1 cup of vegetables or grains, a palm (thickness and size) ≈ 100 g of cooked meat, fish or tofu, a thumb ≈ 1 tablespoon of fat. A smaller plate with the same proportions automatically trims every portion.</Note>
          <Note tone="warn">General, informational guidance only — energy values are rounded estimates for cooked foods. Needs differ with age, size, activity and health; ask a dietitian or doctor for personal advice.</Note>
        </Panel>
      </div>
    </Split>
  )
}
