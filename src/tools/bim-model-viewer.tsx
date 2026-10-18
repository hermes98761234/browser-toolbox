import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Btn, Check, download, FileDrop, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { loadIfc, niceType, properties, type ElementInfo, type LoadedModel, type TreeNode } from './lib/bim-model-viewer'
import { sampleIfc } from './lib/bim-model-viewer-sample'

type ColorMode = 'type' | 'file'
type Axis = 'off' | 'z' | 'x' | 'y'
interface Prefs { color: ColorMode; spaces: boolean; openings: boolean; edges: boolean; axis: Axis; cut: number; flip: boolean }
const DEF: Prefs = { color: 'file', spaces: false, openings: false, edges: true, axis: 'off', cut: 0.5, flip: false }

const TYPE_COLOR: Record<string, string> = {
  IFCWALL: '#e7dcc6', IFCWALLSTANDARDCASE: '#e7dcc6', IFCSLAB: '#b9b9b2', IFCROOF: '#b5523b', IFCWINDOW: '#7fb8f0', IFCDOOR: '#a0703c',
  IFCCOLUMN: '#d4d4d8', IFCBEAM: '#64748b', IFCMEMBER: '#7c8a9a', IFCPLATE: '#94a3b8', IFCSTAIR: '#c9a36b', IFCSTAIRFLIGHT: '#c9a36b', IFCRAILING: '#94a3b8',
  IFCSPACE: '#60a5fa', IFCOPENINGELEMENT: '#f472b6', IFCCOVERING: '#d6c9a8', IFCFURNISHINGELEMENT: '#a78bfa', IFCFURNITURE: '#a78bfa', IFCCHIMNEY: '#9c4a3c',
  IFCBUILDINGELEMENTPROXY: '#94a38b', IFCSANITARYTERMINAL: '#f1f5f9', IFCFOOTING: '#8b8b85', IFCCURTAINWALL: '#7fb8f0',
}
function typeColor(t: string): string {
  if (TYPE_COLOR[t]) return TYPE_COLOR[t]
  let h = 0
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `hsl(${h % 360} 45% 62%)`
}
const TRANSLUCENT = new Set(['IFCSPACE', 'IFCOPENINGELEMENT', 'IFCOPENINGSTANDARDCASE'])

function useModel() {
  const [src, setSrc] = useState<{ name: string; text: string }>(() => ({ name: 'sample-house.ifc', text: sampleIfc() }))
  const res = useMemo((): { lm?: LoadedModel; err?: string; ms: number } => {
    try {
      const lm = loadIfc(src.text)
      return { lm, ms: lm.ms }
    } catch (e) {
      return { err: (e as Error).message, ms: 0 }
    }
  }, [src])
  return { src, setSrc, ...res }
}

