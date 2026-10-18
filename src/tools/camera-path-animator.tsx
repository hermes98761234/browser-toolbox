import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, FileDrop, JsonButtons, Note, num, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { duration, EASINGS, fmtTime, fovAt, locate, orbitKeys, retime, sortKeys, type Easing, type Key, type V3 } from './lib/camera-path-animator'

const DEF_KEYS: Key[] = [
  { id: 'a', t: 0, pos: [9, 5, 9], target: [0, 1, 0], fov: 50 },
  { id: 'b', t: 3, pos: [5, 1.6, -1], target: [0, 1.4, 0], fov: 40 },
  { id: 'c', t: 6, pos: [-2, 2.5, -6], target: [0, 1.2, 0], fov: 45 },
  { id: 'd', t: 9, pos: [-7, 1, 2], target: [2, 0.8, 1], fov: 55 },
  { id: 'e', t: 12, pos: [0, 10, 0.01], target: [0, 0, 0], fov: 60 },
]
const DEF = { keys: DEF_KEYS, easing: 'inOut' as Easing, fps: 30, loop: true, showPath: true, tension: 0.5, kind: 'centripetal' as 'centripetal' | 'catmullrom' | 'chordal' }

function demoScene(g: THREE.Group) {
  const std = (c: string, r = 0.6, m = 0.1) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m })
  const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 64), std('#334155', 0.95))
  ground.rotation.x = -Math.PI / 2
  g.add(ground)
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.6, 40), std('#e2e8f0'))
  ped.position.y = 0.3
  g.add(ped)
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.7, 0.22, 160, 24), std('#f59e0b', 0.3, 0.6))
  knot.position.y = 1.7
  knot.name = 'spin'
  g.add(knot)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 3, 20), std('#cbd5e1'))
    col.position.set(4.5 * Math.cos(a), 1.5, 4.5 * Math.sin(a))
    g.add(col)
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.18, 12, 80), std('#94a3b8'))
  ring.rotation.x = Math.PI / 2
  ring.position.y = 3.1
  g.add(ring)
  const blocks: [number, number, number, number, string][] = [[-8, -5, 2.5, 5, '#6366f1'], [7.5, -6, 2, 3.5, '#0ea5e9'], [-6.5, 7, 3, 2, '#10b981'], [8, 6, 1.6, 6, '#ec4899']]
  for (const [x, z, w, h, c] of blocks) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), std(c, 0.5))
    b.position.set(x, h / 2, z)
    g.add(b)
  }
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 16), std('#ef4444', 0.25, 0.3))
  ball.position.set(2.5, 0.6, 2)
  g.add(ball)
}

function fitModel(obj: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(obj)
  const size = box.getSize(new THREE.Vector3())
  const k = 6 / (Math.max(size.x, size.y, size.z) || 1)
  obj.scale.multiplyScalar(k)
  const b2 = new THREE.Box3().setFromObject(obj)
  const c = b2.getCenter(new THREE.Vector3())
  obj.position.sub(new THREE.Vector3(c.x, b2.min.y, c.z))
}

const v = (a: V3) => new THREE.Vector3(...a)
const r2 = (x: number) => Math.round(x * 100) / 100

