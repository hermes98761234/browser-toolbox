import { describe, expect, it } from 'vitest'
import { bucketWidth, detectFormat, FORMATS, histogram, lineSplitter, normLevel, parseLine, parseTime, sampleLog, template } from './log-file-analyzer'

const f = (id: string) => FORMATS.find((x) => x.id === id)!

describe('log file analyzer', () => {
  it('parses timestamps', () => {
    expect(parseTime('2026-10-16 12:00:00,500')).toBe(Date.UTC(2026, 9, 16, 12, 0, 0, 500))
    expect(parseTime('2026-10-16T12:00:00+02:00')).toBe(Date.UTC(2026, 9, 16, 10))
    expect(parseTime('16/Oct/2026:12:00:00 -0100')).toBe(Date.UTC(2026, 9, 16, 13))
    expect(parseTime('Oct  6 08:15:00', 2025)).toBe(Date.UTC(2025, 9, 6, 8, 15))
    expect(parseTime('1700000000')).toBe(1700000000000)
    expect(parseTime('nonsense')).toBeNull()
  })
  it('normalises levels', () => {
    expect(normLevel('fatal')).toBe('ERROR')
    expect(normLevel('Warning')).toBe('WARN')
    expect(normLevel('trace')).toBe('DEBUG')
    expect(normLevel('', 'Connection failed')).toBe('ERROR')
  })
  it('parses each preset', () => {
    const a = parseLine('2026-10-16 10:00:01.123 WARN  [main] Disk almost full', f('app'))!
    expect(a.level).toBe('WARN')
    expect(a.fields.thread).toBe('main')
    expect(a.msg).toBe('Disk almost full')
    const b = parseLine('1.2.3.4 - - [16/Oct/2026:10:00:00 +0000] "GET /x HTTP/1.1" 503 12 "-" "curl"', f('access'))!
    expect(b.level).toBe('ERROR')
    expect(b.fields.ip).toBe('1.2.3.4')
    const c = parseLine('Oct 16 10:00:00 host sshd[123]: Failed password for root', f('syslog'))!
    expect(c.fields.proc).toBe('sshd')
    expect(c.level).toBe('ERROR')
    const d = parseLine('{"ts":"2026-10-16T10:00:00Z","level":"info","msg":"hi"}', f('json'))!
    expect(d.ts).toBe(Date.UTC(2026, 9, 16, 10))
    expect(d.level).toBe('INFO')
  })
  it('detects format of samples', () => {
    expect(detectFormat(sampleLog('app').split('\n')).id).toBe('app')
    expect(detectFormat(sampleLog('access').split('\n')).id).toBe('access')
  })
  it('templates variable parts', () => {
    expect(template('Slow query took 812ms for user 42')).toBe(template('Slow query took 3000ms for user 7'))
    expect(template('from 10.0.0.1')).toBe('from <ip>')
  })
  it('buckets time', () => {
    expect(bucketWidth(0, 3600000)).toBe(60000)
    expect(bucketWidth(0, 86400000)).toBe(1800000)
    const h = histogram([{ ts: 0, level: 'INFO' }, { ts: 59000, level: 'ERROR' }, { ts: 3599000, level: 'INFO' }])
    expect(h.buckets.reduce((s, b) => s + b.counts.reduce((a, c) => a + c, 0), 0)).toBe(3)
    expect(h.buckets[0].counts[0]).toBe(1)
  })
  it('splits streamed chunks into lines', () => {
    const out: string[] = []
    const s = lineSplitter((l) => out.push(l))
    s.push('ab\ncd')
    s.push('ef\r\ngh')
    s.end()
    expect(out).toEqual(['ab', 'cdef', 'gh'])
  })
})
