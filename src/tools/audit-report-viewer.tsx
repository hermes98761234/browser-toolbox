import { useMemo, useState } from 'react'
import { Area, Btn, CopyButton, CsvButton, FileDrop, Note, Panel, Row, Seg, Table } from '../kit'
import { bucket, compare, fmtKiB, fmtMs, parseReport, SAMPLE_REPORT, type Item, type Report } from './lib/audit-report-viewer'

const COL = { pass: '#0c9f56', average: '#e08a00', fail: '#e5383b', na: '#94a3b8' }
const sc = (s: number | null) => (s === null ? '–' : Math.round(s * 100))

function Gauge({ score, title, delta }: { score: number | null; title: string; delta?: number | null }) {
  const r = 42, L = 2 * Math.PI * r
  const c = COL[bucket(score)]
  return (
    <div style={{ textAlign: 'center', minWidth: 110 }}>
      <svg width={110} height={110} viewBox="0 0 110 110" role="img" aria-label={`${title} ${sc(score)}`}>
        <circle cx={55} cy={55} r={r} fill={`${c}1f`} stroke={`${c}33`} strokeWidth={8} />
        <circle cx={55} cy={55} r={r} fill="none" stroke={c} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${(score ?? 0) * L} ${L}`} transform="rotate(-90 55 55)" />
        <text x={55} y={64} textAnchor="middle" fontSize={28} fontWeight={700} fill={c}>{sc(score)}</text>
      </svg>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {delta !== undefined && delta !== null && <div style={{ fontSize: 13, color: delta > 0 ? COL.pass : delta < 0 ? COL.fail : 'var(--muted)' }}>{delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '='}{delta !== 0 ? delta : ''} vs B</div>}
    </div>
  )
}

const shape = (s: number | null) => {
  const b = bucket(s)
  return <span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, background: COL[b], borderRadius: b === 'pass' ? 5 : 1, transform: b === 'average' ? 'none' : undefined, clipPath: b === 'fail' ? 'polygon(50% 0, 100% 100%, 0 100%)' : undefined, marginRight: 6 }} />
}

function cell(v: unknown, type: string): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    return String(o.url ?? o.text ?? o.snippet ?? o.nodeLabel ?? o.value ?? JSON.stringify(o).slice(0, 80))
  }
  if (typeof v === 'number') return type === 'bytes' ? fmtKiB(v) : type === 'ms' || type === 'timespanMs' ? fmtMs(v) : v.toLocaleString('en-US')
  return String(v)
}

function Details({ it }: { it: Item }) {
  const heads = it.headings.length ? it.headings : it.rows[0] ? Object.keys(it.rows[0]).slice(0, 4).map((k) => ({ key: k, label: k, type: /bytes/i.test(k) ? 'bytes' : /ms$/i.test(k) ? 'ms' : 'text' })) : []
  return (
    <div style={{ padding: '4px 0 8px 18px' }}>
      <p className="muted" style={{ margin: '0 0 6px', fontSize: 13.5 }}>{it.description}</p>
      {it.rows.length > 0 && heads.length > 0 && <Table head={heads.map((h) => h.label)} rows={it.rows.map((r) => heads.map((h) => <span key={h.key} style={{ wordBreak: 'break-all' }}>{cell(r[h.key], h.type)}</span>))} max={15} />}
    </div>
  )
}

export default function AuditReportViewer() {
  const [text, setText] = useState('')
  const [rep, setRep] = useState<Report>(() => parseReport(SAMPLE_REPORT))
  const [other, setOther] = useState<Report | null>(null)
  const [name, setName] = useState('sample-report.json (fictional site)')
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set(['unused-javascript']))
  const [cat, setCat] = useState('accessibility')

  const load = (raw: string, n: string, slot: 'a' | 'b') => {
    setErr('')
    try {
      const r = parseReport(JSON.parse(raw))
      if (slot === 'a') {
        setRep(r)
        setName(n)
      } else setOther(r)
    } catch (e) {
      setErr(`${n}: ${(e as Error).message}`)
    }
  }
  const toggle = (id: string) => setOpen((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const cmp = useMemo(() => (other ? compare(rep, other) : null), [rep, other])
  const maxSave = Math.max(1, ...rep.opportunities.map((o) => o.savingsMs))
  const totalSave = rep.opportunities.reduce((a, o) => a + o.savingsMs, 0)
  const others = rep.categories.filter((c) => c.id !== 'performance')
  const curCat = others.find((c) => c.id === cat) ?? others[0]
  const md = () => [
    `# Lighthouse summary — ${rep.url}`, `${rep.fetchTime} · ${rep.formFactor} · Lighthouse ${rep.version}`, '',
    ...rep.categories.map((c) => `- **${c.title}**: ${sc(c.score)}`), '', '## Metrics', ...rep.metrics.map((m) => `- ${m.title}: ${m.display}`), '',
    '## Opportunities', ...rep.opportunities.map((o) => `- ${o.title} — ${o.savingsMs ? `~${fmtMs(o.savingsMs)}` : ''}${o.savingsBytes ? ` ${fmtKiB(o.savingsBytes)}` : ''}`),
    '', '## Diagnostics', ...rep.diagnostics.map((d) => `- ${d.title}${d.display ? ` — ${d.display}` : ''}`),
  ].join('\n')

  const row = (it: Item, right: React.ReactNode, bar?: number) => (
    <div key={it.id} style={{ borderBottom: '1px solid var(--line)' }}>
      <button type="button" onClick={() => toggle(it.id)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 0' }}>
        {shape(it.score)}
        <span style={{ flex: 1 }}>{it.title}{it.display && !bar ? <span className="muted"> — {it.display}</span> : null}</span>
        {bar !== undefined && <span style={{ width: 120, height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}><span style={{ display: 'block', height: 8, width: `${bar * 100}%`, background: COL.average }} /></span>}
        <span style={{ minWidth: 92, textAlign: 'right', fontWeight: 600, fontSize: 13.5 }}>{right}</span>
        <span className="muted">{open.has(it.id) ? '▾' : '▸'}</span>
      </button>
      {open.has(it.id) && <Details it={it} />}
    </div>
  )

  return (
    <div>
      <Panel title="Report" actions={<><Btn onClick={() => { setRep(parseReport(SAMPLE_REPORT)); setName('sample-report.json (fictional site)'); setOther(null) }}>Sample</Btn><CopyButton text={md} label="Copy Markdown summary" /></>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <FileDrop accept=".json,application/json" onFiles={async (f) => load(await f[0].text(), f[0].name, 'a')} label="Drop a Lighthouse / PageSpeed JSON report" />
          <FileDrop accept=".json,application/json" onFiles={async (f) => load(await f[0].text(), f[0].name, 'b')} label={other ? `Comparing with ${other.url || 'report B'} — drop to replace` : 'Optional: drop a second report (B) to compare'} />
        </div>
        <details style={{ marginTop: 8 }}>
          <summary className="muted" style={{ cursor: 'pointer' }}>…or paste JSON</summary>
          <Area value={text} onChange={setText} rows={5} mono placeholder='{"lighthouseVersion": "12.x", "audits": {…}, "categories": {…}}' />
          <Btn onClick={() => load(text, 'pasted JSON', 'a')} disabled={!text.trim()}>Load pasted report</Btn>
        </details>
        {err && <Note tone="err">{err}</Note>}
        <p style={{ margin: '10px 0 0' }}>
          <b style={{ wordBreak: 'break-all' }}>{rep.url}</b> <span className="muted">· {rep.fetchTime ? new Date(rep.fetchTime).toLocaleString() : ''} · {rep.formFactor || 'unknown device'} · Lighthouse {rep.version} · {name}</span>
        </p>
        {rep.runWarnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}
        <p className="muted" style={{ fontSize: 13 }}>Export a report with Chrome DevTools → Lighthouse → ⋮ → Save as JSON, or <code>lighthouse URL --output=json</code>. Parsing happens locally.</p>
      </Panel>

      <Panel title="Scores">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, justifyContent: 'space-around' }}>
          {rep.categories.map((c) => {
            const d = cmp?.cats.find((x) => x.id === c.id)?.delta
            return <Gauge key={c.id} score={c.score} title={c.title} delta={cmp ? (d === null || d === undefined ? null : -d) : undefined} />
          })}
        </div>
        <p className="muted" style={{ textAlign: 'center', fontSize: 13 }}><span style={{ color: COL.fail }}>▲</span> 0–49 · <span style={{ color: COL.average }}>■</span> 50–89 · <span style={{ color: COL.pass }}>●</span> 90–100</p>
      </Panel>

      <Panel title="Metrics">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
          {rep.metrics.map((m) => {
            const o = cmp?.metrics.find((x) => x.id === m.id)
            return (
              <div key={m.id} className="k-stat" style={{ borderTop: `4px solid ${COL[bucket(m.score)]}` }}>
                <span className="k-stat-label">{shape(m.score)}{m.title}</span>
                <b className="k-stat-value" style={{ color: COL[bucket(m.score)] }}>{m.display || m.value}</b>
                <span className="k-stat-sub">{m.weight ? `weight ${m.weight}% of performance` : 'not scored'}{o ? ` · B: ${m.unit === 'unitless' ? o.b.toFixed(2) : fmtMs(o.b)}` : ''}</span>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel title={`Opportunities (${rep.opportunities.length})`} actions={<CsvButton name="lighthouse-opportunities.csv" rows={() => [['Audit', 'Score', 'Est. savings (ms)', 'Est. savings (bytes)'], ...rep.opportunities.map((o) => [o.title, o.score ?? '', Math.round(o.savingsMs), Math.round(o.savingsBytes)])]} />}>
        <p className="muted" style={{ marginTop: 0 }}>Sorted by estimated time saved{totalSave ? ` (≈ ${fmtMs(totalSave)} combined; savings overlap, so don't add them up literally)` : ''}. Click a row for the affected resources.</p>
        {rep.opportunities.length ? rep.opportunities.map((o) => row(o, <>{o.savingsMs ? fmtMs(o.savingsMs) : ''}{o.savingsBytes ? <div className="muted" style={{ fontWeight: 400 }}>{fmtKiB(o.savingsBytes)}</div> : null}</>, o.savingsMs / maxSave)) : <Note tone="ok">No opportunities — nice.</Note>}
      </Panel>

      <Panel title={`Diagnostics (${rep.diagnostics.length})`}>
        {rep.diagnostics.length ? rep.diagnostics.map((d) => row(d, d.score === null ? 'info' : sc(d.score))) : <Note tone="ok">No failing diagnostics.</Note>}
      </Panel>

      {curCat && (
        <Panel title="Other categories" actions={<Seg value={curCat.id} onChange={setCat} options={others.map((c) => [c.id, `${c.title} ${sc(c.score)}`] as const)} />}>
          <Row><span className="muted">{curCat.failing.length} to fix · {curCat.passed} passed{curCat.manual ? ` · ${curCat.manual} to check manually` : ''}</span></Row>
          {curCat.failing.length ? curCat.failing.map((f) => row(f, '')) : <Note tone="ok">All automated checks passed.</Note>}
        </Panel>
      )}
      {cmp && (
        <Panel title="Comparison (this report vs B)">
          <Table head={['', 'This report', 'Report B', 'Change']} rows={[
            ...cmp.cats.map((c) => [c.title, c.a ?? '–', c.b ?? '–', c.delta === null ? '' : <b key="d" style={{ color: c.delta < 0 ? COL.pass : c.delta > 0 ? COL.fail : undefined }}>{c.delta > 0 ? `B +${c.delta}` : c.delta < 0 ? `B ${c.delta}` : '='}</b>]),
            ...cmp.metrics.map((m) => [m.short, m.unit === 'unitless' ? m.a.toFixed(3) : fmtMs(m.a), m.unit === 'unitless' ? m.b.toFixed(3) : fmtMs(m.b), m.b < m.a ? 'B faster' : m.b > m.a ? 'B slower' : '=']),
          ]} />
        </Panel>
      )}
    </div>
  )
}
