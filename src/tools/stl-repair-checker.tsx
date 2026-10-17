import { useMemo, useState } from 'react'
import { Btn, Check, download, FileDrop, fmt, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { analyze, repair, SAMPLES, toSoup, weld, type Indexed, type Report } from './lib/stl-repair-checker'
import { parseStl, toBinaryStl } from './lib/stl-viewer'

const DEF = { tolExp: -4, fill: true, orient: true, maxHole: 200, showFixed: false, wire: false, xray: true }

const C = { boundary: '#ef4444', nonman: '#d946ef', flipped: '#f59e0b', degen: '#22d3ee' }

function edgeLines(m: Indexed, list: [number, number][], col: string) {
  const arr = new Float32Array(list.length * 6)
  list.forEach(([a, b], i) => {
    for (let k = 0; k < 3; k++) {
      arr[6 * i + k] = m.verts[3 * a + k]
      arr[6 * i + 3 + k] = m.verts[3 * b + k]
    }
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: col, depthTest: false }))
  l.renderOrder = 5
  return l
}

function verdict(r: Report): [tone: 'ok' | 'warn' | 'err', text: string] {
  if (r.watertight && r.degenerate.length === 0 && r.duplicates.length === 0 && r.volume > 0) return ['ok', 'Watertight and consistently oriented — ready to slice.']
  if (r.nonManifoldEdges.length || r.holes.length) return ['err', 'Not printable as is: the mesh has open or non-manifold edges. Most slicers will guess, often badly.']
  return ['warn', 'Closed, but with orientation or face problems. Slicers may render inverted walls or skip layers.']
}

