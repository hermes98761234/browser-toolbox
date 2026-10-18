// Systemd Unit Builder logic: time-span parsing, OnCalendar calendar-event parsing with next-elapse
// computation, unit file generation and validation. Written from the systemd.time(7),
// systemd.service(5), systemd.timer(5) and systemd.exec(5) documentation.

// ---------- time spans ----------

const SPAN_UNITS: [RegExp, number][] = [
  [/^(us|usec|µs)$/, 1e-6], [/^(ms|msec)$/, 1e-3], [/^(s|sec|second|seconds)$/, 1],
  [/^(m|min|minute|minutes)$/, 60], [/^(h|hr|hour|hours)$/, 3600], [/^(d|day|days)$/, 86400],
  [/^(w|week|weeks)$/, 604800], [/^(M|month|months)$/, 2629800], [/^(y|year|years)$/, 31557600],
]

/** Parses a systemd time span ("1min 30s", "2h", "500ms", "90") to seconds; null if invalid. */
export function parseSpan(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  if (t === 'infinity') return Infinity
  const re = /(\d+(?:\.\d+)?)\s*([a-zA-Zµ]*)/g
  let total = 0, used = 0, m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    if (m.index !== used && t.slice(used, m.index).trim() !== '') return null
    const v = Number(m[1])
    if (!m[2]) total += v
    else {
      const u = SPAN_UNITS.find(([r]) => r.test(m![2]))
      if (!u) return null
      total += v * u[1]
    }
    used = m.index + m[0].length
  }
  return used > 0 && t.slice(used).trim() === '' ? total : null
}

export function formatSpan(sec: number): string {
  if (!Number.isFinite(sec)) return 'infinity'
  const parts: string[] = []
  let s = Math.round(sec)
  for (const [n, u] of [[86400, 'd'], [3600, 'h'], [60, 'min'], [1, 's']] as const) {
    if (s >= n) {
      parts.push(`${Math.floor(s / n)}${u}`)
      s %= n
    }
  }
  return parts.join(' ') || (sec > 0 ? `${Math.round(sec * 1000)}ms` : '0')
}

// ---------- calendar events (OnCalendar=) ----------

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const DOW_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SHORTHAND: Record<string, string> = {
  minutely: '*-*-* *:*:00', hourly: '*-*-* *:00:00', daily: '*-*-* 00:00:00', monthly: '*-*-01 00:00:00',
  weekly: 'Mon *-*-* 00:00:00', yearly: '*-01-01 00:00:00', annually: '*-01-01 00:00:00',
  quarterly: '*-01,04,07,10-01 00:00:00', semiannually: '*-01,07-01 00:00:00',
}

/** A field is either "any" (null) or a sorted list of allowed values. */
type Field = number[] | null

export interface CalSpec {
  dow: Field
  year: Field
  month: Field
  day: Field
  /** Days counted from the end of the month (1 = last day), from the "~" syntax. */
  fromEnd: boolean
  hour: Field
  minute: Field
  second: Field
  utc: boolean
  normalized: string
}

function range(a: number, b: number, step = 1): number[] {
  const out: number[] = []
  for (let v = a; v <= b; v += step) out.push(v)
  return out
}

/** Parses one comma-separated component: "*", "5", "1..5", "0/15", "*\/2" (written without backslash), "1..10/3". */
function parseField(src: string, lo: number, hi: number, name: string): Field {
  if (src === '*') return null
  const out = new Set<number>()
  for (const part of src.split(',')) {
    const m = /^(\*|\d+)(?:\.\.(\d+))?(?:\/(\d+))?$/.exec(part)
    if (!m) throw new Error(`Bad ${name} value "${part}"`)
    const step = m[3] ? Number(m[3]) : 0
    if (m[3] && step < 1) throw new Error(`Bad repetition in ${name}`)
    const a = m[1] === '*' ? lo : Number(m[1])
    const b = m[2] ? Number(m[2]) : step ? hi : a
    if (a < lo || b > hi || a > b) throw new Error(`${name} value "${part}" is out of range ${lo}–${hi}`)
    for (const v of range(a, b, step || 1)) out.add(v)
  }
  return [...out].sort((x, y) => x - y)
}

function parseDow(src: string): Field {
  const out = new Set<number>()
  for (const part of src.toLowerCase().split(',')) {
    const [a, b] = part.split('..')
    const ia = DOW.findIndex((d) => a?.startsWith(d))
    const ib = b === undefined ? ia : DOW.findIndex((d) => b.startsWith(d))
    if (ia < 0 || ib < 0) throw new Error(`Bad weekday "${part}"`)
    // Ranges wrap the week from Monday: Mon..Sun, Fri..Mon.
    const ord = (i: number) => (i + 6) % 7
    for (let k = ord(ia); ; k = (k + 1) % 7) {
      out.add((k + 1) % 7)
      if (k === ord(ib)) break
    }
  }
  return [...out].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7))
}

