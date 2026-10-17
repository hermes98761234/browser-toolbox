import { Btn, Check, CopyButton, CsvButton, LineChart, Note, Num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { chipLoad, drill, IN_MM, MATERIALS, mill, rpmFor } from './lib/feeds-and-speeds-calculator'

type Unit = 'imperial' | 'metric'
const DEF = {
  unit: 'imperial' as Unit,
  op: 'mill' as 'mill' | 'drill',
  mat: 0,
  tool: 'carbide' as 'hss' | 'carbide',
  d: 0.5,
  flutes: 3,
  ae: 0.2,
  ap: 0.3,
  sfmOv: 0,
  chipOv: 0,
  thinning: true,
  maxRpm: 10000,
  maxFeed: 200,
  hp: 3,
  eff: 0.8,
}

const SIZES_IN = [0.125, 0.1875, 0.25, 0.375, 0.5, 0.625, 0.75, 1]
const SIZES_MM = [3, 4, 6, 8, 10, 12, 16, 20, 25]

export default function FeedsAndSpeedsCalculator() {
  const [s, set, reset] = useToolState('feeds-and-speeds-calculator', DEF)
  const M = s.unit === 'metric'
  const m = MATERIALS[Math.min(s.mat, MATERIALS.length - 1)]
  // lengths are stored in inches; speeds in ft/min; power in hp
  const L = (x: number) => (M ? Math.round(x * IN_MM * 1000) / 1000 : Math.round(x * 10000) / 10000)
  const fromL = (v: number) => (M ? v / IN_MM : v)
  const lu = M ? 'mm' : 'in'
  const fu = M ? 'mm/min' : 'in/min'
  const sfmRec = m.sfm[s.tool]
  const sfm = s.sfmOv || sfmRec
  const clRec = chipLoad(m, s.d) * (s.tool === 'hss' ? 0.8 : 1)
  const chip = s.chipOv || clRec
  const maxFeedIn = M ? s.maxFeed / IN_MM : s.maxFeed

  const r = mill({ d: s.d, flutes: s.flutes, sfm, chip, ae: Math.min(s.ae, s.d), ap: s.ap, maxRpm: s.maxRpm, maxFeed: maxFeedIn, kp: m.kp, efficiency: s.eff, thinning: s.thinning })
  const dr = drill(m, s.d, sfm * 0.75, s.maxRpm, s.chipOv ? chip : undefined)
  const hpLimit = M ? s.hp / 0.7457 : s.hp
  const fmtFeed = (ipm: number) => (M ? `${Math.round(ipm * IN_MM)} mm/min` : `${ipm.toFixed(1)} in/min`)
  const fmtChip = (x: number) => (M ? `${(x * IN_MM).toFixed(4)} mm` : `${x.toFixed(4)} in`)
  const fmtPow = (hp: number) => (M ? `${(hp * 0.7457).toFixed(2)} kW` : `${hp.toFixed(2)} hp`)
  const fmtMrr = (x: number) => (M ? `${(x * 16.387).toFixed(1)} cm³/min` : `${x.toFixed(2)} in³/min`)
  const fmtSpeed = (x: number) => (M ? `${Math.round(x * 0.3048)} m/min` : `${Math.round(x)} SFM`)
  const load = (s.op === 'mill' ? r.hpMotor : dr.hp / s.eff) / (hpLimit || 1)

  const warns: [string, 'warn' | 'err'][] = []
  if (s.op === 'mill') {
    if (r.rpmCapped) warns.push([`Spindle capped at ${s.maxRpm} RPM: surface speed drops to ${fmtSpeed(r.sfm)}. Feed is scaled to keep chip load.`, 'warn'])
    if (r.feedCapped) warns.push([`Feed limited to ${fmtFeed(maxFeedIn)}: chip load falls to ${fmtChip(r.fz)} and may rub.`, 'warn'])
    if (s.ap > 3 * s.d) warns.push(['Axial depth over 3 × D: expect deflection and chatter; use a long-reach strategy.', 'warn'])
    if (s.ae > s.d) warns.push(['Radial width cannot exceed the tool diameter (capped at 100 %).', 'err'])
    if (r.fz < 0.0004) warns.push(['Chip load below ~0.0004 in (0.01 mm): the edge rubs instead of cutting, causing heat and wear.', 'warn'])
  }
  if (load > 1) warns.push([`Needs ${pct(load, 0)} of spindle power. Reduce depth or width of cut.`, 'err'])

  // power vs axial depth chart
  const pts: [number, number][] = []
  for (let i = 0; i <= 40; i++) {
    const ap = (i / 40) * 2 * s.d
    const x = mill({ d: s.d, flutes: s.flutes, sfm, chip, ae: Math.min(s.ae, s.d), ap, maxRpm: s.maxRpm, maxFeed: maxFeedIn, kp: m.kp, efficiency: s.eff, thinning: s.thinning })
    pts.push([M ? ap * IN_MM : ap, M ? x.hpMotor * 0.7457 : x.hpMotor])
  }
  const maxAp = r.hpMotor > 0 ? (s.ap * hpLimit) / r.hpMotor : Infinity

  const sizes = M ? SIZES_MM.map((x) => x / IN_MM) : SIZES_IN
  const quick = sizes.map((d) => {
    const cl = s.chipOv ? chip : chipLoad(m, d) * (s.tool === 'hss' ? 0.8 : 1)
    const x = mill({ d, flutes: s.flutes, sfm, chip: cl, ae: d * 0.4, ap: d, maxRpm: s.maxRpm, maxFeed: maxFeedIn, kp: m.kp, efficiency: s.eff, thinning: s.thinning })
    return { d, x, cl }
  })

  const summary = s.op === 'mill'
    ? `${m.name}, ${L(s.d)} ${lu} ${s.flutes}-flute ${s.tool}: ${Math.round(r.rpm)} RPM, ${fmtFeed(r.feed)}, ${fmtChip(r.fz)}/tooth, DOC ${L(s.ap)} ${lu}, WOC ${L(s.ae)} ${lu}`
    : `${m.name}, ${L(s.d)} ${lu} drill: ${Math.round(dr.rpm)} RPM, ${fmtFeed(dr.feed)}`

  return (
    <Split wide="right">
      <div>
        <Panel title="Setup" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Seg value={s.op} onChange={(op) => set({ op, chipOv: 0 })} options={[['mill', 'End milling'], ['drill', 'Drilling']]} label="Operation" />
            <Seg value={s.unit} onChange={(unit) => set({ unit, maxFeed: unit === s.unit ? s.maxFeed : unit === 'metric' ? Math.round(s.maxFeed * IN_MM) : Math.round(s.maxFeed / IN_MM), hp: unit === s.unit ? s.hp : unit === 'metric' ? Math.round(s.hp * 0.7457 * 10) / 10 : Math.round((s.hp / 0.7457) * 10) / 10 })} options={[['imperial', 'inch'], ['metric', 'mm']]} label="Units" />
          </Row>
          <Row>
            <Select label="Material" value={s.mat} onChange={(mat) => set({ mat, sfmOv: 0, chipOv: 0 })} options={MATERIALS.map((x, i) => [i, x.name] as const)} />
            <Select label="Tool" value={s.tool} onChange={(tool) => set({ tool, sfmOv: 0, chipOv: 0 })} options={[['carbide', 'Carbide'], ['hss', 'HSS / cobalt']]} />
          </Row>
          <Row>
            <Num label="Tool diameter" value={L(s.d)} onChange={(v) => set({ d: Math.max(0.001, fromL(v)), chipOv: 0 })} unit={lu} min={0} />
            {s.op === 'mill' && <Num label="Flutes" value={s.flutes} onChange={(flutes) => set({ flutes: Math.max(1, Math.round(flutes)) })} min={1} max={12} step={1} />}
          </Row>
          {s.op === 'mill' && (
            <Row>
              <Num label="Width of cut (ae)" value={L(s.ae)} onChange={(v) => set({ ae: fromL(v) })} unit={lu} min={0} hint={`${pct(Math.min(s.ae, s.d) / s.d, 0)} stepover`} />
              <Num label="Depth of cut (ap)" value={L(s.ap)} onChange={(v) => set({ ap: fromL(v) })} unit={lu} min={0} hint={`${(s.ap / s.d).toFixed(2)} × D`} />
            </Row>
          )}
        </Panel>
        <Panel title="Cutting data">
          <Row>
            <Num label={M ? 'Cutting speed Vc' : 'Surface speed'} value={M ? Math.round(sfm * 0.3048) : Math.round(sfm)} onChange={(v) => set({ sfmOv: M ? v / 0.3048 : v })} unit={M ? 'm/min' : 'SFM'} min={1} hint={`Recommended ${fmtSpeed(sfmRec)}${s.op === 'drill' ? ' (drills run at 75 %)' : ''}`} />
            <Num label={s.op === 'mill' ? 'Chip load / tooth' : 'Feed / rev'} value={s.op === 'drill' && !s.chipOv ? L(dr.ipr) : L(chip)} onChange={(v) => set({ chipOv: fromL(v) })} unit={lu} min={0} hint={s.op === 'mill' ? `Recommended ${fmtChip(clRec)}` : `Recommended ${fmtChip(m.drill * s.d)}`} />
          </Row>
          {(s.sfmOv > 0 || s.chipOv > 0) && <Btn kind="ghost" onClick={() => set({ sfmOv: 0, chipOv: 0 })}>↺ Back to recommended</Btn>}
          {s.op === 'mill' && <Check label="Compensate radial chip thinning (stepover < 50 %)" value={s.thinning} onChange={(thinning) => set({ thinning })} />}
        </Panel>
        <Panel title="Machine limits">
          <Row>
            <Num label="Max spindle speed" value={s.maxRpm} onChange={(maxRpm) => set({ maxRpm })} unit="RPM" min={0} />
            <Num label="Max feed" value={s.maxFeed} onChange={(maxFeed) => set({ maxFeed })} unit={fu} min={0} />
          </Row>
          <Row>
            <Num label="Spindle power" value={s.hp} onChange={(hp) => set({ hp })} unit={M ? 'kW' : 'hp'} min={0} />
            <Num label="Drive efficiency" value={s.eff} onChange={(eff) => set({ eff: Math.min(1, Math.max(0.1, eff)) })} min={0.1} max={1} step={0.05} />
          </Row>
        </Panel>
      </div>

      <div>
        {s.op === 'mill' ? (
          <Stats>
            <Stat label="Spindle speed" value={`${Math.round(r.rpm).toLocaleString('en-US')} RPM`} tone="accent" sub={`${fmtSpeed(r.sfm)}${r.rpmCapped ? ' (capped)' : ''}`} />
            <Stat label="Feed rate" value={fmtFeed(r.feed)} tone="accent" sub={`${fmtChip(r.fz)} / tooth programmed${r.rctf > 1.001 ? ` (×${r.rctf.toFixed(2)} thinning)` : ''}`} />
            <Stat label="Material removal" value={fmtMrr(r.mrr)} sub={`plunge ≈ ${fmtFeed(r.feed * 0.3)}`} />
            <Stat label="Power" value={fmtPow(r.hpMotor)} tone={load > 1 ? 'bad' : load > 0.8 ? undefined : 'good'} sub={`${pct(load, 0)} of spindle · torque ${M ? `${(r.torque * 0.113).toFixed(2)} N·m` : `${r.torque.toFixed(1)} in·lb`}`} />
          </Stats>
        ) : (
          <Stats>
            <Stat label="Spindle speed" value={`${Math.round(dr.rpm).toLocaleString('en-US')} RPM`} tone="accent" sub={fmtSpeed((dr.rpm * Math.PI * s.d) / 12)} />
            <Stat label="Feed rate" value={fmtFeed(dr.feed)} tone="accent" sub={`${fmtChip(dr.ipr)} / rev`} />
            <Stat label="Material removal" value={fmtMrr(dr.mrr)} />
            <Stat label="Power" value={fmtPow(dr.hp / s.eff)} tone={load > 1 ? 'bad' : 'good'} sub={`${pct(load, 0)} of spindle`} />
          </Stats>
        )}
        {warns.map(([w, t], i) => <Note key={i} tone={t}>{w}</Note>)}
        {s.op === 'drill' && <Note>Peck when deeper than 3 × D. {dr.thrustNote} Spot-drill first for accuracy.</Note>}
        <Panel title="Summary" actions={<CopyButton text={summary} label="Copy" />}>
          <p className="mono" style={{ margin: 0, fontSize: 13 }}>{summary}</p>
        </Panel>
        {s.op === 'mill' && (
          <Panel title="Power vs depth of cut">
            <LineChart
              series={[
                { name: 'Motor power', points: pts, area: true },
                { name: 'Spindle limit', points: [[pts[0][0], M ? hpLimit * 0.7457 : hpLimit], [pts[pts.length - 1][0], M ? hpLimit * 0.7457 : hpLimit]], dashed: true, color: 'var(--err)' },
              ]}
              xLabel={`Axial depth (${lu})`}
              yLabel={M ? 'kW' : 'hp'}
              fx={(v) => v.toFixed(M ? 1 : 3)}
              fy={(v) => v.toFixed(2)}
              markers={[{ x: M ? s.ap * IN_MM : s.ap, label: 'current' }]}
            />
            <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
              At this width and feed, the spindle allows about {Number.isFinite(maxAp) ? `${L(maxAp)} ${lu}` : '—'} of depth ({Number.isFinite(maxAp) ? (maxAp / s.d).toFixed(1) : '—'} × D) before running out of power.
            </p>
          </Panel>
        )}
        <Panel
          title={`Quick chart · ${m.name} · ${s.flutes}-flute ${s.tool}`}
          actions={<CsvButton name="feeds-speeds.csv" rows={() => [[`Diameter (${lu})`, 'RPM', `Chip load (${lu})`, `Feed (${fu})`], ...quick.map((q) => [L(q.d), Math.round(q.x.rpm), L(q.cl), Math.round(M ? q.x.feed * IN_MM : q.x.feed * 10) / (M ? 1 : 10)])]} />}
        >
          <Table
            head={['Diameter', 'RPM', 'Chip load', 'Feed', `Power (ap=D, ae=40%)`]}
            rows={quick.map((q) => [M ? `${L(q.d)} mm` : `${q.d}″`, Math.round(q.x.rpm).toLocaleString('en-US') + (q.x.rpmCapped ? ' ⚠' : ''), fmtChip(q.cl), fmtFeed(q.x.feed), fmtPow(q.x.hpMotor)])}
          />
          <Note>
            Starting values for rigid machines with good workholding. Recommended surface speeds and chip loads are typical catalogue mid-points; ⚠ marks sizes limited by max RPM (RPM = 12·SFM ÷ πD = {Math.round(rpmFor(sfm, 0.5))} at ½″).
          </Note>
        </Panel>
      </div>
    </Split>
  )
}
