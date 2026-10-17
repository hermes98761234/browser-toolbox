import { useState } from 'react'
import { Btn, Check, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, download, num, useToolState } from '../kit'
import { DEFAULTS, area, attachments, bbox, beaufort, bridle, minWind, offset, outline, spars, tiling, type KiteParams, type Pt, type Shape } from './lib/kite-designer'

interface State { shape: Shape; params: Record<Shape, KiteParams>; hem: number; gsm: number; sparGpm: number; paper: 'a4' | 'letter'; overlap: number; half: boolean; grid: boolean }
const DEF: State = { shape: 'diamond', params: DEFAULTS, hem: 15, gsm: 40, sparGpm: 22, paper: 'a4', overlap: 10, half: true, grid: true }
const PAPER = { a4: [210, 297], letter: [215.9, 279.4] } as const
const MARGIN = 10 // mm, printer-safe
const MM = 72 / 25.4

/** Clip a polygon to x ≥ 0 (Sutherland–Hodgman) for half patterns. */
function clipRight(poly: Pt[]): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const ina = a[0] >= -1e-9, inb = b[0] >= -1e-9
    if (ina) out.push(a)
    if (ina !== inb) { const t = a[0] / (a[0] - b[0]); out.push([0, a[1] + t * (b[1] - a[1])]) }
  }
  return out
}

/** Part of segment a–b with x ≥ 0, or null. */
function clipSeg(a: Pt, b: Pt): [Pt, Pt] | null {
  if (a[0] < 0 && b[0] < 0) return null
  if (a[0] >= 0 && b[0] >= 0) return [a, b]
  const t = a[0] / (a[0] - b[0]), m: Pt = [0, a[1] + t * (b[1] - a[1])]
  return a[0] < 0 ? [m, b] : [a, m]
}

function pattern(p: KiteParams, hem: number, half: boolean) {
  const sew = outline(p)
  const cut = offset(sew, hem)
  return { sew: half ? clipRight(sew) : sew, cut: half ? clipRight(cut) : cut }
}