const fmtField = (f: Field, pad = 2) => (f === null ? '*' : compress(f).map(([a, b]) => (a === b ? String(a).padStart(pad, '0') : `${String(a).padStart(pad, '0')}..${String(b).padStart(pad, '0')}`)).join(','))
function compress(v: number[]): [number, number][] {
  const out: [number, number][] = []
  for (const x of v) {
    const last = out[out.length - 1]
    if (last && x === last[1] + 1) last[1] = x
    else out.push([x, x])
  }
  // Short runs read better as lists (systemd prints 01..02 as 01,02 too).
  return out.flatMap(([a, b]) => (b - a < 2 ? range(a, b).map((x) => [x, x] as [number, number]) : [[a, b] as [number, number]]))
}

/** Parses a calendar event expression (systemd.time(7) subset: no fractional seconds, only UTC/local zones). */
export function parseCalendar(input: string): CalSpec {
  const t = input.trim().replace(/\s+/g, ' ')
  if (!t) throw new Error('Empty expression')
  let utc = false
  let tokens = t.split(' ')
  if (tokens.length > 1 && /^(utc|gmt|z)$/i.test(tokens[tokens.length - 1])) {
    utc = true
    tokens.pop()
  }
  const sh = tokens.length === 1 ? SHORTHAND[tokens[0].toLowerCase()] : undefined
  if (sh) tokens = sh.split(' ')
  let dow: Field = null
  if (tokens.length && /^[a-z]/i.test(tokens[0])) dow = parseDow(tokens.shift()!)
  let datePart = '*-*-*', timePart = '00:00:00'
  for (const tok of tokens) {
    if (tok.includes(':')) timePart = tok
    else if (tok.includes('-') || tok.includes('~')) datePart = tok
    else throw new Error(`Cannot understand "${tok}"`)
  }
  if (tokens.length > 2) throw new Error('Too many components')
  // Date: [year-]month-day or [year-]month~day.
  const dm = /^(?:([^-~]+)-)?([^-~]+)([-~])([^-~]+)$/.exec(datePart)
  if (!dm) throw new Error(`Bad date "${datePart}"`)
  const year = parseField(dm[1] ?? '*', 1970, 2199, 'year')
  const month = parseField(dm[2], 1, 12, 'month')
  const fromEnd = dm[3] === '~'
  const day = parseField(dm[4], 1, 31, 'day')
  const tp = timePart.split(':')
  if (tp.length < 2 || tp.length > 3) throw new Error(`Bad time "${timePart}"`)
  const hour = parseField(tp[0], 0, 23, 'hour')
  const minute = parseField(tp[1], 0, 59, 'minute')
  const second = parseField(tp[2] ?? '00', 0, 59, 'second')
  const dowText = dow ? compress(dow.map((d) => (d + 6) % 7)).map(([a, b]) => (a === b ? DOW_NAME[(a + 1) % 7] : `${DOW_NAME[(a + 1) % 7]}..${DOW_NAME[(b + 1) % 7]}`)).join(',') : ''
  const normalized = `${dow ? dowText + ' ' : ''}${fmtField(year, 4)}-${fmtField(month)}${fromEnd ? '~' : '-'}${fmtField(day)} ${fmtField(hour)}:${fmtField(minute)}:${fmtField(second)}${utc ? ' UTC' : ''}`
  return { dow, year, month, day, fromEnd, hour, minute, second, utc, normalized }
}

const has = (f: Field, v: number) => f === null || f.includes(v)

/** Next `count` elapse times strictly after `from` (searches up to ~8 years ahead). */
export function nextElapses(spec: CalSpec, from: Date, count = 5): Date[] {
  const out: Date[] = []
  const mk = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => (spec.utc ? new Date(Date.UTC(y, mo, d, h, mi, s)) : new Date(y, mo, d, h, mi, s))
  const get = (d: Date) => (spec.utc ? [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()] : [d.getFullYear(), d.getMonth(), d.getDate()])
  const [y0, m0, d0] = get(from)
  const hours = spec.hour ?? range(0, 23), mins = spec.minute ?? range(0, 59), secs = spec.second ?? range(0, 59)
  for (let i = 0; i < 366 * 8 && out.length < count; i++) {
    const day = mk(y0, m0, d0 + i, 12)
    const [y, mo, d] = get(day)
    if (!has(spec.year, y) || !has(spec.month, mo + 1)) continue
    const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate()
    const dayNum = spec.fromEnd ? dim - d + 1 : d
    if (!has(spec.day, dayNum)) continue
    const wd = spec.utc ? day.getUTCDay() : day.getDay()
    if (!has(spec.dow, wd)) continue
    for (const h of hours) for (const mi of mins) for (const s of secs) {
      if (out.length >= count) return out
      const at = mk(y, mo, d, h, mi, s)
      if (at > from) out.push(at)
    }
  }
  return out
}

