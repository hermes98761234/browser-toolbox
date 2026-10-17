// Learner driver log: splits a session into daytime and night-time minutes using the NOAA solar
// position (night = sun below the horizon, i.e. between sunset and sunrise) and sums progress.
import { sunPosition } from './sunrise-sunset-planner'

export const SUNRISE_ANGLE = -0.833

/** Minutes of daylight vs night for [start, end) (UTC ms) at a location, sampled each minute. */
export function dayNight(start: number, end: number, lat: number, lon: number): { day: number; night: number } {
  let day = 0, night = 0
  const step = 60000
  for (let t = start; t < end; t += step) {
    const w = Math.min(step, end - t) / 60000
    if (sunPosition(t + Math.min(step, end - t) / 2, lat, lon).elevation < SUNRISE_ANGLE) night += w
    else day += w
  }
  return { day, night }
}

export interface Session { id: string; start: number; end: number; supervisor: string; road: string; weather: string; km: number; notes: string; day: number; night: number }

export interface Requirement { name: string; total: number; night: number }
export const REQUIREMENTS: Requirement[] = [
  { name: 'Custom', total: 50, night: 10 },
  { name: 'California (US) — 50 h incl. 10 night', total: 50, night: 10 },
  { name: 'New York (US) — 50 h incl. 15 night', total: 50, night: 15 },
  { name: 'Texas (US) — 30 h incl. 10 night', total: 30, night: 10 },
  { name: 'Victoria (AU) — 120 h incl. 20 night', total: 120, night: 20 },
  { name: 'New South Wales (AU) — 120 h incl. 20 night', total: 120, night: 20 },
  { name: 'Queensland (AU) — 100 h incl. 10 night', total: 100, night: 10 },
]

export function progress(sessions: Session[], req: { total: number; night: number }) {
  const day = sessions.reduce((a, s) => a + s.day, 0)
  const night = sessions.reduce((a, s) => a + s.night, 0)
  const total = day + night
  const totalLeft = Math.max(0, req.total * 60 - total)
  const nightLeft = Math.max(0, req.night * 60 - night)
  return { day, night, total, totalLeft, nightLeft, km: sessions.reduce((a, s) => a + (s.km || 0), 0), done: totalLeft === 0 && nightLeft === 0 }
}

export const hm = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`
