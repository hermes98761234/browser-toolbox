import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, color, CsvButton, Note, Num, Panel, Row, Slider, Split, Table, uid, useToolState } from '../kit'
import { compile, findExtrema, findZeros, gridStep, sampleCurve } from './lib/graphing-calculator'

interface Func {
  id: string
  expr: string
  color: string
  on: boolean
}
interface View {
  x0: number
  x1: number
  y0: number
  y1: number
}
interface KeyPoint {
  x: number
  y: number
  kind: string
  color: string
}

const VARS = ['x', 'a', 'b', 'c']
const HOME: View = { x0: -8, x1: 8, y0: -5, y1: 5 }
const DEF = {
  funcs: [
    { id: 'f1', expr: 'a sin(b x)', color: color(0), on: true },
    { id: 'f2', expr: 'x^2/4 - 2', color: color(1), on: true },
    { id: 'f3', expr: '1/(x - 1)', color: color(4), on: true },
  ] as Func[],
  a: 2, b: 1, c: 0,
  view: HOME,
  roots: true, inter: true, extrema: true,
  tStart: -2, tStep: 0.5,
}
const EXAMPLES = ['sin(x)/x', 'e^(-x^2)', 'sqrt(9 - x^2)', 'tan(x)', 'ln(x)', '|x| - 1', 'floor(x)', 'x^3 - 3x', 'c + cos(x)', 'gamma(x)']

const fmtN = (v: number) => (Math.abs(v) < 1e-10 ? '0' : Math.abs(v) >= 1e5 || Math.abs(v) < 1e-3 ? v.toExponential(3) : String(Number(v.toFixed(4))))

