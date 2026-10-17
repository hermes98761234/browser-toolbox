// Web Worker: runs the genetic nesting search off the main thread and streams the best layout.
import { evolve, type Cfg, type Layout, type Piece } from './nesting-optimizer'

interface Job { pieces: Piece[]; cfg: Cfg; gens: number; pop: number; seed: number }

self.onmessage = (e: MessageEvent<Job>) => {
  const { pieces, cfg, gens, pop, seed } = e.data
  const it = evolve(pieces, cfg, { gens, pop, seed })
  let last = 0
  let best: Layout | null = null
  for (;;) {
    const step = it.next()
    if (step.done) { best = step.value; break }
    best = step.value.best
    const now = Date.now()
    if (now - last > 120) { last = now; self.postMessage({ type: 'progress', gen: step.value.gen, gens, best }) }
  }
  self.postMessage({ type: 'done', gens, best })
}
