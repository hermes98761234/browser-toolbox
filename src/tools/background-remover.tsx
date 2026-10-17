import { useEffect, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Panel, pct, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { alphaFrom, borderColour, decontaminate, DEFAULT_BG, segment, type BgOptions } from './lib/background-remover'

interface State extends BgOptions {
  view: 'result' | 'original' | 'mask'
  backdrop: 'checker' | 'white' | 'black' | 'color'
  backdropColor: string
  tool: 'keep' | 'remove' | 'pick'
  brush: number
  spill: boolean
}

const DEF: State = { ...DEFAULT_BG, view: 'result', backdrop: 'checker', backdropColor: '#fde68a', tool: 'keep', brush: 14, spill: true }
const WORK = 720 // processing resolution (long side)

interface Src {
  name: string
  full: HTMLCanvasElement
  w: number
  h: number
  px: Uint8ClampedArray<ArrayBuffer>
}

const hex = (c: [number, number, number]) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
const rgbOf = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) || 0) as [number, number, number]

function demoImage(): HTMLCanvasElement {
  const W = 960, H = 680
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const bg = g.createRadialGradient(W * 0.5, H * 0.4, 50, W * 0.5, H * 0.5, W * 0.75)
  bg.addColorStop(0, '#d8eef0')
  bg.addColorStop(1, '#8fb4bb')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  // soft contact shadow
  const sh = g.createRadialGradient(470, 585, 10, 470, 585, 260)
  sh.addColorStop(0, 'rgba(30,50,60,0.35)')
  sh.addColorStop(1, 'rgba(30,50,60,0)')
  g.fillStyle = sh
  g.beginPath()
  g.ellipse(470, 585, 270, 46, 0, 0, Math.PI * 2)
  g.fill()
  // mug handle (ring with a see-through hole)
  g.lineWidth = 34
  g.strokeStyle = '#c2410c'
  g.beginPath()
  g.ellipse(560, 380, 92, 110, 0, -Math.PI / 2, Math.PI / 2)
  g.stroke()
  // mug body
  const body = g.createLinearGradient(260, 0, 560, 0)
  body.addColorStop(0, '#9a3412')
  body.addColorStop(0.35, '#f97316')
  body.addColorStop(0.55, '#fdba74')
  body.addColorStop(1, '#c2410c')
  g.fillStyle = body
  g.beginPath()
  g.moveTo(270, 230)
  g.lineTo(560, 230)
  g.lineTo(545, 560)
  g.quadraticCurveTo(415, 600, 285, 560)
  g.closePath()
  g.fill()
  g.fillStyle = '#7c2d12'
  g.beginPath()
  g.ellipse(415, 230, 145, 30, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#451a03'
  g.beginPath()
  g.ellipse(415, 236, 128, 22, 0, 0, Math.PI * 2)
  g.fill()
  // lemon
  const lem = g.createRadialGradient(690, 520, 8, 715, 540, 90)
  lem.addColorStop(0, '#fef9c3')
  lem.addColorStop(0.5, '#facc15')
  lem.addColorStop(1, '#a16207')
  g.fillStyle = lem
  g.beginPath()
  g.ellipse(720, 540, 95, 62, -0.2, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#4d7c0f'
  g.beginPath()
  g.ellipse(790, 470, 42, 14, -0.7, 0, Math.PI * 2)
  g.fill()
  // sensor noise
  const im = g.getImageData(0, 0, W, H)
  let s = 7
  for (let i = 0; i < im.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0
    const n = (s / 4294967296 - 0.5) * 10
    im.data[i] += n
    im.data[i + 1] += n
    im.data[i + 2] += n
  }
  g.putImageData(im, 0, 0)
  return c
}

type HintBox = { current: { src: Src | null; h: Uint8Array } }
/** Stroke map for the current image (0 free, 1 keep, 2 remove); recreated when the image changes. */
function hintsFor(box: HintBox, p: Src): Uint8Array {
  if (box.current.src !== p) box.current = { src: p, h: new Uint8Array(p.w * p.h) }
  return box.current.h
}

function prepare(name: string, img: CanvasImageSource & { width: number; height: number }): Src {
  const full = document.createElement('canvas')
  full.width = img.width
  full.height = img.height
  full.getContext('2d')!.drawImage(img, 0, 0)
  const s = Math.min(1, WORK / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.imageSmoothingQuality = 'high'
  g.drawImage(full, 0, 0, w, h)
  return { name, full, w, h, px: g.getImageData(0, 0, w, h).data }
}

export default function BackgroundRemover() {
  const [s, set, reset] = useToolState('background-remover', DEF)
  const [src, setSrc] = useState<Src | null>(() => prepare('demo-mug.png', demoImage()))
  const [alpha, setAlpha] = useState<Uint8ClampedArray | null>(null)
  const [ms, setMs] = useState(0)
  const [hintVer, setHintVer] = useState(0)
  const hintBox = useRef<{ src: Src | null; h: Uint8Array }>({ src: null, h: new Uint8Array(0) })
  const view = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const load = (name: string, img: CanvasImageSource & { width: number; height: number }) => setSrc(prepare(name, img))

  // segmentation (debounced)
  const { mode, tolerance, iterations, smooth, feather, holes, key } = s
  useEffect(() => {
    if (!src) return
    const t = setTimeout(() => {
      const t0 = performance.now()
      const bg = segment(src.px, src.w, src.h, { mode, tolerance, iterations, smooth, feather, holes, key }, hintsFor(hintBox, src))
      setAlpha(alphaFrom(bg, src.w, src.h, feather))
      setMs(performance.now() - t0)
    }, 120)
    return () => clearTimeout(t)
  }, [src, mode, tolerance, iterations, smooth, feather, holes, key, hintVer])

  // render preview
  useEffect(() => {
    const cv = view.current
    if (!cv || !src) return
    cv.width = src.w
    cv.height = src.h
    const g = cv.getContext('2d')!
    const out = g.createImageData(src.w, src.h)
    const hints = hintsFor(hintBox, src)
    const d = out.data
    const bd = s.backdrop === 'white' ? [255, 255, 255] : s.backdrop === 'black' ? [17, 17, 17] : rgbOf(s.backdropColor)
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const i = y * src.w + x
        const a = s.view === 'original' || !alpha ? 1 : alpha[i] / 255
        const back = s.backdrop === 'checker' ? (((x >> 3) + (y >> 3)) & 1 ? [255, 255, 255] : [214, 219, 228]) : bd
        for (let c = 0; c < 3; c++) {
          const v = src.px[i * 4 + c]
          d[i * 4 + c] = s.view === 'mask' ? (a > 0.5 ? v : v * 0.35 + (c === 0 ? 160 : 20)) : v * a + back[c] * (1 - a)
        }
        const h = hints[i]
        if (h && s.view !== 'original') {
          d[i * 4] = h === 1 ? d[i * 4] * 0.5 : d[i * 4] * 0.5 + 120
          d[i * 4 + 1] = h === 1 ? d[i * 4 + 1] * 0.5 + 110 : d[i * 4 + 1] * 0.5
          d[i * 4 + 2] *= 0.5
        }
        d[i * 4 + 3] = 255
      }
    g.putImageData(out, 0, 0)
  }, [src, alpha, s.view, s.backdrop, s.backdropColor, hintVer])

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return [Math.floor(((e.clientX - r.left) / r.width) * (src?.w ?? 1)), Math.floor(((e.clientY - r.top) / r.height) * (src?.h ?? 1))]
  }
  const paint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!src) return
    const [cx, cy] = at(e)
    if (s.tool === 'pick') {
      const i = (cy * src.w + cx) * 4
      set({ mode: 'key', key: [src.px[i], src.px[i + 1], src.px[i + 2]] })
      return
    }
    const r = s.brush
    const hints = hintsFor(hintBox, src)
    const v = s.tool === 'keep' ? 1 : 2
    for (let y = Math.max(0, cy - r); y <= Math.min(src.h - 1, cy + r); y++)
      for (let x = Math.max(0, cx - r); x <= Math.min(src.w - 1, cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) hints[y * src.w + x] = v
    const g = view.current!.getContext('2d')!
    g.fillStyle = v === 1 ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)'
    g.beginPath()
    g.arc(cx + 0.5, cy + 0.5, r, 0, Math.PI * 2)
    g.fill()
  }

  const exportPng = (withBackdrop: boolean) => {
    if (!src || !alpha) return
    const { width: W, height: H } = src.full
    const am = document.createElement('canvas')
    am.width = src.w
    am.height = src.h
    const ai = am.getContext('2d')!.createImageData(src.w, src.h)
    for (let i = 0; i < alpha.length; i++) ai.data.set([alpha[i], alpha[i], alpha[i], 255], i * 4)
    am.getContext('2d')!.putImageData(ai, 0, 0)
    const up = document.createElement('canvas')
    up.width = W
    up.height = H
    const ug = up.getContext('2d')!
    ug.imageSmoothingQuality = 'high'
    ug.drawImage(am, 0, 0, W, H)
    const A = ug.getImageData(0, 0, W, H).data
    const out = document.createElement('canvas')
    out.width = W
    out.height = H
    const og = out.getContext('2d')!
    const im = src.full.getContext('2d')!.getImageData(0, 0, W, H)
    const a = new Uint8ClampedArray(W * H)
    for (let i = 0; i < a.length; i++) a[i] = A[i * 4]
    if (s.spill) decontaminate(im.data, a, s.mode === 'key' ? s.key : borderColour(src.px, src.w, src.h))
    for (let i = 0; i < a.length; i++) im.data[i * 4 + 3] = a[i]
    if (withBackdrop) {
      og.fillStyle = s.backdrop === 'black' ? '#111111' : s.backdrop === 'color' ? s.backdropColor : '#ffffff'
      og.fillRect(0, 0, W, H)
      const tmp = document.createElement('canvas')
      tmp.width = W
      tmp.height = H
      tmp.getContext('2d')!.putImageData(im, 0, 0)
      og.drawImage(tmp, 0, 0)
    } else og.putImageData(im, 0, 0)
    out.toBlob((b) => b && download(src.name.replace(/\.[^.]+$/, '') + (withBackdrop ? '-backdrop.png' : '-cutout.png'), b), 'image/png')
  }

  const removed = alpha ? alpha.reduce((n, v) => n + (v < 128 ? 1 : 0), 0) / alpha.length : 0

  return (
    <Split wide="right">
      <div>
        <Panel title="Image">
          <FileDrop
            accept="image/*"
            label="Drop a photo or click to choose"
            onFiles={async ([f]) => {
              const bmp = await createImageBitmap(f).catch(() => null)
              if (bmp) load(f.name, bmp)
            }}
          />
          <Row>
            <Btn kind="ghost" onClick={() => load('demo-mug.png', demoImage())}>Load demo photo</Btn>
          </Row>
        </Panel>
        <Panel title="Detection" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['auto', 'Auto (from edges)'], ['key', 'Colour key']]} label="Mode" />
          {s.mode === 'key' && (
            <Row>
              <label className="k-field">
                <span className="k-label">Key colour</span>
                <input type="color" value={hex(s.key)} onChange={(e) => set({ key: rgbOf(e.target.value) })} />
              </label>
              <Btn onClick={() => set({ tool: 'pick' })}>🎯 Pick from image</Btn>
            </Row>
          )}
          <Slider label="Tolerance" value={s.tolerance} min={4} max={60} onChange={(tolerance) => set({ tolerance })} show={(v) => `ΔE ${v}`} />
          {s.mode === 'auto' && (
            <>
              <Slider label="Refinement passes" value={s.iterations} min={0} max={6} onChange={(iterations) => set({ iterations })} show={String} />
              <Slider label="Smoothing" value={s.smooth} min={0} max={5} onChange={(smooth) => set({ smooth })} show={String} unit=" px" />
              <Check label="Remove background seen through gaps (e.g. a mug handle)" value={s.holes} onChange={(holes) => set({ holes })} />
            </>
          )}
          <Slider label="Edge feather" value={s.feather} min={0} max={5} step={0.5} onChange={(feather) => set({ feather })} show={String} unit=" px" />
          <Check label="Remove colour spill on edges" value={s.spill} onChange={(spill) => set({ spill })} />
        </Panel>
        <Panel title="Touch-up brush">
          <Seg value={s.tool} onChange={(tool) => set({ tool })} options={[['keep', '🟢 Keep'], ['remove', '🔴 Remove'], ['pick', '🎯 Pick key']]} label="Brush" />
          <Slider label="Brush size" value={s.brush} min={2} max={60} onChange={(brush) => set({ brush })} show={String} unit=" px" />
          <Row>
            <Btn
              kind="ghost"
              onClick={() => {
                if (src) hintsFor(hintBox, src).fill(0)
                setHintVer((v) => v + 1)
              }}
            >
              Clear strokes
            </Btn>
          </Row>
          <Note>Paint <b>Keep</b> over parts that vanished and <b>Remove</b> over leftovers. Strokes are hard constraints — the colour model re-learns from them.</Note>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Image" value={src ? `${src.full.width}×${src.full.height}` : '—'} sub={src?.name} />
          <Stat label="Background removed" value={pct(removed, 0)} tone="accent" />
          <Stat label="Processing" value={`${ms.toFixed(0)} ms`} sub={src ? `at ${src.w}×${src.h}` : undefined} />
        </Stats>
        <Panel
          title="Preview"
          actions={
            <>
              <Btn kind="primary" onClick={() => exportPng(false)} disabled={!alpha}>⬇ Transparent PNG</Btn>
              <Btn onClick={() => exportPng(true)} disabled={!alpha || s.backdrop === 'checker'} title="Pick a solid backdrop first">⬇ With backdrop</Btn>
            </>
          }
        >
          <Row>
            <Seg value={s.view} onChange={(v) => set({ view: v })} options={[['result', 'Result'], ['mask', 'Mask'], ['original', 'Original']]} label="View" />
            <Seg value={s.backdrop} onChange={(backdrop) => set({ backdrop })} options={[['checker', 'Checker'], ['white', 'White'], ['black', 'Black'], ['color', 'Colour']]} label="Backdrop" />
            {s.backdrop === 'color' && <input type="color" value={s.backdropColor} onChange={(e) => set({ backdropColor: e.target.value })} aria-label="Backdrop colour" />}
          </Row>
          <canvas
            ref={view}
            style={{ width: '100%', height: 'auto', marginTop: 10, borderRadius: 10, border: '1px solid var(--line)', cursor: s.tool === 'pick' ? 'crosshair' : 'cell', touchAction: 'none', display: 'block' }}
            onPointerDown={(e) => {
              drawing.current = s.tool !== 'pick'
              e.currentTarget.setPointerCapture(e.pointerId)
              paint(e)
            }}
            onPointerMove={(e) => drawing.current && paint(e)}
            onPointerUp={() => {
              if (drawing.current) setHintVer((v) => v + 1)
              drawing.current = false
            }}
          />
          <p className="muted" style={{ fontSize: 13 }}>
            {s.tool === 'pick' ? 'Click the background colour to key it out.' : `Drag on the image to paint ${s.tool === 'keep' ? 'keep' : 'remove'} strokes.`} Export is full resolution.
          </p>
        </Panel>
        <Panel title="How it works">
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li><b>Auto</b> learns the backdrop colours from the image border, flood-fills inward, then runs GrabCut-style passes that re-learn foreground and background colour clusters and smooth the decision.</li>
            <li><b>Colour key</b> removes one colour everywhere — ideal for green screens and product shots on seamless paper.</li>
            <li>Works best on plain or gently graded backgrounds. No AI model is downloaded; nothing leaves your browser.</li>
          </ul>
        </Panel>
      </div>
    </Split>
  )
}
