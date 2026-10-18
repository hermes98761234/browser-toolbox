import { useEffect, useRef, useState } from 'react'
import { Btn, Check, download, JsonButtons, Panel, Row, Seg, Select, Slider, Split, useToolState } from '../kit'
import { copies, corners, demoShapes, latticeOffset, pathD, sheetSvg, SYMS, tileSvg, type Kind, type Repeat, type Shape, type Sym } from './lib/pattern-maker'

const T = 256 // design units per tile
const VIEW = 1.5 // editor shows the tile plus a quarter tile of wrap-around on each side

interface State { shapes: Shape[]; sym: Sym; rep: Repeat; bg: string; color: string; width: number; tool: Kind; fill: boolean; guides: boolean; zoom: number; exportPx: number }
const DEF: State = { shapes: demoShapes(T), sym: 'quad', rep: 'grid', bg: '#fef3c7', color: '#0f766e', width: 6, tool: 'pen', fill: true, guides: true, zoom: 90, exportPx: 1024 }

const SWATCHES = ['#0f766e', '#14b8a6', '#6366f1', '#e11d48', '#f59e0b', '#fde68a', '#1e293b', '#ffffff', '#a855f7', '#84cc16']
const BGS = ['#fef3c7', '#ffffff', '#0f172a', '#ecfeff', '#fdf2f8', '#f1f5f9']

function drawCopy(ctx: CanvasRenderingContext2D, sh: Shape, pts: [number, number][], bg: string) {
  const col = sh.kind === 'erase' ? bg : sh.color
  ctx.strokeStyle = col
  ctx.fillStyle = col
  ctx.lineWidth = sh.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (sh.kind === 'pen' || sh.kind === 'erase') {
    ctx.stroke(new Path2D(pathD(pts)))
    return
  }
  if (sh.kind === 'line') {
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1])
    ctx.stroke()
    return
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  ctx.beginPath()
  if (sh.kind === 'rect') ctx.rect(x0, y0, x1 - x0, y1 - y0)
  else ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.max(0.1, (x1 - x0) / 2), Math.max(0.1, (y1 - y0) / 2), 0, 0, Math.PI * 2)
  if (sh.fill) ctx.fill()
  ctx.stroke()
}

/** Renders the tile at `px` pixels square. */
function renderTile(canvas: HTMLCanvasElement, shapes: Shape[], sym: Sym, rep: Repeat, bg: string, px: number) {
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(px / T, 0, 0, px / T, 0, 0)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, T, T)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, T, T)
  ctx.clip()
  for (const sh of shapes) for (const pts of copies(sh, sym, rep, T)) drawCopy(ctx, sh, pts, bg)
  ctx.restore()
}

/** Draws tiles on the repeat lattice to cover a region (in design units) of a context already scaled. */
function paintLattice(ctx: CanvasRenderingContext2D, tile: HTMLCanvasElement, rep: Repeat, x0: number, y0: number, x1: number, y1: number) {
  const n = Math.ceil(Math.max(x1 - x0, y1 - y0) / T) + 3
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const [x, y] = latticeOffset(rep, i, j, T)
    if (x + T < x0 || x > x1 || y + T < y0 || y > y1) continue
    ctx.drawImage(tile, x, y, T, T)
  }
}

