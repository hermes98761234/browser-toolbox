// Packing slips and pick lists: CSV → orders (one row per line item), aggregated pick list sorted by
// bin location, WinAnsi-safe text for the PDF standard fonts, and page splitting for long orders.
import { code128Widths } from './barcode-label-maker'
import { parseCsv } from './csv-json-converter'

export interface Item { sku: string; name: string; qty: number; bin: string }
export interface Order {
  id: string
  date: string
  name: string
  address: string // multi-line
  method: string
  note: string
  items: Item[]
}

export const CSV_HEADER = ['order_id', 'date', 'ship_name', 'ship_address', 'ship_method', 'note', 'sku', 'item', 'qty', 'bin']

const ALIASES: Record<string, string[]> = {
  order_id: ['order_id', 'order', 'order number', 'order_no', 'order #', 'id'],
  date: ['date', 'order_date', 'created'],
  ship_name: ['ship_name', 'name', 'customer', 'recipient'],
  ship_address: ['ship_address', 'address', 'shipping address'],
  ship_method: ['ship_method', 'method', 'shipping', 'carrier'],
  note: ['note', 'notes', 'gift_message', 'message'],
  sku: ['sku', 'item_sku', 'product_code', 'code'],
  item: ['item', 'product', 'description', 'item_name', 'title'],
  qty: ['qty', 'quantity', 'count'],
  bin: ['bin', 'location', 'bin_location', 'shelf'],
}

/** Groups line-item rows into orders. Address lines inside a cell may be separated by "|" or newlines. */
export function ordersFromCsv(text: string): { orders: Order[]; errors: string[] } {
  const rows = parseCsv(text.trim()).filter((r) => r.some((c) => c.trim()))
  const errors: string[] = []
  if (rows.length < 2) return { orders: [], errors: ['Need a header row and at least one item row.'] }
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const col = (k: string) => head.findIndex((h) => ALIASES[k].includes(h))
  const ix = Object.fromEntries(Object.keys(ALIASES).map((k) => [k, col(k)])) as Record<string, number>
  if (ix.order_id < 0 || (ix.item < 0 && ix.sku < 0)) return { orders: [], errors: ['Missing an order_id column and an item or sku column.'] }
  const map = new Map<string, Order>()
  rows.slice(1).forEach((r, n) => {
    const get = (k: string) => (ix[k] >= 0 ? (r[ix[k]] ?? '').trim() : '')
    const id = get('order_id')
    if (!id) {
      errors.push(`Row ${n + 2}: no order id — skipped.`)
      return
    }
    let o = map.get(id)
    if (!o) {
      o = { id, date: get('date'), name: get('ship_name'), address: get('ship_address').replace(/\s*\|\s*/g, '\n'), method: get('ship_method'), note: get('note'), items: [] }
      map.set(id, o)
    }
    const qty = Number(get('qty') || '1')
    if (!Number.isFinite(qty) || qty <= 0) errors.push(`Row ${n + 2}: bad quantity “${get('qty')}” — using 1.`)
    o.items.push({ sku: get('sku'), name: get('item') || get('sku'), qty: Number.isFinite(qty) && qty > 0 ? qty : 1, bin: get('bin') })
  })
  return { orders: [...map.values()], errors }
}

export function ordersToCsv(orders: Order[]): string[][] {
  return [CSV_HEADER, ...orders.flatMap((o) => o.items.map((it) => [o.id, o.date, o.name, o.address.replace(/\n/g, ' | '), o.method, o.note, it.sku, it.name, String(it.qty), it.bin]))]
}

export interface PickRow { bin: string; sku: string; name: string; qty: number; orders: string[] }

/** Aggregates items across orders by SKU (+bin), sorted by bin with natural number order, then SKU. */
export function pickList(orders: Order[]): PickRow[] {
  const m = new Map<string, PickRow>()
  for (const o of orders)
    for (const it of o.items) {
      const key = `${it.bin}\u0000${it.sku || it.name}`
      const r = m.get(key)
      if (r) {
        r.qty += it.qty
        if (!r.orders.includes(o.id)) r.orders.push(o.id)
      } else m.set(key, { bin: it.bin, sku: it.sku, name: it.name, qty: it.qty, orders: [o.id] })
    }
  const cmp = new Intl.Collator('en', { numeric: true, sensitivity: 'base' }).compare
  return [...m.values()].sort((a, b) => (a.bin ? (b.bin ? cmp(a.bin, b.bin) : -1) : b.bin ? 1 : 0) || cmp(a.sku, b.sku))
}

