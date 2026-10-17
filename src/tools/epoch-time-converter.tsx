import { useEffect, useMemo, useState } from 'react'
import { Area, Btn, CopyButton, CsvButton, Note, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { dayOfYear, duration, fmtOffset, isoWeek, isValidZone, parseInput, relative, rfc2822, toUnit, UNIT_NAME, wallToEpoch, zoneOffset, type Unit } from './lib/epoch-time-converter'

type Force = Unit | 'auto'

const LOCAL = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

const DEF = {
  input: '1700000000',
  force: 'auto' as Force,
  zones: ['UTC', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'Europe/Kyiv', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'],
  date: '2038-01-19',
  time: '03:14:07',
  zone: 'UTC',
  batch: '0\n946684800\n1234567890\n1700000000000\n2147483647\n1735689600000000\n2024-02-29T12:00:00Z',
}

const PRESETS: [string, string][] = [
  ['Unix epoch', '0'],
  ['Y2K', '946684800'],
  ['1234567890', '1234567890'],
  ['1.7 billion', '1700000000'],
  ['Y2038 overflow', '2147483647'],
  ['2 billion', '2000000000'],
]

let ZONES: string[] = []
try {
  ZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
} catch {
  ZONES = []
}

const fmtIn = (ms: number, zone: string, opts: Intl.DateTimeFormatOptions = {}) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: 'short', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', ...opts }).format(new Date(ms))

function isoWithOffset(ms: number, zone: string) {
  const off = zoneOffset(zone, ms)
  const d = new Date(ms + off * 60000).toISOString().slice(0, 19)
  const frac = ms % 1000 ? `.${String(((ms % 1000) + 1000) % 1000).padStart(3, '0')}` : ''
  return `${d}${frac}${off === 0 ? 'Z' : fmtOffset(off).slice(3).replace('−', '-')}`
}

/** Calendar date (YYYY-MM-DD) of an instant in a zone, used to show "+1 day" markers. */
const ymd = (ms: number, zone: string) => new Date(ms + zoneOffset(zone, ms) * 60000).toISOString().slice(0, 10)

export default function EpochTimeConverter() {
  const [s, set, reset] = useToolState('epoch-time-converter', DEF)
  const [now, setNow] = useState(() => Date.now())
  const [newZone, setNewZone] = useState('')
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const p = useMemo(() => parseInput(s.input, s.force), [s.input, s.force])
  const zones = s.zones.filter(isValidZone)
  const built = wallToEpoch(s.date, s.time.length === 5 ? `${s.time}:00` : s.time, isValidZone(s.zone) ? s.zone : 'UTC')

  const rows = useMemo(() => {
    if (!p) return []
    const ms = p.ms
    const wk = isoWeek(ms)
    const sub = p.fraction ? `.${String(((ms % 1000) + 1000) % 1000).padStart(3, '0')}${p.fraction}` : ''
    return [
      ['Unix seconds', toUnit(ms, 's')],
      ['Milliseconds', toUnit(ms, 'ms')],
      ['Microseconds', p.fraction && p.unit === 'us' ? `${toUnit(ms, 'ms')}${p.fraction}` : toUnit(ms, 'us')],
      ['Nanoseconds', p.fraction && p.unit === 'ns' ? `${toUnit(ms, 'ms')}${p.fraction}` : toUnit(ms, 'ns')],
      ['ISO 8601 (UTC)', new Date(ms).toISOString()],
      [`ISO 8601 (${LOCAL})`, isoWithOffset(ms, LOCAL)],
      ['RFC 2822', rfc2822(ms)],
      ['Your local time', fmtIn(ms, LOCAL, { timeZoneName: 'short' })],
      ['Day of week / year', `${new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(new Date(ms))} · day ${dayOfYear(ms)} (UTC)`],
      ['ISO week', `${wk.year}-W${String(wk.week).padStart(2, '0')}`],
      ...(sub ? [['Sub-second (UTC)', `${new Date(ms).toISOString().slice(11, 19)}${sub}`]] : []),
      ['Hex seconds', `0x${Math.floor(ms / 1000).toString(16).toUpperCase()}`],
    ] as [string, string][]
  }, [p])

  const batch = useMemo(
    () =>
      s.batch
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 500)
        .map((l) => ({ l, r: parseInput(l) })),
    [s.batch],
  )

  const y2038 = p && p.ms > 2147483647000

  return (
    <Split wide="right">
      <div>
        <Panel title="Timestamp or date" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label="Paste a Unix timestamp or any date string" value={s.input} onChange={(input) => set({ input })} placeholder="1700000000 or 2024-05-01T10:00Z" />
          <Seg value={s.force} onChange={(force) => set({ force })} label="Unit" options={[['auto', 'Auto'], ['s', 's'], ['ms', 'ms'], ['us', 'µs'], ['ns', 'ns']]} />
          <div style={{ marginTop: 10 }}>
            {!p ? (
              <Note tone="err">Not a timestamp or a date the browser can parse. Try digits (10 = seconds, 13 = milliseconds) or ISO 8601.</Note>
            ) : (
              <Note tone="ok">
                Read as <b>{p.unit === 'date' ? 'a date string' : UNIT_NAME[p.unit]}</b>
                {s.force === 'auto' && p.unit !== 'date' && <> (autodetected from {s.input.replace(/\D/g, '').length} digits)</>}.
              </Note>
            )}
          </div>
          <Row>
            <Btn kind="primary" onClick={() => set({ input: String(Math.floor(Date.now() / 1000)), force: 'auto' })}>Now</Btn>
            {PRESETS.map(([n, v]) => (
              <Btn key={n} onClick={() => set({ input: v, force: 'auto' })}>{n}</Btn>
            ))}
          </Row>
        </Panel>

        <Panel title="Live clock">
          <div className="mono" style={{ fontSize: 26, fontWeight: 700, letterSpacing: 0.5 }}>{Math.floor(now / 1000)}</div>
          <div className="muted mono">{now} ms · {new Date(now).toISOString()}</div>
          <Row>
            <CopyButton text={() => String(Math.floor(Date.now() / 1000))} label="Copy seconds" />
            <CopyButton text={() => String(Date.now())} label="Copy ms" />
          </Row>
        </Panel>

        <Panel title="Date → timestamp">
          <Row>
            <label className="k-field">
              <span className="k-label">Date</span>
              <input className="k-text" type="date" value={s.date} onChange={(e) => set({ date: e.target.value })} />
            </label>
            <label className="k-field">
              <span className="k-label">Time</span>
              <input className="k-text" type="time" step={1} value={s.time} onChange={(e) => set({ time: e.target.value })} />
            </label>
          </Row>
          <Txt label="Time zone (IANA)" value={s.zone} onChange={(zone) => set({ zone })} hint={isValidZone(s.zone) ? fmtOffset(built === null ? 0 : zoneOffset(s.zone, built)) : 'Unknown zone, using UTC'} />
          {built === null ? (
            <Note tone="warn">Enter a full date and time.</Note>
          ) : (
            <Table
              head={['Unit', 'Value', '']}
              rows={(['s', 'ms'] as Unit[]).map((u) => [UNIT_NAME[u], <span key="v" className="mono">{toUnit(built, u)}</span>, <CopyButton key="c" text={toUnit(built, u)} />])}
            />
          )}
          <Btn onClick={() => built !== null && set({ input: toUnit(built, 's'), force: 'auto' })} disabled={built === null}>Inspect this timestamp ↑</Btn>
        </Panel>
      </div>

      <div>
        {p && (
          <Stats>
            <Stat label="Unix seconds" value={<span className="mono">{toUnit(p.ms, 's')}</span>} tone="accent" />
            <Stat label="Relative" value={relative(p.ms, now)} sub={`${p.ms < now ? '' : 'in '}${duration(p.ms - now)}${p.ms < now ? ' ago' : ''}`} />
            <Stat label="UTC" value={new Date(p.ms).toISOString().slice(0, 10)} sub={new Date(p.ms).toISOString().slice(11, 19)} />
            <Stat label="Local" value={ymd(p.ms, LOCAL)} sub={`${fmtIn(p.ms, LOCAL, { year: undefined, month: undefined, day: undefined, weekday: undefined })} ${LOCAL}`} />
          </Stats>
        )}
        {y2038 && <Note tone="warn">This moment is past 2038-01-19 03:14:07 UTC: it does not fit a signed 32-bit time_t.</Note>}

        {p && (
          <Panel title="Formats" actions={<CopyButton text={() => rows.map((r) => `${r[0]}: ${r[1]}`).join('\n')} label="Copy all" />}>
            <Table head={['Format', 'Value', '']} rows={rows.map(([k, v]) => [k, <span key="v" className="mono" style={{ wordBreak: 'break-all' }}>{v}</span>, <CopyButton key="c" text={v} label="" />])} />
          </Panel>
        )}

        {p && (
          <Panel title="Same moment around the world">
            <Table
              head={['Zone', 'Local time', 'Offset', '']}
              rows={zones.map((z) => {
                const off = zoneOffset(z, p.ms)
                const dd = (Date.parse(ymd(p.ms, z)) - Date.parse(ymd(p.ms, 'UTC'))) / 864e5
                return [
                  <b key="z">{z.replace(/_/g, ' ')}{z === LOCAL && <span className="muted"> (you)</span>}</b>,
                  <span key="t" className="mono">{fmtIn(p.ms, z)}{dd !== 0 && <span style={{ color: 'var(--warn)' }}> {dd > 0 ? '+' : ''}{dd}d</span>}</span>,
                  fmtOffset(off),
                  <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ zones: s.zones.filter((x) => x !== z) })}>✕</Btn>,
                ]
              })}
            />
            <Row>
              <input className="k-text" list="etc-zones" placeholder="Add zone, e.g. Asia/Dubai" value={newZone} onChange={(e) => setNewZone(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
              <datalist id="etc-zones">
                {ZONES.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
              <Btn
                disabled={!isValidZone(newZone) || s.zones.includes(newZone)}
                onClick={() => {
                  set({ zones: [...s.zones, newZone] })
                  setNewZone('')
                }}
              >
                + Add
              </Btn>
              {!s.zones.includes(LOCAL) && <Btn onClick={() => set({ zones: [...s.zones, LOCAL] })}>+ My zone</Btn>}
            </Row>
          </Panel>
        )}

        <Panel
          title="Batch convert"
          actions={<CsvButton name="timestamps.csv" rows={() => [['Input', 'Unit', 'Unix seconds', 'ISO 8601 UTC'], ...batch.map(({ l, r }) => (r ? [l, r.unit, toUnit(r.ms, 's'), new Date(r.ms).toISOString()] : [l, 'invalid', '', '']))]} />}
        >
          <Area value={s.batch} onChange={(b) => set({ batch: b })} rows={4} mono placeholder="One timestamp or date per line" />
          <Table
            head={['Input', 'Unit', 'ISO 8601 (UTC)', 'Relative']}
            rows={batch.map(({ l, r }) => [
              <span key="i" className="mono">{l}</span>,
              r ? r.unit : <span key="u" style={{ color: 'var(--err)' }}>invalid</span>,
              r ? <span key="d" className="mono">{new Date(r.ms).toISOString()}</span> : '—',
              r ? relative(r.ms, now) : '—',
            ])}
            max={50}
          />
        </Panel>
      </div>
    </Split>
  )
}