export default function PatternMaker() {
  const [s, set, reset] = useToolState('pattern-maker', DEF)
  const [undo, setUndo] = useState<Shape[][]>([])
  const [redo, setRedo] = useState<Shape[][]>([])
  const [live, setLive] = useState<Shape | null>(null)
  const edRef = useRef<HTMLCanvasElement>(null)
  const pvRef = useRef<HTMLCanvasElement>(null)
  const tileRef = useRef<HTMLCanvasElement | null>(null)
  const drag = useRef<{ start: [number, number] } | null>(null)

  const shapesNow = live ? [...s.shapes, live] : s.shapes

  useEffect(() => {
    const tile = (tileRef.current ??= document.createElement('canvas'))
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    renderTile(tile, shapesNow, s.sym, s.rep, s.bg, Math.round(T * dpr * 1.6))
    // editor
    const ed = edRef.current
    if (ed) {
      const css = ed.clientWidth || 480
      ed.width = Math.round(css * dpr)
      ed.height = Math.round(css * dpr)
      const ctx = ed.getContext('2d')!
      const k = (css * dpr) / (VIEW * T)
      const o = ((VIEW - 1) / 2) * T
      ctx.setTransform(k, 0, 0, k, o * k, o * k)
      paintLattice(ctx, tile, s.rep, -o, -o, T + o, T + o)
      // fade the wrap-around margin
      ctx.fillStyle = 'rgba(15,23,42,0.35)'
      ctx.fillRect(-o, -o, VIEW * T, o)
      ctx.fillRect(-o, T, VIEW * T, o)
      ctx.fillRect(-o, 0, o, T)
      ctx.fillRect(T, 0, o, T)
      ctx.strokeStyle = '#f97316'
      ctx.lineWidth = 1.5 / k
      ctx.setLineDash([6 / k, 4 / k])
      ctx.strokeRect(0, 0, T, T)
      if (s.guides && s.sym !== 'none') {
        ctx.strokeStyle = 'rgba(99,102,241,0.7)'
        ctx.beginPath()
        if (['mirrorX', 'quad', 'kaleido'].includes(s.sym)) { ctx.moveTo(T / 2, 0); ctx.lineTo(T / 2, T) }
        if (['mirrorY', 'quad', 'kaleido'].includes(s.sym)) { ctx.moveTo(0, T / 2); ctx.lineTo(T, T / 2) }
        if (['diag', 'kaleido'].includes(s.sym)) { ctx.moveTo(0, 0); ctx.lineTo(T, T) }
        if (s.sym === 'kaleido') { ctx.moveTo(T, 0); ctx.lineTo(0, T) }
        ctx.stroke()
        if (['rot2', 'rot4'].includes(s.sym)) {
          ctx.setLineDash([])
          ctx.beginPath()
          ctx.arc(T / 2, T / 2, 5 / k, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      ctx.setLineDash([])
    }
    // preview
    const pv = pvRef.current
    if (pv) {
      const w = pv.clientWidth || 480, h = 300
      pv.width = Math.round(w * dpr)
      pv.height = Math.round(h * dpr)
      const ctx = pv.getContext('2d')!
      const k = (s.zoom / T) * dpr
      ctx.setTransform(k, 0, 0, k, 0, 0)
      paintLattice(ctx, tile, s.rep, 0, 0, (w * dpr) / k, (h * dpr) / k)
    }
  })

  const toTile = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect()
    const o = ((VIEW - 1) / 2) * T
    return [((e.clientX - r.left) / r.width) * VIEW * T - o, ((e.clientY - r.top) / r.height) * VIEW * T - o]
  }
  const commit = (sh: Shape) => {
    setUndo((u) => [...u.slice(-60), s.shapes])
    setRedo([])
    set({ shapes: [...s.shapes, sh] })
  }
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = toTile(e)
    drag.current = { start: p }
    const base = { color: s.color, width: s.tool === 'erase' ? Math.max(8, s.width * 2) : s.width, fill: s.fill }
    setLive(s.tool === 'pen' || s.tool === 'erase' ? { kind: s.tool, pts: [p], ...base } : s.tool === 'line' ? { kind: 'line', pts: [p, p], ...base } : { kind: s.tool, pts: corners(p, p), ...base })
  }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || !live) return
    const p = toTile(e)
    if (live.kind === 'pen' || live.kind === 'erase') {
      const last = live.pts[live.pts.length - 1]
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.2) return
      setLive({ ...live, pts: [...live.pts, p] })
    } else if (live.kind === 'line') {
      setLive({ ...live, pts: [drag.current.start, p] })
    } else {
      let q = p
      if (e.shiftKey) {
        const d = Math.max(Math.abs(p[0] - drag.current.start[0]), Math.abs(p[1] - drag.current.start[1]))
        q = [drag.current.start[0] + Math.sign(p[0] - drag.current.start[0]) * d, drag.current.start[1] + Math.sign(p[1] - drag.current.start[1]) * d]
      }
      setLive({ ...live, pts: corners(drag.current.start, q) })
    }
  }
  const onUp = () => {
    if (live) commit({ ...live, pts: live.pts.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)]) })
    setLive(null)
    drag.current = null
  }
  const doUndo = () => {
    if (!undo.length) return
    setRedo((r) => [...r, s.shapes])
    set({ shapes: undo[undo.length - 1] })
    setUndo((u) => u.slice(0, -1))
  }
  const doRedo = () => {
    if (!redo.length) return
    setUndo((u) => [...u, s.shapes])
    set({ shapes: redo[redo.length - 1] })
    setRedo((r) => r.slice(0, -1))
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) doRedo()
        else doUndo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const exportPng = (sheet: boolean) => {
    const tile = document.createElement('canvas')
    renderTile(tile, s.shapes, s.sym, s.rep, s.bg, s.exportPx)
    if (!sheet) {
      tile.toBlob((b) => b && download('pattern-tile.png', b, 'image/png'))
      return
    }
    const n = 4, c = document.createElement('canvas')
    c.width = c.height = s.exportPx * n > 4096 ? 4096 : s.exportPx * n
    const ctx = c.getContext('2d')!
    const k = c.width / (n * T)
    ctx.setTransform(k, 0, 0, k, 0, 0)
    paintLattice(ctx, tile, s.rep, 0, 0, n * T, n * T)
    c.toBlob((b) => b && download('pattern-sheet.png', b, 'image/png'))
  }

  const TOOLS: [Kind, string][] = [['pen', '✎ Pen'], ['line', '╱ Line'], ['rect', '▭ Rect'], ['ellipse', '◯ Ellipse'], ['erase', '⌫ Eraser']]

  return (
    <Split wide="right">
      <div>
        <Panel title="Draw" actions={<>
          <Btn onClick={doUndo} disabled={!undo.length} title="Undo (Ctrl+Z)">↶</Btn>
          <Btn onClick={doRedo} disabled={!redo.length} title="Redo (Ctrl+Shift+Z)">↷</Btn>
        </>}>
          <Seg value={s.tool} onChange={(tool) => set({ tool })} options={TOOLS} />
          <Row>
            <label className="k-field" style={{ flex: '0 0 auto' }}>
              <span className="k-label">Colour</span>
              <input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} style={{ width: 52, height: 36, padding: 0, border: 'none', background: 'none' }} />
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', flex: 1 }}>
              {SWATCHES.map((c) => <button type="button" key={c} aria-label={c} onClick={() => set({ color: c })} style={{ width: 24, height: 24, borderRadius: 6, background: c, border: c === s.color ? '3px solid var(--accent)' : '1px solid var(--line)', cursor: 'pointer' }} />)}
            </div>
          </Row>
          <Slider label="Stroke width" value={s.width} onChange={(width) => set({ width })} min={1} max={40} />
          {(s.tool === 'rect' || s.tool === 'ellipse') && <Check label="Filled (hold Shift for square/circle)" value={s.fill} onChange={(fill) => set({ fill })} />}
        </Panel>
        <Panel title="Symmetry & repeat">
          <Select label="Symmetry (about the tile centre)" value={s.sym} onChange={(sym) => set({ sym })} options={SYMS} />
          <Seg value={s.rep} onChange={(rep) => set({ rep })} options={[['grid', 'Grid'], ['brick', 'Brick'], ['halfdrop', 'Half-drop']]} />
          <Check label="Show symmetry guides" value={s.guides} onChange={(guides) => set({ guides })} />
          <Row>
            <span className="k-label" style={{ alignSelf: 'center' }}>Background</span>
            {BGS.map((c) => <button type="button" key={c} aria-label={`background ${c}`} onClick={() => set({ bg: c })} style={{ width: 24, height: 24, borderRadius: 6, background: c, border: c === s.bg ? '3px solid var(--accent)' : '1px solid var(--line)', cursor: 'pointer' }} />)}
            <input type="color" value={s.bg} onChange={(e) => set({ bg: e.target.value })} aria-label="Custom background" style={{ width: 36, height: 28, padding: 0, border: 'none', background: 'none' }} />
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Strokes that leave the tile re-enter on the opposite side (shifted by half a tile for brick and half-drop), so every repeat is seamless.</p>
        </Panel>
        <Panel title="Export">
          <Select label="PNG tile size" value={s.exportPx} onChange={(exportPx) => set({ exportPx })} options={[[256, '256 px'], [512, '512 px'], [1024, '1024 px'], [2048, '2048 px']]} />
          <Row>
            <Btn kind="primary" onClick={() => exportPng(false)}>⬇ PNG tile</Btn>
            <Btn onClick={() => exportPng(true)}>⬇ PNG 4×4 sheet</Btn>
          </Row>
          <Row>
            <Btn onClick={() => download('pattern-tile.svg', tileSvg(s.shapes, s.sym, s.rep, T, s.bg), 'image/svg+xml')}>⬇ SVG tile</Btn>
            <Btn onClick={() => download('pattern-sheet.svg', sheetSvg(s.shapes, s.sym, s.rep, T, s.bg, 4), 'image/svg+xml')}>⬇ SVG sheet</Btn>
          </Row>
          <Row>
            <JsonButtons name="pattern.json" data={s} onLoad={(d) => { if (Array.isArray(d.shapes)) set(d) }} />
            <Btn kind="ghost" onClick={() => { setUndo((u) => [...u, s.shapes]); set({ shapes: [] }) }}>Clear</Btn>
            <Btn kind="ghost" onClick={() => { reset(); setUndo([]); setRedo([]) }}>Demo</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Panel title={`Tile editor · ${s.shapes.length} shape${s.shapes.length === 1 ? '' : 's'}`}>
          <canvas
            ref={edRef}
            style={{ width: '100%', maxWidth: 560, aspectRatio: '1', display: 'block', margin: '0 auto', touchAction: 'none', cursor: 'crosshair', borderRadius: 8 }}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          />
          <p className="muted" style={{ fontSize: 13, textAlign: 'center' }}>Draw inside or across the dashed tile; the shaded border shows the neighbouring tiles.</p>
        </Panel>
        <Panel title="Tiled preview">
          <Slider label="Tile size in preview" value={s.zoom} onChange={(zoom) => set({ zoom })} min={30} max={240} unit=" px" />
          <canvas ref={pvRef} style={{ width: '100%', height: 300, display: 'block', borderRadius: 8 }} />
        </Panel>
      </div>
    </Split>
  )
}
