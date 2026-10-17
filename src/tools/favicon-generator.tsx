import { useEffect, useRef, useState } from 'react'
import { Area, Btn, CopyButton, download, FileDrop, Note, Panel, Row, Select, Seg, Slider, Split, Table, Txt, useToolState } from '../kit'
import { buildIco, htmlSnippet, ICO_SIZES, manifest, PNG_TARGETS } from './lib/favicon-generator'
import { fmtBytes, makeZip } from './lib/image-compressor'

type Shape = 'square' | 'rounded' | 'circle'
const DEF = {
  mode: 'text' as 'text' | 'image',
  text: 'B',
  font: 'system-ui, sans-serif',
  weight: 800,
  scale: 0.62,
  fg: '#ffffff',
  bg1: '#6366f1',
  bg2: '#0ea5e9',
  gradient: true,
  transparent: false,
  shape: 'rounded' as Shape,
  radius: 22,
  pad: 8,
  name: 'My Website',
  short: 'MySite',
  theme: '#6366f1',
  path: '/',
}
type S = typeof DEF

const PRESETS: [string, Partial<S>][] = [
  ['Indigo B', { mode: 'text', text: 'B', fg: '#ffffff', bg1: '#6366f1', bg2: '#0ea5e9', gradient: true, shape: 'rounded', font: 'system-ui, sans-serif', weight: 800, scale: 0.62 }],
  ['Rocket', { mode: 'text', text: '🚀', bg1: '#0f172a', bg2: '#334155', gradient: true, shape: 'circle', scale: 0.6 }],
  ['Serif monogram', { mode: 'text', text: 'Ab', fg: '#1f2937', bg1: '#fde68a', bg2: '#fbbf24', gradient: false, shape: 'square', font: 'Georgia, serif', weight: 700, scale: 0.55 }],
  ['Mint code', { mode: 'text', text: '</>', fg: '#064e3b', bg1: '#6ee7b7', bg2: '#10b981', gradient: true, shape: 'rounded', font: 'ui-monospace, monospace', weight: 700, scale: 0.42 }],
]

const FONTS: [string, string][] = [
  ['system-ui, sans-serif', 'System sans'],
  ['Georgia, serif', 'Serif'],
  ['ui-monospace, monospace', 'Monospace'],
  ['"Comic Sans MS", cursive', 'Rounded / casual'],
  ['Impact, sans-serif', 'Condensed bold'],
]

function shapePath(x: CanvasRenderingContext2D, n: number, shape: Shape, radius: number) {
  x.beginPath()
  if (shape === 'circle') x.arc(n / 2, n / 2, n / 2, 0, Math.PI * 2)
  else if (shape === 'rounded') x.roundRect(0, 0, n, n, (radius / 100) * n)
  else x.rect(0, 0, n, n)
}

/** Draws the icon at an exact pixel size (text is re-rasterised per size, so 16 px stays crisp). */
function render(s: S, img: HTMLImageElement | null, n: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = n
  const x = c.getContext('2d')!
  if (!s.transparent) {
    shapePath(x, n, s.shape, s.radius)
    if (s.gradient) {
      const g = x.createLinearGradient(0, 0, n, n)
      g.addColorStop(0, s.bg1)
      g.addColorStop(1, s.bg2)
      x.fillStyle = g
    } else x.fillStyle = s.bg1
    x.fill()
  }
  shapePath(x, n, s.transparent ? 'square' : s.shape, s.radius)
  x.clip()
  if (s.mode === 'image' && img) {
    const p = (s.pad / 100) * n
    const box = n - 2 * p
    const k = Math.min(box / img.naturalWidth, box / img.naturalHeight)
    // step down by halves for clean small sizes
    let src: CanvasImageSource = img
    let w = img.naturalWidth, h = img.naturalHeight
    const tw = img.naturalWidth * k
    while (w / 2 >= tw && w > 2) {
      const t = document.createElement('canvas')
      t.width = Math.max(1, Math.round(w / 2))
      t.height = Math.max(1, Math.round(h / 2))
      const tx = t.getContext('2d')!
      tx.imageSmoothingQuality = 'high'
      tx.drawImage(src, 0, 0, t.width, t.height)
      src = t
      w = t.width
      h = t.height
    }
    x.imageSmoothingQuality = 'high'
    const dw = img.naturalWidth * k, dh = img.naturalHeight * k
    x.drawImage(src, (n - dw) / 2, (n - dh) / 2, dw, dh)
  } else {
    const t = s.text || '?'
    x.fillStyle = s.fg
    x.textAlign = 'center'
    x.textBaseline = 'alphabetic'
    let fs = n * s.scale
    x.font = `${s.weight} ${fs}px ${s.font}`
    let m = x.measureText(t)
    const maxW = n * (1 - (2 * s.pad) / 100)
    if (m.width > maxW) {
      fs *= maxW / m.width
      x.font = `${s.weight} ${fs}px ${s.font}`
      m = x.measureText(t)
    }
    // centre on the actual ink box, not the font's em box
    const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent
    x.fillText(t, n / 2, n / 2 + (asc - desc) / 2)
  }
  return c
}

