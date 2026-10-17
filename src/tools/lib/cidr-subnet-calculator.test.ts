import { describe, expect, it } from 'vitest'
import { classify, formatIPv6, info, parseCidr, parseIPv4, parseIPv6, prefixForHosts, split, formatIPv4, type Cidr } from './cidr-subnet-calculator'

const c = (s: string) => parseCidr(s) as Cidr

describe('cidr', () => {
  it('parses IPv4', () => {
    expect(parseIPv4('192.168.1.1')).toBe(0xc0a80101n)
    expect(parseIPv4('256.1.1.1')).toBeNull()
    expect(parseIPv4('01.1.1.1')).toBeNull()
  })
  it('parses and formats IPv6', () => {
    expect(parseIPv6('::1')).toBe(1n)
    expect(formatIPv6(parseIPv6('2001:0db8:0000:0000:0000:ff00:0042:8329')!)).toBe('2001:db8::ff00:42:8329')
    expect(formatIPv6(parseIPv6('2001:db8:0:1:1:1:1:1')!)).toBe('2001:db8:0:1:1:1:1:1')
    expect(parseIPv6('::ffff:192.0.2.1')).toBe(0xffffc0000201n)
    expect(parseIPv6('1::2::3')).toBeNull()
    expect(formatIPv6(0n)).toBe('::')
  })
  it('computes /24', () => {
    const i = info(c('192.168.1.130/24'))
    expect(formatIPv4(i.network)).toBe('192.168.1.0')
    expect(formatIPv4(i.last)).toBe('192.168.1.255')
    expect(formatIPv4(i.mask)).toBe('255.255.255.0')
    expect(i.usable).toBe(254n)
    expect(i.aligned).toBe(false)
  })
  it('handles /31 /32 and netmask notation', () => {
    expect(info(c('10.0.0.0/31')).usable).toBe(2n)
    expect(info(c('10.0.0.5')).usable).toBe(1n)
    expect(c('10.1.2.3 255.255.240.0').prefix).toBe(20)
    expect(typeof parseCidr('10.0.0.0 255.0.255.0')).toBe('string')
  })
  it('IPv6 /64 total', () => {
    expect(info(c('2001:db8::/64')).total).toBe(1n << 64n)
  })
  it('splits', () => {
    const r = split(c('10.0.0.0/22'), 24)
    expect(r.count).toBe(4n)
    expect(formatIPv4(r.rows[3].network)).toBe('10.0.3.0')
    expect(prefixForHosts(4, 50)).toBe(26)
    expect(classify(4, parseIPv4('172.20.0.1')!)).toContain('1918')
  })
})
