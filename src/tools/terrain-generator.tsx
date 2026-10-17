import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, FileDrop, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, download, num, pct, useToolState } from '../kit'
import { THREE, useStage3D, View3D } from '../kit/three'
import { biome, fromImage, generate, hydraulicErode, normalize, pngFile, pngScanlines, smooth, thermalErode, toObj, toStl, zlibStored, type NoiseType } from './lib/terrain-generator'

interface State {
  size: number; seed: number; scale: number; octaves: number; persistence: number; lacunarity: number; type: NoiseType
  island: number; warp: number; exponent: number; smoothPasses: number; thermal: number; droplets: number
  sea: number; relief: number; maxElev: number; widthKm: number; wire: boolean; water: boolean; bits: 8 | 16; base: number
}
const DEF: State = {
  size: 129, seed: 1337, scale: 3, octaves: 6, persistence: 0.5, lacunarity: 2, type: 'fbm', island: 0.6, warp: 0.4, exponent: 1.3,
  smoothPasses: 1, thermal: 10, droplets: 8000, sea: 0.28, relief: 2.4, maxElev: 1800, widthKm: 12, wire: false, water: true, bits: 16, base: 0.3,
}
const PRESETS: [string, Partial<State>][] = [
  ['Volcanic island', { type: 'fbm', island: 0.75, scale: 2.5, octaves: 6, exponent: 1.5, warp: 0.4, sea: 0.3, relief: 2.6 }],
  ['Alpine ridges', { type: 'ridged', island: 0, scale: 3, octaves: 6, exponent: 1.8, persistence: 0.5, warp: 0.6, sea: 0.08, relief: 3.2 }],
  ['Rolling hills', { type: 'fbm', island: 0, scale: 2, octaves: 4, exponent: 1, persistence: 0.45, warp: 0.2, sea: 0.12, relief: 1.2 }],
  ['Mesas', { type: 'terraced', island: 0.2, scale: 2.5, octaves: 5, exponent: 1.2, warp: 0.5, sea: 0.15, relief: 2 }],
  ['Dunes', { type: 'billow', island: 0, scale: 5, octaves: 3, exponent: 0.9, persistence: 0.35, warp: 1, sea: 0, relief: 0.8 }],
  ['Archipelago', { type: 'fbm', island: 0.3, scale: 6, octaves: 6, exponent: 1.1, warp: 0.3, sea: 0.5, relief: 1.8 }],
]
const W = 10 // world width of the mesh

