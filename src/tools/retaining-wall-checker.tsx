import { Btn, Check, CsvButton, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, num, useToolState } from '../kit'
import { analyse, EXAMPLE, type Result, type Wall } from './lib/retaining-wall-checker'

interface State extends Wall {
  reqO: number
  reqS: number
  reqB: number
}
const DEF: State = { ...EXAMPLE, reqO: 2, reqS: 1.5, reqB: 3 }

function Diagram({ w, r }: { w: Wall; r: Result }) {
  const H = w.stemH + w.tBase
  const rise = w.heel * Math.tan((w.beta * Math.PI) / 180)
  const pw = Math.min(2.2, Math.max(0.8, (w.g1 * r.Hp * r.Ka) / 60)) // pressure triangle width
  const ext = pw + 0.6 // backfill drawn beyond the heel
  const qmax = Math.max(r.qToe, r.qHeel, 1)
  const qs = 1.4 / qmax
  const x0 = -1.2, x1 = r.B + ext + 0.3, y0 = -1.9, y1 = r.Hp + ext * Math.tan((w.beta * Math.PI) / 180) + 0.6
  const W = 520, k = W / (x1 - x0), Hpx = (y1 - y0) * k
  const X = (x: number) => (x - x0) * k
  const Y = (y: number) => (y1 - y) * k
  const pts = (a: [number, number][]) => a.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')
  const sb = w.toe, sf = w.toe + w.tBot - w.tTop, back = w.toe + w.tBot
  const slopeEnd: [number, number] = [r.B + ext, H + rise + ext * Math.tan((w.beta * Math.PI) / 180)]
  const yA = r.Hp / 3
  return (
    <svg viewBox={`0 0 ${W} ${Hpx}`} style={{ width: '100%', maxWidth: 400, display: 'block', margin: '0 auto' }} role="img" aria-label="retaining wall section">
      <defs>
        <pattern id="rw-soil" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="color-mix(in srgb, #b45309 16%, transparent)" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="color-mix(in srgb, #b45309 45%, transparent)" strokeWidth="1.2" />
        </pattern>
        <marker id="rw-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0L10,5L0,10z" fill="#ef4444" />
        </marker>
      </defs>
      {/* backfill */}
      <polygon points={pts([[back, w.tBase], [back, H], [r.B, H + rise], slopeEnd, [r.B + ext, 0], [r.B, 0], [r.B, w.tBase]])} fill="url(#rw-soil)" />
      {/* soil in front */}
      <polygon points={pts([[x0, 0], [x0, w.D], [sb, w.D], [sb, w.tBase], [0, w.tBase], [0, 0]])} fill="url(#rw-soil)" />
      <polyline points={pts([[x0, w.D], [sb, w.D]])} fill="none" stroke="#b45309" />
      <polyline points={pts([[back, H], [r.B, H + rise], slopeEnd])} fill="none" stroke="#b45309" strokeWidth={1.5} />
      {/* wall */}
      <polygon points={pts([[0, 0], [r.B, 0], [r.B, w.tBase], [back, w.tBase], [back, H], [sf, H], [sb, w.tBase], [0, w.tBase]])} fill="color-mix(in srgb, var(--muted) 35%, var(--panel))" stroke="var(--text)" strokeWidth={1.4} />
      {w.q > 0 && Array.from({ length: 6 }, (_, i) => {
        const x = back + 0.2 + (i * (r.B + ext - back - 0.4)) / 5
        const y = H + Math.max(0, x - back) * Math.tan((w.beta * Math.PI) / 180)
        return <line key={i} x1={X(x)} x2={X(x)} y1={Y(y) - 26} y2={Y(y) - 3} stroke="#a855f7" markerEnd="url(#rw-arr)" />
      })}
      {/* virtual back + pressure */}
      <line x1={X(r.B)} x2={X(r.B)} y1={Y(0)} y2={Y(r.Hp)} stroke="var(--muted)" strokeDasharray="5 4" />
      <polygon points={pts([[r.B, r.Hp], [r.B, 0], [r.B + pw, 0]])} fill="color-mix(in srgb, #ef4444 22%, transparent)" stroke="#ef4444" />
      <line x1={X(r.B + pw * 1.1)} x2={X(r.B + 0.05)} y1={Y(yA) - 0} y2={Y(yA)} stroke="#ef4444" strokeWidth={2.5} markerEnd="url(#rw-arr)" transform={`rotate(${-(w.method === 'rankine' ? w.beta : w.delta)} ${X(r.B)} ${Y(yA)})`} />
      <text x={X(r.B) - 6} y={Y(yA) - 10} fontSize={16} fill="#ef4444" textAnchor="end" fontWeight={700}>Pa = {num(r.Pa + r.Pq, 1)} kN/m</text>
      {/* base pressure */}
      <polygon points={pts([[0, 0], [0, -r.qToe * qs], [r.B, -r.qHeel * qs], [r.B, 0]])} fill={r.qHeel < 0 ? 'color-mix(in srgb, #ef4444 25%, transparent)' : 'color-mix(in srgb, #0ea5e9 22%, transparent)'} stroke="#0ea5e9" />
      <text x={X(0) + 4} y={Y(-r.qToe * qs) + 14} fontSize={14} fill="var(--text)">q toe {num(r.qToe, 0)} kPa</text>
      <text x={X(r.B) - 4} y={Y(-Math.max(0, r.qHeel) * qs) + 14} fontSize={14} fill="var(--text)" textAnchor="end">q heel {num(r.qHeel, 0)}</text>
      {/* dimensions */}
      <text x={X(r.B / 2)} y={Y(-0.0) + 14} fontSize={14} textAnchor="middle" fill="var(--muted)">B = {num(r.B, 2)} m</text>
      <text x={X(back) + 4} y={Y(H) - 6} fontSize={14} fill="var(--muted)">H′ = {num(r.Hp, 2)} m</text>
    </svg>
  )
}

