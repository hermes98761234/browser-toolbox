import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, Note, Panel, pct, Row, Select, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { BONE_TOTAL, BONES, choices, REGIONS, ribPoints, searchBones, SPINE, type Bone, type P3, type Region, type Shape } from './lib/skeleton-explorer'

type QuizMode = 'find' | 'name'
interface Quiz { mode: QuizMode; target: string; options: string[]; score: number; asked: number; streak: number; misses: number; msg: string; tone: 'ok' | 'err' | 'info' }

const DEF = { region: 'all' as Region | 'all', hide: false, tint: false, labels: true, spin: false, best: { find: 0, name: 0 } as Record<QuizMode, number> }
const SCALE = 0.5
const IVORY = '#ebe3cc'
const RCOL: Record<Region, string> = { skull: '#f9a8d4', spine: '#fcd34d', thorax: '#fdba74', arm: '#86efac', hand: '#5eead4', pelvis: '#c4b5fd', leg: '#93c5fd', foot: '#a5b4fc' }
const KIND: Record<Bone['kind'], string> = { long: 'Long bone', short: 'Short bone', flat: 'Flat bone', irregular: 'Irregular bone', sesamoid: 'Sesamoid bone', group: 'Group of bones' }
const V = (p: P3) => new THREE.Vector3(...p)
const byId = new Map(BONES.map((b) => [b.id, b]))

function geoms(sh: Shape): THREE.BufferGeometry[] {
  if (sh.t === 'ellip') {
    const g = new THREE.SphereGeometry(1, 28, 18)
    g.scale(...sh.r)
    if (sh.rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...sh.rot)))
    g.translate(...sh.c)
    return [g]
  }
  if (sh.t === 'cap') {
    const a = V(sh.a), b = V(sh.b)
    const g = new THREE.CapsuleGeometry(sh.r, Math.max(0.01, a.distanceTo(b)), 6, 12)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()))
    const m = a.add(b).multiplyScalar(0.5)
    g.translate(m.x, m.y, m.z)
    return [g]
  }
  if (sh.t === 'tube') return [new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sh.pts.map(V)), 32, sh.r, 8, false)]
  if (sh.t === 'box') {
    const g = new THREE.BoxGeometry(...sh.s)
    if (sh.rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...sh.rot)))
    g.translate(...sh.c)
    return [g]
  }
  if (sh.t === 'ribs') {
    const out: THREE.BufferGeometry[] = []
    for (let i = sh.from; i <= sh.to; i++) out.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ribPoints(i, sh.side).map(V)), 24, 0.05, 6, false))
    return out
  }
  // vertebrae along the spine curve: body + spinous process
  const curve = new THREE.CatmullRomCurve3(SPINE.map(V))
  const out: THREE.BufferGeometry[] = []
  const gap = sh.n > 1 ? ((sh.u1 - sh.u0) / (sh.n - 1)) * curve.getLength() : 0.14
  for (let k = 0; k < sh.n; k++) {
    const u = sh.n === 1 ? sh.u0 : sh.u0 + ((sh.u1 - sh.u0) * k) / (sh.n - 1)
    const r = sh.r0 + ((sh.r1 - sh.r0) * k) / Math.max(1, sh.n - 1)
    const p = curve.getPointAt(u), tg = curve.getTangentAt(u)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg)
    const body = new THREE.CylinderGeometry(r, r, Math.min(0.2, gap * 0.72), 14)
    body.applyQuaternion(q)
    body.translate(p.x, p.y, p.z)
    const spin = new THREE.BoxGeometry(0.06, Math.min(0.12, gap * 0.6), r * 1.6)
    spin.translate(0, -0.03, -r * 1.3)
    spin.applyQuaternion(q)
    spin.translate(p.x, p.y, p.z)
    out.push(body, spin)
  }
  return out
}

