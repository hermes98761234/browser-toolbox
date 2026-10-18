import { Btn, CopyButton, download, Note, num, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import {
  areaToAcres, CROPS, K_PRODUCTS, LB_AC_TO_KG_HA, limeProduct, N_PRODUCTS, NUTRIENTS, nutrientPlan, P_PRODUCTS, rate, RATINGS, smpLime, SQFT_PER_ACRE, sulfurNeed, TEXTURES, textureLime,
  type AreaUnit, type Rating, type Texture,
} from './lib/soil-test-calculator'

interface State {
  label: string; crop: string; texture: Texture; ph: number; buffer: number; om: number
  p: number; k: number; ca: number; mg: number; s: number; zn: number
  area: number; areaUnit: AreaUnit; rateUnit: 'lb1000' | 'lbac' | 'kgha' | 'gm2'
  cce: number; depth: number; pProd: string; kProd: string; nProd: string
}

const DEF: State = {
  label: 'Back garden, sample 1', crop: 'veg', texture: 'siltLoam', ph: 5.6, buffer: 6.7, om: 3.2,
  p: 18, k: 95, ca: 900, mg: 40, s: 8, zn: 1.4,
  area: 800, areaUnit: 'ft2', rateUnit: 'lb1000', cce: 90, depth: 7, pProd: 'tsp', kProd: 'mop', nProd: 'urea',
}

const RATE_UNITS = [['lb1000', 'lb / 1000 ft²'], ['lbac', 'lb / acre'], ['kgha', 'kg / ha'], ['gm2', 'g / m²']] as const
const RCOL: Record<Rating, string> = { 'Very low': '#dc2626', Low: '#f97316', Medium: '#eab308', Optimum: '#16a34a', High: '#6366f1' }

export default function SoilTestCalculator() {
  const [s, set, reset] = useToolState<State>('soil-test-calculator', DEF)
  const crop = CROPS.find((c) => c.id === s.crop) ?? CROPS[0]
  const target = crop.ph
  const acres = areaToAcres(Math.max(0, s.area), s.areaUnit)
  const metric = s.areaUnit === 'm2' || s.areaUnit === 'ha' || s.rateUnit === 'kgha' || s.rateUnit === 'gm2'

  // lb/acre → display rate unit
  const conv = (lbAc: number) => (s.rateUnit === 'lbac' ? lbAc : s.rateUnit === 'lb1000' ? lbAc / (SQFT_PER_ACRE / 1000) : s.rateUnit === 'kgha' ? lbAc * LB_AC_TO_KG_HA : (lbAc * LB_AC_TO_KG_HA) / 10)
  const rUnit = RATE_UNITS.find((u) => u[0] === s.rateUnit)![1]
  const total = (lbAc: number) => (metric ? `${num(lbAc * acres * 0.453592, lbAc * acres * 0.4536 < 10 ? 2 : 1)} kg` : `${num(lbAc * acres, lbAc * acres < 10 ? 2 : 1)} lb`)

  const ratings = Object.fromEntries(NUTRIENTS.map((n) => [n.id, rate(n, s[n.id])])) as Record<string, Rating>
  const pp = P_PRODUCTS.find((x) => x.id === s.pProd) ?? P_PRODUCTS[0]
  const kp = K_PRODUCTS.find((x) => x.id === s.kProd) ?? K_PRODUCTS[0]
  const np = N_PRODUCTS.find((x) => x.id === s.nProd) ?? N_PRODUCTS[0]
  const plan = nutrientPlan(crop, ratings.p, ratings.k, s.om, pp, kp, np)

  const raise = s.ph < target - 0.05
  const lower = s.ph > target + 0.3
  const useBuffer = s.buffer > 0 && s.texture !== 'organic'
  const caco3 = !raise ? 0 : useBuffer ? smpLime(s.buffer, target) : textureLime(s.ph, target, s.texture, s.om)
  const limeT = limeProduct(caco3, s.cce, s.depth) // tons/acre of product
  const limeLbAc = limeT * 2000
  const sulfur1000 = lower ? sulfurNeed(s.ph, target, s.texture) : 0
  const sulfurLbAc = sulfur1000 * (SQFT_PER_ACRE / 1000)
  const dolomitic = ratings.mg === 'Very low' || ratings.mg === 'Low'
  const maxLime1000 = 50 // lb/1000 ft² per application on established turf/beds
  const limeSplits = Math.max(1, Math.ceil(limeLbAc / (SQFT_PER_ACRE / 1000) / (crop.turf ? maxLime1000 : 150)))

  const rows: [string, number, string][] = [
    [`${dolomitic ? 'Dolomitic' : 'Calcitic'} limestone (CCE ${s.cce} %)`, limeLbAc, raise ? `CaCO₃ need ${num(caco3, 2)} t/ac via ${useBuffer ? 'SMP buffer pH' : 'texture estimate'}${limeSplits > 1 ? `; split into ${limeSplits} applications` : ''}` : 'pH already at or above target'],
    ['Elemental sulfur (90 %+)', sulfurLbAc, lower ? 'Apply in spring, re-test after 6–12 months; ≤ 5 lb/1000 ft² per application on turf' : 'Not needed'],
    [np.name, plan.nProd, `N need ${num(plan.n, 0)} lb/ac${plan.nFromP > 0 ? `, ${num(plan.nFromP, 0)} supplied by phosphate product` : ''}; split into 2–3 feedings`],
    [pp.name, plan.pProd, `P₂O₅ ${num(plan.p2o5, 0)} lb/ac (soil P ${ratings.p})`],
    [kp.name, plan.kProd, `K₂O ${num(plan.k2o, 0)} lb/ac (soil K ${ratings.k})`],
  ]

  const report = () => [
    `SOIL TEST REPORT — ${s.label}`,
    `Crop: ${crop.name} (target pH ${target})  ·  Texture: ${TEXTURES.find((t) => t[0] === s.texture)![1]}  ·  OM ${s.om} %`,
    `Area: ${s.area} ${s.areaUnit}`,
    '',
    `pH ${s.ph}${s.buffer ? `  buffer pH ${s.buffer}` : ''}`,
    ...NUTRIENTS.map((n) => `${n.name.padEnd(16)} ${String(s[n.id]).padStart(6)} ppm  ${ratings[n.id]}`),
    '',
    'RECOMMENDATIONS',
    ...rows.filter((r) => r[1] > 0).map((r) => `${r[0]}: ${num(conv(r[1]), 1)} ${rUnit}  (total ${total(r[1])})  — ${r[2]}`),
    '',
    'Approximate, generalised guidance (Mehlich-3 ppm). Follow your local lab or extension service where they differ.',
  ].join('\n')

  return (
    <Split>
      <div>
        <Panel title="Sample & crop" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label="Sample label" value={s.label} onChange={(label) => set({ label })} />
          <Row>
            <Select label="Crop / use" value={s.crop} onChange={(crop) => set({ crop })} options={CROPS.map((c) => [c.id, `${c.name} · pH ${c.ph}`] as const)} />
            <Select label="Soil texture" value={s.texture} onChange={(texture) => set({ texture })} options={TEXTURES} />
          </Row>
          <Row>
            <Num label="Area" value={s.area} onChange={(area) => set({ area })} min={0} />
            <Select label="Area unit" value={s.areaUnit} onChange={(areaUnit) => set({ areaUnit })} options={[['ft2', 'ft²'], ['m2', 'm²'], ['acre', 'acres'], ['ha', 'hectares']]} />
          </Row>
        </Panel>
        <Panel title="Lab results">
          <Row>
            <Num label="Soil pH (water)" value={s.ph} onChange={(ph) => set({ ph })} min={3} max={10} step={0.1} />
            <Num label="Buffer pH (SMP)" value={s.buffer} onChange={(buffer) => set({ buffer })} min={0} max={8} step={0.1} hint="0 if not reported" />
            <Num label="Organic matter" value={s.om} onChange={(om) => set({ om })} unit="%" min={0} max={80} step={0.1} />
          </Row>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 8px' }}>Nutrients as Mehlich-3 extractable ppm (mg/kg). For lb/acre results divide by 2.</p>
          <Row>
            {NUTRIENTS.map((n) => <Num key={n.id} label={n.name} value={s[n.id]} onChange={(v) => set({ [n.id]: v } as Partial<State>)} unit="ppm" min={0} />)}
          </Row>
        </Panel>
        <Panel title="Products">
          <Row>
            <Num label="Lime CCE" value={s.cce} onChange={(cce) => set({ cce })} unit="%" min={40} max={180} hint="Calcium carbonate equivalent on the bag" />
            <Num label="Mixing depth" value={s.depth} onChange={(depth) => set({ depth })} unit="in" min={1} max={12} hint="7 in tilled; ~3 in for lawns" />
          </Row>
          <Select label="Nitrogen source" value={s.nProd} onChange={(nProd) => set({ nProd })} options={N_PRODUCTS.map((p) => [p.id, p.name] as const)} />
          <Select label="Phosphate source" value={s.pProd} onChange={(pProd) => set({ pProd })} options={P_PRODUCTS.map((p) => [p.id, p.name] as const)} />
          <Select label="Potash source" value={s.kProd} onChange={(kProd) => set({ kProd })} options={K_PRODUCTS.map((p) => [p.id, p.name] as const)} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="pH" value={`${s.ph} → ${target}`} sub={raise ? 'needs lime' : lower ? 'needs sulfur' : 'in range'} tone={raise || lower ? 'bad' : 'good'} />
          <Stat label="Lime" value={raise ? `${num(conv(limeLbAc), 1)}` : '—'} sub={raise ? `${rUnit} · ${total(limeLbAc)} total` : 'not needed'} tone="accent" />
          <Stat label="N-P₂O₅-K₂O" value={`${num(conv(plan.n), 1)}-${num(conv(plan.p2o5), 1)}-${num(conv(plan.k2o), 1)}`} sub={rUnit} />
        </Stats>
        <Panel title="Sufficiency ratings">
          <PhBar ph={s.ph} target={target} />
          {NUTRIENTS.map((n) => {
            const r = ratings[n.id]
            const max = n.bounds[3] * 1.4
            return (
              <div key={n.id} style={{ margin: '10px 0' }}>
                <Row wrap={false}>
                  <b style={{ flex: 1 }}>{n.name}</b>
                  <span>{s[n.id]} ppm <b style={{ color: RCOL[r] }}>{r}</b></span>
                </Row>
                <div style={{ position: 'relative', height: 12, borderRadius: 6, overflow: 'hidden', display: 'flex' }}>
                  {[0, ...n.bounds].map((b, i) => <span key={i} style={{ width: `${(((i < 4 ? n.bounds[i] : max) - b) / max) * 100}%`, background: RCOL[RATINGS[i]], opacity: 0.35 }} />)}
                  <span style={{ position: 'absolute', left: `calc(${Math.min(100, (s[n.id] / max) * 100)}% - 2px)`, top: 0, bottom: 0, width: 4, background: 'var(--text, #111)', borderRadius: 2 }} />
                </div>
                {(r === 'Very low' || r === 'High') && <div className="muted" style={{ fontSize: 12 }}>{n.tip}</div>}
              </div>
            )
          })}
          <Row>{RATINGS.map((r) => <span key={r} style={{ fontSize: 12, display: 'inline-flex', gap: 4, alignItems: 'center' }}><i style={{ width: 12, height: 12, borderRadius: 3, background: RCOL[r], opacity: 0.6, display: 'inline-block' }} />{r}</span>)}</Row>
        </Panel>
        <Panel title="Recommendations" actions={<>
          <Seg value={s.rateUnit} onChange={(rateUnit) => set({ rateUnit })} options={RATE_UNITS} />
        </>}>
          <Table head={['Product', `Rate (${rUnit})`, `For ${num(s.area, 2)} ${s.areaUnit}`, 'Why']} rows={rows.map((r) => [<b key="n">{r[0]}</b>, r[1] > 0 ? num(conv(r[1]), 1) : '—', r[1] > 0 ? total(r[1]) : '—', <span key="w" className="muted" style={{ fontSize: 12, display: 'block', minWidth: 220, whiteSpace: 'normal' }}>{r[2]}</span>])} />
          {raise && dolomitic && <Note tone="info">Magnesium is {ratings.mg.toLowerCase()}, so dolomitic limestone (supplies Mg as well as Ca) is suggested.</Note>}
          {crop.id === 'blue' && s.ph > 5.5 && <Note tone="warn">Blueberries need pH 4.5–5.2. Acidify the whole bed a season before planting; sulfur works slowly in cold soil.</Note>}
          {ratings.p === 'High' && <Note tone="warn">Phosphorus is already high — skip P fertiliser (and manure-heavy composts) to protect water quality.</Note>}
          {crop.n === 0 && <Note tone="ok">{crop.name} fixes its own nitrogen; no N is recommended.</Note>}
          <Row>
            <CopyButton text={report} label="Copy report" />
            <Btn onClick={() => download(`soil-report-${s.label.replace(/\W+/g, '-').toLowerCase()}.txt`, report(), 'text/plain')}>⬇ Report .txt</Btn>
            <Btn kind="primary" onClick={() => {
              const w = window.open('', '_blank')
              if (!w) return
              const pre = w.document.createElement('pre')
              pre.textContent = report()
              pre.style.cssText = 'font:13px/1.5 ui-monospace,monospace;white-space:pre-wrap;padding:24px'
              w.document.title = 'Soil test report'
              w.document.body.appendChild(pre)
              w.print()
            }}>🖨 Print report</Btn>
          </Row>
        </Panel>
        <Note>
          Rates are approximate, generalised values (Mehlich-3 ppm, SMP buffer table fit, 7-inch layer) meant for planning. Lime more than ~50 lb/1000 ft² on lawns should be split between spring and autumn; re-test every 2–3 years.
        </Note>
      </div>
    </Split>
  )
}

function PhBar({ ph, target }: { ph: number; target: number }) {
  const x = (v: number) => `${((v - 4) / 5) * 100}%`
  return (
    <div style={{ marginBottom: 14 }}>
      <Row wrap={false}><b style={{ flex: 1 }}>Soil pH</b><span>{ph} (target {target})</span></Row>
      <div style={{ position: 'relative', height: 14, borderRadius: 7, background: 'linear-gradient(90deg,#ef4444,#f97316,#eab308,#22c55e,#14b8a6,#3b82f6,#6366f1)' }}>
        <span style={{ position: 'absolute', left: x(Math.min(9, Math.max(4, target))), top: -4, bottom: -4, width: 2, background: 'var(--text, #111)' }} title="target" />
        <span style={{ position: 'absolute', left: `calc(${x(Math.min(9, Math.max(4, ph)))} - 7px)`, top: -3, width: 14, height: 20, borderRadius: 7, background: '#fff', border: '2px solid #111' }} />
      </div>
      <Row wrap={false}>{[4, 5, 6, 7, 8, 9].map((v) => <span key={v} className="muted" style={{ flex: 1, fontSize: 11 }}>{v}{v === 4 ? ' acid' : v === 9 ? ' alkaline' : ''}</span>)}</Row>
    </div>
  )
}
