import { useMemo } from 'react'
import { Bar, Btn, CsvButton, JsonButtons, Legend, Note, Num, Panel, pct, Row, Seg, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { analyze, capability, histogram, monteCarlo, predictedOut, summarize, type Dim, type Dist } from './lib/tolerance-stack-up-tool'

interface State {
  unit: string
  dims: Dim[]
  lsl: number
  usl: number
  n: string
  seed: number
}

const D = (name: string, dir: 1 | -1, nom: number, plus: number, minus: number, dist: Dist = 'normal'): Dim => ({ id: uid(), name, dir, nom, plus, minus, dist, sigmas: 3 })

const DEF: State = {
  unit: 'mm',
  lsl: 0.05,
  usl: 0.55,
  n: '50000',
  seed: 1,
  dims: [
    D('Housing bore depth', 1, 64, 0.1, 0.1),
    D('Bearing 1 width', -1, 16, 0.06, 0.06),
    D('Spacer', -1, 12, 0.03, 0.03, 'uniform'),
    D('Gear hub', -1, 18.5, 0.05, 0.05),
    D('Bearing 2 width', -1, 16, 0.06, 0.06),
    D('Retaining ring', -1, 1.2, 0, 0.06),
  ],
}

const fx = (v: number, d = 4) => (Number.isFinite(v) ? Number(v.toFixed(d)).toString() : '—')
const cell: React.CSSProperties = { width: 70 }

function Histogram({ xs, lo, hi, lsl, usl, wc, mean, sd }: { xs: Float64Array; lo: number; hi: number; lsl: number; usl: number; wc: [number, number]; mean: number; sd: number }) {
  const W = 640, H = 260, L = 40, R = 10, T = 14, B = 34, bins = 50
  const h = histogram(xs, lo, hi, bins)
  const maxC = Math.max(1, ...h)
  const sx = (v: number) => L + ((v - lo) / (hi - lo || 1)) * (W - L - R)
  const sy = (c: number) => H - B - (c / maxC) * (H - T - B)
  const bw = (W - L - R) / bins
  const binW = (hi - lo) / bins
  const curve = Array.from({ length: 121 }, (_, i) => {
    const x = lo + ((hi - lo) * i) / 120
    const c = (xs.length * binW * Math.exp(-0.5 * ((x - mean) / sd) ** 2)) / (sd * Math.sqrt(2 * Math.PI))
    return `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(c).toFixed(1)}`
  }).join('')
  const vline = (x: number, c: string, lab: string, dash?: string, dy = 10) =>
    x >= lo && x <= hi && (
      <g key={lab}>
        <line x1={sx(x)} x2={sx(x)} y1={T} y2={H - B} stroke={c} strokeWidth={2} strokeDasharray={dash} />
        <text x={sx(x) > W - 60 ? sx(x) - 3 : sx(x) + 3} y={T + dy} fontSize={11} fill={c} textAnchor={sx(x) > W - 60 ? 'end' : 'start'}>{lab}</text>
      </g>
    )
  const ticks = Array.from({ length: 6 }, (_, i) => lo + ((hi - lo) * i) / 5)
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 360, height: 'auto' }} role="img" aria-label="Monte Carlo histogram">
        {h.map((c, i) => {
          const x0 = lo + i * binW
          const bad = x0 + binW / 2 < lsl || x0 + binW / 2 > usl
          return <rect key={i} x={L + i * bw + 0.5} y={sy(c)} width={bw - 1} height={H - B - sy(c)} fill={bad ? '#ef4444' : '#6366f1'} opacity={0.8} />
        })}
        <path d={curve} fill="none" stroke="var(--fg)" strokeWidth={1.5} opacity={0.7} />
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--grid-strong)" />
        {ticks.map((t, i) => (
          <text key={t} x={sx(t)} y={H - B + 16} fontSize={11} textAnchor={i === 5 ? 'end' : i === 0 ? 'start' : 'middle'} fill="var(--chart-fg)">{fx(t, 3)}</text>
        ))}
        {vline(lsl, '#dc2626', 'LSL')}
        {vline(usl, '#dc2626', 'USL')}
        {vline(wc[0], '#d97706', 'WC min', '5 4', 26)}
        {vline(wc[1], '#d97706', 'WC max', '5 4', 26)}
      </svg>
      <Legend items={[['In spec', '#6366f1'], ['Out of spec', '#ef4444'], ['Normal fit', 'var(--fg)'], ['Worst-case limits', '#d97706']]} />
    </div>
  )
}

