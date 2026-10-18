import { useMemo, useState } from 'react'
import { Area, Btn, Check, CsvButton, JsonButtons, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, today, uid, useToolState } from '../kit'
import { encode, gs1Check } from './lib/barcode-generator'
import { autoSym, fitSheet, parseProducts, UNIT_NAMES, unitPrice, type Basis, type Product, type SizeUnit } from './lib/shelf-label-printer'

type Item = Product & { copies: number }
type Style = 'stripe' | 'block' | 'plain'

const ean = (d12: string) => d12 + gs1Check(d12)
const P = (name: string, brand: string, price: number, was: number, size: number, unit: SizeUnit, bc: string, sku: string): Item => ({ id: uid(), name, brand, price, was, size, unit, barcode: bc, sku, copies: 1 })
const SAMPLE: Item[] = [
  P('Rolled Oats', 'Hillside Mill', 2.49, 0, 500, 'g', ean('200012340015'), 'GR-1001'),
  P('Oat Drink Barista', 'Northfield', 1.89, 2.29, 1, 'l', ean('200012340022'), 'DR-2040'),
  P('Basmati Rice', 'Golden Grain', 4.99, 0, 2, 'kg', ean('200012340039'), 'GR-1120'),
  P('Extra Virgin Olive Oil', 'Costa Verde', 8.75, 0, 750, 'ml', ean('200012340046'), 'OL-0750'),
  P('Free-range Eggs', 'Meadow Farm', 3.6, 0, 12, 'ct', ean('200012340053'), 'EG-0012'),
  P('Dark Chocolate 70%', 'Cocoa Lane', 1.99, 2.49, 100, 'g', ean('200012340060'), 'SW-0310'),
  P('Peanut Butter Crunchy', 'Nutty Co.', 3.29, 0, 16, 'oz', '036000291452', 'SP-0016'),
  P('Sparkling Water', 'Clear Spring', 0.89, 0, 1.5, 'l', 'CS-SPARK-15', 'DR-1500'),
]

const SIZES: [string, string, number, number][] = [
  ['50x30', '50 × 30 mm', 50, 30], ['58x40', '58 × 40 mm', 58, 40], ['70x38', '70 × 38 mm', 70, 38], ['80x50', '80 × 50 mm', 80, 50],
  ['57x32', '2.25 × 1.25 in', 57.15, 31.75], ['102x51', '4 × 2 in', 101.6, 50.8], ['custom', 'Custom…', 0, 0],
]
const PAGES = { a4: [210, 297], letter: [215.9, 279.4] } as const

const DEF = {
  items: SAMPLE,
  currency: '€',
  basis: 'metric1' as Basis,
  size: '70x38',
  w: 70,
  h: 38,
  style: 'stripe' as Style,
  accent: '#dc2626',
  showBrand: true,
  showBarcode: true,
  showUnit: true,
  showSku: true,
  showDate: false,
  priceScale: 1,
  page: 'a4' as keyof typeof PAGES,
  margin: 8,
  gap: 2,
}
type S = typeof DEF

