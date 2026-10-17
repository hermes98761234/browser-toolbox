import { useMemo } from 'react'
import { Btn, CsvButton, JsonButtons, LineChart, Note, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, num, today, uid, useToolState, type Series } from '../kit'
import { ageDays, bmi, classify, DAYS_PER_MONTH, lms, normCdf, normInv, valueAt, zScore, type Indicator, type Sex } from './lib/growth-percentile-chart'

interface M { id: string; date: string; kg: number | null; cm: number | null; hc: number | null }
interface State { name: string; sex: Sex; birth: string; units: 'metric' | 'imperial'; ind: Indicator; set: 'who' | 'seven'; range: 'auto' | '2' | '5'; rows: M[] }

const LB = 2.20462, IN = 2.54
const IND: [Indicator, string][] = [['wfa', 'Weight'], ['lhfa', 'Length / height'], ['bfa', 'BMI'], ['hcfa', 'Head circ.']]
const SETS = { who: [3, 15, 50, 85, 97], seven: [3, 10, 25, 50, 75, 90, 97] }

function sample(): State {
  const birth = new Date(Date.now() - 20 * 30.44 * 86_400_000).toISOString().slice(0, 10)
  const d = (m: number) => new Date(Date.parse(birth) + Math.round(m * 30.44) * 86_400_000).toISOString().slice(0, 10)
  const r = (m: number, kg: number, cm: number, hc: number): M => ({ id: uid(), date: d(m), kg, cm, hc })
  return {
    name: 'Mia', sex: 'f', birth, units: 'metric', ind: 'wfa', set: 'who', range: 'auto',
    rows: [r(0, 3.3, 49.5, 34.0), r(1, 4.3, 54.0, 36.8), r(2, 5.3, 57.6, 38.6), r(4, 6.6, 62.8, 40.8), r(6, 7.4, 66.0, 42.2),
      r(9, 8.1, 70.3, 43.6), r(12, 8.8, 74.5, 44.8), r(15, 9.4, 77.8, 45.5), r(18, 9.9, 80.9, 46.1)],
  }
}
const DEF = sample()

const valueOf = (ind: Indicator, m: M): number | null =>
  ind === 'wfa' ? m.kg : ind === 'lhfa' ? m.cm : ind === 'hcfa' ? m.hc : m.kg && m.cm ? bmi(m.kg, m.cm) : null
const ageText = (days: number) => {
  const mo = (days + 1) / DAYS_PER_MONTH // +1 day so a visit on the monthly birthday counts as a full month
  if (mo < 3) return `${Math.floor(days / 7)} wk ${days % 7} d`
  const y = Math.floor(mo / 12)
  return y ? `${y} y ${Math.floor(mo % 12)} mo` : `${Math.floor(mo)} mo`
}
const pctText = (z: number) => {
  const p = normCdf(z) * 100
  return p < 0.1 ? '<0.1' : p > 99.9 ? '>99.9' : p < 1 || p > 99 ? p.toFixed(1) : Math.round(p).toString()
}

