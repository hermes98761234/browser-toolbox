import { Btn, Check, Note, num, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { area, compute, heaterW, inner, L_PER_UKGAL, L_PER_USGAL, stockingCm, type Dims, type Shape } from './lib/aquarium-volume-calculator'

interface State { shape: Shape; unit: 'cm' | 'in'; l: number; w: number; h: number; bow: number; glass: number; fill: number; substrate: number; decor: number; type: string; room: number; target: number }

const DEF: State = { shape: 'rect', unit: 'cm', l: 100, w: 40, h: 50, bow: 8, glass: 8, fill: 90, substrate: 6, decor: 8, type: 'community', room: 20, target: 25 }

const PRESETS: [string, Partial<State>][] = [
  ['Nano 30 L', { shape: 'rect', l: 36, w: 26, h: 36, glass: 4, substrate: 4 }],
  ['Standard 60 cm', { shape: 'rect', l: 60, w: 30, h: 36, glass: 5, substrate: 5 }],
  ['US 55 gal', { shape: 'rect', l: 122, w: 33, h: 53, glass: 8, substrate: 6 }],
  ['Bow-front 180 L', { shape: 'bowfront', l: 100, w: 40, h: 50, bow: 8, glass: 8 }],
  ['Cylinder 50 cm', { shape: 'cylinder', l: 50, h: 70, glass: 8 }],
  ['Corner r 70', { shape: 'corner', l: 70, h: 55, glass: 8 }],
]

const TYPES: Record<string, { label: string; turn: [number, number]; salt: boolean; note: string }> = {
  community: { label: 'Tropical community', turn: [4, 6], salt: false, note: 'Small schooling fish: tetras, rasboras, corydoras.' },
  planted: { label: 'Planted / aquascape', turn: [5, 10], salt: false, note: 'Gentle but thorough flow keeps CO₂ and nutrients moving.' },
  goldfish: { label: 'Goldfish / cold water', turn: [8, 10], salt: false, note: 'Goldfish are messy: plan ~40 L for the first fish, +40 L each.' },
  cichlid: { label: 'African cichlids', turn: [6, 10], salt: false, note: 'Heavily stocked by design — overfilter generously.' },
  reef: { label: 'Saltwater reef', turn: [10, 20], salt: true, note: 'Plus 20–50× in-tank flow from powerheads.' },
}

const SHAPES: [Shape, string][] = [['rect', 'Rectangle'], ['bowfront', 'Bow-front'], ['cylinder', 'Cylinder'], ['hexagon', 'Hexagon'], ['corner', 'Quarter-round corner']]

function footprint(shape: Shape, d: Dims, k: number): THREE.Shape {
  const s = new THREE.Shape()
  const l = d.l * k, w = d.w * k
  if (shape === 'rect') {
    s.moveTo(-l / 2, -w / 2); s.lineTo(l / 2, -w / 2); s.lineTo(l / 2, w / 2); s.lineTo(-l / 2, w / 2); s.closePath()
  } else if (shape === 'cylinder') {
    s.absarc(0, 0, l / 2, 0, Math.PI * 2, false)
  } else if (shape === 'hexagon') {
    const R = l / Math.sqrt(3)
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i
      if (i) s.lineTo(R * Math.cos(a), R * Math.sin(a))
      else s.moveTo(R, 0)
    }
    s.closePath()
  } else if (shape === 'bowfront') {
    const b = Math.max(0.0001, d.bow * k)
    const R = (l * l) / (8 * b) + b / 2
    const cy = w / 2 + b - R
    const a1 = Math.atan2(w / 2 - cy, l / 2), a2 = Math.atan2(w / 2 - cy, -l / 2)
    s.moveTo(-l / 2, -w / 2); s.lineTo(l / 2, -w / 2); s.lineTo(l / 2, w / 2)
    s.absarc(0, cy, R, a1, a2, false)
    s.closePath()
  } else {
    s.moveTo(-l / 2, -l / 2); s.lineTo(l / 2, -l / 2)
    s.absarc(-l / 2, -l / 2, l, 0, Math.PI / 2, false)
    s.closePath()
  }
  return s
}

