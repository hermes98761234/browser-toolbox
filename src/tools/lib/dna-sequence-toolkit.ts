// DNA sequence utilities: FASTA, reverse complement (IUPAC), translation with NCBI genetic codes,
// composition, Tm, ORF finder and restriction-site search/digest.

export interface SeqRecord { id: string; desc: string; seq: string }

/** Parses FASTA (one or more records). Plain sequences without a header become one record. */
export function parseFasta(text: string): SeqRecord[] {
  const out: SeqRecord[] = []
  let cur: SeqRecord | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith(';')) continue
    if (line.startsWith('>')) {
      const [id, ...rest] = line.slice(1).trim().split(/\s+/)
      cur = { id: id || `seq${out.length + 1}`, desc: rest.join(' '), seq: '' }
      out.push(cur)
    } else {
      if (!cur) { cur = { id: 'sequence', desc: '', seq: '' }; out.push(cur) }
      cur.seq += line.replace(/[\s\d/]/g, '').toUpperCase().replace(/U/g, 'T')
    }
  }
  return out
}

export const IUPAC = 'ACGTRYSWKMBDHVN'
export function invalidChars(seq: string): string[] {
  return [...new Set(seq.replace(new RegExp(`[${IUPAC}-]`, 'g'), '').split(''))].filter(Boolean)
}

