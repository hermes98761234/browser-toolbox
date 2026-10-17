// zxcvbn-style password strength estimation: pattern matching + minimum-guesses search.
// Patterns: dictionary (with l33t, reversed, capitals), keyboard walks, repeats, sequences, years/dates, brute force.

const PASSWORDS = 'password 123456 123456789 12345678 12345 1234567 qwerty abc123 football monkey letmein 111111 1234 dragon baseball iloveyou trustno1 sunshine master welcome shadow ashley jesus michael ninja mustang password1 123123 superman 696969 batman access hello charlie donald 654321 qwertyuiop 000000 1q2w3e4r starwars 7777777 freedom whatever qazwsx princess admin login passw0rd zaq1zaq1 solo hottie flower loveme hunter 1qaz2wsx computer secret summer winter soccer hockey killer jordan pepper ginger cheese buster tigger robert thomas daniel andrew matthew jessica jennifer michelle nicole maggie pokemon asdfgh asdf zxcvbn 987654321 qwe123 112233 121212 aaaaaa 11111111 666666 987654 1111 2000 harley ranger hannah biteme matrix test test123 guest changeme default root toor pass 1password abcdef abcd1234 myspace samsung apple orange chelsea arsenal liverpool'.split(' ')
const WORDS = 'love life time home house dog cat blue red green black white sun moon star happy money king queen angel baby girl boy magic power music rock apple banana cookie coffee horse battery staple correct tiger lion eagle bear wolf family friend forever heart golden silver purple pink ocean river mountain sky fire water earth ice snow rain storm light dark pirate prince hero game gamer player guitar piano pizza chocolate sugar honey sweet smile dream hope faith peace liberty america london paris berlin kyiv monday friday january december spring autumn school college summer winter birthday hunter lucky cool super crazy little big good best world city garden flower forest beach island planet rocket space butterfly monster zombie wizard knight castle diamond crystal shadow phoenix thunder lightning troubador'.split(' ')
const NAMES = 'john james robert michael william david richard joseph charles thomas mary patricia linda barbara elizabeth jennifer maria susan anna olga ivan alex max sam emma olivia sophia mia ava noah liam lucas mason ethan oliver jack harry george oscar lily grace chloe sarah laura kate peter paul mark andrew steven kevin brian anthony nikita dmytro volodymyr natalia irina'.split(' ')

export const DICTS: Record<string, Map<string, number>> = {
  'common password': new Map(PASSWORDS.map((w, i) => [w, i + 1])),
  // the built-in lists are short samples of much larger frequency lists, so ranks are spread out
  'English word': new Map(WORDS.map((w, i) => [w, (i + 1) * 20])),
  'first name': new Map(NAMES.map((w, i) => [w, (i + 1) * 10])),
}
const LEET: Record<string, string> = { '4': 'a', '@': 'a', '3': 'e', '1': 'i', '!': 'i', '0': 'o', '$': 's', '5': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '|': 'l' }
const REF_YEAR = 2026

export interface Match {
  i: number
  j: number // inclusive
  token: string
  pattern: 'dictionary' | 'spatial' | 'repeat' | 'sequence' | 'year' | 'date' | 'bruteforce'
  guesses: number
  detail: string
}

const nCk = (n: number, k: number) => {
  if (k > n) return 0
  let r = 1
  for (let d = 1; d <= k; d++) r = (r * (n - k + d)) / d
  return r
}

function capsVariations(word: string): number {
  if (word === word.toLowerCase()) return 1
  if (/^[A-Z][^A-Z]+$/.test(word) || /^[^A-Z]+[A-Z]$/.test(word) || word === word.toUpperCase()) return 2
  const U = (word.match(/[A-Z]/g) ?? []).length, L = (word.match(/[a-z]/g) ?? []).length
  let v = 0
  for (let i = 1; i <= Math.min(U, L); i++) v += nCk(U + L, i)
  return Math.max(1, v)
}

function dictionaryMatches(pw: string): Match[] {
  const out: Match[] = []
  const lower = pw.toLowerCase()
  for (let i = 0; i < pw.length; i++) for (let j = i + 2; j < Math.min(pw.length, i + 24); j++) {
    const raw = lower.slice(i, j + 1)
    const tok = pw.slice(i, j + 1)
    const unleet = [...raw].map((c) => LEET[c] ?? c).join('')
    const leeted = unleet !== raw
    const rev = [...unleet].reverse().join('')
    for (const [name, d] of Object.entries(DICTS)) {
      for (const [cand, reversed] of [[unleet, false], [rev, true]] as const) {
        const rank = d.get(cand)
        if (!rank) continue
        const subs = [...raw].filter((c) => LEET[c]).length
        const leetVar = leeted ? Math.max(2, 2 ** Math.min(subs, 6) / 2 + 1) : 1
        const g = rank * capsVariations(tok) * leetVar * (reversed ? 2 : 1)
        out.push({ i, j, token: tok, pattern: 'dictionary', guesses: g, detail: `${name}${reversed ? ' (reversed)' : ''}${leeted ? ' with l33t' : ''} #${rank}` })
      }
    }
  }
  return out
}

