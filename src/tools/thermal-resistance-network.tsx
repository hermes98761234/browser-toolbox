import { useMemo, useState } from 'react'
import { Btn, CsvButton, fmt, JsonButtons, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { layout, parallel, requiredRsa, series, SINKS, solve, type Net, type TLink, type TNode } from './lib/thermal-resistance-network'

const n = (id: string, name: string, power = 0, fixed: number | null = null, tmax: number | null = null): TNode => ({ id, name, power, fixed, tmax })
const l = (a: string, b: string, r: number, label: string): TLink => ({ id: uid(), a, b, r, label })

const PRESETS: Record<string, [string, Net]> = {
  to220: ['TO-220 regulator on a heatsink', {
    nodes: [n('j', 'Junction', 8, null, 125), n('c', 'Case'), n('s', 'Heatsink'), n('a', 'Ambient', 0, 40)],
    links: [l('j', 'c', 3, 'Rθjc'), l('c', 's', 0.5, 'Rθcs (pad + paste)'), l('s', 'a', 4.5, 'Rθsa'), l('j', 'a', 62, 'Rθja leakage (package to air)')],
  }],
  twofet: ['Two MOSFETs on a shared heatsink', {
    nodes: [n('q1', 'Q1 junction', 6, null, 150), n('q2', 'Q2 junction', 9, null, 150), n('c1', 'Q1 case'), n('c2', 'Q2 case'), n('hs', 'Heatsink'), n('a', 'Ambient', 0, 45)],
    links: [l('q1', 'c1', 1.2, 'Rθjc'), l('q2', 'c2', 1.2, 'Rθjc'), l('c1', 'hs', 0.8, 'Insulator'), l('c2', 'hs', 0.8, 'Insulator'), l('hs', 'a', 2.2, 'Rθsa')],
  }],
  cpu: ['Desktop CPU with tower cooler', {
    nodes: [n('die', 'Die', 125, null, 95), n('ihs', 'Heat spreader'), n('base', 'Cooler base'), n('a', 'Case air', 0, 30)],
    links: [l('die', 'ihs', 0.12, 'Die → IHS (solder)'), l('ihs', 'base', 0.05, 'Paste'), l('base', 'a', 0.22, 'Tower + fan')],
  }],
  led: ['High-power LED on MCPCB', {
    nodes: [n('j', 'LED junction', 3, null, 135), n('sp', 'Solder point'), n('pcb', 'MCPCB'), n('hs', 'Housing'), n('a', 'Ambient', 0, 35)],
    links: [l('j', 'sp', 2.5, 'Rθj-sp'), l('sp', 'pcb', 1.5, 'Board'), l('pcb', 'hs', 0.8, 'TIM'), l('hs', 'a', 9, 'Housing to air')],
  }],
  smd: ['D²PAK on PCB copper (two paths)', {
    nodes: [n('j', 'Junction', 2.5, null, 150), n('tab', 'Tab / pad'), n('cu', 'PCB copper'), n('a', 'Ambient', 0, 50)],
    links: [l('j', 'tab', 1, 'Rθjc'), l('tab', 'cu', 2, 'Solder + vias'), l('cu', 'a', 28, '6 cm² copper'), l('j', 'a', 80, 'Top of package')],
  }],
}

interface S { net: Net; p: number; tj: number; ta: number; rjc: number; rcs: number; combo: string }
const DEF: S = { net: PRESETS.to220[1], p: 8, tj: 125, ta: 40, rjc: 3, rcs: 0.5, combo: '1.5, 0.5, 3.2' }

/** Blue (cold) → red (hot) between the coolest and hottest node. */
const heat = (t: number, lo: number, hi: number) => {
  const f = hi > lo ? Math.min(1, Math.max(0, (t - lo) / (hi - lo))) : 0
  return `hsl(${220 - 220 * f} 75% 50%)`
}

function zigzag(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy)
  const ux = dx / len, uy = dy / len, px = -uy, py = ux
  const seg = Math.min(46, len * 0.4)
  const s0 = (len - seg) / 2
  let d = `M${x1},${y1}L${x1 + ux * s0},${y1 + uy * s0}`
  for (let i = 1; i <= 6; i++) {
    const t = s0 + (seg * i) / 6.5, a = i % 2 ? 6 : -6
    d += `L${x1 + ux * t + px * a},${y1 + uy * t + py * a}`
  }
  return d + `L${x1 + ux * (s0 + seg)},${y1 + uy * (s0 + seg)}L${x2},${y2}`
}

