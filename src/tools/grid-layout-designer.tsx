import { useEffect, useRef, useState } from 'react'
import { Btn, Check, CopyButton, JsonButtons, Note, num, Num, Panel, Row, Seg, Select, Slider, Stat, Stats, Table, uid, useToolState } from '../kit'
import { css, layout, overlayCss, pick, PRESETS, spanWidth, type Breakpoint, type Layout } from './lib/grid-layout-designer'

interface State { bps: Breakpoint[]; width: number; height: number; baseline: number; color: string; labels: boolean; sample: boolean; code: 'grid' | 'overlay'; preset: string }
const DEF: State = { bps: PRESETS.default.bps, width: 1440, height: 900, baseline: 8, color: '#ef4444', labels: true, sample: true, code: 'grid', preset: 'default' }

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

/** Sample page blocks in column units: [row, startCol, span, label]. */
function sampleBlocks(cols: number): [number, number, number, string][] {
  const out: [number, number, number, string][] = [[0, 0, cols, 'Header']]
  if (cols >= 8) {
    const side = Math.round(cols / 4)
    out.push([1, 0, side, 'Sidebar'], [1, side, cols - side, 'Main content'])
  } else out.push([1, 0, cols, 'Main content'])
  const card = cols >= 12 ? 4 : cols >= 8 ? 4 : cols >= 4 ? 2 : cols
  for (let c = 0; c + card <= cols; c += card) out.push([2, c, card, `${card} col`])
  return out
}

