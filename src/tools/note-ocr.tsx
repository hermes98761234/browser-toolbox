import { useEffect, useRef, useState } from 'react'
import { Btn, Check, CopyButton, download, FileDrop, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, today, uid, useToolState } from '../kit'
import { counts, deskewAngle, otsu, reflow, tidy } from './lib/note-ocr'

interface Box { text: string; x: number; y: number; w: number; h: number }
type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string; boundingBox: DOMRectReadOnly }[]> }
const TextDetectorCtor = (globalThis as unknown as { TextDetector?: new () => Detector }).TextDetector

const DEF = {
  rot: 0, deskew: 0, crop: [6, 6, 6, 6] as number[], flatten: true, mode: 'bw' as 'color' | 'gray' | 'bw', autoTh: true, th: 150,
  contrast: 1.2, bright: 0, invert: false, lang: 'en', title: 'Kick-off meeting', text: 'Project kick-off 12 Oct\n• Goal: launch beta by\nDecember\n• Owners: Ana (API), Tom\n(design)\n• Budget review next Fri-\nday\n• Risks: vendor delay , hiring\nNext steps: draft spec + time-\nline', saved: [] as { id: string; title: string; text: string; date: string }[],
}
type S = typeof DEF
const LANGS: [string, string][] = [['en', 'English'], ['de', 'German'], ['fr', 'French'], ['es', 'Spanish'], ['it', 'Italian'], ['pt', 'Portuguese'], ['pl', 'Polish'], ['uk', 'Ukrainian'], ['nl', 'Dutch']]

/** A photo-like sample: tilted whiteboard notes with uneven lighting. */
function sample(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 1200; c.height = 860
  const g = c.getContext('2d')!
  g.fillStyle = '#6b7280'; g.fillRect(0, 0, 1200, 860)
  g.save(); g.translate(600, 430); g.rotate((3.5 * Math.PI) / 180)
  const lg = g.createLinearGradient(-560, -400, 560, 400)
  lg.addColorStop(0, '#f4f4ef'); lg.addColorStop(0.6, '#dcdcd4'); lg.addColorStop(1, '#a3a39a')
  g.fillStyle = lg; g.fillRect(-540, -390, 1080, 780)
  g.fillStyle = '#1e3a8a'; g.font = 'bold 54px "Comic Sans MS", "Segoe Print", cursive'
  g.fillText('Project kick-off  12 Oct', -480, -290)
  g.font = '40px "Comic Sans MS", "Segoe Print", cursive'
  const lines = ['- Goal: launch beta by December', '- Owners: Ana (API), Tom (design)', '- Budget review next Friday', '- Risks: vendor delay, hiring', 'Next steps: draft spec + timeline']
  lines.forEach((l, i) => { g.fillStyle = i === 4 ? '#b91c1c' : '#111827'; g.fillText(l, -480, -190 + i * 78) })
  g.strokeStyle = '#b91c1c'; g.lineWidth = 4; g.strokeRect(-495, 85, 760, 70)
  g.restore()
  const sh = g.createRadialGradient(1100, 800, 50, 1100, 800, 700)
  sh.addColorStop(0, 'rgba(0,0,0,0.35)'); sh.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = sh; g.fillRect(0, 0, 1200, 860)
  return c
}

function fit(src: CanvasImageSource & { width: number; height: number }, max = 1600): HTMLCanvasElement {
  const k = Math.min(1, max / Math.max(src.width, src.height))
  const c = document.createElement('canvas')
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k)
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
  return c
}

function geometry(src: HTMLCanvasElement, s: S): HTMLCanvasElement {
  const quarter = ((s.rot % 360) + 360) % 360
  const swap = quarter === 90 || quarter === 270
  const W = swap ? src.height : src.width, H = swap ? src.width : src.height
  const r = document.createElement('canvas')
  r.width = W; r.height = H
  const g = r.getContext('2d')!
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H)
  g.translate(W / 2, H / 2); g.rotate(((quarter + s.deskew) * Math.PI) / 180)
  g.drawImage(src, -src.width / 2, -src.height / 2)
  const [t, rr, b, l] = s.crop.map((v) => Math.max(0, Math.min(45, v)) / 100)
  const cx = Math.round(W * l), cy = Math.round(H * t), cw = Math.max(10, Math.round(W * (1 - l - rr))), ch = Math.max(10, Math.round(H * (1 - t - b)))
  const out = document.createElement('canvas')
  out.width = cw; out.height = ch
  out.getContext('2d')!.drawImage(r, cx, cy, cw, ch, 0, 0, cw, ch)
  return out
}

