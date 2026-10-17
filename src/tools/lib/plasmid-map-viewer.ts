// GenBank parsing and circular-map layout helpers for plasmid maps.
import { parseFasta, reverseComplement } from './dna-sequence-toolkit'

export interface Feature { type: string; label: string; strand: 1 | -1 | 0; segs: [number, number][]; quals: Record<string, string> }
export interface Record_ { name: string; definition: string; length: number; circular: boolean; seq: string; features: Feature[]; warnings: string[] }

/** Parses a GenBank location string into 1-based inclusive segments and a strand. */
export function parseLocation(loc: string): { segs: [number, number][]; strand: 1 | -1 } | null {
  let s = loc.replace(/\s+/g, '').replace(/[<>]/g, '')
  let strand: 1 | -1 = 1
  // complement() can wrap the whole location or individual parts
  const whole = /^complement\((.*)\)$/.exec(s)
  if (whole) {
    strand = -1
    s = whole[1]
  }
  const inner = /^(?:join|order)\((.*)\)$/.exec(s)
  const parts = inner ? inner[1].split(',') : [s]
  const segs: [number, number][] = []
  for (let p of parts) {
    const c = /^complement\((.*)\)$/.exec(p)
    if (c) {
      strand = -1
      p = c[1]
    }
    const m = /^(?:[\w.]+:)?(\d+)(?:(?:\.\.|\^)(\d+))?$/.exec(p)
    if (!m) return null
    segs.push([Number(m[1]), Number(m[2] ?? m[1])])
  }
  return segs.length ? { segs, strand } : null
}

export function featureLabel(type: string, q: Record<string, string>): string {
  return q.label || q.gene || q.product || q.standard_name || q.note?.split(/[;,.]/)[0] || type
}

export function parseGenBank(text: string): Record_ {
  const warnings: string[] = []
  const lines = text.split(/\r?\n/)
  const locus = lines.find((l) => l.startsWith('LOCUS')) ?? ''
  const name = locus.split(/\s+/)[1] ?? 'plasmid'
  const circular = /circular/i.test(locus)
  let definition = ''
  const features: Feature[] = []
  let seq = ''
  let mode: 'head' | 'feat' | 'seq' = 'head'
  let cur: { type: string; loc: string; quals: [string, string][] } | null = null
  let inQual = false
  const flush = () => {
    if (!cur) return
    const loc = parseLocation(cur.loc)
    if (!loc) warnings.push(`Unsupported location "${cur.loc}" for ${cur.type}`)
    else if (cur.type !== 'source') {
      const quals = Object.fromEntries(cur.quals.map(([k, v]) => [k, v.replace(/^"|"$/g, '')]))
      features.push({ type: cur.type, label: featureLabel(cur.type, quals), strand: loc.strand, segs: loc.segs, quals })
    }
    cur = null
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (mode === 'head') {
      if (l.startsWith('DEFINITION')) {
        definition = l.slice(12).trim()
        while (lines[i + 1]?.startsWith('            ')) definition += ' ' + lines[++i].trim()
      }
      if (l.startsWith('FEATURES')) mode = 'feat'
      if (l.startsWith('ORIGIN')) mode = 'seq'
      continue
    }
    if (mode === 'feat') {
      if (l.startsWith('ORIGIN') || l.startsWith('CONTIG') || /^\S/.test(l)) {
        flush()
        if (l.startsWith('ORIGIN')) mode = 'seq'
        continue
      }
      const key = /^ {5}(\S+)\s+(.*)$/.exec(l)
      if (key) {
        flush()
        cur = { type: key[1], loc: key[2].trim(), quals: [] }
        inQual = false
        continue
      }
      const body = l.trim()
      if (!cur || !body) continue
      if (body.startsWith('/')) {
        const m = /^\/([^=]+)(?:=(.*))?$/.exec(body)!
        cur.quals.push([m[1], m[2] ?? ''])
        inQual = true
      } else if (inQual && cur.quals.length) {
        const q = cur.quals[cur.quals.length - 1]
        q[1] += (q[0] === 'translation' ? '' : ' ') + body
      } else cur.loc += body
      continue
    }
    if (l.startsWith('//')) break
    seq += l.replace(/[^A-Za-z]/g, '')
  }
  flush()
  seq = seq.toUpperCase()
  const lenM = /\s(\d+)\s+bp/.exec(locus)
  const length = seq.length || Number(lenM?.[1] ?? 0)
  for (const f of features) for (const [a, b] of f.segs) if (a > length || b > length) warnings.push(`${f.label}: location beyond sequence end`)
  return { name, definition, length, circular: circular || !locus, seq, features, warnings }
}