async function zlib(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') return zlibStored(data)
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export default function TerrainGenerator() {
  const [s, set, reset] = useToolState('terrain-generator', DEF)
  const [img, setImg] = useState<{ name: string; data: Float32Array; size: number } | null>(null)
  const [busy, setBusy] = useState('')
  const N = img ? img.size : Math.max(33, Math.min(257, Math.round(s.size)))

  const heights = useMemo(() => {
    let h = img ? Float32Array.from(img.data) : generate({ size: N, seed: s.seed, scale: s.scale, octaves: Math.max(1, Math.min(8, s.octaves)), persistence: s.persistence, lacunarity: s.lacunarity, type: s.type, island: s.island, warp: s.warp, exponent: s.exponent })
    if (s.smoothPasses > 0) h = smooth(h, N, s.smoothPasses)
    if (s.droplets > 0) h = hydraulicErode(h, N, Math.round(s.droplets * (N / 129) ** 2), s.seed)
    if (s.thermal > 0) h = thermalErode(h, N, s.thermal, 3 / N)
    return normalize(h)
  }, [img, N, s.seed, s.scale, s.octaves, s.persistence, s.lacunarity, s.type, s.island, s.warp, s.exponent, s.smoothPasses, s.droplets, s.thermal])

  const stats = useMemo(() => {
    let below = 0, slope = 0, steep = 0
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x
      if (heights[i] < s.sea) below++
      if (x < N - 1 && y < N - 1) {
        const rise = Math.hypot(heights[i + 1] - heights[i], heights[i + N] - heights[i]) * s.maxElev
        const deg = (Math.atan(rise / ((s.widthKm * 1000) / (N - 1))) * 180) / Math.PI
        slope += deg
        if (deg > 30) steep++
      }
    }
    return { water: below / (N * N), meanSlope: slope / ((N - 1) ** 2), steep: steep / ((N - 1) ** 2) }
  }, [heights, N, s.sea, s.maxElev, s.widthKm])

  // 2D hill-shaded map
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = canvas.current
    if (!c) return
    c.width = N; c.height = N
    const ctx = c.getContext('2d')!
    const im = ctx.createImageData(N, N)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x
      const h = heights[i]
      const dx = heights[Math.min(N - 1, x + 1) + y * N] - heights[Math.max(0, x - 1) + y * N]
      const dy = heights[x + Math.min(N - 1, y + 1) * N] - heights[x + Math.max(0, y - 1) * N]
      const shade = h < s.sea ? 1 : Math.max(0.35, Math.min(1.25, 0.85 - (dx - dy) * N * 0.1))
      const [r, g, b] = biome(h, s.sea)
      im.data[i * 4] = Math.min(255, r * 255 * shade); im.data[i * 4 + 1] = Math.min(255, g * 255 * shade); im.data[i * 4 + 2] = Math.min(255, b * 255 * shade); im.data[i * 4 + 3] = 255
    }
    ctx.putImageData(im, 0, 0)
  }, [heights, N, s.sea])

  const ref = useStage3D(
    (st) => {
      const g = new THREE.Group()
      g.name = 'terrain'
      st.scene.add(g)
    },
    (st) => {
      const g = st.scene.getObjectByName('terrain')!
      st.clear(g)
      const geo = new THREE.PlaneGeometry(W, W, N - 1, N - 1)
      geo.rotateX(-Math.PI / 2)
      const pos = geo.attributes.position as THREE.BufferAttribute
      const col = new Float32Array(N * N * 3)
      for (let i = 0; i < N * N; i++) {
        pos.setY(i, heights[i] * s.relief)
        const [r, gg, b] = biome(heights[i], s.water ? s.sea : 0)
        col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      geo.computeVertexNormals()
      g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: false, wireframe: s.wire, side: THREE.DoubleSide })))
      if (s.water && s.sea > 0) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(W, W), new THREE.MeshStandardMaterial({ color: 0x2b7bd6, transparent: true, opacity: 0.55, roughness: 0.15, metalness: 0.1 }))
        w.rotateX(-Math.PI / 2)
        w.position.y = s.sea * s.relief + 0.002
        g.add(w)
      }
    },
    [heights, N, s.relief, s.sea, s.water, s.wire],
    { camera: [8, 7, 9], target: [0, 0.6, 0], background: '#0f172a', grid: false },
  )

  const loadImage = async (f: File) => {
    const bmp = await createImageBitmap(f)
    const size = Math.max(33, Math.min(257, Math.round(s.size)))
    const c = document.createElement('canvas')
    c.width = size; c.height = size
    const ctx = c.getContext('2d')!
    ctx.drawImage(bmp, 0, 0, size, size)
    setImg({ name: f.name, size, data: normalize(fromImage(ctx.getImageData(0, 0, size, size).data, size)) })
  }

  const exportPng = async () => {
    setBusy('png')
    try {
      const png = pngFile(N, s.bits, await zlib(pngScanlines(heights, N, s.bits)))
      download(`heightmap-${N}px-${s.bits}bit.png`, new Blob([png as BlobPart], { type: 'image/png' }))
    } finally { setBusy('') }
  }
  const exportColor = () => canvas.current?.toBlob((b) => b && download(`terrain-color-${N}px.png`, b))
  const exportObj = () => download('terrain.obj', toObj(heights, N, W, s.relief), 'model/obj')
  const exportStl = () => download('terrain.stl', new Blob([toStl(heights, N, 100, (s.relief / W) * 100, s.base * 10) as BlobPart], { type: 'model/stl' }))

  return (
    <Split wide="left">
      <div>
        <Panel title="3D terrain" actions={<Row><Check label="Water" value={s.water} onChange={(water) => set({ water })} /><Check label="Wireframe" value={s.wire} onChange={(wire) => set({ wire })} /></Row>}>
          <View3D refEl={ref} height={460} />
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Drag to orbit, scroll to zoom, right-drag to pan.</p>
        </Panel>
        <Stats>
          <Stat label="Grid" value={`${N} × ${N}`} sub={`${num(N * N, 0)} vertices · ${num((s.widthKm * 1000) / (N - 1), 0)} m/cell`} />
          <Stat label="Elevation" value={`0–${num(s.maxElev, 0)} m`} sub={`sea level ${num(s.sea * s.maxElev, 0)} m`} />
          <Stat label="Under water" value={pct(stats.water, 0)} tone="accent" />
          <Stat label="Slopes > 30°" value={pct(stats.steep, 0)} sub={`mean slope ${num(stats.meanSlope, 1)}°`} />
        </Stats>
        <Panel title="Map view" actions={<Row><Btn kind="primary" disabled={!!busy} onClick={exportPng}>⬇ Heightmap PNG</Btn><Btn onClick={exportColor}>⬇ Color map</Btn><Btn onClick={exportObj}>⬇ OBJ</Btn><Btn onClick={exportStl}>⬇ STL</Btn></Row>}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <canvas ref={canvas} style={{ width: 260, maxWidth: '100%', aspectRatio: '1', imageRendering: 'pixelated', borderRadius: 8, border: '1px solid var(--line)' }} aria-label="Hill-shaded map" />
            <div style={{ flex: '1 1 220px', fontSize: 14 }}>
              <Select label="PNG bit depth" value={s.bits} onChange={(bits) => set({ bits })} options={[[16, '16-bit grayscale (65,536 levels)'], [8, '8-bit grayscale']]} />
              <Num label="STL base thickness" value={s.base} onChange={(base) => set({ base: Math.max(0, base) })} unit="× 10 mm" min={0} step={0.1} />
              <p className="muted">PNG: black = lowest, white = highest; import into Blender (Displace), Unity/Unreal terrain or World Machine. OBJ is {W} units wide with UVs. STL is a closed 100 mm print-ready block.</p>
            </div>
          </div>
        </Panel>
      </div>
      <div>
        <Panel title="Source" actions={<Btn kind="ghost" onClick={() => { reset(); setImg(null) }}>Reset</Btn>}>
          {img ? (
            <Note tone="ok">Using image <b>{img.name}</b> ({img.size} px). Brightness = height. <Btn kind="ghost" onClick={() => setImg(null)}>Back to noise</Btn></Note>
          ) : (
            <>
              <div className="k-row wrap" style={{ gap: 6, marginBottom: 8 }}>
                {PRESETS.map(([n, p]) => <Btn key={n} onClick={() => set(p)}>{n}</Btn>)}
              </div>
              <Row>
                <Select label="Noise" value={s.type} onChange={(type) => set({ type })} options={[['fbm', 'fBm simplex'], ['ridged', 'Ridged (mountains)'], ['billow', 'Billow (dunes)'], ['terraced', 'Terraced (mesas)']]} />
                <Num label="Seed" value={s.seed} onChange={(seed) => set({ seed: Math.round(seed) })} step={1} />
              </Row>
              <Btn onClick={() => set({ seed: Math.floor(Math.random() * 1e6) })}>🎲 New seed</Btn>
            </>
          )}
          <FileDrop accept="image/*" onFiles={(f) => void loadImage(f[0])} label="…or drop a grayscale image to use as a heightmap" />
        </Panel>
        <Panel title="Shape">
          <Slider label="Resolution" value={s.size} onChange={(size) => set({ size })} min={33} max={257} step={16} show={(v) => `${v} × ${v}`} />
          {!img && (
            <>
              <Slider label="Feature scale" value={s.scale} onChange={(scale) => set({ scale })} min={0.5} max={10} step={0.1} />
              <Slider label="Octaves" value={s.octaves} onChange={(octaves) => set({ octaves })} min={1} max={8} />
              <Slider label="Persistence (roughness)" value={s.persistence} onChange={(persistence) => set({ persistence })} min={0.2} max={0.8} step={0.01} />
              <Slider label="Lacunarity" value={s.lacunarity} onChange={(lacunarity) => set({ lacunarity })} min={1.5} max={3} step={0.05} />
              <Slider label="Domain warp" value={s.warp} onChange={(warp) => set({ warp })} min={0} max={2} step={0.05} />
              <Slider label="Redistribution exponent" value={s.exponent} onChange={(exponent) => set({ exponent })} min={0.5} max={3} step={0.05} />
              <Slider label="Island falloff" value={s.island} onChange={(island) => set({ island })} min={0} max={1} step={0.05} />
            </>
          )}
        </Panel>
        <Panel title="Post-processing">
          <Slider label="Smoothing passes" value={s.smoothPasses} onChange={(smoothPasses) => set({ smoothPasses })} min={0} max={8} />
          <Slider label="Hydraulic erosion droplets" value={s.droplets} onChange={(droplets) => set({ droplets })} min={0} max={40000} step={1000} show={(v) => num(v, 0)} />
          <Slider label="Thermal erosion iterations" value={s.thermal} onChange={(thermal) => set({ thermal })} min={0} max={60} />
          <Slider label="Sea level" value={s.sea} onChange={(sea) => set({ sea })} min={0} max={0.8} step={0.01} show={(v) => pct(v, 0)} />
          <Slider label="Vertical exaggeration" value={s.relief} onChange={(relief) => set({ relief })} min={0.2} max={5} step={0.1} />
          <Row>
            <Num label="Peak elevation" value={s.maxElev} onChange={(maxElev) => set({ maxElev: Math.max(1, maxElev) })} unit="m" min={1} />
            <Num label="Map width" value={s.widthKm} onChange={(widthKm) => set({ widthKm: Math.max(0.01, widthKm) })} unit="km" min={0.01} />
          </Row>
          <Note>Hydraulic erosion drops virtual raindrops that carve gullies and deposit sediment in valleys; thermal erosion lets steep slopes crumble toward the talus angle.</Note>
        </Panel>
      </div>
    </Split>
  )
}
