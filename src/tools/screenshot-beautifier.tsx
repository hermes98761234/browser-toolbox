import { useEffect, useRef, useState } from 'react'
import { Btn, download, FileDrop, Note, Panel, Row, Select, Seg, Slider, Split, Txt, useToolState } from '../kit'
import { GRADIENTS, gradientLine, layout, type Frame } from './lib/screenshot-beautifier'

type Bg = 'gradient' | 'solid' | 'blur' | 'transparent'
type Src = HTMLCanvasElement | HTMLImageElement

const DEF = {
  bg: 'gradient' as Bg, grad: 0, solid: '#f1f5f9', pad: 72, radius: 14, shadow: 45, frame: 'browser' as Frame,
  url: 'app.example.com/dashboard', title: 'Dashboard', aspect: '0', scale: 2, fmt: 'png' as 'png' | 'jpeg',
}

const ASPECTS: [string, string][] = [['0', 'Auto (fit)'], [String(16 / 9), '16:9 · slides, YouTube'], ['1', '1:1 · Instagram'], [String(4 / 5), '4:5 · portrait post'], [String(1200 / 628), '1.91:1 · Open Graph / X'], [String(4 / 3), '4:3']]

/** A fake app screenshot drawn in code so the tool shows a result before anything is uploaded. */
function demoShot(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 960
  c.height = 600
  const g = c.getContext('2d')!
  g.fillStyle = '#f8fafc'
  g.fillRect(0, 0, 960, 600)
  g.fillStyle = '#1e293b'
  g.fillRect(0, 0, 190, 600)
  g.fillStyle = '#818cf8'
  g.font = 'bold 20px system-ui, sans-serif'
  g.fillText('◆ Acme', 24, 42)
  ;['Overview', 'Revenue', 'Customers', 'Reports', 'Settings'].forEach((t, i) => {
    if (i === 0) {
      g.fillStyle = '#334155'
      g.beginPath()
      g.roundRect(12, 70, 166, 36, 8)
      g.fill()
    }
    g.fillStyle = i === 0 ? '#fff' : '#94a3b8'
    g.font = '15px system-ui, sans-serif'
    g.fillText(t, 28, 94 + i * 44)
  })
  g.fillStyle = '#0f172a'
  g.font = 'bold 24px system-ui, sans-serif'
  g.fillText('Overview', 220, 50)
  const cards = [['Revenue', '$48,210', '#6366f1'], ['Users', '12,904', '#0ea5e9'], ['Churn', '1.8%', '#10b981']]
  cards.forEach(([k, v, col], i) => {
    const x = 220 + i * 245
    g.fillStyle = '#fff'
    g.strokeStyle = '#e2e8f0'
    g.beginPath()
    g.roundRect(x, 76, 225, 104, 12)
    g.fill()
    g.stroke()
    g.fillStyle = '#64748b'
    g.font = '14px system-ui, sans-serif'
    g.fillText(k, x + 18, 106)
    g.fillStyle = col
    g.font = 'bold 30px system-ui, sans-serif'
    g.fillText(v, x + 18, 150)
  })
  g.fillStyle = '#fff'
  g.beginPath()
  g.roundRect(220, 200, 715, 375, 12)
  g.fill()
  g.stroke()
  g.fillStyle = '#0f172a'
  g.font = 'bold 16px system-ui, sans-serif'
  g.fillText('Monthly revenue', 244, 232)
  const vals = [32, 41, 38, 52, 49, 61, 58, 72, 69, 80, 77, 92]
  vals.forEach((v, i) => {
    const h = v * 3.2
    g.fillStyle = i === vals.length - 1 ? '#6366f1' : '#c7d2fe'
    g.beginPath()
    g.roundRect(250 + i * 56, 550 - h, 36, h, 6)
    g.fill()
  })
  return c
}

