import { describe, expect, it } from 'vitest'
import { bounds, commission, settle, targetIncentive, type Tier } from './sales-commission-calculator'

const T: Tier[] = [{ upTo: 50000, rate: 5 }, { upTo: 100000, rate: 8 }, { upTo: 0, rate: 10 }]
const P = { basis: 'amount' as const, tiers: T, cap: 0 }

describe('sales commission', () => {
  it('marginal tiers', () => {
    const r = commission(120000, 100000, { ...P, method: 'marginal' })
    expect(r.total).toBe(2500 + 4000 + 2000)
    expect(r.parts.map((p) => p.base)).toEqual([50000, 50000, 20000])
    expect(r.tier).toBe(2)
    expect(r.attainment).toBeCloseTo(1.2)
  })
  it('retroactive tiers', () => {
    expect(commission(120000, 0, { ...P, method: 'retro' }).total).toBe(12000)
    expect(commission(100000, 0, { ...P, method: 'retro' }).total).toBe(8000) // ceiling stays in lower tier
    expect(commission(30000, 0, { ...P, method: 'retro' }).total).toBe(1500)
  })
  it('quota-based tiers with accelerator and cap', () => {
    const tiers: Tier[] = [{ upTo: 100, rate: 6 }, { upTo: 150, rate: 9 }, { upTo: 0, rate: 12 }]
    expect(bounds(tiers, 'quota', 200000).map((b) => b.hi)).toEqual([200000, 300000, Infinity])
    const r = commission(320000, 200000, { basis: 'quota', method: 'marginal', tiers, cap: 25000 })
    expect(r.gross).toBe(12000 + 9000 + 2400)
    expect(r.capped).toBe(false)
    const c = commission(320000, 200000, { basis: 'quota', method: 'marginal', tiers, cap: 20000 })
    expect(c.total).toBe(20000)
    expect(c.capped).toBe(true)
    expect(targetIncentive(200000, { basis: 'quota', method: 'marginal', tiers, cap: 0 })).toBe(12000)
  })
  it('settles draws', () => {
    expect(settle(1000, 3000, true, 0)).toEqual({ payout: 3000, recovered: 0, balance: 2000, drawTopUp: 2000 })
    expect(settle(1000, 3000, false, 0).balance).toBe(0)
    expect(settle(6000, 3000, true, 2000)).toEqual({ payout: 4000, recovered: 2000, balance: 0, drawTopUp: 0 })
    expect(settle(4000, 3000, true, 2500)).toEqual({ payout: 3000, recovered: 1000, balance: 1500, drawTopUp: 0 })
  })
})
