// Shot list data model, summaries and PDF text helpers.

export interface Shot {
  id: string
  scene: string
  shot: string
  size: string
  angle: string
  move: string
  lens: number
  desc: string
  audio: string
  location: string
  gear: string[]
  setup: number // minutes to set up
  dur: number // seconds of screen time
  takes: number
  status: 'planned' | 'ready' | 'shot' | 'cut'
}

export const SIZES = ['EWS', 'WS', 'MWS', 'MS', 'MCU', 'CU', 'ECU', 'OTS', 'POV', 'Insert', 'Two-shot'] as const
export const ANGLES = ['Eye level', 'High', 'Low', "Bird's eye", 'Dutch', 'Overhead'] as const
export const MOVES = ['Static', 'Pan', 'Tilt', 'Dolly', 'Tracking', 'Handheld', 'Gimbal', 'Crane', 'Drone', 'Zoom'] as const
export const AUDIO = ['Sync', 'MOS', 'Wild', 'VO'] as const

export interface Summary {
  shots: number
  active: number
  done: number
  screenSec: number
  setupMin: number
  shootMin: number
  totalMin: number
  scenes: { scene: string; shots: number; screenSec: number; totalMin: number }[]
  gear: { name: string; shots: number }[]
}

/**
 * Time on set per shot = setup + takes × (duration + reset overhead). Cut shots are ignored.
 * resetSec is the slate/reset time between takes.
 */
export function summarize(list: Shot[], resetSec = 45): Summary {
  const act = list.filter((s) => s.status !== 'cut')
  const shootMin = act.reduce((a, s) => a + (s.takes * (s.dur + resetSec)) / 60, 0)
  const setupMin = act.reduce((a, s) => a + s.setup, 0)
  const sceneMap = new Map<string, { shots: number; screenSec: number; totalMin: number }>()
  const gearMap = new Map<string, number>()
  for (const s of act) {
    const e = sceneMap.get(s.scene) ?? { shots: 0, screenSec: 0, totalMin: 0 }
    e.shots++
    e.screenSec += s.dur
    e.totalMin += s.setup + (s.takes * (s.dur + resetSec)) / 60
    sceneMap.set(s.scene, e)
    for (const g of s.gear) gearMap.set(g, (gearMap.get(g) ?? 0) + 1)
  }
  return {
    shots: list.length,
    active: act.length,
    done: act.filter((s) => s.status === 'shot').length,
    screenSec: act.reduce((a, s) => a + s.dur, 0),
    setupMin,
    shootMin,
    totalMin: setupMin + shootMin,
    scenes: [...sceneMap].map(([scene, v]) => ({ scene, ...v })).sort((a, b) => a.scene.localeCompare(b.scene, undefined, { numeric: true })),
    gear: [...gearMap].map(([name, shots]) => ({ name, shots })).sort((a, b) => b.shots - a.shots || a.name.localeCompare(b.name)),
  }
}

/** Move item at index `from` to index `to` (array copy). */
export function move<T>(arr: T[], from: number, to: number): T[] {
  const a = arr.slice()
  const [x] = a.splice(from, 1)
  a.splice(Math.max(0, Math.min(a.length, to)), 0, x)
  return a
}

/** Renumber shots within each scene as 1A, 1B… → "1", "2"… keeping list order. */
export function renumber(list: Shot[]): Shot[] {
  const n = new Map<string, number>()
  return list.map((s) => {
    const k = (n.get(s.scene) ?? 0) + 1
    n.set(s.scene, k)
    return { ...s, shot: String(k) }
  })
}

/** pdf-lib standard fonts only encode WinAnsi; map common Unicode punctuation and drop the rest. */
export function sanitize(t: string): string {
  return t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/×/g, 'x')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
}

/** Greedy word wrap using a width-measuring callback. */
export function wrap(text: string, max: number, width: (s: string) => number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + word : word
      if (width(next) <= max || !line) line = next
      else { out.push(line); line = word }
      while (width(line) > max && line.length > 1) {
        let k = line.length - 1
        while (k > 1 && width(line.slice(0, k)) > max) k--
        out.push(line.slice(0, k))
        line = line.slice(k)
      }
    }
    out.push(line)
  }
  return out
}

export const fmtDur = (sec: number) => {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60)
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
}
export const fmtMin = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}
