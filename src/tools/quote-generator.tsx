import { useState, type CSSProperties } from 'react'
import { Area, Btn, Check, download, FileDrop, JsonButtons, money, Note, Num, Panel, Row, Select, Seg, Split, Stat, Stats, today, Txt, uid, useToolState } from '../kit'
import { addDays, calcQuote, wrapText, type QuoteItem } from './lib/quote-generator'

interface Item extends QuoteItem {
  id: string
}
interface State {
  number: string
  date: string
  validDays: number
  currency: string
  accent: string
  logo: string
  from: string
  to: string
  items: Item[]
  discountType: 'pct' | 'fixed'
  discount: number
  taxRate: number
  taxLabel: string
  shipping: number
  notes: string
  terms: string
}

const DEF: State = {
  number: 'Q-2026-0042',
  date: today(),
  validDays: 30,
  currency: '$',
  accent: '#4f46e5',
  logo: '',
  from: 'Northwind Studio LLC\n120 Market Street, Suite 400\nSan Francisco, CA 94105\nhello@northwind.example · +1 415 555 0134',
  to: 'Acme Robotics Inc.\nAttn: Jordan Lee, Procurement\n55 Industrial Way\nAustin, TX 78701',
  items: [
    { id: 'a', desc: 'Discovery workshop (2 days, on-site)', qty: 1, price: 3200, disc: 0, taxable: false },
    { id: 'b', desc: 'UX design — web app, 12 screens incl. responsive variants', qty: 12, price: 450, disc: 10, taxable: false },
    { id: 'c', desc: 'Front-end development (hours)', qty: 80, price: 95, disc: 0, taxable: false },
    { id: 'd', desc: 'Annual hosting & maintenance plan', qty: 1, price: 1800, disc: 0, taxable: true },
    { id: 'e', desc: 'Branded USB-C presentation kit', qty: 4, price: 129, disc: 0, taxable: true },
  ],
  discountType: 'pct',
  discount: 5,
  taxRate: 8.25,
  taxLabel: 'Sales tax',
  shipping: 35,
  notes: 'Prices include project management and two revision rounds per deliverable.',
  terms: '50% deposit due on acceptance, balance on delivery. Payment by bank transfer within 15 days of invoice.',
}

const CUR = ['$', '€', '£', '¥', 'CHF ', 'CA$', 'A$', 'zł ', '₴', '₹'] as const

/** Downscale any uploaded image to a ≤ 360 px wide PNG data URL so it stays small and embeddable. */
function toLogo(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => {
      const s = Math.min(1, 360 / img.width, 160 / img.height)
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(img.width * s))
      c.height = Math.max(1, Math.round(img.height * s))
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(img.src)
      res(c.toDataURL('image/png'))
    }
    img.onerror = () => rej(new Error('Not an image'))
    img.src = URL.createObjectURL(f)
  })
}

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

