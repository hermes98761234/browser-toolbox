import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Note, Num, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, Table, fmt, useToolState } from '../kit'
import { THREE, label, useStage3D, View3D, type Stage3D } from '../kit/three'
import { buildSolid, formulas, hinges, section, shapeName, unfold, type Params, type SolidKind, type V3 } from './lib/geometry-solids-viewer'

const KINDS: [SolidKind, string][] = [
  ['cube', 'Cube'], ['cuboid', 'Rectangular prism (cuboid)'], ['prism', 'Regular prism'], ['pyramid', 'Regular pyramid'],
  ['tetrahedron', 'Regular tetrahedron'], ['cylinder', 'Cylinder'], ['cone', 'Cone'], ['sphere', 'Sphere'],
]
type Mode = 'solid' | 'net' | 'section'
const DEF = { kind: 'pyramid' as SolidKind, p: { a: 4, l: 6, w: 4, h: 5, r: 2.5, n: 4 } as Params, mode: 'net' as Mode, unit: 'cm', tilt: 0, az: 0, off: 0.5 }
const CURVED = (k: SolidKind) => k === 'cylinder' || k === 'cone' || k === 'sphere'
const PAL = ['#6366f1', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#ec4899']

function planeNormal(tilt: number, az: number): V3 {
  const t = (tilt * Math.PI) / 180, a = (az * Math.PI) / 180
  return [Math.sin(t) * Math.cos(a), Math.cos(t), Math.sin(t) * Math.sin(a)]
}

export default function GeometrySolidsViewer() {
  const [s, set] = useToolState('geometry-solids-viewer', DEF)
  const [t, setT] = useState(0.6)
  const [playing, setPlaying] = useState(false)
  const anim = useRef({ t: 0.6, playing: false, dir: 1, lastUi: 0 })
  useEffect(() => { anim.current.playing = playing }, [playing])
  const poly = useMemo(() => buildSolid(s.kind, s.p), [s.kind, s.p])
  const hs = useMemo(() => hinges(poly), [poly])
  const f = formulas(s.kind, s.p)
  const u = s.unit
  const n = planeNormal(s.tilt, s.az)
  const proj = poly.verts.map((v) => v[0] * n[0] + v[1] * n[1] + v[2] * n[2])
  const lo = Math.min(...proj), hi = Math.max(...proj)
  const d = lo + (hi - lo) * s.off
  const sec = useMemo(() => section(poly, planeNormal(s.tilt, s.az), d), [poly, s.tilt, s.az, d])
  const exactArea = (() => {
    const { r, h } = s.p
    if (s.kind === 'sphere') { const dist = Math.abs(d - n[1] * r); return { v: Math.PI * Math.max(0, r * r - dist * dist), exact: true, shape: 'circle' } }
    if (s.tilt === 0 && s.kind === 'cylinder') return { v: Math.PI * r * r, exact: true, shape: 'circle' }
    if (s.tilt === 0 && s.kind === 'cone') return { v: Math.PI * (r * (1 - d / h)) ** 2, exact: true, shape: 'circle' }
    if (CURVED(s.kind)) return { v: sec.area, exact: false, shape: s.tilt === 90 && s.kind === 'cylinder' ? 'rectangle' : shapeName(0, true) }
    return { v: sec.area, exact: true, shape: sec.pts.length ? shapeName(sec.pts.length, false) : '—' }
  })()
  const maxDim = Math.max(...poly.verts.flatMap((v) => [Math.abs(v[0]) * 2, v[1], Math.abs(v[2]) * 2]))
  const k = 4 / (maxDim || 1)

  const ref = useStage3D(
    (st: Stage3D) => {
      st.renderer.localClippingEnabled = true
      const g = new THREE.Group()
      g.name = 'solid'
      st.scene.add(g)
      st.onFrame((_time, dt) => {
        const a = anim.current
        if (a.playing) {
          a.t += a.dir * dt * 0.35
          if (a.t >= 1) { a.t = 1; a.dir = -1 }
          if (a.t <= 0) { a.t = 0; a.dir = 1 }
          a.lastUi += dt
          if (a.lastUi > 0.08) { a.lastUi = 0; setT(a.t) }
        }
        const upd = g.userData.updateNet as ((t: number) => void) | undefined
        if (upd) upd(a.t)
      })
    },
    (st) => {
      const g = st.scene.getObjectByName('solid') as THREE.Group
      st.clear(g)
      g.userData.updateNet = undefined
      g.scale.setScalar(k)
      g.position.set(0, 0, 0)
      const edgeMat = new THREE.LineBasicMaterial({ color: 0xe2e8f0 })
      const lbl = (text: string, p: V3) => { const sp = label(text, '#fde68a', 0.42); sp.position.set(p[0] * k, p[1] * k, p[2] * k); st.scene.add(sp); g.userData.labels = [...(g.userData.labels ?? []), sp] }
      for (const old of (g.userData.labels ?? []) as THREE.Sprite[]) { st.scene.remove(old); old.material.map?.dispose(); old.material.dispose() }
      g.userData.labels = []
      const faceGeo = (pts: V3[]) => {
        const geo = new THREE.BufferGeometry()
        const arr: number[] = []
        for (let i = 1; i + 1 < pts.length; i++) arr.push(...pts[0], ...pts[i], ...pts[i + 1])
        geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
        geo.computeVertexNormals()
        return geo
      }
      if (s.mode === 'net') {
        if (s.kind === 'sphere') return
        const meshes = poly.faces.map((fc, i) => {
          const curvedSide = CURVED(s.kind) && i > 0 && i <= poly.faces.length - (s.kind === 'cylinder' ? 2 : 1)
          const col = curvedSide ? PAL[1] : PAL[i % PAL.length]
          const m = new THREE.Mesh(faceGeo(fc.map((v) => poly.verts[v])), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.6, transparent: true, opacity: 0.92 }))
          const e = new THREE.LineLoop(new THREE.BufferGeometry(), edgeMat)
          if (curvedSide) e.visible = false
          g.add(m, e)
          return { m, e }
        })
        let last = -1
        const flat = unfold(poly, 1, hs)
        const cx = flat.flat().reduce((a, p) => a + p[0], 0) / flat.flat().length
        const cz = flat.flat().reduce((a, p) => a + p[2], 0) / flat.flat().length
        g.userData.updateNet = (tt: number) => {
          if (Math.abs(tt - last) < 1e-4) return
          last = tt
          const faces = unfold(poly, tt, hs)
          faces.forEach((pts, i) => {
            const pos = meshes[i].m.geometry.getAttribute('position') as THREE.BufferAttribute
            let j = 0
            for (let q = 1; q + 1 < pts.length; q++) for (const p of [pts[0], pts[q], pts[q + 1]]) pos.setXYZ(j++, p[0], p[1], p[2])
            pos.needsUpdate = true
            meshes[i].m.geometry.computeVertexNormals()
            meshes[i].e.geometry.setFromPoints(pts.map((p) => new THREE.Vector3(...p)))
          })
          g.position.set(-cx * k * tt, 0.01, -cz * k * tt)
        }
        g.userData.updateNet(anim.current.t)
        return
      }
      // solid / section rendering
      const clip = s.mode === 'section' ? [new THREE.Plane(new THREE.Vector3(-n[0], -n[1], -n[2]), d * k)] : []
      const mat = new THREE.MeshStandardMaterial({ color: PAL[0], roughness: 0.45, metalness: 0.05, side: THREE.DoubleSide, clippingPlanes: clip, transparent: s.mode === 'solid', opacity: s.mode === 'solid' ? 0.85 : 1 })
      let geo: THREE.BufferGeometry
      const { r, h } = s.p
      if (s.kind === 'cylinder') { geo = new THREE.CylinderGeometry(r, r, h, 96); geo.translate(0, h / 2, 0) }
      else if (s.kind === 'cone') { geo = new THREE.ConeGeometry(r, h, 96); geo.translate(0, h / 2, 0) }
      else if (s.kind === 'sphere') { geo = new THREE.SphereGeometry(r, 96, 48); geo.translate(0, r, 0) }
      else {
        const arr: number[] = []
        for (const fc of poly.faces) for (let i = 1; i + 1 < fc.length; i++) arr.push(...poly.verts[fc[0]], ...poly.verts[fc[i]], ...poly.verts[fc[i + 1]])
        geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
        geo.computeVertexNormals()
      }
      g.add(new THREE.Mesh(geo, mat))
      if (!CURVED(s.kind)) {
        const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 10), new THREE.LineBasicMaterial({ color: 0xe2e8f0, clippingPlanes: clip }))
        g.add(lines)
      } else if (s.kind !== 'sphere') {
        for (const y of [0, h]) {
          if (s.kind === 'cone' && y === h) continue
          const c = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => new THREE.Vector3(r * Math.cos((i / 96) * Math.PI * 2), y, r * Math.sin((i / 96) * Math.PI * 2)))), new THREE.LineBasicMaterial({ color: 0xe2e8f0, clippingPlanes: clip }))
          g.add(c)
        }
      }
      if (s.mode === 'section') {
        // ghost of the removed part
        g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x94a3b8, wireframe: true, transparent: true, opacity: 0.08 })))
        let capPts: V3[] = sec.pts
        if (s.kind === 'sphere') {
          const c: V3 = [0, s.p.r, 0]
          const dist = d - n[1] * s.p.r
          const rr = Math.sqrt(Math.max(0, s.p.r ** 2 - dist ** 2))
          const cc: V3 = [c[0] + n[0] * dist, c[1] + n[1] * dist, c[2] + n[2] * dist]
          const e1 = new THREE.Vector3(...n).cross(Math.abs(n[0]) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize()
          const e2 = new THREE.Vector3(...n).cross(e1)
          capPts = rr > 0 ? Array.from({ length: 96 }, (_, i): V3 => { const a = (i / 96) * Math.PI * 2; return [cc[0] + rr * (Math.cos(a) * e1.x + Math.sin(a) * e2.x), cc[1] + rr * (Math.cos(a) * e1.y + Math.sin(a) * e2.y), cc[2] + rr * (Math.cos(a) * e1.z + Math.sin(a) * e2.z)] }) : []
        }
        if (capPts.length >= 3) {
          const cap = new THREE.Mesh(faceGeo(capPts), new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide }))
          g.add(cap)
          g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(capPts.map((p) => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color: 0x78350f })))
        }
        // translucent plane
        const size = maxDim * 1.6
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }))
        pl.lookAt(new THREE.Vector3(...n))
        const center = new THREE.Vector3(0, maxDim / 2, 0)
        const off = d - center.dot(new THREE.Vector3(...n))
        pl.position.copy(center).add(new THREE.Vector3(...n).multiplyScalar(off))
        g.add(pl)
      }
      // dimension labels
      if (s.mode === 'section') return
      const { a, l, w } = s.p
      const top = Math.max(...poly.verts.map((v) => v[1]))
      if (s.kind === 'cube' || s.kind === 'tetrahedron' || s.kind === 'prism' || s.kind === 'pyramid') {
        const fc = poly.faces[0]
        const p0 = poly.verts[fc[0]], p1 = poly.verts[fc[1]]
        lbl(`a = ${fmt(a, 3)}`, [(p0[0] + p1[0]) / 2 * 1.15, -0.1 * maxDim, (p0[2] + p1[2]) / 2 * 1.15])
      }
      if (s.kind === 'cuboid') { lbl(`l = ${fmt(l, 3)}`, [0, -0.1 * maxDim, w / 2 * 1.2]); lbl(`w = ${fmt(w, 3)}`, [l / 2 * 1.15, -0.1 * maxDim, 0]) }
      if (s.kind !== 'cube' && s.kind !== 'tetrahedron' && s.kind !== 'sphere') lbl(`h = ${fmt(h, 3)}`, [maxDim * 0.62, top / 2, 0])
      if (CURVED(s.kind)) lbl(`r = ${fmt(r, 3)}`, [r / 2, s.kind === 'sphere' ? r + 0.06 * maxDim : 0.05 * maxDim, 0])
    },
    [s.kind, s.p, s.mode, s.tilt, s.az, s.off],
    { camera: [5, 4.5, 6.5], target: [0, 1.5, 0] },
  )

  const setP = (patch: Partial<Params>) => set({ p: { ...s.p, ...patch } })
  const pos = (v: number) => (v > 0 ? v : undefined)
  const unitPow = (p: 1 | 2 | 3) => (p === 1 ? u : p === 2 ? `${u}²` : `${u}³`)

  return (
    <Split wide="right">
      <div>
        <Panel title="Solid">
          <Select label="Shape" value={s.kind} onChange={(kind) => set({ kind })} options={KINDS} />
          <Row>
            {(s.kind === 'cube' || s.kind === 'prism' || s.kind === 'pyramid' || s.kind === 'tetrahedron') && <Num label="Edge a" value={s.p.a} onChange={(a) => pos(a) && setP({ a })} unit={u} min={0.01} />}
            {s.kind === 'cuboid' && <><Num label="Length l" value={s.p.l} onChange={(l) => pos(l) && setP({ l })} unit={u} min={0.01} /><Num label="Width w" value={s.p.w} onChange={(w) => pos(w) && setP({ w })} unit={u} min={0.01} /></>}
            {(s.kind === 'cylinder' || s.kind === 'cone' || s.kind === 'sphere') && <Num label="Radius r" value={s.p.r} onChange={(r) => pos(r) && setP({ r })} unit={u} min={0.01} />}
            {['cuboid', 'prism', 'pyramid', 'cylinder', 'cone'].includes(s.kind) && <Num label="Height h" value={s.p.h} onChange={(h) => pos(h) && setP({ h })} unit={u} min={0.01} />}
          </Row>
          {(s.kind === 'prism' || s.kind === 'pyramid') && <Slider label="Base sides n" value={s.p.n} min={3} max={10} onChange={(v) => setP({ n: v })} show={(v) => String(v)} />}
          <Select label="Units" value={s.unit} onChange={(unit) => set({ unit })} options={['mm', 'cm', 'm', 'in', 'ft']} />
        </Panel>
        <Panel title="Formulas">
          <Table head={['Quantity', 'Formula', 'Value']} rows={f.rows.map((r) => [r.label, <code key="e">{r.expr}</code>, <b key="v">{r.label.includes('angle') ? `${fmt(r.value, 5)}°` : `${fmt(r.value, 6)} ${unitPow(r.unit)}`}</b>])} />
          {f.fev && <Note tone="ok">Faces F = {f.fev[0]}, edges E = {f.fev[1]}, vertices V = {f.fev[2]} → Euler: V − E + F = {f.fev[2] - f.fev[1] + f.fev[0]} ✓</Note>}
        </Panel>
      </div>
      <div>
        <Panel title="3D view" actions={<Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['solid', 'Solid'], ['net', 'Net'], ['section', 'Cross-section']]} />}>
          <View3D refEl={ref} height={440} />
          {s.mode === 'net' && (s.kind === 'sphere' ? (
            <Note tone="warn">A sphere has no exact net: its surface cannot be flattened without stretching (it has non-zero Gaussian curvature). Map makers use approximate "gores" instead.</Note>
          ) : (
            <Row>
              <div style={{ flex: 1, minWidth: 200 }}>
                <Slider label="Unfold" value={t} min={0} max={1} step={0.01} onChange={(v) => { setPlaying(false); anim.current.t = v; setT(v) }} show={(v) => `${Math.round(v * 100)}%`} />
              </div>
              <Btn kind="primary" onClick={() => setPlaying(!playing)}>{playing ? '⏸ Pause' : '▶ Animate'}</Btn>
              <Btn onClick={() => { setPlaying(false); anim.current.t = 1; setT(1) }}>Flat</Btn>
              <Btn onClick={() => { setPlaying(false); anim.current.t = 0; setT(0) }}>Folded</Btn>
            </Row>
          ))}
          {s.mode === 'net' && CURVED(s.kind) && s.kind !== 'sphere' && (
            <p className="k-hint">{s.kind === 'cylinder' ? `The curved side unrolls into a rectangle ${fmt(2 * Math.PI * s.p.r, 4)} × ${fmt(s.p.h, 4)} ${u}.` : `The curved side unrolls into a sector of radius ℓ = ${fmt(Math.hypot(s.p.r, s.p.h), 4)} ${u} and angle ${fmt((360 * s.p.r) / Math.hypot(s.p.r, s.p.h), 4)}°.`} Drawn with 96 strips.</p>
          )}
          {s.mode === 'section' && (
            <>
              <Row>
                <div style={{ flex: 1, minWidth: 160 }}><Slider label="Plane position" value={s.off} min={0} max={1} step={0.005} onChange={(off) => set({ off })} show={(v) => `${Math.round(v * 100)}%`} /></div>
                <div style={{ flex: 1, minWidth: 160 }}><Slider label="Tilt from horizontal" value={s.tilt} min={0} max={90} step={1} onChange={(tilt) => set({ tilt })} unit="°" show={(v) => String(v)} /></div>
                <div style={{ flex: 1, minWidth: 160 }}><Slider label="Direction" value={s.az} min={0} max={180} step={1} onChange={(az) => set({ az })} unit="°" show={(v) => String(v)} /></div>
              </Row>
              <Row>
                <Btn kind="ghost" onClick={() => set({ tilt: 0, az: 0, off: 0.5 })}>Horizontal</Btn>
                <Btn kind="ghost" onClick={() => set({ tilt: 90, az: 0, off: 0.5 })}>Vertical</Btn>
                {s.kind === 'cube' && <Btn kind="ghost" onClick={() => set({ tilt: 54.7356, az: 45, off: 0.5 })}>Hexagon cut</Btn>}
                {s.kind === 'cube' && <Btn kind="ghost" onClick={() => set({ tilt: 54.7356, az: 45, off: 0.2 })}>Triangle cut</Btn>}
              </Row>
              <Stats>
                <Stat label="Section shape" value={exactArea.shape} sub={sec.pts.length && !CURVED(s.kind) ? `${sec.pts.length} vertices` : undefined} />
                <Stat label="Section area" value={`${exactArea.exact ? '' : '≈ '}${fmt(exactArea.v, 5)} ${u}²`} tone="accent" sub={exactArea.exact ? 'exact' : 'from a 96-sided approximation'} />
                <Stat label="Perimeter" value={`${CURVED(s.kind) ? '≈ ' : ''}${fmt(sec.perimeter, 5)} ${u}`} />
              </Stats>
            </>
          )}
          {s.mode === 'solid' && <p className="k-hint">Drag to orbit, scroll to zoom. Switch to Net to watch it unfold, or Cross-section to slice it with a plane.</p>}
        </Panel>
      </div>
    </Split>
  )
}
