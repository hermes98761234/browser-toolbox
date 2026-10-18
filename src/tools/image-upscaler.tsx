import { useEffect, useRef, useState } from 'react'
import { Btn, FileDrop, Note, num, Panel, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { MAX_OUT, METHODS, outSize, type Img, type Job, type Method } from './lib/image-upscaler'

interface S extends Job { view: 'fit' | '1:1'; before: 'nearest' | 'smooth' }
const DEF: S = { method: 'lanczos3', factor: 3, sharpen: 0.4, sigma: 1, threshold: 2, view: 'fit', before: 'nearest' }

const SPRITE = [
  '....................',
  '........KKKK........',
  '........KCCK........',
  '........KCCK........',
  '.......KKKKKK.......',
  '........KWWK........',
  '........KWWK........',
  '.......KWWWWK.......',
  '......KWWWWWWK......',
  '.....KRRRRRRRRK.....',
  '....KRRWRRRRRRRK....',
  '....KRWWRRRRRRRK....',
  '....KRWRRRRRRRRK....',
  '....KRRRRRRRRRDK....',
  '....KRRRRRRRRRDK....',
  '.....KRRRRRRRDK.....',
  '......KKDDDDKK......',
  '........KKKK........',
  '....................',
]
const SPRITE_COL: Record<string, [number, number, number]> = { '.': [236, 240, 247], K: [38, 30, 52], C: [176, 122, 74], W: [214, 236, 248], R: [214, 52, 96], D: [146, 28, 70] }

function demoPixel(): Img {
  const w = SPRITE[0].length, h = SPRITE.length
  const d = new Uint8ClampedArray(w * h * 4)
  SPRITE.forEach((row, y) => [...row].forEach((ch, x) => d.set([...SPRITE_COL[ch], 255], (y * w + x) * 4)))
  return { w, h, d }
}

function demoScene(): Img | null {
  const w = 128, h = 84
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  if (!g) return null
  const sky = g.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#3a7bd5')
  sky.addColorStop(1, '#f8c390')
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#ffe680'
  g.beginPath(); g.arc(96, 26, 11, 0, 7); g.fill()
  g.fillStyle = '#2f6d3a'
  g.beginPath(); g.moveTo(0, 62); g.quadraticCurveTo(30, 40, 64, 60); g.quadraticCurveTo(96, 76, 128, 52); g.lineTo(128, 84); g.lineTo(0, 84); g.fill()
  g.strokeStyle = '#ffffff'
  g.lineWidth = 1
  for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(6 + i * 7, 58); g.lineTo(24 + i * 7, 18); g.stroke() }
  g.fillStyle = '#ffffff'
  g.font = 'bold 13px sans-serif'
  g.fillText('Upscale!', 44, 20)
  g.font = '9px sans-serif'
  g.fillStyle = '#10213a'
  g.fillText('small text 123', 50, 80)
  const id = g.getImageData(0, 0, w, h)
  return { w, h, d: id.data }
}

function toCanvas(img: Img, c: HTMLCanvasElement | null) {
  if (!c) return
  c.width = img.w
  c.height = img.h
  c.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(img.d), img.w, img.h), 0, 0)
}