function Chain({ dims }: { dims: Dim[] }) {
  // Draws the loop as arrows: + to the right, − back to the left, ending at the gap (gap enlarged when tiny).
  const W = 640, rowH = 22, M = 70
  const ends = dims.reduce<number[]>((acc, d) => [...acc, (acc[acc.length - 1] ?? 0) + d.dir * d.nom], [])
  const gap = ends[ends.length - 1] ?? 0
  const lo = Math.min(0, ...ends), hi = Math.max(0, ...ends)
  const sx = (v: number) => M + ((v - lo) / (hi - lo || 1)) * (W - 2 * M)
  const H = dims.length * rowH + 44
  const gx0 = sx(Math.min(0, gap)), gx1 = Math.max(sx(Math.max(0, gap)), gx0 + 24)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', marginTop: 8 }} role="img" aria-label="Dimension chain">
      <defs>
        <marker id="tsa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0L10,5L0,10z" fill="context-stroke" />
        </marker>
      </defs>
      <line x1={sx(0)} x2={sx(0)} y1={4} y2={H - 6} stroke="var(--muted)" strokeDasharray="3 3" />
      {dims.map((d, i) => {
        const a = i ? ends[i - 1] : 0, b = ends[i]
        const y = 16 + i * rowH
        const c = d.dir > 0 ? '#10b981' : '#6366f1'
        const mid = Math.min(W - 60, Math.max(60, (sx(a) + sx(b)) / 2))
        return (
          <g key={d.id}>
            <line x1={sx(a)} x2={sx(b)} y1={y} y2={y} stroke={c} strokeWidth={2.5} markerEnd="url(#tsa)" />
            <text x={mid} y={y - 4} fontSize={11} textAnchor="middle" fill="var(--fg)">{d.dir > 0 ? '+' : '−'}{d.name} {d.nom}</text>
          </g>
        )
      })}
      <rect x={gx0} y={H - 22} width={gx1 - gx0} height={12} fill="#f59e0b" rx={3} />
      <text x={gx1 + 6} y={H - 12} fontSize={12} fontWeight={700} fill="#d97706">Gap = {fx(gap)}{gx1 - gx0 <= 24 ? ' (enlarged)' : ''}</text>
    </svg>
  )
}

