import { useMemo, useState } from 'react'
import { Bar, BarChart, Btn, Check, CsvButton, download, FileDrop, fmt, Note, Panel, pct, Row, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { profileDataset, isMissing, toDataset, type ColType, type Profile } from './lib/csv-profiler'

// Deterministic sample: a small HR export with realistic gaps and an outlier.
function sampleCsv(): string {
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const first = ['Ava', 'Liam', 'Noah', 'Mia', 'Olga', 'Ivan', 'Sofia', 'Ethan', 'Zoe', 'Omar', 'Lena', 'Kai', 'Ines', 'Yuki', 'Marta']
  const last = ['Smith', 'Kowalski', 'Garcia', 'Chen', 'Novak', 'Brown', 'Silva', 'Muller', 'Rossi', 'Tanaka']
  const dept = ['Engineering', 'Sales', 'Support', 'Marketing', 'Finance']
  const lines = ['id,name,department,age,salary,start_date,remote,rating,email,notes']
  for (let i = 1; i <= 240; i++) {
    const f = first[Math.floor(rnd() * first.length)], l = last[Math.floor(rnd() * last.length)]
    const d = dept[Math.floor(rnd() ** 1.4 * dept.length)]
    const age = Math.round(22 + rnd() * 18 + rnd() * 20)
    let salary = Math.round((38000 + (age - 22) * 1400 + rnd() * 30000 + (d === 'Engineering' ? 18000 : 0)) / 100) * 100
    if (i === 77) salary = 412000
    const y = 2012 + Math.floor(rnd() * 13), mo = 1 + Math.floor(rnd() * 12), da = 1 + Math.floor(rnd() * 28)
    const date = `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`
    const rating = (2 + rnd() * 3).toFixed(1)
    const email = rnd() < 0.12 ? '' : `${f}.${l}${i}@example.com`.toLowerCase()
    const notes = rnd() < 0.85 ? '' : rnd() < 0.5 ? '"Relocated, 2023"' : 'mentor'
    lines.push([i, `${f} ${l}`, d, rnd() < 0.05 ? 'NA' : age, rnd() < 0.04 ? '' : salary, date, rnd() < 0.4 ? 'yes' : 'no', i > 200 && rnd() < 0.5 ? '' : rating, email, notes].join(','))
  }
  return lines.join('\n')
}

const TYPE_COLOR: Record<ColType, string> = { integer: '#6366f1', number: '#0ea5e9', boolean: '#10b981', date: '#f59e0b', text: '#a855f7', empty: '#64748b' }
const DEF = { delim: 'auto', header: true, sel: 3 }

const fmtVal = (p: Profile, v: number | undefined) =>
  v === undefined || !Number.isFinite(v) ? '—' : p.type === 'date' ? new Date(v).toISOString().slice(0, 10) : fmt(v, 4)

export default function CsvProfiler() {
  const [s, set, reset] = useToolState('csv-profiler', DEF)
  const [text, setText] = useState(sampleCsv)
  const [fileName, setFileName] = useState('sample-employees.csv')
  const [err, setErr] = useState('')

  const ds = useMemo(() => toDataset(text, s.delim === 'auto' ? undefined : s.delim === 'tab' ? '\t' : s.delim, s.header), [text, s.delim, s.header])
  const prof = useMemo(() => profileDataset(ds), [ds])
  const nRows = ds.rows.length, nCols = ds.header.length
  const missingCells = prof.reduce((a, p) => a + p.missing, 0)
  const dupes = useMemo(() => {
    const seen = new Set<string>()
    let d = 0
    for (const r of ds.rows) {
      const k = JSON.stringify(r)
      if (seen.has(k)) d++
      else seen.add(k)
    }
    return d
  }, [ds])
  const sel = prof[Math.min(s.sel, prof.length - 1)]
  const selIdx = Math.min(s.sel, prof.length - 1)

  // Missing heatmap: rows bucketed into at most 60 bands.
  const bands = Math.min(60, nRows)
  const heat = useMemo(() => {
    const per = nRows / Math.max(1, bands)
    return Array.from({ length: bands }, (_, b) => {
      const r0 = Math.floor(b * per), r1 = Math.max(r0 + 1, Math.floor((b + 1) * per))
      return ds.header.map((_, c) => {
        let m = 0
        for (let r = r0; r < r1; r++) if (isMissing(ds.rows[r]?.[c] ?? '')) m++
        return { f: m / (r1 - r0), r0, r1 }
      })
    })
  }, [ds, nRows, bands])

  const load = async (f: File) => {
    setErr('')
    if (f.size > 60e6) return setErr('File is larger than 60 MB — too big to profile comfortably in a browser tab.')
    setText(await f.text())
    setFileName(f.name)
    set({ sel: 0 })
  }
  const profileRows = () => [
    ['column', 'type', 'count', 'missing', 'unique', 'min', 'max', 'mean', 'median', 'std', 'top value'],
    ...prof.map((p) => [p.name, p.type, p.count, p.missing, p.unique, fmtVal(p, p.min), fmtVal(p, p.max), fmtVal(p, p.mean), fmtVal(p, p.median), fmtVal(p, p.std), p.top[0]?.[0] ?? '']),
  ]

  return (
    <div>
      <Stats>
        <Stat label="Rows" value={nRows.toLocaleString('en-US')} sub={fileName} />
        <Stat label="Columns" value={nCols} sub={Object.entries(prof.reduce<Record<string, number>>((a, p) => ({ ...a, [p.type]: (a[p.type] ?? 0) + 1 }), {})).map(([t, n]) => `${n} ${t}`).join(' · ')} />
        <Stat label="Missing cells" value={pct(missingCells / Math.max(1, nRows * nCols))} sub={`${missingCells.toLocaleString('en-US')} of ${(nRows * nCols).toLocaleString('en-US')}`} tone={missingCells ? 'bad' : 'good'} />
        <Stat label="Duplicate rows" value={dupes} tone={dupes ? 'bad' : 'good'} />
      </Stats>
      <Split>
        <div>
          <Panel title="Data" actions={<Btn kind="ghost" onClick={() => { reset(); setText(sampleCsv()); setFileName('sample-employees.csv') }}>Sample</Btn>}>
            <FileDrop accept=".csv,.tsv,.txt,text/csv" onFiles={(fs) => void load(fs[0])} label="Drop a CSV / TSV file or click to choose" />
            <Row>
              <Select label="Delimiter" value={s.delim} onChange={(delim) => set({ delim })} options={[['auto', 'Auto-detect'], [',', 'Comma ,'], [';', 'Semicolon ;'], ['tab', 'Tab'], ['|', 'Pipe |']]} />
              <Check label="First row is header" value={s.header} onChange={(header) => set({ header })} />
            </Row>
            <details style={{ marginTop: 8 }}>
              <summary className="muted">Paste or edit CSV text</summary>
              <textarea className="k-area mono" rows={8} value={text.length > 200000 ? text.slice(0, 2000) + '\n… (large file, editing disabled)' : text} readOnly={text.length > 200000} onChange={(e) => { setText(e.target.value); setFileName('pasted text') }} />
            </details>
            {err && <Note tone="err">{err}</Note>}
            <Note>Everything runs locally — your file is never uploaded. Values like blank, NA, N/A, null, NaN, “-” count as missing.</Note>
          </Panel>
          <Panel title="Missing-value heatmap">
            {nCols === 0 ? <Note tone="warn">No data.</Note> : (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${nCols}, minmax(18px, 1fr))`, gap: 1, minWidth: nCols * 19 }}>
                  {ds.header.map((h, c) => (
                    <span key={h + c} title={h} style={{ fontSize: 10, writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 70, overflow: 'hidden', cursor: 'pointer', color: c === selIdx ? 'var(--accent)' : 'var(--muted)' }} onClick={() => set({ sel: c })}>{h}</span>
                  ))}
                  {heat.flatMap((row, b) => row.map((cell, c) => (
                    <span key={`${b}-${c}`} title={`${ds.header[c]} · rows ${cell.r0 + 1}–${cell.r1}: ${pct(cell.f, 0)} missing`} style={{ height: Math.max(3, Math.min(8, 300 / bands)), background: cell.f ? 'var(--err)' : 'var(--ok)', opacity: cell.f ? 0.35 + 0.65 * cell.f : 0.25 }} />
                  )))}
                </div>
              </div>
            )}
            <p className="muted" style={{ fontSize: 12 }}>Each strip is a band of ~{Math.ceil(nRows / Math.max(1, bands))} row(s); red intensity = share of missing values. Click a header to inspect.</p>
          </Panel>
        </div>
        <div>
          <Panel title="Columns" actions={<><CsvButton name="csv-profile.csv" rows={profileRows} /><Btn onClick={() => download('csv-profile.json', JSON.stringify(prof, null, 2), 'application/json')}>⬇ JSON</Btn></>}>
            <Table
              head={['Column', 'Type', 'Missing', 'Unique', 'Summary']}
              rows={prof.map((p, i) => [
                <button key="n" type="button" className="k-btn ghost" style={{ padding: '2px 6px', fontWeight: i === selIdx ? 800 : 500, color: i === selIdx ? 'var(--accent)' : undefined }} onClick={() => set({ sel: i })}>{p.name}</button>,
                <span key="t" style={{ color: TYPE_COLOR[p.type], fontWeight: 700 }}>{p.type}</span>,
                <div key="m" style={{ minWidth: 80 }}>{pct(p.missing / Math.max(1, p.count), 0)}<Bar value={p.missing} max={p.count} color="var(--err)" /></div>,
                p.unique.toLocaleString('en-US'),
                <span key="s" className="muted" style={{ fontSize: 12 }}>
                  {p.hist ? `${fmtVal(p, p.min)} … ${fmtVal(p, p.max)}, mean ${fmtVal(p, p.mean)}` : p.top[0] ? `top “${p.top[0][0].slice(0, 24)}” ×${p.top[0][1]}` : '—'}
                </span>,
              ])}
            />
          </Panel>
          {sel && (
            <Panel title={<>Column: <span style={{ color: 'var(--accent)' }}>{sel.name}</span> <span style={{ color: TYPE_COLOR[sel.type], fontSize: 13 }}>({sel.type})</span></>}>
              <Stats>
                <Stat label="Present" value={(sel.count - sel.missing).toLocaleString('en-US')} sub={`${sel.missing} missing`} />
                <Stat label="Distinct" value={sel.unique.toLocaleString('en-US')} sub={sel.unique === sel.count - sel.missing && sel.unique > 1 ? 'all unique — candidate key' : pct(sel.unique / Math.max(1, sel.count - sel.missing)) + ' cardinality'} />
                {sel.hist ? (
                  <>
                    <Stat label="Mean ± std" value={fmtVal(sel, sel.mean)} sub={sel.type === 'date' ? `± ${fmt((sel.std ?? 0) / 864e5, 3)} days` : `± ${fmtVal(sel, sel.std)}`} />
                    <Stat label="Median (Q1–Q3)" value={fmtVal(sel, sel.median)} sub={`${fmtVal(sel, sel.q1)} – ${fmtVal(sel, sel.q3)}`} />
                  </>
                ) : sel.type === 'text' ? (
                  <Stat label="Length" value={`${sel.minLen}–${sel.maxLen}`} sub="characters" />
                ) : null}
              </Stats>
              {sel.hist && (
                <>
                  <BarChart height={220} bars={sel.hist.map((b) => ({ label: fmtVal(sel, b.x0), value: b.n }))} fy={(v) => fmt(v, 0)} />
                  <Row>
                    <span className="muted">Min <b>{fmtVal(sel, sel.min)}</b></span>
                    <span className="muted">Max <b>{fmtVal(sel, sel.max)}</b></span>
                    {sel.outliers !== undefined && <span className="muted">IQR outliers <b style={{ color: sel.outliers ? 'var(--warn)' : undefined }}>{sel.outliers}</b></span>}
                    {sel.zeros !== undefined && <span className="muted">Zeros <b>{sel.zeros}</b></span>}
                    {sel.invalid > 0 && <span className="muted">Non-parsable <b style={{ color: 'var(--err)' }}>{sel.invalid}</b></span>}
                  </Row>
                </>
              )}
              {!sel.hist && sel.top.length > 0 && (
                <Table
                  head={['Value', 'Count', 'Share']}
                  rows={sel.top.map(([v, n]) => [v.length > 40 ? v.slice(0, 39) + '…' : v, n, <div key="b" style={{ minWidth: 120 }}>{pct(n / Math.max(1, sel.count - sel.missing))}<Bar value={n} max={sel.top[0][1]} /></div>])}
                />
              )}
            </Panel>
          )}
          <Panel title="Preview (first 15 rows)">
            <Table head={ds.header} rows={ds.rows.slice(0, 15).map((r) => r.map((v) => (isMissing(v) ? <span key="m" style={{ color: 'var(--err)', opacity: 0.6 }}>∅</span> : v.length > 30 ? v.slice(0, 29) + '…' : v)))} />
          </Panel>
        </div>
      </Split>
    </div>
  )
}
