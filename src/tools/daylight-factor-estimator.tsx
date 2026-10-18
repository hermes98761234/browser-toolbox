import { useMemo } from 'react'
import { Btn, CsvButton, LineChart, Note, Num, Panel, pct, Row, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { averageDF, depthCriterion, grid, irc, skyComponent, stats, surfaces, type Room, type Win } from './lib/daylight-factor-estimator'

interface State extends Room { use: string }

const DEF: State = {
  W: 4.2, D: 5.4, H: 2.7, wp: 0.85,
  wins: [{ w: 1.6, h: 1.5, sill: 0.9, x: 0.5 }, { w: 1.2, h: 1.5, sill: 0.9, x: 2.6 }],
  rFloor: 0.3, rWall: 0.6, rCeil: 0.85, T: 0.7, frame: 0.8, M: 0.92, obst: 15, use: 'living',
}

const USES: [string, string, number][] = [
  ['kitchen', 'Kitchen', 2], ['living', 'Living room', 1.5], ['bedroom', 'Bedroom', 1], ['office', 'Office / study', 2],
  ['classroom', 'Classroom', 2], ['studio', 'Studio / workshop', 5],
]
const GLAZING: [number, string][] = [[0.85, 'Single clear (0.85)'], [0.75, 'Double clear (0.75)'], [0.7, 'Double low-E (0.70)'], [0.62, 'Triple low-E (0.62)'], [0.5, 'Solar control (0.50)'], [0.35, 'Tinted (0.35)']]
const REFL: [number, string][] = [[0.85, 'White paint 0.85'], [0.7, 'Light pastel 0.70'], [0.6, 'Light grey/beige 0.60'], [0.5, 'Mid colour 0.50'], [0.3, 'Light wood floor 0.30'], [0.2, 'Mid wood / carpet 0.20'], [0.1, 'Dark 0.10']]

const ramp = (t: number) => {
  // perceptual-ish dark blue → teal → yellow
  const stops = [[30, 41, 99], [37, 99, 235], [20, 184, 166], [132, 204, 22], [250, 204, 21], [255, 247, 205]]
  const x = Math.max(0, Math.min(0.9999, t)) * (stops.length - 1)
  const i = Math.floor(x), f = x - i
  const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f))
  return `rgb(${c.join(',')})`
}
const dfScale = (df: number) => Math.log10(Math.max(0.2, df) / 0.2) / Math.log10(10 / 0.2) // 0.2%..10% log

/** Marching squares on cell centres → line segments for a threshold. */
function contour(v: number[], nx: number, ny: number, t: number, cw: number, ch: number): string {
  let d = ''
  const P = (i: number, j: number) => v[j * nx + i]
  const lerp = (a: number, b: number) => (t - a) / (b - a || 1e-9)
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), e = P(i, j + 1)
    const pts: [number, number][] = []
    const X = (k: number) => (k + 0.5) * cw, Y = (k: number) => (k + 0.5) * ch
    if ((a >= t) !== (b >= t)) pts.push([X(i + lerp(a, b)), Y(j)])
    if ((b >= t) !== (c >= t)) pts.push([X(i + 1), Y(j + lerp(b, c))])
    if ((e >= t) !== (c >= t)) pts.push([X(i + lerp(e, c)), Y(j + 1)])
    if ((a >= t) !== (e >= t)) pts.push([X(i), Y(j + lerp(a, e))])
    for (let k = 0; k + 1 < pts.length; k += 2) d += `M${pts[k][0].toFixed(1)},${pts[k][1].toFixed(1)}L${pts[k + 1][0].toFixed(1)},${pts[k + 1][1].toFixed(1)}`
  }
  return d
}