async function buildPdf(s: State): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const t = calcQuote(s.items, s)
  const doc = await PDFDocument.create()
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  // Standard fonts only cover WinAnsi; swap anything else for a safe fallback.
  const safe = (x: string) =>
    [...x.replace(/₴/g, 'UAH ').replace(/₹/g, 'INR ').replace(/ł/g, 'l')]
      .map((ch) => {
        try {
          reg.encodeText(ch)
          return ch
        } catch {
          return '?'
        }
      })
      .join('')
  const m = (x: number) => safe(money(x, s.currency))
  const acc = rgb(...hex(s.accent))
  const ink = rgb(0.12, 0.13, 0.16)
  const mute = rgb(0.42, 0.45, 0.5)
  const W = 595.28, H = 841.89, M = 48
  let page = doc.addPage([W, H])
  let y = H - M
  const text = (str: string, x: number, yy: number, size = 10, f = reg, color = ink, align: 'l' | 'r' = 'l') => {
    const v = safe(str)
    page.drawText(v, { x: align === 'r' ? x - f.widthOfTextAtSize(v, size) : x, y: yy, size, font: f, color })
  }
  const ensure = (need: number) => {
    if (y - need > M + 20) return
    page = doc.addPage([W, H])
    y = H - M
  }

  page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: acc })
  if (s.logo) {
    const png = await doc.embedPng(s.logo)
    const sc = Math.min(160 / png.width, 60 / png.height, 1)
    page.drawImage(png, { x: M, y: y - png.height * sc + 6, width: png.width * sc, height: png.height * sc })
  } else text(s.from.split('\n')[0] ?? '', M, y - 14, 16, bold, acc)
  text('QUOTE', W - M, y - 16, 24, bold, acc, 'r')
  text(`No. ${s.number}`, W - M, y - 34, 10, reg, mute, 'r')
  text(`Date: ${s.date}`, W - M, y - 48, 10, reg, mute, 'r')
  text(`Valid until: ${addDays(s.date, s.validDays)}`, W - M, y - 62, 10, reg, mute, 'r')
  y -= 96
  const block = (title: string, body: string, x: number) => {
    text(title, x, y, 8, bold, mute)
    body.split('\n').forEach((l, i) => text(l, x, y - 15 - i * 13, 10, i ? reg : bold))
    return body.split('\n').length
  }
  const n = Math.max(block('FROM', s.from, M), block('PREPARED FOR', s.to, W / 2 + 10))
  y -= 30 + n * 13

  const cols = { desc: M + 6, qty: 360, price: 440, disc: 482, amt: W - M - 6 }
  const headRow = () => {
    page.drawRectangle({ x: M, y: y - 6, width: W - 2 * M, height: 22, color: acc })
    const white = rgb(1, 1, 1)
    text('DESCRIPTION', cols.desc, y + 1, 8, bold, white)
    text('QTY', cols.qty, y + 1, 8, bold, white, 'r')
    text('UNIT PRICE', cols.price, y + 1, 8, bold, white, 'r')
    text('DISC.', cols.disc, y + 1, 8, bold, white, 'r')
    text('AMOUNT', cols.amt, y + 1, 8, bold, white, 'r')
    y -= 26
  }
  headRow()
  s.items.forEach((it, i) => {
    const lines = wrapText(safe(it.desc || '—'), cols.qty - cols.desc - 50, (z) => reg.widthOfTextAtSize(z, 10))
    const h = lines.length * 13 + 8
    if (y - h < M + 20) {
      page = doc.addPage([W, H])
      y = H - M
      headRow()
    }
    if (i % 2) page.drawRectangle({ x: M, y: y - h + 9, width: W - 2 * M, height: h, color: rgb(0.96, 0.965, 0.975) })
    lines.forEach((l, k) => text(l, cols.desc, y - k * 13, 10))
    text(String(it.qty), cols.qty, y, 10, reg, ink, 'r')
    text(m(it.price), cols.price, y, 10, reg, ink, 'r')
    text(it.disc ? `${it.disc}%` : '', cols.disc, y, 10, reg, mute, 'r')
    text(m(t.lines[i]) + (it.taxable && s.taxRate ? ' *' : ''), cols.amt, y, 10, bold, ink, 'r')
    y -= h
  })
  y -= 8
  ensure(140)
  page.drawLine({ start: { x: 330, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.6, color: mute })
  const tot = (label: string, v: string, big = false) => {
    text(label, 340, y - 6, big ? 12 : 10, big ? bold : reg, big ? ink : mute)
    text(v, cols.amt, y - 6, big ? 13 : 10, bold, big ? acc : ink, 'r')
    y -= big ? 24 : 16
  }
  tot('Subtotal', m(t.subtotal))
  if (t.discount) tot(`Discount${s.discountType === 'pct' ? ` (${s.discount}%)` : ''}`, '-' + m(t.discount))
  if (s.taxRate) tot(`${s.taxLabel} ${s.taxRate}% on ${m(t.taxable)}`, m(t.tax))
  if (t.shipping) tot('Shipping', m(t.shipping))
  page.drawRectangle({ x: 330, y: y - 14, width: W - M - 330, height: 21, color: rgb(...hex(s.accent).map((c) => 0.88 + c * 0.12) as [number, number, number]) })
  tot('TOTAL', m(t.total), true)
  if (s.taxRate && s.items.some((it) => it.taxable)) text('* taxable item', W - M, y - 2, 8, reg, mute, 'r')
  y -= 24
  for (const [title, body] of [['NOTES', s.notes], ['TERMS & CONDITIONS', s.terms]] as const) {
    if (!body.trim()) continue
    const lines = wrapText(safe(body), W - 2 * M, (z) => reg.widthOfTextAtSize(z, 9.5))
    ensure(20 + lines.length * 12)
    text(title, M, y, 8, bold, mute)
    lines.forEach((l, k) => text(l, M, y - 14 - k * 12, 9.5))
    y -= 30 + lines.length * 12
  }
  ensure(60)
  text('Accepted by (name, signature, date):', M, y - 10, 9, reg, mute)
  page.drawLine({ start: { x: M, y: y - 44 }, end: { x: 300, y: y - 44 }, thickness: 0.6, color: mute })
  const pages = doc.getPages()
  pages.forEach((p, i) => p.drawText(safe(`${s.number} · page ${i + 1} of ${pages.length}`), { x: M, y: 24, size: 8, font: reg, color: mute }))
  doc.setTitle(`Quote ${s.number}`)
  doc.setCreator('Browser Toolbox · Quote Generator')
  return doc.save()
}

