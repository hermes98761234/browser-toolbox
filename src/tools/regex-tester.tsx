import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Btn, Check, CopyButton, CsvButton, Note, Panel, Row, shareLink, Split, Stat, Stats, Table, useToolState } from '../kit'
import { explain, runRegex, type RunResult } from './lib/regex-tester'

interface State { pattern: string; flags: string; text: string; replace: boolean; replacement: string }
const DEF: State = {
  pattern: '(?<user>[\\w.+-]+)@(?<domain>[\\w-]+(?:\\.[\\w-]+)+)',
  flags: 'gi',
  text: `Contact the team:
  Ana Souza <ana.souza@example.com>
  sales: SALES+eu@shop.co.uk, support@help-desk.io
  not an email: john@localhost, @handle, mail@
Last updated 2026-10-17 by admin@example.org`,
  replace: true,
  replacement: '$<user> [at] $<domain>',
}

const FLAGS: [string, string][] = [['g', 'global — find all matches'], ['i', 'ignore case'], ['m', 'multiline — ^ and $ match at line breaks'], ['s', 'dotAll — . matches newlines'], ['u', 'unicode — code points, \\p{…}'], ['y', 'sticky — match only at lastIndex'], ['v', 'unicodeSets — set operations in classes']]
const supportsV = (() => { try { new RegExp('', 'v'); return true } catch { return false } })()

const LIB: [string, string, string][] = [
  ['Email', '(?<user>[\\w.+-]+)@(?<domain>[\\w-]+(?:\\.[\\w-]+)+)', 'gi'],
  ['URL', 'https?:\\/\\/(?:www\\.)?[-\\w@:%.+~#=]{1,256}\\.[a-z]{2,63}\\b(?:[-\\w@:%+.~#?&/=]*)', 'gi'],
  ['IPv4', '\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b', 'g'],
  ['ISO date', '\\b(?<year>\\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\\d|3[01])\\b', 'g'],
  ['Time 24h', '\\b(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?\\b', 'g'],
  ['Hex colour', '#(?:[0-9a-f]{3}){1,2}\\b', 'gi'],
  ['Phone (intl)', '\\+?\\d{1,3}[\\s.-]?\\(?\\d{2,4}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{2,4}', 'g'],
  ['Number', '-?\\d+(?:[.,]\\d+)?', 'g'],
  ['Duplicate word', '\\b(\\w+)\\s+\\1\\b', 'gi'],
  ['Hashtag', '#[\\p{L}\\p{N}_]+', 'gu'],
  ['Blank lines', '^\\s*$', 'gm'],
]

