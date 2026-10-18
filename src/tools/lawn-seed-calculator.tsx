import { useEffect, useRef, useState } from 'react'
import { Btn, Check, CsvButton, money, niceTicks, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, num, uid, useToolState } from '../kit'
import { FT2_PER_M2, GRASSES, LB1000_TO_GM2, nearestEdge, plan, polyArea, polyPerimeter, selfCrossing, type P } from './lib/lawn-seed-calculator'

type Sys = 'ft' | 'm'
interface Shape { id: string; name: string; kind: 'rect' | 'circle'; a: number; b: number; sub: boolean }

const DEF = {
  sys: 'ft' as Sys,
  poly: [[10, 10], [70, 10], [70, 40], [45, 40], [45, 58], [10, 58]] as P[],
  usePoly: true,
  span: 100,
  snap: true,
  shapes: [
    { id: 'front', name: 'Front lawn', kind: 'rect', a: 40, b: 25, sub: false },
    { id: 'bed', name: 'Round flower bed', kind: 'circle', a: 8, b: 0, sub: true },
  ] as Shape[],
  grass: 'tf',
  mode: 'new' as 'new' | 'over',
  rate: 0, // 0 = use grass default
  extra: 10,
  bag: 10,
  bagPrice: 45,
  nRate: 1,
  nPct: 18,
  fertBag: 15,
  fertPrice: 28,
  cur: '$',
}
const LB_PER_KG = 2.20462

function LawnCanvas({ pts, span, sys, snap, onChange }: { pts: P[]; span: number; sys: Sys; snap: boolean; onChange: (p: P[]) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [w, setW] = useState(600)
  const drag = useRef<number | null>(null)
  const h = Math.round(w * 0.62)
  const k = w / span // px per unit
  useEffect(() => {
    const el = ref.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = Math.min(2, devicePixelRatio || 1)
    c.width = w * dpr
    c.height = h * dpr
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    const css = getComputedStyle(c)
    const line = css.getPropertyValue('--line').trim() || '#ddd'
    const muted = css.getPropertyValue('--muted').trim() || '#888'
    const text = css.getPropertyValue('--text').trim() || '#222'
    g.clearRect(0, 0, w, h)
    const step = niceTicks(0, span, 10)[1] || 10
    g.strokeStyle = line
    g.lineWidth = 1
    g.font = '11px system-ui, sans-serif'
    g.fillStyle = muted
    for (let x = 0; x <= span; x += step) {
      g.beginPath(); g.moveTo(x * k, 0); g.lineTo(x * k, h); g.stroke()
      if (x > 0) g.fillText(`${x}`, x * k + 2, 11)
    }
    for (let y = 0; y <= h / k; y += step) {
      g.beginPath(); g.moveTo(0, y * k); g.lineTo(w, y * k); g.stroke()
      if (y > 0) g.fillText(`${y}`, 2, y * k - 2)
    }
    g.fillText(sys, w - 18, h - 6)
    if (pts.length) {
      g.beginPath()
      pts.forEach(([x, y], i) => (i ? g.lineTo(x * k, y * k) : g.moveTo(x * k, y * k)))
      g.closePath()
      g.fillStyle = selfCrossing(pts) ? 'rgba(239,68,68,.25)' : 'rgba(34,197,94,.35)'
      g.fill()
      g.strokeStyle = '#16a34a'
      g.lineWidth = 2.5
      g.stroke()
      g.fillStyle = text
      g.font = '12px system-ui, sans-serif'
      pts.forEach((a, i) => {
        if (pts.length < 2) return
        const b = pts[(i + 1) % pts.length]
        const len = Math.hypot(b[0] - a[0], b[1] - a[1])
        if (len * k > 40) g.fillText(`${num(len, 1)}`, ((a[0] + b[0]) / 2) * k + 4, ((a[1] + b[1]) / 2) * k - 4)
      })
      pts.forEach(([x, y]) => {
        g.beginPath(); g.arc(x * k, y * k, 6, 0, Math.PI * 2)
        g.fillStyle = '#fff'; g.fill(); g.strokeStyle = '#15803d'; g.lineWidth = 2; g.stroke()
      })
      if (pts.length >= 3) {
        const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length
        g.fillStyle = text
        g.font = 'bold 14px system-ui, sans-serif'
        g.textAlign = 'center'
        g.fillText(`${num(polyArea(pts), 1)} ${sys}²`, cx * k, cy * k)
        g.textAlign = 'left'
      }
    }
  }, [pts, w, h, k, span, sys])

  const at = (e: React.PointerEvent): P => {
    const r = e.currentTarget.getBoundingClientRect()
    let x = ((e.clientX - r.left) / r.width) * span
    let y = ((e.clientY - r.top) / r.width) * span
    const sn = sys === 'ft' ? 1 : 0.5
    if (snap) { x = Math.round(x / sn) * sn; y = Math.round(y / sn) * sn }
    return [Math.max(0, x), Math.max(0, y)]
  }
  const hit = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * w, py = ((e.clientY - r.top) / r.height) * h
    return pts.findIndex(([x, y]) => Math.hypot(x * k - px, y * k - py) < 12)
  }
  return (
    <canvas
      ref={ref}
      style={{ width: '100%', height: h, touchAction: 'none', cursor: 'crosshair', borderRadius: 8, border: '1px solid var(--line)', background: 'color-mix(in srgb, var(--panel) 85%, #16a34a 6%)' }}
      onPointerDown={(e) => {
        const i = hit(e)
        e.currentTarget.setPointerCapture(e.pointerId)
        if (i >= 0) { drag.current = i; return }
        const q = at(e)
        if (pts.length < 3) onChange([...pts, q])
        else {
          const j = nearestEdge(pts, q) + 1
          onChange([...pts.slice(0, j), q, ...pts.slice(j)])
          drag.current = j
        }
      }}
      onPointerMove={(e) => {
        if (drag.current === null) return
        const q = at(e)
        onChange(pts.map((p, i) => (i === drag.current ? q : p)))
      }}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={(e) => {
        const i = hit(e as unknown as React.PointerEvent)
        if (i >= 0) onChange(pts.filter((_, j) => j !== i))
      }}
    />
  )
}

