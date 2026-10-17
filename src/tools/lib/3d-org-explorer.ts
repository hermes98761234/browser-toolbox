// 3D org layouts (cone/radial tree and a depth-locked force layout) + a deterministic sample company.
import type { Node } from './org-chart-maker'

export type P3 = [number, number, number]

const leaves = (n: Node): number => (n.children.length ? n.children.reduce((a, c) => a + leaves(c), 0) : 1)

/** Radial "cone tree": depth goes down (−y), each subtree gets an angular wedge proportional to its leaves. */
export function radialLayout(roots: Node[], ring = 3, level = 2.4): Map<string, P3> {
  const pos = new Map<string, P3>()
  const total = roots.reduce((a, r) => a + leaves(r), 0) || 1
  const place = (n: Node, a0: number, a1: number, rootOffset: number) => {
    const a = (a0 + a1) / 2
    const r = n.depth * ring + rootOffset
    pos.set(n.id, [r * Math.cos(a), -n.depth * level, r * Math.sin(a)])
    let cur = a0
    const tot = leaves(n)
    for (const c of n.children) {
      const span = ((a1 - a0) * leaves(c)) / tot
      place(c, cur, cur + span, rootOffset)
      cur += span
    }
  }
  let a = 0
  for (const r of roots) {
    const span = (Math.PI * 2 * leaves(r)) / total
    place(r, a, a + span, roots.length > 1 ? ring : 0)
    a += span
  }
  return pos
}

/** Force refinement in the horizontal plane; y stays locked to depth (DAG top-down). */
export function forceLayout(roots: Node[], iterations = 160, ring = 3, level = 2.4): Map<string, P3> {
  const start = radialLayout(roots, ring, level)
  const ids = [...start.keys()]
  const idx = new Map(ids.map((id, i) => [id, i]))
  const x = new Float64Array(ids.length), z = new Float64Array(ids.length), y = new Float64Array(ids.length)
  ids.forEach((id, i) => {
    const p = start.get(id)!
    x[i] = p[0]
    y[i] = p[1]
    z[i] = p[2]
  })
  const parent = new Int32Array(ids.length).fill(-1)
  const walk = (n: Node) => n.children.forEach((c) => {
    parent[idx.get(c.id)!] = idx.get(n.id)!
    walk(c)
  })
  roots.forEach(walk)
  const k = ring * 0.9
  for (let it = 0; it < iterations; it++) {
    const t = ring * 0.5 * (1 - it / iterations) + 0.02
    const dx = new Float64Array(ids.length), dz = new Float64Array(ids.length)
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const dy = Math.abs(y[i] - y[j])
        if (dy > level * 1.5) continue // only neighbours in nearby layers push each other
        let ex = x[i] - x[j], ez = z[i] - z[j]
        let d2 = ex * ex + ez * ez
        if (d2 < 1e-6) {
          ex = 0.01 * (i - j)
          ez = 0.01
          d2 = ex * ex + ez * ez
        }
        const f = (k * k) / d2 / (1 + dy)
        dx[i] += ex * f
        dz[i] += ez * f
        dx[j] -= ex * f
        dz[j] -= ez * f
      }
    for (let i = 0; i < ids.length; i++) {
      const p = parent[i]
      if (p >= 0) {
        const ex = x[p] - x[i], ez = z[p] - z[i]
        const d = Math.hypot(ex, ez)
        dx[i] += (ex * d) / k
        dz[i] += (ez * d) / k
        dx[p] -= (ex * d) / k / 2
        dz[p] -= (ez * d) / k / 2
      } else {
        dx[i] -= x[i] * 0.5
        dz[i] -= z[i] * 0.5
      }
    }
    for (let i = 0; i < ids.length; i++) {
      const d = Math.hypot(dx[i], dz[i])
      if (d > 0) {
        x[i] += (dx[i] / d) * Math.min(d, t)
        z[i] += (dz[i] / d) * Math.min(d, t)
      }
    }
  }
  return new Map(ids.map((id, i) => [id, [x[i], y[i], z[i]] as P3]))
}

/** Chain from the top of the org down to `id` (inclusive). */
export function chain(byId: Map<string, Node>, parentOf: Map<string, string>, id: string): Node[] {
  const out: Node[] = []
  const seen = new Set<string>()
  let cur: string | undefined = id
  while (cur && !seen.has(cur) && byId.has(cur)) {
    seen.add(cur)
    out.unshift(byId.get(cur)!)
    cur = parentOf.get(cur)
  }
  return out
}