export default function QuoteGenerator() {
  const [s, set, reset] = useToolState('quote-generator', DEF)
  const [err, setErr] = useState('')
  const t = calcQuote(s.items, s)
  const m = (x: number) => money(x, s.currency)
  const edit = (id: string, p: Partial<Item>) => set({ items: s.items.map((it) => (it.id === id ? { ...it, ...p } : it)) })
  const pdf = async () => {
    setErr('')
    try {
      const bytes = await buildPdf(s)
      download(`quote-${s.number.replace(/[^\w-]+/g, '_')}.pdf`, new Blob([bytes.slice().buffer], { type: 'application/pdf' }))
    } catch (e) {
      setErr((e as Error).message)
    }
  }
  const inp: CSSProperties = { padding: '6px 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel)', color: 'inherit', width: '100%', boxSizing: 'border-box' }

  return (
    <Split wide="right">
      <div>
        <Panel title="Quote details">
          <Row>
            <Txt label="Quote no." value={s.number} onChange={(number) => set({ number })} />
            <Txt label="Date" type="date" value={s.date} onChange={(date) => set({ date })} />
          </Row>
          <Row>
            <Num label="Valid for" value={s.validDays} onChange={(validDays) => set({ validDays })} unit="days" min={0} hint={`until ${addDays(s.date, s.validDays)}`} />
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={CUR} />
          </Row>
          <Area label="From (your business)" value={s.from} onChange={(from) => set({ from })} rows={4} />
          <Area label="Prepared for (client)" value={s.to} onChange={(to) => set({ to })} rows={4} />
        </Panel>
        <Panel title="Branding">
          <Row>
            <div className="k-field">
              <span className="k-label">Accent colour</span>
              <input type="color" value={s.accent} onChange={(e) => set({ accent: e.target.value })} style={{ width: 64, height: 36, border: 0, background: 'none' }} />
            </div>
            {s.logo && <img src={s.logo} alt="logo" style={{ maxHeight: 48, maxWidth: 140 }} />}
            {s.logo && <Btn kind="ghost" onClick={() => set({ logo: '' })}>Remove logo</Btn>}
          </Row>
          <FileDrop accept="image/*" onFiles={(f) => void toLogo(f[0]).then((logo) => set({ logo })).catch(() => setErr('Could not read that image.'))} label="Upload a logo (PNG, JPEG, SVG…)" />
        </Panel>
        <Panel title="Discount, tax & shipping">
          <Row>
            <Num label="Order discount" value={s.discount} onChange={(discount) => set({ discount })} min={0} unit={s.discountType === 'pct' ? '%' : s.currency} />
            <div className="k-field">
              <span className="k-label">Type</span>
              <Seg value={s.discountType} onChange={(discountType) => set({ discountType })} options={[['pct', '%'], ['fixed', 'Fixed']]} />
            </div>
          </Row>
          <Row>
            <Txt label="Tax name" value={s.taxLabel} onChange={(taxLabel) => set({ taxLabel })} />
            <Num label="Tax rate" value={s.taxRate} onChange={(taxRate) => set({ taxRate })} min={0} max={100} unit="%" />
            <Num label="Shipping" value={s.shipping} onChange={(shipping) => set({ shipping })} min={0} unit={s.currency} />
          </Row>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Tax applies only to lines ticked “Tax”, after their share of the order discount. Shipping is untaxed.</p>
        </Panel>
        <Panel title="Notes & terms">
          <Area label="Notes" value={s.notes} onChange={(notes) => set({ notes })} rows={3} />
          <Area label="Terms & conditions" value={s.terms} onChange={(terms) => set({ terms })} rows={3} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Subtotal" value={m(t.subtotal)} sub={t.lineSavings ? `after ${m(t.lineSavings)} line discounts` : undefined} />
          <Stat label="Discount + tax" value={`−${m(t.discount)} / +${m(t.tax)}`} />
          <Stat label="Total" value={m(t.total)} tone="accent" />
        </Stats>
        <Panel
          title="Line items"
          actions={
            <>
              <Btn onClick={() => set({ items: [...s.items, { id: uid(), desc: '', qty: 1, price: 0, disc: 0, taxable: true }] })}>+ Line</Btn>
              <Btn kind="primary" onClick={() => void pdf()}>⬇ PDF</Btn>
              <Btn onClick={() => window.print()}>🖨 Print</Btn>
              <JsonButtons name={`quote-${s.number}.json`} data={s} onLoad={(d) => set(d)} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          {err && <Note tone="err">{err}</Note>}
          {s.items.map((it, i) => (
            <div key={it.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <input style={inp} value={it.desc} placeholder={`Item ${i + 1} description`} onChange={(e) => edit(it.id, { desc: e.target.value })} aria-label="Description" />
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', marginTop: 6, fontSize: 12 }}>
                <label className="muted">Qty <input style={{ ...inp, width: 64 }} type="number" min={0} value={it.qty} onChange={(e) => edit(it.id, { qty: Math.max(0, Number(e.target.value) || 0) })} /></label>
                <label className="muted">Price <input style={{ ...inp, width: 96 }} type="number" min={0} step="0.01" value={it.price} onChange={(e) => edit(it.id, { price: Math.max(0, Number(e.target.value) || 0) })} /></label>
                <label className="muted">Disc. % <input style={{ ...inp, width: 60 }} type="number" min={0} max={100} value={it.disc} onChange={(e) => edit(it.id, { disc: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} /></label>
                <Check label="Taxable" value={it.taxable} onChange={(taxable) => edit(it.id, { taxable })} />
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <b style={{ fontSize: 14 }}>{m(t.lines[i])}</b>
                  <Btn kind="ghost" title="Remove line" onClick={() => set({ items: s.items.filter((x) => x.id !== it.id) })}>✕</Btn>
                </span>
              </div>
            </div>
          ))}
        </Panel>
        <Panel title="Preview">
          <style>{'@media print { body * { visibility: hidden } .quote-paper, .quote-paper * { visibility: visible } .quote-paper { position: absolute; inset: 0 0 auto 0; box-shadow: none !important } }'}</style>
          <div className="quote-paper" style={{ background: '#fff', color: '#1f2128', borderRadius: 8, padding: 'clamp(14px, 4vw, 36px)', boxShadow: '0 2px 14px #0002', borderTop: `8px solid ${s.accent}`, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              {s.logo ? <img src={s.logo} alt="logo" style={{ maxHeight: 60, maxWidth: 160 }} /> : <b style={{ color: s.accent, fontSize: 18 }}>{s.from.split('\n')[0]}</b>}
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: s.accent, fontSize: 26, fontWeight: 800, letterSpacing: 1 }}>QUOTE</div>
                <div style={{ color: '#6b7280' }}>No. {s.number}<br />Date: {s.date}<br />Valid until: {addDays(s.date, s.validDays)}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, margin: '20px 0' }}>
              {([['FROM', s.from], ['PREPARED FOR', s.to]] as const).map(([h, b]) => (
                <div key={h}>
                  <div style={{ color: '#6b7280', fontSize: 10, fontWeight: 700 }}>{h}</div>
                  {b.split('\n').map((l, i) => <div key={i} style={{ fontWeight: i ? 400 : 700 }}>{l}</div>)}
                </div>
              ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                <thead>
                  <tr style={{ background: s.accent, color: '#fff', fontSize: 11 }}>
                    {['Description', 'Qty', 'Unit price', 'Disc.', 'Amount'].map((h, i) => <th key={h} style={{ padding: '6px 8px', textAlign: i ? 'right' : 'left' }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {s.items.map((it, i) => (
                    <tr key={it.id} style={{ background: i % 2 ? '#f5f6f8' : undefined }}>
                      <td style={{ padding: '6px 8px' }}>{it.desc || '—'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{it.qty}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{m(it.price)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: '#6b7280' }}>{it.disc ? `${it.disc}%` : ''}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{m(t.lines[i])}{it.taxable && s.taxRate ? ' *' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginLeft: 'auto', maxWidth: 300, marginTop: 12 }}>
              {[
                ['Subtotal', m(t.subtotal)],
                ...(t.discount ? [[`Discount${s.discountType === 'pct' ? ` (${s.discount}%)` : ''}`, '−' + m(t.discount)]] : []),
                ...(s.taxRate ? [[`${s.taxLabel} ${s.taxRate}%`, m(t.tax)]] : []),
                ...(t.shipping ? [['Shipping', m(t.shipping)]] : []),
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: '#4b5563' }}><span>{l}</span><b style={{ color: '#1f2128' }}>{v}</b></div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', marginTop: 6, background: `color-mix(in srgb, ${s.accent} 12%, #fff)`, borderRadius: 6, fontSize: 16 }}>
                <b>Total</b>
                <b style={{ color: s.accent }}>{m(t.total)}</b>
              </div>
            </div>
            {s.notes && <p style={{ marginTop: 18 }}><b style={{ fontSize: 10, color: '#6b7280' }}>NOTES</b><br />{s.notes}</p>}
            {s.terms && <p><b style={{ fontSize: 10, color: '#6b7280' }}>TERMS &amp; CONDITIONS</b><br />{s.terms}</p>}
            <div style={{ marginTop: 28, width: 260, borderTop: '1px solid #9ca3af', paddingTop: 4, color: '#6b7280', fontSize: 11 }}>Accepted by (name, signature, date)</div>
          </div>
        </Panel>
      </div>
    </Split>
  )
}
