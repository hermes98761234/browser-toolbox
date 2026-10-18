import { useEffect, useRef, useState } from 'react'
import { Btn, Check, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { byId, COMPARE, forCell, makeQuestion, rng, type CellType, type Question } from './lib/cell-biology-explorer'

const DEF = { cell: 'animal' as CellType, cut: 1.5, cutOn: true, sliceAll: true, labels: true, best: 0 }
const CONTAINERS = new Set(['membrane', 'wall', 'cytoplasm'])

type Mats = Record<string, THREE.MeshStandardMaterial>

function buildCell(cell: CellType, g: THREE.Group, mats: Mats, plane: THREE.Plane | null, sliceAll: boolean) {
  const r = rng(cell === 'animal' ? 11 : 23)
  const mat = (id: string, opts: THREE.MeshStandardMaterialParameters = {}) => {
    if (!mats[id]) {
      const container = CONTAINERS.has(id) || id === 'vacuole'
      mats[id] = new THREE.MeshStandardMaterial({ color: byId(id)?.color ?? '#999', roughness: 0.55, side: THREE.DoubleSide, clippingPlanes: plane && (container || sliceAll) ? [plane] : [], ...opts })
    }
    return mats[id]
  }
  const add = (id: string, geo: THREE.BufferGeometry, pos: [number, number, number], m?: THREE.Material, rot?: [number, number, number]) => {
    const mesh = new THREE.Mesh(geo, m ?? mat(id))
    mesh.position.set(...pos)
    if (rot) mesh.rotation.set(...rot)
    mesh.userData.id = id
    g.add(mesh)
    return mesh
  }
  const animal = cell === 'animal'
  // container
  const half: [number, number, number] = animal ? [6, 4.3, 5] : [6, 3.6, 3.6]
  const nucC: [number, number, number] = animal ? [0.6, 0.2, 0] : [-3.9, 0.9, 0.9]
  const nucR = animal ? 1.7 : 1.3
  const vacC: [number, number, number] = [1.1, 0, 0]
  const vacR: [number, number, number] = [3.7, 2.45, 2.45]
  if (animal) {
    add('membrane', new THREE.SphereGeometry(1, 64, 32).scale(...half), [0, 0, 0], mat('membrane', { transparent: true, opacity: 0.28, depthWrite: false }))
  } else {
    add('wall', new THREE.BoxGeometry(half[0] * 2 + 0.6, half[1] * 2 + 0.6, half[2] * 2 + 0.6), [0, 0, 0], mat('wall', { transparent: true, opacity: 0.32, depthWrite: false }))
    add('membrane', new THREE.BoxGeometry(half[0] * 2, half[1] * 2, half[2] * 2), [0, 0, 0], mat('membrane', { transparent: true, opacity: 0.22, depthWrite: false }))
    add('vacuole', new THREE.SphereGeometry(1, 48, 24).scale(...vacR), vacC, mat('vacuole', { transparent: true, opacity: 0.45, depthWrite: false }))
    for (const [x, y] of [[-2, 1], [2, -1.5], [4, 2]] as [number, number][]) add('plasmodesmata', new THREE.CylinderGeometry(0.12, 0.12, 1.2, 10).rotateX(Math.PI / 2), [x, y, half[2] + 0.3])
  }
  // nucleus, nucleolus and pores
  add('nucleus', new THREE.SphereGeometry(nucR, 48, 24), nucC, mat('nucleus', { transparent: true, opacity: 0.85 }))
  add('nucleolus', new THREE.SphereGeometry(nucR * 0.33, 24, 12), [nucC[0] + 0.3, nucC[1] + 0.2, nucC[2]])
  for (let i = 0; i < 26; i++) {
    const d = new THREE.Vector3().randomDirection()
    const p = new THREE.Vector3(...nucC).addScaledVector(d, nucR)
    const m = add('envelope', new THREE.TorusGeometry(0.1, 0.035, 6, 12), [p.x, p.y, p.z])
    m.lookAt(new THREE.Vector3(...nucC))
  }
  // random free spot inside the cell, away from nucleus (and the vacuole in plants)
  const spot = (margin = 0.8): [number, number, number] => {
    for (let k = 0; k < 400; k++) {
      const p: [number, number, number] = [(r() * 2 - 1) * (half[0] - margin), (r() * 2 - 1) * (half[1] - margin), (r() * 2 - 1) * (half[2] - margin)]
      if (animal && (p[0] / (half[0] - margin)) ** 2 + (p[1] / (half[1] - margin)) ** 2 + (p[2] / (half[2] - margin)) ** 2 > 1) continue
      if (Math.hypot(p[0] - nucC[0], p[1] - nucC[1], p[2] - nucC[2]) < nucR + 0.9) continue
      if (!animal && ((p[0] - vacC[0]) / (vacR[0] + 0.5)) ** 2 + (p[1] / (vacR[1] + 0.5)) ** 2 + (p[2] / (vacR[2] + 0.5)) ** 2 < 1) continue
      return p
    }
    return [half[0] * 0.7, 0, 0]
  }
  // rough ER: curved sheets wrapping the nucleus, with ribosome dots
  for (let i = 0; i < 4; i++) {
    const rad = nucR + 0.45 + i * 0.32
    const m = add('rer', new THREE.TorusGeometry(rad, 0.07, 6, 48, Math.PI * (animal ? 1.1 : 0.8)), nucC, undefined, [Math.PI / 2 + 0.25 * i, 0.2 * i, animal ? 2.2 : 3.6])
    m.scale.set(1, 1, 3)
  }
  const ribGeo = new THREE.SphereGeometry(0.06, 6, 4)
  const ribo = new THREE.InstancedMesh(ribGeo, mat('ribosome'), 320)
  ribo.userData.id = 'ribosome'
  const tmp = new THREE.Object3D()
  for (let i = 0; i < 320; i++) {
    tmp.position.set(...(i < 110 ? (() => { const a = r() * Math.PI * (animal ? 1.1 : 0.8) + (animal ? 2.2 : 3.6), rad = nucR + 0.45 + Math.floor(r() * 4) * 0.32 + 0.1; return [nucC[0] + rad * Math.cos(a), nucC[1] + (r() - 0.5) * 1.2, nucC[2] + rad * Math.sin(a)] as [number, number, number] })() : spot(0.4)))
    tmp.updateMatrix()
    ribo.setMatrixAt(i, tmp.matrix)
  }
  g.add(ribo)
  // smooth ER tubes
  for (let i = 0; i < 3; i++) {
    const s = spot(1.2)
    const pts = Array.from({ length: 5 }, (_, k) => new THREE.Vector3(s[0] + Math.sin(k * 1.3 + i) * 0.9, s[1] + (k - 2) * 0.35, s[2] + Math.cos(k * 1.7 + i) * 0.9))
    add('ser', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.1, 8), [0, 0, 0])
  }
  // Golgi: nested curved cisternae + vesicles
  const gp: [number, number, number] = animal ? [-3.1, 0.6, -1.2] : [-2.6, -2.2, -1.7]
  for (let i = 0; i < 5; i++) add('golgi', new THREE.SphereGeometry(1.0 + i * 0.18, 28, 8, 0, Math.PI * 2, 0, 0.55), [gp[0] + i * 0.16, gp[1], gp[2]], undefined, [0, 0, Math.PI / 2])
  for (let i = 0; i < 7; i++) add('vesicle', new THREE.SphereGeometry(0.14, 12, 8), [gp[0] - 0.5 - r() * 0.6, gp[1] + (r() - 0.5) * 2, gp[2] + (r() - 0.5) * 2])
  // mitochondria with an inner matrix
  for (let i = 0; i < (animal ? 7 : 5); i++) {
    const p = spot(1)
    const rot: [number, number, number] = [r() * 3, r() * 3, r() * 3]
    add('mito', new THREE.CapsuleGeometry(0.33, 0.9, 6, 14), p, undefined, rot)
    add('mito', new THREE.CapsuleGeometry(0.22, 0.75, 4, 10), p, mat('mito-in', { color: '#9a3412' }), rot).userData.id = 'mito'
  }
  if (animal) {
    for (let i = 0; i < 5; i++) add('lysosome', new THREE.SphereGeometry(0.3, 16, 10), spot())
    const cp: [number, number, number] = [nucC[0] - 2.4, nucC[1] + 1.6, nucC[2] + 0.8]
    add('centrosome', new THREE.CylinderGeometry(0.14, 0.14, 0.7, 9), cp)
    add('centrosome', new THREE.CylinderGeometry(0.14, 0.14, 0.7, 9), [cp[0] + 0.35, cp[1], cp[2]], undefined, [0, 0, Math.PI / 2])
  } else {
    for (let i = 0; i < 9; i++) {
      const p = spot(0.6)
      const rot: [number, number, number] = [r() * 0.6, r() * 3, r() * 0.6]
      add('chloroplast', new THREE.SphereGeometry(1, 24, 12).scale(0.85, 0.36, 0.5), p, undefined, rot)
      for (let k = 0; k < 3; k++) add('chloroplast', new THREE.CylinderGeometry(0.13, 0.13, 0.22, 10), [p[0] + (k - 1) * 0.4, p[1], p[2]], mat('grana', { color: '#14532d' })).userData.id = 'chloroplast'
    }
  }
  for (let i = 0; i < 4; i++) add('peroxisome', new THREE.SphereGeometry(0.26, 14, 10), spot())
  return { half }
}

