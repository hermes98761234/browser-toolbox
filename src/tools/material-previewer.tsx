import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, CopyButton, download, FileDrop, Note, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { label, THREE, useStage3D, View3D, type Stage3D } from '../kit/three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { TeapotGeometry } from 'three/examples/jsm/geometries/TeapotGeometry.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { f0FromIor, generate, heightToNormal, type TexKind } from './lib/material-previewer'

type Shape = 'sphere' | 'box' | 'knot' | 'teapot' | 'cylinder' | 'plane'
type Env = 'studio' | 'sunset' | 'overcast' | 'night' | 'custom'
type Slot = 'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap' | 'aoMap'

const PRESETS: { name: string; color: string; roughness: number; metalness: number; clearcoat?: number; tex?: TexKind | 'none' }[] = [
  { name: 'Gold', color: '#ffc356', roughness: 0.18, metalness: 1 },
  { name: 'Copper', color: '#f2a07b', roughness: 0.3, metalness: 1 },
  { name: 'Chrome', color: '#f4f4f6', roughness: 0.04, metalness: 1 },
  { name: 'Brushed steel', color: '#ffffff', roughness: 0.4, metalness: 1, tex: 'brushed' },
  { name: 'Hammered brass', color: '#ffffff', roughness: 0.35, metalness: 1, tex: 'hammered' },
  { name: 'Red plastic', color: '#d1242f', roughness: 0.35, metalness: 0 },
  { name: 'Car paint', color: '#1d4ed8', roughness: 0.45, metalness: 0.6, clearcoat: 1 },
  { name: 'Rubber', color: '#262626', roughness: 0.92, metalness: 0 },
  { name: 'Ceramic tiles', color: '#ffffff', roughness: 0.15, metalness: 0, clearcoat: 0.4, tex: 'tiles' },
  { name: 'Bricks', color: '#ffffff', roughness: 1, metalness: 0, tex: 'bricks' },
  { name: 'Varnished wood', color: '#ffffff', roughness: 0.8, metalness: 0, clearcoat: 0.7, tex: 'wood' },
]

const DEF = {
  shape: 'sphere' as Shape, color: '#ffc356', roughness: 0.18, metalness: 1, clearcoat: 0, ior: 1.5, normalScale: 1,
  envIntensity: 1, env: 'studio' as Env, bg: true, blur: 0.35, lights: 0.4, tex: 'none' as TexKind | 'none', repeat: 2,
  view: 'single' as 'single' | 'matrix', spin: true,
}

function canvasTex(N: number, rgba: Uint8ClampedArray, srgb: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = N
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), N, N), 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  return t
}

function sky(top: string, mid: string, bottom: string, sun: [number, number, string, number] | null): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 1024; c.height = 512
  const g = c.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, 0, 512)
  gr.addColorStop(0, top); gr.addColorStop(0.5, mid); gr.addColorStop(0.52, bottom); gr.addColorStop(1, bottom)
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 512)
  if (sun) {
    const [x, y, col, r] = sun
    const rg = g.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.15, col); rg.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = rg; g.fillRect(0, 0, 1024, 512)
  }
  const t = new THREE.CanvasTexture(c)
  t.mapping = THREE.EquirectangularReflectionMapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function geometry(shape: Shape): THREE.BufferGeometry {
  switch (shape) {
    case 'box': return new RoundedBoxGeometry(1.9, 1.9, 1.9, 6, 0.18)
    case 'knot': return new THREE.TorusKnotGeometry(0.85, 0.32, 256, 48)
    case 'teapot': return new TeapotGeometry(0.9, 16).translate(0, -0.3, 0)
    case 'cylinder': return new THREE.CylinderGeometry(0.9, 0.9, 2, 96, 1)
    case 'plane': return new THREE.PlaneGeometry(2.8, 2.8, 1, 1).rotateX(-Math.PI / 3)
    default: return new THREE.SphereGeometry(1.2, 128, 64)
  }
}