const WIN = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
/** Keeps characters the PDF standard fonts (WinAnsi) can draw; others become "?". */
export function winAnsi(s: string): string {
  return [...s.replace(/\r/g, '')].map((c) => {
    const code = c.charCodeAt(0)
    return c === '\n' || (code >= 32 && code <= 126) || (code >= 160 && code <= 255) || WIN.includes(c) ? c : '?'
  }).join('')
}

/** Splits item rows into pages: the first page holds `first` rows, the following ones `rest` rows. */
export function paginate<T>(rows: T[], first: number, rest: number): T[][] {
  const out: T[][] = [rows.slice(0, Math.max(1, first))]
  for (let i = Math.max(1, first); i < rows.length; i += Math.max(1, rest)) out.push(rows.slice(i, i + Math.max(1, rest)))
  return out
}

export const SAMPLE_CSV = `order_id,date,ship_name,ship_address,ship_method,note,sku,item,qty,bin
10241,2026-10-16,Riley Moreno,48 Alder Lane | Apt 3 | Springfield OR 97477,USPS Ground Advantage,Gift — please leave out the receipt,MUG-12-BLU,Stoneware mug 12 oz (blue),2,A-03
10241,2026-10-16,Riley Moreno,48 Alder Lane | Apt 3 | Springfield OR 97477,USPS Ground Advantage,Gift — please leave out the receipt,TEA-SAMPLER,Loose-leaf tea sampler (6 tins),1,C-11
10242,2026-10-16,Sam Okafor,12 Harbor View Rd | Portland ME 04101,UPS 2nd Day Air,,CANDLE-CED,Cedar & sage candle,3,B-07
10242,2026-10-16,Sam Okafor,12 Harbor View Rd | Portland ME 04101,UPS 2nd Day Air,,MUG-12-BLU,Stoneware mug 12 oz (blue),1,A-03
10242,2026-10-16,Sam Okafor,12 Harbor View Rd | Portland ME 04101,UPS 2nd Day Air,,COAST-4,Cork coaster set (4),2,A-10
10243,2026-10-17,Jordan Lee,900 Prairie Ave | Unit 12 | Omaha NE 68102,FedEx Home,Fragile,PLANTER-SM,Ceramic planter small,1,B-02
10243,2026-10-17,Jordan Lee,900 Prairie Ave | Unit 12 | Omaha NE 68102,FedEx Home,Fragile,TEA-SAMPLER,Loose-leaf tea sampler (6 tins),2,C-11`

export type PageSize = 'letter' | 'a4' | '4x6'
export interface SlipOpts { company: string; from: string; footer: string; page: PageSize; bins: boolean; picklist: boolean }
export const SIZES: Record<PageSize, [number, number]> = { letter: [612, 792], a4: [595.28, 841.89], '4x6': [288, 432] }

export const canBarcode = (s: string) => /^[\x20-\x7e]{1,40}$/.test(s)

