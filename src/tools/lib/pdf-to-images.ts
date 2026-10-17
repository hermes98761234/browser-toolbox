// Pure helpers for PDF To Images: page selection, pixel sizes and output names.

/** Parses "all", "1-3, 5, 8-", "-2", "odd", "even" into sorted unique 1-based page numbers. */
export function parsePages(spec: string, total: number): { pages: number[]; errors: string[] } {
  const set = new Set<number>()
  const errors: string[] = []
  const t = spec.trim().toLowerCase()
  if (!t || t === 'all') return { pages: Array.from({ length: total }, (_, i) => i + 1), errors }
  for (const raw of t.split(/[,;\s]+/).filter(Boolean)) {
    if (raw === 'all') for (let i = 1; i <= total; i++) set.add(i)
    else if (raw === 'odd' || raw === 'even') for (let i = raw === 'odd' ? 1 : 2; i <= total; i += 2) set.add(i)
    else {
      const m = /^(\d*)-(\d*)$/.exec(raw)
      const a = m ? (m[1] ? +m[1] : 1) : +raw
      const b = m ? (m[2] ? +m[2] : total) : +raw
      if (!Number.isInteger(a) || !Number.isInteger(b) || (m && !m[1] && !m[2])) {
        errors.push(`"${raw}" is not a page or range`)
        continue
      }
      const lo = Math.min(a, b), hi = Math.max(a, b)
      if (lo < 1 || hi > total) errors.push(`"${raw}" is outside 1–${total}`)
      for (let i = Math.max(1, lo); i <= Math.min(total, hi); i++) set.add(i)
    }
  }
  return { pages: [...set].sort((x, y) => x - y), errors }
}

/** PDF user space is 72 units per inch, so pixels = points × dpi / 72. */
export function pixelSize(wPt: number, hPt: number, dpi: number): [number, number] {
  return [Math.max(1, Math.round((wPt * dpi) / 72)), Math.max(1, Math.round((hPt * dpi) / 72))]
}

/** Largest DPI whose page keeps under a canvas pixel budget (browsers cap canvas area). */
export function safeDpi(wPt: number, hPt: number, dpi: number, maxPixels = 40_000_000): number {
  const [w, h] = pixelSize(wPt, hPt, dpi)
  if (w * h <= maxPixels) return dpi
  return Math.floor(dpi * Math.sqrt(maxPixels / (w * h)))
}

export function outName(base: string, page: number, total: number, ext: string): string {
  const clean = base.replace(/\.pdf$/i, '').replace(/[^\w.-]+/g, '_') || 'document'
  return `${clean}-p${String(page).padStart(String(total).length, '0')}.${ext}`
}
