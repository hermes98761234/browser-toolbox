import { useRef, useState } from 'react'
import { Bar, Btn, color, Note, Panel, Row, Seg, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { axleLoads, bestShift, cargoCg, worstRatio, type Item, type Vehicle } from './lib/axle-load-calculator'

type ItemS = Item & { id: string }
interface Preset { name: string; v: Vehicle; groups: number[]; names: string[] }
const PRESETS: Preset[] = [
  { name: 'Rigid 2-axle (18 t)', groups: [1, 1], names: ['Steer', 'Rear'], v: { kind: 'rigid', wb: 5, fifth: 0, kp: 0, deck: 0.9, deckLen: 7.2, tare: [4300, 2700], limits: [7100, 11500], gvw: 18000 } },
  { name: 'Rigid 3-axle (26 t)', groups: [1, 2], names: ['Steer', 'Rear tandem'], v: { kind: 'rigid', wb: 5.3, fifth: 0, kp: 0, deck: 0.9, deckLen: 8.2, tare: [5600, 4600], limits: [8000, 19000], gvw: 26000 } },
  { name: 'Tractor + tri-axle semi (40 t)', groups: [1, 1, 3], names: ['Steer', 'Drive', 'Trailer tridem'], v: { kind: 'semi', wb: 3.8, fifth: 3.25, kp: 7.9, deck: -1.6, deckLen: 13.6, tare: [5800, 4400, 5600], limits: [7500, 11500, 24000], gvw: 40000 } },
  { name: 'US tractor + tandem semi (80,000 lb)', groups: [1, 2, 2], names: ['Steer', 'Drive tandem', 'Trailer tandem'], v: { kind: 'semi', wb: 5.6, fifth: 5.0, kp: 11.2, deck: -1.0, deckLen: 16.15, tare: [4900, 5400, 4300], limits: [5443, 15422, 15422], gvw: 36287 } },
]
const DEF = {
  preset: 2, v: PRESETS[2].v, metric: true,
  items: [
    { id: 'a', name: 'Steel coils', kg: 9000, at: 0.5, len: 3 },
    { id: 'b', name: 'Pallets ×12', kg: 7200, at: 4.2, len: 4.8 },
    { id: 'c', name: 'Machine', kg: 4500, at: 9.6, len: 2.6 },
  ] as ItemS[],
}

export default function AxleLoadCalculator() {
  const [s, set, reset] = useToolState('axle-load-calculator', DEF)
  const p = PRESETS[s.preset] ?? PRESETS[0]
  const v = s.v
  const K = s.metric ? 1 : 2.20462, L = s.metric ? 1 : 3.28084
  const wu = s.metric ? 'kg' : 'lb', lu = s.metric ? 'm' : 'ft'
  const w = (kg: number) => `${Math.round(kg * K).toLocaleString('en-US')} ${wu}`
  const loads = axleLoads(v, s.items)
  const gross = loads.reduce((a, b) => a + b, 0)
  const cargo = s.items.reduce((a, i) => a + Math.max(0, i.kg), 0)
  const worst = worstRatio(v, loads)
  const cg = cargoCg(s.items)
  const shift = bestShift(v, s.items)
  const steerShare = loads[0] / gross
  const over = loads.map((l, i) => l > v.limits[i])
  const edit = (id: string, patch: Partial<ItemS>) => set({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })
  const setV = (patch: Partial<Vehicle>) => set({ v: { ...v, ...patch } })
  const numIn = (val: number, onCh: (x: number) => void, f: number, width = 70, min = -Infinity) => (
    <input type="number" step="any" value={Math.round(val * f * 100) / 100} onChange={(e) => { const x = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(x)) onCh(Math.max(min, x / f)) }} style={{ width }} />
  )

  // ---- side view geometry (metres → px) ----
  const absDeck = v.kind === 'rigid' ? v.deck : v.fifth + v.deck
  const axleX = v.kind === 'rigid' ? [0, v.wb] : [0, v.wb, v.fifth + v.kp]
  const x0 = -1.8, x1 = Math.max(absDeck + v.deckLen, axleX[axleX.length - 1] + 1.5) + 0.6
  const W = 900, H = 260, sc = W / (x1 - x0), X = (m: number) => (m - x0) * sc
  const deckY = 120, wheelR = 0.5 * sc, groundY = deckY + 30 + wheelR * 1.4
  const maxKg = Math.max(1, ...s.items.map((i) => i.kg))
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ id: string; start: number; at: number } | null>(null)
  const toM = (clientX: number) => { const r = svgRef.current!.getBoundingClientRect(); return ((clientX - r.left) / r.width) * W / sc }

  return (
    <div>
      <Stats>
        <Stat label="Gross weight" value={w(gross)} tone={gross > v.gvw ? 'bad' : 'good'} sub={`limit ${w(v.gvw)} · ${Math.round((gross / v.gvw) * 100)}%`} />
        <Stat label="Payload" value={w(cargo)} sub={`max legal ≈ ${w(Math.max(0, cargo + (v.gvw - gross)))} by GVW`} />
        <Stat label="Worst utilisation" value={`${Math.round(worst * 100)}%`} tone={worst > 1 ? 'bad' : worst > 0.95 ? 'accent' : 'good'} />
        <Stat label="Cargo CG" value={Number.isFinite(cg) ? `${(cg * L).toFixed(2)} ${lu}` : '—'} sub="from deck front" />
      </Stats>
      <Panel title="Side view" actions={<><Seg value={s.metric ? 'm' : 'i'} onChange={(x) => set({ metric: x === 'm' })} options={[['m', 'kg · m'], ['i', 'lb · ft']]} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
        <div style={{ overflowX: 'auto' }}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 620, height: 'auto', touchAction: 'none', userSelect: 'none' }}
          onPointerMove={(e) => { if (drag) { const at = Math.max(0, Math.min(v.deckLen - (s.items.find((i) => i.id === drag.id)?.len ?? 0), drag.at + toM(e.clientX) - drag.start)); edit(drag.id, { at: Math.round(at * 20) / 20 }) } }}
          onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>
          <line x1={0} x2={W} y1={groundY} y2={groundY} stroke="var(--line)" strokeWidth={2} />
          {/* cab */}
          <path d={`M${X(-1.6)},${deckY + 20} L${X(-1.6)},${deckY - 55} Q${X(-1.5)},${deckY - 80} ${X(-0.9)},${deckY - 82} L${X(0.6)},${deckY - 82} L${X(0.6)},${deckY + 20} Z`} fill="var(--accent)" opacity={0.85} />
          <rect x={X(-1.3)} y={deckY - 70} width={X(-0.4) - X(-1.3)} height={30} rx={4} fill="#e0f2fe" opacity={0.9} />
          {v.kind === 'semi' && <rect x={X(-1.6)} y={deckY + 12} width={X(v.wb + 1.2) - X(-1.6)} height={10} fill="var(--muted)" />}
          {v.kind === 'semi' && <circle cx={X(v.fifth)} cy={deckY + 8} r={5} fill="#f59e0b"><title>Fifth wheel / kingpin</title></circle>}
          {/* deck / trailer */}
          <rect x={X(absDeck)} y={deckY} width={v.deckLen * sc} height={12} rx={2} fill="var(--fg)" opacity={0.75} />
          {v.kind === 'semi' && <rect x={X(v.fifth + v.kp - 1.8)} y={deckY + 12} width={3.6 * sc} height={10} fill="var(--muted)" />}
          {/* cargo */}
          {s.items.map((it, i) => {
            const h = 20 + 60 * Math.sqrt(Math.max(0, it.kg) / maxKg)
            return (
              <g key={it.id} style={{ cursor: 'grab' }} onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); setDrag({ id: it.id, start: toM(e.clientX), at: it.at }) }}>
                <rect x={X(absDeck + it.at)} y={deckY - h} width={Math.max(4, it.len * sc)} height={h} rx={3} fill={color(i + 1)} opacity={drag?.id === it.id ? 1 : 0.85} stroke="var(--panel)" />
                <text x={X(absDeck + it.at + it.len / 2)} y={deckY - h / 2 + 4} textAnchor="middle" fontSize={11} fill="#fff" fontWeight={700} pointerEvents="none">{w(it.kg)}</text>
              </g>
            )
          })}
          {Number.isFinite(cg) && <g><line x1={X(absDeck + cg)} x2={X(absDeck + cg)} y1={deckY - 92} y2={deckY + 12} stroke="#ef4444" strokeDasharray="4 3" /><text x={X(absDeck + cg) + 4} y={deckY - 84} fontSize={11} fill="#ef4444">CG</text></g>}
          {/* axles + loads */}
          {axleX.map((ax, gi) => {
            const n = p.groups[gi] ?? 1, sp = 1.31
            const r = loads[gi] / v.limits[gi]
            const col = r > 1 ? 'var(--err)' : r > 0.95 ? 'var(--warn)' : 'var(--ok)'
            return (
              <g key={gi}>
                {Array.from({ length: n }, (_, k) => <circle key={k} cx={X(ax + (k - (n - 1) / 2) * sp)} cy={groundY - wheelR} r={wheelR} fill="#1f2937" stroke="#94a3b8" strokeWidth={3} />)}
                <text x={X(ax)} y={groundY + 18} textAnchor="middle" fontSize={12} fontWeight={700} fill={col}>{w(loads[gi])}</text>
                <text x={X(ax)} y={groundY + 32} textAnchor="middle" fontSize={11} fill="var(--muted)">{Math.round(r * 100)}% of {w(v.limits[gi])}</text>
              </g>
            )
          })}
        </svg>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>Drag cargo blocks along the deck. Axle groups are treated as one load point at their centre (equalised suspension).</p>
      </Panel>
      {over.some(Boolean) && <Note tone="err">Overloaded: {p.names.filter((_, i) => over[i]).join(', ')}. {shift !== 0 ? `Shifting all cargo ${shift > 0 ? 'back' : 'forward'} by ${Math.abs(shift * L).toFixed(2)} ${lu} gives the best balance.` : 'Reduce the payload.'}</Note>}
      {gross > v.gvw && <Note tone="err">Gross weight exceeds the {w(v.gvw)} limit by {w(gross - v.gvw)}.</Note>}
      {steerShare < 0.2 && <Note tone="warn">Steer axle carries only {Math.round(steerShare * 100)}% of the gross weight — steering and braking suffer below ~20–25%.</Note>}
      {loads.some((l) => l < 0) && <Note tone="err">A negative axle load means the vehicle would tip — cargo is too far behind the rear axle.</Note>}
      <Split>
        <div>
          <Panel title="Cargo" actions={<>
            <Btn onClick={() => set({ items: [...s.items, { id: uid(), name: `Item ${s.items.length + 1}`, kg: 1000, at: 0, len: 1.2 }] })}>+ Item</Btn>
            <Btn disabled={shift === 0} onClick={() => set({ items: s.items.map((i) => ({ ...i, at: Math.round((i.at + shift) * 100) / 100 })) })}>⇄ Auto-balance</Btn>
          </>}>
            <Table head={['Item', `Weight ${wu}`, `From front ${lu}`, `Length ${lu}`, '']} rows={s.items.map((it, i) => [
              <span key="n"><i style={{ display: 'inline-block', width: 10, height: 10, background: color(i + 1), borderRadius: 2, marginRight: 6 }} /><input value={it.name} onChange={(e) => edit(it.id, { name: e.target.value })} style={{ width: 110 }} aria-label="Item" /></span>,
              numIn(it.kg, (x) => edit(it.id, { kg: x }), K, 80, 0), numIn(it.at, (x) => edit(it.id, { at: x }), L, 64, 0), numIn(it.len, (x) => edit(it.id, { len: x }), L, 64, 0.05),
              <Btn key="x" kind="ghost" onClick={() => set({ items: s.items.filter((x) => x.id !== it.id) })}>✕</Btn>,
            ])} />
            {s.items.some((i) => i.at + i.len > v.deckLen + 1e-9) && <Note tone="warn">An item extends past the end of the deck ({(v.deckLen * L).toFixed(2)} {lu}).</Note>}
          </Panel>
          <Panel title="Axle groups">
            {loads.map((l, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <Row wrap={false}><b style={{ flex: 1 }}>{p.names[i]}</b><span>{w(l)} <span className="muted">/ {w(v.limits[i])}</span></span></Row>
                <Bar value={l} max={v.limits[i]} color={l > v.limits[i] ? 'var(--err)' : l / v.limits[i] > 0.95 ? 'var(--warn)' : 'var(--ok)'} />
              </div>
            ))}
          </Panel>
        </div>
        <div>
          <Panel title="Vehicle">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {PRESETS.map((q, i) => <Btn key={q.name} kind={i === s.preset ? 'primary' : 'normal'} onClick={() => set({ preset: i, v: q.v, metric: i === 3 ? false : s.metric })}>{q.name}</Btn>)}
            </div>
            <Table head={['Dimension', lu]} rows={[
              [v.kind === 'rigid' ? 'Wheelbase (steer → rear group centre)' : 'Tractor wheelbase (steer → drive centre)', numIn(v.wb, (x) => setV({ wb: x }), L, 70, 0.5)],
              ...(v.kind === 'semi' ? [['Fifth wheel from steer axle', numIn(v.fifth, (x) => setV({ fifth: x }), L, 70, 0)], ['Kingpin → trailer axle centre', numIn(v.kp, (x) => setV({ kp: x }), L, 70, 1)]] : []),
              [v.kind === 'rigid' ? 'Deck front from steer axle' : 'Trailer front from kingpin', numIn(v.deck, (x) => setV({ deck: x }), L)],
              ['Deck length', numIn(v.deckLen, (x) => setV({ deckLen: x }), L, 70, 0.5)],
            ]} />
            <Table head={['Group', `Empty ${wu}`, `Limit ${wu}`]} rows={v.tare.map((t, i) => [p.names[i],
              numIn(t, (x) => setV({ tare: v.tare.map((y, j) => (j === i ? x : y)) }), K, 80, 0),
              numIn(v.limits[i], (x) => setV({ limits: v.limits.map((y, j) => (j === i ? x : y)) }), K, 80, 1)])}
              foot={['Gross vehicle weight', w(v.tare.reduce((a, b) => a + b, 0)), numIn(v.gvw, (x) => setV({ gvw: x }), K, 80, 1)]} />
            <Note>Weigh the empty vehicle per axle at a weighbridge for exact tare values. Limits vary by country, road class and tyre configuration — check local rules.</Note>
          </Panel>
          <Panel title="How it is calculated">
            <p style={{ fontSize: 14, margin: 0 }}>
              Each load W with centre of gravity x behind the front support splits as <b>R<sub>rear</sub> = W·x / span</b> and <b>R<sub>front</sub> = W − R<sub>rear</sub></b> (moments about the front support).
              {v.kind === 'semi' && <> On a semi-trailer the span is kingpin → trailer axles; the kingpin share is then split between steer and drive axles using the fifth-wheel position on the tractor wheelbase.</>}
            </p>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
