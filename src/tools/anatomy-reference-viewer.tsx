import { useEffect, useRef, useState } from 'react'
import { Btn, Check, Note, Panel, Row, Seg, Slider, Split, Txt, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { cutAt, LAYERS, PARTS, searchParts, SPINE, type Layer, type P3, type Shape } from './lib/anatomy-reference-viewer'

type Axis = 'sagittal' | 'coronal' | 'transverse'
const DEF = { layers: { skin: true, skeleton: true, organs: true, circulatory: false, nervous: false } as Record<Layer, boolean>, labels: true, clip: false, axis: 'sagittal' as Axis, cut: 0, spin: false }
const SCALE = 0.5
const RANGE: Record<Axis, [number, number]> = { sagittal: [-1.4, 1.4], coronal: [-0.7, 0.7], transverse: [0, 8.9] }
const NORMAL: Record<Axis, P3> = { sagittal: [-1, 0, 0], coronal: [0, 0, -1], transverse: [0, -1, 0] }
const V = (p: P3) => new THREE.Vector3(...p)

function geoms(sh: Shape): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  if (sh.t === 'ellip') {
    const g = new THREE.SphereGeometry(1, 32, 20)
    g.scale(...sh.r)
    if (sh.rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...sh.rot)))
    g.translate(...sh.c)
    out.push(g)
  } else if (sh.t === 'cap') {
    const a = V(sh.a), b = V(sh.b)
    const len = a.distanceTo(b)
    const g = new THREE.CapsuleGeometry(sh.r, Math.max(0.01, len), 6, 14)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()))
    const m = a.add(b).multiplyScalar(0.5)
    g.translate(m.x, m.y, m.z)
    out.push(g)
  } else if (sh.t === 'tube') {
    out.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sh.pts.map(V)), Math.max(16, sh.pts.length * 8), sh.r, 8, false))
  } else if (sh.t === 'box') {
    const g = new THREE.BoxGeometry(...sh.s)
    if (sh.rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...sh.rot)))
    g.translate(...sh.c)
    out.push(g)
  } else if (sh.t === 'ribs') {
    for (const s of [1, -1])
      for (let i = 0; i < 12; i++) {
        const y0 = 14 - i * 0.36
        const rx = 0.75 + 0.55 * Math.sin(Math.min(1, (i + 1) / 5) * (Math.PI / 2)) - (i > 8 ? (i - 8) * 0.1 : 0)
        const th0 = i < 7 ? 0.14 : 0.14 + (i - 6) * 0.3
        const pts: THREE.Vector3[] = []
        for (let k = 0; k <= 16; k++) {
          const th = th0 + ((Math.PI - 0.12 - th0) * k) / 16
          pts.push(new THREE.Vector3(s * rx * Math.sin(th), y0 - 0.6 * (1 - th / Math.PI), -0.05 + 0.88 * Math.cos(th)))
        }
        out.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.05, 6, false))
      }
  } else if (sh.t === 'spine') {
    const curve = new THREE.CatmullRomCurve3(SPINE.map(V))
    for (let i = 0; i < 26; i++) {
      const u = i / 25
      const p = curve.getPointAt(u), tg = curve.getTangentAt(u)
      const r = 0.12 + 0.1 * u
      const g = new THREE.CylinderGeometry(r, r, 0.14, 12)
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg))
      g.translate(p.x, p.y, p.z)
      out.push(g)
    }
  } else if (sh.t === 'pelvis') {
    const ring = new THREE.TorusGeometry(0.62, 0.13, 10, 32)
    ring.rotateX(Math.PI / 2 - 0.5)
    ring.translate(0, 9.35, 0.15)
    out.push(ring)
    for (const s of [1, -1]) {
      const w = new THREE.SphereGeometry(1, 24, 16)
      w.scale(0.6, 0.5, 0.14)
      w.rotateY(s * 0.7)
      w.translate(s * 0.85, 9.95, -0.15)
      out.push(w)
    }
  }
  return out
}

