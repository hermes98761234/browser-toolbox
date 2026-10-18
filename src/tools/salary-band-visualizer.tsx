import { useRef, useState } from 'react'
import { Area, Btn, CsvButton, FileDrop, money, niceTicks, Note, num, Panel, pct, Row, Select, Seg, Split, Stat, Stats, Table, useToolState, color } from '../kit'
import { parseCsv } from './lib/chart-builder'
import { readXlsx } from './lib/excel-to-csv'
import { analyze, parseBands, parseEmps, SAMPLE_BANDS, SAMPLE_EMPS, type Row as ERow, type Status } from './lib/salary-band-visualizer'

const ST: Record<Status, [string, string]> = {
  below: ['Below range', '#ef4444'], low: ['Below mid (CR < 0.95)', '#f59e0b'], mid: ['Near mid (0.95–1.05)', '#10b981'], high: ['Above mid (CR > 1.05)', '#0ea5e9'], above: ['Above range', '#a855f7'], noband: ['No band', '#64748b'],
}
const DEF = { bands: SAMPLE_BANDS, emps: SAMPLE_EMPS, cur: '$', dept: 'All', colorBy: 'status' as 'status' | 'dept', sort: 'cr' as 'cr' | 'salary' | 'name' }

async function fileRows(f: File): Promise<string> {
  if (/\.xlsx$/i.test(f.name)) {
    const sheets = await readXlsx(new Uint8Array(await f.arrayBuffer()))
    const rows = sheets.find((s) => !s.hidden)?.rows ?? []
    return rows.map((r) => r.map((c) => { const v = c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? ''); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v }).join(',')).join('\n')
  }
  return f.text()
}

