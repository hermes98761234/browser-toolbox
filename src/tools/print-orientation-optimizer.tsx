import { useMemo, useState } from 'react'
import { Btn, CsvButton, download, FileDrop, fmt, niceTicks, Note, num, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { samplePawn, sampleBridge } from './lib/overhang-analyzer'
import { parseObj } from './lib/mesh-repair-checker'
import { applyRotation, distinct, rotationToUp, sampleBracket, search, type Candidate } from './lib/print-orientation-optimizer'
import { parseStl, toBinaryStl } from './lib/stl-viewer'

type SampleId = 'bracket' | 'pawn' | 'bridge' | 'knot'
const SAMPLES: [SampleId, string][] = [['bracket', 'L-bracket'], ['pawn', 'Pawn'], ['bridge', 'Bridge'], ['knot', 'Torus knot']]

function sample(id: SampleId): Float32Array {
  if (id === 'bracket') return sampleBracket()
  if (id === 'pawn') return samplePawn()
  if (id === 'bridge') return sampleBridge()
  const g = new THREE.TorusKnotGeometry(16, 5, 160, 20).toNonIndexed()
  const p = new Float32Array((g.getAttribute('position') as THREE.BufferAttribute).array)
  g.dispose()
  return p
}

const DEF = { sample: 'bracket' as SampleId, threshold: 45, samples: 400, wSupport: 6, wHeight: 2, wOverhang: 1, wBed: 1, layer: 0.2, sel: 0 }

/** Euler XYZ angles (deg) for R = Rz·Ry·Rx, the convention most slicers accept. */
function euler(m: number[]): [number, number, number] {
  const ry = -Math.asin(Math.max(-1, Math.min(1, m[6])))
  const rx = Math.atan2(m[7], m[8])
  const rz = Math.atan2(m[3], m[0])
  return [rx, ry, rz].map((v) => Math.round(((v * 180) / Math.PI) * 10) / 10 + 0) as [number, number, number]
}

function ScatterPlot({ all, top, sel, onPick }: { all: Candidate[]; top: Candidate[]; sel: Candidate | undefined; onPick: (c: Candidate) => void }) {
  const W = 420, H = 230, L = 50, R = 10, T = 10, B = 34
  const sx0 = 0, sx1 = Math.max(1, ...all.map((c) => c.support / 1000)) * 1.05
  const hy0 = Math.min(...all.map((c) => c.height)) * 0.95, hy1 = Math.max(...all.map((c) => c.height)) * 1.03
  const X = (v: number) => L + ((v - sx0) / (sx1 - sx0)) * (W - L - R)
  const Y = (v: number) => T + (1 - (v - hy0) / (hy1 - hy0 || 1)) * (H - T - B)
  const front = all.filter((c) => c.pareto).sort((a, b) => a.support - b.support)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="k-chart" style={{ width: '100%', height: 'auto' }} role="img" aria-label="support vs height">
      {niceTicks(hy0, hy1, 5).filter((v) => v >= hy0 && v <= hy1).map((v) => <g key={v}><line className="grid" x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} /><text x={L - 4} y={Y(v) + 3} fontSize={9} textAnchor="end">{fmt(v, 3)}</text></g>)}
      {niceTicks(sx0, sx1, 5).filter((v) => v <= sx1).map((v) => <text key={v} x={X(v)} y={H - B + 13} fontSize={9} textAnchor="middle">{fmt(v, 3)}</text>)}
      <text x={(L + W) / 2} y={H - 4} fontSize={10} textAnchor="middle" className="lbl">Support volume (cm³)</text>
      <text x={10} y={(H - B) / 2} fontSize={10} textAnchor="middle" className="lbl" transform={`rotate(-90 10 ${(H - B) / 2})`}>Height (mm)</text>
      {all.map((c, i) => <circle key={i} cx={X(c.support / 1000)} cy={Y(c.height)} r={2.2} fill="var(--muted)" opacity={0.35} />)}
      <polyline points={front.map((c) => `${X(c.support / 1000)},${Y(c.height)}`).join(' ')} fill="none" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 3" />
      {top.map((c, i) => (
        <g key={i} style={{ cursor: 'pointer' }} onClick={() => onPick(c)}>
          <circle cx={X(c.support / 1000)} cy={Y(c.height)} r={c === sel ? 7 : 5} fill={c === sel ? '#f59e0b' : '#6366f1'} stroke="#fff" strokeWidth={1} />
          <text x={X(c.support / 1000) + 8} y={Y(c.height) + 3} fontSize={10} fontWeight={700}>#{i + 1}</text>
        </g>
      ))}
    </svg>
  )
}

