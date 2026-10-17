import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, CopyButton, CsvButton, JsonButtons, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, uid, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { anglesAt, BONES, HAND_R, HEAD_R, JOINTS, mirror, mmss, poseById, POSES, segmentAt, skeleton, timeline, totalTime, type Angles, type Point, type Step } from './lib/stretching-routine-builder'

const ROUTINES: Record<string, [string, number][]> = {
  'Morning wake-up': [['reach', 20], ['side', 20], ['twist', 20], ['fold', 30], ['quad', 30], ['calf', 30], ['cat', 12], ['cow', 12], ['child', 30]],
  'Desk break': [['neck', 20], ['chest', 20], ['cross', 20], ['triceps', 20], ['twist', 20], ['reach', 15], ['fold', 20]],
  'After a run': [['quad', 30], ['calf', 30], ['lunge', 30], ['hamstring', 40], ['butterfly', 30], ['kneehug', 30]],
  'Bedtime wind-down': [['child', 40], ['cat', 15], ['cow', 15], ['sphinx', 30], ['supinetwist', 30], ['kneehug', 40], ['butterfly', 40]],
}
const mk = (name: string): Step[] => ROUTINES[name].map(([pose, hold]) => ({ id: uid(), pose, hold }))

const DEF = { name: 'Morning wake-up', steps: mk('Morning wake-up'), transition: 4, voice: true, beep: true }

// ---------- 2D thumbnail (3/4 view) ----------
const proj = (p: [number, number, number]) => [p[2] * 0.82 - p[0] * 0.57, p[1]] as const
function Thumb({ a, size = 84 }: { a: Angles; size?: number }) {
  const sk = skeleton(a)
  const pts = Object.values(sk).map(proj)
  const u0 = Math.min(...pts.map((p) => p[0])) - 0.15, u1 = Math.max(...pts.map((p) => p[0])) + 0.15
  const span = Math.max(u1 - u0, 1.95)
  const cu = (u0 + u1) / 2
  const X = (u: number) => ((u - cu) / span + 0.5) * size
  const Y = (v: number) => size - 6 - (v / span) * (size - 10)
  const line = (p: Point, q: Point, r: number, far: boolean, i: number) => {
    const [a1, b1] = proj(sk[p]), [a2, b2] = proj(sk[q])
    return <line key={i} x1={X(a1)} y1={Y(b1)} x2={X(a2)} y2={Y(b2)} strokeWidth={Math.max(2, (r * 2 * size) / span)} stroke={far ? 'var(--muted)' : 'var(--accent)'} strokeLinecap="round" opacity={far ? 0.55 : 1} />
  }
  const [hu, hv] = proj(sk.head)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <line x1={2} x2={size - 2} y1={size - 6} y2={size - 6} stroke="var(--line)" strokeWidth={2} />
      {BONES.map(([p, q, r], i) => (p.startsWith('l') && q.startsWith('l') ? line(p, q, r, true, i) : null))}
      {BONES.map(([p, q, r], i) => (p.startsWith('l') && q.startsWith('l') ? null : line(p, q, r, false, i)))}
      <circle cx={X(hu)} cy={Y(hv)} r={(HEAD_R * size) / span} fill="var(--accent)" />
    </svg>
  )
}

