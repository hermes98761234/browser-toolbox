import { describe, expect, it } from 'vitest'
import { activeAt, alphaAt, gainAt, outSize, place, timeline, usable } from './video-merger'

describe('video merger', () => {
  it('places frames with fit, fill and stretch', () => {
    expect(place(640, 480, 1280, 720, 'fit')).toEqual({ sx: 0, sy: 0, sw: 640, sh: 480, dx: 160, dy: 0, dw: 960, dh: 720 })
    const f = place(640, 480, 1280, 720, 'fill')
    expect(f.sw).toBeCloseTo(640)
    expect(f.sh).toBeCloseTo(360)
    expect(f.sy).toBeCloseTo(60)
    expect(place(100, 100, 300, 200, 'stretch').dw).toBe(300)
  })
  it('picks output sizes', () => {
    const clips = [{ w: 1280, h: 720 }, { w: 1920, h: 1080 }]
    expect(outSize('first', clips, '16:9')).toEqual([1280, 720])
    expect(outSize('largest', clips, '16:9')).toEqual([1920, 1080])
    expect(outSize('720', clips, '16:9')).toEqual([1280, 720])
    expect(outSize('1080', clips, '9:16')).toEqual([1080, 1920])
    expect(outSize('480', [{ w: 641, h: 481 }], 'first')).toEqual([640, 480])
  })
  it('builds a crossfaded timeline', () => {
    const clips = [{ dur: 4, trimIn: 0, trimOut: 0 }, { dur: 3, trimIn: 1, trimOut: 0 }, { dur: 5, trimIn: 0, trimOut: 2 }]
    expect(usable(clips[1])).toBe(2)
    const { segs, total } = timeline(clips, 1)
    expect(segs.map((s) => s.start)).toEqual([0, 3, 4])
    expect(total).toBe(6)
    expect(segs[1].srcIn).toBe(1)
    expect(timeline(clips, 0).total).toBe(8)
    // crossfade limited to half of the 2 s middle clip
    expect(timeline(clips, 5).segs[1].fadeIn).toBe(1)
    expect(activeAt(segs, 3.5).map((s) => s.i)).toEqual([0, 1])
  })
  it('fades with equal power', () => {
    const { segs } = timeline([{ dur: 4, trimIn: 0, trimOut: 0 }, { dur: 4, trimIn: 0, trimOut: 0 }], 2)
    const t = 3
    expect(alphaAt(segs[1], t)).toBeCloseTo(0.5)
    expect(gainAt(segs[0], t) ** 2 + gainAt(segs[1], t) ** 2).toBeCloseTo(1)
    expect(gainAt(segs[0], 1)).toBe(1)
  })
})
