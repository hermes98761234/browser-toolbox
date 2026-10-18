// Journal storage with optional encryption: PBKDF2-SHA256 derives an AES-256-GCM key from the
// passphrase; every entry is sealed separately with its own random 96-bit IV. Only the entry date
// stays readable (to draw the calendar). A sealed verifier detects a wrong passphrase.

export interface Entry { id: string; date: string; mood: number; tags: string[]; prompt: string; text: string; updated: string }
export interface Box { iv: string; ct: string }
export interface Vault { v: 1; salt: string; iter: number; check: Box; items: { id: string; date: string; box: Box }[] }

const enc = new TextEncoder()
const dec = new TextDecoder()
export const b64 = (u: Uint8Array) => {
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export async function deriveKey(pass: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function seal(key: CryptoKey, value: unknown): Promise<Box> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value))))
  return { iv: b64(iv), ct: b64(ct) }
}

export async function unseal<T>(key: CryptoKey, box: Box): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) as BufferSource }, key, unb64(box.ct) as BufferSource)
  return JSON.parse(dec.decode(pt)) as T
}

const CHECK = 'journal-vault-ok'

export async function createVault(pass: string, entries: Entry[], iter = 600000): Promise<{ vault: Vault; key: CryptoKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(pass, salt, iter)
  const items = await Promise.all(entries.map(async (e) => ({ id: e.id, date: e.date, box: await seal(key, e) })))
  return { vault: { v: 1, salt: b64(salt), iter, check: await seal(key, CHECK), items }, key }
}

/** Throws Error('wrong passphrase') when the verifier does not decrypt. */
export async function openVault(pass: string, vault: Vault): Promise<{ key: CryptoKey; entries: Entry[] }> {
  const key = await deriveKey(pass, unb64(vault.salt), vault.iter)
  try {
    if ((await unseal<string>(key, vault.check)) !== CHECK) throw new Error()
  } catch {
    throw new Error('wrong passphrase')
  }
  const entries = await Promise.all(vault.items.map((i) => unseal<Entry>(key, i.box)))
  return { key, entries }
}

export async function putItem(vault: Vault, key: CryptoKey, e: Entry): Promise<Vault> {
  const box = await seal(key, e)
  const items = vault.items.filter((i) => i.id !== e.id)
  return { ...vault, items: [...items, { id: e.id, date: e.date, box }].sort((a, b) => a.date.localeCompare(b.date)) }
}

/** Rough passphrase strength in bits (character pool × length), capped for word-like inputs. */
export function strength(p: string): number {
  if (!p) return 0
  let pool = 0
  if (/[a-z]/.test(p)) pool += 26
  if (/[A-Z]/.test(p)) pool += 26
  if (/\d/.test(p)) pool += 10
  if (/[^a-zA-Z0-9]/.test(p)) pool += 33
  const uniq = new Set(p).size
  return Math.round(Math.log2(pool) * Math.min(p.length, uniq * 2))
}

export const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0)

/** Consecutive days with an entry, ending today or yesterday. */
export function streak(dates: string[], today: string): number {
  const set = new Set(dates)
  const step = (d: string) => new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)
  let d = set.has(today) ? today : step(today)
  let n = 0
  while (set.has(d)) {
    n++
    d = step(d)
  }
  return n
}

/** Deterministic prompt index for a date (rotates through the list). */
export function promptIndex(date: string, n: number): number {
  const days = Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000)
  return ((days % n) + n) % n
}
