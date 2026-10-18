import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, Note, Num, Panel, Row, Seg, Slider, Split, Table, uid, useToolState } from '../kit'
import { emit, lensmaker, prismVerts, thinLensImage, trace, type El, type Source, type V } from './lib/optics-ray-tracer'

interface State { els: El[]; src: Source; showF: boolean; sel: string | null }

const BOUNDS = { x0: -5, x1: 125, y0: -30, y1: 30 }

const PRESETS: { name: string; s: Omit<State, 'showF' | 'sel'> }[] = [
  { name: 'Image formation', s: { src: { kind: 'point', x: 8, y: 5, angle: -4, spread: 26, width: 10, count: 9, white: false }, els: [{ id: 'l1', kind: 'thin', x: 40, y: 0, a: 12, f: 12 }] } },
  { name: 'Diverging lens', s: { src: { kind: 'parallel', x: 0, y: 0, angle: 0, spread: 20, width: 14, count: 9, white: false }, els: [{ id: 'l1', kind: 'thin', x: 45, y: 0, a: 12, f: -18 }] } },
  { name: 'Keplerian telescope', s: { src: { kind: 'parallel', x: 0, y: 0, angle: 3, spread: 20, width: 10, count: 7, white: false }, els: [{ id: 'o', kind: 'thin', x: 25, y: 0, a: 9, f: 40 }, { id: 'e', kind: 'thin', x: 75, y: 0, a: 9, f: 10 }] } },
  { name: 'Concave mirror', s: { src: { kind: 'parallel', x: 0, y: 0, angle: 0, spread: 20, width: 18, count: 9, white: false }, els: [{ id: 'm', kind: 'mirror', x: 95, y: 0, a: 14, r: -70 }] } },
  { name: 'Thick lens aberration', s: { src: { kind: 'parallel', x: 0, y: 0, angle: 0, spread: 20, width: 20, count: 15, white: false }, els: [{ id: 't', kind: 'thick', x: 40, y: 0, a: 11.5, r1: 24, r2: -24, t: 7, n: 1.6 }] } },
  { name: 'Prism dispersion', s: { src: { kind: 'parallel', x: 0, y: -10, angle: 14, spread: 20, width: 0.5, count: 1, white: true }, els: [{ id: 'p', kind: 'prism', x: 50, y: 0, size: 26, rot: 0, n: 1.62 }, { id: 's', kind: 'screen', x: 86, y: -16, a: 13 }] } },
]
const DEF: State = { ...PRESETS[0].s, showF: true, sel: null }

const LABEL: Record<El['kind'], string> = { thin: 'Thin lens', thick: 'Thick lens', mirror: 'Mirror', screen: 'Screen', prism: 'Prism' }

