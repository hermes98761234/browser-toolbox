import { useEffect, useRef, useState } from 'react'
import { Area, Btn, Check, FileDrop, JsonButtons, Note, Panel, Row, Seg, Select, Slider, Split, Txt, uid, useToolState } from '../kit'
import { makeZip } from './lib/image-compressor'
import { avatarHue, fitText, initials, joinWords, parseQuote, starFills, starPoints } from './lib/testimonial-card-maker'

interface Quote { id: string; text: string; name: string; role: string; rating: number; source: string; avatar: string }
interface Theme { bg: [string, string]; ink: string; muted: string; accent: string; panel?: string; align: 'left' | 'center'; mark: boolean; top: boolean }

const THEMES: Record<string, Theme> = {
  Clean: { bg: ['#ffffff', '#f1f5f9'], ink: '#0f172a', muted: '#64748b', accent: '#4f46e5', align: 'left', mark: true, top: false },
  Midnight: { bg: ['#0f172a', '#1e293b'], ink: '#f8fafc', muted: '#94a3b8', accent: '#facc15', align: 'left', mark: true, top: false },
  Gradient: { bg: ['#7c3aed', '#db2777'], ink: '#ffffff', muted: '#f5d0fe', accent: '#fde047', align: 'center', mark: false, top: false },
  Card: { bg: ['#dbeafe', '#e0e7ff'], ink: '#1e293b', muted: '#64748b', accent: '#2563eb', panel: '#ffffff', align: 'center', mark: false, top: false },
  'Bold quote': { bg: ['#059669', '#047857'], ink: '#ffffff', muted: '#a7f3d0', accent: '#fef08a', align: 'left', mark: true, top: false },
  'Social post': { bg: ['#f1f5f9', '#e2e8f0'], ink: '#0f172a', muted: '#64748b', accent: '#0ea5e9', panel: '#ffffff', align: 'left', mark: false, top: true },
}
const SIZES: [string, string, number, number][] = [['square', 'Square 1080×1080 (Instagram)', 1080, 1080], ['portrait', 'Portrait 1080×1350', 1080, 1350], ['og', 'Link preview 1200×630', 1200, 630], ['story', 'Story 1080×1920', 1080, 1920], ['linkedin', 'LinkedIn 1200×627', 1200, 627]]
const FONTS: [string, string][] = [['system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', 'Sans (system)'], ['Georgia, "Times New Roman", serif', 'Serif (Georgia)'], ['"Trebuchet MS", "Gill Sans", sans-serif', 'Humanist (Trebuchet)'], ['ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif', 'Rounded'], ['ui-monospace, Menlo, Consolas, monospace', 'Mono']]
const DEF = {
  quotes: [
    { id: 'q1', text: 'We replaced three spreadsheets with one dashboard and *closed the books four days faster*. Onboarding took a single afternoon.', name: 'Priya Raman', role: 'Finance Lead, Northwind Labs', rating: 5, source: 'via G2', avatar: '' },
    { id: 'q2', text: 'Support answered in minutes, not days. *Our churn dropped by a third* after switching.', name: 'Marco Bellini', role: 'Head of CX, Brightside', rating: 4.5, source: 'Capterra review', avatar: '' },
    { id: 'q3', text: 'Honestly the *easiest tool our team has adopted* this year.', name: 'Jo Okonkwo', role: 'Product Designer', rating: 5, source: '', avatar: '' },
  ] as Quote[],
  theme: 'Card', size: 'square', font: FONTS[0][0], accent: '', bg: '', highlight: 'color' as 'color' | 'marker', stars: true, scale: 2, fmt: 'image/png', logo: '', brand: 'Northwind', cur: 'q1',
}
type S = typeof DEF

const loadImg = (src: string) => new Promise<HTMLImageElement | null>((r) => { if (!src) return r(null); const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src })

/** Shrinks an uploaded image to a small data URL so it can live in localStorage. */
async function shrink(f: File, max: number, type: string): Promise<string> {
  const bmp = await createImageBitmap(f)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return c.toDataURL(type, 0.85)
}