// ---------- unit model ----------

export type SvcType = 'simple' | 'exec' | 'forking' | 'oneshot' | 'notify' | 'idle'
export type RestartPolicy = 'no' | 'on-success' | 'on-failure' | 'on-abnormal' | 'on-watchdog' | 'on-abort' | 'always'

export interface Unit {
  name: string
  description: string
  documentation: string
  after: string
  wants: string
  requires: string
  type: SvcType
  execStartPre: string
  execStart: string
  execStop: string
  execReload: string
  pidFile: string
  remainAfterExit: boolean
  workingDirectory: string
  user: string
  group: string
  dynamicUser: boolean
  environment: string
  environmentFile: string
  restart: RestartPolicy
  restartSec: string
  startLimitBurst: number
  startLimitIntervalSec: string
  timeoutStartSec: string
  timeoutStopSec: string
  killMode: '' | 'control-group' | 'mixed' | 'process' | 'none'
  standardOutput: '' | 'journal' | 'null' | 'inherit'
  syslogIdentifier: string
  noNewPrivileges: boolean
  privateTmp: boolean
  protectSystem: '' | 'true' | 'full' | 'strict'
  protectHome: '' | 'true' | 'read-only' | 'tmpfs'
  privateDevices: boolean
  protectKernel: boolean
  restrictSuid: boolean
  readWritePaths: string
  capabilityBoundingSet: string
  memoryMax: string
  cpuQuota: string
  limitNofile: string
  nice: string
  wantedBy: string
  timer: boolean
  onCalendar: string
  onBootSec: string
  onUnitActiveSec: string
  persistent: boolean
  randomizedDelaySec: string
  accuracySec: string
}

const words = (s: string) => s.split(/[\s,]+/).filter(Boolean)
const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)

function section(name: string, rows: [string, string | undefined | false][]): string {
  const body = rows.filter(([, v]) => v !== undefined && v !== false && v !== '').map(([k, v]) => `${k}=${v}`)
  return body.length ? `[${name}]\n${body.join('\n')}\n` : ''
}

