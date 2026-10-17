// Balanced random grouping with keep-apart / keep-together constraints.

export interface Person { name: string; tag: string; skill: number | null }
export interface Pair { a: string; b: string; together: boolean }

/** "Name", "Name, tag", "Name, tag, 3" (separators: , ; | tab). Numeric fields become skill. */
export function parseRoster(text: string): Person[] {
  const seen = new Set<string>()
  const out: Person[] = []
  for (const line of text.split(/\r?\n/)) {
    const f = line.split(/[,;|\t]/).map((x) => x.trim()).filter(Boolean)
    if (!f.length || f[0].startsWith('#')) continue
    const name = f[0]
    if (seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    let tag = ''
    let skill: number | null = null
    for (const x of f.slice(1)) {
      if (/^-?\d+(\.\d+)?$/.test(x)) skill = Number(x)
      else tag = x
    }
    out.push({ name, tag, skill })
  }
  return out
}

/** "Anna - Ben" / "Anna x Ben" keep apart; "Anna + Ben" keep together. */
export function parsePairs(text: string): Pair[] {
  const out: Pair[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(.+?)\s+(-|x|\+|&)\s+(.+?)\s*$/i.exec(line)
    if (m) out.push({ a: m[1], b: m[3], together: m[2] === '+' || m[2] === '&' })
  }
  return out
}

/** Mulberry32 PRNG. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function sizesFor(n: number, mode: 'count' | 'size', k: number): number[] {
  const g = Math.max(1, Math.min(n || 1, mode === 'count' ? Math.round(k) : Math.ceil(n / Math.max(1, Math.round(k)))))
  return Array.from({ length: g }, (_, i) => Math.floor(n / g) + (i < n % g ? 1 : 0))
}

export interface Result { groups: Person[][]; apartBroken: Pair[]; togetherBroken: Pair[]; cost: number }

export function makeGroups(
  people: Person[], sizes: number[], pairs: Pair[], seed: number, opts: { balanceTag?: boolean; balanceSkill?: boolean } = {},
): Result {
  const { balanceTag = true, balanceSkill = true } = opts
  const r = rng(seed)
  const n = people.length
  const G = sizes.length
  const idx = new Map(people.map((p, i) => [p.name.toLowerCase(), i]))
  const cons = pairs
    .map((p) => ({ ...p, i: idx.get(p.a.toLowerCase()), j: idx.get(p.b.toLowerCase()) }))
    .filter((p): p is Pair & { i: number; j: number } => p.i !== undefined && p.j !== undefined && p.i !== p.j)
  // shuffle, then order by tag (round-robin dealing spreads tags) and skill (snake draft)
  const order = people.map((_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  if (balanceSkill) order.sort((a, b) => (people[b].skill ?? 0) - (people[a].skill ?? 0))
  if (balanceTag) order.sort((a, b) => people[a].tag.localeCompare(people[b].tag))
  const slot: number[] = []
  for (let round = 0; slot.length < n; round++) {
    const gs = Array.from({ length: G }, (_, g) => (round % 2 ? G - 1 - g : g))
    for (const g of gs) if (sizes[g] > round && slot.length < n) slot.push(g)
  }
  const gOf = new Int32Array(n)
  order.forEach((p, k) => (gOf[p] = slot[k]))

  const tags = [...new Set(people.map((p) => p.tag))]
  const tagTot = new Map(tags.map((t) => [t, people.filter((p) => p.tag === t).length]))
  const skillTot = people.reduce((a, p) => a + (p.skill ?? 0), 0)
  const cost = () => {
    let c = 0
    for (const p of cons) c += (gOf[p.i] === gOf[p.j]) !== p.together ? 1000 : 0
    for (let g = 0; g < G; g++) {
      const mem = people.filter((_, i) => gOf[i] === g)
      if (balanceTag && tags.length > 1)
        for (const t of tags) {
          const e = (tagTot.get(t)! * sizes[g]) / n
          c += 10 * (mem.filter((p) => p.tag === t).length - e) ** 2
        }
      if (balanceSkill && skillTot) {
        const e = (skillTot * sizes[g]) / n
        c += (mem.reduce((a, p) => a + (p.skill ?? 0), 0) - e) ** 2
      }
    }
    return c
  }
  let best = cost()
  for (let it = 0; it < 3000 && n > 1 && G > 1; it++) {
    const a = Math.floor(r() * n)
    const b = Math.floor(r() * n)
    if (gOf[a] === gOf[b]) continue
    ;[gOf[a], gOf[b]] = [gOf[b], gOf[a]]
    const c = cost()
    if (c <= best) best = c
    else [gOf[a], gOf[b]] = [gOf[b], gOf[a]]
  }
  const groups = sizes.map((_, g) => people.filter((_, i) => gOf[i] === g))
  return {
    groups,
    apartBroken: cons.filter((p) => !p.together && gOf[p.i] === gOf[p.j]),
    togetherBroken: cons.filter((p) => p.together && gOf[p.i] !== gOf[p.j]),
    cost: best,
  }
}
