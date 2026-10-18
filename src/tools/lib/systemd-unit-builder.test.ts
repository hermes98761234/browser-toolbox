import { describe, expect, it } from 'vitest'
import { formatSpan, nextElapses, parseCalendar, parseSpan, serviceFile, timerFile, validate, type Unit } from './systemd-unit-builder'

const U: Unit = {
  name: 'app', description: 'App', documentation: '', after: 'network-online.target', wants: 'network-online.target', requires: '', type: 'simple',
  execStartPre: '', execStart: '/usr/bin/app --port 8080', execStop: '', execReload: '', pidFile: '', remainAfterExit: false, workingDirectory: '/srv/app',
  user: 'app', group: '', dynamicUser: false, environment: 'NODE_ENV=production\nGREETING=hello world', environmentFile: '', restart: 'on-failure', restartSec: '5s',
  startLimitBurst: 5, startLimitIntervalSec: '60s', timeoutStartSec: '', timeoutStopSec: '', killMode: '', standardOutput: '', syslogIdentifier: '',
  noNewPrivileges: true, privateTmp: true, protectSystem: 'full', protectHome: '', privateDevices: false, protectKernel: false, restrictSuid: false,
  readWritePaths: '', capabilityBoundingSet: '', memoryMax: '', cpuQuota: '', limitNofile: '', nice: '', wantedBy: 'multi-user.target',
  timer: false, onCalendar: 'daily', onBootSec: '', onUnitActiveSec: '', persistent: true, randomizedDelaySec: '', accuracySec: '',
}

describe('time spans', () => {
  it('parses systemd spans', () => {
    expect(parseSpan('5s')).toBe(5)
    expect(parseSpan('1min 30s')).toBe(90)
    expect(parseSpan('2h')).toBe(7200)
    expect(parseSpan('500ms')).toBe(0.5)
    expect(parseSpan('90')).toBe(90)
    expect(parseSpan('1d 2h')).toBe(93600)
    expect(parseSpan('5 parsecs')).toBeNull()
    expect(parseSpan('abc')).toBeNull()
    expect(formatSpan(3725)).toBe('1h 2min 5s')
  })
})

describe('calendar events', () => {
  it('normalizes shorthands and lists', () => {
    expect(parseCalendar('daily').normalized).toBe('*-*-* 00:00:00')
    expect(parseCalendar('weekly').normalized).toBe('Mon *-*-* 00:00:00')
    expect(parseCalendar('Mon..Fri 9:00').normalized).toBe('Mon..Fri *-*-* 09:00:00')
    expect(parseCalendar('Sat,Sun *-*-1,15 3:30').normalized).toBe('Sat,Sun *-*-01,15 03:30:00')
    expect(parseCalendar('*:0/15').minute).toEqual([0, 15, 30, 45])
    expect(parseCalendar('Fri..Mon').dow).toEqual([1, 5, 6, 0])
  })
  it('rejects bad input', () => {
    expect(() => parseCalendar('*-13-01')).toThrow()
    expect(() => parseCalendar('Funday')).toThrow()
    expect(() => parseCalendar('25:00')).toThrow()
  })
  it('computes next elapses in UTC', () => {
    const from = new Date(Date.UTC(2026, 9, 16, 12, 0, 0)) // Friday
    const n = nextElapses(parseCalendar('Mon..Fri 09:00 UTC'), from, 3).map((d) => d.toISOString())
    expect(n).toEqual(['2026-10-19T09:00:00.000Z', '2026-10-20T09:00:00.000Z', '2026-10-21T09:00:00.000Z'])
    const q = nextElapses(parseCalendar('*:0/15 UTC'), from, 2).map((d) => d.toISOString())
    expect(q).toEqual(['2026-10-16T12:15:00.000Z', '2026-10-16T12:30:00.000Z'])
    const last = nextElapses(parseCalendar('*-02~01 00:00 UTC'), from, 2).map((d) => d.toISOString().slice(0, 10))
    expect(last).toEqual(['2027-02-28', '2028-02-29'])
    const quarterly = nextElapses(parseCalendar('quarterly UTC'), from, 2).map((d) => d.toISOString().slice(0, 10))
    expect(quarterly).toEqual(['2027-01-01', '2027-04-01'])
  })
})

describe('unit files', () => {
  it('writes the service with quoting and sections', () => {
    const f = serviceFile(U)
    expect(f).toContain('[Unit]\nDescription=App\nWants=network-online.target\nAfter=network-online.target')
    expect(f).toContain('Environment="GREETING=hello world"')
    expect(f).toContain('Restart=on-failure\nRestartSec=5s')
    expect(f).toContain('[Install]\nWantedBy=multi-user.target')
    expect(validate(U).filter((i) => i.level === 'err')).toEqual([])
  })
  it('validates common mistakes', () => {
    const bad = validate({ ...U, type: 'oneshot', restart: 'always', restartSec: '5 parsecs', after: 'network-online.target', wants: '', execStart: 'app | tee log' })
    const msgs = bad.map((i) => i.field)
    expect(msgs).toContain('Restart')
    expect(msgs).toContain('RestartSec')
    expect(msgs).toContain('After')
    expect(msgs).toContain('ExecStart')
  })
  it('writes timers', () => {
    const t = timerFile({ ...U, timer: true, onCalendar: 'Mon..Fri 02:00' })
    expect(t).toContain('OnCalendar=Mon..Fri 02:00\nPersistent=true\nUnit=app.service')
    expect(t).toContain('WantedBy=timers.target')
    expect(validate({ ...U, timer: true, onCalendar: 'Funday' }).some((i) => i.field === 'OnCalendar' && i.level === 'err')).toBe(true)
  })
})
