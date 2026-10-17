export interface Recipe {
  title: string
  ingredients: string[]
  steps: string[]
}

const ING = /^(ingredients?|you will need|shopping list)\b[:\s]*$/i
const STEP = /^(steps?|method|directions|instructions|preparation)\b[:\s]*$/i
const BULLET = /^\s*(?:[-*•·]|\d+[.)]|step\s+\d+[:.)]?)\s*/i

/** Parse a pasted recipe: a title line, an "Ingredients" section and a "Steps/Method" section.
 *  Without headings, bulleted/short lines become ingredients and numbered/long lines steps. */
export function parseRecipe(text: string): Recipe {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const r: Recipe = { title: '', ingredients: [], steps: [] }
  let mode: 'none' | 'ing' | 'step' = 'none'
  for (const raw of lines) {
    const head = raw.replace(/^#+\s*/, '')
    if (ING.test(head)) { mode = 'ing'; continue }
    if (STEP.test(head)) { mode = 'step'; continue }
    const clean = raw.replace(BULLET, '').trim()
    if (!clean) continue
    if (mode === 'ing') r.ingredients.push(clean)
    else if (mode === 'step') r.steps.push(clean)
    else if (!r.title && !BULLET.test(raw) && clean.length < 80) r.title = head
    else if (/^\s*\d+[.)]/.test(raw) || clean.length > 60) r.steps.push(clean)
    else r.ingredients.push(clean)
  }
  return r
}

const WORDNUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, sixty: 60 }

/** Find a duration mentioned in a step, in seconds (upper bound of ranges like "8-10 minutes"). */
export function findTimer(step: string): number | null {
  const m = step.toLowerCase().match(/(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|sixty)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/)
  if (!m) return null
  const n = Number(m[2] ?? (WORDNUM[m[1]] ?? m[1]))
  if (!Number.isFinite(n) || n <= 0) return null
  const u = m[3]
  return Math.round(n * (u.startsWith('h') ? 3600 : u.startsWith('m') ? 60 : 1))
}

export type Command = 'next' | 'back' | 'repeat' | 'ingredients' | 'timer' | 'stop' | 'first' | 'last'

/** Map a recognized phrase to a command (last matching keyword wins for phrases like "no, go back"). */
export function parseCommand(phrase: string): Command | null {
  const p = phrase.toLowerCase()
  const table: [RegExp, Command][] = [
    [/\b(next|continue|forward|done|okay next)\b/, 'next'],
    [/\b(back|previous|go back|last step)\b/, 'back'],
    [/\b(repeat|again|say that again|what)\b/, 'repeat'],
    [/\bingredients?\b/, 'ingredients'],
    [/\b(start (the )?timer|set (a )?timer|timer)\b/, 'timer'],
    [/\b(stop|pause|quiet|silence)\b/, 'stop'],
    [/\b(start over|restart|first step|beginning)\b/, 'first'],
  ]
  let best: Command | null = null
  let at = -1
  for (const [re, c] of table) {
    const m = p.match(re)
    if (m && m.index !== undefined && m.index >= at) { best = c; at = m.index }
  }
  return best
}

export const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