function draw(c: HTMLCanvasElement, q: Quote, s: S, scale: number, imgs: { avatar: HTMLImageElement | null; logo: HTMLImageElement | null }) {
  const [, , W0, H0] = SIZES.find((x) => x[0] === s.size) ?? SIZES[0]
  c.width = W0 * scale
  c.height = H0 * scale
  const g = c.getContext('2d')!
  g.setTransform(scale, 0, 0, scale, 0, 0)
  const W = W0, H = H0, u = Math.min(W, H) / 1080
  const t = { ...THEMES[s.theme] ?? THEMES.Clean }
  if (s.accent) t.accent = s.accent
  const bg = s.bg ? [s.bg, s.bg] : t.bg
  const gr = g.createLinearGradient(0, 0, W, H)
  gr.addColorStop(0, bg[0])
  gr.addColorStop(1, bg[1])
  g.fillStyle = gr
  g.fillRect(0, 0, W, H)
  let x0 = 0, y0 = 0, w = W, h = H
  if (t.panel) {
    const m = 70 * u
    x0 = m; y0 = m; w = W - 2 * m; h = H - 2 * m
    g.save()
    g.shadowColor = 'rgba(15,23,42,.18)'
    g.shadowBlur = 50 * u
    g.shadowOffsetY = 16 * u
    g.fillStyle = t.panel
    g.beginPath()
    g.roundRect(x0, y0, w, h, 36 * u)
    g.fill()
    g.restore()
  }
  const P = (t.panel ? 64 : 90) * u
  const L = x0 + P, R = x0 + w - P, cx = (L + R) / 2
  const centre = t.align === 'center'
  let top = y0 + P
  const font = (wt: number, fs: number) => `${wt} ${fs}px ${s.font}`
  const avatarR = 46 * u
  const drawAvatar = (ax: number, ay: number) => {
    g.save()
    g.beginPath()
    g.arc(ax, ay, avatarR, 0, 7)
    g.clip()
    if (imgs.avatar) {
      const a = imgs.avatar, k = Math.max((2 * avatarR) / a.width, (2 * avatarR) / a.height)
      g.drawImage(a, ax - (a.width * k) / 2, ay - (a.height * k) / 2, a.width * k, a.height * k)
    } else {
      g.fillStyle = `hsl(${avatarHue(q.name)} 60% 52%)`
      g.fillRect(ax - avatarR, ay - avatarR, 2 * avatarR, 2 * avatarR)
      g.fillStyle = '#fff'
      g.font = font(700, 36 * u)
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(initials(q.name), ax, ay + 2 * u)
    }
    g.restore()
  }
  const drawPerson = (ax: number, ay: number, align: 'left' | 'center') => {
    g.textBaseline = 'alphabetic'
    if (align === 'center') {
      drawAvatar(cx, ay)
      g.textAlign = 'center'
      g.fillStyle = t.ink
      g.font = font(700, 32 * u)
      g.fillText(q.name, cx, ay + avatarR + 46 * u, R - L)
      g.fillStyle = t.muted
      g.font = font(400, 25 * u)
      g.fillText([q.role, q.source].filter(Boolean).join(' · '), cx, ay + avatarR + 82 * u, R - L)
    } else {
      drawAvatar(ax + avatarR, ay)
      g.textAlign = 'left'
      g.fillStyle = t.ink
      g.font = font(700, 32 * u)
      g.fillText(q.name, ax + avatarR * 2 + 22 * u, ay - 4 * u, R - ax - avatarR * 2 - 160 * u)
      g.fillStyle = t.muted
      g.font = font(400, 25 * u)
      g.fillText([q.role, q.source].filter(Boolean).join(' · '), ax + avatarR * 2 + 22 * u, ay + 30 * u, R - ax - avatarR * 2 - 160 * u)
    }
  }
  const drawStars = (sx: number, sy: number, align: 'left' | 'center') => {
    const r = 22 * u, gap = 52 * u
    const start = align === 'center' ? cx - 2 * gap : sx + r
    starFills(q.rating).forEach((f, i) => {
      const pts = starPoints(start + i * gap, sy, r)
      const path = new Path2D()
      pts.forEach(([px, py], k) => (k ? path.lineTo(px, py) : path.moveTo(px, py)))
      path.closePath()
      g.fillStyle = 'rgba(148,163,184,.45)'
      g.fill(path)
      if (f > 0) {
        g.save()
        g.beginPath()
        g.rect(start + i * gap - r, sy - r, 2 * r * f, 2 * r)
        g.clip()
        g.fillStyle = '#f5b301'
        g.fill(path)
        g.restore()
      }
    })
  }
  if (t.top) {
    drawPerson(L, top + avatarR, 'left')
    top += avatarR * 2 + 36 * u
  }
  if (t.mark && !t.top) {
    g.fillStyle = t.accent
    g.globalAlpha = 0.9
    g.font = `700 ${200 * u}px Georgia, serif`
    g.textAlign = centre ? 'center' : 'left'
    g.textBaseline = 'top'
    g.fillText('“', centre ? cx : L - 8 * u, top - 30 * u)
    g.globalAlpha = 1
    top += 120 * u
  }
  if (s.stars && q.rating > 0 && !t.top) {
    drawStars(L, top + 22 * u, centre ? 'center' : 'left')
    top += 80 * u
  }
  const footer = t.top ? (s.stars && q.rating > 0 ? 90 * u : 20 * u) + (s.logo || s.brand ? 60 * u : 0) : (centre ? 190 : 130) * u
  const bottom = y0 + h - P - footer
  const words = parseQuote(q.text || ' ')
  const fit = fitText(words, R - L, bottom - top, 1.32, 20 * u, 78 * u, (fs) => { g.font = font(600, fs); return (x) => g.measureText(x).width })
  g.font = font(600, fit.fs)
  g.textBaseline = 'alphabetic'
  g.textAlign = 'left'
  const lh = fit.fs * 1.32
  const blockH = fit.lines.length * lh
  let y = top + (bottom - top - blockH) / 2 + fit.fs
  const space = g.measureText(' ').width
  for (const line of fit.lines) {
    const lw = g.measureText(joinWords(line)).width
    let x = centre ? cx - lw / 2 : L
    for (const wd of line) {
      if (wd.glue) x -= space
      const ww = g.measureText(wd.text).width
      if (wd.hl && s.highlight === 'marker') {
        g.fillStyle = t.accent
        g.globalAlpha = 0.35
        g.fillRect(x - 3 * u, y - fit.fs * 0.78, ww + space + 6 * u, fit.fs * 1.02)
        g.globalAlpha = 1
      }
      g.fillStyle = wd.hl && s.highlight === 'color' ? t.accent : t.ink
      g.fillText(wd.text, x, y)
      x += ww + space
    }
    y += lh
  }
  const fy = y0 + h - P
  if (t.top) {
    if (s.stars && q.rating > 0) drawStars(L, bottom + 50 * u, 'left')
  } else drawPerson(L, centre ? fy - 130 * u : fy - avatarR, centre ? 'center' : 'left')
  // Brand: logo image or wordmark in the corner.
  const bx = R, by = t.top ? fy - 20 * u : centre ? y0 + P - 10 * u : fy - avatarR
  if (imgs.logo) {
    const lgH = 52 * u, lgW = Math.min(220 * u, (imgs.logo.width / imgs.logo.height) * lgH)
    g.drawImage(imgs.logo, bx - lgW, centre && !t.top ? by : by - lgH / 2, lgW, (lgW / imgs.logo.width) * imgs.logo.height)
  } else if (s.brand) {
    g.fillStyle = t.muted
    g.font = font(800, 28 * u)
    g.textAlign = 'right'
    g.textBaseline = centre && !t.top ? 'top' : 'middle'
    g.fillText(s.brand, bx, by)
  }
}

