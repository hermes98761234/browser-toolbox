// Myers O(ND) diff over token arrays + tokenizers, side-by-side alignment and unified-diff output.

export type Op = '=' | '-' | '+'
export interface Chunk { op: Op; items: string[] }

/** Shortest edit script between a and b, compared with `key` (e.g. case/whitespace-insensitive). */
export function diff(a: string[], b: string[], key: (s: string) => string = (s) => s): Chunk[] {
  const ka = a.map(key), kb = b.map(key)
  let pre = 0
  while (pre < ka.length && pre < kb.length && ka[pre] === kb[pre]) pre++
  let suf = 0
  while (suf < ka.length - pre && suf < kb.length - pre && ka[ka.length - 1 - suf] === kb[kb.length - 1 - suf]) suf++
  const A = ka.slice(pre, ka.length - suf), B = kb.slice(pre, kb.length - suf)
  const N = A.length, M = B.length, MAX = N + M
  const raw: Op[] = []
  if (N === 0) raw.push(...Array<Op>(M).fill('+'))
  else if (M === 0) raw.push(...Array<Op>(N).fill('-'))
  else {
    const off = MAX + 1
    const v = new Int32Array(2 * MAX + 3)
    const trace: Int32Array[] = []
    let done = false
    for (let d = 0; d <= MAX && !done; d++) {
      trace.push(v.slice(off - d - 1, off + d + 2)) // snapshot of k ∈ [−d−1, d+1]
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1
        let y = x - k
        while (x < N && y < M && A[x] === B[y]) {
          x++
          y++
        }
        v[off + k] = x
        if (x >= N && y >= M) {
          done = true
          break
        }
      }
    }
    // backtrack
    let x = N, y = M
    for (let d = trace.length - 1; d >= 0; d--) {
      const snap = trace[d]
      const at = (k: number) => snap[k + d + 1]
      const k = x - y
      const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1
      const prevX = d === 0 ? 0 : at(prevK)
      const prevY = prevX - prevK
      while (x > prevX && y > prevY) {
        raw.push('=')
        x--
        y--
      }
      if (d > 0) raw.push(x === prevX ? '+' : '-')
      x = prevX
      y = prevY
    }
    raw.reverse()
  }
  // build chunks over the original (un-keyed) tokens
  const out: Chunk[] = []
  const push = (op: Op, item: string) => {
    const last = out[out.length - 1]
    if (last && last.op === op) last.items.push(item)
    else out.push({ op, items: [item] })
  }
  for (let i = 0; i < pre; i++) push('=', b[i])
  let i = pre, j = pre
  for (const op of raw) {
    if (op === '=') {
      push('=', b[j++])
      i++
    } else if (op === '-') push('-', a[i++])
    else push('+', b[j++])
  }
  for (let t = 0; t < suf; t++) push('=', b[b.length - suf + t])
  return out
}

export const lines = (s: string) => (s === '' ? [] : s.replace(/\r\n?/g, '\n').split('\n'))
/** Words, whitespace runs and punctuation as separate tokens (joining them restores the text). */
export const words = (s: string) => s.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) ?? []
export const chars = (s: string) => [...s]

export function keyFn(ignoreCase: boolean, ignoreWs: boolean) {
  return (s: string) => {
    let k = ignoreWs ? s.replace(/\s+/g, ' ').trim() : s
    if (ignoreCase) k = k.toLowerCase()
    return k
  }
}

export interface Row { left?: string; right?: string; ln?: number; rn?: number; kind: 'same' | 'del' | 'add' | 'change' }

/** Pairs deleted and inserted lines into side-by-side rows. */
export function sideBySide(chunks: Chunk[]): Row[] {
  const rows: Row[] = []
  let ln = 1, rn = 1
  for (let c = 0; c < chunks.length; c++) {
    const ch = chunks[c]
    if (ch.op === '=') for (const t of ch.items) rows.push({ left: t, right: t, ln: ln++, rn: rn++, kind: 'same' })
    else if (ch.op === '-' && chunks[c + 1]?.op === '+') {
      const add = chunks[++c].items
      const n = Math.max(ch.items.length, add.length)
      for (let k = 0; k < n; k++) {
        const l = ch.items[k], r = add[k]
        rows.push({ left: l, right: r, ln: l !== undefined ? ln++ : undefined, rn: r !== undefined ? rn++ : undefined, kind: l !== undefined && r !== undefined ? 'change' : l !== undefined ? 'del' : 'add' })
      }
    } else if (ch.op === '-') for (const t of ch.items) rows.push({ left: t, ln: ln++, kind: 'del' })
    else for (const t of ch.items) rows.push({ right: t, rn: rn++, kind: 'add' })
  }
  return rows
}

/** Unified diff (like `diff -u`) with `ctx` lines of context. */
export function unified(chunks: Chunk[], nameA = 'a', nameB = 'b', ctx = 3): string {
  type L = { op: Op; t: string; a: number; b: number }
  const ls: L[] = []
  let a = 1, b = 1
  for (const ch of chunks) for (const t of ch.items) ls.push({ op: ch.op, t, a: ch.op === '+' ? a : a++, b: ch.op === '-' ? b : b++ })
  const changed = ls.map((l, i) => (l.op !== '=' ? i : -1)).filter((i) => i >= 0)
  if (!changed.length) return ''
  const hunks: [number, number][] = []
  for (const i of changed) {
    const s = Math.max(0, i - ctx), e = Math.min(ls.length - 1, i + ctx)
    const h = hunks[hunks.length - 1]
    if (h && s <= h[1] + 1) h[1] = e
    else hunks.push([s, e])
  }
  let out = `--- ${nameA}\n+++ ${nameB}\n`
  for (const [s, e] of hunks) {
    const part = ls.slice(s, e + 1)
    const oa = part.filter((l) => l.op !== '+'), ob = part.filter((l) => l.op !== '-')
    const sa = oa.length ? oa[0].a : part[0].a - 1, sb = ob.length ? ob[0].b : part[0].b - 1
    out += `@@ -${sa},${oa.length} +${sb},${ob.length} @@\n`
    out += part.map((l) => (l.op === '=' ? ' ' : l.op) + l.t).join('\n') + '\n'
  }
  return out
}

export function stats(chunks: Chunk[], measure: (s: string) => number = () => 1) {
  let same = 0, del = 0, add = 0
  for (const c of chunks) {
    const n = c.items.reduce((s, t) => s + measure(t), 0)
    if (c.op === '=') same += n
    else if (c.op === '-') del += n
    else add += n
  }
  return { same, del, add, similarity: same + del + add ? (2 * same) / (2 * same + del + add) : 1 }
}