export default function StretchingRoutineBuilder() {
  const [s, set, reset] = useToolState('stretching-routine-builder', DEF)
  const segs = useMemo(() => timeline(s.steps, s.transition), [s.steps, s.transition])
  const total = totalTime(segs)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [preview, setPreview] = useState<string | null>(null)
  const tRef = useRef(0)
  const live = useRef({ playing, speed, segs, preview, total })
  useEffect(() => {
    live.current = { playing, speed, segs, preview, total }
  })

  const seek = (x: number) => {
    tRef.current = Math.max(0, Math.min(total, x))
    setT(tRef.current)
    setPreview(null)
  }

  // 3D mannequin: capsules between joints, positions updated every frame from the kinematics.
  const ref = useStage3D(
    (st) => {
      st.scene.background = new THREE.Color('#1e293b')
      const wood = new THREE.MeshStandardMaterial({ color: '#e8c9a0', roughness: 0.6 })
      const joint = new THREE.MeshStandardMaterial({ color: '#b7794a', roughness: 0.5 })
      const mat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.012, 2.1), new THREE.MeshStandardMaterial({ color: '#0d9488', roughness: 0.9 }))
      mat.position.y = -0.006
      st.scene.add(mat)
      const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 48), new THREE.MeshStandardMaterial({ color: '#334155' }))
      floor.rotation.x = -Math.PI / 2
      floor.position.y = -0.013
      st.scene.add(floor)
      const rest = skeleton({})
      const bones = BONES.map(([p, q, r]) => {
        const len = Math.hypot(rest[p][0] - rest[q][0], rest[p][1] - rest[q][1], rest[p][2] - rest[q][2])
        const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 14), wood)
        st.scene.add(m)
        return m
      })
      const head = new THREE.Mesh(new THREE.SphereGeometry(HEAD_R, 24, 18), wood)
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), joint)
      const hands = [0, 1].map(() => new THREE.Mesh(new THREE.SphereGeometry(HAND_R, 14, 10), joint))
      const knobs = (['lEl', 'rEl', 'lKn', 'rKn', 'lSh', 'rSh', 'lHip', 'rHip'] as Point[]).map((k) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(k.includes('Kn') || k.includes('Hip') ? 0.072 : 0.054, 14, 10), joint)
        st.scene.add(m)
        return [k, m] as const
      })
      st.scene.add(head, nose, ...hands)
      const up = new THREE.Vector3(0, 1, 0)
      const A = new THREE.Vector3(), B = new THREE.Vector3()
      let cur: Angles = { ...poseById('stand').a }
      st.onFrame((_, dt) => {
        const L = live.current
        if (L.playing) {
          tRef.current = Math.min(L.total, tRef.current + dt * L.speed)
        }
        const target = L.preview ? poseById(L.preview.replace(/:r$/, '')).a : anglesAt(L.segs, tRef.current)
        const goal = L.preview?.endsWith(':r') ? mirror(target) : target
        const k = Math.min(1, dt * (L.playing ? 14 : 5))
        const next: Angles = {}
        for (const j of JOINTS) next[j] = (cur[j] ?? 0) + ((goal[j] ?? 0) - (cur[j] ?? 0)) * k
        cur = next
        const sk = skeleton(cur)
        BONES.forEach(([p, q], i) => {
          A.set(...sk[p])
          B.set(...sk[q])
          const m = bones[i]
          m.position.copy(A).add(B).multiplyScalar(0.5)
          m.quaternion.setFromUnitVectors(up, B.sub(A).normalize())
        })
        head.position.set(...sk.head)
        nose.position.set(...sk.nose)
        hands[0].position.set(...sk.lHand)
        hands[1].position.set(...sk.rHand)
        for (const [kk, m] of knobs) m.position.set(...sk[kk])
      })
    },
    undefined,
    [],
    { camera: [1.9, 1.45, 2.3], target: [0, 0.62, 0], grid: false },
  )

  // UI clock, voice and beep cues
  const lastSeg = useRef(-1)
  useEffect(() => {
    if (!playing) return
    const say = (txt: string) => {
      if (!s.voice || typeof speechSynthesis === 'undefined') return
      speechSynthesis.cancel()
      speechSynthesis.speak(new SpeechSynthesisUtterance(txt))
    }
    const beep = () => {
      if (!s.beep) return
      try {
        const ac = new AudioContext()
        const o = ac.createOscillator(), g = ac.createGain()
        o.frequency.value = 880
        g.gain.setValueAtTime(0.15, ac.currentTime)
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.25)
        o.connect(g).connect(ac.destination)
        o.start()
        o.stop(ac.currentTime + 0.3)
        setTimeout(() => void ac.close(), 500)
      } catch {
        /* no audio */
      }
    }
    const id = setInterval(() => {
      const now = tRef.current
      setT(now)
      const i = segmentAt(segs, now)
      if (i !== lastSeg.current) {
        lastSeg.current = i
        const sg = segs[i]
        if (sg?.kind === 'move') say(sg.label === 'Finish' ? 'Release and stand tall.' : `${sg.label}${sg.side ? `, ${sg.side} side` : ''}`)
        if (sg?.kind === 'hold') beep()
      }
      if (now >= total) {
        setPlaying(false)
        say('Routine complete. Nice work!')
      }
    }, 100)
    return () => clearInterval(id)
  }, [playing, segs, total, s.voice, s.beep])

  const i = segmentAt(segs, t)
  const seg = segs[i]
  const curPose = preview ? poseById(preview.replace(/:r$/, '')) : seg && seg.step < s.steps.length ? poseById(s.steps[seg.step].pose) : poseById('stand')
  const remain = seg ? seg.start + seg.dur - t : 0
  const holds = segs.filter((x) => x.kind === 'hold')
  const holdTime = holds.reduce((a, x) => a + x.dur, 0)
  const editStep = (id: string, p: Partial<Step>) => set({ steps: s.steps.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const move = (idx: number, d: number) => {
    const a = [...s.steps]
    const j = idx + d
    if (j < 0 || j >= a.length) return
    ;[a[idx], a[j]] = [a[j], a[idx]]
    set({ steps: a })
  }
  const prev = () => {
    const m = seg?.kind === 'hold' ? i - 1 : i
    if (m < 0) return seek(0)
    seek(t - segs[m].start > 2 ? segs[m].start : segs[m - 2]?.start ?? 0)
  }
  const stepStart = (idx: number) => segs.find((x) => x.step === idx)?.start ?? 0
  const text = () =>
    `${s.name} — ${mmss(total)}\n` +
    s.steps.map((x, k) => { const p = poseById(x.pose); return `${k + 1}. ${p.name} — ${x.hold}s${p.sided ? ' each side' : ''} (${p.area}). ${p.cue}` }).join('\n')

  return (
    <Split wide="left">
      <div>
        <Stats>
          <Stat label="Routine length" value={mmss(total)} sub={`${holds.length} holds, ${mmss(holdTime)} stretching`} tone="accent" />
          <Stat label="Now" value={preview ? 'Preview' : seg ? (seg.kind === 'hold' ? `Hold ${Math.ceil(remain)}s` : seg.label === 'Finish' ? 'Finishing' : 'Get into position') : '—'} sub={preview ? curPose.name : seg?.side ? `${seg.side} side` : ' '} />
          <Stat label="Elapsed" value={mmss(t)} sub={`${mmss(Math.max(0, total - t))} left`} />
        </Stats>
        <Panel title={<>{curPose.name}{!preview && seg?.side ? ` · ${seg.side}` : ''}</>} actions={<span className="muted">{curPose.area}</span>}>
          <View3D refEl={ref} height={400} />
          <p style={{ margin: '10px 0 6px' }}>{curPose.cue}</p>
          <input type="range" min={0} max={total || 1} step={0.1} value={t} onChange={(e) => seek(Number(e.target.value))} style={{ width: '100%' }} aria-label="Timeline" />
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', margin: '2px 0 10px' }}>
            {segs.map((x, k) => (
              <span key={k} title={`${x.label}${x.side ? ` (${x.side})` : ''}`} style={{ flex: x.dur, background: x.kind === 'hold' ? (k === i ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 45%, transparent)') : 'var(--line)', borderRight: '1px solid var(--panel)' }} />
            ))}
          </div>
          <Row>
            <Btn kind="primary" disabled={!segs.length} onClick={() => { setPreview(null); if (t >= total) seek(0); setPlaying(!playing) }}>{playing ? '❚❚ Pause' : t > 0 && t < total ? '▶ Resume' : '▶ Start'}</Btn>
            <Btn onClick={prev}>⏮ Prev</Btn>
            <Btn onClick={() => seek(segs.find((x, k) => k > i && x.kind === 'move')?.start ?? total)}>Next ⏭</Btn>
            <Btn kind="ghost" onClick={() => { setPlaying(false); seek(0) }}>↺ Restart</Btn>
            <Seg label="Speed" value={String(speed)} onChange={(v) => setSpeed(Number(v))} options={[['0.5', '0.5×'], ['1', '1×'], ['2', '2×'], ['4', '4×']]} />
          </Row>
        </Panel>
        <Panel title="Pose library" actions={<span className="muted">click to preview · + to add</span>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 8 }}>
            {POSES.filter((p) => p.id !== 'stand').map((p) => (
              <div key={p.id} style={{ border: `1px solid ${preview?.startsWith(p.id) ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 10, padding: 6, textAlign: 'center', cursor: 'pointer' }} onClick={() => { setPlaying(false); setPreview(preview === p.id ? `${p.id}:r` : p.id) }} title={p.cue}>
                <Thumb a={p.a} />
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{p.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>{p.area}{p.sided ? ' · each side' : ''}</div>
                <button type="button" className="k-btn" style={{ marginTop: 4, padding: '2px 10px' }} onClick={(e) => { e.stopPropagation(); set({ steps: [...s.steps, { id: uid(), pose: p.id, hold: 30 }] }) }}>+ Add</button>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div>
        <Panel title="Routine" actions={<><CopyButton text={text} label="Copy" /><CsvButton name="stretch-routine.csv" rows={() => [['Start', 'Stretch', 'Side', 'Hold (s)', 'Area', 'Cue'], ...holds.map((h) => { const p = poseById(s.steps[h.step].pose); return [mmss(h.start), h.label, h.side ?? '', Math.round(h.dur), p.area, p.cue] })]} /></>}>
          <Row>
            <Select label="Preset routine" value={ROUTINES[s.name] ? s.name : 'Custom'} onChange={(n) => { if (ROUTINES[n]) { set({ name: n, steps: mk(n) }); setPlaying(false); seek(0) } }} options={[...Object.keys(ROUTINES), ...(ROUTINES[s.name] ? [] : ['Custom'])]} />
          </Row>
          {s.steps.length === 0 && <Note>The routine is empty. Add stretches from the pose library.</Note>}
          <div style={{ display: 'grid', gap: 6 }}>
            {s.steps.map((x, k) => {
              const p = poseById(x.pose)
              const on = seg?.step === k && !preview
              return (
                <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, borderRadius: 10, border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined }}>
                  <span style={{ cursor: 'pointer' }} onClick={() => seek(stepStart(k))} title="Jump here"><Thumb a={p.a} size={44} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{k + 1}. {p.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{p.sided ? `${x.hold}s × 2 sides` : `${x.hold}s`} · {p.area}</div>
                  </div>
                  <input type="number" min={5} max={300} step={5} value={x.hold} onChange={(e) => editStep(x.id, { hold: Math.max(5, Math.min(300, Number(e.target.value) || 5)) })} style={{ width: 58 }} aria-label="Hold seconds" />
                  <button type="button" className="k-btn ghost" style={{ padding: '2px 6px' }} onClick={() => move(k, -1)} aria-label="Move up">↑</button>
                  <button type="button" className="k-btn ghost" style={{ padding: '2px 6px' }} onClick={() => move(k, 1)} aria-label="Move down">↓</button>
                  <button type="button" className="k-btn ghost" style={{ padding: '2px 6px' }} onClick={() => set({ name: 'Custom', steps: s.steps.filter((y) => y.id !== x.id) })} aria-label="Remove">✕</button>
                </div>
              )
            })}
          </div>
        </Panel>
        <Panel title="Settings">
          <Slider label="Transition between poses" value={s.transition} onChange={(transition) => set({ transition })} min={1} max={10} step={1} unit=" s" />
          <Row>
            <span className="muted">Set every hold to</span>
            {[20, 30, 45, 60].map((h) => <Btn key={h} onClick={() => set({ steps: s.steps.map((x) => ({ ...x, hold: h })) })}>{h}s</Btn>)}
          </Row>
          <Check label="Voice cues (speech synthesis)" value={s.voice} onChange={(voice) => set({ voice })} />
          <Check label="Beep when a hold starts" value={s.beep} onChange={(beep) => set({ beep })} />
          <Row>
            <JsonButtons name="stretch-routine.json" data={s} onLoad={(d) => d && Array.isArray(d.steps) && set({ ...d, steps: d.steps.filter((x) => POSES.some((p) => p.id === x.pose)) })} />
            <Btn kind="ghost" onClick={() => { reset(); setPlaying(false); seek(0) }}>Reset</Btn>
          </Row>
        </Panel>
        <Note>Hold static stretches 20–45 s, breathe slowly and stop at mild tension — never pain. Warm up for a few minutes first. Click a library pose twice to see the other side.</Note>
      </div>
    </Split>
  )
}
