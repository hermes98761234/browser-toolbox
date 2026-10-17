import { useEffect, useRef, useState } from 'react'
import { Btn, Check, FileDrop, Note, num, Panel, Row, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

/** Info note (block layout; the global `.info` grid class would otherwise split it into columns). */
const Tip = ({ children }: { children: React.ReactNode }) => <div className="k-note info" style={{ display: 'block' }}>{children}</div>

interface MatInfo { name: string; type: string; color: string; meshes: number; textures: number }
interface Info {
  name: string; format: string; size: number; meshes: number; tris: number; verts: number
  dims: [number, number, number]; materials: MatInfo[]; animations: number; uv: boolean; normals: boolean
}

const DEF = { wire: false, rotate: true, box: false, normals: 'smooth' as 'smooth' | 'flat', bg: 'dark' as 'dark' | 'light' | 'studio' }
const BG = { dark: '#0f172a', light: '#e2e8f0', studio: '#3f3f46' }

/** Procedural sample so the viewer is never empty: a small toy rocket with several materials. */
function sampleModel(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'Sample rocket'
  const body = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.4, roughness: 0.35, name: 'Hull' })
  const red = new THREE.MeshStandardMaterial({ color: '#ef4444', metalness: 0.2, roughness: 0.5, name: 'Paint red' })
  const glass = new THREE.MeshStandardMaterial({ color: '#38bdf8', metalness: 0.9, roughness: 0.1, name: 'Window glass' })
  const flame = new THREE.MeshStandardMaterial({ color: '#f59e0b', emissive: '#f97316', emissiveIntensity: 0.8, name: 'Exhaust' })
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, y = 0, f?: (m: THREE.Mesh) => void) => {
    const m = new THREE.Mesh(geo, mat)
    m.name = name
    m.position.y = y
    f?.(m)
    g.add(m)
  }
  add(new THREE.CylinderGeometry(0.6, 0.6, 2.4, 48, 4), body, 'Fuselage', 1.6)
  add(new THREE.ConeGeometry(0.6, 1.1, 48), red, 'Nose cone', 3.35)
  add(new THREE.TorusGeometry(0.28, 0.06, 16, 48), red, 'Window frame', 2.2, (m) => (m.position.z = 0.58))
  add(new THREE.SphereGeometry(0.24, 32, 16), glass, 'Window', 2.2, (m) => { m.position.z = 0.5; m.scale.z = 0.5 })
  for (let i = 0; i < 4; i++) {
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.7, -0.4), new THREE.Vector2(0.7, 0.2), new THREE.Vector2(0, 1)])
    add(new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }), red, `Fin ${i + 1}`, 0.4, (m) => {
      m.geometry.translate(0.55, 0, -0.03)
      m.rotation.y = (i * Math.PI) / 2
    })
  }
  add(new THREE.CylinderGeometry(0.45, 0.55, 0.3, 32), body, 'Nozzle', 0.25)
  add(new THREE.ConeGeometry(0.4, 0.9, 32), flame, 'Flame', -0.35, (m) => (m.rotation.x = Math.PI))
  return g
}

function analyse(root: THREE.Object3D, name: string, format: string, size: number, animations: number): Info {
  let meshes = 0, tris = 0, verts = 0, uv = false, normals = false
  const mats = new Map<THREE.Material, MatInfo>()
  root.updateMatrixWorld(true)
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry) return
    meshes++
    const geo = m.geometry
    const pos = geo.getAttribute('position')
    if (!pos) return
    verts += pos.count
    tris += Math.floor((geo.index ? geo.index.count : pos.count) / 3)
    uv ||= !!geo.getAttribute('uv')
    normals ||= !!geo.getAttribute('normal')
    const list = Array.isArray(m.material) ? m.material : [m.material]
    for (const mat of list) {
      if (!mat) continue
      const ex = mats.get(mat)
      if (ex) { ex.meshes++; continue }
      const anyMat = mat as THREE.MeshStandardMaterial
      const tex = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap'].filter((k) => (anyMat as unknown as Record<string, unknown>)[k]).length
      mats.set(mat, { name: mat.name || '(unnamed)', type: mat.type, color: anyMat.color ? `#${anyMat.color.getHexString()}` : '', meshes: 1, textures: tex })
    }
  })
  const box = new THREE.Box3().setFromObject(root)
  const d = box.getSize(new THREE.Vector3())
  return { name, format, size, meshes, tris, verts, dims: [d.x, d.y, d.z], materials: [...mats.values()], animations, uv, normals }
}

