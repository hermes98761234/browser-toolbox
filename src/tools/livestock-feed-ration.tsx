import { useMemo } from 'react'
import { Bar, Btn, CsvButton, Donut, JsonButtons, money, Note, Num, Panel, pct, Row, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { costPerKgDM, formulate, type Feed, type Req } from './lib/livestock-feed-ration'

const F = (name: string, dm: number, tdn: number, cp: number, ca: number, p: number, ndf: number, cost: number, use = true, max = 100): Feed => ({ id: uid(), name, dm, tdn, cp, ca, p, ndf, cost, use, min: 0, max })

// Typical book values (DM basis). Replace with your own forage analysis when you have it.
const FEEDS: Feed[] = [
  F('Grass hay', 88, 55, 10, 0.5, 0.22, 64, 150),
  F('Alfalfa hay (mid bloom)', 89, 58, 19, 1.4, 0.24, 46, 220),
  F('Corn silage', 35, 70, 8.5, 0.28, 0.23, 45, 55),
  F('Wheat straw', 91, 43, 4, 0.18, 0.05, 80, 90, true, 15),
  F('Corn grain, cracked', 88, 88, 9.5, 0.03, 0.3, 10, 210),
  F('Barley grain', 89, 84, 12.5, 0.05, 0.38, 20, 230),
  F('Oats', 89, 77, 13, 0.1, 0.39, 32, 260),
  F('Distillers grains (DDGS)', 90, 88, 30, 0.05, 0.85, 38, 240, true, 25),
  F('Soybean meal 44%', 89, 84, 49.9, 0.4, 0.71, 15, 450),
  F('Limestone', 100, 0, 0, 38, 0, 0, 300, true, 2),
  F('Dicalcium phosphate', 100, 0, 0, 22, 19, 0, 900, true, 2),
]

type Preset = [string, Req]
const R = (dmi: number, tdn: number, cp: number, ca: number, p: number, ndfMin = 25, ndfMax = 70): Req => ({ dmi, tdn, cp, ca, p, ndfMin, ndfMax, caPMin: 1.2, caPMax: 7 })
const PRESETS: Preset[] = [
  ['Beef cow 545 kg · mid-gestation', R(10.9, 50, 7.5, 0.21, 0.17, 35)],
  ['Beef cow 545 kg · early lactation', R(12.5, 60, 10.5, 0.3, 0.21, 30)],
  ['Growing steer 270 kg · 1.1 kg/day gain', R(7.3, 68, 13, 0.48, 0.24, 20)],
  ['Finishing steer 500 kg', R(10.5, 78, 12, 0.4, 0.22, 12, 40)],
  ['Dairy cow 650 kg · 35 kg milk', R(23, 70, 16.5, 0.62, 0.36, 28, 40)],
  ['Ewe 70 kg · late gestation (twins)', R(2.1, 65, 11.5, 0.35, 0.23, 25)],
  ['Ewe 70 kg · lactating (twins)', R(2.6, 65, 15, 0.39, 0.29, 25)],
  ['Finishing lamb 30 kg', R(1.3, 72, 14, 0.5, 0.24, 15, 45)],
  ['Dairy doe 50 kg · lactating', R(2.2, 63, 13, 0.5, 0.32, 28)],
  ['Meat goat kid 25 kg · growing', R(0.9, 65, 14, 0.4, 0.25, 22)],
]

const DEF = { preset: 2, req: PRESETS[2][1], head: 40, days: 30, cur: '$', feeds: FEEDS }
type S = typeof DEF

const NUTS: [keyof Req, string, string][] = [['tdn', 'TDN (energy)', '%'], ['cp', 'Crude protein', '%'], ['ca', 'Calcium', '%'], ['p', 'Phosphorus', '%']]

function diagnose(feeds: Feed[], req: Req): string[] {
  const tries: [string, Req, boolean?][] = [
    ['energy (TDN)', { ...req, tdn: 0 }],
    ['protein', { ...req, cp: 0 }],
    ['calcium', { ...req, ca: 0 }],
    ['phosphorus', { ...req, p: 0 }],
    ['fibre limits', { ...req, ndfMin: 0, ndfMax: 100 }],
    ['Ca:P ratio', { ...req, caPMin: 0, caPMax: 1000 }],
    ['feed min/max limits', req, true],
  ]
  return tries.filter(([, r, lim]) => formulate(lim ? feeds.map((f) => ({ ...f, min: 0, max: 100 })) : feeds, r).status === 'optimal').map(([n]) => n)
}

export default function LivestockFeedRation() {
  const [s, set, reset] = useToolState('livestock-feed-ration', DEF)
  const r = useMemo(() => formulate(s.feeds, s.req), [s.feeds, s.req])
  const ok = r.status === 'optimal'
  const why = useMemo(() => (ok ? [] : diagnose(s.feeds, s.req)), [ok, s.feeds, s.req])
  const m = (x: number, d = 2) => money(x, s.cur, d)
  const editF = (id: string, p: Partial<Feed>) => set({ feeds: s.feeds.map((f) => (f.id === id ? { ...f, ...p } : f)) })
  const setReq = (p: Partial<Req>) => set({ req: { ...s.req, ...p } })
  const lines = r.feeds.map((f, i) => ({ f, dm: r.dm[i], af: r.asFed[i], cost: r.dm[i] * costPerKgDM(f) })).filter((l) => l.dm > 1e-6).sort((a, b) => b.dm - a.dm)
  const afTotal = lines.reduce((a, l) => a + l.af, 0)
  const cell = (f: Feed, k: keyof Feed, w = 64) => (
    <input type="number" value={f[k] as number} step="any" min={0} onChange={(e) => editF(f.id, { [k]: Math.max(0, Number(e.target.value) || 0) })} style={{ width: w }} aria-label={String(k)} />
  )

  return (
    <div>
      <style>{`@media print { body * { visibility: hidden !important } .ration-print, .ration-print * { visibility: visible !important } .ration-print { position: absolute; inset: 0 auto auto 0; width: 100% } }`}</style>
      <Split>
        <div>
          <Panel title="Animal & requirements">
            <Select label="Animal preset" value={s.preset} onChange={(i) => set({ preset: i, req: PRESETS[i][1] })} options={PRESETS.map(([n], i) => [i, n] as const)} />
            <Row>
              <Num label="Dry-matter intake" unit="kg/day" value={s.req.dmi} min={0.1} onChange={(dmi) => setReq({ dmi: Math.max(0.1, dmi) })} />
              <Num label="Head" value={s.head} min={1} step={1} onChange={(head) => set({ head: Math.max(1, Math.round(head)) })} />
              <Num label="Days" value={s.days} min={1} step={1} onChange={(days) => set({ days: Math.max(1, Math.round(days)) })} />
            </Row>
            <Row>
              {NUTS.map(([k, n, u]) => (
                <Num key={k} label={`${n} min`} unit={`${u} DM`} value={s.req[k]} min={0} onChange={(v) => setReq({ [k]: Math.max(0, v) })} />
              ))}
            </Row>
            <Row>
              <Num label="NDF min" unit="% DM" value={s.req.ndfMin} min={0} onChange={(ndfMin) => setReq({ ndfMin })} />
              <Num label="NDF max" unit="% DM" value={s.req.ndfMax} min={0} onChange={(ndfMax) => setReq({ ndfMax })} />
              <Num label="Ca:P from" value={s.req.caPMin} min={0} onChange={(caPMin) => setReq({ caPMin })} />
              <Num label="Ca:P to" value={s.req.caPMax} min={0} onChange={(caPMax) => setReq({ caPMax })} />
            </Row>
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', '₴', 'zł', 'A$', 'C$', '₹']} />
            <Note>Presets are typical NRC-style figures for average animals. Adjust for body condition, weather and breed, and confirm with a nutritionist.</Note>
          </Panel>
        </div>
        <div className="ration-print">
          <Stats>
            <Stat label="Cost / head / day" value={ok ? m(r.cost) : '—'} tone="accent" sub={ok ? `${m(r.cost / s.req.dmi)} per kg DM` : 'no feasible ration'} />
            <Stat label={`Herd · ${s.days} days`} value={ok ? m(r.cost * s.head * s.days, 0) : '—'} sub={`${s.head} head · ${m(r.cost * s.head)}/day`} />
            <Stat label="As fed / head" value={ok ? `${afTotal.toFixed(2)} kg` : '—'} sub={`${s.req.dmi} kg dry matter`} />
            <Stat label="Herd feed needed" value={ok ? `${((afTotal * s.head * s.days) / 1000).toFixed(2)} t` : '—'} sub="as fed, whole period" />
          </Stats>
          {!ok && (
            <Note tone="err">
              No ration meets every requirement with these feeds. {why.length ? <>It becomes feasible if you relax: <b>{why.join(', ')}</b>.</> : 'Enable more feeds (e.g. a protein meal or mineral) or loosen several limits.'}
            </Note>
          )}
          {ok && (
            <>
              <Panel title={`Least-cost ration · ${PRESETS[s.preset]?.[0] ?? 'custom'}`} actions={<Btn onClick={() => window.print()}>🖨 Print</Btn>}>
                <Table
                  head={['Feed', '% of DM', 'kg DM', 'kg as fed', `Herd/day`, 'Cost/day']}
                  rows={lines.map((l) => [l.f.name, pct(l.dm / s.req.dmi, 1), l.dm.toFixed(2), l.af.toFixed(2), `${(l.af * s.head).toFixed(1)} kg`, m(l.cost)])}
                  foot={['Total', '100%', s.req.dmi.toFixed(2), afTotal.toFixed(2), `${(afTotal * s.head).toFixed(1)} kg`, m(r.cost)]}
                />
                <Row>
                  <CsvButton name="ration.csv" rows={() => [['Feed', 'Percent DM', 'kg DM/head', 'kg as fed/head', 'kg as fed/herd/day', 'Cost/head/day'], ...lines.map((l) => [l.f.name, ((l.dm / s.req.dmi) * 100).toFixed(2), l.dm.toFixed(3), l.af.toFixed(3), (l.af * s.head).toFixed(2), l.cost.toFixed(3)])]} />
                </Row>
              </Panel>
              <Panel title="Supply vs requirement (DM basis)">
                {[...NUTS, ['ndf', 'NDF (fibre)', '%'] as const].map(([k, n]) => {
                  const need = k === 'ndf' ? s.req.ndfMin : (s.req[k as keyof Req] as number)
                  const got = r.supply[k as 'tdn']
                  return (
                    <div key={k} style={{ marginBottom: 8 }}>
                      <Row wrap={false}>
                        <span style={{ flex: 1 }}>{n}</span>
                        <span><b>{got.toFixed(k === 'ca' || k === 'p' ? 2 : 1)}%</b> <span className="muted">/ {k === 'ndf' ? `${s.req.ndfMin}–${s.req.ndfMax}` : `min ${need}`}%</span></span>
                      </Row>
                      <Bar value={got} max={Math.max(need * 1.6, got) || 1} color={got + 1e-6 >= need ? 'var(--ok)' : 'var(--err)'} />
                    </div>
                  )
                })}
                <p className="muted" style={{ fontSize: 13 }}>Ca:P ratio {r.caP.toFixed(2)} : 1 (target {s.req.caPMin}–{s.req.caPMax}). Nutrients that sit exactly on the line are the ones driving the cost.</p>
              </Panel>
              <Panel title="As-fed composition">
                <Donut slices={lines.map((l) => ({ label: l.f.name, value: l.af }))} fv={(v) => `${v.toFixed(2)} kg`} center={<span>{afTotal.toFixed(1)} kg</span>} />
              </Panel>
            </>
          )}
        </div>
      </Split>
      <Panel
        title="Feed library"
        actions={
          <>
            <Btn onClick={() => set({ feeds: [...s.feeds, F('Custom feed', 88, 70, 12, 0.3, 0.3, 30, 200)] })}>+ Feed</Btn>
            <JsonButtons name="feed-ration.json" data={s as S} onLoad={(d) => set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </>
        }
      >
        <Table
          head={['Use', 'Feed', 'DM %', 'TDN %', 'CP %', 'Ca %', 'P %', 'NDF %', `${s.cur}/t as fed`, `${s.cur}/kg DM`, 'Min %', 'Max %', '']}
          rows={s.feeds.map((f) => [
            <input key="u" type="checkbox" checked={f.use} onChange={(e) => editF(f.id, { use: e.target.checked })} aria-label="Use feed" />,
            <input key="n" value={f.name} onChange={(e) => editF(f.id, { name: e.target.value })} style={{ minWidth: 150 }} aria-label="Feed name" />,
            cell(f, 'dm', 56), cell(f, 'tdn', 56), cell(f, 'cp', 56), cell(f, 'ca', 56), cell(f, 'p', 56), cell(f, 'ndf', 56), cell(f, 'cost', 70),
            costPerKgDM(f).toFixed(3),
            cell(f, 'min', 52), cell(f, 'max', 52),
            <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ feeds: s.feeds.filter((x) => x.id !== f.id) })}>✕</Btn>,
          ])}
        />
        <p className="muted" style={{ fontSize: 13 }}>Nutrients are on a dry-matter basis; cost is per tonne as fed. Min/Max limit each feed's share of ration DM (e.g. cap straw or DDGS). Solved by linear programming (simplex).</p>
      </Panel>
    </div>
  )
}