export default function KiteDesigner() {
  const [s, set, reset] = useToolState('kite-designer', DEF)
  const [busy, setBusy] = useState(false)
  const p = s.params[s.shape]
  const setP = (patch: Partial<KiteParams>) => set({ params: { ...s.params, [s.shape]: { ...p, ...patch } } })
  const sail = outline(p)
  const A = area(sail)
  const br = bridle(p)
  const sp = spars(p)
  const wind = minWind(p, s.gsm, s.sparGpm)
  const pat = pattern(p, s.hem, s.half)
  const bb = bbox(pat.cut)
  const [pw, ph] = PAPER[s.paper]
  const tl = tiling(bb.w + 10, bb.h + 10, pw - 2 * MARGIN, ph - 2 * MARGIN, s.overlap)
  const [a1, a2] = attachments(p)

  // ---------- plan-view SVG ----------
  const full = offset(sail, s.hem)
  const fb = bbox(full)
  const pad = 40
  const vb = `${fb.x - pad} ${fb.y - pad} ${fb.w + 2 * pad + p.bridleDepth + 140} ${fb.h + 2 * pad}`
  const poly = (pts: Pt[]) => pts.map((q) => q.join(',')).join(' ')
  const sx = fb.x + fb.w + pad + 10 // side view origin x
  const sparLines: [Pt, Pt][] = p.shape === 'diamond' ? [[[0, 0], [0, p.spine]], [[-p.span / 2, p.crossAt * p.spine], [p.span / 2, p.crossAt * p.spine]]]
    : p.shape === 'delta' ? [[[0, 0], [0, p.spine]], [[0, 0], [-p.span / 2, p.tipDrop]], [[0, 0], [p.span / 2, p.tipDrop]], [[-p.spreaderAt * p.span / 2, p.spreaderAt * p.tipDrop], [p.spreaderAt * p.span / 2, p.spreaderAt * p.tipDrop]]]
    : [[[0, 0], [0, p.spine]], [[-p.span / 2, 0.2 * p.spine], [p.span / 2, 0.2 * p.spine]], [[-p.span / 2, 0.8 * p.spine], [p.span / 2, 0.8 * p.spine]]]
  const sw = Math.max(fb.w, fb.h) / 160
  const tileRects: { x: number; y: number; w: number; h: number; label: string }[] = []
  for (let r = 0; r < tl.rows; r++) for (let c = 0; c < tl.cols; c++) tileRects.push({ x: bb.x - 5 + c * tl.stepX, y: bb.y - 5 + r * tl.stepY, w: pw - 2 * MARGIN, h: ph - 2 * MARGIN, label: `${String.fromCharCode(65 + r)}${c + 1}` })

  const exportPdf = async () => {
    setBusy(true)
    try {
      const { PDFDocument, StandardFonts, rgb, degrees, pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = await import('pdf-lib')
      const doc = await PDFDocument.create()
      const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold)
      const W = pw * MM, H = ph * MM
      const name = { diamond: 'Diamond kite', delta: 'Delta kite', rokkaku: 'Rokkaku kite' }[p.shape]
      // overview page
      const o = doc.addPage([W, H])
      let y = H - 20 * MM
      const line = (t: string, f = font, size = 10) => { o.drawText(t, { x: 15 * MM, y, size, font: f }); y -= size * 1.5 }
      line(`${name} — sail pattern (${s.half ? 'half pattern, place on fold' : 'full pattern'})`, bold, 16)
      line(`Sail ${num(bb.w, 0)} × ${num(bb.h, 0)} mm incl. ${s.hem} mm hem · area ${num(A / 1e4, 0)} dm² · ${tl.pages} tile pages (${tl.rows} rows × ${tl.cols} columns), ${s.overlap} mm overlap`)
      line('Print at 100% / "Actual size" (no fit-to-page). Check: the square below must measure 50 × 50 mm.')
      o.drawRectangle({ x: 15 * MM, y: y - 52 * MM, width: 50 * MM, height: 50 * MM, borderColor: rgb(0, 0, 0), borderWidth: 1 })
      o.drawText('50 mm', { x: 30 * MM, y: y - 28 * MM, size: 10, font })
      y -= 60 * MM
      line('Cut list (spars)', bold, 12)
      for (const x of sp) line(`${x.qty} × ${x.name}: ${num(x.length, 0)} mm`)
      line(p.shape === 'delta' ? 'Keel (cut 1, double layer)' : 'Bridle', bold, 12)
      line(`Upper leg ${num(br.upper, 0)} mm · lower leg ${num(br.lower, 0)} mm · attach at ${num(br.a1, 0)} and ${num(br.a2, 0)} mm from the nose`)
      line(`Tow point above ${num(br.tow, 0)} mm from the nose, ${num(p.bridleDepth, 0)} mm off the sail. Add ~40 mm per knot.`)
      line('Lines: solid = cut line, dashed = fold/sew line (hem), dot-dash = spar positions, letters = tile order.')
      // mini overview with tile grid
      const k = Math.min((W - 30 * MM) / (bb.w + 10), (y - 15 * MM) / (bb.h + 10))
      const ovx = (q: Pt) => 15 * MM + (q[0] - bb.x + 5) * k, ovy = (q: Pt) => y - (q[1] - bb.y + 5) * k
      const drawPoly = (page: typeof o, pts: Pt[], fx: (q: Pt) => number, fy: (q: Pt) => number, dash?: number[], width = 1) => {
        for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; page.drawLine({ start: { x: fx(a), y: fy(a) }, end: { x: fx(b), y: fy(b) }, thickness: width, dashArray: dash, color: rgb(0, 0, 0) }) }
      }
      drawPoly(o, pat.cut, ovx, ovy)
      for (const t of tileRects) {
        o.drawRectangle({ x: ovx([t.x, 0]), y: ovy([0, t.y + t.h]), width: t.w * k, height: t.h * k, borderColor: rgb(0.5, 0.5, 0.8), borderWidth: 0.5 })
        o.drawText(t.label, { x: ovx([t.x, 0]) + 3, y: ovy([0, t.y]) - 10, size: 8, font, color: rgb(0.3, 0.3, 0.7) })
      }
      // tiles at 1:1
      const sparsHalf = s.half ? sparLines.map(([a, b]) => clipSeg(a, b)).filter((l): l is [Pt, Pt] => !!l) : sparLines
      for (const t of tileRects) {
        const pg = doc.addPage([W, H])
        const fx = (q: Pt) => (MARGIN + q[0] - t.x) * MM, fy = (q: Pt) => H - (MARGIN + q[1] - t.y) * MM
        pg.pushOperators(pushGraphicsState(), rectangle(MARGIN * MM, MARGIN * MM, t.w * MM, t.h * MM), clip(), endPath())
        for (let gx = Math.ceil(t.x / 50) * 50; gx < t.x + t.w; gx += 50) pg.drawLine({ start: { x: fx([gx, 0]), y: MARGIN * MM }, end: { x: fx([gx, 0]), y: H - MARGIN * MM }, thickness: 0.3, color: rgb(0.85, 0.85, 0.85) })
        for (let gy = Math.ceil(t.y / 50) * 50; gy < t.y + t.h; gy += 50) pg.drawLine({ start: { x: MARGIN * MM, y: fy([0, gy]) }, end: { x: W - MARGIN * MM, y: fy([0, gy]) }, thickness: 0.3, color: rgb(0.85, 0.85, 0.85) })
        drawPoly(pg, pat.cut, fx, fy, undefined, 1.2)
        drawPoly(pg, pat.sew, fx, fy, [6, 4], 0.8)
        for (const [a, b] of sparsHalf) pg.drawLine({ start: { x: fx(a), y: fy(a) }, end: { x: fx(b), y: fy(b) }, thickness: 0.6, dashArray: [10, 3, 2, 3], color: rgb(0.2, 0.3, 0.8) })
        for (const at of [a1, a2]) pg.drawCircle({ x: fx([0, at]), y: fy([0, at]), size: 3 * MM / 2, borderColor: rgb(0.8, 0.1, 0.1), borderWidth: 1 })
        if (s.half) pg.drawText('FOLD / CENTRE LINE', { x: fx([0, 0]) + 4, y: fy([0, bb.y + bb.h / 2]), size: 9, font: bold, rotate: degrees(-90), color: rgb(0.4, 0.4, 0.4) })
        pg.pushOperators(popGraphicsState())
        pg.drawRectangle({ x: MARGIN * MM, y: MARGIN * MM, width: t.w * MM, height: t.h * MM, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.4, borderDashArray: [2, 2] })
        // overlap guides
        const ov = s.overlap * MM
        pg.drawLine({ start: { x: MARGIN * MM + t.w * MM - ov, y: MARGIN * MM }, end: { x: MARGIN * MM + t.w * MM - ov, y: H - MARGIN * MM }, thickness: 0.4, dashArray: [1, 3], color: rgb(0.9, 0.3, 0.3) })
        pg.drawLine({ start: { x: MARGIN * MM, y: MARGIN * MM + ov }, end: { x: W - MARGIN * MM, y: MARGIN * MM + ov }, thickness: 0.4, dashArray: [1, 3], color: rgb(0.9, 0.3, 0.3) })
        pg.drawText(`${t.label}  ·  ${name}  ·  overlap the next tile up to the red dotted line`, { x: MARGIN * MM, y: 4 * MM, size: 8, font, color: rgb(0.3, 0.3, 0.3) })
        pg.drawText(t.label, { x: MARGIN * MM + 4, y: H - MARGIN * MM - 22, size: 18, font: bold, color: rgb(0.75, 0.75, 0.9) })
      }
      download(`${p.shape}-kite-pattern-${s.paper}.pdf`, new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' }))
    } finally { setBusy(false) }
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Kite type" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.shape} onChange={(shape) => set({ shape })} options={[['diamond', 'Diamond / Eddy'], ['delta', 'Delta'], ['rokkaku', 'Rokkaku']]} label="Kite type" />
          <p className="muted" style={{ fontSize: 13 }}>{{ diamond: 'Classic two-stick kite. Bow the cross spar (~10% of its length) for stability without a tail, or add a tail 7–10× the spine.', delta: 'Easy, stable light-wind flyer. The keel acts as the bridle; the spreader holds the leading edges open.', rokkaku: 'Japanese six-sided fighter kite: very stable, big lift. Traditional proportions 5:4 with spars at 1/5 and 4/5.' }[s.shape]}</p>
        </Panel>
        <Panel title="Dimensions (mm)">
          <Slider label={s.shape === 'delta' ? 'Spine (centre)' : 'Spine (height)'} value={p.spine} onChange={(spine) => setP({ spine })} min={300} max={2500} step={10} show={(v) => `${v} mm`} />
          <Slider label={s.shape === 'delta' ? 'Wingspan' : 'Spar width'} value={p.span} onChange={(span) => setP({ span })} min={300} max={3000} step={10} show={(v) => `${v} mm`} />
          {s.shape === 'diamond' && <Slider label="Cross spar position" value={p.crossAt} onChange={(crossAt) => setP({ crossAt })} min={0.15} max={0.5} step={0.01} show={(v) => `${Math.round(v * 100)}% from nose`} />}
          {s.shape === 'delta' && <>
            <Slider label="Wing-tip drop" value={p.tipDrop} onChange={(tipDrop) => setP({ tipDrop })} min={Math.round(p.spine * 0.8)} max={Math.round(p.spine * 1.8)} step={10} show={(v) => `${v} mm · nose angle ${num((2 * Math.atan2(p.span / 2, v) * 180) / Math.PI, 0)}°`} />
            <Slider label="Spreader position" value={p.spreaderAt} onChange={(spreaderAt) => setP({ spreaderAt })} min={0.35} max={0.75} step={0.01} show={(v) => `${Math.round(v * 100)}% down the leading edge`} />
          </>}
          {s.shape === 'rokkaku' && <Slider label="End width" value={p.endWidth} onChange={(endWidth) => setP({ endWidth })} min={0.3} max={0.8} step={0.01} show={(v) => `${Math.round(v * 100)}% of spar width`} />}
          <Slider label={s.shape === 'delta' ? 'Keel tow point' : 'Tow point'} value={p.towAt} onChange={(towAt) => setP({ towAt })} min={0.15} max={0.6} step={0.01} show={(v) => `${Math.round(v * 100)}% from nose`} />
          <Slider label={s.shape === 'delta' ? 'Keel depth' : 'Bridle depth'} value={p.bridleDepth} onChange={(bridleDepth) => setP({ bridleDepth })} min={100} max={1500} step={10} show={(v) => `${v} mm`} />
        </Panel>
        <Panel title="Materials & printing">
          <Row>
            <Num label="Hem allowance" value={s.hem} onChange={(hem) => set({ hem: Math.max(0, Math.min(50, hem)) })} unit="mm" min={0} max={50} />
            <Num label="Sail fabric" value={s.gsm} onChange={(gsm) => set({ gsm: Math.max(5, gsm) })} unit="g/m²" min={5} hint="ripstop ≈ 40, plastic bag ≈ 15" />
            <Num label="Spar weight" value={s.sparGpm} onChange={(sparGpm) => set({ sparGpm: Math.max(1, sparGpm) })} unit="g/m" min={1} hint="6 mm dowel ≈ 22, carbon ≈ 8" />
          </Row>
          <Row>
            <Select label="Paper" value={s.paper} onChange={(paper) => set({ paper })} options={[['a4', 'A4'], ['letter', 'US Letter']]} />
            <Num label="Tile overlap" value={s.overlap} onChange={(overlap) => set({ overlap: Math.max(0, Math.min(30, overlap)) })} unit="mm" min={0} max={30} />
          </Row>
          <Check label="Half pattern (cut on fold — fewer pages)" value={s.half} onChange={(half) => set({ half })} />
          <Check label="Show page tiles on the drawing" value={s.grid} onChange={(grid) => set({ grid })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Sail area" value={`${num(A / 1e6, 3)} m²`} sub={`${num(A / 1e4, 0)} dm² · ${num(A / 645.16, 0)} in²`} />
          <Stat label="Est. weight" value={`${num(wind.mass * 1000, 0)} g`} sub={`${num(wind.loading, 0)} g/m² loading`} />
          <Stat label="Min. wind" value={`${num(wind.kmh, 0)} km/h`} sub={`≈ Beaufort ${beaufort(wind.kmh)} · ${num(wind.kmh / 1.609, 0)} mph`} tone="accent" />
          <Stat label="Pattern pages" value={tl.pages} sub={`${tl.rows} × ${tl.cols} ${s.paper.toUpperCase()}`} />
        </Stats>
        <Panel title="Plan" actions={<Btn kind="primary" disabled={busy} onClick={() => void exportPdf()}>{busy ? 'Building…' : '⬇ Tiled PDF pattern'}</Btn>}>
          <svg viewBox={vb} style={{ width: '100%', maxHeight: 560, display: 'block' }} role="img" aria-label="Kite plan view">
            <polygon points={poly(full)} fill="none" stroke="var(--muted)" strokeWidth={sw * 0.6} strokeDasharray={`${sw * 3} ${sw * 2}`} />
            <polygon points={poly(sail)} fill="color-mix(in srgb, var(--accent) 22%, transparent)" stroke="var(--accent)" strokeWidth={sw} />
            {sparLines.map(([a, b], i) => <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#b45309" strokeWidth={sw * 1.4} strokeLinecap="round" />)}
            {s.half && <line x1={0} y1={fb.y} x2={0} y2={fb.y + fb.h} stroke="var(--err)" strokeWidth={sw * 0.5} strokeDasharray={`${sw * 4} ${sw * 2}`} />}
            {s.grid && tileRects.map((t) => (
              <g key={t.label}>
                <rect x={t.x} y={t.y} width={t.w} height={t.h} fill="none" stroke="var(--accent2)" strokeWidth={sw * 0.4} opacity={0.6} />
                <text x={t.x + sw * 2} y={t.y + sw * 6} fontSize={sw * 5} fill="var(--accent2)">{t.label}</text>
              </g>
            ))}
            {[a1, a2].map((a) => <circle key={a} cx={0} cy={a} r={sw * 2.5} fill="var(--err)" />)}
            {/* side view of bridle / keel */}
            <g transform={`translate(${sx} 0)`}>
              <line x1={0} y1={0} x2={0} y2={p.spine} stroke="#b45309" strokeWidth={sw * 1.4} />
              <polyline points={`0,${br.a1} ${p.bridleDepth},${br.tow} 0,${br.a2}`} fill={s.shape === 'delta' ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : 'none'} stroke="var(--fg)" strokeWidth={sw * 0.7} />
              <circle cx={p.bridleDepth} cy={br.tow} r={sw * 2.5} fill="var(--ok)" />
              <text x={p.bridleDepth} y={br.tow - sw * 5} fontSize={sw * 5} fill="var(--muted)" textAnchor="middle">tow point</text>
              <text x={0} y={-sw * 4} fontSize={sw * 5} fill="var(--muted)">side view</text>
            </g>
            <text x={fb.x} y={fb.y - pad / 3} fontSize={sw * 5} fill="var(--muted)">{num(fb.w, 0)} × {num(fb.h, 0)} mm with hem</text>
          </svg>
          <p className="muted" style={{ fontSize: 13 }}>Purple = sail (sew line), dashed = cut line with hem, brown = spars, red dots = bridle/keel attachments, green = tow point. Blue boxes show how the PDF tiles split the {s.half ? 'half ' : ''}pattern.</p>
        </Panel>
        <Panel title="Cut list">
          <Table head={['Part', 'Qty', 'Length', 'Inches']} rows={sp.map((x) => [x.name, x.qty, `${num(x.length, 0)} mm`, num(x.length / 25.4, 1)])} />
        </Panel>
        <Panel title={s.shape === 'delta' ? 'Keel' : 'Bridle'}>
          <Table head={['', 'Length', 'Note']} rows={[
            ['Upper leg', `${num(br.upper, 0)} mm`, `from spine at ${num(br.a1, 0)} mm`],
            ['Lower leg', `${num(br.lower, 0)} mm`, `from spine at ${num(br.a2, 0)} mm`],
            [s.shape === 'delta' ? 'Keel edge total' : 'Bridle line to cut', `${num(br.total + (s.shape === 'delta' ? 0 : 80), 0)} mm`, s.shape === 'delta' ? 'keel triangle, tow ring at the tip' : 'incl. 2 × 40 mm for knots'],
            ['Tow point', `${num(br.tow, 0)} mm`, `from the nose, ${num(p.bridleDepth, 0)} mm off the sail`],
          ]} />
          <Note>Fine-tune in the field: move the tow point toward the nose in strong wind (flatter angle) and toward the tail in light wind (more lift).</Note>
        </Panel>
      </div>
    </Split>
  )
}