/** Packing slips (one or more pages per order) plus an optional pick-list, as PDF bytes. */
export async function buildPdf(s: SlipOpts, orders: Order[]): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  doc.setTitle(`Packing slips ${orders.map((o) => o.id).join(', ')}`)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const [PW, PH] = SIZES[s.page]
  const small = s.page === '4x6'
  const k = small ? 0.62 : 1
  const M = small ? 16 : 40
  const grey = rgb(0.42, 0.45, 0.5), ink = rgb(0.07, 0.09, 0.13), line = rgb(0.82, 0.84, 0.87), zebra = rgb(0.96, 0.97, 0.98)
  type P = ReturnType<typeof doc.addPage>
  const text = (p: P, str: string, x: number, y: number, size: number, f = font, color = ink, maxW?: number) => {
    let t = winAnsi(str)
    if (maxW) while (t.length > 1 && f.widthOfTextAtSize(t, size) > maxW) t = t.slice(0, -2) + '…'
    p.drawText(t, { x, y, size, font: f, color })
  }
  const right = (p: P, str: string, xr: number, y: number, size: number, f = font, color = ink) => text(p, str, xr - f.widthOfTextAtSize(winAnsi(str), size), y, size, f, color)
  const barcode = (p: P, value: string, x: number, y: number, h: number, mw: number) => {
    if (!canBarcode(value)) return
    let cx = x
    code128Widths(value).forEach((w, i) => {
      if (i % 2 === 0) p.drawRectangle({ x: cx, y, width: w * mw, height: h, color: rgb(0, 0, 0) })
      cx += w * mw
    })
    text(p, value, x + ((cx - x) - font.widthOfTextAtSize(value, 8 * k)) / 2, y - 9 * k, 8 * k, font, grey)
  }
  const rowH = 20 * k, bottom = M + 30 * k
  const headH = (small ? 275 : 232) * k, contH = 46 * k
  const cols = s.bins ? [0.07, 0.09, 0.22, 0.47, 0.15] : [0.08, 0.1, 0.25, 0.57, 0] // check, qty, sku, item, bin
  const tableHead = (p: P, y: number) => {
    const W = PW - 2 * M
    p.drawRectangle({ x: M, y: y - 6 * k, width: W, height: rowH, color: rgb(0.11, 0.14, 0.2) })
    let x = M
    ;['', 'Qty', 'SKU', 'Item', s.bins ? 'Bin' : ''].forEach((h, i) => {
      if (cols[i] && h) text(p, h, x + 5 * k, y, 9 * k, bold, rgb(1, 1, 1))
      x += cols[i] * W
    })
    return y - rowH
  }
  for (const o of orders) {
    const perFirst = Math.max(1, Math.floor((PH - M - headH - bottom) / rowH) - 1)
    const perRest = Math.max(1, Math.floor((PH - M - contH - bottom) / rowH) - 1)
    const pages = paginate(o.items, perFirst, perRest)
    pages.forEach((items, pi) => {
      const p = doc.addPage([PW, PH])
      let y = PH - M
      if (pi === 0) {
        text(p, s.company, M, y - 14 * k, 15 * k, bold)
        s.from.split('\n').slice(0, 4).forEach((l, i) => text(p, l, M, y - (30 + i * 11) * k, 9 * k, font, grey))
        const tx = small ? M : PW - M
        const ty = small ? y - 86 * k : y
        if (small) text(p, 'PACKING SLIP', tx, ty - 14 * k, 14 * k, bold)
        else right(p, 'PACKING SLIP', tx, ty - 14 * k, 18 * k, bold)
        const meta = [`Order #${o.id}`, o.date ? `Date: ${o.date}` : '', o.method ? `Ship via: ${o.method}` : ''].filter(Boolean)
        meta.forEach((m, i) => (small ? text(p, m, tx, ty - (30 + i * 11) * k, 9 * k) : right(p, m, tx, ty - (32 + i * 12) * k, 10 * k)))
        const bw = (code128Widths(canBarcode(o.id) ? o.id : 'X').reduce((a, b) => a + b, 0)) * 1.1 * k
        barcode(p, o.id, PW - M - bw, small ? ty - 66 * k : ty - 100 * k, 32 * k, 1.1 * k)
        y -= (small ? 165 : 118) * k
        p.drawLine({ start: { x: M, y }, end: { x: PW - M, y }, thickness: 1, color: line })
        text(p, 'SHIP TO', M, y - 16 * k, 8 * k, bold, grey)
        const addr = [o.name, ...o.address.split('\n')].filter(Boolean).slice(0, 5)
        addr.forEach((l, i) => text(p, l, M, y - (30 + i * 12) * k, (i ? 10 : 11) * k, i ? font : bold, ink, PW / 2 - M))
        if (o.note) {
          text(p, 'NOTE', PW / 2 + 10 * k, y - 16 * k, 8 * k, bold, grey)
          const words = winAnsi(o.note).split(/\s+/)
          let ln = '', row = 0
          for (const w of [...words, '']) {
            if (w && font.widthOfTextAtSize(`${ln} ${w}`, 10 * k) < PW / 2 - M - 10 * k) ln = ln ? `${ln} ${w}` : w
            else {
              if (row < 4) text(p, ln, PW / 2 + 10 * k, y - (30 + row * 12) * k, 10 * k)
              row++
              ln = w
            }
          }
        }
        y = PH - M - headH + rowH
      } else {
        text(p, `${s.company} · Order #${o.id} (continued)`, M, y - 14 * k, 11 * k, bold)
        y = PH - M - contH + rowH
      }
      y = tableHead(p, y)
      const W = PW - 2 * M
      items.forEach((it, i) => {
        if (i % 2) p.drawRectangle({ x: M, y: y - 6 * k, width: W, height: rowH, color: zebra })
        let x = M
        p.drawRectangle({ x: x + 6 * k, y: y - 2 * k, width: 9 * k, height: 9 * k, borderColor: grey, borderWidth: 0.8 })
        x += cols[0] * W
        text(p, String(it.qty), x + 5 * k, y, 10 * k, bold)
        x += cols[1] * W
        text(p, it.sku, x + 5 * k, y, 9 * k, font, ink, cols[2] * W - 8 * k)
        x += cols[2] * W
        text(p, it.name, x + 5 * k, y, 10 * k, font, ink, cols[3] * W - 8 * k)
        x += cols[3] * W
        if (s.bins) text(p, it.bin, x + 5 * k, y, 9 * k, font, grey, cols[4] * W - 8 * k)
        y -= rowH
      })
      if (pi === pages.length - 1) {
        const units = o.items.reduce((a, b) => a + b.qty, 0)
        text(p, `${o.items.length} line${o.items.length === 1 ? '' : 's'} · ${units} unit${units === 1 ? '' : 's'}`, M, y - 4 * k, 9 * k, bold, grey)
        text(p, 'Packed by: ________   Checked by: ________', PW - M - font.widthOfTextAtSize('Packed by: ________   Checked by: ________', 9 * k), y - 4 * k, 9 * k, font, grey)
      }
      p.drawLine({ start: { x: M, y: M + 18 * k }, end: { x: PW - M, y: M + 18 * k }, thickness: 0.6, color: line })
      text(p, s.footer, M, M + 6 * k, 8 * k, font, grey, PW - 2 * M - 60 * k)
      right(p, `Page ${pi + 1} of ${pages.length}`, PW - M, M + 6 * k, 8 * k, font, grey)
    })
  }
  if (s.picklist && orders.length) {
    const rows = pickList(orders)
    const per = Math.max(1, Math.floor((PH - 2 * M - 80 * k) / rowH) - 1)
    const pages = paginate(rows, per, per)
    pages.forEach((rs, pi) => {
      const p = doc.addPage([PW, PH])
      const W = PW - 2 * M
      text(p, `PICK LIST${pages.length > 1 ? ` (${pi + 1}/${pages.length})` : ''}`, M, PH - M - 16 * k, 16 * k, bold)
      text(p, `${orders.length} orders · ${rows.reduce((a, r) => a + r.qty, 0)} units · sorted by bin for one walk through the shelves`, M, PH - M - 32 * k, 9 * k, font, grey, W)
      let y = PH - M - 60 * k
      const pc = [0.07, 0.13, 0.2, 0.38, 0.08, 0.14]
      p.drawRectangle({ x: M, y: y - 6 * k, width: W, height: rowH, color: rgb(0.11, 0.14, 0.2) })
      let x = M
      ;['', 'Bin', 'SKU', 'Item', 'Qty', 'Orders'].forEach((h, i) => {
        text(p, h, x + 5 * k, y, 9 * k, bold, rgb(1, 1, 1))
        x += pc[i] * W
      })
      y -= rowH
      rs.forEach((r, i) => {
        if (i % 2) p.drawRectangle({ x: M, y: y - 6 * k, width: W, height: rowH, color: zebra })
        let cx = M
        p.drawRectangle({ x: cx + 6 * k, y: y - 2 * k, width: 9 * k, height: 9 * k, borderColor: grey, borderWidth: 0.8 })
        cx += pc[0] * W
        const cells = [r.bin || '—', r.sku, r.name, String(r.qty), r.orders.join(', ')]
        cells.forEach((c, j) => {
          text(p, c, cx + 5 * k, y, (j === 3 ? 10 : 9) * k, j === 3 || j === 0 ? bold : font, ink, pc[j + 1] * W - 8 * k)
          cx += pc[j + 1] * W
        })
        y -= rowH
      })
    })
  }
  return doc.save()
}