const MONO: CSSProperties = { fontFamily: 'var(--mono)', fontSize: 14, lineHeight: '22px', padding: 10, margin: 0, border: '1px solid var(--line)', borderRadius: 10, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', boxSizing: 'border-box', scrollbarGutter: 'stable' }
const COLORS = ['rgb(99 102 241 / .28)', 'rgb(14 165 233 / .28)']
const KIND_COLOR: Record<string, string> = { group: '#a855f7', class: '#0ea5e9', quant: '#f59e0b', anchor: '#ef4444', escape: '#10b981', literal: 'var(--fg)', alt: '#ec4899' }

const WORKER_SRC = `const runRegex = ${runRegex.toString()};\nself.onmessage = (e) => { const d = e.data; self.postMessage({ id: d.id, res: runRegex(d.p, d.f, d.t, d.r, d.max) }) }`
const EMPTY: RunResult = { hits: [], error: '', replaced: '', truncated: false, ms: 0 }

export default function RegexTester() {
  const [s, set, reset] = useToolState('regex-tester', DEF)
  const [res, setRes] = useState<RunResult>(EMPTY)
  const [pick, setPick] = useState(0)
  const worker = useRef<Worker | null>(null)
  const pre = useRef<HTMLPreElement>(null)
  const seq = useRef(0)

  useEffect(() => {
    const id = ++seq.current
    const job = { id, p: s.pattern, f: s.flags, t: s.text, r: s.replace ? s.replacement : null, max: 5000 }
    let timer = 0
    const t = setTimeout(() => {
      try {
        if (!worker.current) worker.current = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })))
      } catch {
        setRes(runRegex(job.p, job.f, job.t, job.r, job.max))
        return
      }
      const w = worker.current
      timer = window.setTimeout(() => {
        w.terminate()
        worker.current = null
        if (seq.current === id) setRes({ ...EMPTY, error: 'Stopped after 1.5 s — this pattern probably causes catastrophic backtracking (e.g. nested quantifiers like (a+)+). Simplify it or make it more specific.' })
      }, 1500)
      w.onmessage = (e: MessageEvent<{ id: number; res: RunResult }>) => {
        if (e.data.id !== seq.current) return
        clearTimeout(timer)
        setRes(e.data.res)
      }
      w.postMessage(job)
    }, 120)
    return () => {
      clearTimeout(t)
      clearTimeout(timer)
    }
  }, [s.pattern, s.flags, s.text, s.replace, s.replacement])
  useEffect(() => () => worker.current?.terminate(), [])

  const toggle = (f: string) => {
    let flags = s.flags.includes(f) ? s.flags.replace(f, '') : s.flags + f
    if (f === 'u' && flags.includes('u')) flags = flags.replace('v', '')
    if (f === 'v' && flags.includes('v')) flags = flags.replace('u', '')
    set({ flags: [...flags].sort((a, b) => 'dgimsuvy'.indexOf(a) - 'dgimsuvy'.indexOf(b)).join('') })
  }
  const toks = useMemo(() => explain(s.pattern), [s.pattern])
  const hits = res.hits
  const sel = hits[Math.min(pick, hits.length - 1)]
  const groupCount = hits[0]?.groups.length ?? 0

  const marked = useMemo(() => {
    const parts: ReactNode[] = []
    let at = 0
    hits.forEach((h, i) => {
      if (h.index > at) parts.push(s.text.slice(at, h.index))
      const on = sel === h
      parts.push(
        <mark key={i} style={{ background: on ? 'rgb(245 158 11 / .45)' : COLORS[i % 2], color: 'transparent', borderRadius: 3, boxShadow: h.end === h.index ? '0 0 0 1px var(--err)' : on ? '0 0 0 1px #f59e0b' : undefined }}>
          {s.text.slice(h.index, h.end)}
        </mark>,
      )
      at = h.end
    })
    parts.push(s.text.slice(at) + '\n')
    return parts
  }, [hits, s.text, sel])

  return (
    <div>
      <Panel title="Pattern" actions={<><CopyButton text={() => shareLink(s)} label="Share link" /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, ...MONO, padding: '4px 10px', background: 'var(--panel)', borderColor: res.error ? 'var(--err)' : 'var(--line)' }}>
          <span className="muted">/</span>
          <input value={s.pattern} onChange={(e) => set({ pattern: e.target.value })} spellCheck={false} aria-label="Regular expression" style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: 'transparent', color: 'inherit', font: 'inherit', padding: '6px 0' }} />
          <span className="muted">/</span>
          <b style={{ color: 'var(--accent)' }}>{s.flags}</b>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {FLAGS.filter(([f]) => f !== 'v' || supportsV).map(([f, d]) => (
            <button key={f} type="button" title={d} onClick={() => toggle(f)} className={`k-btn ${s.flags.includes(f) ? 'primary' : ''}`} style={{ fontFamily: 'var(--mono)' }}>
              {f} <span style={{ fontFamily: 'inherit', fontSize: 12, opacity: 0.8 }}>{d.split(' —')[0]}</span>
            </button>
          ))}
        </div>
        {res.error && <Note tone="err">{res.error}</Note>}
        <div className="k-label" style={{ marginTop: 10 }}>Common patterns</div>
        <Row>
          {LIB.map(([n, p, f]) => (
            <Btn key={n} kind={s.pattern === p ? 'primary' : 'ghost'} onClick={() => set({ pattern: p, flags: f })}>{n}</Btn>
          ))}
        </Row>
      </Panel>
      <div style={{ height: 16 }} />
      <Split>
        <div>
          <Panel title="Test string">
            <div style={{ position: 'relative' }}>
              <pre ref={pre} aria-hidden style={{ ...MONO, position: 'absolute', inset: 0, color: 'transparent', overflow: 'hidden', borderColor: 'transparent', pointerEvents: 'none' }}>{marked}</pre>
              <textarea
                value={s.text}
                onChange={(e) => set({ text: e.target.value })}
                onScroll={(e) => { if (pre.current) pre.current.scrollTop = e.currentTarget.scrollTop }}
                spellCheck={false}
                rows={10}
                aria-label="Test string"
                style={{ ...MONO, position: 'relative', width: '100%', resize: 'vertical', background: 'transparent', color: 'var(--fg)', display: 'block', minHeight: 200 }}
              />
            </div>
            <p className="muted" style={{ fontSize: 13 }}>Matches are highlighted as you type; the selected match is orange, empty matches get a red outline.</p>
          </Panel>
          <Panel title="Replace">
            <Check label="Show replacement result" value={s.replace} onChange={(replace) => set({ replace })} />
            {s.replace && (
              <>
                <input className="k-text" value={s.replacement} onChange={(e) => set({ replacement: e.target.value })} spellCheck={false} aria-label="Replacement" style={{ fontFamily: 'var(--mono)', width: '100%' }} placeholder="$1, $<name>, $& (whole match), $$ (literal $)" />
                <pre style={{ ...MONO, background: 'var(--panel2)', marginTop: 8, maxHeight: 260, overflow: 'auto' }}>{res.replaced}</pre>
                <Row><CopyButton text={() => res.replaced} label="Copy result" /></Row>
              </>
            )}
          </Panel>
        </div>
        <div>
          <Stats>
            <Stat label="Matches" value={hits.length + (res.truncated ? '+' : '')} tone={hits.length ? 'good' : 'bad'} />
            <Stat label="Capture groups" value={groupCount} />
            <Stat label="Time" value={`${res.ms} ms`} sub="runs in a worker" />
          </Stats>
          <Panel title="Matches" actions={<CsvButton name="matches.csv" rows={() => [['#', 'Index', 'Match', ...(hits[0]?.groups.map((g, i) => g.name || `$${i + 1}`) ?? [])], ...hits.map((h, i) => [i + 1, h.index, h.text, ...h.groups.map((g) => g.value ?? '')])]} />}>
            {hits.length ? (
              <Table
                max={60}
                head={['#', 'At', 'Match', ...(hits[0]?.groups.map((g, i) => (g.name ? `${g.name} ($${i + 1})` : `$${i + 1}`)) ?? [])]}
                rows={hits.map((h, i) => [
                  <button key="n" type="button" onClick={() => setPick(i)} className={`k-btn ${sel === h ? 'primary' : 'ghost'}`} style={{ padding: '0 8px', minHeight: 0 }}>{i + 1}</button>,
                  `${h.index}–${h.end}`,
                  <code key="m" style={{ whiteSpace: 'pre-wrap' }}>{h.text === '' ? <span className="muted">(empty)</span> : h.text}</code>,
                  ...h.groups.map((g, j) => <code key={j}>{g.value === undefined ? <span className="muted">—</span> : g.value}</code>),
                ])}
              />
            ) : (
              <Note tone="warn">No matches.</Note>
            )}
          </Panel>
          <Panel title="Explanation">
            {toks.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '3px 0', borderBottom: '1px dashed var(--line)' }}>
                <code style={{ color: KIND_COLOR[t.kind], fontWeight: 700, minWidth: 90, wordBreak: 'break-all' }}>{t.src}</code>
                <span style={{ fontSize: 14 }}>{t.desc}</span>
              </div>
            ))}
            {!toks.length && <span className="muted">Type a pattern above.</span>}
          </Panel>
          <Note>Uses your browser’s own JavaScript RegExp engine, so results are exactly what your JS code will get. Patterns run in a background worker with a 1.5-second limit, so a runaway pattern can’t freeze the page. The share link stores pattern, flags and text.</Note>
        </div>
      </Split>
    </div>
  )
}
