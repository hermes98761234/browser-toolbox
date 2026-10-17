import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, color, download, FileDrop, Note, num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { dist, geometry, type Geometry, headerInfo, IDENT, lengthUnit, matMul, parseStep, partReps, sampleStep, structure, type TreeNode } from './lib/step-file-viewer'

interface Inst { key: string; pd: number; name: string; m: number[]; depth: number; ci: number }
type Vec = [number, number, number]

const tri = (c: [number, number][], h: [number, number][][]) =>
  THREE.ShapeUtils.triangulateShape(c.map(([x, y]) => new THREE.Vector2(x, y)), h.map((hh) => hh.map(([x, y]) => new THREE.Vector2(x, y))))

const DEF = { faces: true, edges: true, verts: false, explode: 0 }

export default function StepFileViewer() {
  const [s, set] = useToolState('step-file-viewer', DEF)
  const [file, setFile] = useState(() => ({ name: 'bracket-assembly.step (sample)', text: sampleStep(), size: 0 }))
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<string | null>(null)
  const [mode, setMode] = useState<'select' | 'measure'>('select')
  const [picks, setPicks] = useState<Vec[]>([])

  const parsed = useMemo(() => {
    try {
      const f = parseStep(file.text)
      const st = structure(f)
      return { f, st, unit: lengthUnit(f), head: headerInfo(f), err: '' }
    } catch (e) {
      return { f: null, st: null, unit: { name: 'mm', metres: 1e-3 }, head: null, err: (e as Error).message }
    }
  }, [file.text])
  const { f, st, unit } = parsed

  // instances (flattened tree) and per-product geometry
  const { insts, geo, fallback } = useMemo(() => {
    const insts: Inst[] = []
    const geo = new Map<number, Geometry>()
    if (!f || !st) return { insts, geo, fallback: false }
    const pdIndex = new Map<number, number>()
    const walk = (n: TreeNode, parent: number[], depth: number) => {
      const m = matMul(parent, n.m)
      if (!pdIndex.has(n.pd)) pdIndex.set(n.pd, pdIndex.size)
      insts.push({ key: n.key, pd: n.pd, name: n.instance && n.instance !== n.name ? `${n.name} (${n.instance})` : n.name, m, depth, ci: pdIndex.get(n.pd)! })
      n.children.forEach((c) => walk(c, m, depth + 1))
    }
    st.roots.forEach((r) => walk(r, IDENT, 0))
    let any = false
    for (const pd of new Set(insts.map((i) => i.pd))) {
      const reps = (st.shapeOf.get(pd) ?? []).flatMap((r) => partReps(f, r))
      if (!reps.length) continue
      const g = geometry(f, reps, tri)
      if (g.lines.length || g.tris.length || g.vertices.length) {
        geo.set(pd, g)
        any = true
      }
    }
    if (!any) {
      // no product structure: draw everything that hangs off any representation
      const roots = [...f.ents.values()].filter((e) => e.parts.some((p) => /REPRESENTATION$/.test(p.type) && !/RELATIONSHIP/.test(p.type))).map((e) => e.id)
      const g = geometry(f, roots.length ? roots : [...f.ents.keys()], tri)
      geo.set(-1, g)
      insts.length = 0
      insts.push({ key: 'all', pd: -1, name: 'All geometry (no product structure)', m: IDENT, depth: 0, ci: 0 })
    }
    return { insts, geo, fallback: !any }
  }, [f, st])

  const isHidden = (key: string) => [...hidden].some((h) => key === h || key.startsWith(h + '/'))
  const totals = useMemo(() => {
    const t = { planar: 0, cylinder: 0, tessellated: 0, other: 0, edges: 0, tris: 0 }
    for (const i of insts) {
      const g = geo.get(i.pd)
      if (!g) continue
      t.planar += g.faces.planar
      t.cylinder += g.faces.cylinder
      t.tessellated += g.faces.tessellated
      t.other += g.faces.other
      t.edges += g.lines.length
      t.tris += g.tris.length / 9
    }
    return t
  }, [insts, geo])

  const modelRef = useRef<THREE.Group | null>(null)
  const modeRef = useRef(mode)
  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  const bb = useMemo(() => {
    const b = new THREE.Box3()
    const v = new THREE.Vector3()
    for (const i of insts) {
      const g = geo.get(i.pd)
      if (!g) continue
      const M = new THREE.Matrix4().fromArray(i.m)
      for (const arr of [g.tris, ...g.lines, g.vertices.flat()]) for (let k = 0; k + 2 < arr.length; k += 3) b.expandByPoint(v.set(arr[k], arr[k + 1], arr[k + 2]).applyMatrix4(M))
    }
    return b.isEmpty() ? null : { min: b.min.toArray(), max: b.max.toArray() }
  }, [insts, geo])
  const ref = useStage3D(
    (stg) => {
      const el = stg.renderer.domElement
      const ray = new THREE.Raycaster()
      let down: [number, number] | null = null
      const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY])
      const onUp = (e: PointerEvent) => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return
        const model = modelRef.current
        if (!model) return
        const r = el.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), stg.camera)
        ray.params.Points = { threshold: 0.12 }
        ray.params.Line = { threshold: 0.05 }
        const hits = ray.intersectObjects(model.children, true).filter((h) => h.object.visible && h.object.userData.kind !== 'measure')
        const hit = hits.find((h) => h.object.userData.kind === 'vert') ?? hits[0]
        if (modeRef.current === 'measure') {
          if (!hit) return
          const local = model.worldToLocal(hit.point.clone())
          setPicks((p) => (p.length >= 2 ? [[local.x, local.y, local.z]] : [...p, [local.x, local.y, local.z]]))
        } else setSel(hit ? (hit.object.parent?.userData.key ?? null) : null)
      }
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointerup', onUp)
      return () => {
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointerup', onUp)
      }
    },
    (stg) => {
      let wrap = stg.scene.getObjectByName('wrap') as THREE.Group | undefined
      const fresh = !wrap || wrap.userData.file !== file.text.length + file.name
      if (!wrap) {
        wrap = new THREE.Group()
        wrap.name = 'wrap'
        stg.scene.add(wrap)
      }
      stg.clear(wrap)
      const model = new THREE.Group()
      model.rotation.x = -Math.PI / 2 // CAD Z-up → scene Y-up
      wrap.add(model)
      modelRef.current = model
      // instance bounding centres for exploding
      const centres = insts.map((i) => {
        const g = geo.get(i.pd)
        if (!g || (!g.tris.length && !g.lines.length && !g.vertices.length)) return null
        const b = new THREE.Box3()
        const v = new THREE.Vector3()
        const all = [g.tris, ...g.lines, g.vertices.flat()]
        for (const arr of all) for (let k = 0; k + 2 < arr.length; k += 3) b.expandByPoint(v.set(arr[k], arr[k + 1], arr[k + 2]))
        return b.getCenter(new THREE.Vector3()).applyMatrix4(new THREE.Matrix4().fromArray(i.m))
      })
      const valid = centres.filter((c): c is THREE.Vector3 => !!c)
      const mid = valid.reduce((a, c) => a.add(c), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, valid.length))
      insts.forEach((ins, idx) => {
        const g = geo.get(ins.pd)
        if (!g || isHidden(ins.key)) return
        const grp = new THREE.Group()
        grp.userData.key = ins.key
        const M = new THREE.Matrix4().fromArray(ins.m)
        if (s.explode && centres[idx]) M.premultiply(new THREE.Matrix4().makeTranslation(centres[idx]!.clone().sub(mid).multiplyScalar(s.explode)))
        grp.matrixAutoUpdate = false
        grp.matrix.copy(M)
        const on = sel === ins.key
        const col = new THREE.Color(color(ins.ci))
        if (s.faces && g.tris.length) {
          const bg = new THREE.BufferGeometry()
          bg.setAttribute('position', new THREE.Float32BufferAttribute(g.tris, 3))
          bg.computeVertexNormals()
          const mesh = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: col, metalness: 0.15, roughness: 0.55, side: THREE.DoubleSide, flatShading: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, emissive: on ? new THREE.Color('#f59e0b') : new THREE.Color(0), emissiveIntensity: on ? 0.35 : 0 }))
          mesh.userData.kind = 'face'
          grp.add(mesh)
        }
        if (s.edges && g.lines.length) {
          const seg: number[] = []
          for (const l of g.lines) for (let k = 0; k + 5 < l.length; k += 3) seg.push(l[k], l[k + 1], l[k + 2], l[k + 3], l[k + 4], l[k + 5])
          const lg = new THREE.BufferGeometry()
          lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3))
          const ls = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: on ? 0xf59e0b : s.faces && g.tris.length ? 0x0f172a : col.getHex() }))
          ls.userData.kind = 'edge'
          grp.add(ls)
        }
        if ((s.verts || mode === 'measure' || !g.lines.length) && g.vertices.length) {
          const pg = new THREE.BufferGeometry()
          pg.setAttribute('position', new THREE.Float32BufferAttribute(g.vertices.flat(), 3))
          const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: mode === 'measure' ? 0xfbbf24 : col.getHex(), size: 4, sizeAttenuation: false }))
          pts.userData.kind = 'vert'
          grp.add(pts)
        }
        model.add(grp)
      })
      // fit: scale so the largest dimension is 8 scene units and sit on the grid
      model.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(model)
      if (!box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3())
        const k = 8 / Math.max(size.x, size.y, size.z, 1e-9)
        model.scale.setScalar(k)
        const c = box.getCenter(new THREE.Vector3())
        model.position.set(-c.x * k, -box.min.y * k, -c.z * k)
      }
      // measurement overlay (model coordinates = file units)
      if (picks.length) {
        const pg = new THREE.BufferGeometry()
        pg.setAttribute('position', new THREE.Float32BufferAttribute(picks.flat(), 3))
        const mp = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xef4444, size: 9, sizeAttenuation: false, depthTest: false }))
        mp.userData.kind = 'measure'
        mp.renderOrder = 10
        model.add(mp)
        if (picks.length === 2) {
          const ln = new THREE.Line(pg, new THREE.LineBasicMaterial({ color: 0xef4444, depthTest: false }))
          ln.userData.kind = 'measure'
          ln.renderOrder = 10
          model.add(ln)
        }
      }
      if (fresh) {
        wrap.userData.file = file.text.length + file.name
        stg.camera.position.set(8, 7, 10)
        stg.controls.target.set(0, 2, 0)
      }
    },
    [insts, geo, hidden, sel, s.faces, s.edges, s.verts, s.explode, mode, picks, file],
    { camera: [8, 7, 10], target: [0, 2, 0], background: '#0f172a' },
  )

  const load = async (fl: File) => {
    if (fl.size > 60e6) return setFile({ name: fl.name, text: 'too large', size: fl.size })
    setFile({ name: fl.name, text: await fl.text(), size: fl.size })
    setHidden(new Set())
    setSel(null)
    setPicks([])
  }
  const u = unit.name
  const md = picks.length === 2 ? dist(picks[0], picks[1]) : null
  const topTypes = f ? [...f.counts.entries()].sort((a, b) => b[1] - a[1]) : []
  const selInst = insts.find((i) => i.key === sel)

  return (
    <Split wide="right">
      <div>
        <Panel title="File">
          <FileDrop accept=".step,.stp,.p21,.STEP,.STP" label="Drop a .step / .stp file" onFiles={([fl]) => void load(fl)} />
          <Row>
            <Btn onClick={() => { setFile({ name: 'bracket-assembly.step (sample)', text: sampleStep(), size: 0 }); setHidden(new Set()); setPicks([]) }}>Load sample</Btn>
            <Btn onClick={() => download('bracket-assembly.step', sampleStep(), 'application/step')}>⬇ Sample .step</Btn>
          </Row>
          <p className="muted" style={{ margin: '8px 0 0', wordBreak: 'break-all' }}><b>{file.name}</b> · {num((file.size || file.text.length) / 1024, 1)} KB</p>
          {parsed.err && <Note tone="err">{parsed.err}</Note>}
          {f && f.errors.length > 0 && <Note tone="warn">{f.errors.length} statement(s) could not be parsed, e.g. {f.errors[0]}</Note>}
        </Panel>
        {parsed.head && (
          <Panel title="Header">
            <Table head={['Field', 'Value']} rows={([['Schema', parsed.head.schema], ['Name', parsed.head.name], ['Created', parsed.head.date], ['System', parsed.head.system || parsed.head.preprocessor], ['Author', [parsed.head.author, parsed.head.org].filter(Boolean).join(' · ')], ['Description', parsed.head.description], ['Length unit', `${u} (${unit.metres} m)`]] as [string, string][]).filter(([, v]) => v).map(([k, v]) => [k, <span key="v" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{v}</span>])} />
          </Panel>
        )}
        <Panel title="Product tree" actions={hidden.size > 0 && <Btn kind="ghost" onClick={() => setHidden(new Set())}>Show all</Btn>}>
          {insts.length === 0 && <p className="muted">No products found.</p>}
          <div style={{ maxHeight: 280, overflow: 'auto' }}>
            {insts.map((i) => (
              <div key={i.key} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: i.depth * 16, padding: '2px 0 2px ' + i.depth * 16 + 'px', background: sel === i.key ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : undefined, borderRadius: 6 }}>
                <input type="checkbox" checked={!hidden.has(i.key)} onChange={(e) => { const h = new Set(hidden); if (e.target.checked) h.delete(i.key); else h.add(i.key); setHidden(h) }} aria-label={`Show ${i.name}`} />
                <i style={{ width: 10, height: 10, borderRadius: 3, background: geo.has(i.pd) ? color(i.ci) : 'transparent', border: '1px solid var(--line)', flex: 'none' }} />
                <button type="button" onClick={() => setSel(sel === i.key ? null : i.key)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', color: 'var(--fg)', cursor: 'pointer', fontWeight: insts.some((c) => c.key.startsWith(i.key + '/')) ? 700 : 500 }}>{i.name}</button>
              </div>
            ))}
          </div>
        </Panel>
        {f && (
          <Panel title={`Entities · ${num(f.ents.size, 0)}`}>
            <Table head={['Type', 'Count']} rows={topTypes.map(([t, c]) => [<code key="t" style={{ fontSize: 12 }}>{t}</code>, num(c, 0)])} max={14} />
          </Panel>
        )}
      </div>
      <div>
        <Stats>
          <Stat label="Instances" value={insts.length} sub={`${new Set(insts.map((i) => i.pd)).size} distinct products`} />
          <Stat label="Faces shaded" value={num(totals.planar + totals.cylinder + totals.tessellated, 0)} sub={`${totals.planar} planar · ${totals.cylinder} cylindrical · ${totals.tessellated} tessellated`} tone="accent" />
          <Stat label="Wire only" value={num(totals.other, 0)} sub={`${num(totals.edges, 0)} edges drawn`} />
          <Stat label="Bounding box" value={bb ? `${num(bb.max[0] - bb.min[0], 1)} × ${num(bb.max[1] - bb.min[1], 1)} × ${num(bb.max[2] - bb.min[2], 1)}` : '—'} sub={u} />
        </Stats>
        <Panel
          title="3D view"
          actions={
            <>
              <Seg value={mode} onChange={(m) => { setMode(m); setPicks([]) }} options={[['select', 'Select'], ['measure', '📏 Measure']]} label="Mode" />
              <Btn onClick={() => { const c = ref.current?.querySelector('canvas'); if (c) { const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'step-view.png'; a.click() } }}>⬇ PNG</Btn>
            </>
          }
        >
          <View3D refEl={ref} height={500} />
          <Row>
            <Check label="Faces" value={s.faces} onChange={(faces) => set({ faces })} />
            <Check label="Edges" value={s.edges} onChange={(edges) => set({ edges })} />
            <Check label="Vertices" value={s.verts} onChange={(verts) => set({ verts })} />
            <div style={{ flex: '1 1 180px' }}>
              <Slider label="Explode" value={s.explode} onChange={(explode) => set({ explode })} min={0} max={1.5} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />
            </div>
          </Row>
          {mode === 'measure' ? (
            <Note tone={md !== null ? 'ok' : 'info'}>
              {md !== null ? (
                <>Distance <b>{num(md, 3)} {u}</b> · Δx {num(Math.abs(picks[1][0] - picks[0][0]), 3)} · Δy {num(Math.abs(picks[1][1] - picks[0][1]), 3)} · Δz {num(Math.abs(picks[1][2] - picks[0][2]), 3)} {u}. Click again to start over.</>
              ) : (
                <>Click two points — vertices (yellow) snap exactly; faces use the hit point. {picks.length === 1 && `First point: (${picks[0].map((v) => num(v, 2)).join(', ')})`}</>
              )}
            </Note>
          ) : selInst ? (
            <Note>Selected: <b>{selInst.name}</b>{geo.get(selInst.pd) ? ` — ${geo.get(selInst.pd)!.faces.planar + geo.get(selInst.pd)!.faces.cylinder + geo.get(selInst.pd)!.faces.tessellated + geo.get(selInst.pd)!.faces.other} faces, ${geo.get(selInst.pd)!.lines.length} edges, origin at (${selInst.m.slice(12, 15).map((v) => num(v, 2)).join(', ')}) ${u}` : ' — assembly node'}</Note>
          ) : (
            <p className="k-hint" style={{ margin: '6px 0 0' }}>Drag to orbit, right-drag to pan, scroll to zoom. Click a part to select it.</p>
          )}
        </Panel>
        <Note tone="warn">
          This viewer reads STEP text directly — there is no B-rep kernel (OpenCascade) in the page. Planar faces are triangulated exactly, cylindrical faces are drawn from their parameter range, tessellated faces (AP242) are shown as stored, and every other surface (cones, spheres, tori, B-spline surfaces) appears as its edge wireframe. Edges (lines, circles, ellipses, B-splines) are exact.{fallback && ' This file has no product structure, so all geometry is drawn as one object.'}
        </Note>
      </div>
    </Split>
  )
}
