import { useState } from 'react'
import { Btn, Check, Note, num, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { field, fieldLines, isosurface, mag, potential, PRESETS, sampleGrid, type Charge, type V3 } from './lib/electric-field-visualizer'

interface State { charges: Charge[]; lines: boolean; density: number; arrows: boolean; surfaces: boolean; levels: number; vBase: number; slice: boolean; preset: string }
const withIds = (k: string) => PRESETS[k].charges.map((c) => ({ ...c, id: uid(), p: [...c.p] as V3 }))
const DEF: State = { charges: withIds('dipole'), lines: true, density: 16, arrows: false, surfaces: true, levels: 2, vBase: 900, slice: true, preset: 'dipole' }
const L = 5

const sci = (v: number, unit: string) => {
  const a = Math.abs(v)
  if (!Number.isFinite(v)) return '—'
  if (a >= 1e6) return `${num(v / 1e6, 3)} M${unit}`
  if (a >= 1e3) return `${num(v / 1e3, 3)} k${unit}`
  return `${num(v, 3)} ${unit}`
}

function heatTexture(cs: Charge[], vmax: number): THREE.CanvasTexture {
  const N = 160
  const c = document.createElement('canvas')
  c.width = c.height = N
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(N, N)
  const vals = new Float64Array(N * N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) vals[j * N + i] = potential(cs, [-L + ((i + 0.5) / N) * 2 * L, 0, -L + ((j + 0.5) / N) * 2 * L])
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = vals[j * N + i]
    const t = Math.max(-1, Math.min(1, Math.sign(v) * Math.log10(1 + Math.abs(v) / (vmax / 30)) / Math.log10(31)))
    // contour bands every 1/8 of the log scale
    const band = Math.abs((t * 8) % 1) < 0.06 ? 0.55 : 1
    const k = (j * N + i) * 4
    img.data[k] = (t > 0 ? 255 : 255 * (1 + t)) * band
    img.data[k + 1] = 255 * (1 - Math.abs(t)) * band
    img.data[k + 2] = (t < 0 ? 255 : 255 * (1 - t)) * band
    img.data[k + 3] = 150
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function build(g: THREE.Group, s: State, dragging: boolean) {
  const cs = s.charges
  const qmax = Math.max(1, ...cs.map((c) => Math.abs(c.q)))
  for (const c of cs) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.16 + 0.12 * Math.sqrt(Math.abs(c.q) / qmax), 24, 16), new THREE.MeshStandardMaterial({ color: c.q >= 0 ? 0xef4444 : 0x3b82f6, emissive: c.q >= 0 ? 0x450a0a : 0x0c1e45, roughness: 0.35 }))
    m.position.set(...c.p)
    m.userData.id = c.id
    m.name = 'charge'
    g.add(m)
    const l = label(`${c.q > 0 ? '+' : c.q < 0 ? '−' : ''}${Math.abs(c.q)} nC`, c.q >= 0 ? '#fecaca' : '#bfdbfe', 0.32)
    l.position.set(c.p[0], c.p[1] + 0.55, c.p[2])
    g.add(l)
  }
  if (!cs.length) return
  if (s.lines) {
    const lines = fieldLines(cs, s.density, L)
    const mat = new THREE.LineBasicMaterial({ vertexColors: true })
    const cone = new THREE.ConeGeometry(0.06, 0.18, 8)
    const coneMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    for (const pts of lines) {
      if (pts.length < 2) continue
      const geo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p)))
      const col = new Float32Array(pts.length * 3)
      pts.forEach((p, i) => {
        const e = Math.log10(mag(field(cs, p)) + 1)
        const t = Math.max(0, Math.min(1, (e - 3) / 3))
        const cc = new THREE.Color().setHSL(0.14 - 0.12 * t, 0.95, 0.45 + 0.25 * t)
        col.set([cc.r, cc.g, cc.b], i * 3)
      })
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      g.add(new THREE.Line(geo, mat))
      const mid = Math.floor(pts.length / 2)
      if (pts.length > 6) {
        const a = new THREE.Vector3(...pts[mid]), b = new THREE.Vector3(...pts[Math.min(pts.length - 1, mid + 1)])
        const arrow = new THREE.Mesh(cone, coneMat)
        arrow.position.copy(a)
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize())
        g.add(arrow)
      }
    }
  }
  if (s.arrows) {
    const n = 11
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const p: V3 = [-L + 0.5 + (i * (2 * L - 1)) / (n - 1), 0, -L + 0.5 + (j * (2 * L - 1)) / (n - 1)]
      if (cs.some((c) => Math.hypot(c.p[0] - p[0], c.p[1] - p[1], c.p[2] - p[2]) < 0.4)) continue
      const e = field(cs, p)
      const m = mag(e)
      if (!m) continue
      const t = Math.max(0, Math.min(1, (Math.log10(m) - 3) / 3))
      const dir = new THREE.Vector3(e[0] / m, e[1] / m, e[2] / m)
      g.add(new THREE.ArrowHelper(dir, new THREE.Vector3(...p), 0.55, new THREE.Color().setHSL(0.6 - 0.6 * t, 0.85, 0.55).getHex(), 0.18, 0.1))
    }
  }
  if (s.slice) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2 * L, 2 * L), new THREE.MeshBasicMaterial({ map: heatTexture(cs, s.vBase), transparent: true, side: THREE.DoubleSide, depthWrite: false }))
    plane.rotation.x = Math.PI / 2
    plane.name = 'slice'
    g.add(plane)
  }
  if (s.surfaces && !dragging) {
    const n = 38
    const grid = sampleGrid((p) => potential(cs, p), n, L)
    for (let k = 1; k <= s.levels; k++) {
      for (const sign of [1, -1]) {
        const lvl = (sign * s.vBase) / k
        const tri = isosurface(grid, n, L, lvl)
        if (!tri.length) continue
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(tri, 3))
        geo.computeVertexNormals()
        g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: sign > 0 ? 0xf87171 : 0x60a5fa, transparent: true, opacity: 0.16 + 0.08 / k, side: THREE.DoubleSide, depthWrite: false, roughness: 0.6 })))
      }
    }
  }
}

