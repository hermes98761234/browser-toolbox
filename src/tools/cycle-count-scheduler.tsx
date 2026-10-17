import { useMemo, useState } from 'react'
import { Btn, Check, CsvButton, FileDrop, JsonButtons, Note, Num, Panel, Row, Select, Split, Stat, Stats, Table, Txt, money, num, pct, today, useToolState } from '../kit'
import { classify, parseItems, sampleItems, schedule, workingDays, type Classified, type Cls, type Item } from './lib/cycle-count-scheduler'

interface State { items: Item[]; aCut: number; bCut: number; freq: Record<Cls, number>; start: string; days: number; holidays: string; weekends: boolean; site: string }
const firstOfMonth = (d: string) => d.slice(0, 8) + '01'
const DEF: State = { items: sampleItems(), aCut: 80, bCut: 95, freq: { A: 12, B: 4, C: 2 }, start: firstOfMonth(today()), days: 365, holidays: '', weekends: false, site: 'Main warehouse' }
const CLS_COLOR: Record<Cls, string> = { A: 'var(--err)', B: 'var(--warn)', C: 'var(--ok)' }
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export default function CycleCountScheduler() {
  const [s, set, reset] = useToolState('cycle-count-scheduler', DEF)
  const [msg, setMsg] = useState('')
  const items = useMemo(() => classify(s.items, s.aCut / 100, s.bCut / 100), [s.items, s.aCut, s.bCut])
  const bySku = useMemo(() => new Map(items.map((x) => [x.sku, x])), [items])
  const holidays = useMemo(() => s.holidays.split(/[\s,;]+/).filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h)), [s.holidays])
  const days = useMemo(() => workingDays(s.start, s.days, holidays, s.weekends), [s.start, s.days, holidays, s.weekends])
  const tasks = useMemo(() => schedule(items, s.freq, days), [items, s.freq, days])
  const perDay = useMemo(() => {
    const m = new Map<string, Classified[]>()
    for (const t of tasks) { const it = bySku.get(t.sku); if (it) m.set(t.day, [...(m.get(t.day) ?? []), it]) }
    for (const [, v] of m) v.sort((a, b) => a.location.localeCompare(b.location))
    return m
  }, [tasks, bySku])
  const [month, setMonth] = useState(s.start.slice(0, 7))
  const [day, setDay] = useState(days[0] ?? s.start)

  const classes = (['A', 'B', 'C'] as Cls[]).map((k) => {
    const xs = items.filter((x) => x.klass === k)
    return { k, n: xs.length, value: xs.reduce((a, x) => a + x.value, 0), counts: xs.length * Math.round(s.freq[k]) }
  })
  const totalValue = classes.reduce((a, c) => a + c.value, 0) || 1
  const avg = tasks.length / (days.length || 1)
  const months = [...new Set(days.map((d) => d.slice(0, 7)))]

  // calendar grid for the selected month
  const cal = useMemo(() => {
    const [y, m] = month.split('-').map(Number)
    const first = new Date(Date.UTC(y, m - 1, 1))
    const lead = (first.getUTCDay() + 6) % 7
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return [...Array<null>(lead).fill(null), ...Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)]
  }, [month])
  const maxLoad = Math.max(1, ...[...perDay.values()].map((v) => v.length))

  const sheetHtml = (title: string, ds: string[]) => {
    const pages = ds.filter((d) => perDay.get(d)?.length).map((d) => `
      <section><h1>${esc(s.site)} — Cycle count sheet</h1><p><b>${new Date(d + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}</b> · ${perDay.get(d)!.length} items · Counter: ____________ · Checked by: ____________</p>
      <table><thead><tr><th>#</th><th>Location</th><th>SKU</th><th>Description</th><th>Class</th><th>System qty</th><th>Counted</th><th>Variance</th><th>Init.</th></tr></thead><tbody>
      ${perDay.get(d)!.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.location)}</td><td>${esc(it.sku)}</td><td>${esc(it.name)}</td><td>${it.klass}</td><td></td><td></td><td></td><td></td></tr>`).join('')}
      </tbody></table><p class="foot">Count blind: record what you see before comparing with the system quantity. Recount any variance above tolerance.</p></section>`).join('')
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font:12px Arial,sans-serif;margin:0}section{page-break-after:always;padding:10mm}h1{font-size:18px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #444;padding:6px 5px;text-align:left}th{background:#eee}td:nth-child(n+6){width:12%}.foot{color:#555;font-size:11px}</style></head><body>${pages || '<p>No counts scheduled.</p>'}<script>onload=()=>print()</script></body></html>`
  }
  const print = (ds: string[], title: string) => {
    const html = sheetHtml(title, ds)
    if (!window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank')) setMsg('Pop-up blocked: allow pop-ups to print sheets.')
  }
  const weekOf = (d: string) => {
    const t = Date.parse(d + 'T00:00:00Z'), wd = (new Date(t).getUTCDay() + 6) % 7
    return Array.from({ length: 7 }, (_, i) => new Date(t + (i - wd) * 864e5).toISOString().slice(0, 10))
  }
  const importItems = async (f: File) => {
    const { items: its, skipped } = parseItems(await f.text())
    if (its.length) set({ items: its })
    setMsg(`Imported ${its.length} items${skipped ? `, skipped ${skipped} lines (header or invalid)` : ''}.`)
  }
  const dayItems = perDay.get(day) ?? []

  return (
    <Split wide="right">
      <div>
        <Panel title="Policy" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label="Site" value={s.site} onChange={(site) => set({ site })} />
          <Row>
            <Num label="A = top % of value" value={s.aCut} onChange={(aCut) => set({ aCut: Math.max(1, Math.min(s.bCut, aCut)) })} unit="%" min={1} max={99} />
            <Num label="B up to" value={s.bCut} onChange={(bCut) => set({ bCut: Math.max(s.aCut, Math.min(100, bCut)) })} unit="%" min={1} max={100} />
          </Row>
          <Row>
            {(['A', 'B', 'C'] as Cls[]).map((k) => <Num key={k} label={`${k} counts / period`} value={s.freq[k]} onChange={(v) => set({ freq: { ...s.freq, [k]: Math.max(0, Math.min(260, Math.round(v))) } })} min={0} step={1} />)}
          </Row>
          <Row>
            <Txt label="Start" type="date" value={s.start} onChange={(start) => { set({ start }); setMonth(start.slice(0, 7)) }} />
            <Select label="Period" value={s.days} onChange={(d) => set({ days: d })} options={[[91, '3 months'], [182, '6 months'], [365, '12 months']]} />
          </Row>
          <Check label="Count on weekends too" value={s.weekends} onChange={(weekends) => set({ weekends })} />
          <Txt label="Holidays / no-count days (YYYY-MM-DD, comma-separated)" value={s.holidays} onChange={(h) => set({ holidays: h })} placeholder="2026-12-25, 2026-12-26" />
          <p className="muted" style={{ fontSize: 13 }}>Common policy: A items monthly (12×/yr), B quarterly (4×), C once or twice a year. Counts per period = how many times each item is counted in the chosen period.</p>
        </Panel>
        <Panel title={`Items (${items.length})`} actions={<JsonButtons name="cycle-count.json" data={s} onLoad={(d) => set({ ...DEF, ...d })} />}>
          <FileDrop accept=".csv,.txt" onFiles={(f) => void importItems(f[0])} label="Import CSV: sku, name, location, unit cost, annual qty[, class]" />
          {msg && <Note>{msg}</Note>}
          <Table max={15} head={['SKU', 'Location', 'Annual value', 'Cum.', 'Class']} rows={items.map((x) => [
            <span key="s" title={x.name}>{x.sku}</span>, x.location, money(x.value, '$', 0), pct(x.cum, 0),
            <select key="c" value={x.cls || ''} aria-label="Class override" onChange={(e) => set({ items: s.items.map((it) => (it.sku === x.sku ? { ...it, cls: e.target.value as Item['cls'] } : it)) })} style={{ color: CLS_COLOR[x.klass], fontWeight: 700 }}>
              <option value="">{x.klass} (auto)</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
            </select>,
          ])} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Counts scheduled" value={num(tasks.length, 0)} sub={`${days.length} working days`} />
          <Stat label="Per working day" value={num(avg, 1)} tone="accent" sub={`≈ ${num(avg * 5, 0)} per week`} />
          <Stat label="A items" value={classes[0].n} sub={`${pct(classes[0].value / totalValue, 0)} of value`} />
          <Stat label="Value coverage" value={pct(classes.reduce((a, c) => a + (s.freq[c.k] > 0 ? c.value : 0), 0) / totalValue, 0)} sub="counted at least once" />
        </Stats>
        <Panel title="ABC summary">
          <Table head={['Class', 'Items', '% items', '% value', 'Counts/item', 'Counts']} rows={classes.map((c) => [<b key="k" style={{ color: CLS_COLOR[c.k] }}>{c.k}</b>, c.n, pct(c.n / (items.length || 1), 0), pct(c.value / totalValue, 0), s.freq[c.k], c.counts])} foot={['Total', items.length, '100%', '100%', '', tasks.length]} />
        </Panel>
        <Panel title="Calendar" actions={<Select label="Month" value={month} onChange={setMonth} options={months.map((m) => [m, new Date(m + '-01T00:00:00Z').toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })] as [string, string])} />}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {WD.map((w) => <div key={w} className="muted" style={{ fontSize: 12, textAlign: 'center' }}>{w}</div>)}
            {cal.map((d, i) => {
              if (!d) return <div key={`e${i}`} />
              const n = perDay.get(d)?.length ?? 0
              return (
                <button key={d} type="button" onClick={() => setDay(d)} style={{ minHeight: 52, borderRadius: 8, border: d === day ? '2px solid var(--accent)' : '1px solid var(--line)', background: n ? `color-mix(in srgb, var(--accent) ${Math.round(10 + (n / maxLoad) * 35)}%, var(--panel))` : 'var(--panel2)', color: 'var(--fg)', cursor: 'pointer', padding: 4, textAlign: 'left' }}>
                  <div style={{ fontSize: 12 }}>{+d.slice(8)}</div>
                  {n > 0 && <b style={{ fontSize: 15 }}>{n}</b>}
                </button>
              )
            })}
          </div>
        </Panel>
        <Panel title={`Counts on ${day}`} actions={<Row>
          <Btn kind="primary" onClick={() => print([day], `Count sheet ${day}`)}>🖨 Day sheet</Btn>
          <Btn onClick={() => print(weekOf(day), `Count sheets week of ${day}`)}>🖨 Week</Btn>
          <CsvButton name="cycle-count-schedule.csv" rows={() => [['date', 'sku', 'name', 'location', 'class', 'round'], ...tasks.map((t) => { const it = bySku.get(t.sku)!; return [t.day, t.sku, it.name, it.location, it.klass, t.round] })]} />
        </Row>}>
          {dayItems.length ? <Table head={['Location', 'SKU', 'Description', 'Class']} rows={dayItems.map((x) => [x.location, x.sku, x.name, <b key="k" style={{ color: CLS_COLOR[x.klass] }}>{x.klass}</b>])} /> : <p className="muted">No counts on this day (weekend, holiday or outside the period).</p>}
          <p className="muted" style={{ fontSize: 13 }}>Items are sorted by location for an efficient walking route. Sheets leave the system quantity blank so counters count blind.</p>
        </Panel>
      </div>
    </Split>
  )
}
