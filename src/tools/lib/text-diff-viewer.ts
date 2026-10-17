// Myers O(ND) diff over token arrays, plus line/word helpers, side-by-side pairing and unified patches.

export type OpType = 'eq' | 'del' | 'ins'
export interface Op {
  t: OpType
  /** Index in the old array (del/eq) */
  a: number
  /** Index in the new array (ins/eq) */
  b: number
}

/** Shortest edit script between `a` and `b` (compared by ===). Gives up refining after `maxD` edits. */
export function diffKeys(a: readonly string[], b: readonly string[], maxD = 4000): Op[] {
  // Trim common prefix and suffix: cheap and keeps D small.
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  const A = a.slice(pre, a.length - suf)
  const B = b.slice(pre, b.length - suf)
  const out: Op[] = []
  for (let i = 0; i < pre; i++) out.push({ t: 'eq', a: i, b: i })
  const mid = myers(A, B, maxD)
  for (const o of mid) out.push({ t: o.t, a: o.a + pre, b: o.b + pre })
  for (let i = 0; i < suf; i++) out.push({ t: 'eq', a: a.length - suf + i, b: b.length - suf + i })
  return out
}

function myers(a: readonly string[], b: readonly string[], maxD: number): Op[] {
  const N = a.length, M = b.length
  if (!N) return b.map((_, j) => ({ t: 'ins' as const, a: 0, b: j }))
  if (!M) return a.map((_, i) => ({ t: 'del' as const, a: i, b: 0 }))
  const MAX = N + M
  const off = MAX + 1
  const v = new Int32Array(2 * MAX + 3)
  const trace: Int32Array[] = []
  let found = -1
  for (let d = 0; d <= MAX && found < 0; d++) {
    if (d > maxD) break
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1
      let y = x - k
      while (x < N && y < M && a[x] === b[y]) {
        x++
        y++
      }
      v[off + k] = x
      if (x >= N && y >= M) {
        found = d
        break
      }
    }
    trace.push(v.slice(off - d, off + d + 1))
  }
  if (found < 0) {
    // Too different: report everything as replaced.
    return [...a.map((_, i) => ({ t: 'del' as const, a: i, b: 0 })), ...b.map((_, j) => ({ t: 'ins' as const, a: N, b: j }))]
  }
  const rev: Op[] = []
  let x = N, y = M
  for (let d = found; d > 0; d--) {
    const prev = trace[d - 1]
    const at = (k: number) => prev[k + d - 1]
    const k = x - y
    const pk = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1
    const px = at(pk)
    const py = px - pk
    while (x > px && y > py) {
      x--
      y--
      rev.push({ t: 'eq', a: x, b: y })
    }
    if (x === px) {
      y--
      rev.push({ t: 'ins', a: x, b: y })
    } else {
      x--
      rev.push({ t: 'del', a: x, b: y })
    }
  }
  while (x > 0 && y > 0) {
    x--
    y--
    rev.push({ t: 'eq', a: x, b: y })
  }
  return rev.reverse()
}

export interface Lines {
  lines: string[]
  eol: boolean
}

export function splitLines(text: string): Lines {
  const t = text.replace(/\r\n?/g, '\n')
  if (t === '') return { lines: [], eol: true }
  const lines = t.split('\n')
  const eol = lines[lines.length - 1] === ''
  if (eol) lines.pop()
  return { lines, eol }
}

export interface DiffOpts {
  ignoreCase?: boolean
  ignoreWhitespace?: boolean
}

const key = (s: string, o: DiffOpts) => {
  let k = s
  if (o.ignoreWhitespace) k = k.replace(/\s+/g, ' ').trim()
  if (o.ignoreCase) k = k.toLowerCase()
  return k
}

export interface LineDiff {
  old: Lines
  new: Lines
  ops: Op[]
  added: number
  removed: number
  same: number
  similarity: number
}

export function diffLines(oldText: string, newText: string, o: DiffOpts = {}): LineDiff {
  const A = splitLines(oldText)
  const B = splitLines(newText)
  const ka = A.lines.map((l) => key(l, o))
  const kb = B.lines.map((l) => key(l, o))
  // A missing final newline makes the last line differ (as in `diff -u`).
  if (A.eol !== B.eol) {
    if (!A.eol && ka.length) ka[ka.length - 1] += '\u0000'
    if (!B.eol && kb.length) kb[kb.length - 1] += '\u0000'
  }
  const ops = diffKeys(ka, kb)
  let added = 0, removed = 0, same = 0
  for (const op of ops) {
    if (op.t === 'ins') added++
    else if (op.t === 'del') removed++
    else same++
  }
  const total = A.lines.length + B.lines.length
  return { old: A, new: B, ops, added, removed, same, similarity: total ? (2 * same) / total : 1 }
}

