import { useEffect, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, fmt, Note, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { azElToUv, dirFromAzEl, encodeHDR, generateSky, generateStudio, hdrStats, toneMap8, type HdrStats } from './lib/hdri-viewer'

type Source = 'sky' | 'studio' | 'file'
type Tone = 'aces' | 'agx' | 'neutral' | 'reinhard' | 'none'

const DEF = {
  source: 'sky' as Source,
  sunAz: 35,
  sunEl: 28,
  turbidity: 3,
  clouds: 0.35,
  sunPower: 600,
  exposure: 1,
  tone: 'aces' as Tone,
  envIntensity: 1,
  bgBlur: 0,
  bgIntensity: 1,
  rotation: 0,
  sunLight: 2.5,
  showBg: true,
  ground: 'shadow' as 'shadow' | 'floor' | 'none',
}
type S = typeof DEF

const PRESETS: [string, Partial<S>][] = [
  ['Clear noon', { sunAz: 20, sunEl: 62, turbidity: 2, clouds: 0.1, sunPower: 800 }],
  ['Golden hour', { sunAz: 35, sunEl: 8, turbidity: 4, clouds: 0.3, sunPower: 500 }],
  ['Sunset', { sunAz: -60, sunEl: 1.5, turbidity: 6, clouds: 0.45, sunPower: 300 }],
  ['Overcast', { sunAz: 0, sunEl: 40, turbidity: 9, clouds: 0.95, sunPower: 40 }],
  ['Blue hour', { sunAz: 90, sunEl: -4, turbidity: 3, clouds: 0.2, sunPower: 0 }],
]

const TONES: Record<Tone, THREE.ToneMapping> = {
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  none: THREE.NoToneMapping,
}

const MATS: { name: string; make: () => THREE.Material }[] = [
  { name: 'Chrome', make: () => new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.02 }) },
  { name: 'Brushed gold', make: () => new THREE.MeshStandardMaterial({ color: 0xffc66b, metalness: 1, roughness: 0.35 }) },
  { name: 'Glossy plastic', make: () => new THREE.MeshPhysicalMaterial({ color: 0xd8dde6, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }) },
  { name: 'Matte clay (18% gray)', make: () => new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 1 }) },
  { name: 'Car paint', make: () => new THREE.MeshPhysicalMaterial({ color: 0xb3121d, metalness: 0.3, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.03 }) },
]

interface Img {
  data: ArrayLike<number>
  w: number
  h: number
  ch: number
  top: boolean
}

interface Rig {
  stage: Stage3D
  pmrem: THREE.PMREMGenerator
  tex: THREE.Texture | null
  env: THREE.WebGLRenderTarget | null
  sun: THREE.DirectionalLight
  shadow: THREE.Mesh
  floor: THREE.Mesh
}