const quoteEnv = (l: string) => {
  const i = l.indexOf('=')
  const v = l.slice(i + 1)
  return /[\s"]/.test(l) && !/^".*"$/.test(l) ? `"${l.slice(0, i)}=${v.replace(/"/g, '\\"')}"` : l
}

export function serviceFile(u: Unit): string {
  const yes = (b: boolean) => (b ? 'yes' : undefined)
  const unit = section('Unit', [
    ['Description', u.description], ['Documentation', u.documentation],
    ['Wants', words(u.wants).join(' ')], ['Requires', words(u.requires).join(' ')], ['After', words(u.after).join(' ')],
    ['StartLimitIntervalSec', u.restart !== 'no' && u.startLimitIntervalSec], ['StartLimitBurst', u.restart !== 'no' && u.startLimitBurst > 0 && String(u.startLimitBurst)],
  ])
  const rows: [string, string | undefined | false][] = [['Type', u.type]]
  if (u.type === 'forking') rows.push(['PIDFile', u.pidFile])
  for (const l of lines(u.execStartPre)) rows.push(['ExecStartPre', l])
  const starts = lines(u.execStart)
  if (!starts.length) rows.push(['ExecStart', ''])
  for (const l of starts) rows.push(['ExecStart', l])
  rows.push(['ExecReload', u.execReload], ['ExecStop', u.execStop], ['RemainAfterExit', u.type === 'oneshot' && yes(u.remainAfterExit)])
  rows.push(['WorkingDirectory', u.workingDirectory], ['DynamicUser', yes(u.dynamicUser)], ['User', !u.dynamicUser && u.user], ['Group', !u.dynamicUser && u.group])
  for (const l of lines(u.environment)) rows.push(['Environment', quoteEnv(l)])
  rows.push(['EnvironmentFile', u.environmentFile])
  rows.push(['Restart', u.restart !== 'no' && u.restart], ['RestartSec', u.restart !== 'no' && u.restartSec])
  rows.push(['TimeoutStartSec', u.timeoutStartSec], ['TimeoutStopSec', u.timeoutStopSec], ['KillMode', u.killMode])
  rows.push(['StandardOutput', u.standardOutput], ['SyslogIdentifier', u.syslogIdentifier])
  rows.push(['NoNewPrivileges', yes(u.noNewPrivileges)], ['PrivateTmp', yes(u.privateTmp)], ['PrivateDevices', yes(u.privateDevices)])
  rows.push(['ProtectSystem', u.protectSystem], ['ProtectHome', u.protectHome])
  if (u.protectKernel) rows.push(['ProtectKernelTunables', 'yes'], ['ProtectKernelModules', 'yes'], ['ProtectControlGroups', 'yes'])
  rows.push(['RestrictSUIDSGID', yes(u.restrictSuid)], ['ReadWritePaths', words(u.readWritePaths).join(' ')], ['CapabilityBoundingSet', u.capabilityBoundingSet])
  rows.push(['MemoryMax', u.memoryMax], ['CPUQuota', u.cpuQuota], ['LimitNOFILE', u.limitNofile], ['Nice', u.nice])
  const install = u.timer && !u.wantedBy ? '' : section('Install', [['WantedBy', words(u.wantedBy).join(' ')]])
  return [unit, section('Service', rows), install].filter(Boolean).join('\n')
}

export function timerFile(u: Unit): string {
  const unit = section('Unit', [['Description', `Timer for ${u.description || u.name}`]])
  const rows: [string, string | undefined | false][] = []
  for (const l of lines(u.onCalendar)) rows.push(['OnCalendar', l])
  rows.push(['OnBootSec', u.onBootSec], ['OnUnitActiveSec', u.onUnitActiveSec], ['Persistent', u.persistent && lines(u.onCalendar).length > 0 && 'true'])
  rows.push(['RandomizedDelaySec', u.randomizedDelaySec], ['AccuracySec', u.accuracySec], ['Unit', `${u.name}.service`])
  return [unit, section('Timer', rows), section('Install', [['WantedBy', 'timers.target']])].join('\n')
}

export interface Issue { level: 'err' | 'warn' | 'info'; field: string; msg: string }

const SPAN_FIELDS: [keyof Unit, string][] = [
  ['restartSec', 'RestartSec'], ['startLimitIntervalSec', 'StartLimitIntervalSec'], ['timeoutStartSec', 'TimeoutStartSec'], ['timeoutStopSec', 'TimeoutStopSec'],
  ['onBootSec', 'OnBootSec'], ['onUnitActiveSec', 'OnUnitActiveSec'], ['randomizedDelaySec', 'RandomizedDelaySec'], ['accuracySec', 'AccuracySec'],
]

export function validate(u: Unit): Issue[] {
  const out: Issue[] = []
  const add = (level: Issue['level'], field: string, msg: string) => out.push({ level, field, msg })
  if (!/^[A-Za-z0-9:_.\\@-]+$/.test(u.name) || u.name.length > 248) add('err', 'Name', 'Unit name may contain only letters, digits and : _ . \\ @ - (max 255 characters with suffix).')
  if (!u.description.trim()) add('warn', 'Description', 'Add a Description=; it is what systemctl status and the journal show.')
  const starts = lines(u.execStart)
  if (!starts.length) add('err', 'ExecStart', 'ExecStart= is required.')
  if (starts.length > 1 && u.type !== 'oneshot') add('err', 'ExecStart', 'Only Type=oneshot services may have more than one ExecStart= line.')
  for (const [k, v] of [['ExecStart', u.execStart], ['ExecStartPre', u.execStartPre], ['ExecStop', u.execStop], ['ExecReload', u.execReload]] as const) {
    for (const l of lines(v)) {
      const cmd = l.replace(/^[@\-:+!]+/, '').split(/\s+/)[0]
      if (!cmd.startsWith('/')) add('warn', k, `"${cmd}" is not an absolute path. systemd ≥ 239 searches a fixed PATH, but absolute paths are safer and portable.`)
      if (/[|><]|&&|;\s/.test(l)) add('warn', k, 'Shell syntax (pipes, redirects, &&) is not interpreted. Wrap it: /bin/sh -c \'…\'.')
    }
  }
  if (u.type === 'oneshot' && (u.restart === 'always' || u.restart === 'on-success')) add('err', 'Restart', `Restart=${u.restart} is not allowed for Type=oneshot services.`)
  if (u.type === 'forking' && !u.pidFile) add('warn', 'PIDFile', 'Type=forking services should set PIDFile= so systemd can track the main process.')
  if (u.type !== 'oneshot' && u.remainAfterExit) add('info', 'RemainAfterExit', 'RemainAfterExit= is only written for oneshot services.')
  if (u.restart !== 'no' && u.startLimitBurst > 0) {
    const rs = parseSpan(u.restartSec) ?? 0.1
    const iv = parseSpan(u.startLimitIntervalSec) ?? 10
    if (rs * u.startLimitBurst > iv) add('info', 'StartLimit', `With RestartSec=${u.restartSec || '100ms'} a crash loop needs ${formatSpan(rs * u.startLimitBurst)} to hit ${u.startLimitBurst} starts, longer than StartLimitIntervalSec=${u.startLimitIntervalSec || '10s'}, so the limit never triggers.`)
  }
  for (const [k, label] of SPAN_FIELDS) {
    const v = String(u[k] ?? '')
    if (v && parseSpan(v) === null) add('err', label, `"${v}" is not a valid time span (e.g. 30s, 5min, 1h 30min).`)
  }
  for (const l of lines(u.environment)) if (!/^"?[A-Za-z_][A-Za-z0-9_]*=/.test(l)) add('err', 'Environment', `"${l}" must be KEY=value.`)
  if (u.dynamicUser && u.user) add('info', 'User', 'DynamicUser=yes allocates a transient user; User= is ignored in the output.')
  if (!u.dynamicUser && (!u.user || u.user === 'root')) add('warn', 'User', 'The service runs as root. Set User= or DynamicUser=yes unless it really needs root.')
  const after = words(u.after)
  if (after.includes('network-online.target') && !words(u.wants + ' ' + u.requires).includes('network-online.target')) add('warn', 'After', 'After=network-online.target has no effect without Wants=network-online.target.')
  for (const w of words(u.wants + ' ' + u.requires)) if (!after.includes(w)) add('info', 'After', `${w} is wanted but not ordered: add it to After= if this unit must start after it.`)
  if (u.protectSystem === 'strict' && !u.readWritePaths && !u.dynamicUser) add('info', 'ProtectSystem', 'ProtectSystem=strict makes the whole file system read-only; list writable dirs in ReadWritePaths=.')
  if (u.cpuQuota && !/^\d+%$/.test(u.cpuQuota)) add('err', 'CPUQuota', 'CPUQuota= takes a percentage, e.g. 50% or 200%.')
  if (u.memoryMax && !/^(\d+(\.\d+)?[KMGT]?|\d+%|infinity)$/.test(u.memoryMax)) add('err', 'MemoryMax', 'MemoryMax= takes bytes with K/M/G/T suffix, a percentage or infinity.')
  if (u.nice && !(Number.isInteger(Number(u.nice)) && +u.nice >= -20 && +u.nice <= 19)) add('err', 'Nice', 'Nice= must be an integer from −20 to 19.')
  if (u.timer) {
    const cals = lines(u.onCalendar)
    if (!cals.length && !u.onBootSec && !u.onUnitActiveSec) add('err', 'Timer', 'A timer needs OnCalendar=, OnBootSec= or OnUnitActiveSec=.')
    for (const c of cals) {
      try {
        parseCalendar(c)
      } catch (e) {
        add('err', 'OnCalendar', `${c}: ${(e as Error).message}`)
      }
    }
    if (u.type !== 'oneshot') add('info', 'Type', 'Timer-activated jobs are usually Type=oneshot so each run finishes before the next one.')
    if (u.wantedBy) add('info', 'Install', 'The service has its own [Install]; with a timer you normally enable only the .timer.')
    if (u.persistent && !cals.length) add('info', 'Persistent', 'Persistent= only applies to OnCalendar= timers.')
  }
  return out
}

/** Rough hardening score 0–10 from the sandboxing options set (inspired by `systemd-analyze security`, not identical). */
export function hardening(u: Unit): number {
  let s = 0
  if (u.dynamicUser || (u.user && u.user !== 'root')) s += 2
  if (u.noNewPrivileges) s += 1.5
  if (u.privateTmp) s += 1
  if (u.protectSystem === 'strict') s += 1.5
  else if (u.protectSystem) s += 0.75
  if (u.protectHome) s += 1
  if (u.privateDevices) s += 1
  if (u.protectKernel) s += 1
  if (u.restrictSuid) s += 0.5
  if (u.capabilityBoundingSet !== '') s += 0.5
  return Math.min(10, s)
}
