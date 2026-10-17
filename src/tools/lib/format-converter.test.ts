import { describe, expect, it } from 'vitest'
import { bytes, detectFormat, isBinaryStl, outName, stlBinarySize, uniqueNames, unitScale } from './format-converter'

const enc = (s: string) => new TextEncoder().encode(s)

describe('format converter helpers', () => {
  it('detects formats by extension and magic', () => {
    expect(detectFormat('a.OBJ', enc('v 1 2 3'))).toBe('obj')
    expect(detectFormat('noext', enc('glTF\u0002'))).toBe('glb')
    expect(detectFormat('x.bin', enc('ply\nformat'))).toBe('ply')
    expect(detectFormat('x', enc('solid cube\n'))).toBe('stl')
    expect(detectFormat('scene.gltf', enc('{'))).toBe('gltf')
    expect(detectFormat('x.txt', enc('hello'))).toBeNull()
  })
  it('binary STL size check', () => {
    const buf = new ArrayBuffer(stlBinarySize(2))
    new DataView(buf).setUint32(80, 2, true)
    expect(isBinaryStl(buf)).toBe(true)
    expect(isBinaryStl(new ArrayBuffer(100))).toBe(false)
    expect(stlBinarySize(12)).toBe(684)
  })
  it('names', () => {
    expect(outName('part.v2.stl', 'glb')).toBe('part.v2.glb')
    expect(outName('model', 'obj')).toBe('model.obj')
    expect(uniqueNames(['a.stl', 'A.stl', 'b.stl', 'a.stl'])).toEqual(['a.stl', 'A (2).stl', 'b.stl', 'a (3).stl'])
  })
  it('units and bytes', () => {
    expect(unitScale('in', 'mm')).toBeCloseTo(25.4)
    expect(unitScale('mm', 'm')).toBeCloseTo(0.001)
    expect(bytes(512)).toBe('512 B')
    expect(bytes(2048)).toBe('2.0 KB')
  })
})
