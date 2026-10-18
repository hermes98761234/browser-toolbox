// Encrypted notes vault: PBKDF2-SHA-256 (600k iterations) → AES-256-GCM key; every note sealed separately
// with its own random 96-bit IV and its id bound as additional authenticated data. Only ciphertext is stored.

export const ITERATIONS = 600_000
export const FORMAT = 'btvault'

export interface Note { id: string; title: string; body: string; tags: string[]; created: string; updated: string; pinned: boolean }
export interface Sealed { iv: string; ct: string }
export interface Vault {
  format: typeof FORMAT
  version: 1
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  /** Encrypted known value used to verify the passphrase. */
  check: Sealed
  notes: Record<string, Sealed>
  updated: string
}

export class VaultError extends Error {}

const enc = new TextEncoder(), dec = new TextDecoder()
export const b64 = (b: Uint8Array) => { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s) }
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n))
const CHECK = 'browser-toolbox vault check v1'

export async function deriveKey(pass: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function seal(key: CryptoKey, text: string, aad: string): Promise<Sealed> {
  const iv = rand(12)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: enc.encode(aad) }, key, enc.encode(text)))
  return { iv: b64(iv), ct: b64(ct) }
}

async function open(key: CryptoKey, s: Sealed, aad: string): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) as BufferSource, additionalData: enc.encode(aad) }, key, unb64(s.ct) as BufferSource)
  return dec.decode(pt)
}

export const sealNote = (key: CryptoKey, n: Note) => seal(key, JSON.stringify(n), `note:${n.id}`)
export async function openNote(key: CryptoKey, id: string, s: Sealed): Promise<Note> {
  const n = JSON.parse(await open(key, s, `note:${id}`)) as Note
  if (n.id !== id) throw new VaultError('Note id mismatch')
  return n
}

export async function createVault(pass: string, notes: Note[] = []): Promise<{ vault: Vault; key: CryptoKey }> {
  if (pass.length < 8) throw new VaultError('Use a passphrase of at least 8 characters')
  const salt = rand(16)
  const key = await deriveKey(pass, salt, ITERATIONS)
  const vault: Vault = { format: FORMAT, version: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64(salt) }, check: await seal(key, CHECK, 'check'), notes: {}, updated: new Date().toISOString() }
  for (const n of notes) vault.notes[n.id] = await sealNote(key, n)
  return { vault, key }
}

/** Derives the key, verifies the passphrase and decrypts every note. */
export async function unlock(v: Vault, pass: string): Promise<{ key: CryptoKey; notes: Note[]; failed: string[] }> {
  const key = await deriveKey(pass, unb64(v.kdf.salt), v.kdf.iterations)
  try {
    if ((await open(key, v.check, 'check')) !== CHECK) throw new Error()
  } catch {
    throw new VaultError('Wrong passphrase (or the vault was modified)')
  }
  const notes: Note[] = [], failed: string[] = []
  for (const [id, s] of Object.entries(v.notes)) {
    try { notes.push(await openNote(key, id, s)) } catch { failed.push(id) }
  }
  return { key, notes, failed }
}

/** Re-encrypts everything under a new passphrase (new salt, new key, new IVs). */
export async function changePassphrase(notes: Note[], newPass: string): Promise<{ vault: Vault; key: CryptoKey }> {
  return createVault(newPass, notes)
}

export function parseVault(text: string): Vault {
  let v: Vault
  try { v = JSON.parse(text) } catch { throw new VaultError('Not a JSON file') }
  const okSealed = (s: unknown) => !!s && typeof (s as Sealed).iv === 'string' && typeof (s as Sealed).ct === 'string'
  if (!v || v.format !== FORMAT || v.version !== 1) throw new VaultError('Not an encrypted notes vault backup')
  if (v.kdf?.name !== 'PBKDF2' || v.kdf.hash !== 'SHA-256' || typeof v.kdf.salt !== 'string') throw new VaultError('Unsupported key derivation settings')
  if (!(v.kdf.iterations >= ITERATIONS)) throw new VaultError(`Backup uses only ${v.kdf.iterations} PBKDF2 iterations; at least ${ITERATIONS} are required`)
  if (!okSealed(v.check) || typeof v.notes !== 'object' || !Object.values(v.notes).every(okSealed)) throw new VaultError('Backup file is damaged')
  return v
}

/** Rough passphrase strength in bits (character pool × length, words count more for spaced passphrases). */
export function strength(p: string): { bits: number; label: string } {
  let pool = 0
  if (/[a-z]/.test(p)) pool += 26
  if (/[A-Z]/.test(p)) pool += 26
  if (/\d/.test(p)) pool += 10
  if (/[^a-zA-Z0-9]/.test(p)) pool += 33
  const words = p.trim().split(/\s+/).filter((w) => w.length >= 3).length
  const bits = Math.max(p.length * Math.log2(pool || 1) * (/(.)\1{2,}/.test(p) ? 0.6 : 1), words >= 4 ? words * 11 : 0)
  return { bits, label: bits < 40 ? 'weak' : bits < 60 ? 'fair' : bits < 80 ? 'strong' : 'very strong' }
}

export function sampleNotes(): Note[] {
  const now = Date.now()
  const at = (h: number) => new Date(now - h * 3600_000).toISOString()
  const mk = (i: number, title: string, body: string, tags: string[], h: number, pinned = false): Note => ({ id: `demo${i}`, title, body, tags, created: at(h + 30), updated: at(h), pinned })
  return [
    mk(1, 'Welcome to your vault', 'Everything here is encrypted with AES-256-GCM before it touches storage.\n\n• Notes are sealed one by one with a fresh random IV on every save.\n• The key comes from your passphrase via PBKDF2-SHA-256 with 600,000 iterations.\n• Lock the vault (or wait for auto-lock) and only ciphertext remains.\n\nExport an encrypted backup now and then — if you forget the passphrase, nobody can recover the notes.', ['tips'], 1, true),
    mk(2, 'Wi-Fi for guests', 'Network: Garden-Guest\nPassword: (write yours here)\nRouter admin page: 192.168.1.1', ['home'], 20),
    mk(3, 'Gift ideas', '- Mum: pottery class voucher\n- Leo: the blue headphones he liked\n- Sam: board game night kit', ['personal'], 50),
    mk(4, 'Project ideas', 'A tiny weather station on the balcony that logs temperature and humidity every 10 minutes.', ['ideas'], 90),
  ]
}