export default function GraphingCalculator() {
  const [s, set, reset] = useToolState('graphing-calculator', DEF)
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [W, setW] = useState(800)
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ px: number; py: number; v: View } | null>(null)
  const H = W < 600 ? 360 : 500
  const v = s.view

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const compiled = useMemo(
    () =>
      s.funcs.map((f) => {
        try {
          const fn = compile(f.expr, VARS)
          return { f, fn, err: '' }
        } catch (e) {
          return { f, fn: null, err: (e as Error).message }
        }
      }),
    [s.funcs],
  )
  const live = compiled.filter((c) => c.fn && c.f.on).map((c) => {
    const env = { x: 0, a: s.a, b: s.b, c: s.c }
    const g = (x: number) => {
      env.x = x
      return c.fn!(env)
    }
    return { ...c, g }
  })

  const curves = useMemo(() => live.map((c) => ({ color: c.f.color, segs: sampleCurve(c.g, v.x0, v.x1, v.y0, v.y1, W, H) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compiled, s.a, s.b, s.c, v, W, H])

  const points = useMemo(() => {
    const pts: KeyPoint[] = []
    const inView = (y: number) => y >= v.y0 && y <= v.y1
    for (const c of live) {
      if (s.roots) for (const x of findZeros(c.g, v.x0, v.x1)) pts.push({ x, y: 0, kind: 'root', color: c.f.color })
      if (s.extrema) for (const e of findExtrema(c.g, v.x0, v.x1)) if (inView(e.y)) pts.push({ x: e.x, y: e.y, kind: e.kind === 'min' ? 'minimum' : 'maximum', color: c.f.color })
      const y0 = c.g(0)
      if (Number.isFinite(y0) && inView(y0) && v.x0 <= 0 && v.x1 >= 0) pts.push({ x: 0, y: y0, kind: 'y-intercept', color: c.f.color })
    }
    if (s.inter)
      for (let i = 0; i < live.length; i++)
        for (let j = i + 1; j < live.length; j++) {
          const A = live[i].g, B = live[j].g
          for (const x of findZeros((x) => A(x) - B(x), v.x0, v.x1)) {
            const y = A(x)
            if (inView(y)) pts.push({ x, y, kind: `intersection f${i + 1}∩f${j + 1}`, color: '#64748b' })
          }
        }
    return pts.slice(0, 300)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compiled, s.a, s.b, s.c, v, s.roots, s.extrema, s.inter])

  const toPx = (x: number, y: number): [number, number] => [((x - v.x0) / (v.x1 - v.x0)) * W, ((v.y1 - y) / (v.y1 - v.y0)) * H]
  const toW = (px: number, py: number): [number, number] => [v.x0 + (px / W) * (v.x1 - v.x0), v.y1 - (py / H) * (v.y1 - v.y0)]

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = W * dpr
    cv.height = H * dpr
    const ctx = cv.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const css = getComputedStyle(cv)
    const fg = css.getPropertyValue('--fg').trim() || '#0f172a'
    const muted = css.getPropertyValue('--muted').trim() || '#64748b'
    const grid = css.getPropertyValue('--grid').trim() || 'rgba(100,116,139,.15)'
    const bg = css.getPropertyValue('--chart-bg').trim() || css.getPropertyValue('--panel').trim() || '#fff'
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)
    const sxStep = gridStep(v.x1 - v.x0, W, 70), syStep = gridStep(v.y1 - v.y0, H, 55)
    ctx.lineWidth = 1
    ctx.font = '11px system-ui, sans-serif'
    // minor + major grid
    ctx.strokeStyle = grid
    for (let x = Math.ceil(v.x0 / sxStep) * sxStep; x <= v.x1; x += sxStep) {
      const [px] = toPx(x, 0)
      ctx.beginPath()
      ctx.moveTo(Math.round(px) + 0.5, 0)
      ctx.lineTo(Math.round(px) + 0.5, H)
      ctx.stroke()
    }
    for (let y = Math.ceil(v.y0 / syStep) * syStep; y <= v.y1; y += syStep) {
      const [, py] = toPx(0, y)
      ctx.beginPath()
      ctx.moveTo(0, Math.round(py) + 0.5)
      ctx.lineTo(W, Math.round(py) + 0.5)
      ctx.stroke()
    }
    // axes
    const [ax, ay] = toPx(0, 0)
    ctx.strokeStyle = muted
    ctx.lineWidth = 1.5
    ctx.beginPath()
    if (ay >= 0 && ay <= H) {
      ctx.moveTo(0, ay)
      ctx.lineTo(W, ay)
    }
    if (ax >= 0 && ax <= W) {
      ctx.moveTo(ax, 0)
      ctx.lineTo(ax, H)
    }
    ctx.stroke()
    // tick labels (pinned to the edge when the axis is off-screen)
    ctx.fillStyle = muted
    const ly = Math.min(H - 4, Math.max(14, ay + 14))
    ctx.textAlign = 'center'
    for (let x = Math.ceil(v.x0 / sxStep) * sxStep; x <= v.x1; x += sxStep) {
      if (Math.abs(x) < sxStep / 2) continue
      ctx.fillText(fmtN(x), toPx(x, 0)[0], ly)
    }
    ctx.textAlign = 'right'
    const lx = Math.min(W - 4, Math.max(30, ax - 5))
    for (let y = Math.ceil(v.y0 / syStep) * syStep; y <= v.y1; y += syStep) {
      if (Math.abs(y) < syStep / 2) continue
      ctx.fillText(fmtN(y), lx, toPx(0, y)[1] + 4)
    }
    // curves
    ctx.lineWidth = 2.4
    ctx.lineJoin = 'round'
    for (const c of curves) {
      ctx.strokeStyle = c.color
      for (const seg of c.segs) {
        ctx.beginPath()
        seg.forEach(([x, y], i) => {
          const [px, py] = toPx(x, y)
          if (i) ctx.lineTo(px, py)
          else ctx.moveTo(px, py)
        })
        ctx.stroke()
      }
    }
    // key points
    for (const p of points) {
      const [px, py] = toPx(p.x, p.y)
      ctx.beginPath()
      ctx.arc(px, py, 4.5, 0, Math.PI * 2)
      ctx.fillStyle = bg
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = p.color
      ctx.stroke()
    }
    // trace
    if (mouse) {
      const [mx] = toW(mouse.x, mouse.y)
      ctx.strokeStyle = muted
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(mouse.x, 0)
      ctx.lineTo(mouse.x, H)
      ctx.stroke()
      ctx.setLineDash([])
      const near = points.find((p) => Math.hypot(toPx(p.x, p.y)[0] - mouse.x, toPx(p.x, p.y)[1] - mouse.y) < 10)
      const lines: [string, string][] = near
        ? [[near.color, `${near.kind}: (${fmtN(near.x)}, ${fmtN(near.y)})`]]
        : [[fg, `x = ${fmtN(mx)}`], ...live.map((c, i) => [c.f.color, `f${s.funcs.indexOf(c.f) + 1 || i + 1}(x) = ${fmtN(c.g(mx))}`] as [string, string])]
      for (const c of live) {
        const y = c.g(mx)
        if (!Number.isFinite(y)) continue
        const [, py] = toPx(mx, y)
        ctx.beginPath()
        ctx.arc(mouse.x, py, 3.5, 0, Math.PI * 2)
        ctx.fillStyle = c.f.color
        ctx.fill()
      }
      ctx.font = '12px system-ui, sans-serif'
      const bw = Math.max(...lines.map((l) => ctx.measureText(l[1]).width)) + 20
      const bx = Math.min(W - bw - 6, mouse.x + 12), by = 10
      ctx.fillStyle = bg
      ctx.globalAlpha = 0.92
      ctx.fillRect(bx, by, bw, lines.length * 17 + 8)
      ctx.globalAlpha = 1
      ctx.strokeStyle = grid
      ctx.strokeRect(bx, by, bw, lines.length * 17 + 8)
      ctx.textAlign = 'left'
      lines.forEach(([c, t], i) => {
        ctx.fillStyle = c
        ctx.fillText(t, bx + 10, by + 18 + i * 17)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curves, points, mouse, W, H])

  const zoom = (k: number, cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2) =>
    set({ view: { x0: cx + (v.x0 - cx) * k, x1: cx + (v.x1 - cx) * k, y0: cy + (v.y0 - cy) * k, y1: cy + (v.y1 - cy) * k } })

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = cv.getBoundingClientRect()
      const [wx, wy] = toW(e.clientX - r.left, e.clientY - r.top)
      zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, wx, wy)
    }
    cv.addEventListener('wheel', onWheel, { passive: false })
    return () => cv.removeEventListener('wheel', onWheel)
  })

  const editF = (id: string, p: Partial<Func>) => set({ funcs: s.funcs.map((f) => (f.id === id ? { ...f, ...p } : f)) })
  const tf = live[0]
  const tableRows = tf ? Array.from({ length: 21 }, (_, i) => s.tStart + i * s.tStep).map((x) => [fmtN(x), ...live.map((c) => fmtN(c.g(x)))]) : []
  const usesParam = (p: string) => s.funcs.some((f) => f.on && new RegExp(`(^|[^a-z])${p}([^a-z]|$)|\\d${p}|${p}x|x${p}`).test(f.expr))

  return (
    <Split wide="right">
      <div>
        <Panel title="Functions" actions={<Btn onClick={() => set({ funcs: [...s.funcs, { id: uid(), expr: 'x', color: color(s.funcs.length + 2), on: true }] })}>+ Function</Btn>}>
          {compiled.map(({ f, err }, i) => (
            <div key={f.id} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={f.on} onChange={(e) => editF(f.id, { on: e.target.checked })} aria-label={`Show f${i + 1}`} />
                <input type="color" value={f.color} onChange={(e) => editF(f.id, { color: e.target.value })} aria-label="Colour" style={{ width: 30, height: 30, padding: 0, border: 0, background: 'none' }} />
                <b style={{ color: f.color, whiteSpace: 'nowrap' }}>f{i + 1}(x) =</b>
                <input className="k-text mono" value={f.expr} onChange={(e) => editF(f.id, { expr: e.target.value })} aria-label={`f${i + 1}`} style={{ flex: 1, minWidth: 0, borderColor: err ? 'var(--err)' : undefined }} />
                <Btn kind="ghost" title="Remove" onClick={() => set({ funcs: s.funcs.filter((x) => x.id !== f.id) })}>✕</Btn>
              </div>
              {err && <div style={{ color: 'var(--err)', fontSize: 13, marginLeft: 70 }}>{err}</div>}
            </div>
          ))}
          <div className="muted" style={{ fontSize: 13 }}>Try:</div>
          <Row>
            {EXAMPLES.map((ex) => (
              <Btn key={ex} kind="ghost" onClick={() => set({ funcs: [...s.funcs, { id: uid(), expr: ex, color: color(s.funcs.length + 2), on: true }] })}>{ex}</Btn>
            ))}
          </Row>
        </Panel>
        <Panel title="Parameters">
          {(['a', 'b', 'c'] as const).map((p) => (
            <div key={p} style={{ opacity: usesParam(p) ? 1 : 0.55 }}>
              <Slider label={p} value={s[p]} onChange={(val) => set({ [p]: val })} min={-5} max={5} step={0.1} />
            </div>
          ))}
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Use a, b and c in any function to explore families of curves.</p>
        </Panel>
        <Panel title="Key points" actions={<CsvButton name="key-points.csv" rows={() => [['kind', 'x', 'y'], ...points.map((p) => [p.kind, p.x, p.y])]} />}>
          <Row>
            <Check label="Roots" value={s.roots} onChange={(roots) => set({ roots })} />
            <Check label="Intersections" value={s.inter} onChange={(inter) => set({ inter })} />
            <Check label="Min / max" value={s.extrema} onChange={(extrema) => set({ extrema })} />
          </Row>
          {points.length ? (
            <div style={{ maxHeight: 260, overflow: 'auto' }}>
              <Table head={['', 'Point', 'x', 'y']} rows={points.map((p, i) => [<i key={i} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: p.color }} />, p.kind, fmtN(p.x), fmtN(p.y)])} />
            </div>
          ) : (
            <Note>No key points in view.</Note>
          )}
        </Panel>
      </div>
      <div>
        <Panel
          title="Graph"
          actions={
            <>
              <Btn onClick={() => zoom(1 / 1.5)} title="Zoom in">＋</Btn>
              <Btn onClick={() => zoom(1.5)} title="Zoom out">－</Btn>
              <Btn onClick={() => {
                const cy = (v.y0 + v.y1) / 2
                const half = ((v.x1 - v.x0) * H) / W / 2
                set({ view: { ...v, y0: cy - half, y1: cy + half } })
              }} title="Same scale on both axes">1:1</Btn>
              <Btn onClick={() => set({ view: HOME })}>Home</Btn>
              <Btn onClick={() => {
                const url = canvas.current?.toDataURL('image/png')
                if (!url) return
                const a = document.createElement('a')
                a.href = url
                a.download = 'graph.png'
                a.click()
              }}>⬇ PNG</Btn>
            </>
          }
        >
          <div ref={wrap} style={{ width: '100%' }}>
            <canvas
              ref={canvas}
              style={{ width: W, height: H, display: 'block', borderRadius: 10, touchAction: 'none', cursor: drag.current ? 'grabbing' : 'crosshair' }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                drag.current = { px: e.nativeEvent.offsetX, py: e.nativeEvent.offsetY, v }
              }}
              onPointerMove={(e) => {
                const x = e.nativeEvent.offsetX, y = e.nativeEvent.offsetY
                const d = drag.current
                if (d) {
                  const dx = ((x - d.px) / W) * (d.v.x1 - d.v.x0), dy = ((y - d.py) / H) * (d.v.y1 - d.v.y0)
                  set({ view: { x0: d.v.x0 - dx, x1: d.v.x1 - dx, y0: d.v.y0 + dy, y1: d.v.y1 + dy } })
                } else setMouse({ x, y })
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerLeave={() => setMouse(null)}
            />
          </div>
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>Drag to pan · scroll to zoom at the cursor · hover to trace values and key points. View: x ∈ [{fmtN(v.x0)}, {fmtN(v.x1)}], y ∈ [{fmtN(v.y0)}, {fmtN(v.y1)}]</p>
        </Panel>
        <Panel title="Table of values" actions={<CsvButton name="values.csv" rows={() => [['x', ...live.map((c) => c.f.expr)], ...tableRows]} />}>
          <Row>
            <Num label="Start x" value={s.tStart} onChange={(tStart) => set({ tStart })} />
            <Num label="Step" value={s.tStep} onChange={(tStep) => set({ tStep: tStep || 1 })} />
            <Btn kind="ghost" onClick={reset}>Reset all</Btn>
          </Row>
          {live.length ? (
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              <Table head={['x', ...live.map((c) => <span key={c.f.id} style={{ color: c.f.color }}>{c.f.expr}</span>)]} rows={tableRows} />
            </div>
          ) : (
            <Note>Turn on a valid function to see values.</Note>
          )}
          <p className="muted" style={{ fontSize: 13 }}>
            Supports + − × ÷ ^, implicit multiplication (2x, 3sin x, (x+1)(x−1)), |x|, n!, constants pi, e, tau, phi and functions sin cos tan sec csc cot, asin acos atan, sinh cosh tanh, sqrt cbrt exp ln log log2, abs floor ceil round sign, min max mod pow hypot gamma.
          </p>
        </Panel>
      </div>
    </Split>
  )
}
