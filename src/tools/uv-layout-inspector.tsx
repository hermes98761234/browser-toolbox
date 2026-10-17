import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, color, CsvButton, FileDrop, Note, num, Panel, pct, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { analyze, anisoColor, densityColor, weightedPercentile, type UvMesh } from './lib/uv-layout-inspector'

type Mode = 'checker' | 'density' | 'aniso' | 'islands'
const DEF = { model: 'flawed', mode: 'checker' as Mode, checker: 8, wire: true }

const MODELS: [string, string][] = [
  ['flawed', 'Crate · flawed unwrap (demo)'],
  ['cross', 'Crate · clean cross unwrap'],
  ['box', 'Three.js box (all faces stacked)'],
  ['sphere', 'UV sphere'],
  ['cylinder', 'Cylinder'],
  ['torus', 'Torus'],
  ['knot', 'Torus knot'],
]

type V3 = [number, number, number]
/** Quad o, o+a, o+a+b, o+b mapped to the UV rectangle [u, v, w, h]; subdivided n×n. */
function face(pos: number[], uv: number[], o: V3, a: V3, b: V3, r: [number, number, number, number], n = 2) {
  const P = (s: number, t: number) => [0, 1, 2].map((k) => o[k] + a[k] * s + b[k] * t)
  const U = (s: number, t: number) => [r[0] + r[2] * s, r[1] + r[3] * t]
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const c: [number, number][] = [[i / n, j / n], [(i + 1) / n, j / n], [(i + 1) / n, (j + 1) / n], [i / n, (j + 1) / n]]
      for (const k of [0, 1, 2, 0, 2, 3]) {
        pos.push(...P(...c[k]))
        uv.push(...U(...c[k]))
      }
    }
}

function crate(flawed: boolean): UvMesh {
  const pos: number[] = [], uv: number[] = []
  const q = 0.25
  face(pos, uv, [-1, -1, 1], [2, 0, 0], [0, 2, 0], [q, 0.375, q, q])
  face(pos, uv, [1, -1, 1], [0, 0, -2], [0, 2, 0], flawed ? [0.5, 0.375, 0.08, q] : [0.5, 0.375, q, q])
  face(pos, uv, [1, -1, -1], [-2, 0, 0], [0, 2, 0], flawed ? [0.62, 0.375, q, q] : [0.75, 0.375, q, q])
  face(pos, uv, [-1, -1, -1], [0, 0, 2], [0, 2, 0], [0, 0.375, q, q])
  face(pos, uv, [-1, 1, 1], [2, 0, 0], [0, 0, -2], flawed ? [0.33, 0.5, q, q] : [q, 0.625, q, q])
  face(pos, uv, [-1, -1, -1], [2, 0, 0], [0, 0, 2], flawed ? [0.55, 0.01, 0.36, 0.36] : [q, 0.125, q, q])
  return { pos: new Float32Array(pos), uv: new Float32Array(uv) }
}

/** Flattens any indexed/non-indexed geometry with a uv attribute into a triangle soup. */
function soup(geoms: { g: THREE.BufferGeometry; m?: THREE.Matrix4 }[]): UvMesh {
  const pos: number[] = [], uv: number[] = [], nrm: number[] = []
  const v = new THREE.Vector3(), nm = new THREE.Matrix3()
  for (const { g, m } of geoms) {
    const p = g.getAttribute('position'), t = g.getAttribute('uv'), n = g.getAttribute('normal')
    if (!p || !t) continue
    if (m) nm.getNormalMatrix(m)
    const idx = g.index
    const cnt = idx ? idx.count : p.count
    for (let i = 0; i < cnt - (cnt % 3); i++) {
      const k = idx ? idx.getX(i) : i
      v.fromBufferAttribute(p, k)
      if (m) v.applyMatrix4(m)
      pos.push(v.x, v.y, v.z)
      uv.push(t.getX(k), t.getY(k))
      if (n) {
        v.fromBufferAttribute(n, k)
        if (m) v.applyMatrix3(nm).normalize()
        nrm.push(v.x, v.y, v.z)
      }
    }
  }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), nrm: nrm.length === pos.length ? new Float32Array(nrm) : undefined }
}

