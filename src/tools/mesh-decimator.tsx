import { useEffect, useMemo, useState } from 'react'
import { Btn, Check, download, FileDrop, fmt, Note, Panel, pct, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { measure, parseStl, sampleTorus, sampleVase, toBinaryStl } from './lib/stl-viewer'
import { parseObj, rockFactor, targetTriangles } from './lib/mesh-decimator'

/** Displaced icosphere ("asteroid"), Z-up triangle soup, ~33k triangles. */
function sampleRock(): Float32Array {
  const g = new THREE.IcosahedronGeometry(20, 40)
  const p = g.getAttribute('position') as THREE.BufferAttribute
  const out = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    const l = Math.hypot(x, y, z) || 1
    const f = 20 * rockFactor(x / l, y / l, z / l)
    out[i * 3] = (x / l) * f * 1.25
    out[i * 3 + 1] = (y / l) * f
    out[i * 3 + 2] = (z / l) * f * 0.85 + 20
  }
  g.dispose()
  return out
}

const SAMPLES = {
  rock: ['Asteroid (33k tris)', sampleRock],
  vase: ['Twisted vase (15k tris)', sampleVase],
  torus: ['Dense torus (37k tris)', () => sampleTorus(30, 10, 192, 96)],
} as const
type SampleKey = keyof typeof SAMPLES
type View = 'both' | 'orig' | 'dec'

const DEF = { ratio: 0.15, wire: true, flat: false, view: 'both' as View, color: '#38bdf8' }

interface Result { pos: Float32Array; geom: THREE.BufferGeometry; ms: number; verts: number }

const soupOf = (g: THREE.BufferGeometry) => {
  const ni = g.index ? g.toNonIndexed() : g
  const a = (ni.getAttribute('position') as THREE.BufferAttribute).array as Float32Array
  return new Float32Array(a)
}

