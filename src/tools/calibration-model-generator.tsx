import { useMemo } from 'react'
import { Btn, CopyButton, download, fmt, Note, Num, Panel, Row, Select, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { bounds, bridgeTest, calibrationCube, overhangTest, retractionTower, temperatureTower, type Model } from './lib/calibration-model-generator'
import { toBinaryStl } from './lib/stl-viewer'

type Kind = 'temp' | 'cube' | 'retract' | 'overhang' | 'bridge'
const KINDS: [Kind, string][] = [['temp', '🌡️ Temperature tower'], ['retract', '🧵 Retraction tower'], ['cube', '📐 XYZ calibration cube'], ['overhang', '📐 Overhang test'], ['bridge', '🌉 Bridging test']]
const MATS: Record<string, [number, number, number]> = { 'PLA': [220, 190, 5], 'PETG': [250, 220, 5], 'ABS / ASA': [260, 230, 5], 'TPU': [235, 210, 5] }

const DEF = {
  kind: 'temp' as Kind,
  start: 220, end: 190, step: 5, segH: 10,
  rSeg: 6, rStart: 0.5, rStep: 0.5, rH: 8, rSpacing: 40,
  cube: 20,
  oFrom: 20, oTo: 70, oStep: 10, oLen: 10,
  bridges: '10 20 30 40 50', bH: 8,
  color: '#f97316',
}

function build(s: typeof DEF): Model {
  switch (s.kind) {
    case 'cube': return calibrationCube(s.cube)
    case 'retract': return retractionTower({ segments: s.rSeg, start: s.rStart, step: s.rStep, segH: s.rH, spacing: s.rSpacing })
    case 'overhang': return overhangTest({ from: s.oFrom, to: s.oTo, step: s.oStep, len: s.oLen })
    case 'bridge': return bridgeTest(s.bridges.split(/[\s,;]+/).map(Number).filter((x) => x > 0 && x <= 150), Math.max(2, s.bH))
    default: return temperatureTower({ start: s.start, end: s.end, step: s.step, segH: s.segH })
  }
}

export default function CalibrationModelGenerator() {
  const [s, set, reset] = useToolState('calibration-model-generator', DEF)
  const model = useMemo(() => build(s), [s])
  const bb = useMemo(() => bounds(model.pos), [model])
  const size = [0, 1, 2].map((k) => bb.max[k] - bb.min[k])
  const tris = model.pos.length / 9

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'root'
      g.rotation.x = -Math.PI / 2 // STL is Z-up
      st.scene.add(g)
    },
    (st) => {
      const root = st.scene.getObjectByName('root') as THREE.Group
      st.clear(root)
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(model.pos, 3))
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.55, metalness: 0.05 }))
      const k = 8 / Math.max(...size, 1)
      root.scale.setScalar(k)
      mesh.position.set(-(bb.min[0] + bb.max[0]) / 2, -(bb.min[1] + bb.max[1]) / 2, -bb.min[2])
      root.add(mesh)
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: '#0f172a', transparent: true, opacity: 0.35 }))
      edges.position.copy(mesh.position)
      root.add(edges)
      st.controls.target.set(0, (size[2] * k) / 2, 0)
    },
    [model, s.color],
    { camera: [9, 8, 11] },
  )

  const gcodeTable = model.notes.map((n) => n.text).join('\n')
  const temps = s.kind === 'temp' ? model.notes.map((n, i) => ({ z: n.z, t: s.start + i * Math.max(1, Math.abs(s.step)) * (s.end < s.start ? -1 : 1) })) : []
  const prusa = temps.length > 1 ? `; PrusaSlicer / OrcaSlicer → Printer Settings → Custom G-code → "Before layer change":\n${temps.slice(1).map((t, i) => `{if layer_z > ${t.z.toFixed(2)} and layer_z <= ${(temps[i + 2]?.z ?? 9999).toFixed(2)}}M104 S${t.t}{endif}`).join('\n')}\n; (or right-click the layer slider at each Z and add a custom G-code M104 S…)` : ''
  const retr = s.kind === 'retract' ? `; Cura: Extensions → Post Processing → "ChangeAtZ" (one entry per step)\n${model.notes.slice(1).map((n, i) => `; ${n.text}  →  ChangeAtZ: height ${(1 + (i + 1) * s.rH).toFixed(1)} mm, retraction length ${(s.rStart + (i + 1) * s.rStep).toFixed(2)}`).join('\n')}` : ''

  return (
    <Split>
      <div>
        <Panel title="Model" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Calibration print" value={s.kind} onChange={(kind) => set({ kind })} options={KINDS} />
          {s.kind === 'temp' && (
            <>
              <Row>
                {Object.entries(MATS).map(([n, [a, b, c]]) => <Btn key={n} kind="ghost" onClick={() => set({ start: a, end: b, step: c })}>{n}</Btn>)}
              </Row>
              <Row>
                <Num label="Bottom temp" value={s.start} onChange={(start) => set({ start })} unit="°C" min={150} max={320} />
                <Num label="Top temp" value={s.end} onChange={(end) => set({ end })} unit="°C" min={150} max={320} />
              </Row>
              <Row>
                <Num label="Step" value={s.step} onChange={(step) => set({ step })} unit="°C" min={1} />
                <Num label="Segment height" value={s.segH} onChange={(segH) => set({ segH })} unit="mm" min={6} max={30} />
              </Row>
              <Note>Each segment: 14 mm bridge, 45° overhang, a stringing cone and its temperature embossed on the front.</Note>
            </>
          )}
          {s.kind === 'retract' && (
            <>
              <Row>
                <Num label="Segments" value={s.rSeg} onChange={(rSeg) => set({ rSeg })} min={1} max={20} step={1} />
                <Num label="Segment height" value={s.rH} onChange={(rH) => set({ rH })} unit="mm" min={3} />
              </Row>
              <Row>
                <Num label="First retraction" value={s.rStart} onChange={(rStart) => set({ rStart })} unit="mm" min={0} />
                <Num label="Increase per step" value={s.rStep} onChange={(rStep) => set({ rStep })} unit="mm" />
              </Row>
              <Num label="Tower spacing" value={s.rSpacing} onChange={(rSpacing) => set({ rSpacing })} unit="mm" min={15} />
              <Note>Direct drive: try 0.2–2 mm in 0.2 mm steps. Bowden: 2–7 mm in 0.5–1 mm steps. Rings mark each step.</Note>
            </>
          )}
          {s.kind === 'cube' && <Num label="Cube size" value={s.cube} onChange={(cube) => set({ cube })} unit="mm" min={5} max={100} />}
          {s.kind === 'overhang' && (
            <>
              <Row>
                <Num label="From" value={s.oFrom} onChange={(oFrom) => set({ oFrom })} unit="°" min={0} max={85} />
                <Num label="To" value={s.oTo} onChange={(oTo) => set({ oTo })} unit="°" min={0} max={85} />
              </Row>
              <Row>
                <Num label="Step" value={s.oStep} onChange={(oStep) => set({ oStep })} unit="°" min={1} />
                <Num label="Fin length" value={s.oLen} onChange={(oLen) => set({ oLen })} unit="mm" min={5} />
              </Row>
              <Note>Angles are measured from vertical. Most printers manage 45–55° without supports.</Note>
            </>
          )}
          {s.kind === 'bridge' && (
            <>
              <Txt label="Bridge lengths (mm)" value={s.bridges} onChange={(bridges) => set({ bridges })} />
              <Num label="Pillar height" value={s.bH} onChange={(bH) => set({ bH })} unit="mm" min={2} />
            </>
          )}
          <Row>
            <label className="k-field">
              <span className="k-label">Preview colour</span>
              <input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} />
            </label>
          </Row>
        </Panel>
        <Panel title={s.kind === 'temp' ? 'Temperature steps' : s.kind === 'retract' ? 'Retraction steps' : 'Notes'} actions={<CopyButton text={[gcodeTable, prusa, retr].filter(Boolean).join('\n\n')} />}>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {model.notes.map((n, i) => <li key={i}>{n.text}</li>)}
          </ol>
          {prusa && <pre className="mono" style={{ fontSize: 12, background: 'var(--bg)', padding: 8, borderRadius: 8, overflow: 'auto' }}>{prusa}</pre>}
          {retr && <pre className="mono" style={{ fontSize: 12, background: 'var(--bg)', padding: 8, borderRadius: 8, overflow: 'auto' }}>{retr}</pre>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Size (X × Y × Z)" value={`${fmt(size[0], 3)} × ${fmt(size[1], 3)} × ${fmt(size[2], 3)}`} sub="mm" />
          <Stat label="Triangles" value={tris.toLocaleString()} sub={`${fmt((84 + tris * 50) / 1024, 3)} KB binary STL`} />
          {s.kind === 'temp' && <Stat label="Segments" value={model.notes.length} sub={`${s.start} → ${s.start + (model.notes.length - 1) * Math.max(1, Math.abs(s.step)) * (s.end < s.start ? -1 : 1)} °C`} />}
        </Stats>
        <Panel title="Preview" actions={<Btn kind="primary" onClick={() => download(`${model.name}.stl`, new Blob([toBinaryStl(model.pos, model.name)], { type: 'model/stl' }))}>⬇ Download STL</Btn>}>
          <View3D refEl={ref} height={460} />
          <p className="muted">Units are millimetres, Z up, sitting on the bed. Overlapping parts are separate closed shells; every slicer merges them.</p>
        </Panel>
      </div>
    </Split>
  )
}