export default function ImageUpscaler() {
  const [s, set, reset] = useToolState('image-upscaler', DEF)
  const [src, setSrc] = useState<Img | null>(null)
  const [name, setName] = useState('demo-scene')
  const [out, setOut] = useState<Img | null>(null)
  const [prog, setProg] = useState(0)
  const [ms, setMs] = useState(0)
  const [err, setErr] = useState('')
  const [split, setSplit] = useState(50)
  const worker = useRef<Worker | null>(null)
  const before = useRef<HTMLCanvasElement>(null)
  const after = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef(false)

  useEffect(() => {
    setSrc(demoScene())
    return () => worker.current?.terminate()
  }, [])

  const job: Job = { method: s.method, factor: s.factor, sharpen: s.sharpen, sigma: s.sigma, threshold: s.threshold }
  const key = JSON.stringify(job)
  useEffect(() => {
    if (!src) return
    const [W, H] = outSize(src.w, src.h, job)
    if (W * H > MAX_OUT) {
      setErr(`The result would be ${W}×${H} px — above the ${Math.sqrt(MAX_OUT)}×${Math.sqrt(MAX_OUT)} limit for in-browser processing. Lower the factor or use a smaller image.`)
      return
    }
    setErr('')
    const t = setTimeout(() => {
      worker.current?.terminate()
      const w = new Worker(new URL('./lib/image-upscaler.worker.ts', import.meta.url), { type: 'module' })
      worker.current = w
      const t0 = performance.now()
      setProg(0.001)
      w.onmessage = (e: MessageEvent<{ progress?: number; done?: boolean; d?: Uint8ClampedArray; w?: number; h?: number; error?: string }>) => {
        const m = e.data
        if (m.error) { setErr(m.error); setProg(0) }
        else if (m.done && m.d) { setOut({ w: m.w!, h: m.h!, d: m.d }); setMs(performance.now() - t0); setProg(0) }
        else if (m.progress !== undefined) setProg(Math.max(0.001, m.progress))
      }
      w.postMessage({ id: 1, d: src.d, w: src.w, h: src.h, job })
    }, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, key])

  useEffect(() => { if (src) toCanvas(src, before.current) }, [src])
  useEffect(() => { if (out) toCanvas(out, after.current) }, [out])

  const load = async (f: File) => {
    try {
      const bmp = await createImageBitmap(f)
      if (bmp.width * bmp.height > 2048 * 2048) throw new Error(`Image is ${bmp.width}×${bmp.height}; please use one up to about 4 megapixels.`)
      const c = document.createElement('canvas')
      c.width = bmp.width
      c.height = bmp.height
      const g = c.getContext('2d')!
      g.drawImage(bmp, 0, 0)
      setOut(null)
      setSrc({ w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data })
      setName(f.name.replace(/\.[^.]+$/, ''))
      if (bmp.width * bmp.height * s.factor ** 2 > MAX_OUT) set({ factor: Math.max(1.25, Math.floor(Math.sqrt(MAX_OUT / (bmp.width * bmp.height)) * 4) / 4) })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not decode this image.')
    }
  }

  const save = () => {
    const c = after.current
    if (!c || !out) return
    c.toBlob((b) => {
      if (!b) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = `${name}-${s.method}-${out.w}x${out.h}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }, 'image/png')
  }

  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (r) setSplit(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)))
  }
  const [W, H] = src ? outSize(src.w, src.h, job) : [0, 0]
  const pixel = s.method === 'pixelart'
  const dispStyle: React.CSSProperties = s.view === 'fit' ? { width: '100%', height: 'auto' } : { width: W, height: H }

  return (
    <Split wide="right">
      <div>
        <Panel title="Image">
          <FileDrop accept="image/*" onFiles={([f]) => void load(f)} label="Drop a PNG / JPEG / WebP or click to choose" />
          <Row>
            <Btn onClick={() => { setOut(null); setSrc(demoScene()); setName('demo-scene'); set({ method: 'lanczos3', factor: 3 }) }}>Demo: tiny scene</Btn>
            <Btn onClick={() => { setOut(null); setSrc(demoPixel()); setName('demo-sprite'); set({ method: 'pixelart', factor: 4, sharpen: 0 }) }}>Demo: pixel sprite</Btn>
          </Row>
        </Panel>
        <Panel title="Method">
          <div style={{ display: 'grid', gap: 6 }}>
            {(Object.keys(METHODS) as Method[]).map((m) => (
              <label key={m} className="k-check" style={{ alignItems: 'flex-start', padding: 6, borderRadius: 8, background: s.method === m ? 'var(--panel2)' : undefined }}>
                <input type="radio" name="method" checked={s.method === m} onChange={() => set({ method: m, ...(m === 'pixelart' ? { factor: Math.min(4, Math.max(2, Math.round(s.factor))), sharpen: 0 } : {}) })} />
                <span><b>{METHODS[m].name}</b><br /><span className="muted" style={{ fontSize: 13 }}>{METHODS[m].note}</span></span>
              </label>
            ))}
          </div>
        </Panel>
        <Panel title="Scale & sharpening">
          {pixel ? (
            <Seg value={String(Math.round(s.factor)) as '2' | '3' | '4'} onChange={(v) => set({ factor: +v })} options={[['2', '2×'], ['3', '3×'], ['4', '4×']]} />
          ) : (
            <Slider label="Scale factor" value={s.factor} onChange={(factor) => set({ factor })} min={1.25} max={8} step={0.25} unit="×" />
          )}
          <Slider label="Unsharp mask amount" value={s.sharpen} onChange={(sharpen) => set({ sharpen })} min={0} max={2} step={0.05} show={(v) => (v ? num(v, 2) : 'off')} />
          {s.sharpen > 0 && (
            <Row>
              <Slider label="Radius (σ)" value={s.sigma} onChange={(sigma) => set({ sigma })} min={0.3} max={4} step={0.1} unit=" px" />
              <Slider label="Threshold" value={s.threshold} onChange={(threshold) => set({ threshold })} min={0} max={30} step={1} />
            </Row>
          )}
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </Panel>
        <Note>
          <b>No AI here.</b> These are classical interpolation methods: they can make an enlargement smoother and sharper-looking, but they cannot invent detail that
          is not in the original the way a trained super-resolution network does. Processing runs tile by tile in a Web Worker; your image never leaves the device.
        </Note>
      </div>

      <div>
        <Stats>
          <Stat label="Input" value={src ? `${src.w}×${src.h}` : '—'} sub={name} />
          <Stat label="Output" value={W ? `${W}×${H}` : '—'} sub={`${num(W * H / 1e6, 2)} MP`} tone="accent" />
          <Stat label="Time" value={prog ? `${Math.round(prog * 100)} %` : out ? `${num(ms, 0)} ms` : '—'} sub={prog ? 'processing…' : METHODS[s.method].name} />
        </Stats>
        {err && <Note tone="err">{err}</Note>}
        <Panel
          title="Before / after"
          actions={
            <>
              <Seg value={s.view} onChange={(view) => set({ view })} options={[['fit', 'Fit'], ['1:1', '1:1 pixels']]} />
              <Seg value={s.before} onChange={(b) => set({ before: b })} options={[['nearest', 'Before: blocky'], ['smooth', 'Before: browser']]} />
              <Btn kind="primary" onClick={save} disabled={!out || !!prog}>⬇ PNG</Btn>
            </>
          }
        >
          <div style={{ overflow: 'auto', maxHeight: 640, borderRadius: 8, border: '1px solid var(--line)', background: 'repeating-conic-gradient(#8882 0 25%, transparent 0 50%) 0 0 / 16px 16px' }}>
            <div
              ref={box}
              style={{ position: 'relative', width: s.view === 'fit' ? '100%' : W, touchAction: 'none', cursor: 'ew-resize', userSelect: 'none' }}
              onPointerDown={(e) => { drag.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); move(e.clientX) }}
              onPointerMove={(e) => drag.current && move(e.clientX)}
              onPointerUp={() => (drag.current = false)}
            >
              <canvas ref={after} style={{ ...dispStyle, display: 'block', imageRendering: s.view === '1:1' || pixel ? 'pixelated' : 'auto', aspectRatio: `${W} / ${H}` }} />
              <canvas ref={before} style={{ ...dispStyle, position: 'absolute', inset: 0, display: 'block', imageRendering: s.before === 'nearest' ? 'pixelated' : 'auto', clipPath: `inset(0 ${100 - split}% 0 0)`, aspectRatio: `${W} / ${H}` }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${split}%`, width: 2, background: '#fff', boxShadow: '0 0 4px #000a', pointerEvents: 'none' }} />
              <span style={{ position: 'absolute', left: 8, top: 8, background: '#000a', color: '#fff', fontSize: 12, padding: '2px 6px', borderRadius: 4 }}>Before</span>
              <span style={{ position: 'absolute', right: 8, top: 8, background: '#000a', color: '#fff', fontSize: 12, padding: '2px 6px', borderRadius: 4 }}>After · {METHODS[s.method].name}</span>
              {prog > 0 && (
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, background: '#0004' }}>
                  <div style={{ width: `${prog * 100}%`, height: '100%', background: 'var(--accent)' }} />
                </div>
              )}
            </div>
          </div>
          <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(+e.target.value)} aria-label="Before/after split" style={{ width: '100%', marginTop: 8 }} />
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>Drag across the image to compare. Use <b>1:1 pixels</b> to inspect edges at full output size.</p>
        </Panel>
      </div>
    </Split>
  )
}
