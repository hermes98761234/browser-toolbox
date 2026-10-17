import { describe, expect, it } from 'vitest'
import { display, dms, exposure, findTiff, flash, jpegWithExif, parseTiff, stripJpeg, writeTiff } from './exif-viewer'

const tiff = writeTiff(
  [
    { id: 0x010f, type: 2, value: 'Canon' },
    { id: 0x0110, type: 2, value: 'EOS R6' },
    { id: 0x0112, type: 3, value: [6] },
  ],
  [
    { id: 0x829a, type: 5, value: [[1, 250]] },
    { id: 0x829d, type: 5, value: [[28, 10]] },
    { id: 0x8827, type: 3, value: [400] },
    { id: 0x9204, type: 10, value: [[-2, 3]] },
  ],
  [
    { id: 0x01, type: 2, value: 'N' },
    { id: 0x02, type: 5, value: [[50, 1], [27, 1], [1234, 100]] },
    { id: 0x03, type: 2, value: 'E' },
    { id: 0x04, type: 5, value: [[30, 1], [31, 1], [2, 1]] },
  ],
)
const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xda, 0, 2, 9, 9, 0xff, 0xd9])

describe('exif', () => {
  it('round-trips a TIFF block', () => {
    const tags = parseTiff(tiff)
    const get = (n: string) => tags.find((t) => t.name === n)!
    expect(get('Make').value).toBe('Canon')
    expect(get('Model').value).toBe('EOS R6')
    expect(display(get('Orientation'))).toBe('Rotated 90° CW')
    expect(display(get('ExposureTime'))).toBe('1/250 s')
    expect(display(get('FNumber'))).toBe('f/2.8')
    expect(get('ISO').value).toBe(400)
    expect(display(get('ExposureBiasValue'))).toBe('-0.67 EV')
    expect(get('GPSLatitude').ifd).toBe('GPS')
  })
  it('finds Exif in a JPEG and strips it', () => {
    const j = jpegWithExif(fakeJpeg, tiff)
    const t = findTiff(j)!
    expect(t.length).toBe(tiff.length)
    expect(parseTiff(t).length).toBeGreaterThan(8)
    const s = stripJpeg(j)
    expect(findTiff(s)).toBeNull()
    expect(s.length).toBe(fakeJpeg.length)
  })
  it('converts DMS and formats values', () => {
    expect(dms([[50, 1], [27, 1], [1234, 100]], 'N')).toBeCloseTo(50.453428, 5)
    expect(dms([[30, 1], [31, 1], [2, 1]], 'W')).toBeCloseTo(-30.517222, 5)
    expect(exposure(2)).toBe('2 s')
    expect(exposure(1 / 60)).toBe('1/60 s')
    expect(flash(0x19)).toBe('Fired, auto')
    expect(flash(0x10)).toBe('Did not fire, suppressed')
  })
})
