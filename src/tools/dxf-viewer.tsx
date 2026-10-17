import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, num, Panel, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { aci, parseDxf, sampleDxf, type Drawing, type Path, type Pt } from './lib/dxf-viewer'

interface Prefs {
  bg: 'dark' | 'light'
  text: boolean
  fill: boolean
  snap: boolean
  off: Record<string, boolean>
}
const DEF: Prefs = { bg: 'dark', text: true, fill: true, snap: true, off: {} }
const H = 560

const DASH: [RegExp, number[]][] = [[/HIDDEN|DASHED2/, [6, 4]], [/DASH/, [10, 5]], [/CENTER|CHAIN/, [18, 4, 4, 4]], [/PHANTOM/, [18, 4, 4, 4, 4, 4]], [/DOT/, [2, 4]]]

interface View { cx: number; cy: number; k: number }
interface Meas { a: Pt; b: Pt }

export default function DxfViewer() {
  const [p, set] = useToolState('dxf-viewer', DEF)
  const [file, setFile] = useState<{ name: string; text: string }>(() => ({ name: 'mounting-plate.dxf', text: sampleDxf() }))
  const [mode, setMode] = useState<'pan' | 'measure'>('measure')
  const [view, setView] = useState<View>({ cx: 0, cy: 0, k: 1 })
  const [cursor, setCursor] = useState<{ w: Pt; snapped: boolean } | null>(null)
  const [pending, setPending] = useState<Pt | null>(null)
  const [meas, setMeas] = useState<Meas[]>([])
  const [w, setW] = useState(900)
  const cv = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; v: View; moved: boolean } | null>(null)

  const parsed = useMemo((): { d: Drawing | null; err: string } => {
    try {
      return { d: parseDxf(file.text), err: '' }
    } catch (e) {
      return { d: null, err: (e as Error).message }
    }
  }, [file.text])
  const d = parsed.d
  const dark = p.bg === 'dark'
  const layerMap = useMemo(() => new Map((d?.layers ?? []).map((l) => [l.name, l])), [d])
  const visible = (layer: string) => !(p.off[layer] ?? layerMap.get(layer)?.off ?? false)

  const fit = useCallback(() => {
    if (!d) return
    const { x0, y0, x1, y1 } = d.ext
    const k = Math.min((w * 0.9) / (x1 - x0 || 1), (H * 0.9) / (y1 - y0 || 1))
    setView({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, k })
  }, [d, w])
  useEffect(() => {
    fit()
    setMeas(file.name === 'mounting-plate.dxf' ? [{ a: [20, 20], b: [180, 20] }, { a: [20, 20], b: [100, 70] }] : [])
    setPending(null)
    // fit only when a new drawing is loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const toScr = useCallback((q: Pt): Pt => [(q[0] - view.cx) * view.k + w / 2, H / 2 - (q[1] - view.cy) * view.k], [view, w])
  const toWorld = useCallback((x: number, y: number): Pt => [(x - w / 2) / view.k + view.cx, (H / 2 - y) / view.k + view.cy], [view, w])

  const colorOf = useCallback(
    (o: { color: number; rgb?: string; layer: string }) => {
      if (o.rgb) return o.rgb
      const l = layerMap.get(o.layer)
      if (o.color === 256) return l?.rgb ?? aci(l?.color ?? 7, dark)
      return aci(o.color, dark)
    },
    [layerMap, dark],
  )
  const dashOf = (path: Path) => {
    const lt = path.lt === 'BYLAYER' || path.lt === 'BYBLOCK' ? (layerMap.get(path.layer)?.lt ?? 'CONTINUOUS') : path.lt
    return DASH.find(([re]) => re.test(lt))?.[1] ?? []
  }

  // draw
  useEffect(() => {
    const c = cv.current
    if (!c) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    c.width = w * dpr
    c.height = H * dpr
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.fillStyle = dark ? '#111827' : '#ffffff'
    g.fillRect(0, 0, w, H)
    if (!d) return
    g.lineJoin = 'round'
    g.lineCap = 'round'
    for (const path of d.paths) {
      if (!visible(path.layer)) continue
      g.strokeStyle = g.fillStyle = colorOf(path)
      g.lineWidth = 1.2
      g.setLineDash(dashOf(path))
      g.beginPath()
      path.pts.forEach((q, i) => {
        const [x, y] = toScr(q)
        if (i) g.lineTo(x, y)
        else g.moveTo(x, y)
      })
      if (path.closed) g.closePath()
      if (path.fill && p.fill) g.fill()
      g.stroke()
    }
    g.setLineDash([])
    if (p.text) {
      for (const t of d.texts) {
        if (!visible(t.layer)) continue
        const px = t.h * view.k
        if (px < 3) continue
        const [x, y] = toScr([t.x, t.y])
        g.save()
        g.translate(x, y)
        g.rotate((-t.rot * Math.PI) / 180)
        g.fillStyle = colorOf(t)
        g.font = `${px}px "Segoe UI", Arial, sans-serif`
        g.textAlign = t.align === 1 ? 'center' : t.align === 2 ? 'right' : 'left'
        t.text.split('\n').forEach((line, i) => g.fillText(line, 0, i * px * 1.6))
        g.restore()
      }
    }
    // measurements
    const mc = '#f59e0b'
    const drawMeas = (a: Pt, b: Pt, live: boolean) => {
      const A = toScr(a), B = toScr(b)
      g.strokeStyle = mc
      g.lineWidth = 2
      g.setLineDash(live ? [6, 4] : [])
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke()
      g.setLineDash([])
      for (const [x, y] of [A, B]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fillStyle = mc; g.fill() }
      const dist = Math.hypot(b[0] - a[0], b[1] - a[1])
      const label = `${num(dist, 3)} ${d.units === 'unitless' ? '' : d.units}`
      g.font = 'bold 13px system-ui, sans-serif'
      const tw = g.measureText(label).width
      const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2 - 10
      g.fillStyle = 'rgba(17,24,39,.85)'
      g.fillRect(mx - tw / 2 - 5, my - 13, tw + 10, 19)
      g.fillStyle = '#fde68a'
      g.textAlign = 'center'
      g.fillText(label, mx, my + 1)
    }
    meas.forEach((m) => drawMeas(m.a, m.b, false))
    if (pending && cursor) drawMeas(pending, cursor.w, true)
    if (cursor?.snapped && mode === 'measure') {
      const [x, y] = toScr(cursor.w)
      g.strokeStyle = '#22d3ee'
      g.lineWidth = 2
      g.strokeRect(x - 6, y - 6, 12, 12)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, view, w, p, meas, pending, cursor, mode, colorOf, toScr])

  const snapAt = (x: number, y: number): { w: Pt; snapped: boolean } => {
    const wp = toWorld(x, y)
    if (!d || !p.snap) return { w: wp, snapped: false }
    let best: Pt | null = null
    let bd = 12 / view.k
    for (const s of d.snaps) {
      const dd = Math.hypot(s[0] - wp[0], s[1] - wp[1])
      if (dd < bd) { bd = dd; best = s }
    }
    return best ? { w: best, snapped: true } : { w: wp, snapped: false }
  }
  const local = (e: React.PointerEvent | WheelEvent): [number, number] => {
    const r = cv.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  useEffect(() => {
    const c = cv.current
    if (!c) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const [x, y] = local(e)
      setView((v) => {
        const f = Math.exp(-e.deltaY * 0.0015)
        const wx = (x - w / 2) / v.k + v.cx, wy = (H / 2 - y) / v.k + v.cy
        const k = v.k * f
        return { k, cx: wx - (x - w / 2) / k, cy: wy - (H / 2 - y) / k }
      })
    }
    c.addEventListener('wheel', wheel, { passive: false })
    return () => c.removeEventListener('wheel', wheel)
  }, [w])

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, v: view, moved: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const [x, y] = local(e)
    const dr = drag.current
    if (dr) {
      const dx = e.clientX - dr.x, dy = e.clientY - dr.y
      if (Math.abs(dx) + Math.abs(dy) > 4) dr.moved = true
      if (dr.moved) setView({ ...dr.v, cx: dr.v.cx - dx / dr.v.k, cy: dr.v.cy + dy / dr.v.k })
    }
    setCursor(snapAt(x, y))
  }
  const onUp = (e: React.PointerEvent) => {
    const dr = drag.current
    drag.current = null
    if (dr?.moved || mode !== 'measure') return
    const [x, y] = local(e)
    const s = snapAt(x, y)
    if (!pending) setPending(s.w)
    else {
      setMeas((m) => [...m.slice(-9), { a: pending, b: s.w }])
      setPending(null)
    }
  }

  const exportSvg = () => {
    if (!d) return
    const { x0, y0, x1, y1 } = d.ext
    const sw = Math.max(x1 - x0, y1 - y0) / 800
    const body = d.paths
      .filter((q) => visible(q.layer))
      .map((q) => `<path d="M${q.pts.map(([x, y]) => `${+x.toFixed(4)} ${+(-y).toFixed(4)}`).join('L')}${q.closed ? 'Z' : ''}" stroke="${colorOf(q)}" fill="${q.fill && p.fill ? colorOf(q) : 'none'}"${dashOf(q).length ? ` stroke-dasharray="${dashOf(q).map((v) => +(v * sw).toFixed(4)).join(' ')}"` : ''}/>`)
      .join('\n')
    const tx = p.text
      ? d.texts.filter((t) => visible(t.layer)).map((t) => `<text x="${+t.x.toFixed(4)}" y="${+(-t.y).toFixed(4)}" font-size="${+t.h.toFixed(4)}" fill="${colorOf(t)}" text-anchor="${['start', 'middle', 'end'][t.align]}" transform="rotate(${-t.rot} ${+t.x.toFixed(4)} ${+(-t.y).toFixed(4)})" font-family="Arial">${t.text.split('\n')[0].replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</text>`).join('\n')
      : ''
    const pad = (x1 - x0) * 0.03
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0 - pad} ${-y1 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}" style="background:${dark ? '#111827' : '#fff'}"><g fill="none" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">\n${body}\n${tx}\n</g></svg>`
    download(file.name.replace(/\.dxf$/i, '') + '.svg', svg, 'image/svg+xml')
  }

  const last = meas[meas.length - 1]
  const u = d?.units === 'unitless' ? '' : ` ${d?.units}`
  const layerCount = (name: string) => (d ? d.paths.filter((q) => q.layer === name).length + d.texts.filter((t) => t.layer === name).length : 0)

  return (
    <Split wide="right">
      <div>
        <Panel title="Open drawing">
          <FileDrop accept=".dxf" onFiles={async ([f]) => setFile({ name: f.name, text: await f.text() })} label="Drop an ASCII .dxf file or click to choose" />
          <p className="muted" style={{ fontSize: 13 }}>
            Showing <b>{file.name}</b>{' '}
            {file.name !== 'mounting-plate.dxf' && <a href="#" onClick={(e) => { e.preventDefault(); setFile({ name: 'mounting-plate.dxf', text: sampleDxf() }) }}>· load the demo</a>}
          </p>
        </Panel>
        {d && (
          <Panel
            title={`Layers (${d.layers.length})`}
            actions={
              <>
                <Btn kind="ghost" onClick={() => set({ off: {} })}>All on</Btn>
                <Btn kind="ghost" onClick={() => set({ off: Object.fromEntries(d.layers.map((l) => [l.name, true])) })}>All off</Btn>
              </>
            }
          >
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {d.layers.map((l) => (
                <div key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
                  <Check label="" value={visible(l.name)} onChange={(v) => set({ off: { ...p.off, [l.name]: !v } })} />
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: l.rgb ?? aci(l.color, dark), border: '1px solid var(--line)', flex: 'none' }} />
                  <span style={{ flex: 1, overflowWrap: 'anywhere' }}>{l.name}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{l.lt !== 'CONTINUOUS' ? l.lt.toLowerCase() + ' · ' : ''}{layerCount(l.name)}</span>
                </div>
              ))}
            </div>
          </Panel>
        )}
        <Panel title="Display">
          <Seg label="Background" value={p.bg} onChange={(bg) => set({ bg })} options={[['dark', 'Dark (CAD)'], ['light', 'Light (print)']]} />
          <Check label="Show text" value={p.text} onChange={(text) => set({ text })} />
          <Check label="Fill SOLID entities" value={p.fill} onChange={(fill) => set({ fill })} />
          <Check label="Snap to end/mid/centre points" value={p.snap} onChange={(snap) => set({ snap })} />
        </Panel>
        {d && (
          <Panel title="Contents">
            <Table head={['Entity', 'Count']} rows={Object.entries(d.counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v])} />
            {Object.keys(d.skipped).length > 0 && <Note tone="warn">Not drawn: {Object.entries(d.skipped).map(([k, v]) => `${k} ×${v}`).join(', ')}.</Note>}
          </Panel>
        )}
      </div>
      <div>
        {parsed.err && <Note tone="err">Could not read this DXF: {parsed.err}</Note>}
        {d && (
          <Stats>
            <Stat label="Extents" value={`${num(d.ext.x1 - d.ext.x0, 2)} × ${num(d.ext.y1 - d.ext.y0, 2)}`} sub={`units: ${d.units}`} />
            <Stat label="Entities" value={Object.values(d.counts).reduce((a, b) => a + b, 0)} sub={`${d.paths.length} paths · ${d.texts.length} texts`} />
            <Stat label="Blocks" value={d.blocks} sub={`${d.layers.length} layers`} />
            <Stat label="Last measurement" value={last ? `${num(Math.hypot(last.b[0] - last.a[0], last.b[1] - last.a[1]), 3)}${u}` : '—'} tone="accent" sub={last ? `Δx ${num(last.b[0] - last.a[0], 3)} · Δy ${num(last.b[1] - last.a[1], 3)}` : 'click two points'} />
          </Stats>
        )}
        <Panel
          title="Drawing"
          actions={
            <>
              <Seg label="Mode" value={mode} onChange={(m) => { setMode(m); setPending(null) }} options={[['measure', '📏 Measure'], ['pan', '✋ Pan']]} />
              <Btn onClick={fit}>⤢ Fit</Btn>
              <Btn onClick={() => cv.current?.toBlob((b) => b && download(file.name.replace(/\.dxf$/i, '') + '.png', b, 'image/png'))}>⬇ PNG</Btn>
              <Btn onClick={exportSvg}>⬇ SVG</Btn>
            </>
          }
        >
          <div ref={box} style={{ position: 'relative' }}>
            <canvas
              ref={cv}
              style={{ width: '100%', height: H, display: 'block', borderRadius: 10, touchAction: 'none', cursor: mode === 'measure' ? 'crosshair' : 'grab' }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={() => setCursor(null)}
              onDoubleClick={fit}
            />
            {cursor && (
              <div style={{ position: 'absolute', left: 8, bottom: 8, fontFamily: 'var(--mono)', fontSize: 12, background: 'rgba(0,0,0,.6)', color: '#e5e7eb', padding: '2px 8px', borderRadius: 6, pointerEvents: 'none' }}>
                X {num(cursor.w[0], 3)} Y {num(cursor.w[1], 3)}{cursor.snapped ? ' · snap' : ''}
              </div>
            )}
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>Wheel to zoom, drag to pan, double-click to fit. In measure mode click two points; points snap to line ends, midpoints, vertices and circle centres/quadrants.</p>
        </Panel>
        {meas.length > 0 && (
          <Panel title="Measurements" actions={<Btn kind="ghost" onClick={() => setMeas([])}>Clear</Btn>}>
            <Table
              head={['#', 'Distance', 'Δx', 'Δy', 'Angle']}
              rows={meas.map((m, i) => {
                const dx = m.b[0] - m.a[0], dy = m.b[1] - m.a[1]
                return [i + 1, <b key="d">{num(Math.hypot(dx, dy), 4)}{u}</b>, num(dx, 4), num(dy, 4), `${num(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, 2)}°`]
              })}
            />
          </Panel>
        )}
        <Note>The file is parsed in your browser. Supported: LINE, (LW)POLYLINE with arcs, CIRCLE, ARC, ELLIPSE, SPLINE, TEXT/MTEXT, SOLID, POINT, INSERT (nested blocks, arrays) and DIMENSION graphics. HATCH fills and 3D solids are skipped.</Note>
      </div>
    </Split>
  )
}
