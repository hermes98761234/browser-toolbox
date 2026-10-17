import { useMemo, useState } from 'react'
import { Btn, Check, download, Note, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { qr } from './lib/barcode-label-maker'
import { back, front, impose, mirror, overflowing, PT, qrText, SIZES, TEMPLATES, type CardData, type Font, type Prim } from './lib/business-card-designer'

const DEF: CardData & { size: string; guides: boolean; layout: 'single' | 'letter' | 'a4' } = {
  name: 'Olena Kovalenko', title: 'Product Designer', company: 'Northwind Studio', tagline: 'Design that ships',
  phone: '+1 555 010 2030', email: 'olena@northwind.example', web: 'northwind.example', address: '12 Market St, Springfield',
  accent: '#4f46e5', ink: '#1f2937', paper: '#ffffff', font: 'sans', template: 'split', qr: 'back', qrContent: 'vcard',
  size: 'us', guides: true, layout: 'letter',
}

const PALETTES: [string, string, string, string][] = [
  ['Indigo', '#4f46e5', '#1f2937', '#ffffff'], ['Forest', '#166534', '#1c1917', '#fafaf9'], ['Coral', '#e11d48', '#27272a', '#fff7f5'],
  ['Ocean', '#0369a1', '#0f172a', '#f8fafc'], ['Gold', '#b45309', '#292524', '#fffbeb'], ['Mono', '#111827', '#111827', '#ffffff'],
]
const CSS_FONT: Record<Font, string> = { sans: 'Helvetica, Arial, sans-serif', serif: '"Times New Roman", Times, serif', mono: '"Courier New", Courier, monospace' }

function qrPath(text: string, x: number, y: number, size: number): string {
  const q = qr(text, 'M')
  const n = q.size + 2 // 1-module quiet zone each side
  const u = size / n
  let d = ''
  q.modules.forEach((row, r) => row.forEach((on, c) => {
    if (on) d += `M${(x + (c + 1) * u).toFixed(3)} ${(y + (r + 1) * u).toFixed(3)}h${u.toFixed(3)}v${u.toFixed(3)}h${(-u).toFixed(3)}z`
  }))
  return d
}

function CardSvg({ prims, w, h, b, font, guides }: { prims: Prim[]; w: number; h: number; b: number; font: Font; guides: boolean }) {
  return (
    <svg viewBox={`${-b} ${-b} ${w + 2 * b} ${h + 2 * b}`} style={{ width: '100%', display: 'block', borderRadius: 6, boxShadow: '0 6px 24px rgba(0,0,0,.18)' }} role="img" aria-label="Business card preview">
      {prims.map((p, i) => {
        if (p.t === 'rect') return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill} />
        if (p.t === 'circle') return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={p.fill} />
        if (p.t === 'qr') return p.text ? <path key={i} d={qrPath(p.text, p.x, p.y, p.size)} fill={p.fill} /> : null
        return (
          <text key={i} x={p.x} y={p.y} fontSize={p.pt * PT} fill={p.fill} fontWeight={p.bold ? 700 : 400} textAnchor={p.anchor ?? 'start'} fontFamily={CSS_FONT[font]}>
            {p.caps ? p.text.toUpperCase() : p.text}
          </text>
        )
      })}
      {guides && (
        <g fill="none" strokeWidth={0.25} pointerEvents="none">
          <path d={`M${-b} ${-b}h${w + 2 * b}v${h + 2 * b}h${-w - 2 * b}z M0 0v${h}h${w}v${-h}z`} fill="rgba(239,68,68,.12)" fillRule="evenodd" stroke="none" />
          <rect x={0} y={0} width={w} height={h} stroke="#ef4444" strokeDasharray="1 0.8" />
          <rect x={3} y={3} width={w - 6} height={h - 6} stroke="#0ea5e9" strokeDasharray="1 0.8" />
        </g>
      )}
    </svg>
  )
}

type PdfLib = typeof import('pdf-lib')

