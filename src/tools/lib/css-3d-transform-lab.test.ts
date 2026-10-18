import { describe, expect, it } from 'vitest'
import { apply, compose, cssOf, facesAway, I, matrixOf, rotate3d, toMatrix3d, toThree, withOrigin, type TF } from './css-3d-transform-lab'

const tf = (fn: TF['fn'], ...v: number[]): TF => ({ id: fn, fn, v })
const near = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 6))

describe('css 3d transform lab', () => {
  it('builds the CSS matrices', () => {
    // rotate(90deg) turns +x into +y (clockwise on screen, y down)
    near(apply(matrixOf(tf('rotateZ', 90)), [1, 0, 0]), [0, 1, 0])
    near(apply(matrixOf(tf('rotateY', 90)), [1, 0, 0]), [0, 0, -1])
    near(apply(matrixOf(tf('rotateX', 90)), [0, 1, 0]), [0, 0, 1])
    near(rotate3d(0, 0, 2, 30), matrixOf(tf('rotateZ', 30)))
    near(apply(matrixOf(tf('skewX', 45)), [0, 1, 0]), [1, 1, 0])
    near(apply(matrixOf(tf('perspective', 100)), [10, 0, 50]), [20, 0, 100])
  })
  it('composes right-to-left and handles origin', () => {
    const m = compose([tf('translateX', 100), tf('rotateZ', 90)])
    near(apply(m, [10, 0, 0]), [100, 10, 0])
    const o = withOrigin(matrixOf(tf('rotateZ', 180)), 50, 50, 0)
    near(apply(o, [0, 0, 0]), [100, 100, 0])
  })
  it('formats CSS', () => {
    expect(cssOf(tf('rotate3d', 1, 1, 0, 45))).toBe('rotate3d(1, 1, 0, 45deg)')
    expect(toMatrix3d(matrixOf(tf('translate3d', 1, 2, 3)))).toBe('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1)')
  })
  it('converts to y-up units and detects back faces', () => {
    const t = toThree(matrixOf(tf('translate3d', 100, 200, 0)), 100)
    near([t[3], t[7], t[11]], [1, -2, 0])
    const r = toThree(matrixOf(tf('rotateZ', 90)), 100)
    near([r[0], r[1], r[4], r[5]], [0, 1, -1, 0]) // clockwise on screen = negative turn in y-up space
    expect(facesAway(I())).toBe(false)
    expect(facesAway(matrixOf(tf('rotateY', 180)))).toBe(true)
    expect(facesAway(matrixOf(tf('rotateY', 60)))).toBe(false)
  })
})