export default function ThermalResistanceNetwork() {
  const [s, set, reset] = useToolState('thermal-resistance-network', DEF)
  const [preset, setPreset] = useState('to220')
  const net = s.net
  const sol = useMemo(() => solve(net), [net])
  const pos = useMemo(() => layout(net, sol.temps), [net, sol])
  const setNet = (p: Partial<Net>) => set({ net: { ...net, ...p } })
  const editNode = (id: string, p: Partial<TNode>) => setNet({ nodes: net.nodes.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const editLink = (id: string, p: Partial<TLink>) => setNet({ links: net.links.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const name = (id: string) => net.nodes.find((x) => x.id === id)?.name ?? '?'

  const temps = [...sol.temps.values()]
  const lo = Math.min(...temps), hi = Math.max(...temps)
  const totalP = net.nodes.reduce((a, x) => a + (x.fixed === null ? x.power : 0), 0)
  const hottest = net.nodes.filter((x) => x.fixed === null).sort((a, b) => (sol.temps.get(b.id) ?? 0) - (sol.temps.get(a.id) ?? 0))[0]
  const worst = net.nodes.filter((x) => x.tmax !== null && x.fixed === null).map((x) => ({ x, m: x.tmax! - (sol.temps.get(x.id) ?? 0) })).sort((a, b) => a.m - b.m)[0]

  const need = requiredRsa(s.p, s.tj, s.ta, s.rjc, s.rcs)
  const comboVals = s.combo.split(/[\s,;]+/).map(Number).filter((v) => v > 0)

  // diagram geometry
  const W = 760, colW = (W - 120) / Math.max(1, (pos.values().next().value?.cols ?? 1) - 1 || 1)
  const rows = pos.values().next().value?.rows ?? 1
  const H = Math.max(220, rows * 110 + 100)
  const xy = (id: string) => {
    const p = pos.get(id)!
    const cols = p.cols
    return [cols === 1 ? W / 2 : 60 + p.col * colW, 90 + p.row * 110 + (H - 100 - rows * 110) / 2 + 20] as const
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Network" actions={<><JsonButtons name="thermal-network.json" data={s} onLoad={(d) => set(d)} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Row>
            <Select label="Example" value={preset} onChange={setPreset} options={Object.entries(PRESETS).map(([k, [t]]) => [k, t] as [string, string])} />
            <div style={{ alignSelf: 'end' }}>
              <Btn kind="primary" onClick={() => set({ net: structuredClone(PRESETS[preset][1]) })}>Load</Btn>
            </div>
          </Row>
          <h4 style={{ margin: '12px 0 4px' }}>Nodes</h4>
          <Table
            head={['Name', 'Heat W', 'Fixed °C', 'Max °C', '']}
            rows={net.nodes.map((x) => [
              <input key="n" value={x.name} onChange={(e) => editNode(x.id, { name: e.target.value })} aria-label="Node name" style={{ width: 110 }} />,
              <input key="p" type="number" step="any" min={0} value={x.power} disabled={x.fixed !== null} onChange={(e) => editNode(x.id, { power: Math.max(0, Number(e.target.value) || 0) })} aria-label="Heat" style={{ width: 64 }} />,
              <input key="f" type="number" step="any" value={x.fixed ?? ''} placeholder="free" onChange={(e) => editNode(x.id, { fixed: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Fixed temperature" style={{ width: 64 }} />,
              <input key="m" type="number" step="any" value={x.tmax ?? ''} placeholder="—" onChange={(e) => editNode(x.id, { tmax: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Max temperature" style={{ width: 64 }} />,
              <Btn key="x" kind="ghost" title="Remove node" onClick={() => setNet({ nodes: net.nodes.filter((y) => y.id !== x.id), links: net.links.filter((k) => k.a !== x.id && k.b !== x.id) })}>✕</Btn>,
            ])}
          />
          <Btn onClick={() => setNet({ nodes: [...net.nodes, n(uid(), `Node ${net.nodes.length + 1}`)] })}>+ Node</Btn>
          <h4 style={{ margin: '12px 0 4px' }}>Thermal resistances</h4>
          <Table
            head={['From', 'To', 'K/W', 'Label', '']}
            rows={net.links.map((k) => [
              <select key="a" value={k.a} onChange={(e) => editLink(k.id, { a: e.target.value })} aria-label="From" style={{ minWidth: 104 }}>{net.nodes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>,
              <select key="b" value={k.b} onChange={(e) => editLink(k.id, { b: e.target.value })} aria-label="To" style={{ minWidth: 104 }}>{net.nodes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>,
              <input key="r" type="number" step="any" min={0} value={k.r} onChange={(e) => editLink(k.id, { r: Number(e.target.value) })} aria-label="Resistance" style={{ width: 64 }} />,
              <input key="l" value={k.label} onChange={(e) => editLink(k.id, { label: e.target.value })} aria-label="Label" style={{ width: 110 }} />,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => setNet({ links: net.links.filter((y) => y.id !== k.id) })}>✕</Btn>,
            ])}
          />
          <Btn onClick={() => net.nodes.length > 1 && setNet({ links: [...net.links, l(net.nodes[0].id, net.nodes[net.nodes.length - 1].id, 1, 'New path')] })}>+ Resistance</Btn>
          <Note>Set a <b>Fixed °C</b> on ambient/coolant nodes. Heat sources get watts. Two resistances between the same nodes act in parallel; a chain acts in series.</Note>
        </Panel>
        <Panel title="Heatsink selection">
          <Row>
            <Num label="Power" value={s.p} onChange={(p) => set({ p })} unit="W" min={0} />
            <Num label="Tj max" value={s.tj} onChange={(tj) => set({ tj })} unit="°C" />
            <Num label="Ambient" value={s.ta} onChange={(ta) => set({ ta })} unit="°C" />
          </Row>
          <Row>
            <Num label="Rθjc" value={s.rjc} onChange={(rjc) => set({ rjc })} unit="K/W" min={0} />
            <Num label="Rθcs" value={s.rcs} onChange={(rcs) => set({ rcs })} unit="K/W" min={0} hint="Paste ≈ 0.1–0.5, pad ≈ 0.5–1.5" />
          </Row>
          {need <= 0 ? (
            <Note tone="err">Impossible: Rθjc + Rθcs alone already exceed the budget ({fmt((s.tj - s.ta) / s.p, 3)} K/W). Reduce power, use a better package or lower the ambient.</Note>
          ) : (
            <Note tone="ok">Heatsink must be <b>≤ {fmt(need, 3)} K/W</b> (sink-to-ambient). Add ~20% margin: aim for {fmt(need * 0.8, 3)} K/W.</Note>
          )}
          <Table
            head={['Typical class', 'Rθsa K/W', 'Fits?']}
            rows={SINKS.map((k) => [<span key="n">{k.name}<br /><span className="muted" style={{ fontSize: 12 }}>{k.note}</span></span>, `${k.lo}–${k.hi}`, k.hi <= need ? '✅ yes' : k.lo <= need ? '⚠ maybe' : '—'])}
          />
          <div className="muted" style={{ fontSize: 12 }}>Ranges are typical ballpark figures; always use the heatsink datasheet at your airflow.</div>
          <Row>
            <Btn onClick={() => set({ net: { nodes: [n('j', 'Junction', s.p, null, s.tj), n('c', 'Case'), n('s', 'Heatsink'), n('a', 'Ambient', 0, s.ta)], links: [l('j', 'c', s.rjc, 'Rθjc'), l('c', 's', s.rcs, 'Rθcs'), l('s', 'a', Math.max(0.01, +(need * 0.8).toFixed(3)), 'Rθsa (chosen)')] } })}>Build this as a network</Btn>
          </Row>
        </Panel>
        <Panel title="Series / parallel combiner">
          <Txt label="Resistances (K/W)" value={s.combo} onChange={(combo) => set({ combo })} placeholder="1.5, 0.5, 3.2" />
          {comboVals.length > 0 && (
            <Stats>
              <Stat label="Series" value={`${fmt(series(comboVals), 4)} K/W`} />
              <Stat label="Parallel" value={`${fmt(parallel(comboVals), 4)} K/W`} />
            </Stats>
          )}
        </Panel>
      </div>
      <div>
        {sol.error ? (
          <Note tone="err">{sol.error}</Note>
        ) : (
          <>
            <Stats>
              <Stat label="Total heat" value={`${fmt(totalP, 3)} W`} />
              {hottest && <Stat label="Hottest node" value={`${fmt(sol.temps.get(hottest.id)!, 1)} °C`} sub={hottest.name} tone="accent" />}
              {worst && <Stat label="Margin to limit" value={`${fmt(worst.m, 1)} K`} sub={worst.x.name} tone={worst.m < 0 ? 'bad' : worst.m < 10 ? undefined : 'good'} />}
              {Number.isFinite(sol.headroom) && <Stat label="Power headroom" value={`× ${fmt(sol.headroom, 2)}`} sub={`until ${sol.limiting} hits its max`} tone={sol.headroom < 1 ? 'bad' : 'good'} />}
            </Stats>
            {worst && worst.m < 0 && <Note tone="err">{worst.x.name} exceeds its maximum by {fmt(-worst.m, 1)} K. Lower the resistance of the path to ambient or reduce power to {fmt(sol.headroom * 100, 0)}%.</Note>}
            <Panel title="Temperature diagram">
              <div style={{ overflowX: 'auto' }}>
                <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 520 }} role="img" aria-label="Thermal network diagram">
                  {net.links.map((k) => {
                    if (!pos.has(k.a) || !pos.has(k.b)) return null
                    const [x1, y1] = xy(k.a), [x2, y2] = xy(k.b)
                    const same = net.links.filter((o) => (o.a === k.a && o.b === k.b) || (o.a === k.b && o.b === k.a))
                    const q = sol.flows.get(k.id) ?? 0
                    const w = 1.6 + Math.min(4, (Math.abs(q) / Math.max(1, totalP)) * 4)
                    const span = Math.abs(pos.get(k.a)!.col - pos.get(k.b)!.col)
                    const labels = (cx: number, cy: number) => (
                      <>
                        <text x={cx} y={cy - 12} textAnchor="middle" fontSize={11} fill="var(--fg)">{fmt(k.r, 3)} K/W</text>
                        <text x={cx} y={cy + 20} textAnchor="middle" fontSize={11} fill="var(--accent)">{fmt(Math.abs(q), 3)} W {q >= 0 ? '→' : '←'}</text>
                      </>
                    )
                    if (span > 1 || (same.length > 1 && same.indexOf(k) > 0)) {
                      // Route long or duplicate paths over the top: up, across (with the resistor), down.
                      const lift = 64 + 26 * (same.length > 1 ? same.indexOf(k) : 0)
                      const ty = Math.min(y1, y2) - lift
                      const [lx, rx] = x1 < x2 ? [x1, x2] : [x2, x1]
                      return (
                        <g key={k.id}>
                          <path d={`M${x1},${y1 - 24}V${ty}M${x2},${y2 - 24}V${ty}`} fill="none" stroke="var(--muted)" strokeWidth={w} />
                          <path d={zigzag(lx, ty, rx, ty)} fill="none" stroke="var(--muted)" strokeWidth={w} strokeLinejoin="round" />
                          {labels((lx + rx) / 2, ty)}
                        </g>
                      )
                    }
                    return (
                      <g key={k.id}>
                        <path d={zigzag(x1, y1, x2, y2)} fill="none" stroke="var(--muted)" strokeWidth={w} strokeLinejoin="round" />
                        {labels((x1 + x2) / 2, (y1 + y2) / 2)}
                      </g>
                    )
                  })}
                  {net.nodes.map((x) => {
                    if (!pos.has(x.id)) return null
                    const [cx, cy] = xy(x.id)
                    const t = sol.temps.get(x.id) ?? 0
                    const over = x.tmax !== null && t > x.tmax
                    return (
                      <g key={x.id}>
                        <circle cx={cx} cy={cy} r={24} fill={heat(t, lo, hi)} stroke={over ? 'var(--err)' : 'var(--panel)'} strokeWidth={over ? 4 : 2} />
                        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">{fmt(t, 1)}°</text>
                        <text x={cx} y={cy - 32} textAnchor="middle" fontSize={12} fill="var(--fg)" stroke="var(--panel)" strokeWidth={4} paintOrder="stroke">{x.name}</text>
                        {x.fixed === null && x.power > 0 && <text x={cx} y={cy + 42} textAnchor="middle" fontSize={11} fill="var(--warn)">⚡ {fmt(x.power, 3)} W</text>}
                        {x.fixed !== null && <text x={cx} y={cy + 42} textAnchor="middle" fontSize={11} fill="var(--muted)">fixed</text>}
                      </g>
                    )
                  })}
                </svg>
              </div>
            </Panel>
            <Panel title="Results" actions={<CsvButton name="thermal-results.csv" rows={() => [['Node', 'Temperature °C', 'Max °C', 'Margin K'], ...net.nodes.map((x) => [x.name, +(sol.temps.get(x.id) ?? 0).toFixed(3), x.tmax ?? '', x.tmax !== null ? +(x.tmax - (sol.temps.get(x.id) ?? 0)).toFixed(3) : ''])]} />}>
              <Table
                head={['Node', 'Temp °C', 'Limit', 'Margin']}
                rows={net.nodes.map((x) => {
                  const t = sol.temps.get(x.id) ?? 0
                  return [x.name, <b key="t" style={{ color: heat(t, lo, hi) }}>{fmt(t, 2)}</b>, x.tmax ?? '—', x.tmax !== null ? <span key="m" style={{ color: x.tmax - t < 0 ? 'var(--err)' : 'var(--ok)' }}>{fmt(x.tmax - t, 1)} K</span> : '—']
                })}
              />
              <Table
                head={['Path', 'R K/W', 'Heat W', 'ΔT K']}
                rows={net.links.map((k) => {
                  const q = sol.flows.get(k.id) ?? 0
                  return [`${k.label || 'R'}: ${name(k.a)} → ${name(k.b)}`, fmt(k.r, 4), fmt(q, 3), fmt(q * k.r, 2)]
                })}
              />
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
