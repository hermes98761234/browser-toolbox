import { useState } from 'react'
import { Area, Btn, CopyButton, download, FileDrop, JsonButtons, Note, Num, Panel, Row, Select, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { cmyk, cssTokens, jsonTokens, pairs, textOn, type BrandColor } from './lib/brand-kit-builder'
import { fmtHsl, fmtRgb, hexToRgb } from './lib/palette-generator'
import { sanitize } from './lib/pdf-watermarker'

interface Logo { id: string; label: string; url: string; bg: 'light' | 'dark' }
interface State {
  brand: string; tagline: string; logos: Logo[]; colors: BrandColor[]; heading: string; body: string; headingWeight: number
  clear: number; minSize: number; notes: string; tokens: 'css' | 'json'
}

const svgLogo = (fg: string, accent: string) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160" viewBox="0 0 480 160"><circle cx="80" cy="80" r="56" fill="none" stroke="${accent}" stroke-width="14"/><path d="M58 108V52l44 56V52" fill="none" stroke="${fg}" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/><text x="160" y="92" font-family="Georgia, serif" font-size="58" font-weight="700" fill="${fg}">Northwind</text><text x="163" y="126" font-family="Verdana, sans-serif" font-size="20" letter-spacing="8" fill="${accent}">TRAVEL CO.</text></svg>`)

const FONTS: [string, string][] = [
  ['system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', 'System sans'],
  ['Georgia, "Times New Roman", serif', 'Georgia (serif)'],
  ['"Palatino Linotype", Palatino, "Book Antiqua", serif', 'Palatino (serif)'],
  ['"Trebuchet MS", "Lucida Grande", sans-serif', 'Trebuchet (humanist sans)'],
  ['Verdana, Geneva, sans-serif', 'Verdana (wide sans)'],
  ['Tahoma, "Segoe UI", sans-serif', 'Tahoma'],
  ['"Courier New", ui-monospace, monospace', 'Courier (mono)'],
  ['Impact, "Arial Black", sans-serif', 'Impact (display)'],
]
const ROLES: BrandColor['role'][] = ['primary', 'secondary', 'accent', 'neutral']

const DEF: State = {
  brand: 'Northwind Travel Co.', tagline: 'Slow journeys, well planned.',
  logos: [
    { id: 'l1', label: 'Primary logo', url: svgLogo('#12304a', '#e0703a'), bg: 'light' },
    { id: 'l2', label: 'Reversed logo', url: svgLogo('#ffffff', '#f4a26c'), bg: 'dark' },
  ],
  colors: [
    { id: 'c1', name: 'Harbor Navy', hex: '#12304a', role: 'primary' },
    { id: 'c2', name: 'Ember Orange', hex: '#e0703a', role: 'secondary' },
    { id: 'c3', name: 'Sea Glass', hex: '#7cc4b5', role: 'accent' },
    { id: 'c4', name: 'Sand', hex: '#f3ead8', role: 'neutral' },
    { id: 'c5', name: 'Ink', hex: '#1b1f24', role: 'neutral' },
  ],
  heading: FONTS[1][0], body: FONTS[3][0], headingWeight: 700, clear: 1, minSize: 120,
  notes: 'Keep clear space around the logo equal to the height of the "N" mark.\nNever stretch, rotate or recolor the logo outside the palette.\nUse Ember Orange for calls to action only, never for body text.\nPlace the reversed logo on Harbor Navy or photos darker than 40% grey.',
  tokens: 'css',
}

const fontName = (stack: string) => FONTS.find((f) => f[0] === stack)?.[1] ?? stack.split(',')[0].replace(/"/g, '')

/** Rasterises any image URL to PNG (max side `max`). */
async function toPng(url: string, max = 900): Promise<{ data: string; w: number; h: number }> {
  const img = new Image()
  img.src = url
  await img.decode()
  const k = Math.min(1, max / Math.max(img.naturalWidth || 300, img.naturalHeight || 150))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round((img.naturalWidth || 300) * k))
  c.height = Math.max(1, Math.round((img.naturalHeight || 150) * k))
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return { data: c.toDataURL('image/png'), w: c.width, h: c.height }
}
const b64 = (d: string) => Uint8Array.from(atob(d.split(',')[1]), (ch) => ch.charCodeAt(0))

function specimen(s: State): string {
  const c = document.createElement('canvas')
  c.width = 1046
  c.height = 300
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = s.colors[0]?.hex ?? '#111'
  g.font = `${s.headingWeight} 64px ${s.heading}`
  g.fillText('Aa Bb Cc 123', 0, 70)
  g.font = `${s.headingWeight} 34px ${s.heading}`
  g.fillText(`Heading — ${fontName(s.heading)}`, 0, 130)
  g.fillStyle = '#333333'
  g.font = `24px ${s.body}`
  g.fillText(`Body — ${fontName(s.body)}`, 0, 180)
  g.font = `22px ${s.body}`
  g.fillText('The quick brown fox jumps over the lazy dog. 0123456789', 0, 222)
  g.fillText('Sphinx of black quartz, judge my vow — ÀÉÎÕÜ & ?!', 0, 258)
  return c.toDataURL('image/png')
}

async function buildPdf(s: State): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const W = 595.28, H = 841.89, M = 40
  const col = (hex: string) => { const c = hexToRgb(hex) ?? [0, 0, 0]; return rgb(c[0] / 255, c[1] / 255, c[2] / 255) }
  const T = (t: string) => sanitize(t).text
  let page = doc.addPage([W, H])
  let y = H
  const ensure = (h: number) => {
    if (y - h < M) {
      page = doc.addPage([W, H])
      y = H - M
    }
  }
  const section = (title: string) => {
    ensure(40)
    y -= 26
    page.drawText(T(title).toUpperCase(), { x: M, y, size: 10, font: bold, color: rgb(0.35, 0.38, 0.45) })
    page.drawLine({ start: { x: M, y: y - 5 }, end: { x: W - M, y: y - 5 }, thickness: 0.6, color: rgb(0.85, 0.86, 0.89) })
    y -= 16
  }
  // Header band
  const prim = s.colors[0]?.hex ?? '#222222'
  const on = textOn(prim).text
  page.drawRectangle({ x: 0, y: H - 110, width: W, height: 110, color: col(prim) })
  page.drawText(T(s.brand), { x: M, y: H - 58, size: 28, font: bold, color: col(on) })
  page.drawText(T(s.tagline), { x: M, y: H - 80, size: 12, font, color: col(on), opacity: 0.85 })
  page.drawText('BRAND GUIDELINES', { x: W - M - bold.widthOfTextAtSize('BRAND GUIDELINES', 9), y: H - 30, size: 9, font: bold, color: col(on), opacity: 0.8 })
  y = H - 110
  // Logos
  if (s.logos.length) {
    section('Logo')
    const n = Math.min(3, s.logos.length), gap = 12, bw = (W - 2 * M - gap * (n - 1)) / n, bh = 100
    ensure(bh + 40)
    for (let i = 0; i < n; i++) {
      const L = s.logos[i]
      const x = M + i * (bw + gap)
      page.drawRectangle({ x, y: y - bh, width: bw, height: bh, color: L.bg === 'dark' ? col(prim) : rgb(0.96, 0.96, 0.97), borderColor: rgb(0.86, 0.87, 0.9), borderWidth: 0.5 })
      try {
        const png = await toPng(L.url)
        const im = await doc.embedPng(b64(png.data))
        const k = Math.min((bw - 24) / png.w, (bh - 24) / png.h)
        page.drawImage(im, { x: x + (bw - png.w * k) / 2, y: y - bh + (bh - png.h * k) / 2, width: png.w * k, height: png.h * k })
      } catch { /* skip unreadable image */ }
      page.drawText(T(L.label), { x, y: y - bh - 12, size: 8.5, font, color: rgb(0.4, 0.42, 0.48) })
    }
    y -= bh + 28
    page.drawText(T(`Clear space: at least ${s.clear}x the mark height on every side. Minimum width: ${s.minSize} px on screen / ${Math.round(s.minSize * 0.2646)} mm in print.`), { x: M, y, size: 9, font, color: rgb(0.2, 0.22, 0.27) })
    y -= 6
  }
  // Colours
  section('Color palette')
  const per = 4, gap = 12, sw = (W - 2 * M - gap * (per - 1)) / per
  for (let i = 0; i < s.colors.length; i += per) {
    ensure(128)
    s.colors.slice(i, i + per).forEach((c, j) => {
      const x = M + j * (sw + gap), rgbv = hexToRgb(c.hex) ?? [0, 0, 0]
      const t = textOn(c.hex)
      page.drawRectangle({ x, y: y - 58, width: sw, height: 58, color: col(c.hex), borderColor: rgb(0.86, 0.87, 0.9), borderWidth: 0.5 })
      page.drawText(c.role.toUpperCase(), { x: x + 6, y: y - 14, size: 7, font: bold, color: col(t.text), opacity: 0.8 })
      const lines: [string, boolean][] = [[c.name, true], [c.hex.toUpperCase(), false], [`RGB ${rgbv.join(' ')}`, false], [`CMYK ${cmyk(rgbv).join(' ')}`, false], [`${t.text === '#ffffff' ? 'White' : 'Black'} text ${t.ratio.toFixed(1)}:1`, false]]
      lines.forEach(([txt, b], k) => page.drawText(T(txt), { x, y: y - 72 - k * 11, size: b ? 9 : 8, font: b ? bold : font, color: rgb(0.15, 0.17, 0.2) }))
    })
    y -= 128
  }
  // Typography
  section('Typography')
  ensure(150)
  const spec = await doc.embedPng(b64(specimen(s)))
  const sh = ((W - 2 * M) * 300) / 1046
  page.drawImage(spec, { x: M, y: y - sh, width: W - 2 * M, height: sh })
  y -= sh + 6
  page.drawText(T(`Headings: ${fontName(s.heading)} (weight ${s.headingWeight})   Body: ${fontName(s.body)}`), { x: M, y, size: 8.5, font, color: rgb(0.4, 0.42, 0.48) })
  // Pairs
  const good = pairs(s.colors).filter((p) => p.ratio >= 4.5).slice(0, 8)
  if (good.length) {
    section('Accessible text pairings (WCAG 2)')
    for (let i = 0; i < good.length; i += 2) {
      ensure(30)
      good.slice(i, i + 2).forEach((p, j) => {
        const x = M + j * ((W - 2 * M) / 2)
        page.drawRectangle({ x, y: y - 22, width: 34, height: 22, color: col(p.bg.hex), borderColor: rgb(0.86, 0.87, 0.9), borderWidth: 0.5 })
        page.drawText('Aa', { x: x + 8, y: y - 16, size: 12, font: bold, color: col(p.fg.hex) })
        page.drawText(T(`${p.fg.name} on ${p.bg.name}`), { x: x + 42, y: y - 9, size: 9, font: bold, color: rgb(0.15, 0.17, 0.2) })
        page.drawText(`${p.ratio.toFixed(2)}:1 · ${p.grade}`, { x: x + 42, y: y - 20, size: 8, font, color: rgb(0.4, 0.42, 0.48) })
      })
      y -= 30
    }
  }
  // Notes
  if (s.notes.trim()) {
    section('Usage rules')
    for (const para of s.notes.split('\n').filter((l) => l.trim())) {
      const words = T(para).split(/\s+/)
      let line = '• '
      const flush = () => { ensure(13); page.drawText(line, { x: M, y: y - 10, size: 9.5, font, color: rgb(0.15, 0.17, 0.2) }); y -= 13 }
      for (const w of words) {
        if (font.widthOfTextAtSize(line + w, 9.5) > W - 2 * M) { flush(); line = '   ' }
        line += w + ' '
      }
      flush()
    }
  }
  doc.getPages().forEach((p, i, a) => p.drawText(`${T(s.brand)} · brand guidelines · ${i + 1}/${a.length}`, { x: M, y: 20, size: 7.5, font, color: rgb(0.55, 0.57, 0.62) }))
  return doc.save()
}

