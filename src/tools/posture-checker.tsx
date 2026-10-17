import { useEffect, useRef, useState } from 'react'
import { Btn, Check, CsvButton, FileDrop, LineChart, Note, num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D } from '../kit/three'
import { analyse, synthLandmarks, type Facing, type Grade, type Landmarks, type Pt } from './lib/posture-checker'

const W = 640, H = 480
const HIP: Pt = { x: 250, y: 330 }
const TORSO_PX = 170, NECK_PX = 72
type Mode = 'demo' | 'camera' | 'photo'
type Key = keyof Landmarks
interface Check { t: number; neck: number; torso: number; score: number }

const DEF = {
  mode: 'demo' as Mode,
  facing: 'right' as Facing,
  demoNeck: 38,
  demoTorso: 14,
  pts: synthLandmarks(38, 14, HIP, TORSO_PX, NECK_PX),
  sitting: true,
  mirror: true,
  remind: false,
  every: 20,
  log: [] as Check[],
}

const TONE: Record<Grade, string> = { good: '#10b981', fair: '#f59e0b', poor: '#ef4444' }
const WORD: Record<Grade, string> = { good: 'Good', fair: 'Fair', poor: 'Needs work' }
const KEYS: [Key, string][] = [['ear', 'E'], ['shoulder', 'S'], ['hip', 'H']]
const rad = (d: number) => (d * Math.PI) / 180

