import { describe, expect, it } from 'vitest'
import { fitScale, frameTimes, inspectGlb, MATERIALS, pose, safeBevel, STUDIOS } from './3d-logo-extruder'

function glb(json: object, bin = new Uint8Array(0)): Uint8Array {
  let j = new TextEncoder().encode(JSON.stringify(json))
  const pad = (4 - (j.length % 4)) % 4
  j = Uint8Array.from([...j, ...new Array(pad).fill(0x20)])
  const total = 12 + 8 + j.length + (bin.length ? 8 + bin.length : 0)
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, j.length, true)
  out.set([0x4a, 0x53, 0x4f, 0x4e], 16)
  out.set(j, 20)
  if (bin.length) {
    dv.setUint32(20 + j.length, bin.length, true)
    out.set([0x42, 0x49, 0x4e, 0], 24 + j.length)
    out.set(bin, 28 + j.length)
  }
  return out
}

describe('presets', () => {
  it('are complete', () => {
    for (const s of Object.values(STUDIOS)) {
      expect(s.bg).toHaveLength(2)
      expect(s.cam[2]).toBeGreaterThan(4)
    }
    expect(MATERIALS.svg.color).toBeNull()
    expect(MATERIALS.glass.transmission).toBe(1)
  })
})

describe('maths', () => {
  it('fits the larger side', () => {
    expect(fitScale(200, 100)).toBe(0.02)
    expect(fitScale(50, 100, 5)).toBe(0.05)
  })
  it('spin covers one revolution per period and loops', () => {
    expect(pose('spin', 0).rotY).toBe(0)
    expect(pose('spin', 3).rotY).toBeCloseTo(Math.PI, 9)
    expect(pose('spin', 7.5).rotY).toBeCloseTo(pose('spin', 1.5).rotY, 9)
    expect(pose('none', 2)).toEqual({ rotY: 0, y: 0, rotX: 0 })
    expect(pose('bob', 0).y).toBeCloseTo(pose('bob', 6).y, 9)
  })
  it('frame times are seamless', () => {
    const f = frameTimes(2, 30)
    expect(f).toHaveLength(60)
    expect(f[59]).toBeCloseTo(2 - 1 / 30, 9)
  })
  it('limits bevel', () => {
    expect(safeBevel(5, 4)).toBeCloseTo(1.8, 9)
    expect(safeBevel(1, 4)).toBe(1)
  })
})

describe('inspectGlb', () => {
  it('reads chunks and JSON', () => {
    const b = glb({ asset: { version: '2.0', generator: 'test' }, meshes: [{}, {}] }, new Uint8Array([1, 2, 3, 4]))
    const g = inspectGlb(b)
    expect(g.version).toBe(2)
    expect(g.chunks.map((c) => c.type)).toEqual(['JSON', 'BIN'])
    expect(g.json.meshes).toHaveLength(2)
    expect(g.json.asset?.version).toBe('2.0')
  })
  it('rejects junk', () => {
    expect(() => inspectGlb(new Uint8Array(40))).toThrow()
    const b = glb({ asset: { version: '2.0' } })
    expect(() => inspectGlb(b.subarray(0, b.length - 4))).toThrow(/length/)
  })
})
