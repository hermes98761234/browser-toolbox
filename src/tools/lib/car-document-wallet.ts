// Car document wallet: vehicles, their documents, expiry/renewal status (by date and odometer),
// renewal calendar export and optional whole-wallet encryption (AES-256-GCM under a PBKDF2 key,
// reusing the vault crypto primitives).
import { b64, deriveKey, ITERATIONS, unb64, VaultError } from './encrypted-notes-vault'
import { openBytes, sealBytes, type Sealed } from './travel-document-vault'

export { ITERATIONS, VaultError }

export type DocType = 'insurance' | 'registration' | 'inspection' | 'service' | 'warranty' | 'roadside' | 'licence' | 'loan' | 'other'
export const DOC_TYPES: Record<DocType, { name: string; icon: string; lead: number }> = {
  insurance: { name: 'Insurance', icon: '🛡️', lead: 30 },
  registration: { name: 'Registration / road tax', icon: '🪪', lead: 30 },
  inspection: { name: 'Inspection / MOT / TÜV', icon: '🔧', lead: 30 },
  service: { name: 'Service receipt / next service', icon: '🧾', lead: 21 },
  warranty: { name: 'Warranty', icon: '📜', lead: 60 },
  roadside: { name: 'Roadside assistance', icon: '🚨', lead: 14 },
  licence: { name: 'Driving licence', icon: '🚗', lead: 60 },
  loan: { name: 'Loan / lease', icon: '🏦', lead: 60 },
  other: { name: 'Other', icon: '📄', lead: 30 },
}

export interface FileRef { id: string; name: string; mime: string; data: string } // data URL
export interface Vehicle { id: string; name: string; make: string; model: string; year: number; plate: string; vin: string; odometer: number; unit: 'km' | 'mi' }
export interface CarDoc {
  id: string; vehicle: string; type: DocType; title: string; provider: string; number: string
  issued: string; expires: string; dueOdo: number; cost: number; notes: string; files: FileRef[]
}
export interface Wallet { vehicles: Vehicle[]; docs: CarDoc[] }

const DAY = 86400000
const parse = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
export const addDays = (s: string, n: number) => new Date(parse(s) + n * DAY).toISOString().slice(0, 10)
export const daysUntil = (from: string, to: string) => Math.round((parse(to) - parse(from)) / DAY)

export type Status = 'expired' | 'renew' | 'soon' | 'ok' | 'none'
export const STATUS: Record<Status, { label: string; color: string }> = {
  expired: { label: 'Expired', color: '#ef4444' }, renew: { label: 'Renew now', color: '#f97316' }, soon: { label: 'Coming up', color: '#eab308' },
  ok: { label: 'Valid', color: '#10b981' }, none: { label: 'No expiry', color: '#64748b' },
}
export interface Expiry { status: Status; days: number | null; kmLeft: number | null; renewBy: string; text: string }

/** Status from the expiry date (renew window = type lead time; "soon" = within 3× lead) and an optional odometer due reading. */
export function expiry(d: Pick<CarDoc, 'type' | 'expires' | 'dueOdo'>, today: string, odometer = 0): Expiry {
  const lead = DOC_TYPES[d.type].lead
  const days = d.expires ? daysUntil(today, d.expires) : null
  const kmLeft = d.dueOdo > 0 ? d.dueOdo - odometer : null
  const rank = (s: Status) => ['expired', 'renew', 'soon', 'ok', 'none'].indexOf(s)
  let byDate: Status = 'none', byKm: Status = 'none'
  if (days !== null) byDate = days < 0 ? 'expired' : days <= lead ? 'renew' : days <= lead * 3 ? 'soon' : 'ok'
  if (kmLeft !== null) byKm = kmLeft <= 0 ? 'expired' : kmLeft <= 1000 ? 'renew' : kmLeft <= 3000 ? 'soon' : 'ok'
  const status = rank(byDate) <= rank(byKm) ? byDate : byKm
  const parts: string[] = []
  if (days !== null) parts.push(days < 0 ? `expired ${-days} d ago` : days === 0 ? 'expires today' : `${days} d left`)
  if (kmLeft !== null) parts.push(kmLeft <= 0 ? `${-kmLeft} over` : `${kmLeft} to go`)
  return { status, days, kmLeft, renewBy: d.expires ? addDays(d.expires, -lead) : '', text: parts.join(' · ') || 'no expiry' }
}

const esc = (s: string) => s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n')
/** Renewal reminders (all-day, with a morning alarm) and expiry days for every dated document. */
export function toIcs(w: Wallet, stamp: string): string {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Browser Toolbox//Car Document Wallet//EN', 'CALSCALE:GREGORIAN']
  const ev = (uid: string, date: string, title: string, desc: string) => {
    L.push('BEGIN:VEVENT', `UID:${uid}@browser-toolbox-car-wallet`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(date, 1).replace(/-/g, '')}`, `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(desc)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT9H', `DESCRIPTION:${esc(title)}`, 'END:VALARM', 'END:VEVENT')
  }
  for (const d of w.docs) {
    if (!d.expires) continue
    const v = w.vehicles.find((x) => x.id === d.vehicle)
    const car = v ? `${v.name}${v.plate ? ` (${v.plate})` : ''}` : 'vehicle'
    const t = DOC_TYPES[d.type]
    const desc = [d.title, d.provider && `Provider: ${d.provider}`, d.number && `Ref: ${d.number}`].filter(Boolean).join('\n')
    ev(`${d.id}-renew`, addDays(d.expires, -t.lead), `Renew ${t.name.toLowerCase()} — ${car}`, `${desc}\nExpires ${d.expires}`)
    ev(`${d.id}-exp`, d.expires, `${t.name} expires — ${car}`, desc)
  }
  L.push('END:VCALENDAR')
  return L.join('\r\n') + '\r\n'
}

// ---------- encryption ----------
export const FORMAT = 'btcarwallet'
export interface SealedWallet { format: typeof FORMAT; version: 1; kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }; data: Sealed; updated: string }
const enc = new TextEncoder(), dec = new TextDecoder()
const AAD = 'car-wallet:v1'

export async function sealWallet(w: Wallet, key: CryptoKey, salt: string, iterations: number): Promise<SealedWallet> {
  return { format: FORMAT, version: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt }, data: await sealBytes(key, enc.encode(JSON.stringify(w)), AAD), updated: new Date().toISOString() }
}
export async function newKey(pass: string, iterations = ITERATIONS): Promise<{ key: CryptoKey; salt: string }> {
  if (pass.length < 8) throw new VaultError('Use a passphrase of at least 8 characters')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { key: await deriveKey(pass, salt, iterations), salt: b64(salt) }
}
export async function unlockWallet(v: SealedWallet, pass: string): Promise<{ key: CryptoKey; wallet: Wallet }> {
  const key = await deriveKey(pass, unb64(v.kdf.salt), v.kdf.iterations)
  try {
    const wallet = JSON.parse(dec.decode(await openBytes(key, v.data, AAD))) as Wallet
    return { key, wallet }
  } catch {
    throw new VaultError('Wrong passphrase (or the wallet was modified)')
  }
}
export function isSealed(x: unknown): x is SealedWallet {
  const v = x as SealedWallet
  return !!v && v.format === FORMAT && v.version === 1 && typeof v.kdf?.salt === 'string' && v.kdf.iterations >= 1000 && typeof v.data?.iv === 'string' && typeof v.data?.ct === 'string'
}
export const isWallet = (x: unknown): x is Wallet => !!x && Array.isArray((x as Wallet).vehicles) && Array.isArray((x as Wallet).docs)