function background(c: HTMLCanvasElement): Uint8ClampedArray {
  // large blur = downscale then upscale with smoothing; approximates the paper/board illumination
  const small = document.createElement('canvas')
  small.width = Math.max(4, Math.round(c.width / 24)); small.height = Math.max(4, Math.round(c.height / 24))
  const sg = small.getContext('2d')!
  sg.filter = 'blur(2px)'
  sg.drawImage(c, 0, 0, small.width, small.height)
  const big = document.createElement('canvas')
  big.width = c.width; big.height = c.height
  const bg = big.getContext('2d')!
  bg.imageSmoothingQuality = 'high'
  bg.filter = 'blur(6px)'
  bg.drawImage(small, 0, 0, c.width, c.height)
  return bg.getImageData(0, 0, c.width, c.height).data
}

function enhance(c: HTMLCanvasElement, s: S): { canvas: HTMLCanvasElement; th: number } {
  const g = c.getContext('2d')!
  const img = g.getImageData(0, 0, c.width, c.height)
  const d = img.data
  const bg = s.flatten ? background(c) : null
  const n = c.width * c.height
  const gray = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      let v = d[i * 4 + k]
      // ink is dark; dividing by the local background brightness removes shadows and gradients
      if (bg) v = (v / Math.max(24, bg[i * 4 + k] * 0.95)) * 255
      v = (v - 128) * s.contrast + 128 + s.bright
      d[i * 4 + k] = v
    }
    gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
  }
  const th = s.autoTh ? otsu(gray) : s.th
  for (let i = 0; i < n; i++) {
    let r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2]
    if (s.mode === 'gray') r = gg = b = gray[i]
    else if (s.mode === 'bw') r = gg = b = gray[i] > th ? 255 : 0
    if (s.invert) { r = 255 - r; gg = 255 - gg; b = 255 - b }
    d[i * 4] = r; d[i * 4 + 1] = gg; d[i * 4 + 2] = b
  }
  g.putImageData(img, 0, 0)
  return { canvas: c, th }
}

function autoDeskew(src: HTMLCanvasElement, s: S): number {
  const c = enhance(geometry(fit(src, 700), { ...s, deskew: 0, mode: 'gray' }), { ...s, mode: 'gray' }).canvas
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
  const gray = new Uint8ClampedArray(c.width * c.height)
  for (let i = 0; i < gray.length; i++) gray[i] = d[i * 4]
  const th = otsu(gray)
  const xs: number[] = [], ys: number[] = []
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (gray[y * c.width + x] < th && gray[y * c.width + x] < 160) { xs.push(x); ys.push(y) }
  return Math.round((-deskewAngle(xs, ys) * 180) / Math.PI * 4) / 4
}

