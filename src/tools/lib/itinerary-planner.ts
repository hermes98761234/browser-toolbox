// Itinerary math: great-circle distance, travel-time estimates, day timelines and iCalendar export.

export interface Stop { id: string; name: string; lat: number; lon: number; stay: number; note?: string }
export type Mode = 'walk' | 'bike' | 'transit' | 'car'

/** Average door-to-door speed (km/h) and detour factor (road distance / straight line). */
export const MODES: Record<Mode, { label: string; kmh: number; detour: number; overhead: number }> = {
  walk: { label: 'Walk', kmh: 4.5, detour: 1.3, overhead: 0 },
  bike: { label: 'Bike', kmh: 14, detour: 1.3, overhead: 3 },
  transit: { label: 'Transit', kmh: 22, detour: 1.4, overhead: 8 },
  car: { label: 'Car / taxi', kmh: 35, detour: 1.4, overhead: 5 },
}

export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371.0088
  const r = Math.PI / 180
  const dLat = (b.lat - a.lat) * r
  const dLon = (b.lon - a.lon) * r
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Estimated travel minutes between two points, rounded up to 5 minutes. */
export function travelMin(km: number, mode: Mode): number {
  const m = MODES[mode]
  if (km < 0.05) return 0
  return Math.ceil((((km * m.detour) / m.kmh) * 60 + m.overhead) / 5) * 5
}

export interface Leg { stop: Stop; km: number; travel: number; arrive: number; depart: number }

/** Timeline for one day: minutes after midnight for arrival and departure at each stop. */
export function timeline(stops: Stop[], start: number, mode: Mode): Leg[] {
  let t = start
  return stops.map((s, i) => {
    const km = i ? haversine(stops[i - 1], s) : 0
    const travel = i ? travelMin(km, mode) : 0
    const arrive = t + travel
    const depart = arrive + Math.max(0, s.stay)
    t = depart
    return { stop: s, km, travel, arrive, depart }
  })
}

export const hhmm = (m: number) => {
  const d = Math.floor(m / 1440)
  const x = ((Math.round(m) % 1440) + 1440) % 1440
  return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}${d > 0 ? ` +${d}d` : ''}`
}

/** Parses "41.89, 12.49", "41.89 12.49" or a map URL containing "@41.89,12.49" / "?q=41.89,12.49" / "#map=z/lat/lon". */
export function parseCoords(s: string): { lat: number; lon: number } | null {
  const osm = /#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(s)
  const m = osm ?? /(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)/.exec(s)
  if (!m) return null
  const lat = Number(m[1]), lon = Number(m[2])
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1')
const stamp = (date: string, min: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCMinutes(d.getUTCMinutes() + Math.round(min))
  return d.toISOString().slice(0, 16).replace(/[-:]/g, '') + '00'
}

/** iCalendar with one event per stop (floating local times). `days[i]` is scheduled on startDate + i. */
export function ics(title: string, startDate: string, days: Leg[][]): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Itinerary Planner//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(title)}`]
  days.forEach((legs, di) => {
    const date = new Date(Date.parse(`${startDate}T00:00:00Z`) + di * 864e5).toISOString().slice(0, 10)
    legs.forEach((l, i) => {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${l.stop.id}-${di}-${i}@browser-toolbox`,
        `DTSTAMP:${now}`,
        `DTSTART:${stamp(date, l.arrive)}`,
        `DTEND:${stamp(date, l.depart)}`,
        `SUMMARY:${esc(l.stop.name)}`,
        `GEO:${l.stop.lat};${l.stop.lon}`,
        `DESCRIPTION:${esc(`${title} · Day ${di + 1}${l.stop.note ? ` · ${l.stop.note}` : ''}${i ? ` · ${l.travel} min travel from previous stop` : ''}`)}`,
        'END:VEVENT',
      )
    })
  })
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