// QWERTY adjacency (unshifted) with stagger.
const ROWS = ['`1234567890-=', 'qwertyuiop[]\\', "asdfghjkl;'", 'zxcvbnm,./']
const SHIFT: Record<string, string> = Object.fromEntries([...'~!@#$%^&*()_+{}|:"<>?'].map((c, i) => [c, '`1234567890-=[]\\;\',./'[i]]))
const ADJ = new Map<string, Set<string>>()
ROWS.forEach((row, r) => [...row].forEach((ch, c) => {
  const s = new Set<string>()
  const at = (rr: number, cc: number) => { const x = ROWS[rr]?.[cc]; if (x) s.add(x) }
  at(r, c - 1); at(r, c + 1); at(r - 1, c); at(r - 1, c + 1); at(r + 1, c - 1); at(r + 1, c)
  ADJ.set(ch, s)
}))
const unshift = (c: string) => SHIFT[c] ?? c.toLowerCase()

function spatialMatches(pw: string): Match[] {
  const out: Match[] = []
  let i = 0
  while (i < pw.length - 1) {
    let j = i, turns = 0, lastDir = ''
    while (j + 1 < pw.length && ADJ.get(unshift(pw[j]))?.has(unshift(pw[j + 1]))) {
      const dir = String(ROWS.findIndex((r) => r.includes(unshift(pw[j + 1]))) - ROWS.findIndex((r) => r.includes(unshift(pw[j]))))
      if (dir !== lastDir) { turns++; lastDir = dir }
      j++
    }
    if (j - i + 1 >= 3) {
      const L = j - i + 1, S = 94, d = 4.6
      let g = 0
      for (let a = 2; a <= L; a++) for (let t = 1; t <= Math.min(turns, a - 1); t++) g += nCk(a - 1, t - 1) * S * d ** t
      const shifted = [...pw.slice(i, j + 1)].filter((c) => /[A-Z~!@#$%^&*()_+{}|:"<>?]/.test(c)).length
      if (shifted) g *= shifted === L ? 2 : nCk(L, shifted) + 1
      out.push({ i, j, token: pw.slice(i, j + 1), pattern: 'spatial', guesses: g, detail: `keyboard walk, ${turns} turn${turns > 1 ? 's' : ''}` })
      i = j
    } else i++
  }
  return out
}

function sequenceMatches(pw: string): Match[] {
  const out: Match[] = []
  let i = 0
  while (i < pw.length - 1) {
    const delta = pw.charCodeAt(i + 1) - pw.charCodeAt(i)
    let j = i + 1
    if (Math.abs(delta) === 1 || Math.abs(delta) === 2) while (j + 1 < pw.length && pw.charCodeAt(j + 1) - pw.charCodeAt(j) === delta) j++
    if (j - i + 1 >= 3 && (Math.abs(delta) === 1 || Math.abs(delta) === 2)) {
      const tok = pw.slice(i, j + 1)
      const first = tok[0]
      const base = /[a01z9A]/.test(first) ? 4 : /\d/.test(first) ? 10 : /[a-z]/i.test(first) ? 26 : 26
      out.push({ i, j, token: tok, pattern: 'sequence', guesses: base * tok.length * (delta < 0 ? 2 : 1), detail: `${delta > 0 ? 'ascending' : 'descending'} sequence` })
      i = j
    } else i++
  }
  return out
}

function yearDateMatches(pw: string): Match[] {
  const out: Match[] = []
  for (const m of pw.matchAll(/(19\d\d|20\d\d)/g)) {
    const y = +m[0]
    out.push({ i: m.index!, j: m.index! + 3, token: m[0], pattern: 'year', guesses: Math.max(Math.abs(y - REF_YEAR), 20), detail: 'recent year' })
  }
  for (const m of pw.matchAll(/(\d{1,2})([-/._ ]?)(\d{1,2})\2(\d{2}|\d{4})/g)) {
    const [a, b] = [+m[1], +m[3]]
    if (!((a <= 31 && b <= 12) || (a <= 12 && b <= 31)) || a === 0 || b === 0) continue
    let y = +m[4]
    if (m[4].length === 2) y += y > 50 ? 1900 : 2000
    out.push({ i: m.index!, j: m.index! + m[0].length - 1, token: m[0], pattern: 'date', guesses: 365 * Math.max(Math.abs(y - REF_YEAR), 20) * (m[2] ? 4 : 1), detail: 'calendar date' })
  }
  return out
}

function repeatMatches(pw: string): Match[] {
  const out: Match[] = []
  const re = /(.+?)\1+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(pw))) {
    if (m[0].length < 3) { re.lastIndex = m.index + 1; continue }
    const base = m[1]
    const count = m[0].length / base.length
    const baseG = base.length === 1 ? 12 : estimate(base).guesses
    out.push({ i: m.index, j: m.index + m[0].length - 1, token: m[0], pattern: 'repeat', guesses: baseG * count, detail: `“${base}” repeated ×${count}` })
  }
  return out
}

