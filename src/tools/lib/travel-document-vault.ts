// Travel document vault: document records and their scans sealed with AES-256-GCM under a PBKDF2 key
// (crypto primitives shared with the encrypted notes vault). Every record and every file has its own IV and
// its id bound as additional authenticated data. Only ciphertext is ever stored or exported.
import { b64, deriveKey, ITERATIONS, unb64, VaultError, type Sealed } from './encrypted-notes-vault'

export { ITERATIONS, VaultError, type Sealed }
export { strength } from './encrypted-notes-vault'

export const FORMAT = 'btdocvault'

export type DocType = 'passport' | 'visa' | 'id' | 'licence' | 'insurance' | 'vaccination' | 'ticket' | 'booking' | 'other'

export const DOC_TYPES: Record<DocType, { name: string; icon: string; /** warn this many days before the renew-by date */ lead: number; /** months of validity needed beyond travel */ beyond: number; hint: string }> = {
  passport: { name: 'Passport', icon: '🛂', lead: 120, beyond: 6, hint: 'Many countries require 6 months of validity beyond your stay; renewals can take weeks.' },
  visa: { name: 'Visa / permit', icon: '🪪', lead: 45, beyond: 0, hint: 'Check that it covers your whole stay and number of entries.' },
  id: { name: 'ID card', icon: '🆔', lead: 60, beyond: 0, hint: 'Accepted for travel only between some countries.' },
  licence: { name: 'Driving licence', icon: '🚗', lead: 60, beyond: 0, hint: 'Some countries also need an international driving permit.' },
  insurance: { name: 'Travel insurance', icon: '🩺', lead: 21, beyond: 0, hint: 'Make sure the policy covers the whole trip and activities.' },
  vaccination: { name: 'Vaccination record', icon: '💉', lead: 30, beyond: 0, hint: 'Some destinations require proof of certain vaccinations.' },
  ticket: { name: 'Ticket / boarding pass', icon: '🎫', lead: 3, beyond: 0, hint: 'Use the expiry date for the travel date.' },
  booking: { name: 'Booking', icon: '🏨', lead: 3, beyond: 0, hint: 'Hotel, car hire or tour reservations.' },
  other: { name: 'Other', icon: '📄', lead: 30, beyond: 0, hint: '' },
}

export interface FileMeta { id: string; name: string; mime: string; size: number; w?: number; h?: number }
export interface Doc {
  id: string; type: DocType; title: string; holder: string; number: string; country: string
  issued: string; expires: string; notes: string; files: FileMeta[]; updated: string
}
export interface Profile { name: string; birth: string; nationality: string; blood: string; allergies: string; medical: string; contacts: string; insurerPhone: string; embassy: string; tripStart: string; tripEnd: string }

export const EMPTY_PROFILE: Profile = { name: '', birth: '', nationality: '', blood: '', allergies: '', medical: '', contacts: '', insurerPhone: '', embassy: '', tripStart: '', tripEnd: '' }

export interface DocVault {
  format: typeof FORMAT
  version: 1
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  check: Sealed
  profile: Sealed | null
  docs: Record<string, Sealed>
  files: Record<string, Sealed>
  updated: string
}

const enc = new TextEncoder(), dec = new TextDecoder()
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n))
const CHECK = 'browser-toolbox travel vault v1'

export async function sealBytes(key: CryptoKey, data: Uint8Array, aad: string): Promise<Sealed> {
  const iv = rand(12)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(aad) }, key, data as BufferSource))
  return { iv: b64(iv), ct: b64(ct) }
}
export async function openBytes(key: CryptoKey, s: Sealed, aad: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) as BufferSource, additionalData: enc.encode(aad) }, key, unb64(s.ct) as BufferSource))
}
const sealJson = (key: CryptoKey, v: unknown, aad: string) => sealBytes(key, enc.encode(JSON.stringify(v)), aad)
const openJson = async <T>(key: CryptoKey, s: Sealed, aad: string) => JSON.parse(dec.decode(await openBytes(key, s, aad))) as T

export const sealDoc = (key: CryptoKey, d: Doc) => sealJson(key, d, `doc:${d.id}`)
export const sealProfile = (key: CryptoKey, p: Profile) => sealJson(key, p, 'profile')
export const sealFile = (key: CryptoKey, id: string, bytes: Uint8Array) => sealBytes(key, bytes, `file:${id}`)
export const openFile = (key: CryptoKey, v: DocVault, id: string) => {
  const s = v.files[id]
  if (!s) throw new VaultError('File is missing from the vault')
  return openBytes(key, s, `file:${id}`)
}

export async function createVault(pass: string, iterations = ITERATIONS): Promise<{ vault: DocVault; key: CryptoKey }> {
  if (pass.length < 8) throw new VaultError('Use a passphrase of at least 8 characters')
  const salt = rand(16)
  const key = await deriveKey(pass, salt, iterations)
  const vault: DocVault = { format: FORMAT, version: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: b64(salt) }, check: await sealJson(key, CHECK, 'check'), profile: null, docs: {}, files: {}, updated: new Date().toISOString() }
  return { vault, key }
}