const verdict = (fs: number, req: number) => (Number.isFinite(fs) && fs >= req ? 'good' : 'bad') as 'good' | 'bad'

export default function RetainingWallChecker() {
  const [s, set, reset] = useToolState('retaining-wall-checker', DEF)
  const valid = s.stemH > 0 && s.tTop > 0 && s.tBot >= s.tTop && s.toe >= 0 && s.heel > 0 && s.tBase > 0 && s.phi1 > 0 && s.beta < s.phi1 && s.beta >= 0
  const r = valid ? analyse(s) : null
  const okE = r ? Math.abs(r.e) <= r.B / 6 : false
  const all = r && r.FSo >= s.reqO && r.FSs >= s.reqS && r.FSb >= s.reqB && okE

  const N = (k: keyof State, label: string, unit: string, min = 0, step: number | 'any' = 'any') => (
    <Num label={label} value={s[k] as number} onChange={(v) => set({ [k]: v } as Partial<State>)} unit={unit} min={min} step={step} />
  )

  return (
    <Split>
      <div>
        <Panel title="Wall geometry" actions={<Btn kind="ghost" onClick={reset}>Worked example</Btn>}>
          <Row>
            {N('stemH', 'Stem height', 'm')}
            {N('tBase', 'Base thickness', 'm')}
            {N('tTop', 'Stem top', 'm')}
            {N('tBot', 'Stem bottom', 'm')}
            {N('toe', 'Toe length', 'm')}
            {N('heel', 'Heel length', 'm')}
            {N('gc', 'Concrete γ', 'kN/m³')}
          </Row>
        </Panel>
        <Panel title="Retained soil (granular, drained)">
          <Seg value={s.method} onChange={(method) => set({ method })} options={[['rankine', 'Rankine'], ['coulomb', 'Coulomb']]} />
          <Row>
            {N('g1', 'Unit weight γ₁', 'kN/m³')}
            {N('phi1', 'Friction angle φ₁', '°')}
            {N('beta', 'Backfill slope β', '°')}
            {N('q', 'Surcharge q', 'kPa')}
            {s.method === 'coulomb' && N('delta', 'Wall friction δ', '°')}
          </Row>
          {s.beta >= s.phi1 && <Note tone="err">The backfill slope must be flatter than φ₁ — a slope steeper than the friction angle is not stable on its own.</Note>}
        </Panel>
        <Panel title="Foundation soil">
          <Row>
            {N('g2', 'Unit weight γ₂', 'kN/m³')}
            {N('phi2', 'Friction angle φ₂', '°')}
            {N('c2', 'Cohesion c₂', 'kPa')}
            {N('D', 'Soil depth at toe D', 'm')}
            {N('k1', 'Base friction k₁ (δ′=k₁φ₂)', '')}
            {N('k2', 'Adhesion k₂ (ca=k₂c₂)', '')}
          </Row>
          <Check label="Count passive resistance in front of the toe" value={s.passive} onChange={(passive) => set({ passive })} />
        </Panel>
        <Panel title="Required factors of safety">
          <Row>
            {N('reqO', 'Overturning', '')}
            {N('reqS', 'Sliding', '')}
            {N('reqB', 'Bearing', '')}
          </Row>
        </Panel>
      </div>
      <div>
        {!r ? (
          <Note tone="err">Check the inputs: thicknesses and lengths must be positive, the stem bottom at least as thick as the top, and β &lt; φ₁.</Note>
        ) : (
          <>
            <Note tone={all ? 'ok' : 'err'}>
              {all ? '✓ All four checks pass with the required margins.' : '✗ At least one check fails — see the red tiles below.'}
            </Note>
            <Stats>
              <Stat label="Overturning FS" value={num(r.FSo, 2)} sub={`≥ ${s.reqO} required`} tone={verdict(r.FSo, s.reqO)} />
              <Stat label="Sliding FS" value={num(r.FSs, 2)} sub={`≥ ${s.reqS}${s.passive ? ' (incl. passive)' : ''}`} tone={verdict(r.FSs, s.reqS)} />
              <Stat label="Bearing FS" value={num(r.FSb, 2)} sub={`qu ${num(r.qu, 0)} kPa ÷ q toe`} tone={verdict(r.FSb, s.reqB)} />
              <Stat label="Eccentricity e" value={`${num(r.e, 3)} m`} sub={`limit B/6 = ${num(r.B / 6, 3)} m`} tone={okE ? 'good' : 'bad'} />
            </Stats>
            <Panel title="Section, earth pressure and base contact pressure">
              <Diagram w={s} r={r} />
            </Panel>
            <Panel
              title="Vertical forces and resisting moments about the toe (per metre)"
              actions={<CsvButton name="retaining-wall.csv" rows={() => [['Component', 'W (kN/m)', 'Arm (m)', 'Moment (kNm/m)'], ...r.parts.map((p) => [p.name, p.W.toFixed(2), p.x.toFixed(3), (p.W * p.x).toFixed(2)]), ['Overturning moment', '', '', r.MO.toFixed(2)]]} />}
            >
              <Table
                head={['Component', 'W (kN/m)', 'Arm (m)', 'Moment (kNm/m)']}
                rows={r.parts.map((p) => [p.name, num(p.W, 2), num(p.x, 3), num(p.W * p.x, 2)])}
                foot={['ΣV / ΣM_R', num(r.V, 2), '', num(r.MR, 2)]}
              />
              <Table
                head={['Quantity', 'Value']}
                rows={[
                  [`K_a (${s.method === 'rankine' ? 'Rankine' : 'Coulomb'})`, num(r.Ka, 4)],
                  ['Height of virtual back H′', `${num(r.Hp, 3)} m`],
                  ['Active thrust P_a = ½γH′²K_a', `${num(r.Pa, 2)} kN/m`],
                  ['Surcharge thrust K_a·q·H′', `${num(r.Pq, 2)} kN/m`],
                  ['Horizontal / vertical components', `${num(r.Ph, 2)} / ${num(r.Pv, 2)} kN/m`],
                  ['Overturning moment ΣM_O', `${num(r.MO, 2)} kNm/m`],
                  ['K_p (Rankine) and passive force P_p', `${num(r.Kp, 3)} · ${num(r.Pp, 1)} kN/m`],
                  ['Load inclination ψ', `${num(r.psi, 2)}°`],
                  ['Base pressure toe / heel', `${num(r.qToe, 1)} / ${num(r.qHeel, 1)} kPa`],
                  ['Ultimate bearing q_u (Meyerhof, B′ = B − 2e)', `${num(r.qu, 1)} kPa`],
                ]}
              />
            </Panel>
            {r.qHeel < 0 && <Note tone="warn">The heel lifts off (negative contact pressure): the resultant lies outside the middle third.</Note>}
          </>
        )}
        <Note tone="warn">
          Educational check of external stability only (no water pressure, seismic load, global slip, settlement or structural design of the stem and base). It is <b>not a substitute for an engineer</b>: have a licensed geotechnical/structural engineer design any real wall.
        </Note>
      </div>
    </Split>
  )
}