export default function BimModelViewer() {
  const [p, set] = useToolState('bim-model-viewer', DEF)
  const { src, setSrc, lm, err, ms } = useModel()
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [hidden, setHidden] = useState<Set<number>>(new Set())
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set())
  const [isolate, setIsolate] = useState<number | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const bbox = useRef(new THREE.Box3())
  const [plane] = useState(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 0))
  const pickRef = useRef<(id: number | null) => void>(setSelected)

  const elements = useMemo(() => lm?.elements ?? [], [lm])
  const byId = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements])
  const fit = (s: Stage3D) => {
    const b = bbox.current
    if (b.isEmpty()) return
    const c = b.getCenter(new THREE.Vector3())
    const size = b.getSize(new THREE.Vector3()).length()
    s.controls.target.copy(c)
    s.camera.position.copy(c).add(new THREE.Vector3(0.75, 0.55, 0.95).multiplyScalar(size))
    s.camera.near = size / 500
    s.camera.far = size * 50
    s.camera.updateProjectionMatrix()
  }
  const stageRef = useRef<Stage3D | null>(null)

  // ---- 3D: build meshes when the model or colour mode changes
  const ref = useStage3D(
    (s) => {
      stageRef.current = s
      s.renderer.localClippingEnabled = true
      const root = new THREE.Group()
      root.name = 'ifc'
      root.rotation.x = -Math.PI / 2 // IFC is Z-up
      s.scene.add(root)
      const ray = new THREE.Raycaster()
      let down: [number, number] | null = null
      const el = s.renderer.domElement
      const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY])
      const onUp = (e: PointerEvent) => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return
        const r = el.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), s.camera)
        const clip = s.renderer.localClippingEnabled && (root.userData.clip as boolean)
        const hits = ray.intersectObject(root, true).filter((h) => {
          let o: THREE.Object3D | null = h.object
          while (o) {
            if (!o.visible) return false
            o = o.parent
          }
          return (h.object as THREE.Mesh).isMesh && (!clip || plane.distanceToPoint(h.point) >= 0)
        })
        const solid = hits.find((h) => !h.object.userData.translucent) ?? hits[0]
        pickRef.current(solid ? (solid.object.parent?.userData.id as number) : null)
      }
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointerup', onUp)
      return () => {
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointerup', onUp)
      }
    },
    (s) => {
      const root = s.scene.getObjectByName('ifc') as THREE.Group
      s.clear(root)
      const groups = new Map<number, THREE.Group>()
      root.userData.groups = groups
      if (!lm) return
      const mats = new Map<string, THREE.Material>()
      const totalTris = elements.reduce((a, e) => a + e.geom.tris, 0)
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.35, clippingPlanes: [plane] })
      for (const e of elements) {
        if (!e.geom.parts.length) continue
        const g = new THREE.Group()
        g.userData.id = e.id
        for (const part of e.geom.parts) {
          const translucent = TRANSLUCENT.has(e.type)
          const [col, alpha] = p.color === 'file' && part.color && !translucent
            ? [new THREE.Color(part.color[0], part.color[1], part.color[2]), part.color[3]]
            : [new THREE.Color(typeColor(e.type)), translucent ? 0.22 : e.type === 'IFCWINDOW' && p.color === 'type' ? 0.75 : 1]
          const key = `${col.getHexString()}:${alpha.toFixed(2)}`
          let mat = mats.get(key)
          if (!mat) {
            mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.85, metalness: 0.02, side: THREE.DoubleSide, transparent: alpha < 0.99, opacity: alpha, depthWrite: alpha >= 0.99, clippingPlanes: [plane], polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
            mats.set(key, mat)
          }
          const geo = new THREE.BufferGeometry()
          geo.setAttribute('position', new THREE.BufferAttribute(part.pos, 3))
          geo.computeVertexNormals()
          const mesh = new THREE.Mesh(geo, mat)
          mesh.userData.base = mat
          mesh.userData.translucent = translucent
          g.add(mesh)
          if (p.edges && totalTris < 250000 && !translucent) g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat))
        }
        root.add(g)
        groups.set(e.id, g)
      }
      root.updateMatrixWorld(true)
      bbox.current = new THREE.Box3()
      for (const [id, g] of groups) if (!TRANSLUCENT.has(byId.get(id)!.type)) bbox.current.expandByObject(g)
      if (bbox.current.isEmpty()) bbox.current.setFromObject(root)
      const grid = s.scene.children.find((c) => c instanceof THREE.GridHelper)
      if (grid) grid.position.y = bbox.current.min.y - 0.01
      fit(s)
    },
    [lm, p.color, p.edges],
    { camera: [14, 10, 16], background: '#0f172a' },
  )

  // ---- visibility, selection and section plane (no rebuild)
  const visibleIds = useMemo(() => {
    const v = new Set<number>()
    for (const e of elements) {
      if (hidden.has(e.id) || hiddenTypes.has(e.type)) continue
      if (e.type === 'IFCSPACE' && !p.spaces) continue
      if (TRANSLUCENT.has(e.type) && e.type !== 'IFCSPACE' && !p.openings) continue
      if (isolate !== null && e.storey !== isolate) continue
      v.add(e.id)
    }
    return v
  }, [elements, hidden, hiddenTypes, p.spaces, p.openings, isolate])

  const hl = useRef<THREE.Material | null>(null)
  useEffect(() => {
    const s = stageRef.current
    if (!s) return
    hl.current ??= new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x7c5800, roughness: 0.6, side: THREE.DoubleSide, clippingPlanes: [plane], polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
    const highlight = hl.current
    const root = s.scene.getObjectByName('ifc')
    if (!root) return
    for (const [id, g] of (root.userData.groups ?? new Map()) as Map<number, THREE.Group>) {
      g.visible = visibleIds.has(id)
      for (const c of g.children) {
        const m = c as THREE.Mesh
        if (!m.isMesh) continue
        m.material = id === selected ? highlight : (m.userData.base as THREE.Material)
      }
    }
    const b = bbox.current
    root.userData.clip = p.axis !== 'off'
    s.renderer.localClippingEnabled = p.axis !== 'off'
    if (!b.isEmpty()) {
      const sign = p.flip ? -1 : 1
      // World is Y-up: IFC z → world y, IFC x → world x, IFC y → world −z.
      if (p.axis === 'z') plane.set(new THREE.Vector3(0, -sign, 0), sign * (b.min.y + p.cut * (b.max.y - b.min.y)))
      if (p.axis === 'x') plane.set(new THREE.Vector3(-sign, 0, 0), sign * (b.min.x + p.cut * (b.max.x - b.min.x)))
      if (p.axis === 'y') plane.set(new THREE.Vector3(0, 0, sign), -sign * (b.max.z - p.cut * (b.max.z - b.min.z)))
    }
  }, [visibleIds, selected, plane, p.axis, p.cut, p.flip, lm, p.color, p.edges])

  const props = useMemo(() => (lm && selected !== null ? properties(lm.model, lm.rel, lm.units, selected) : []), [lm, selected])
  const sel = selected !== null ? byId.get(selected) : undefined
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of elements) m.set(e.type, (m.get(e.type) ?? 0) + 1)
    return [...m].sort((a, b) => b[1] - a[1])
  }, [elements])
  const problems = elements.filter((e) => e.geom.status === 'unsupported' || e.geom.status === 'partial')
  const okCount = elements.filter((e) => e.geom.status === 'ok').length
  const tris = elements.reduce((a, e) => a + e.geom.tris, 0)

  const load = (name: string, text: string) => {
    setBusy(true)
    setTimeout(() => {
      setSrc({ name, text })
      setSelected(null)
      setHidden(new Set())
      setHiddenTypes(new Set())
      setIsolate(null)
      setBusy(false)
    }, 20)
  }
  const descendants = (n: TreeNode): number[] => [n.id, ...n.children.flatMap(descendants)]
  const toggleIds = (ids: number[], show: boolean) =>
    setHidden((h) => {
      const x = new Set(h)
      for (const id of ids) {
        if (show) x.delete(id)
        else x.add(id)
      }
      return x
    })

  const Badge = ({ e }: { e: ElementInfo }) =>
    e.geom.status === 'unsupported' ? <span title={e.geom.issues.join('\n')} style={{ color: 'var(--err)' }}> ✕ no geometry</span>
      : e.geom.status === 'partial' ? <span title={e.geom.issues.join('\n')} style={{ color: 'var(--warn)' }}> ⚠ partial</span> : null

  const renderNode = (n: TreeNode, depth: number): ReactNode => {
    const spatialKids = n.children.filter((c) => c.spatial)
    const elems = n.children.filter((c) => !c.spatial)
    const ids = descendants(n)
    const shown = ids.some((id) => !hidden.has(id))
    const byType = new Map<string, TreeNode[]>()
    for (const c of elems) byType.set(c.type, [...(byType.get(c.type) ?? []), c])
    return (
      <div key={n.id} style={{ marginLeft: depth ? 12 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
          <input type="checkbox" checked={shown} onChange={(ev) => toggleIds(ids, ev.target.checked)} aria-label={`Show ${n.name}`} />
          <button type="button" className="k-btn ghost" style={{ padding: '2px 6px', fontWeight: 700, background: selected === n.id ? 'var(--accent)' : undefined, color: selected === n.id ? 'var(--on-accent)' : undefined }} onClick={() => setSelected(n.id)}>{n.name}</button>
          <span className="muted" style={{ fontSize: 12 }}>{niceType(n.type)}</span>
          {n.type === 'IFCBUILDINGSTOREY' && (
            <button type="button" className="k-btn ghost" style={{ padding: '2px 6px', fontSize: 12 }} onClick={() => setIsolate(isolate === n.id ? null : n.id)}>{isolate === n.id ? '✓ isolated' : 'isolate'}</button>
          )}
        </div>
        {spatialKids.map((c) => renderNode(c, depth + 1))}
        {[...byType].map(([t, list]) => {
          const key = `${n.id}:${t}`
          const isOpen = open.has(key)
          const tids = list.flatMap(descendants)
          return (
            <div key={key} style={{ marginLeft: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={tids.some((id) => !hidden.has(id))} onChange={(ev) => toggleIds(tids, ev.target.checked)} aria-label={`Show ${niceType(t)}`} />
                <button type="button" className="k-btn ghost" style={{ padding: '1px 6px' }} onClick={() => setOpen((o) => { const x = new Set(o); if (x.has(key)) x.delete(key); else x.add(key); return x })}>
                  {isOpen ? '▾' : '▸'} <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: typeColor(t), marginRight: 4 }} />{niceType(t)} <span className="muted">({list.length})</span>
                </button>
              </div>
              {isOpen && list.map((c) => {
                const e = byId.get(c.id)
                return (
                  <div key={c.id} style={{ marginLeft: 22, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={!hidden.has(c.id)} onChange={(ev) => toggleIds(descendants(c), ev.target.checked)} aria-label={`Show ${c.name}`} />
                    <a href="#" onClick={(ev) => { ev.preventDefault(); setSelected(c.id) }} style={{ fontWeight: selected === c.id ? 700 : 400 }}>{c.name}</a>
                    {e && <Badge e={e} />}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <Split wide="left">
      <div>
        <Panel
          title={`3D model — ${src.name}`}
          actions={<Btn onClick={() => stageRef.current && fit(stageRef.current)}>⤢ Fit</Btn>}
        >
          <Row>
            <Seg<ColorMode> value={p.color} onChange={(color) => set({ color })} options={[['file', 'File colours'], ['type', 'Colour by type']]} />
            <Check label="Spaces" value={p.spaces} onChange={(spaces) => set({ spaces })} />
            <Check label="Openings" value={p.openings} onChange={(openings) => set({ openings })} />
            <Check label="Edges" value={p.edges} onChange={(edges) => set({ edges })} />
          </Row>
          <View3D refEl={ref} height={540} />
          <Row>
            <Select<Axis> label="Section plane" value={p.axis} onChange={(axis) => set({ axis })} options={[['off', 'Off'], ['z', 'Horizontal (plan cut)'], ['x', 'Vertical X'], ['y', 'Vertical Y']]} />
            {p.axis !== 'off' && <Slider label="Cut position" value={p.cut} onChange={(cut) => set({ cut })} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />}
            {p.axis !== 'off' && <Check label="Flip side" value={p.flip} onChange={(flip) => set({ flip })} />}
          </Row>
          {isolate !== null && <Note>Isolated: {lm?.storeys.find((x) => x.id === isolate)?.name}. <a href="#" onClick={(e) => { e.preventDefault(); setIsolate(null) }}>Show all storeys</a></Note>}
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Drag to orbit, right-drag to pan, scroll to zoom, click an element to inspect it.</p>
        </Panel>
        {sel || selected !== null ? (
          <Panel title={sel ? `${sel.name}` : 'Selection'} actions={<Btn kind="ghost" onClick={() => setSelected(null)}>Clear</Btn>}>
            {sel && sel.geom.issues.length > 0 && <Note tone="warn">Geometry: {sel.geom.issues.join('; ')}</Note>}
            {props.map((g) => (
              <div key={g.name} style={{ marginBottom: 10 }}>
                <b style={{ fontSize: 13 }}>{g.name}</b>
                <Table head={['Property', 'Value']} rows={g.rows.map(([k, v]) => [k, v])} />
              </div>
            ))}
          </Panel>
        ) : (
          <Note>Click an element in the 3D view or the tree to see its attributes, property sets and quantities.</Note>
        )}
      </div>
      <div>
        <Panel title="Open an IFC file">
          <FileDrop accept=".ifc,.IFC" onFiles={async ([f]) => load(f.name, await f.text())} label="Drop an .ifc (STEP) file or click to choose" />
          <Row>
            <Btn onClick={() => load('sample-house.ifc', sampleIfc())}>Load sample house</Btn>
            <Btn kind="ghost" onClick={() => download('sample-house.ifc', sampleIfc(), 'application/x-step')}>⬇ Sample .ifc</Btn>
          </Row>
          {busy && <Note>Parsing…</Note>}
          {err && <Note tone="err">Could not read this file: {err}</Note>}
          {lm && (
            <Stats>
              <Stat label="Schema" value={lm.model.schema} sub={`${lm.model.size.toLocaleString()} entities`} />
              <Stat label="Elements" value={elements.length - lm.openings} sub={`${okCount - elements.filter((e) => TRANSLUCENT.has(e.type) && e.type !== 'IFCSPACE' && e.geom.status === 'ok').length} with full geometry`} tone="accent" />
              <Stat label="Triangles" value={tris.toLocaleString()} sub={`parsed in ${ms.toFixed(0)} ms`} />
            </Stats>
          )}
          {lm?.model.header.app && <p className="muted" style={{ margin: '6px 0 0', fontSize: 12 }}>Authoring app: {lm.model.header.app}{lm.model.header.author ? ` · ${lm.model.header.author}` : ''} · length unit {lm.units.symbols.LENGTHUNIT}</p>}
        </Panel>
        {lm && (
          <Panel title="Spatial tree" actions={<Btn kind="ghost" onClick={() => { setHidden(new Set()); setHiddenTypes(new Set()); setIsolate(null) }}>Show all</Btn>}>
            <div style={{ maxHeight: 380, overflow: 'auto' }}>{lm.tree.map((n) => renderNode(n, 0))}</div>
            {lm.openings > 0 && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>{lm.openings} opening elements (voids) are hidden by default.</p>}
          </Panel>
        )}
        {lm && (
          <Panel title="Element types">
            {typeCounts.map(([t, c]) => (
              <label key={t} className="k-check" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={!hiddenTypes.has(t)} onChange={(ev) => setHiddenTypes((h) => { const x = new Set(h); if (ev.target.checked) x.delete(t); else x.add(t); return x })} />
                <i style={{ width: 12, height: 12, borderRadius: 3, background: typeColor(t), display: 'inline-block' }} />
                {niceType(t)} <span className="muted">{c}</span>
              </label>
            ))}
          </Panel>
        )}
        {lm && (
          <Panel title="Geometry support">
            {problems.length ? (
              <Note tone="warn">{problems.length} element{problems.length > 1 ? 's' : ''} could not be drawn completely — listed below, never silently dropped.</Note>
            ) : <Note tone="ok">Every element with a body representation was drawn.</Note>}
            {problems.length > 0 && (
              <Table head={['Element', 'Issue']} rows={problems.map((e) => [<a key="a" href="#" onClick={(ev) => { ev.preventDefault(); setSelected(e.id) }}>{e.name}</a>, e.geom.issues.join('; ')])} max={40} />
            )}
            <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
              Supported: local placement chains, extrusions of rectangle (+hollow), circle (+hollow), I-shape and arbitrary profiles (polyline, indexed poly-curve, composite curve, with voids), faceted B-reps, shell/face-based surface models, triangulated and polygonal face sets, mapped items and styled colours.
              Not supported: revolved/swept solids, NURBS/advanced B-reps, CSG; boolean cuts and openings are not subtracted (walls stay solid). This is a lightweight viewer, not a full IFC kernel.
            </p>
          </Panel>
        )}
      </div>
    </Split>
  )
}

