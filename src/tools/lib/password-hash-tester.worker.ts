// Web Worker: runs the slow password-hashing functions off the main thread.
import { makeHash, selfTest, verifyHash, type HashReq } from './password-hash-tester'

type Job =
  | { id: number; op: 'hash'; req: HashReq }
  | { id: number; op: 'verify'; encoded: string; password: string }
  | { id: number; op: 'bench'; req: HashReq; key: 'cost' | 'm' | 'ln' | 'iters'; values: number[]; budgetMs: number }
  | { id: number; op: 'selftest' }

const ctx = self as unknown as { onmessage: ((e: MessageEvent<Job>) => void) | null; postMessage: (m: unknown) => void }

ctx.onmessage = async (e) => {
  const j = e.data
  try {
    if (j.op === 'hash') {
      const t0 = performance.now()
      const out = await makeHash(j.req)
      ctx.postMessage({ id: j.id, done: true, out, ms: performance.now() - t0 })
    } else if (j.op === 'verify') {
      const t0 = performance.now()
      const v = await verifyHash(j.encoded, j.password)
      ctx.postMessage({ id: j.id, done: true, verified: v, ms: performance.now() - t0 })
    } else if (j.op === 'bench') {
      for (const v of j.values) {
        const t0 = performance.now()
        await makeHash({ ...j.req, [j.key]: v })
        const ms = performance.now() - t0
        ctx.postMessage({ id: j.id, point: [v, ms] })
        if (ms > j.budgetMs) break
      }
      ctx.postMessage({ id: j.id, done: true })
    } else {
      const t0 = performance.now()
      ctx.postMessage({ id: j.id, done: true, tests: selfTest(), ms: performance.now() - t0 })
    }
  } catch (err) {
    ctx.postMessage({ id: j.id, done: true, error: (err as Error).message })
  }
}