export default function SkeletonExplorer() {
  const [s, set] = useToolState('skeleton-explorer', DEF)
  const [sel, setSel] = useState<string | null>('femur-l')
  const [q, setQ] = useState('')
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const stageRef = useRef<Stage3D | null>(null)
  const groups = useRef(new Map<string, THREE.Group>())
  const tagRef = useRef<THREE.Sprite | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const pickRef = useRef<(id: string) => void>(() => {})
  const spinRef = useRef(s.spin)
  const hoverOk = useRef(true)
  useEffect(() => { spinRef.current = s.spin }, [s.spin])

  const matches = useMemo(() => new Set(q.trim() ? searchBones(q).map((b) => b.id) : []), [q])
  const listed = useMemo(() => searchBones(q, s.region), [q, s.region])
  const finding = quiz?.mode === 'find'
  useEffect(() => { hoverOk.current = !finding }, [finding])

  const ref = useStage3D(
    (stage) => {
      stageRef.current = stage
      const root = new THREE.Group()
      root.name = 'root'
      root.scale.setScalar(SCALE)
      stage.scene.add(root)
      for (const b of BONES) {
        const g = new THREE.Group()
        const mat = new THREE.MeshStandardMaterial({ color: IVORY, roughness: 0.6, metalness: 0.02 })
        for (const sh of b.shapes) for (const geo of geoms(sh)) {
          const m = new THREE.Mesh(geo, mat)
          m.userData.bone = b.id
          g.add(m)
        }
        groups.current.set(b.id, g)
        root.add(g)
      }
      const el = stage.renderer.domElement
      const ray = new THREE.Raycaster()
      const hit = (e: PointerEvent) => {
        const r = el.getBoundingClientRect()
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), stage.camera)
        const vis = [...groups.current.values()].filter((g) => g.visible && !g.userData.dim)
        return ray.intersectObjects(vis, true)[0]?.object.userData.bone as string | undefined
      }
      let dx = 0, dy = 0
      const down = (e: PointerEvent) => { dx = e.clientX; dy = e.clientY }
      const up = (e: PointerEvent) => {
        if (Math.hypot(e.clientX - dx, e.clientY - dy) > 4) return
        const id = hit(e)
        if (id) pickRef.current(id)
      }
      const move = (e: PointerEvent) => {
        const tip = tipRef.current
        if (!tip) return
        const id = e.pointerType === 'mouse' && hoverOk.current ? hit(e) : undefined
        if (!id) { tip.style.display = 'none'; el.style.cursor = ''; return }
        const r = el.getBoundingClientRect()
        tip.textContent = byId.get(id)!.name
        tip.style.display = 'block'
        tip.style.left = `${Math.min(e.clientX - r.left + 14, r.width - 160)}px`
        tip.style.top = `${e.clientY - r.top + 12}px`
        el.style.cursor = 'pointer'
      }
      el.addEventListener('pointerdown', down)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointermove', move)
      stage.onFrame((_, dt) => { if (spinRef.current) root.rotation.y += dt * 0.35 })
      return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointerup', up); el.removeEventListener('pointermove', move) }
    },
    (stage) => {
      const target = quiz?.target
      for (const b of BONES) {
        const g = groups.current.get(b.id)!
        const outRegion = s.region !== 'all' && b.region !== s.region
        g.visible = !(s.hide && outRegion)
        const dim = outRegion || (!quiz && matches.size > 0 && !matches.has(b.id))
        g.userData.dim = dim
        const mat = (g.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial
        mat.color.set(s.tint ? RCOL[b.region] : IVORY)
        mat.transparent = dim
        mat.opacity = dim ? 0.13 : 1
        mat.depthWrite = !dim
        let em = '#000000'
        if (quiz?.mode === 'name' && b.id === target) em = '#1d4ed8'
        else if (!quiz && b.id === sel) em = '#c2410c'
        else if (!quiz && matches.has(b.id)) em = '#a16207'
        mat.emissive.set(em)
        mat.emissiveIntensity = em === '#000000' ? 0 : 0.75
      }
      // name tag for the selected bone (hidden while quizzing)
      const root = stage.scene.getObjectByName('root')!
      if (tagRef.current) { root.remove(tagRef.current); tagRef.current.material.map?.dispose(); tagRef.current.material.dispose(); tagRef.current = null }
      const showId = quiz ? null : sel
      if (s.labels && showId) {
        const g = groups.current.get(showId)!
        root.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(g)
        const c = box.getCenter(new THREE.Vector3()).divideScalar(SCALE)
        const t = label(byId.get(showId)!.name, '#fef3c7', 0.55)
        t.position.set(c.x + (c.x >= 0 ? 0.4 : -0.4), box.max.y / SCALE + 0.35, c.z)
        t.center.set(c.x >= 0 ? 0 : 1, 0)
        t.renderOrder = 10
        root.add(t)
        tagRef.current = t
      }
    },
    [s.region, s.hide, s.tint, s.labels, sel, matches, quiz?.target, quiz?.mode],
    { camera: [0, 4.5, 9.8], target: [0, 4.4, 0], grid: false, background: '#0b1220' },
  )

  const nextQuestion = (mode: QuizMode, prev?: Quiz): Quiz => {
    const pool = BONES.filter((b) => s.region === 'all' || b.region === s.region)
    let t = pool[Math.floor(Math.random() * pool.length)]
    if (prev && pool.length > 1) while (t.id === prev.target) t = pool[Math.floor(Math.random() * pool.length)]
    return {
      mode, target: t.id, options: mode === 'name' ? choices(t, 3).map((b) => b.id) : [],
      score: prev?.score ?? 0, asked: prev?.asked ?? 0, streak: prev?.streak ?? 0, misses: 0,
      msg: prev?.msg ?? (mode === 'find' ? 'Click the bone named below.' : 'Which bone is highlighted in blue?'), tone: prev?.tone ?? 'info',
    }
  }
  const answer = (id: string) => {
    if (!quiz) return
    const t = byId.get(quiz.target)!
    if (id === quiz.target) {
      const first = quiz.misses === 0
      const score = quiz.score + (first ? 1 : 0)
      const streak = first ? quiz.streak + 1 : 0
      if (score > s.best[quiz.mode]) set({ best: { ...s.best, [quiz.mode]: score } })
      setSel(id)
      setQuiz(nextQuestion(quiz.mode, { ...quiz, score, streak, asked: quiz.asked + 1, msg: `✓ ${t.name}${first ? '' : ' (after a miss — no point)'}${streak >= 3 ? ` · streak ${streak} 🔥` : ''}`, tone: 'ok' }))
    } else {
      const misses = quiz.misses + 1
      const clicked = byId.get(id)!.name
      if (misses >= 3) {
        setQuiz(nextQuestion(quiz.mode, { ...quiz, streak: 0, asked: quiz.asked + 1, msg: `✗ That was the ${t.name}. Moving on.`, tone: 'err' }))
        setSel(t.id)
      } else setQuiz({ ...quiz, misses, streak: 0, msg: `✗ That’s the ${clicked}. ${3 - misses} tr${3 - misses === 1 ? 'y' : 'ies'} left.${misses === 2 ? ` Hint: it’s in the ${REGIONS.find((r) => r[0] === t.region)![1].toLowerCase()} region.` : ''}`, tone: 'err' })
    }
  }
  useEffect(() => {
    pickRef.current = (id) => {
      if (quiz?.mode === 'find') answer(id)
      else if (!quiz) setSel(id)
    }
  })

  const focus = (id: string) => {
    const st = stageRef.current
    const g = groups.current.get(id)
    if (!st || !g) return
    const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3())
    const dir = st.camera.position.clone().sub(st.controls.target).normalize()
    st.controls.target.copy(c)
    st.camera.position.copy(c.clone().add(dir.multiplyScalar(4)))
  }
  const view = (pos: P3) => {
    const st = stageRef.current
    if (!st) return
    st.controls.target.set(0, 4.4, 0)
    st.camera.position.set(...pos)
  }

  const b = sel ? byId.get(sel) : undefined
  const qTarget = quiz ? byId.get(quiz.target)! : null
  const regionCount = BONES.filter((x) => s.region === 'all' || x.region === s.region)

  return (
    <Split wide="right">
      <div>
        <Panel title="Explore">
          <Txt label="Search bones" value={q} onChange={setQ} placeholder="e.g. femur, wrist, rib, kneecap" />
          <Select label="Region" value={s.region} onChange={(region) => set({ region })} options={[['all', 'Whole skeleton'], ...REGIONS]} />
          <Row>
            <Check label="Hide other regions" value={s.hide} onChange={(hide) => set({ hide })} />
            <Check label="Colour by region" value={s.tint} onChange={(tint) => set({ tint })} />
            <Check label="Name tag" value={s.labels} onChange={(labels) => set({ labels })} />
            <Check label="Spin" value={s.spin} onChange={(spin) => set({ spin })} />
          </Row>
          <div style={{ maxHeight: 340, overflow: 'auto', display: 'grid', gap: 4, marginTop: 6 }}>
            {REGIONS.filter(([r]) => listed.some((x) => x.region === r)).map(([r, name]) => (
              <div key={r}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 700, margin: '6px 0 2px' }}><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: RCOL[r], marginRight: 6 }} />{name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {listed.filter((x) => x.region === r).map((x) => (
                    <button key={x.id} type="button" className={`k-btn ${x.id === sel ? 'primary' : ''}`} style={{ padding: '3px 8px', fontSize: 12 }} disabled={!!quiz} onClick={() => setSel(x.id)}>{x.name}</button>
                  ))}
                </div>
              </div>
            ))}
            {!listed.length && <Note tone="warn">No bone matches “{q}”.</Note>}
          </div>
        </Panel>
        <Panel title="Quiz" actions={quiz ? <Btn kind="ghost" onClick={() => setQuiz(null)}>End quiz</Btn> : undefined}>
          {!quiz ? (
            <>
              <p style={{ marginTop: 0 }}>Test yourself on {s.region === 'all' ? 'the whole skeleton' : `the ${REGIONS.find((r) => r[0] === s.region)![1].toLowerCase()} region`} ({regionCount.length} bones). One point for each first-try answer.</p>
              <Row>
                <Btn kind="primary" onClick={() => { setQ(''); setQuiz(nextQuestion('find')) }}>🎯 Find the bone</Btn>
                <Btn kind="primary" onClick={() => { setQ(''); setQuiz(nextQuestion('name')) }}>❓ Name the bone</Btn>
              </Row>
              <p className="muted" style={{ fontSize: 13 }}>Best scores: find {s.best.find} · name {s.best.name}</p>
            </>
          ) : (
            <>
              <Stats>
                <Stat label="Score" value={`${quiz.score} / ${quiz.asked}`} sub={quiz.asked ? pct(quiz.score / quiz.asked, 0) : '—'} tone="accent" />
                <Stat label="Streak" value={quiz.streak} sub={`best ${s.best[quiz.mode]}`} />
              </Stats>
              <Note tone={quiz.tone}>{quiz.msg}</Note>
              {quiz.mode === 'find' ? (
                <p style={{ fontSize: 18 }}>Click the <b style={{ color: 'var(--accent)' }}>{qTarget!.name}</b></p>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {quiz.options.map((id) => <Btn key={id} onClick={() => answer(id)}>{byId.get(id)!.name}</Btn>)}
                </div>
              )}
              <Row><Btn kind="ghost" onClick={() => setQuiz(nextQuestion(quiz.mode, { ...quiz, asked: quiz.asked + 1, streak: 0, msg: `Skipped: it was the ${qTarget!.name}.`, tone: 'info' }))}>Skip</Btn></Row>
            </>
          )}
        </Panel>
      </div>
      <div>
        <Panel title="Schematic skeleton" actions={<><Btn onClick={() => view([0, 4.5, 9.8])}>Front</Btn><Btn onClick={() => view([9.8, 4.5, 0])}>Side</Btn><Btn onClick={() => view([0, 4.5, -9.8])}>Back</Btn></>}>
          <div style={{ position: 'relative' }}>
            <View3D refEl={ref} height={560} />
            <div ref={tipRef} style={{ position: 'absolute', display: 'none', pointerEvents: 'none', background: 'rgba(15,23,42,.9)', color: '#fff', padding: '3px 8px', borderRadius: 6, fontSize: 12, whiteSpace: 'nowrap' }} />
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Drag to orbit · scroll or pinch to zoom · click a bone to identify it. “Left” and “right” are the skeleton’s own sides (its left is on your right in front view).</p>
        </Panel>
        {b && !quiz && (
          <Panel title={b.name} actions={<><Btn onClick={() => focus(b.id)}>🔍 Zoom to</Btn><Btn onClick={() => set({ region: b.region })}>Show region</Btn></>}>
            <Row>
              <span className="k-btn" style={{ pointerEvents: 'none', background: RCOL[b.region], color: '#111' }}>{REGIONS.find((r) => r[0] === b.region)![1]}</span>
              <span className="k-btn" style={{ pointerEvents: 'none' }}>{KIND[b.kind]}</span>
              <span className="k-btn" style={{ pointerEvents: 'none' }}>{b.count > 1 ? `${b.count} bones` : '1 bone'}{b.side !== 'mid' ? ` · ${b.side === 'L' ? 'left' : 'right'} side` : ' · midline'}</span>
            </Row>
            <p style={{ fontSize: 16, marginBottom: 0 }}>{b.info}</p>
          </Panel>
        )}
        <Stats>
          <Stat label="Bones & groups" value={BONES.length} sub={`${BONE_TOTAL} of ~206 bones represented`} />
          <Stat label="In view" value={regionCount.length} sub={s.region === 'all' ? 'all regions' : REGIONS.find((r) => r[0] === s.region)![1]} />
          <Stat label="Search hits" value={q.trim() ? matches.size : '—'} sub={q.trim() ? 'highlighted in gold' : 'type to highlight'} />
        </Stats>
        <Note tone="warn">Schematic teaching model built from simple shapes — positions and proportions are approximate and not for clinical use. Small skull bones (sphenoid, ethmoid, lacrimal…) and the six ear ossicles are not modelled.</Note>
      </div>
    </Split>
  )
}
