// Target-grade helpers on top of the readability-scorer formulas: per-sentence grades, the sentence
// length / word length needed to hit a grade, hard-word detection with plainer alternatives.
import { analyze, isComplex, sentences, syllables, type Report, type Sentence } from './readability-scorer'

export { analyze, sentences, syllables }
export type { Report, Sentence }

/** Mean of the five grade-level formulas (FK, Fog, SMOG, Coleman–Liau, ARI). */
export function consensus(r: Report): number {
  const xs = [r.fk, r.fog, r.smog, r.cli, r.ari].filter(Number.isFinite)
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN
}

/** Flesch–Kincaid grade of a single sentence. */
export function sentenceGrade(s: Sentence): number {
  const n = s.words.length
  if (!n) return 0
  const syl = s.words.reduce((a, w) => a + syllables(w), 0)
  return 0.39 * n + 11.8 * (syl / n) - 15.59
}

/** Average words per sentence that gives FK grade `g` at a fixed syllables-per-word. */
export const targetWps = (g: number, spw: number) => (g + 15.59 - 11.8 * spw) / 0.39
/** Syllables per word that gives FK grade `g` at a fixed words-per-sentence. */
export const targetSpw = (g: number, wps: number) => (g + 15.59 - 0.39 * wps) / 11.8

export const gradeLabel = (g: number) =>
  !Number.isFinite(g) ? '—' : g < 1 ? 'Kindergarten' : g < 12.5 ? `Grade ${Math.round(g)}` : g < 16.5 ? 'College' : 'Graduate'

/** Plainer alternatives (own list, US spelling). */
export const SIMPLER: Record<string, string[]> = Object.fromEntries(
  `accomplish:do,finish|accordingly:so|accumulate:gather,build up|additional:more,extra|additionally:also|adequate:enough|adjacent:next to|advantageous:helpful|aggregate:total|alleviate:ease|allocate:give,share|alternatively:or|ameliorate:improve|anticipate:expect|apparent:clear|appropriate:right,fitting|approximately:about|ascertain:find out|assistance:help|attempt:try|beneficial:helpful|capability:ability|cognizant:aware|commence:start,begin|communicate:tell,talk|component:part|comprehend:understand|comprehensive:full,complete|concerning:about|consequently:so|consider:think about|considerable:large,big|constitute:make up|consolidate:combine|currently:now|deficiency:lack|demonstrate:show|designate:name|determine:decide,find|difficulty:trouble|diminish:shrink,drop|disseminate:spread|elevated:high|eliminate:remove,cut|employ:use|encounter:meet|endeavor:try|enhance:improve|equivalent:equal|essential:needed,key|establish:set up|evaluate:check,judge|evident:clear|exclusively:only|expedite:speed up|facilitate:help,ease|frequently:often|fundamental:basic|furthermore:also|generate:make|identical:same|identify:find,spot|immediately:now,at once|implement:carry out,do|indicate:show|individual:person|initial:first|initiate:start|innovative:new|insufficient:too little|magnitude:size|maintain:keep|majority:most|methodology:method|minimize:cut|modification:change|monitor:watch,check|necessitate:need|nevertheless:still|notwithstanding:despite|numerous:many|objective:goal,aim|obtain:get|operate:run,work|opportunity:chance|optimal:best|participate:take part|particularly:especially|perceive:see|perform:do|permit:let|possess:have,own|preliminary:early,first|previously:before|prioritize:rank|procedure:steps|proficiency:skill|prohibit:ban|purchase:buy|regarding:about|relocate:move|remainder:rest|represent:stand for|request:ask|require:need|requirement:need|residence:home|retain:keep|significant:big,major|similar:alike|subsequently:later,then|substantial:large|sufficient:enough|terminate:end|therefore:so|transmit:send|ultimately:in the end|underestimate:lowball|utilization:use|utilize:use|variation:change|velocity:speed|visualize:picture|whereas:while|demonstrated:showed|approximate:rough|consequence:result|conclusion:end|continuously:all the time|disadvantage:drawback|elementary:basic|environment:surroundings|especially:mostly|exceedingly:very|experience:feel|explanation:reason|incorporate:include|information:facts,info|investigate:look into|necessary:needed|organization:group|participation:taking part|photosynthesis:making food from light|precipitation:rain or snow|temperature:heat,warmth|transformation:change|understanding:grasp|unfortunately:sadly|universally:everywhere|everybody:everyone`
    .split('|')
    .map((e) => {
      const [k, v] = e.split(':')
      return [k, v.split(',')]
    }),
)

export interface HardWord { word: string; count: number; syl: number; letters: number; suggest: string[] }

/** Words with 3+ syllables (Gunning's rule) or 13+ letters, plus anything with a plainer alternative. */
export function hardWords(text: string): HardWord[] {
  const m = new Map<string, HardWord>()
  for (const s of sentences(text))
    s.words.forEach((w, i) => {
      const lw = w.toLowerCase()
      const suggest = SIMPLER[lw] ?? []
      if (!(suggest.length || isComplex(w, i === 0) || lw.length >= 13)) return
      const h = m.get(lw)
      if (h) h.count++
      else m.set(lw, { word: lw, count: 1, syl: syllables(w), letters: lw.length, suggest })
    })
  return [...m.values()].sort((a, b) => b.count * b.syl - a.count * a.syl || a.word.localeCompare(b.word))
}

/** Replaces whole-word occurrences, keeping a leading capital. */
export function replaceWord(text: string, word: string, repl: string): string {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`\\b${esc}\\b`, 'gi'), (m) => (/^[A-Z]/.test(m) ? repl[0].toUpperCase() + repl.slice(1) : repl))
}

/** 0 (at or below target) … 1 (4+ grades above). */
export const heat = (grade: number, target: number) => Math.min(1, Math.max(0, (grade - target) / 4))
