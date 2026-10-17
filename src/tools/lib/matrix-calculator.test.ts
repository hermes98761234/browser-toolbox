import { describe, expect, it } from 'vitest'
import { charPoly, cholesky, det, eigenvector, inverse, jacobi, lu, mul, parseMatrix, polyRoots, power, qr, rref, solveSystem, toFraction, transpose } from './matrix-calculator'

const A = [[2, 1, 1], [4, -6, 0], [-2, 7, 2]]
const close = (X: number[][], Y: number[][]) => X.forEach((r, i) => r.forEach((v, j) => expect(v).toBeCloseTo(Y[i][j], 8)))

describe('matrix-calculator', () => {
  it('determinant and inverse', () => {
    expect(det(A).det).toBe(-16)
    expect(det([[1, 2], [2, 4]]).det).toBe(0)
    const inv = inverse(A).inv!
    close(mul(A, inv), [[1, 0, 0], [0, 1, 0], [0, 0, 1]])
    expect(inverse([[1, 2], [2, 4]]).inv).toBeNull()
  })
  it('rref, rank and systems', () => {
    const r = rref([[1, 2, 3], [4, 5, 6], [7, 8, 9]])
    expect(r.rank).toBe(2)
    expect(r.R).toEqual([[1, 0, -1], [0, 1, 2], [0, 0, 0]])
    expect(solveSystem([[2, 1], [1, 3]], [3, 5])).toMatchObject({ kind: 'unique', x: [0.8, 1.4] })
    expect(solveSystem([[1, 1], [1, 1]], [1, 2]).kind).toBe('none')
    expect(solveSystem([[1, 1], [2, 2]], [1, 2]).kind).toBe('infinite')
  })
  it('decompositions', () => {
    const { P, L, U } = lu(A)
    close(mul(P, A), mul(L, U))
    const { Q, R } = qr(A)
    close(mul(Q, R), A)
    close(mul(transpose(Q), Q), [[1, 0, 0], [0, 1, 0], [0, 0, 1]])
    const S = [[4, 12, -16], [12, 37, -43], [-16, -43, 98]]
    expect(cholesky(S)).toEqual([[2, 0, 0], [6, 1, 0], [-8, 5, 3]])
    expect(cholesky(A)).toBeNull()
  })
  it('eigenvalues', () => {
    expect(charPoly([[2, 0], [0, 3]])).toEqual([1, -5, 6])
    const ev = polyRoots(charPoly([[0, -1], [1, 0]]))
    expect(ev.map((z) => [z.re, Math.abs(z.im)])).toEqual([[0, 1], [0, 1]])
    const j = jacobi([[2, 1], [1, 2]])
    expect(j.values[0]).toBeCloseTo(3, 10)
    expect(j.values[1]).toBeCloseTo(1, 10)
    const roots = polyRoots(charPoly([[4, 1], [2, 3]])).map((z) => z.re)
    expect(roots[0]).toBeCloseTo(5, 8)
    expect(roots[1]).toBeCloseTo(2, 8)
    const v = eigenvector([[4, 1], [2, 3]], 5)
    expect(v[0]).toBeCloseTo(1 / Math.SQRT2, 6)
  })
  it('powers, fractions, parsing', () => {
    expect(power([[1, 1], [1, 0]], 10)).toEqual([[89, 55], [55, 34]])
    expect(toFraction(-0.75)).toBe('−3/4')
    expect(toFraction(1 / 3)).toBe('1/3')
    expect(toFraction(Math.PI)).toBe('3.14159')
    expect(parseMatrix('1 2; 3 1/2')).toEqual([[1, 2], [3, 0.5]])
    expect(parseMatrix('1 2\n3')).toBeNull()
  })
})
