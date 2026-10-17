import { useEffect, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js'
import { zipSync } from 'three/examples/jsm/libs/fflate.module.js'
import { bytes, detectFormat, FORMATS, outName, uniqueNames, unitScale, UNITS, type Fmt3D, type Unit } from './lib/format-converter'

interface Item {
  id: string; name: string; src: string; size: number; obj: THREE.Object3D
  tris: number; verts: number; meshes: number; colors: boolean; dims: [number, number, number]
}
interface Out { name: string; data: Uint8Array; ms: number }

const DEF = {
  target: 'glb' as Fmt3D, binary: true, from: 'mm' as Unit, to: 'mm' as Unit,
  axis: 'none' as 'none' | 'z2y' | 'y2z', place: 'none' as 'none' | 'center' | 'floor', wire: false,
}
type Settings = typeof DEF

const KEEPS: Record<Fmt3D, string> = {
  obj: 'Geometry, normals, UVs and groups. Materials are not written (no .mtl).',
  stl: 'Triangles only. Colors, UVs and materials are dropped — the 3D-printing standard.',
  ply: 'Geometry, normals, UVs and per-vertex colors. Great for scans and point data.',
  glb: 'Everything: hierarchy, materials, colors, UVs, normals — one self-contained binary glTF.',
}

async function loadModel(name: string, buf: ArrayBuffer): Promise<{ obj: THREE.Object3D; src: string }> {
  const fmt = detectFormat(name, new Uint8Array(buf, 0, Math.min(16, buf.byteLength)))
  const meshOf = (geo: THREE.BufferGeometry) => {
    if (!geo.getAttribute('normal')) geo.computeVertexNormals()
    const vc = !!geo.getAttribute('color')
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: vc ? '#ffffff' : '#94a3b8', vertexColors: vc, roughness: 0.6, metalness: 0.1 }))
  }
  if (fmt === 'obj') return { obj: new OBJLoader().parse(new TextDecoder().decode(buf)), src: 'OBJ' }
  if (fmt === 'stl') return { obj: meshOf(new STLLoader().parse(buf)), src: 'STL' }
  if (fmt === 'ply') return { obj: meshOf(new PLYLoader().parse(buf)), src: 'PLY' }
  if (fmt === 'glb' || fmt === 'gltf') {
    const g = await new GLTFLoader().parseAsync(fmt === 'gltf' ? new TextDecoder().decode(buf) : buf, '')
    return { obj: g.scene, src: fmt.toUpperCase() }
  }
  throw new Error('Unknown format (use OBJ, STL, PLY, GLB or embedded glTF)')
}

function analyse(id: string, name: string, size: number, src: string, obj: THREE.Object3D): Item {
  let tris = 0, verts = 0, meshes = 0, colors = false
  obj.updateMatrixWorld(true)
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    meshes++
    const pos = m.geometry.getAttribute('position')
    verts += pos.count
    tris += (m.geometry.index ? m.geometry.index.count : pos.count) / 3
    if (m.geometry.getAttribute('color')) colors = true
  })
  const v = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3())
  return { id, name, size, src, obj, tris: Math.round(tris), verts, meshes, colors, dims: [v.x, v.y, v.z] }
}

/** Wraps a clone of the model with the unit/axis/placement transform baked into the parent. */
function transformed(item: Item, s: Settings): THREE.Group {
  const inner = new THREE.Group()
  inner.add(item.obj.clone())
  inner.scale.setScalar(unitScale(s.from, s.to))
  if (s.axis === 'z2y') inner.rotation.x = -Math.PI / 2
  if (s.axis === 'y2z') inner.rotation.x = Math.PI / 2
  const outer = new THREE.Group()
  outer.add(inner)
  outer.updateMatrixWorld(true)
  if (s.place !== 'none') {
    const b = new THREE.Box3().setFromObject(outer)
    const c = b.getCenter(new THREE.Vector3())
    inner.position.set(-c.x, s.place === 'floor' ? -b.min.y : -c.y, -c.z)
    outer.updateMatrixWorld(true)
  }
  return outer
}

async function exportModel(root: THREE.Object3D, fmt: Fmt3D, binary: boolean): Promise<Uint8Array> {
  const enc = (t: string) => new TextEncoder().encode(t)
  if (fmt === 'obj') return enc(new OBJExporter().parse(root))
  if (fmt === 'stl') {
    if (!binary) return enc(new STLExporter().parse(root))
    const dv = new STLExporter().parse(root, { binary: true })
    return new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)
  }
  if (fmt === 'ply') {
    let out: Uint8Array = new Uint8Array()
    if (binary) new PLYExporter().parse(root, (r) => (out = new Uint8Array(r)), { binary: true })
    else new PLYExporter().parse(root, (r) => (out = enc(r)), { binary: false })
    return out
  }
  const r = await new GLTFExporter().parseAsync(root, { binary: true })
  return new Uint8Array(r as ArrayBuffer)
}