export default function BrandKitBuilder() {
  const [s, set, reset] = useToolState('brand-kit-builder', DEF)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ps = pairs(s.colors)
  const passAA = ps.filter((p) => p.ratio >= 4.5).length
  const editC = (id: string, p: Partial<BrandColor>) => set({ colors: s.colors.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  const editL = (id: string, p: Partial<Logo>) => set({ logos: s.logos.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  const tokens = s.tokens === 'css' ? cssTokens(s.brand, s.colors, s.heading, s.body) : jsonTokens(s.colors, s.heading, s.body)
  const addLogos = async (fs: File[]) => {
    setErr('')
    for (const f of fs.slice(0, 4)) {
      try {
        const url = URL.createObjectURL(f)
        const png = await toPng(url, 700)
        URL.revokeObjectURL(url)
        set((st) => ({ ...st, logos: [...st.logos, { id: uid(), label: f.name.replace(/\.[^.]+$/, ''), url: png.data, bg: 'light' as const }].slice(-6) }))
      } catch {
        setErr(`Could not read ${f.name}.`)
      }
    }
  }
  const pdf = async () => {
    setBusy(true)
    try {
      const bytes = await buildPdf(s)
      download(`${s.brand.replace(/[^\w-]+/g, '-').toLowerCase()}-brand-guide.pdf`, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }))
    } catch (e) {
      setErr(`PDF failed: ${(e as Error).message}`)
    }
    setBusy(false)
  }

  return (
    <Split>
      <div>
        <Panel title="Brand">
          <Row>
            <Txt label="Brand name" value={s.brand} onChange={(brand) => set({ brand })} />
            <Txt label="Tagline" value={s.tagline} onChange={(tagline) => set({ tagline })} />
          </Row>
        </Panel>
        <Panel title="Logos">
          <FileDrop accept="image/png,image/svg+xml,image/jpeg,image/webp" multiple onFiles={(fs) => void addLogos(fs)} label="Add logo files (PNG with transparency or SVG)" />
          {err && <Note tone="err">{err}</Note>}
          {s.logos.map((l) => (
            <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <img src={l.url} alt={l.label} style={{ width: 90, height: 40, objectFit: 'contain', background: l.bg === 'dark' ? s.colors[0]?.hex ?? '#222' : '#f4f4f5', borderRadius: 6, padding: 4 }} />
              <input value={l.label} onChange={(e) => editL(l.id, { label: e.target.value })} aria-label="Logo label" style={{ flex: 1, minWidth: 0 }} />
              <select value={l.bg} onChange={(e) => editL(l.id, { bg: e.target.value as Logo['bg'] })} aria-label="Background"><option value="light">on light</option><option value="dark">on primary</option></select>
              <Btn kind="ghost" onClick={() => set({ logos: s.logos.filter((x) => x.id !== l.id) })} title="Remove">✕</Btn>
            </div>
          ))}
          <Row>
            <Num label="Clear space" value={s.clear} onChange={(clear) => set({ clear })} unit="× mark" min={0} step={0.25} />
            <Num label="Minimum width" value={s.minSize} onChange={(minSize) => set({ minSize })} unit="px" min={10} />
          </Row>
        </Panel>
        <Panel title="Colors" actions={<Btn onClick={() => set({ colors: [...s.colors, { id: uid(), name: `Color ${s.colors.length + 1}`, hex: '#888888', role: 'accent' }] })}>+ Color</Btn>}>
          {s.colors.map((c) => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) 84px 96px auto', gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <input type="color" value={hexToRgb(c.hex) ? c.hex : '#000000'} onChange={(e) => editC(c.id, { hex: e.target.value })} aria-label="Pick color" style={{ width: 44, height: 32 }} />
              <input value={c.name} onChange={(e) => editC(c.id, { name: e.target.value })} aria-label="Color name" style={{ minWidth: 0 }} />
              <input value={c.hex} onChange={(e) => editC(c.id, { hex: e.target.value.trim() })} aria-label="Hex" style={{ fontFamily: 'ui-monospace, monospace', minWidth: 0, borderColor: hexToRgb(c.hex) ? undefined : 'var(--err)' }} />
              <select value={c.role} onChange={(e) => editC(c.id, { role: e.target.value as BrandColor['role'] })} aria-label="Role">{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
              <Btn kind="ghost" onClick={() => set({ colors: s.colors.filter((x) => x.id !== c.id) })} title="Remove">✕</Btn>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>The first color is used as the guide's header and the reversed-logo background.</p>
        </Panel>
        <Panel title="Typography">
          <Row>
            <Select label="Heading font" value={s.heading} onChange={(heading) => set({ heading })} options={FONTS} />
            <Select label="Weight" value={s.headingWeight} onChange={(headingWeight) => set({ headingWeight })} options={[[400, 'Regular'], [600, 'Semibold'], [700, 'Bold'], [900, 'Black']]} />
          </Row>
          <Select label="Body font" value={s.body} onChange={(body) => set({ body })} options={FONTS} />
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Uses fonts installed on this device; the PDF embeds the specimen as an image so it looks the same everywhere.</p>
        </Panel>
        <Panel title="Usage rules">
          <Area value={s.notes} onChange={(notes) => set({ notes })} rows={5} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Colors" value={s.colors.length} />
          <Stat label="AA text pairs" value={`${passAA} / ${ps.length}`} tone={passAA ? 'good' : 'bad'} />
          <Stat label="Logos" value={s.logos.length} />
        </Stats>
        <Panel title="Guide preview" actions={<>
          <Btn kind="primary" disabled={busy} onClick={() => void pdf()}>{busy ? 'Building…' : '⬇ One-page PDF guide'}</Btn>
          <JsonButtons name="brand-kit.json" data={s} onLoad={(d) => set(d)} />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </>}>
          <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: '#fff', color: '#1b1f24' }}>
            <div style={{ background: s.colors[0]?.hex, color: textOn(s.colors[0]?.hex ?? '#000').text, padding: '18px 20px' }}>
              <div style={{ fontFamily: s.heading, fontWeight: s.headingWeight, fontSize: 26 }}>{s.brand}</div>
              <div style={{ fontFamily: s.body, opacity: 0.85 }}>{s.tagline}</div>
            </div>
            <div style={{ padding: 16, display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                {s.logos.slice(0, 3).map((l) => (
                  <figure key={l.id} style={{ margin: 0 }}>
                    <div style={{ height: 90, display: 'grid', placeItems: 'center', background: l.bg === 'dark' ? s.colors[0]?.hex : '#f4f4f5', borderRadius: 8, padding: 12 }}><img src={l.url} alt={l.label} style={{ maxWidth: '100%', maxHeight: 64 }} /></div>
                    <figcaption style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{l.label}</figcaption>
                  </figure>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 10 }}>
                {s.colors.map((c) => {
                  const v = hexToRgb(c.hex)
                  const t = textOn(c.hex)
                  return (
                    <div key={c.id} style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                      <div style={{ height: 64, background: v ? c.hex : 'repeating-linear-gradient(45deg,#eee 0 6px,#fff 0 12px)', borderRadius: 8, border: '1px solid #e5e7eb', color: t.text, padding: 6, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{c.role}</div>
                      <b style={{ fontSize: 12.5 }}>{c.name}</b><br />
                      {v ? <>{c.hex.toUpperCase()}<br />{fmtRgb(v)}<br />{fmtHsl(v)}<br />CMYK {cmyk(v).join(' ')}<br /><span style={{ color: t.ratio >= 4.5 ? '#047857' : '#b45309' }}>{t.text === '#ffffff' ? 'White' : 'Black'} text {t.ratio.toFixed(1)}:1</span></> : <span style={{ color: '#dc2626' }}>Invalid hex</span>}
                    </div>
                  )
                })}
              </div>
              <div>
                <div style={{ fontFamily: s.heading, fontWeight: s.headingWeight, fontSize: 30, color: s.colors[0]?.hex }}>Aa Bb Cc — {fontName(s.heading)}</div>
                <p style={{ fontFamily: s.body, margin: '4px 0 0', fontSize: 15 }}>Body text in {fontName(s.body)}. Good typography is invisible: it lets the message breathe and the brand speak quietly. 0123456789</p>
              </div>
            </div>
          </div>
        </Panel>
        <Panel title="Contrast matrix (text on background)">
          <div className="k-table-wrap">
            <table className="k-table" style={{ fontSize: 12 }}>
              <thead><tr><th>text ↓ / bg →</th>{s.colors.map((b) => <th key={b.id}><span style={{ display: 'inline-block', width: 12, height: 12, background: b.hex, borderRadius: 3, verticalAlign: -2, border: '1px solid var(--line)' }} /> {b.name}</th>)}</tr></thead>
              <tbody>
                {s.colors.map((f) => (
                  <tr key={f.id}>
                    <th style={{ textAlign: 'left' }}>{f.name}</th>
                    {s.colors.map((b) => {
                      if (b.id === f.id) return <td key={b.id} className="muted">—</td>
                      const p = ps.find((x) => x.fg.id === f.id && x.bg.id === b.id)
                      if (!p) return <td key={b.id}>?</td>
                      return <td key={b.id} style={{ background: b.hex, color: f.hex, fontWeight: 700, textAlign: 'center' }} title={p.grade}>{p.ratio.toFixed(1)}<br /><span style={{ fontSize: 10 }}>{p.grade}</span></td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>AA needs 4.5:1 for body text and 3:1 for large text (≥ 24 px, or 18.7 px bold) and UI elements. AAA needs 7:1.</p>
        </Panel>
        <Panel title="Design tokens" actions={<><Select label="" value={s.tokens} onChange={(tokens) => set({ tokens })} options={[['css', 'CSS variables'], ['json', 'Tokens JSON']]} /><CopyButton text={tokens} /></>}>
          <pre style={{ fontSize: 12, background: 'var(--bg)', padding: 10, borderRadius: 8, overflow: 'auto', maxHeight: 220, margin: 0 }}>{tokens}</pre>
        </Panel>
      </div>
    </Split>
  )
}