/** Accepts GenBank, FASTA or a bare sequence. */
export function parseAny(text: string): Record_ {
  if (/^\s*LOCUS/m.test(text) || /^FEATURES/m.test(text)) return parseGenBank(text)
  const r = parseFasta(text)[0]
  const seq = (r?.seq ?? '').replace(/[^ACGTRYSWKMBDHVN]/g, '')
  return { name: r?.id ?? 'sequence', definition: r?.desc ?? '', length: seq.length, circular: true, seq, features: [], warnings: seq ? ['No feature annotations (FASTA / raw sequence): only restriction sites are shown.'] : [] }
}

/** Feature span on the circle: start and length in bp (wrapping across the origin when needed). */
export function span(f: Feature, len: number): { start: number; size: number } {
  const starts = f.segs.map((s) => s[0]), ends = f.segs.map((s) => s[1])
  const a = f.segs[0][0], b = f.segs[f.segs.length - 1][1]
  if (f.segs.length === 1 && a > b) return { start: a, size: len - a + 1 + b } // origin-spanning a..b written as e.g. 2600..50
  if (b >= a) return { start: Math.min(...starts), size: Math.max(...ends) - Math.min(...starts) + 1 }
  return { start: a, size: len - a + 1 + b }
}

/** Assigns overlapping features to concentric lanes (0 = closest to the backbone). */
export function lanes(features: Feature[], len: number, gap = 0): number[] {
  const order = features.map((f, i) => ({ i, ...span(f, len) })).sort((x, y) => y.size - x.size)
  const used: { start: number; size: number }[][] = []
  const out = new Array(features.length).fill(0)
  const overlap = (a: { start: number; size: number }, b: { start: number; size: number }) => {
    const d = (((b.start - a.start) % len) + len) % len
    return d < a.size + gap || (len - d) < b.size + gap
  }
  for (const f of order) {
    let lane = 0
    while (used[lane]?.some((u) => overlap(u, f))) lane++
    ;(used[lane] ??= []).push(f)
    out[f.i] = lane
  }
  return out
}

/** Spreads label angles (radians, sorted) so neighbours are at least `minGap` apart on the circle. */
export function spreadAngles(angles: number[], minGap: number): number[] {
  const n = angles.length
  if (n < 2) return [...angles]
  const idx = angles.map((a, i) => ({ a, i })).sort((x, y) => x.a - y.a)
  const out = idx.map((x) => x.a)
  for (let iter = 0; iter < 200; iter++) {
    let moved = false
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n
      let d = out[j] - out[k]
      if (j === 0) d += Math.PI * 2
      if (d < minGap - 1e-9 && n * minGap < Math.PI * 2) {
        const push = (minGap - d) / 2
        out[k] -= push
        out[j] += push
        moved = true
      }
    }
    if (!moved) break
  }
  const res = new Array(n)
  idx.forEach((x, k) => (res[x.i] = out[k]))
  return res
}

/** Extracts a feature's sequence (5'→3' on its own strand). */
export function featureSeq(f: Feature, seq: string): string {
  const L = seq.length
  const part = ([a, b]: [number, number]) => (b >= a ? seq.slice(a - 1, b) : seq.slice(a - 1) + seq.slice(0, b))
  const s = f.segs.map((x) => part([Math.max(1, Math.min(L, x[0])), Math.max(1, Math.min(L, x[1]))])).join('')
  return f.strand === -1 ? reverseComplement(s) : s
}

// ---------- demo plasmid ----------

