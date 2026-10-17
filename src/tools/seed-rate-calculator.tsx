import { Btn, CopyButton, LineChart, money, Note, Num, num, Panel, Row, Select, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'
import { HA_TO_AC, KGHA_TO_LBAC, M2_TO_FT2, seedRate } from './lib/seed-rate-calculator'

// [name, target plants/m², TSW g, germ %, survival %, row cm, bag kg]
const CROPS: [string, number, number, number, number, number, number][] = [
  ['Winter wheat', 250, 45, 95, 85, 15, 25],
  ['Spring barley', 300, 48, 95, 85, 12.5, 25],
  ['Oats', 300, 38, 92, 85, 15, 25],
  ['Winter rye', 250, 32, 92, 80, 15, 25],
  ['Oilseed rape / canola', 45, 4.5, 92, 60, 25, 10],
  ['Soybean', 40, 170, 90, 85, 45, 22.7],
  ['Maize / corn', 8, 300, 95, 92, 75, 25],
  ['Sunflower', 6, 60, 90, 85, 70, 10],
  ['Field peas', 80, 220, 90, 85, 15, 25],
  ['Perennial ryegrass', 600, 2, 85, 60, 0, 25],
  ['Alfalfa / lucerne', 200, 2.2, 85, 50, 0, 25],
]

const DEF = { crop: 'Winter wheat', plants: 250, tsw: 45, germ: 95, purity: 99, survival: 85, area: 12, bag: 25, margin: 3, row: 15, price: 38, imperial: false }

export default function SeedRateCalculator() {
  const [s, set, reset] = useToolState('seed-rate-calculator', DEF)
  const r = seedRate(s)
  const valid = s.plants > 0 && s.tsw > 0 && s.germ > 0 && s.germ <= 100 && s.purity > 0 && s.purity <= 100 && s.survival > 0 && s.survival <= 100
  const I = s.imperial
  const rate = (kgha: number) => (I ? `${num(kgha * KGHA_TO_LBAC, 1)} lb/ac` : `${num(kgha, 1)} kg/ha`)
  const curve = (key: 'germ' | 'survival') =>
    Array.from({ length: 13 }, (_, k) => 40 + k * 5).map((v) => [v, I ? seedRate({ ...s, [key]: v }).kgHa * KGHA_TO_LBAC : seedRate({ ...s, [key]: v }).kgHa] as [number, number])
  const pick = (name: string) => {
    const c = CROPS.find((x) => x[0] === name)
    if (c) set({ crop: c[0], plants: c[1], tsw: c[2], germ: c[3], survival: c[4], row: c[5], bag: c[6] })
  }
  const text = () =>
    `${s.crop}: target ${s.plants} plants/m², TSW ${s.tsw} g, germ ${s.germ}%, purity ${s.purity}%, establishment ${s.survival}%\n` +
    `→ ${num(r.seedsM2, 0)} seeds/m², ${rate(r.kgHa)}; ${num(r.totalKg, 0)} kg for ${s.area} ha (+${s.margin}%) = ${r.bags} × ${s.bag} kg bags`

  return (
    <Split>
      <div>
        <Panel title="Crop">
          <Select label="Preset" value={s.crop} onChange={pick} options={CROPS.map((c) => c[0])} />
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>Presets are typical starting values — use the TSW and germination from your own seed lot's label or test.</p>
        </Panel>
        <Panel title="Seed lot & target">
          <Num label="Target established plants" value={s.plants} onChange={(plants) => set({ plants })} unit="per m²" min={0} hint={`${num(s.plants * M2_TO_FT2, 1)} per ft²`} />
          <Num label="Thousand-seed weight (TSW)" value={s.tsw} onChange={(tsw) => set({ tsw })} unit="g" min={0} hint={`${num(1000 / s.tsw, 0)} seeds per g · ${num(453592 / s.tsw, 0)} seeds per lb`} />
          <Row>
            <Num label="Germination" value={s.germ} onChange={(germ) => set({ germ })} unit="%" min={1} max={100} />
            <Num label="Purity" value={s.purity} onChange={(purity) => set({ purity })} unit="%" min={1} max={100} />
          </Row>
          <Num label="Field establishment (survival)" value={s.survival} onChange={(survival) => set({ survival })} unit="%" min={1} max={100} hint="Lower for late sowing, cloddy or dry seedbeds, slugs" />
        </Panel>
        <Panel title="Field & bags">
          <Row>
            <Num label="Area" value={s.area} onChange={(area) => set({ area })} unit="ha" min={0} hint={`${num(s.area * HA_TO_AC, 1)} ac`} />
            <Num label="Row spacing" value={s.row} onChange={(row) => set({ row })} unit="cm" min={0} hint="0 = broadcast" />
          </Row>
          <Row>
            <Num label="Bag size" value={s.bag} onChange={(bag) => set({ bag })} unit="kg" min={0} />
            <Num label="Safety margin" value={s.margin} onChange={(margin) => set({ margin })} unit="%" min={0} />
            <Num label="Price per bag" value={s.price} onChange={(price) => set({ price })} min={0} />
          </Row>
        </Panel>
      </div>
      <div>
        <Row>
          <Seg value={I ? 'imp' : 'met'} onChange={(v) => set({ imperial: v === 'imp' })} options={[['met', 'kg/ha'], ['imp', 'lb/ac']]} />
          <CopyButton text={text} label="Copy summary" />
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </Row>
        {!valid ? (
          <Note tone="err">Percentages must be between 1 and 100, and plants and TSW must be positive.</Note>
        ) : (
          <>
            <Stats>
              <Stat label="Seeding rate" value={rate(r.kgHa)} tone="accent" sub={`${num(r.seedsM2, 0)} seeds/m²`} />
              <Stat label="Seed needed" value={`${num(I ? r.totalKg * 2.20462 : r.totalKg, 0)} ${I ? 'lb' : 'kg'}`} sub={`for ${s.area} ha incl. ${s.margin}% margin`} />
              <Stat label="Bags to buy" value={r.bags} sub={`${num(r.bagsExact, 2)} × ${s.bag} kg${s.price ? ` · cost ${money(r.bags * s.price, '', 0)}` : ''}`} />
              <Stat label="Pure live seed" value={`${num(r.pls * 100, 1)}%`} sub={`${num(r.pls * s.survival, 1)}% of seeds become plants`} />
            </Stats>
            <Panel title="How it's calculated">
              <Table
                head={['Step', 'Formula', 'Value']}
                rows={[
                  ['Seeds to sow', `${s.plants} ÷ (${s.germ}% × ${s.purity}% × ${s.survival}%)`, `${num(r.seedsM2, 1)} seeds/m²`],
                  ['Rate', `${num(r.seedsM2, 1)} × ${s.tsw} g ÷ 100`, <b key="r">{num(r.kgHa, 1)} kg/ha</b>],
                  ['Imperial', `${num(r.kgHa, 1)} × 0.892`, `${num(r.kgHa * KGHA_TO_LBAC, 1)} lb/ac`],
                  ['Seeds per hectare', `${num(r.seedsM2, 1)} × 10 000`, `${num(r.seedsHa / 1e6, 3)} million`],
                  ['Total seed', `${num(r.kgHa, 1)} × ${s.area} ha × ${1 + s.margin / 100}`, `${num(r.totalKg, 1)} kg`],
                  ['Bags', `${num(r.totalKg, 1)} ÷ ${s.bag} kg, rounded up`, `${r.bags} bags`],
                ]}
              />
            </Panel>
            {s.row > 0 && (
              <Panel title="Drill check">
                <Stats>
                  <Stat label="Seeds per metre of row" value={num(r.seedsPerM, 1)} sub={`${num(r.seedsPerM * 0.3048, 1)} per ft`} />
                  <Stat label="Seed spacing in row" value={`${num(r.spacingCm, 1)} cm`} sub={`${num(r.spacingCm / 2.54, 2)} in`} />
                  <Stat label="Rows per 10 m width" value={num(1000 / s.row, 0)} />
                </Stats>
                <Note>Calibrate the drill: collect seed from one row over a measured distance and weigh it — {num(r.seedsPerM * 10 * (s.tsw / 1000), 1)} g per 10 m of row at this rate.</Note>
              </Panel>
            )}
            <Panel title="Sensitivity: rate vs germination and establishment">
              <LineChart
                series={[
                  { name: 'Germination % varies', points: curve('germ') },
                  { name: 'Establishment % varies', points: curve('survival'), dashed: true },
                ]}
                xLabel="%"
                yLabel={I ? 'lb/ac' : 'kg/ha'}
                fy={(v) => num(v, 0)}
                fx={(v) => `${v}%`}
                markers={[{ x: s.germ, label: 'your germ' }]}
              />
              <p className="muted" style={{ fontSize: 13 }}>A 10-point drop in establishment raises the rate far more at low values — invest in seedbed quality before seed.</p>
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