function render(c: HTMLCanvasElement, img: Src, s: typeof DEF, scale: number) {
  const iw = img instanceof HTMLImageElement ? img.naturalWidth : img.width
  const ih = img instanceof HTMLImageElement ? img.naturalHeight : img.height
  const L = layout(iw, ih, s.pad, s.frame, Number(s.aspect))
  c.width = Math.round(L.W * scale)
  c.height = Math.round(L.H * scale)
  const g = c.getContext('2d')!
  g.scale(scale, scale)
  const { W, H } = L
  if (s.bg === 'gradient') {
    const p = GRADIENTS[s.grad] ?? GRADIENTS[0]
    const gr = g.createLinearGradient(...gradientLine(p.angle, W, H))
    p.stops.forEach((col, i) => gr.addColorStop(i / (p.stops.length - 1), col))
    g.fillStyle = gr
    g.fillRect(0, 0, W, H)
  } else if (s.bg === 'solid' || (s.bg === 'transparent' && s.fmt === 'jpeg')) {
    g.fillStyle = s.bg === 'solid' ? s.solid : '#ffffff'
    g.fillRect(0, 0, W, H)
  } else if (s.bg === 'blur') {
    g.save()
    g.filter = `blur(${Math.max(20, Math.round(Math.max(W, H) / 30))}px) saturate(1.4)`
    const k = Math.max(W / iw, H / ih) * 1.2
    g.drawImage(img, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k)
    g.restore()
    g.fillStyle = 'rgba(0,0,0,0.12)'
    g.fillRect(0, 0, W, H)
  }
  const r = Math.min(s.radius, L.w / 2, L.h / 2)
  const dark = s.frame === 'browser-dark'
  // shadow
  if (s.shadow > 0) {
    g.save()
    g.shadowColor = `rgba(0,0,0,${0.15 + s.shadow / 220})`
    g.shadowBlur = s.shadow * 1.1
    g.shadowOffsetY = s.shadow * 0.45
    g.fillStyle = dark ? '#1f2937' : '#ffffff'
    g.beginPath()
    g.roundRect(L.x, L.y, L.w, L.h, r)
    g.fill()
    g.restore()
  }
  g.save()
  g.beginPath()
  g.roundRect(L.x, L.y, L.w, L.h, r)
  g.clip()
  if (L.bar) {
    g.fillStyle = dark ? '#1f2937' : s.frame === 'mac' ? '#e9e9ec' : '#f1f3f4'
    g.fillRect(L.x, L.y, L.w, L.bar)
    const cy = L.y + L.bar / 2
    ;['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => {
      g.fillStyle = col
      g.beginPath()
      g.arc(L.x + 20 + i * 20, cy, 6, 0, Math.PI * 2)
      g.fill()
    })
    g.textBaseline = 'middle'
    if (s.frame === 'mac') {
      g.fillStyle = '#4b5563'
      g.font = '600 13px system-ui, sans-serif'
      g.textAlign = 'center'
      g.fillText(s.title, L.x + L.w / 2, cy + 1, L.w - 160)
    } else {
      const ux = L.x + 90, uw = Math.max(40, L.w - 120)
      g.fillStyle = dark ? '#374151' : '#ffffff'
      g.beginPath()
      g.roundRect(ux, cy - 14, uw, 28, 14)
      g.fill()
      g.fillStyle = dark ? '#d1d5db' : '#4b5563'
      g.font = '13px system-ui, sans-serif'
      g.textAlign = 'left'
      g.fillText(`🔒 ${s.url}`, ux + 14, cy + 1, uw - 28)
    }
  }
  g.drawImage(img, L.x, L.y + L.bar, iw, ih)
  g.restore()
  return L
}