function rng(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MCS_SITES = ['GAATTC', 'GAGCTC', 'GGTACC', 'CCCGGG', 'GGATCC', 'TCTAGA', 'GTCGAC', 'CTGCAG', 'GCATGC', 'AAGCTT', 'CATATG', 'CTCGAG', 'GCGGCCGC', 'ACTAGT', 'CCATGG']

/** Synthetic GFP expression vector with realistic feature layout; a teaching demo, not a real sequence. */
export function sampleGenBank(): string {
  const r = rng(424242)
  const rnd = (n: number, gc = 0.5) => Array.from({ length: n }, () => (r() < gc ? 'GC' : 'AT')[r() < 0.5 ? 0 : 1]).join('')
  const scrub = (s: string) => {
    let out = s
    for (let pass = 0; pass < 6; pass++)
      for (const site of MCS_SITES) {
        let k = out.indexOf(site)
        while (k >= 0) {
          out = out.slice(0, k + 2) + (out[k + 2] === 'A' ? 'T' : 'A') + out.slice(k + 3)
          k = out.indexOf(site)
        }
      }
    return out
  }
  const codons = ['GCT', 'GAA', 'AAA', 'CTG', 'GGC', 'ACC', 'GTT', 'AGC', 'CAG', 'GAT', 'CGT', 'TTC', 'ATC', 'TAC', 'CCG', 'AAC', 'TGG', 'CAC', 'GCA', 'GTG']
  const orf = (aa: number) => 'ATG' + Array.from({ length: aa - 1 }, () => codons[Math.floor(r() * codons.length)]).join('') + 'TAA'
  const parts: { type: string; label: string; seq: string; strand: 1 | -1; note?: string }[] = []
  const add = (type: string, label: string, seq: string, strand: 1 | -1 = 1, note?: string) => parts.push({ type, label, seq, strand, note })
  const spacer = (n: number) => add('', '', scrub(rnd(n)))
  spacer(60)
  add('promoter', 'lac promoter', scrub(rnd(31, 0.4)), 1, 'E. coli lac promoter (demo)')
  spacer(8)
  add('protein_bind', 'lac operator', 'TTGTGAGCGGATAACAA')
  spacer(12)
  add('misc_feature', 'MCS', 'GAATTCGAGCTCGGTACCCGGGGATCCTCTAGAGTCGACCTGCAGGCATGCAAGCTT', 1, 'multiple cloning site')
  spacer(20)
  add('RBS', 'RBS', 'AAGGAGG')
  spacer(7)
  add('CDS', 'EGFP', scrub(orf(239)), 1, 'green fluorescent protein (synthetic demo ORF)')
  spacer(30)
  add('terminator', 'rrnB T1 terminator', scrub(rnd(87, 0.55)))
  spacer(140)
  add('rep_origin', 'f1 ori', scrub(rnd(456)), -1)
  spacer(110)
  add('promoter', 'AmpR promoter', scrub(rnd(105, 0.4)))
  spacer(4)
  add('CDS', 'AmpR', reverseComplement(scrub(orf(286))), -1, 'beta-lactamase, ampicillin resistance')
  spacer(170)
  add('rep_origin', 'ori', scrub(rnd(589, 0.55)), 1, 'high-copy pUC-type origin')
  spacer(90)
  let seq = ''
  const feats: string[] = []
  for (const p of parts) {
    const a = seq.length + 1
    seq += p.seq
    if (!p.type) continue
    const loc = p.strand === -1 ? `complement(${a}..${seq.length})` : `${a}..${seq.length}`
    feats.push(`     ${p.type.padEnd(16)}${loc}`, `                     /label="${p.label}"`)
    if (p.note) feats.push(`                     /note="${p.note}"`)
  }
  const origin: string[] = []
  for (let i = 0; i < seq.length; i += 60) {
    const chunk = seq.slice(i, i + 60).toLowerCase().match(/.{1,10}/g)!.join(' ')
    origin.push(`${String(i + 1).padStart(9)} ${chunk}`)
  }
  return [
    `LOCUS       pDEMO-EGFP          ${seq.length} bp    DNA     circular SYN 01-JAN-2026`,
    'DEFINITION  Synthetic demo GFP expression vector (illustrative sequence).',
    'FEATURES             Location/Qualifiers',
    `     source          1..${seq.length}`,
    '                     /organism="synthetic DNA construct"',
    ...feats,
    'ORIGIN',
    ...origin,
    '//',
  ].join('\n')
}

/**
 * Places outside labels in two columns (left/right of the circle), keeping their natural height order
 * and at least `gap` px apart vertically. Returns label anchor points.
 */
export function columnLabels(angles: number[], cx: number, cy: number, r: number, gap = 13, top = 12, bottom = 2 * cy - 12): { x: number; y: number; right: boolean }[] {
  const out: { x: number; y: number; right: boolean }[] = angles.map(() => ({ x: 0, y: 0, right: true }))
  for (const right of [true, false]) {
    const idx = angles.map((a, i) => ({ i, a })).filter(({ a }) => (Math.cos(a) >= -1e-9) === right).map(({ i, a }) => ({ i, y: cy + r * Math.sin(a) })).sort((p, q) => p.y - q.y)
    for (let k = 0; k < idx.length; k++) idx[k].y = Math.max(idx[k].y, k ? idx[k - 1].y + gap : top)
    const over = idx.length ? idx[idx.length - 1].y - bottom : 0
    if (over > 0) for (let k = idx.length - 1; k >= 0; k--) idx[k].y = Math.min(idx[k].y - (k === idx.length - 1 ? over : 0), k < idx.length - 1 ? idx[k + 1].y - gap : Infinity)
    for (const { i, y } of idx) {
      const dy = y - cy
      const dx = Math.sqrt(Math.max(0, r * r - dy * dy))
      out[i] = { x: cx + (right ? 1 : -1) * Math.max(dx, 14), y, right }
    }
  }
  return out
}
