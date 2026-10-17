import { useMemo } from 'react'
import { Btn, Check, CsvButton, download, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { buildParts, cutList, DADO, TENON, totals, type Joint, type Kind, type Params } from './lib/furniture-project-modeler'

const MATERIALS: { name: string; color: string; t: number; panel: number; solid: number }[] = [
  { name: 'Birch plywood', color: '#e3c99a', t: 18, panel: 38, solid: 9 },
  { name: 'MDF (painted)', color: '#d6d3cd', t: 18, panel: 14, solid: 5 },
  { name: 'Pine', color: '#e9c27d', t: 20, panel: 30, solid: 4.5 },
  { name: 'White oak', color: '#b98b55', t: 22, panel: 95, solid: 14 },
  { name: 'Walnut', color: '#6b4630', t: 22, panel: 140, solid: 19 },
]
const JOINTS: Record<Kind, [Joint, string][]> = {
  shelf: [['butt', 'Butt joint + screws'], ['dowel', 'Dowels'], ['dado', `Dados (⅓ t deep)`], ['rabbet', 'Dados + rabbeted back']],
  table: [['mortise', `Mortise & tenon (${TENON} mm)`], ['dowel', 'Dowels'], ['butt', 'Pocket screws']],
  box: [['butt', 'Butt joint'], ['rabbet', 'Rabbet / groove bottom'], ['dowel', 'Dowels']],
}
const PRESETS: { name: string; p: Params }[] = [
  { name: 'Bookshelf', p: { kind: 'shelf', w: 800, h: 1800, d: 300, t: 18, shelves: 4, back: true, doors: 0, legs: 60, top: 30, apron: 90, overhang: 30, joint: 'dado' } },
  { name: 'Wall cabinet', p: { kind: 'shelf', w: 900, h: 720, d: 340, t: 18, shelves: 1, back: true, doors: 2, legs: 60, top: 30, apron: 90, overhang: 30, joint: 'rabbet' } },
  { name: 'Dining table', p: { kind: 'table', w: 1600, h: 750, d: 900, t: 18, shelves: 0, back: false, doors: 0, legs: 70, top: 32, apron: 100, overhang: 40, joint: 'mortise' } },
  { name: 'Desk', p: { kind: 'table', w: 1200, h: 740, d: 600, t: 18, shelves: 0, back: false, doors: 0, legs: 50, top: 25, apron: 80, overhang: 25, joint: 'dowel' } },
  { name: 'Bench', p: { kind: 'table', w: 1100, h: 450, d: 350, t: 18, shelves: 0, back: false, doors: 0, legs: 55, top: 35, apron: 70, overhang: 30, joint: 'mortise' } },
  { name: 'Storage box', p: { kind: 'box', w: 500, h: 300, d: 350, t: 15, shelves: 0, back: true, doors: 0, legs: 60, top: 30, apron: 90, overhang: 30, joint: 'rabbet' } },
]
const DEF = { ...PRESETS[0].p, preset: 0, mat: 0, explode: 0, inch: false, edges: true, price: true }
const SCALE = 1 / 200 // mm → scene units

export default function FurnitureProjectModeler() {
  const [s, set, reset] = useToolState('furniture-project-modeler', DEF)
  const mat = MATERIALS[s.mat] ?? MATERIALS[0]
  const params: Params = s
  const parts = useMemo(() => buildParts(params), [params])
  const rows = useMemo(() => cutList(parts), [parts])
  const tot = totals(rows)
  const u = s.inch ? 'in' : 'mm'
  const len = (mm: number) => (s.inch ? (mm / 25.4).toFixed(2) : String(Math.round(mm * 10) / 10))
  const panelArea = rows.filter((r) => r.role !== 'solid').reduce((a, r) => a + (r.length * r.width * r.qty) / 1e6, 0)
  const solidBf = rows.filter((r) => r.role === 'solid').reduce((a, r) => a + ((r.length / 25.4) * (r.width / 25.4) * (r.thick / 25.4) * r.qty) / 144, 0)
  const backArea = rows.filter((r) => r.role === 'back').reduce((a, r) => a + (r.length * r.width * r.qty) / 1e6, 0)
  const cost = (panelArea - backArea) * mat.panel * 1.15 + backArea * 8 + solidBf * mat.solid * 1.2
  const sheets = Math.ceil(((panelArea - backArea) * 1.15) / (2.44 * 1.22))
  const joints = JOINTS[s.kind]
  const jointOk = joints.some(([j]) => j === s.joint)

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group(); g.name = 'parts'; st.scene.add(g)
      st.scene.background = new THREE.Color('#1e293b')
    },
    (st) => {
      const g = st.scene.getObjectByName('parts') as THREE.Group
      st.clear(g)
      const base = new THREE.Color(mat.color)
      const maxDim = Math.max(s.w, s.h, s.d)
      parts.forEach((p, i) => {
        const geo = new THREE.BoxGeometry(...p.size.map((v) => v * SCALE) as [number, number, number])
        const c = p.role === 'back' ? new THREE.Color('#8b6f4e') : base.clone().offsetHSL(0, 0, ((i * 37) % 9 - 4) / 100)
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }))
        const k = s.explode * maxDim * 0.25 * SCALE
        m.position.set(p.pos[0] * SCALE + p.dir[0] * k, p.pos[1] * SCALE + p.dir[1] * k + Math.max(0, s.explode) * 0.2, p.pos[2] * SCALE + p.dir[2] * k)
        g.add(m)
        if (s.edges) {
          const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: '#1f2937', transparent: true, opacity: 0.6 }))
          e.position.copy(m.position)
          g.add(e)
        }
      })
      const fitKey = `${s.w}|${s.h}|${s.d}`
      if (g.userData.fit !== fitKey) {
        g.userData.fit = fitKey
        const r = Math.hypot(s.w, s.h, s.d) * SCALE
        st.controls.target.set(0, (s.h * SCALE) / 2, 0)
        st.camera.position.set(r * 0.75, (s.h * SCALE) / 2 + r * 0.55, r * 1.05)
      }
    },
    [parts, s.explode, s.mat, s.edges],
    { camera: [7, 7, 9], target: [0, 4, 0] },
  )

  const pick = (i: number) => set({ ...PRESETS[i].p, preset: i, explode: 0, mat: PRESETS[i].p.kind === 'table' ? 3 : PRESETS[i].p.kind === 'box' ? 2 : 0 })
  const pngOut = () => { const c = ref.current?.querySelector('canvas'); c?.toBlob((b) => b && download('furniture.png', b, 'image/png')) }
  const csv = () => [['Part', 'Qty', `Length ${u}`, `Width ${u}`, `Thickness ${u}`, 'Material'], ...rows.map((r) => [r.name, r.qty, len(r.length), len(r.width), len(r.thick), r.role === 'back' ? `Hardboard ${len(6)} ${u}` : mat.name])]
  const dim = (label: string, key: 'w' | 'h' | 'd' | 't' | 'legs' | 'top' | 'apron' | 'overhang', min: number) => (
    <Num label={label} value={s.inch ? Math.round((s[key] / 25.4) * 100) / 100 : s[key]} unit={u} min={s.inch ? min / 25.4 : min} onChange={(v) => set({ [key]: Math.max(min, s.inch ? v * 25.4 : v) } as Partial<typeof s>)} />
  )

  return (
    <div>
      <Stats>
        <Stat label="Parts" value={parts.length} sub={`${rows.length} unique sizes`} />
        <Stat label="Sheet goods" value={`${panelArea.toFixed(2)} m²`} sub={sheets ? `≈ ${sheets} sheet${sheets > 1 ? 's' : ''} 2440×1220 (+15% waste)` : 'none'} />
        <Stat label="Solid lumber" value={`${solidBf.toFixed(1)} bd ft`} sub={`${(tot.vol * 1000).toFixed(1)} L of wood total`} />
        <Stat label="Material estimate" value={`$${Math.round(cost)}`} tone="accent" sub={mat.name} />
      </Stats>
      <Split wide="right">
        <div>
          <Panel title="Project" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {PRESETS.map((p, i) => <Btn key={p.name} kind={s.preset === i ? 'primary' : 'normal'} onClick={() => pick(i)}>{p.name}</Btn>)}
            </div>
            <Seg value={s.inch ? 'in' : 'mm'} onChange={(v) => set({ inch: v === 'in' })} options={[['mm', 'Millimetres'], ['in', 'Inches']]} />
            <Row>
              {dim(s.kind === 'table' ? 'Length' : 'Width', 'w', 100)}
              {dim('Height', 'h', 100)}
              {dim('Depth', 'd', 80)}
            </Row>
            {s.kind !== 'table' ? (
              <>
                <Row>{dim('Board thickness', 't', 6)}</Row>
                {s.kind === 'shelf' && <Row>
                  <Num label="Shelves" value={s.shelves} min={0} max={12} step={1} onChange={(v) => set({ shelves: Math.max(0, Math.min(12, Math.round(v))) })} />
                  <Num label="Doors" value={s.doors} min={0} max={4} step={1} onChange={(v) => set({ doors: Math.max(0, Math.min(4, Math.round(v))) })} />
                </Row>}
                <Check label={s.kind === 'box' ? 'Thin 6 mm bottom in a groove' : 'Back panel (6 mm hardboard)'} value={s.back} onChange={(back) => set({ back })} />
              </>
            ) : (
              <Row>
                {dim('Leg section', 'legs', 25)}
                {dim('Top thickness', 'top', 12)}
                {dim('Apron height', 'apron', 40)}
                {dim('Top overhang', 'overhang', 0)}
              </Row>
            )}
            <Select label="Joinery" value={jointOk ? s.joint : joints[0][0]} onChange={(joint) => set({ joint })} options={joints} />
            <Note>
              {s.joint === 'dado' || s.joint === 'rabbet' ? `Horizontal parts are cut ${2 * DADO(s.t)} mm longer to sit in ${DADO(s.t)} mm-deep grooves.` :
                s.joint === 'mortise' ? `Aprons are cut ${2 * TENON} mm longer for ${TENON} mm tenons; mortises go ⅓ of the leg width.` :
                  s.joint === 'dowel' ? 'Parts are cut to finished size; use 8 mm dowels every ~150 mm.' : 'Parts are cut to finished size; pre-drill and countersink screws.'}
            </Note>
            <Select label="Material" value={s.mat} onChange={(m) => set({ mat: m, t: s.kind === 'table' ? s.t : MATERIALS[m].t })} options={MATERIALS.map((m, i) => [i, `${m.name} — $${m.panel}/m², $${m.solid}/bd ft`] as [number, string])} />
          </Panel>
        </div>
        <div>
          <Panel title="3D model" actions={<><Check label="Edges" value={s.edges} onChange={(edges) => set({ edges })} /><Btn onClick={pngOut}>⬇ PNG</Btn></>}>
            <View3D refEl={ref} height={440} />
            <Slider label="Exploded view" value={s.explode} min={0} max={1} step={0.01} onChange={(explode) => set({ explode })} show={(v) => `${Math.round(v * 100)}%`} />
          </Panel>
          <Panel title="Cut list" actions={<CsvButton name="cut-list.csv" rows={csv} />}>
            <Table head={['Part', 'Qty', `Length (${u})`, `Width (${u})`, `Thick (${u})`, 'Stock']} rows={rows.map((r) => [<b key="n">{r.name}</b>, r.qty, len(r.length), len(r.width), len(r.thick), r.role === 'back' ? 'Hardboard' : r.role === 'solid' ? `${mat.name} (solid)` : mat.name])}
              foot={['Total', rows.reduce((a, r) => a + r.qty, 0), '', '', '', `${tot.area.toFixed(2)} m² faces`]} />
            <p className="muted" style={{ fontSize: 12 }}>Length follows the grain (longest side). Edge banding for visible front edges ≈ {tot.edge.toFixed(1)} m. Prices are rough placeholders — adjust to your supplier.</p>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
