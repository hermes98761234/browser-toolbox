import { describe, expect, it } from 'vitest'
import { argmax, confusion, features, FEATURE_LEN, fitScaler, holdout, initNet, knnPredict, netPredict, resample, scale, SIDE, softmax, synth, trainNet } from './image-classifier-trainer'

function dataset(n: number) {
  const X: number[][] = [], y: number[] = []
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { X.push(features(resample(synth(c, i), 64, 64))); y.push(c) }
  return { X, y }
}

describe('image-classifier-trainer', () => {
  it('resamples by area average', () => {
    const src = new Uint8ClampedArray(64 * 64 * 4).map((_, i) => (i % 4 === 0 ? 200 : 0))
    const r = resample(src, 64, 64)
    expect(r.length).toBe(SIDE * SIDE * 4)
    expect(r[0]).toBe(200)
  })
  it('feature vector has fixed length and normalised colour histogram', () => {
    const f = features(resample(synth(0, 1), 64, 64))
    expect(f).toHaveLength(FEATURE_LEN)
    expect(f.slice(0, 64).reduce((a, v) => a + v * v, 0)).toBeCloseTo(1, 6)
  })
  it('softmax sums to one', () => {
    const p = softmax([1, 2, 3])
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
    expect(p[2]).toBeCloseTo(0.6652, 4)
  })
  it('KNN and MLP learn the synthetic shape classes', () => {
    const { X, y } = dataset(30)
    const { train, val } = holdout(y, 5)
    expect(val.length).toBe(18)
    const sc = fitScaler(train.map((i) => X[i]))
    const Xs = X.map((x) => scale(sc, x))
    const knnPred = val.map((i) => argmax(knnPredict(train.map((j) => Xs[j]), train.map((j) => y[j]), Xs[i], 5, 3)))
    const knnAcc = knnPred.filter((p, k) => p === y[val[k]]).length / val.length
    expect(knnAcc).toBeGreaterThan(0.7)
    const net = initNet(FEATURE_LEN, 24, 3)
    const loss = trainNet(net, train.map((j) => Xs[j]), train.map((j) => y[j]), { epochs: 40, lr: 0.02, l2: 1e-3 })
    expect(loss[loss.length - 1]).toBeLessThan(loss[0])
    const acc = val.filter((i) => argmax(netPredict(net, Xs[i])) === y[i]).length / val.length
    expect(acc).toBeGreaterThan(0.8)
    const m = confusion(val.map((i) => y[i]), knnPred, 3)
    expect(m.flat().reduce((a, b) => a + b, 0)).toBe(18)
  })
})
