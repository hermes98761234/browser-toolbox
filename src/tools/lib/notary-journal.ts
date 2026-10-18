// Notary Journal: entry validation, search, statistics, CSV rows and AES-GCM encryption of the whole
// journal (key derivation reused from the Encrypted Notes Vault: PBKDF2-SHA-256 → AES-256-GCM).
import { b64, deriveKey, ITERATIONS, unb64 } from './encrypted-notes-vault'

export const ACTS = ['Acknowledgment', 'Jurat', 'Oath / affirmation', 'Copy certification', 'Signature witnessing', 'Protest', 'Other'] as const
export const ID_TYPES = ['Driver licence', 'State ID card', 'Passport', 'Military ID', 'Permanent resident card', 'Personally known', 'Credible witness(es)'] as const

export interface Entry {
  id: string
  seq: number
  when: string // yyyy-mm-ddThh:mm
  act: string
  docType: string
  docDate: string
  signer: string
  address: string
  idType: string
  idNumber: string
  idIssuer: string
  idExpiry: string
  witnesses: string
  fee: number
  travelFee: number
  location: string
  remote: boolean
  thumbprint: boolean
  signature: string // data URL (optional)
  notes: string
  created: string
  history: { at: string; change: string }[]
}

export interface Issue { field: keyof Entry | 'general'; msg: string; level: 'error' | 'warn' }

/** Required fields and common mistakes (expired ID, missing witness names, fee over the cap). */
export function validate(e: Entry, feeCap = 0): Issue[] {
  const out: Issue[] = []
  const req: [keyof Entry, string][] = [['when', 'Date and time'], ['act', 'Type of notarial act'], ['docType', 'Document type'], ['signer', 'Signer name'], ['idType', 'Identification method']]
  for (const [f, label] of req) if (!String(e[f] ?? '').trim()) out.push({ field: f, msg: `${label} is required`, level: 'error' })
  const doc = e.idType !== 'Personally known' && e.idType !== 'Credible witness(es)'
  if (doc && !e.idNumber.trim()) out.push({ field: 'idNumber', msg: 'ID number is required for document-based identification', level: 'error' })
  if (doc && e.idExpiry && e.when && e.idExpiry < e.when.slice(0, 10)) out.push({ field: 'idExpiry', msg: 'The ID had expired on the date of the act', level: 'warn' })
  if (e.idType === 'Credible witness(es)' && !e.witnesses.trim()) out.push({ field: 'witnesses', msg: 'Record the credible witness name(s) and how they were identified', level: 'error' })
  if (e.when && e.when.slice(0, 10) > new Date(Date.now() + 864e5).toISOString().slice(0, 10)) out.push({ field: 'when', msg: 'Date is in the future', level: 'warn' })
  if (e.fee < 0 || e.travelFee < 0) out.push({ field: 'fee', msg: 'Fees cannot be negative', level: 'error' })
  if (feeCap > 0 && e.fee > feeCap) out.push({ field: 'fee', msg: `Fee exceeds your state cap of ${feeCap} per act`, level: 'warn' })
  if (e.docDate && e.when && e.docDate > e.when.slice(0, 10)) out.push({ field: 'docDate', msg: 'Document is dated after the notarization', level: 'warn' })
  return out
}

/** Shows only the last 4 characters of an ID number. */
export const maskId = (s: string) => (s.length <= 4 ? s : '•'.repeat(Math.min(8, s.length - 4)) + s.slice(-4))

export const nextSeq = (es: Entry[]) => es.reduce((m, e) => Math.max(m, e.seq), 0) + 1

/** Case-insensitive search over signer, document, act, location, notes and the last 4 ID digits. */
export function search(es: Entry[], q: string, act = '', from = '', to = ''): Entry[] {
  const t = q.trim().toLowerCase()
  return es
    .filter((e) => (!act || e.act === act) && (!from || e.when.slice(0, 10) >= from) && (!to || e.when.slice(0, 10) <= to))
    .filter((e) => !t || [e.signer, e.docType, e.act, e.location, e.notes, e.witnesses, `#${e.seq}`].some((x) => x.toLowerCase().includes(t)) || (t.length >= 3 && e.idNumber.toLowerCase().endsWith(t)))
    .sort((a, b) => b.when.localeCompare(a.when) || b.seq - a.seq)
}

