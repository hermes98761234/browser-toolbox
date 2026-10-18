import { Bar, Btn, CsvButton, fmt, Note, Num, Panel, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { crossSection, DOWNSPOUTS, downspoutCapacity, flowGpm, pitchFactor, PROFILES, profileCapacity, sizePlane, SLOPES, type Plane, type Profile } from './lib/rain-gutter-sizer'

// Approximate design intensities (in/h) — 100-year, 1-hour (US, IPC maps) or local short-duration design values.
const CITIES: [string, number][] = [
  ['Atlanta, GA', 3.7], ['Boston, MA', 2.6], ['Chicago, IL', 3.0], ['Dallas, TX', 4.0], ['Denver, CO', 2.4], ['Houston, TX', 4.6],
  ['Kansas City, MO', 3.6], ['Los Angeles, CA', 2.0], ['Miami, FL', 4.7], ['Minneapolis, MN', 3.0], ['Nashville, TN', 3.3], ['New Orleans, LA', 4.8],
  ['New York, NY', 3.0], ['Phoenix, AZ', 2.5], ['Portland, OR', 1.2], ['Salt Lake City, UT', 1.3], ['San Francisco, CA', 1.5], ['Seattle, WA', 1.0],
  ['St. Louis, MO', 3.2], ['Washington, DC', 3.2], ['Toronto, ON', 2.9], ['London, UK (75 mm/h)', 2.95], ['Berlin, DE (≈ 90 mm/h)', 3.5], ['Sydney, AU (≈ 200 mm/h, 5-min)', 7.9],
]

const DEF = {
  metric: false,
  city: 'Chicago, IL',
  intensity: 3.0,
  slope: 1 / 16 as number,
  ds: 'r2x3',
  spacing: 40,
  planes: [
    { id: 'f', name: 'Front main roof', eave: 42, run: 14, rise: 6 },
    { id: 'b', name: 'Back main roof', eave: 42, run: 14, rise: 6 },
    { id: 'g', name: 'Garage', eave: 22, run: 11, rise: 4 },
    { id: 'p', name: 'Porch (low slope)', eave: 18, run: 8, rise: 2 },
  ] as Plane[],
}

const FT = 0.3048
const IN_MM = 25.4

function ProfileSvg({ p }: { p: Profile }) {
  const s = 18, W = p.width * s, D = p.depth * s
  const path =
    p.kind === 'half'
      ? `M10,10 A${W / 2},${W / 2} 0 0 0 ${10 + W},10`
      : p.kind === 'k'
        ? `M10,10 L${10 + W * 0.12},${10 + D} L${10 + W * 0.78},${10 + D} C${10 + W * 0.85},${10 + D * 0.6} ${10 + W * 0.9},${10 + D * 0.5} ${10 + W * 0.95},${10 + D * 0.35} L${10 + W},10`
        : `M10,10 L10,${10 + D} L${10 + W},${10 + D} L${10 + W},10`
  return (
    <svg width={W + 20} height={Math.max(D, p.kind === 'half' ? W / 2 : 0) + 34} role="img" aria-label={p.name}>
      <path d={path} fill="color-mix(in srgb, var(--accent) 22%, transparent)" stroke="var(--accent)" strokeWidth={3} />
      <text x={10 + W / 2} y={Math.max(D, p.kind === 'half' ? W / 2 : 0) + 30} textAnchor="middle" fontSize={12} fill="var(--muted)">
        {p.width}″ wide · {fmt(crossSection(p), 3)} in²
      </text>
    </svg>
  )
}

export default function RainGutterSizer() {
  const [s, set, reset] = useToolState('rain-gutter-sizer', DEF)
  const L = (ft: number) => (s.metric ? ft * FT : ft) // display length
  const fromL = (v: number) => (s.metric ? v / FT : v)
  const A = (ft2: number) => (s.metric ? ft2 * FT * FT : ft2)
  const lu = s.metric ? 'm' : 'ft', au = s.metric ? 'm²' : 'ft²'
  const ds = DOWNSPOUTS.find((d) => d.id === s.ds) ?? DOWNSPOUTS[0]
  const I = Math.max(0.1, s.intensity)
  const res = s.planes.map((p) => ({ p, r: sizePlane(p, I, s.slope, ds, s.spacing) }))
  const worst = res.reduce((m, x) => Math.max(m, x.r.perOutlet), 0)
  const pickAll = [...PROFILES].sort((a, b) => profileCapacity(a, s.slope, I) - profileCapacity(b, s.slope, I)).find((p) => profileCapacity(p, s.slope, I) >= worst) ?? null
  const totArea = res.reduce((a, x) => a + x.r.design, 0)
  const totOutlets = res.reduce((a, x) => a + x.r.outlets, 0)
  const totEave = s.planes.reduce((a, p) => a + p.eave, 0)
  const flow = flowGpm(totArea, I)
  const edit = (id: string, patch: Partial<Plane>) => set({ planes: s.planes.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  const gpm = (g: number) => (s.metric ? `${fmt(g * 0.0630902, 3)} L/s` : `${fmt(g, 3)} gpm`)

  return (
    <Split wide="right">
      <div>
        <Panel title="Rainfall" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.metric ? 'm' : 'i'} onChange={(v) => set({ metric: v === 'm' })} options={[['i', 'ft / in·h⁻¹'], ['m', 'm / mm·h⁻¹']]} />
          <Select label="Location (approximate design intensity)" value={s.city} onChange={(city) => set({ city, intensity: CITIES.find((c) => c[0] === city)?.[1] ?? s.intensity })} options={[...CITIES.map(([c]) => [c, c] as const), ['custom', 'Custom…']]} />
          <Num label="Design rainfall intensity" value={+(s.metric ? I * IN_MM : I).toFixed(2)} onChange={(v) => set({ intensity: s.metric ? v / IN_MM : v, city: 'custom' })} unit={s.metric ? 'mm/h' : 'in/h'} min={0.1} />
          <Note>Use your local code value (IPC/UPC 100-year 1-hour map, or EN 12056-3 / AS 3500.3 short-duration intensity). Values here are rough guides.</Note>
        </Panel>
        <Panel title="Gutter & downspouts">
          <Select label="Gutter slope toward outlet" value={s.slope} onChange={(slope) => set({ slope })} options={SLOPES.map((v) => [v, s.metric ? `${fmt(v / 12 * 100, 2)}% (${fmt(v * 83.33, 1)} mm/m)` : `1/${Math.round(1 / v)} in per ft`] as const)} />
          <Select label="Downspout size" value={s.ds} onChange={(d) => set({ ds: d })} options={DOWNSPOUTS.map((d) => [d.id, `${d.name} · ${fmt(s.metric ? d.area * 645.16 : d.area, 3)} ${s.metric ? 'mm²' : 'in²'}`] as const)} />
          <Num label="Max. downspout spacing" value={+L(s.spacing).toFixed(2)} onChange={(v) => set({ spacing: Math.max(5, fromL(v)) })} unit={lu} min={1} />
          <p className="muted">One {ds.name} serves ≈ {fmt(A(downspoutCapacity(ds, I)), 4)} {au} of roof at this intensity.</p>
        </Panel>
        <Panel title="Recommended profile">
          {pickAll ? (
            <>
              <ProfileSvg p={pickAll} />
              <p><b>{pickAll.name}</b> handles every plane (capacity {fmt(A(profileCapacity(pickAll, s.slope, I)), 4)} {au} per outlet vs. {fmt(A(worst), 4)} {au} needed).</p>
            </>
          ) : (
            <Note tone="err">No standard profile is large enough. Add downspouts (shorter spacing), steepen the gutter, or use a custom box gutter.</Note>
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Design roof area" value={`${fmt(A(totArea), 4)} ${au}`} sub="with SMACNA pitch factors" />
          <Stat label="Peak runoff" value={gpm(flow)} />
          <Stat label="Gutter / downspouts" value={`${fmt(L(totEave), 3)} ${lu} · ${totOutlets}`} sub={ds.name} />
          <Stat label="Suggested gutter" value={pickAll?.name ?? 'custom'} tone={pickAll ? 'good' : 'bad'} />
        </Stats>
        <Panel
          title="Roof planes"
          actions={
            <>
              <Btn onClick={() => set({ planes: [...s.planes, { id: uid(), name: `Plane ${s.planes.length + 1}`, eave: 20, run: 10, rise: 5 }] })}>+ Plane</Btn>
              <CsvButton name="gutter-sizing.csv" rows={() => [['Plane', `Eave (${lu})`, `Run (${lu})`, 'Pitch /12', `Design area (${au})`, 'Downspouts', `Area per outlet (${au})`, 'Flow', 'Min half-round (in)', 'Gutter'], ...res.map(({ p, r }) => [p.name, L(p.eave), L(p.run), p.rise, A(r.design), r.outlets, A(r.perOutlet), gpm(r.flow), r.needD.toFixed(2), r.pick?.name ?? 'custom'])]} />
            </>
          }
        >
          <Table
            head={['Plane', `Eave (${lu})`, `Run (${lu})`, 'Pitch /12', 'Design area', 'Outlets', 'Gutter', '']}
            rows={res.map(({ p, r }) => [
              <input key="n" value={p.name} onChange={(e) => edit(p.id, { name: e.target.value })} aria-label="Plane name" style={{ minWidth: 90, width: '100%' }} />,
              <input key="e" type="number" min={0} value={+L(p.eave).toFixed(2)} onChange={(e) => edit(p.id, { eave: Math.max(0, fromL(Number(e.target.value) || 0)) })} style={{ width: 70 }} aria-label="Eave length" />,
              <input key="r" type="number" min={0} value={+L(p.run).toFixed(2)} onChange={(e) => edit(p.id, { run: Math.max(0, fromL(Number(e.target.value) || 0)) })} style={{ width: 70 }} aria-label="Horizontal run" />,
              <input key="p" type="number" min={0} max={24} value={p.rise} onChange={(e) => edit(p.id, { rise: Math.max(0, Number(e.target.value) || 0) })} style={{ width: 56 }} aria-label="Pitch" />,
              <span key="a" title={`pitch factor ${pitchFactor(p.rise)}`}>{fmt(A(r.design), 4)} {au}</span>,
              <span key="o" title={gpm(r.flow)}>{r.outlets}</span>,
              <b key="g" style={{ color: r.pick ? undefined : 'var(--err)' }}>{r.pick?.name ?? 'custom'}</b>,
              <Btn key="x" kind="ghost" onClick={() => set({ planes: s.planes.filter((x) => x.id !== p.id) })} title="Remove">✕</Btn>,
            ])}
          />
          <p className="muted">Horizontal run = plan distance from eave to ridge (not the sloped rafter length). Pitch factor: 1.00 up to 3/12, 1.05, 1.10, 1.20, 1.30 at 12/12.</p>
        </Panel>
        <Panel title="Gutter profile capacity">
          <Table
            head={['Profile', 'Cross-section', `Roof area per outlet (${au})`, 'Flow capacity', `Worst plane: ${fmt(A(worst), 4)} ${au}`]}
            rows={PROFILES.map((p) => {
              const cap = profileCapacity(p, s.slope, I)
              return [
                <b key="n">{p.name}</b>,
                `${fmt(s.metric ? crossSection(p) * 645.16 : crossSection(p), 4)} ${s.metric ? 'mm²' : 'in²'}`,
                fmt(A(cap), 4),
                gpm(flowGpm(cap, I)),
                <div key="b" style={{ minWidth: 130 }}>
                  <Bar value={worst} max={cap} color={worst > cap ? 'var(--err)' : 'var(--ok)'} />
                  <span className="muted">{fmt((worst / cap) * 100, 3)}% used</span>
                </div>,
              ]
            })}
          />
          <Note>
            Half-round capacities follow IPC Table 1106.6 (log-log interpolation; Manning d^8/3·√S scaling outside the table). K-style and box gutters use the half-round gutter with the same water cross-section. Gutter runs longer than 50 ft and level gutters lose capacity: add outlets.
          </Note>
        </Panel>
      </div>
    </Split>
  )
}
