import { Fragment, useMemo, useState } from 'react'
import { Btn, CopyButton, Note, Num, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { DAYS, describe, FIELDS, MONTHS, nextRuns, parseCron, type FieldSpec } from './lib/cron-expression-builder'

const DEF = { expr: '30 9 * * 1-5', utc: false, count: 10 }

const PRESETS: [string, string][] = [
  ['Every minute', '* * * * *'],
  ['Every 5 minutes', '*/5 * * * *'],
  ['Hourly', '0 * * * *'],
  ['Daily at midnight', '0 0 * * *'],
  ['Weekdays 9:30', '30 9 * * 1-5'],
  ['Every 15 min, office hours', '*/15 9-17 * * 1-5'],
  ['Sundays 03:00 (backups)', '0 3 * * 0'],
  ['1st of month', '0 0 1 * *'],
  ['Quarterly', '0 6 1 1,4,7,10 *'],
  ['Twice a day', '0 8,20 * * *'],
]

type Mode = 'every' | 'step' | 'list' | 'range' | 'custom'

function modeOf(t: string): Mode {
  if (t === '*' || t === '?') return 'every'
  if (/^\*\/\d+$/.test(t)) return 'step'
  if (/^\d+-\d+$/.test(t)) return 'range'
  if (/^\d+(,\d+)*$/.test(t)) return 'list'
  return 'custom'
}

const short = (f: FieldSpec, v: number) => (f.key === 'month' ? MONTHS[v - 1].slice(0, 3) : f.key === 'dow' ? DAYS[v].slice(0, 3) : String(v))

function FieldEditor({ f, token, onChange }: { f: FieldSpec; token: string; onChange: (t: string) => void }) {
  const mode = modeOf(token)
  const vals = useMemo(() => {
    try {
      return new Set(
        token.split(',').flatMap((p) => (/^\d+$/.test(p) ? [Number(p) === 7 && f.key === 'dow' ? 0 : Number(p)] : [])),
      )
    } catch {
      return new Set<number>()
    }
  }, [token, f.key])
  const all = Array.from({ length: f.max - f.min + 1 }, (_, i) => i + f.min)
  const setMode = (m: Mode) => {
    if (m === 'every') onChange('*')
    if (m === 'step') onChange(`*/${f.key === 'minute' ? 15 : 2}`)
    if (m === 'list') onChange(String(f.min))
    if (m === 'range') onChange(`${f.min}-${f.key === 'dow' ? 5 : Math.min(f.max, f.min + 5)}`)
  }
  const [a, b] = mode === 'range' ? token.split('-').map(Number) : [f.min, f.max]
  return (
    <div style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
      <Row>
        <b style={{ minWidth: 110 }}>{f.label}</b>
        <code className="mono" style={{ color: 'var(--accent)' }}>{token}</code>
      </Row>
      <div style={{ margin: '6px 0' }}>
        <Seg value={mode === 'custom' ? 'every' : mode} onChange={setMode} label={f.label} options={[['every', 'Every'], ['step', 'Every N'], ['list', 'Specific'], ['range', 'Range']]} />
      </div>
      {mode === 'custom' && <Note>Custom field — edit it in the expression box above.</Note>}
      {mode === 'step' && (
        <Num label={`Every N ${f.label.toLowerCase()}s`} value={Number(token.slice(2))} min={1} max={f.max} step={1} onChange={(n) => n >= 1 && onChange(`*/${Math.round(n)}`)} />
      )}
      {mode === 'range' && (
        <Row>
          <Num label="From" value={a} min={f.min} max={f.max} step={1} onChange={(v) => onChange(`${Math.round(v)}-${Math.max(Math.round(v), b)}`)} />
          <Num label="To" value={b} min={f.min} max={f.max} step={1} onChange={(v) => onChange(`${Math.min(a, Math.round(v))}-${Math.round(v)}`)} />
        </Row>
      )}
      {mode === 'list' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {all.map((v) => {
            const on = vals.has(v)
            return (
              <button
                key={v}
                type="button"
                className={`k-btn ${on ? 'primary' : 'ghost'}`}
                style={{ minWidth: f.names ? 48 : 34, padding: '3px 6px', fontSize: 12 }}
                onClick={() => {
                  const n = new Set(vals)
                  if (on) n.delete(v)
                  else n.add(v)
                  if (n.size === 0) return
                  onChange([...n].sort((x, y) => x - y).join(','))
                }}
              >
                {short(f, v)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function CronExpressionBuilder() {
  const [s, set, reset] = useToolState('cron-expression-builder', DEF)
  const [now] = useState(() => new Date())
  const parsed = useMemo(() => {
    try {
      const c = parseCron(s.expr)
      return { c, text: describe(s.expr), err: '' }
    } catch (e) {
      return { c: null, text: '', err: (e as Error).message }
    }
  }, [s.expr])
  const count = Math.max(1, Math.min(50, Math.round(s.count) || 10))
  const runs = useMemo(() => (parsed.c ? nextRuns(parsed.c, now, count, s.utc) : []), [parsed.c, now, count, s.utc])
  // Heat map: runs over the next 7 days by weekday x hour.
  const heat = useMemo(() => {
    const g = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
    if (!parsed.c) return { g, total: 0 }
    const end = now.getTime() + 7 * 864e5
    const r = nextRuns(parsed.c, now, 10080, s.utc).filter((t) => t.getTime() <= end)
    for (const t of r) g[s.utc ? t.getUTCDay() : t.getDay()][s.utc ? t.getUTCHours() : t.getHours()]++
    return { g, total: r.length }
  }, [parsed.c, now, s.utc])
  const maxHeat = Math.max(1, ...heat.g.flat())
  const tokens = parsed.c ? parsed.c.fields : null
  const setToken = (i: number, t: string) => {
    if (!tokens) return
    const n = [...tokens]
    n[i] = t
    set({ expr: n.join(' ') })
  }
  const fmtRun = (t: Date) =>
    t.toLocaleString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: s.utc ? 'UTC' : undefined })
  const gap = runs.length > 1 ? (runs[1].getTime() - runs[0].getTime()) / 60000 : NaN
  const rel = (t: Date) => {
    const m = Math.round((t.getTime() - now.getTime()) / 60000)
    return m < 60 ? `in ${m} min` : m < 1440 ? `in ${(m / 60).toFixed(1)} h` : `in ${(m / 1440).toFixed(1)} days`
  }

  return (
    <Split>
      <div>
        <Panel title="Expression" actions={<><CopyButton text={s.expr} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <Txt label="Cron expression (minute hour day month weekday)" value={s.expr} onChange={(expr) => set({ expr })} placeholder="*/5 * * * *" />
          {parsed.err ? <Note tone="err">{parsed.err}</Note> : <Note tone="ok"><b>{parsed.text}</b></Note>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {PRESETS.map(([n, e]) => (
              <Btn key={n} kind={s.expr === e ? 'primary' : 'normal'} onClick={() => set({ expr: e })}>{n}</Btn>
            ))}
          </div>
        </Panel>
        <Panel title="Field builder">
          {tokens ? FIELDS.map((f, i) => <FieldEditor key={f.key} f={f} token={tokens[i]} onChange={(t) => setToken(i, t)} />) : <Note tone="warn">Fix the expression to use the builder (or pick a preset).</Note>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Next run" value={runs[0] ? rel(runs[0]) : '—'} sub={runs[0] ? fmtRun(runs[0]) : 'never'} tone="accent" />
          <Stat label="Runs in next 7 days" value={heat.total >= 10080 ? '10080+' : heat.total} />
          <Stat label="Gap to following run" value={Number.isFinite(gap) ? (gap < 120 ? `${gap} min` : gap < 2880 ? `${(gap / 60).toFixed(1)} h` : `${(gap / 1440).toFixed(1)} d`) : '—'} />
        </Stats>
        <Panel
          title={`Next ${count} runs`}
          actions={
            <>
              <Seg value={s.utc ? 'utc' : 'local'} onChange={(v) => set({ utc: v === 'utc' })} options={[['local', 'Local time'], ['utc', 'UTC']]} />
              <CopyButton label="Copy list" text={() => runs.map((t) => (s.utc ? t.toISOString() : fmtRun(t))).join('\n')} />
            </>
          }
        >
          <Row>
            <Num label="How many" value={s.count} min={1} max={50} step={1} onChange={(c) => set({ count: c })} />
          </Row>
          {runs.length === 0 && !parsed.err && <Note tone="warn">This schedule never fires within 30 years (e.g. February 30th).</Note>}
          <Table head={['#', 'When', 'From now']} rows={runs.map((t, i) => [i + 1, <span key="w" className="mono">{fmtRun(t)}</span>, rel(t)])} />
        </Panel>
        <Panel title="Next 7 days — runs per hour">
          <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '38px repeat(24, minmax(14px, 1fr))', gap: 2, fontSize: 11, minWidth: 420 }}>
              <span />
              {Array.from({ length: 24 }, (_, h) => <span key={h} className="muted" style={{ textAlign: 'center' }}>{h % 3 === 0 ? h : ''}</span>)}
              {heat.g.map((row, d) => (
                <Fragment key={d}>
                  <span className="muted">{DAYS[d].slice(0, 3)}</span>
                  {row.map((v, h) => (
                    <span key={`${d}-${h}`} title={`${DAYS[d]} ${String(h).padStart(2, '0')}:00 — ${v} run(s)`} style={{ height: 16, borderRadius: 3, background: v ? 'var(--accent)' : 'var(--line)', opacity: v ? 0.3 + 0.7 * (v / maxHeat) : 0.5 }} />
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
        </Panel>
        <Panel title="Syntax cheat sheet">
          <Table
            head={['Symbol', 'Meaning', 'Example']}
            rows={[
              ['*', 'any value', '* * * * * → every minute'],
              [',', 'list', '0 8,20 * * * → 08:00 and 20:00'],
              ['-', 'range', '0 9 * * 1-5 → weekdays'],
              ['/', 'step', '*/10 * * * * → every 10 min'],
              ['JAN–DEC, SUN–SAT', 'names', '0 0 1 JAN * → New Year'],
              ['@daily, @hourly…', 'macros', '@weekly = 0 0 * * 0'],
            ]}
          />
          <Note>When both day-of-month and day-of-week are restricted, cron runs when <i>either</i> matches (standard Vixie behaviour). Weekday 0 and 7 are both Sunday.</Note>
        </Panel>
      </div>
    </Split>
  )
}