export async function unlock(v: DocVault, pass: string): Promise<{ key: CryptoKey; docs: Doc[]; profile: Profile | null; failed: string[] }> {
  const key = await deriveKey(pass, unb64(v.kdf.salt), v.kdf.iterations)
  try {
    if ((await openJson<string>(key, v.check, 'check')) !== CHECK) throw new Error()
  } catch {
    throw new VaultError('Wrong passphrase (or the vault was modified)')
  }
  const docs: Doc[] = [], failed: string[] = []
  for (const [id, s] of Object.entries(v.docs)) {
    try {
      const d = await openJson<Doc>(key, s, `doc:${id}`)
      if (d.id !== id) throw new Error()
      docs.push(d)
    } catch { failed.push(id) }
  }
  let profile: Profile | null = null
  if (v.profile) { try { profile = await openJson<Profile>(key, v.profile, 'profile') } catch { failed.push('profile') } }
  return { key, docs, profile, failed }
}

/** Re-encrypts all records and files under a new passphrase (new salt and IVs). */
export async function rekey(v: DocVault, oldKey: CryptoKey, docs: Doc[], profile: Profile | null, newPass: string, iterations = ITERATIONS): Promise<{ vault: DocVault; key: CryptoKey }> {
  const { vault, key } = await createVault(newPass, iterations)
  for (const d of docs) {
    vault.docs[d.id] = await sealDoc(key, d)
    for (const f of d.files) if (v.files[f.id]) vault.files[f.id] = await sealFile(key, f.id, await openFile(oldKey, v, f.id))
  }
  if (profile) vault.profile = await sealProfile(key, profile)
  return { vault, key }
}

export function parseVault(text: string, minIterations = ITERATIONS): DocVault {
  let v: DocVault
  try { v = JSON.parse(text) } catch { throw new VaultError('Not a JSON file') }
  const ok = (s: unknown) => !!s && typeof (s as Sealed).iv === 'string' && typeof (s as Sealed).ct === 'string'
  if (!v || v.format !== FORMAT || v.version !== 1) throw new VaultError('Not a travel document vault backup')
  if (v.kdf?.name !== 'PBKDF2' || v.kdf.hash !== 'SHA-256' || typeof v.kdf.salt !== 'string') throw new VaultError('Unsupported key derivation settings')
  if (!(v.kdf.iterations >= minIterations)) throw new VaultError(`Backup uses only ${v.kdf.iterations} PBKDF2 iterations`)
  if (!ok(v.check) || (v.profile !== null && !ok(v.profile)) || typeof v.docs !== 'object' || typeof v.files !== 'object' || ![...Object.values(v.docs), ...Object.values(v.files)].every(ok)) throw new VaultError('Backup file is damaged')
  return v
}

/** Removes ciphertext of files that no document references any more. */
export function pruneFiles(v: DocVault, docs: Doc[]): DocVault {
  const keep = new Set(docs.flatMap((d) => d.files.map((f) => f.id)))
  return { ...v, files: Object.fromEntries(Object.entries(v.files).filter(([id]) => keep.has(id))) }
}

// ---------- expiry logic (dates are YYYY-MM-DD) ----------

export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10)
}
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
export function daysUntil(from: string, to: string): number {
  const [a, b] = [from, to].map((s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) })
  return Math.round((b - a) / 86400000)
}

export type Status = 'expired' | 'renew' | 'soon' | 'ok' | 'none'
export interface Expiry { status: Status; renewBy: string; days: number; message: string }

/**
 * Status of a document on `today`. renewBy = expiry minus the months of validity a destination may demand
 * (6 for passports). With a trip end date, a passport must stay valid for those months after the trip.
 */
export function expiry(d: Pick<Doc, 'type' | 'expires'>, today: string, tripEnd = ''): Expiry {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.expires)) return { status: 'none', renewBy: '', days: Infinity, message: 'No expiry date' }
  const t = DOC_TYPES[d.type]
  const renewBy = addMonths(d.expires, -t.beyond)
  const days = daysUntil(today, d.expires)
  const event = d.type === 'ticket' || d.type === 'booking'
  const toRenew = daysUntil(today, renewBy)
  if (days < 0) return { status: 'expired', renewBy, days, message: event ? `Past (${-days} days ago)` : `Expired ${-days} days ago` }
  if (tripEnd && t.beyond && daysUntil(tripEnd, renewBy) < 0) return { status: 'renew', renewBy, days, message: `Not valid ${t.beyond} months beyond your trip (needs validity to ${addMonths(tripEnd, t.beyond)})` }
  if (toRenew < 0) return { status: 'renew', renewBy, days, message: `Inside the ${t.beyond}-month window: renew now (${days} days of validity left)` }
  if (tripEnd && !event && daysUntil(tripEnd, d.expires) < 0) return { status: 'renew', renewBy, days, message: 'Expires before your trip ends' }
  if (toRenew <= t.lead) return { status: 'soon', renewBy, days, message: event ? `In ${days} days` : `Renew by ${renewBy} (${toRenew} days)` }
  return { status: 'ok', renewBy, days, message: event ? `In ${days} days` : t.beyond ? `Valid; renew by ${renewBy}` : `Valid for ${days} days` }
}

export const STATUS_COLOR: Record<Status, string> = { expired: '#ef4444', renew: '#f97316', soon: '#f59e0b', ok: '#10b981', none: '#64748b' }

/** Masks a document number for the card view: keeps the last 4 characters. */
export const mask = (s: string) => (s.length <= 4 ? s : '•'.repeat(Math.min(6, s.length - 4)) + s.slice(-4))
