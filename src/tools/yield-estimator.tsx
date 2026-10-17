import { BarChart, Btn, CsvButton, fmt, money, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { buPerAc, CROPS, FT, gPerM2, LB, moistureAdjust, rowFor1000thAcre, sampleArea, summarize, tPerHa, type Crop } from './lib/yield-estimator'

interface Sample { id: string; units: number; comps: number[] }
type Sys = 'us' | 'metric'

const VAR = [1, 0.94, 1.07, 0.9, 1.03, 0.97]
function demo(c: Crop, sys: Sys): Sample[] {
  const base = c.id === 'corn' ? 30 : c.id === 'soy' ? 120 : c.id === 'sorghum' ? 85 : c.id === 'potato' ? 17 : c.sampling === 'area' ? (sys === 'us' ? (c.id === 'canola' ? 6 : 52) : c.id === 'canola' ? 60 : 560) : 30
  return VAR.map((v, i) => ({ id: uid(), units: Math.round(base * v), comps: c.comps.map(([n, d], k) => (/rows/.test(n) ? 2 * Math.round((d * VAR[(i + k + 2) % 6]) / 2) : Math.round(d * VAR[(i + k + 2) % 6] * 10) / 10)) }))
}
const crop0 = CROPS[0]
const DEF = {
  crop: crop0.id, sys: 'us' as Sys, spacing: 30, len: 17.42, quad: 1, partG: crop0.partG, moist: 18, adjust: false, loss: 3, field: 80, price: 4.3,
  samples: demo(crop0, 'us'),
}

export default function YieldEstimator() {
  const [s, set, reset] = useToolState('yield-estimator', DEF)
  const crop = CROPS.find((c) => c.id === s.crop) ?? crop0
  const us = s.sys === 'us'
  const spacingM = us ? s.spacing * 0.0254 : s.spacing / 100
  const lenM = us ? s.len * FT : s.len
  const quadM2 = us ? s.quad * FT * FT : s.quad
  const area = sampleArea(crop.sampling, lenM, spacingM, quadM2)
  const bushels = crop.lbPerBu > 0

  const pickCrop = (id: string) => {
    const c = CROPS.find((x) => x.id === id)!
    set({ crop: id, partG: c.partG, samples: demo(c, s.sys), spacing: c.sampling === 'row' ? (us ? (c.id === 'potato' ? 36 : 30) : c.id === 'potato' ? 90 : 76) : s.spacing, price: c.id === 'corn' ? 4.3 : c.id === 'soy' ? 10.2 : c.id === 'wheat' ? 5.6 : c.id === 'potato' ? 180 : 5 })
  }
  const pickSys = (sys: Sys) => {
    const toUS = sys === 'us'
    set({
      sys,
      spacing: Math.round((toUS ? s.spacing / 2.54 : s.spacing * 2.54) * 10) / 10,
      len: Math.round((toUS ? s.len / FT : s.len * FT) * 100) / 100,
      quad: Math.round((toUS ? s.quad / (FT * FT) : s.quad * FT * FT) * 100) / 100,
      field: Math.round((toUS ? s.field * 2.4710538 : s.field / 2.4710538) * 10) / 10,
    })
  }

  const per = s.samples.map((x) => {
    let g = gPerM2(x.units, x.comps, s.partG, area)
    if (s.adjust && crop.stdMoist) g = moistureAdjust(g, s.moist, crop.stdMoist)
    g *= 1 - s.loss / 100
    return { ...x, g, tha: tPerHa(g), bua: buPerAc(g, crop.lbPerBu) }
  })
  const val = (r: { tha: number; bua: number }) => (us && bushels ? r.bua : us ? r.tha / 2.2417 /* short tons/ac */ : r.tha)
  const unit = us ? (bushels ? 'bu/ac' : 'US tons/ac') : 't/ha'
  const sum = summarize(per.map(val))
  const fieldHa = us ? s.field / 2.4710538 : s.field
  const meanTha = summarize(per.map((r) => r.tha)).mean
  const totalT = meanTha * fieldHa
  const totalBu = bushels ? (totalT * 1000) / (crop.lbPerBu * LB) : NaN
  const revenue = us ? (bushels ? totalBu * s.price : (totalT / 0.90718474) * s.price) : totalT * s.price
  const edit = (id: string, patch: Partial<Sample>) => set({ samples: s.samples.map((x) => (x.id === id ? { ...x, ...patch } : x)) })
  const cell = (v: number, on: (n: number) => void, w = 64) => <input type="number" min={0} value={v} onChange={(e) => on(Math.max(0, Number(e.target.value) || 0))} style={{ width: w }} aria-label="count" />

  return (
    <div>
      <Stats>
        <Stat label="Estimated yield" value={`${fmt(sum.mean, 4)} ${unit}`} sub={`95 % CI ${fmt(sum.lo, 4)} – ${fmt(sum.hi, 4)}`} tone="accent" />
        <Stat label="Sample range" value={`${fmt(sum.min, 4)} – ${fmt(sum.max, 4)}`} sub={`CV ${fmt(sum.cv * 100, 3)} % · n = ${sum.n}`} tone={sum.cv > 0.2 ? 'bad' : undefined} />
        <Stat label="Field production" value={bushels && us ? `${fmt(totalBu, 6)} bu` : `${fmt(us ? totalT / 0.90718474 : totalT, 5)} ${us ? 'US tons' : 't'}`} sub={`${fmt(totalT, 5)} metric t on ${fmt(s.field, 5)} ${us ? 'ac' : 'ha'}`} />
        <Stat label="Gross value" value={money(revenue, '$', 0)} sub={`at ${money(s.price)} per ${us ? (bushels ? 'bu' : 'US ton') : 't'}`} tone="good" />
      </Stats>
      <Split>
        <div>
          <Panel title="Crop & sampling" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
            <Row>
              <Select label="Crop" value={s.crop} onChange={pickCrop} options={CROPS.map((c) => [c.id, c.name] as [string, string])} />
              <Select label="Units" value={s.sys} onChange={pickSys} options={[['us', 'US (ft, ac, bu)'], ['metric', 'Metric (m, ha, t)']]} />
            </Row>
            {crop.sampling === 'row' ? (
              <>
                <Row>
                  <Num label="Row spacing" value={s.spacing} min={1} unit={us ? 'in' : 'cm'} onChange={(spacing) => set({ spacing })} />
                  <Num label={`Row length counted (${crop.unit.toLowerCase()})`} value={s.len} min={0.1} unit={us ? 'ft' : 'm'} onChange={(len) => set({ len })} />
                </Row>
                {us && <Btn kind="ghost" onClick={() => set({ len: Math.round(rowFor1000thAcre(s.spacing) * 100) / 100 })}>Use 1/1000 acre ({fmt(rowFor1000thAcre(s.spacing), 4)} ft)</Btn>}
              </>
            ) : (
              <Num label={`Quadrat area (count all ${crop.unit.toLowerCase()} inside)`} value={s.quad} min={0.01} unit={us ? 'ft²' : 'm²'} onChange={(quad) => set({ quad })} />
            )}
            <p className="muted" style={{ fontSize: 12 }}>Sample area: {fmt(area, 4)} m² ({fmt(area / (FT * FT), 4)} ft²).</p>
            <Num label={crop.partLabel} value={s.partG} min={0.0001} step={0.001} unit="g" onChange={(partG) => set({ partG })} />
          </Panel>
          <Panel title="Adjustments">
            <Row>
              <Num label="Expected harvest loss" value={s.loss} min={0} max={50} unit="%" onChange={(loss) => set({ loss })} />
              <Num label={`Field area`} value={s.field} min={0} unit={us ? 'ac' : 'ha'} onChange={(field) => set({ field })} />
            </Row>
            {crop.stdMoist > 0 && (
              <Row>
                <Num label="Moisture of the weighed kernels" value={s.moist} min={0} max={60} unit="%" onChange={(moist) => set({ moist })} />
                <label className="k-check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={s.adjust} onChange={(e) => set({ adjust: e.target.checked })} /> Adjust to {crop.stdMoist} % standard</label>
              </Row>
            )}
            <Num label={`Price per ${us ? (bushels ? 'bushel' : 'US ton') : 'tonne'}`} value={s.price} min={0} unit="$" onChange={(price) => set({ price })} />
            <Note>Yield-component estimates are usually within ±15–20 % of the combine. Kernel weight is the biggest unknown before harvest — lower it in drought, raise it for a good grain fill.</Note>
          </Panel>
        </div>
        <div>
          <Panel
            title={`Field samples (${s.samples.length})`}
            actions={
              <>
                <Btn onClick={() => set({ samples: [...s.samples, { id: uid(), units: s.samples.at(-1)?.units ?? 0, comps: [...(s.samples.at(-1)?.comps ?? crop.comps.map((c) => c[1]))] }] })}>+ Sample</Btn>
                <CsvButton name={`${crop.id}-yield-samples.csv`} rows={() => [['Sample', crop.unit, ...crop.comps.map((c) => c[0]), 't/ha', 'bu/ac'], ...per.map((r, i) => [i + 1, r.units, ...r.comps, r.tha.toFixed(3), Number.isFinite(r.bua) ? r.bua.toFixed(1) : ''])]} />
              </>
            }
          >
            <Table
              head={['#', crop.unit, ...crop.comps.map((c) => c[0]), unit, '']}
              rows={per.map((r, i) => [
                i + 1,
                cell(r.units, (units) => edit(r.id, { units })),
                ...crop.comps.map((_, k) => cell(r.comps[k] ?? 0, (v) => edit(r.id, { comps: crop.comps.map((__, j) => (j === k ? v : r.comps[j] ?? 0)) }))),
                <b key="y" style={{ color: Math.abs(val(r) - sum.mean) > 2 * sum.sd && sum.n > 3 ? 'var(--warn)' : undefined }}>{fmt(val(r), 4)}</b>,
                <Btn key="x" kind="ghost" onClick={() => set({ samples: s.samples.filter((x) => x.id !== r.id) })} disabled={s.samples.length < 2} title="Remove">✕</Btn>,
              ])}
              foot={['Mean', fmt(summarize(per.map((r) => r.units)).mean, 4), ...crop.comps.map((_, k) => fmt(summarize(per.map((r) => r.comps[k] ?? 0)).mean, 4)), fmt(sum.mean, 4), '']}
            />
          </Panel>
          <Panel title={`Yield by sample (${unit})`}>
            <BarChart bars={per.map((r, i) => ({ label: `#${i + 1}`, value: val(r), color: val(r) >= sum.mean ? '#10b981' : '#f59e0b' }))} fy={(v) => fmt(v, 3)} height={200} />
            {sum.cv > 0.2 && <Note tone="warn">Samples vary a lot (CV {fmt(sum.cv * 100, 3)} %). Take more samples, or estimate zones of the field separately.</Note>}
            {sum.n < 5 && <Note tone="warn">Use at least 5 samples spread across the field (not on headlands or edges) for a reliable average.</Note>}
            <p className="muted" style={{ fontSize: 12 }}>
              Formula: yield (g/m²) = {crop.unit.toLowerCase()} per m² × {crop.comps.map((c) => c[0].toLowerCase()).join(' × ')} × {crop.lbPerBu ? 'kernel/seed' : 'tuber'} weight
              {crop.stdMoist ? ' × moisture factor' : ''} × (1 − loss). {bushels && `1 bu = ${crop.lbPerBu} lb.`}
            </p>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
