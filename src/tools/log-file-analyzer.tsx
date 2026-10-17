import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { Bar, Btn, Check, CsvButton, FileDrop, Note, num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, Txt, useToolState, Area } from '../kit'
import { customFormat, detectFormat, FORMATS, histogram, LEVEL_COLOR, LEVELS, lineSplitter, parseLine, sampleLog, template, type Entry, type Format, type Level } from './lib/log-file-analyzer'

const MAX_ENTRIES = 300_000
const DEF = {
  sample: 'app' as 'app' | 'access',
  format: 'auto',
  custom: '^(?<time>\\S+ \\S+) (?<level>\\w+) (?<msg>.*)$',
  levels: ['ERROR', 'WARN', 'INFO', 'DEBUG', 'OTHER'] as Level[],
  q: '',
  regex: false,
  field: '',
}

interface Parsed {
  name: string
  bytes: number
  lines: number
  entries: Entry[]
  unparsed: number
  unparsedEx: string[]
  format: Format
  truncated: boolean
}

function makeParser(fmt: Format) {
  const p: Parsed = { name: '', bytes: 0, lines: 0, entries: [], unparsed: 0, unparsedEx: [], format: fmt, truncated: false }
  const year = new Date().getUTCFullYear()
  const onLine = (l: string) => {
    p.lines++
    if (!l.trim()) return
    const e = parseLine(l, fmt, year)
    if (e) {
      if (p.entries.length < MAX_ENTRIES) { e.line = l.slice(0, 1000); p.entries.push(e) } else p.truncated = true
      return
    }
    const prev = p.entries[p.entries.length - 1]
    if (prev && (/^\s/.test(l) || /^(Caused by|Traceback|\.\.\. \d+ more)/.test(l))) {
      prev.extra++
      if (prev.line.length < 4000) prev.line += '\n' + l
      return
    }
    p.unparsed++
    if (p.unparsedEx.length < 5) p.unparsedEx.push(l.slice(0, 200))
  }
  return { p, onLine }
}

const fmtTime = (t: number, w = 60000) => {
  const iso = new Date(t).toISOString()
  return w >= 86400000 ? iso.slice(0, 10) : w >= 60000 ? iso.slice(5, 16).replace('T', ' ') : iso.slice(11, 19)
}

function Timeline({ entries, sel, onSel }: { entries: Entry[]; sel: [number, number] | null; onSel: (r: [number, number] | null) => void }) {
  const { width, buckets } = useMemo(() => histogram(entries, 60), [entries])
  if (!buckets.length) return <Note>No timestamps found — the timeline needs a time field.</Note>
  const W = 800, H = 200, L = 44, B = 26, T = 8
  const max = Math.max(1, ...buckets.map((b) => b.counts.reduce((a, c) => a + c, 0)))
  const bw = (W - L - 4) / buckets.length
  const sy = (v: number) => ((H - B - T) * v) / max
  const every = Math.ceil(buckets.length / 8)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="log timeline">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W} y1={H - B - sy(max * f)} y2={H - B - sy(max * f)} stroke="var(--grid)" />
            <text x={L - 6} y={H - B - sy(max * f) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{num(max * f, 0)}</text>
          </g>
        ))}
        {buckets.map((b, i) => {
          let y = H - B
          const on = sel && b.t >= sel[0] && b.t < sel[1]
          const total = b.counts.reduce((a, c) => a + c, 0)
          return (
            <g key={b.t} style={{ cursor: 'pointer' }} opacity={sel && !on ? 0.35 : 1} onClick={() => onSel(on ? null : [b.t, b.t + width])}>
              <rect x={L + i * bw} y={T} width={bw} height={H - B - T} fill="transparent" />
              {b.counts.map((c, j) => {
                if (!c) return null
                const h = sy(c)
                y -= h
                return <rect key={j} x={L + i * bw + 1} y={y} width={Math.max(1, bw - 2)} height={h} fill={LEVEL_COLOR[LEVELS[j]]} />
              })}
              <title>{`${fmtTime(b.t, width)} UTC — ${total} entries\n${LEVELS.map((l, j) => (b.counts[j] ? `${l}: ${b.counts[j]}` : '')).filter(Boolean).join('  ')}`}</title>
              {i % every === 0 && <text x={L + i * bw} y={H - 8} fontSize={11} fill="var(--muted)">{fmtTime(b.t, width)}</text>}
            </g>
          )
        })}
      </svg>
      <Row>
        {LEVELS.map((l) => <span key={l} className="muted" style={{ fontSize: 12 }}><i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: LEVEL_COLOR[l], marginRight: 4 }} />{l}</span>)}
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>bucket = {width >= 3600000 ? `${width / 3600000} h` : width >= 60000 ? `${width / 60000} min` : `${width / 1000} s`} · click a bar to zoom the table</span>
      </Row>
    </div>
  )
}

