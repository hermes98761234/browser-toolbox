import { useMemo, useState } from 'react'
import { Area, Btn, Check, CsvButton, download, FileDrop, fmt, niceTicks, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, toCsv, useToolState } from '../kit'
import { detect, loadCsv, sampleCsv, toNum, type ColStats, type Method } from './lib/outlier-detector'

const DEF = { csv: sampleCsv(), method: 'iqr' as Method, thr: 3, k: 1.5, off: [] as string[], onlyFlagged: true }

function BoxPlot({ st, values, out }: { st: ColStats; values: number[]; out: (x: number) => boolean }) {
  const W = 900, H = 74, L = 8, R = 8
  const lo = Math.min(st.min, st.lo), hi = Math.max(st.max, st.hi)
  const ticks = niceTicks(lo, hi, 6)
  const a = Math.min(lo, ticks[0]), b = Math.max(hi, ticks[ticks.length - 1])
  const X = (v: number) => L + ((v - a) / (b - a || 1)) * (W - L - R)
  const inl = values.filter((v) => !out(v))
  const wLo = Math.min(...inl), wHi = Math.max(...inl)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {ticks.map((t) => (
        <g key={t}><line x1={X(t)} x2={X(t)} y1={6} y2={52} stroke="var(--line)" /><text x={X(t)} y={66} fontSize={10} textAnchor="middle" fill="var(--muted)">{fmt(t, 4)}</text></g>
      ))}
      <line x1={X(st.lo)} x2={X(st.lo)} y1={8} y2={50} stroke="var(--warn)" strokeDasharray="3 3" />
      <line x1={X(st.hi)} x2={X(st.hi)} y1={8} y2={50} stroke="var(--warn)" strokeDasharray="3 3" />
      <line x1={X(wLo)} x2={X(st.q1)} y1={29} y2={29} stroke="currentColor" />
      <line x1={X(st.q3)} x2={X(wHi)} y1={29} y2={29} stroke="currentColor" />
      <line x1={X(wLo)} x2={X(wLo)} y1={22} y2={36} stroke="currentColor" />
      <line x1={X(wHi)} x2={X(wHi)} y1={22} y2={36} stroke="currentColor" />
      <rect x={X(st.q1)} y={16} width={Math.max(1, X(st.q3) - X(st.q1))} height={26} fill="var(--accent)" fillOpacity={0.22} stroke="var(--accent)" rx={3} />
      <line x1={X(st.median)} x2={X(st.median)} y1={16} y2={42} stroke="var(--accent)" strokeWidth={2.5} />
      <path d={`M${X(st.mean)},25 l4,4 l-4,4 l-4,-4z`} fill="var(--ok)" />
      {values.map((v, i) => out(v) && <circle key={i} cx={X(v)} cy={29} r={4.5} fill="var(--err)" fillOpacity={0.85}><title>{v}</title></circle>)}
    </svg>
  )
}