export default function MeshDecimator() {
  const [s, set, reset] = useToolState('mesh-decimator', DEF)
  const [model, setModel] = useState<{ pos: Float32Array; name: string }>(() => ({ pos: sampleRock(), name: SAMPLES.rock[0] }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<Result | null>(null)

  const welded = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(model.pos, 3))
    return mergeVertices(g, 1e-4)
  }, [model])
  const before = useMemo(() => measure(model.pos), [model])
  const after = useMemo(() => (res ? measure(res.pos) : null), [res])
  const target = targetTriangles(before.triangles, s.ratio)

  useEffect(() => {
    let dead = false
    const t = setTimeout(async () => {
      setBusy(true)
      const t0 = performance.now()
      try {
        const vc = welded.getAttribute('position').count
        const g = s.ratio >= 1 ? welded.clone() : await new SimplifyModifier().modify(welded, Math.floor(vc * (1 - s.ratio)))
        if (dead) return
        setRes({ pos: soupOf(g), geom: g, ms: performance.now() - t0, verts: g.getAttribute('position').count })
        setErr('')
      } catch (e) {
        if (!dead) setErr(`Simplification failed: ${(e as Error).message}`)
      } finally {
        if (!dead) setBusy(false)
      }
    }, 180)
    return () => {
      dead = true
      clearTimeout(t)
    }
  }, [welded, s.ratio])

  const ref = useStage3D(
    (stage) => {
      const root = new THREE.Group()
      root.name = 'root'
      stage.scene.add(root)
    },
    (stage) => {
      const root = stage.scene.getObjectByName('root') as THREE.Group
      stage.clear(root)
      const maxDim = Math.max(...before.size) || 1
      const sc = 8 / maxDim
      const place = (geom: THREE.BufferGeometry, x: number, col: string, title: string) => {
        const holder = new THREE.Group()
        holder.rotation.x = -Math.PI / 2
        holder.scale.setScalar(sc)
        holder.position.x = x
        const inner = new THREE.Group()
        inner.position.set(-(before.min[0] + before.max[0]) / 2, -(before.min[1] + before.max[1]) / 2, -before.min[2])
        holder.add(inner)
        const g = geom.clone()
        g.computeVertexNormals()
        inner.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: col, roughness: 0.55, metalness: 0.05, flatShading: s.flat, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })))
        if (s.wire) inner.add(new THREE.LineSegments(new THREE.WireframeGeometry(geom), new THREE.LineBasicMaterial({ color: '#0f172a', transparent: true, opacity: 0.35 })))
        root.add(holder)
        const t = label(title, '#e2e8f0', 0.55)
        t.position.set(x, before.size[2] * sc + 0.9, 0)
        root.add(t)
      }
      const orig = new THREE.BufferGeometry()
      orig.setAttribute('position', new THREE.BufferAttribute(model.pos, 3))
      const dec = res?.geom
      if (s.view === 'both') {
        place(orig, -4.6, '#94a3b8', `Original · ${before.triangles.toLocaleString('en-US')}`)
        if (dec) place(dec, 4.6, s.color, `Decimated · ${(after?.triangles ?? 0).toLocaleString('en-US')}`)
      } else if (s.view === 'orig') place(orig, 0, '#94a3b8', `Original · ${before.triangles.toLocaleString('en-US')}`)
      else if (dec) place(dec, 0, s.color, `Decimated · ${(after?.triangles ?? 0).toLocaleString('en-US')}`)
      orig.dispose()
      stage.controls.target.set(0, (before.size[2] * sc) / 2, 0)
    },
    [model, res, s.wire, s.flat, s.view, s.color, before, after],
    { camera: [0, 7, 12.5], target: [0, 3, 0] },
  )

  const load = async (f: File) => {
    setErr('')
    try {
      const pos = /\.obj$/i.test(f.name) ? parseObj(await f.text()) : parseStl(await f.arrayBuffer()).pos
      if (pos.length / 9 > 2_000_000) throw new Error('Model has more than 2 million triangles; that is too large for in-browser decimation.')
      setRes(null)
      setModel({ pos, name: f.name })
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const base = model.name.replace(/\.[^.]+$/, '').replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'model'

  const exportGlb = async () => {
    if (!res) return
    const g = res.geom.clone()
    g.computeVertexNormals()
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.55, flatShading: s.flat }))
    mesh.name = base
    mesh.rotation.x = -Math.PI / 2 // STL/OBJ Z-up → glTF Y-up
    const scene = new THREE.Scene()
    scene.add(mesh)
    const out = await new GLTFExporter().parseAsync(scene, { binary: true })
    download(`${base}-${Math.round(s.ratio * 100)}pct.glb`, new Blob([out as ArrayBuffer], { type: 'model/gltf-binary' }), 'model/gltf-binary')
    g.dispose()
  }

  const dv = (a: number, b: number) => (a ? (b - a) / a : 0)
  const volChange = after ? dv(before.volume, after.volume) : 0
  const areaChange = after ? dv(before.area, after.area) : 0

  return (
    <div>
      <Stats>
        <Stat label="Original triangles" value={before.triangles.toLocaleString('en-US')} sub={`${welded.getAttribute('position').count.toLocaleString('en-US')} vertices`} />
        <Stat label="Decimated triangles" value={after ? after.triangles.toLocaleString('en-US') : '…'} sub={res ? `${res.verts.toLocaleString('en-US')} vertices` : 'working'} tone="accent" />
        <Stat label="Reduction" value={after ? pct(1 - after.triangles / before.triangles, 1) : '…'} sub={`target ${target.toLocaleString('en-US')} tris`} tone="good" />
        <Stat label="Shape fidelity" value={after ? `${volChange >= 0 ? '+' : ''}${pct(volChange, 2)} vol` : '…'} sub={after ? `${areaChange >= 0 ? '+' : ''}${pct(areaChange, 2)} surface area` : ''} tone={Math.abs(volChange) > 0.03 ? 'bad' : undefined} />
      </Stats>
      <Split wide="left">
        <Panel
          title={<>Model: <span style={{ color: 'var(--accent)' }}>{model.name}</span>{busy && <span className="muted"> · simplifying…</span>}</>}
          actions={<Seg value={s.view} onChange={(view) => set({ view })} options={[['both', 'Side by side'], ['orig', 'Before'], ['dec', 'After']]} />}
        >
          <View3D refEl={ref} height={470} />
          <p className="muted" style={{ fontSize: 12 }}>Drag to orbit, right-drag to pan, scroll to zoom. The wireframe overlay shows how triangle density changes.</p>
        </Panel>
        <div>
          <Panel title="Target" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Slider label="Keep" value={s.ratio} min={0.01} max={1} step={0.01} onChange={(ratio) => set({ ratio })} show={(v) => `${Math.round(v * 100)}`} unit="% of triangles" />
            <Row>
              {[0.5, 0.25, 0.1, 0.05, 0.02].map((r) => (
                <Btn key={r} kind={Math.abs(s.ratio - r) < 1e-9 ? 'primary' : 'normal'} onClick={() => set({ ratio: r })}>{r * 100}%</Btn>
              ))}
            </Row>
            <Row>
              <Check label="Wireframe" value={s.wire} onChange={(wire) => set({ wire })} />
              <Check label="Flat shading" value={s.flat} onChange={(flat) => set({ flat })} />
              <label className="k-check">
                <input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} style={{ width: 32, height: 22, border: 'none', background: 'none', padding: 0 }} /> Colour
              </label>
            </Row>
            {err && <Note tone="err">{err}</Note>}
            {after && Math.abs(volChange) > 0.03 && <Note tone="warn">Volume changed by {pct(Math.abs(volChange), 1)}. Silhouette details are being lost; keep more triangles if this is for printing.</Note>}
          </Panel>
          <Panel title="Open model">
            <FileDrop accept=".stl,.obj,model/stl,model/obj" onFiles={(fs) => void load(fs[0])} label="Drop an .stl (binary/ASCII) or .obj file" />
            <Select
              label="Sample model"
              value={'' as string}
              onChange={(v) => {
                if (!v) return
                const [name, gen] = SAMPLES[v as SampleKey]
                setRes(null)
                setModel({ pos: gen(), name })
              }}
              options={[['', 'Choose…'], ...Object.entries(SAMPLES).map(([k, v]) => [k, v[0]] as [string, string])]}
            />
            <p className="muted" style={{ fontSize: 12 }}>Vertices are welded first, then edges are collapsed with the quadric-error simplifier (meshoptimizer via three.js SimplifyModifier). Files never leave your browser.</p>
          </Panel>
          <Panel title="Export decimated mesh">
            <Row>
              <Btn kind="primary" disabled={!res} onClick={() => void exportGlb()}>⬇ GLB (glTF binary)</Btn>
              <Btn disabled={!res} onClick={() => res && download(`${base}-${Math.round(s.ratio * 100)}pct.stl`, new Blob([toBinaryStl(res.pos, base)]), 'model/stl')}>⬇ STL</Btn>
            </Row>
            {after && (
              <Table
                head={['', 'Before', 'After']}
                rows={[
                  ['Triangles', before.triangles.toLocaleString('en-US'), after.triangles.toLocaleString('en-US')],
                  ['Binary STL size', `${fmt((84 + before.triangles * 50) / 1024, 4)} KB`, `${fmt((84 + after.triangles * 50) / 1024, 4)} KB`],
                  ['Volume', fmt(before.volume, 6), fmt(after.volume, 6)],
                  ['Surface area', fmt(before.area, 6), fmt(after.area, 6)],
                  ['Size X×Y×Z', before.size.map((v) => fmt(v, 4)).join('×'), after.size.map((v) => fmt(v, 4)).join('×')],
                  ['Open edges', before.openEdges, after.openEdges],
                  ['Time', '', `${fmt(res?.ms ?? 0, 3)} ms`],
                ]}
              />
            )}
          </Panel>
        </div>
      </Split>
    </div>
  )
}