export default function HdriViewer() {
  const [s, set, reset] = useToolState('hdri-viewer', DEF)
  const rig = useRef<Rig | null>(null)
  const fileRef = useRef<{ name: string; buf: ArrayBuffer; exr: boolean } | null>(null)
  const [fileName, setFileName] = useState('')
  const [img, setImg] = useState<Img | null>(null)
  const [stats, setStats] = useState<HdrStats | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const src: Source = s.source === 'file' && !fileName ? 'sky' : s.source

  const ref = useStage3D(
    (st) => {
      for (const c of [...st.scene.children]) if ((c as THREE.Light).isLight) st.scene.remove(c)
      st.renderer.shadowMap.enabled = true
      st.renderer.shadowMap.type = THREE.PCFSoftShadowMap
      const sun = new THREE.DirectionalLight(0xffffff, 2)
      sun.castShadow = true
      sun.shadow.mapSize.set(2048, 2048)
      Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 40 })
      sun.shadow.bias = -0.0005
      sun.shadow.radius = 4
      st.scene.add(sun, sun.target)
      const geo = new THREE.SphereGeometry(0.62, 64, 32)
      MATS.forEach((m, i) => {
        const mesh = new THREE.Mesh(i === 4 ? new THREE.TorusKnotGeometry(0.42, 0.15, 160, 24) : geo, m.make())
        mesh.position.set((i - 2) * 1.5, 0.66, i % 2 ? -0.7 : 0.4)
        mesh.castShadow = mesh.receiveShadow = true
        st.scene.add(mesh)
      })
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.45 }))
      shadow.rotation.x = -Math.PI / 2
      shadow.receiveShadow = true
      const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshStandardMaterial({ color: 0x8a8f99, roughness: 0.85 }))
      floor.rotation.x = -Math.PI / 2
      floor.receiveShadow = true
      st.scene.add(shadow, floor)
      rig.current = { stage: st, pmrem: new THREE.PMREMGenerator(st.renderer), tex: null, env: null, sun, shadow, floor }
      return () => {
        rig.current?.pmrem.dispose()
        rig.current?.env?.dispose()
        rig.current?.tex?.dispose()
        rig.current = null
      }
    },
    undefined,
    [],
    { camera: [0, 2.2, 7.5], target: [0, 0.6, 0], grid: false, background: '#111' },
  )

  // Build / load the HDR texture.
  const genKey = src === 'sky' ? JSON.stringify([s.sunAz, s.sunEl, s.turbidity, s.clouds, s.sunPower]) : src + fileName
  useEffect(() => {
    let alive = true
    const t = setTimeout(async () => {
      const r = rig.current
      if (!r) return
      setBusy(true)
      setErr('')
      try {
        let buf: ArrayBuffer
        let exr = false
        let raw: Img | null = null
        if (src === 'file' && fileRef.current) {
          buf = fileRef.current.buf
          exr = fileRef.current.exr
        } else {
          const W = 1024, H = 512
          const rgb = src === 'studio' ? generateStudio(W, H) : generateSky({ sunAz: s.sunAz, sunEl: s.sunEl, turbidity: s.turbidity, clouds: s.clouds, sunPower: s.sunPower }, W, H)
          raw = { data: rgb, w: W, h: H, ch: 3, top: true }
          buf = encodeHDR(rgb, W, H).buffer as ArrayBuffer
        }
        const url = URL.createObjectURL(new Blob([buf]))
        const loader = exr ? new EXRLoader().setDataType(THREE.FloatType) : new HDRLoader().setDataType(THREE.FloatType)
        const tex = await loader.loadAsync(url)
        URL.revokeObjectURL(url)
        if (!alive || !rig.current) return void tex.dispose()
        tex.mapping = THREE.EquirectangularReflectionMapping
        r.tex?.dispose()
        r.env?.dispose()
        r.tex = tex
        r.env = r.pmrem.fromEquirectangular(tex)
        const im = tex.image as { data: Float32Array; width: number; height: number }
        const view: Img = raw ?? { data: im.data, w: im.width, h: im.height, ch: Math.round(im.data.length / (im.width * im.height)), top: tex.flipY }
        const st = hdrStats(view.data, view.w, view.h, view.ch, view.top)
        setImg(view)
        setStats(st)
        if (src !== 'sky' && view.ch >= 3) set({ sunAz: Math.round(st.sunAz), sunEl: Math.round(Math.max(2, st.sunEl)) })
      } catch (e) {
        setErr(`Could not read this file: ${(e as Error).message}`)
      } finally {
        if (alive) setBusy(false)
      }
    }, 120)
    return () => {
      alive = false
      clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genKey])

  // Apply view settings every render (cheap).
  useEffect(() => {
    const r = rig.current
    if (!r) return
    const { scene, renderer } = r.stage
    renderer.toneMapping = TONES[s.tone]
    renderer.toneMappingExposure = s.exposure
    scene.environment = r.env?.texture ?? null
    scene.environmentIntensity = s.envIntensity
    scene.background = s.showBg && r.tex ? r.tex : new THREE.Color('#202226')
    scene.backgroundBlurriness = s.bgBlur
    scene.backgroundIntensity = s.bgIntensity
    const rot = (s.rotation * Math.PI) / 180
    scene.environmentRotation.set(0, rot, 0)
    scene.backgroundRotation.set(0, rot, 0)
    const d = new THREE.Vector3(...dirFromAzEl(s.sunAz, s.sunEl)).applyEuler(new THREE.Euler(0, rot, 0))
    r.sun.position.copy(d.multiplyScalar(15))
    r.sun.intensity = s.sunEl > 0 ? s.sunLight : 0
    r.shadow.visible = s.ground === 'shadow'
    r.floor.visible = s.ground === 'floor'
  })

  // Tone-mapped panorama with sun marker.
  useEffect(() => {
    const c = canvas.current
    if (!c || !img) return
    const W = 512, H = 256
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')!
    const out = ctx.createImageData(W, H)
    for (let y = 0; y < H; y++) {
      const sy0 = Math.floor(((y + 0.5) / H) * img.h)
      const sy = img.top ? sy0 : img.h - 1 - sy0
      for (let x = 0; x < W; x++) {
        const i = (sy * img.w + Math.floor(((x + 0.5) / W) * img.w)) * img.ch
        const o = (y * W + x) * 4
        out.data[o] = toneMap8(img.data[i], s.exposure)
        out.data[o + 1] = toneMap8(img.data[i + 1], s.exposure)
        out.data[o + 2] = toneMap8(img.data[i + 2], s.exposure)
        out.data[o + 3] = 255
      }
    }
    ctx.putImageData(out, 0, 0)
    const [u, v] = azElToUv(s.sunAz, s.sunEl)
    ctx.strokeStyle = '#ff3b6b'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(u * W, (1 - v) * H, 9, 0, Math.PI * 2)
    ctx.moveTo(u * W - 16, (1 - v) * H)
    ctx.lineTo(u * W + 16, (1 - v) * H)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,.35)'
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(0, H / 2)
    ctx.lineTo(W, H / 2)
    ctx.stroke()
  }, [img, s.exposure, s.sunAz, s.sunEl])

  const pickSun = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect()
    const u = (e.clientX - b.left) / b.width, v = 1 - (e.clientY - b.top) / b.height
    set({ sunAz: Math.round((u - 0.5) * 360), sunEl: Math.round(Math.max(-10, (v - 0.5) * 180)) })
  }

  const onFiles = async (fs: File[]) => {
    const f = fs[0]
    const exr = /\.exr$/i.test(f.name)
    if (!exr && !/\.(hdr|pic|rgbe)$/i.test(f.name)) return setErr('Please choose a Radiance .hdr or OpenEXR .exr file.')
    if (f.size > 120e6) return setErr('That file is over 120 MB; try a 1k–4k version.')
    fileRef.current = { name: f.name, buf: await f.arrayBuffer(), exr }
    setFileName(f.name)
    set({ source: 'file' })
  }

  const exportHdr = () => {
    const rgb = src === 'studio' ? generateStudio(2048, 1024) : generateSky({ sunAz: s.sunAz, sunEl: s.sunEl, turbidity: s.turbidity, clouds: s.clouds, sunPower: s.sunPower }, 2048, 1024)
    download(`${src === 'studio' ? 'studio' : 'sky'}-2k.hdr`, new Blob([encodeHDR(rgb, 2048, 1024) as BlobPart], { type: 'image/vnd.radiance' }))
  }
  const snapshot = () => {
    const c = rig.current?.stage.renderer.domElement
    if (c) c.toBlob((b) => b && download('hdri-preview.png', b))
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Environment">
          <Seg value={src} onChange={(source) => (source === 'file' && !fileName ? setErr('Drop an .hdr or .exr file below first.') : set({ source }))} options={[['sky', 'Procedural sky'], ['studio', 'Studio'], ['file', fileName ? 'My file' : 'Load file…']]} />
          <div style={{ marginTop: 10 }}>
            <FileDrop accept=".hdr,.exr,.pic,.rgbe" onFiles={(f) => void onFiles(f)} label={fileName ? `Loaded: ${fileName}` : 'Drop an equirectangular .hdr / .exr (Poly Haven etc.)'} />
          </div>
          {err && <Note tone="err">{err}</Note>}
          {src === 'sky' && (
            <>
              <Row>
                {PRESETS.map(([n, p]) => (
                  <Btn key={n} onClick={() => set(p)}>{n}</Btn>
                ))}
              </Row>
              <Slider label="Haze (turbidity)" value={s.turbidity} min={1} max={10} step={0.5} onChange={(turbidity) => set({ turbidity })} />
              <Slider label="Cloud cover" value={s.clouds} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(clouds) => set({ clouds })} />
              <Slider label="Sun disk radiance" value={s.sunPower} min={0} max={3000} step={50} onChange={(sunPower) => set({ sunPower })} />
              <Btn onClick={exportHdr}>⬇ Export 2K .hdr</Btn>
            </>
          )}
          {src === 'studio' && <Btn onClick={exportHdr}>⬇ Export 2K .hdr</Btn>}
        </Panel>
        <Panel title="Sun direction">
          <Slider label="Azimuth" value={s.sunAz} min={-180} max={180} unit="°" onChange={(sunAz) => set({ sunAz })} />
          <Slider label="Elevation" value={s.sunEl} min={-10} max={90} unit="°" onChange={(sunEl) => set({ sunEl })} />
          <Slider label="Sun light (shadows)" value={s.sunLight} min={0} max={8} step={0.1} onChange={(sunLight) => set({ sunLight })} />
          {src !== 'sky' && stats && (
            <Btn kind="ghost" onClick={() => set({ sunAz: Math.round(stats.sunAz), sunEl: Math.round(Math.max(2, stats.sunEl)) })}>Snap to brightest pixel</Btn>
          )}
          <p className="muted" style={{ fontSize: 13 }}>
            {src === 'sky' ? 'Moving the sun re-renders the sky.' : 'For loaded maps the sun is auto-detected; adjust it to align the shadow light.'} Click the panorama to place it.
          </p>
        </Panel>
        <Panel title="Camera & display">
          <Select label="Tone mapping" value={s.tone} onChange={(tone) => set({ tone })} options={[['aces', 'ACES Filmic'], ['agx', 'AgX'], ['neutral', 'Khronos Neutral'], ['reinhard', 'Reinhard'], ['none', 'None (linear clip)']]} />
          <Slider label="Exposure" value={Math.log2(s.exposure)} min={-6} max={6} step={0.1} show={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} EV`} onChange={(v) => set({ exposure: Math.pow(2, v) })} />
          <Slider label="Environment intensity" value={s.envIntensity} min={0} max={3} step={0.05} onChange={(envIntensity) => set({ envIntensity })} />
          <Slider label="Rotate environment" value={s.rotation} min={-180} max={180} unit="°" onChange={(rotation) => set({ rotation })} />
          <Slider label="Background blur" value={s.bgBlur} min={0} max={1} step={0.02} onChange={(bgBlur) => set({ bgBlur })} />
          <Slider label="Background intensity" value={s.bgIntensity} min={0} max={2} step={0.05} onChange={(bgIntensity) => set({ bgIntensity })} />
          <Row>
            <Check label="Show background" value={s.showBg} onChange={(showBg) => set({ showBg })} />
            <Select label="Ground" value={s.ground} onChange={(ground) => set({ ground })} options={[['shadow', 'Shadow catcher'], ['floor', 'Gray floor'], ['none', 'None']]} />
          </Row>
          <Btn kind="ghost" onClick={reset}>Reset all</Btn>
        </Panel>
      </div>
      <div>
        <Panel title={busy ? 'Preview · processing…' : 'Preview'} actions={<Btn onClick={snapshot}>⬇ PNG</Btn>}>
          <View3D refEl={ref} height={460} />
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
            Left to right: {MATS.map((m) => m.name).join(' · ')}. Drag to orbit, scroll to zoom.
          </p>
        </Panel>
        {stats && img && (
          <Stats>
            <Stat label="Resolution" value={`${img.w}×${img.h}`} sub={src === 'file' ? fileName : 'generated in-browser'} />
            <Stat label="Peak luminance" value={fmt(stats.peak, 4)} sub={`at az ${Math.round(stats.sunAz)}°, el ${Math.round(stats.sunEl)}°`} tone="accent" />
            <Stat label="Mean (solid angle)" value={fmt(stats.mean, 3)} sub={`suggested exposure ${(Math.log2(0.18 / (stats.mean || 1))).toFixed(1)} EV`} />
            <Stat label="Dynamic range" value={`${stats.stops.toFixed(1)} stops`} sub={`${(stats.clipped * 100).toFixed(1)}% of sphere > 1.0`} />
          </Stats>
        )}
        <Panel title="Equirectangular map (click to set sun)">
          <canvas ref={canvas} onClick={pickSun} style={{ width: '100%', aspectRatio: '2 / 1', borderRadius: 8, cursor: 'crosshair', display: 'block', background: '#000' }} />
          <Note>
            HDR pixels store real radiance, so the sun can be thousands of times brighter than the sky. That range is what makes chrome
            reflections and soft lighting look real; the PMREM pre-filter turns the map into blurred mip levels for rough materials.
          </Note>
        </Panel>
      </div>
    </Split>
  )
}