let ctx2d: CanvasRenderingContext2D | null = null
function textW(t: string, px: number, bold: boolean): number {
  ctx2d ??= document.createElement('canvas').getContext('2d')
  if (!ctx2d) return t.length * px * 0.55
  ctx2d.font = `${bold ? 'bold ' : ''}100px Arial, Helvetica, sans-serif`
  return (ctx2d.measureText(t).width / 100) * px
}
/** Shrinks the font (down to 70%) then truncates with an ellipsis so text fits maxW. */
function fitText(t: string, px: number, maxW: number, bold: boolean): [string, number] {
  let f = px
  while (f > px * 0.7 && textW(t, f, bold) > maxW) f *= 0.95
  let s = t
  while (s.length > 1 && textW(s, f, bold) > maxW) s = s.slice(0, -2) + '…'
  return [s, f]
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const fx = (n: number) => n.toFixed(2)

function labelSvg(p: Item, s: S, date: string): string {
  const { w: W, h: H } = s
  const pad = Math.max(1.5, Math.min(W, H) * 0.06)
  const out: string[] = []
  const strip = s.style === 'stripe' ? H * 0.09 : 0
  if (strip) out.push(`<rect width="${W}" height="${fx(strip)}" fill="${s.accent}"/>`)
  if (s.style !== 'plain') out.push(`<rect x="0.2" y="0.2" width="${fx(W - 0.4)}" height="${fx(H - 0.4)}" fill="none" stroke="#999" stroke-width="0.25"/>`)
  else out.push(`<rect x="0.2" y="0.2" width="${fx(W - 0.4)}" height="${fx(H - 0.4)}" fill="none" stroke="#ccc" stroke-width="0.2" stroke-dasharray="1 1"/>`)
  const sale = p.was > p.price
  // name
  let y = strip + pad
  const [nm, nf] = fitText(p.name, H * 0.12, W - 2 * pad - (sale ? H * 0.32 : 0), true)
  y += nf * 0.85
  out.push(`<text x="${fx(pad)}" y="${fx(y)}" font-size="${fx(nf)}" font-weight="700">${esc(nm)}</text>`)
  if (sale) {
    const bw = H * 0.28
    out.push(`<rect x="${fx(W - pad - bw)}" y="${fx(strip + pad * 0.6)}" width="${fx(bw)}" height="${fx(H * 0.11)}" rx="${fx(H * 0.02)}" fill="${s.accent}"/><text x="${fx(W - pad - bw / 2)}" y="${fx(strip + pad * 0.6 + H * 0.085)}" font-size="${fx(H * 0.08)}" font-weight="800" fill="#fff" text-anchor="middle">SALE</text>`)
  }
  const sizeTxt = `${+p.size.toFixed(3)} ${UNIT_NAMES.find(([u]) => u === p.unit)?.[1] ?? p.unit}`
  const sub = [s.showBrand && p.brand, p.unit === 'ct' && p.size === 1 ? '' : sizeTxt].filter(Boolean).join(' · ')
  if (sub) {
    const [st, sf] = fitText(sub, H * 0.075, W - 2 * pad, false)
    y += sf * 1.35
    out.push(`<text x="${fx(pad)}" y="${fx(y)}" font-size="${fx(sf)}" fill="#444">${esc(st)}</text>`)
  }
  // price block, bottom right
  const pf = H * 0.3 * s.priceScale
  const [int, dec] = p.price.toFixed(2).split('.')
  const smallTxt = Math.max(1.6, H * 0.055)
  const infoLine = [s.showSku && p.sku, s.showDate && date].filter(Boolean).join(' · ')
  const pBase = H - pad - (infoLine ? smallTxt * 1.3 : 0)
  const decW = textW(dec, pf * 0.45, true)
  const intW = textW(int, pf, true)
  const curW = textW(s.currency, pf * 0.45, true)
  const right = W - pad
  const blockW = curW + intW + decW + pf * 0.06
  if (s.style === 'block') out.push(`<rect x="${fx(right - blockW - pad * 0.6)}" y="${fx(pBase - pf * 0.82)}" width="${fx(blockW + pad * 1.2)}" height="${fx(pf * 0.98)}" rx="${fx(pf * 0.08)}" fill="${s.accent}"/>`)
  const pc = s.style === 'block' ? '#fff' : '#000'
  out.push(`<text y="${fx(pBase)}" font-weight="800" fill="${pc}" text-anchor="end"><tspan x="${fx(right - decW - intW)}" dy="${fx(-pf * 0.32)}" font-size="${fx(pf * 0.45)}">${esc(s.currency)}</tspan><tspan x="${fx(right - decW)}" dy="${fx(pf * 0.32)}" font-size="${fx(pf)}">${int}</tspan><tspan x="${fx(right)}" dy="${fx(-pf * 0.4)}" font-size="${fx(pf * 0.45)}">${dec}</tspan></text>`)
  if (sale) out.push(`<text x="${fx(right)}" y="${fx(pBase - pf * 0.9)}" font-size="${fx(H * 0.07)}" text-anchor="end" fill="#b91c1c">was <tspan text-decoration="line-through">${esc(s.currency)}${p.was.toFixed(2)}</tspan></text>`)
  if (infoLine) out.push(`<text x="${fx(right)}" y="${fx(H - pad)}" font-size="${fx(smallTxt)}" text-anchor="end" fill="#555">${esc(infoLine)}</text>`)
  // left column: unit price + barcode
  const leftW = W - 2 * pad - blockW - pad * 1.5
  let by = H - pad
  if (s.showBarcode && p.barcode) {
    const sym = autoSym(p.barcode)
    try {
      const b = encode(sym!, p.barcode)
      const ql = b.guards.length ? 7 : 2
      const mod = Math.min(leftW / (b.width + ql + 2), 0.5)
      const tf = b.guards.length ? mod * 8 : Math.min(H * 0.06, mod * 9)
      const bh = Math.min(H * 0.3, H - y - pad - tf - (s.showUnit ? H * 0.09 : 0) - 1)
      const top = H - pad - tf - bh
      const x0 = pad + ql * mod
      const inG = (x: number) => b.guards.some(([a, z]) => x >= a && x < z)
      out.push(`<g fill="#000">${b.bars.map(([x, bw]) => `<rect x="${fx(x0 + x * mod)}" y="${fx(top)}" width="${(bw * mod).toFixed(3)}" height="${fx(bh + (inG(x) ? tf * 0.55 : 0))}"/>`).join('')}</g>`)
      out.push(`<g font-family="'Courier New',monospace" font-size="${fx(tf)}" text-anchor="middle">${b.text.map((t) => `<text x="${fx(x0 + t.x * mod)}" y="${fx(top + bh + tf * 0.92)}" ${t.small ? `font-size="${fx(tf * 0.75)}"` : ''}>${esc(t.s)}</text>`).join('')}</g>`)
      by = top - 1
    } catch {
      out.push(`<text x="${fx(pad)}" y="${fx(H - pad)}" font-size="${fx(smallTxt)}" fill="#b91c1c">invalid barcode</text>`)
      by = H - pad - smallTxt * 1.4
    }
  }
  if (s.showUnit) {
    const u = unitPrice(p.price, p.size, p.unit, s.basis)
    if (Number.isFinite(u.value)) {
      const [ut, uf] = fitText(`${s.currency}${u.value.toFixed(u.value < 1 ? 3 : 2)} ${u.per}`, H * 0.075, leftW, true)
      out.push(`<text x="${fx(pad)}" y="${fx(by - 0.4)}" font-size="${fx(uf)}" font-weight="700" fill="#333">${esc(ut)}</text>`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif"><rect width="${W}" height="${H}" fill="#fff"/>${out.join('')}</svg>`
}

export default function ShelfLabelPrinter() {
  const [s, set, reset] = useToolState('shelf-label-printer', DEF)
  const [csv, setCsv] = useState('')
  const [msg, setMsg] = useState('')
  const date = today()
  const labels = useMemo(() => s.items.flatMap((p) => Array.from({ length: Math.max(0, Math.min(99, p.copies)) }, () => p)), [s.items])
  const pg = PAGES[s.page]
  const fit = fitSheet(pg[0], pg[1], s.margin, s.gap, s.w, s.h, labels.length)
  const svgs = useMemo(() => s.items.map((p) => [p.id, labelSvg(p, s, date)] as const), [s, date])
  const svgOf = (id: string) => svgs.find(([i]) => i === id)?.[1] ?? ''
  const edit = (id: string, patch: Partial<Item>) => set({ items: s.items.map((p) => (p.id === id ? { ...p, ...patch } : p)) })

  const importCsv = (text: string) => {
    const ps = parseProducts(text, uid)
    if (!ps.length) return setMsg('No products found. The first row must be a header with at least name and price columns.')
    set({ items: ps.map((p) => ({ ...p, copies: 1 })) })
    setMsg(`Imported ${ps.length} products.`)
  }

  const print = () => {
    const w = window.open('', '_blank')
    if (!w || !fit.perPage) return
    const pages: string[] = []
    for (let i = 0; i < labels.length; i += fit.perPage) {
      const cells = labels.slice(i, i + fit.perPage).map((p, k) => {
        const c = k % fit.cols
        const r = Math.floor(k / fit.cols)
        return `<div style="position:absolute;left:${s.margin + c * (s.w + s.gap)}mm;top:${s.margin + r * (s.h + s.gap)}mm">${svgOf(p.id)}</div>`
      })
      pages.push(`<div class="pg">${cells.join('')}</div>`)
    }
    w.document.write(`<!doctype html><title>Shelf labels</title><style>@page{size:${pg[0]}mm ${pg[1]}mm;margin:0}body{margin:0}.pg{position:relative;width:${pg[0]}mm;height:${pg[1]}mm;page-break-after:always;overflow:hidden}svg{display:block}</style>${pages.join('')}<script>onload=()=>print()</script>`)
    w.document.close()
  }

  return (
    <Split>
      <div>
        <Panel title="Label template" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Label size" value={s.size} onChange={(size) => { const z = SIZES.find(([k]) => k === size)!; set(z[2] ? { size, w: z[2], h: z[3] } : { size }) }} options={SIZES.map(([k, l]) => [k, l] as [string, string])} />
          {s.size === 'custom' && (
            <Row>
              <Num label="Width" value={s.w} onChange={(w) => set({ w: Math.max(25, Math.min(150, w)) })} unit="mm" min={25} max={150} />
              <Num label="Height" value={s.h} onChange={(h) => set({ h: Math.max(15, Math.min(100, h)) })} unit="mm" min={15} max={100} />
            </Row>
          )}
          <Seg value={s.style} onChange={(style) => set({ style })} options={[['stripe', 'Color stripe'], ['block', 'Price block'], ['plain', 'Plain']]} />
          <Row>
            <label className="k-field"><span className="k-label">Accent</span><input type="color" value={s.accent} onChange={(e) => set({ accent: e.target.value })} /></label>
            <Select label="Currency" value={s.currency} onChange={(currency) => set({ currency })} options={['€', '$', '£', 'zł', '₴', 'CHF ', 'kr ']} />
            <Select label="Price size" value={s.priceScale} onChange={(priceScale) => set({ priceScale })} options={[[0.8, 'Small'], [1, 'Normal'], [1.15, 'Large']]} />
          </Row>
          <Select label="Unit price basis" value={s.basis} onChange={(basis) => set({ basis })} options={[['metric1', 'per kg / per L'], ['metric100', 'per 100 g / 100 ml'], ['us', 'per oz / per fl oz']]} />
          <Check label="Brand" value={s.showBrand} onChange={(showBrand) => set({ showBrand })} />
          <Check label="Unit price" value={s.showUnit} onChange={(showUnit) => set({ showUnit })} />
          <Check label="Barcode" value={s.showBarcode} onChange={(showBarcode) => set({ showBarcode })} />
          <Check label="SKU" value={s.showSku} onChange={(showSku) => set({ showSku })} />
          <Check label="Print date" value={s.showDate} onChange={(showDate) => set({ showDate })} />
        </Panel>
        <Panel title="Sheet">
          <Row>
            <Select label="Paper" value={s.page} onChange={(page) => set({ page })} options={[['a4', 'A4'], ['letter', 'US Letter']]} />
            <Num label="Margin" value={s.margin} onChange={(margin) => set({ margin })} unit="mm" min={0} max={30} />
            <Num label="Gap" value={s.gap} onChange={(gap) => set({ gap })} unit="mm" min={0} max={20} />
          </Row>
          {fit.perPage === 0 && <Note tone="err">The label does not fit on the page with these margins.</Note>}
        </Panel>
        <Panel title="Import CSV">
          <Area value={csv} onChange={setCsv} rows={4} mono placeholder={'name,brand,price,was,size,unit,barcode,sku\nRolled Oats,Hillside Mill,2.49,,500,g,2000123400150,GR-1001'} />
          <Row>
            <Btn kind="primary" disabled={!csv.trim()} onClick={() => importCsv(csv)}>Import (replaces list)</Btn>
            <label className="k-btn">📂 CSV file<input type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importCsv(await f.text()) }} /></label>
          </Row>
          {msg && <Note tone={msg.startsWith('Imported') ? 'ok' : 'warn'}>{msg}</Note>}
          <p className="muted" style={{ fontSize: 12.5 }}>Columns are matched by header name; "500 g" in a size column is split automatically. 13 digits → EAN-13, 12 → UPC-A, 8 → EAN-8, anything else → Code 128.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Products" value={s.items.length} />
          <Stat label="Labels" value={labels.length} sub={`${fit.cols} × ${fit.rows} per page`} />
          <Stat label="Pages" value={fit.pages} sub={`${s.page === 'a4' ? 'A4' : 'Letter'} · ${s.w} × ${s.h} mm`} tone="accent" />
        </Stats>
        <Panel title="Preview" actions={<Btn kind="primary" onClick={print} disabled={!labels.length || !fit.perPage}>🖨 Print labels</Btn>}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {s.items.slice(0, 12).map((p) => (
              <div key={p.id} title={p.name} style={{ width: `${s.w * 3.2}px`, maxWidth: '100%', boxShadow: 'var(--shadow)', lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: svgOf(p.id).replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%"') }} />
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>Print at 100% scale (no "fit to page") so labels keep their exact size.</p>
        </Panel>
        <Panel title="Products" actions={<><Btn onClick={() => set({ items: [...s.items, { ...P('New product', '', 1, 0, 1, 'ct', '', ''), id: uid() }] })}>+ Product</Btn><CsvButton name="shelf-labels.csv" rows={() => [['name', 'brand', 'price', 'was', 'size', 'unit', 'barcode', 'sku', 'copies'], ...s.items.map((p) => [p.name, p.brand, p.price, p.was || '', p.size, p.unit, p.barcode, p.sku, p.copies])]} /><JsonButtons name="shelf-labels.json" data={s} onLoad={(d) => set(d)} /></>}>
          <Table
            head={['Name', 'Brand', 'Price', 'Was', 'Size', 'Unit', 'Barcode', 'Unit price', 'Qty', '']}
            rows={s.items.map((p) => {
              const u = unitPrice(p.price, p.size, p.unit, s.basis)
              return [
                <input key="n" value={p.name} onChange={(e) => edit(p.id, { name: e.target.value })} aria-label="Name" style={{ minWidth: 120 }} />,
                <input key="b" value={p.brand} onChange={(e) => edit(p.id, { brand: e.target.value })} aria-label="Brand" style={{ width: 90 }} />,
                <input key="p" type="number" step="0.01" min={0} value={p.price} onChange={(e) => edit(p.id, { price: Math.max(0, Number(e.target.value) || 0) })} aria-label="Price" style={{ width: 64 }} />,
                <input key="w" type="number" step="0.01" min={0} value={p.was || ''} onChange={(e) => edit(p.id, { was: Math.max(0, Number(e.target.value) || 0) })} aria-label="Was" style={{ width: 60 }} />,
                <input key="s" type="number" min={0} value={p.size} onChange={(e) => edit(p.id, { size: Math.max(0, Number(e.target.value) || 0) })} aria-label="Size" style={{ width: 58 }} />,
                <select key="u" value={p.unit} onChange={(e) => edit(p.id, { unit: e.target.value as SizeUnit })} aria-label="Unit">{UNIT_NAMES.map(([u, l]) => <option key={u} value={u}>{l}</option>)}</select>,
                <input key="c" value={p.barcode} onChange={(e) => edit(p.id, { barcode: e.target.value })} aria-label="Barcode" style={{ width: 120, fontFamily: 'var(--mono)' }} />,
                <span key="up" style={{ whiteSpace: 'nowrap' }}>{Number.isFinite(u.value) ? `${s.currency}${u.value.toFixed(u.value < 1 ? 3 : 2)} ${u.per}` : '—'}</span>,
                <input key="q" type="number" min={0} max={99} value={p.copies} onChange={(e) => edit(p.id, { copies: Math.max(0, Math.min(99, Math.round(Number(e.target.value) || 0))) })} aria-label="Copies" style={{ width: 46 }} />,
                <Btn key="x" kind="ghost" onClick={() => set({ items: s.items.filter((x) => x.id !== p.id) })} title="Remove">✕</Btn>,
              ]
            })}
          />
        </Panel>
        <Note>Unit prices use exact conversions (1 oz = 28.35 g, 1 fl oz = 29.57 ml). Sample barcodes use the in-store GS1 prefix 2xx, which is reserved for internal numbering.</Note>
      </div>
    </Split>
  )
}
