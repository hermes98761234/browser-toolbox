import { useMemo } from 'react'
import { Btn, Check, CsvButton, download, fmt, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { cu, fixtureCount, grid, KINDS, pointGrid, positions, rcr, roomIndex, SPACES, type Kind } from './lib/lighting-layout-calculator'

interface S {
  units: 'm' | 'ft'
  L: number; W: number; H: number; wp: number; susp: number
  space: number; E: number
  kind: Kind; lumens: number; watts: number
  ceil: number; wall: number; floor: number
  mf: number
  custom: boolean; cols: number; rows: number
}
const DEF: S = { units: 'm', L: 12, W: 8, H: 3, wp: 0.8, susp: 0, space: 0, E: 500, kind: 'troffer', lumens: 4000, watts: 32, ceil: 80, wall: 50, floor: 20, mf: 0.8, custom: false, cols: 6, rows: 3 }
const FT = 0.3048, FC = 10.7639

const LUMINAIRES: [string, Kind, number, number][] = [
  ['600×600 LED panel, 4000 lm / 32 W', 'troffer', 4000, 32],
  ['2×4 ft LED troffer, 5000 lm / 40 W', 'troffer', 5000, 40],
  ['1200 mm linear pendant, 4500 lm / 35 W', 'pendant', 4500, 35],
  ['LED high-bay 150 W, 21 000 lm', 'highbay', 21000, 150],
  ['LED high-bay 200 W, 28 000 lm', 'highbay', 28000, 200],
  ['LED downlight 1800 lm / 15 W', 'troffer', 1800, 15],
]
const REFL: [string, number, number, number][] = [['Light office 80/50/20', 80, 50, 20], ['Typical 70/50/20', 70, 50, 20], ['Medium 50/30/20', 50, 30, 20], ['Dark / industrial 30/10/10', 30, 10, 10]]

export default function LightingLayoutCalculator() {
  const [s, set, reset] = useToolState('lighting-layout-calculator', DEF)
  const k = s.units === 'ft' ? FT : 1
  const L = s.L * k, W = s.W * k, H = s.H * k, wp = s.wp * k, susp = s.susp * k
  const E = s.units === 'ft' ? s.E * FC : s.E
  const hrc = Math.max(0.1, H - susp - wp)
  const valid = L > 0 && W > 0 && H > wp + susp && s.lumens > 0 && E > 0
  const area = L * W
  const RCR = rcr(L, W, hrc)
  const CU = cu(s.kind, RCR, s.ceil, s.wall)
  const raw = valid ? fixtureCount(E, area, s.lumens, CU, s.mf) : 0
  const auto = grid(Math.ceil(raw), L, W)
  const g = s.custom ? { cols: Math.max(1, s.cols), rows: Math.max(1, s.rows) } : auto
  const n = g.cols * g.rows
  const achieved = (n * s.lumens * CU * s.mf) / area
  const fx = useMemo(() => positions(g.cols, g.rows, L, W), [g.cols, g.rows, L, W])
  const info = KINDS[s.kind]
  const pg = useMemo(() => (valid && n > 0 ? pointGrid(fx, L, W, hrc, s.lumens * (1 - info.up) * s.mf, info.m, 28) : null), [valid, n, fx, L, W, hrc, s.lumens, s.mf, info])
  const sx = L / g.cols, sy = W / g.rows
  const shr = Math.max(sx, sy) / hrc
  const lpd = (n * s.watts) / area
  const u = (m: number, d = 2) => `${fmt(m / k, d)} ${s.units}`
  const lux = (v: number) => (s.units === 'ft' ? `${fmt(v / FC, 1)} fc` : `${fmt(v, 0)} lx`)

  // plan geometry
  const PW = 640, scale = Math.min(PW / L, 420 / W), pw = L * scale, ph = W * scale
  const lo = pg ? Math.min(...pg.values) : 0, hi = pg ? Math.max(...pg.values) : 1
  const heat = (v: number) => {
    const f = Math.min(1, Math.max(0, (v - lo) / (hi - lo || 1)))
    return `hsl(${230 - 180 * f} 85% ${30 + 35 * f}%)`
  }
  const svgId = 'lighting-plan'

  return (
    <Split>
      <div>
        <Panel title="Room" actions={<><Seg value={s.units} onChange={(units) => set({ units, ...(units === s.units ? {} : units === 'ft' ? { L: +(s.L / FT).toFixed(1), W: +(s.W / FT).toFixed(1), H: +(s.H / FT).toFixed(1), wp: +(s.wp / FT).toFixed(1), susp: +(s.susp / FT).toFixed(1), E: Math.round(s.E / FC) } : { L: +(s.L * FT).toFixed(2), W: +(s.W * FT).toFixed(2), H: +(s.H * FT).toFixed(2), wp: +(s.wp * FT).toFixed(2), susp: +(s.susp * FT).toFixed(2), E: Math.round(s.E * FC) }) })} options={[['m', 'Metric'], ['ft', 'Imperial']]} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Row>
            <Num label="Length" value={s.L} onChange={(L) => set({ L })} unit={s.units} min={0} />
            <Num label="Width" value={s.W} onChange={(W) => set({ W })} unit={s.units} min={0} />
            <Num label="Ceiling height" value={s.H} onChange={(H) => set({ H })} unit={s.units} min={0} />
          </Row>
          <Row>
            <Num label="Work plane height" value={s.wp} onChange={(wp) => set({ wp })} unit={s.units} min={0} hint="Desks ≈ 0.75–0.85 m; floor = 0" />
            <Num label="Suspension length" value={s.susp} onChange={(susp) => set({ susp })} unit={s.units} min={0} hint="0 for recessed" />
          </Row>
          <Select label="Space type (typical maintained illuminance)" value={s.space} onChange={(space) => set({ space, E: s.units === 'ft' ? Math.round(SPACES[space][1] / FC) : SPACES[space][1] })} options={SPACES.map(([nm, e], i) => [i, `${nm} — ${s.units === 'ft' ? Math.round(e / FC) + ' fc' : e + ' lx'}`] as [number, string])} />
          <Num label="Target average illuminance" value={s.E} onChange={(E) => set({ E })} unit={s.units === 'ft' ? 'fc' : 'lx'} min={0} />
        </Panel>
        <Panel title="Luminaire">
          <Select label="Preset" value={-1} onChange={(i) => i >= 0 && set({ kind: LUMINAIRES[i][1], lumens: LUMINAIRES[i][2], watts: LUMINAIRES[i][3] })} options={[[-1, 'Choose a preset…'] as [number, string], ...LUMINAIRES.map(([nm], i) => [i, nm] as [number, string])]} />
          <Select<Kind> label="Distribution class" value={s.kind} onChange={(kind) => set({ kind })} options={(Object.keys(KINDS) as Kind[]).map((x) => [x, KINDS[x].name] as [Kind, string])} />
          <Row>
            <Num label="Luminous flux per fixture" value={s.lumens} onChange={(lumens) => set({ lumens })} unit="lm" min={0} />
            <Num label="Power per fixture" value={s.watts} onChange={(watts) => set({ watts })} unit="W" min={0} />
          </Row>
        </Panel>
        <Panel title="Surfaces & maintenance">
          <Select label="Reflectances (ceiling/wall/floor %)" value={-1} onChange={(i) => i >= 0 && set({ ceil: REFL[i][1], wall: REFL[i][2], floor: REFL[i][3] })} options={[[-1, 'Choose a preset…'] as [number, string], ...REFL.map(([nm], i) => [i, nm] as [number, string])]} />
          <Row>
            <Slider label="Ceiling" value={s.ceil} onChange={(ceil) => set({ ceil })} min={0} max={90} step={10} unit="%" />
            <Slider label="Walls" value={s.wall} onChange={(wall) => set({ wall })} min={10} max={70} step={10} unit="%" />
          </Row>
          <Slider label="Maintenance (light loss) factor" value={s.mf} onChange={(mf) => set({ mf })} min={0.5} max={1} step={0.05} show={(v) => v.toFixed(2)} />
          <div className="muted" style={{ fontSize: 12 }}>LED in a clean office ≈ 0.8; normal ≈ 0.7; dusty workshop ≈ 0.6. Floor reflectance is fixed at 20% in the CU table.</div>
          <Check label="Choose the grid myself" value={s.custom} onChange={(custom) => set({ custom, cols: auto.cols || 1, rows: auto.rows || 1 })} />
          {s.custom && (
            <Row>
              <Num label="Columns (along length)" value={s.cols} onChange={(cols) => set({ cols: Math.max(1, Math.round(cols)) })} min={1} />
              <Num label="Rows (along width)" value={s.rows} onChange={(rows) => set({ rows: Math.max(1, Math.round(rows)) })} min={1} />
            </Row>
          )}
        </Panel>
      </div>
      <div>
        {!valid ? (
          <Note tone="err">Check the inputs: dimensions and flux must be positive and the ceiling higher than work plane + suspension.</Note>
        ) : (
          <>
            <Stats>
              <Stat label="Fixtures needed" value={fmt(raw, 2)} sub={`→ install ${n} (${g.cols} × ${g.rows})`} tone="accent" />
              <Stat label="Average illuminance" value={lux(achieved)} sub={`target ${lux(E)} · ${achieved >= E * 0.98 ? 'met' : 'below target'}`} tone={achieved >= E * 0.98 ? 'good' : 'bad'} />
              <Stat label="Power density" value={s.units === 'ft' ? `${fmt(lpd * FT * FT, 2)} W/ft²` : `${fmt(lpd, 2)} W/m²`} sub={`${fmt((lpd / achieved) * 100, 2)} W/m² per 100 lx · ${fmt(n * s.watts, 0)} W total`} />
              <Stat label="Spacing" value={`${u(sx)} × ${u(sy)}`} sub={`S/MH = ${fmt(shr, 2)} (max ≈ ${info.shr})`} tone={shr > info.shr ? 'bad' : undefined} />
            </Stats>
            {shr > info.shr && <Note tone="warn">Spacing-to-mounting-height ratio {fmt(shr, 2)} exceeds about {info.shr} for this distribution: expect dark patches between fixtures. Use more, lower-output fixtures or a wider distribution.</Note>}
            {achieved > E * 1.3 && <Note tone="info">The grid gives {fmt(((achieved - E) / E) * 100, 0)}% more light than needed: consider lower-lumen fixtures or dimming.</Note>}
            <Panel title="Room plan" actions={
              <>
                <Btn onClick={() => {
                  const el = document.getElementById(svgId)
                  if (!el) return
                  const cs = getComputedStyle(document.documentElement)
                  download('lighting-layout.svg', new XMLSerializer().serializeToString(el).replace(/var\((--[\w-]+)\)/g, (_, v: string) => cs.getPropertyValue(v).trim() || '#888'), 'image/svg+xml')
                }}>⬇ SVG</Btn>
                <CsvButton name="fixture-positions.csv" rows={() => [['#', `x (${s.units})`, `y (${s.units})`], ...fx.map((f, i) => [i + 1, +(f.x / k).toFixed(3), +(f.y / k).toFixed(3)])]} />
              </>
            }>
              <svg id={svgId} xmlns="http://www.w3.org/2000/svg" viewBox={`-50 -30 ${pw + 70} ${ph + 70}`} style={{ width: '100%' }} role="img" aria-label="Room plan with fixtures">
                {pg && pg.values.map((v, i) => {
                  const c = i % pg.nx, r = Math.floor(i / pg.nx)
                  return <rect key={i} x={(c * pw) / pg.nx} y={(r * ph) / pg.ny} width={pw / pg.nx + 0.5} height={ph / pg.ny + 0.5} fill={heat(v)} opacity={0.55} />
                })}
                <rect x={0} y={0} width={pw} height={ph} fill="none" stroke="var(--fg)" strokeWidth={3} />
                {fx.map((f, i) => (
                  <g key={i}>
                    {s.kind === 'highbay' ? (
                      <circle cx={f.x * scale} cy={f.y * scale} r={Math.max(5, Math.min(12, 0.25 * scale))} fill="#fff" stroke="#111" strokeWidth={1.5} />
                    ) : (
                      <rect x={f.x * scale - Math.max(5, 0.3 * scale)} y={f.y * scale - Math.max(5, 0.3 * scale) / (s.kind === 'pendant' ? 3 : 1)} width={2 * Math.max(5, 0.3 * scale)} height={(2 * Math.max(5, 0.3 * scale)) / (s.kind === 'pendant' ? 3 : 1)} fill="#fff" stroke="#111" strokeWidth={1.5} />
                    )}
                  </g>
                ))}
                {/* dimensions */}
                <g fontSize={12} fill="var(--fg)">
                  <line x1={0} x2={pw} y1={-14} y2={-14} stroke="var(--muted)" />
                  <text x={pw / 2} y={-18} textAnchor="middle">{u(L)}</text>
                  <line x1={-14} x2={-14} y1={0} y2={ph} stroke="var(--muted)" />
                  <text x={-20} y={ph / 2} textAnchor="middle" transform={`rotate(-90 -20 ${ph / 2})`}>{u(W)}</text>
                  {g.cols > 1 && <>
                    <line x1={fx[0].x * scale} x2={fx[1].x * scale} y1={ph + 16} y2={ph + 16} stroke="var(--accent)" />
                    <text x={((fx[0].x + fx[1].x) / 2) * scale} y={ph + 30} textAnchor="middle" fill="var(--accent)">{u(sx)}</text>
                  </>}
                  <text x={(fx[0].x * scale) / 2} y={ph + 30} textAnchor="middle" fill="var(--muted)">{u(sx / 2)}</text>
                </g>
              </svg>
              {pg && (
                <Row>
                  <span className="muted" style={{ fontSize: 12 }}>Direct component only ({info.m === 1 ? 'Lambertian' : `cos^${info.m}`} model, excluding a 0.5 m wall strip):</span>
                  <span style={{ fontSize: 12 }}>min {lux(pg.min)} · avg {lux(pg.avg)} · max {lux(pg.max)} · U₀ = min/avg = <b>{fmt(pg.min / pg.avg, 2)}</b> {pg.min / pg.avg >= 0.6 ? '✓ ≥ 0.6' : '(task areas usually want ≥ 0.6)'}</span>
                </Row>
              )}
            </Panel>
            <Panel title="Calculation (lumen method)">
              <Table
                head={['Step', 'Formula', 'Value']}
                rows={[
                  ['Floor area A', 'L × W', s.units === 'ft' ? `${fmt(area / FT / FT, 1)} ft²` : `${fmt(area, 2)} m²`],
                  ['Cavity height h_rc', 'ceiling − suspension − work plane', u(hrc)],
                  ['Room cavity ratio', 'RCR = 5·h_rc·(L + W) / (L·W)', fmt(RCR, 3)],
                  ['Room index', 'K = L·W / (h_rc·(L + W)) = 5/RCR', fmt(roomIndex(L, W, hrc), 3)],
                  ['Coefficient of utilization', `typical table, ρc ${s.ceil}% / ρw ${s.wall}% / ρf 20%`, fmt(CU, 3)],
                  ['Maintenance factor', 'MF', fmt(s.mf, 2)],
                  ['Fixtures', 'N = E·A / (Φ·CU·MF)', `${fmt(E, 0)} × ${fmt(area, 1)} / (${s.lumens} × ${fmt(CU, 3)} × ${s.mf}) = ${fmt(raw, 2)}`],
                  ['Installed', 'rounded to a grid', `${g.cols} × ${g.rows} = ${n}`],
                  ['Maintained average', 'E = N·Φ·CU·MF / A', lux(achieved)],
                ]}
              />
              <Note>
                CU values are <b>typical figures for the chosen luminaire class</b>, not from a specific photometric file. For a final design use the manufacturer’s CU table or a point-by-point program (e.g. with IES/LDT files).
              </Note>
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