/** Two procedural sample files so the converter has something to chew on. */
function sampleFiles(): [string, ArrayBuffer][] {
  const house = new THREE.Group()
  const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 30, 30), new THREE.MeshStandardMaterial({ color: '#fbbf24' }))
  wall.name = 'walls'
  wall.position.y = 15
  const roof = new THREE.Mesh(new THREE.ConeGeometry(32, 20, 4), new THREE.MeshStandardMaterial({ color: '#ef4444' }))
  roof.name = 'roof'
  roof.position.y = 40
  roof.rotation.y = Math.PI / 4
  const door = new THREE.Mesh(new THREE.BoxGeometry(8, 14, 1), new THREE.MeshStandardMaterial({ color: '#7c2d12' }))
  door.name = 'door'
  door.position.set(0, 7, 15.2)
  house.add(wall, roof, door)
  house.updateMatrixWorld(true)
  const obj = new TextEncoder().encode(new OBJExporter().parse(house))
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(20, 6, 160, 24))
  knot.rotation.x = Math.PI / 2
  knot.updateMatrixWorld(true)
  const dv = new STLExporter().parse(knot, { binary: true })
  return [['sample-house.obj', obj.buffer as ArrayBuffer], ['sample-knot.stl', dv.buffer.slice(0)]]
}

