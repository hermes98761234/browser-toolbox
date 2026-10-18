import { useMemo, useRef, useState } from 'react'
import { Area, Btn, Check, download, FileDrop, Note, num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { fitScale, inspectGlb, MATERIALS, pose, safeBevel, SAMPLES, STUDIOS, type MatId, type StudioId } from './lib/3d-logo-extruder'

const DEF = { sample: 'Orbit mark', svg: SAMPLES['Orbit mark'], depth: 0.45, bevel: 0.04, bevelSeg: 4, curveSeg: 24, studio: 'turntable' as StudioId, mat: 'svg' as MatId, tint: '', bg: 'studio' as 'studio' | 'transparent' | 'custom', bgColor: '#0f172a', animate: true, period: 6, scale: 2, videoSec: 6, fps: 30 }

/** Swaps two vertices of every triangle (non-indexed geometry) after a mirroring transform. */
function flipWinding(g: THREE.BufferGeometry) {
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name] as THREE.BufferAttribute
    const n = a.itemSize
    for (let t = 0; t + 2 < a.count; t += 3)
      for (let k = 0; k < n; k++) {
        const i1 = (t + 1) * n + k, i2 = (t + 2) * n + k
        const tmp = a.array[i1]
        ;(a.array as Float32Array)[i1] = a.array[i2]
        ;(a.array as Float32Array)[i2] = tmp
      }
    a.needsUpdate = true
  }
}

function gradientTex(top: string, bottom: string): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 256
  const g = c.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, 0, 256)
  gr.addColorStop(0, top)
  gr.addColorStop(1, bottom)
  g.fillStyle = gr
  g.fillRect(0, 0, 4, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function checkerTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  g.fillStyle = '#e5e7eb'
  g.fillRect(0, 0, 64, 64)
  g.fillStyle = '#f9fafb'
  g.fillRect(0, 0, 32, 32)
  g.fillRect(32, 32, 32, 32)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(16, 10)
  return t
}

