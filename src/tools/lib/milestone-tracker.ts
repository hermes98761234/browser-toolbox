// Baby milestone tracker: an original checklist of common milestones with broad typical age windows
// (months). Typical ranges vary widely between healthy children; this is a keepsake, not a screening tool.

export type Cat = 'Moving' | 'Hands' | 'Talking' | 'Social' | 'Firsts'
export interface Preset { id: string; cat: Cat; title: string; from: number; to: number }

const P = (cat: Cat, rows: [string, string, number, number][]): Preset[] => rows.map(([id, title, from, to]) => ({ id, cat, title, from, to }))

export const PRESETS: Preset[] = [
  ...P('Moving', [
    ['head', 'Holds head up during tummy time', 1, 3], ['roll', 'Rolls from tummy to back', 3, 6], ['sit', 'Sits without support', 5, 9],
    ['crawl', 'Crawls or scoots', 6, 11], ['pull', 'Pulls up to standing', 7, 12], ['cruise', 'Cruises along furniture', 8, 13],
    ['steps', 'First independent steps', 9, 16], ['walk', 'Walks steadily', 11, 18], ['stairs', 'Climbs stairs with help', 14, 24],
    ['kick', 'Kicks a ball', 18, 26], ['jump', 'Jumps with both feet', 22, 32],
  ]),
  ...P('Hands', [
    ['hands', 'Brings hands together', 2, 4], ['grasp', 'Grabs a toy', 3, 5], ['pass', 'Passes a toy from hand to hand', 5, 8],
    ['pincer', 'Picks up small bits with thumb and finger', 8, 12], ['scribble', 'Scribbles with a crayon', 12, 20], ['stack', 'Stacks four blocks', 17, 26],
  ]),
  ...P('Talking', [
    ['coo', 'Coos and gurgles', 1, 4], ['laugh', 'Laughs out loud', 3, 5], ['babble', 'Babbles “ba-ba”, “da-da”', 5, 9],
    ['name', 'Turns to own name', 5, 10], ['wave', 'Waves bye-bye', 8, 13], ['word', 'First word with meaning', 9, 15],
    ['point', 'Points to show something', 10, 16], ['words10', 'Uses about ten words', 14, 22], ['phrase', 'Two-word phrases', 18, 28],
  ]),
  ...P('Social', [
    ['smile', 'First social smile', 1, 3], ['faces', 'Recognises familiar faces', 2, 5], ['peek', 'Plays peekaboo', 6, 11],
    ['stranger', 'Shy with strangers', 6, 12], ['imitate', 'Copies what you do', 10, 18], ['pretend', 'Pretend play (feeds a teddy)', 16, 28],
  ]),
  ...P('Firsts', [
    ['solids', 'First solid food', 4, 7], ['tooth', 'First tooth', 4, 14], ['night', 'Sleeps a 6-hour stretch', 3, 12],
    ['cup', 'Drinks from an open cup', 6, 18], ['haircut', 'First haircut', 6, 24], ['spoon', 'Feeds self with a spoon', 12, 20],
  ]),
]
export const CATS: Cat[] = ['Moving', 'Hands', 'Talking', 'Social', 'Firsts']
export const CAT_ICON: Record<Cat, string> = { Moving: '🚼', Hands: '✋', Talking: '💬', Social: '😊', Firsts: '⭐' }

const DAY = 86400000
const parse = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
export const days = (a: string, b: string) => Math.round((parse(b) - parse(a)) / DAY)
export const addDays = (s: string, n: number) => new Date(parse(s) + n * DAY).toISOString().slice(0, 10)

/** Calendar-month age between birth and date: whole months plus remaining days. */
export function age(birth: string, date: string): { months: number; days: number; exact: number; label: string } {
  const [by, bm, bd] = birth.split('-').map(Number)
  const [y, m, d] = date.split('-').map(Number)
  let months = (y - by) * 12 + (m - bm)
  if (d < bd) months--
  const anchor = new Date(Date.UTC(by, bm - 1 + months, 1))
  const dim = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)).getUTCDate()
  const anchorDay = `${anchor.getUTCFullYear()}-${String(anchor.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(bd, dim)).padStart(2, '0')}`
  const rest = Math.max(0, days(anchorDay, date))
  const exact = days(birth, date) / 30.4375
  let label: string
  if (days(birth, date) < 0) label = 'before birth'
  else if (months < 1) label = `${days(birth, date)} days`
  else if (months < 24) label = `${months} mo${rest >= 7 ? ` ${Math.floor(rest / 7)} wk` : ''}`
  else label = `${Math.floor(months / 12)} y ${months % 12} mo`
  return { months, days: rest, exact, label }
}

export type Status = 'done' | 'upcoming' | 'window' | 'later'
/** Where the child is relative to a milestone's typical window (purely descriptive). */
export function status(from: number, to: number, ageMonths: number, done: boolean): Status {
  if (done) return 'done'
  if (ageMonths < from) return 'upcoming'
  if (ageMonths <= to) return 'window'
  return 'later'
}

/** Keep only characters the standard PDF fonts (WinAnsi) can draw. */
export function winAnsi(s: string): string {
  return s
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, '')
}

/** Greedy word wrap by a width function. */
export function wrap(text: string, max: number, width: (s: string) => number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${w}` : w
      if (width(t) <= max || !line) line = t
      else { out.push(line); line = w }
    }
    out.push(line)
  }
  return out
}
