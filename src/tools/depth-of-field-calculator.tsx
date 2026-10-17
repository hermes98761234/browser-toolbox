import { Btn, CopyButton, fmt, niceTicks, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { angleOfView, cropFactor, defaultCoc, diagonal, dof, SENSORS, STOPS } from './lib/depth-of-field-calculator'

type Unit = 'm' | 'ft'
type CocMode = '1500' | '1730' | 'custom'

const DEF = { sensor: 0, cw: 36, ch: 24, focal: 85, stop: 2.8, dist: 3, unit: 'm' as Unit, cocMode: '1500' as CocMode, coc: 0.03 }
const PRESETS: [string, Partial<typeof DEF>][] = [
  ['Portrait', { focal: 85, stop: 1.8, dist: 2.5 }],
  ['Landscape', { focal: 24, stop: 11, dist: 4 }],
  ['Street', { focal: 35, stop: 8, dist: 3 }],
  ['Macro', { focal: 100, stop: 8, dist: 0.35 }],
  ['Wildlife', { focal: 400, stop: 5.6, dist: 25 }],
]
const FULL = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22]

export default function DepthOfFieldCalculator() {
  const [s, set, reset] = useToolState('depth-of-field-calculator', DEF)
  const custom = s.sensor < 0
  const sensor = custom ? { name: 'Custom', w: s.cw, h: s.ch } : SENSORS[s.sensor] ?? SENSORS[0]
  const k = s.unit === 'm' ? 1000 : 304.8 // mm per unit
  const c = s.cocMode === 'custom' ? s.coc : defaultCoc(sensor, Number(s.cocMode))
  const sMm = s.dist * k
  const valid = s.focal > 0 && s.stop > 0 && c > 0 && sMm > s.focal && sensor.w > 0 && sensor.h > 0
  const r = dof(s.focal, s.stop, c, sMm)
  const crop = cropFactor(sensor)
  const aov = angleOfView(s.focal, sensor)

  const fd = (mm: number) => {
    if (!Number.isFinite(mm)) return '∞'
    if (s.unit === 'm') return mm < 1000 ? `${(mm / 10).toFixed(mm < 100 ? 2 : 1)} cm` : `${(mm / 1000).toFixed(mm < 10000 ? 2 : 1)} m`
    const ft = mm / 304.8
    return ft < 3 ? `${(mm / 25.4).toFixed(1)} in` : `${ft.toFixed(ft < 30 ? 2 : 1)} ft`
  }

  // Range bar: linear axis from 0 to a bit past the far limit (or 2× focus / 1.2× hyperfocal if far is ∞).
  // When the zone is thin compared with the distance, zoom the axis around it.
  const zoom = Number.isFinite(r.far) && r.total < 0.35 * sMm
  const lo = zoom ? Math.max(0, r.near - r.total * 0.8) : 0
  const span = zoom ? r.far + r.total * 0.8 : Number.isFinite(r.far) ? Math.max(r.far * 1.25, sMm * 1.6) : Math.max(sMm * 2, r.hyperfocal * 1.2)
  const W = 640, X0 = 40, X1 = W - 16
  const sx = (mm: number) => X0 + ((Math.min(mm, span) - lo) / (span - lo)) * (X1 - X0)
  const ticks = niceTicks(lo / k, span / k, 6).filter((v) => v * k >= lo && v * k <= span)
  const frontPct = Number.isFinite(r.far) ? r.front / r.total : 0

  const summary = `${s.focal} mm f/${s.stop} on ${sensor.name}, focus ${fd(sMm)}: near ${fd(r.near)}, far ${fd(r.far)}, DoF ${fd(r.total)}, hyperfocal ${fd(r.hyperfocal)} (CoC ${c.toFixed(4)} mm)`

  return (
    <Split>
      <div>
        <Panel title="Camera & lens" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Sensor format" value={s.sensor} onChange={(sensor) => set({ sensor })} options={[...SENSORS.map((x, i) => [i, `${x.name} · ${x.w}×${x.h} mm`] as [number, string]), [-1, 'Custom size…']]} />
          {custom && (
            <Row>
              <Num label="Sensor width" value={s.cw} unit="mm" min={1} onChange={(cw) => set({ cw })} />
              <Num label="Sensor height" value={s.ch} unit="mm" min={1} onChange={(ch) => set({ ch })} />
            </Row>
          )}
          <Row>
            <Num label="Focal length" value={s.focal} unit="mm" min={1} onChange={(focal) => set({ focal })} />
            <Select label="Aperture" value={s.stop} onChange={(stop) => set({ stop })} options={STOPS.map((n) => [n, `f/${n}`] as [number, string])} />
          </Row>
          <Row>
            <Num label="Focus distance" value={s.dist} unit={s.unit} min={0} step={0.1} onChange={(dist) => set({ dist })} />
            <div className="k-field">
              <span className="k-label">Units</span>
              <Seg value={s.unit} onChange={(unit) => set({ unit, dist: +(s.dist * (unit === 'm' ? 0.3048 : 1 / 0.3048)).toFixed(2) })} options={[['m', 'Metres'], ['ft', 'Feet']]} />
            </div>
          </Row>
        </Panel>
        <Panel title="Circle of confusion">
          <Seg value={s.cocMode} onChange={(cocMode) => set({ cocMode })} options={[['1500', 'd / 1500 (classic)'], ['1730', 'd / 1730 (Zeiss)'], ['custom', 'Custom']]} />
          {s.cocMode === 'custom' ? (
            <Num label="CoC" value={s.coc} unit="mm" min={0.001} step={0.001} onChange={(coc) => set({ coc })} />
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>
              Sensor diagonal {diagonal(sensor).toFixed(2)} mm ÷ {s.cocMode} = <b>{c.toFixed(4)} mm</b>. Use a smaller CoC for large prints or pixel-peeping.
            </p>
          )}
        </Panel>
        <Panel title="Presets">
          <Row>
            {PRESETS.map(([n, p]) => (
              <Btn key={n} onClick={() => set({ ...p, dist: s.unit === 'm' ? p.dist! : +(p.dist! / 0.3048).toFixed(1) })}>{n}</Btn>
            ))}
          </Row>
        </Panel>
      </div>
      <div>
        {!valid ? (
          <Note tone="err">Focus distance must be greater than the focal length, and all values must be positive.</Note>
        ) : (
          <>
            <Stats>
              <Stat label="Near limit" value={fd(r.near)} sub={`${fd(r.front)} in front`} />
              <Stat label="Far limit" value={fd(r.far)} sub={Number.isFinite(r.far) ? `${fd(r.behind)} behind` : 'beyond hyperfocal'} />
              <Stat label="Depth of field" value={fd(r.total)} tone="accent" sub={Number.isFinite(r.far) ? `${Math.round(frontPct * 100)}% front / ${Math.round((1 - frontPct) * 100)}% behind` : 'near limit → infinity'} />
              <Stat label="Hyperfocal distance" value={fd(r.hyperfocal)} sub={`focus here: ${fd(r.hyperfocal / 2)} → ∞`} tone="good" />
            </Stats>
            <Panel title="Acceptably sharp zone" actions={<CopyButton text={summary} label="Copy summary" />}>
              <svg viewBox={`0 0 ${W} 140`} width="100%" role="img" aria-label="depth of field range">
                <defs>
                  <linearGradient id="dofg" x1="0" x2="1">
                    <stop offset="0" stopColor="var(--accent)" stopOpacity={0.15} />
                    <stop offset={Number.isFinite(r.far) ? frontPct : 0.5} stopColor="var(--accent)" stopOpacity={0.55} />
                    <stop offset="1" stopColor="var(--accent)" stopOpacity={Number.isFinite(r.far) ? 0.15 : 0.4} />
                  </linearGradient>
                </defs>
                <line x1={X0} x2={X1} y1={92} y2={92} stroke="var(--line)" strokeWidth={2} />
                <rect x={sx(r.near)} y={52} width={sx(r.far) - sx(r.near)} height={40} fill="url(#dofg)" stroke="var(--accent)" rx={4} />
                <g transform={`translate(${X0 - 30},76)`} opacity={zoom ? 0 : 1}>
                  <rect width={22} height={16} rx={3} fill="var(--muted)" />
                  <rect x={20} y={4} width={8} height={8} fill="var(--muted)" />
                </g>
                <line x1={sx(sMm)} x2={sx(sMm)} y1={40} y2={100} stroke="var(--err)" strokeWidth={2} />
                <text x={sx(sMm)} y={34} textAnchor="middle" fontSize={12} fill="var(--err)" fontWeight={700}>focus {fd(sMm)}</text>
                {ticks.map((v) => (
                  <g key={v}>
                    <line x1={sx(v * k)} x2={sx(v * k)} y1={92} y2={98} stroke="var(--muted)" />
                    <text x={sx(v * k)} y={110} textAnchor="middle" fontSize={10} fill="var(--muted)">{fmt(v, 4)}</text>
                  </g>
                ))}
                <text x={sx(r.near) - 5} y={76} textAnchor="end" fontSize={12} fontWeight={700} fill="currentColor">{fd(r.near)}</text>
                <text x={Number.isFinite(r.far) ? sx(r.far) + 5 : X1 - 4} y={Number.isFinite(r.far) ? 76 : 46} textAnchor={Number.isFinite(r.far) ? 'start' : 'end'} fontSize={12} fontWeight={700} fill="currentColor">{Number.isFinite(r.far) ? fd(r.far) : '∞ →'}</text>
                {zoom && <text x={X0} y={16} fontSize={11} fill="var(--muted)">zoomed axis ({s.unit}) · camera is at 0</text>}
                {r.hyperfocal < span && r.hyperfocal > lo && (
                  <g>
                    <line x1={sx(r.hyperfocal)} x2={sx(r.hyperfocal)} y1={96} y2={120} stroke="var(--ok)" strokeDasharray="3 3" />
                    <text x={sx(r.hyperfocal)} y={132} textAnchor="middle" fontSize={11} fill="var(--ok)">hyperfocal {fd(r.hyperfocal)}</text>
                  </g>
                )}
              </svg>
              <p className="muted" style={{ fontSize: 12 }}>Distances are measured from the sensor plane. The zone is asymmetric: more sharpness falls behind the focus point than in front of it.</p>
            </Panel>
            <Panel title="Same shot at other apertures">
              <Table
                head={['Aperture', 'Near', 'Far', 'Total DoF', 'Hyperfocal']}
                rows={FULL.map((n) => {
                  const x = dof(s.focal, n, c, sMm)
                  const on = Math.abs(n - s.stop) < 1e-9
                  const b = (t: string) => (on ? <b style={{ color: 'var(--accent)' }}>{t}</b> : t)
                  return [b(`f/${n}`), b(fd(x.near)), b(fd(x.far)), b(fd(x.total)), b(fd(x.hyperfocal))]
                })}
              />
            </Panel>
            <Panel title="Lens & sensor">
              <Table
                head={['', 'Value']}
                rows={[
                  ['Crop factor', crop.toFixed(2) + '×'],
                  ['Full-frame equivalent', `${(s.focal * crop).toFixed(0)} mm f/${(s.stop * crop).toFixed(1)} (for the same framing & DoF)`],
                  ['Angle of view (H × V)', `${aov.h.toFixed(1)}° × ${aov.v.toFixed(1)}°`],
                  ['Diagonal angle of view', `${aov.d.toFixed(1)}°`],
                  ['Frame width at focus', fd((sensor.w * (sMm - s.focal)) / s.focal)],
                  ['Magnification', `1:${((sMm - s.focal) / s.focal).toFixed(1)}`],
                ]}
              />
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