export default function CameraPathAnimator() {
  const [s, set, reset] = useToolState('camera-path-animator', DEF)
  const keys = sortKeys(s.keys)
  const dur = duration(keys)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [view, setView] = useState<'edit' | 'camera'>('edit')
  const [model, setModel] = useState('Demo scene')
  const [rec, setRec] = useState<'idle' | 'rec'>('idle')
  const [err, setErr] = useState('')
  const stageRef = useRef<Stage3D | null>(null)
  const world = useRef(new THREE.Group())
  const helpers = useRef(new THREE.Group())
  const pathCam = useRef(new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 2.2))
  const camHelper = useRef<THREE.CameraHelper | null>(null)
  const curves = useRef<{ pos: THREE.CatmullRomCurve3; tgt: THREE.CatmullRomCurve3 } | null>(null)
  const live = useRef({ time: 0, playing: false, view: 'edit' as 'edit' | 'camera', keys, easing: s.easing, loop: s.loop, dur, lastUi: 0 })
  const saved = useRef<{ pos: THREE.Vector3; tgt: THREE.Vector3 } | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)

  useEffect(() => {
    Object.assign(live.current, { keys, easing: s.easing, loop: s.loop, dur, playing, view })
  })

  const pose = (t: number) => {
    const ks = live.current.keys
    const c = curves.current
    if (!c || ks.length < 2) {
      const k = ks[0]
      return k ? { pos: v(k.pos), tgt: v(k.target), fov: k.fov } : { pos: new THREE.Vector3(8, 5, 8), tgt: new THREE.Vector3(), fov: 50 }
    }
    const { u } = locate(ks, t, live.current.easing)
    return { pos: c.pos.getPoint(u), tgt: c.tgt.getPoint(u), fov: fovAt(ks, t, live.current.easing) }
  }

  const ref = useStage3D(
    (st) => {
      stageRef.current = st
      st.scene.add(world.current, helpers.current)
      st.scene.fog = new THREE.Fog('#0f172a', 20, 45)
      demoScene(world.current)
      camHelper.current = new THREE.CameraHelper(pathCam.current)
      st.scene.add(camHelper.current)
      st.onFrame((_, dt) => {
        const L = live.current
        world.current.getObjectByName('spin')?.rotateY(dt * 0.6)
        if (L.playing) {
          L.time += dt
          if (L.time >= L.dur) {
            if (recorder.current) {
              L.time = L.dur
              if (recorder.current.state === 'recording') recorder.current.stop()
            } else if (L.loop) L.time = 0
            else {
              L.time = L.dur
              L.playing = false
              setPlaying(false)
            }
          }
          if (performance.now() - L.lastUi > 60) {
            L.lastUi = performance.now()
            setTime(L.time)
          }
        }
        const p = pose(L.time)
        pathCam.current.position.copy(p.pos)
        pathCam.current.fov = p.fov
        pathCam.current.aspect = st.camera.aspect
        pathCam.current.lookAt(p.tgt)
        pathCam.current.updateProjectionMatrix()
        camHelper.current?.update()
        const cam = L.view === 'camera'
        helpers.current.visible = !cam
        if (camHelper.current) camHelper.current.visible = !cam
        if (cam) {
          st.camera.position.copy(p.pos)
          st.controls.target.copy(p.tgt)
          st.camera.fov = p.fov
          st.camera.updateProjectionMatrix()
        }
      })
    },
    (st) => {
      st.clear(helpers.current)
      if (keys.length >= 2) {
        const pos = new THREE.CatmullRomCurve3(keys.map((k) => v(k.pos)), false, s.kind, s.tension)
        const tgt = new THREE.CatmullRomCurve3(keys.map((k) => v(k.target)), false, s.kind, s.tension)
        curves.current = { pos, tgt }
        if (s.showPath) {
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pos.getPoints(keys.length * 40)), new THREE.LineBasicMaterial({ color: '#facc15' }))
          const tl = new THREE.Line(new THREE.BufferGeometry().setFromPoints(tgt.getPoints(keys.length * 20)), new THREE.LineDashedMaterial({ color: '#22d3ee', dashSize: 0.2, gapSize: 0.15 }))
          tl.computeLineDistances()
          helpers.current.add(line, tl)
        }
      } else curves.current = null
      keys.forEach((k, i) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8), new THREE.MeshBasicMaterial({ color: '#facc15' }))
        m.position.set(...k.pos)
        const lb = label(`${i + 1} · ${k.t}s`, '#fde68a', 0.7)
        lb.position.set(k.pos[0], k.pos[1] + 0.4, k.pos[2])
        const tm = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshBasicMaterial({ color: '#22d3ee' }))
        tm.position.set(...k.target)
        helpers.current.add(m, lb, tm)
      })
    },
    [s.keys, s.showPath, s.tension, s.kind],
    { camera: [15, 11, 17], target: [0, 1.5, 0], grid: false },
  )

  const seek = (t: number) => {
    live.current.time = t
    setTime(t)
  }
  const enterView = (m: 'edit' | 'camera') => {
    const st = stageRef.current
    if (!st) return
    if (m === 'camera' && view === 'edit') saved.current = { pos: st.camera.position.clone(), tgt: st.controls.target.clone() }
    if (m === 'edit' && view === 'camera' && saved.current) {
      st.camera.position.copy(saved.current.pos)
      st.controls.target.copy(saved.current.tgt)
      st.camera.fov = 50
      st.camera.updateProjectionMatrix()
    }
    st.controls.enabled = m === 'edit'
    live.current.view = m
    setView(m)
  }
  const togglePlay = () => {
    if (!playing && live.current.time >= dur) seek(0)
    live.current.playing = !playing
    setPlaying(!playing)
  }
  const fromView = (): Pick<Key, 'pos' | 'target'> => {
    const st = stageRef.current!
    const p = st.camera.position, t = st.controls.target
    return { pos: [r2(p.x), r2(p.y), r2(p.z)], target: [r2(t.x), r2(t.y), r2(t.z)] }
  }
  const addKey = () => {
    if (view === 'camera') return
    const at = keys.some((k) => Math.abs(k.t - time) < 0.05) || time === 0 ? r2(dur + 3) : r2(time)
    set({ keys: [...s.keys, { id: uid(), t: keys.length ? at : 0, fov: 50, ...fromView() }] })
  }
  const edit = (id: string, p: Partial<Key>) => set({ keys: s.keys.map((k) => (k.id === id ? { ...k, ...p } : k)) })
  const goTo = (k: Key) => {
    enterView('edit')
    const st = stageRef.current
    if (!st) return
    st.camera.position.set(...k.pos)
    st.controls.target.set(...k.target)
    seek(k.t)
  }

  const canRec = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype
  const record = () => {
    const st = stageRef.current
    if (!st || keys.length < 2) return
    if (recorder.current) {
      if (recorder.current.state === 'recording') recorder.current.stop()
      return
    }
    const stream = st.renderer.domElement.captureStream(s.fps)
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
    const mr = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 8_000_000 })
    const chunks: Blob[] = []
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    mr.onstop = () => {
      recorder.current = null
      live.current.playing = false
      setPlaying(false)
      setRec('idle')
      stream.getTracks().forEach((t) => t.stop())
      const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'camera-path.webm'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    }
    enterView('camera')
    seek(0)
    recorder.current = mr
    mr.start(250)
    live.current.playing = true
    setPlaying(true)
    setRec('rec')
  }

  const loadModel = async (f: File) => {
    setErr('')
    try {
      const buf = await f.arrayBuffer()
      const gltf = await new GLTFLoader().parseAsync(/\.gltf$/i.test(f.name) ? new TextDecoder().decode(buf) : buf, '')
      const st = stageRef.current
      if (!st) return
      st.clear(world.current)
      const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.95 }))
      ground.rotation.x = -Math.PI / 2
      world.current.add(ground)
      fitModel(gltf.scene)
      world.current.add(gltf.scene)
      setModel(f.name)
      if (s.keys === DEF_KEYS || s.keys.length < 2) set({ keys: orbitKeys(6, 9, 4, 12, [0, 2, 0]) })
    } catch (e) {
      setErr(`Could not load the model: ${(e as Error).message}. Self-contained .glb files work best.`)
    }
  }
  const backToDemo = () => {
    const st = stageRef.current
    if (!st) return
    st.clear(world.current)
    demoScene(world.current)
    setModel('Demo scene')
  }

  const dist = useMemo(() => (keys.length >= 2 ? new THREE.CatmullRomCurve3(keys.map((k) => v(k.pos)), false, s.kind, s.tension).getLength() : 0), [keys, s.kind, s.tension])
  const pct = dur ? time / dur : 0

  return (
    <Split wide="right">
      <div>
        <Panel title="Scene">
          <Stats>
            <Stat label="Model" value={<span style={{ fontSize: 15 }}>{model}</span>} />
            <Stat label="Keyframes" value={keys.length} />
          </Stats>
          <FileDrop accept=".glb,.gltf" onFiles={([f]) => void loadModel(f)} label="Drop a .glb model (optional)" />
          {err && <Note tone="err">{err}</Note>}
          {model !== 'Demo scene' && <Btn onClick={backToDemo}>Back to demo scene</Btn>}
        </Panel>
        <Panel title="Motion">
          <Select label="Easing" value={s.easing} onChange={(easing) => set({ easing })} options={EASINGS} />
          <Select label="Curve type" value={s.kind} onChange={(kind) => set({ kind })} options={[['centripetal', 'Centripetal (no loops, recommended)'], ['catmullrom', 'Uniform Catmull-Rom'], ['chordal', 'Chordal (wide curves)']]} />
          {s.kind === 'catmullrom' && <Slider label="Tension" value={s.tension} onChange={(tension) => set({ tension })} min={0} max={1} step={0.05} />}
          <Row>
            <Btn onClick={() => set({ keys: retime(s.keys, dur || 10) })} title="Equal time between keys">Space keys evenly</Btn>
            <Btn onClick={() => set({ keys: orbitKeys(8, 9, 3.5, 16) })}>Preset: orbit</Btn>
            <Btn onClick={() => set({ keys: DEF_KEYS })}>Preset: flythrough</Btn>
          </Row>
          <Check label="Show path in editor" value={s.showPath} onChange={(showPath) => set({ showPath })} />
          <Check label="Loop playback" value={s.loop} onChange={(loop) => set({ loop })} />
        </Panel>
        <Panel title="Record WebM">
          <Select label="Frame rate" value={s.fps} onChange={(fps) => set({ fps })} options={[[24, '24 fps'], [30, '30 fps'], [60, '60 fps']]} />
          {canRec ? (
            <Btn kind={rec === 'rec' ? 'danger' : 'primary'} onClick={record} disabled={keys.length < 2}>
              {rec === 'rec' ? `■ Stop (${fmtTime(time)} / ${fmtTime(dur)})` : '● Record the whole shot'}
            </Btn>
          ) : (
            <Note tone="warn">This browser cannot record a canvas (MediaRecorder / captureStream missing). Try Chrome, Edge or Firefox.</Note>
          )}
          <p className="muted" style={{ fontSize: 13 }}>Plays the path once through the camera in real time and downloads <b>camera-path.webm</b>. The video uses the viewport size, so resize the window for wider shots.</p>
        </Panel>
      </div>
      <div>
        <Panel
          title="Viewport"
          actions={<Seg value={view} onChange={enterView} options={[['edit', '✥ Editor'], ['camera', '🎥 Through camera']]} />}
        >
          <View3D refEl={ref} height={440} />
          <div style={{ marginTop: 10 }}>
            <div style={{ position: 'relative', height: 22, background: 'var(--line)', borderRadius: 6 }}>
              <div style={{ position: 'absolute', inset: 0, width: `${pct * 100}%`, background: 'var(--accent)', opacity: 0.35, borderRadius: 6 }} />
              {keys.map((k, i) => (
                <button key={k.id} type="button" title={`Key ${i + 1} at ${k.t}s`} onClick={() => goTo(k)} style={{ position: 'absolute', left: `calc(${dur ? (k.t / dur) * 100 : 0}% - 7px)`, top: 4, width: 14, height: 14, transform: 'rotate(45deg)', background: '#facc15', border: '1px solid #a16207', padding: 0, cursor: 'pointer' }} />
              ))}
            </div>
            <input type="range" min={0} max={dur || 1} step={0.01} value={time} onChange={(e) => seek(Number(e.target.value))} style={{ width: '100%' }} aria-label="Playhead" />
            <Row>
              <Btn kind="primary" onClick={togglePlay} disabled={keys.length < 2}>{playing ? '❚❚ Pause' : '▶ Play'}</Btn>
              <Btn onClick={() => seek(0)}>⏮ Start</Btn>
              <span className="mono">{fmtTime(time)} / {fmtTime(dur)}</span>
              <span style={{ flex: 1 }} />
              <Btn onClick={addKey} disabled={view === 'camera'} title="Orbit the editor camera to a view, then add it as a key">＋ Key from current view</Btn>
            </Row>
          </div>
          <Note>Orbit the editor view to frame a shot, then press <b>＋ Key</b>. Yellow = camera path, dashed cyan = look-at path. Diamonds on the timeline jump to keys.</Note>
        </Panel>
        <Stats>
          <Stat label="Shot length" value={`${num(dur, 1)} s`} />
          <Stat label="Path length" value={`${num(dist, 1)} u`} />
          <Stat label="Avg. speed" value={`${num(dur ? dist / dur : 0, 2)} u/s`} />
        </Stats>
        <Panel title="Keyframes" actions={<><JsonButtons name="camera-path.json" data={s} onLoad={(d) => set(d)} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Table
            head={['#', 'Time (s)', 'Position', 'Look at', 'FOV°', '']}
            rows={keys.map((k, i) => [
              i + 1,
              <input key="t" type="number" min={0} step={0.1} value={k.t} style={{ width: 70 }} onChange={(e) => edit(k.id, { t: Math.max(0, Number(e.target.value) || 0) })} aria-label="Time" />,
              <span key="p" className="mono">{k.pos.map((x) => x.toFixed(1)).join(', ')}</span>,
              <span key="g" className="mono">{k.target.map((x) => x.toFixed(1)).join(', ')}</span>,
              <input key="f" type="number" min={10} max={110} value={k.fov} style={{ width: 60 }} onChange={(e) => edit(k.id, { fov: Math.min(110, Math.max(10, Number(e.target.value) || 50)) })} aria-label="Field of view" />,
              <Row key="b" wrap={false}>
                <Btn kind="ghost" onClick={() => goTo(k)} title="Jump the editor camera here">Go</Btn>
                <Btn kind="ghost" onClick={() => view === 'edit' && edit(k.id, fromView())} title="Replace with the current editor view">Set</Btn>
                <Btn kind="ghost" onClick={() => set({ keys: s.keys.filter((x) => x.id !== k.id) })} title="Delete">✕</Btn>
              </Row>,
            ])}
          />
          {keys.length < 2 && <Note tone="warn">Add at least two keyframes to make a path.</Note>}
        </Panel>
      </div>
    </Split>
  )
}