export default function PrintOrientationOptimizer() {
  const [s, set, reset] = useToolState('print-orientation-optimizer', DEF)
  const [file, setFile] = useState<{ name: string; pos: Float32Array } | null>(null)
  const [err, setErr] = useState('')
  const base = useMemo(() => file?.pos ?? sample(s.sample), [file, s.sample])
  const weights = useMemo(() => ({ support: s.wSupport, height: s.wHeight, overhang: s.wOverhang, bed: s.wBed }), [s.wSupport, s.wHeight, s.wOverhang, s.wBed])
  const all = useMemo(() => search(base, s.threshold, s.samples, weights), [base, s.threshold, s.samples, weights])
  const top = useMemo(() => distinct(all, 15).slice(0, 6), [all])
  const selIdx = Math.min(s.sel, top.length - 1)
  const sel = top[selIdx]
  const upright = all.find((c) => c.up[2] > 0.9999)
  const rotated = useMemo(() => (sel ? applyRotation(base, rotationToUp(sel.up)) : base), [base, sel])
  const eul = sel ? euler(rotationToUp(sel.up)) : [0, 0, 0]
  const faces = base.length / 9

  const ref = useStage3D(
    (st) => {
      const root = new THREE.Group()
      root.name = 'cands'
      st.scene.add(root)
      const ray = new THREE.Raycaster()
      const el = st.renderer.domElement
      const onClick = (e: MouseEvent) => {
        const r = el.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), st.camera)
        const h = ray.intersectObjects(root.children, true).find((x) => x.object.userData.idx !== undefined)
        if (h) root.userData.pick?.(h.object.userData.idx as number)
      }
      el.addEventListener('click', onClick)
      return () => el.removeEventListener('click', onClick)
    },
    (st) => {
      const root = st.scene.getObjectByName('cands') as THREE.Group
      st.clear(root)
      root.userData.pick = (i: number) => set({ sel: i })
      const show = upright && !top.slice(0, 3).includes(upright) ? [...top.slice(0, 3), upright] : top.slice(0, 4)
      const sinT = Math.sin((s.threshold * Math.PI) / 180)
      const size = Math.max(...show.map((c) => Math.max(c.height, ...c.footprint)), 1)
      const sc = 2.6 / size
      const gap = 3.4
      show.forEach((c, i) => {
        const isRef = c === upright && !top.slice(0, 3).includes(c)
        const p = applyRotation(base, rotationToUp(c.up))
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.BufferAttribute(p, 3))
        const col = new Float32Array(p.length)
        const gray = new THREE.Color('#cbd5e1'), red = new THREE.Color('#ef4444'), blue = new THREE.Color('#3b82f6')
        const pillars: number[] = []
        const nRed: number[] = []
        for (let f = 0; f < p.length / 9; f++) {
          const o = f * 9
          const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2]
          const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2]
          const nz = ux * vy - uy * vx
          const len = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, nz) || 1
          const zc = (p[o + 2] + p[o + 5] + p[o + 8]) / 3
          const k = nz / len < -sinT ? (zc <= 0.2 ? (nz / len < -0.996 ? blue : gray) : red) : gray
          for (let v = 0; v < 3; v++) col.set([k.r, k.g, k.b], o + v * 3)
          if (k === red) nRed.push(o)
        }
        // support columns: points spread over red faces in proportion to their area
        const triArea = (o: number) => Math.hypot((p[o + 4] - p[o + 1]) * (p[o + 8] - p[o + 2]) - (p[o + 5] - p[o + 2]) * (p[o + 7] - p[o + 1]), (p[o + 5] - p[o + 2]) * (p[o + 6] - p[o]) - (p[o + 3] - p[o]) * (p[o + 8] - p[o + 2]), (p[o + 3] - p[o]) * (p[o + 7] - p[o + 1]) - (p[o + 4] - p[o + 1]) * (p[o + 6] - p[o])) / 2
        const redArea = nRed.reduce((t, o) => t + triArea(o), 0)
        let seed = 12345
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
        for (const o of nRed) {
          const m = Math.max(nRed.length > 300 ? 0 : 1, Math.round((triArea(o) / (redArea || 1)) * 300))
          for (let q = 0; q < m; q++) {
            let a = rnd(), b = rnd()
            if (a + b > 1) [a, b] = [1 - a, 1 - b]
            const x = p[o] + a * (p[o + 3] - p[o]) + b * (p[o + 6] - p[o]), y = p[o + 1] + a * (p[o + 4] - p[o + 1]) + b * (p[o + 7] - p[o + 1]), z = p[o + 2] + a * (p[o + 5] - p[o + 2]) + b * (p[o + 8] - p[o + 2])
            pillars.push(x, y, z, x, y, 0)
          }
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3))
        g.computeVertexNormals()
        const holder = new THREE.Group()
        holder.rotation.x = -Math.PI / 2
        holder.scale.setScalar(sc)
        const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, side: THREE.DoubleSide }))
        if (!isRef) mesh.userData.idx = i
        holder.add(mesh)
        if (pillars.length) {
          const lg = new THREE.BufferGeometry()
          lg.setAttribute('position', new THREE.Float32BufferAttribute(pillars, 3))
          holder.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#f87171', transparent: true, opacity: 0.6 })))
        }
        const wrap = new THREE.Group()
        wrap.position.x = (i - (show.length - 1) / 2) * gap
        wrap.add(holder)
        const plate = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.06, 3.0), new THREE.MeshStandardMaterial({ color: isRef ? '#7f1d1d' : i === selIdx ? '#f59e0b' : '#334155' }))
        plate.position.y = -0.035
        if (!isRef) plate.userData.idx = i
        wrap.add(plate)
        const lb = label(`${isRef ? 'As modelled' : `#${i + 1}`} · ${num(c.support / 1000, 1)} cm³ · ${num(c.height, 0)} mm`, i === selIdx ? '#fbbf24' : '#e2e8f0', 0.3)
        lb.position.set(0, -0.35, 1.7)
        wrap.add(lb)
        root.add(wrap)
      })
    },
    [top, base, s.threshold, selIdx, upright],
    { camera: [0, 3.2, 9.5], target: [0, 0.9, 0], grid: false },
  )

  const load = async (f: File) => {
    setErr('')
    try {
      const pos = /\.obj$/i.test(f.name) ? parseObj(await f.text()) : parseStl(await f.arrayBuffer()).pos
      if (!pos.length) throw new Error('No triangles found.')
      setFile({ name: f.name, pos })
      set({ sel: 0 })
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const saved = sel && upright && upright.support > 0 ? 1 - sel.support / upright.support : 0

  return (
    <Split wide="right">
      <div>
        <Panel title="Model" actions={<Btn kind="ghost" onClick={() => { reset(); setFile(null) }}>Reset</Btn>}>
          <FileDrop accept=".stl,.obj" onFiles={([f]) => void load(f)} label="Drop an STL or OBJ file" />
          {err && <Note tone="err">{err}</Note>}
          <p className="muted" style={{ fontSize: 13 }}>{file ? `${file.name} · ${faces.toLocaleString('en-US')} triangles` : 'Built-in demo models:'}</p>
          <Seg value={file ? ('' as SampleId) : s.sample} onChange={(v) => { setFile(null); set({ sample: v, sel: 0 }) }} options={SAMPLES} />
        </Panel>
        <Panel title="Printer">
          <Slider label="Max overhang without support" value={s.threshold} min={20} max={75} step={1} unit="°" onChange={(threshold) => set({ threshold, sel: 0 })} />
          <Row>
            <Num label="Layer height" value={s.layer} onChange={(layer) => set({ layer })} unit="mm" min={0.02} max={1} step={0.02} />
          </Row>
          <Seg value={String(s.samples)} onChange={(v) => set({ samples: Number(v), sel: 0 })} options={[['150', 'Quick (150)'], ['400', 'Normal (400)'], ['1200', 'Fine (1200)']]} />
          <p className="muted" style={{ fontSize: 12 }}>Every sampled “up” direction (a Fibonacci sphere plus the 6 axes and the model's 12 largest flat faces) is scored. Rotation about the vertical axis does not change supports, so it is ignored.</p>
        </Panel>
        <Panel title="What matters to you">
          <Slider label="Support material" value={s.wSupport} min={0} max={10} onChange={(wSupport) => set({ wSupport, sel: 0 })} show={(v) => v.toFixed(0)} />
          <Slider label="Print height (time)" value={s.wHeight} min={0} max={10} onChange={(wHeight) => set({ wHeight, sel: 0 })} show={(v) => v.toFixed(0)} />
          <Slider label="Supported surface (finish quality)" value={s.wOverhang} min={0} max={10} onChange={(wOverhang) => set({ wOverhang, sel: 0 })} show={(v) => v.toFixed(0)} />
          <Slider label="Bed contact (adhesion)" value={s.wBed} min={0} max={10} onChange={(wBed) => set({ wBed, sel: 0 })} show={(v) => v.toFixed(0)} />
          <Row>
            <Btn onClick={() => set({ wSupport: 8, wHeight: 1, wOverhang: 3, wBed: 1, sel: 0 })}>Least support</Btn>
            <Btn onClick={() => set({ wSupport: 2, wHeight: 8, wOverhang: 1, wBed: 1, sel: 0 })}>Fastest</Btn>
            <Btn onClick={() => set({ wSupport: 4, wHeight: 1, wOverhang: 2, wBed: 6, sel: 0 })}>Best adhesion</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        {sel && (
          <Stats>
            <Stat label={`Support volume (#${selIdx + 1})`} value={`${num(sel.support / 1000, 2)} cm³`} sub={upright ? (saved > 0.005 ? `${num(saved * 100, 0)} % less than as modelled` : 'as modelled is already best') : ''} tone={sel.support < 1 ? 'good' : 'accent'} />
            <Stat label="Print height" value={`${num(sel.height, 1)} mm`} sub={`${Math.ceil(sel.height / s.layer)} layers @ ${s.layer} mm`} />
            <Stat label="Bed contact" value={`${num(sel.bed / 100, 1)} cm²`} sub={sel.bed < 0.05 * sel.footprint[0] * sel.footprint[1] ? '⚠ small: use a brim' : `footprint ${num(sel.footprint[0], 0)}×${num(sel.footprint[1], 0)} mm`} tone={sel.bed < 0.05 * sel.footprint[0] * sel.footprint[1] ? 'bad' : undefined} />
            <Stat label="Supported surface" value={`${num(sel.overhang / 100, 1)} cm²`} sub="rougher finish" />
          </Stats>
        )}
        <Panel title="Best candidates" actions={<>
          <Btn kind="primary" disabled={!sel} onClick={() => download(`oriented-${file?.name.replace(/\.\w+$/, '') ?? s.sample}.stl`, new Blob([toBinaryStl(rotated, 'oriented')]), 'model/stl')}>⬇ Oriented STL</Btn>
        </>}>
          <View3D refEl={ref} height={340} />
          <p className="muted" style={{ fontSize: 12 }}>Red faces need support (red lines show where support columns go down to the bed); blue faces sit on the bed. The dark-red plate shows the model as loaded, for comparison. Click a candidate (or a row) to select it. Drag to orbit.</p>
          <Table head={['#', 'Support cm³', 'Height mm', 'Overhang cm²', 'Bed cm²', 'Up vector', 'Pareto', '']} rows={top.map((c, i) => [
            <b key="i">{i + 1}</b>, num(c.support / 1000, 2), num(c.height, 1), num(c.overhang / 100, 1), num(c.bed / 100, 1),
            <code key="u" style={{ fontSize: 11 }}>{c.up.map((v) => (Math.abs(v) < 5e-4 ? 0 : v).toFixed(2)).join(', ')}</code>,
            c.pareto ? '✓' : '',
            <Btn key="b" kind={i === selIdx ? 'primary' : 'ghost'} onClick={() => set({ sel: i })}>{i === selIdx ? 'Selected' : 'Select'}</Btn>,
          ])} />
          {sel && <Note tone="ok">Slicer rotation for #{selIdx + 1}: X {eul[0]}°, Y {eul[1]}°, Z {eul[2]}° (applied in X → Y → Z order), or download the pre-rotated STL.</Note>}
        </Panel>
        <Panel title="Trade-off: support vs height" actions={<CsvButton name="orientations.csv" rows={() => [['up_x', 'up_y', 'up_z', 'support_mm3', 'height_mm', 'overhang_mm2', 'bed_mm2', 'score', 'pareto'], ...all.map((c) => [...c.up.map((v) => v.toFixed(4)), c.support.toFixed(1), c.height.toFixed(2), c.overhang.toFixed(1), c.bed.toFixed(1), c.score.toFixed(4), c.pareto ? 1 : 0])]} />}>
          <ScatterPlot all={all} top={top} sel={sel} onPick={(c) => set({ sel: top.indexOf(c) })} />
          <p className="muted" style={{ fontSize: 12 }}>Each grey dot is one sampled orientation ({all.length} total). The green line is the Pareto front: no other orientation is both shorter and needs less support. Support volume ≈ Σ overhang area × cos(angle) × height above the bed.</p>
        </Panel>
      </div>
    </Split>
  )
}