export default function ToleranceStackUpTool() {
  const [s, set, reset] = useToolState('tolerance-stack-up-tool', DEF)
  const valid = s.dims.length > 0 && s.dims.every((d) => Number.isFinite(d.nom) && d.plus + d.minus >= 0)
  const a = useMemo(() => analyze(s.dims), [s.dims])
  const n = Math.min(500000, Math.max(1000, Number(s.n) || 50000))
  const xs = useMemo(() => monteCarlo(s.dims, n, s.seed), [s.dims, n, s.seed])
  const mc = useMemo(() => summarize(xs, s.lsl, s.usl), [xs, s.lsl, s.usl])
  const cap = capability(mc.mean, mc.sd, s.lsl, s.usl)
  const rssOut = predictedOut(a.mean, a.sigma, s.lsl, s.usl)
  const edit = (id: string, p: Partial<Dim>) => set({ dims: s.dims.map((d) => (d.id === id ? { ...d, ...p } : d)) })
  const inSpec = (lo: number, hi: number) => lo >= s.lsl && hi <= s.usl
  const u = s.unit
  const lo = Math.min(mc.min, a.wcMin, s.lsl), hi = Math.max(mc.max, a.wcMax, s.usl)
  const pad = (hi - lo) * 0.04
  const methods: [string, number, number, string][] = [
    ['Worst case (arithmetic)', a.wcMin, a.wcMax, '100 % interchangeability, no statistics'],
    ['RSS (±3σ per part)', a.mean - a.rssTol, a.mean + a.rssTol, '99.73 % if every part is centred normal at ±3σ'],
    ['Modified RSS (Bender 1.5×)', a.mean - a.mrssTol, a.mean + a.mrssTol, 'RSS inflated for mean shifts, capped at WC'],
    [`Monte Carlo ±3σ (n = ${n.toLocaleString()})`, mc.mean - 3 * mc.sd, mc.mean + 3 * mc.sd, 'Uses each part’s chosen distribution'],
  ]

  return (
    <Split wide="right">
      <div>
        <Panel title="Gap requirement">
          <Row>
            <Num label="Lower spec limit (LSL)" value={s.lsl} onChange={(lsl) => set({ lsl })} unit={u} />
            <Num label="Upper spec limit (USL)" value={s.usl} onChange={(usl) => set({ usl })} unit={u} />
          </Row>
          {s.usl <= s.lsl && <Note tone="err">USL must be greater than LSL.</Note>}
          <Seg label="Unit" value={s.unit} onChange={(unit) => set({ unit })} options={[['mm', 'mm'], ['in', 'in'], ['µm', 'µm']]} />
        </Panel>
        <Panel title="Monte Carlo">
          <Seg label="Samples" value={s.n} onChange={(v) => set({ n: v })} options={[['10000', '10k'], ['50000', '50k'], ['200000', '200k']]} />
          <Row>
            <Btn onClick={() => set({ seed: s.seed + 1 })}>↻ Re-run (seed {s.seed})</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Normal parts are sampled with σ = tolerance ÷ “σ per side” (3 → Cp 1.00, 4 → Cp 1.33). Uniform covers the whole band evenly (worst for tool wear / unknown process); triangular is in between.</p>
        </Panel>
        <Panel title="Contribution to variation">
          {s.dims.map((d, i) => (
            <div key={d.id} style={{ marginBottom: 8 }}>
              <Row wrap={false}>
                <span style={{ flex: 1 }}>{d.name}</span>
                <b>{pct(a.contrib[i]?.rss ?? 0, 0)}</b>
                <span className="muted" style={{ width: 70, textAlign: 'right' }}>WC {pct(a.contrib[i]?.wc ?? 0, 0)}</span>
              </Row>
              <Bar value={a.contrib[i]?.rss ?? 0} max={1} />
            </div>
          ))}
          <Note>Tighten the parts with the largest share of variance first — they move the statistical result most.</Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Nominal gap" value={`${fx(a.nominal)} ${u}`} sub={a.mean !== a.nominal ? `band centre ${fx(a.mean)}` : 'tolerances centred'} />
          <Stat label="Worst case" value={`${fx(a.wcMin, 3)} … ${fx(a.wcMax, 3)}`} sub={`±${fx(a.wcTol)} ${u}`} tone={inSpec(a.wcMin, a.wcMax) ? 'good' : 'bad'} />
          <Stat label="RSS" value={`${fx(a.mean - a.rssTol, 3)} … ${fx(a.mean + a.rssTol, 3)}`} sub={`±${fx(a.rssTol)} · ${(rssOut * 1e6).toFixed(0)} ppm out`} tone={inSpec(a.mean - a.rssTol, a.mean + a.rssTol) ? 'good' : 'bad'} />
          <Stat label="Monte Carlo reject" value={pct(mc.outFrac, 2)} sub={`Cpk ${cap.cpk.toFixed(2)} · Cp ${cap.cp.toFixed(2)}`} tone={mc.outFrac === 0 ? 'good' : mc.outFrac < 0.0027 ? 'accent' : 'bad'} />
        </Stats>
        {!valid && <Note tone="err">Check the table: every row needs a nominal and non-negative tolerance band.</Note>}
        <Panel
          title="Dimension chain"
          actions={
            <>
              <Btn onClick={() => set({ dims: [...s.dims, D('New part', -1, 10, 0.05, 0.05)] })}>+ Dimension</Btn>
              <CsvButton name="stack-up.csv" rows={() => [['Dimension', 'Direction', 'Nominal', '+Tol', '-Tol', 'Distribution', 'Var share'], ...s.dims.map((d, i) => [d.name, d.dir > 0 ? '+' : '-', d.nom, d.plus, d.minus, d.dist, (a.contrib[i]?.rss ?? 0).toFixed(4)]), [], ['Method', 'Min', 'Max'], ...methods.map((m) => [m[0], m[1].toFixed(5), m[2].toFixed(5)])]} />
              <JsonButtons name="stack-up.json" data={s} onLoad={(d) => set(d)} />
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          <Table
            head={['Dimension', 'Dir', 'Nominal', '+ Tol', '− Tol', 'Distribution', '']}
            rows={s.dims.map((d) => [
              <input key="n" value={d.name} onChange={(e) => edit(d.id, { name: e.target.value })} aria-label="Name" style={{ minWidth: 120 }} />,
              <button key="d" type="button" className="k-btn" style={{ minWidth: 36, color: d.dir > 0 ? '#10b981' : '#6366f1', fontWeight: 800 }} onClick={() => edit(d.id, { dir: d.dir > 0 ? -1 : 1 })} title="Toggle direction">
                {d.dir > 0 ? '+' : '−'}
              </button>,
              <input key="v" type="number" step="any" value={d.nom} onChange={(e) => edit(d.id, { nom: Number(e.target.value) })} style={cell} aria-label="Nominal" />,
              <input key="p" type="number" step="any" value={d.plus} onChange={(e) => edit(d.id, { plus: Number(e.target.value) })} style={cell} aria-label="Plus tolerance" />,
              <input key="m" type="number" step="any" min={0} value={d.minus} onChange={(e) => edit(d.id, { minus: Number(e.target.value) })} style={cell} aria-label="Minus tolerance" />,
              <select key="t" value={d.dist === 'normal' ? `n${d.sigmas}` : d.dist} onChange={(e) => { const v = e.target.value; edit(d.id, v.startsWith('n') ? { dist: 'normal', sigmas: Number(v.slice(1)) } : { dist: v as Dist }) }} aria-label="Distribution" style={{ minWidth: 120 }}>
                {[2, 3, 4, 5, 6].map((k) => <option key={k} value={`n${k}`}>Normal ±{k}σ</option>)}
                <option value="uniform">Uniform</option>
                <option value="triangular">Triangular</option>
              </select>,
              <Btn key="x" kind="ghost" onClick={() => set({ dims: s.dims.filter((x) => x.id !== d.id) })} title="Remove">✕</Btn>,
            ])}
          />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>“+” dimensions open the gap, “−” dimensions close it. Enter “− Tol” as a positive number (e.g. 50 +0.1 / −0.05). Unilateral bands shift the mean automatically.</p>
          <Chain dims={s.dims} />
        </Panel>
        <Panel title="Results by method">
          <Table
            head={['Method', `Min (${u})`, `Max (${u})`, 'Range', 'Fits spec?']}
            rows={methods.map(([m, lo2, hi2, why]) => [
              <span key="m">{m}<br /><span className="muted" style={{ fontSize: 12 }}>{why}</span></span>,
              fx(lo2), fx(hi2), fx(hi2 - lo2),
              inSpec(lo2, hi2) ? <b key="ok" style={{ color: 'var(--ok)' }}>✓ yes</b> : <b key="no" style={{ color: 'var(--err)' }}>✗ no</b>,
            ])}
          />
        </Panel>
        <Panel title={`Monte Carlo distribution of the gap — mean ${fx(mc.mean)}, σ ${fx(mc.sd, 5)} ${u}`}>
          {mc.sd > 0 ? <Histogram xs={xs} lo={lo - pad} hi={hi + pad} lsl={s.lsl} usl={s.usl} wc={[a.wcMin, a.wcMax]} mean={mc.mean} sd={mc.sd} /> : <Note>All tolerances are zero.</Note>}
          {!inSpec(a.wcMin, a.wcMax) && inSpec(a.mean - a.rssTol, a.mean + a.rssTol) && (
            <Note tone="warn">The stack fails worst case but passes statistically: expect about {Math.round(mc.outFrac * 1e6).toLocaleString()} rejects per million assemblies unless parts are selected or the tightest contributors are improved.</Note>
          )}
        </Panel>
      </div>
    </Split>
  )
}