export default function CellBiologyExplorer() {
  const [s, set, reset] = useToolState('cell-biology-explorer', DEF)
  const [sel, setSel] = useState<string>('nucleus')
  const [quiz, setQuiz] = useState<{ q: Question; score: number; n: number; feedback: string; seed: number } | null>(null)
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 0, -1), 1.5))
  const mats = useRef<Mats>({})
  const world = useRef(new THREE.Group())
  const pick = useRef<(id: string) => void>(() => undefined)
  const stage = useRef<Stage3D | null>(null)


  const ref = useStage3D(
    (st) => {
      stage.current = st
      st.renderer.localClippingEnabled = true
      st.scene.add(world.current)
      const el = st.renderer.domElement
      let down: [number, number] = [0, 0]
      const onDown = (e: PointerEvent) => (down = [e.clientX, e.clientY])
      const onUp = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return
        const rect = el.getBoundingClientRect()
        const ray = new THREE.Raycaster()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), st.camera)
        const hits = ray.intersectObjects(world.current.children, false).filter((h) => {
          const m = (h.object as THREE.Mesh).material as THREE.Material
          return !(m.clippingPlanes?.length && m.clippingPlanes[0].distanceToPoint(h.point) < 0)
        })
        const id = hits.find((h) => h.object.userData.id)?.object.userData.id as string | undefined
        if (id) pick.current(id)
      }
      el.addEventListener('pointerdown', onDown)
      el.addEventListener('pointerup', onUp)
      return () => {
        el.removeEventListener('pointerdown', onDown)
        el.removeEventListener('pointerup', onUp)
      }
    },
    (st) => {
      st.clear(world.current)
      mats.current = {}
      const { half } = buildCell(s.cell, world.current, mats.current, s.cutOn ? plane.current : null, s.sliceAll)
      if (s.labels) {
        // one callout per structure, spread evenly round a ring outside the cell (kept in angular order)
        const seen = new Map<string, THREE.Vector3>()
        for (const c of world.current.children) {
          const id = c.userData.id as string
          if (!id || seen.has(id) || id === 'ribosome') continue
          const p = c.position.clone()
          if (CONTAINERS.has(id)) {
            const a = id === 'wall' ? 2.4 : id === 'membrane' ? 0.5 : -0.4
            p.set(half[0] * Math.cos(a) * (id === 'cytoplasm' ? 0.8 : 1), half[1] * Math.sin(a) * (id === 'cytoplasm' ? 0.8 : 1), 0)
          }
          seen.set(id, p)
        }
        const items = [...seen.entries()].map(([id, p]) => ({ id, p, a: Math.atan2(p.y / half[1], p.x / half[0]) })).sort((x, y) => x.a - y.a)
        const N = items.length
        let off = 0, bestCost = Infinity
        for (let t = 0; t < 36; t++) {
          const o = (t / 36) * ((2 * Math.PI) / N)
          const cost = items.reduce((acc, it, k) => {
            const d = Math.abs(((it.a - (o + (k * 2 * Math.PI) / N - Math.PI) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)
            return acc + d
          }, 0)
          if (cost < bestCost) {
            bestCost = cost
            off = o
          }
        }
        items.forEach((it, k) => {
          const th = off + (k * 2 * Math.PI) / N - Math.PI
          const out = new THREE.Vector3(half[0] * 1.22 * Math.cos(th), half[1] * 1.3 * Math.sin(th), 0)
          const lead = new THREE.Line(new THREE.BufferGeometry().setFromPoints([it.p, out]), new THREE.LineBasicMaterial({ color: '#cbd5e1', transparent: true, opacity: 0.55 }))
          world.current.add(lead)
          const l = label(byId(it.id)!.name, '#f8fafc', 1)
          ;(l.material as THREE.SpriteMaterial).sizeAttenuation = false
          l.scale.multiplyScalar(0.03)
          l.center.set(Math.cos(th) >= 0 ? 0 : 1, 0.5)
          l.position.copy(out)
          world.current.add(l)
        })
      }
    },
    [s.cell, s.cutOn, s.sliceAll, s.labels],
    { camera: [7, 7, 12], grid: false, background: '#0b1220' },
  )

  useEffect(() => {
    plane.current.constant = s.cut
  }, [s.cut])
  useEffect(() => {
    for (const [id, m] of Object.entries(mats.current)) m.emissive.set(id === sel || (sel === 'mito' && id === 'mito-in') || (sel === 'chloroplast' && id === 'grana') ? '#555555' : '#000000')
  })

  const newQ = (seed: number, score = 0, n = 0, feedback = '') => setQuiz({ q: makeQuestion(s.cell, rng(seed)), score, n, feedback, seed })
  const answer = (id: string) => {
    if (!quiz) return
    const ok = id === quiz.q.answer
    const right = byId(quiz.q.answer)!.name
    const score = quiz.score + (ok ? 1 : 0)
    const n = quiz.n + 1
    if (score > s.best && n >= 5) set({ best: score })
    setSel(id)
    newQ(quiz.seed * 31 + 7, score, n, ok ? `✓ Correct — ${right}.` : `✗ That was the ${byId(id)?.name.toLowerCase()}. The answer: ${right}.`)
  }

  const choose = (id: string) => {
    if (quiz?.q.kind === 'find') answer(id)
    else setSel(id)
  }
  useEffect(() => {
    pick.current = choose
  })

  const o = byId(sel)
  const list = forCell(s.cell)

  return (
    <Split wide="right">
      <div>
        <Panel title="Cell">
          <Seg value={s.cell} onChange={(cell) => { set({ cell }); setQuiz(null); if (!byId(sel)?.cells.includes(cell)) setSel('nucleus') }} options={[['animal', '🐾 Animal cell'], ['plant', '🌿 Plant cell']]} />
          <Check label="Cutaway (clip the front)" value={s.cutOn} onChange={(cutOn) => set({ cutOn })} />
          {s.cutOn && <Slider label="Cut depth" value={s.cut} onChange={(cut) => set({ cut })} min={-3} max={6} step={0.1} />}
          {s.cutOn && <Check label="Slice organelles too (see inside the nucleus, mitochondria…)" value={s.sliceAll} onChange={(sliceAll) => set({ sliceAll })} />}
          <Check label="Labels" value={s.labels} onChange={(labels) => set({ labels })} />
          <Btn kind="ghost" onClick={() => { reset(); setQuiz(null) }}>Reset view settings</Btn>
        </Panel>
        <Panel title="Organelles">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {list.map((x) => (
              <button key={x.id} type="button" className={`k-btn ${x.id === sel ? 'primary' : 'ghost'}`} onClick={() => setSel(x.id)} disabled={quiz?.q.kind === 'find'}>
                <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: x.color, marginRight: 6 }} />{x.name}
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Animal vs plant">
          <Table head={['', 'Animal', 'Plant']} rows={COMPARE.map((r) => [<b key="a">{r[0]}</b>, r[1], r[2]])} />
        </Panel>
      </div>
      <div>
        <Panel title={`${s.cell === 'animal' ? 'Animal' : 'Plant'} cell — schematic, not to scale`}>
          <View3D refEl={ref} height={460} />
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Click any structure to read about it. Drag to rotate, scroll to zoom. Shapes and counts are simplified for teaching.</p>
        </Panel>
        {quiz ? (
          <Panel title="Quiz" actions={<Btn kind="ghost" onClick={() => setQuiz(null)}>End quiz</Btn>}>
            <Stats>
              <Stat label="Score" value={`${quiz.score} / ${quiz.n}`} tone="accent" />
              <Stat label="Best (5+ questions)" value={s.best} />
            </Stats>
            {quiz.feedback && <Note tone={quiz.feedback.startsWith('✓') ? 'ok' : 'err'}>{quiz.feedback}</Note>}
            <p style={{ fontSize: 18, fontWeight: 700 }}>{quiz.q.prompt}</p>
            {quiz.q.kind === 'choice' ? (
              <Row>{quiz.q.options.map((id) => <Btn key={id} onClick={() => answer(id)}>{byId(id)!.name}</Btn>)}</Row>
            ) : (
              <Row><span className="muted">Click it in the 3D view (use the cutaway to reach inside).</span><Btn kind="ghost" onClick={() => answer('')}>Skip</Btn></Row>
            )}
          </Panel>
        ) : (
          <Panel title="Quiz"><Row><span className="muted">Mixed questions: find structures in 3D and match functions.</span><Btn kind="primary" onClick={() => newQ(Date.now() % 100000)}>Start quiz</Btn></Row></Panel>
        )}
        {o && (
          <Panel title={o.name}>
            <p><b>What it is:</b> {o.what}</p>
            <p><b>What it does:</b> {o.job}</p>
            <Note>💡 {o.fact}</Note>
            <p className="muted" style={{ fontSize: 13 }}>Found in: {o.cells.join(' and ')} cells.</p>
          </Panel>
        )}
      </div>
    </Split>
  )
}