export default function LogoExtruder3D() {
  const [s, set, reset] = useToolState('3d-logo-extruder', DEF)
  const [busy, setBusy] = useState('')
  const [info, setInfo] = useState('')
  const stage = useRef<Stage3D | null>(null)
  const clock = useRef({ t0: -1, rec: -1, period: s.period })
  const studio = STUDIOS[s.studio]

  // SVG → filled shapes (approach shared with Logo Sign Preview: SVGLoader paths → shapes per fill colour).
  const parsed = useMemo(() => {
    try {
      const data = new SVGLoader().parse(s.svg)
      const items: { shapes: THREE.Shape[]; color: THREE.Color }[] = []
      for (const p of data.paths) {
        const st = p.userData?.style as { fill?: string } | undefined
        if (st?.fill === 'none' || st?.fill === 'transparent') continue
        const shapes = SVGLoader.createShapes(p)
        if (shapes.length) items.push({ shapes, color: p.color.clone() })
      }
      const box = new THREE.Box2()
      for (const it of items) for (const sh of it.shapes) for (const v of sh.getPoints(8)) box.expandByPoint(v)
      return { items, box, error: items.length ? '' : 'No filled paths found (convert text and strokes to outlines first).' }
    } catch (e) {
      return { items: [], box: new THREE.Box2(), error: `Could not parse SVG: ${(e as Error).message}` }
    }
  }, [s.svg])

  const geo = useMemo(() => {
    if (!parsed.items.length) return null
    const size = parsed.box.getSize(new THREE.Vector2())
    const k = fitScale(size.x, size.y, 4)
    const minFeature = 0.06 * Math.min(size.x, size.y) * k
    const bevel = safeBevel(s.bevel, Math.max(0.02, minFeature))
    const out = parsed.items.map((it) => {
      const g = new THREE.ExtrudeGeometry(it.shapes, { depth: s.depth / k, bevelEnabled: bevel > 0, bevelThickness: bevel / k, bevelSize: bevel / k, bevelSegments: s.bevelSeg, curveSegments: s.curveSeg })
      g.scale(k, -k, k)
      flipWinding(g)
      return { g, color: it.color }
    })
    const box = new THREE.Box3()
    for (const o of out) {
      o.g.computeBoundingBox()
      box.union(o.g.boundingBox!)
    }
    const c = box.getCenter(new THREE.Vector3())
    for (const o of out) o.g.translate(-c.x, -c.y, -c.z)
    const dim = box.getSize(new THREE.Vector3())
    const tris = out.reduce((a, o) => a + o.g.attributes.position.count / 3, 0)
    return { out, dim, tris, bevel }
  }, [parsed, s.depth, s.bevel, s.bevelSeg, s.curveSeg])

  const ref = useStage3D(
    (st) => {
      stage.current = st
      const pm = new THREE.PMREMGenerator(st.renderer)
      st.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture
      st.renderer.toneMapping = THREE.ACESFilmicToneMapping
      st.renderer.shadowMap.enabled = true
      st.renderer.shadowMap.type = THREE.PCFSoftShadowMap
      st.scene.children.filter((c) => c instanceof THREE.Light).forEach((l) => ((l as THREE.Light).intensity = 0))
      for (const name of ['lights', 'floor', 'pivot']) {
        const g = new THREE.Group()
        g.name = name
        st.scene.add(g)
      }
      st.controls.minDistance = 3
      st.controls.maxDistance = 25
      st.onFrame(() => {
        const pivot = st.scene.getObjectByName('pivot')
        if (!pivot) return
        const c = clock.current
        if (c.t0 < 0) c.t0 = performance.now()
        const anim = pivot.userData.anim as string
        const t = c.rec >= 0 ? (performance.now() - c.rec) / 1000 : (performance.now() - c.t0) / 1000
        const p = pose(c.rec >= 0 && anim === 'none' ? 'spin' : (anim as 'spin'), t, c.period)
        if (pivot.userData.paused && c.rec < 0) return
        pivot.rotation.set(p.rotX, p.rotY, 0)
        pivot.position.y = p.y + (pivot.userData.lift ?? 0)
      })
      return () => pm.dispose()
    },
    (st) => {
      const lights = st.scene.getObjectByName('lights') as THREE.Group
      const floor = st.scene.getObjectByName('floor') as THREE.Group
      const pivot = st.scene.getObjectByName('pivot') as THREE.Group
      st.clear(lights)
      st.clear(floor)
      st.clear(pivot)
      clock.current.period = s.period
      pivot.userData.anim = studio.anim
      pivot.userData.paused = !s.animate
      pivot.userData.lift = s.studio === 'floating' ? 0.25 : 0
      if (!s.animate) pivot.rotation.set(0, 0, 0)
      st.renderer.toneMappingExposure = studio.exposure
      st.scene.environmentIntensity = studio.env
      // background
      const old = st.scene.background
      if (old instanceof THREE.Texture) old.dispose()
      st.scene.background = s.bg === 'transparent' ? checkerTex() : s.bg === 'custom' ? new THREE.Color(s.bgColor) : gradientTex(studio.bg[0], studio.bg[1])
      // lights
      const key = new THREE.DirectionalLight(studio.key.color, studio.key.intensity)
      key.position.set(...studio.key.pos)
      key.castShadow = true
      key.shadow.mapSize.set(2048, 2048)
      key.shadow.camera.left = key.shadow.camera.bottom = -5
      key.shadow.camera.right = key.shadow.camera.top = 5
      key.shadow.radius = 6
      key.shadow.bias = -0.0005
      const rim = new THREE.DirectionalLight(studio.rim.color, studio.rim.intensity)
      rim.position.set(-3, 3, -6)
      lights.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x445566, studio.fill))
      if (!geo) return
      const halfH = geo.dim.y / 2
      const floorY = -halfH - (s.studio === 'floating' ? 0.9 : 0.35)
      if (studio.floor === 'shadow') {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: s.studio === 'floating' ? 0.16 : 0.28 }))
        p.rotation.x = -Math.PI / 2
        p.position.y = floorY
        p.receiveShadow = true
        floor.add(p)
      } else if (studio.floor === 'mirror' && s.bg !== 'transparent') {
        const m = new Reflector(new THREE.PlaneGeometry(40, 40), { textureWidth: 1024, textureHeight: 1024, color: 0x777777 })
        m.rotation.x = -Math.PI / 2
        m.position.y = floorY
        const veil = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: s.bg === 'custom' ? s.bgColor : studio.bg[1], transparent: true, opacity: 0.72 }))
        veil.rotation.x = -Math.PI / 2
        veil.position.y = floorY + 0.002
        floor.add(m, veil)
      }
      // logo
      const rec = MATERIALS[s.mat]
      for (const o of geo.out) {
        const col = rec.color === null ? o.color.clone() : new THREE.Color(s.tint || rec.color)
        const m = new THREE.MeshPhysicalMaterial({ color: col, metalness: rec.metalness, roughness: rec.roughness, clearcoat: rec.clearcoat ?? 0, transmission: rec.transmission ?? 0, thickness: rec.thickness ?? 0, ior: rec.ior ?? 1.5 })
        if (rec.emissive) {
          m.emissive = col.clone()
          m.emissiveIntensity = rec.emissiveIntensity ?? 2
        }
        const mesh = new THREE.Mesh(o.g.clone(), m)
        mesh.castShadow = true
        mesh.receiveShadow = true
        pivot.add(mesh)
      }
      if (rec.emissive) {
        // soft glow halo behind the letters
        const R = 512, Hc = Math.max(64, Math.round((R * geo.dim.y) / geo.dim.x))
        const c = document.createElement('canvas')
        c.width = R
        c.height = Hc
        const g = c.getContext('2d')!
        g.filter = 'blur(14px)'
        const box = parsed.box, sz = box.getSize(new THREE.Vector2())
        const sx = (0.7 * R) / sz.x, sy = (0.7 * Hc) / sz.y
        for (const it of parsed.items) {
          g.fillStyle = `#${it.color.getHexString()}`
          for (const sh of it.shapes) {
            g.beginPath()
            sh.getPoints(12).forEach((p, i) => (i ? g.lineTo : g.moveTo).call(g, 0.15 * R + (p.x - box.min.x) * sx, 0.15 * Hc + (p.y - box.min.y) * sy))
            g.fill()
          }
        }
        const tex = new THREE.CanvasTexture(c)
        tex.colorSpace = THREE.SRGBColorSpace
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(geo.dim.x / 0.7, geo.dim.y / 0.7), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 }))
        glow.position.z = -geo.dim.z / 2 - 0.05
        pivot.add(glow)
      }
    },
    [geo, s.studio, s.mat, s.tint, s.bg, s.bgColor, s.animate, s.period],
    { camera: STUDIOS[s.studio].cam, grid: false, background: '#e2e8f0' },
  )

  const applyStudio = (id: StudioId) => {
    set({ studio: id, ...(id === 'neon' ? { mat: 'neon' as MatId } : s.mat === 'neon' ? { mat: 'svg' as MatId } : {}) })
    const st = stage.current
    if (st) {
      st.camera.position.set(...STUDIOS[id].cam)
      st.controls.target.set(0, 0, 0)
    }
    clock.current.t0 = -1
  }

  /** Renders at `mult`× the view size; transparent PNGs use black/white difference matting. */
  const exportPng = async () => {
    const st = stage.current
    if (!st) return
    setBusy('Rendering PNG…')
    const r = st.renderer
    const size = r.getSize(new THREE.Vector2())
    const W = Math.round(size.x * s.scale), H = Math.round(size.y * s.scale)
    const pr = r.getPixelRatio()
    const grab = () => {
      r.render(st.scene, st.camera)
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const g = c.getContext('2d')!
      g.drawImage(r.domElement, 0, 0, W, H)
      return g
    }
    r.setPixelRatio(1)
    r.setSize(W, H, false)
    let out: HTMLCanvasElement
    if (s.bg === 'transparent') {
      const bg = st.scene.background
      st.scene.background = new THREE.Color('#000000')
      const a = grab().getImageData(0, 0, W, H)
      st.scene.background = new THREE.Color('#ffffff')
      const gb = grab()
      const b = gb.getImageData(0, 0, W, H)
      st.scene.background = bg
      for (let i = 0; i < a.data.length; i += 4) {
        const diff = (b.data[i] - a.data[i] + b.data[i + 1] - a.data[i + 1] + b.data[i + 2] - a.data[i + 2]) / 3
        const alpha = Math.max(0, Math.min(255, 255 - diff))
        const k = alpha > 0 ? 255 / alpha : 0
        a.data[i] = Math.min(255, a.data[i] * k)
        a.data[i + 1] = Math.min(255, a.data[i + 1] * k)
        a.data[i + 2] = Math.min(255, a.data[i + 2] * k)
        a.data[i + 3] = alpha
      }
      gb.putImageData(a, 0, 0)
      out = gb.canvas
    } else out = grab().canvas
    r.setPixelRatio(pr)
    r.setSize(size.x, size.y, false)
    const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'))
    if (blob) download(`logo-${s.studio}.png`, blob)
    setBusy('')
    setInfo(`PNG ${W} × ${H}${s.bg === 'transparent' ? ' with transparent background' : ''}.`)
  }

  const exportWebm = () => {
    const st = stage.current
    if (!st || typeof MediaRecorder === 'undefined') {
      setInfo('This browser cannot record video (no MediaRecorder).')
      return
    }
    const stream = st.renderer.domElement.captureStream(s.fps)
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      clock.current.rec = -1
      clock.current.period = s.period
      download(`logo-${s.studio}.webm`, new Blob(chunks, { type: 'video/webm' }))
      setBusy('')
      setInfo(`WebM: ${s.videoSec} s loop at ${s.fps} fps (${mime || 'default codec'}).`)
    }
    clock.current.period = s.videoSec
    clock.current.rec = performance.now()
    rec.start()
    setBusy(`Recording ${s.videoSec} s loop…`)
    setTimeout(() => rec.stop(), s.videoSec * 1000)
  }

  const exportGlb = async () => {
    const st = stage.current
    const pivot = st?.scene.getObjectByName('pivot')
    if (!pivot) return
    setBusy('Exporting GLB…')
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
    const copy = new THREE.Group()
    copy.name = 'Logo'
    pivot.children.filter((c) => (c as THREE.Mesh).isMesh && ((c as THREE.Mesh).material as THREE.Material).blending !== THREE.AdditiveBlending).forEach((c) => copy.add(c.clone()))
    const res = await new GLTFExporter().parseAsync(copy, { binary: true })
    const bytes = new Uint8Array(res as ArrayBuffer)
    const g = inspectGlb(bytes)
    download('logo.glb', new Blob([bytes], { type: 'model/gltf-binary' }))
    setBusy('')
    setInfo(`GLB 2.0: ${g.json.meshes?.length ?? 0} meshes, ${g.json.materials?.length ?? 0} materials, ${num(bytes.length / 1024, 0)} KB — opens in Blender, three.js editor, <model-viewer>.`)
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Logo (SVG)" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            {Object.keys(SAMPLES).map((k) => <Btn key={k} kind={s.sample === k ? 'primary' : 'normal'} onClick={() => set({ sample: k, svg: SAMPLES[k] })}>{k}</Btn>)}
          </Row>
          <FileDrop accept=".svg,image/svg+xml" label="Drop your SVG logo" onFiles={async ([f]) => set({ sample: '', svg: await f.text() })} />
          <Area value={s.svg} onChange={(svg) => set({ svg, sample: '' })} rows={5} mono />
          {parsed.error && <Note tone="err">{parsed.error}</Note>}
        </Panel>
        <Panel title="Studio">
          <Row>
            {(Object.keys(STUDIOS) as StudioId[]).map((id) => <Btn key={id} kind={s.studio === id ? 'primary' : 'normal'} onClick={() => applyStudio(id)}>{STUDIOS[id].label}</Btn>)}
          </Row>
          <Select label="Material" value={s.mat} onChange={(mat) => set({ mat })} options={(Object.keys(MATERIALS) as MatId[]).map((k) => [k, MATERIALS[k].label] as [MatId, string])} />
          {MATERIALS[s.mat].color !== null && (
            <Row>
              <label className="k-field"><span className="k-label">Colour</span><input type="color" value={s.tint || MATERIALS[s.mat].color!} onChange={(e) => set({ tint: e.target.value })} /></label>
              {s.tint && <Btn kind="ghost" onClick={() => set({ tint: '' })}>Material default</Btn>}
            </Row>
          )}
          <div className="k-label">Background</div>
          <Seg value={s.bg} onChange={(bg) => set({ bg })} options={[['studio', 'Studio'], ['custom', 'Solid'], ['transparent', 'Transparent']]} />
          {s.bg === 'custom' && <input type="color" value={s.bgColor} onChange={(e) => set({ bgColor: e.target.value })} aria-label="Background colour" />}
          <Check label={`Animate (${studio.anim === 'none' ? 'static' : studio.anim})`} value={s.animate} onChange={(animate) => set({ animate })} />
          <Slider label="Loop length" value={s.period} min={2} max={16} step={0.5} unit=" s" onChange={(period) => set({ period })} />
        </Panel>
        <Panel title="Extrusion">
          <Slider label="Depth" value={s.depth} min={0.05} max={2} step={0.05} onChange={(depth) => set({ depth })} />
          <Slider label="Bevel" value={s.bevel} min={0} max={0.2} step={0.005} onChange={(bevel) => set({ bevel })} show={(v) => v.toFixed(3)} />
          <Slider label="Bevel segments" value={s.bevelSeg} min={1} max={10} onChange={(bevelSeg) => set({ bevelSeg })} />
          <Slider label="Curve smoothness" value={s.curveSeg} min={4} max={64} onChange={(curveSeg) => set({ curveSeg })} />
          {geo && geo.bevel < s.bevel - 1e-6 && <Note tone="warn">Bevel capped at {geo.bevel.toFixed(3)} so thin strokes don’t self-intersect.</Note>}
        </Panel>
      </div>
      <div>
        <Panel title={`${studio.label} render`} actions={busy ? <span className="muted">{busy}</span> : undefined}>
          <View3D refEl={ref} height={460} />
          <p className="muted" style={{ fontSize: 12 }}>Drag to orbit, scroll to zoom. The view is exactly what exports render.</p>
        </Panel>
        <Stats>
          <Stat label="Paths" value={parsed.items.length} />
          <Stat label="Triangles" value={geo ? num(geo.tris, 0) : '—'} />
          <Stat label="Size (units)" value={geo ? `${geo.dim.x.toFixed(1)}×${geo.dim.y.toFixed(1)}×${geo.dim.z.toFixed(1)}` : '—'} />
          <Stat label="Studio" value={studio.label} sub={`${MATERIALS[s.mat].label}`} tone="accent" />
        </Stats>
        <Panel title="Export">
          <Row>
            <Select label="PNG size" value={s.scale} onChange={(scale) => set({ scale })} options={[[1, '1× view'], [2, '2× (retina)'], [3, '3×'], [4, '4× (print)']]} />
            <Select label="Video length" value={s.videoSec} onChange={(videoSec) => set({ videoSec })} options={[[3, '3 s'], [4, '4 s'], [6, '6 s'], [8, '8 s'], [12, '12 s']]} />
            <Select label="Frame rate" value={s.fps} onChange={(fps) => set({ fps })} options={[[24, '24 fps'], [30, '30 fps'], [60, '60 fps']]} />
          </Row>
          <Row>
            <Btn kind="primary" disabled={!geo || !!busy} onClick={() => void exportPng()}>⬇ PNG{s.bg === 'transparent' ? ' (transparent)' : ''}</Btn>
            <Btn disabled={!geo || !!busy} onClick={exportWebm}>⏺ Spin video (WebM)</Btn>
            <Btn disabled={!geo || !!busy} onClick={() => void exportGlb()}>⬇ GLB model</Btn>
          </Row>
          {info && <Note tone="ok">{info}</Note>}
          <p className="muted" style={{ fontSize: 13 }}>
            The video records one seamless loop of the studio animation (static studios spin). Transparent PNGs are matted from a black and a white render, so soft shadows stay semi-transparent. For a sign on a wall instead of a product shot, try the <a href="#/tool/logo-sign-preview">Logo Sign Preview</a>.
          </p>
        </Panel>
      </div>
    </Split>
  )
}