async function loadFiles(files: File[]): Promise<{ obj: THREE.Object3D; anims: THREE.AnimationClip[]; main: File; fmt: string }> {
  const main = files.find((f) => /\.(glb|gltf|obj|stl|fbx)$/i.test(f.name))
  if (!main) throw new Error('No .glb, .gltf, .obj, .stl or .fbx file found.')
  const ext = main.name.split('.').pop()!.toLowerCase()
  // Let multi-file glTF / textures resolve to the other dropped files.
  const urls = new Map(files.map((f) => [f.name, URL.createObjectURL(f)]))
  const mgr = new THREE.LoadingManager()
  mgr.setURLModifier((u) => urls.get(decodeURIComponent(u.split('/').pop() ?? u)) ?? u)
  const buf = await main.arrayBuffer()
  try {
    if (ext === 'glb' || ext === 'gltf') {
      const data = ext === 'glb' ? buf : new TextDecoder().decode(buf)
      const gltf = await new GLTFLoader(mgr).parseAsync(data, '')
      return { obj: gltf.scene, anims: gltf.animations, main, fmt: ext.toUpperCase() }
    }
    if (ext === 'obj') return { obj: new OBJLoader(mgr).parse(new TextDecoder().decode(buf)), anims: [], main, fmt: 'OBJ' }
    if (ext === 'stl') {
      const geo = new STLLoader(mgr).parse(buf)
      geo.computeVertexNormals()
      const mat = new THREE.MeshStandardMaterial({ color: geo.hasAttribute('color') ? '#ffffff' : '#94a3b8', vertexColors: geo.hasAttribute('color'), metalness: 0.1, roughness: 0.6, name: 'STL surface' })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.rotation.x = -Math.PI / 2 // STL is usually Z-up
      const g = new THREE.Group()
      g.add(mesh)
      return { obj: g, anims: [], main, fmt: 'STL' }
    }
    const fbx = new FBXLoader(mgr).parse(buf, '')
    return { obj: fbx, anims: fbx.animations, main, fmt: 'FBX' }
  } finally {
    setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 10000)
  }
}