export default function OpticsRayTracer() {
  const [s, set, reset] = useToolState('optics-ray-tracer', DEF)
  const cv = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(800)
  const H = 440
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const view = useMemo(() => {
    const sc = Math.min(w / (BOUNDS.x1 - BOUNDS.x0), H / (BOUNDS.y1 - BOUNDS.y0))
    const ox = (w - sc * (BOUNDS.x1 - BOUNDS.x0)) / 2
    const oy = H / 2
    return { sc, X: (x: number) => ox + (x - BOUNDS.x0) * sc, Y: (y: number) => oy - y * sc, ix: (px: number) => BOUNDS.x0 + (px - ox) / sc, iy: (py: number) => (oy - py) / sc }
  }, [w])

  const rays = useMemo(() => emit(s.src).map((r) => ({ ...r, pts: trace(r.o, r.d, s.els, BOUNDS, r.lambda) })), [s.src, s.els])

  // paraxial chain through thin lenses for a point source
  const chain = useMemo(() => {
    if (s.src.kind !== 'point') return []
    const lenses = s.els.filter((e): e is Extract<El, { kind: 'thin' }> => e.kind === 'thin' && e.x > s.src.x).sort((a, b) => a.x - b.x)
    let objX = s.src.x, objY = s.src.y
    return lenses.map((l) => {
      const u = l.x - objX
      const { v, m } = thinLensImage(l.f, u)
      const imgX = l.x + v
      const imgY = objY * m
      const row = { l, u, v, m, imgX, imgY }
      objX = imgX
      objY = imgY
      return row
    })
  }, [s.src, s.els])

  useEffect(() => {
    const c = cv.current
    if (!c) return
    const dpr = Math.min(2, devicePixelRatio || 1)
    c.width = w * dpr
    c.height = H * dpr
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    const { X, Y, sc } = view
    g.fillStyle = '#0b1220'
    g.fillRect(0, 0, w, H)
    // grid
    g.font = '11px system-ui, sans-serif'
    for (let x = 0; x <= BOUNDS.x1; x += 10) {
      g.strokeStyle = 'rgba(148,163,184,0.10)'
      g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke()
      g.fillStyle = 'rgba(148,163,184,0.6)'
      g.fillText(`${x}`, X(x) + 2, H - 4)
    }
    g.strokeStyle = 'rgba(148,163,184,0.45)'
    g.setLineDash([6, 6])
    g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(w, Y(0)); g.stroke()
    g.setLineDash([])
    // rays
    g.globalCompositeOperation = 'lighter'
    g.lineWidth = 1.4
    for (const r of rays) {
      g.strokeStyle = r.color
      g.globalAlpha = s.src.white ? 0.75 : 0.85
      g.beginPath()
      r.pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))))
      g.stroke()
    }
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
    // elements
    for (const e of s.els) {
      const selected = e.id === s.sel
      g.lineWidth = selected ? 3 : 2
      if (e.kind === 'thin') {
        g.strokeStyle = selected ? '#fde047' : '#7dd3fc'
        const top = Y(e.y + e.a), bot = Y(e.y - e.a), x = X(e.x)
        g.beginPath(); g.moveTo(x, top); g.lineTo(x, bot); g.stroke()
        const k = e.f > 0 ? 1 : -1
        for (const [yy, dir] of [[top, -1], [bot, 1]] as [number, number][]) {
          g.beginPath(); g.moveTo(x - 7, yy - dir * 7 * k); g.lineTo(x, yy); g.lineTo(x + 7, yy - dir * 7 * k); g.stroke()
        }
        if (s.showF) for (const fx of [e.x - e.f, e.x + e.f]) {
          g.fillStyle = '#7dd3fc'
          g.beginPath(); g.arc(X(fx), Y(e.y), 3.5, 0, Math.PI * 2); g.fill()
          g.fillText('F', X(fx) - 3, Y(e.y) - 8)
        }
      } else if (e.kind === 'thick') {
        g.fillStyle = 'rgba(125,211,252,0.18)'
        g.strokeStyle = selected ? '#fde047' : '#7dd3fc'
        g.beginPath()
        const N = 40
        const side = (vx: number, r: number, from: number, to: number) => {
          for (let i = 0; i <= N; i++) {
            const y = from + ((to - from) * i) / N
            const sag = Math.abs(r) > 1e6 || r === 0 ? 0 : r - Math.sign(r) * Math.sqrt(Math.max(0, r * r - y * y))
            const px = X(vx + sag), py = Y(e.y + y)
            if (i === 0 && from === e.a) g.moveTo(px, py)
            else g.lineTo(px, py)
          }
        }
        side(e.x - e.t / 2, e.r1, e.a, -e.a)
        side(e.x + e.t / 2, e.r2, -e.a, e.a)
        g.closePath(); g.fill(); g.stroke()
        if (s.showF) {
          const f = lensmaker(e.n, e.r1, e.r2, e.t)
          g.fillStyle = '#7dd3fc'
          for (const fx of [e.x - f, e.x + f]) { g.beginPath(); g.arc(X(fx), Y(e.y), 3.5, 0, Math.PI * 2); g.fill() }
        }
      } else if (e.kind === 'mirror') {
        g.strokeStyle = selected ? '#fde047' : '#e2e8f0'
        g.lineWidth = selected ? 4 : 3
        g.beginPath()
        for (let i = 0; i <= 40; i++) {
          const y = -e.a + (2 * e.a * i) / 40
          const sag = e.r === 0 || Math.abs(e.r) > 1e6 ? 0 : e.r - Math.sign(e.r) * Math.sqrt(Math.max(0, e.r * e.r - y * y))
          if (i) g.lineTo(X(e.x + sag), Y(e.y + y))
          else g.moveTo(X(e.x + sag), Y(e.y + y))
        }
        g.stroke()
        if (s.showF && e.r !== 0) {
          g.fillStyle = '#e2e8f0'
          g.beginPath(); g.arc(X(e.x + e.r / 2), Y(e.y), 3.5, 0, Math.PI * 2); g.fill()
          g.fillText('F', X(e.x + e.r / 2) - 3, Y(e.y) - 8)
        }
      } else if (e.kind === 'screen') {
        g.fillStyle = selected ? '#fde047' : '#64748b'
        g.fillRect(X(e.x) - 3, Y(e.y + e.a), 6, e.a * 2 * sc)
      } else {
        const vs = prismVerts(e)
        g.fillStyle = 'rgba(165,180,252,0.2)'
        g.strokeStyle = selected ? '#fde047' : '#a5b4fc'
        g.beginPath()
        vs.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))))
        g.closePath(); g.fill(); g.stroke()
      }
    }
    // source
    g.fillStyle = '#facc15'
    g.strokeStyle = '#facc15'
    g.lineWidth = 2
    if (s.src.kind === 'point') {
      g.beginPath(); g.moveTo(X(s.src.x), Y(0)); g.lineTo(X(s.src.x), Y(s.src.y)); g.stroke()
      g.beginPath(); g.arc(X(s.src.x), Y(s.src.y), 6, 0, Math.PI * 2); g.fill()
      g.fillText('object', X(s.src.x) + 8, Y(s.src.y) - 6)
      for (const c of chain) {
        if (!Number.isFinite(c.imgX) || c.imgX < BOUNDS.x0 || c.imgX > BOUNDS.x1) continue
        g.strokeStyle = 'rgba(250,204,21,0.8)'
        g.setLineDash(c.v < 0 ? [4, 4] : [])
        g.beginPath(); g.moveTo(X(c.imgX), Y(0)); g.lineTo(X(c.imgX), Y(c.imgY)); g.stroke()
        g.setLineDash([])
        g.fillText(c.v < 0 ? 'virtual image' : 'image', X(c.imgX) + 6, Y(c.imgY) + (c.imgY < 0 ? 14 : -6))
      }
    } else {
      g.fillRect(X(s.src.x) - 4, Y(s.src.y + s.src.width / 2) - 2, 8, s.src.width * sc + 4)
    }
  }, [rays, s.els, s.src, s.sel, s.showF, view, w, chain])

  const hitTest = (px: number, py: number): string | null => {
    const { ix, iy, sc } = view
    const x = ix(px), y = iy(py)
    const tol = 10 / sc
    if (Math.hypot(x - s.src.x, y - s.src.y) < tol * 1.5 || (s.src.kind === 'parallel' && Math.abs(x - s.src.x) < tol && Math.abs(y - s.src.y) < s.src.width / 2 + tol)) return 'src'
    for (const e of [...s.els].reverse()) {
      if (e.kind === 'prism') {
        if (Math.hypot(x - e.x, y - e.y) < e.size / 2) return e.id
      } else if (Math.abs(x - e.x) < tol + (e.kind === 'thick' ? e.t / 2 : 0) && Math.abs(y - e.y) < e.a + tol) return e.id
    }
    return null
  }
  const pos = (ev: React.PointerEvent) => {
    const r = (ev.target as HTMLCanvasElement).getBoundingClientRect()
    return [ev.clientX - r.left, ev.clientY - r.top] as V
  }
  const round = (v: number) => Math.round(v * 2) / 2

  const sel = s.els.find((e) => e.id === s.sel)
  const editSel = (p: Partial<El>) => set({ els: s.els.map((e) => (e.id === s.sel ? ({ ...e, ...p } as El) : e)) })
  const addEl = (kind: El['kind']) => {
    const id = uid()
    const x = 60
    const e: El = kind === 'thin' ? { id, kind, x, y: 0, a: 12, f: 15 } : kind === 'thick' ? { id, kind, x, y: 0, a: 10, r1: 25, r2: -25, t: 6, n: 1.52 }
      : kind === 'mirror' ? { id, kind, x: 100, y: 0, a: 14, r: -60 } : kind === 'screen' ? { id, kind, x: 115, y: 0, a: 25 } : { id, kind, x, y: 0, size: 22, rot: 0, n: 1.6 }
    set({ els: [...s.els, e], sel: id })
  }
  const edge = sel?.kind === 'thick' ? sel.t - (Math.abs(sel.r1) > 1e6 ? 0 : sel.r1 - Math.sign(sel.r1) * Math.sqrt(Math.max(0, sel.r1 ** 2 - sel.a ** 2))) + (Math.abs(sel.r2) > 1e6 ? 0 : sel.r2 - Math.sign(sel.r2) * Math.sqrt(Math.max(0, sel.r2 ** 2 - sel.a ** 2))) : 0

  return (
    <Split wide="left">
      <div>
        <Panel title="Optical bench (cm)" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            {PRESETS.map((p) => <Btn key={p.name} kind="ghost" onClick={() => set({ ...p.s, sel: null })}>{p.name}</Btn>)}
          </Row>
          <div ref={box} style={{ width: '100%' }}>
            <canvas
              ref={cv}
              style={{ width: w, height: H, display: 'block', borderRadius: 10, touchAction: 'none', cursor: 'grab' }}
              onPointerDown={(ev) => {
                const [px, py] = pos(ev)
                const id = hitTest(px, py)
                if (!id) return set({ sel: null })
                const o = id === 'src' ? s.src : s.els.find((e) => e.id === id)!
                drag.current = { id, dx: view.ix(px) - o.x, dy: view.iy(py) - o.y }
                ;(ev.target as HTMLCanvasElement).setPointerCapture(ev.pointerId)
                if (id !== 'src') set({ sel: id })
              }}
              onPointerMove={(ev) => {
                const d = drag.current
                if (!d) return
                const [px, py] = pos(ev)
                const x = round(Math.min(BOUNDS.x1, Math.max(BOUNDS.x0, view.ix(px) - d.dx)))
                const y = round(Math.min(BOUNDS.y1, Math.max(BOUNDS.y0, view.iy(py) - d.dy)))
                if (d.id === 'src') set({ src: { ...s.src, x, y } })
                else set({ els: s.els.map((e) => (e.id === d.id ? { ...e, x, y: e.kind === 'prism' || ev.shiftKey ? y : e.y } : e)) })
              }}
              onPointerUp={() => (drag.current = null)}
            />
          </div>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Drag the source and any element. Elements slide along the axis (hold Shift to move off-axis); prisms move freely.</p>
        </Panel>
        {chain.length > 0 && (
          <Panel title="Thin-lens equation check  (1/f = 1/u + 1/v)">
            <Table
              head={['Lens', 'f', 'u (object)', 'v (image)', 'm', 'Image']}
              rows={chain.map((c) => [`x = ${c.l.x}`, c.l.f, c.u.toFixed(2), Number.isFinite(c.v) ? c.v.toFixed(2) : '∞', Number.isFinite(c.m) ? c.m.toFixed(3) : '∞', !Number.isFinite(c.v) ? 'at infinity' : `${c.v > 0 ? 'real' : 'virtual'}, ${c.m < 0 ? 'inverted' : 'upright'}, ${Math.abs(c.m) > 1 ? 'magnified' : 'reduced'}`])}
            />
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Distances in cm; u is measured from the previous image (negative = virtual object). The traced rays should cross exactly at the dashed image marker.</p>
          </Panel>
        )}
      </div>
      <div>
        <Panel title="Light source">
          <Seg value={s.src.kind} onChange={(kind) => set({ src: { ...s.src, kind } })} options={[['point', 'Point / object'], ['parallel', 'Parallel beam']]} />
          <Row>
            <Num label="x" value={s.src.x} onChange={(x) => set({ src: { ...s.src, x } })} unit="cm" />
            <Num label="y" value={s.src.y} onChange={(y) => set({ src: { ...s.src, y } })} unit="cm" />
          </Row>
          <Slider label="Direction" value={s.src.angle} onChange={(angle) => set({ src: { ...s.src, angle } })} min={-45} max={45} unit="°" show={(v) => String(v)} />
          {s.src.kind === 'point' ? <Slider label="Fan spread" value={s.src.spread} onChange={(spread) => set({ src: { ...s.src, spread } })} min={1} max={120} unit="°" show={(v) => String(v)} />
            : <Slider label="Beam width" value={s.src.width} onChange={(width) => set({ src: { ...s.src, width } })} min={0} max={40} step={0.5} unit=" cm" />}
          <Slider label="Rays" value={s.src.count} onChange={(count) => set({ src: { ...s.src, count } })} min={1} max={41} show={(v) => String(v)} />
          <Check label="White light (7 wavelengths, shows dispersion)" value={s.src.white} onChange={(white) => set({ src: { ...s.src, white } })} />
          <Check label="Show focal points" value={s.showF} onChange={(showF) => set({ showF })} />
        </Panel>
        <Panel title="Elements">
          <Row>
            {(['thin', 'thick', 'mirror', 'prism', 'screen'] as El['kind'][]).map((k) => <Btn key={k} onClick={() => addEl(k)}>+ {LABEL[k]}</Btn>)}
          </Row>
          {s.els.map((e) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
              <a href="#" onClick={(ev) => { ev.preventDefault(); set({ sel: e.id }) }} style={{ fontWeight: e.id === s.sel ? 700 : 400 }}>{LABEL[e.kind]} @ x = {e.x}</a>
              <Btn kind="ghost" onClick={() => set({ els: s.els.filter((x) => x.id !== e.id), sel: null })}>✕</Btn>
            </div>
          ))}
        </Panel>
        {sel && (
          <Panel title={`Selected: ${LABEL[sel.kind]}`}>
            <Row>
              <Num label="x" value={sel.x} onChange={(x) => editSel({ x })} unit="cm" />
              <Num label="y" value={sel.y} onChange={(y) => editSel({ y })} unit="cm" />
            </Row>
            {sel.kind === 'thin' && <Row><Num label="Focal length f" value={sel.f} onChange={(f) => editSel({ f: f || 0.1 })} unit="cm" hint="negative = diverging" /><Num label="Half aperture" value={sel.a} onChange={(a) => editSel({ a })} unit="cm" min={0.5} /></Row>}
            {sel.kind === 'thick' && (
              <>
                <Row>
                  <Num label="R1 (front)" value={sel.r1} onChange={(r1) => editSel({ r1 })} unit="cm" hint="+ convex, 0 = flat" />
                  <Num label="R2 (back)" value={sel.r2} onChange={(r2) => editSel({ r2 })} unit="cm" hint="− convex, 0 = flat" />
                </Row>
                <Row>
                  <Num label="Centre thickness" value={sel.t} onChange={(t) => editSel({ t })} unit="cm" min={0.1} />
                  <Num label="Index n" value={sel.n} onChange={(n) => editSel({ n })} min={1} max={3} step={0.01} />
                  <Num label="Half aperture" value={sel.a} onChange={(a) => editSel({ a })} unit="cm" min={0.5} />
                </Row>
                <p style={{ margin: 0 }}>Lensmaker focal length: <b>{lensmaker(sel.n, sel.r1 || Infinity, sel.r2 || Infinity, sel.t).toFixed(2)} cm</b></p>
                {edge <= 0 && <Note tone="err">The surfaces cross before the rim (edge thickness {edge.toFixed(2)} cm). Increase thickness or reduce the aperture.</Note>}
                {(sel.r1 !== 0 && sel.a >= Math.abs(sel.r1)) || (sel.r2 !== 0 && sel.a >= Math.abs(sel.r2)) ? <Note tone="err">Aperture must be smaller than |R|.</Note> : null}
              </>
            )}
            {sel.kind === 'mirror' && <Row><Num label="Radius R" value={sel.r} onChange={(r) => editSel({ r })} unit="cm" hint="− concave (facing left), + convex, 0 = flat" /><Num label="Half aperture" value={sel.a} onChange={(a) => editSel({ a })} unit="cm" min={0.5} /></Row>}
            {sel.kind === 'mirror' && sel.r !== 0 && <p style={{ margin: 0 }}>Focal length f = |R| / 2 = <b>{(Math.abs(sel.r) / 2).toFixed(2)} cm</b></p>}
            {sel.kind === 'screen' && <Num label="Half height" value={sel.a} onChange={(a) => editSel({ a })} unit="cm" min={0.5} />}
            {sel.kind === 'prism' && (
              <Row>
                <Num label="Side" value={sel.size} onChange={(size) => editSel({ size })} unit="cm" min={1} />
                <Num label="Rotation" value={sel.rot} onChange={(rot) => editSel({ rot })} unit="°" />
                <Num label="Index n (589 nm)" value={sel.n} onChange={(n) => editSel({ n })} min={1} max={3} step={0.01} />
              </Row>
            )}
          </Panel>
        )}
        <Note>Thin lenses are ideal (paraxial mapping, no aberrations). Thick lenses, mirrors and prisms are traced exactly with Snell’s law and the law of reflection, so spherical aberration and total internal reflection appear naturally. Glass dispersion follows a Cauchy model.</Note>
      </div>
    </Split>
  )
}