export default function SalaryBandVisualizer() {
  const [s, set, reset] = useToolState('salary-band-visualizer', DEF)
  const [hover, setHover] = useState<ERow | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const pb = parseBands(parseCsv(s.bands))
  const pe = parseEmps(parseCsv(s.emps))
  const depts = [...new Set(pe.emps.map((e) => e.dept).filter(Boolean))].sort()
  const emps = s.dept === 'All' ? pe.emps : pe.emps.filter((e) => e.dept === s.dept)
  const a = analyze(pb.bands, emps)
  const m = (x: number) => money(x, s.cur, 0)
  const levels = a.stats.filter((st) => st.band || st.n).sort((x, y) => (x.band?.mid ?? Infinity) - (y.band?.mid ?? Infinity))

  // chart geometry
  const W = 900, L = 150, R = 24, T = 30, RH = 46
  const H = T + levels.length * RH + 34
  const vals = [...pb.bands.flatMap((b) => [b.min, b.max]), ...a.rows.map((r) => r.salary)]
  const lo = vals.length ? Math.min(...vals) : 0, hi = vals.length ? Math.max(...vals) : 1
  const t0 = niceTicks(lo, hi, 7)
  const step = t0.length > 1 ? t0[1] - t0[0] : 1
  const x0 = t0[0] > lo ? t0[0] - step : t0[0], x1 = t0[t0.length - 1] < hi ? t0[t0.length - 1] + step : t0[t0.length - 1]
  const ticks = [...(x0 < t0[0] ? [x0] : []), ...t0, ...(x1 > t0[t0.length - 1] ? [x1] : [])]
  const sx = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R)
  const deptColor = (d: string) => color(Math.max(0, depts.indexOf(d)))
  const dotColor = (r: ERow) => (s.colorBy === 'dept' ? deptColor(r.dept) : ST[r.status][1])

  const savePng = () => {
    const el = svg.current
    if (!el) return
    const cs = getComputedStyle(el)
    const clone = el.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', getComputedStyle(el.parentElement!).backgroundColor || '#ffffff')
    clone.insertBefore(bg, clone.firstChild)
    const src = new XMLSerializer().serializeToString(clone).replace(/currentColor/g, cs.color)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = W * 2; c.height = H * 2
      const g = c.getContext('2d')!
      g.scale(2, 2)
      g.drawImage(img, 0, 0, W, H)
      c.toBlob((b) => { if (!b) return; const u = URL.createObjectURL(b); const l = document.createElement('a'); l.href = u; l.download = 'salary-bands.png'; l.click(); setTimeout(() => URL.revokeObjectURL(u), 1000) })
    }
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src)
  }

  const sorted = [...a.rows].sort((p, q) => (s.sort === 'name' ? p.name.localeCompare(q.name) : s.sort === 'salary' ? q.salary - p.salary : (p.cr || 0) - (q.cr || 0)))
  const errors = [...pb.errors, ...pe.errors]

  return (
    <div>
      <Stats>
        <Stat label="Employees" value={a.rows.length} sub={s.dept === 'All' ? `${depts.length} departments` : s.dept} />
        <Stat label="Average compa-ratio" value={num(a.avgCr, 2)} sub="salary ÷ band midpoint" tone="accent" />
        <Stat label="Below range" value={a.rows.filter((r) => r.status === 'below').length} sub={`${m(a.costToMin)} to bring to minimum`} tone={a.costToMin ? 'bad' : 'good'} />
        <Stat label="Above range" value={a.rows.filter((r) => r.status === 'above').length} sub={`${m(a.overMax)} over maximums`} />
        <Stat label="Outliers" value={a.rows.filter((r) => r.outlier).length} sub="out of band or Tukey fence" />
      </Stats>
      <Panel
        title="Pay ranges by level"
        actions={
          <>
            <Select label="Department" value={s.dept} onChange={(dept) => set({ dept })} options={['All', ...depts]} />
            <Seg value={s.colorBy} onChange={(colorBy) => set({ colorBy })} options={[['status', 'Colour: position'], ['dept', 'Colour: department']]} />
            <Btn kind="primary" onClick={savePng}>⬇ PNG</Btn>
          </>
        }
      >
        <div style={{ overflowX: 'auto', position: 'relative' }}>
          <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 640, display: 'block', color: 'var(--fg)', fontFamily: 'system-ui, sans-serif' }}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={sx(t)} x2={sx(t)} y1={T - 8} y2={H - 30} stroke="currentColor" strokeOpacity={0.12} />
                <text x={sx(t)} y={H - 12} fontSize={11} textAnchor="middle" fill="currentColor" fillOpacity={0.7}>{s.cur}{t >= 1000 ? `${num(t / 1000, 0)}k` : num(t, 0)}</text>
              </g>
            ))}
            {levels.map((lv, i) => {
              const y = T + i * RH + RH / 2
              const b = lv.band
              const rs = a.rows.filter((r) => r.level.toLowerCase() === lv.level.toLowerCase())
              return (
                <g key={lv.level}>
                  <text x={L - 10} y={y - 3} fontSize={12.5} fontWeight={600} textAnchor="end" fill="currentColor">{lv.level.slice(0, 22)}</text>
                  <text x={L - 10} y={y + 12} fontSize={10.5} textAnchor="end" fill="currentColor" fillOpacity={0.6}>{lv.n} people · CR {num(lv.avgCr, 2)}</text>
                  {b && (
                    <>
                      <rect x={sx(b.min)} y={y - 11} width={Math.max(2, sx(b.max) - sx(b.min))} height={22} rx={11} fill="#6366f1" fillOpacity={0.14} stroke="#6366f1" strokeOpacity={0.5} />
                      <line x1={sx(b.mid)} x2={sx(b.mid)} y1={y - 14} y2={y + 14} stroke="#6366f1" strokeWidth={2} />
                      {[0.25, 0.75].map((q) => <line key={q} x1={sx(b.min + (b.max - b.min) * q)} x2={sx(b.min + (b.max - b.min) * q)} y1={y - 8} y2={y + 8} stroke="#6366f1" strokeOpacity={0.35} />)}
                    </>
                  )}
                  {rs.map((r, k) => {
                    const dy = ((k % 3) - 1) * 6
                    return (
                      <g key={r.name + k} onMouseEnter={() => setHover(r)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
                        {r.outlier && <circle cx={sx(r.salary)} cy={y + dy} r={8.5} fill="none" stroke={ST[r.status === 'below' || r.status === 'above' ? r.status : 'below'][1]} strokeWidth={1.5} strokeDasharray={r.status === 'below' || r.status === 'above' ? undefined : '2 2'} />}
                        <circle cx={sx(r.salary)} cy={y + dy} r={5} fill={dotColor(r)} stroke="#fff" strokeWidth={1} />
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </svg>
          {hover && (
            <div style={{ position: 'absolute', right: 8, top: 4, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontSize: 13, boxShadow: 'var(--shadow)' }}>
              <b>{hover.name}</b> · {hover.dept || '—'} · {hover.level}<br />
              {m(hover.salary)} · CR {num(hover.cr, 2)} · penetration {Number.isFinite(hover.pen) ? pct(hover.pen, 0) : '—'}<br />
              <span style={{ color: ST[hover.status][1], fontWeight: 600 }}>{ST[hover.status][0]}</span>{hover.outlier ? ' · outlier' : ''}
            </div>
          )}
        </div>
        <Row>
          {s.colorBy === 'status'
            ? (Object.keys(ST) as Status[]).filter((k) => k !== 'noband' || a.noBand).map((k) => <span key={k} style={{ fontSize: 12 }}><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: ST[k][1], marginRight: 4 }} />{ST[k][0]}</span>)
            : depts.map((d) => <span key={d} style={{ fontSize: 12 }}><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: deptColor(d), marginRight: 4 }} />{d}</span>)}
          <span className="muted" style={{ fontSize: 12 }}>Bar = band min–max, thick line = midpoint, thin lines = quartiles, ring = outlier.</span>
        </Row>
      </Panel>

      <Split>
        <div>
          <Panel title="Data" actions={<><Btn kind="ghost" onClick={reset}>Sample</Btn></>}>
            {errors.length > 0 && <Note tone="warn">{errors.slice(0, 5).join(' ')}</Note>}
            {a.noBand > 0 && <Note tone="warn">{a.noBand} employee(s) have a level with no matching band.</Note>}
            <Area label="Salary bands (level, min, mid, max)" value={s.bands} onChange={(bands) => set({ bands })} rows={6} mono />
            <FileDrop accept=".csv,.tsv,.txt,.xlsx" onFiles={async ([f]) => set({ bands: await fileRows(f) })} label="Import bands CSV / XLSX" />
            <Area label="Employees (name, level, salary, department)" value={s.emps} onChange={(e) => set({ emps: e })} rows={8} mono />
            <FileDrop accept=".csv,.tsv,.txt,.xlsx" onFiles={async ([f]) => set({ emps: await fileRows(f) })} label="Import employees CSV / XLSX" />
            <Select label="Currency" value={s.cur} onChange={(cur) => set({ cur })} options={['$', '€', '£', '₴', 'zł', 'CHF ', '¥']} />
          </Panel>
          <Note>Data stays in your browser. Compa-ratio = salary ÷ midpoint (1.00 = at market). Range penetration = (salary − min) ÷ (max − min). Outliers: pay outside the band, or beyond 1.5×IQR of their level (levels with ≥ 4 people).</Note>
        </div>
        <div>
          <Panel title="Levels">
            <Table
              head={['Level', 'People', 'Band', 'Spread', 'Median', 'Avg CR', 'Out of band']}
              rows={levels.map((lv) => [lv.level, lv.n, lv.band ? `${m(lv.band.min)}–${m(lv.band.max)}` : '—', Number.isFinite(lv.spread) ? pct(lv.spread, 0) : '—', Number.isFinite(lv.median) ? m(lv.median) : '—', num(lv.avgCr, 2), lv.below + lv.above || ''])}
            />
          </Panel>
          <Panel
            title="Employees"
            actions={
              <>
                <Seg value={s.sort} onChange={(sort) => set({ sort })} options={[['cr', 'By CR'], ['salary', 'By pay'], ['name', 'A–Z']]} />
                <CsvButton name="compa-ratios.csv" rows={() => [['Name', 'Department', 'Level', 'Salary', 'Compa-ratio', 'Penetration', 'Status', 'Outlier'], ...sorted.map((r) => [r.name, r.dept, r.level, r.salary, +r.cr.toFixed(3), +r.pen.toFixed(3), ST[r.status][0], r.outlier ? 'yes' : ''])]} />
              </>
            }
          >
            <Table
              max={60}
              head={['Name', 'Level', 'Salary', 'CR', 'Position']}
              rows={sorted.map((r) => [
                <span key="n">{r.name}<br /><span className="muted" style={{ fontSize: 12 }}>{r.dept}</span></span>,
                r.level,
                m(r.salary),
                <b key="c" style={{ color: ST[r.status][1] }}>{num(r.cr, 2)}</b>,
                <span key="s" style={{ fontSize: 12 }}>{ST[r.status][0]}{r.outlier ? ' ⚑' : ''}</span>,
              ])}
            />
          </Panel>
        </div>
      </Split>
    </div>
  )
}
