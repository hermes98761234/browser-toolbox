import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, CsvButton, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, color, uid, useToolState } from '../kit'
import { coilOutlet, enthalpy, mix, pressureAt, shr, specVolume, stateFrom, tFromH, wFromRh, wFromWb, wsat } from './lib/psychrometric-chart'

interface Pt { id: string; name: string; t: number; W: number }
type Proc = { id: string; type: 'line'; a: string; b: string } | { id: string; type: 'mix'; a: string; b: string; frac: number } | { id: string; type: 'coil'; a: string; adp: number; bf: number }

const P0 = 101.325
const DEF = {
  alt: 0, flow: 1.0, tMin: -10, tMax: 50, wMax: 30,
  pts: [
    { id: 'oa', name: 'Outdoor', t: 34, W: wFromWb(34, 25, P0) },
    { id: 'ra', name: 'Return', t: 24, W: wFromRh(24, 0.5, P0) },
    { id: 'sa', name: 'Supply', t: 14, W: wFromRh(14, 0.92, P0) },
  ] as Pt[],
  procs: [
    { id: 'm1', type: 'mix', a: 'oa', b: 'ra', frac: 0.3 },
    { id: 'c1', type: 'coil', a: 'm1', adp: 11, bf: 0.15 },
    { id: 'l1', type: 'line', a: 'sa', b: 'ra' },
  ] as Proc[],
}

