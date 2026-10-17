import { useMemo } from 'react'
import { Area, Btn, Check, CopyButton, CsvButton, download, Note, Num, Panel, Row, Select, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { encode, SYMS, toSvg, type Barcode, type Sym } from './lib/barcode-generator'
import { parseCsv } from './lib/barcode-label-maker'

const INFO: Record<Sym, string> = {
  ean13: 'Retail products worldwide (GTIN-13). 12 digits; the 13th check digit is added automatically.',
  upca: 'Retail products in the US and Canada (GTIN-12). 11 digits + check digit.',
  ean8: 'Small retail packages where EAN-13 does not fit. 7 digits + check digit.',
  code128: 'Logistics, shipping, SKUs and serial numbers. Any printable ASCII; digit runs are packed densely.',
  code39: 'Industrial, automotive and ID badges. Upper-case letters, digits, space and - . $ / + %.',
  itf14: 'Outer cartons and cases (GTIN-14) with a bearer frame. 13 digits + check digit.',
  itf: 'Numeric-only, compact. Even number of digits (a GS1 check digit is appended for odd input).',
}
// GS1 nominal X-dimension (mm) at 100% magnification; ITF-14 at 1.016 mm; others typical 0.25 mm
const XDIM: Record<Sym, number> = { ean13: 0.33, upca: 0.33, ean8: 0.33, code128: 0.25, code39: 0.25, itf14: 1.016, itf: 0.5 }

const DEF = {
  sym: 'ean13' as Sym,
  value: '590123412345',
  module: 3,
  height: 90,
  text: true,
  fontSize: 18,
  fg: '#000000',
  bg: '#ffffff',
  caption: '',
  check39: false,
  ratio: 3,
  batch: 'value,caption\n590123412345,Oat milk 1 L\n400638133393,Espresso beans 500 g\n871234567890,Dark chocolate 85%\n501234567890,Green tea 20 bags\n761234567890,Sparkling water 6×',
  cols: 3,
  labelW: 63.5,
}

function svgToPng(svg: string, scale: number, name: string) {
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = Math.ceil(img.width * scale)
    c.height = Math.ceil(img.height * scale)
    const g = c.getContext('2d')!
    g.imageSmoothingEnabled = false
    g.drawImage(img, 0, 0, c.width, c.height)
    c.toBlob((b) => b && download(name, b))
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

export default function BarcodeGenerator() {
  const [s, set, reset] = useToolState('barcode-generator', DEF)
  const opts = { check39: s.check39, ratio: s.ratio }
  const render = { module: s.module, height: s.height, text: s.text, fontSize: s.fontSize, fg: s.fg, bg: s.bg }

  const main = useMemo((): { b?: Barcode; svg?: string; err?: string } => {
    try {
      const b = encode(s.sym, s.value, opts)
      return { b, svg: toSvg(b, { ...render, caption: s.caption || undefined }) }
    } catch (e) {
      return { err: (e as Error).message }
    }
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps

  const batch = useMemo(() => {
    const rows = parseCsv(s.batch)
    const body = rows.length && /value|code|gtin|sku/i.test(rows[0][0] ?? '') ? rows.slice(1) : rows
    return body.map(([value = '', caption = '']) => {
      try {
        const b = encode(s.sym, value, opts)
        return { value, caption, b, svg: toSvg(b, { ...render, caption: caption || undefined }) }
      } catch (e) {
        return { value, caption, err: (e as Error).message }
      }
    })
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps
  const okRows = batch.filter((r) => r.svg)

  const name = `${s.sym}-${(main.b?.code ?? s.value).replace(/[^\w-]+/g, '_')}`
  const x = XDIM[s.sym]
  const b = main.b
  const physW = b ? (b.width + b.quiet[0] + b.quiet[1] + (b.bearer ? 9.6 : 0)) * x : 0

  const printSheet = () => {
    const w = window.open('', '_blank')
    if (!w) return
    const cells = okRows.map((r) => `<div class="c">${r.svg}</div>`).join('')
    w.document.write(`<!doctype html><title>Barcode labels</title><style>@page{margin:10mm}body{margin:0;font-family:sans-serif}.g{display:grid;grid-template-columns:repeat(${s.cols},${s.labelW}mm);gap:2mm}.c{border:1px dashed #ccc;padding:2mm;display:flex;justify-content:center;align-items:center;break-inside:avoid}.c svg{max-width:100%;height:auto}@media print{.c{border-color:#eee}}</style><div class="g">${cells}</div><script>onload=()=>setTimeout(()=>print(),200)</script>`)
    w.document.close()
  }

  const sheetSvg = () => {
    const items = okRows.map((r) => {
      const m = /width="([\d.]+)" height="([\d.]+)"/.exec(r.svg!)!
      return { svg: r.svg!, w: Number(m[1]), h: Number(m[2]) }
    })
    const cw = Math.max(0, ...items.map((i) => i.w)) + 20, ch = Math.max(0, ...items.map((i) => i.h)) + 20
    const W = cw * s.cols, H = ch * Math.ceil(items.length / s.cols)
    const inner = items.map((it, i) => `<g transform="translate(${(i % s.cols) * cw + (cw - it.w) / 2},${Math.floor(i / s.cols) * ch + 10})">${it.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')}</g>`).join('')
    download(`barcodes-${s.sym}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>${inner}</svg>`, 'image/svg+xml')
  }

  return (
    <Split>
      <div>
        <Panel title="Barcode" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Symbology" value={s.sym} onChange={(sym) => set({ sym, value: SYMS.find((x) => x[0] === sym)![2] })} options={SYMS.map(([v, l]) => [v, l] as const)} />
          <Txt label="Value" value={s.value} onChange={(value) => set({ value })} hint={INFO[s.sym]} />
          {main.err && <Note tone="err">{main.err}</Note>}
          <Txt label="Caption above (optional)" value={s.caption} onChange={(caption) => set({ caption })} placeholder="e.g. product name" />
          {s.sym === 'code39' && <Check label="Add mod-43 check character" value={s.check39} onChange={(check39) => set({ check39 })} />}
          {(s.sym === 'code39' || s.sym === 'itf' || s.sym === 'itf14') && <Slider label="Wide : narrow ratio" value={s.ratio} onChange={(ratio) => set({ ratio })} min={2} max={3.5} step={0.1} show={(v) => v.toFixed(1)} unit=" : 1" />}
        </Panel>
        <Panel title="Look">
          <Row>
            <Num label="Module (bar) width" value={s.module} onChange={(module) => set({ module })} unit="px" min={1} max={10} step={0.5} />
            <Num label="Bar height" value={s.height} onChange={(height) => set({ height })} unit="px" min={10} max={400} />
          </Row>
          <Row>
            <Num label="Font size" value={s.fontSize} onChange={(fontSize) => set({ fontSize })} unit="px" min={6} max={48} />
            <label className="k-field"><span className="k-label">Bars</span><input type="color" value={s.fg} onChange={(e) => set({ fg: e.target.value })} /></label>
            <label className="k-field"><span className="k-label">Background</span><input type="color" value={s.bg} onChange={(e) => set({ bg: e.target.value })} /></label>
          </Row>
          <Check label="Human-readable text" value={s.text} onChange={(text) => set({ text })} />
          <Note tone="warn">Keep dark bars on a light background with enough contrast; red, yellow or light-blue bars do not scan with red-laser scanners.</Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Encoded" value={<span style={{ fontSize: '0.8em', wordBreak: 'break-all' }}>{b?.code ?? '—'}</span>} tone={b ? 'good' : 'bad'} />
          <Stat label="Modules" value={b ? b.width : '—'} sub={`+ quiet zones ${b ? b.quiet.join(' / ') : ''}`} />
          <Stat label="Print width" value={b ? `${physW.toFixed(1)} mm` : '—'} sub={`X = ${x} mm module`} />
          <Stat label="Bars" value={b?.bars.length ?? '—'} />
        </Stats>
        <Panel
          title="Preview"
          actions={main.svg && (
            <>
              <Btn onClick={() => download(name + '.svg', main.svg!, 'image/svg+xml')}>⬇ SVG</Btn>
              <Btn onClick={() => svgToPng(main.svg!, 3, name + '.png')}>⬇ PNG</Btn>
              <CopyButton text={main.svg} label="SVG" />
            </>
          )}
        >
          <div style={{ display: 'flex', justifyContent: 'center', padding: 16, background: 'repeating-conic-gradient(#8881 0 25%, transparent 0 50%) 0 0/16px 16px', borderRadius: 8, overflowX: 'auto' }}>
            {main.svg ? <div style={{ maxWidth: '100%' }} dangerouslySetInnerHTML={{ __html: main.svg.replace(/width="[\d.]+" height="[\d.]+"/, (m) => m + ' style="max-width:100%;height:auto"') }} /> : <span className="muted">Fix the value to see the barcode.</span>}
          </div>
          <p className="k-hint">PNG is rendered at 3× for crisp printing. SVG stays sharp at any size, which is best for packaging artwork.</p>
        </Panel>
        <Panel
          title={`Batch (${okRows.length} ok${batch.length - okRows.length ? `, ${batch.length - okRows.length} invalid` : ''})`}
          actions={
            <>
              <Btn onClick={printSheet} disabled={!okRows.length}>🖨 Print sheet</Btn>
              <Btn onClick={sheetSvg} disabled={!okRows.length}>⬇ Sheet SVG</Btn>
              <CsvButton name="barcodes.csv" rows={() => [['input', 'caption', 'encoded', 'error'], ...batch.map((r) => [r.value, r.caption, r.b?.code ?? '', r.err ?? ''])]} />
            </>
          }
        >
          <Area value={s.batch} onChange={(batch) => set({ batch })} rows={6} mono />
          <Row>
            <Num label="Columns" value={s.cols} onChange={(cols) => set({ cols: Math.max(1, Math.min(8, Math.round(cols))) })} min={1} max={8} step={1} />
            <Num label="Label width (print)" value={s.labelW} onChange={(labelW) => set({ labelW })} unit="mm" min={20} max={200} />
          </Row>
          <p className="k-hint">One code per line, optional caption after a comma. Paste a column from a spreadsheet. Uses the symbology and look selected above.</p>
          {batch.filter((r) => r.err).map((r, i) => <Note key={i} tone="err">“{r.value}”: {r.err}</Note>)}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${Math.min(260, 600 / s.cols + 60)}px, 1fr))`, gap: 10, marginTop: 10 }}>
            {okRows.map((r, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 6, padding: 6, display: 'flex', justifyContent: 'center', border: '1px solid var(--line)' }} dangerouslySetInnerHTML={{ __html: r.svg!.replace(/width="[\d.]+" height="[\d.]+"/, (m) => m + ' style="max-width:100%;height:auto"') }} />
            ))}
          </div>
        </Panel>
      </div>
    </Split>
  )
}