export default function ElectricFieldVisualizer() {
  const [s, set, reset] = useToolState('electric-field-visualizer', DEF)
  const [probe, setProbe] = useState<V3 | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  const ref = useStage3D(
    (st: Stage3D) => {
      const g = new THREE.Group()
      g.name = 'field'
      st.scene.add(g)
      const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * L, 2 * L, 2 * L)), new THREE.LineBasicMaterial({ color: 0x334155 }))
      st.scene.add(box)
      const el = st.renderer.domElement
      const ray = new THREE.Raycaster()
      const ndc = new THREE.Vector2()
      let drag: { id: string; plane: THREE.Plane } | null = null
      const cast = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
        ray.setFromCamera(ndc, st.camera)
      }
      const down = (e: PointerEvent) => {
        cast(e)
        const hit = ray.intersectObjects(g.children.filter((c) => c.name === 'charge'))[0]
        if (!hit) return
        const id = hit.object.userData.id as string
        drag = { id, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.object.position.y) }
        st.controls.enabled = false
        el.setPointerCapture(e.pointerId)
        setDragId(id)
      }
      const move = (e: PointerEvent) => {
        cast(e)
        if (drag) {
          const p = new THREE.Vector3()
          if (!ray.ray.intersectPlane(drag.plane, p)) return
          const c = (v: number) => Math.round(Math.max(-L + 0.3, Math.min(L - 0.3, v)) * 10) / 10
          const id = drag.id
          set((x) => ({ ...x, charges: x.charges.map((q) => (q.id === id ? { ...q, p: [c(p.x), q.p[1], c(p.z)] as V3 } : q)) }))
          return
        }
        const sl = g.getObjectByName('slice')
        const hit = sl ? ray.intersectObject(sl)[0] : undefined
        setProbe(hit ? [Math.round(hit.point.x * 100) / 100, 0, Math.round(hit.point.z * 100) / 100] : null)
      }
      const up = () => {
        if (!drag) return
        drag = null
        st.controls.enabled = true
        setDragId(null)
      }
      el.addEventListener('pointerdown', down)
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointerleave', () => setProbe(null))
      return () => {
        el.removeEventListener('pointerdown', down)
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
      }
    },
    (st: Stage3D) => {
      const g = st.scene.getObjectByName('field') as THREE.Group
      st.clear(g)
      build(g, s, dragId !== null)
    },
    [s.charges, s.lines, s.density, s.arrows, s.surfaces, s.levels, s.vBase, s.slice, dragId],
    { camera: [7, 7, 9], grid: false },
  )

  const edit = (id: string, p: Partial<Charge>) => set({ charges: s.charges.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  const setPos = (id: string, i: number, v: number) => set({ charges: s.charges.map((c) => (c.id === id ? { ...c, p: c.p.map((x, j) => (j === i ? Math.max(-L, Math.min(L, v)) : x)) as V3 } : c)) })
  const pp = probe ?? ([0, 0, 0] as V3)
  const E = field(s.charges, pp), V = potential(s.charges, pp)
  const qnet = s.charges.reduce((a, c) => a + c.q, 0)
  // electrostatic potential energy of the configuration
  let U = 0
  for (let i = 0; i < s.charges.length; i++) for (let j = i + 1; j < s.charges.length; j++) {
    const a = s.charges[i], b = s.charges[j]
    U += (8.9875517923e9 * a.q * b.q * 1e-18) / (Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]) * 0.01)
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Charges" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Preset" value={s.preset} onChange={(preset) => set({ preset, charges: withIds(preset) })} options={Object.entries(PRESETS).map(([k, v]) => [k, v.name] as [string, string])} />
          <Table
            head={['q (nC)', 'x', 'y', 'z', '']}
            rows={s.charges.map((c) => [
              <Num key="q" label="" value={c.q} onChange={(q) => edit(c.id, { q })} />,
              ...[0, 1, 2].map((i) => <Num key={i} label="" value={c.p[i]} onChange={(v) => setPos(c.id, i, v)} min={-L} max={L} step={0.1} />),
              <Btn key="x" kind="ghost" onClick={() => set({ charges: s.charges.filter((x) => x.id !== c.id) })}>✕</Btn>,
            ])}
          />
          <Row>
            <Btn onClick={() => set({ charges: [...s.charges, { id: uid(), q: 1, p: [Math.round((Math.random() * 6 - 3) * 10) / 10, 0, Math.round((Math.random() * 6 - 3) * 10) / 10] }] })}>+ Positive</Btn>
            <Btn onClick={() => set({ charges: [...s.charges, { id: uid(), q: -1, p: [Math.round((Math.random() * 6 - 3) * 10) / 10, 0, Math.round((Math.random() * 6 - 3) * 10) / 10] }] })}>+ Negative</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 12 }}>Positions in cm inside a ±{L} cm box. Drag a sphere in the view to move it horizontally; edit y for height.</p>
        </Panel>
        <Panel title="Display">
          <Check label="Field lines" value={s.lines} onChange={(lines) => set({ lines })} />
          {s.lines && <Slider label="Lines on the largest charge" value={s.density} onChange={(density) => set({ density })} min={4} max={40} />}
          <Check label="Field arrows on the y = 0 plane" value={s.arrows} onChange={(arrows) => set({ arrows })} />
          <Check label="Potential map on the y = 0 plane (hover to probe)" value={s.slice} onChange={(slice) => set({ slice })} />
          <Check label="Equipotential surfaces" value={s.surfaces} onChange={(surfaces) => set({ surfaces })} />
          {s.surfaces && (
            <>
              <Slider label="Outer surface potential ±" value={s.vBase} onChange={(vBase) => set({ vBase })} min={200} max={20000} step={100} unit=" V" show={(v) => num(v, 0)} />
              <Slider label="Surfaces per sign" value={s.levels} onChange={(levels) => set({ levels })} min={1} max={4} />
            </>
          )}
        </Panel>
      </div>
      <div>
        <Panel title="3D field view">
          <View3D refEl={ref} height={520} />
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Red = positive, blue = negative. Line colour brightens with field strength; cones show the direction of E. Translucent shells are equipotentials at ±V, ±V/2 …</p>
        </Panel>
        <Stats>
          <Stat label={probe ? `Probe (${pp[0]}, 0, ${pp[2]}) cm` : 'At origin'} value={sci(mag(E), 'V/m')} sub={`E = (${sci(E[0], '')}, ${sci(E[1], '')}, ${sci(E[2], '')})`} />
          <Stat label="Potential" value={sci(V, 'V')} tone="accent" />
          <Stat label="Net charge" value={`${num(qnet, 3)} nC`} sub={`${s.charges.length} charges`} />
          <Stat label="Potential energy" value={`${num(U * 1e6, 3)} µJ`} sub={U < 0 ? 'bound (attractive)' : 'repulsive'} />
        </Stats>
        {!s.charges.length && <Note>Add a charge to see its field.</Note>}
        <Note>E = k Σ qᵢ (r − rᵢ)/|r − rᵢ|³ and V = k Σ qᵢ/|r − rᵢ| with k = 8.988 × 10⁹ N·m²/C². Hover the coloured plane to read the field at any point.</Note>
      </div>
    </Split>
  )
}
