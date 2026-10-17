import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, CopyButton, download, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { bounds, demoStrokes, outline, smooth, toSvg, type Pt } from './lib/signature-pad'

const INKS: [string, string][] = [['#111827', 'Black'], ['#1e3a8a', 'Blue ink'], ['#1d4ed8', 'Royal blue'], ['#7f1d1d', 'Burgundy'], ['#065f46', 'Green']]
const DEF = { color: '#1e3a8a', minW: 1.2, maxW: 4.2, velFilter: 0.7, pressure: true, scale: 3, whiteBg: false, guide: true }
const H = 260

export default function SignaturePad() {
  const [s, set] = useToolState('signature-pad', DEF)
  // Strokes are deliberately not persisted: a signature should not linger in storage.
  const [strokes, setStrokes] = useState<Pt[][]>(() => demoStrokes(640, H))
  const [live, setLive] = useState<Pt[] | null>(null)
  const [isDemo, setIsDemo] = useState(true)
  const cv = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(640)

  const pen = { minW: s.minW, maxW: Math.max(s.minW, s.maxW), velFilter: s.velFilter, pressure: s.pressure }
  const polys = useMemo(() => strokes.map((st) => outline(smooth(st, pen))), [strokes, pen.minW, pen.maxW, pen.velFilter, pen.pressure]) // eslint-disable-line react-hooks/exhaustive-deps
  const livePoly = live ? outline(smooth(live, pen)) : null
  const all = livePoly ? [...polys, livePoly] : polys
  const box = bounds(polys)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = cv.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = W * dpr
    c.height = H * dpr
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = s.color
    for (const p of all) {
      if (!p.length) continue
      ctx.beginPath()
      ctx.moveTo(p[0][0], p[0][1])
      for (const [x, y] of p) ctx.lineTo(x, y)
      ctx.closePath()
      ctx.fill()
    }
  })

  const pt = (e: React.PointerEvent): Pt => {
    const r = cv.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp, p: e.pointerType === 'pen' ? e.pressure : undefined }
  }

  const pngBlob = async (): Promise<Blob | null> => {
    if (!box) return null
    const pad = 10, k = s.scale
    const c = document.createElement('canvas')
    c.width = Math.ceil((box.w + 2 * pad) * k)
    c.height = Math.ceil((box.h + 2 * pad) * k)
    const ctx = c.getContext('2d')!
    if (s.whiteBg) {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
    }
    ctx.setTransform(k, 0, 0, k, (-box.x + pad) * k, (-box.y + pad) * k)
    ctx.fillStyle = s.color
    for (const p of polys) {
      ctx.beginPath()
      p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.closePath()
      ctx.fill()
    }
    return new Promise((res) => c.toBlob(res, 'image/png'))
  }

  const svg = () => {
    const out = toSvg(polys, s.color, 10)
    return s.whiteBg ? out.replace('><path', '><rect width="100%" height="100%" fill="#fff"/><path') : out
  }
  const points = strokes.reduce((a, st) => a + st.length, 0)

  return (
    <Split wide="left">
      <div>
        <Panel
          title="Sign here"
          actions={
            <>
              <Btn onClick={() => setStrokes(strokes.slice(0, -1))} disabled={!strokes.length}>↶ Undo</Btn>
              <Btn kind="danger" onClick={() => { setStrokes([]); setIsDemo(false) }} disabled={!strokes.length}>Clear</Btn>
            </>
          }
        >
          <div
            ref={wrap}
            style={{ position: 'relative', height: H, borderRadius: 12, border: '2px dashed var(--line)', background: s.whiteBg ? '#fff' : 'repeating-conic-gradient(rgba(127,127,127,.12) 0 25%, transparent 0 50%) 0 0/20px 20px', overflow: 'hidden', touchAction: 'none' }}
          >
            {s.guide && (
              <div style={{ position: 'absolute', left: 24, right: 24, top: H * 0.74, borderBottom: '1.5px solid rgba(127,127,127,.5)', pointerEvents: 'none' }}>
                <span style={{ position: 'absolute', left: -2, top: -22, fontSize: 18, color: 'rgba(127,127,127,.7)' }}>✕</span>
              </div>
            )}
            <canvas
              ref={cv}
              style={{ width: W, height: H, display: 'block', cursor: 'crosshair', position: 'relative' }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                if (isDemo) {
                  setStrokes([])
                  setIsDemo(false)
                }
                setLive([pt(e)])
              }}
              onPointerMove={(e) => {
                if (!live) return
                const evs = (e.nativeEvent.getCoalescedEvents?.() ?? []) as PointerEvent[]
                const r = cv.current!.getBoundingClientRect()
                const extra = evs.length ? evs.map((c) => ({ x: c.clientX - r.left, y: c.clientY - r.top, t: c.timeStamp, p: c.pointerType === 'pen' ? c.pressure : undefined })) : [pt(e)]
                setLive([...live, ...extra])
              }}
              onPointerUp={() => {
                if (live) setStrokes([...strokes, live])
                setLive(null)
              }}
              onPointerCancel={() => setLive(null)}
            />
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
            {isDemo ? 'A demo signature is shown — start drawing to replace it. ' : ''}Draw with a mouse, finger or stylus (pen pressure is used when available). Nothing is uploaded or stored.
          </p>
        </Panel>
        <Panel title="Pen">
          <Row>
            {INKS.map(([c, n]) => (
              <button key={c} type="button" title={n} onClick={() => set({ color: c })} style={{ width: 34, height: 34, borderRadius: 17, background: c, border: s.color === c ? '3px solid var(--accent)' : '2px solid var(--line)', cursor: 'pointer' }} />
            ))}
            <input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} aria-label="Custom color" style={{ width: 44, height: 34 }} />
          </Row>
          <Row>
            <Slider label="Thinnest" value={s.minW} onChange={(minW) => set({ minW })} min={0.3} max={4} step={0.1} unit=" px" />
            <Slider label="Thickest" value={s.maxW} onChange={(maxW) => set({ maxW })} min={1} max={10} step={0.1} unit=" px" />
          </Row>
          <Slider label="Velocity response" value={s.velFilter} onChange={(velFilter) => set({ velFilter })} min={0.1} max={1} step={0.05} show={(v) => (v < 0.4 ? `${v.toFixed(2)} (calm)` : v > 0.8 ? `${v.toFixed(2)} (lively)` : v.toFixed(2))} />
          <Row>
            <Check label="Use stylus pressure" value={s.pressure} onChange={(pressure) => set({ pressure })} />
            <Check label="Show signing line" value={s.guide} onChange={(guide) => set({ guide })} />
          </Row>
          <Note>Smoothing: strokes follow quadratic curves through the midpoints of your samples, and width shrinks with speed like a real nib. Changing the pen re-renders existing strokes.</Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Strokes" value={strokes.length} sub={`${points} points`} />
          <Stat label="Trimmed size" value={box ? `${Math.ceil(box.w + 20)} × ${Math.ceil(box.h + 20)}` : '—'} sub="px at 1×" />
        </Stats>
        <Panel title="Export">
          <Seg value={String(s.scale)} onChange={(v) => set({ scale: Number(v) })} options={[['1', '1×'], ['2', '2×'], ['3', '3×'], ['4', '4× (print)']]} label="PNG scale" />
          <Check label="White background (off = transparent)" value={s.whiteBg} onChange={(whiteBg) => set({ whiteBg })} />
          <div style={{ margin: '10px 0', borderRadius: 10, padding: 10, minHeight: 90, display: 'grid', placeItems: 'center', background: s.whiteBg ? '#fff' : 'repeating-conic-gradient(rgba(127,127,127,.15) 0 25%, transparent 0 50%) 0 0/14px 14px' }}>
            {box ? <img alt="Trimmed signature" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg())}`} style={{ maxWidth: '100%', maxHeight: 140 }} /> : <span className="muted">Draw something first</span>}
          </div>
          <Row>
            <Btn kind="primary" disabled={!box} onClick={async () => { const b = await pngBlob(); if (b) download('signature.png', b) }}>⬇ PNG</Btn>
            <Btn disabled={!box} onClick={() => download('signature.svg', svg(), 'image/svg+xml')}>⬇ SVG</Btn>
            <CopyButton label="Copy SVG" text={svg} />
          </Row>
          <Note tone="warn">An image of a signature is not a cryptographic e-signature. Only place it on documents you are entitled to sign.</Note>
        </Panel>
      </div>
    </Split>
  )
}