export default function LawnSeedCalculator() {
  const [s, set, reset] = useToolState('lawn-seed-calculator', DEF)
  const met = s.sys === 'm'
  const mass = met ? 'kg' : 'lb'
  const g = GRASSES.find((x) => x.id === s.grass) ?? GRASSES[0]
  const defRate = s.mode === 'new' ? g.newLawn : g.overseed // lb/1000 ft²
  const rateLb = s.rate > 0 ? (met ? s.rate / LB1000_TO_GM2 : s.rate) : defRate
  const shapeArea = (x: Shape) => (x.kind === 'rect' ? x.a * x.b : (Math.PI * x.a * x.a) / 4)
  const polyA = s.usePoly ? polyArea(s.poly) : 0
  const parts = [
    ...(s.usePoly ? [{ name: 'Drawn area', area: polyA, sub: false }] : []),
    ...s.shapes.map((x) => ({ name: x.name, area: shapeArea(x), sub: x.sub })),
  ]
  const net = Math.max(0, parts.reduce((a, p) => a + (p.sub ? -p.area : p.area), 0))
  const ft2 = met ? net * FT2_PER_M2 : net
  const toLb = (x: number) => (met ? x * LB_PER_KG : x)
  const fromLb = (x: number) => (met ? x / LB_PER_KG : x)
  const p = plan(ft2, rateLb, s.extra / 100, toLb(s.bag), s.bagPrice, s.nRate, s.nPct, toLb(s.fertBag), s.fertPrice)
  const m = (x: number) => money(x, s.cur, 2)
  const editShape = (id: string, q: Partial<Shape>) => set({ shapes: s.shapes.map((x) => (x.id === id ? { ...x, ...q } : x)) })
  const switchSys = (sys: Sys) => {
    if (sys === s.sys) return
    const f = sys === 'm' ? 0.3048 : 1 / 0.3048
    const r = (x: number) => Math.round(x * f * 10) / 10
    set({
      sys, poly: s.poly.map(([x, y]) => [r(x), r(y)] as P), span: sys === 'm' ? 30 : 100, rate: 0,
      shapes: s.shapes.map((x) => ({ ...x, a: r(x.a), b: r(x.b) })),
      bag: sys === 'm' ? Math.round(s.bag / LB_PER_KG) || 1 : Math.round(s.bag * LB_PER_KG), fertBag: sys === 'm' ? Math.round(s.fertBag / LB_PER_KG) || 1 : Math.round(s.fertBag * LB_PER_KG),
    })
  }
  const shownRate = met ? rateLb * LB1000_TO_GM2 : rateLb

  return (
    <Split wide="right">
      <div>
        <Panel title="Units & grass" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.sys} onChange={switchSys} options={[['ft', 'Feet / lb'], ['m', 'Metres / kg']]} />
          <Select label="Grass type" value={s.grass} onChange={(grass) => set({ grass, rate: 0 })} options={GRASSES.map((x) => [x.id, `${x.name} · ${x.zone}`] as [string, string])} />
          <Seg value={s.mode} onChange={(mode) => set({ mode, rate: 0 })} options={[['new', 'New lawn (bare soil)'], ['over', 'Overseeding']]} />
          <Row>
            <Num label={`Seeding rate (${met ? 'g/m²' : 'lb/1000 ft²'})`} value={Math.round(shownRate * 100) / 100} onChange={(rate) => set({ rate })} min={0}
              hint={`Typical: ${num(met ? defRate * LB1000_TO_GM2 : defRate, 2)} · germinates in ${g.germ}`} />
            <Num label="Extra for overlap / edges" value={s.extra} onChange={(extra) => set({ extra })} unit="%" min={0} max={100} />
          </Row>
        </Panel>
        <Panel title="Seed product">
          <Row>
            <Num label="Bag size" value={s.bag} onChange={(bag) => set({ bag })} unit={mass} min={0.1} />
            <Num label="Price per bag" value={s.bagPrice} onChange={(bagPrice) => set({ bagPrice })} unit={s.cur} min={0} />
          </Row>
        </Panel>
        <Panel title="Starter fertilizer">
          <Row>
            <Num label="Nitrogen rate" value={s.nRate} onChange={(nRate) => set({ nRate })} unit="lb N/1000 ft²" min={0} hint={met ? `= ${num(s.nRate * LB1000_TO_GM2, 2)} g N/m²` : 'Starter: 0.5–1'} />
            <Num label="Product N %" value={s.nPct} onChange={(nPct) => set({ nPct })} unit="%" min={0.1} max={100} hint="First number of N-P-K" />
          </Row>
          <Row>
            <Num label="Bag size" value={s.fertBag} onChange={(fertBag) => set({ fertBag })} unit={mass} min={0.1} />
            <Num label="Price per bag" value={s.fertPrice} onChange={(fertPrice) => set({ fertPrice })} unit={s.cur} min={0} />
          </Row>
          <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', 'CHF ', 'zł', '₴']} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Lawn area" value={`${num(net, 1)} ${s.sys}²`} sub={met ? `${num(ft2, 0)} ft²` : `${num(ft2 / FT2_PER_M2, 1)} m²`} />
          <Stat label="Seed needed" value={`${num(fromLb(p.seedLb), 1)} ${mass}`} tone="accent" sub={`${p.bags} bag${p.bags === 1 ? '' : 's'} of ${s.bag} ${mass}`} />
          <Stat label="Fertilizer" value={`${num(fromLb(p.fertLb), 1)} ${mass}`} sub={`${p.fertBags} bag${p.fertBags === 1 ? '' : 's'}`} />
          <Stat label="Estimated cost" value={m(p.seedCost + p.fertCost)} sub={`seed ${m(p.seedCost)} + fert. ${m(p.fertCost)}`} />
        </Stats>
        <Panel title="Draw your lawn" actions={<>
          <Btn kind="ghost" onClick={() => set({ poly: s.poly.slice(0, -1) })} disabled={!s.poly.length}>Undo point</Btn>
          <Btn kind="ghost" onClick={() => set({ poly: [] })}>Clear</Btn>
        </>}>
          <LawnCanvas pts={s.poly} span={s.span} sys={s.sys} snap={s.snap} onChange={(poly) => set({ poly })} />
          <Row>
            <Num label={`Canvas width = `} value={s.span} onChange={(span) => set({ span: Math.max(5, span) })} unit={s.sys} min={5} />
            <Check label={`Snap to ${met ? '0.5 m' : '1 ft'}`} value={s.snap} onChange={(snap) => set({ snap })} />
            <Check label="Include drawn area" value={s.usePoly} onChange={(usePoly) => set({ usePoly })} />
          </Row>
          {s.usePoly && selfCrossing(s.poly) && <Note tone="err">The outline crosses itself, so its area is wrong. Drag the points to untangle it.</Note>}
          <Note>Click to add a corner (it joins the nearest edge), drag corners to move them, double-click a corner to delete it. Perimeter: {num(polyPerimeter(s.poly), 1)} {s.sys}.</Note>
        </Panel>
        <Panel title="Rectangles & circles" actions={<>
          <Btn onClick={() => set({ shapes: [...s.shapes, { id: uid(), name: 'Rectangle', kind: 'rect', a: met ? 5 : 15, b: met ? 3 : 10, sub: false }] })}>+ Rectangle</Btn>
          <Btn onClick={() => set({ shapes: [...s.shapes, { id: uid(), name: 'Circle', kind: 'circle', a: met ? 3 : 10, b: 0, sub: false }] })}>+ Circle</Btn>
        </>}>
          <Table head={['Name', 'Size', 'Area', 'Add / subtract', '']} rows={s.shapes.map((x) => [
            <input key="n" value={x.name} onChange={(e) => editShape(x.id, { name: e.target.value })} aria-label="Name" style={{ width: 130 }} />,
            <span key="s" style={{ whiteSpace: 'nowrap' }}>
              <input type="number" min={0} value={x.a} onChange={(e) => editShape(x.id, { a: Math.max(0, +e.target.value || 0) })} style={{ width: 64 }} aria-label={x.kind === 'rect' ? 'Length' : 'Diameter'} />
              {x.kind === 'rect' ? <> × <input type="number" min={0} value={x.b} onChange={(e) => editShape(x.id, { b: Math.max(0, +e.target.value || 0) })} style={{ width: 64 }} aria-label="Width" /></> : ' ⌀'} {s.sys}
            </span>,
            `${x.sub ? '−' : '+'}${num(shapeArea(x), 1)} ${s.sys}²`,
            <select key="t" value={x.sub ? 's' : 'a'} onChange={(e) => editShape(x.id, { sub: e.target.value === 's' })} aria-label="Add or subtract"><option value="a">Lawn</option><option value="s">Exclude (patio, bed)</option></select>,
            <Btn key="x" kind="ghost" onClick={() => set({ shapes: s.shapes.filter((y) => y.id !== x.id) })} title="Remove">✕</Btn>,
          ])} />
        </Panel>
        <Panel title="Shopping list" actions={<CsvButton name="lawn-seed.csv" rows={() => [
          ['Item', 'Amount', 'Unit', 'Packs', 'Cost'],
          [`${g.name} seed`, fromLb(p.seedLb).toFixed(2), mass, p.bags, p.seedCost],
          [`Fertilizer ${s.nPct}% N`, fromLb(p.fertLb).toFixed(2), mass, p.fertBags, p.fertCost],
          ['Lawn area', net.toFixed(1), `${s.sys}²`, '', ''],
        ]} />}>
          <Table head={['Item', 'Needed', 'Packs', 'Cost']} rows={[
            [`${g.name} seed @ ${num(shownRate, 2)} ${met ? 'g/m²' : 'lb/1000 ft²'} +${s.extra}%`, `${num(fromLb(p.seedLb), 2)} ${mass}`, p.bags, m(p.seedCost)],
            [`Starter fertilizer (${s.nPct}% N) @ ${s.nRate} lb N/1000 ft²`, `${num(fromLb(p.fertLb), 2)} ${mass}`, p.fertBags, m(p.fertCost)],
          ]} foot={['Total', '', '', m(p.seedCost + p.fertCost)]} />
          <Note>{s.mode === 'new'
            ? 'For bare soil: rake to a fine tilth, spread half the seed in one direction and half crosswise, rake lightly and keep the top 2 cm moist until the first mowing.'
            : 'For overseeding: mow short, scarify or core-aerate first, then seed and water lightly every day for 2–3 weeks.'} Rates are typical ranges for {g.zone.toLowerCase()} grasses; the seed bag label wins.</Note>
        </Panel>
      </div>
    </Split>
  )
}
