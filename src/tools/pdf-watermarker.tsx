import { useEffect, useMemo, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { centers, hexToRgb, originFor, parsePages, sanitize, type Pos } from './lib/pdf-watermarker'

type FontKey = 'HelveticaBold' | 'Helvetica' | 'TimesRomanBold' | 'CourierBold'
interface State {
  mode: 'text' | 'logo'
  text: string
  font: FontKey
  size: number
  color: string
  opacity: number
  rotation: number
  pos: Pos
  margin: number
  gap: number
  box: boolean
  logoScale: number
  pages: string
}
const DEF: State = { mode: 'text', text: 'CONFIDENTIAL', font: 'HelveticaBold', size: 72, color: '#dc2626', opacity: 0.25, rotation: 45, pos: 'center', margin: 36, gap: 60, box: false, logoScale: 35, pages: 'all' }

const FONTS: [FontKey, string, string][] = [
  ['HelveticaBold', 'Helvetica Bold', 'bold {s}px Helvetica, Arial, sans-serif'],
  ['Helvetica', 'Helvetica', '{s}px Helvetica, Arial, sans-serif'],
  ['TimesRomanBold', 'Times Bold', 'bold {s}px "Times New Roman", Times, serif'],
  ['CourierBold', 'Courier Bold', 'bold {s}px "Courier New", Courier, monospace'],
]
const PRESETS = ['CONFIDENTIAL', 'DRAFT', 'COPY', 'SAMPLE', 'DO NOT COPY', 'PAID', 'Copy for {file} · {date} · p. {page}/{total}']
const COLORS = ['#dc2626', '#6b7280', '#2563eb', '#16a34a', '#000000']
const POS: [Pos, string][] = [['center', 'Center'], ['tile', 'Tiled'], ['top', 'Top'], ['bottom', 'Bottom'], ['top-left', 'Top left'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right']]

interface Doc { name: string; bytes: Uint8Array; sizes: [number, number][] }
interface Logo { bytes: Uint8Array; url: string; w: number; h: number; png: boolean; name: string }

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`)
const blob = (b: Uint8Array, type: string) => new Blob([b as Uint8Array<ArrayBuffer>], { type })
const fill = (t: string, page: number, total: number, file: string) =>
  t.replace(/\{page\}/g, String(page)).replace(/\{total\}/g, String(total)).replace(/\{date\}/g, new Date().toISOString().slice(0, 10)).replace(/\{file\}/g, file.replace(/\.pdf$/i, ''))

let ctx: CanvasRenderingContext2D | null = null
const measure = (text: string, font: FontKey, size: number) => {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return text.length * size * 0.6
  ctx.font = FONTS.find((f) => f[0] === font)![2].replace('{s}', String(size))
  return ctx.measureText(text).width
}

async function makeSample(): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const titles = ['Quarterly Report', 'Revenue overview', 'Customer growth', 'Outlook', 'Wide appendix']
  titles.forEach((t, i) => {
    const [w, h] = i === 4 ? [841.89, 595.28] : [595.28, 841.89]
    const p = doc.addPage([w, h])
    p.drawText(t, { x: 50, y: h - 80, size: 26, font: bold, color: rgb(0.1, 0.12, 0.2) })
    p.drawLine({ start: { x: 50, y: h - 95 }, end: { x: w - 50, y: h - 95 }, thickness: 1.5, color: rgb(0.39, 0.4, 0.95) })
    for (let l = 0; l < 26; l++) p.drawRectangle({ x: 50, y: h - 130 - l * 20, width: (w - 100) * (0.5 + ((l * 31 + i * 7) % 50) / 100), height: 7, color: rgb(0.83, 0.85, 0.9) })
    p.drawText(`Page ${i + 1} of ${titles.length}`, { x: w / 2 - 30, y: 30, size: 10, font: reg, color: rgb(0.45, 0.45, 0.5) })
  })
  return doc.save()
}

async function loadDoc(name: string, bytes: Uint8Array): Promise<Doc> {
  const { PDFDocument } = await import('pdf-lib')
  const d = await PDFDocument.load(bytes, { ignoreEncryption: true })
  return { name, bytes, sizes: d.getPages().map((p) => [p.getWidth(), p.getHeight()]) }
}

async function sampleLogo(): Promise<Logo | null> {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  if (!g) return null
  g.strokeStyle = '#2563eb'
  g.lineWidth = 14
  g.beginPath()
  g.arc(128, 128, 112, 0, Math.PI * 2)
  g.stroke()
  g.fillStyle = '#2563eb'
  g.font = 'bold 64px Arial, sans-serif'
  g.textAlign = 'center'
  g.fillText('ACME', 128, 120)
  g.font = 'bold 30px Arial, sans-serif'
  g.fillText('APPROVED', 128, 168)
  const url = c.toDataURL('image/png')
  const bytes = Uint8Array.from(atob(url.split(',')[1]), (ch) => ch.charCodeAt(0))
  return { bytes, url, w: 256, h: 256, png: true, name: 'sample-logo.png' }
}

export default function PdfWatermarker() {
  const [s, set, reset] = useToolState('pdf-watermarker', DEF)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [logo, setLogo] = useState<Logo | null>(null)
  const [view, setView] = useState(0)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<{ size: number; pages: number } | null>(null)

  useEffect(() => {
    let live = true
    void makeSample().then((b) => loadDoc('quarterly-report.pdf', b)).then((d) => live && setDoc((cur) => cur ?? d))
    void sampleLogo().then((l) => live && setLogo((cur) => cur ?? l))
    return () => { live = false }
  }, [])

  const total = doc?.sizes.length ?? 0
  const sel = useMemo(() => parsePages(s.pages, Math.max(1, total)), [s.pages, total])
  const clean = sanitize(s.text)
  const page = Math.min(view, Math.max(0, total - 1))
  const [pw, ph] = doc?.sizes[page] ?? [595, 842]
  const previewText = fill(clean.text, page + 1, total, doc?.name ?? '')
  const tw = measure(previewText, s.font, s.size)
  const th = s.size * 0.72
  const lw = (pw * s.logoScale) / 100
  const lh = logo ? (lw * logo.h) / logo.w : lw
  const [bw, bh] = s.mode === 'text' ? [tw, th] : [lw, lh]
  const spots = centers(pw, ph, bw, bh, s.rotation, s.pos, s.margin, s.gap)
  const onPage = sel.pages.includes(page + 1)

  const openPdf = async (f: File) => {
    setErr('')
    setOut(null)
    try {
      setDoc(await loadDoc(f.name, new Uint8Array(await f.arrayBuffer())))
      setView(0)
    } catch (e) {
      setErr(`Could not read "${f.name}": ${(e as Error).message}`)
    }
  }
  const openLogo = async (f: File) => {
    if (!/image\/(png|jpe?g)/.test(f.type)) return setErr('Logo must be a PNG or JPEG image.')
    const bytes = new Uint8Array(await f.arrayBuffer())
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => setLogo({ bytes, url, w: img.naturalWidth, h: img.naturalHeight, png: f.type === 'image/png', name: f.name })
    img.src = url
    set({ mode: 'logo' })
  }

  const apply = async () => {
    if (!doc || sel.error) return
    setBusy(true)
    setErr('')
    try {
      const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib')
      const pdf = await PDFDocument.load(doc.bytes, { ignoreEncryption: true })
      const font = await pdf.embedFont(StandardFonts[s.font])
      const img = s.mode === 'logo' && logo ? await (logo.png ? pdf.embedPng(logo.bytes) : pdf.embedJpg(logo.bytes)) : null
      const [r, g, b] = hexToRgb(s.color)
      const col = rgb(r, g, b)
      const pages = pdf.getPages()
      for (const n of sel.pages) {
        const p = pages[n - 1]
        const { width: W, height: H } = p.getSize()
        if (img) {
          const w = (W * s.logoScale) / 100, h = (w * img.height) / img.width
          for (const [cx, cy] of centers(W, H, w, h, s.rotation, s.pos, s.margin, s.gap)) {
            const [x, y] = originFor(cx, cy, w, h, s.rotation)
            p.drawImage(img, { x, y, width: w, height: h, rotate: degrees(s.rotation), opacity: s.opacity })
          }
        } else {
          const t = fill(clean.text, n, pages.length, doc.name)
          const w = font.widthOfTextAtSize(t, s.size)
          const h = s.size * 0.72
          for (const [cx, cy] of centers(W, H, w, h, s.rotation, s.pos, s.margin, s.gap)) {
            const [x, y] = originFor(cx, cy, w, h, s.rotation)
            p.drawText(t, { x, y, size: s.size, font, color: col, rotate: degrees(s.rotation), opacity: s.opacity })
            if (s.box) {
              const pad = s.size * 0.25
              const [bx, by] = originFor(cx, cy, w + pad * 2, h + pad * 2, s.rotation)
              p.drawRectangle({ x: bx, y: by, width: w + pad * 2, height: h + pad * 2, rotate: degrees(s.rotation), borderColor: col, borderWidth: Math.max(1, s.size / 16), borderOpacity: s.opacity })
            }
          }
        }
      }
      pdf.setProducer('Browser Toolbox PDF Watermarker')
      const bytes = await pdf.save()
      download(doc.name.replace(/\.pdf$/i, '') + '-watermarked.pdf', blob(bytes, 'application/pdf'))
      setOut({ size: bytes.length, pages: sel.pages.length })
    } catch (e) {
      setErr(`Watermarking failed: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const fam = FONTS.find((f) => f[0] === s.font)![2]
  const scale = 420 / Math.max(pw, ph)

  return (
    <Split wide="right">
      <div>
        <Panel title="1 · PDF" actions={<Btn kind="ghost" onClick={() => void makeSample().then((b) => loadDoc('quarterly-report.pdf', b)).then(setDoc)}>Sample</Btn>}>
          <FileDrop accept="application/pdf,.pdf" onFiles={(f) => void openPdf(f[0])} label="Drop a PDF here or click to choose" />
          {doc && <p className="muted" style={{ margin: '8px 0 0' }}><b>{doc.name}</b> · {total} pages · {kb(doc.bytes.length)}</p>}
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="2 · Watermark" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['text', 'Text'], ['logo', 'Logo image']]} label="Watermark type" />
          <div style={{ marginTop: 10 }}>
            {s.mode === 'text' ? (
              <>
                <Txt label="Text" value={s.text} onChange={(text) => set({ text })} hint="Tokens: {page} {total} {date} {file}" />
                <Row>
                  {PRESETS.map((p) => <Btn key={p} kind="ghost" onClick={() => set({ text: p, ...(p.includes('{') ? { size: 14, rotation: 0, pos: 'bottom' as Pos, opacity: 0.7, color: '#6b7280' } : {}) })}>{p.includes('{') ? 'Personal copy' : p}</Btn>)}
                </Row>
                {clean.changed.length > 0 && (
                  <Note tone="warn">
                    Standard PDF fonts only cover Latin characters, so {clean.changed.slice(0, 8).join(' ')} {clean.changed.length > 8 ? '…' : ''} will be written as “{clean.text}”. Cyrillic and Greek are transliterated; other scripts become “?”.
                  </Note>
                )}
                <Row>
                  <Select label="Font" value={s.font} onChange={(font) => set({ font })} options={FONTS.map(([k, l]) => [k, l] as [FontKey, string])} />
                  <Num label="Size" value={s.size} onChange={(size) => set({ size })} min={4} max={400} unit="pt" />
                </Row>
                <div className="k-field">
                  <span className="k-label">Colour</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="color" aria-label="Custom colour" value={s.color} onChange={(e) => set({ color: e.target.value })} style={{ width: 44, height: 32 }} />
                    {COLORS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => set({ color: c })} style={{ width: 24, height: 24, borderRadius: 12, background: c, cursor: 'pointer', border: s.color === c ? '3px solid var(--accent)' : '1px solid var(--line)' }} />)}
                  </div>
                </div>
                <Check label="Draw a stamp box around the text" value={s.box} onChange={(box) => set({ box })} />
              </>
            ) : (
              <>
                <FileDrop accept="image/png,image/jpeg" onFiles={(f) => void openLogo(f[0])} label="Drop a PNG (transparent works best) or JPEG logo" />
                {logo && <p className="muted" style={{ display: 'flex', gap: 10, alignItems: 'center' }}><img src={logo.url} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} /> {logo.name} · {logo.w}×{logo.h}px</p>}
                <Slider label="Logo width" value={s.logoScale} onChange={(logoScale) => set({ logoScale })} min={5} max={100} unit="% of page" show={(v) => String(v)} />
              </>
            )}
          </div>
          <Slider label="Opacity" value={s.opacity} onChange={(opacity) => set({ opacity })} min={0.05} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />
          <Slider label="Rotation" value={s.rotation} onChange={(rotation) => set({ rotation })} min={-90} max={90} step={5} unit="°" show={(v) => String(v)} />
          <Row>{[0, 45, -45, 90].map((r) => <Btn key={r} kind="ghost" onClick={() => set({ rotation: r })}>{r}°</Btn>)}</Row>
        </Panel>
        <Panel title="3 · Placement">
          <Select label="Position" value={s.pos} onChange={(pos) => set({ pos })} options={POS} />
          <Row>
            <Num label="Edge margin" value={s.margin} onChange={(margin) => set({ margin })} min={0} unit="pt" />
            {s.pos === 'tile' && <Num label="Tile gap" value={s.gap} onChange={(gap) => set({ gap })} min={0} unit="pt" />}
          </Row>
          <Txt label="Pages" value={s.pages} onChange={(pages) => set({ pages })} hint="all, odd, even, 1-3, 5, 8-" />
          {sel.error && <Note tone="err">{sel.error}</Note>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Pages in PDF" value={total} />
          <Stat label="Pages stamped" value={sel.error ? '—' : sel.pages.length} tone="accent" />
          <Stat label="Copies per page" value={spots.length} sub={s.pos === 'tile' ? 'tiled grid' : s.pos} />
          <Stat label="Output" value={out ? kb(out.size) : '—'} sub={out ? `${out.pages} pages stamped` : 'press Apply'} tone={out ? 'good' : undefined} />
        </Stats>
        <Panel title={`Preview · page ${page + 1}${onPage ? '' : ' (not selected)'}`} actions={<Btn kind="primary" onClick={() => void apply()} disabled={!doc || busy || !!sel.error || (s.mode === 'logo' && !logo)}>{busy ? 'Working…' : '⬇ Apply & download'}</Btn>}>
          <div style={{ display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--muted) 12%, transparent)', borderRadius: 8, padding: 14 }}>
            <svg viewBox={`0 0 ${pw} ${ph}`} width={pw * scale} height={ph * scale} style={{ maxWidth: '100%', height: 'auto', background: '#fff', boxShadow: '0 2px 10px rgba(0,0,0,.18)' }} role="img" aria-label="Page preview">
              <rect x={50} y={60} width={pw * 0.45} height={16} fill="#1a1f33" />
              <line x1={50} x2={pw - 50} y1={95} y2={95} stroke="#6366f1" strokeWidth={1.5} />
              {Array.from({ length: Math.floor((ph - 170) / 20) }, (_, l) => <rect key={l} x={50} y={125 + l * 20} width={(pw - 100) * (0.5 + ((l * 31 + page * 7) % 50) / 100)} height={7} fill="#d4d8e5" />)}
              <defs><clipPath id="wm-page"><rect width={pw} height={ph} /></clipPath></defs>
              {onPage && (
                <g clipPath="url(#wm-page)" opacity={s.opacity}>
                  {spots.map(([cx, cy], i) => (
                    <g key={i} transform={`translate(${cx} ${ph - cy}) rotate(${-s.rotation})`}>
                      {s.mode === 'logo' && logo ? (
                        <image href={logo.url} x={-lw / 2} y={-lh / 2} width={lw} height={lh} />
                      ) : (
                        <>
                          <text x={-tw / 2} y={th / 2} fill={s.color} style={{ font: fam.replace('{s}', String(s.size)) }}>{previewText}</text>
                          {s.box && <rect x={-tw / 2 - s.size * 0.25} y={-th / 2 - s.size * 0.25} width={tw + s.size * 0.5} height={th + s.size * 0.5} fill="none" stroke={s.color} strokeWidth={Math.max(1, s.size / 16)} />}
                        </>
                      )}
                    </g>
                  ))}
                </g>
              )}
            </svg>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {doc?.sizes.map(([w, h], i) => (
              <button key={i} type="button" onClick={() => setView(i)} title={`Page ${i + 1}: ${Math.round(w)}×${Math.round(h)} pt`}
                style={{ width: (w / Math.max(w, h)) * 44, height: (h / Math.max(w, h)) * 44, borderRadius: 3, font: 'inherit', fontSize: 12, padding: 0, cursor: 'pointer', color: 'inherit',
                  border: `2px solid ${i === page ? 'var(--accent)' : 'var(--line)'}`, background: sel.pages.includes(i + 1) ? `color-mix(in srgb, ${s.color} 18%, var(--panel))` : 'var(--panel)' }}>
                {i + 1}
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Tinted thumbnails are the pages that get the watermark. The page body in the preview is schematic; your real content stays untouched.</p>
        </Panel>
        <Note tone="ok">Everything runs in your browser; the PDF never leaves your device. The watermark is drawn on top of the page content with transparency, so text underneath stays readable and selectable.</Note>
      </div>
    </Split>
  )
}
