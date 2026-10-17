import { useMemo, useState } from 'react'
import { Btn, Check, color, CopyButton, download, FileDrop, fmt, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { analyze, parseObj, readiness, sampleHollow, sampleObj, shells, toObj, weld, type Level } from './lib/mesh-repair-checker'
import { repair, SAMPLES, toSoup, type Indexed } from './lib/stl-repair-checker'
import { parseStl, toBinaryStl } from './lib/stl-viewer'

const BEDS: [string, string, [number, number, number]][] = [
  ['ender', 'Ender 3 (220×220×250)', [220, 220, 250]],
  ['mk4', 'Prusa MK4 (250×210×220)', [250, 210, 220]],
  ['x1', 'Bambu X1/P1 (256³)', [256, 256, 256]],
  ['resin', 'Resin MSLA (153×78×165)', [153, 78, 165]],
  ['cnc', 'CNC router (600×400×100)', [600, 400, 100]],
]

const UNITS: Record<string, [string, number]> = { mm: ['cm³', 1000], cm: ['cm³', 1], in: ['in³', 1] }

const DEF = { view: 'normals' as 'normals' | 'shells', hedgehog: true, edges: true, bed: 'ender', unit: 'mm', minFeature: 0.8 }

const LVL: Record<Level, [string, string]> = { pass: ['✓ pass', 'var(--ok)'], warn: ['! warn', 'var(--warn)'], fail: ['✗ fail', 'var(--err)'] }

function sampleSrc(k: string): { pos: Float32Array; name: string } {
  if (k === 'obj') return { pos: parseObj(sampleObj()), name: 'sample-parts.obj' }
  if (k === 'hollow') return { pos: sampleHollow(), name: 'hollow-box.stl' }
  return { pos: SAMPLES[k].make(), name: `${SAMPLES[k].name}.stl` }
}

export default function MeshRepairChecker() {
  const [s, set, reset] = useToolState('mesh-repair-checker', DEF)
  const [sample, setSample] = useState('obj')
  const [src, setSrc] = useState(() => sampleSrc('obj'))
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(-1)

  const mesh = useMemo(() => weld(src.pos, 1e-4), [src])
  const rep = useMemo(() => analyze(mesh), [mesh])
  const sh = useMemo(() => shells(mesh), [mesh])
  const bed = BEDS.find((b) => b[0] === s.bed)?.[2] ?? BEDS[0][2]
  const checks = useMemo(() => readiness(rep, sh.shells, bed, s.minFeature), [rep, sh, bed, s.minFeature])
  const fixed = useMemo(() => repair(mesh, { fill: true, orient: true, maxHole: 500 }), [mesh])
  const [vu, vdiv] = UNITS[s.unit]
  const fails = checks.filter((c) => c.level === 'fail').length
  const warns = checks.filter((c) => c.level === 'warn').length

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'mesh'
      st.scene.add(g)
    },
    (st) => {
      const root = st.scene.getObjectByName('mesh') as THREE.Group
      st.clear(root)
      const { verts: v, faces: f } = mesh
      const F = f.length / 3
      const pos = new Float32Array(F * 9)
      const col = new Float32Array(F * 9)
      const c = new THREE.Color()
      for (let i = 0; i < F; i++) {
        const si = sh.faceShell[i]
        if (s.view === 'normals') c.set(sh.faceSign[i] > 0 ? '#94a3b8' : '#ef4444')
        else c.set(color(si))
        if (sel >= 0 && si !== sel) c.lerp(new THREE.Color('#1e293b'), 0.75)
        for (let k = 0; k < 3; k++) {
          const vi = f[3 * i + k]
          pos.set([v[3 * vi], v[3 * vi + 1], v[3 * vi + 2]], 9 * i + 3 * k)
          col.set([c.r, c.g, c.b], 9 * i + 3 * k)
        }
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      g.computeVertexNormals()
      g.computeBoundingBox()
      const bb = g.boundingBox!
      const size = new THREE.Vector3()
      bb.getSize(size)
      const sc = 8 / (Math.max(size.x, size.y, size.z) || 1)
      const holder = new THREE.Group()
      holder.rotation.x = -Math.PI / 2
      holder.scale.setScalar(sc)
      const inner = new THREE.Group()
      inner.position.set(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -bb.min.z)
      holder.add(inner)
      inner.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, flatShading: true })))
      const lines = (arr: number[], hex: string, top = true) => {
        const lg = new THREE.BufferGeometry()
        lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3))
        const l = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: hex, depthTest: !top }))
        l.renderOrder = top ? 5 : 1
        inner.add(l)
      }
      if (s.edges) {
        const seg = (list: [number, number][]) => list.flatMap(([a, b]) => [v[3 * a], v[3 * a + 1], v[3 * a + 2], v[3 * b], v[3 * b + 1], v[3 * b + 2]])
        if (rep.boundaryEdges.length) lines(seg(rep.boundaryEdges), '#facc15')
        if (rep.nonManifoldEdges.length) lines(seg(rep.nonManifoldEdges), '#d946ef')
      }
      if (s.hedgehog) {
        // short normal spikes from face centres; outward = cyan, inward = red
        const len = Math.max(size.x, size.y, size.z) * 0.04
        const out: number[] = [], inw: number[] = []
        const step = Math.max(1, Math.floor(F / 3000))
        for (let i = 0; i < F; i += step) {
          const P = [0, 1, 2].map((k) => f[3 * i + k])
          const A = new THREE.Vector3(v[3 * P[0]], v[3 * P[0] + 1], v[3 * P[0] + 2])
          const B = new THREE.Vector3(v[3 * P[1]], v[3 * P[1] + 1], v[3 * P[1] + 2])
          const C = new THREE.Vector3(v[3 * P[2]], v[3 * P[2] + 1], v[3 * P[2] + 2])
          const n = B.clone().sub(A).cross(C.clone().sub(A)).normalize()
          const m = A.add(B).add(C).multiplyScalar(1 / 3)
          const e = m.clone().addScaledVector(n, len)
          ;(sh.faceSign[i] > 0 ? out : inw).push(m.x, m.y, m.z, e.x, e.y, e.z)
        }
        if (out.length) lines(out, '#22d3ee', false)
        if (inw.length) lines(inw, '#f87171', false)
      }
      root.add(holder)
    },
    [mesh, rep, sh, s.view, s.hedgehog, s.edges, sel],
    { camera: [9, 8, 11], target: [0, 3, 0] },
  )

  const load = async (file: File) => {
    setErr('')
    try {
      const buf = await file.arrayBuffer()
      const pos = /\.obj$/i.test(file.name) ? parseObj(new TextDecoder().decode(buf)) : parseStl(buf).pos
      setSrc({ pos, name: file.name })
      setSample('')
      setSel(-1)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const base = src.name.replace(/\.(stl|obj)$/i, '')
  const exportMesh = (m: Indexed, kind: 'stl' | 'obj') =>
    kind === 'stl' ? download(`${base}-repaired.stl`, new Blob([toBinaryStl(toSoup(m), 'repaired')]), 'model/stl') : download(`${base}-repaired.obj`, toObj(m, base), 'text/plain')
  const reportText = () =>
    [`Mesh readiness report: ${src.name}`, `${rep.faces} triangles, ${sh.shells.length} shell(s)`, ...checks.map((c) => `[${c.level.toUpperCase()}] ${c.name}: ${c.detail}`), ...sh.shells.map((x, i) => `Shell ${i + 1} (${x.role}): ${x.faces.length} faces, volume ${fmt(Math.abs(x.volume) / vdiv, 4)} ${vu}, ${x.closed ? 'closed' : 'open'}, ${x.flipped} flipped`)].join('\n')
  const netVol = sh.shells.reduce((a, x) => a + (x.role === 'void' ? -Math.abs(x.volume) : x.closed ? Math.abs(x.volume) : 0), 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="Model" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <FileDrop accept=".stl,.obj" onFiles={(f) => void load(f[0])} label="Drop an STL (binary/ASCII) or OBJ" />
          <Select
            label="…or a sample"
            value={sample}
            onChange={(k) => {
              setSample(k)
              setSel(-1)
              if (k) setSrc(sampleSrc(k))
            }}
            options={[['', '— your file —'], ['obj', 'OBJ: parts with hole, flips & debris'], ['hollow', 'Hollow box with cavity'], ...Object.entries(SAMPLES).map(([k, x]) => [k, x.name] as [string, string])]}
          />
          {err && <Note tone="err">{err}</Note>}
          <p className="muted" style={{ fontSize: 13 }}>{src.name} · {rep.faces.toLocaleString()} triangles · {rep.vertices.toLocaleString()} vertices</p>
        </Panel>
        <Panel title="Target machine">
          <Select label="Build volume" value={s.bed} onChange={(bed) => set({ bed })} options={BEDS.map((b) => [b[0], b[1]] as [string, string])} />
          <Row>
            <Select label="File units" value={s.unit} onChange={(unit) => set({ unit })} options={[['mm', 'millimetres'], ['cm', 'centimetres'], ['in', 'inches']]} />
            <Num label="Min feature" value={s.minFeature} onChange={(minFeature) => set({ minFeature })} min={0} unit={s.unit} />
          </Row>
        </Panel>
        <Panel title="Readiness report" actions={<CopyButton text={reportText} label="Copy" />}>
          <Note tone={fails ? 'err' : warns ? 'warn' : 'ok'}>
            {fails ? `Not ready: ${fails} blocking issue(s). Slicers and CAM will guess at the surface.` : warns ? `Usable, with ${warns} warning(s) worth a look.` : 'Ready to slice or machine: closed, manifold and consistently oriented.'}
          </Note>
          <Table head={['Check', 'Result']} rows={checks.map((c) => [<div key="n"><b>{c.name}</b><div className="muted" style={{ fontSize: 12 }}>{c.detail}</div></div>, <b key="l" style={{ color: LVL[c.level][1], whiteSpace: 'nowrap' }}>{LVL[c.level][0]}</b>])} />
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Shells" value={sh.shells.length} sub={`${sh.shells.filter((x) => x.role === 'void').length} cavity · ${sh.shells.filter((x) => x.role === 'debris').length} debris`} tone="accent" />
          <Stat label="Open edges" value={rep.boundaryEdges.length} sub={`${rep.holes.length} hole loop(s)`} tone={rep.boundaryEdges.length ? 'bad' : 'good'} />
          <Stat label="Non-manifold" value={rep.nonManifoldEdges.length} tone={rep.nonManifoldEdges.length ? 'bad' : 'good'} />
          <Stat label="Net volume" value={`${fmt(netVol / vdiv, 4)} ${vu}`} sub="closed shells minus cavities" />
        </Stats>
        <Panel
          title="Inspector"
          actions={
            <Seg value={s.view} onChange={(view) => set({ view })} options={[['normals', 'Normals'], ['shells', 'Shells']]} />
          }
        >
          <View3D refEl={ref} height={430} />
          <Row>
            <Check label="Normal spikes" value={s.hedgehog} onChange={(hedgehog) => set({ hedgehog })} />
            <Check label="Problem edges" value={s.edges} onChange={(edges) => set({ edges })} />
          </Row>
          <div className="muted" style={{ fontSize: 12, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {[['Outward face', '#94a3b8'], ['Inward / flipped', '#ef4444'], ['Normal spike', '#22d3ee'], ['Open edge', '#facc15'], ['Non-manifold', '#d946ef']].map(([n, c]) => (
              <span key={n}><i style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: c, verticalAlign: -2, marginRight: 4 }} />{n}</span>
            ))}
          </div>
        </Panel>
        <Panel
          title="Shells / islands"
          actions={
            <>
              <Btn onClick={() => exportMesh(fixed.mesh, 'stl')}>⬇ Repaired STL</Btn>
              <Btn onClick={() => exportMesh(fixed.mesh, 'obj')}>⬇ Repaired OBJ</Btn>
            </>
          }
        >
          <Table
            head={['#', 'Role', 'Faces', `Volume (${vu})`, 'Area', 'Size', 'State', '']}
            rows={sh.shells.slice(0, 200).map((x, i) => [
              <b key="i" style={{ color: color(i) }}>{i + 1}</b>,
              x.role,
              x.faces.length.toLocaleString(),
              x.closed ? `${x.role === 'void' ? '−' : ''}${fmt(Math.abs(x.volume) / vdiv, 4)}` : <span key="o" className="muted">open</span>,
              fmt(x.area, 4),
              x.max.map((m, d) => +(m - x.min[d]).toFixed(2)).join('×'),
              <span key="s" style={{ color: !x.closed || x.flipped ? 'var(--err)' : 'var(--ok)' }}>{!x.closed ? 'has holes' : x.flipped ? `${x.flipped} flipped` : 'clean'}</span>,
              <Btn key="b" kind={sel === i ? 'primary' : 'ghost'} onClick={() => setSel(sel === i ? -1 : i)}>{sel === i ? 'All' : 'Isolate'}</Btn>,
            ])}
          />
          <p className="muted" style={{ fontSize: 12 }}>
            A shell is an edge-connected set of faces. Inward-facing closed shells inside another body are treated as cavities (valid). Repair removes degenerate/duplicate faces, fills holes and orients each shell outward ({fixed.filledHoles} hole(s) filled, {fixed.flippedFaces} face(s) flipped). Delete debris in your modeller.
          </p>
        </Panel>
      </div>
    </Split>
  )
}
