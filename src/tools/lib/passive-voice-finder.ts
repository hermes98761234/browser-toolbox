export type Kind = 'passive' | 'adjectival' | 'adverb' | 'hedge'
export interface Hit { start: number; end: number; kind: Kind; text: string; agent?: string }

const BE = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', "isn't", "aren't", "wasn't", "weren't"])
const GET = new Set(['get', 'gets', 'got', 'gotten', 'getting'])
const BETWEEN = new Set(['not', 'never', 'also', 'just', 'already', 'still', 'often', 'always', 'usually', 'being', 'been', 'all', 'both', 'then', 'now', 'soon', 'later', 'sometimes', 'rarely', 'seldom', 'once', 'ever'])

// Irregular past participles (compact).
const IRREG = new Set(
  'arisen awoken borne born beaten become begun bent bet bound bitten bled blown broken bred brought built burnt burst bought cast caught chosen clung come cost crept cut dealt dug done drawn dreamt drunk driven eaten fallen fed felt fought found fled flung flown forbidden forgotten forgiven frozen given gone ground grown hung had heard hidden hit held hurt kept knelt known laid led leant leapt learnt left lent let lain lit lost made meant met paid put quit read ridden rung risen run said seen sought sold sent set sewn shaken shed shone shot shown shrunk shut sung sunk sat slain slept slid slung slit spoken sped spent spilt spun spat split spread sprung stood stolen stuck stung stunk struck strung sworn swept swollen swum swung taken taught torn told thought thrown thrust trodden understood undertaken undone upset woken worn woven wept won wound withdrawn withheld written overcome overtaken overseen overthrown mistaken misunderstood rebuilt rewritten'.split(' '),
)
// -ed words that usually act as adjectives after "be".
const ADJ_ED = new Set('interested tired excited bored worried married scared pleased surprised concerned supposed used based related involved prepared confused disappointed embarrassed exhausted amazed annoyed ashamed delighted determined frightened satisfied shocked terrified thrilled impressed relieved convinced allowed required aged beloved blessed crooked learned naked ragged rugged sacred wicked wretched'.split(' '))
const NOT_ED = new Set(['need', 'bed', 'red', 'shed', 'fled', 'sled', 'shred', 'bred', 'wed', 'feed', 'seed', 'weed', 'speed', 'greed', 'breed', 'deed', 'creed', 'hundred', 'sacred', 'naked', 'wicked', 'kindred', 'indeed', 'proceed', 'succeed', 'exceed'])

const NOT_LY = new Set('only family early daily weekly monthly yearly holy belly ally rally reply apply supply fly july italy lily jelly bully silly ugly lovely friendly likely unlikely lonely lively costly elderly curly hilly jolly oily orderly scholarly smelly sly wily woolly chilly assembly anomaly melancholy monopoly homily butterfly dragonfly firefly bubbly cuddly deadly ghastly ghostly kindly lowly manly motherly fatherly brotherly sisterly neighborly portly stately surly timely unruly worldly'.split(' '))
const WEAK = new Set('very really quite just actually basically totally literally extremely simply rather somewhat fairly definitely certainly probably absolutely completely highly incredibly truly seriously honestly practically virtually essentially generally slightly hopefully'.split(' '))
const HEDGES = ['sort of', 'kind of', 'a bit', 'a little', 'i think', 'i believe', 'i feel', 'it seems', 'in my opinion', 'more or less', 'to some extent']

interface Tok { w: string; lw: string; start: number; end: number }

export function tokenize(text: string): Tok[] {
  const out: Tok[] = []
  for (const m of text.matchAll(/[A-Za-z][A-Za-z'’-]*/g)) {
    const w = m[0].replace(/’/g, "'")
    out.push({ w: m[0], lw: w.toLowerCase(), start: m.index ?? 0, end: (m.index ?? 0) + m[0].length })
  }
  return out
}

export function isParticiple(lw: string): boolean {
  if (IRREG.has(lw)) return true
  return lw.length > 3 && lw.endsWith('ed') && !NOT_ED.has(lw)
}

const isAdverbLy = (lw: string) => lw.length > 4 && lw.endsWith('ly') && !NOT_LY.has(lw)

export function analyze(text: string): Hit[] {
  const toks = tokenize(text)
  const hits: Hit[] = []
  const sentenceBreak = (a: Tok, b: Tok) => /[.!?;:\n]/.test(text.slice(a.end, b.start))
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (BE.has(t.lw) || GET.has(t.lw)) {
      let j = i + 1
      let skipped = 0
      while (j < toks.length && skipped < 3 && !sentenceBreak(toks[j - 1], toks[j]) && (BETWEEN.has(toks[j].lw) || isAdverbLy(toks[j].lw) || (BE.has(toks[j].lw) && toks[j].lw.startsWith('be')))) {
        j++
        skipped++
      }
      const p = toks[j]
      if (p && !sentenceBreak(toks[j - 1], p) && isParticiple(p.lw)) {
        let end = p.end
        let agent: string | undefined
        const by = toks[j + 1]
        if (by && by.lw === 'by' && !sentenceBreak(p, by)) {
          // capture up to 3 following words as the agent ("by the committee")
          const ag: Tok[] = []
          for (let k = j + 2; k < toks.length && ag.length < 3 && !sentenceBreak(toks[k - 1], toks[k]); k++) {
            ag.push(toks[k])
            if (!['the', 'a', 'an', 'our', 'my', 'your', 'their', 'his', 'her', 'its', 'this', 'that', 'these', 'those'].includes(toks[k].lw)) break
          }
          if (ag.length) {
            agent = text.slice(ag[0].start, ag[ag.length - 1].end)
            end = ag[ag.length - 1].end
          }
        }
        const verbal = agent || GET.has(t.lw) || t.lw === 'been' || t.lw === 'being' || toks.slice(i + 1, j).some((x) => x.lw === 'been' || x.lw === 'being')
        const adjectival = !verbal && ADJ_ED.has(p.lw)
        hits.push({ start: t.start, end, kind: adjectival ? 'adjectival' : 'passive', text: text.slice(t.start, end), agent })
        i = j
        continue
      }
    }
    if (WEAK.has(t.lw) || isAdverbLy(t.lw)) hits.push({ start: t.start, end: t.end, kind: 'adverb', text: t.w })
  }
  const low = text.toLowerCase()
  for (const h of HEDGES) {
    let k = low.indexOf(h)
    while (k >= 0) {
      const before = k === 0 || !/[a-z]/.test(low[k - 1])
      const after = k + h.length >= low.length || !/[a-z]/.test(low[k + h.length])
      if (before && after && !hits.some((x) => k < x.end && k + h.length > x.start)) hits.push({ start: k, end: k + h.length, kind: 'hedge', text: text.slice(k, k + h.length) })
      k = low.indexOf(h, k + 1)
    }
  }
  return hits.sort((a, b) => a.start - b.start)
}

export const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n{2,}/).map((s) => s.trim()).filter((s) => /[a-z]/i.test(s))

export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length <= 3) return 1
  const s = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  return Math.max(1, (s.match(/[aeiouy]{1,2}/g) ?? []).length)
}

/** Flesch reading ease: 206.835 − 1.015·(words/sentences) − 84.6·(syllables/words). */
export function flesch(text: string): number {
  const words = tokenize(text)
  const n = sentences(text).length || 1
  if (!words.length) return 0
  const syl = words.reduce((a, t) => a + syllables(t.w), 0)
  return 206.835 - 1.015 * (words.length / n) - 84.6 * (syl / words.length)
}
