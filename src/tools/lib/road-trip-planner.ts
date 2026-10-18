// Road trip simulation: legs (km, hours) → timeline with driving breaks, daily limits, overnight
// stops and fuel stops by usable tank range. Plus polyline helpers for placing events on the map.
import { haversine, type Pt } from './route-stop-optimizer'

export interface Leg { km: number; hours: number }
export interface Stop { name: string; stayMin: number; night: boolean }
export interface Rules {
  dayStart: number // minutes after midnight
  dayEnd: number // stop driving by (minutes after midnight)
  maxDayH: number
  breakEveryH: number
  breakMin: number
  rangeKm: number // usable range before refuelling (already minus reserve)
  fuelMin: number
}
export type Kind = 'start' | 'drive' | 'break' | 'fuel' | 'overnight' | 'arrive' | 'stay' | 'end'
export interface Ev { kind: Kind; t: number; dur: number; km: number; leg: number; label: string }

const EPS = 1e-6

/** Straight-line leg distances × road factor and durations at an average speed. */
export function estimateLegs(pts: Pt[], factor: number, kmh: number): Leg[] {
  const out: Leg[] = []
  for (let i = 1; i < pts.length; i++) {
    const km = haversine(pts[i - 1], pts[i]) * factor
    out.push({ km, hours: km / Math.max(1, kmh) })
  }
  return out
}

export function simulate(legs: Leg[], stops: Stop[], R: Rules): Ev[] {
  const ev: Ev[] = []
  let day = 0
  let t = R.dayStart
  let dayDrive = 0, sinceBreak = 0, sinceFuel = 0, km = 0
  const newDay = (leg: number, label: string, depart: string) => {
    const at = t
    day = Math.floor(t / 1440) + 1
    t = day * 1440 + R.dayStart
    ev.push({ kind: 'overnight', t: at, dur: t - at, km, leg, label })
    ev.push({ kind: 'start', t, dur: 0, km, leg, label: depart })
    dayDrive = 0
    sinceBreak = 0
  }
  const GRACE = 15 // minutes: don't stop for a break or the night this close to the next stop
  ev.push({ kind: 'start', t, dur: 0, km: 0, leg: 0, label: stops[0]?.name ?? 'Start' })
  legs.forEach((L, i) => {
    let left = Math.max(0, L.km)
    const speed = L.hours > 0 ? L.km / L.hours : 60
    let guard = 0
    while (left > EPS && guard++ < 1000) {
      const clock = t - Math.floor(t / 1440) * 1440
      const dayLeftH = Math.min(R.maxDayH - dayDrive, (R.dayEnd - clock) / 60)
      const leftMin = (left / speed) * 60
      if (dayLeftH <= EPS) {
        newDay(i, `Overnight between ${stops[i]?.name ?? ''} and ${stops[i + 1]?.name ?? ''}`, 'Continue the drive')
        continue
      }
      const toBreak = (R.breakEveryH - sinceBreak) * speed + (leftMin - (R.breakEveryH - sinceBreak) * 60 < GRACE ? Infinity : 0)
      const toDay = dayLeftH * speed + (leftMin - dayLeftH * 60 < GRACE ? Infinity : 0)
      const toFuel = R.rangeKm - sinceFuel
      const d = Math.max(0, Math.min(left, toBreak, toDay, toFuel))
      const dt = (d / speed) * 60
      if (d > EPS) ev.push({ kind: 'drive', t, dur: dt, km: d, leg: i, label: `${stops[i]?.name ?? ''} → ${stops[i + 1]?.name ?? ''}` })
      t += dt
      km += d
      left -= d
      dayDrive += dt / 60
      sinceBreak += dt / 60
      sinceFuel += d
      if (left <= EPS) break
      if (toFuel <= d + EPS) {
        ev.push({ kind: 'fuel', t, dur: R.fuelMin, km, leg: i, label: 'Fuel stop' })
        t += R.fuelMin
        sinceFuel = 0
        if (R.fuelMin >= R.breakMin) sinceBreak = 0
      } else if (toDay <= d + EPS) {
        newDay(i, `Overnight between ${stops[i]?.name ?? ''} and ${stops[i + 1]?.name ?? ''}`, 'Continue the drive')
      } else if (toBreak <= d + EPS) {
        ev.push({ kind: 'break', t, dur: R.breakMin, km, leg: i, label: 'Driving break' })
        t += R.breakMin
        sinceBreak = 0
      }
    }
    const s = stops[i + 1]
    const last = i === legs.length - 1
    ev.push({ kind: last ? 'end' : 'arrive', t, dur: 0, km, leg: i, label: s?.name ?? `Stop ${i + 2}` })
    if (!last && s) {
      if (s.night) newDay(i + 1, `Overnight in ${s.name}`, `Set off from ${s.name}`)
      else if (s.stayMin > 0) {
        ev.push({ kind: 'stay', t, dur: s.stayMin, km, leg: i + 1, label: `Visit ${s.name}` })
        t += s.stayMin
        if (s.stayMin >= R.breakMin) sinceBreak = 0
      }
    }
  })
  return ev
}

export function summary(ev: Ev[]) {
  const drive = ev.filter((e) => e.kind === 'drive')
  const end = ev.at(-1)
  return {
    km: drive.reduce((a, e) => a + e.km, 0),
    driveMin: drive.reduce((a, e) => a + e.dur, 0),
    breaks: ev.filter((e) => e.kind === 'break').length,
    fuel: ev.filter((e) => e.kind === 'fuel').length,
    nights: ev.filter((e) => e.kind === 'overnight').length,
    days: end ? Math.floor(end.t / 1440) + 1 : 0,
    totalMin: end ? end.t - (ev[0]?.t ?? 0) : 0,
  }
}

/** Point at `dist` km along a polyline (lat/lon pairs), clamped to its ends. */
export function pointAlong(path: Pt[], dist: number): Pt {
  if (!path.length) return { lat: 0, lon: 0 }
  let acc = 0
  for (let i = 1; i < path.length; i++) {
    const seg = haversine(path[i - 1], path[i])
    if (acc + seg >= dist && seg > 0) {
      const f = (dist - acc) / seg
      return { lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * f, lon: path[i - 1].lon + (path[i].lon - path[i - 1].lon) * f }
    }
    acc += seg
  }
  return path[path.length - 1]
}

export const pathKm = (path: Pt[]) => path.reduce((a, p, i) => (i ? a + haversine(path[i - 1], p) : 0), 0)

/** Parses an OSRM /route response (geojson geometry) into legs and a path. */
export function parseOsrm(j: unknown): { legs: Leg[]; path: Pt[] } | null {
  const r = (j as { code?: string; routes?: { legs: { distance: number; duration: number }[]; geometry?: { coordinates: [number, number][] } }[] })
  if (r?.code !== 'Ok' || !r.routes?.length) return null
  const route = r.routes[0]
  return {
    legs: route.legs.map((l) => ({ km: l.distance / 1000, hours: l.duration / 3600 })),
    path: (route.geometry?.coordinates ?? []).map(([lon, lat]) => ({ lat, lon })),
  }
}

export const clock = (t: number) => `${String(Math.floor((t % 1440) / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`
export const dur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min` : `${Math.round(min)} min`)
