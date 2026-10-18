// Coffee brew ratio maths and per-method pour / step schedules.

export interface Method {
  id: string
  name: string
  ratio: number // grams of water per gram of coffee
  min: number
  max: number
  grind: string
  temp: string
  absorb: number // grams of water retained per gram of grounds
  kind: 'pour' | 'immersion' | 'aeropress' | 'espresso' | 'cold' | 'moka'
  pours?: number
  total?: number // target brew time in seconds
}

export const METHODS: Method[] = [
  { id: 'v60', name: 'Hario V60', ratio: 16, min: 13, max: 18, grind: 'Medium-fine (like table salt)', temp: '92–96 °C', absorb: 2, kind: 'pour', pours: 3, total: 180 },
  { id: 'chemex', name: 'Chemex', ratio: 15, min: 13, max: 17, grind: 'Medium-coarse (like kosher salt)', temp: '93–96 °C', absorb: 2.2, kind: 'pour', pours: 4, total: 270 },
  { id: 'kalita', name: 'Kalita Wave', ratio: 16, min: 14, max: 18, grind: 'Medium', temp: '92–95 °C', absorb: 2, kind: 'pour', pours: 4, total: 210 },
  { id: 'french', name: 'French press', ratio: 15, min: 12, max: 17, grind: 'Coarse (like breadcrumbs)', temp: '93–96 °C', absorb: 2, kind: 'immersion', total: 240 },
  { id: 'aero', name: 'AeroPress', ratio: 14, min: 6, max: 17, grind: 'Fine to medium-fine', temp: '80–92 °C', absorb: 1.6, kind: 'aeropress', total: 150 },
  { id: 'espresso', name: 'Espresso', ratio: 2, min: 1, max: 3, grind: 'Fine (like powdered sugar)', temp: '90–94 °C', absorb: 0, kind: 'espresso', total: 30 },
  { id: 'moka', name: 'Moka pot', ratio: 10, min: 7, max: 12, grind: 'Fine, slightly coarser than espresso', temp: 'Pre-boiled water', absorb: 1.5, kind: 'moka', total: 300 },
  { id: 'cold', name: 'Cold brew (concentrate)', ratio: 8, min: 4, max: 12, grind: 'Extra coarse', temp: 'Cold / room temp', absorb: 2.5, kind: 'cold', total: 14 * 3600 },
]

export interface Step {
  at: number // seconds from start
  label: string
  water?: number // cumulative scale reading in grams after this step
}

export const amounts = (by: 'coffee' | 'water', value: number, ratio: number) =>
  by === 'coffee' ? { coffee: value, water: value * ratio } : { coffee: value / ratio, water: value }

/** Brewed beverage estimate: water minus what the grounds keep (espresso: water = yield). */
export const beverage = (m: Method, coffee: number, water: number) => Math.max(0, water - coffee * m.absorb)

const r = (x: number) => Math.round(x)

export function schedule(m: Method, coffee: number, water: number): Step[] {
  const total = m.total ?? 180
  switch (m.kind) {
    case 'pour': {
      const bloom = Math.min(water, r(coffee * 2.5))
      const n = m.pours ?? 3
      const steps: Step[] = [{ at: 0, label: `Bloom: pour to ${bloom} g, swirl gently`, water: bloom }]
      const rest = water - bloom
      const pourEnd = total - 60
      for (let i = 1; i <= n; i++) {
        const at = r(45 + ((pourEnd - 45) * (i - 1)) / n)
        const w = r(bloom + (rest * i) / n)
        steps.push({ at, label: `Pour ${i}/${n}: slow spirals up to ${w} g`, water: w })
      }
      steps.push({ at: pourEnd, label: 'Let it draw down; give the brewer a gentle swirl' })
      steps.push({ at: total, label: 'Done: remove the filter and enjoy' })
      return steps
    }
    case 'immersion':
      return [
        { at: 0, label: `Pour all ${r(water)} g of water`, water: r(water) },
        { at: 30, label: 'Stir gently; put the lid on (plunger up)' },
        { at: total, label: 'Break the crust and skim the foam' },
        { at: total + 30, label: 'Press slowly and pour out right away' },
      ]
    case 'aeropress':
      return [
        { at: 0, label: `Add ${r(water)} g of water`, water: r(water) },
        { at: 10, label: 'Stir 3–4 times, insert plunger to hold vacuum' },
        { at: total - 45, label: 'Swirl, then start pressing gently' },
        { at: total - 15, label: 'Stop at the hiss' },
        { at: total, label: 'Done: dilute to taste' },
      ]
    case 'espresso':
      return [
        { at: 0, label: 'Start the shot (pre-infusion)' },
        { at: 6, label: 'First drops should appear' },
        { at: total - 5, label: `Watch the scale: aim for ${r(water)} g out`, water: r(water) },
        { at: total, label: 'Stop the shot' },
      ]
    case 'moka':
      return [
        { at: 0, label: `Fill the base with ${r(water)} g hot water to the valve, level the basket`, water: r(water) },
        { at: 60, label: 'Medium-low heat, lid open' },
        { at: total - 60, label: 'Coffee starts flowing: lower the heat' },
        { at: total, label: 'At the gurgle, cool the base under cold water' },
      ]
    case 'cold':
      return [
        { at: 0, label: `Combine coffee with ${r(water)} g cold water and stir`, water: r(water) },
        { at: 600, label: 'Stir again to wet all grounds; cover' },
        { at: total, label: 'Filter; dilute 1:1 with water or milk' },
      ]
  }
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Index of the step currently in progress at `t` seconds (−1 before start). */
export function stepAt(steps: Step[], t: number): number {
  let k = -1
  steps.forEach((s, i) => {
    if (t >= s.at) k = i
  })
  return k
}