export default function OutlierDetector() {
  const [s, set, reset] = useToolState('outlier-detector', DEF)
  const [err, setErr] = useState('')
  const ds = useMemo(() => loadCsv(s.csv), [s.csv])
  const cols = useMemo(() => ds.numeric.filter((c) => !s.off.includes(ds.head[c])), [ds, s.off])
  const { stats, flags } = useMemo(() => detect(ds, cols, s.method, s.thr, s.k), [ds, cols, s.method, s.thr, s.k])
  const flagged = new Map<number, Set<number>>()
  flags.forEach((f) => { if (!flagged.has(f.row)) flagged.set(f.row, new Set()); flagged.get(f.row)!.add(f.col) })
  const reasons = (ri: number) => flags.filter((f) => f.row === ri).map((f) => `${ds.head[f.col]} ${f.reason}`).join('; ')
  const showRows = ds.rows.map((r, i) => [r, i] as const).filter(([, i]) => !s.onlyFlagged || flagged.has(i))
  const methodNote = {
    iqr: `Tukey fences: values below Q1 − ${s.k}·IQR or above Q3 + ${s.k}·IQR. Robust, makes no normality assumption.`,
    z: `Standard score |x − mean| / SD > ${s.thr}. Assumes roughly normal data; big outliers inflate the SD and can mask each other.`,
    mad: `Modified z-score 0.6745·|x − median| / MAD > ${s.thr} (Iglewicz & Hoaglin recommend 3.5). Robust to masking.`,
  }[s.method]

  return (
    <div>
      <Split>
        <Panel title="Data" actions={<><Btn onClick={() => set({ csv: sampleCsv(), off: [] })}>Sample</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <FileDrop accept=".csv,.tsv,.txt" onFiles={async ([f]) => {
            if (f.size > 20e6) { setErr('File is larger than 20 MB.'); return }
            setErr(''); set({ csv: await f.text(), off: [] })
          }} label="Drop a CSV / TSV file or click to choose" />
          <Area value={s.csv} onChange={(csv) => set({ csv })} rows={7} mono />
          {err && <Note tone="err">{err}</Note>}
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>{ds.rows.length} rows · {ds.head.length} columns · {ds.numeric.length} numeric (delimiter auto-detected; first row is the header)</p>
        </Panel>
        <Panel title="Method">
          <Seg value={s.method} onChange={(method) => set({ method, thr: method === 'mad' ? 3.5 : 3 })} options={[['iqr', 'IQR fences'], ['z', 'Z-score'], ['mad', 'Modified Z (MAD)']]} />
          <div style={{ marginTop: 10 }}>
            {s.method === 'iqr'
              ? <Slider label="Fence multiplier k" value={s.k} onChange={(k) => set({ k })} min={0.5} max={4} step={0.1} show={(v) => v.toFixed(1) + (v === 1.5 ? ' (mild)' : v === 3 ? ' (extreme)' : '')} />
              : <Slider label="Threshold" value={s.thr} onChange={(thr) => set({ thr })} min={1.5} max={6} step={0.1} show={(v) => v.toFixed(1)} />}
          </div>
          <Note>{methodNote}</Note>
          <div style={{ marginTop: 6 }}><b style={{ fontSize: 13 }}>Columns</b></div>
          <Row>
            {ds.numeric.map((c) => (
              <Check key={c} label={ds.head[c]} value={!s.off.includes(ds.head[c])} onChange={(on) => set({ off: on ? s.off.filter((x) => x !== ds.head[c]) : [...s.off, ds.head[c]] })} />
            ))}
          </Row>
          {!ds.numeric.length && <Note tone="warn">No numeric columns found (a column needs ≥ 3 values and ≥ 90% numeric).</Note>}
        </Panel>
      </Split>

      <Stats>
        <Stat label="Rows checked" value={ds.rows.length} />
        <Stat label="Flagged rows" value={flagged.size} sub={ds.rows.length ? `${((flagged.size / ds.rows.length) * 100).toFixed(1)}% of rows` : ''} tone={flagged.size ? 'bad' : 'good'} />
        <Stat label="Flagged cells" value={flags.length} />
        <Stat label="Columns" value={cols.length} sub="numeric, analysed" />
      </Stats>

      <Panel title="Distribution per column" actions={<span className="muted" style={{ fontSize: 12 }}>box = Q1–Q3 · bar = median · ◆ mean · dashed = IQR fences · red = flagged</span>}>
        {stats.map((st) => {
          const vals = ds.rows.map((r) => toNum(r[st.index])).filter(Number.isFinite)
          const out = (x: number) => flags.some((f) => f.col === st.index && f.value === x)
          return (
            <div key={st.index} style={{ marginBottom: 12 }}>
              <Row wrap>
                <b style={{ minWidth: 120 }}>{st.name}</b>
                <span className="muted" style={{ fontSize: 12 }}>n={st.n} · mean {fmt(st.mean)} · SD {fmt(st.sd)} · median {fmt(st.median)} · IQR {fmt(st.iqr)} · MAD {fmt(st.mad)} · {flags.filter((f) => f.col === st.index).length} flagged</span>
              </Row>
              <BoxPlot st={st} values={vals} out={out} />
            </div>
          )
        })}
      </Panel>

      <Panel title="Rows" actions={<>
        <Check label="Only flagged" value={s.onlyFlagged} onChange={(onlyFlagged) => set({ onlyFlagged })} />
        <CsvButton name="flagged-rows.csv" rows={() => [[...ds.head, 'row', 'reason'], ...ds.rows.flatMap((r, i) => (flagged.has(i) ? [[...r, i + 2, reasons(i)]] : []))]} />
        <Btn onClick={() => download('cleaned.csv', toCsv([ds.head, ...ds.rows.filter((_, i) => !flagged.has(i))]), 'text/csv')}>⬇ Cleaned</Btn>
        <Btn onClick={() => download('annotated.csv', toCsv([[...ds.head, 'outlier', 'reason'], ...ds.rows.map((r, i) => [...r, flagged.has(i) ? 1 : 0, reasons(i)])]), 'text/csv')}>⬇ Annotated</Btn>
      </>}>
        {showRows.length === 0 ? <Note tone="ok">No outliers with the current settings.</Note> : (
          <Table max={300} head={['Line', ...ds.head, 'Why']} rows={showRows.map(([r, i]) => [
            i + 2,
            ...r.map((c, ci) => flagged.get(i)?.has(ci) ? <b key={ci} style={{ color: 'var(--err)' }}>{c}</b> : c),
            <span key="w" className="muted" style={{ fontSize: 12 }}>{reasons(i)}</span>,
          ])} />
        )}
      </Panel>
    </div>
  )
}