const COMP: { [k: string]: string } = { A: 'T', T: 'A', G: 'C', C: 'G', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K', B: 'V', V: 'B', D: 'H', H: 'D', N: 'N', '-': '-' }
export const complement = (s: string) => s.replace(/./g, (c) => COMP[c] ?? 'N')
export const reverseComplement = (s: string) => complement(s).split('').reverse().join('')

/** NCBI genetic codes, amino acids in TCAG codon order. */
export const CODES: { [id: number]: { name: string; aa: string; starts: string[] } } = {
  1: { name: '1 · Standard', aa: 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', starts: ['ATG', 'TTG', 'CTG'] },
  2: { name: '2 · Vertebrate mitochondrial', aa: 'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSS**VVVVAAAADDEEGGGG', starts: ['ATG', 'ATA', 'ATT', 'ATC', 'GTG'] },
  3: { name: '3 · Yeast mitochondrial', aa: 'FFLLSSSSYY**CCWWTTTTPPPPHHQQRRRRIIMMTTTTNNKKSSRRVVVVAAAADDEEGGGG', starts: ['ATG', 'ATA', 'GTG'] },
  4: { name: '4 · Mold/protozoan mito., Mycoplasma', aa: 'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', starts: ['ATG', 'TTA', 'TTG', 'CTG', 'ATT', 'ATC', 'ATA', 'GTG'] },
  5: { name: '5 · Invertebrate mitochondrial', aa: 'FFLLSSSSYY**CCWWLLLLPPPPHHQQRRRRIIMMTTTTNNKKSSSSVVVVAAAADDEEGGGG', starts: ['ATG', 'TTG', 'ATT', 'ATC', 'ATA', 'GTG'] },
  6: { name: '6 · Ciliate nuclear', aa: 'FFLLSSSSYYQQCC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', starts: ['ATG'] },
  11: { name: '11 · Bacterial, archaeal, plastid', aa: 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG', starts: ['ATG', 'GTG', 'TTG', 'CTG', 'ATT', 'ATC', 'ATA'] },
}
const IDX: { [k: string]: number } = { T: 0, C: 1, A: 2, G: 3 }

export function codonAA(codon: string, table = 1): string {
  const a = IDX[codon[0]], b = IDX[codon[1]], c = IDX[codon[2]]
  if (a === undefined || b === undefined || c === undefined) return 'X'
  return (CODES[table] ?? CODES[1]).aa[a * 16 + b * 4 + c]
}

/** Translate from `frame` (0–2) of the given strand string. */
export function translate(seq: string, frame = 0, table = 1): string {
  let out = ''
  for (let i = frame; i + 3 <= seq.length; i += 3) out += codonAA(seq.slice(i, i + 3), table)
  return out
}

export function composition(seq: string) {
  const n = { A: 0, C: 0, G: 0, T: 0, other: 0 }
  for (const c of seq) {
    if (c === 'A' || c === 'C' || c === 'G' || c === 'T') n[c]++
    else if (c !== '-') n.other++
  }
  const acgt = n.A + n.C + n.G + n.T
  return { ...n, len: seq.replace(/-/g, '').length, gc: acgt ? (n.G + n.C) / acgt : 0, at: acgt ? (n.A + n.T) / acgt : 0 }
}

/** Melting temperature (°C): Wallace rule below 14 nt, otherwise the basic GC formula (Marmur–Doty style). */
export function meltingTemp(seq: string): number {
  const c = composition(seq)
  const N = c.A + c.C + c.G + c.T
  if (!N) return NaN
  if (N < 14) return 2 * (c.A + c.T) + 4 * (c.G + c.C)
  return 64.9 + (41 * (c.G + c.C - 16.4)) / N
}

/** Molecular weight (g/mol) of single-stranded DNA and of the double strand. */
export function molecularWeight(seq: string) {
  const c = composition(seq)
  const ss = c.A * 313.21 + c.T * 304.2 + c.C * 289.18 + c.G * 329.21 - 61.96
  const rc = composition(reverseComplement(seq))
  const ss2 = rc.A * 313.21 + rc.T * 304.2 + rc.C * 289.18 + rc.G * 329.21 - 61.96
  return { ss: Math.max(0, ss), ds: Math.max(0, ss + ss2) }
}

/** GC fraction in sliding windows: [centre position (1-based), gc]. */
export function gcWindows(seq: string, win = 50, step = 10): [number, number][] {
  const out: [number, number][] = []
  if (seq.length < win) return seq.length ? [[Math.ceil(seq.length / 2), composition(seq).gc]] : []
  for (let i = 0; i + win <= seq.length; i += step) out.push([i + win / 2, composition(seq.slice(i, i + win)).gc])
  return out
}

export interface Orf {
  strand: 1 | -1
  frame: number
  /** 1-based inclusive coordinates on the top strand */
  start: number
  end: number
  aa: number
  protein: string
}

/** Open reading frames from a start codon to the next in-frame stop, on both strands. */
export function findOrfs(seq: string, minAa = 50, table = 1, altStarts = false): Orf[] {
  const code = CODES[table] ?? CODES[1]
  const starts = altStarts ? code.starts : ['ATG']
  const L = seq.length
  const out: Orf[] = []
  for (const strand of [1, -1] as const) {
    const s = strand === 1 ? seq : reverseComplement(seq)
    for (let frame = 0; frame < 3; frame++) {
      let open = -1
      for (let i = frame; i + 3 <= L; i += 3) {
        const cod = s.slice(i, i + 3)
        const aa = codonAA(cod, table)
        if (open < 0 && starts.includes(cod)) open = i
        if (aa === '*' && open >= 0) {
          const len = (i - open) / 3
          if (len >= minAa) {
            const protein = 'M' + translate(s.slice(open + 3, i), 0, table)
            const a = open + 1, b = i + 3
            out.push(strand === 1 ? { strand, frame: frame + 1, start: a, end: b, aa: len, protein } : { strand, frame: frame + 1, start: L - b + 1, end: L - a + 1, aa: len, protein })
          }
          open = -1
        }
      }
    }
  }
  return out.sort((x, y) => y.aa - x.aa)
}

/** [name, recognition site (5'→3'), cut offset on top strand from site start, cut offset on bottom strand] */
export const ENZYMES: [string, string, number, number][] = [
  ['AatII', 'GACGTC', 5, 1], ['AgeI', 'ACCGGT', 1, 5], ['AluI', 'AGCT', 2, 2], ['ApaI', 'GGGCCC', 5, 1], ['AvaI', 'CYCGRG', 1, 5],
  ['BamHI', 'GGATCC', 1, 5], ['BglII', 'AGATCT', 1, 5], ['BsaI', 'GGTCTC', 7, 11], ['BsmBI', 'CGTCTC', 7, 11], ['ClaI', 'ATCGAT', 2, 4],
  ['DraI', 'TTTAAA', 3, 3], ['EcoRI', 'GAATTC', 1, 5], ['EcoRV', 'GATATC', 3, 3], ['HaeIII', 'GGCC', 2, 2], ['HindIII', 'AAGCTT', 1, 5],
  ['HpaI', 'GTTAAC', 3, 3], ['KpnI', 'GGTACC', 5, 1], ['MluI', 'ACGCGT', 1, 5], ['MspI', 'CCGG', 1, 3], ['NcoI', 'CCATGG', 1, 5],
  ['NdeI', 'CATATG', 2, 4], ['NheI', 'GCTAGC', 1, 5], ['NotI', 'GCGGCCGC', 2, 6], ['PstI', 'CTGCAG', 5, 1], ['PvuII', 'CAGCTG', 3, 3],
  ['SacI', 'GAGCTC', 5, 1], ['SalI', 'GTCGAC', 1, 5], ['Sau3AI', 'GATC', 0, 4], ['ScaI', 'AGTACT', 3, 3], ['SmaI', 'CCCGGG', 3, 3],
  ['SpeI', 'ACTAGT', 1, 5], ['SphI', 'GCATGC', 5, 1], ['StuI', 'AGGCCT', 3, 3], ['XbaI', 'TCTAGA', 1, 5], ['XhoI', 'CTCGAG', 1, 5],
  ['XmaI', 'CCCGGG', 1, 5],
]

const IUPAC_RE: { [k: string]: string } = { A: 'A', C: 'C', G: 'G', T: 'T', R: '[AG]', Y: '[CT]', S: '[GC]', W: '[AT]', K: '[GT]', M: '[AC]', B: '[CGT]', D: '[AGT]', H: '[ACT]', V: '[ACG]', N: '[ACGT]' }
export const siteRegex = (site: string) => new RegExp(site.split('').map((c) => IUPAC_RE[c] ?? c).join(''), 'g')

export interface Hit { enzyme: string; site: string; pos: number; strand: 1 | -1; cut: number }

/** All recognition sites (1-based start on the top strand) and top-strand cut positions (cut after base `cut`). */
export function findSites(seq: string, enzymes = ENZYMES, circular = false): Hit[] {
  const hits: Hit[] = []
  const L = seq.length
  const s = circular ? seq + seq.slice(0, 12) : seq
  for (const [name, site, cTop, cBot] of enzymes) {
    const pal = reverseComplement(site) === site
    const scan = (re: RegExp, strand: 1 | -1) => {
      re.lastIndex = 0
      for (let m = re.exec(s); m; m = re.exec(s)) {
        re.lastIndex = m.index + 1
        if (m.index >= L) break
        const cut = strand === 1 ? m.index + cTop : m.index + site.length - cBot
        hits.push({ enzyme: name, site, pos: m.index + 1, strand, cut: ((cut % L) + L) % L })
      }
    }
    scan(siteRegex(site), 1)
    if (!pal) scan(siteRegex(reverseComplement(site)), -1)
  }
  return hits.sort((a, b) => a.pos - b.pos)
}

/** Fragment lengths after cutting at the given positions. */
export function digest(len: number, cuts: number[], circular = false): number[] {
  const c = [...new Set(cuts.filter((x) => x > 0 && x < len))].sort((a, b) => a - b)
  if (!c.length) return [len]
  if (circular) return c.map((x, i) => (i + 1 < c.length ? c[i + 1] - x : len - x + c[0])).sort((a, b) => b - a)
  return [...c, len].map((x, i) => x - (i ? c[i - 1] : 0)).sort((a, b) => b - a)
}

/** Format a sequence as numbered lines of `per` bases in blocks of 10. */
export function formatSeq(seq: string, per = 60): string {
  const lines: string[] = []
  const w = String(seq.length).length
  for (let i = 0; i < seq.length; i += per) {
    const chunk = seq.slice(i, i + per).match(/.{1,10}/g)?.join(' ') ?? ''
    lines.push(`${String(i + 1).padStart(w)}  ${chunk}`)
  }
  return lines.join('\n')
}

export const wrap = (s: string, n = 60) => s.match(new RegExp(`.{1,${n}}`, 'g'))?.join('\n') ?? ''

/** Deterministic demo construct: random flanks, a 120-aa ORF and several cloning sites. */
export function sampleSequence(): string {
  let a = 20240611
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const rnd = (n: number) => Array.from({ length: n }, () => 'ACGT'[Math.floor(r() * 4)]).join('')
  const codons = ['GCT', 'GAA', 'AAA', 'CTG', 'GGC', 'ACC', 'GTT', 'AGC', 'CAG', 'GAT', 'CGT', 'TTC', 'ATC', 'TAC', 'CCG', 'AAC', 'TGG', 'CAC', 'ATG', 'TGC']
  const orf = 'ATG' + Array.from({ length: 119 }, () => codons[Math.floor(r() * codons.length)]).join('') + 'TAA'
  const clean = (s: string) => s.replace(/TAA|TAG|TGA/g, 'TCA')
  return clean(rnd(90)) + 'GAATTC' + rnd(40) + 'GCCACC' + orf + 'GGATCC' + rnd(60) + 'AAGCTT' + clean(rnd(150)) + 'CTCGAG' + rnd(80) + 'GCGGCCGC' + rnd(60)
}