const toPng = (c: HTMLCanvasElement) => new Promise<Uint8Array>((r) => c.toBlob(async (b) => r(new Uint8Array(await b!.arrayBuffer())), 'image/png'))

function Canvas({ draw, size, css }: { draw: () => HTMLCanvasElement; size: number; css?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const src = draw()
    el.width = el.height = size
    const x = el.getContext('2d')!
    x.clearRect(0, 0, size, size)
    x.drawImage(src, 0, 0)
  })
  return <canvas ref={ref} style={{ width: css ?? size, height: css ?? size, imageRendering: (css ?? size) > size ? 'pixelated' : 'auto' }} />
}

export default function FaviconGenerator() {
  const [s, set, reset] = useToolState('favicon-generator', DEF)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [imgName, setImgName] = useState('')
  const [zipInfo, setZipInfo] = useState('')
  const draw = (n: number) => () => render(s, img, n)
  const snippet = htmlSnippet({ path: s.path, theme: s.theme })

  const loadFile = (f: File) => {
    const url = URL.createObjectURL(f)
    const im = new Image()
    im.onload = () => {
      setImg(im)
      setImgName(f.name)
      set({ mode: 'image', transparent: f.type === 'image/png' || f.type === 'image/svg+xml' ? s.transparent : false })
    }
    im.src = url
  }

  const files = async () => {
    const out: { name: string; data: Uint8Array }[] = []
    const ico = buildIco(await Promise.all(ICO_SIZES.map(async (size) => ({ size, png: await toPng(render(s, img, size)) }))))
    out.push({ name: 'favicon.ico', data: ico })
    for (const t of PNG_TARGETS) out.push({ name: t.file, data: await toPng(render(s, img, t.size)) })
    const enc = new TextEncoder()
    out.push({ name: 'site.webmanifest', data: enc.encode(manifest({ name: s.name, short: s.short, theme: s.theme, bg: s.bg1, path: s.path })) })
    out.push({ name: 'favicon-snippet.html', data: enc.encode(`<!-- Paste inside <head> -->\n${snippet}\n`) })
    return out
  }

  const zip = async () => {
    const f = await files()
    const z = makeZip(f)
    download('favicons.zip', new Blob([z as BlobPart], { type: 'application/zip' }), 'application/zip')
    setZipInfo(`${f.length} files · ${fmtBytes(z.length)}`)
  }
  const icoOnly = async () => {
    const ico = buildIco(await Promise.all(ICO_SIZES.map(async (size) => ({ size, png: await toPng(render(s, img, size)) }))))
    download('favicon.ico', new Blob([ico as BlobPart], { type: 'image/x-icon' }), 'image/x-icon')
  }

  return (
    <Split>
      <div>
        <Panel title="Source" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['text', 'Text / emoji'], ['image', 'Image']]} />
          <div style={{ height: 10 }} />
          {s.mode === 'image' ? (
            <>
              <FileDrop accept="image/*" onFiles={(f) => loadFile(f[0])} label={imgName ? `Using ${imgName} — drop another to replace` : 'Drop a square logo (PNG/SVG, 512 px+ ideal)'} />
              {!img && <Note tone="warn">No image yet — the text icon is shown until you add one.</Note>}
            </>
          ) : (
            <>
              <Row>
                <Txt label="Text or emoji" value={s.text} onChange={(text) => set({ text: [...text].slice(0, 4).join('') })} hint="1–3 characters read best at 16 px" />
                <label className="k-field">
                  <span className="k-label">Text colour</span>
                  <input type="color" value={s.fg} onChange={(e) => set({ fg: e.target.value })} style={{ height: 36, width: 64 }} />
                </label>
              </Row>
              <Row>
                <Select label="Font" value={s.font} onChange={(font) => set({ font })} options={FONTS} />
                <Select label="Weight" value={s.weight} onChange={(weight) => set({ weight })} options={[[400, 'Regular'], [600, 'Semibold'], [700, 'Bold'], [800, 'Extra bold'], [900, 'Black']]} />
              </Row>
              <Slider label="Text size" value={s.scale} onChange={(scale) => set({ scale })} min={0.3} max={0.95} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
            </>
          )}
          <Slider label="Padding" value={s.pad} onChange={(pad) => set({ pad })} min={0} max={30} unit="%" />
        </Panel>
        <Panel title="Background & shape">
          <Seg value={s.shape} onChange={(shape) => set({ shape })} options={[['square', 'Square'], ['rounded', 'Rounded'], ['circle', 'Circle']]} />
          {s.shape === 'rounded' && <Slider label="Corner radius" value={s.radius} onChange={(radius) => set({ radius })} min={2} max={50} unit="%" />}
          <Row>
            <label className="k-field">
              <span className="k-label">Colour 1</span>
              <input type="color" value={s.bg1} onChange={(e) => set({ bg1: e.target.value })} style={{ height: 36, width: 64 }} />
            </label>
            {s.gradient && (
              <label className="k-field">
                <span className="k-label">Colour 2</span>
                <input type="color" value={s.bg2} onChange={(e) => set({ bg2: e.target.value })} style={{ height: 36, width: 64 }} />
              </label>
            )}
            <Seg value={s.transparent ? 'none' : s.gradient ? 'grad' : 'solid'} onChange={(v) => set({ transparent: v === 'none', gradient: v === 'grad' })} options={[['solid', 'Solid'], ['grad', 'Gradient'], ['none', 'Transparent']]} />
          </Row>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {PRESETS.map(([n, p]) => (
              <Btn key={n} onClick={() => set(p)}>{n}</Btn>
            ))}
          </div>
        </Panel>
        <Panel title="Web app manifest">
          <Row>
            <Txt label="App name" value={s.name} onChange={(name) => set({ name })} />
            <Txt label="Short name" value={s.short} onChange={(short) => set({ short })} />
          </Row>
          <Row>
            <label className="k-field">
              <span className="k-label">Theme colour</span>
              <input type="color" value={s.theme} onChange={(e) => set({ theme: e.target.value })} style={{ height: 36, width: 64 }} />
            </label>
            <Txt label="Icons folder (URL path)" value={s.path} onChange={(path) => set({ path })} />
          </Row>
        </Panel>
      </div>
      <div>
        <Panel title="Preview" actions={<><Btn onClick={() => void icoOnly()}>⬇ favicon.ico</Btn><Btn kind="primary" onClick={() => void zip()}>⬇ Full set (.zip)</Btn></>}>
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <Canvas draw={draw(512)} size={512} css={140} />
            {[180, 48, 32, 16].map((n) => (
              <div key={n} style={{ textAlign: 'center' }}>
                <Canvas draw={draw(n)} size={n} css={Math.min(n, 72)} />
                <div className="muted" style={{ fontSize: 11 }}>{n}px</div>
              </div>
            ))}
            <div style={{ textAlign: 'center' }}>
              <Canvas draw={draw(16)} size={16} css={64} />
              <div className="muted" style={{ fontSize: 11 }}>16px × 4 zoom</div>
            </div>
          </div>
          {zipInfo && <Note tone="ok">Downloaded favicons.zip — {zipInfo}.</Note>}
          {/* browser tab mock-ups */}
          {(['#dee1e6', '#202124'] as const).map((bar, k) => (
            <div key={bar} style={{ background: bar, borderRadius: 10, padding: '8px 8px 0', marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: k ? '#35363a' : '#fff', color: k ? '#e8eaed' : '#202124', padding: '8px 14px', borderRadius: '8px 8px 0 0', fontSize: 13, minWidth: 0, maxWidth: 240 }}>
                  <Canvas draw={draw(32)} size={32} css={16} />
                  <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{s.name} — Home</span>
                  <span style={{ opacity: 0.6 }}>✕</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: k ? '#9aa0a6' : '#5f6368', padding: '8px 14px', fontSize: 13 }}>
                  <span style={{ width: 16, height: 16, borderRadius: 4, background: k ? '#5f6368' : '#bdc1c6', display: 'inline-block' }} /> Other tab
                </div>
              </div>
            </div>
          ))}
          <div style={{ marginTop: 12, borderRadius: 14, padding: 16, background: 'linear-gradient(160deg,#1e3a8a,#7c3aed)', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            {['Phone', 'Mail', s.short || s.name, 'Maps'].map((n, i) => (
              <div key={n + i} style={{ textAlign: 'center', color: '#fff', fontSize: 11, width: 64 }}>
                {i === 2 ? (
                  <div style={{ width: 60, height: 60, borderRadius: 14, overflow: 'hidden', margin: '0 auto' }}><Canvas draw={draw(180)} size={180} css={60} /></div>
                ) : (
                  <div style={{ width: 60, height: 60, borderRadius: 14, background: ['#22c55e', '#3b82f6', '', '#f59e0b'][i], margin: '0 auto', opacity: 0.85 }} />
                )}
                <div style={{ marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</div>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>The home-screen preview uses apple-touch-icon.png (iOS masks it to a rounded square itself, so a square background is fine).</p>
        </Panel>
        <Panel title="HTML for your <head>" actions={<CopyButton text={snippet} />}>
          <Area value={snippet} onChange={() => {}} rows={7} mono />
        </Panel>
        <Panel title="What's in the zip">
          <Table
            head={['File', 'Size', 'Used for']}
            rows={[
              ['favicon.ico', ICO_SIZES.map((n) => `${n}`).join(' + ') + ' px', 'Legacy browsers, /favicon.ico requests'],
              ...PNG_TARGETS.map((t) => [t.file, `${t.size} px`, t.purpose]),
              ['site.webmanifest', 'JSON', 'PWA name, colours, icons'],
              ['favicon-snippet.html', 'HTML', 'Tags to paste into <head>'],
            ]}
          />
        </Panel>
      </div>
    </Split>
  )
}