export default function GrowthPercentileChart() {
  const [s, set, reset] = useToolState('growth-percentile-chart', DEF)
  const imp = s.units === 'imperial'
  const unit = s.ind === 'wfa' ? (imp ? 'lb' : 'kg') : s.ind === 'bfa' ? 'kg/m²' : imp ? 'in' : 'cm'
  const conv = (ind: Indicator, v: number) => (!imp || ind === 'bfa' ? v : ind === 'wfa' ? v * LB : v / IN)

  const rows = useMemo(() => [...s.rows].sort((a, b) => a.date.localeCompare(b.date)).map((m) => {
    const days = ageDays(s.birth, m.date)
    const res = Object.fromEntries(IND.map(([ind]) => {
      const v = valueOf(ind, m)
      const p = lms(ind, s.sex, days)
      return [ind, v && p ? { v, z: zScore(ind, v, p) } : null]
    })) as Record<Indicator, { v: number; z: number } | null>
    return { m, days, res }
  }), [s.rows, s.birth, s.sex])

  const maxAge = Math.max(0, ...rows.map((r) => r.days)) / DAYS_PER_MONTH
  const xMax = s.range === '2' ? 24 : s.range === '5' ? 60 : Math.min(60, Math.max(12, Math.ceil((maxAge + 3) / 6) * 6))
  const series: Series[] = useMemo(() => {
    const ms: number[] = []
    for (let m = 0; m <= xMax + 1e-9; m += 0.25) ms.push(m)
    if ((s.ind === 'lhfa' || s.ind === 'bfa') && xMax > 24) ms.splice(ms.indexOf(24), 0, 23.999)
    const pcts = SETS[s.set]
    const curves: Series[] = pcts.map((p) => ({
      name: `P${p}`,
      color: p === 50 ? '#10b981' : p <= 3 || p >= 97 ? '#ef4444' : p <= 15 || p >= 85 ? '#f59e0b' : '#94a3b8',
      dashed: p !== 50,
      points: ms.map((m) => {
        const days = m === 23.999 ? 730 : m * DAYS_PER_MONTH
        const q = lms(s.ind, s.sex, Math.min(1826, days))!
        return [m, conv(s.ind, valueAt(q, normInv(p / 100)))] as [number, number]
      }),
    }))
    const child = rows.filter((r) => r.res[s.ind] && r.days >= 0 && r.days <= xMax * DAYS_PER_MONTH)
      .map((r) => [r.days / DAYS_PER_MONTH, conv(s.ind, r.res[s.ind]!.v)] as [number, number])
    return [...curves, { name: s.name || 'Child', color: s.sex === 'f' ? '#ec4899' : '#3b82f6', points: child }]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.ind, s.sex, s.set, xMax, rows, imp, s.name])

  const last = rows[rows.length - 1]
  const prev = rows[rows.length - 2]
  const edit = (id: string, p: Partial<M>) => set({ rows: s.rows.map((r) => (r.id === id ? { ...r, ...p } : r)) })
  const numIn = (m: M, key: 'kg' | 'cm' | 'hc', ind: Indicator) => (
    <input type="number" step="any" min={0} style={{ width: 76 }} aria-label={key}
      value={m[key] === null ? '' : Number(conv(ind, m[key]!).toFixed(2))}
      onChange={(e) => {
        const v = e.target.value === '' ? null : Number(e.target.value)
        edit(m.id, { [key]: v === null || !Number.isFinite(v) || v <= 0 ? null : imp ? (key === 'kg' ? v / LB : v * IN) : v })
      }} />
  )
  const bad = rows.filter((r) => r.days < 0 || r.days > 1826)
  const lastZ = (ind: Indicator) => last?.res[ind]

  return (
    <div>
      <Stats>
        <Stat label="Age at last visit" value={last ? ageText(last.days) : '—'} sub={last?.m.date} />
        {IND.map(([ind, n]) => {
          const r = lastZ(ind)
          return <Stat key={ind} label={n} value={r ? `P${pctText(r.z)}` : '—'} tone={r ? (classify(ind, r.z).tone === 'ok' ? 'good' : 'bad') : undefined}
            sub={r ? `${num(conv(ind, r.v), ind === 'bfa' ? 1 : 2)} ${ind === 'wfa' ? (imp ? 'lb' : 'kg') : ind === 'bfa' ? 'kg/m²' : imp ? 'in' : 'cm'} · z ${r.z >= 0 ? '+' : ''}${r.z.toFixed(2)}` : undefined} />
        })}
      </Stats>
      <Split wide="right">
        <div>
          <Panel title="Child" actions={<Btn kind="ghost" onClick={reset}>Sample</Btn>}>
            <Txt label="Name" value={s.name} onChange={(name) => set({ name })} />
            <Row>
              <Seg value={s.sex} onChange={(sex) => set({ sex })} options={[['f', '♀ Girl'], ['m', '♂ Boy']]} />
              <Seg value={s.units} onChange={(units) => set({ units })} options={[['metric', 'kg / cm'], ['imperial', 'lb / in']]} />
            </Row>
            <Txt label="Date of birth" type="date" value={s.birth} onChange={(birth) => set({ birth })} />
          </Panel>
          <Panel title="Chart options">
            <Seg value={s.set} onChange={(v) => set({ set: v })} options={[['who', 'WHO: 3·15·50·85·97'], ['seven', '3·10·25·50·75·90·97']]} />
            <Seg value={s.range} onChange={(range) => set({ range })} options={[['auto', 'Auto range'], ['2', '0–2 years'], ['5', '0–5 years']]} />
          </Panel>
          {last && prev && (
            <Panel title="Since previous visit">
              <Table head={['', 'Change', 'Rate']} rows={[
                ['Weight', `${num(conv('wfa', (last.m.kg ?? 0) - (prev.m.kg ?? 0)), 2)} ${imp ? 'lb' : 'kg'}`, `${num((((last.m.kg ?? 0) - (prev.m.kg ?? 0)) * 1000) / Math.max(1, last.days - prev.days), 0)} g/day`],
                ['Length', `${num(conv('lhfa', (last.m.cm ?? 0) - (prev.m.cm ?? 0)), 1)} ${imp ? 'in' : 'cm'}`, `${num(conv('lhfa', (((last.m.cm ?? 0) - (prev.m.cm ?? 0)) / Math.max(1, last.days - prev.days)) * DAYS_PER_MONTH), 2)} ${imp ? 'in' : 'cm'}/mo`],
                ['Weight percentile', `${last.res.wfa && prev.res.wfa ? (last.res.wfa.z - prev.res.wfa.z >= 0 ? '+' : '') + (last.res.wfa.z - prev.res.wfa.z).toFixed(2) + ' SD' : '—'}`, ''],
              ]} />
              {last.res.wfa && prev.res.wfa && Math.abs(last.res.wfa.z - prev.res.wfa.z) > 1.34 && (
                <Note tone="warn">Weight crossed two major percentile lines since the last visit. Worth discussing with your paediatrician.</Note>
              )}
            </Panel>
          )}
        </div>
        <div>
          <Panel title={`${IND.find((i) => i[0] === s.ind)![1]}-for-age · ${s.sex === 'f' ? 'girls' : 'boys'} (WHO)`}>
            <Seg value={s.ind} onChange={(ind) => set({ ind })} options={IND} />
            <LineChart series={series} height={340} xLabel="Age (months)" yLabel={unit} xMin={0} xMax={xMax} fx={(v) => num(v, 1)} fy={(v) => num(v, 1)}
              yMin={Math.floor(Math.min(...series.flatMap((x) => x.points.map((p) => p[1]))))} />
          </Panel>
          <Panel title="Measurements" actions={<>
            <Btn onClick={() => set({ rows: [...s.rows, { id: uid(), date: today(), kg: null, cm: null, hc: null }] })}>+ Measurement</Btn>
            <CsvButton name="growth.csv" rows={() => [['Date', 'Age days', 'Weight kg', 'Length cm', 'Head cm', 'BMI', ...IND.map(([, n]) => `${n} percentile`)],
              ...rows.map((r) => [r.m.date, r.days, r.m.kg ?? '', r.m.cm ?? '', r.m.hc ?? '', r.res.bfa ? r.res.bfa.v.toFixed(2) : '', ...IND.map(([i]) => (r.res[i] ? pctText(r.res[i]!.z) : ''))])]} />
            <JsonButtons name="growth.json" data={s} onLoad={(d) => set(d)} />
          </>}>
            {bad.length > 0 && <Note tone="warn">{bad.length} measurement(s) fall outside 0–5 years from the birth date and are not plotted.</Note>}
            <Table head={['Date', 'Age', `Weight (${imp ? 'lb' : 'kg'})`, `Length (${imp ? 'in' : 'cm'})`, `Head (${imp ? 'in' : 'cm'})`, `${IND.find((i) => i[0] === s.ind)![1]} pct`, '']}
              rows={rows.map((r) => {
                const z = r.res[s.ind]?.z
                const c = z !== undefined ? classify(s.ind, z) : null
                return [
                  <input key="d" type="date" value={r.m.date} onChange={(e) => edit(r.m.id, { date: e.target.value })} aria-label="Date" />,
                  ageText(Math.max(0, r.days)),
                  numIn(r.m, 'kg', 'wfa'), numIn(r.m, 'cm', 'lhfa'), numIn(r.m, 'hc', 'hcfa'),
                  c && z !== undefined ? <span key="p" style={{ color: c.tone === 'ok' ? 'var(--ok)' : c.tone === 'warn' ? 'var(--warn)' : 'var(--err)', fontWeight: 700 }} title={c.label}>P{pctText(z)} <span className="muted" style={{ fontWeight: 400 }}>{c.tone !== 'ok' ? c.label : ''}</span></span> : '—',
                  <Btn key="x" kind="ghost" onClick={() => set({ rows: s.rows.filter((x) => x.id !== r.m.id) })} title="Remove">✕</Btn>,
                ]
              })} />
          </Panel>
          <Note>
            Reference: WHO Child Growth Standards (2006), LMS method: z = ((x/M)^L − 1)/(L·S), percentile = Φ(z). Length is recumbent before 24 months and standing height after,
            so expect a ~0.7 cm step at 2 years. This chart is informational and doesn't replace assessment by a health professional.
          </Note>
        </div>
      </Split>
    </div>
  )
}