/** Paints the synthetic desk-worker scene used in demo mode. */
function drawDemo(g: CanvasRenderingContext2D, l: Landmarks) {
  const sky = g.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#e0e7ff')
  sky.addColorStop(1, '#f8fafc')
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#cbd5e1'
  g.fillRect(0, 445, W, 35)
  // chair
  g.fillStyle = '#475569'
  g.fillRect(170, 340, 150, 14)
  g.fillRect(160, 190, 14, 160)
  g.fillRect(238, 354, 10, 80)
  g.fillRect(200, 432, 90, 8)
  // desk + monitor
  g.fillStyle = '#a16207'
  g.fillRect(420, 290, 220, 14)
  g.fillRect(600, 304, 14, 141)
  g.fillStyle = '#1e293b'
  g.fillRect(560, 170, 16, 110)
  g.fillRect(540, 280, 60, 10)
  g.fillStyle = '#334155'
  g.fillRect(452, 284, 70, 6)
  // body
  const knee = { x: l.hip.x + 125, y: l.hip.y + 4 }
  const ankle = { x: knee.x + 5, y: 440 }
  const elbow = { x: l.shoulder.x + 25, y: l.shoulder.y + 105 }
  const hand = { x: 470, y: 282 }
  const limb = (pts: Pt[], w: number, c: string) => {
    g.strokeStyle = c
    g.lineWidth = w
    g.lineCap = g.lineJoin = 'round'
    g.beginPath()
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
    g.stroke()
  }
  limb([l.hip, knee, ankle], 34, '#1e3a8a')
  limb([ankle, { x: ankle.x + 30, y: ankle.y }], 16, '#0f172a')
  limb([l.hip, l.shoulder], 66, '#0ea5e9')
  const nx = l.ear.x - l.shoulder.x, ny = l.ear.y - l.shoulder.y
  const len = Math.hypot(nx, ny) || 1
  limb([l.shoulder, { x: l.shoulder.x + nx * 0.6, y: l.shoulder.y + ny * 0.6 }], 26, '#f1c27d')
  limb([l.shoulder, elbow, hand], 22, '#0284c7')
  // head: centre sits slightly in front of and above the ear
  const ux = nx / len, uy = ny / len
  const c = { x: l.ear.x + ux * 10 - uy * 14, y: l.ear.y + uy * 10 + ux * 14 }
  g.fillStyle = '#f1c27d'
  g.beginPath()
  g.arc(c.x, c.y, 40, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#3f2a1d'
  g.beginPath()
  g.arc(c.x - ux * 8 + uy * 6, c.y - uy * 8 - ux * 6, 40, Math.PI * 1.05, Math.PI * 1.95)
  g.fill()
}

function drawOverlay(g: CanvasRenderingContext2D, l: Landmarks, grades: { neck: Grade; torso: Grade }) {
  g.setLineDash([6, 6])
  g.strokeStyle = 'rgba(15,23,42,.55)'
  g.lineWidth = 2
  for (const p of [l.shoulder, l.hip]) {
    g.beginPath()
    g.moveTo(p.x, p.y)
    g.lineTo(p.x, p.y - 110)
    g.stroke()
  }
  g.setLineDash([])
  const seg = (a: Pt, b: Pt, c: string) => {
    g.strokeStyle = c
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(a.x, a.y)
    g.lineTo(b.x, b.y)
    g.stroke()
  }
  seg(l.hip, l.shoulder, TONE[grades.torso])
  seg(l.shoulder, l.ear, TONE[grades.neck])
  g.font = 'bold 15px system-ui, sans-serif'
  for (const [k, t] of KEYS) {
    const p = l[k]
    g.fillStyle = '#fff'
    g.beginPath()
    g.arc(p.x, p.y, 13, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = '#4f46e5'
    g.lineWidth = 3
    g.stroke()
    g.fillStyle = '#4f46e5'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(t, p.x, p.y + 1)
  }
}

function beep() {
  try {
    const ac = new AudioContext()
    for (const [f, t0] of [[660, 0], [880, 0.18]] as const) {
      const o = ac.createOscillator(), v = ac.createGain()
      o.frequency.value = f
      v.gain.setValueAtTime(0.0001, ac.currentTime + t0)
      v.gain.exponentialRampToValueAtTime(0.2, ac.currentTime + t0 + 0.02)
      v.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + t0 + 0.3)
      o.connect(v).connect(ac.destination)
      o.start(ac.currentTime + t0)
      o.stop(ac.currentTime + t0 + 0.32)
    }
  } catch {
    /* audio blocked */
  }
}

function mannequin(neck: number, torso: number, sitting: boolean, mat: (part: 'neck' | 'torso' | 'limb') => THREE.Material): THREE.Group {
  const root = new THREE.Group()
  const cap = (r: number, len: number, m: THREE.Material) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), m)
  const hipY = sitting ? 0.5 : 0.95
  const pelvis = cap(0.12, 0.16, mat('torso'))
  pelvis.rotation.z = Math.PI / 2
  pelvis.position.y = hipY
  root.add(pelvis)
  for (const sx of [-0.1, 0.1]) {
    const thigh = cap(0.065, 0.32, mat('limb'))
    const shin = cap(0.055, 0.34, mat('limb'))
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.22), mat('limb'))
    if (sitting) {
      thigh.rotation.x = Math.PI / 2
      thigh.position.set(sx, hipY, 0.22)
      shin.position.set(sx, hipY / 2, 0.45)
      foot.position.set(sx, 0.03, 0.52)
    } else {
      thigh.position.set(sx, hipY - 0.23, 0)
      shin.position.set(sx, 0.25, 0)
      foot.position.set(sx, 0.03, 0.06)
    }
    root.add(thigh, shin, foot)
  }
  const trunk = new THREE.Group()
  trunk.position.y = hipY
  trunk.rotation.x = rad(torso)
  const chest = cap(0.15, 0.3, mat('torso'))
  chest.scale.set(1.25, 1, 0.75)
  chest.position.y = 0.3
  trunk.add(chest)
  const yoke = cap(0.06, 0.32, mat('torso'))
  yoke.rotation.z = Math.PI / 2
  yoke.position.y = 0.52
  trunk.add(yoke)
  for (const sx of [-0.23, 0.23]) {
    const arm = new THREE.Group()
    arm.position.set(sx, 0.5, 0)
    arm.rotation.x = -rad(torso) - (sitting ? 0.25 : 0)
    const upper = cap(0.05, 0.22, mat('limb'))
    upper.position.y = -0.15
    const fore = new THREE.Group()
    fore.position.y = -0.3
    fore.rotation.x = sitting ? -Math.PI / 2 + 0.25 : 0
    const lower = cap(0.045, 0.2, mat('limb'))
    lower.position.y = -0.13
    fore.add(lower)
    arm.add(upper, fore)
    trunk.add(arm)
  }
  const head = new THREE.Group()
  head.position.y = 0.56
  head.rotation.x = rad(neck - torso)
  const nk = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.14, 16), mat('neck'))
  nk.position.y = 0.06
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), mat('neck'))
  skull.scale.set(0.9, 1.05, 1)
  skull.position.set(0, 0.2, 0.02)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 10), mat('neck'))
  nose.rotation.x = Math.PI / 2
  nose.position.set(0, 0.2, 0.135)
  head.add(nk, skull, nose)
  head.name = 'head'
  trunk.add(head)
  root.add(trunk)
  return root
}

