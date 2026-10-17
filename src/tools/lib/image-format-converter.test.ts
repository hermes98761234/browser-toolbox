import { describe, expect, it } from 'vitest'
import { outName, sizeChange, sniff, targetSize } from './image-format-converter'

describe('image-format-converter', () => {
  it('computes target sizes', () => {
    expect(targetSize(4000, 3000, 'orig', 50, 1000, 800, 800)).toEqual([4000, 3000])
    expect(targetSize(4000, 3000, 'pct', 25, 0, 0, 0)).toEqual([1000, 750])
    expect(targetSize(4000, 3000, 'maxw', 0, 1920, 0, 0)).toEqual([1920, 1440])
    expect(targetSize(800, 600, 'maxw', 0, 1920, 0, 0)).toEqual([800, 600])
    expect(targetSize(4000, 3000, 'box', 0, 0, 1000, 1000)).toEqual([1000, 750])
  })
  it('renames files', () => {
    expect(outName('photo.final.PNG', 'webp')).toBe('photo.final.webp')
    expect(outName('pic', 'jpeg', '-small')).toBe('pic-small.jpg')
  })
  it('size change', () => {
    expect(sizeChange(200, 50)).toBeCloseTo(-0.75)
  })
  it('sniffs formats', () => {
    expect(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10]))).toBe('PNG')
    expect(sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('JPEG')
    expect(sniff(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('WebP')
    expect(sniff(new TextEncoder().encode('\0\0\0\x20ftypavif'))).toBe('AVIF')
  })
})
