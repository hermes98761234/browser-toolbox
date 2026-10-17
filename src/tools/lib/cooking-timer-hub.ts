// Voice command parsing and duration helpers for kitchen timers.

const WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ninety: 90,
}

/** Replaces number words ("twenty five", "one and a half") with digits. */
export function wordsToDigits(text: string): string {
  let t = ` ${text.toLowerCase().replace(/-/g, ' ')} `
  t = t.replace(/\b(\d+|[a-z]+) and a half\b/g, (m, w: string) => {
    const n = /^\d+$/.test(w) ? Number(w) : WORDS[w]
    return n === undefined ? m : String(n + 0.5)
  })
  t = t.replace(/\bhalf an?\b/g, '0.5')
  t = t.replace(/\b(twenty|thirty|forty|fifty) (one|two|three|four|five|six|seven|eight|nine)\b/g, (_, a: string, b: string) => String(WORDS[a] + WORDS[b]))
  t = t.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|ninety)\b/g, (w) => String(WORDS[w]))
  t = t.replace(/\b(an?) (?=(hour|minute|second|min|sec))/g, '1 ')
  return t.trim().replace(/\s+/g, ' ')
}

/** Finds "1 hour 20 minutes", "90 seconds", "7 min" in text → seconds (0 if none). */
export function parseDuration(text: string): number {
  const t = wordsToDigits(text)
  let total = 0
  const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    const n = Number(m[1])
    const u = m[2][0]
    total += u === 'h' ? n * 3600 : u === 'm' ? n * 60 : n
  }
  const clock = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/.exec(t)
  if (!total && clock) total = clock[3] ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) : Number(clock[1]) * 60 + Number(clock[2])
  return Math.round(total)
}

export type Action = 'start' | 'stop' | 'pause' | 'reset' | 'add'
export interface Command { action: Action; name: string; seconds: number }

/**
 * "start pasta 9 minutes", "set a timer for eggs for 6 minutes", "pause rice", "stop all",
 * "add 2 minutes to pasta" → command. Returns null if nothing actionable was heard.
 */
export function parseCommand(text: string): Command | null {
  const raw = wordsToDigits(text).replace(/[.,!?]/g, '')
  let action: Action = 'start'
  if (/\b(stop|cancel|dismiss|silence|delete|remove)\b/.test(raw)) action = 'stop'
  else if (/\b(pause|hold)\b/.test(raw)) action = 'pause'
  else if (/\b(reset|restart)\b/.test(raw)) action = 'reset'
  else if (/\b(add|extend|plus)\b/.test(raw)) action = 'add'
  const seconds = parseDuration(raw)
  const name = raw
    .replace(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/g, ' ')
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ')
    .replace(/\b(please|hey|ok|okay|start|stop|cancel|dismiss|silence|delete|remove|pause|hold|reset|restart|add|extend|plus|set|create|make|begin|run|resume|a|an|the|timer|timers|for|to|on|called|named|of|and|my|up)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (action === 'start' && !seconds && !name) return null
  if ((action === 'add') && !seconds) return null
  return { action, name, seconds }
}

/** Seconds → "1:05:09" / "5:09". */
export function clock(sec: number): string {
  const t = Math.max(0, Math.ceil(sec))
  const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
