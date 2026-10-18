// Injection site reference + rotation helpers. Reference only; follow your clinician's instructions.

export type Route = 'IM' | 'SC'
export type Side = 'L' | 'R' | 'C'

export interface Site {
  id: string
  name: string
  route: Route
  side: Side
  /** position on the mannequin (figure faces +z, figure's left is +x, feet at y = 0) */
  pos: [number, number, number]
  back?: boolean
  lessPreferred?: boolean
  landmark: string
}

const LANDMARK = {
  deltoid: 'Outer upper arm, about 2–3 finger widths (2.5–5 cm) below the acromion (bony tip of the shoulder), above the armpit level. Small muscle: small volumes only.',
  vastus: 'Outer (lateral) side of the thigh, middle third between the greater trochanter and the knee. Common site for self-injection and for infants.',
  ventro: 'Side of the hip: heel of the hand on the greater trochanter, index finger toward the front hip bone (anterior superior iliac spine), middle finger spread toward the iliac crest; inject in the centre of the V. Away from major nerves and vessels.',
  dorso: 'Upper outer quadrant of the buttock. Less preferred: risk of sciatic nerve and superior gluteal artery injury; many guidelines recommend the ventrogluteal site instead.',
  abdomen: 'Fatty tissue of the abdomen, at least 5 cm (2 in) away from the navel; avoid scars, stretch marks and the waistline.',
  thigh: 'Front / outer area of the thigh, middle third (a hand width below the hip and above the knee).',
  arm: 'Back of the upper arm, fatty area midway between shoulder and elbow (usually needs a helper).',
}

export const SITES: Site[] = [
  ...(['L', 'R'] as const).flatMap((sd): Site[] => {
    const x = sd === 'L' ? 1 : -1
    const nm = sd === 'L' ? 'left' : 'right'
    return [
      { id: `deltoid-${sd}`, name: `Deltoid (${nm})`, route: 'IM', side: sd, pos: [x * 0.75, 2.62, 0.02], landmark: LANDMARK.deltoid },
      { id: `vastus-${sd}`, name: `Vastus lateralis (${nm})`, route: 'IM', side: sd, pos: [x * 0.43, 1.2, 0.02], landmark: LANDMARK.vastus },
      { id: `ventro-${sd}`, name: `Ventrogluteal (${nm})`, route: 'IM', side: sd, pos: [x * 0.5, 1.8, 0.04], landmark: LANDMARK.ventro },
      { id: `dorso-${sd}`, name: `Dorsogluteal (${nm})`, route: 'IM', side: sd, pos: [x * 0.24, 1.66, -0.34], back: true, lessPreferred: true, landmark: LANDMARK.dorso },
      { id: `abd-up-${sd}`, name: `Abdomen upper ${nm}`, route: 'SC', side: sd, pos: [x * 0.2, 2.1, 0.27], landmark: LANDMARK.abdomen },
      { id: `abd-lo-${sd}`, name: `Abdomen lower ${nm}`, route: 'SC', side: sd, pos: [x * 0.2, 1.86, 0.3], landmark: LANDMARK.abdomen },
      { id: `thigh-${sd}`, name: `Front of thigh (${nm})`, route: 'SC', side: sd, pos: [x * 0.27, 1.25, 0.19], landmark: LANDMARK.thigh },
      { id: `arm-${sd}`, name: `Back of upper arm (${nm})`, route: 'SC', side: sd, pos: [x * 0.64, 2.38, -0.12], back: true, landmark: LANDMARK.arm },
    ]
  }),
]

export const site = (id: string) => SITES.find((s) => s.id === id)

export interface Entry {
  id: string
  date: string // YYYY-MM-DD
  time?: string
  site: string
  note: string
}

const dayNum = (iso: string) => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000)

/** Last date each site was used. */
export function lastUse(log: Entry[]): Record<string, string> {
  const m: Record<string, string> = {}
  for (const e of log) if (!m[e.site] || e.date > m[e.site]) m[e.site] = e.date
  return m
}

export const daysBetween = (a: string, b: string) => dayNum(b) - dayNum(a)

/**
 * Suggests the next site for a route: never-used sites first, then the one rested longest;
 * less-preferred sites only if nothing else is available. Avoids the side used last when tied.
 */
export function suggest(log: Entry[], route: Route): Site | null {
  const last = lastUse(log)
  const cands = SITES.filter((s) => s.route === route)
  const recent = [...log].sort((a, b) => (b.date + (b.time ?? '')).localeCompare(a.date + (a.time ?? '')))[0]
  const lastSide = recent ? site(recent.site)?.side : undefined
  const rank = (s: Site) => [s.lessPreferred ? 1 : 0, last[s.id] ? dayNum(last[s.id]) : -1e9, s.side === lastSide ? 1 : 0] as const
  return [...cands].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2]
  })[0] ?? null
}

/** Count of uses per site within the last `days` days before `today`. */
export function usage(log: Entry[], today: string, days: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const e of log) {
    const d = daysBetween(e.date, today)
    if (d >= 0 && d < days) out[e.site] = (out[e.site] ?? 0) + 1
  }
  return out
}
