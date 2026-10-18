import { describe, expect, it } from 'vitest'
import { BONE_TOTAL, BONES, choices, REGIONS, ribPoints, searchBones } from './skeleton-explorer'

describe('skeleton explorer', () => {
  it('has 60+ uniquely identified bones covering every region', () => {
    expect(BONES.length).toBeGreaterThanOrEqual(60)
    expect(new Set(BONES.map((b) => b.id)).size).toBe(BONES.length)
    for (const [r] of REGIONS) expect(BONES.some((b) => b.region === r)).toBe(true)
  })
  it('represents close to the 206 adult bones', () => {
    // 206 minus ear ossicles and small skull bones not modelled, plus sternum and hip-bone parts counted separately
    expect(BONE_TOTAL).toBeGreaterThan(180)
    expect(BONE_TOTAL).toBeLessThanOrEqual(206)
  })
  it('mirrors paired bones', () => {
    const l = BONES.find((b) => b.id === 'femur-l')!
    const r = BONES.find((b) => b.id === 'femur-r')!
    const a = l.shapes[1], b = r.shapes[1]
    if (a.t !== 'cap' || b.t !== 'cap') throw new Error('expected capsule')
    expect(a.a[0]).toBeCloseTo(-b.a[0], 10)
    expect(l.name).toBe('Femur (left)')
  })
  it('searches by name, info and region', () => {
    expect(searchBones('femur').map((b) => b.id)).toEqual(['femur-l', 'femur-r'])
    expect(searchBones('kneecap').some((b) => b.id.startsWith('patella'))).toBe(true)
    expect(searchBones('', 'hand').every((b) => b.region === 'hand')).toBe(true)
    expect(searchBones('zygomatic left')).toHaveLength(1)
  })
  it('builds multiple-choice options without left/right duplicates', () => {
    const t = BONES.find((b) => b.id === 'tibia-l')!
    let seed = 1
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const c = choices(t, 3, rnd)
    expect(c).toHaveLength(4)
    expect(c).toContain(t)
    const bases = c.map((b) => b.name.replace(/ \((left|right)\)$/, ''))
    expect(new Set(bases).size).toBe(4)
  })
  it('rib curves start near the sternum for true ribs and further back for floating ribs', () => {
    expect(ribPoints(0, 1)[0][2]).toBeGreaterThan(0.7)
    expect(ribPoints(11, 1)[0][2]).toBeLessThan(0)
  })
})