async function exportPdf(lib: PdfLib, d: CardData, size: { w: number; h: number; bleed: number }, layout: 'single' | 'letter' | 'a4'): Promise<{ bytes: Uint8Array; perSheet: number }> {
  const { PDFDocument, StandardFonts, rgb } = lib
  const doc = await PDFDocument.create()
  doc.setTitle(`Business card — ${d.name}`)
  doc.setCreator('Browser Toolbox')
  const names = { sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold], serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold], mono: [StandardFonts.Courier, StandardFonts.CourierBold] }[d.font]
  const [reg, bold] = await Promise.all(names.map((n) => doc.embedFont(n)))
  const mm = (v: number) => (v * 72) / 25.4
  const col = (hex: string) => {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex) ?? ['', 'ff', 'ff', 'ff']
    return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255)
  }
  const { w, h, bleed: b } = size
  // Standard fonts only cover WinAnsi; replace anything else instead of failing.
  const safe = (s: string) => [...s].map((ch) => { try { reg.encodeText(ch); return ch } catch { return '?' } }).join('')
  const draw = (page: ReturnType<typeof doc.addPage>, prims: Prim[], ox: number, oy: number, pageH: number) => {
    const X = (x: number) => mm(ox + x), Y = (y: number) => mm(pageH - oy - y)
    for (const p of prims) {
      if (p.t === 'rect') page.drawRectangle({ x: X(p.x), y: Y(p.y + p.h), width: mm(p.w), height: mm(p.h), color: col(p.fill) })
      else if (p.t === 'circle') page.drawCircle({ x: X(p.cx), y: Y(p.cy), size: mm(p.r), color: col(p.fill) })
      else if (p.t === 'qr' && p.text) {
        const q = qr(p.text, 'M')
        const u = p.size / (q.size + 2)
        q.modules.forEach((row, r) => {
          for (let c = 0; c < row.length; c++) {
            if (!row[c]) continue
            let e = c
            while (e + 1 < row.length && row[e + 1]) e++
            page.drawRectangle({ x: X(p.x + (c + 1) * u), y: Y(p.y + (r + 2) * u), width: mm((e - c + 1) * u) + 0.05, height: mm(u) + 0.05, color: col(p.fill) })
            c = e
          }
        })
      } else if (p.t === 'text' && p.text) {
        const f = p.bold ? bold : reg
        const t = safe(p.caps ? p.text.toUpperCase() : p.text)
        const tw = f.widthOfTextAtSize(t, p.pt)
        const dx = p.anchor === 'middle' ? tw / 2 : p.anchor === 'end' ? tw : 0
        page.drawText(t, { x: X(p.x) - dx, y: Y(p.y), size: p.pt, font: f, color: col(p.fill) })
      }
    }
  }
  const F = front(d, w, h, b), B = back(d, w, h, b)
  if (layout === 'single') {
    for (const prims of [F, B]) {
      const pg = doc.addPage([mm(w + 2 * b), mm(h + 2 * b)])
      pg.setTrimBox(mm(b), mm(b), mm(w), mm(h))
      pg.setBleedBox(0, 0, mm(w + 2 * b), mm(h + 2 * b))
      draw(pg, prims, b, b, h + 2 * b)
    }
    return { bytes: await doc.save(), perSheet: 1 }
  }
  const [PW, PH] = layout === 'letter' ? [215.9, 279.4] : [210, 297]
  const pos = impose(PW, PH, w, h, b)
  for (const [prims, ps] of [[F, pos], [B, mirror(pos, PW, w)]] as const) {
    const pg = doc.addPage([mm(PW), mm(PH)])
    for (const p of ps) draw(pg, prims, p.x, p.y, PH)
    // crop marks: short lines just outside each card's bleed, aligned with the trim edges
    for (const p of ps) {
      const L = 2.5, k = rgb(0, 0, 0)
      for (const x of [p.x, p.x + w]) for (const [y0, y1] of [[p.y - b - 0.5 - L, p.y - b - 0.5], [p.y + h + b + 0.5, p.y + h + b + 0.5 + L]])
        pg.drawLine({ start: { x: mm(x), y: mm(PH - y0) }, end: { x: mm(x), y: mm(PH - y1) }, thickness: 0.25, color: k })
      for (const y of [p.y, p.y + h]) for (const [x0, x1] of [[p.x - b - 0.5 - L, p.x - b - 0.5], [p.x + w + b + 0.5, p.x + w + b + 0.5 + L]])
        pg.drawLine({ start: { x: mm(x0), y: mm(PH - y) }, end: { x: mm(x1), y: mm(PH - y) }, thickness: 0.25, color: k })
    }
  }
  return { bytes: await doc.save(), perSheet: pos.length }
}