export default function StlRepairChecker() {
  const [s, set, reset] = useToolState('stl-repair-checker', DEF)
  const [src, setSrc] = useState<{ pos: Float32Array; name: string }>(() => ({ pos: SAMPLES.holes.make(), name: SAMPLES.holes.name }))
  const [sample, setSample] = useState('holes')
  const [err, setErr] = useState('')

  const mesh = useMemo(() => weld(src.pos, 10 ** s.tolExp), [src, s.tolExp])
  const rep = useMemo(() => analyze(mesh), [mesh])
  const fixed = useMemo(() => repair(mesh, { fill: s.fill, orient: s.orient, maxHole: s.maxHole }), [mesh, s.fill, s.orient, s.maxHole])
  const rep2 = useMemo(() => analyze(fixed.mesh), [fixed])
  const shown = s.showFixed ? fixed.mesh : mesh
  const shownRep = s.showFixed ? rep2 : rep

  const ref = useStage3D(
    (stage) => {
      const root = new THREE.Group()
      root.name = 'root'
      stage.scene.add(root)
    },
    (stage) => {
      const root = stage.scene.getObjectByName('root') as THREE.Group
      stage.clear(root)
      const soup = toSoup(shown)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(soup, 3))
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
      // front faces grey, back faces (seen through holes or inverted walls) red-tinted
      inner.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.6, wireframe: s.wire, side: THREE.FrontSide, transparent: s.xray, opacity: s.xray ? 0.55 : 1 })))
      inner.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#7f1d1d', roughness: 0.8, side: THREE.BackSide, transparent: s.xray, opacity: s.xray ? 0.55 : 1 })))
      if (shownRep.boundaryEdges.length) inner.add(edgeLines(shown, shownRep.boundaryEdges, C.boundary))
      if (shownRep.nonManifoldEdges.length) inner.add(edgeLines(shown, shownRep.nonManifoldEdges, C.nonman))
      if (shownRep.flippedEdges.length) inner.add(edgeLines(shown, shownRep.flippedEdges, C.flipped))
      const dm = new THREE.MeshBasicMaterial({ color: C.degen, depthTest: false })
      for (const i of shownRep.degenerate.slice(0, 200)) {
        const k = shown.faces[3 * i]
        const sp = new THREE.Mesh(new THREE.SphereGeometry(0.08 / sc, 10, 8), dm)
        sp.position.set(shown.verts[3 * k], shown.verts[3 * k + 1], shown.verts[3 * k + 2])
        sp.renderOrder = 6
        inner.add(sp)
      }
      root.add(holder)
      stage.controls.target.set(0, (size.z * sc) / 2, 0)
    },
    [shown, shownRep, s.wire, s.xray],
    { camera: [9, 9, 12], target: [0, 3, 0] },
  )

  const load = async (f: File) => {
    setErr('')
    try {
      const m = parseStl(await f.arrayBuffer())
      setSrc({ pos: m.pos, name: f.name })
      setSample('')
      set({ showFixed: false })
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const [tone, text] = verdict(rep)
  const checks: [string, boolean, string][] = [
    ['No holes (boundary edges)', rep.boundaryEdges.length === 0, `${rep.boundaryEdges.length} open edges in ${rep.holes.length} loop(s)`],
    ['Every edge shared by exactly 2 faces', rep.nonManifoldEdges.length === 0, `${rep.nonManifoldEdges.length} non-manifold edges`],
    ['Consistent winding', rep.flippedEdges.length === 0, `${rep.flippedEdges.length} edges with clashing face directions`],
    ['Normals point outward', rep.volume > 0, rep.volume > 0 ? 'signed volume positive' : 'signed volume negative — inside out'],
    ['No degenerate triangles', rep.degenerate.length === 0, `${rep.degenerate.length} zero-area faces`],
    ['No duplicate triangles', rep.duplicates.length === 0, `${rep.duplicates.length} duplicates`],
  ]

  return (
    <Split wide="right">
      <div>
        <Panel title="Mesh">
          <FileDrop accept=".stl" onFiles={(f) => void load(f[0])} label="Drop an STL (binary or ASCII)" />
          <Select
            label="…or try a sample"
            value={sample}
            onChange={(k) => {
              setSample(k)
              if (k && SAMPLES[k]) setSrc({ pos: SAMPLES[k].make(), name: SAMPLES[k].name })
            }}
            options={[['', '— your file —'], ...Object.entries(SAMPLES).map(([k, v]) => [k, v.name] as [string, string])]}
          />
          {err && <Note tone="err">{err}</Note>}
          <p className="muted" style={{ margin: '6px 0 0' }}>{src.name} · {rep.faces.toLocaleString()} triangles</p>
        </Panel>
        <Panel title="Weld & repair settings">
          <Select label="Vertex weld tolerance" value={s.tolExp} onChange={(tolExp) => set({ tolExp })} options={[[-6, '0.000001 (strict)'], [-5, '0.00001'], [-4, '0.0001 (default)'], [-3, '0.001'], [-2, '0.01 (loose)']]} />
          <Check label="Fill holes (centroid fan)" value={s.fill} onChange={(fill) => set({ fill })} />
          {s.fill && <Num label="Largest hole to fill" value={s.maxHole} onChange={(maxHole) => set({ maxHole })} min={3} unit="edges" />}
          <Check label="Unify winding & orient outward" value={s.orient} onChange={(orient) => set({ orient })} />
          <Note>Degenerate and duplicate triangles are always removed. Non-manifold edges are reported but need manual fixing in a modeller (separate the bodies or merge them with a boolean union).</Note>
        </Panel>
        <Panel title="Legend">
          <Row>
            {[['Open edge', C.boundary], ['Non-manifold', C.nonman], ['Flipped', C.flipped], ['Degenerate', C.degen], ['Back face', '#7f1d1d']].map(([n, c]) => (
              <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <i style={{ width: 14, height: 4, background: c, display: 'inline-block', borderRadius: 2 }} /> {n}
              </span>
            ))}
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Watertight" value={rep.watertight ? 'Yes' : 'No'} tone={rep.watertight ? 'good' : 'bad'} />
          <Stat label="Holes" value={rep.holes.length} sub={`${rep.boundaryEdges.length} open edges`} tone={rep.holes.length ? 'bad' : undefined} />
          <Stat label="Shells" value={rep.components} sub={rep.genus !== null ? `genus ${rep.genus}` : `χ = ${rep.euler}`} />
          <Stat label="Volume" value={fmt(Math.abs(rep.volume) / 1000, 4)} sub={`cm³ if mm · area ${fmt(rep.area / 100, 4)} cm²`} />
        </Stats>
        <Panel
          title={s.showFixed ? 'Repaired mesh' : 'Original mesh'}
          actions={
            <>
              <Btn kind={s.showFixed ? 'primary' : 'normal'} onClick={() => set({ showFixed: !s.showFixed })}>{s.showFixed ? 'Show original' : 'Preview repair'}</Btn>
              <Btn onClick={() => download(src.name.replace(/\.stl$/i, '') + '-repaired.stl', new Blob([toBinaryStl(toSoup(fixed.mesh), 'repaired')]), 'model/stl')}>⬇ Repaired STL</Btn>
            </>
          }
        >
          <View3D refEl={ref} height={420} />
          <Row>
            <Check label="Wireframe" value={s.wire} onChange={(wire) => set({ wire })} />
            <Check label="X-ray (see inner edges)" value={s.xray} onChange={(xray) => set({ xray })} />
            <Btn kind="ghost" onClick={reset}>Reset settings</Btn>
          </Row>
        </Panel>
        <Panel title="Integrity report">
          <Note tone={tone}>{text}</Note>
          <Table head={['Check', 'Result', 'Detail']} rows={checks.map(([n, ok, d]) => [n, <b key="r" style={{ color: ok ? 'var(--ok)' : 'var(--err)' }}>{ok ? '✓ pass' : '✗ fail'}</b>, <span key="d" className="muted">{d}</span>])} />
          <Table
            head={['Topology', 'Value']}
            rows={[
              ['Unique vertices (after weld)', rep.vertices.toLocaleString()],
              ['Unique edges', rep.edges.toLocaleString()],
              ['Euler characteristic V − E + F', rep.euler],
              ['Hole sizes (edges per loop)', rep.holes.length ? rep.holes.map((h) => h.length).join(', ') : '—'],
            ]}
          />
        </Panel>
        <Panel title="Repair result">
          <Table
            head={['Action', 'Count']}
            rows={[
              ['Degenerate faces removed', fixed.removedDegenerate],
              ['Duplicate faces removed', fixed.removedDuplicates],
              ['Holes filled', fixed.filledHoles],
              ['Faces flipped', fixed.flippedFaces],
            ]}
          />
          <Note tone={rep2.watertight && rep2.volume > 0 ? 'ok' : 'warn'}>
            After repair: {rep2.watertight ? 'watertight' : `${rep2.holes.length} hole(s), ${rep2.nonManifoldEdges.length} non-manifold edge(s) remain`}
            {rep2.volume > 0 && `, volume ${fmt(rep2.volume / 1000, 4)} cm³`}.
          </Note>
        </Panel>
      </div>
    </Split>
  )
}
