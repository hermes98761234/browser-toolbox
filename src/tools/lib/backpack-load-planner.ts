// Backpack zones, centre of mass and loading advice.
// Pack frame: x = lateral (−0.5 left … 0.5 right), y = height above the hip belt (0 … 1),
// z = distance from the wearer's back (0 = back panel … 1 = front of pack).

export type ZoneId = 'bottom' | 'core' | 'front' | 'top' | 'lid' | 'left' | 'right' | 'hip'

export interface Zone {
  id: ZoneId
  name: string
  box: [number, number, number, number, number, number] // x0 x1 y0 y1 z0 z1
  share: number // fraction of nominal pack volume
  color: string
  tip: string
}

export const ZONES: Zone[] = [
  { id: 'bottom', name: 'Bottom', box: [-0.5, 0.5, 0, 0.24, 0, 1], share: 0.22, color: '#0ea5e9', tip: 'Bulky, light gear you need only at camp: sleeping bag, sleep clothes.' },
  { id: 'core', name: 'Core (against back)', box: [-0.5, 0.5, 0.24, 0.74, 0, 0.5], share: 0.3, color: '#ef4444', tip: 'Heaviest, densest items: food, water reservoir, stove, tent body.' },
  { id: 'front', name: 'Core (outer)', box: [-0.5, 0.5, 0.24, 0.74, 0.5, 1], share: 0.22, color: '#f59e0b', tip: 'Medium-weight, bulkier items: spare clothing, tent fly, pads.' },
  { id: 'top', name: 'Top', box: [-0.5, 0.5, 0.74, 0.9, 0, 1], share: 0.14, color: '#10b981', tip: 'Things you may need during the day: rain shell, insulation, toilet kit.' },
  { id: 'lid', name: 'Lid / brain', box: [-0.45, 0.45, 0.9, 1, -0.05, 1.05], share: 0.06, color: '#a855f7', tip: 'Small essentials: map, headlamp, first aid, sunscreen.' },
  { id: 'left', name: 'Left side pocket', box: [-0.66, -0.5, 0.1, 0.45, 0.35, 0.95], share: 0.03, color: '#14b8a6', tip: 'Water bottle, tent poles. Balance it with the right side.' },
  { id: 'right', name: 'Right side pocket', box: [0.5, 0.66, 0.1, 0.45, 0.35, 0.95], share: 0.03, color: '#14b8a6', tip: 'Water bottle, filter. Balance it with the left side.' },
  { id: 'hip', name: 'Hip belt pockets', box: [-0.15, 0.15, 0, 0.08, -0.35, -0.15], share: 0.015, color: '#64748b', tip: 'Snacks, phone, lip balm. Rides on your hips.' },
]

export interface Item { id: string; name: string; kg: number; liters: number; zone: ZoneId }

export const zoneOf = (id: ZoneId) => ZONES.find((z) => z.id === id) ?? ZONES[1]
export const centre = (z: Zone): [number, number, number] => [(z.box[0] + z.box[1]) / 2, (z.box[2] + z.box[3]) / 2, (z.box[4] + z.box[5]) / 2]

/** Mass-weighted centre in pack-frame units; the empty pack counts at its own centre. */
export function centreOfMass(items: Item[], packKg: number) {
  let m = Math.max(0, packKg)
  let x = 0, y = 0.48 * m, z = 0.45 * m
  for (const it of items) {
    const w = Math.max(0, it.kg)
    const [cx, cy, cz] = centre(zoneOf(it.zone))
    m += w
    x += w * cx
    y += w * cy
    z += w * cz
  }
  return m > 0 ? { x: x / m, y: y / m, z: z / m, mass: m } : { x: 0, y: 0.5, z: 0.5, mass: 0 }
}

export function zoneLoad(items: Item[], capacityL: number) {
  return ZONES.map((z) => {
    const its = items.filter((i) => i.zone === z.id)
    const kg = its.reduce((a, i) => a + Math.max(0, i.kg), 0)
    const liters = its.reduce((a, i) => a + Math.max(0, i.liters), 0)
    const cap = capacityL * z.share
    return { zone: z, kg, liters, cap, fill: cap > 0 ? liters / cap : 0 }
  })
}

export type Activity = 'trail' | 'scramble'
export const TARGET: Record<Activity, { y: [number, number]; z: number }> = {
  trail: { y: [0.45, 0.65], z: 0.45 },
  scramble: { y: [0.32, 0.5], z: 0.42 },
}

export interface Advice { tone: 'ok' | 'warn' | 'err'; text: string }

export function advise(items: Item[], packKg: number, capacityL: number, bodyKg: number, act: Activity): Advice[] {
  const out: Advice[] = []
  const c = centreOfMass(items, packKg)
  const t = TARGET[act]
  if (!items.length) return [{ tone: 'warn', text: 'Add some items to see the balance.' }]
  if (c.y < t.y[0]) out.push({ tone: 'warn', text: `The load sits low (${Math.round(c.y * 100)}% of pack height). Move dense items up into the core${act === 'trail' ? ' so the weight rides over your hips' : ''}.` })
  else if (c.y > t.y[1]) out.push({ tone: 'warn', text: `The load sits high (${Math.round(c.y * 100)}% of pack height). That feels tippy${act === 'scramble' ? ' on rough ground' : ''}; move heavy items down into the core.` })
  else out.push({ tone: 'ok', text: `Height of the centre of mass is good for ${act === 'trail' ? 'trail walking' : 'scrambling / off-trail'}.` })
  if (c.z > t.z) out.push({ tone: 'warn', text: 'The weight is too far from your back and will pull you backwards. Put the heaviest items in the core against the back panel.' })
  else out.push({ tone: 'ok', text: 'Weight is close to your back.' })
  const side = zoneLoad(items, capacityL)
  const l = side.find((z) => z.zone.id === 'left')!.kg, r = side.find((z) => z.zone.id === 'right')!.kg
  if (Math.abs(c.x) > 0.04 || Math.abs(l - r) > 0.5) out.push({ tone: 'warn', text: `Side-to-side imbalance: left ${l.toFixed(2)} kg vs right ${r.toFixed(2)} kg. Even them out.` })
  const total = c.mass
  const heavy = items.filter((i) => i.kg >= Math.max(0.8, total * 0.08) && ['front', 'top', 'lid', 'bottom'].includes(i.zone))
  for (const h of heavy.slice(0, 3)) out.push({ tone: 'warn', text: `"${h.name}" (${h.kg} kg) is heavy for the ${zoneOf(h.zone).name.toLowerCase()}. Try the core against your back.` })
  for (const z of side) if (z.fill > 1.05) out.push({ tone: 'err', text: `${z.zone.name} is over capacity (${z.liters.toFixed(1)} L in about ${z.cap.toFixed(1)} L).` })
  const totalL = items.reduce((a, i) => a + i.liters, 0)
  if (totalL > capacityL * 1.02) out.push({ tone: 'err', text: `Gear volume ${totalL.toFixed(0)} L exceeds the ${capacityL} L pack.` })
  if (bodyKg > 0) {
    const p = total / bodyKg
    if (p > 0.25) out.push({ tone: 'err', text: `Pack is ${Math.round(p * 100)}% of body weight; above about 20% most people tire quickly. Cut weight.` })
    else if (p > 0.2) out.push({ tone: 'warn', text: `Pack is ${Math.round(p * 100)}% of body weight; a common guideline is 20% or less for multi-day trips.` })
    else out.push({ tone: 'ok', text: `Pack is ${Math.round(p * 100)}% of body weight (within the usual 20% guideline).` })
  }
  return out
}
