// Pet pregnancy: typical gestation lengths (veterinary reference ranges, rounded), development
// timelines written for owners, pre-birth temperature-drop check and ICS export. Not veterinary advice.

export interface Ev { day: number; title: string; detail: string; kind?: 'vet' | 'prep' | 'dev' | 'birth' }
export interface PetSpecies {
  id: string; name: string; icon: string; days: number; min: number; max: number; young: string; litter: string
  /** rectal temperature (°C): normal range and the drop that usually precedes birth */
  temp?: { lo: number; hi: number; drop: number; note: string }
  events: Ev[]; prep: string[]; tip: string
}

export const PETS: PetSpecies[] = [
  {
    id: 'dog', name: 'Dog', icon: '🐕', days: 63, min: 58, max: 68, young: 'puppies', litter: '1–12 (breed dependent)',
    temp: { lo: 37.8, hi: 39.2, drop: 37.5, note: 'Temperature usually falls below ~37.5–37.8 °C (99.5–100 °F) 12–24 h before whelping.' },
    events: [
      { day: 0, title: 'Mating', detail: 'Count from the first mating; ovulation can be a few days earlier or later, so the window is wide.', kind: 'dev' },
      { day: 17, title: 'Embryos implant', detail: 'Embryos attach to the uterus (days 16–20). Nothing visible yet; keep exercise normal.', kind: 'dev' },
      { day: 25, title: 'Ultrasound possible', detail: 'Heartbeats show from ~day 25. A relaxin blood test also becomes reliable around now.', kind: 'vet' },
      { day: 30, title: 'Palpation window', detail: 'Vets can often feel walnut-sized swellings (days 28–35); later the fluid makes it harder.', kind: 'vet' },
      { day: 35, title: 'Appetite rises', detail: 'From week 5–6 increase food gradually (roughly 10 % per week) or switch to a puppy/growth diet if your vet agrees.', kind: 'prep' },
      { day: 42, title: 'Belly and nipples enlarge', detail: 'Weight gain becomes obvious; puppies grow fastest in the last three weeks.', kind: 'dev' },
      { day: 45, title: 'X-ray to count puppies', detail: 'Skeletons are visible from ~day 45; knowing the count tells you when she is finished.', kind: 'vet' },
      { day: 50, title: 'Set up the whelping box', detail: 'Quiet, warm room; let her sleep in it so it feels like her den.', kind: 'prep' },
      { day: 56, title: 'Start the temperature log', detail: 'Take rectal temperature at the same times twice a day to learn her baseline.', kind: 'prep' },
      { day: 63, title: 'Expected whelping', detail: 'Restlessness, nesting, refusing food and the temperature drop usually come first.', kind: 'birth' },
    ],
    prep: ['Whelping box with low rail (pig rail), washable bedding', 'Heat source / heat mat for one side of the box', 'Clean towels, digital thermometer, lubricant', 'Clean scissors, unwaxed floss for cords, iodine', 'Kitchen scale + notebook for puppy weights', 'Puppy milk replacer and bottle as backup', 'Vet and emergency clinic numbers on the fridge', 'Plan who stays home around the due date'],
    tip: 'Call the vet if she strains hard for 30–60 min without a puppy, rests more than 2–4 h between puppies with more to come, or passes dark green discharge before the first puppy.',
  },
  {
    id: 'cat', name: 'Cat', icon: '🐈', days: 65, min: 61, max: 69, young: 'kittens', litter: '3–5 typical',
    temp: { lo: 38.1, hi: 39.2, drop: 37.8, note: 'Many queens drop to about 37.8 °C (100 °F) within 24 h of kittening, but the sign is less reliable than in dogs.' },
    events: [
      { day: 0, title: 'Mating', detail: 'Cats ovulate after mating, so dates are fairly predictable.', kind: 'dev' },
      { day: 14, title: 'Implantation', detail: 'Embryos implant around days 12–14.', kind: 'dev' },
      { day: 18, title: '“Pinking up”', detail: 'Nipples turn pink and enlarge (days 15–21) — often the first sign owners notice.', kind: 'dev' },
      { day: 21, title: 'Ultrasound possible', detail: 'Heartbeats can be seen from about day 21–25.', kind: 'vet' },
      { day: 28, title: 'Palpation & more food', detail: 'Vets may feel the foetuses; begin increasing food gradually, kitten food suits pregnant queens.', kind: 'vet' },
      { day: 42, title: 'X-ray count', detail: 'Skeletons visible from ~day 42.', kind: 'vet' },
      { day: 50, title: 'Prepare a queening box', detail: 'Cardboard box with a side opening in a quiet, warm corner; she may choose her own spot.', kind: 'prep' },
      { day: 58, title: 'Nesting behaviour', detail: 'Seeking hiding places, extra grooming, restlessness. Start a temperature log if she tolerates it.', kind: 'prep' },
      { day: 65, title: 'Expected kittening', detail: 'Labour often happens at night; most queens manage without help.', kind: 'birth' },
    ],
    prep: ['Queening box with low side entrance', 'Clean towels and puppy pads', 'Heat pad under half the box', 'Kitchen scale for kitten weights', 'Kitten milk replacer + bottle', 'Vet / emergency numbers ready'],
    tip: 'Call the vet if she strains for 30 min without a kitten, rests more than 2 h between kittens, or seems weak, bleeding heavily or feverish.',
  },
  {
    id: 'rabbit', name: 'Rabbit', icon: '🐇', days: 31, min: 28, max: 35, young: 'kits', litter: '4–10',
    events: [
      { day: 0, title: 'Mating', detail: 'Rabbits are induced ovulators; dates are reliable.', kind: 'dev' },
      { day: 12, title: 'Palpation', detail: 'Experienced handlers or vets can feel marble-sized embryos (days 10–14). Be very gentle.', kind: 'vet' },
      { day: 18, title: 'False pregnancy check', detail: 'A pseudo-pregnancy usually ends with nesting around day 16–18; a real one continues.', kind: 'dev' },
      { day: 25, title: 'Add a nest box', detail: 'Box with hay; she will line it with fur she pulls from her chest.', kind: 'prep' },
      { day: 28, title: 'Fur pulling', detail: 'Usually within the last few days — sometimes only hours before kindling.', kind: 'prep' },
      { day: 31, title: 'Expected kindling', detail: 'Mostly at night or early morning; kits are fed only once or twice a day — that is normal.', kind: 'birth' },
      { day: 33, title: 'Call the vet if no kits', detail: 'Past day 32–33 the risk of oversized or dead kits rises.', kind: 'vet' },
    ],
    prep: ['Nest box with hay (in by day 25)', 'Unlimited hay and fresh water', 'Quiet area away from other pets', 'Separate the buck (she can re-conceive right after kindling)'],
    tip: 'Does nurse only once or twice a day; check that kits look round and warm rather than watching for feeding.',
  },
  {
    id: 'guinea', name: 'Guinea pig', icon: '🐹', days: 68, min: 59, max: 72, young: 'pups', litter: '2–4',
    events: [
      { day: 0, title: 'Mating', detail: 'Sows bred for the first time after ~7 months risk a fused pelvis and dangerous labour — discuss with your vet.', kind: 'vet' },
      { day: 21, title: 'Ultrasound possible', detail: 'Pregnancy can be confirmed by ultrasound from about 3 weeks.', kind: 'vet' },
      { day: 35, title: 'Visible weight gain', detail: 'Weigh weekly; increase vitamin C rich veg and hay.', kind: 'dev' },
      { day: 56, title: 'Pelvic gap check', detail: 'A vet can feel whether the pelvic bones are separating in the last week or two.', kind: 'vet' },
      { day: 60, title: 'Separate the boar', detail: 'Sows can conceive again within hours of giving birth.', kind: 'prep' },
      { day: 68, title: 'Expected birth', detail: 'Pups are born fully furred with open eyes and nibble solids within days.', kind: 'birth' },
    ],
    prep: ['Weekly weigh-ins', 'Extra vitamin C (fresh peppers, leafy greens)', 'Separate boar before birth', 'Exotic-vet contact for emergencies'],
    tip: 'Pregnancy toxaemia is a risk in the last weeks: avoid stress, sudden diet changes and obesity; a sow that stops eating needs a vet the same day.',
  },
  {
    id: 'ferret', name: 'Ferret', icon: '🦦', days: 42, min: 41, max: 43, young: 'kits', litter: '6–8',
    events: [
      { day: 0, title: 'Mating', detail: 'Jills are induced ovulators.', kind: 'dev' },
      { day: 14, title: 'Palpation possible', detail: 'A vet can often confirm by palpation or ultrasound around 2 weeks.', kind: 'vet' },
      { day: 28, title: 'Increase food', detail: 'High-quality, high-fat diet; she will eat much more in the last two weeks.', kind: 'prep' },
      { day: 35, title: 'Nest box ready', detail: 'Enclosed box with soft bedding, away from hobs.', kind: 'prep' },
      { day: 42, title: 'Expected kindling', detail: 'Do not disturb the nest during the first days.', kind: 'birth' },
    ],
    prep: ['Enclosed nest box', 'Remove the hob', 'Extra food and water', 'Vet number for exotics'],
    tip: 'Small litters (fewer than 3 kits) can mean an overdue jill; ask the vet if nothing happens by day 43.',
  },
  {
    id: 'hamster', name: 'Hamster (Syrian)', icon: '🐹', days: 16, min: 15, max: 18, young: 'pups', litter: '6–12',
    events: [
      { day: 0, title: 'Mating', detail: 'Separate the pair right after mating.', kind: 'dev' },
      { day: 10, title: 'Clean the cage', detail: 'Last full clean; after the birth leave the nest alone for about two weeks.', kind: 'prep' },
      { day: 12, title: 'Extra protein', detail: 'Boiled egg or mealworms in small amounts, plenty of nesting material.', kind: 'prep' },
      { day: 16, title: 'Expected birth', detail: 'Do not touch pups or nest for 10–14 days — disturbed mothers may abandon or eat them.', kind: 'birth' },
    ],
    prep: ['Unscented paper bedding for the nest', 'Full cage clean before day 12', 'Water bottle low enough for pups'],
    tip: 'Keep handling and noise to a minimum during the first two weeks after birth.',
  },
  {
    id: 'dwarf', name: 'Dwarf hamster', icon: '🐹', days: 20, min: 18, max: 21, young: 'pups', litter: '4–8',
    events: [
      { day: 0, title: 'Mating', detail: 'Dwarf males can stay but the female can re-conceive immediately after birth.', kind: 'dev' },
      { day: 14, title: 'Last cage clean', detail: 'Then leave the nest area undisturbed.', kind: 'prep' },
      { day: 20, title: 'Expected birth', detail: 'Remove the male now if you want to avoid a back-to-back litter.', kind: 'birth' },
    ],
    prep: ['Nesting material', 'Last clean by day 14', 'Plan to separate the male'],
    tip: 'Back-to-back litters exhaust the female; separating the male before birth is kinder.',
  },
  {
    id: 'rat', name: 'Rat', icon: '🐀', days: 22, min: 21, max: 23, young: 'pups (kittens)', litter: '6–13',
    events: [
      { day: 0, title: 'Mating', detail: 'Remove the male; females can conceive again right after birth.', kind: 'dev' },
      { day: 14, title: 'Belly shows', detail: 'Pear-shaped belly; give extra protein.', kind: 'dev' },
      { day: 18, title: 'Birthing cage', detail: 'Single-level cage with narrow bar spacing and a nest box.', kind: 'prep' },
      { day: 22, title: 'Expected birth', detail: 'Usually at night; check for retained pups if she seems unwell.', kind: 'birth' },
    ],
    prep: ['Single-level cage, narrow bars', 'Nest box and paper bedding', 'Extra protein'],
    tip: 'Bleeding beyond a day or a mother that stays hunched and lethargic needs a vet.',
  },
  {
    id: 'mouse', name: 'Mouse', icon: '🐁', days: 20, min: 19, max: 21, young: 'pups', litter: '6–12',
    events: [
      { day: 0, title: 'Mating', detail: 'Separate the male to avoid a post-partum pregnancy.', kind: 'dev' },
      { day: 14, title: 'Visible belly', detail: 'Provide extra nesting material.', kind: 'dev' },
      { day: 20, title: 'Expected birth', detail: 'Pups are pink and blind; eyes open around day 13–14.', kind: 'birth' },
    ],
    prep: ['Nesting material', 'Quiet location', 'Separate the male'],
    tip: 'Avoid moving the cage in the final days.',
  },
  {
    id: 'chinchilla', name: 'Chinchilla', icon: '🐭', days: 111, min: 105, max: 118, young: 'kits', litter: '1–3',
    events: [
      { day: 0, title: 'Mating', detail: 'Long pregnancy; signs are subtle for the first two months.', kind: 'dev' },
      { day: 60, title: 'Weight check', detail: 'Weekly weighing shows steady gain from about two months.', kind: 'vet' },
      { day: 90, title: 'Remove high shelves', detail: 'Reduce falls; no dust baths in the last days.', kind: 'prep' },
      { day: 111, title: 'Expected birth', detail: 'Kits are born furred with open eyes, usually early morning.', kind: 'birth' },
    ],
    prep: ['Lower shelves', 'Kit-safe cage mesh', 'Exotic-vet contact'],
    tip: 'Kits weigh 35–60 g; weigh them daily for the first week.',
  },
]
export const petById = (id: string) => PETS.find((p) => p.id === id) ?? PETS[0]

