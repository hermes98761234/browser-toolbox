import { useEffect, useRef, useState } from 'react'
import { Btn, Check, download, Note, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'

interface State { w: number; h: number; cells: string; palette: string[]; sts: number; rows: number; zoom: number; row: number; repX: number; repY: number; numbers: boolean }

/** Fair Isle style sample: peerie borders and a diamond lattice in a 12-stitch repeat. */
function sample(w = 24, h = 20): string {
  let out = ''
  for (let r = 0; r < h; r++) {
    for (let x = 0; x < w; x++) {
      let c = 0
      if (r === 0 || r === h - 1) c = x % 4 === 1 ? 2 : 0
      else if (r === 1 || r === h - 2) c = 3
      else {
        const lx = x % 12, ly = r - 2
        const d = Math.abs(lx - 5.5) + Math.abs(ly - 7.5)
        c = d >= 5 && d < 6 ? 1 : d < 2 ? 2 : d > 8.5 && (lx + ly) % 2 === 0 ? 2 : (lx === 0 || lx === 11) && ly % 4 === 1 ? 1 : 0
      }
      out += c.toString(36)
    }
  }
  return out
}

const DEF: State = {
  w: 24, h: 20, cells: sample(), palette: ['#f5efe0', '#1e3a5f', '#c0392b', '#d4a017'], sts: 24, rows: 30, zoom: 22, row: 1, repX: 3, repY: 2, numbers: true,
}
const MAX_COLORS = 12
type Tool = 'paint' | 'fill' | 'pick'

const at = (s: State, x: number, y: number) => parseInt(s.cells[y * s.w + x] ?? '0', 36) || 0

/** Draws the chart; `y` 0 is the top row (row number h at top, 1 at bottom). */
function drawChart(c: HTMLCanvasElement, s: State, cw: number, ch: number, gutter: number, highlight: boolean) {
  const W = s.w * cw + gutter * 2, H = s.h * ch + gutter
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, W, H)
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    g.fillStyle = s.palette[at(s, x, y)] ?? '#fff'
    g.fillRect(gutter + x * cw, y * ch, cw, ch)
  }
  g.strokeStyle = 'rgba(0,0,0,0.25)'
  g.lineWidth = 1
  g.beginPath()
  for (let x = 0; x <= s.w; x++) { g.moveTo(gutter + x * cw + 0.5, 0); g.lineTo(gutter + x * cw + 0.5, s.h * ch) }
  for (let y = 0; y <= s.h; y++) { g.moveTo(gutter, y * ch + 0.5); g.lineTo(gutter + s.w * cw, y * ch + 0.5) }
  g.stroke()
  // every 10th line darker, counted from bottom-right like a knitter reads
  g.strokeStyle = 'rgba(0,0,0,0.6)'
  g.beginPath()
  for (let k = 10; k < s.w; k += 10) { const x = gutter + (s.w - k) * cw + 0.5; g.moveTo(x, 0); g.lineTo(x, s.h * ch) }
  for (let k = 10; k < s.h; k += 10) { const y = (s.h - k) * ch + 0.5; g.moveTo(gutter, y); g.lineTo(gutter + s.w * cw, y) }
  g.stroke()
  if (highlight && s.row >= 1 && s.row <= s.h) {
    const y = (s.h - s.row) * ch
    g.fillStyle = 'rgba(15,23,42,0.16)'
    g.fillRect(gutter, 0, s.w * cw, y)
    g.fillRect(gutter, y + ch, s.w * cw, s.h * ch - y - ch)
    g.strokeStyle = '#f43f5e'
    g.lineWidth = 3
    g.strokeRect(gutter - 1, y - 1, s.w * cw + 2, ch + 2)
  }
  if (gutter > 0) {
    g.fillStyle = '#334155'
    g.font = `${Math.min(12, ch * 0.75)}px system-ui, sans-serif`
    g.textBaseline = 'middle'
    for (let r = 1; r <= s.h; r++) {
      const y = (s.h - r) * ch + ch / 2
      // right side = right-side (odd) rows, left side = wrong-side (even) rows for flat knitting
      if (r % 2) { g.textAlign = 'left'; g.fillText(String(r), gutter + s.w * cw + 4, y) }
      else { g.textAlign = 'right'; g.fillText(String(r), gutter - 4, y) }
    }
    g.textAlign = 'center'
    g.textBaseline = 'top'
    for (let k = 1; k <= s.w; k++) if (k === 1 || k % 5 === 0) g.fillText(String(k), gutter + (s.w - k) * cw + cw / 2, s.h * ch + 4)
  }
}