function draw(ctx: CanvasRenderingContext2D, s: State, bp: Breakpoint, l: Layout, W: number, H: number, k: number, transparent: boolean) {
  ctx.save()
  ctx.scale(k, k)
  if (!transparent) {
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(l.offset, 0, l.container, H)
  }
  // margins
  ctx.fillStyle = 'rgba(14, 165, 233, 0.10)'
  ctx.fillRect(l.offset, 0, bp.margin, H)
  ctx.fillRect(l.offset + l.container - bp.margin, 0, bp.margin, H)
  if (s.baseline > 0) {
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.18)'
    ctx.lineWidth = 1 / k
    for (let y = s.baseline; y < H; y += s.baseline) { ctx.beginPath(); ctx.moveTo(l.offset, y + 0.5 / k); ctx.lineTo(l.offset + l.container, y + 0.5 / k); ctx.stroke() }
  }
  l.cols.forEach((c) => { ctx.fillStyle = rgba(s.color, 0.16); ctx.fillRect(c.x0, 0, c.x1 - c.x0, H) })
  if (s.sample && !transparent) {
    const rowsY = [24, 24 + 72 + bp.gutter, 24 + 72 + bp.gutter + 320 + bp.gutter], rowsH = [72, 320, 180]
    ctx.font = `600 ${14 / Math.min(1, k * 1.2)}px system-ui, sans-serif`
    for (const [r, c0, span, label] of sampleBlocks(bp.columns)) {
      if (c0 >= l.cols.length) continue
      const x = l.cols[c0].x0, w = spanWidth(l, Math.min(span, l.cols.length - c0), bp.gutter)
      ctx.fillStyle = r === 0 ? 'rgba(15, 23, 42, 0.72)' : r === 1 ? 'rgba(71, 85, 105, 0.45)' : 'rgba(100, 116, 139, 0.32)'
      ctx.beginPath(); ctx.roundRect(x, rowsY[r], w, rowsH[r], 8); ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.fillText(label, x + 10 / Math.min(1, k * 1.2), rowsY[r] + 24 / Math.min(1, k * 1.2))
    }
  }
  if (s.labels) {
    ctx.font = `600 ${12 / Math.min(1, k * 1.4)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = s.color
    l.cols.forEach((c, i) => { ctx.fillText(String(i + 1), (c.x0 + c.x1) / 2, H - 14 / Math.min(1, k * 1.4)) })
    ctx.fillStyle = '#0369a1'
    if (bp.margin >= 12) ctx.fillText(`${bp.margin}`, l.offset + bp.margin / 2, H / 2)
  }
  ctx.restore()
}

export default function GridLayoutDesigner() {
  const [s, set, reset] = useToolState('grid-layout-designer', DEF)
  const wrap = useRef<HTMLDivElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const [boxW, setBoxW] = useState(800)
  const bp = pick(s.bps, s.width)
  const l = layout(bp, s.width)
  const previewH = Math.min(s.height, 700)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBoxW(Math.max(260, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = cv.current
    if (!c) return
    const k = boxW / s.width
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = Math.round(boxW * dpr)
    c.height = Math.round(previewH * k * dpr)
    c.style.width = `${boxW}px`
    c.style.height = `${previewH * k}px`
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    draw(ctx, s, bp, l, s.width, previewH, k, false)
  }, [s, bp, l, boxW, previewH])

  const png = () => {
    const c = document.createElement('canvas')
    c.width = s.width
    c.height = s.height
    draw(c.getContext('2d')!, { ...s, sample: false }, bp, l, s.width, s.height, 1, true)
    c.toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `grid-${bp.name.toLowerCase()}-${s.width}x${s.height}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }, 'image/png')
  }
  const editBp = (id: string, p: Partial<Breakpoint>) => set({ bps: s.bps.map((b) => (b.id === id ? { ...b, ...p } : b)), preset: 'custom' })
  const code = s.code === 'grid' ? css(s.bps) : overlayCss(bp, rgba(s.color, 0.12))
  const sorted = [...s.bps].sort((a, b) => a.min - b.min)
  const fracW = (b: Breakpoint) => { const ok = layout(b, Math.max(b.min, 320)); return ok.valid }

  return (
    <>
      <Stats>
        <Stat label="Active breakpoint" value={bp.name} sub={`≥ ${bp.min}px · ${bp.columns} columns`} tone="accent" />
        <Stat label="Column width" value={`${num(l.colW, 2)} px`} sub={Number.isInteger(+l.colW.toFixed(6)) ? 'whole pixels ✓' : 'fractional — tweak gutter/margin for whole px'} />
        <Stat label="Content width" value={`${num(l.content, 1)} px`} sub={`container ${num(l.container, 0)} px`} />
        <Stat label="Gutter / margin" value={`${bp.gutter} / ${bp.margin} px`} />
      </Stats>
      {!l.valid && <Note tone="err">Margins and gutters leave no room for columns at {s.width}px — reduce them or the column count.</Note>}
      <Panel title="Preview" actions={<>
        <Btn onClick={png}>⬇ PNG overlay</Btn>
        <Btn kind="ghost" onClick={reset}>Reset</Btn>
      </>}>
        <Slider label="Viewport width" value={s.width} onChange={(width) => set({ width })} min={320} max={2560} step={1} unit=" px" show={(v) => String(v)} />
        <div style={{ position: 'relative', height: 22, margin: '0 0 6px', borderRadius: 6, overflow: 'hidden', background: 'var(--line)' }}>
          {sorted.map((b, i) => {
            const x0 = Math.max(320, b.min), x1 = sorted[i + 1]?.min ?? 2560
            const left = ((x0 - 320) / (2560 - 320)) * 100, w = ((x1 - x0) / (2560 - 320)) * 100
            return <button key={b.id} type="button" onClick={() => set({ width: Math.max(320, b.min + (b.min ? 0 : 55)) })} title={`${b.name}: ${b.min}px+`} style={{ position: 'absolute', left: `${left}%`, width: `${w}%`, top: 0, bottom: 0, border: 0, borderRight: '2px solid var(--panel)', background: b.id === bp.id ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 30%, transparent)', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap' }}>{b.name}</button>
          })}
          <div style={{ position: 'absolute', left: `${((s.width - 320) / (2560 - 320)) * 100}%`, top: 0, bottom: 0, width: 2, background: '#111827' }} />
        </div>
        <div ref={wrap} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', background: '#e2e8f0' }}>
          <canvas ref={cv} style={{ display: 'block' }} aria-label="grid preview" />
        </div>
        <Row>
          <Check label="Column numbers" value={s.labels} onChange={(labels) => set({ labels })} />
          <Check label="Sample page blocks" value={s.sample} onChange={(sample) => set({ sample })} />
          <label className="k-check">Colour <input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} /></label>
          <Num label="Baseline (0 = off)" value={s.baseline} onChange={(baseline) => set({ baseline })} unit="px" min={0} />
          <Num label="PNG height" value={s.height} onChange={(height) => set({ height: Math.max(100, Math.min(8000, height)) })} unit="px" min={100} />
        </Row>
      </Panel>
      <Panel title="Breakpoints" actions={<>
        <Select label="" value={s.preset} onChange={(preset) => preset !== 'custom' && set({ preset, bps: PRESETS[preset].bps })} options={[...Object.entries(PRESETS).map(([k, v]) => [k, v.name] as [string, string]), ['custom', 'Custom']]} />
        <Btn onClick={() => set({ bps: [...s.bps, { ...sorted[sorted.length - 1], id: uid(), name: 'Wide', min: sorted[sorted.length - 1].min + 400 }], preset: 'custom' })}>+ Breakpoint</Btn>
      </>}>
        <Table
          head={['Name', 'Min width', 'Columns', 'Gutter', 'Margin', 'Max width (0 = fluid)', '']}
          rows={sorted.map((b) => [
            <input key="n" className="k-text" value={b.name} onChange={(e) => editBp(b.id, { name: e.target.value })} aria-label="name" style={{ minWidth: 80 }} />,
            <Num key="m" label="" value={b.min} onChange={(min) => editBp(b.id, { min })} unit="px" min={0} />,
            <Num key="c" label="" value={b.columns} onChange={(columns) => editBp(b.id, { columns: Math.max(1, Math.min(48, Math.round(columns))) })} min={1} max={48} step={1} />,
            <Num key="g" label="" value={b.gutter} onChange={(gutter) => editBp(b.id, { gutter })} unit="px" min={0} />,
            <Num key="r" label="" value={b.margin} onChange={(margin) => editBp(b.id, { margin })} unit="px" min={0} />,
            <Num key="x" label="" value={b.maxWidth} onChange={(maxWidth) => editBp(b.id, { maxWidth })} unit="px" min={0} />,
            <span key="a">{!fracW(b) && '⚠ '}<Btn kind="ghost" disabled={s.bps.length <= 1} onClick={() => set({ bps: s.bps.filter((x) => x.id !== b.id), preset: 'custom' })}>✕</Btn></span>,
          ])}
        />
      </Panel>
      <div className="k-split">
        <Panel title={`Spans at ${s.width}px (${bp.name})`}>
          <Table head={['Span', 'Width', '% of content']} rows={Array.from({ length: bp.columns }, (_, i) => i + 1).map((n) => [`${n} col`, `${num(spanWidth(l, n, bp.gutter), 2)} px`, `${num((spanWidth(l, n, bp.gutter) / l.content) * 100, 2)} %`])} max={24} />
          <p className="muted" style={{ fontSize: 12 }}>Column 1 starts at x = {num(l.cols[0]?.x0 ?? 0, 1)} px; the last ends at {num(l.cols[l.cols.length - 1]?.x1 ?? 0, 1)} px.</p>
        </Panel>
        <Panel title="Code" actions={<>
          <Seg value={s.code} onChange={(c) => set({ code: c })} options={[['grid', 'CSS grid'], ['overlay', 'Overlay CSS']]} />
          <CopyButton text={code} />
          <JsonButtons name="grid-layout.json" data={s.bps} onLoad={(bps) => Array.isArray(bps) && bps.length && set({ bps, preset: 'custom' })} />
        </>}>
          <pre className="mono" style={{ fontSize: 12, lineHeight: 1.5, maxHeight: 420, overflow: 'auto', margin: 0, padding: 12, background: 'color-mix(in srgb, var(--line) 35%, transparent)', borderRadius: 8 }}>{code}</pre>
        </Panel>
      </div>
    </>
  )
}