const DAYMS = 86400000
const parse = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
export const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
export const addDays = (s: string, n: number) => iso(parse(s) + n * DAYMS)
export const diff = (a: string, b: string) => Math.round((parse(b) - parse(a)) / DAYMS)
export const validDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parse(s)) === s

export interface DueInfo { due: string; early: string; late: string; day: number; left: number; week: number; pct: number; phase: 'pregnant' | 'window' | 'overdue' }
/** With two matings, the window spans first + min to last + max; the typical due date is from the midpoint. */
export function dueInfo(sp: PetSpecies, first: string, last: string, today: string): DueInfo {
  const l = last && last >= first ? last : first
  const mid = addDays(first, Math.floor(diff(first, l) / 2))
  const due = addDays(mid, sp.days)
  const early = addDays(first, sp.min), late = addDays(l, sp.max)
  const day = diff(first, today)
  const phase = today > late ? 'overdue' : today >= early ? 'window' : 'pregnant'
  return { due, early, late, day, left: diff(today, due), week: Math.floor(Math.max(0, day) / 7) + 1, pct: Math.max(0, Math.min(1, day / sp.days)), phase }
}

export interface Reading { id: string; at: string; c: number }
/** Baseline = mean of readings before the last 24 h; alert when the latest is below the species drop
 * threshold or ≥ 1 °C under the baseline. */