export default function PostureChecker() {
  const [s, set, reset] = useToolState('posture-checker', DEF)
  const canvas = useRef<HTMLCanvasElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const drag = useRef<Key | null>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [frozen, setFrozen] = useState(false)
  const [camErr, setCamErr] = useState('')
  const [nextAt, setNextAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [nudge, setNudge] = useState(false)
  const a = analyse(s.pts, s.facing)
  const facing = s.mode === 'demo' ? 'right' : s.facing

  // canvas: background (demo scene, photo or live camera) + landmarks overlay
  useEffect(() => {
    const g = canvas.current?.getContext('2d')
    if (!g) return
    let raf = 0
    const fit = (src: CanvasImageSource, w: number, h: number) => {
      const k = Math.min(W / w, H / h)
      g.fillStyle = '#0f172a'
      g.fillRect(0, 0, W, H)
      g.save()
      if (s.mode === 'camera' && s.mirror) {
        g.translate(W, 0)
        g.scale(-1, 1)
      }
      g.drawImage(src, (W - w * k) / 2, (H - h * k) / 2, w * k, h * k)
      g.restore()
    }
    const paint = () => {
      const v = video.current
      if (s.mode === 'demo') drawDemo(g, synthLandmarks(s.demoNeck, s.demoTorso, HIP, TORSO_PX, NECK_PX))
      else if (s.mode === 'photo' && img) fit(img, img.naturalWidth, img.naturalHeight)
      else if (s.mode === 'camera' && v && v.videoWidth) fit(v, v.videoWidth, v.videoHeight)
      else {
        g.fillStyle = '#1e293b'
        g.fillRect(0, 0, W, H)
        g.fillStyle = '#94a3b8'
        g.font = '18px system-ui, sans-serif'
        g.textAlign = 'center'
        g.fillText(s.mode === 'camera' ? 'Start the camera, sit side-on to it' : 'Load a side-view photo', W / 2, H / 2)
      }
      drawOverlay(g, s.pts, a.grades)
      if (s.mode === 'camera' && stream && !frozen) raf = requestAnimationFrame(paint)
    }
    paint()
    return () => cancelAnimationFrame(raf)
  }, [s.mode, s.pts, s.demoNeck, s.demoTorso, s.mirror, img, stream, frozen, a.grades])

  // stop camera when leaving camera mode / unmounting
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream])

  // gentle reminders
  useEffect(() => {
    if (!s.remind) return
    const ms = Math.max(1, s.every) * 60000
    let next = Date.now() + ms
    const kick = setTimeout(() => setNextAt(next), 0)
    const id = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t < next) return
      next += ms
      setNextAt(next)
      setNudge(true)
      beep()
      if ('Notification' in window && Notification.permission === 'granted') new Notification('Posture check', { body: 'Sit tall: ears over shoulders, shoulders over hips. Relax your shoulders.' })
    }, 1000)
    return () => {
      clearTimeout(kick)
      clearInterval(id)
    }
  }, [s.remind, s.every])

  const setDemo = (demoNeck: number, demoTorso: number) => set({ demoNeck, demoTorso, pts: synthLandmarks(demoNeck, demoTorso, HIP, TORSO_PX, NECK_PX) })
  const startCam = async () => {
    setCamErr('')
    if (!navigator.mediaDevices?.getUserMedia) return setCamErr('This browser has no camera access (needs HTTPS and a camera).')
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
      if (video.current) {
        video.current.srcObject = st
        await video.current.play()
      }
      setFrozen(false)
      setStream(st)
    } catch (e) {
      setCamErr(`Camera unavailable: ${(e as Error).message}`)
    }
  }
  const stopCam = () => {
    stream?.getTracks().forEach((t) => t.stop())
    setStream(null)
  }
  const toCanvas = (e: React.PointerEvent<HTMLCanvasElement>): Pt => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = toCanvas(e)
    let best: Key | null = null, bd = 40
    for (const [k] of KEYS) {
      const d = Math.hypot(s.pts[k].x - p.x, s.pts[k].y - p.y)
      if (d < bd) [best, bd] = [k, d]
    }
    drag.current = best
    if (best) e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const k = drag.current
    if (!k) return
    const p = toCanvas(e)
    set({ pts: { ...s.pts, [k]: { x: Math.max(0, Math.min(W, p.x)), y: Math.max(0, Math.min(H, p.y)) } } })
  }
  const saveCheck = () => {
    set({ log: [...s.log, { t: Date.now(), neck: Math.round(a.neck), torso: Math.round(a.torso), score: a.score }].slice(-200) })
    setNudge(false)
  }

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'fig'
      st.scene.add(g)
    },
    (st) => {
      const g = st.scene.getObjectByName('fig') as THREE.Group
      st.clear(g)
      const solid = (part: 'neck' | 'torso' | 'limb') =>
        new THREE.MeshStandardMaterial({ color: part === 'limb' ? '#94a3b8' : TONE[a.grades[part]], roughness: 0.55 })
      const ghost = () => new THREE.MeshStandardMaterial({ color: '#e2e8f0', transparent: true, opacity: 0.14, depthWrite: false })
      g.add(mannequin(0, 0, s.sitting, ghost))
      const fig = mannequin(Math.max(-30, Math.min(80, a.neck)), Math.max(-30, Math.min(60, a.torso)), s.sitting, solid)
      g.add(fig)
      if (s.sitting) {
        const wood = new THREE.MeshStandardMaterial({ color: '#475569' })
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.44), wood)
        seat.position.set(0, 0.42, 0.12)
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 0.04), wood)
        back.position.set(0, 0.7, -0.16)
        const desk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.6), new THREE.MeshStandardMaterial({ color: '#a16207' }))
        desk.position.set(0, 0.74, 0.85)
        const screen = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.36, 0.03), new THREE.MeshStandardMaterial({ color: '#0f172a', emissive: '#1e3a8a', emissiveIntensity: 0.4 }))
        screen.position.set(0, 1.12, 1.0)
        g.add(seat, back, desk, screen)
      }
      fig.updateMatrixWorld(true)
      const hp = new THREE.Vector3()
      fig.getObjectByName('head')!.getWorldPosition(hp)
      const tag = label(`neck ${Math.round(a.neck)}° · torso ${Math.round(a.torso)}°`, TONE[a.overall], 0.1)
      tag.position.set(hp.x, hp.y + 0.36, hp.z)
      g.add(tag)
    },
    [a.neck, a.torso, a.overall, s.sitting],
    { camera: [1.75, 1.3, 1.15], target: [0, 0.8, 0.35], background: '#1e293b' },
  )

  const tips: string[] = []
  if (a.grades.neck !== 'good') tips.push('Bring your head back over your shoulders: tuck the chin gently ("make a double chin"), and raise the screen so its top edge is at eye level.')
  if (a.torso > 10) tips.push('You are leaning forward. Slide your hips to the back of the chair and let the backrest carry you; move the keyboard closer.')
  if (a.torso < -10) tips.push('You are reclining a lot. That is fine for short breaks, but sit up for typing so your neck does not crane forward.')
  if (!tips.length) tips.push('Nice stacking: ear over shoulder, shoulder over hip. Keep moving: posture is best when it changes often.')
  const leftMin = Math.max(0, Math.ceil((nextAt - now) / 60000))

  return (
    <Split wide="right">
      <div>
        <Panel title="Source" actions={<Btn kind="ghost" onClick={() => { stopCam(); reset() }}>Reset</Btn>}>
          <Seg value={s.mode} onChange={(mode) => { if (mode !== 'camera') stopCam(); set({ mode }) }} options={[['demo', 'Demo'], ['camera', 'Webcam'], ['photo', 'Photo']]} label="Source" />
          {s.mode === 'demo' && (
            <>
              <Slider label="Head forward" value={s.demoNeck} onChange={(v) => setDemo(v, s.demoTorso)} min={-10} max={60} unit="°" />
              <Slider label="Trunk lean" value={s.demoTorso} onChange={(v) => setDemo(s.demoNeck, v)} min={-20} max={40} unit="°" />
              <Row>
                <Btn onClick={() => setDemo(8, 2)}>Upright</Btn>
                <Btn onClick={() => setDemo(38, 14)}>Laptop slouch</Btn>
                <Btn onClick={() => setDemo(55, 28)}>Phone hunch</Btn>
              </Row>
            </>
          )}
          {s.mode === 'camera' && (
            <>
              <Row>
                {stream ? <Btn onClick={stopCam}>Stop camera</Btn> : <Btn kind="primary" onClick={() => void startCam()}>Start camera</Btn>}
                <Btn disabled={!stream} onClick={() => setFrozen((f) => !f)}>{frozen ? 'Resume live' : 'Freeze frame'}</Btn>
                <Check label="Mirror" value={s.mirror} onChange={(mirror) => set({ mirror })} />
              </Row>
              {camErr && <Note tone="err">{camErr}</Note>}
              <p className="muted" style={{ fontSize: 13 }}>Put the camera to your side at shoulder height. Freeze a frame, drag E/S/H onto your ear, shoulder and hip, then resume: the markers stay put, so you can see when your ear drifts forward of them.</p>
            </>
          )}
          {s.mode === 'photo' && <FileDrop accept="image/*" label="Drop a side-view photo" onFiles={([f]) => { const im = new Image(); im.onload = () => setImg(im); im.src = URL.createObjectURL(f) }} />}
          {s.mode !== 'demo' && (
            <Row>
              <span className="muted">You face</span>
              <Seg value={s.facing} onChange={(facing) => set({ facing })} options={[['left', '← Left'], ['right', 'Right →']]} label="Facing" />
            </Row>
          )}
          <Check label="Seated at a desk (3D view)" value={s.sitting} onChange={(sitting) => set({ sitting })} />
        </Panel>
        <Panel title="Reminders">
          <Row>
            <Check label="Remind me every" value={s.remind} onChange={(remind) => { set({ remind }); if (remind && 'Notification' in window && Notification.permission === 'default') void Notification.requestPermission() }} />
            <Seg value={String(s.every)} onChange={(v) => set({ every: Number(v) })} options={[['10', '10'], ['20', '20'], ['30', '30'], ['45', '45'], ['60', '60 min']]} label="Interval" />
          </Row>
          {s.remind && <p className="muted">Next nudge in about {leftMin} min (soft chime{'Notification' in window && Notification.permission === 'granted' ? ' + notification' : ''}).</p>}
          {nudge && <Note tone="warn">⏰ Time for a posture check: roll your shoulders back, lengthen the neck, then save a check.</Note>}
        </Panel>
        <Panel title="What to do">
          {tips.map((t) => <Note key={t} tone={a.overall === 'good' ? 'ok' : 'info'}>{t}</Note>)}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Posture score" value={`${a.score}/100`} sub={WORD[a.overall]} tone={a.overall === 'good' ? 'good' : a.overall === 'poor' ? 'bad' : 'accent'} />
          <Stat label="Neck inclination" value={`${num(a.neck, 0)}°`} sub={`${WORD[a.grades.neck]} · CVA ${num(a.cva, 0)}°`} />
          <Stat label="Trunk inclination" value={`${num(a.torso, 0)}°`} sub={WORD[a.grades.torso]} />
          <Stat label="Head load on neck" value={`≈ ${num(a.loadKg, 1)} kg`} sub="vs ≈ 5 kg upright" />
        </Stats>
        <Panel title="Side view: drag E (ear), S (shoulder), H (hip)">
          <video ref={video} playsInline muted style={{ display: 'none' }} />
          <canvas ref={canvas} width={W} height={H} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}
            style={{ width: '100%', maxWidth: W, aspectRatio: `${W}/${H}`, borderRadius: 10, touchAction: 'none', cursor: 'crosshair', display: 'block' }} />
          <p className="muted" style={{ fontSize: 13 }}>Angles are measured from vertical in the {facing === 'right' ? 'right' : 'left'}-facing direction. Upright: neck ≤ 25° (CVA ≥ 65°), trunk ≤ 10°. Above 40° neck tilt is a clear forward-head posture.</p>
        </Panel>
        <Panel title="3D mannequin (ghost = neutral posture)">
          <View3D refEl={ref} height={360} />
        </Panel>
        <Panel title="Check log" actions={<><Btn kind="primary" onClick={saveCheck}>Save this check</Btn><CsvButton name="posture-log.csv" rows={() => [['Time', 'Neck °', 'Trunk °', 'Score'], ...s.log.map((c) => [new Date(c.t).toISOString(), c.neck, c.torso, c.score])]} />{s.log.length > 0 && <Btn kind="ghost" onClick={() => set({ log: [] })}>Clear</Btn>}</>}>
          {s.log.length < 2 ? (
            <p className="muted">Save a check now and then (the reminder helps) to see your trend over the day.</p>
          ) : (
            <LineChart series={[{ name: 'Score', points: s.log.map((c, i) => [i + 1, c.score]), area: true }, { name: 'Neck °', points: s.log.map((c, i) => [i + 1, c.neck]), dashed: true }]} yMin={0} xLabel="check #" height={200} />
          )}
          {s.log.length > 0 && <Table head={['Time', 'Neck', 'Trunk', 'Score']} rows={[...s.log].reverse().map((c) => [new Date(c.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), `${c.neck}°`, `${c.torso}°`, c.score])} max={8} />}
        </Panel>
      </div>
    </Split>
  )
}