export default function MaterialPreviewer() {
  const [s, set, reset] = useToolState('material-previewer', DEF)
  const [maps, setMaps] = useState<Partial<Record<Slot, { tex: THREE.Texture; name: string }>>>({})
  const [custom, setCustom] = useState<{ tex: THREE.Texture; name: string } | null>(null)
  const [err, setErr] = useState('')
  const envCache = useRef(new Map<string, THREE.Texture>())
  const pmremRef = useRef<THREE.PMREMGenerator | null>(null)
  const lightsRef = useRef<THREE.Light[]>([])
  const live = useRef(s)
  useEffect(() => { live.current = s }, [s])

  const procedural = useMemo(() => {
    if (s.tex === 'none') return null
    const t = generate(s.tex, 256)
    return { albedo: canvasTex(256, t.albedo, true), normal: canvasTex(256, heightToNormal(t.height, 256, t.metal ? 3 : 6), false), rough: canvasTex(256, (() => { const o = new Uint8ClampedArray(256 * 256 * 4); for (let i = 0; i < t.rough.length; i++) { o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = t.rough[i]; o[i * 4 + 3] = 255 } return o })(), false) }
  }, [s.tex])

  const envTexture = (st: Stage3D, env: Env): THREE.Texture | null => {
    if (!pmremRef.current) pmremRef.current = new THREE.PMREMGenerator(st.renderer)
    const pm = pmremRef.current
    const key = env === 'custom' ? `custom:${custom?.name}` : env
    if (envCache.current.has(key)) return envCache.current.get(key)!
    let src: THREE.Texture | null = null
    let out: THREE.Texture | null = null
    if (env === 'studio') out = pm.fromScene(new RoomEnvironment(), 0.04).texture
    else if (env === 'sunset') src = sky('#1e3a8a', '#fb923c', '#3f2a1d', [700, 240, '#fde68a', 140])
    else if (env === 'overcast') src = sky('#cbd5e1', '#e2e8f0', '#64748b', null)
    else if (env === 'night') src = sky('#020617', '#1e293b', '#0b0f1a', [300, 90, '#93c5fd', 40])
    else if (custom) src = custom.tex
    if (src) out = pm.fromEquirectangular(src).texture
    if (out) {
      out.userData.bg = src ?? out
      envCache.current.set(key, out)
    }
    return out
  }

  const ref = useStage3D(
    (st) => {
      st.renderer.toneMapping = THREE.ACESFilmicToneMapping
      st.renderer.toneMappingExposure = 1
      st.scene.traverse((o) => { if ((o as THREE.Light).isLight) lightsRef.current.push(o as THREE.Light) })
      lightsRef.current.forEach((l) => (l.userData.base = l.intensity))
      const root = new THREE.Group()
      root.name = 'root'
      st.scene.add(root)
      st.onFrame((_t, dt) => { if (live.current.spin && live.current.view === 'single') root.rotation.y += dt * 0.35 })
      return () => { pmremRef.current?.dispose(); envCache.current.forEach((t) => t.dispose()) }
    },
    (st) => {
      const env = envTexture(st, s.env) ?? envTexture(st, 'studio')
      st.scene.environment = env
      st.scene.environmentIntensity = s.envIntensity
      st.scene.background = s.bg && env ? (env.userData.bg as THREE.Texture) : new THREE.Color('#1e293b')
      st.scene.backgroundBlurriness = s.blur
      st.scene.backgroundIntensity = s.envIntensity
      lightsRef.current.forEach((l) => (l.intensity = (l.userData.base as number) * s.lights))
      const root = st.scene.getObjectByName('root') as THREE.Group
      for (const c of [...root.children]) { root.remove(c); c.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose() }) }
      root.rotation.set(0, 0, 0)
      const tex = (slot: Slot, proc?: THREE.Texture) => {
        const t = maps[slot]?.tex ?? proc ?? null
        if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(s.repeat, s.repeat); t.needsUpdate = true }
        return t
      }
      const make = (roughness: number, metalness: number) => new THREE.MeshPhysicalMaterial({
        color: s.color, roughness, metalness, clearcoat: s.clearcoat, clearcoatRoughness: 0.05, ior: s.ior,
        map: tex('map', procedural?.albedo), normalMap: tex('normalMap', procedural?.normal), roughnessMap: tex('roughnessMap', procedural?.rough),
        metalnessMap: tex('metalnessMap'), aoMap: tex('aoMap'), normalScale: new THREE.Vector2(s.normalScale, s.normalScale),
      })
      if (s.view === 'single') {
        root.add(new THREE.Mesh(geometry(s.shape), make(s.roughness, s.metalness)))
      } else {
        const geo = new THREE.SphereGeometry(0.42, 64, 32)
        for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
          const m = new THREE.Mesh(geo, make(i / 4, j / 4))
          m.position.set((i - 2) * 1.05, (j - 2) * 1.05, 0)
          root.add(m)
        }
        const a = label('roughness →', '#e2e8f0', 0.28); a.position.set(0, -2.75, 0); root.add(a)
        const b = label('metalness ↑', '#e2e8f0', 0.28); b.position.set(-3, 0, 0); root.add(b)
      }
    },
    [s, maps, procedural, custom],
    { camera: [0, 0.6, 5.2], grid: false },
  )

  const loadMap = async (slot: Slot, f: File) => {
    setErr('')
    try {
      const url = URL.createObjectURL(f)
      const t = await new THREE.TextureLoader().loadAsync(url)
      t.colorSpace = slot === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace
      setMaps((m) => ({ ...m, [slot]: { tex: t, name: f.name } }))
    } catch {
      setErr(`Could not read ${f.name} as an image.`)
    }
  }
  const loadEnv = async (f: File) => {
    setErr('')
    try {
      const url = URL.createObjectURL(f)
      const t = /\.hdr$/i.test(f.name) ? await new HDRLoader().loadAsync(url) : await new THREE.TextureLoader().loadAsync(url)
      t.mapping = THREE.EquirectangularReflectionMapping
      if (!/\.hdr$/i.test(f.name)) t.colorSpace = THREE.SRGBColorSpace
      setCustom({ tex: t, name: f.name + Date.now() })
      set({ env: 'custom', bg: true })
    } catch {
      setErr(`Could not load ${f.name}. Use an equirectangular .hdr, .jpg or .png (2:1).`)
    }
  }

  const f0 = s.metalness >= 0.5 ? null : f0FromIor(s.ior)
  const code = `new THREE.MeshPhysicalMaterial({\n  color: '${s.color}',\n  roughness: ${s.roughness},\n  metalness: ${s.metalness},\n  clearcoat: ${s.clearcoat},\n  ior: ${s.ior},\n  normalScale: new THREE.Vector2(${s.normalScale}, ${s.normalScale}),\n})`
  const SLOTS: [Slot, string, string][] = [['map', 'Albedo / base color', 'sRGB'], ['normalMap', 'Normal (OpenGL, +Y)', 'linear'], ['roughnessMap', 'Roughness', 'uses G channel'], ['metalnessMap', 'Metalness', 'uses B channel'], ['aoMap', 'Ambient occlusion', 'uses R channel']]

  return (
    <Split wide="right">
      <div>
        <Panel title="Material" actions={<Btn kind="ghost" onClick={() => { reset(); setMaps({}) }}>Reset</Btn>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {PRESETS.map((p) => (
              <Btn key={p.name} onClick={() => set({ color: p.color, roughness: p.roughness, metalness: p.metalness, clearcoat: p.clearcoat ?? 0, tex: p.tex ?? 'none' })}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, marginRight: 5, background: ({ bricks: '#a8473a', wood: '#a8703f', hammered: '#c9a24f', brushed: '#9ca3af', tiles: '#cbd5e1' } as Record<string, string>)[p.tex ?? ''] ?? p.color, border: '1px solid var(--line)' }} />{p.name}
              </Btn>
            ))}
          </div>
          <label className="k-field"><span className="k-label">Base color (tints the albedo map)</span>
            <input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} style={{ width: '100%', height: 34 }} />
          </label>
          <Slider label="Roughness" value={s.roughness} min={0} max={1} step={0.01} onChange={(roughness) => set({ roughness })} />
          <Slider label="Metalness" value={s.metalness} min={0} max={1} step={0.01} onChange={(metalness) => set({ metalness })} />
          <Slider label="Clearcoat" value={s.clearcoat} min={0} max={1} step={0.01} onChange={(clearcoat) => set({ clearcoat })} />
          <Slider label="Index of refraction" value={s.ior} min={1} max={2.4} step={0.01} onChange={(ior) => set({ ior })} />
          <Slider label="Normal strength" value={s.normalScale} min={0} max={3} step={0.05} onChange={(normalScale) => set({ normalScale })} />
        </Panel>
        <Panel title="Texture maps">
          <Row>
            <Select label="Built-in texture set" value={s.tex} onChange={(tex) => set({ tex })} options={[['none', 'None'], ['bricks', 'Bricks'], ['tiles', 'Ceramic tiles'], ['brushed', 'Brushed metal'], ['wood', 'Wood'], ['hammered', 'Hammered metal']]} />
            <Slider label="UV repeat" value={s.repeat} min={1} max={8} step={1} onChange={(repeat) => set({ repeat })} />
          </Row>
          {SLOTS.map(([slot, name, hint]) => (
            <div key={slot} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontSize: 13 }}>{name}</b> <span className="muted" style={{ fontSize: 12 }}>{hint}</span>
                <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{maps[slot]?.name ?? (procedural && ['map', 'normalMap', 'roughnessMap'].includes(slot) ? 'built-in set' : '—')}</div>
              </div>
              <label className="k-btn">⬆<input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void loadMap(slot, f) }} /></label>
              {maps[slot] && <Btn kind="ghost" onClick={() => setMaps((m) => { const n = { ...m }; delete n[slot]; return n })}>✕</Btn>}
            </div>
          ))}
          {err && <Note tone="err">{err}</Note>}
        </Panel>
      </div>
      <div>
        <Panel title="Preview" actions={<>
          <Seg value={s.view} onChange={(view) => set({ view })} options={[['single', 'Single'], ['matrix', 'R × M grid']]} />
          <Btn onClick={() => { const c = (ref.current?.querySelector('canvas')) as HTMLCanvasElement | null; if (c) c.toBlob((b) => b && download('material.png', b, 'image/png')) }}>⬇ PNG</Btn>
        </>}>
          {s.view === 'single' && <Seg value={s.shape} onChange={(shape) => set({ shape })} options={[['sphere', 'Sphere'], ['box', 'Cube'], ['knot', 'Knot'], ['teapot', 'Teapot'], ['cylinder', 'Cylinder'], ['plane', 'Plane']]} />}
          <div style={{ marginTop: 8 }}><View3D refEl={ref} height={460} /></div>
          <Row>
            <Check label="Auto-rotate" value={s.spin} onChange={(spin) => set({ spin })} />
            <Check label="Show environment" value={s.bg} onChange={(bg) => set({ bg })} />
          </Row>
        </Panel>
        <Stats>
          <Stat label="Workflow" value={s.metalness >= 0.5 ? 'Metal' : 'Dielectric'} sub={s.metalness > 0.05 && s.metalness < 0.95 ? 'mixed metalness is rare in real materials' : 'physically plausible'} />
          <Stat label="F0 reflectance" value={f0 === null ? 'base color' : `${(f0 * 100).toFixed(1)}%`} sub={f0 === null ? 'metals reflect their own tint' : `from IOR ${s.ior}`} />
          <Stat label="Specular lobe" value={s.roughness < 0.15 ? 'Mirror-like' : s.roughness < 0.5 ? 'Glossy' : 'Matte'} sub={`α = r² = ${(s.roughness ** 2).toFixed(3)}`} />
        </Stats>
        <Panel title="Lighting (HDRI)">
          <Row>
            <Select label="Environment" value={s.env} onChange={(env) => set({ env })} options={[['studio', 'Studio room'], ['sunset', 'Sunset sky'], ['overcast', 'Overcast'], ['night', 'Night'], ...(custom ? [['custom', 'Uploaded HDRI'] as [Env, string]] : [])]} />
            <Slider label="Env intensity" value={s.envIntensity} min={0} max={3} step={0.05} onChange={(envIntensity) => set({ envIntensity })} />
          </Row>
          <Row>
            <Slider label="Background blur" value={s.blur} min={0} max={1} step={0.01} onChange={(blur) => set({ blur })} />
            <Slider label="Direct lights" value={s.lights} min={0} max={2} step={0.05} onChange={(lights) => set({ lights })} />
          </Row>
          <FileDrop accept=".hdr,image/jpeg,image/png" onFiles={([f]) => void loadEnv(f)} label="Load an equirectangular HDRI (.hdr, .jpg, .png)" />
        </Panel>
        <Panel title="three.js code" actions={<><CopyButton text={code} /><Btn onClick={() => download('material.json', JSON.stringify({ color: s.color, roughness: s.roughness, metalness: s.metalness, clearcoat: s.clearcoat, ior: s.ior, normalScale: s.normalScale }, null, 2), 'application/json')}>⬇ JSON</Btn></>}>
          <pre className="mono" style={{ fontSize: 12, margin: 0, whiteSpace: 'pre-wrap' }}>{code}</pre>
          <Note>Tip: switch to the <b>R × M grid</b> to see how roughness (left→right) and metalness (bottom→top) shape the highlights under the current HDRI.</Note>
        </Panel>
      </div>
    </Split>
  )
}