export default function AnatomyReferenceViewer() {
  const [s, set, reset] = useToolState('anatomy-reference-viewer', DEF)
  const [sel, setSel] = useState<string | null>('heart')
  const [q, setQ] = useState('')
  const [quiz, setQuiz] = useState<{ target: string; score: number; tries: number; msg: string } | null>(null)
  const stageRef = useRef<Stage3D | null>(null)
  const groups = useRef(new Map<string, THREE.Group>())
  const plane = useRef(new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0))
  const pickRef = useRef<(id: string) => void>(() => {})
  const spinRef = useRef(s.spin)
  const clipRef = useRef(s.clip)
  useEffect(() => {
    spinRef.current = s.spin
    clipRef.current = s.clip
  }, [s.spin, s.clip])

  const ref = useStage3D(
    (stage) => {
      stageRef.current = stage
      stage.renderer.localClippingEnabled = true
      const root = new THREE.Group()
      root.scale.setScalar(SCALE)
      stage.scene.add(root)
      const labels = new THREE.Group()
      labels.name = 'labels'
      for (const p of PARTS) {
        const g = new THREE.Group()
        g.name = p.id
        const skin = p.layer === 'skin'
        const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide, clippingPlanes: [plane.current], transparent: skin, opacity: skin ? 0.16 : 1, depthWrite: !skin })
        for (const sh of p.shapes) for (const geo of geoms(sh)) {
          const m = new THREE.Mesh(geo, mat)
          m.userData.part = p.id
          m.renderOrder = skin ? 2 : 1
          g.add(m)
        }
        g.userData.layer = p.layer
        groups.current.set(p.id, g)
        root.add(g)
      }
      // Callout labels: left/right columns with leader lines, spaced so they never overlap.
      root.updateMatrixWorld(true)
      const tags = PARTS.filter((p) => p.label).map((p) => {
        const side = p.label![0] >= 0 ? 1 : -1
        // point at the mesh on the label's side (paired bones/organs)
        const cs = groups.current.get(p.id)!.children.map((m) => new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).divideScalar(SCALE))
        const c = cs.reduce((a, b) => (b.x * side > a.x * side + 0.05 ? b : a))
        return { p, c, side, y: c.y }
      })
      for (const side of [1, -1]) {
        const col = tags.filter((t) => t.side === side).sort((a, b) => b.y - a.y)
        for (let i = 1; i < col.length; i++) col[i].y = Math.min(col[i].y, col[i - 1].y - 0.8)
        for (const t of col) {
          const l = label(t.p.name.split(' (')[0], '#f8fafc', 0.6)
          l.center.set(side > 0 ? 0 : 1, 0.5)
          l.position.set(side * 3.4, t.y, 0)
          l.userData.layer = t.p.layer
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(side * 3.3, t.y, 0), new THREE.Vector3(side * 3.0, t.y, 0), t.c]), new THREE.LineBasicMaterial({ color: '#94a3b8', depthTest: false, transparent: true, opacity: 0.8 }))
          line.renderOrder = 5
          line.userData.layer = t.p.layer
          labels.add(l, line)
        }
      }
      root.add(labels)
      // Picking that ignores clipped-away geometry.
      const el = stage.renderer.domElement
      let dx = 0, dy = 0
      const down = (e: PointerEvent) => { dx = e.clientX; dy = e.clientY }
      const up = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - dx, e.clientY - dy) > 4) return
        const r = el.getBoundingClientRect()
        const ray = new THREE.Raycaster()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), stage.camera)
        const vis = [...groups.current.values()].filter((g) => g.visible && g.userData.layer !== 'skin')
        const hit = ray.intersectObjects(vis, true).find((h) => !clipRef.current || plane.current.distanceToPoint(h.point) >= 0)
        const id = hit?.object.userData.part as string | undefined
        if (id) pickRef.current(id)
      }
      el.addEventListener('pointerdown', down)
      el.addEventListener('pointerup', up)
      stage.onFrame((_, dt) => { if (spinRef.current) root.rotation.y += dt * 0.4 })
      return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up) }
    },
    () => {
      const [lo, hi] = RANGE[s.axis]
      plane.current.normal.set(...NORMAL[s.axis])
      // keep the side with smaller coordinate: n·p + c ≥ 0 with n = −axis → c = cut
      plane.current.constant = cutAt(s.cut, lo, hi)
      for (const [id, g] of groups.current) {
        g.visible = s.layers[g.userData.layer as Layer]
        g.children.forEach((m) => {
          const mat = (m as THREE.Mesh).material as THREE.MeshStandardMaterial
          mat.clippingPlanes = s.clip ? [plane.current] : []
          mat.emissive.set(id === sel ? '#7c2d12' : '#000000')
          mat.needsUpdate = true
        })
      }
      const labels = stageRef.current?.scene.getObjectByName('labels')
      labels?.children.forEach((l) => (l.visible = s.labels && s.layers[l.userData.layer as Layer]))
    },
    [s.layers, s.clip, s.axis, s.cut, s.labels, sel],
    { camera: [0, 4.8, 10], target: [0, 4.4, 0], grid: false, background: '#0b1220' },
  )
  useEffect(() => {
    pickRef.current = (id: string) => {
      setSel(id)
      if (quiz) {
        const ok = id === quiz.target
        const name = PARTS.find((p) => p.id === quiz.target)!.name
        if (ok) {
          const pool = PARTS.filter((p) => p.layer !== 'skin' && s.layers[p.layer] && p.id !== quiz.target)
          const next = pool[Math.floor(Math.random() * pool.length)]?.id ?? quiz.target
          setQuiz({ target: next, score: quiz.score + 1, tries: quiz.tries + 1, msg: `✓ Correct — that's the ${name}.` })
        } else setQuiz({ ...quiz, tries: quiz.tries + 1, msg: `✗ That's the ${PARTS.find((p) => p.id === id)!.name}. Try again.` })
      }
    }
  }, [quiz, s.layers])

  const view = (pos: P3) => {
    const st = stageRef.current
    if (!st) return
    st.camera.position.set(...pos)
    st.controls.target.set(0, 4.4, 0)
  }
  const focus = (id: string) => {
    setSel(id)
    const g = groups.current.get(id)
    const st = stageRef.current
    if (!g || !st) return
    const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3())
    st.controls.target.copy(c)
    st.camera.position.set(c.x, c.y + 0.6, c.z + 5)
  }
  const startQuiz = () => {
    const pool = PARTS.filter((p) => p.layer !== 'skin' && s.layers[p.layer])
    if (!pool.length) return
    setQuiz({ target: pool[Math.floor(Math.random() * pool.length)].id, score: 0, tries: 0, msg: '' })
  }
  const part = PARTS.find((p) => p.id === sel)
  const list = searchParts(q)

  return (
    <div>
      <Note tone="warn">Schematic, simplified model built from basic shapes for orientation and learning — sizes and positions are approximate and <b>not medically accurate</b>. Do not use for diagnosis or clinical decisions.</Note>
      <Split wide="left">
        <Panel title="Model" actions={<><Btn kind="ghost" onClick={() => view([0, 4.8, 10])}>Front</Btn><Btn kind="ghost" onClick={() => view([10, 4.8, 0])}>Side</Btn><Btn kind="ghost" onClick={() => view([0, 4.8, -10])}>Back</Btn><Btn kind="ghost" onClick={() => view([0, 16, 0.5])}>Top</Btn></>}>
          <View3D refEl={ref} height={560} />
          <p className="muted" style={{ fontSize: 12 }}>Click a structure to read about it. Drag to rotate, scroll to zoom, right-drag to pan. The subject faces you, so their left side is on your right.</p>
        </Panel>
        <div>
          {quiz && (
            <Panel title={`Quiz · ${quiz.score}/${quiz.tries}`} actions={<Btn kind="ghost" onClick={() => setQuiz(null)}>End</Btn>}>
              <p style={{ fontSize: 18 }}>Click the <b>{PARTS.find((p) => p.id === quiz.target)!.name}</b></p>
              {quiz.msg && <Note tone={quiz.msg.startsWith('✓') ? 'ok' : 'err'}>{quiz.msg}</Note>}
            </Panel>
          )}
          <Panel title={part ? part.name : 'Select a structure'}>
            {part ? (
              <>
                <p style={{ margin: '0 0 6px' }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: part.color, marginRight: 6 }} />{LAYERS.find((l) => l[0] === part.layer)![1]}</p>
                <p>{part.info}</p>
                <Row><Btn onClick={() => focus(part.id)}>🔍 Zoom to it</Btn><Btn kind="ghost" onClick={() => setSel(null)}>Clear</Btn></Row>
              </>
            ) : <p className="muted">Click any bone or organ in the 3D view, or pick one from the list below.</p>}
          </Panel>
          <Panel title="Layers" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            {LAYERS.map(([id, name, c]) => (
              <Check key={id} label={<><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: c, marginRight: 4 }} />{name}</>} value={s.layers[id]} onChange={(v) => set({ layers: { ...s.layers, [id]: v } })} />
            ))}
            <Row>
              <Check label="Labels" value={s.labels} onChange={(labels) => set({ labels })} />
              <Check label="Auto-rotate" value={s.spin} onChange={(spin) => set({ spin })} />
            </Row>
          </Panel>
          <Panel title="Cross-section">
            <Check label="Clip with a cutting plane" value={s.clip} onChange={(clip) => set({ clip })} />
            <Seg value={s.axis} onChange={(axis) => set({ axis, clip: true })} options={[['sagittal', 'Sagittal (L/R)'], ['coronal', 'Coronal (front/back)'], ['transverse', 'Transverse (top/bottom)']]} label="Plane" />
            <Slider label="Position" value={s.cut} min={-1} max={1} step={0.01} onChange={(cut) => set({ cut, clip: true })} show={(v) => `${Math.round(((v + 1) / 2) * 100)}%`} />
            <p className="muted" style={{ fontSize: 12 }}>Sagittal removes the subject's left side, coronal removes the front, transverse removes everything above the cut.</p>
          </Panel>
          <Panel title="Structures" actions={<Btn onClick={startQuiz}>🎯 Quiz me</Btn>}>
            <Txt label="Search" value={q} onChange={setQ} placeholder="e.g. kidney, nerve, femur" />
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 2 }}>
              {list.map((p) => (
                <button key={p.id} type="button" onClick={() => { focus(p.id); if (!s.layers[p.layer]) set({ layers: { ...s.layers, [p.layer]: true } }) }} className={`k-btn ${sel === p.id ? 'primary' : 'ghost'}`} style={{ justifyContent: 'flex-start', textAlign: 'left' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: p.color, marginRight: 6 }} />{p.name}
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