export default function FormatConverter() {
  const [s, set, reset] = useToolState('format-converter', DEF)
  const [items, setItems] = useState<Item[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [outs, setOuts] = useState<{ sig: string; map: Record<string, Out> }>({ sig: '', map: {} })
  const [errs, setErrs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const holder = useRef<THREE.Group | null>(null)
  const wires = useRef<THREE.BufferGeometry[]>([])
  const sig = JSON.stringify([s.target, s.binary, s.from, s.to, s.axis, s.place, items.map((i) => i.id)])
  const shown = outs.sig === sig ? outs.map : {}
  const cur = items.find((i) => i.id === sel) ?? items[0]

  const addFiles = async (files: [string, ArrayBuffer, number][]) => {
    const added: Item[] = []
    const bad: string[] = []
    for (const [name, buf, size] of files) {
      try {
        const { obj, src } = await loadModel(name, buf)
        added.push(analyse(uid(), name, size, src, obj))
      } catch (e) {
        bad.push(`${name}: ${(e as Error).message}`)
      }
    }
    setItems((l) => [...l, ...added])
    if (added.length) setSel(added[0].id)
    setErrs(bad)
  }

  useEffect(() => {
    void addFiles(sampleFiles().map(([n, b]) => [n, b, b.byteLength]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      st.scene.add(g)
      holder.current = g
    },
    (st) => {
      const g = holder.current
      if (!g) return
      g.clear()
      wires.current.forEach((w) => w.dispose())
      wires.current = []
      if (!cur) return
      const root = transformed(cur, { ...s, place: s.place === 'none' ? 'floor' : s.place })
      const b = new THREE.Box3().setFromObject(root)
      const size = b.getSize(new THREE.Vector3())
      const k = 4 / Math.max(size.x, size.y, size.z, 1e-9)
      g.scale.setScalar(k)
      g.position.y = s.place === 'center' ? size.y * k * 0.5 : 0
      g.add(root)
      if (s.wire) {
        root.traverse((o) => {
          const m = o as THREE.Mesh
          if (!m.isMesh) return
          const wg = new THREE.WireframeGeometry(m.geometry)
          wires.current.push(wg)
          m.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#0f172a', transparent: true, opacity: 0.35 })))
        })
      }
      st.controls.target.set(0, 2, 0)
      st.camera.position.set(5, 4.5, 6.5)
    },
    [cur, s.from, s.to, s.axis, s.place, s.wire],
    { camera: [5, 4.5, 6.5], target: [0, 2, 0] },
  )

  const convertAll = async () => {
    setBusy(true)
    const map: Record<string, Out> = {}
    const names = uniqueNames(items.map((i) => outName(i.name, s.target)))
    for (const [k, it] of items.entries()) {
      const t0 = performance.now()
      map[it.id] = { name: names[k], data: await exportModel(transformed(it, s), s.target, s.binary), ms: performance.now() - t0 }
    }
    setOuts({ sig, map })
    setBusy(false)
  }
  useEffect(() => {
    if (items.length) void convertAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  const outList = items.map((i) => shown[i.id]).filter(Boolean)
  const zip = () => {
    const files: Record<string, Uint8Array> = {}
    for (const o of outList) files[o.name] = o.data
    download(`converted-${s.target}.zip`, new Blob([zipSync(files, { level: 6 }) as BlobPart], { type: 'application/zip' }))
  }
  const totalIn = items.reduce((a, i) => a + i.size, 0)
  const totalOut = outList.reduce((a, o) => a + o.data.byteLength, 0)
  const hasText = s.target === 'stl' || s.target === 'ply'

  return (
    <Split>
      <div>
        <Panel title="1 · Add models">
          <FileDrop
            multiple
            accept=".obj,.stl,.ply,.glb,.gltf"
            label="Drop OBJ, STL, PLY, GLB or glTF files (batch is fine)"
            onFiles={async (fs) => addFiles(await Promise.all(fs.map(async (f) => [f.name, await f.arrayBuffer(), f.size] as [string, ArrayBuffer, number])))}
          />
          {errs.map((e) => <Note key={e} tone="err">{e}</Note>)}
          <p className="muted" style={{ fontSize: 13 }}>Every file is converted automatically as you change options. Files never leave your browser. glTF must have embedded buffers (use GLB otherwise).</p>
        </Panel>
        <Panel title="2 · Output">
          <Seg value={s.target} onChange={(target) => set({ target })} options={FORMATS.map((f) => [f, f.toUpperCase()] as const)} label="Target format" />
          <p style={{ fontSize: 13, margin: '8px 0' }}>{KEEPS[s.target]}</p>
          {hasText && <Check label={`Binary ${s.target.toUpperCase()} (smaller, faster) instead of ASCII`} value={s.binary} onChange={(binary) => set({ binary })} />}
          <Row>
            <Select label="Source units" value={s.from} onChange={(from) => set({ from })} options={Object.keys(UNITS) as Unit[]} />
            <Select label="Output units" value={s.to} onChange={(to) => set({ to })} options={Object.keys(UNITS) as Unit[]} />
          </Row>
          {s.from !== s.to && <Note>Coordinates are multiplied by {num(unitScale(s.from, s.to), 6)}.</Note>}
          <Row>
            <Select label="Up axis" value={s.axis} onChange={(axis) => set({ axis })} options={[['none', 'Keep'], ['z2y', 'Z-up → Y-up'], ['y2z', 'Y-up → Z-up']]} />
            <Select label="Placement" value={s.place} onChange={(place) => set({ place })} options={[['none', 'Keep origin'], ['center', 'Center at origin'], ['floor', 'Center + on floor']]} />
          </Row>
          <Row>
            <Btn kind="primary" onClick={zip} disabled={!outList.length || busy}>⬇ Download all as ZIP</Btn>
            <Btn kind="ghost" onClick={reset}>Reset options</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Models" value={items.length} sub={bytes(totalIn)} />
          <Stat label="Triangles" value={num(items.reduce((a, i) => a + i.tris, 0), 0)} />
          <Stat label="Converted" value={`${outList.length} / ${items.length}`} sub={busy ? 'converting…' : bytes(totalOut)} tone={outList.length === items.length && items.length ? 'good' : undefined} />
          <Stat label="Size change" value={outList.length ? `${totalOut >= totalIn ? '+' : ''}${num(((totalOut - totalIn) / (totalIn || 1)) * 100, 0)}%` : '—'} />
        </Stats>
        <Panel title={cur ? `Preview · ${cur.name}` : 'Preview'} actions={<Check label="Wireframe" value={s.wire} onChange={(wire) => set({ wire })} />}>
          <View3D refEl={ref} height={340} />
          {cur && (
            <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
              Bounding box {cur.dims.map((d) => num(d * unitScale(s.from, s.to), 2)).join(' × ')} {s.to} · {cur.meshes} mesh{cur.meshes === 1 ? '' : 'es'} · {num(cur.verts, 0)} vertices{cur.colors ? ' · vertex colors' : ''}
            </p>
          )}
        </Panel>
        <Panel title="Files" actions={<Btn kind="ghost" onClick={() => { setItems([]); setSel(null) }} disabled={!items.length}>Clear</Btn>}>
          {items.length ? (
            <Table
              head={['File', 'From', 'Triangles', 'Size', 'Output', '']}
              rows={items.map((i) => {
                const o = shown[i.id]
                return [
                  <button key="n" type="button" className="k-btn ghost" style={{ fontWeight: i.id === cur?.id ? 700 : 400 }} onClick={() => setSel(i.id)}>{i.name}</button>,
                  i.src,
                  num(i.tris, 0),
                  bytes(i.size),
                  o ? <Btn key="d" onClick={() => download(o.name, new Blob([o.data as BlobPart]))}>⬇ {o.name} · {bytes(o.data.byteLength)}</Btn> : <span key="p" className="muted">—</span>,
                  <Btn key="x" kind="ghost" title="Remove" onClick={() => setItems((l) => l.filter((x) => x.id !== i.id))}>✕</Btn>,
                ]
              })}
            />
          ) : (
            <Note>No models yet. Drop some files on the left.</Note>
          )}
          {s.target === 'stl' && items.some((i) => i.colors || i.meshes > 1) && <Note tone="warn">STL has no colors or parts: multi-mesh models are merged into one triangle soup.</Note>}
        </Panel>
      </div>
    </Split>
  )
}