export function stats(es: Entry[], year: string, month: string) {
  const inYear = es.filter((e) => e.when.startsWith(year))
  const byAct = new Map<string, number>()
  for (const e of inYear) byAct.set(e.act, (byAct.get(e.act) ?? 0) + 1)
  return {
    month: es.filter((e) => e.when.startsWith(month)).length,
    year: inYear.length,
    fees: inYear.reduce((a, e) => a + e.fee + e.travelFee, 0),
    remote: inYear.filter((e) => e.remote).length,
    byAct: [...byAct.entries()].sort((a, b) => b[1] - a[1]),
  }
}

/** Describes what changed between two versions of an entry (for the amendment log). */
export function diff(a: Entry, b: Entry): string {
  const skip = new Set(['history', 'signature', 'created'])
  const ch = (Object.keys(b) as (keyof Entry)[]).filter((k) => !skip.has(k) && String(a[k]) !== String(b[k])).map((k) => `${k}: “${String(a[k]).slice(0, 40)}” → “${String(b[k]).slice(0, 40)}”`)
  if (a.signature !== b.signature) ch.push('signature updated')
  return ch.join('; ')
}

export function csvRows(es: Entry[], mask = true): (string | number)[][] {
  return [
    ['No.', 'Date/time', 'Act', 'Document', 'Document date', 'Signer', 'Address', 'ID type', 'ID number', 'ID issuer', 'ID expiry', 'Witnesses', 'Fee', 'Travel fee', 'Location', 'Remote', 'Thumbprint', 'Notes', 'Amendments'],
    ...[...es].sort((a, b) => a.seq - b.seq).map((e) => [e.seq, e.when.replace('T', ' '), e.act, e.docType, e.docDate, e.signer, e.address, e.idType, mask ? maskId(e.idNumber) : e.idNumber, e.idIssuer, e.idExpiry, e.witnesses, e.fee, e.travelFee, e.location, e.remote ? 'yes' : 'no', e.thumbprint ? 'yes' : 'no', e.notes, e.history.length]),
  ]
}

// ---------- encryption ----------

export const ENC_FORMAT = 'bt-notary-journal'
export interface EncBlob { format: typeof ENC_FORMAT; version: 1; kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }; iv: string; ct: string; count: number; saved: string }

const te = new TextEncoder(), td = new TextDecoder()
const AAD = te.encode(ENC_FORMAT + ':v1')

export async function newKey(pass: string, iterations = ITERATIONS): Promise<{ key: CryptoKey; salt: Uint8Array; iterations: number }> {
  if (pass.length < 8) throw new Error('Use a passphrase of at least 8 characters')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { key: await deriveKey(pass, salt, iterations), salt, iterations }
}

export async function sealEntries(k: { key: CryptoKey; salt: Uint8Array; iterations: number }, entries: Entry[]): Promise<EncBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: AAD }, k.key, te.encode(JSON.stringify(entries))))
  return { format: ENC_FORMAT, version: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: k.iterations, salt: b64(k.salt) }, iv: b64(iv), ct: b64(ct), count: entries.length, saved: new Date().toISOString() }
}

export function parseBlob(text: string): EncBlob {
  let v: EncBlob
  try {
    v = JSON.parse(text)
  } catch {
    throw new Error('Not a journal backup (invalid JSON)')
  }
  if (v?.format !== ENC_FORMAT || v.version !== 1 || typeof v.iv !== 'string' || typeof v.ct !== 'string' || typeof v.kdf?.salt !== 'string') throw new Error('Not an encrypted notary journal file')
  if (!(v.kdf.iterations >= 100_000)) throw new Error('Key derivation too weak in this file')
  return v
}

/** Decrypts a blob; returns the entries and the key (so later saves can reuse it). */
export async function openEntries(blob: EncBlob, pass: string): Promise<{ entries: Entry[]; k: { key: CryptoKey; salt: Uint8Array; iterations: number } }> {
  const salt = unb64(blob.kdf.salt)
  const key = await deriveKey(pass, salt, blob.kdf.iterations)
  let pt: ArrayBuffer
  try {
    pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) as BufferSource, additionalData: AAD }, key, unb64(blob.ct) as BufferSource)
  } catch {
    throw new Error('Wrong passphrase, or the file was altered')
  }
  return { entries: JSON.parse(td.decode(pt)) as Entry[], k: { key, salt, iterations: blob.kdf.iterations } }
}

/** Merges imported entries by id (newer `created` wins), renumbering clashes is not needed: seq is kept. */
export function merge(cur: Entry[], add: Entry[]): { entries: Entry[]; added: number } {
  const map = new Map(cur.map((e) => [e.id, e]))
  let added = 0
  for (const e of add) {
    if (!map.has(e.id)) added++
    map.set(e.id, e)
  }
  return { entries: [...map.values()], added }
}
