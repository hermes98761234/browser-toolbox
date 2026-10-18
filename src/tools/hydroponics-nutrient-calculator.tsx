import { Btn, Check, CopyButton, JsonButtons, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import {
  calibrate, CROPS, DOSE_UNITS, ecToPpm, elementalPpm, perLitre, phDose, PPM_SCALES, predictedEc, ROLE_ORDER, STAGES, strengthForEc, VOL_L,
  type DoseUnit, type Product, type Role, type Scale, type Stage, type VolUnit,
} from './lib/hydroponics-nutrient-calculator'

interface State {
  volume: number; volUnit: VolUnit; waterEc: number; scale: Scale
  crop: number; stage: Stage; mode: 'ec' | 'pct'; customEc: number; useCustom: boolean; pct: number
  products: Product[]
  targetPh: number; measuredPh: number; downRate: number; upRate: number
  calMl: number; calL: number; calDelta: number
}

const P = (name: string, role: Role, amount: number, unit: DoseUnit, per: number, perUnit: VolUnit, ec: number, n: number, p: number, k: number, liquid = true): Product =>
  ({ id: uid(), name, role, amount, unit, per, perUnit, ec, n, p, k, liquid, density: liquid ? 1.2 : 1, on: true })

const DEF: State = {
  volume: 40, volUnit: 'L', waterEc: 0.25, scale: '500',
  crop: 6, stage: 'veg', mode: 'ec', customEc: 1.6, useCustom: false, pct: 75,
  products: [
    P('Cal-Mag supplement', 'calmag', 2.5, 'ml', 1, 'gal', 0.2, 2, 0, 0),
    P('Grow A (example)', 'a', 7.5, 'ml', 1, 'gal', 0.85, 5, 0, 1),
    P('Grow B (example)', 'b', 7.5, 'ml', 1, 'gal', 0.85, 1, 4, 6),
    P('Silica (example)', 'silica', 1, 'ml', 1, 'gal', 0.03, 0, 0, 1),
  ],
  targetPh: 6.0, measuredPh: 6.6, downRate: 0.15, upRate: 0.2,
  calMl: 4, calL: 40, calDelta: 0.6,
}

const STEPS: Record<Role, string> = {
  silica: 'Add silica first to plain water and stir well; it raises pH, so never add it after the other nutrients.',
  calmag: 'Add Cal-Mag and stir for a minute.',
  a: 'Add Part A and stir thoroughly before anything else goes in.',
  b: 'Add Part B only after Part A is fully mixed. Never combine A and B concentrates directly; calcium and sulphate/phosphate precipitate.',
  base: 'Add the base nutrient and stir thoroughly.',
  bloom: 'Add bloom / PK booster and stir.',
  additive: 'Add other additives last and stir.',
}

export default function HydroponicsNutrientCalculator() {
  const [s, set, reset] = useToolState('hydroponics-nutrient-calculator', DEF)
  const litres = s.volume * VOL_L[s.volUnit]
  const crop = CROPS[s.crop] ?? CROPS[0]
  const stageF = STAGES[s.stage][0]
  const cropTarget = +(((crop.ec[0] + crop.ec[1]) / 2) * stageF).toFixed(2)
  const target = s.useCustom ? s.customEc : cropTarget
  const on = s.products.filter((p) => p.on)
  const strength = s.mode === 'ec' ? strengthForEc(target, s.waterEc, s.products) : s.pct / 100
  const ec = predictedEc(strength, s.waterEc, s.products)
  const ppm = (x: number) => Math.round(ecToPpm(x, s.scale))
  const edit = (id: string, p: Partial<Product>) => set({ products: s.products.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const ordered = [...on].sort((a, b) => ROLE_ORDER[a.role][0] - ROLE_ORDER[b.role][0])
  const doses = ordered.map((p) => ({ p, amt: perLitre(p) * litres * strength }))
  const npk = on.reduce((acc, p) => {
    const e = elementalPpm(p, strength)
    return { n: acc.n + e.n, p: acc.p + e.p, k: acc.k + e.k }
  }, { n: 0, p: 0, k: 0 })
  const dPh = s.targetPh - s.measuredPh
  const phMl = phDose(litres, dPh, dPh < 0 ? s.downRate : s.upRate)
  const calRate = calibrate(s.calMl, s.calL, s.calDelta)
  const over = strength > 1.25
  const fmtAmt = (x: number, u: DoseUnit) => `${x < 10 ? x.toFixed(2) : x.toFixed(1)} ${u}`

  const recipe = () => [
    `Reservoir ${s.volume} ${s.volUnit} · target EC ${target} mS/cm (${ppm(target)} ppm, ${s.scale} scale) · strength ${(strength * 100).toFixed(0)}% of label`,
    ...doses.map(({ p, amt }, i) => `${i + 1}. ${p.name}: ${fmtAmt(amt, p.unit)}`),
    `Then adjust pH to ${s.targetPh}.`,
  ].join('\n')

  return (
    <Split>
      <div>
        <Panel title="Reservoir & water">
          <Row>
            <Num label="Reservoir volume" value={s.volume} onChange={(volume) => set({ volume: Math.max(0, volume) })} min={0} />
            <Select label="Unit" value={s.volUnit} onChange={(volUnit) => set({ volUnit })} options={[['L', 'litres'], ['gal', 'US gallons']]} />
          </Row>
          <Row>
            <Num label="Source water EC" value={s.waterEc} onChange={(waterEc) => set({ waterEc: Math.max(0, waterEc) })} unit="mS/cm" min={0} step={0.05} hint={`${ppm(s.waterEc)} ppm. RO water ≈ 0.0, tap 0.1–0.6`} />
            <Select label="Your meter’s ppm scale" value={s.scale} onChange={(scale) => set({ scale })} options={Object.entries(PPM_SCALES).map(([k, v]) => [k as Scale, v.name] as [Scale, string])} />
          </Row>
        </Panel>
        <Panel title="Target">
          <Row>
            <Select label="Crop" value={s.crop} onChange={(crop) => set({ crop })} options={CROPS.map((c, i) => [i, `${c.name} · EC ${c.ec[0]}–${c.ec[1]}`] as [number, string])} />
            <Select label="Stage" value={s.stage} onChange={(stage) => set({ stage })} options={Object.entries(STAGES).map(([k, v]) => [k as Stage, v[1]] as [Stage, string])} />
          </Row>
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['ec', 'Dose to target EC'], ['pct', 'Fixed % of label']]} />
          {s.mode === 'ec' ? (
            <>
              <Check label="Use my own target EC" value={s.useCustom} onChange={(useCustom) => set({ useCustom })} />
              {s.useCustom ? (
                <Num label="Target EC" value={s.customEc} onChange={(customEc) => set({ customEc: Math.max(0, customEc) })} unit="mS/cm" step={0.1} min={0} />
              ) : (
                <p className="muted">Suggested for {crop.name.toLowerCase()} ({STAGES[s.stage][1].toLowerCase()}): <b>EC {cropTarget}</b> = {ppm(cropTarget)} ppm, pH {crop.ph[0]}–{crop.ph[1]}.</p>
              )}
            </>
          ) : (
            <Num label="Strength" value={s.pct} onChange={(pct) => set({ pct: Math.max(0, pct) })} unit="% of label" min={0} max={200} />
          )}
        </Panel>
        <Panel title="EC ↔ ppm scales">
          <Table
            head={['EC (mS/cm)', '500 scale', '640 scale', '700 scale']}
            rows={[0.5, 1, 1.5, 2, 2.5, 3].map((e) => [e.toFixed(1), Math.round(ecToPpm(e, '500')), Math.round(ecToPpm(e, '640')), Math.round(ecToPpm(e, '700'))])}
          />
          <p style={{ fontSize: 14 }}>
            Meters measure <b>electrical conductivity</b> and convert it to “ppm” with a fixed factor: ppm = EC (µS/cm) × 0.5, 0.64 or 0.7. The factor depends on which salt
            solution the scale assumes (sodium chloride, a mixed figure, or potassium chloride / “442” natural-water mix), so the same reservoir reads 800, 1024 or 1120 ppm.
            Always state EC, or ppm <i>with</i> its scale, when sharing recipes.
          </p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Label strength" value={Number.isFinite(strength) ? `${(strength * 100).toFixed(0)}%` : '—'} tone={over ? 'bad' : 'accent'} sub={over ? 'above label: check target' : 'of the label dose'} />
          <Stat label="Expected EC" value={Number.isFinite(ec) ? ec.toFixed(2) : '—'} sub={`${Number.isFinite(ec) ? ppm(ec) : '—'} ppm (${s.scale})`} />
          <Stat label="N · P · K" value={`${npk.n.toFixed(0)} · ${npk.p.toFixed(0)} · ${npk.k.toFixed(0)}`} sub="ppm elemental (from labels)" />
          <Stat label="Reservoir" value={`${litres.toFixed(1)} L`} sub={`${(litres / VOL_L.gal).toFixed(2)} US gal`} />
        </Stats>
        {!on.length && <Note tone="warn">Switch on at least one product.</Note>}
        {s.mode === 'ec' && on.length > 0 && target <= s.waterEc && <Note tone="warn">Your water EC is already at or above the target. Dilute with RO/rain water or raise the target.</Note>}
        <Panel title="Mixing order" actions={<CopyButton text={recipe} label="Copy recipe" />}>
          <ol style={{ paddingLeft: 20, margin: 0, lineHeight: 1.6 }}>
            <li>Fill the reservoir with about 90% of the water. Note its temperature (aim 18–22 °C) and starting EC.</li>
            {doses.map(({ p, amt }) => (
              <li key={p.id}>
                <b>{p.name}: {fmtAmt(amt, p.unit)}</b>{p.unit === 'ml' && amt >= 1000 ? ` (${(amt / 1000).toFixed(2)} L)` : ''}. {STEPS[p.role]}
              </li>
            ))}
            <li>Top up to {s.volume} {s.volUnit}, stir, wait 15 minutes, then measure EC. Expect about <b>{Number.isFinite(ec) ? ec.toFixed(2) : '—'} mS/cm</b>; correct with water or a little more nutrient.</li>
            <li>Adjust pH <b>last</b> (see below), because nutrients themselves shift pH.</li>
          </ol>
        </Panel>
        <Panel title="Products (from your labels)" actions={<Btn onClick={() => set({ products: [...s.products, P('New product', 'additive', 1, 'ml', 1, 'L', 0.1, 0, 0, 0)] })}>+ Product</Btn>}>
          {s.products.map((p) => (
            <div key={p.id} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10, marginBottom: 8, opacity: p.on ? 1 : 0.55 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="checkbox" checked={p.on} onChange={(e) => edit(p.id, { on: e.target.checked })} aria-label="Use product" />
                <input className="k-text" value={p.name} onChange={(e) => edit(p.id, { name: e.target.value })} aria-label="Name" style={{ flex: '1 1 160px', fontWeight: 600 }} />
                <select className="k-select" value={p.role} onChange={(e) => edit(p.id, { role: e.target.value as Role })} aria-label="Role" style={{ flex: '0 1 200px' }}>
                  {Object.entries(ROLE_ORDER).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <Btn kind="ghost" onClick={() => set({ products: s.products.filter((x) => x.id !== p.id) })} title="Remove">✕</Btn>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 8, fontSize: 13 }}>
                <span className="muted">Label:</span>
                <input type="number" min={0} value={p.amount} onChange={(e) => edit(p.id, { amount: Math.max(0, +e.target.value || 0) })} aria-label="Dose" style={{ width: 64 }} />
                <select value={p.unit} onChange={(e) => edit(p.id, { unit: e.target.value as DoseUnit, liquid: e.target.value !== 'g' })} aria-label="Dose unit">
                  {Object.keys(DOSE_UNITS).map((u) => <option key={u}>{u}</option>)}
                </select>
                <span className="muted">per</span>
                <input type="number" min={0} value={p.per} onChange={(e) => edit(p.id, { per: Math.max(0, +e.target.value || 0) })} aria-label="Per volume" style={{ width: 56 }} />
                <select value={p.perUnit} onChange={(e) => edit(p.id, { perUnit: e.target.value as VolUnit })} aria-label="Volume unit">
                  <option>L</option><option>gal</option>
                </select>
                <span className="muted" style={{ marginLeft: 8 }}>adds EC</span>
                <input type="number" min={0} step={0.05} value={p.ec} onChange={(e) => edit(p.id, { ec: Math.max(0, +e.target.value || 0) })} aria-label="EC contribution" style={{ width: 64 }} />
                <span className="muted" style={{ marginLeft: 8 }}>N-P-K %</span>
                {(['n', 'p', 'k'] as const).map((f) => (
                  <input key={f} type="number" min={0} max={60} value={p[f]} onChange={(e) => edit(p.id, { [f]: Math.max(0, +e.target.value || 0) })} aria-label={f.toUpperCase()} style={{ width: 50 }} />
                ))}
              </div>
            </div>
          ))}
          <Note>
            Sample rows are generic placeholders, not real product data. Copy your own label: dose, water volume and N-P₂O₅-K₂O. For <b>EC at label dose</b>, mix one label dose
            into 1 L of your water, measure, and subtract the water’s EC; this makes the target-EC scaling accurate for your products.
          </Note>
        </Panel>
        <Panel title="pH adjustment">
          <Row>
            <Num label="Measured pH after mixing" value={s.measuredPh} onChange={(measuredPh) => set({ measuredPh })} min={0} max={14} step={0.1} />
            <Num label="Target pH" value={s.targetPh} onChange={(targetPh) => set({ targetPh })} min={0} max={14} step={0.1} hint={`${crop.name}: ${crop.ph[0]}–${crop.ph[1]}`} />
          </Row>
          <Row>
            <Num label="pH Down rate" value={s.downRate} onChange={(downRate) => set({ downRate: Math.max(0, downRate) })} unit="ml/L per pH" min={0} step={0.01} />
            <Num label="pH Up rate" value={s.upRate} onChange={(upRate) => set({ upRate: Math.max(0, upRate) })} unit="ml/L per pH" min={0} step={0.01} />
          </Row>
          {Math.abs(dPh) < 0.1 ? (
            <Note tone="ok">pH is on target. No adjustment needed.</Note>
          ) : (
            <Note tone={dPh < 0 ? 'info' : 'warn'}>
              Estimated <b>{phMl.toFixed(1)} ml of pH {dPh < 0 ? 'Down' : 'Up'}</b> to move {s.measuredPh} → {s.targetPh}. Add about half ({(phMl / 2).toFixed(1)} ml), stir, wait
              10–15 min and re-measure; add the rest in small steps. Water with high alkalinity (hard tap water) needs more.
            </Note>
          )}
          <details>
            <summary>Calibrate the rate from your last adjustment</summary>
            <Row>
              <Num label="I added" value={s.calMl} onChange={(calMl) => set({ calMl })} unit="ml" min={0} />
              <Num label="to" value={s.calL} onChange={(calL) => set({ calL })} unit="L" min={0} />
              <Num label="and pH moved by" value={s.calDelta} onChange={(calDelta) => set({ calDelta })} min={0} step={0.1} />
            </Row>
            <Row>
              <span>Rate: <b>{Number.isFinite(calRate) ? calRate.toFixed(3) : '—'} ml/L per pH unit</b></span>
              <Btn disabled={!Number.isFinite(calRate)} onClick={() => set({ downRate: +calRate.toFixed(3) })}>Use for pH Down</Btn>
              <Btn disabled={!Number.isFinite(calRate)} onClick={() => set({ upRate: +calRate.toFixed(3) })}>Use for pH Up</Btn>
            </Row>
          </details>
          <ul style={{ paddingLeft: 18, fontSize: 14 }}>
            <li>Most hydroponic crops absorb nutrients best between pH 5.5 and 6.5; iron and manganese lock out above ~6.5, calcium and magnesium below ~5.5.</li>
            <li>pH drifts upward as plants feed. Check daily; a drift of 0.2–0.3 per day is normal.</li>
            <li>Never mix pH Up and pH Down together. Add adjusters to the diluted reservoir, not to concentrates. Wear gloves and eye protection.</li>
          </ul>
          <Row>
            <JsonButtons name="hydro-recipe.json" data={s} onLoad={(d) => set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
      </div>
    </Split>
  )
}