export default function KnittingChartMaker() {
  const [s, set, reset] = useToolState('knitting-chart-maker', DEF)
  const [color, setColor] = useState(1)
  const [tool, setTool] = useState<Tool>('paint')
  const [mirror, setMirror] = useState(false)
  const [undo, setUndo] = useState<string[]>([])
  const [newSize, setNewSize] = useState({ w: s.w, h: s.h })
  const canvas = useRef<HTMLCanvasElement>(null)
  const prev = useRef<HTMLCanvasElement>(null)
  const painting = useRef(false)
  const cw = s.zoom, ch = Math.round(s.zoom * (s.sts / s.rows) * 10) / 10
  const gutter = s.numbers ? 26 : 0

  useEffect(() => {
    if (canvas.current) drawChart(canvas.current, s, cw, ch, gutter, true)
    const p = prev.current
    if (p) {
      const pw = Math.max(2, Math.floor(Math.min(520 / (s.w * s.repX), 6)))
      const ph = pw * (s.sts / s.rows)
      p.width = s.w * s.repX * pw
      p.height = Math.ceil(s.h * s.repY * ph)
      const g = p.getContext('2d')!
      for (let ry = 0; ry < s.repY; ry++) for (let rx = 0; rx < s.repX; rx++)
        for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
          g.fillStyle = s.palette[at(s, x, y)] ?? '#fff'
          g.fillRect((rx * s.w + x) * pw, (ry * s.h + y) * ph, pw + 0.5, ph + 0.5)
        }
    }
  }, [s, cw, ch, gutter])

  const cellAt = (e: React.PointerEvent): [number, number] | null => {
    const r = canvas.current!.getBoundingClientRect()
    const k = canvas.current!.width / r.width
    const x = Math.floor(((e.clientX - r.left) * k - gutter) / cw)
    const y = Math.floor(((e.clientY - r.top) * k) / ch)
    return x >= 0 && y >= 0 && x < s.w && y < s.h ? [x, y] : null
  }
  const setCells = (cells: string, snapshot = true) => {
    if (snapshot) setUndo((u) => [...u.slice(-49), s.cells])
    set({ cells })
  }
  const paint = (x: number, y: number, first: boolean) => {
    const v = color.toString(36)
    set((st) => {
      const arr = st.cells.split('')
      arr[y * st.w + x] = v
      if (mirror) arr[y * st.w + (st.w - 1 - x)] = v
      return { ...st, cells: arr.join('') }
    })
    if (first) setUndo((u) => [...u.slice(-49), s.cells])
  }
  const flood = (x: number, y: number) => {
    const target = at(s, x, y)
    if (target === color) return
    const arr = s.cells.split('')
    const st: [number, number][] = [[x, y]]
    while (st.length) {
      const [cx, cy] = st.pop()!
      if (cx < 0 || cy < 0 || cx >= s.w || cy >= s.h) continue
      if ((parseInt(arr[cy * s.w + cx], 36) || 0) !== target) continue
      arr[cy * s.w + cx] = color.toString(36)
      st.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1])
    }
    setCells(arr.join(''))
  }
  const onDown = (e: React.PointerEvent) => {
    const c = cellAt(e)
    if (!c) return
    if (tool === 'pick') { setColor(at(s, c[0], c[1])); setTool('paint'); return }
    if (tool === 'fill') return flood(c[0], c[1])
    e.currentTarget.setPointerCapture(e.pointerId)
    painting.current = true
    paint(c[0], c[1], true)
  }
  const onMove = (e: React.PointerEvent) => {
    if (!painting.current) return
    const c = cellAt(e)
    if (c && at(s, c[0], c[1]) !== color) paint(c[0], c[1], false)
  }

  const resize = (w: number, h: number) => {
    // keep the bottom-right aligned content (row 1 / stitch 1 stay put)
    let out = ''
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = x - (w - s.w), sy = y - (h - s.h)
      out += sx >= 0 && sy >= 0 && sx < s.w && sy < s.h ? s.cells[sy * s.w + sx] : '0'
    }
    setUndo((u) => [...u.slice(-49), s.cells])
    set({ w, h, cells: out, row: Math.min(s.row, h) })
  }
  const transform = (f: (x: number, y: number) => [number, number]) => {
    let out = ''
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const [sx, sy] = f(x, y); out += s.cells[sy * s.w + sx] }
    setCells(out)
  }

  // per-row analysis for the highlighted row (read right → left on RS rows)
  const ry = s.h - s.row
  const rowCells = Array.from({ length: s.w }, (_, x) => at(s, x, ry))
  const readOrder = s.row % 2 ? [...rowCells].reverse() : rowCells
  const runs: [number, number][] = []
  for (const c of readOrder) { if (runs.length && runs[runs.length - 1][0] === c) runs[runs.length - 1][1]++; else runs.push([c, 1]) }
  const colorsInRow = new Set(rowCells).size
  let longestFloat = 0
  for (let y = 0; y < s.h; y++) {
    // a float only exists in rows that use more than one colour
    if (new Set(Array.from({ length: s.w }, (_, k) => at(s, k, y))).size < 2) continue
    let run = 1
    for (let x = 1; x < s.w; x++) {
      run = at(s, x, y) === at(s, x - 1, y) ? run + 1 : 1
      longestFloat = Math.max(longestFloat, run)
    }
  }
  const counts = s.palette.map((_, i) => [...s.cells].filter((ch2) => (parseInt(ch2, 36) || 0) === i).length)

  const exportPng = () => {
    const c = document.createElement('canvas')
    drawChart(c, s, Math.max(cw, 20), Math.max(ch, 16), 28, false)
    c.toBlob((b) => b && download('knitting-chart.png', b))
  }
  const exportPdf = async () => {
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const page = doc.addPage(s.w > s.h ? [842, 595] : [595, 842])
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const [PW, PH] = [page.getWidth(), page.getHeight()]
    const cell = Math.min((PW - 100) / s.w, (PH - 170) / (s.h * (s.sts / s.rows)))
    const chh = cell * (s.sts / s.rows)
    const x0 = (PW - s.w * cell) / 2, y0 = 100
    const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)
    page.drawText(`Knitting chart — ${s.w} sts × ${s.h} rows`, { x: 50, y: PH - 50, size: 16, font })
    page.drawText(`Gauge ${s.sts} sts × ${s.rows} rows = 10 cm · finished repeat ≈ ${(s.w / s.sts * 10).toFixed(1)} × ${(s.h / s.rows * 10).toFixed(1)} cm`, { x: 50, y: PH - 70, size: 10, font })
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      page.drawRectangle({ x: x0 + x * cell, y: y0 + (s.h - 1 - y) * chh, width: cell, height: chh, color: hex(s.palette[at(s, x, y)] ?? '#ffffff'), borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.4 })
    }
    const fs = Math.min(8, chh * 0.8)
    for (let r = 1; r <= s.h; r++) {
      const y = y0 + (r - 1) * chh + chh / 2 - fs / 3
      if (r % 2) page.drawText(String(r), { x: x0 + s.w * cell + 3, y, size: fs, font })
      else page.drawText(String(r), { x: x0 - 3 - font.widthOfTextAtSize(String(r), fs), y, size: fs, font })
    }
    s.palette.forEach((p, i) => {
      page.drawRectangle({ x: 50 + i * 90, y: 50, width: 14, height: 14, color: hex(p), borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 0.5 })
      page.drawText(`Colour ${String.fromCharCode(65 + i)} (${counts[i]})`, { x: 68 + i * 90, y: 53, size: 9, font })
    })
    download('knitting-chart.pdf', new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' }))
  }

  return (
    <Split wide="left">
      <div>
        <Panel
          title="Chart"
          actions={
            <>
              <Btn disabled={!undo.length} onClick={() => { set({ cells: undo[undo.length - 1] }); setUndo(undo.slice(0, -1)) }}>↶ Undo</Btn>
              <Btn onClick={exportPng}>⬇ PNG</Btn>
              <Btn onClick={() => void exportPdf()}>⬇ PDF</Btn>
            </>
          }
        >
          <Row>
            <Seg value={tool} onChange={setTool} options={[['paint', '🖌 Paint'], ['fill', '🪣 Fill'], ['pick', '💧 Pick']]} />
            <Check label="Mirror left/right" value={mirror} onChange={setMirror} />
          </Row>
          <Row>
            {s.palette.map((p, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <button type="button" onClick={() => { setColor(i); if (tool === 'pick') setTool('paint') }} title={`Colour ${String.fromCharCode(65 + i)} · ${counts[i]} sts`} style={{ width: 34, height: 34, borderRadius: 8, background: p, border: i === color ? '3px solid var(--accent)' : '1px solid var(--line)', cursor: 'pointer', fontWeight: 700, color: '#0008' }}>
                  {String.fromCharCode(65 + i)}
                </button>
                {i === color && <input type="color" value={p} onChange={(e) => set({ palette: s.palette.map((q, j) => (j === i ? e.target.value : q)) })} aria-label="Edit colour" style={{ width: 28, height: 28, padding: 0, border: 0, background: 'none' }} />}
              </span>
            ))}
            <Btn kind="ghost" disabled={s.palette.length >= MAX_COLORS} onClick={() => { set({ palette: [...s.palette, '#6b8e23'] }); setColor(s.palette.length) }}>+ colour</Btn>
          </Row>
          <div style={{ overflow: 'auto', maxHeight: 640, border: '1px solid var(--line)', borderRadius: 10, marginTop: 8 }}>
            <canvas
              ref={canvas}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={() => (painting.current = false)}
              onPointerCancel={() => (painting.current = false)}
              style={{ display: 'block', touchAction: 'none', cursor: tool === 'pick' ? 'copy' : 'crosshair' }}
            />
          </div>
          <Row>
            <Btn onClick={() => set({ row: Math.max(1, s.row - 1) })}>▼ Prev row</Btn>
            <b>Row {s.row} <span className="muted">({s.row % 2 ? 'RS, read right → left' : 'WS, read left → right'})</span></b>
            <Btn kind="primary" onClick={() => set({ row: s.row >= s.h ? 1 : s.row + 1 })}>▲ Next row</Btn>
          </Row>
          <p className="mono" style={{ fontSize: 13, overflowWrap: 'anywhere' }}>
            {runs.map(([c, n], i) => <span key={i} style={{ marginRight: 8 }}><i style={{ display: 'inline-block', width: 10, height: 10, background: s.palette[c], border: '1px solid #0004', marginRight: 3 }} />{String.fromCharCode(65 + c)}×{n}</span>)}
          </p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Size" value={`${s.w} × ${s.h}`} sub="stitches × rows" />
          <Stat label="Repeat measures" value={`${(s.w / s.sts * 10).toFixed(1)} × ${(s.h / s.rows * 10).toFixed(1)} cm`} sub={`at ${s.sts} sts / ${s.rows} rows per 10 cm`} />
          <Stat label="Colours in this row" value={colorsInRow} tone={colorsInRow > 2 ? 'bad' : undefined} sub={colorsInRow > 2 ? 'more than 2 is hard for stranding' : 'stranding friendly'} />
          <Stat label="Longest float" value={`${longestFloat} sts`} tone={longestFloat > 5 ? 'bad' : 'good'} sub={longestFloat > 5 ? 'catch floats longer than 5' : 'fine for Fair Isle'} />
        </Stats>
        <Panel title="Repeat preview">
          <Row>
            <Slider label="Across" value={s.repX} onChange={(repX) => set({ repX })} min={1} max={6} />
            <Slider label="Up" value={s.repY} onChange={(repY) => set({ repY })} min={1} max={4} />
          </Row>
          <div style={{ overflow: 'auto' }}><canvas ref={prev} style={{ display: 'block', maxWidth: '100%', borderRadius: 6 }} /></div>
        </Panel>
        <Panel title="Grid & gauge">
          <Row>
            <Num label="Stitches" value={newSize.w} onChange={(w) => setNewSize({ ...newSize, w })} min={4} max={200} step={1} />
            <Num label="Rows" value={newSize.h} onChange={(h) => setNewSize({ ...newSize, h })} min={4} max={200} step={1} />
          </Row>
          <Btn disabled={newSize.w === s.w && newSize.h === s.h} onClick={() => resize(Math.max(4, Math.min(200, Math.round(newSize.w))), Math.max(4, Math.min(200, Math.round(newSize.h))))}>Apply size</Btn>
          <Row>
            <Num label="Gauge: sts / 10 cm" value={s.sts} onChange={(sts) => sts > 0 && set({ sts })} min={4} max={60} />
            <Num label="rows / 10 cm" value={s.rows} onChange={(rows) => rows > 0 && set({ rows })} min={4} max={80} />
          </Row>
          <Slider label="Cell size" value={s.zoom} onChange={(zoom) => set({ zoom })} min={8} max={40} unit=" px" />
          <Check label="Row & stitch numbers" value={s.numbers} onChange={(numbers) => set({ numbers })} />
          <Row>
            <Btn kind="ghost" onClick={() => transform((x, y) => [s.w - 1 - x, y])}>⇋ Flip H</Btn>
            <Btn kind="ghost" onClick={() => transform((x, y) => [x, s.h - 1 - y])}>⇵ Flip V</Btn>
            <Btn kind="ghost" onClick={() => transform((x, y) => [(x + 1) % s.w, y])}>⇠ Shift</Btn>
            <Btn kind="ghost" onClick={() => transform((x, y) => [x, (y + 1) % s.h])}>⇡ Shift</Btn>
            <Btn kind="ghost" onClick={() => setCells('0'.repeat(s.w * s.h))}>Clear</Btn>
            <Btn kind="ghost" onClick={() => { reset(); setNewSize({ w: DEF.w, h: DEF.h }); setUndo([]) }}>Sample</Btn>
          </Row>
        </Panel>
        <Note tone="ok"><span>Cells are drawn in the true stitch proportion from your gauge, so the chart looks like the knitted fabric. Rows are numbered from the bottom; odd rows (right-side) are read right to left.</span></Note>
      </div>
    </Split>
  )
}