const fmtBytes = (b: number) => (b <= 0 ? 'generated' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`)

export default function ModelViewer() {
  const [s, set] = useToolState('model-viewer', DEF)
  const [info, setInfo] = useState<Info | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const holder = useRef<THREE.Group>(new THREE.Group())
  const helper = useRef<THREE.Box3Helper | null>(null)
  const stageRef = useRef<Stage3D | null>(null)
  const mixer = useRef<THREE.AnimationMixer | null>(null)
  const optsRef = useRef(s)
  useEffect(() => {
    optsRef.current = s
  }, [s])

  const applyLook = (st: Stage3D) => {
    const o = optsRef.current
    st.scene.background = new THREE.Color(BG[o.bg])
    holder.current.traverse((c) => {
      const m = c as THREE.Mesh
      if (!m.isMesh) return
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        const mm = mat as THREE.MeshStandardMaterial
        if ('wireframe' in mm) mm.wireframe = o.wire
        if ('flatShading' in mm) { mm.flatShading = o.normals === 'flat'; mm.needsUpdate = true }
      }
    })
    if (helper.current) helper.current.visible = o.box
  }

  const show = (obj: THREE.Object3D, anims: THREE.AnimationClip[], name: string, fmt: string, size: number) => {
    const st = stageRef.current
    if (!st) return
    st.clear(holder.current)
    if (helper.current) { st.scene.remove(helper.current); helper.current.dispose(); helper.current = null }
    const inf = analyse(obj, name, fmt, size, anims.length)
    // normalise: centre on the grid and scale to ~4 units
    const box = new THREE.Box3().setFromObject(obj)
    const sz = box.getSize(new THREE.Vector3())
    const k = 4 / (Math.max(sz.x, sz.y, sz.z) || 1)
    const wrap = new THREE.Group()
    const c = box.getCenter(new THREE.Vector3())
    obj.position.sub(new THREE.Vector3(c.x, box.min.y, c.z))
    wrap.add(obj)
    wrap.scale.setScalar(k)
    holder.current.add(wrap)
    helper.current = new THREE.Box3Helper(new THREE.Box3().setFromObject(wrap), new THREE.Color('#f59e0b'))
    st.scene.add(helper.current)
    st.controls.target.set(0, (sz.y * k) / 2, 0)
    st.camera.position.set(4.5, sz.y * k * 0.9 + 1.5, 6)
    mixer.current = anims.length ? new THREE.AnimationMixer(obj) : null
    if (mixer.current) mixer.current.clipAction(anims[0]).play()
    setInfo(inf)
    applyLook(st)
  }

  const ref = useStage3D(
    (st) => {
      stageRef.current = st
      st.scene.add(holder.current)
      st.onFrame((_t, dt) => {
        if (optsRef.current.rotate) holder.current.rotation.y += dt * 0.4
        mixer.current?.update(dt)
      })
      show(sampleModel(), [], 'Sample rocket (built-in)', 'Procedural', 0)
      return () => { stageRef.current = null }
    },
    (st) => {
      optsRef.current = s
      applyLook(st)
    },
    [s.wire, s.box, s.normals, s.bg],
    { camera: [4.5, 4, 6], target: [0, 2, 0] },
  )

  const open = async (files: File[]) => {
    setErr('')
    setBusy(true)
    try {
      const r = await loadFiles(files)
      show(r.obj, r.anims, r.main.name, r.fmt, r.main.size)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const snapshot = () => {
    const st = stageRef.current
    if (!st) return
    st.renderer.render(st.scene, st.camera)
    const a = document.createElement('a')
    a.href = st.renderer.domElement.toDataURL('image/png')
    a.download = 'model.png'
    a.click()
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Open a model">
          <FileDrop accept=".glb,.gltf,.obj,.stl,.fbx,.bin,.png,.jpg,.jpeg,.mtl" multiple onFiles={open} label="Drop .glb / .gltf / .obj / .stl / .fbx (plus .bin & textures)" />
          {busy && <Tip>Parsing…</Tip>}
          {err && <Note tone="err">{err}</Note>}
          <Row>
            <Btn onClick={() => show(sampleModel(), [], 'Sample rocket (built-in)', 'Procedural', 0)}>Load sample</Btn>
            <Btn onClick={snapshot}>⬇ PNG snapshot</Btn>
          </Row>
        </Panel>
        <Panel title="Display">
          <Check label="Wireframe" value={s.wire} onChange={(wire) => set({ wire })} />
          <Check label="Auto-rotate" value={s.rotate} onChange={(rotate) => set({ rotate })} />
          <Check label="Bounding box" value={s.box} onChange={(box) => set({ box })} />
          <p className="k-label">Shading</p>
          <Seg value={s.normals} onChange={(normals) => set({ normals })} options={[['smooth', 'Smooth'], ['flat', 'Flat']]} />
          <p className="k-label">Background</p>
          <Seg value={s.bg} onChange={(bg) => set({ bg })} options={[['dark', 'Night'], ['studio', 'Studio'], ['light', 'Light']]} />
        </Panel>
        <Tip>Files are parsed locally and never uploaded. For a .gltf with external buffers, drop the .gltf together with its .bin and texture files. Drag to orbit, scroll to zoom, right-drag to pan.</Tip>
      </div>
      <div>
        <Panel title={info ? info.name : 'Viewer'}>
          <View3D refEl={ref} height={440} />
        </Panel>
        {info && (
          <>
            <Stats>
              <Stat label="Triangles" value={num(info.tris, 0)} tone="accent" />
              <Stat label="Vertices" value={num(info.verts, 0)} />
              <Stat label="Meshes" value={info.meshes} sub={`${info.materials.length} materials`} />
              <Stat label="Format" value={info.format} sub={fmtBytes(info.size)} />
            </Stats>
            <Panel title="Details">
              <Table
                head={['Property', 'Value']}
                rows={[
                  ['Size (model units)', info.dims.map((d) => num(d, 3)).join(' × ')],
                  ['Animations', info.animations ? `${info.animations} (first one playing)` : 'none'],
                  ['UV coordinates', info.uv ? 'yes' : 'no'],
                  ['Vertex normals', info.normals ? 'yes' : 'no'],
                  ['Avg. triangles / mesh', num(info.tris / (info.meshes || 1), 0)],
                ]}
              />
            </Panel>
            <Panel title="Materials">
              <Table
                head={['Name', 'Type', 'Colour', 'Meshes', 'Texture maps']}
                rows={info.materials.map((m) => [
                  m.name,
                  <span key="t" className="mono">{m.type.replace('Material', '')}</span>,
                  m.color ? <span key="c" className="mono"><i style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: m.color, marginRight: 6, verticalAlign: -1, border: '1px solid var(--line)' }} />{m.color}</span> : '—',
                  m.meshes,
                  m.textures,
                ])}
              />
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
