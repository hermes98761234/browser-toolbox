// Seeded placeholder-text generator: words → sentences → paragraphs / lists / headings, rendered as text, HTML or Markdown.

export const BANKS: Record<string, string> = {
  latin: 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus nunc vitae tortor gravida fermentum mauris vel pellentesque habitant morbi tristique senectus netus malesuada fames ac turpis egestas integer feugiat scelerisque varius vivamus at augue eget arcu dictum sagittis purus semper quam pulvinar etiam erat aenean euismod elementum nisl sapien faucibus blandit massa cursus risus viverra accumsan donec ultrices porttitor rhoncus dapibus odio ornare suspendisse potenti nullam vehicula ipsum a arcu cursus vitae congue',
  tech: 'cloud native scalable pipeline latency throughput microservice deploy container cluster cache payload endpoint schema query index shard replica rollback feature flag sprint backlog refactor runtime compiler bundle edge function token webhook observability metrics dashboard incident postmortem roadmap stakeholder synergy bandwidth leverage async stream buffer queue worker serverless framework middleware gateway latency budget uptime regression benchmark artifact registry vector embedding model inference prompt dataset',
  space: 'orbit nebula galaxy comet asteroid quasar pulsar telescope gravity horizon eclipse solar lunar stellar cosmic nova supernova meteor satellite rocket booster payload launch capsule astronaut module docking spacewalk crater regolith exoplanet atmosphere magnetosphere radiation light year parsec redshift dark matter cluster spiral dwarf giant ring moon planet probe lander rover mission control countdown trajectory apogee perigee',
  food: 'cupcake caramel brownie sprinkles marzipan croissant macaron toffee pudding cinnamon vanilla meringue sorbet tiramisu donut pastry muffin truffle praline ganache biscuit waffle pancake syrup honey fudge licorice cheesecake gelato sundae cookie crumble shortbread lemon tart cream butter sugar cocoa almond hazelnut pecan maple berry jam custard eclair strudel scone',
}
export const CLASSIC = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'

/** FNV-1a string hash → mulberry32 PRNG. */
export function seeded(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type R = () => number
const int = (r: R, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function words(r: R, bank: string[], n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    let w = bank[Math.floor(r() * bank.length)]
    if (w === out[out.length - 1]) w = bank[(bank.indexOf(w) + 1) % bank.length]
    out.push(w)
  }
  return out
}

export function sentence(r: R, bank: string[], min: number, max: number): string {
  const w = words(r, bank, int(r, min, Math.max(min, max)))
  // a comma after roughly every 6–10 words, never at the end
  for (let i = 5; i < w.length - 2; i += int(r, 6, 10)) w[i] += ','
  return cap(w.join(' ')) + (r() < 0.08 ? '?' : '.')
}

export interface Opts { bank: string; kind: 'paragraphs' | 'sentences' | 'words' | 'list' | 'headings' | 'document'; count: number; classic: boolean; sMin: number; sMax: number; pMin: number; pMax: number; seed: string }
export type Block = { t: 'p' | 'h1' | 'h2' | 'h3'; text: string } | { t: 'ul' | 'ol'; items: string[] }

export function generate(o: Opts): Block[] {
  const r = seeded(`${o.seed}|${o.bank}|${o.kind}`)
  const bank = (BANKS[o.bank] ?? BANKS.latin).split(' ')
  const n = Math.max(1, Math.min(500, Math.floor(o.count)))
  const S = () => sentence(r, bank, o.sMin, o.sMax)
  const para = () => Array.from({ length: int(r, o.pMin, Math.max(o.pMin, o.pMax)) }, S).join(' ')
  const title = (lo: number, hi: number) => cap(words(r, bank, int(r, lo, hi)).join(' '))
  const lead = (s: string) => (o.classic && o.bank === 'latin' ? CLASSIC + s.slice(s.indexOf('.') + 1) : s)
  let out: Block[]
  switch (o.kind) {
    case 'words': {
      const w = words(r, bank, n)
      if (o.classic && o.bank === 'latin') CLASSIC.replace(/[.,]/g, '').toLowerCase().split(' ').slice(0, n).forEach((x, i) => (w[i] = x))
      out = [{ t: 'p', text: cap(w.join(' ')) + '.' }]
      break
    }
    case 'sentences': out = [{ t: 'p', text: lead(Array.from({ length: n }, S).join(' ')) }]; break
    case 'list': out = [{ t: 'ul', items: Array.from({ length: n }, () => title(2, 6)) }]; break
    case 'headings': out = Array.from({ length: n }, (_, i) => ({ t: (['h1', 'h2', 'h3'] as const)[Math.min(2, i)], text: title(2, 5) })); break
    case 'document': {
      out = [{ t: 'h1', text: title(3, 5) }]
      for (let i = 0; i < n; i++) {
        out.push({ t: 'h2', text: title(2, 4) }, { t: 'p', text: para() })
        if (i % 2 === 1) out.push({ t: i % 4 === 1 ? 'ul' : 'ol', items: Array.from({ length: int(r, 3, 5) }, () => title(2, 6)) })
        else out.push({ t: 'p', text: para() })
      }
      break
    }
    default: out = Array.from({ length: n }, () => ({ t: 'p' as const, text: para() }))
  }
  const first = out.find((b) => b.t === 'p')
  if (first && first.t === 'p' && o.kind !== 'words' && o.kind !== 'sentences') first.text = lead(first.text)
  return out
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function render(blocks: Block[], fmt: 'text' | 'html' | 'markdown'): string {
  return blocks.map((b) => {
    if ('items' in b) {
      if (fmt === 'html') return `<${b.t}>\n${b.items.map((i) => `  <li>${esc(i)}</li>`).join('\n')}\n</${b.t}>`
      return b.items.map((i, k) => (b.t === 'ol' ? `${k + 1}. ` : fmt === 'markdown' ? '- ' : '• ') + i).join('\n')
    }
    if (fmt === 'html') return `<${b.t}>${esc(b.text)}</${b.t}>`
    if (fmt === 'markdown' && b.t !== 'p') return `${'#'.repeat(Number(b.t[1]))} ${b.text}`
    return b.text
  }).join('\n\n')
}

export function stats(text: string) {
  const plain = text.replace(/<[^>]+>/g, ' ')
  const w = plain.match(/[\p{L}\p{N}']+/gu) ?? []
  return { words: w.length, chars: text.length, sentences: (plain.match(/[.?!](\s|$)/g) ?? []).length, bytes: new TextEncoder().encode(text).length }
}
