import { Btn, Check, CsvButton, money, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { optimize as packSheets } from './lib/cut-list-optimizer'
import { BREEDS, cutList, design, plyArea, type Dog, type Options } from './lib/dog-house-builder'
import { optimize as packSticks } from './lib/lumber-cut-optimizer'

interface State extends Options {
  unit: 'in' | 'cm'
  breed: string
  dog: Dog
  plyPrice: number
  stickPrice: number
}

const DEF: State = {
  unit: 'in', breed: 'Labrador Retriever', dog: BREEDS[6].dog, roof: 'gable', pitch: 30, overhang: 2, ply: 0.75, raise: 4, climate: 'mild', porch: false,
  plyPrice: 48, stickPrice: 6,
}

const S = 0.07 // scene units per inch
const WOOD = 0xd9b382, ROOF = 0x8b4a2b, DARK = 0x5b3a1f

function DogDiagram() {
  return (
    <svg viewBox="0 0 220 120" width="100%" style={{ maxWidth: 300 }} role="img" aria-label="Where to measure your dog">
      <g fill="#c08a52" stroke="#6b4423" strokeWidth={1.2}>
        <ellipse cx={110} cy={62} rx={52} ry={18} />
        <rect x={68} y={70} width={8} height={34} rx={3} /><rect x={82} y={72} width={8} height={32} rx={3} />
        <rect x={132} y={70} width={8} height={34} rx={3} /><rect x={146} y={72} width={8} height={32} rx={3} />
        <circle cx={168} cy={38} r={15} /><ellipse cx={182} cy={44} rx={9} ry={6} />
        <path d="M160,26 l-4,-12 l10,8z" /><path d="M58,56 q-16,-6 -20,-22" fill="none" strokeWidth={4} />
      </g>
      <g stroke="#2563eb" strokeWidth={1.4} fill="#2563eb" fontSize={10} fontFamily="system-ui">
        <line x1={58} y1={14} x2={190} y2={14} /><text x={100} y={11} stroke="none">A length: nose → tail base</text>
        <line x1={204} y1={104} x2={204} y2={22} /><text x={190} y={118} stroke="none">B head</text>
        <line x1={44} y1={104} x2={44} y2={46} /><text x={4} y={118} stroke="none">C shoulder</text>
        <line x1={96} y1={92} x2={124} y2={92} /><text x={92} y={88} stroke="none" fontSize={9}>D chest</text>
      </g>
      <line x1={30} y1={104} x2={215} y2={104} stroke="#94a3b8" />
    </svg>
  )
}

export default function DogHouseBuilder() {
  const [s, set, reset] = useToolState('dog-house-builder', DEF)
  const k = s.unit === 'cm' ? 2.54 : 1
  const L = (x: number, d = 1) => `${num(x * k, d)}${s.unit === 'cm' ? ' cm' : '″'}`
  const m = design(s.dog, s)
  const { panels, sticks } = cutList(m, s)
  const ply = panels.filter((p) => !p.name.startsWith('Foam'))
  const sheets = packSheets([{ id: 's', name: '4×8 sheet', w: 96, h: 48, qty: 20 }], ply.map((p, i) => ({ id: String(i), name: p.name, w: Math.max(p.w, p.h), h: Math.min(p.w, p.h), qty: p.qty, rotate: true })), 0.125)
  const lumber = packSticks(sticks.map((c) => ({ label: c.name, len: c.len, qty: c.qty })), [{ len: 96, price: s.stickPrice, qty: 0 }], 0.125)
  const cost = sheets.sheets.length * s.plyPrice + lumber.cost + 12 // + screws & glue
  const dogDim = (key: keyof Dog, lab: string, hint: string) => (
    <Num label={lab} value={Math.round(s.dog[key] * k * 10) / 10} unit={s.unit} min={2} hint={hint} onChange={(v) => v > 0 && set({ dog: { ...s.dog, [key]: v / k }, breed: '' })} />
  )

  const ref = useStage3D(
    (st: Stage3D) => {
      const g = new THREE.Group()
      g.name = 'house'
      st.scene.add(g)
      const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: 0x4d7c0f }))
      ground.rotation.x = -Math.PI / 2
      ground.position.y = -0.005
      st.scene.add(ground)
    },
    (st: Stage3D) => {
      const g = st.scene.getObjectByName('house')!
      st.clear(g)
      const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, side: THREE.DoubleSide })
      const box = (w: number, h: number, d: number, x: number, y: number, z: number, c = WOOD) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w * S, h * S, d * S), mat(c))
        b.position.set(x * S, y * S, z * S)
        g.add(b)
        return b
      }
      const W = m.outW, D = m.outD, H = m.inH, t = s.ply, base = s.raise + t
      const porch = m.porchD
      // skids & floor
      for (const x of [-W / 2 + 0.75, 0, W / 2 - 0.75]) box(1.5, s.raise, D + porch, x, s.raise / 2, porch / 2, DARK)
      box(W, t, D, 0, s.raise + t / 2, 0, 0xc49a6c)
      if (porch) box(W, t, porch, 0, s.raise + t / 2, D / 2 + porch / 2, 0xc49a6c)
      // front/back walls as extruded outlines
      const wall = (front: boolean) => {
        const h = s.roof === 'shed' && !front ? H : H + (s.roof === 'shed' ? m.rise : 0)
        const sh = new THREE.Shape()
        sh.moveTo(-W / 2, 0)
        sh.lineTo(W / 2, 0)
        sh.lineTo(W / 2, s.roof === 'gable' ? H : h)
        if (s.roof === 'gable') sh.lineTo(0, H + m.rise)
        sh.lineTo(-W / 2, s.roof === 'gable' ? H : h)
        sh.closePath()
        if (front) {
          const x0 = m.doorOffset - m.doorW / 2, x1 = m.doorOffset + m.doorW / 2, r = Math.min(m.doorW / 2, m.doorH / 3)
          const hole = new THREE.Path()
          hole.moveTo(x0, 0.01)
          hole.lineTo(x1, 0.01)
          hole.lineTo(x1, m.doorH - r)
          hole.absarc(m.doorOffset, m.doorH - r, m.doorW / 2, 0, Math.PI, false)
          hole.lineTo(x0, 0.01)
          sh.holes.push(hole)
        }
        const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false }), mat(WOOD))
        mesh.scale.set(S, S, S)
        mesh.position.set(0, base * S, (front ? D / 2 - t : -D / 2) * S)
        g.add(mesh)
      }
      wall(true)
      wall(false)
      // side walls
      for (const side of [-1, 1]) {
        if (s.roof === 'gable') box(t, H, D - 2 * t, side * (W / 2 - t / 2), base + H / 2, 0)
        else {
          const sh = new THREE.Shape([new THREE.Vector2(-(D / 2 - t), 0), new THREE.Vector2(D / 2 - t, 0), new THREE.Vector2(D / 2 - t, H + m.rise * (D - t) / D), new THREE.Vector2(-(D / 2 - t), H + m.rise * t / D)])
          const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false }), mat(WOOD))
          mesh.scale.set(S, S, S)
          mesh.rotation.y = -Math.PI / 2
          mesh.position.set((side > 0 ? W / 2 : -W / 2 + t) * S, base * S, 0)
          g.add(mesh)
        }
      }
      // roof
      const p = (s.pitch * Math.PI) / 180
      if (s.roof === 'gable') {
        const slope = W / 2 / Math.cos(p) + s.overhang
        const len = D + 2 * s.overhang + porch
        for (const side of [-1, 1]) {
          const cx = side * (Math.cos(p) * slope / 2) + side * Math.sin(p) * t / 2
          const cy = base + H + m.rise - Math.sin(p) * slope / 2 + Math.cos(p) * t / 2
          const r = box(slope, t, len, cx, cy, porch / 2, ROOF)
          r.rotation.z = -side * p
        }
      } else {
        const len = D / Math.cos(p) + 2 * s.overhang + porch
        const r = box(W + 2 * s.overhang, t, len, 0, base + H + m.rise / 2 + t / 2 + (porch / 2) * Math.tan(p), porch / 2, ROOF)
        r.rotation.x = -p
      }
      // dog for scale, standing beside the house facing the door
      const d = s.dog
      const dog = new THREE.Group()
      const fur = new THREE.MeshStandardMaterial({ color: 0xa0632d, roughness: 0.9 })
      const rr = d.chest * 0.55
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(rr * S, Math.max(0.1, d.length * 0.72 - 2 * rr) * S, 6, 12), fur)
      body.rotation.x = Math.PI / 2
      body.position.y = (d.withers - rr * 0.8) * S
      dog.add(body)
      const legH = d.withers - rr * 1.2
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(d.chest * 0.12 * S, d.chest * 0.1 * S, legH * S, 8), fur)
        leg.position.set(x * rr * 0.55 * S, (legH / 2) * S, z * d.length * 0.3 * S)
        dog.add(leg)
      }
      const headR = Math.max(2, d.chest * 0.45)
      const head = new THREE.Mesh(new THREE.SphereGeometry(headR * S, 16, 12), fur)
      head.position.set(0, (d.height - headR) * S, d.length * 0.42 * S)
      dog.add(head)
      const snout = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.55 * S, 12, 8), fur)
      snout.position.set(0, (d.height - headR * 1.25) * S, (d.length * 0.42 + headR * 0.9) * S)
      dog.add(snout)
      dog.position.set((W / 2 + s.overhang + d.chest + 8) * S, 0, (D / 4) * S)
      dog.rotation.y = -Math.PI / 2
      g.add(dog)
      const lb = label(`${L(m.inW, 0)} × ${L(m.inD, 0)} interior`, '#f8fafc', 0.35)
      lb.position.set(0, (base + H + m.rise + 8) * S, 0)
      g.add(lb)
      const span = Math.max(W, D + porch) * S
      st.camera.position.set(span * 1.2, span * 1.0, span * 2.1)
      st.controls.target.set(span * 0.3, (H / 2) * S, 0)
    },
    [m.outW, m.outD, m.inH, m.rise, m.doorW, m.doorH, m.doorOffset, m.porchD, s.roof, s.pitch, s.overhang, s.ply, s.raise, s.dog, s.unit],
    { camera: [5, 4, 6], background: '#bae6fd', grid: false },
  )

  return (
    <Split>
      <div>
        <Panel title="Your dog" actions={<Seg value={s.unit} onChange={(unit) => set({ unit })} options={[['in', 'in'], ['cm', 'cm']]} />}>
          <Select label="Breed preset" value={s.breed} onChange={(breed) => { const b = BREEDS.find((x) => x.name === breed); if (b) set({ breed, dog: b.dog }) }} options={[['', 'Custom measurements'], ...BREEDS.map((b) => [b.name, `${b.name} (~${b.weight} lb)`] as [string, string])]} />
          <DogDiagram />
          <Row>
            {dogDim('length', 'A · Length', 'nose to base of tail')}
            {dogDim('height', 'B · Height', 'floor to top of head')}
          </Row>
          <Row>
            {dogDim('withers', 'C · Shoulder', 'floor to withers')}
            {dogDim('chest', 'D · Chest width', 'widest point')}
          </Row>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>Measure your own dog standing — breed presets are averages and puppies keep growing.</p>
        </Panel>
        <Panel title="Design">
          <Seg value={s.climate} onChange={(climate) => set({ climate })} options={[['cold', '❄ Cold'], ['mild', '🌤 Mild'], ['hot', '☀ Hot']]} label="Climate" />
          <div style={{ height: 8 }} />
          <Seg value={s.roof} onChange={(roof) => set({ roof, pitch: roof === 'shed' ? 12 : 30 })} options={[['gable', 'Gable roof'], ['shed', 'Shed (lean-to) roof']]} label="Roof" />
          <Slider label="Roof pitch" value={s.pitch} min={s.roof === 'shed' ? 5 : 15} max={s.roof === 'shed' ? 25 : 45} unit="°" onChange={(pitch) => set({ pitch })} />
          <Row>
            <Num label="Roof overhang" value={Math.round(s.overhang * k * 10) / 10} unit={s.unit} min={0} onChange={(v) => v >= 0 && set({ overhang: v / k })} />
            <Num label="Floor raised" value={Math.round(s.raise * k * 10) / 10} unit={s.unit} min={0} onChange={(v) => v >= 0 && set({ raise: v / k })} />
          </Row>
          <Select label="Plywood" value={s.ply} onChange={(ply) => set({ ply })} options={[[0.5, '½″ (12 mm)'], [0.625, '⅝″ (15 mm)'], [0.75, '¾″ (18 mm)']]} />
          <Check label="Covered porch in front of the door" value={s.porch} onChange={(porch) => set({ porch })} />
          <Row>
            <Num label="Plywood sheet price" value={s.plyPrice} unit="$" min={0} onChange={(plyPrice) => set({ plyPrice })} />
            <Num label="8 ft stick price" value={s.stickPrice} unit="$" min={0} onChange={(stickPrice) => set({ stickPrice })} />
          </Row>
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Interior (W × D × H)" value={`${L(m.inW, 0)} × ${L(m.inD, 0)} × ${L(m.inH, 0)}`} sub={`footprint ${L(m.outW, 0)} × ${L(m.outD + m.porchD, 0)}`} tone="accent" />
          <Stat label="Door (W × H)" value={`${L(m.doorW)} × ${L(m.doorH)}`} sub={m.doorOffset ? `offset ${L(m.doorOffset)} from centre` : 'centred'} />
          <Stat label="Materials" value={`${sheets.sheets.length} sheet${sheets.sheets.length > 1 ? 's' : ''}`} sub={`4×8 ply (${num(plyArea(panels), 1)} ft² used) · ${lumber.boards.length} × 8 ft sticks`} />
          <Stat label="Estimated cost" value={money(cost, '$', 0)} sub="incl. ~$12 screws, glue" />
        </Stats>
        <Panel title="3D preview">
          <View3D refEl={ref} height={360} />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Drag to orbit. The dog is drawn to scale from your measurements.</p>
        </Panel>
        <Panel title="Cut list" actions={<CsvButton name="dog-house-cut-list.csv" rows={() => [['Part', 'Qty', `Width (${s.unit})`, `Height/length (${s.unit})`, 'Note'], ...panels.map((p) => [p.name, p.qty, +(p.w * k).toFixed(1), +(p.h * k).toFixed(1), p.note ?? '']), ...sticks.map((c) => [c.name, c.qty, '', +(c.len * k).toFixed(1), ''])]} />}>
          <Table
            head={['Part', 'Qty', 'Size', 'Note']}
            rows={[
              ...panels.map((p) => [<b key="n">{p.name}</b>, p.qty, `${L(p.w)} × ${L(p.h)}`, <span key="o" className="muted">{p.note ?? ''}</span>]),
              ...sticks.map((c) => [c.name, c.qty, L(c.len), '']),
            ]}
          />
        </Panel>
        <Panel title="Plywood sheet layout (4 × 8 ft)">
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {sheets.sheets.map((sh, i) => (
              <svg key={i} viewBox={`-1 -1 ${sh.w + 2} ${sh.h + 2}`} width="100%" style={{ background: '#f5e6cf', borderRadius: 6 }}>
                <rect x={0} y={0} width={sh.w} height={sh.h} fill="none" stroke="#92400e" strokeWidth={0.4} />
                {sh.parts.map((p, j) => (
                  <g key={j}>
                    <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={`hsl(${(j * 57) % 360} 55% 70%)`} stroke="#78350f" strokeWidth={0.3} />
                    <text x={p.x + p.w / 2} y={p.y + p.h / 2} textAnchor="middle" fontSize={Math.min(4, p.w / 9)} fill="#1c1917">{p.name}</text>
                    <text x={p.x + p.w / 2} y={p.y + p.h / 2 + 4} textAnchor="middle" fontSize={Math.min(3, p.w / 12)} fill="#44403c">{num(p.w * k, 1)}×{num(p.h * k, 1)}</text>
                  </g>
                ))}
              </svg>
            ))}
          </div>
          {sheets.unplaced.length > 0 && <Note tone="warn">{sheets.unplaced.length} part(s) are larger than a 4×8 sheet — join two pieces over a cleat.</Note>}
        </Panel>
        <Note>
          {s.climate === 'cold' && 'Cold climate: the house is kept snug (body heat warms it), the door is offset so the dog can curl up out of the draught — add a flexible door flap, line walls with rigid foam and use straw (not blankets) as bedding. '}
          {s.climate === 'hot' && 'Hot climate: extra headroom and an overhang for shade; drill vent holes high on the side walls under the eaves and place the house in shade. '}
          {s.climate === 'mild' && 'Mild climate: standard proportions. Add vent holes under the eaves and keep the floor off the ground. '}
          Seal plywood edges and use exterior-grade, non-toxic finishes. Sizes follow common rules of thumb (interior ≈ 1.25× dog length, door ≈ ¾ shoulder height) — adjust to your dog.
        </Note>
      </div>
    </Split>
  )
}