export default function DaylightFactorEstimator() {
  const [s, set, reset] = useToolState('daylight-factor-estimator', DEF)
  const room: Room = s
  const valid = s.W > 0 && s.D > 0 && s.H > 0 && s.wins.every((w) => w.w > 0 && w.h > 0 && w.x >= 0 && w.x + w.w <= s.W + 1e-9 && w.sill + w.h <= s.H + 1e-9)
  const sf = surfaces(room)
  const adf = averageDF(room)
  const g = useMemo(() => (valid ? grid(room, 28, Math.max(8, Math.round((28 * s.D) / s.W))) : null), [valid, room, s.D, s.W])
  const st = g ? stats(g, room) : null
  const target = USES.find((u) => u[0] === s.use)?.[2] ?? 1.5
  const depth = depthCriterion(room)
  const ic = irc(room) * s.M
  const band = adf >= 5 ? ['Very well daylit', 'ok', 'Electric lighting rarely needed in daytime; watch glare and overheating.'] : adf >= 2 ? ['Well daylit', 'ok', 'Daylight is the main source in daytime; supplementary lighting at the back on dull days.'] : adf >= 1 ? ['Moderate', 'warn', 'The room will look dull without electric light for much of the day.'] : ['Gloomy', 'err', 'Electric lighting will be needed most of the time.']

  const editWin = (i: number, p: Partial<Win>) => set({ wins: s.wins.map((w, j) => (j === i ? { ...w, ...p } : w)) })
  const sec = useMemo(() => {
    if (!valid) return []
    const cx = s.W / 2
    return Array.from({ length: 40 }, (_, k) => {
      const y = 0.1 + ((s.D - 0.2) * k) / 39
      return [y, skyComponent(room, cx, y, 12) * s.T * s.frame * s.M + ic] as [number, number]
    })
  }, [valid, room, s.W, s.D, s.T, s.frame, s.M, ic])

  const scale = Math.min(560 / s.W, 440 / s.D), PW = s.W * scale, PH = s.D * scale

  return (
    <Split wide="right">
      <div>
        <Panel title="Room" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Num label="Width (window wall)" value={s.W} onChange={(W) => set({ W })} unit="m" min={1} />
            <Num label="Depth" value={s.D} onChange={(D) => set({ D })} unit="m" min={1} />
          </Row>
          <Row>
            <Num label="Ceiling height" value={s.H} onChange={(H) => set({ H })} unit="m" min={2} />
            <Num label="Working plane" value={s.wp} onChange={(wp) => set({ wp })} unit="m" min={0} />
          </Row>
          <Select label="Room use (guidance target)" value={s.use} onChange={(use) => set({ use })} options={USES.map(([v, l, t]) => [v, `${l} · ${t}% average DF`] as [string, string])} />
        </Panel>
        <Panel title="Windows (on one wall)" actions={<Btn onClick={() => set({ wins: [...s.wins, { w: 1, h: 1.2, sill: 0.9, x: Math.max(0, s.W - 1.3) }] })}>+ Window</Btn>}>
          <Table
            head={['Width', 'Height', 'Sill', 'From left', '']}
            rows={s.wins.map((w, i) => [
              ...(['w', 'h', 'sill', 'x'] as const).map((k) => <input key={k} type="number" step={0.1} min={0} value={w[k]} onChange={(e) => editWin(i, { [k]: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 62 }} aria-label={k} />),
              <Btn key="x" kind="ghost" disabled={s.wins.length < 2} onClick={() => set({ wins: s.wins.filter((_, j) => j !== i) })}>✕</Btn>,
            ])}
          />
          {!valid && <Note tone="err">A window extends beyond the wall (check width + offset ≤ room width and sill + height ≤ ceiling).</Note>}
        </Panel>
        <Panel title="Glazing & surfaces">
          <Select label="Glazing (diffuse transmittance)" value={s.T} onChange={(T) => set({ T })} options={GLAZING.some(([v]) => v === s.T) ? GLAZING : [[s.T, `Custom ${s.T}`], ...GLAZING]} />
          <Row>
            <Slider label="Glazed fraction (frame)" value={s.frame} onChange={(frame) => set({ frame })} min={0.5} max={1} step={0.01} show={(v) => pct(v, 0)} />
            <Slider label="Maintenance factor" value={s.M} onChange={(M) => set({ M })} min={0.6} max={1} step={0.01} />
          </Row>
          <Slider label="Obstruction angle (from window centre)" value={s.obst} onChange={(obst) => set({ obst })} min={0} max={70} unit="°" />
          {(['rCeil', 'rWall', 'rFloor'] as const).map((k) => (
            <Select key={k} label={{ rCeil: 'Ceiling reflectance', rWall: 'Wall reflectance', rFloor: 'Floor reflectance' }[k]} value={s[k]} onChange={(v) => set({ [k]: v })} options={REFL.some(([v]) => v === s[k]) ? REFL : [[s[k], `Custom ${s[k]}`], ...REFL]} />
          ))}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Average DF (BRE formula)" value={`${adf.toFixed(2)}%`} tone={adf >= target ? 'good' : 'bad'} sub={`target ${target}% · ${band[0]}`} />
          <Stat label="Grid mean / median" value={st ? `${st.mean.toFixed(2)}% / ${st.median.toFixed(2)}%` : '—'} sub="point method, 0.5 m border excluded" />
          <Stat label="Minimum · uniformity" value={st ? `${st.min.toFixed(2)}% · ${st.uniformity.toFixed(2)}` : '—'} sub="min / mean (≥ 0.3–0.4 is good)" />
          <Stat label="Area ≥ 2% DF" value={st ? pct(st.over(2), 0) : '—'} sub={st ? `${pct(st.over(target), 0)} ≥ ${target}% target` : ''} />
          <Stat label="Window / floor" value={pct(sf.gross / sf.floor, 0)} sub={`glazing ${pct(sf.gross / sf.windowWall, 0)} of wall`} />
          <Stat label="Internal reflected" value={`${ic.toFixed(2)}%`} sub={`R̄ = ${sf.Ravg.toFixed(2)}`} />
        </Stats>
        <Note tone={band[1] as 'ok' | 'warn' | 'err'}><b>{band[0]}.</b> {band[2]}</Note>
        {g && (
          <Panel title="Daylight factor on the working plane (plan view)" actions={<CsvButton name="daylight-grid.csv" rows={() => [['x_m', 'y_m', 'DF_%', 'sky_component_%'], ...g.df.map((v, k) => [+(((k % g.nx) + 0.5) * g.dx).toFixed(3), +((Math.floor(k / g.nx) + 0.5) * g.dy).toFixed(3), +v.toFixed(3), +g.sc[k].toFixed(3)])]} />}>
            <div style={{ overflowX: 'auto' }}>
              <svg viewBox={`-20 -26 ${PW + 40} ${PH + 52}`} width="100%" style={{ maxWidth: PW + 40, display: 'block', margin: '0 auto' }} role="img" aria-label="daylight heat map">
                {g.df.map((v, k) => (
                  <rect key={k} x={(k % g.nx) * g.dx * scale} y={Math.floor(k / g.nx) * g.dy * scale} width={g.dx * scale + 0.5} height={g.dy * scale + 0.5} fill={ramp(dfScale(v))}>
                    <title>{`${v.toFixed(2)}% DF`}</title>
                  </rect>
                ))}
                {[1, 2, 5].map((t) => (
                  <path key={t} d={contour(g.df, g.nx, g.ny, t, g.dx * scale, g.dy * scale)} stroke={t === 2 ? '#fff' : '#0f172a'} strokeWidth={t === 2 ? 2.4 : 1.4} strokeDasharray={t === 5 ? '5 4' : undefined} fill="none" />
                ))}
                <rect x={0} y={0} width={PW} height={PH} fill="none" stroke="var(--text, #334155)" strokeWidth={2} />
                {s.wins.map((w, i) => <rect key={i} x={w.x * scale} y={-7} width={w.w * scale} height={7} fill="#38bdf8" />)}
                <text x={PW / 2} y={-12} textAnchor="middle" fontSize={12} fill="currentColor">window wall ({s.W} m)</text>
                <text x={PW + 6} y={PH / 2} fontSize={12} fill="currentColor" transform={`rotate(90 ${PW + 6} ${PH / 2})`} textAnchor="middle">depth {s.D} m</text>
              </svg>
            </div>
            <div className="k-legend" style={{ alignItems: 'center' }}>
              {[0.5, 1, 2, 3, 5, 8].map((v) => <span key={v}><i style={{ background: ramp(dfScale(v)) }} />{v}%</span>)}
              <span>— white line: 2% · dark: 1% · dashed: 5%</span>
            </div>
          </Panel>
        )}
        <Panel title="Section through the room centre">
          <LineChart series={[{ name: 'Daylight factor', points: sec, area: true }, { name: `${target}% target`, points: [[0, target], [s.D, target]], dashed: true, color: '#ef4444' }]} xLabel="distance from window wall (m)" yLabel="DF %" fy={(v) => v.toFixed(1)} height={210} />
        </Panel>
        <Panel title="Checks">
          <Note tone={depth.ok ? 'ok' : 'warn'}>
            Room-depth rule (BRE): L/W + L/H<sub>w</sub> = {depth.lhs.toFixed(2)} {depth.ok ? '≤' : '>'} 2/(1 − R<sub>b</sub>) = {depth.rhs.toFixed(2)}.
            {depth.ok ? ' The back of the room will not look noticeably gloomy.' : ' The back of the room will look gloomy whatever the window size: make the room shallower, raise window heads or lighten the back surfaces.'}
          </Note>
          {st && st.noSky > 0.2 && <Note tone="warn">About {pct(st.noSky, 0)} of the working plane cannot see the sky directly (beyond the no-sky line). Raising window heads helps more than widening windows.</Note>}
          <Note>
            Average DF = T·A<sub>w</sub>·θ·M / (A·(1 − R²)), with θ = 90° − obstruction angle. Point values combine a CIE-overcast sky component (numerically integrated through each window) with the BRE split-flux internally reflected component. Targets (1% bedrooms, 1.5% living rooms, 2% kitchens) follow the long-standing BS 8206-2 / BRE guidance; newer standards (EN 17037, BS EN 17037) use climate-based illuminance targets, so treat this as an early-design estimate, not a compliance calculation.
          </Note>
        </Panel>
      </div>
    </Split>
  )
}