export default function LogFileAnalyzer() {
  const [s, set, reset] = useToolState('log-file-analyzer', DEF)
  const [paste, setPaste] = useState('')
  const [file, setFile] = useState<Parsed | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [range, setRange] = useState<[number, number] | null>(null)
  const job = useRef(0)

  const fmt: Format | string = s.format === 'custom' ? customFormat(s.custom) : FORMATS.find((f) => f.id === s.format) ?? 'auto'

  const parseText = (text: string, name: string): Parsed => {
    const lines = text.split(/\r?\n/)
    const f = typeof fmt === 'string' ? detectFormat(lines) : fmt
    const { p, onLine } = makeParser(f)
    lines.forEach(onLine)
    return { ...p, name, bytes: text.length }
  }

  const textData = useMemo(() => (file ? null : parseText(paste.trim() ? paste : sampleLog(s.sample), paste.trim() ? 'Pasted text' : `Sample ${s.sample === 'app' ? 'application' : 'access'} log`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [file, paste, s.sample, s.format, s.custom])
  const data = file ?? textData!

  const loadFile = async (f: File) => {
    const id = ++job.current
    setRange(null)
    setProgress(0)
    const reader = f.stream().pipeThrough(new TextDecoderStream()).getReader()
    let parser: ReturnType<typeof makeParser> | null = null
    let head: string[] = []
    let split = lineSplitter((l) => head.push(l))
    let read = 0, lastUi = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (id !== job.current) { void reader.cancel(); return }
      if (done) break
      read += value.length
      split.push(value)
      if (!parser && (head.length >= 200 || read > 256_000)) {
        parser = makeParser(typeof fmt === 'string' ? detectFormat(head) : fmt)
        head.forEach(parser.onLine)
        head = []
        const pp = parser
        split = lineSplitter(pp.onLine)
      }
      if (performance.now() - lastUi > 120) {
        lastUi = performance.now()
        setProgress(Math.min(0.99, read / Math.max(1, f.size)))
        await new Promise((r) => setTimeout(r))
      }
    }
    split.end()
    if (!parser) {
      parser = makeParser(typeof fmt === 'string' ? detectFormat(head) : fmt)
      head.forEach(parser.onLine)
    }
    setFile({ ...parser.p, name: f.name, bytes: f.size })
    setProgress(null)
  }

  const q = useDeferredValue(s.q)
  const matcher = useMemo(() => {
    if (!q) return null
    if (s.regex) {
      try { const re = new RegExp(q, 'i'); return (t: string) => re.test(t) } catch { return 'bad' as const }
    }
    const lq = q.toLowerCase()
    return (t: string) => t.toLowerCase().includes(lq)
  }, [q, s.regex])

  const byLevel = useMemo(() => data.entries.filter((e) => s.levels.includes(e.level) && (typeof matcher !== 'function' || matcher(e.line))), [data, s.levels, matcher])
  const filtered = useMemo(() => (range ? byLevel.filter((e) => e.ts !== null && e.ts >= range[0] && e.ts < range[1]) : byLevel), [byLevel, range])

  const { counts, t0, span } = useMemo(() => {
    const c = LEVELS.map(() => 0)
    let a = Infinity, b = -Infinity
    for (const e of data.entries) {
      c[LEVELS.indexOf(e.level)]++
      if (e.ts !== null) { a = Math.min(a, e.ts); b = Math.max(b, e.ts) }
    }
    return { counts: c, t0: a, span: Number.isFinite(a) ? b - a : 0 }
  }, [data])

  const templates = useMemo(() => {
    const m = new Map<string, { n: number; level: Level; ex: string }>()
    for (const e of filtered) {
      const k = e.level + '|' + template(e.msg)
      const t = m.get(k)
      if (t) t.n++
      else m.set(k, { n: 1, level: e.level, ex: e.msg })
    }
    return [...m.entries()].map(([k, v]) => ({ t: k.split('|').slice(1).join('|'), ...v })).sort((a, b) => b.n - a.n).slice(0, 15)
  }, [filtered])

  const fieldNames = useMemo(() => {
    const set = new Set<string>()
    for (const e of data.entries.slice(0, 500)) for (const k of Object.keys(e.fields)) if (!['time', 'msg', 'message', 'ts', 'timestamp'].includes(k)) set.add(k)
    return [...set]
  }, [data])
  const field = fieldNames.includes(s.field) ? s.field : fieldNames.includes('status') ? 'status' : fieldNames.includes('level') ? 'level' : fieldNames[0] ?? ''
  const topValues = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of filtered) { const v = e.fields[field]; if (v !== undefined) m.set(v, (m.get(v) ?? 0) + 1) }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  }, [filtered, field])

  const toggleLevel = (l: Level) => set({ levels: s.levels.includes(l) ? s.levels.filter((x) => x !== l) : [...s.levels, l] })

  return (
    <Split wide="right">
      <div>
        <Panel title="Log source" actions={file && <Btn kind="ghost" onClick={() => { job.current++; setFile(null); setRange(null) }}>✕ Close file</Btn>}>
          <FileDrop accept=".log,.txt,.json,.jsonl,.out,text/*" onFiles={(fs) => void loadFile(fs[0])} label="Drop a log file (any size — streamed)" />
          {progress !== null && <div style={{ marginTop: 8 }}><Bar value={progress} /> <span className="muted">Reading… {pct(progress, 0)}</span></div>}
          {!file && (
            <>
              <p className="muted" style={{ margin: '10px 0 6px' }}>…or try a sample / paste lines:</p>
              <Seg value={s.sample} onChange={(sample) => { setPaste(''); set({ sample }) }} options={[['app', 'App log'], ['access', 'Nginx access log']]} />
              <div style={{ marginTop: 8 }}><Area value={paste} onChange={setPaste} rows={4} mono placeholder="Paste log lines here" /></div>
            </>
          )}
        </Panel>
        <Panel title="Format">
          <Select label="Line format" value={s.format} onChange={(format) => set({ format })} options={[['auto', `Auto-detect${s.format === 'auto' ? ` (${data.format.name})` : ''}`], ...FORMATS.map((f) => [f.id, f.name] as [string, string]), ['custom', 'Custom regex…']]} />
          {s.format === 'custom' && <Txt label="Regex with named groups" value={s.custom} onChange={(custom) => set({ custom })} hint="Groups: time, level, msg (+ any others become fields)" />}
          {typeof fmt === 'string' && fmt !== 'auto' && <Note tone="err">{fmt}</Note>}
          {data.unparsed > 0 && (
            <Note tone="warn">
              {num(data.unparsed, 0)} lines did not match, e.g. <code style={{ wordBreak: 'break-all' }}>{data.unparsedEx[0]}</code>
            </Note>
          )}
          {file && <Note>Changing the format applies to the next file you load.</Note>}
        </Panel>
        <Panel title="Filter" actions={<Btn kind="ghost" onClick={() => { reset(); setRange(null) }}>Reset</Btn>}>
          <Row>
            {LEVELS.map((l, i) => (
              <button key={l} type="button" className={`k-btn ${s.levels.includes(l) ? '' : 'ghost'}`} onClick={() => toggleLevel(l)} style={{ borderColor: LEVEL_COLOR[l], opacity: s.levels.includes(l) ? 1 : 0.5 }}>
                {l} <span className="muted">{num(counts[i], 0)}</span>
              </button>
            ))}
          </Row>
          <Txt label="Search" value={s.q} onChange={(q) => set({ q })} placeholder={s.regex ? 'timeout|refused' : 'text to find'} />
          <Check label="Regular expression" value={s.regex} onChange={(regex) => set({ regex })} />
          {matcher === 'bad' && <Note tone="err">Invalid regular expression.</Note>}
          {range && (
            <Note>
              Time window {fmtTime(range[0], 1000)} → {fmtTime(range[1], 1000)} UTC <Btn kind="ghost" onClick={() => setRange(null)}>Clear</Btn>
            </Note>
          )}
        </Panel>
        <Panel title={`Top values: ${field || '—'}`}>
          {fieldNames.length > 0 && <Select label="Field" value={field} onChange={(f) => set({ field: f })} options={fieldNames} />}
          {topValues.map(([v, n]) => (
            <div key={v} style={{ margin: '6px 0' }}>
              <Row wrap={false}><span className="mono" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span><b>{num(n, 0)}</b></Row>
              <Bar value={n} max={topValues[0][1]} />
            </div>
          ))}
          {!topValues.length && <p className="muted">No extracted fields for the current filter.</p>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Lines" value={num(data.lines, 0)} sub={`${data.name} · ${data.bytes > 1e6 ? num(data.bytes / 1e6, 1) + ' MB' : num(data.bytes / 1e3, 1) + ' kB'}`} />
          <Stat label="Errors" value={num(counts[0], 0)} sub={pct(counts[0] / (data.entries.length || 1)) + ' of entries'} tone={counts[0] ? 'bad' : 'good'} />
          <Stat label="Warnings" value={num(counts[1], 0)} />
          <Stat label="Time span" value={span >= 86400000 ? `${num(span / 86400000, 1)} d` : span >= 3600000 ? `${num(span / 3600000, 1)} h` : `${num(span / 60000, 1)} min`} sub={Number.isFinite(t0) ? `from ${fmtTime(t0)}` : 'no timestamps'} />
        </Stats>
        {data.truncated && <Note tone="warn">Only the first {num(MAX_ENTRIES, 0)} entries are kept for filtering.</Note>}
        <Panel title="Timeline (UTC)">
          <Timeline entries={byLevel} sel={range} onSel={setRange} />
        </Panel>
        <Panel title="Most frequent messages" actions={<span className="muted">numbers, IPs and IDs are grouped</span>}>
          <Table
            head={['Count', 'Level', 'Message pattern']}
            rows={templates.map((t) => [
              <div key="n" style={{ minWidth: 80, display: 'grid', gap: 3 }}><b>{num(t.n, 0)}</b><Bar value={t.n} max={templates[0].n} color={LEVEL_COLOR[t.level]} /></div>,
              <span key="l" style={{ color: LEVEL_COLOR[t.level], fontWeight: 700 }}>{t.level}</span>,
              <span key="t" className="mono" style={{ fontSize: 12 }} title={t.ex}>{t.t}</span>,
            ])}
          />
        </Panel>
        <Panel
          title={`Matching entries (${num(filtered.length, 0)})`}
          actions={<CsvButton name="log-filtered.csv" rows={() => [['time', 'level', 'message', 'line'], ...filtered.map((e) => [e.ts === null ? '' : new Date(e.ts).toISOString(), e.level, e.msg, e.line])]} />}
        >
          <div style={{ maxHeight: 420, overflow: 'auto', fontFamily: 'var(--mono)', fontSize: 12 }}>
            {filtered.slice(0, 300).map((e, i) => (
              <div key={i} style={{ borderLeft: `3px solid ${LEVEL_COLOR[e.level]}`, padding: '2px 8px', margin: '2px 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {e.line}
              </div>
            ))}
            {filtered.length > 300 && <p className="muted">+ {num(filtered.length - 300, 0)} more — narrow the filter or export CSV.</p>}
            {!filtered.length && <p className="muted">Nothing matches the filter.</p>}
          </div>
        </Panel>
      </div>
    </Split>
  )
}
