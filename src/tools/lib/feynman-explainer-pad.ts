// Text analysis for the Feynman pad: syllables, readability formulas, jargon / acronym / long-word flags.

const JARGON_RAW = `leverage synergy synergies paradigm utilize utilise facilitate optimize optimise holistic robust scalable bandwidth stakeholder deliverable actionable
ecosystem framework methodology infrastructure algorithm heuristic abstraction instantiate asynchronous latency throughput orthogonal idempotent polymorphism
encapsulation derivative integral coefficient stochastic variance regression hypothesis empirical quantitative qualitative mitochondria photosynthesis enzyme
catalyst equilibrium entropy thermodynamics quantum kinetic osmosis homeostasis metabolism neuron synapse cognitive epistemology ontology dialectic hegemony
liquidity amortization collateral arbitrage fiduciary macroeconomic microeconomic monetary fiscal elasticity externality heterogeneous homogeneous antigen antibody
antibodies pathogen immunity immunological lymphocyte cytokine protein proteins molecule molecular genome genomic phenotype genotype allele vector vectors eigenvalue
eigenvector topology manifold isomorphism morphism tensor gradient convolution backpropagation hyperparameter inference probabilistic bayesian frequentist
covariance correlation causality heteroscedasticity multivariate nonlinear exponential logarithmic asymptotic recursion recursive concurrency parallelism
serialization deserialization middleware microservice microservices containerization orchestration virtualization kernel compiler interpreter runtime
paradigmatic operationalize incentivize monetize disintermediation omnichannel bleeding-edge best-of-breed mission-critical value-add core-competency
circle-back deep-dive low-hanging granular granularity bandwidths onboarding offboarding learnings ideation alignment cadence vertical verticals
axiomatic canonical deterministic nondeterministic emergent emergence substrate modality modalities affordance affordances pedagogy pedagogical
heuristics schema schemas ontological teleological phenomenological juxtaposition dichotomy nuance nuanced aforementioned henceforth notwithstanding
whereby wherein thereof heretofore inasmuch insofar vis-a-vis`
export const JARGON = new Set(JARGON_RAW.split(/\s+/).filter(Boolean))

/** Heuristic English syllable count (good to ±1 on most words). */
export function syllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!w) return 0
  if (w.length <= 3) return 1
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  const groups = w.match(/[aeiouy]{1,2}/g)
  const n = groups ? groups.length : 1
  return Math.max(1, n)
}

export const sentencesOf = (text: string) => text.split(/(?<=[.!?…])\s+|\n{2,}/).map((s) => s.trim()).filter((s) => /\p{L}/u.test(s))
export const wordsOf = (text: string) => text.match(/\p{L}[\p{L}\p{N}'’-]*/gu) ?? []

export interface Stats {
  words: number
  sentences: number
  syllables: number
  wps: number
  spw: number
  fre: number // Flesch Reading Ease
  fk: number // Flesch–Kincaid grade
  complex: number // words with ≥3 syllables
  fog: number // Gunning fog index
  longSentences: string[]
}

export function analyze(text: string, longLimit = 25): Stats {
  const sents = sentencesOf(text)
  const words = wordsOf(text)
  const syl = words.map(syllables)
  const W = words.length, S = Math.max(1, sents.length), Y = syl.reduce((a, b) => a + b, 0)
  const complex = syl.filter((n) => n >= 3).length
  const wps = W / S, spw = W ? Y / W : 0
  return {
    words: W, sentences: sents.length, syllables: Y, wps, spw, complex,
    fre: W ? 206.835 - 1.015 * wps - 84.6 * spw : 0,
    fk: W ? 0.39 * wps + 11.8 * spw - 15.59 : 0,
    fog: W ? 0.4 * (wps + (100 * complex) / W) : 0,
    longSentences: sents.filter((s) => wordsOf(s).length > longLimit),
  }
}

export function freLabel(fre: number): string {
  if (fre >= 90) return 'Very easy (age 11)'
  if (fre >= 80) return 'Easy'
  if (fre >= 70) return 'Fairly easy (age 12–13)'
  if (fre >= 60) return 'Plain English'
  if (fre >= 50) return 'Fairly difficult'
  if (fre >= 30) return 'Difficult (college)'
  return 'Very difficult (graduate)'
}

export type Flag = 'jargon' | 'acronym' | 'long' | null
export interface Opts { custom: string[]; acronyms: boolean; long: boolean; longSyl: number }

export function flagOf(word: string, o: Opts, custom: Set<string>): Flag {
  const lw = word.toLowerCase().replace(/[’']s$/, '')
  const stems = [lw, lw.replace(/s$/, ''), lw.replace(/es$/, ''), lw.replace(/ed$/, ''), lw.replace(/d$/, ''), lw.replace(/ing$/, ''), lw.replace(/ing$/, 'e')]
  if (stems.some((w) => w.length > 1 && (JARGON.has(w) || custom.has(w)))) return 'jargon'
  if (o.acronyms && /^[A-Z][A-Z0-9]{1,5}s?$/.test(word) && !['I', 'OK', 'A'].includes(word)) return 'acronym'
  if (o.long && syllables(word) >= o.longSyl) return 'long'
  return null
}

/** Splits text into [segment, flag] runs, preserving all characters. */
export function tokenize(text: string, o: Opts): [string, Flag][] {
  const custom = new Set(o.custom.map((c) => c.trim().toLowerCase()).filter(Boolean))
  const out: [string, Flag][] = []
  let last = 0
  for (const m of text.matchAll(/\p{L}[\p{L}\p{N}'’-]*/gu)) {
    const i = m.index ?? 0
    if (i > last) out.push([text.slice(last, i), null])
    out.push([m[0], flagOf(m[0], o, custom)])
    last = i + m[0].length
  }
  if (last < text.length) out.push([text.slice(last), null])
  return out
}

/** Flagged terms with counts, most frequent first. */
export function flagged(text: string, o: Opts): { term: string; flag: Exclude<Flag, null>; count: number }[] {
  const m = new Map<string, { term: string; flag: Exclude<Flag, null>; count: number }>()
  for (const [t, f] of tokenize(text, o)) {
    if (!f) continue
    const k = f === 'acronym' ? t : t.toLowerCase()
    const e = m.get(k)
    if (e) e.count++
    else m.set(k, { term: k, flag: f, count: 1 })
  }
  const rank = { jargon: 0, acronym: 1, long: 2 }
  return [...m.values()].sort((a, b) => rank[a.flag] - rank[b.flag] || b.count - a.count || a.term.localeCompare(b.term))
}
