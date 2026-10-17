// Field counting + batch summary for the one-click EXIF remover.
import type { Tag } from './exif-viewer'
import type { Block } from './metadata-stripper'

/** Blocks that hold no personal data and are kept (colour profile). */
const NEUTRAL = /^ICC profile$/

/**
 * Number of metadata "fields" a viewer would see: every parsed EXIF/GPS tag, plus one for each
 * non-EXIF metadata block (XMP packet, IPTC record, comment, PNG text chunk …).
 */
export function countFields(tags: Tag[], blocks: Block[]): number {
  const extra = blocks.filter((b) => b.kind !== 'EXIF' && !NEUTRAL.test(b.kind)).length
  return tags.length + extra
}

export interface Result { fieldsBefore: number; fieldsAfter: number; gps: boolean; bytesBefore: number; bytesAfter: number }

export function summarize(rs: Result[]) {
  const s = { photos: rs.length, removed: 0, gps: 0, before: 0, after: 0, clean: 0 }
  for (const r of rs) {
    s.removed += Math.max(0, r.fieldsBefore - r.fieldsAfter)
    if (r.gps) s.gps++
    s.before += r.bytesBefore
    s.after += r.bytesAfter
    if (r.fieldsAfter <= 1) s.clean++
  }
  return s
}

/** "IMG_1.jpg" → "IMG_1-clean.jpg" (re-encoded PNG keeps the new extension). */
export function cleanName(name: string, ext?: string): string {
  const m = /^(.*?)(\.[^.]+)?$/.exec(name)!
  return `${m[1] || 'photo'}-clean${ext ?? m[2] ?? ''}`
}

export const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`)