export function tempCheck(sp: PetSpecies, rs: Reading[]): { baseline: number; latest: number; alert: boolean; text: string } | null {
  if (!sp.temp || !rs.length) return null
  const sorted = [...rs].sort((a, b) => a.at.localeCompare(b.at))
  const latest = sorted[sorted.length - 1]
  const cut = Date.parse(latest.at) - DAYMS
  const older = sorted.filter((r) => Date.parse(r.at) < cut)
  const base = (older.length ? older : sorted).reduce((a, r) => a + r.c, 0) / (older.length || sorted.length)
  const alert = latest.c <= sp.temp.drop || base - latest.c >= 1
  const text = alert
    ? `Latest ${latest.c.toFixed(1)} °C is ${(base - latest.c).toFixed(1)} °C below her baseline (${base.toFixed(1)} °C): birth is likely within about 24 hours.`
    : latest.c > sp.temp.hi + 0.3
      ? `Latest ${latest.c.toFixed(1)} °C is above the normal range — fever is a reason to call your vet.`
      : `No drop yet (baseline ${base.toFixed(1)} °C, latest ${latest.c.toFixed(1)} °C). Keep measuring twice a day.`
  return { baseline: base, latest: latest.c, alert, text }
}

export const cToF = (c: number) => (c * 9) / 5 + 32
export const fToC = (f: number) => ((f - 32) * 5) / 9

const esc = (s: string) => s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n')
export function ics(events: { date: string; title: string; desc?: string; uid: string }[], stamp: string): string {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Pet Gestation Calculator//EN', 'CALSCALE:GREGORIAN']
  for (const e of events) {
    L.push('BEGIN:VEVENT', `UID:${e.uid}@browser-toolbox-pets`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`, `SUMMARY:${esc(e.title)}`)
    if (e.desc) L.push(`DESCRIPTION:${esc(e.desc)}`)
    L.push('END:VEVENT')
  }
  L.push('END:VCALENDAR')
  return L.join('\r\n') + '\r\n'
}
