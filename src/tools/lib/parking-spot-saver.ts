export { bearing, compass, haversine } from './dog-walk-tracker'

/** Remaining meter time split into parts; negative when expired. */
export function meterLeft(end: number, now: number): { ms: number; expired: boolean; text: string } {
  const ms = end - now
  const a = Math.abs(ms)
  const h = Math.floor(a / 3_600_000)
  const m = Math.floor((a % 3_600_000) / 60_000)
  const s = Math.floor((a % 60_000) / 1000)
  const text = `${ms < 0 ? '−' : ''}${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(s).padStart(2, '0')}`
  return { ms, expired: ms <= 0, text }
}

/** Walking time at ~1.35 m/s (4.9 km/h), with a 1.25 detour factor for streets vs straight line. */
export const walkMinutes = (metres: number) => (metres * 1.25) / 1.35 / 60

/** iCalendar reminder (UTC) that alarms `warnMin` minutes before the meter runs out. */
export function meterIcs(end: number, warnMin: number, where: string, stamp: number): string {
  const f = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Parking Spot Saver//EN', 'BEGIN:VEVENT',
    `UID:parking-${end}@browser-toolbox`, `DTSTAMP:${f(stamp)}`, `DTSTART:${f(end - warnMin * 60_000)}`, `DTEND:${f(end)}`,
    'SUMMARY:🅿 Parking meter runs out', `DESCRIPTION:${where.replace(/[,;\\]/g, (m) => '\\' + m).replace(/\n/g, '\\n')}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Parking meter', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n')
}
