import { useEffect, useRef, useState } from 'react'
import { Btn, Check, FileDrop, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { THREE, View3D, useStage3D, type Stage3D } from '../kit/three'
import { buildCharacter, fmtTime, trackInfo } from './lib/animation-clip-viewer'

type Loop = 'repeat' | 'once' | 'pingpong'
type MeshMode = 'solid' | 'wire' | 'hidden'
interface State { speed: number; reverse: boolean; loop: Loop; skeleton: boolean; mesh: MeshMode; fade: number; spin: boolean }
const DEF: State = { speed: 1, reverse: false, loop: 'repeat', skeleton: true, mesh: 'solid', fade: 0.3, spin: false }
const LOOPS = { repeat: THREE.LoopRepeat, once: THREE.LoopOnce, pingpong: THREE.LoopPingPong }
interface Info { name: string; clips: THREE.AnimationClip[]; bones: number; verts: number; meshes: number; skinned: number }

export default function AnimationClipViewer() {
  const [s, set, reset] = useToolState('animation-clip-viewer', DEF)
  const [info, setInfo] = useState<Info | null>(null)
  const [cur, setCur] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [time, setTime] = useState(0)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const st = useRef<Stage3D | null>(null)
  const mixer = useRef<THREE.AnimationMixer | null>(null)
  const actions = useRef<THREE.AnimationAction[]>([])
  const helper = useRef<THREE.SkeletonHelper | null>(null)
  const curRef = useRef(0)
  const sRef = useRef(s)
  const onEnd = useRef(() => setPlaying(false))
  useEffect(() => {
    sRef.current = s
  })

  const applyAction = (a: THREE.AnimationAction) => {
    const o = sRef.current
    a.setLoop(LOOPS[o.loop], Infinity)
    a.clampWhenFinished = true
    a.timeScale = o.speed * (o.reverse ? -1 : 1)
  }

  const applyMesh = (mode: MeshMode) => {
    st.current?.scene.getObjectByName('model')?.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.visible = mode !== 'hidden'
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if ('wireframe' in mat) (mat as THREE.MeshStandardMaterial).wireframe = mode === 'wire'
    })
  }

  const load = (root: THREE.Object3D, clips: THREE.AnimationClip[], name: string) => {
    const stage = st.current
    if (!stage) return
    const g = stage.scene.getObjectByName('model')!
    mixer.current?.stopAllAction()
    if (helper.current) {
      stage.scene.remove(helper.current)
      helper.current.dispose()
      helper.current = null
    }
    stage.clear(g)
    // Normalise size: fit the model into ~1.8 units and stand it on the ground.
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const size = box.getSize(new THREE.Vector3())
    const k = 1.8 / (Math.max(size.x, size.y, size.z) || 1)
    root.scale.multiplyScalar(k)
    root.updateMatrixWorld(true)
    box.setFromObject(root)
    const c = box.getCenter(new THREE.Vector3())
    root.position.x -= c.x
    root.position.z -= c.z
    root.position.y -= box.min.y
    g.add(root)
    let bones = 0, verts = 0, meshes = 0, skinned = 0
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones++
      const m = o as THREE.Mesh
      if (m.isMesh) {
        meshes++
        verts += m.geometry.attributes.position?.count ?? 0
        if ((m as THREE.SkinnedMesh).isSkinnedMesh) skinned++
        m.frustumCulled = false
      }
    })
    const h = new THREE.SkeletonHelper(root)
    ;(h.material as THREE.LineBasicMaterial).depthTest = false
    ;(h.material as THREE.LineBasicMaterial).linewidth = 2
    h.renderOrder = 10
    h.visible = sRef.current.skeleton
    stage.scene.add(h)
    helper.current = h
    const mx = new THREE.AnimationMixer(root)
    mx.addEventListener('finished', () => onEnd.current())
    mixer.current = mx
    actions.current = clips.map((cl) => {
      const a = mx.clipAction(cl)
      applyAction(a)
      return a
    })
    actions.current[0]?.play()
    curRef.current = 0
    setCur(0)
    setPlaying(true)
    setTime(0)
    setInfo({ name, clips, bones, verts, meshes, skinned })
    applyMesh(sRef.current.mesh)
    stage.controls.target.set(0, 0.9, 0)
    stage.camera.position.set(1.1, 1.35, 2.7)
  }
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  const ref = useStage3D(
    (stage) => {
      st.current = stage
      const g = new THREE.Group()
      g.name = 'model'
      stage.scene.add(g)
      const floor = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48), new THREE.MeshStandardMaterial({ color: '#334155', roughness: 1 }))
      floor.rotation.x = -Math.PI / 2
      floor.position.y = -0.002
      stage.scene.add(floor)
      const demo = buildCharacter()
      loadRef.current(demo.mesh, demo.clips, 'Procedural character (demo)')
      let acc = 0
      stage.onFrame((_t, dt) => {
        mixer.current?.update(dt)
        if (sRef.current.spin) g.rotation.y += dt * 0.4
        acc += dt
        if (acc > 0.06) {
          acc = 0
          const a = actions.current[curRef.current]
          if (a) setTime(a.time)
        }
      })
      return () => {
        mixer.current?.stopAllAction()
        helper.current?.dispose()
      }
    },
    undefined,
    [],
    { camera: [1.1, 1.35, 2.7], target: [0, 0.9, 0], background: '#1e293b' },
  )

  useEffect(() => {
    for (const a of actions.current) applyAction(a)
    if (helper.current) helper.current.visible = s.skeleton
    applyMesh(s.mesh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.speed, s.reverse, s.loop, s.skeleton, s.mesh])

  const action = () => actions.current[curRef.current]
  const pick = (i: number) => {
    const prev = action()
    const next = actions.current[i]
    if (!next) return
    curRef.current = i
    setCur(i)
    next.reset()
    next.paused = false
    applyAction(next)
    if (s.reverse) next.time = next.getClip().duration
    next.play()
    if (prev && prev !== next) {
      if (s.fade > 0) prev.crossFadeTo(next, s.fade, false)
      else prev.stop()
    }
    setPlaying(true)
  }
  const togglePlay = () => {
    const a = action()
    if (!a) return
    if (!a.isRunning() && !a.paused) {
      // finished (LoopOnce): restart
      a.reset().play()
      if (s.reverse) a.time = a.getClip().duration
      setPlaying(true)
      return
    }
    a.paused = playing
    setPlaying(!playing)
  }
  const seek = (t: number) => {
    const a = action()
    if (!a) return
    if (!a.isRunning()) a.play()
    a.enabled = true
    a.setEffectiveWeight(1)
    for (const o of actions.current) if (o !== a) o.stop()
    a.paused = true
    a.time = Math.max(0, Math.min(a.getClip().duration, t))
    mixer.current?.update(0)
    setPlaying(false)
    setTime(a.time)
  }

  const onFiles = async (files: File[]) => {
    setErr('')
    const main = files.find((f) => /\.(glb|gltf)$/i.test(f.name))
    if (!main) return setErr('Choose a .glb or .gltf file (add its .bin and textures too if they are separate).')
    setBusy(true)
    const urls = new Map(files.map((f) => [f.name, URL.createObjectURL(f)]))
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      const manager = new THREE.LoadingManager()
      manager.setURLModifier((u) => {
        const base = decodeURIComponent(u.split(/[/\\]/).pop() ?? u)
        return urls.get(base) ?? u
      })
      const loader = new GLTFLoader(manager)
      const data = /\.glb$/i.test(main.name) ? await main.arrayBuffer() : await main.text()
      const gltf = await loader.parseAsync(data, '')
      loadRef.current(gltf.scene, gltf.animations, main.name)
    } catch (e) {
      setErr(`Could not load ${main.name}: ${(e as Error).message}`)
    } finally {
      setBusy(false)
      setTimeout(() => urls.forEach((u) => URL.revokeObjectURL(u)), 4000)
    }
  }

  const clip = info?.clips[cur]
  const dur = clip?.duration ?? 0
  const tracks = clip ? clip.tracks.map(trackInfo) : []
  const fps = clip && clip.tracks[0] && clip.tracks[0].times.length > 1 ? (clip.tracks[0].times.length - 1) / (clip.tracks[0].times[clip.tracks[0].times.length - 1] - clip.tracks[0].times[0] || 1) : 30

  return (
    <Split wide="left">
      <div>
        <Panel title={info ? info.name : 'Loading…'} actions={<Btn kind="ghost" onClick={() => { const d = buildCharacter(); load(d.mesh, d.clips, 'Procedural character (demo)') }}>Demo character</Btn>}>
          <View3D refEl={ref} height={460} />
          <div style={{ marginTop: 12 }}>
            <Row wrap={false}>
              <Btn kind="primary" onClick={togglePlay} disabled={!clip}>{playing ? '⏸ Pause' : '▶ Play'}</Btn>
              <Btn onClick={() => seek(time - 1 / fps)} disabled={!clip} title="Previous frame">⏮</Btn>
              <Btn onClick={() => seek(time + 1 / fps)} disabled={!clip} title="Next frame">⏭</Btn>
              <input type="range" min={0} max={dur || 1} step={0.001} value={Math.min(time, dur)} onChange={(e) => seek(Number(e.target.value))} style={{ flex: 1, minWidth: 80 }} aria-label="Timeline" disabled={!clip} />
              <span className="mono" style={{ whiteSpace: 'nowrap' }}>{fmtTime(Math.min(time, dur))} / {fmtTime(dur)}</span>
            </Row>
            <div style={{ position: 'relative', height: 18, marginTop: 4 }}>
              {dur > 0 && Array.from({ length: Math.min(40, Math.floor(dur * 4) + 1) }, (_, i) => i * (Math.max(0.25, dur / 40))).filter((v) => v <= dur).map((v) => (
                <span key={v} style={{ position: 'absolute', left: `${(v / dur) * 100}%`, top: 0, width: 1, height: v % 1 === 0 ? 10 : 5, background: 'var(--muted)' }} />
              ))}
            </div>
          </div>
        </Panel>
        {clip && (
          <Panel title={`Tracks in “${clip.name}”`}>
            <Table head={['Target', 'Property', 'Keys', 'Interp.']} rows={tracks.map((t) => [t.target, t.prop, t.keys, t.interp])} max={12} />
          </Panel>
        )}
        {err && <Note tone="err">{err}</Note>}
        {info && info.clips.length === 0 && <Note tone="warn">This model has no animation clips. You can still inspect its skeleton ({info.bones} bones).</Note>}
      </div>
      <div>
        <Stats>
          <Stat label="Clips" value={info?.clips.length ?? 0} />
          <Stat label="Bones" value={info?.bones ?? 0} sub={`${info?.skinned ?? 0} skinned mesh(es)`} />
          <Stat label="Vertices" value={num(info?.verts ?? 0, 0)} sub={`${info?.meshes ?? 0} mesh(es)`} />
        </Stats>
        <Panel title="Clips">
          {info?.clips.length ? (
            <div style={{ display: 'grid', gap: 6 }}>
              {info.clips.map((c, i) => (
                <button key={i} type="button" className={`k-btn ${i === cur ? 'primary' : ''}`} onClick={() => pick(i)} style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'left' }}>
                  <span>{c.name || `Clip ${i + 1}`}</span>
                  <span style={{ opacity: 0.75 }}>{c.duration.toFixed(2)} s · {c.tracks.length} tracks</span>
                </button>
              ))}
            </div>
          ) : <p className="muted">No clips.</p>}
        </Panel>
        <Panel title="Playback" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Slider label="Speed" value={s.speed} onChange={(speed) => set({ speed })} min={0.05} max={3} step={0.05} unit="×" />
          <Row>
            {[0.25, 0.5, 1, 2].map((v) => <Btn key={v} kind={s.speed === v ? 'primary' : 'normal'} onClick={() => set({ speed: v })}>{v}×</Btn>)}
          </Row>
          <div style={{ margin: '10px 0' }}>
            <Seg value={s.loop} onChange={(loop) => set({ loop })} options={[['repeat', 'Loop'], ['pingpong', 'Ping-pong'], ['once', 'Once']]} label="Loop mode" />
          </div>
          <Slider label="Cross-fade between clips" value={s.fade} onChange={(fade) => set({ fade })} min={0} max={1.5} step={0.05} unit=" s" />
          <Check label="Play in reverse" value={s.reverse} onChange={(reverse) => set({ reverse })} />
          <Check label="Show skeleton" value={s.skeleton} onChange={(skeleton) => set({ skeleton })} />
          <Check label="Turntable spin" value={s.spin} onChange={(spin) => set({ spin })} />
          <div style={{ marginTop: 8 }}>
            <Seg value={s.mesh} onChange={(mesh) => set({ mesh })} options={[['solid', 'Solid'], ['wire', 'Wireframe'], ['hidden', 'Bones only']]} label="Mesh display" />
          </div>
        </Panel>
        <Panel title="Load your model">
          <FileDrop accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.ktx2" multiple onFiles={(f) => void onFiles(f)} label={busy ? 'Loading…' : 'Drop a .glb (or .gltf + .bin + textures)'} />
          <p className="muted" style={{ fontSize: 13 }}>Loaded locally with three.js GLTFLoader; nothing is uploaded. Models are scaled to ~1.8 units and placed on the floor. Draco/Meshopt-compressed files are not supported.</p>
        </Panel>
      </div>
    </Split>
  )
}
