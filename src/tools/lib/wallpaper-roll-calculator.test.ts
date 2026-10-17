import { describe, expect, it } from 'vitest'
import { cutLength, estimate, packRolls } from './wallpaper-roll-calculator'

const base = { openings: [], rollWidth: 53, rollLength: 1005, repeat: 64, match: 'straight' as const, trim: 10 }

describe('wallpaper-roll-calculator', () => {
  it('cut lengths honour the repeat', () => {
    expect(cutLength(250, 10, 64, 'straight')).toBe(320)
    expect(cutLength(250, 10, 64, 'half')).toBe(352)
    expect(cutLength(250, 10, 64, 'random')).toBe(260)
    expect(cutLength(246, 10, 64, 'straight')).toBe(256)
  })
  it('single wall: 8 strips, 3 per roll → 3 rolls', () => {
    const e = estimate({ ...base, walls: [{ name: 'A', width: 400, height: 250 }] })
    expect(e.strips).toBe(8)
    expect(e.perRoll).toBe(3)
    expect(e.naiveRolls).toBe(3)
    expect(e.rolls.length).toBe(3)
  })
  it('a wide door saves full strips and adds short pieces', () => {
    const e = estimate({ ...base, match: 'random', walls: [{ name: 'A', width: 424, height: 250 }], openings: [{ wall: 0, x: 100, y: 0, w: 120, h: 210, label: 'Door' }] })
    // strips 0..7; strips 2 (106-159) and 3 (159-212) are fully covered by 100-220
    expect(e.pieces.filter((p) => p.kind === 'full').length).toBe(6)
    expect(e.pieces.filter((p) => p.kind === 'above').map((p) => p.len)).toEqual([50, 50])
    expect(e.pieces.some((p) => p.kind === 'below')).toBe(false)
  })
  it('packs offcuts into leftovers', () => {
    const { rolls } = packRolls([300, 300, 300, 50, 50].map((len) => ({ wall: 0, strip: 0, len, kind: 'full' as const })), 1005)
    expect(rolls.length).toBe(1)
  })
})