function prism(shape: THREE.Shape, y0: number, h: number) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, h), bevelEnabled: false, curveSegments: 48 })
  g.rotateX(-Math.PI / 2)
  g.translate(0, y0, 0)
  return g
}

export default function AquariumVolumeCalculator() {
  const [s, set, reset] = useToolState('aquarium-volume-calculator', DEF)
  const f = s.unit === 'in' ? 2.54 : 1
  const d: Dims = { l: s.l * f, w: s.w * f, h: s.h * f, bow: s.bow * f }
  const ty = TYPES[s.type] ?? TYPES.community
  const inn = inner(s.shape, d, s.glass / 10)
  const fillCm = (inn.h * s.fill) / 100
  const r = compute(s.shape, d, { glass: s.glass, fill: fillCm, substrate: s.substrate * f, decor: s.decor, salt: ty.salt })
  const valid = d.l > 0 && d.h > 0 && (d.w > 0 || s.shape === 'cylinder' || s.shape === 'hexagon' || s.shape === 'corner')
  const stockCm = stockingCm(r.water, r.surface)
  const len = (cm: number) => (s.unit === 'in' ? `${num(cm / 2.54, 1)} in` : `${num(cm, 1)} cm`)

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'tank'
      st.scene.add(g)
      const fish = new THREE.Group()
      fish.name = 'fish'
      st.scene.add(fish)
      const cols = [0xf97316, 0xfacc15, 0xef4444, 0x22d3ee]
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshStandardMaterial({ color: cols[i] }))
        m.scale.set(1.8, 1, 0.6)
        const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 3), new THREE.MeshStandardMaterial({ color: cols[i] }))
        tail.rotation.z = Math.PI / 2
        tail.position.x = -0.2
        m.add(tail)
        fish.add(m)
      }
      st.onFrame((t) => {
        const b = fish.userData as { rx?: number; rz?: number; y0?: number; y1?: number }
        fish.children.forEach((m, i) => {
          const a = t * (0.35 + i * 0.07) + i * 1.7
          const rx = (b.rx ?? 1) * (0.55 + 0.1 * i), rz = (b.rz ?? 1) * (0.5 - 0.08 * i)
          m.position.set(Math.cos(a) * rx, (b.y0 ?? 0.3) + ((b.y1 ?? 1) - (b.y0 ?? 0.3)) * (0.3 + 0.15 * i + 0.05 * Math.sin(a * 2)), Math.sin(a) * rz)
          m.rotation.y = -a - Math.PI / 2
        })
      })
    },
    (st) => {
      const g = st.scene.getObjectByName('tank') as THREE.Group
      const fish = st.scene.getObjectByName('fish') as THREE.Group
      st.clear(g)
      if (!valid) return
      const k = 4 / Math.max(d.l, d.w, d.h)
      const outer = footprint(s.shape, d, k)
      const inShape = footprint(s.shape, inn, k)
      const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.14, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false })
      const og = prism(outer, 0, d.h * k)
      g.add(new THREE.Mesh(og, glassMat))
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(og, 25), new THREE.LineBasicMaterial({ color: 0xcbd5e1 })))
      const sub = s.substrate * f * k
      const glassB = (s.glass / 10) * k
      if (sub > 0) g.add(new THREE.Mesh(prism(inShape, glassB, sub), new THREE.MeshStandardMaterial({ color: 0xd6b98c, roughness: 1 })))
      const wh = fillCm * k - sub
      if (wh > 0) {
        const wm = new THREE.Mesh(prism(inShape, glassB + sub, wh), new THREE.MeshPhysicalMaterial({ color: ty.salt ? 0x0ea5e9 : 0x38bdf8, transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false }))
        g.add(wm)
      }
      const stand = new THREE.Mesh(prism(outer, -0.25, 0.25), new THREE.MeshStandardMaterial({ color: 0x334155 }))
      g.add(stand)
      g.position.y = 0.25
      const w2 = (s.shape === 'rect' || s.shape === 'bowfront' ? inn.w : inn.l) * k
      fish.userData = { rx: inn.l * k * 0.5 * (s.shape === 'corner' ? 0.5 : 1), rz: w2 * 0.5 * (s.shape === 'corner' ? 0.5 : 1), y0: 0.25 + glassB + sub, y1: 0.25 + glassB + Math.max(sub, fillCm * k) }
      fish.position.set(s.shape === 'corner' ? -inn.l * k * 0.1 : 0, 0, s.shape === 'corner' ? inn.l * k * 0.1 : 0)
      fish.visible = wh > 0.3
    },
    [s, valid],
    { camera: [3.2, 2.6, 3.8], target: [0, 1.1, 0], background: '#0b1220' },
  )

  const turnLo = r.water * ty.turn[0], turnHi = r.water * ty.turn[1]
  return (
    <Split>
      <div>
        <Panel title="Tank">
          <Row>{PRESETS.map(([n, p]) => <Btn key={n} kind="ghost" onClick={() => set({ ...p, unit: 'cm', w: p.w ?? s.w })}>{n}</Btn>)}</Row>
          <Select label="Shape" value={s.shape} onChange={(shape) => set({ shape })} options={SHAPES} />
          <div className="k-field">
            <span className="k-label">Units</span>
            <Seg value={s.unit} onChange={(unit) => { const c = unit === 'in' ? 1 / 2.54 : 2.54; if (unit !== s.unit) set({ unit, l: +(s.l * c).toFixed(1), w: +(s.w * c).toFixed(1), h: +(s.h * c).toFixed(1), bow: +(s.bow * c).toFixed(1), substrate: +(s.substrate * c).toFixed(1) }) }} options={[['cm', 'cm'], ['in', 'inches']]} />
          </div>
          <Row>
            <Num label={s.shape === 'cylinder' ? 'Diameter' : s.shape === 'hexagon' ? 'Across flats' : s.shape === 'corner' ? 'Side (radius)' : 'Length'} value={s.l} onChange={(l) => set({ l })} unit={s.unit} min={1} />
            {(s.shape === 'rect' || s.shape === 'bowfront') && <Num label={s.shape === 'bowfront' ? 'Depth at sides' : 'Width (depth)'} value={s.w} onChange={(w) => set({ w })} unit={s.unit} min={1} />}
            <Num label="Height" value={s.h} onChange={(h) => set({ h })} unit={s.unit} min={1} />
            {s.shape === 'bowfront' && <Num label="Bow depth" value={s.bow} onChange={(bow) => set({ bow })} unit={s.unit} min={0} />}
          </Row>
          <Row>
            <Num label="Glass thickness" value={s.glass} onChange={(glass) => set({ glass })} unit="mm" min={0} max={30} />
            <Num label="Substrate depth" value={s.substrate} onChange={(substrate) => set({ substrate })} unit={s.unit} min={0} />
          </Row>
          <Slider label="Water level" value={s.fill} onChange={(fill) => set({ fill })} min={10} max={100} unit="%" show={(v) => String(v)} />
          <Slider label="Rock, wood & decor displacement" value={s.decor} onChange={(decor) => set({ decor })} min={0} max={40} unit="%" show={(v) => String(v)} />
          {!valid && <Note tone="err">Enter positive dimensions.</Note>}
        </Panel>
        <Panel title="Setup">
          <Select label="Tank type" value={s.type} onChange={(type) => set({ type })} options={Object.entries(TYPES).map(([k, v]) => [k, v.label] as [string, string])} />
          <Row>
            <Num label="Room temperature" value={s.room} onChange={(room) => set({ room })} unit="°C" />
            <Num label="Target water" value={s.target} onChange={(target) => set({ target })} unit="°C" />
          </Row>
          <Row>
            <Check label="Saltwater density (1.025)" value={ty.salt} onChange={() => set({ type: ty.salt ? 'community' : 'reef' })} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <View3D refEl={ref} height={380} />
        <Stats>
          <Stat label="Actual water" value={`${num(r.water, 1)} L`} sub={`${num(r.water / L_PER_USGAL, 1)} US gal · ${num(r.water / L_PER_UKGAL, 1)} UK gal`} tone="accent" />
          <Stat label="Nominal (outer)" value={`${num(r.gross, 1)} L`} sub={`${num(r.gross / L_PER_USGAL, 1)} US gal`} />
          <Stat label="Filled weight" value={`${num(r.total, 0)} kg`} sub={`${num(r.total * 2.20462, 0)} lb`} />
          <Stat label="Surface area" value={`${num(r.surface, 0)} cm²`} sub={`${num(r.surface / 6.4516, 0)} in²`} />
        </Stats>
        <Panel title="Volume breakdown">
          <Table
            head={['', 'Litres', 'US gal']}
            rows={[
              ['Outer dimensions', num(r.gross, 1), num(r.gross / L_PER_USGAL, 1)],
              [`Inside the glass (${len(inn.l)} × ${s.shape === 'rect' || s.shape === 'bowfront' ? len(inn.w) + ' × ' : ''}${len(inn.h)})`, num(r.inner, 1), num(r.inner / L_PER_USGAL, 1)],
              [`At ${s.fill}% fill (${len(fillCm)})`, num((area(s.shape, inn) * fillCm) / 1000, 1), num((area(s.shape, inn) * fillCm) / 1000 / L_PER_USGAL, 1)],
              ['Minus substrate & decor = water', <b key="w">{num(r.water, 1)}</b>, <b key="g">{num(r.water / L_PER_USGAL, 1)}</b>],
            ]}
          />
          <p className="muted" style={{ fontSize: 13 }}>Weight: water {num(r.waterWeight, 0)} kg + substrate {num(r.substrateKg, 0)} kg + glass ≈{num(r.glassKg, 0)} kg. Use a stand rated well above {num(r.total * 1.2, 0)} kg and a level floor.</p>
        </Panel>
        <Panel title="Equipment & stocking">
          <Table
            head={['Item', 'Recommendation', 'Rule of thumb']}
            rows={[
              ['Filter flow', <b key="f">{num(turnLo, 0)}–{num(turnHi, 0)} L/h</b>, `${ty.turn[0]}–${ty.turn[1]}× tank volume per hour (${num(turnLo / L_PER_USGAL, 0)}–${num(turnHi / L_PER_USGAL, 0)} GPH)`],
              ['Heater', <b key="h">{s.target > s.room ? `${heaterW(r.water, s.target - s.room)} W` : 'not needed'}</b>, `≈0.25 W per litre per °C (ΔT ${Math.max(0, s.target - s.room)} °C); two smaller heaters are safer than one`],
              ['Stocking', <b key="s">≈{num(stockCm, 0)} cm of fish</b>, `≈${num(stockCm / 2.54, 0)} in of slim adult fish; the lower of 1 cm per 1.5 L and 1 cm per 30 cm² surface`],
              ['Weekly water change', <b key="c">{num(r.water * 0.2, 0)}–{num(r.water * 0.3, 0)} L</b>, '20–30 % weekly'],
              ['Dechlorinator / dosing', <b key="d">for {num(r.water, 0)} L</b>, 'dose by actual water volume, not the nominal size'],
            ]}
          />
          <Note>{ty.note} Stocking rules are rough: adult size, bioload, temperament and territory matter more than length — research each species.</Note>
        </Panel>
      </div>
    </Split>
  )
}