export default function NoteOcr() {
  const [s, set] = useToolState('note-ocr', DEF)
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null)
  const [name, setName] = useState('sample-whiteboard.png')
  const [boxes, setBoxes] = useState<Box[]>([])
  const [busy, setBusy] = useState('')
  const [cam, setCam] = useState<MediaStream | null>(null)
  const [camErr, setCamErr] = useState('')
  const [used, setUsed] = useState(0)
  const outRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const processed = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const c = sample()
    setSrc(c) // eslint-disable-line react-hooks/set-state-in-effect
    set({ deskew: autoDeskew(c, DEF) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!src || !outRef.current) return
    const { canvas, th } = enhance(geometry(src, s), s)
    processed.current = canvas
    const o = outRef.current
    o.width = canvas.width; o.height = canvas.height
    o.getContext('2d')!.drawImage(canvas, 0, 0)
    setUsed(th) // eslint-disable-line react-hooks/set-state-in-effect
    setBoxes([])
  }, [src, s])

  useEffect(() => {
    if (videoRef.current && cam) { videoRef.current.srcObject = cam; void videoRef.current.play() }
    return () => cam?.getTracks().forEach((t) => t.stop())
  }, [cam])

  const load = async (f: File) => {
    try {
      const bmp = await createImageBitmap(f)
      const c = fit(bmp, 2000)
      setSrc(c); setName(f.name)
      set({ rot: 0, crop: [0, 0, 0, 0], deskew: autoDeskew(c, { ...s, rot: 0, crop: [0, 0, 0, 0] }) })
    } catch { setBusy('Could not open that image.') }
  }
  const startCam = async () => {
    setCamErr('')
    if (!navigator.mediaDevices?.getUserMedia) { setCamErr('Camera API not available (needs HTTPS and a camera).'); return }
    try { setCam(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } })) } catch (e) { setCamErr(`Camera unavailable: ${(e as Error).message}`) }
  }
  const snap = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    setSrc(c); setName(`photo-${today()}.png`)
    set({ rot: 0, crop: [2, 2, 2, 2], deskew: autoDeskew(c, { ...s, rot: 0 }) })
    setCam(null)
  }
  const detect = async () => {
    if (!TextDetectorCtor || !processed.current) return
    setBusy('Detecting text…')
    try {
      const res = await new TextDetectorCtor().detect(processed.current)
      const b = res.map((r) => ({ text: r.rawValue, x: r.boundingBox.x, y: r.boundingBox.y, w: r.boundingBox.width, h: r.boundingBox.height }))
        .sort((a, c) => (Math.abs(a.y - c.y) < Math.min(a.h, c.h) / 2 ? a.x - c.x : a.y - c.y))
      setBoxes(b)
      const txt = b.map((x) => x.text).join('\n')
      set({ text: s.text.trim() ? `${s.text}\n\n${txt}` : txt })
      setBusy(b.length ? '' : 'No text found. Try B/W mode, more contrast or a tighter crop.')
    } catch (e) { setBusy(`Text detection failed: ${(e as Error).message}`) }
  }
  const copyImage = () => processed.current?.toBlob((b) => {
    if (!b) return
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) void navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(() => setBusy('Image copied — paste it into your OS text-recognition app.'), () => download('clean-notes.png', b, 'image/png'))
    else download('clean-notes.png', b, 'image/png')
  }, 'image/png')
  const crop = (i: number, v: number) => set({ crop: s.crop.map((x, j) => (j === i ? v : x)) })
  const c = counts(s.text)
  const W = processed.current?.width ?? 1, H = processed.current?.height ?? 1

  return (
    <div>
      {TextDetectorCtor
        ? <Note tone="ok">This browser has a built-in text detector (Shape Detection API). Clean up the photo, then press <b>Detect text</b>.</Note>
        : <Note>Your browser has no built-in text recognition (the Shape Detection <code>TextDetector</code> is only in some Chromium builds), and this tool does not upload images anywhere. Clean up the photo here, then <b>copy the image</b> and use your system’s recognizer — macOS/iOS Live Text, Windows Snipping Tool “Text actions”, Google Lens on Android — and paste the text into the editor below.</Note>}
      <Split wide="right">
        <div>
          <Panel title="Source">
            <FileDrop accept="image/*" onFiles={([f]) => void load(f)} label="Drop a photo of notes, a slide or a whiteboard" />
            <Row>
              {cam ? <><Btn kind="primary" onClick={snap}>📸 Capture</Btn><Btn kind="ghost" onClick={() => setCam(null)}>Cancel</Btn></> : <Btn onClick={() => void startCam()}>📷 Use camera</Btn>}
              <Btn kind="ghost" onClick={() => { const c2 = sample(); setSrc(c2); setName('sample-whiteboard.png'); set({ ...DEF, text: s.text, saved: s.saved, title: s.title, deskew: autoDeskew(c2, DEF) }) }}>Sample</Btn>
            </Row>
            {camErr && <Note tone="warn">{camErr}</Note>}
            {cam && <video ref={videoRef} playsInline muted style={{ width: '100%', borderRadius: 8, marginTop: 8 }} />}
            <p className="muted" style={{ fontSize: 12 }}>{name}{src ? ` · ${src.width}×${src.height}` : ''}</p>
          </Panel>
          <Panel title="Straighten & crop">
            <Row>
              <Btn onClick={() => set({ rot: (s.rot + 270) % 360 })}>⟲ 90°</Btn>
              <Btn onClick={() => set({ rot: (s.rot + 90) % 360 })}>⟳ 90°</Btn>
              <Btn kind="primary" disabled={!src} onClick={() => src && set({ deskew: autoDeskew(src, s) })}>Auto-deskew</Btn>
            </Row>
            <Slider label="Fine rotation" value={s.deskew} min={-15} max={15} step={0.25} unit="°" onChange={(deskew) => set({ deskew })} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
              {['Top', 'Right', 'Bottom', 'Left'].map((n, i) => <Slider key={n} label={`Crop ${n.toLowerCase()}`} value={s.crop[i]} min={0} max={45} step={0.5} unit="%" onChange={(v) => crop(i, v)} />)}
            </div>
          </Panel>
          <Panel title="Clean up">
            <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['color', 'Colour'], ['gray', 'Grayscale'], ['bw', 'Black & white']]} />
            <Check label="Flatten lighting (remove shadows / glare)" value={s.flatten} onChange={(flatten) => set({ flatten })} />
            <Check label="Invert (chalkboard / dark slides)" value={s.invert} onChange={(invert) => set({ invert })} />
            <Slider label="Contrast" value={s.contrast} min={0.5} max={3} step={0.05} unit="×" onChange={(contrast) => set({ contrast })} />
            <Slider label="Brightness" value={s.bright} min={-100} max={100} step={1} onChange={(bright) => set({ bright })} />
            {s.mode === 'bw' && <>
              <Check label={`Automatic threshold (Otsu) — ${used}`} value={s.autoTh} onChange={(autoTh) => set({ autoTh, th: used })} />
              {!s.autoTh && <Slider label="Threshold" value={s.th} min={0} max={255} step={1} onChange={(th) => set({ th })} />}
            </>}
          </Panel>
        </div>
        <div>
          <Panel title="Cleaned image" actions={<>
            {TextDetectorCtor && <Btn kind="primary" onClick={() => void detect()}>🔎 Detect text</Btn>}
            <Btn onClick={copyImage}>⧉ Copy image</Btn>
            <Btn onClick={() => processed.current?.toBlob((b) => b && download('clean-notes.png', b, 'image/png'))}>⬇ PNG</Btn>
          </>}>
            <div style={{ position: 'relative', lineHeight: 0 }}>
              <canvas ref={outRef} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--line)', background: '#fff' }} />
              {boxes.map((b, i) => <span key={i} title={b.text} style={{ position: 'absolute', left: `${(b.x / W) * 100}%`, top: `${(b.y / H) * 100}%`, width: `${(b.w / W) * 100}%`, height: `${(b.h / H) * 100}%`, border: '2px solid #10b981', background: 'rgba(16,185,129,.12)', borderRadius: 3 }} />)}
            </div>
            {busy && <Note tone={busy.startsWith('Could') || busy.includes('failed') ? 'err' : 'info'}>{busy}</Note>}
          </Panel>
          <Stats>
            <Stat label="Words" value={c.words} />
            <Stat label="Lines" value={c.lines} />
            <Stat label="Saved notes" value={s.saved.length} />
          </Stats>
          <Panel title="Notes editor" actions={<>
            <Btn onClick={() => set({ text: reflow(s.text) })} title="Join lines broken by OCR, fix hyphenation">↵ Reflow</Btn>
            <Btn onClick={() => set({ text: tidy(s.text) })} title="Quotes, bullets, spaces">✧ Tidy</Btn>
            <CopyButton text={s.text} />
          </>}>
            <Row>
              <label className="k-field" style={{ flex: 2 }}><span className="k-label">Title</span><input className="k-text" value={s.title} onChange={(e) => set({ title: e.target.value })} /></label>
              <Select label="Spell-check language" value={s.lang} onChange={(lang) => set({ lang })} options={LANGS} />
            </Row>
            <textarea className="k-area" lang={s.lang} spellCheck rows={11} value={s.text} onChange={(e) => set({ text: e.target.value })}
              placeholder={'Paste recognised text here (or type).\nTip: Reflow joins lines that OCR broke mid-sentence.'} />
            <Row>
              <Btn kind="primary" disabled={!s.text.trim()} onClick={() => set({ saved: [{ id: uid(), title: s.title || 'Untitled', text: s.text, date: today() }, ...s.saved] })}>💾 Save note</Btn>
              <Btn onClick={() => download(`${s.title || 'notes'}.txt`, s.text, 'text/plain')}>⬇ .txt</Btn>
              <Btn onClick={() => download(`${s.title || 'notes'}.md`, `# ${s.title}\n\n${s.text}\n`, 'text/markdown')}>⬇ .md</Btn>
              <Btn kind="ghost" onClick={() => set({ text: '' })}>Clear</Btn>
            </Row>
          </Panel>
          {s.saved.length > 0 && (
            <Panel title="Saved notes">
              {s.saved.map((n) => (
                <div key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}><b>{n.title}</b> <span className="muted" style={{ fontSize: 12 }}>{n.date} · {counts(n.text).words} words</span>
                    <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.text.slice(0, 120)}</div></div>
                  <Btn onClick={() => set({ title: n.title, text: n.text })}>Open</Btn>
                  <Btn kind="ghost" onClick={() => set({ saved: s.saved.filter((x) => x.id !== n.id) })}>✕</Btn>
                </div>
              ))}
            </Panel>
          )}
        </div>
      </Split>
    </div>
  )
}