export default function BusinessCardDesigner() {
  const [s, set, reset] = useToolState('business-card-designer', DEF)
  const [busy, setBusy] = useState(false)
  const size = SIZES[s.size] ?? SIZES.us
  const F = useMemo(() => front(s, size.w, size.h, size.bleed), [s, size])
  const B = useMemo(() => back(s, size.w, size.h, size.bleed), [s, size])
  const over = [...overflowing(F, size.w, size.h, s.font), ...overflowing(B, size.w, size.h, s.font)]
  const qrLen = qrText(s).length
  const perSheet = s.layout === 'single' ? 1 : impose(s.layout === 'letter' ? 215.9 : 210, s.layout === 'letter' ? 279.4 : 297, size.w, size.h, size.bleed).length

  const pdf = async () => {
    setBusy(true)
    try {
      const { bytes } = await exportPdf(await import('pdf-lib'), s, size, s.layout)
      download(`business-card-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'card'}.pdf`, new Blob([bytes as BlobPart], { type: 'application/pdf' }))
    } finally {
      setBusy(false)
    }
  }
  const field = (k: keyof CardData, label: string, ph?: string) => <Txt label={label} value={s[k] as string} onChange={(v) => set({ [k]: v } as Partial<typeof DEF>)} placeholder={ph} />

  return (
    <Split wide="right">
      <div>
        <Panel title="Details" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>{field('name', 'Full name')}{field('title', 'Job title')}</Row>
          <Row>{field('company', 'Company')}{field('tagline', 'Tagline (back)')}</Row>
          <Row>{field('phone', 'Phone')}{field('email', 'E-mail')}</Row>
          <Row>{field('web', 'Website')}{field('address', 'Address', 'Street, City')}</Row>
        </Panel>
        <Panel title="Design">
          <p className="k-label" style={{ margin: '0 0 6px' }}>Template</p>
          <Seg value={s.template} onChange={(template) => set({ template })} options={TEMPLATES} />
          <p className="k-label" style={{ margin: '12px 0 6px' }}>Palette</p>
          <Row>
            {PALETTES.map(([n, a, ink, paper]) => (
              <button key={n} type="button" title={n} onClick={() => set({ accent: a, ink, paper })} style={{ width: 34, height: 34, borderRadius: 17, border: s.accent === a ? '3px solid var(--fg)' : '2px solid var(--line)', background: `linear-gradient(135deg, ${a} 50%, ${paper} 50%)`, cursor: 'pointer' }} />
            ))}
          </Row>
          <Row>
            {(['accent', 'ink', 'paper'] as const).map((k) => (
              <label key={k} className="k-field">
                <span className="k-label">{k === 'accent' ? 'Accent' : k === 'ink' ? 'Text' : 'Paper'}</span>
                <input type="color" value={s[k]} onChange={(e) => set({ [k]: e.target.value })} style={{ width: 64, height: 34 }} />
              </label>
            ))}
            <Select label="Font" value={s.font} onChange={(font) => set({ font })} options={[['sans', 'Helvetica'], ['serif', 'Times'], ['mono', 'Courier']]} />
          </Row>
          <Row>
            <Select label="QR code" value={s.qr} onChange={(q) => set({ qr: q })} options={[['none', 'None'], ['front', 'On the front'], ['back', 'On the back']]} />
            <Select label="QR content" value={s.qrContent} onChange={(qrContent) => set({ qrContent })} options={[['vcard', 'vCard contact'], ['url', 'Website URL']]} />
          </Row>
          {s.qr !== 'none' && <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>QR holds {qrLen} characters ({s.qrContent === 'vcard' ? 'scanning adds you to contacts' : 'opens your website'}). Keep it ≥ 15 mm for reliable scanning.</p>}
        </Panel>
        <Panel title="Print">
          <Row>
            <Select label="Card size" value={s.size} onChange={(v) => set({ size: v })} options={Object.entries(SIZES).map(([k, v]) => [k, v.label] as [string, string])} />
            <Select label="PDF layout" value={s.layout} onChange={(layout) => set({ layout })} options={[['single', 'Single card + bleed (print shop)'], ['letter', 'Letter sheet with crop marks'], ['a4', 'A4 sheet with crop marks']]} />
          </Row>
          <Check label="Show bleed (red) and safe-zone (blue) guides" value={s.guides} onChange={(guides) => set({ guides })} />
          <Btn kind="primary" onClick={pdf} disabled={busy}>{busy ? 'Building…' : '⬇ Print-ready PDF'}</Btn>
          <Note>
            Vector PDF with {size.bleed} mm bleed. “Single” sets TrimBox/BleedBox for print shops. Sheet layouts put {perSheet} cards per page; the back page is mirrored for
            long-edge duplex printing. Colors are RGB — ask your printer if they need CMYK.
          </Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Trim size" value={`${size.w} × ${size.h} mm`} sub={`${(size.w / 25.4).toFixed(2)} × ${(size.h / 25.4).toFixed(2)} in`} />
          <Stat label="With bleed" value={`${(size.w + 2 * size.bleed).toFixed(1)} × ${(size.h + 2 * size.bleed).toFixed(1)} mm`} />
          <Stat label="Cards per sheet" value={perSheet} />
        </Stats>
        {over.length > 0 && <Note tone="warn">May not fit the safe zone: {over.map((t) => `“${t}”`).join(', ')}. Shorten the text or choose another template.</Note>}
        <Panel title="Front">
          <div style={{ maxWidth: 620, margin: '0 auto' }}><CardSvg prims={F} w={size.w} h={size.h} b={size.bleed} font={s.font} guides={s.guides} /></div>
        </Panel>
        <Panel title="Back">
          <div style={{ maxWidth: 620, margin: '0 auto' }}><CardSvg prims={B} w={size.w} h={size.h} b={size.bleed} font={s.font} guides={s.guides} /></div>
        </Panel>
      </div>
    </Split>
  )
}
