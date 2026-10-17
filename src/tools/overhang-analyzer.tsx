import { useMemo, useState } from 'react'
import { Btn, Check, FileDrop, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Bar, download, num, pct, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { analyze, autoOrient, samplePawn, sampleBridge, transform } from './lib/overhang-analyzer'
import { parseStl, sampleTorus, toBinaryStl } from './lib/stl-viewer'
import { parseObj } from './lib/mesh-repair-checker'

type SampleId = 'pawn' | 'bridge' | 'torus' | 'knot'
const SAMPLES: [SampleId, string][] = [['pawn', 'Pawn'], ['bridge', 'Bridge'], ['torus', 'Torus'], ['knot', 'Torus knot']]

function sample(id: SampleId): Float32Array {
  if (id === 'pawn') return samplePawn()
  if (id === 'bridge') return sampleBridge()
  if (id === 'torus') return sampleTorus(22, 8, 72, 36)
  const g = new THREE.TorusKnotGeometry(16, 5, 220, 24).toNonIndexed()
  const p = (g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
  g.dispose()
  return new Float32Array(p)
}

const DEF = { sample: 'pawn' as SampleId, rx: 0, ry: 0, rz: 0, threshold: 45, mode: 'class' as 'class' | 'heat', pillars: true, density: 1.0 }

const COL = [new THREE.Color('#94a3b8'), new THREE.Color('#facc15'), new THREE.Color('#ef4444'), new THREE.Color('#3b82f6')]

export default function OverhangAnalyzer() {
  const [s, set, reset] = useToolState('overhang-analyzer', DEF)
  const [file, setFile] = useState<{ name: string; pos: Float32Array } | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const base = useMemo(() => file?.pos ?? sample(s.sample), [file, s.sample])
  const pos = useMemo(() => transform(base, s.rx, s.ry, s.rz), [base, s.rx, s.ry, s.rz])
  const a = useMemo(() => analyze(pos, s.threshold), [pos, s.threshold])
  const faces = pos.length / 9
  const supportG = (a.supportVolume / 1000) * 1.24 * 0.15 * s.density // cm³ × PLA density × ~15 % infill-like support

  const ref = useStage3D(
    (stage) => {
      const root = new THREE.Group()
      root.name = 'root'
      stage.scene.add(root)
      const under = new THREE.DirectionalLight(0xffffff, 1.1)
      under.position.set(-3, -8, 4)
      stage.scene.add(under)
    },
    (stage) => {
      const root = stage.scene.getObjectByName('root') as THREE.Group
      stage.clear(root)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      const colors = new Float32Array(pos.length)
      const c = new THREE.Color()
      for (let f = 0; f < faces; f++) {
        if (s.mode === 'class') c.copy(COL[a.cls[f]])
        else {
          const t = Math.max(0, Math.min(1, a.alpha[f] / 90))
          c.setHSL(0.62 * (1 - t), 0.85, 0.55)
          if (a.cls[f] === 3) c.copy(COL[3])
        }
        for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], f * 9 + k * 3)
      }
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      g.computeVertexNormals()
      const sc = 8 / (Math.max(...a.size) || 1)
      const holder = new THREE.Group()
      holder.rotation.x = -Math.PI / 2
      holder.scale.setScalar(sc)
      holder.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, flatShading: true, side: THREE.DoubleSide })))
      if (s.pillars) {
        const pts: number[] = []
        const want = 450
        const cand: number[] = []
        for (let f = 0; f < faces; f++) if (a.cls[f] === 2) cand.push(f)
        const step = Math.max(1, Math.ceil(cand.length / want))
        for (let i = 0; i < cand.length; i += step) {
          const o = cand[i] * 9
          const x = (pos[o] + pos[o + 3] + pos[o + 6]) / 3, y = (pos[o + 1] + pos[o + 4] + pos[o + 7]) / 3, z = (pos[o + 2] + pos[o + 5] + pos[o + 8]) / 3
          pts.push(x, y, z, x, y, 0)
        }
        const lg = new THREE.BufferGeometry()
        lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
        holder.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#f87171', transparent: true, opacity: 0.45 })))
      }
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(a.size[0] * 1.3 + 4, a.size[1] * 1.3 + 4), new THREE.MeshBasicMaterial({ color: '#334155', transparent: true, opacity: 0.55, side: THREE.DoubleSide }))
      plate.position.z = -0.02
      holder.add(plate)
      root.add(holder)
    },
    [pos, a, s.mode, s.pillars],
    { camera: [10, 2.2, 10], target: [0, 3.2, 0] },
  )

  const load = async (f: File) => {
    setErr('')
    try {
      const pos = /\.obj$/i.test(f.name) ? parseObj(await f.text()) : parseStl(await f.arrayBuffer()).pos
      setFile({ name: f.name, pos })
      set({ rx: 0, ry: 0, rz: 0 })
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const auto = () => {
    setBusy(true)
    setTimeout(() => {
      const [rx, ry] = autoOrient(base, s.threshold)
      set({ rx, ry, rz: 0 })
      setBusy(false)
    }, 20)
  }
  const share = a.area ? a.overhangArea / a.area : 0

  return (
    <Split wide="right">
      <div>
        <Panel title="Model" actions={<Btn kind="ghost" onClick={() => { reset(); setFile(null) }}>Reset</Btn>}>
          <FileDrop accept=".stl,.obj" onFiles={([f]) => void load(f)} label="Drop an STL or OBJ file" />
          {err && <Note tone="err">{err}</Note>}
          <p className="muted" style={{ fontSize: 13 }}>{file ? `${file.name} · ${faces.toLocaleString('en-US')} triangles` : 'Or try a sample:'}</p>
          <Seg value={file ? ('' as SampleId) : s.sample} onChange={(sample) => { setFile(null); set({ sample, rx: 0, ry: 0, rz: 0 }) }} options={SAMPLES} />
        </Panel>
        <Panel title="Orientation">
          <Slider label="Rotate X" value={s.rx} min={0} max={345} step={15} unit="°" onChange={(rx) => set({ rx })} />
          <Slider label="Rotate Y" value={s.ry} min={0} max={345} step={15} unit="°" onChange={(ry) => set({ ry })} />
          <Slider label="Rotate Z" value={s.rz} min={0} max={345} step={15} unit="°" onChange={(rz) => set({ rz })} />
          <Row>
            <Btn kind="primary" onClick={auto} disabled={busy}>{busy ? 'Searching…' : '✨ Auto-orient'}</Btn>
            <Btn onClick={() => set({ rx: (s.rx + 180) % 360 })}>Flip</Btn>
            <Btn onClick={() => download(`oriented-${file?.name.replace(/\.\w+$/, '') ?? s.sample}.stl`, new Blob([toBinaryStl(pos, 'oriented')]), 'model/stl')}>⬇ Oriented STL</Btn>
          </Row>
        </Panel>
        <Panel title="Printer settings">
          <Slider label="Overhang threshold" value={s.threshold} min={20} max={80} step={1} unit="° from vertical" onChange={(threshold) => set({ threshold })} />
          <Row>
            {[[35, 'Resin / fine'], [45, 'FDM default'], [55, 'Good cooling'], [65, 'Bridging-friendly']].map(([v, l]) => (
              <Btn key={v} kind={s.threshold === v ? 'primary' : 'normal'} onClick={() => set({ threshold: v as number })}>{l} {v}°</Btn>
            ))}
          </Row>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['class', 'Support zones'], ['heat', 'Angle heat-map']]} />
          <Check label="Show support pillars" value={s.pillars} onChange={(pillars) => set({ pillars })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Overhang area" value={`${num(a.overhangArea / 100, 1)} cm²`} sub={`${pct(share)} of surface`} tone={share > 0.1 ? 'bad' : 'good'} />
          <Stat label="Support footprint" value={`${num(a.shadow / 100, 1)} cm²`} sub="projected on bed" />
          <Stat label="Support volume" value={`${num(a.supportVolume / 1000, 1)} cm³`} sub={`≈ ${num(supportG, 1)} g PLA at 15% density`} />
          <Stat label="Bed contact" value={`${num(a.bedArea / 100, 1)} cm²`} sub={`${num(a.size[0], 0)}×${num(a.size[1], 0)}×${num(a.size[2], 0)} mm`} tone={a.bedArea < 50 ? 'bad' : undefined} />
        </Stats>
        <Panel title="Preview">
          <View3D refEl={ref} height={470} />
          <div className="k-legend" style={{ marginTop: 8 }}>
            {s.mode === 'class' ? (
              <>
                <span><i style={{ background: '#94a3b8' }} />Self-supporting</span>
                <span><i style={{ background: '#facc15' }} />Within 10° of limit</span>
                <span><i style={{ background: '#ef4444' }} />Needs support</span>
                <span><i style={{ background: '#3b82f6' }} />On the bed</span>
              </>
            ) : (
              <span>Blue = vertical or facing up → green 30° → yellow 60° → red = flat ceiling (90°)</span>
            )}
          </div>
        </Panel>
        <Panel title="Faces by overhang angle">
          {[[-90, 0, 'Facing up / vertical'], [0, s.threshold - 10, 'Mild overhang'], [s.threshold - 10, s.threshold, 'Near limit'], [s.threshold, 89, 'Needs support'], [89, 91, 'Flat ceilings & bed']].map(([lo, hi, l]) => {
            let ar = 0
            for (let f = 0; f < faces; f++) if (a.alpha[f] > (lo as number) && a.alpha[f] <= (hi as number)) {
              const o = f * 9
              const ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2], vx = pos[o + 6] - pos[o], vy = pos[o + 7] - pos[o + 1], vz = pos[o + 8] - pos[o + 2]
              ar += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2
            }
            return (
              <div key={l as string} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 70px', gap: 10, alignItems: 'center', marginBottom: 6 }}>
                <span>{l}</span>
                <Bar value={ar} max={a.area} />
                <span className="muted" style={{ textAlign: 'right' }}>{pct(ar / (a.area || 1))}</span>
              </div>
            )
          })}
          <Note>
            A face needs support when it leans more than the threshold away from vertical (normal pointing down), except where it rests on the bed. Support volume is estimated as the overhang's projected area × its height
            above the bed, so it is an upper bound when parts of the model lie below. Auto-orient tests X/Y rotations in 15° steps and minimises that volume.
          </Note>
        </Panel>
      </div>
    </Split>
  )
}