export default function PsychrometricChart() {
  const [s, set, reset] = useToolState('psychrometric-chart', DEF)
  const p = pressureAt(s.alt)
  const cv = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(800)
  const [hover, setHover] = useState<{ t: number; W: number } | null>(null)
  const [newT, setNewT] = useState(30)
  const [newRh, setNewRh] = useState(60)
  const H = Math.round(Math.min(560, Math.max(320, w * 0.62)))
  const pad = { l: 40, r: 52, t: 14, b: 34 }

  // Derived points from processes
  const all = useMemo(() => {
    const m = new Map<string, Pt & { derived?: boolean }>(s.pts.map((x) => [x.id, x]))
    for (const pr of s.procs) {
      const a = m.get(pr.a)
      if (!a) continue
      if (pr.type === 'mix') {
        const b = m.get(pr.b)
        if (!b) continue
        const r = mix(a, pr.frac, b, 1 - pr.frac)
        m.set(pr.id, { id: pr.id, name: `Mix ${a.name}/${b.name}`, ...r, derived: true })
      } else if (pr.type === 'coil') {
        const r = coilOutlet(a, pr.adp, pr.bf, p)
        m.set(pr.id, { id: pr.id, name: `Coil off`, ...r, derived: true })
      }
    }
    return m
  }, [s.pts, s.procs, p])

  const X = (t: number) => pad.l + ((t - s.tMin) / (s.tMax - s.tMin)) * (w - pad.l - pad.r)
  const Y = (W: number) => H - pad.b - ((W * 1000) / s.wMax) * (H - pad.t - pad.b)
  const invX = (x: number) => s.tMin + ((x - pad.l) / (w - pad.l - pad.r)) * (s.tMax - s.tMin)
  const invY = (y: number) => (((H - pad.b - y) / (H - pad.t - pad.b)) * s.wMax) / 1000

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.max(300, el.clientWidth)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = cv.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = w * dpr; c.height = H * dpr
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    const css = getComputedStyle(c)
    const fg = css.getPropertyValue('--text').trim() || '#0f172a'
    const muted = css.getPropertyValue('--muted').trim() || '#64748b'
    const line = css.getPropertyValue('--line').trim() || '#e2e8f0'
    const accent = css.getPropertyValue('--accent').trim() || '#6366f1'
    g.clearRect(0, 0, w, H)
    g.font = '11px system-ui, sans-serif'
    const wTop = s.wMax / 1000
    const clipSat = () => {
      g.beginPath()
      g.moveTo(X(s.tMin), Y(0))
      for (let t = s.tMin; t <= s.tMax; t += 0.25) g.lineTo(X(t), Y(Math.min(wsat(t, p), wTop * 1.2)))
      g.lineTo(X(s.tMax), Y(0))
      g.closePath()
    }
    g.save()
    g.beginPath(); g.rect(pad.l, pad.t, w - pad.l - pad.r, H - pad.t - pad.b); g.clip()
    clipSat(); g.clip()
    // grid
    g.strokeStyle = line; g.lineWidth = 1
    for (let t = Math.ceil(s.tMin / 5) * 5; t <= s.tMax; t += 5) { g.beginPath(); g.moveTo(X(t), Y(0)); g.lineTo(X(t), pad.t); g.stroke() }
    for (let W = 0; W <= s.wMax; W += 2) { g.beginPath(); g.moveTo(pad.l, Y(W / 1000)); g.lineTo(w - pad.r, Y(W / 1000)); g.stroke() }
    // enthalpy lines
    g.strokeStyle = '#f59e0b55'; g.setLineDash([])
    for (let h = -10; h <= 140; h += 10) { g.beginPath(); g.moveTo(X(tFromH(h, 0)), Y(0)); g.lineTo(X(tFromH(h, 0.04)), Y(0.04)); g.stroke() }
    // wet-bulb lines
    g.strokeStyle = '#10b98166'; g.setLineDash([5, 4])
    for (let tw = -10; tw <= 40; tw += 5) {
      g.beginPath()
      g.moveTo(X(tw), Y(wsat(tw, p)))
      for (let t = tw; t <= s.tMax + 30; t += 1) { const W = wFromWb(t, tw, p); if (W < 0) { g.lineTo(X(t), Y(0)); break } g.lineTo(X(t), Y(W)) }
      g.stroke()
    }
    // specific volume lines
    g.strokeStyle = '#a855f766'; g.setLineDash([2, 3])
    for (let v = 0.76; v <= 0.98; v += 0.02) {
      // t from v at W=0 and at W=0.04: v = 0.287042 (t+273.15)(1+1.607858W)/p
      const tAt = (W: number) => (v * p) / (0.287042 * (1 + 1.607858 * W)) - 273.15
      g.beginPath(); g.moveTo(X(tAt(0)), Y(0)); g.lineTo(X(tAt(0.04)), Y(0.04)); g.stroke()
    }
    g.setLineDash([])
    // RH curves
    g.strokeStyle = '#0ea5e999'
    for (let rh = 0.1; rh < 1; rh += 0.1) {
      g.beginPath()
      for (let t = s.tMin; t <= s.tMax; t += 0.5) { const W = wFromRh(t, rh, p); if (t === s.tMin) g.moveTo(X(t), Y(W)); else g.lineTo(X(t), Y(W)) }
      g.stroke()
    }
    g.restore()
    // saturation curve
    g.save(); g.beginPath(); g.rect(pad.l, pad.t, w - pad.l - pad.r, H - pad.t - pad.b); g.clip()
    g.strokeStyle = accent; g.lineWidth = 2.2
    g.beginPath()
    for (let t = s.tMin; t <= s.tMax; t += 0.25) { const W = wsat(t, p); if (t === s.tMin) g.moveTo(X(t), Y(W)); else g.lineTo(X(t), Y(W)) }
    g.stroke()
    // labels on curves
    g.fillStyle = '#0ea5e9'
    for (let rh = 0.2; rh < 1; rh += 0.2) { const t = s.tMax - 6; const W = wFromRh(t, rh, p); if (W * 1000 < s.wMax - 1) g.fillText(`${Math.round(rh * 100)}%`, X(t), Y(W) - 3) }
    g.fillStyle = '#10b981'
    for (let tw = 0; tw <= 30; tw += 10) { const W = wsat(tw, p); if (W * 1000 < s.wMax) g.fillText(`wb ${tw}`, X(tw) - 34, Y(W) - 2) }
    g.fillStyle = '#d97706'
    for (let h = 20; h <= 120; h += 20) { const tt = tFromH(h, wsat(5, p)); const t = Math.max(s.tMin + 1, Math.min(s.tMax - 5, (tt + 3))); const W = (h - 1.006 * t) / (2501 + 1.86 * t); if (W > 0 && W < wsat(t, p) && W * 1000 < s.wMax) g.fillText(`h ${h}`, X(t), Y(W)) }
    // processes
    g.lineWidth = 2.2
    s.procs.forEach((pr, i) => {
      const a = all.get(pr.a)
      const b = pr.type === 'line' ? all.get(pr.b) : all.get(pr.id)
      if (!a || !b) return
      g.strokeStyle = color(i + 3)
      g.setLineDash(pr.type === 'mix' ? [6, 4] : [])
      if (pr.type === 'mix') { const c = all.get(pr.b); if (c) { g.beginPath(); g.moveTo(X(a.t), Y(a.W)); g.lineTo(X(c.t), Y(c.W)); g.stroke() } }
      else {
        g.beginPath(); g.moveTo(X(a.t), Y(a.W)); g.lineTo(X(b.t), Y(b.W)); g.stroke()
        const ang = Math.atan2(Y(b.W) - Y(a.W), X(b.t) - X(a.t))
        g.beginPath(); g.moveTo(X(b.t), Y(b.W)); g.lineTo(X(b.t) - 10 * Math.cos(ang - 0.4), Y(b.W) - 10 * Math.sin(ang - 0.4)); g.lineTo(X(b.t) - 10 * Math.cos(ang + 0.4), Y(b.W) - 10 * Math.sin(ang + 0.4)); g.closePath(); g.fillStyle = color(i + 3); g.fill()
        if (pr.type === 'coil') { g.setLineDash([3, 3]); g.beginPath(); g.moveTo(X(b.t), Y(b.W)); g.lineTo(X(pr.adp), Y(wsat(pr.adp, p))); g.stroke() }
      }
    })
    g.setLineDash([])
    // points
    let i = 0
    for (const pt of all.values()) {
      const d = 'derived' in pt && pt.derived
      g.beginPath(); g.arc(X(pt.t), Y(pt.W), 5.5, 0, Math.PI * 2)
      g.fillStyle = d ? '#ffffff' : color(i); g.strokeStyle = color(i); g.lineWidth = 2.5
      g.fill(); g.stroke()
      g.fillStyle = fg; g.font = 'bold 12px system-ui, sans-serif'
      g.fillText(pt.name, X(pt.t) + 8, Y(pt.W) - 7)
      g.font = '11px system-ui, sans-serif'
      i++
    }
    if (hover && hover.W >= 0 && hover.W <= wsat(hover.t, p)) {
      g.strokeStyle = muted; g.setLineDash([2, 2]); g.lineWidth = 1
      g.beginPath(); g.moveTo(X(hover.t), Y(0)); g.lineTo(X(hover.t), Y(hover.W)); g.lineTo(w - pad.r, Y(hover.W)); g.stroke(); g.setLineDash([])
    }
    g.restore()
    // axes
    g.fillStyle = muted; g.strokeStyle = muted; g.lineWidth = 1
    g.beginPath(); g.moveTo(pad.l, H - pad.b); g.lineTo(w - pad.r, H - pad.b); g.lineTo(w - pad.r, pad.t); g.stroke()
    g.textAlign = 'center'
    for (let t = Math.ceil(s.tMin / 5) * 5; t <= s.tMax; t += 5) g.fillText(String(t), X(t), H - pad.b + 14)
    g.fillText('Dry-bulb temperature (°C)', (pad.l + w - pad.r) / 2, H - 4)
    g.textAlign = 'left'
    for (let W = 0; W <= s.wMax; W += 4) g.fillText(String(W), w - pad.r + 5, Y(W / 1000) + 4)
    g.save(); g.translate(w - 8, (pad.t + H - pad.b) / 2); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('Humidity ratio (g/kg dry air)', 0, 0); g.restore()
  }, [w, H, s, p, all, hover]) // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e: React.MouseEvent) => {
    const r = cv.current!.getBoundingClientRect()
    return { t: invX(e.clientX - r.left), W: invY(e.clientY - r.top) }
  }
  const onClick = (e: React.MouseEvent) => {
    const q = pos(e)
    if (q.W < 0 || q.t < s.tMin || q.t > s.tMax) return
    const W = Math.min(q.W, wsat(q.t, p))
    set({ pts: [...s.pts, { id: uid(), name: String.fromCharCode(65 + (s.pts.length % 26)), t: Math.round(q.t * 10) / 10, W }] })
  }
  const hs = hover && hover.W >= 0 && hover.W <= wsat(hover.t, p) ? stateFrom(hover.t, hover.W, p) : null
  const ptOpts = [...all.values()].map((x) => [x.id, x.name] as [string, string])
  const rows = [...all.values()].map((x) => ({ x, st: stateFrom(x.t, x.W, p) }))
  const massFlow = s.flow / specVolume(24, 0.009, p) // kg dry air/s from volumetric flow (≈ standard)

  return (
    <div>
      <Panel title="Chart" actions={<span className="muted" style={{ fontSize: 12 }}>Click inside the chart to add a state · p = {p.toFixed(2)} kPa</span>}>
        <div ref={box} style={{ position: 'relative' }}>
          <canvas ref={cv} style={{ width: w, height: H, display: 'block', cursor: 'crosshair', color: 'var(--text)' }} onClick={onClick} onMouseMove={(e) => setHover(pos(e))} onMouseLeave={() => setHover(null)} />
          {hs && (
            <div style={{ position: 'absolute', left: 50, top: 18, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontSize: 12, lineHeight: 1.5, pointerEvents: 'none' }}>
              <b>{hs.t.toFixed(1)} °C</b> · RH {(hs.rh * 100).toFixed(0)}%<br />W {(hs.W * 1000).toFixed(2)} g/kg · wb {hs.twb.toFixed(1)} °C<br />dp {hs.tdp.toFixed(1)} °C · h {hs.h.toFixed(1)} kJ/kg<br />v {hs.v.toFixed(3)} m³/kg
            </div>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          <span style={{ color: '#0ea5e9' }}>— relative humidity</span> · <span style={{ color: '#10b981' }}>┄ wet bulb</span> · <span style={{ color: '#d97706' }}>— enthalpy (kJ/kg)</span> · <span style={{ color: '#a855f7' }}>┄ specific volume (0.76–0.98 m³/kg)</span>
        </div>
      </Panel>
      <Split>
        <div>
          <Panel title="Conditions" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Row>
              <Num label="Altitude" unit="m" value={s.alt} min={-400} max={5000} onChange={(alt) => set({ alt })} />
              <Num label="Airflow" unit="m³/s" value={s.flow} min={0} step={0.1} onChange={(flow) => set({ flow })} hint={`≈ ${massFlow.toFixed(2)} kg/s dry air`} />
            </Row>
            <Row>
              <Num label="T min" unit="°C" value={s.tMin} onChange={(tMin) => tMin < s.tMax - 10 && set({ tMin })} />
              <Num label="T max" unit="°C" value={s.tMax} onChange={(tMax) => tMax > s.tMin + 10 && tMax <= 60 && set({ tMax })} />
              <Num label="W max" unit="g/kg" value={s.wMax} min={5} max={60} onChange={(wMax) => set({ wMax })} />
            </Row>
          </Panel>
          <Panel title="Add a state">
            <Row>
              <Num label="Dry bulb" unit="°C" value={newT} onChange={setNewT} />
              <Num label="Relative humidity" unit="%" value={newRh} min={0} max={100} onChange={setNewRh} />
              <Btn kind="primary" onClick={() => set({ pts: [...s.pts, { id: uid(), name: String.fromCharCode(65 + (s.pts.length % 26)), t: newT, W: wFromRh(newT, Math.min(1, Math.max(0, newRh / 100)), p) }] })}>Add</Btn>
            </Row>
          </Panel>
          <Panel title="Processes" actions={<>
            <Btn onClick={() => set({ procs: [...s.procs, { id: uid(), type: 'line', a: s.pts[0]?.id ?? '', b: s.pts[1]?.id ?? '' }] })}>+ Line</Btn>
            <Btn onClick={() => set({ procs: [...s.procs, { id: uid(), type: 'mix', a: s.pts[0]?.id ?? '', b: s.pts[1]?.id ?? '', frac: 0.5 }] })}>+ Mix</Btn>
            <Btn onClick={() => set({ procs: [...s.procs, { id: uid(), type: 'coil', a: s.pts[0]?.id ?? '', adp: 10, bf: 0.15 }] })}>+ Coil</Btn>
          </>}>
            {s.procs.map((pr) => {
              const upd = (patch: Partial<Proc>) => set({ procs: s.procs.map((x) => (x.id === pr.id ? ({ ...x, ...patch } as Proc) : x)) })
              const opts = ptOpts.filter(([id]) => id !== pr.id)
              const a = all.get(pr.a), b = pr.type === 'line' ? all.get(pr.b) : all.get(pr.id)
              const dh = a && b ? enthalpy(b.t, b.W) - enthalpy(a.t, a.W) : 0
              const load = (dh * massFlow)
              return (
                <div key={pr.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 8 }}>
                  <Row>
                    <b style={{ minWidth: 70 }}>{pr.type === 'line' ? 'Process' : pr.type === 'mix' ? 'Mixing' : 'Cooling coil'}</b>
                    <Select label={pr.type === 'coil' ? 'Inlet' : 'From'} value={pr.a} onChange={(a) => upd({ a })} options={opts} />
                    {pr.type !== 'coil' && <Select label={pr.type === 'mix' ? 'With' : 'To'} value={pr.b} onChange={(b) => upd({ b })} options={opts} />}
                    {pr.type === 'mix' && <Num label="Fraction of first" value={pr.frac} min={0} max={1} step={0.05} onChange={(frac) => upd({ frac: Math.min(1, Math.max(0, frac)) })} />}
                    {pr.type === 'coil' && <Num label="ADP" unit="°C" value={pr.adp} onChange={(adp) => upd({ adp })} />}
                    {pr.type === 'coil' && <Num label="Bypass factor" value={pr.bf} min={0} max={1} step={0.05} onChange={(bf) => upd({ bf: Math.min(1, Math.max(0, bf)) })} />}
                    <Btn kind="ghost" title="Remove" onClick={() => set({ procs: s.procs.filter((x) => x.id !== pr.id) })}>✕</Btn>
                  </Row>
                  {a && b && pr.type !== 'mix' && (
                    <div className="muted" style={{ fontSize: 13 }}>
                      Δh {dh.toFixed(2)} kJ/kg · ΔW {((b.W - a.W) * 1000).toFixed(2)} g/kg · SHR {shr(a, b).toFixed(2)} · load {Math.abs(load).toFixed(1)} kW {load < 0 ? 'cooling' : 'heating'}
                      {pr.type === 'coil' && ` · condensate ${(Math.max(0, a.W - b.W) * massFlow * 3600).toFixed(1)} kg/h`}
                    </div>
                  )}
                  {pr.type === 'mix' && b && <div className="muted" style={{ fontSize: 13 }}>Mixed: {b.t.toFixed(1)} °C, {(b.W * 1000).toFixed(2)} g/kg</div>}
                </div>
              )
            })}
            {!s.procs.length && <Note>Add a line, a mixing box or a cooling coil between states.</Note>}
          </Panel>
        </div>
        <div>
          <Stats>
            {rows.slice(0, 3).map(({ x, st }) => <Stat key={x.id} label={x.name} value={`${st.t.toFixed(1)} °C · ${(st.rh * 100).toFixed(0)}%`} sub={`h ${st.h.toFixed(1)} kJ/kg · dp ${st.tdp.toFixed(1)} °C`} />)}
          </Stats>
          <Panel title="States" actions={<CsvButton name="psychrometric-states.csv" rows={() => [['Name', 'Dry bulb °C', 'RH %', 'W g/kg', 'Wet bulb °C', 'Dew point °C', 'h kJ/kg', 'v m3/kg', 'Density kg/m3'], ...rows.map(({ x, st }) => [x.name, +st.t.toFixed(2), +(st.rh * 100).toFixed(1), +(st.W * 1000).toFixed(3), +st.twb.toFixed(2), +st.tdp.toFixed(2), +st.h.toFixed(2), +st.v.toFixed(4), +st.rho.toFixed(4)])]} />}>
            <Table head={['State', 'db °C', 'RH', 'W g/kg', 'wb °C', 'dp °C', 'h kJ/kg', 'v m³/kg', '']} rows={rows.map(({ x, st }) => {
              const own = s.pts.find((q) => q.id === x.id)
              return [
                own ? <input key="n" value={own.name} aria-label="State name" style={{ width: 80 }} onChange={(e) => set({ pts: s.pts.map((q) => (q.id === x.id ? { ...q, name: e.target.value } : q)) })} /> : <i key="n">{x.name}</i>,
                st.t.toFixed(1), `${(st.rh * 100).toFixed(0)}%`, (st.W * 1000).toFixed(2), st.twb.toFixed(1), st.tdp.toFixed(1), st.h.toFixed(1), st.v.toFixed(3),
                own ? <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ pts: s.pts.filter((q) => q.id !== x.id), procs: s.procs.filter((pr) => pr.a !== x.id && (pr.type === 'coil' || pr.b !== x.id)) })}>✕</Btn> : '',
              ]
            })} />
            <Note>ASHRAE Fundamentals equations (Hyland–Wexler saturation pressure, enhancement factor). Hollow markers are computed states (mixing / coil outlet).</Note>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