export function parents(roots: Node[]): Map<string, string> {
  const m = new Map<string, string>()
  const walk = (n: Node) => n.children.forEach((c) => {
    m.set(c.id, n.id)
    walk(c)
  })
  roots.forEach(walk)
  return m
}

export function subtreeIds(n: Node, out = new Set<string>()): Set<string> {
  out.add(n.id)
  n.children.forEach((c) => subtreeIds(c, out))
  return out
}

/** Deterministic ~180-person company as CSV. */
export function sampleOrg(): string {
  let r = 20260417
  const rnd = () => ((r = (r * 48271) % 2147483647) / 2147483647)
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]
  const F = 'Maya Omar Lena Diego Priya Tom Yuki Sam Ivy Noah Ella Jon Ava Leo Zoe Kai Rita Ben Hana Max Aria Luca Nina Ravi Sofia Ethan Mila Jonas Amara Felix Iris Mateo Chloe Arjun Lucy Owen Freya Hugo Maria Kenji Elif Theo Nora Tariq Grace Pavel Ines Dara Olga Victor'.split(' ')
  const S = 'Chen Haddad Fischer Santos Nair Becker Tanaka Okafor Novak Kim Rossi Weiss Martin Dubois Park Müller Gomez Ito Ali Brown Silva Moreau Kowalski Singh Larsen Costa Ahmed Jensen Petrov Rahman Schmidt Lopez Nguyen Andersen Ivanova Sato Ortiz Walsh Kaur Bianchi Dimitrov Murphy Zhang Mensah Varga Hansen'.split(' ')
  const used = new Set<string>()
  const name = () => {
    for (;;) {
      const n = `${pick(F)} ${pick(S)}`
      if (!used.has(n)) {
        used.add(n)
        return n
      }
    }
  }
  const rows: string[] = ['id,name,title,manager,department']
  let id = 0
  const add = (title: string, mgr: number | '', dept: string) => {
    rows.push(`${++id},${name()},${title},${mgr},${dept}`)
    return id
  }
  const ceo = add('Chief Executive Officer', '', 'Executive')
  const D: [string, string, string[], number][] = [
    ['Engineering', 'CTO', ['Platform', 'Apps', 'Data', 'Infrastructure'], 6],
    ['Product', 'VP Product', ['Core', 'Growth'], 4],
    ['Design', 'Head of Design', ['Product design'], 4],
    ['Sales', 'VP Sales', ['EMEA', 'Americas', 'APAC'], 6],
    ['Marketing', 'CMO', ['Brand', 'Demand gen'], 4],
    ['Finance', 'CFO', ['Accounting', 'FP&A'], 3],
    ['People', 'VP People', ['Talent', 'People ops'], 3],
    ['Support', 'VP Customer Success', ['Tier 1', 'Tier 2'], 6],
  ]
  const ic: Record<string, string[]> = {
    Engineering: ['Software Engineer', 'Senior Engineer', 'Staff Engineer', 'QA Engineer', 'SRE'], Product: ['Product Manager', 'Product Analyst'], Design: ['Product Designer', 'UX Researcher'],
    Sales: ['Account Executive', 'Sales Development Rep', 'Solutions Engineer'], Marketing: ['Content Marketer', 'Growth Marketer', 'Designer'], Finance: ['Accountant', 'Financial Analyst'],
    People: ['Recruiter', 'HR Partner'], Support: ['Support Specialist', 'Customer Success Manager'],
  }
  for (const [dept, head, teams, size] of D) {
    const h = add(head, ceo, dept)
    for (const t of teams) {
      const m = add(`${dept === 'Sales' ? 'Sales Director' : 'Manager'} — ${t}`, h, dept)
      const n = Math.max(2, Math.round(size * (0.6 + rnd() * 0.8)))
      for (let i = 0; i < n; i++) {
        const p = add(pick(ic[dept]), m, dept)
        if (dept === 'Engineering' && i === 0 && rnd() < 0.7) for (let j = 0; j < 2; j++) add('Software Engineer', p, dept) // tech-lead pods
      }
    }
  }
  add('Executive Assistant', ceo, 'Executive')
  add('Chief of Staff', ceo, 'Executive')
  return rows.join('\n')
}