function builtin(k: string): UvMesh {
  if (k === 'flawed' || k === 'cross') return crate(k === 'flawed')
  const g =
    k === 'box' ? new THREE.BoxGeometry(2, 2, 2)
    : k === 'sphere' ? new THREE.SphereGeometry(1.4, 32, 16)
    : k === 'cylinder' ? new THREE.CylinderGeometry(1, 1, 2.6, 24, 2)
    : k === 'torus' ? new THREE.TorusGeometry(1.2, 0.45, 16, 40)
    : new THREE.TorusKnotGeometry(1, 0.32, 128, 12)
  const m = soup([{ g }])
  g.dispose()
  return m
}

function checkerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 512
  const g = c.getContext('2d')!
  const n = 8, s = 512 / n
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      g.fillStyle = (i + j) % 2 ? `hsl(${(i * 40 + j * 12) % 360} 55% 62%)` : '#f1f5f9'
      g.fillRect(i * s, j * s, s, s)
      g.fillStyle = (i + j) % 2 ? '#0f172a' : '#64748b'
      g.font = 'bold 22px system-ui, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(`${String.fromCharCode(65 + i)}${n - j}`, i * s + s / 2, j * s + s / 2)
    }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

const islandRgb = (i: number) => new THREE.Color(color(i))

export default function UvLayoutInspector() {
  const [s, set, reset] = useToolState('uv-layout-inspector', DEF)
  const [file, setFile] = useState<{ mesh: UvMesh; name: string; skipped: number } | null>(null)
  const [err, setErr] = useState('')
  const [sel, setSel] = useState(-1)
  const [hover, setHover] = useState<{ t: number; x: number; y: number } | null>(null)
  const mesh = useMemo(() => file?.mesh ?? builtin(s.model), [file, s.model])
  const rep = useMemo(() => analyze(mesh, 512), [mesh])
  const name = file?.name ?? MODELS.find((m) => m[0] === s.model)?.[1] ?? ''

  const triColor = (t: number): [number, number, number] => {
    if (s.mode === 'density') return densityColor(rep.density[t])
    if (s.mode === 'aniso') return anisoColor(rep.aniso[t])
    const c = islandRgb(rep.island[t])
    return [c.r, c.g, c.b]
  }

  const islandRows = useMemo(() => {
    const rows = Array.from({ length: rep.islands }, (_, i) => ({ i, tris: 0, uv: 0, ov: 0 }))
    for (let t = 0; t < rep.tris; t++) {
      const r = rows[rep.island[t]]
      r.tris++
      r.uv += Math.abs((mesh.uv[6 * t + 2] - mesh.uv[6 * t]) * (mesh.uv[6 * t + 5] - mesh.uv[6 * t + 1]) - (mesh.uv[6 * t + 4] - mesh.uv[6 * t]) * (mesh.uv[6 * t + 3] - mesh.uv[6 * t + 1])) / 2
      r.ov += rep.overlap[t]
    }
    return rows.map((r) => ({ ...r, dens: r.uv / (rep.uvArea || 1) }))
  }, [rep, mesh])

  // Per-island texel density = island UV share / island 3D share.
  const island3d = useMemo(() => {
    const a = new Float64Array(rep.islands)
    for (let t = 0; t < rep.tris; t++) {
      const p = mesh.pos, o = 9 * t
      const ax = p[o + 3] - p[o], ay = p[o + 4] - p[o + 1], az = p[o + 5] - p[o + 2]
      const bx = p[o + 6] - p[o], by = p[o + 7] - p[o + 1], bz = p[o + 8] - p[o + 2]
      a[rep.island[t]] += Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2
    }
    return a
  }, [rep, mesh])

  const w3 = useMemo(() => {
    const w = new Float64Array(rep.tris)
    for (let t = 0; t < rep.tris; t++) w[t] = rep.density[t] > 0 ? 1 : 0
    return w
  }, [rep])
  const p10 = weightedPercentile(rep.density, w3, 0.1)
  const p90 = weightedPercentile(rep.density, w3, 0.9)
  const anisoMed = weightedPercentile(rep.aniso, w3, 0.5)
  const anisoP90 = weightedPercentile(rep.aniso, w3, 0.9)

  // ---------- 3D ----------
  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'model'
      st.scene.add(g)
      const tex = checkerTexture()
      st.scene.userData.tex = tex
      return () => tex.dispose()
    },
    (st) => {
      const root = st.scene.getObjectByName('model') as THREE.Group
      st.clear(root)
      const tex = st.scene.userData.tex as THREE.CanvasTexture
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(mesh.pos, 3))
      geo.setAttribute('uv', new THREE.BufferAttribute(mesh.uv, 2))
      if (mesh.nrm) geo.setAttribute('normal', new THREE.BufferAttribute(mesh.nrm, 3))
      else geo.computeVertexNormals()
      const col = new Float32Array(rep.tris * 9)
      for (let t = 0; t < rep.tris; t++) {
        let c = s.mode === 'checker' ? [1, 1, 1] : triColor(t)
        if (rep.overlap[t] && s.mode !== 'checker') c = [0.94, 0.27, 0.27]
        if (sel >= 0 && rep.island[t] !== sel) c = c.map((x) => x * 0.3)
        for (let k = 0; k < 3; k++) col.set(c, 9 * t + 3 * k)
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      tex.repeat.set(s.checker / 8, s.checker / 8)
      tex.needsUpdate = true
      const mat = new THREE.MeshStandardMaterial({ map: s.mode === 'checker' ? tex : null, vertexColors: true, side: THREE.DoubleSide, roughness: 0.75 })
      const m = new THREE.Mesh(geo, mat)
      geo.computeBoundingBox()
      const bb = geo.boundingBox!
      const size = bb.getSize(new THREE.Vector3())
      const cen = bb.getCenter(new THREE.Vector3())
      const k = 4 / (Math.max(size.x, size.y, size.z) || 1)
      const holder = new THREE.Group()
      holder.scale.setScalar(k)
      m.position.copy(cen).multiplyScalar(-1)
      holder.add(m)
      if (s.wire) {
        const wf = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.25 }))
        wf.position.copy(m.position)
        holder.add(wf)
      }
      holder.position.y = 2.2
      root.add(holder)
    },
    [mesh, rep, s.mode, s.checker, s.wire, sel],
    { camera: [5, 5, 6], target: [0, 2.2, 0] },
  )

  // ---------- 2D UV canvas ----------
  const cv = useRef<HTMLCanvasElement>(null)
  const view = useMemo(() => {
    const [u0, v0, u1, v1] = rep.bounds
    const lo = Math.min(0, u0, v0), hi = Math.max(1, u1, v1)
    return { lo, span: hi - lo || 1 }
  }, [rep])

  const draw = (c: HTMLCanvasElement, W: number, highlight: number, forExport = false) => {
    const g = c.getContext('2d')!
    const pad = W * 0.04
    const S = (W - 2 * pad) / view.span
    const X = (u: number) => pad + (u - view.lo) * S
    const Y = (v: number) => W - pad - (v - view.lo) * S
    g.clearRect(0, 0, W, W)
    g.fillStyle = forExport ? '#ffffff' : '#0f172a'
    g.fillRect(0, 0, W, W)
    // 0–1 tile with a faint 8×8 grid
    g.strokeStyle = forExport ? '#e2e8f0' : '#1e293b'
    g.lineWidth = 1
    for (let i = 1; i < 8; i++) {
      g.beginPath(); g.moveTo(X(i / 8), Y(0)); g.lineTo(X(i / 8), Y(1)); g.stroke()
      g.beginPath(); g.moveTo(X(0), Y(i / 8)); g.lineTo(X(1), Y(i / 8)); g.stroke()
    }
    g.strokeStyle = forExport ? '#64748b' : '#94a3b8'
    g.lineWidth = 1.5
    g.strokeRect(X(0), Y(1), S, S)
    const u = mesh.uv
    for (let t = 0; t < rep.tris; t++) {
      const [r, gg, b] = triColor(t)
      const dim = highlight >= 0 && rep.island[t] !== highlight
      g.beginPath()
      g.moveTo(X(u[6 * t]), Y(u[6 * t + 1]))
      g.lineTo(X(u[6 * t + 2]), Y(u[6 * t + 3]))
      g.lineTo(X(u[6 * t + 4]), Y(u[6 * t + 5]))
      g.closePath()
      g.fillStyle = rep.overlap[t] ? 'rgba(239,68,68,0.55)' : `rgba(${(r * 255) | 0},${(gg * 255) | 0},${(b * 255) | 0},${dim ? 0.12 : s.mode === 'checker' || s.mode === 'islands' ? 0.45 : 0.85})`
      g.fill()
      if (s.wire) {
        g.strokeStyle = forExport ? 'rgba(15,23,42,0.6)' : dim ? 'rgba(226,232,240,0.15)' : 'rgba(226,232,240,0.7)'
        g.lineWidth = forExport ? 1.2 : 0.6
        g.stroke()
      }
    }
    if (hover && !forExport) {
      const t = hover.t
      g.beginPath()
      g.moveTo(X(u[6 * t]), Y(u[6 * t + 1]))
      g.lineTo(X(u[6 * t + 2]), Y(u[6 * t + 3]))
      g.lineTo(X(u[6 * t + 4]), Y(u[6 * t + 5]))
      g.closePath()
      g.strokeStyle = '#facc15'
      g.lineWidth = 2
      g.stroke()
    }
    return { X, Y, S, pad }
  }

  useEffect(() => {
    const c = cv.current
    if (!c) return
    const W = c.clientWidth || 480
    const dpr = Math.min(2, devicePixelRatio || 1)
    c.width = c.height = W * dpr
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw(c, W, sel)
  })

  const pick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget
    const W = c.clientWidth
    const pad = W * 0.04, S = (W - 2 * pad) / view.span
    const r = c.getBoundingClientRect()
    const pu = (e.clientX - r.left - pad) / S + view.lo
    const pv = (W - pad - (e.clientY - r.top)) / S + view.lo
    const u = mesh.uv
    for (let t = rep.tris - 1; t >= 0; t--) {
      const ax = u[6 * t], ay = u[6 * t + 1], bx = u[6 * t + 2], by = u[6 * t + 3], cx = u[6 * t + 4], cy = u[6 * t + 5]
      const d1 = (pu - bx) * (ay - by) - (ax - bx) * (pv - by)
      const d2 = (pu - cx) * (by - cy) - (bx - cx) * (pv - cy)
      const d3 = (pu - ax) * (cy - ay) - (cx - ax) * (pv - ay)
      const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0
      if (!(neg && pos)) return { t, x: e.clientX - r.left, y: e.clientY - r.top }
    }
    return null
  }

  const exportPng = () => {
    const c = document.createElement('canvas')
    c.width = c.height = 2048
    draw(c, 2048, -1, true)
    c.toBlob((b) => {
      if (!b) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = `${name.replace(/\W+/g, '-').toLowerCase()}-uv-layout.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    })
  }

  const load = async (f: File) => {
    setErr('')
    setSel(-1)
    try {
      const ext = f.name.toLowerCase().split('.').pop()
      let obj: THREE.Object3D
      if (ext === 'obj') {
        const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
        obj = new OBJLoader().parse(await f.text())
      } else if (ext === 'glb' || ext === 'gltf') {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
        const data = ext === 'glb' ? await f.arrayBuffer() : await f.text()
        obj = (await new GLTFLoader().parseAsync(data, '')).scene
      } else return setErr('Open an .obj, .glb or self-contained .gltf file.')
      obj.updateMatrixWorld(true)
      const list: { g: THREE.BufferGeometry; m: THREE.Matrix4 }[] = []
      let skipped = 0
      obj.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        if (m.geometry.getAttribute('uv')) list.push({ g: m.geometry, m: m.matrixWorld })
        else skipped++
      })
      const sm = soup(list)
      if (!sm.uv.length) return setErr(skipped ? `None of the ${skipped} mesh(es) in this file has UV coordinates. Unwrap it first.` : 'No meshes found in this file.')
      if (sm.uv.length / 6 > 400000) return setErr('This model has more than 400k triangles; decimate it first.')
      setFile({ mesh: sm, name: f.name, skipped })
    } catch (e) {
      setErr(`Could not read the file: ${(e as Error).message}`)
    }
  }

  const findings: [string, 'ok' | 'warn' | 'err'][] = []
  if (rep.overlapTris) findings.push([`${rep.overlapTris} triangles overlap other UVs (${pct(rep.overlapShare)} of used texels are shared). Fine for intentional mirroring; a bug for baked lightmaps/AO.`, 'err'])
  if (rep.outside) findings.push([`${rep.outside} triangles reach outside 0–1. They wrap/tile, which breaks baking and UDIM-less atlases.`, 'warn'])
  if (p90 / p10 > 2) findings.push([`Texel density varies ${num(p90 / p10, 1)}× between the 10th and 90th percentile — some parts will look blurry next to sharp ones.`, 'warn'])
  if (anisoP90 > 1.5 && anisoMed <= 1.5) findings.push([`Most of the mesh is fine, but 10% of the surface is stretched more than ${num(anisoP90, 2)}:1 — check the Stretch view.`, 'warn'])
  if (anisoMed > 1.5) findings.push([`Median anisotropy ${num(anisoMed, 2)}: checker squares are stretched into rectangles. Add seams or relax the unwrap.`, 'warn'])
  if (rep.flipped && rep.flipped < rep.tris) findings.push([`${rep.flipped} triangles are mirrored in UV space; normal maps will light them inverted unless tangents handle it.`, 'warn'])
  if (rep.degenerate) findings.push([`${rep.degenerate} triangles have zero UV or 3D area.`, 'warn'])
  if (rep.coverage < 0.5 && !rep.outside) findings.push([`Only ${pct(rep.coverage)} of the texture is used. Pack islands tighter or scale them up.`, 'warn'])
  if (!findings.length) findings.push(['Clean layout: no overlaps, uniform density, everything inside 0–1.', 'ok'])

  const hv = hover ? hover.t : -1
  return (
    <Split>
      <div>
        <Panel title="Model" actions={<Btn kind="ghost" onClick={() => { reset(); setFile(null); setSel(-1) }}>Reset</Btn>}>
          <Select label="Sample" value={s.model} onChange={(model) => { set({ model }); setFile(null); setSel(-1) }} options={MODELS} />
          <FileDrop accept=".obj,.glb,.gltf" onFiles={(f) => void load(f[0])} label="…or drop your own .obj / .glb / .gltf" />
          {file && <p className="k-hint">Loaded <b>{file.name}</b>{file.skipped ? ` · ${file.skipped} mesh(es) without UVs skipped` : ''}</p>}
          {err && <Note tone="err">{err}</Note>}
          <div style={{ margin: '10px 0' }}>
            <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['checker', 'Checker'], ['density', 'Texel density'], ['aniso', 'Stretch'], ['islands', 'Islands']]} />
          </div>
          {s.mode === 'checker' && <Slider label="Checker tiles across 0–1" value={s.checker} onChange={(checker) => set({ checker })} min={2} max={32} step={2} show={(v) => String(v)} />}
          <label className="k-check"><input type="checkbox" checked={s.wire} onChange={(e) => set({ wire: e.target.checked })} /> Show wireframe</label>
        </Panel>
        <Panel title="UV layout" actions={<Btn onClick={exportPng}>⬇ PNG 2048</Btn>}>
          <div style={{ position: 'relative' }}>
            <canvas
              ref={cv}
              style={{ width: '100%', aspectRatio: '1', display: 'block', borderRadius: 8, cursor: 'crosshair', touchAction: 'none' }}
              onPointerMove={(e) => setHover(pick(e))}
              onPointerLeave={() => setHover(null)}
              onClick={(e) => {
                const h = pick(e)
                setSel(h && rep.island[h.t] !== sel ? rep.island[h.t] : -1)
              }}
            />
            {hover && (
              <div className="k-tip" style={{ left: Math.min(hover.x + 12, 220), top: hover.y + 12 }}>
                Triangle {hv} · island {rep.island[hv] + 1}<br />
                Density <b>{num(rep.density[hv], 2)}×</b> · stretch <b>{Number.isFinite(rep.aniso[hv]) ? num(rep.aniso[hv], 2) : '∞'}</b>
                {rep.overlap[hv] ? <><br /><b style={{ color: 'var(--err)' }}>overlaps</b></> : null}
              </div>
            )}
          </div>
          <p className="k-hint">
            {s.mode === 'density' ? 'White = average texel density; blue = more texels than average, red = fewer (blurry). ' : s.mode === 'aniso' ? 'Orange/red = checker squares stretched into rectangles. ' : 'Each colour is one UV island. '}
            Red = overlapping UVs. Click an island to isolate it in 3D.
          </p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="0–1 coverage" value={pct(rep.coverage)} sub={`${num(rep.tris, 0)} tris · ${rep.islands} islands`} tone="accent" />
          <Stat label="Overlapping" value={num(rep.overlapTris, 0)} sub="triangles" tone={rep.overlapTris ? 'bad' : 'good'} />
          <Stat label="Density spread" value={Number.isFinite(p90 / p10) ? `${num(p90 / p10, 2)}×` : '—'} sub="P90 / P10" tone={p90 / p10 > 2 ? 'bad' : 'good'} />
          <Stat label="Stretch" value={num(anisoP90, 2)} sub="P90 anisotropy (1 = none)" tone={anisoP90 > 1.5 ? 'bad' : 'good'} />
        </Stats>
        <Panel title={`3D preview · ${name}`}>
          <View3D refEl={ref} height={400} />
          <p className="k-hint">Drag to orbit, scroll to zoom. {sel >= 0 ? `Island ${sel + 1} isolated — click it again in the UV view to clear.` : ''}</p>
        </Panel>
        <Panel title="Findings">
          {findings.map(([t, tone], i) => <Note key={i} tone={tone}>{t}</Note>)}
        </Panel>
        <Panel title="UV islands" actions={<CsvButton name="uv-islands.csv" rows={() => [['Island', 'Triangles', 'UV area %', 'Relative density', 'Overlapping tris'], ...islandRows.map((r) => [r.i + 1, r.tris, (r.dens * 100).toFixed(2), (r.uv / (rep.uvArea || 1) / (island3d[r.i] / (rep.area3d || 1))).toFixed(3), r.ov])]} />}>
          <Table
            max={40}
            head={['', 'Island', 'Tris', 'UV area', 'Density', 'Overlap']}
            rows={islandRows.map((r) => {
              const d = r.uv / (rep.uvArea || 1) / (island3d[r.i] / (rep.area3d || 1))
              return [
                <i key="c" style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: color(r.i) }} />,
                <button key="b" type="button" className="k-btn ghost" onClick={() => setSel(sel === r.i ? -1 : r.i)}>{sel === r.i ? '● ' : ''}#{r.i + 1}</button>,
                r.tris,
                pct(r.uv),
                <span key="d" style={{ color: Math.abs(Math.log2(d)) > 0.5 ? 'var(--warn)' : undefined }}>{num(d, 2)}×</span>,
                r.ov ? <b key="o" style={{ color: 'var(--err)' }}>{r.ov}</b> : '—',
              ]
            })}
          />
        </Panel>
      </div>
    </Split>
  )
}