export default function TestimonialCardMaker() {
  const [s, set, reset] = useToolState('testimonial-card-maker', DEF)
  const view = useRef<HTMLCanvasElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const q = s.quotes.find((x) => x.id === s.cur) ?? s.quotes[0]
  const edit = (p: Partial<Quote>) => q && set({ quotes: s.quotes.map((x) => (x.id === q.id ? { ...x, ...p } : x)) })

  useEffect(() => {
    let live = true
    void (async () => {
      const [avatar, logo] = await Promise.all([loadImg(q?.avatar ?? ''), loadImg(s.logo)])
      if (live && view.current && q) draw(view.current, q, s, 1, { avatar, logo })
    })()
    return () => { live = false }
  }, [q, s])

  const render = async (x: Quote) => {
    const c = document.createElement('canvas')
    draw(c, x, s, s.scale, { avatar: await loadImg(x.avatar), logo: await loadImg(s.logo) })
    return new Promise<Blob | null>((r) => c.toBlob(r, s.fmt, 0.92))
  }
  const ext = s.fmt === 'image/png' ? 'png' : 'jpg'
  const slug = (x: Quote) => `testimonial-${(x.name || 'card').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${ext}`
  const save = (b: Blob, name: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(b)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  const exportOne = async () => { if (!q) return; const b = await render(q); if (b) save(b, slug(q)) }
  const exportAll = async () => {
    setBusy(true)
    const files = []
    for (const x of s.quotes) {
      const b = await render(x)
      if (b) files.push({ name: slug(x), data: new Uint8Array(await b.arrayBuffer()) })
    }
    save(new Blob([makeZip(files) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), 'testimonials.zip')
    setBusy(false)
  }
  const copy = async () => {
    if (!q) return
    const c = document.createElement('canvas')
    draw(c, q, s, s.scale, { avatar: await loadImg(q.avatar), logo: await loadImg(s.logo) })
    try {
      const b = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': b! })])
      setMsg('PNG copied to the clipboard.')
    } catch {
      setMsg('This browser blocked clipboard images; use Download instead.')
    }
  }
  const [, , W0, H0] = SIZES.find((x) => x[0] === s.size) ?? SIZES[0]

  return (
    <Split wide="right">
      <div>
        <Panel title="Testimonials" actions={<Btn onClick={() => { const id = uid(); set({ quotes: [...s.quotes, { id, text: 'Write the customer’s words here. Wrap the *key result* in asterisks to highlight it.', name: 'Customer Name', role: 'Role, Company', rating: 5, source: '', avatar: '' }], cur: id }) }}>+ Add</Btn>}>
          <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {s.quotes.map((x) => (
              <div key={x.id} style={{ display: 'flex', gap: 6, minWidth: 0 }}>
                <button type="button" className={`k-btn ${x.id === q?.id ? 'primary' : ''}`} style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', display: 'block' }} onClick={() => set({ cur: x.id })}>
                  {'★'.repeat(Math.round(x.rating))} {x.name} — {x.text.replace(/\*/g, '').slice(0, 40)}…
                </button>
                <Btn kind="ghost" title="Remove" disabled={s.quotes.length < 2} onClick={() => set({ quotes: s.quotes.filter((y) => y.id !== x.id) })}>✕</Btn>
              </div>
            ))}
          </div>
        </Panel>
        {q && (
          <Panel title="Content">
            <Area label="Quote (*asterisks* highlight words)" value={q.text} onChange={(text) => edit({ text })} rows={4} />
            {q.text.length > 320 && <Note tone="warn">Long quotes get small text. Under ~200 characters reads best on social cards.</Note>}
            <Row>
              <Txt label="Name" value={q.name} onChange={(name) => edit({ name })} />
              <Txt label="Role / company" value={q.role} onChange={(role) => edit({ role })} />
            </Row>
            <Row>
              <Txt label="Source (optional)" value={q.source} onChange={(source) => edit({ source })} placeholder="via G2, App Store…" />
              <Slider label="Rating" value={q.rating} onChange={(rating) => edit({ rating })} min={0} max={5} step={0.5} show={(v) => (v ? `${v} ★` : 'hidden')} />
            </Row>
            <Row>
              <FileDrop accept="image/*" onFiles={async ([f]) => edit({ avatar: await shrink(f, 240, 'image/jpeg') })} label="Avatar photo" />
              {q.avatar && <Btn kind="ghost" onClick={() => edit({ avatar: '' })}>Use initials</Btn>}
            </Row>
          </Panel>
        )}
        <Panel title="Brand">
          <Row>
            <Txt label="Wordmark (if no logo)" value={s.brand} onChange={(brand) => set({ brand })} />
            <FileDrop accept="image/*" onFiles={async ([f]) => set({ logo: await shrink(f, 480, 'image/png') })} label="Logo (PNG/SVG)" />
          </Row>
          {s.logo && <Btn kind="ghost" onClick={() => set({ logo: '' })}>Remove logo</Btn>}
        </Panel>
      </div>
      <div>
        <Panel title="Design" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 6 }}>
            {Object.entries(THEMES).map(([n, t]) => (
              <button key={n} type="button" className={`k-btn ${n === s.theme ? 'primary' : ''}`} onClick={() => set({ theme: n, accent: '', bg: '' })} style={{ display: 'grid', gap: 4, padding: 6 }}>
                <span style={{ height: 22, borderRadius: 4, background: `linear-gradient(135deg, ${t.bg[0]}, ${t.bg[1]})`, border: '1px solid var(--line)', position: 'relative' }}>
                  <i style={{ position: 'absolute', right: 4, top: 4, width: 12, height: 12, borderRadius: 6, background: t.accent }} />
                </span>
                <span style={{ fontSize: 12 }}>{n}</span>
              </button>
            ))}
          </div>
          <Row>
            <Select label="Size" value={s.size} onChange={(size) => set({ size })} options={SIZES.map(([k, l]) => [k, l] as [string, string])} />
            <Select label="Font" value={s.font} onChange={(font) => set({ font })} options={FONTS} />
          </Row>
          <Row>
            <label className="k-field"><span className="k-label">Accent</span><input type="color" value={s.accent || THEMES[s.theme]?.accent} onChange={(e) => set({ accent: e.target.value })} /></label>
            <label className="k-field"><span className="k-label">Background</span><input type="color" value={s.bg || THEMES[s.theme]?.bg[0]} onChange={(e) => set({ bg: e.target.value })} /></label>
            <div className="k-field"><span className="k-label">Highlight style</span><Seg value={s.highlight} onChange={(highlight) => set({ highlight })} options={[['color', 'Colour'], ['marker', 'Marker']]} /></div>
            <Check label="Stars" value={s.stars} onChange={(stars) => set({ stars })} />
          </Row>
        </Panel>
        <Panel title={`Preview · ${W0}×${H0}`}>
          <canvas ref={view} style={{ width: '100%', maxWidth: Math.min(640, (W0 / H0) * 520), height: 'auto', display: 'block', margin: '0 auto', borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,.12)' }} />
          <Row>
            <Select label="Export scale" value={s.scale} onChange={(scale) => set({ scale })} options={[[1, '1× (exact size)'], [2, '2× retina'], [3, '3×']]} />
            <Select label="Format" value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['image/png', 'PNG'], ['image/jpeg', 'JPEG']]} />
          </Row>
          <Row>
            <Btn kind="primary" onClick={() => void exportOne()}>⬇ Download {ext.toUpperCase()} ({W0 * s.scale}×{H0 * s.scale})</Btn>
            <Btn onClick={() => void exportAll()} disabled={busy || s.quotes.length < 2}>⬇ All {s.quotes.length} as ZIP</Btn>
            <Btn onClick={() => void copy()}>⧉ Copy image</Btn>
            <JsonButtons name="testimonials.json" data={s} onLoad={(d) => set(d)} />
          </Row>
          {msg && <Note tone="ok">{msg}</Note>}
          <p className="muted" style={{ fontSize: 13 }}>Text size adjusts automatically to fill the space. Only publish testimonials you have permission to use, with real names and roles.</p>
        </Panel>
      </div>
    </Split>
  )
}
