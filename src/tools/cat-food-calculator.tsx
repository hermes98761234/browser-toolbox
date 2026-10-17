import { Btn, Donut, money, Note, num, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { factorOf, idealWeight, portions, quarters, rer, STAGES, type Stage } from './lib/cat-food-calculator'

const BCS = ['', 'Emaciated', 'Very thin', 'Thin', 'Slightly lean', 'Ideal', 'Slightly heavy', 'Overweight', 'Obese', 'Severely obese']
const WET: [string, string, number][] = [['pate', 'Pâté (~100 kcal/100 g)', 100], ['gravy', 'Chunks in gravy (~80 kcal/100 g)', 80], ['kitten', 'Kitten wet (~115 kcal/100 g)', 115], ['custom', 'Custom', 0]]
const DRY: [string, string, number, number][] = [['adult', 'Adult dry (3700 kcal/kg, 390/cup)', 3700, 390], ['light', 'Light / indoor (3300 kcal/kg, 330/cup)', 3300, 330], ['kitten', 'Kitten dry (4100 kcal/kg, 450/cup)', 4100, 450], ['custom', 'Custom', 0, 0]]

const DEF = {
  name: 'Luna',
  units: 'kg' as 'kg' | 'lb',
  weight: 4.8,
  bcs: 6,
  stage: 'neutered' as Stage,
  useIdeal: true,
  treats: 10,
  wetShare: 60,
  wetPreset: 'pate',
  wetKcal: 100,
  canG: 85,
  dryPreset: 'adult',
  dryKg: 3700,
  dryCup: 390,
  meals: 3,
  canPrice: 1.2,
  dryPrice: 9,
}

export default function CatFoodCalculator() {
  const [s, set, reset] = useToolState('cat-food-calculator', DEF)
  const kg = s.units === 'kg' ? s.weight : s.weight * 0.45359237
  const W = (x: number) => (s.units === 'kg' ? `${num(x, 2)} kg` : `${num(x / 0.45359237, 1)} lb`)
  const ideal = idealWeight(kg, s.bcs)
  const stageNeedsIdeal = s.stage === 'loss' || s.stage === 'gain'
  const basisKg = s.useIdeal || stageNeedsIdeal ? ideal : kg
  const factor = factorOf(s.stage)
  const r = rer(basisKg)
  const der = r * factor
  const treatKcal = (der * s.treats) / 100
  const p = portions(der - treatKcal, s.wetShare / 100, s.wetKcal, s.canG, s.dryKg, s.dryCup)
  const valid = kg > 0.2 && kg < 15
  const kitten = s.stage === 'kitten' || s.stage === 'kitten-young'
  const water = der // ≈ 1 ml water per kcal
  const fromWet = p.wetGrams * 0.78
  const monthly = (p.cans * s.canPrice + (p.dryGrams / 1000) * s.dryPrice) * 30.4
  const weeklyLoss = kg * 0.01 // 1 % of body weight per week is a safe pace for cats
  const weeks = s.bcs > 5 ? Math.ceil((kg - ideal) / weeklyLoss) : 0

  return (
    <Split>
      <div>
        <Panel title="Your cat" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Txt label="Name" value={s.name} onChange={(name) => set({ name })} />
            <Num label="Weight" value={s.weight} onChange={(weight) => set({ weight })} unit={s.units} min={0.2} max={30} />
            <Seg value={s.units} onChange={(units) => set({ units, weight: +(units === 'kg' ? s.weight * 0.45359237 : s.weight / 0.45359237).toFixed(2) })} options={[['kg', 'kg'], ['lb', 'lb']]} label="Units" />
          </Row>
          <Select label="Life stage" value={s.stage} onChange={(stage) => set({ stage })} options={STAGES.map(([k, l, f]) => [k, `${l} · ${f}× RER`] as const)} />
          <Slider label="Body condition score" value={s.bcs} onChange={(bcs) => set({ bcs })} min={1} max={9} show={(v) => `${v}/9 · ${BCS[v]}`} />
          <div style={{ display: 'flex', gap: 2, margin: '-4px 0 10px' }}>
            {BCS.slice(1).map((b, i) => <span key={b} title={b} style={{ flex: 1, height: 6, borderRadius: 3, background: i + 1 === 5 ? '#10b981' : Math.abs(i + 1 - 5) <= 1 ? '#84cc16' : Math.abs(i + 1 - 5) <= 2 ? '#f59e0b' : '#ef4444', opacity: i + 1 === s.bcs ? 1 : 0.35 }} />)}
          </div>
          <label className="k-check"><input type="checkbox" checked={s.useIdeal || stageNeedsIdeal} disabled={stageNeedsIdeal} onChange={(e) => set({ useIdeal: e.target.checked })} /> Feed for ideal weight ({W(ideal)})</label>
          {!valid && <Note tone="err">Enter a weight between 0.2 and 15 kg.</Note>}
          {s.bcs >= 7 && !['loss'].includes(s.stage) && <Note tone="warn">{s.name || 'Your cat'} looks overweight. Consider “Weight loss” and talk to your vet before a diet.</Note>}
          {s.bcs <= 3 && <Note tone="warn">Underweight: rule out illness with a vet visit, then feed for ideal weight.</Note>}
        </Panel>
        <Panel title="Foods">
          <Select label="Wet food" value={s.wetPreset} onChange={(wetPreset) => { const w = WET.find((x) => x[0] === wetPreset)!; set(w[2] ? { wetPreset, wetKcal: w[2] } : { wetPreset }) }} options={WET.map(([k, l]) => [k, l] as const)} />
          <Row>
            <Num label="Energy" value={s.wetKcal} onChange={(wetKcal) => set({ wetKcal, wetPreset: 'custom' })} unit="kcal/100 g" min={30} max={250} />
            <Num label="Can / pouch size" value={s.canG} onChange={(canG) => set({ canG })} unit="g" min={20} max={1000} />
          </Row>
          <Select label="Dry food" value={s.dryPreset} onChange={(dryPreset) => { const d = DRY.find((x) => x[0] === dryPreset)!; set(d[2] ? { dryPreset, dryKg: d[2], dryCup: d[3] } : { dryPreset }) }} options={DRY.map(([k, l]) => [k, l] as const)} />
          <Row>
            <Num label="Energy" value={s.dryKg} onChange={(dryKg) => set({ dryKg, dryPreset: 'custom' })} unit="kcal/kg" min={2000} max={5500} />
            <Num label="Per cup" value={s.dryCup} onChange={(dryCup) => set({ dryCup, dryPreset: 'custom' })} unit="kcal/cup" min={150} max={700} />
          </Row>
          <Slider label="Wet food share (of food calories)" value={s.wetShare} onChange={(wetShare) => set({ wetShare })} min={0} max={100} step={5} unit="%" />
          <Row>
            <Slider label="Treats allowance" value={s.treats} onChange={(treats) => set({ treats })} min={0} max={15} unit="%" />
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>The energy values are on the label (“kcal/kg” or “ME”). Vets recommend keeping treats under 10 % of daily calories.</p>
        </Panel>
        <Panel title="Cost (optional)">
          <Row>
            <Num label="Price per can" value={s.canPrice} onChange={(canPrice) => set({ canPrice })} unit="$" min={0} />
            <Num label="Dry food price" value={s.dryPrice} onChange={(dryPrice) => set({ dryPrice })} unit="$/kg" min={0} />
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Daily energy" value={`${Math.round(der)} kcal`} tone="accent" sub={`RER ${Math.round(r)} × ${factor}`} />
          <Stat label="Wet food / day" value={`${quarters(p.cans)} can${p.cans > 1.1 ? 's' : ''}`} sub={`${Math.round(p.wetGrams)} g`} />
          <Stat label="Dry food / day" value={`${Math.round(p.dryGrams)} g`} sub={`≈ ${quarters(p.cups)} cup`} />
          <Stat label="Treats budget" value={`${Math.round(treatKcal)} kcal`} sub="per day" />
        </Stats>
        <Panel title={`${s.name || 'Your cat'}'s daily plan`} actions={<Seg value={String(s.meals)} onChange={(v) => set({ meals: Number(v) })} options={[['1', '1'], ['2', '2'], ['3', '3'], ['4', '4 meals']]} label="Meals" />}>
          <Row>
            <Donut
              slices={[{ label: 'Wet food', value: p.wetKcal, color: '#0ea5e9' }, { label: 'Dry food', value: p.dryKcal, color: '#f59e0b' }, { label: 'Treats', value: treatKcal, color: '#ec4899' }]}
              fv={(v) => `${Math.round(v)} kcal`}
              size={190}
              center={<span><b>{Math.round(der)}</b><br /><small className="muted">kcal</small></span>}
            />
            <div style={{ flex: 1, minWidth: 240 }}>
              <Table
                head={['', 'Wet', 'Dry']}
                rows={[
                  ['Per meal', `${Math.round(p.wetGrams / s.meals)} g (${quarters(p.cans / s.meals)} can)`, `${Math.round(p.dryGrams / s.meals)} g`],
                  ['Per day', `${Math.round(p.wetGrams)} g`, `${Math.round(p.dryGrams)} g · ${quarters(p.cups)} cup`],
                  ['Per week', `${Math.ceil(p.cans * 7)} cans`, `${num((p.dryGrams * 7) / 1000, 2)} kg`],
                  ['Per month', `${Math.ceil(p.cans * 30.4)} cans`, `${num((p.dryGrams * 30.4) / 1000, 2)} kg`],
                ]}
              />
              {monthly > 0 && <p style={{ margin: '8px 0 0' }}>≈ <b>{money(monthly)}</b> per month <span className="muted">({money(monthly / 30.4)}/day)</span></p>}
            </div>
          </Row>
          <Note>Weigh dry food with a kitchen scale: a “cup” varies by ±20 %. Split portions into {s.meals} meal{s.meals > 1 ? 's' : ''}; puzzle feeders help indoor cats stay active.</Note>
        </Panel>
        <Panel title="Hydration & weight">
          <Table
            head={['', 'Value', 'Note']}
            rows={[
              ['Water need', `≈ ${Math.round(water)} ml/day`, '≈ 1 ml per kcal'],
              ['From wet food', `≈ ${Math.round(fromWet)} ml`, 'wet food is ~78 % moisture'],
              ['From the bowl', `≈ ${Math.max(0, Math.round(water - fromWet))} ml`, s.wetShare < 50 ? 'more wet food helps urinary health' : 'nice, lots of moisture from food'],
              ['Ideal weight', W(ideal), `BCS ${s.bcs}/9`],
              ...(weeks > 0 ? [['Safe loss pace', `${W(weeklyLoss)}/week`, `≈ ${weeks} weeks to ideal`]] : []),
            ]}
          />
          {kitten && <Note tone="ok">Kittens grow fast: re-weigh every 2 weeks and recalculate. Feed kitten food until ~12 months.</Note>}
          <p className="muted" style={{ fontSize: 13 }}>RER = 70 × weight(kg)<sup>0.75</sup>, multiplied by a life-stage factor (WSAVA/AAHA guidelines). Individual needs vary ±20 %; adjust by body condition every few weeks. Never fast a cat: losing weight too fast risks hepatic lipidosis.</p>
        </Panel>
      </div>
    </Split>
  )
}