/** Words, runs of whitespace and single punctuation marks. */
export function tokenize(s: string): string[] {
  return s.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) ?? []
}

export interface Piece {
  t: OpType
  text: string
}

/** Word-level diff, merged into runs of the same type. */
export function diffWords(a: string, b: string, o: DiffOpts = {}): Piece[] {
  const ta = tokenize(a), tb = tokenize(b)
  const k = (t: string) => (o.ignoreWhitespace && /^\s+$/.test(t) ? ' ' : o.ignoreCase ? t.toLowerCase() : t)
  const ops = diffKeys(ta.map(k), tb.map(k), 3000)
  const out: Piece[] = []
  for (const op of ops) {
    const text = op.t === 'ins' ? tb[op.b] : ta[op.a]
    const last = out[out.length - 1]
    if (last && last.t === op.t) last.text += text
    else out.push({ t: op.t, text })
  }
  return out
}

export interface SideRow {
  kind: 'eq' | 'chg' | 'del' | 'ins'
  l?: number
  r?: number
}

/** Pairs deleted and inserted runs line by line for the side-by-side view. */
export function sideBySide(ops: Op[]): SideRow[] {
  const rows: SideRow[] = []
  let i = 0
  while (i < ops.length) {
    if (ops[i].t === 'eq') {
      rows.push({ kind: 'eq', l: ops[i].a, r: ops[i].b })
      i++
      continue
    }
    const dels: number[] = [], ins: number[] = []
    while (i < ops.length && ops[i].t !== 'eq') {
      if (ops[i].t === 'del') dels.push(ops[i].a)
      else ins.push(ops[i].b)
      i++
    }
    for (let j = 0; j < Math.max(dels.length, ins.length); j++) {
      const l = dels[j], r = ins[j]
      rows.push({ kind: l !== undefined && r !== undefined ? 'chg' : l !== undefined ? 'del' : 'ins', l, r })
    }
  }
  return rows
}

export interface Hunk {
  /** Range [from, to) into ops */
  from: number
  to: number
  oldStart: number
  oldLen: number
  newStart: number
  newLen: number
}

/** Groups changes with `ctx` lines of context; nearby changes share a hunk. */
export function hunks(ops: Op[], ctx = 3): Hunk[] {
  const changes: number[] = []
  ops.forEach((o, i) => o.t !== 'eq' && changes.push(i))
  const out: Hunk[] = []
  let k = 0
  while (k < changes.length) {
    const from = Math.max(0, changes[k] - ctx)
    let last = changes[k]
    while (k + 1 < changes.length && changes[k + 1] - last <= 2 * ctx + 1) last = changes[++k]
    k++
    const to = Math.min(ops.length, last + ctx + 1)
    let oldLen = 0, newLen = 0
    for (let i = from; i < to; i++) {
      if (ops[i].t !== 'ins') oldLen++
      if (ops[i].t !== 'del') newLen++
    }
    // Lines before the hunk in each file.
    let oldBefore = 0, newBefore = 0
    for (let i = 0; i < from; i++) {
      if (ops[i].t !== 'ins') oldBefore++
      if (ops[i].t !== 'del') newBefore++
    }
    out.push({ from, to, oldLen, newLen, oldStart: oldLen ? oldBefore + 1 : oldBefore, newStart: newLen ? newBefore + 1 : newBefore })
  }
  return out
}

/** Unified diff (`diff -u` / `git apply` compatible). */
export function unifiedPatch(d: LineDiff, oldName = 'a.txt', newName = 'b.txt', ctx = 3): string {
  const hs = hunks(d.ops, ctx)
  if (!hs.length) return ''
  const out = [`--- ${oldName}`, `+++ ${newName}`]
  const NL = '\\ No newline at end of file'
  const lastA = d.old.lines.length - 1, lastB = d.new.lines.length - 1
  for (const h of hs) {
    out.push(`@@ -${h.oldStart}${h.oldLen === 1 ? '' : ',' + h.oldLen} +${h.newStart}${h.newLen === 1 ? '' : ',' + h.newLen} @@`)
    for (let i = h.from; i < h.to; i++) {
      const o = d.ops[i]
      if (o.t === 'eq') {
        out.push(' ' + d.old.lines[o.a])
        if (o.a === lastA && !d.old.eol) out.push(NL)
      } else if (o.t === 'del') {
        out.push('-' + d.old.lines[o.a])
        if (o.a === lastA && !d.old.eol) out.push(NL)
      } else {
        out.push('+' + d.new.lines[o.b])
        if (o.b === lastB && !d.new.eol) out.push(NL)
      }
    }
  }
  return out.join('\n') + '\n'
}