export interface Estimate { guesses: number; log10: number; sequence: Match[]; score: 0 | 1 | 2 | 3 | 4 }

const MIN_SUB = 50
const fact = (n: number) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r }

/** Minimum-guesses decomposition (dynamic programming over end position and match count). */
export function estimate(pw: string): Estimate {
  const n = pw.length
  if (!n) return { guesses: 1, log10: 0, sequence: [], score: 0 }
  const matches = [...dictionaryMatches(pw), ...spatialMatches(pw), ...sequenceMatches(pw), ...yearDateMatches(pw), ...repeatMatches(pw)]
  const byEnd: Match[][] = Array.from({ length: n }, () => [])
  for (const m of matches) byEnd[m.j].push({ ...m, guesses: Math.max(m.guesses, m.token.length === 1 ? 10 : MIN_SUB) })
  // dp[k][c] = min log10 guesses for pw[0..k-1] split into c parts
  const INF = Infinity
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(n + 1).fill(INF))
  const back: (Match | null)[][] = Array.from({ length: n + 1 }, () => new Array<Match | null>(n + 1).fill(null))
  dp[0][0] = 0
  for (let k = 1; k <= n; k++) {
    for (let c = 1; c <= k; c++) {
      // brute-force segment ending at k
      for (let i = 0; i < k; i++) {
        if (dp[i][c - 1] === INF) continue
        const len = k - i
        const lg = len === 1 ? 1 : Math.max(len, Math.log10(MIN_SUB))
        const v = dp[i][c - 1] + lg
        if (v < dp[k][c]) { dp[k][c] = v; back[k][c] = { i, j: k - 1, token: pw.slice(i, k), pattern: 'bruteforce', guesses: 10 ** len, detail: 'no pattern — brute force' } }
      }
      for (const m of byEnd[k - 1]) {
        if (dp[m.i][c - 1] === INF) continue
        const v = dp[m.i][c - 1] + Math.log10(m.guesses)
        if (v < dp[k][c]) { dp[k][c] = v; back[k][c] = m }
      }
    }
  }
  let best = INF, bc = 1
  for (let c = 1; c <= n; c++) {
    const v = dp[n][c] + Math.log10(fact(c))
    if (v < best) { best = v; bc = c }
  }
  const seq: Match[] = []
  let k = n, c = bc
  while (k > 0 && c > 0) {
    const m = back[k][c]!
    seq.unshift(m)
    k = m.i; c--
  }
  const lg = best
  const score = (lg < 3 ? 0 : lg < 6 ? 1 : lg < 8 ? 2 : lg < 10 ? 3 : 4) as Estimate['score']
  return { guesses: 10 ** lg, log10: lg, sequence: seq, score }
}

/** Naive charset entropy: length × log2(pool size). */
export function charsetBits(pw: string): number {
  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/\d/.test(pw)) pool += 10
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33
  return pw.length * Math.log2(pool || 1)
}

export function humanTime(sec: number): string {
  if (sec < 1) return 'instantly'
  const units: [number, string][] = [[60, 'second'], [60, 'minute'], [24, 'hour'], [30.44, 'day'], [12, 'month'], [100, 'year']]
  let v = sec
  for (const [k, name] of units) {
    if (v < k) { const r = Math.round(v); return `${r} ${name}${r === 1 ? '' : 's'}` }
    v /= k
  }
  return v < 1e6 ? `${Math.round(v).toLocaleString('en-US')} centuries` : 'longer than the universe has existed'
}

export function feedback(e: Estimate, pw: string): { warning: string; tips: string[] } {
  const tips: string[] = []
  let warning = ''
  const longest = [...e.sequence].sort((a, b) => b.token.length - a.token.length)[0]
  if (longest && e.score <= 2) {
    if (longest.pattern === 'dictionary') warning = longest.detail.startsWith('common password') ? 'This is one of the most common passwords.' : longest.detail.startsWith('first name') ? 'Names are easy to guess.' : 'A single dictionary word is easy to guess.'
    else if (longest.pattern === 'spatial') warning = 'Keyboard patterns like “qwerty” are easy to guess.'
    else if (longest.pattern === 'repeat') warning = 'Repeats like “aaa” or “abcabc” add little strength.'
    else if (longest.pattern === 'sequence') warning = 'Sequences like “abc” or “6543” are easy to guess.'
    else if (longest.pattern === 'year' || longest.pattern === 'date') warning = 'Dates and years are easy to guess.'
  }
  if (pw.length < 12) tips.push('Use at least 12–16 characters; length beats complexity.')
  if (e.sequence.some((m) => m.pattern === 'dictionary' && m.detail.includes('l33t'))) tips.push('Predictable substitutions like “@” for “a” don’t help much.')
  if (e.sequence.some((m) => m.pattern === 'dictionary') && /^[A-Z][^A-Z]*$/.test(pw)) tips.push('Capitalising only the first letter doesn’t help much.')
  if (e.score < 3) tips.push('Add a few unrelated, uncommon words — a passphrase is easier to remember and stronger.')
  if (e.score >= 3) tips.push('Use a password manager so every site gets a unique password.')
  return { warning, tips }
}
