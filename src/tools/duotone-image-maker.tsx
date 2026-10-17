import { useEffect, useRef, useState } from 'react'
import { Btn, Check, FileDrop, Note, Panel, Row, Seg, Slider, Split, useToolState } from '../kit'
import { applyDuotone, buildLut, PRESETS, type Space } from './lib/duotone-image-maker'

const DEF = { s: '#1e3264', h: '#f037a5', m: '#f3722c', useMid: false, midPos: 0.5, space: 'lab' as Space, contrast: 10, brightness: 0, gamma: 1, invert: false, blend: 0, view: 'result' as 'result' | 'split' | 'original' }
const MAX_PREVIEW = 1100

/** Procedural demo photo: sunset over layered hills with a lake and trees. */
function demoImage(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 960; c.height = 640
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, 400)
  sky.addColorStop(0, '#2b4c7e'); sky.addColorStop(0.55, '#e9a46a'); sky.addColorStop(1, '#f7d9a8')
  g.fillStyle = sky; g.fillRect(0, 0, 960, 640)
  const sun = g.createRadialGradient(610, 300, 10, 610, 300, 160)
  sun.addColorStop(0, 'rgba(255,250,220,1)'); sun.addColorStop(0.25, 'rgba(255,230,160,0.9)'); sun.addColorStop(1, 'rgba(255,200,120,0)')
  g.fillStyle = sun; g.fillRect(0, 0, 960, 640)
  let seed = 4
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280)
  for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(255,255,255,${0.12 + rnd() * 0.15})`; g.beginPath(); g.ellipse(rnd() * 960, 60 + rnd() * 160, 80 + rnd() * 120, 10 + rnd() * 14, 0, 0, Math.PI * 2); g.fill() }
  const hills: [string, number, number][] = [['#7d6b8f', 330, 60], ['#5a4f72', 380, 45], ['#3b3556', 430, 35], ['#231f38', 470, 25]]
  hills.forEach(([col, base, amp], k) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, 640)
    for (let x = 0; x <= 960; x += 8) g.lineTo(x, base - amp * Math.sin(x / (140 - k * 18) + k * 1.7) - amp * 0.5 * Math.sin(x / 47 + k))
    g.lineTo(960, 640); g.fill()
  })
  const lake = g.createLinearGradient(0, 500, 0, 640)
  lake.addColorStop(0, '#e8b98a'); lake.addColorStop(1, '#2e3f62')
  g.fillStyle = lake; g.fillRect(0, 505, 960, 135)
  g.fillStyle = 'rgba(255,240,200,0.5)'
  for (let i = 0; i < 26; i++) g.fillRect(560 + (rnd() - 0.5) * 140, 515 + i * 4.5, 40 + rnd() * 60, 1.5)
  g.fillStyle = '#120f1f'
  for (let i = 0; i < 26; i++) {
    const x = i < 12 ? i * 26 + rnd() * 10 : 740 + (i - 12) * 17, h = 50 + rnd() * 70, y = 512
    g.beginPath(); g.moveTo(x, y - h); g.lineTo(x - h * 0.22, y); g.lineTo(x + h * 0.22, y); g.fill()
  }
  const img = g.getImageData(0, 0, 960, 640)
  for (let p = 0; p < img.data.length; p += 4) { const n = (rnd() - 0.5) * 10; img.data[p] += n; img.data[p + 1] += n; img.data[p + 2] += n }
  g.putImageData(img, 0, 0)
  return c
}

export default function DuotoneImageMaker() {
  const [s, set, reset] = useToolState('duotone-image-maker', DEF)
  const [src, setSrc] = useState<{ el: CanvasImageSource; w: number; h: number; name: string } | null>(() => { const c = demoImage(); return { el: c, w: c.width, h: c.height, name: 'demo' } })
  const [err, setErr] = useState('')
  const cv = useRef<HTMLCanvasElement>(null)
  const srcData = useRef<ImageData | null>(null)

  // Scale the source to the preview size once per image
  useEffect(() => {
    if (!src) return
    const k = Math.min(1, MAX_PREVIEW / Math.max(src.w, src.h))
    const w = Math.round(src.w * k), h = Math.round(src.h * k)
    const t = document.createElement('canvas')
    t.width = w; t.height = h
    const g = t.getContext('2d')!
    g.drawImage(src.el, 0, 0, w, h)
    srcData.current = g.getImageData(0, 0, w, h)
  }, [src])

  useEffect(() => {
    const c = cv.current, d = srcData.current
    if (!c || !d || !src) return
    c.width = d.width; c.height = d.height
    const g = c.getContext('2d')!
    const out = new ImageData(d.width, d.height)
    applyDuotone(d.data, out.data, buildLut(s.s, s.h, s.space, s.useMid ? s.m : undefined, s.midPos), s)
    if (s.view === 'original') out.data.set(d.data)
    else if (s.view === 'split') {
      const half = Math.floor(d.width / 2)
      for (let y = 0; y < d.height; y++) out.data.set(d.data.subarray(y * d.width * 4, (y * d.width + half) * 4), y * d.width * 4)
    }
    g.putImageData(out, 0, 0)
    if (s.view === 'split') { g.fillStyle = '#fff'; g.fillRect(Math.floor(d.width / 2) - 1, 0, 2, d.height) }
  }, [s, src])

  const load = async (f: File) => {
    setErr('')
    if (!f.type.startsWith('image/')) { setErr('Please choose an image file.'); return }
    try {
      const bmp = await createImageBitmap(f)
      setSrc({ el: bmp, w: bmp.width, h: bmp.height, name: f.name.replace(/\.[^.]+$/, '') })
    } catch { setErr('This image could not be decoded by your browser.') }
  }

  const exportPng = () => {
    if (!src) return
    const k = Math.min(1, 6000 / Math.max(src.w, src.h))
    const w = Math.round(src.w * k), h = Math.round(src.h * k)
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    const g = c.getContext('2d')!
    g.drawImage(src.el, 0, 0, w, h)
    const d = g.getImageData(0, 0, w, h)
    applyDuotone(d.data, d.data, buildLut(s.s, s.h, s.space, s.useMid ? s.m : undefined, s.midPos), s)
    g.putImageData(d, 0, 0)
    c.toBlob((b) => {
      if (!b) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b); a.download = `${src.name}-duotone.png`; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    }, 'image/png')
  }

  const swatch = (a: string, b: string, m?: string) => `linear-gradient(90deg, ${a}, ${m ? m + ', ' : ''}${b})`
  const colorIn = (label: string, v: string, on: (v: string) => void) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600 }}>{label}
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="color" value={v} onChange={(e) => on(e.target.value)} style={{ width: 44, height: 34, padding: 0, border: 'none', background: 'none' }} aria-label={label} />
        <input key={v} defaultValue={v} onBlur={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value.trim()) && on(e.target.value.trim().toLowerCase())} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} style={{ width: 86 }} aria-label={label + ' hex'} />
      </span>
    </label>
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Image">
          <FileDrop accept="image/*" onFiles={([f]) => load(f)} label="Drop a photo or click to choose" />
          {err && <Note tone="err">{err}</Note>}
          <Row><Btn onClick={() => { const c = demoImage(); setSrc({ el: c, w: c.width, h: c.height, name: 'demo' }) }}>Use demo photo</Btn>{src && <span className="muted" style={{ fontSize: 12 }}>{src.w}×{src.h}px</span>}</Row>
        </Panel>
        <Panel title="Colours" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 6, marginBottom: 10 }}>
            {PRESETS.map((p) => (
              <button key={p.name} onClick={() => set({ s: p.s, h: p.h, useMid: !!p.m, m: p.m ?? s.m })} title={p.name}
                style={{ border: s.s === p.s && s.h === p.h ? '2px solid var(--accent)' : '1px solid var(--line)', borderRadius: 8, padding: 4, background: 'var(--panel)', cursor: 'pointer', color: 'inherit' }}>
                <div style={{ height: 22, borderRadius: 5, background: swatch(p.s, p.h, p.m) }} />
                <div style={{ fontSize: 11, marginTop: 3 }}>{p.name}</div>
              </button>
            ))}
          </div>
          <Row>
            {colorIn('Shadows', s.s, (v) => set({ s: v }))}
            {colorIn('Highlights', s.h, (v) => set({ h: v }))}
            <Btn onClick={() => set({ s: s.h, h: s.s })} title="Swap">⇄</Btn>
          </Row>
          <Check label="Add a midtone (tritone)" value={s.useMid} onChange={(useMid) => set({ useMid })} />
          {s.useMid && <Row>{colorIn('Midtone', s.m, (v) => set({ m: v }))}<Slider label="Midtone position" value={s.midPos} onChange={(midPos) => set({ midPos })} min={0.1} max={0.9} step={0.01} show={(v) => `${Math.round(v * 100)}%`} /></Row>}
          <div style={{ height: 14, borderRadius: 7, margin: '8px 0', background: swatch(s.s, s.h, s.useMid ? s.m : undefined) }} />
          <Seg value={s.space} onChange={(space) => set({ space })} options={[['lab', 'Lab blend'], ['linear', 'Linear RGB'], ['rgb', 'sRGB']]} />
        </Panel>
        <Panel title="Tone">
          <Slider label="Contrast" value={s.contrast} onChange={(contrast) => set({ contrast })} min={-50} max={80} />
          <Slider label="Brightness" value={s.brightness} onChange={(brightness) => set({ brightness })} min={-40} max={40} />
          <Slider label="Gamma" value={s.gamma} onChange={(gamma) => set({ gamma })} min={0.4} max={2.5} step={0.05} show={(v) => v.toFixed(2)} />
          <Slider label="Keep original colour" value={s.blend} onChange={(blend) => set({ blend })} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />
          <Check label="Invert tones" value={s.invert} onChange={(invert) => set({ invert })} />
        </Panel>
      </div>
      <div>
        <Panel title="Preview" actions={<>
          <Seg value={s.view} onChange={(view) => set({ view })} options={[['result', 'Duotone'], ['split', 'Split'], ['original', 'Original']]} />
          <Btn kind="primary" onClick={exportPng} disabled={!src}>⬇ PNG</Btn>
        </>}>
          <canvas ref={cv} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8, background: 'var(--bg)' }} />
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Each pixel's Rec. 709 luminance is passed through the tone curve and mapped onto the gradient. Lab blending keeps midtones vivid instead of muddy. Download renders at full resolution (up to 6000 px); the image never leaves your device.</p>
        </Panel>
      </div>
    </Split>
  )
}