export default function ScreenshotBeautifier() {
  const [s, set, reset] = useToolState('screenshot-beautifier', DEF)
  const [img, setImg] = useState<Src | null>(() => demoShot())
  const [name, setName] = useState('demo')
  const [msg, setMsg] = useState('')
  const cv = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState<[number, number]>([0, 0])

  const loadFile = (f: File | Blob, n = 'screenshot') => {
    const url = URL.createObjectURL(f)
    const im = new Image()
    im.onload = () => {
      setImg(im)
      setName(n.replace(/\.[^.]+$/, ''))
    }
    im.onerror = () => setMsg('That file is not an image the browser can read.')
    im.src = url
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'))
      if (f) loadFile(f, 'pasted')
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  useEffect(() => {
    if (!img || !cv.current) return
    const L = render(cv.current, img, s, 1)
    setSize([Math.round(L.W * s.scale), Math.round(L.H * s.scale)])
  }, [img, s])

  const exportBlob = () =>
    new Promise<Blob>((res, rej) => {
      const c = document.createElement('canvas')
      render(c, img!, s, s.scale)
      c.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), `image/${s.fmt}`, 0.92)
    })
  const save = async () => download(`${name}-framed.${s.fmt === 'jpeg' ? 'jpg' : 'png'}`, await exportBlob())
  const copy = async () => {
    try {
      const c = document.createElement('canvas')
      render(c, img!, { ...s, fmt: 'png' }, s.scale)
      const b = await new Promise<Blob>((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error('encode'))), 'image/png'))
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })])
      setMsg('✓ Copied PNG to the clipboard')
    } catch {
      setMsg('Clipboard image copy is not supported here. Use Download instead.')
    }
    setTimeout(() => setMsg(''), 2500)
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Screenshot">
          <FileDrop accept="image/*" label="Drop, choose or paste (Ctrl+V) a screenshot" onFiles={([f]) => loadFile(f, f.name)} />
          <Row>
            <Btn kind="ghost" onClick={() => { setImg(demoShot()); setName('demo') }}>Use demo screenshot</Btn>
            <Btn kind="ghost" onClick={reset}>Reset style</Btn>
          </Row>
        </Panel>
        <Panel title="Frame">
          <Seg value={s.frame} onChange={(frame) => set({ frame })} options={[['none', 'None'], ['mac', 'macOS'], ['browser', 'Browser'], ['browser-dark', 'Dark']]} label="Frame" />
          {s.frame === 'mac' && <Txt label="Window title" value={s.title} onChange={(title) => set({ title })} />}
          {s.frame.startsWith('browser') && <Txt label="Address bar" value={s.url} onChange={(url) => set({ url })} />}
          <Slider label="Corner radius" value={s.radius} onChange={(radius) => set({ radius })} min={0} max={40} unit=" px" show={String} />
          <Slider label="Shadow" value={s.shadow} onChange={(shadow) => set({ shadow })} min={0} max={100} show={String} />
        </Panel>
        <Panel title="Background">
          <Seg value={s.bg} onChange={(bg) => set({ bg })} options={[['gradient', 'Gradient'], ['solid', 'Solid'], ['blur', 'Blurred'], ['transparent', 'None']]} label="Background" />
          {s.bg === 'gradient' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: 8, marginTop: 10 }}>
              {GRADIENTS.map((p, i) => (
                <button
                  type="button"
                  key={p.name}
                  title={p.name}
                  aria-label={p.name}
                  onClick={() => set({ grad: i })}
                  style={{ height: 40, borderRadius: 8, cursor: 'pointer', border: i === s.grad ? '3px solid var(--fg)' : '1px solid var(--line)', background: `linear-gradient(${p.angle}deg, ${p.stops.join(', ')})` }}
                />
              ))}
            </div>
          )}
          {s.bg === 'solid' && (
            <label className="k-field">
              <span className="k-label">Colour</span>
              <input type="color" value={s.solid} onChange={(e) => set({ solid: e.target.value })} style={{ width: 80, height: 36 }} />
            </label>
          )}
          <Slider label="Padding" value={s.pad} onChange={(pad) => set({ pad })} min={0} max={240} step={4} unit=" px" show={String} />
          <Select label="Canvas ratio" value={s.aspect} onChange={(aspect) => set({ aspect })} options={ASPECTS} />
        </Panel>
      </div>
      <div>
        <Panel
          title="Preview"
          actions={
            <>
              <Seg value={String(s.scale) as '1' | '2' | '3'} onChange={(v) => set({ scale: Number(v) })} options={[['1', '1×'], ['2', '2×'], ['3', '3×']]} label="Export scale" />
              <Seg value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['png', 'PNG'], ['jpeg', 'JPG']]} label="Format" />
              <Btn kind="primary" disabled={!img} onClick={() => void save()}>⬇ Download</Btn>
              <Btn disabled={!img} onClick={() => void copy()}>⧉ Copy</Btn>
            </>
          }
        >
          <div style={{ background: s.bg === 'transparent' ? 'repeating-conic-gradient(#cbd5e1 0 25%, #f8fafc 0 50%) 0 0/20px 20px' : undefined, borderRadius: 10, textAlign: 'center' }}>
            <canvas ref={cv} style={{ maxWidth: '100%', maxHeight: 640, display: 'inline-block' }} />
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            Export: <b>{size[0]} × {size[1]} px</b> {s.fmt === 'jpeg' && s.bg === 'transparent' && '· JPG has no transparency, so the background becomes white'}
          </p>
          {msg && <Note tone={msg.startsWith('✓') ? 'ok' : 'warn'}>{msg}</Note>}
        </Panel>
        <Note>Tip: take a screenshot, press <b>Ctrl+V</b> (⌘V) on this page and it drops straight in. 2× export keeps text crisp on retina screens and social feeds.</Note>
      </div>
    </Split>
  )
}
