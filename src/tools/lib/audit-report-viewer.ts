// Audit Report Viewer: parses Lighthouse JSON reports (v10+ layout, also the PageSpeed Insights
// API wrapper) into scores, metrics, opportunities sorted by estimated savings, and diagnostics.

type Json = any

export interface Cat { id: string; title: string; score: number | null; failing: Item[]; passed: number; manual: number }
export interface Metric { id: string; short: string; title: string; value: number; unit: string; display: string; score: number | null; weight: number }
export interface Item { id: string; title: string; description: string; score: number | null; display: string; savingsMs: number; savingsBytes: number; rows: Record<string, unknown>[]; headings: { key: string; label: string; type: string }[] }
export interface Report { url: string; version: string; fetchTime: string; formFactor: string; categories: Cat[]; metrics: Metric[]; opportunities: Item[]; diagnostics: Item[]; runWarnings: string[]; totalMs: number }

const METRICS: [string, string][] = [
  ['first-contentful-paint', 'FCP'], ['largest-contentful-paint', 'LCP'], ['total-blocking-time', 'TBT'], ['cumulative-layout-shift', 'CLS'], ['speed-index', 'SI'], ['interactive', 'TTI'], ['max-potential-fid', 'Max FID'],
]

/** Removes Markdown links/backticks from Lighthouse descriptions. */
export const plain = (s: string) => (s ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`/g, '')

/** 0–1 score → status colour bucket used by Lighthouse (≥ 0.9 pass, ≥ 0.5 average, else fail). */
export const bucket = (s: number | null | undefined): 'pass' | 'average' | 'fail' | 'na' => (s === null || s === undefined ? 'na' : s >= 0.9 ? 'pass' : s >= 0.5 ? 'average' : 'fail')

function item(id: string, a: Json): Item {
  const d = a.details ?? {}
  const ms = Object.entries(a.metricSavings ?? {}).filter(([k]) => k !== 'CLS').map(([, v]) => Number(v) || 0)
  const savingsMs = Number(d.overallSavingsMs) || (ms.length ? Math.max(...ms) : 0)
  const headings = (d.headings ?? []).map((h: Json) => ({ key: h.key ?? h.valueType ?? '', label: typeof h.label === 'string' ? h.label : (h.text ?? h.key ?? ''), type: h.valueType ?? h.itemType ?? 'text' })).filter((h: { key: string }) => h.key)
  return { id, title: a.title ?? id, description: plain(a.description ?? ''), score: typeof a.score === 'number' ? a.score : null, display: a.displayValue ?? '', savingsMs, savingsBytes: Number(d.overallSavingsBytes) || 0, rows: Array.isArray(d.items) ? d.items.slice(0, 50) : [], headings }
}

export function parseReport(input: unknown): Report {
  let lhr: Json = input
  if (lhr && lhr.lighthouseResult) lhr = lhr.lighthouseResult
  if (!lhr || typeof lhr !== 'object' || !lhr.audits || !lhr.categories) throw new Error('This is not a Lighthouse JSON report (missing "audits" / "categories").')
  const audits: Json = lhr.audits
  const categories: Cat[] = Object.entries(lhr.categories as Record<string, Json>).map(([id, c]) => {
    const refs: Json[] = c.auditRefs ?? []
    const failing: Item[] = []
    let passed = 0, manual = 0
    for (const r of refs) {
      const a = audits[r.id]
      if (!a || r.group === 'metrics' || r.group === 'hidden') continue
      if (a.scoreDisplayMode === 'manual') manual++
      else if (a.scoreDisplayMode === 'notApplicable' || a.scoreDisplayMode === 'informative') continue
      else if (typeof a.score === 'number' && a.score >= 0.9) passed++
      else failing.push(item(r.id, a))
    }
    failing.sort((x, y) => (x.score ?? 1) - (y.score ?? 1))
    return { id, title: c.title ?? id, score: typeof c.score === 'number' ? c.score : null, failing, passed, manual }
  })
  const perfRefs: Json[] = lhr.categories.performance?.auditRefs ?? []
  const weightOf = (id: string) => Number(perfRefs.find((r) => r.id === id)?.weight) || 0
  const metrics: Metric[] = METRICS.filter(([id]) => audits[id]).map(([id, short]) => {
    const a = audits[id]
    return { id, short, title: a.title ?? short, value: Number(a.numericValue) || 0, unit: a.numericUnit ?? '', display: a.displayValue ?? '', score: typeof a.score === 'number' ? a.score : null, weight: weightOf(id) }
  })
  const perfIds = new Set(perfRefs.map((r) => r.id))
  const opportunities: Item[] = []
  const diagnostics: Item[] = []
  for (const [id, a] of Object.entries(audits as Record<string, Json>)) {
    if (METRICS.some(([m]) => m === id)) continue
    if (perfRefs.length && !perfIds.has(id)) continue
    if (a.scoreDisplayMode === 'notApplicable' || a.scoreDisplayMode === 'manual' || a.scoreDisplayMode === 'error') continue
    const it = item(id, a)
    const isOpp = a.details?.type === 'opportunity' || it.savingsMs > 0 || it.savingsBytes > 0
    const failing = it.score === null ? a.scoreDisplayMode === 'informative' : it.score < 0.9
    if (isOpp && failing && (it.savingsMs > 0 || it.savingsBytes > 0)) opportunities.push(it)
    else if (failing && (perfRefs.find((r) => r.id === id)?.group === 'diagnostics' || a.scoreDisplayMode === 'informative' || it.score !== null)) diagnostics.push(it)
  }
  opportunities.sort((x, y) => y.savingsMs - x.savingsMs || y.savingsBytes - x.savingsBytes)
  diagnostics.sort((x, y) => (x.score ?? 0.5) - (y.score ?? 0.5))
  return {
    url: lhr.finalDisplayedUrl ?? lhr.finalUrl ?? lhr.requestedUrl ?? '',
    version: lhr.lighthouseVersion ?? '?',
    fetchTime: lhr.fetchTime ?? '',
    formFactor: lhr.configSettings?.formFactor ?? lhr.configSettings?.emulatedFormFactor ?? '',
    categories, metrics, opportunities, diagnostics,
    runWarnings: Array.isArray(lhr.runWarnings) ? lhr.runWarnings.map(String) : [],
    totalMs: Number(lhr.timing?.total) || 0,
  }
}

export const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`)
export const fmtKiB = (b: number) => (b >= 1024 * 1024 ? `${(b / 1048576).toFixed(1)} MiB` : `${Math.round(b / 1024)} KiB`)

/** Score differences (×100) between two reports, by category id and metric id. */
export function compare(a: Report, b: Report): { cats: { id: string; title: string; a: number | null; b: number | null; delta: number | null }[]; metrics: { id: string; short: string; a: number; b: number; unit: string }[] } {
  const cats = a.categories.map((c) => {
    const o = b.categories.find((x) => x.id === c.id)
    const sa = c.score === null ? null : Math.round(c.score * 100), sb = o?.score == null ? null : Math.round(o.score * 100)
    return { id: c.id, title: c.title, a: sa, b: sb, delta: sa !== null && sb !== null ? sb - sa : null }
  })
  const metrics = a.metrics.flatMap((m) => {
    const o = b.metrics.find((x) => x.id === m.id)
    return o ? [{ id: m.id, short: m.short, a: m.value, b: o.value, unit: m.unit }] : []
  })
  return { cats, metrics }
}

// ---------- Original sample report (fictional site, hand-written numbers) ----------
const op = (title: string, ms: number, bytes: number, score: number, desc: string, items: Record<string, unknown>[], extra: Json = {}) => ({
  title, description: desc, score, scoreDisplayMode: 'metricSavings', displayValue: bytes ? `Est savings of ${Math.round(bytes / 1024)} KiB` : `Est savings of ${ms} ms`,
  metricSavings: { LCP: ms, FCP: Math.round(ms * 0.6) },
  details: { type: 'opportunity', overallSavingsMs: ms, overallSavingsBytes: bytes, headings: [{ key: 'url', valueType: 'url', label: 'URL' }, { key: 'totalBytes', valueType: 'bytes', label: 'Transfer Size' }, { key: 'wastedBytes', valueType: 'bytes', label: 'Est Savings' }], items },
  ...extra,
})
const metric = (title: string, value: number, unit: string, display: string, score: number) => ({ title, numericValue: value, numericUnit: unit, displayValue: display, score, scoreDisplayMode: 'numeric' })
const diag = (title: string, score: number | null, display: string, desc: string, mode = 'metricSavings') => ({ title, score, displayValue: display, description: desc, scoreDisplayMode: mode, details: { type: 'table', headings: [], items: [] } })
const ref = (id: string, weight = 0, group?: string) => ({ id, weight, group })

export const SAMPLE_REPORT = {
  lighthouseVersion: '12.2.0',
  requestedUrl: 'https://shop.example.test/',
  finalDisplayedUrl: 'https://shop.example.test/',
  fetchTime: '2026-09-14T08:30:00.000Z',
  configSettings: { formFactor: 'mobile' },
  runWarnings: [],
  timing: { total: 14210 },
  categories: {
    performance: { title: 'Performance', score: 0.58, auditRefs: [ref('first-contentful-paint', 10, 'metrics'), ref('largest-contentful-paint', 25, 'metrics'), ref('total-blocking-time', 30, 'metrics'), ref('cumulative-layout-shift', 25, 'metrics'), ref('speed-index', 10, 'metrics'), ref('render-blocking-resources', 0), ref('uses-responsive-images', 0), ref('offscreen-images', 0), ref('unused-javascript', 0), ref('modern-image-formats', 0), ref('uses-text-compression', 0), ref('mainthread-work-breakdown', 0, 'diagnostics'), ref('bootup-time', 0, 'diagnostics'), ref('dom-size', 0, 'diagnostics'), ref('font-display', 0, 'diagnostics'), ref('third-party-summary', 0, 'diagnostics'), ref('uses-long-cache-ttl', 0, 'diagnostics')] },
    accessibility: { title: 'Accessibility', score: 0.86, auditRefs: [ref('color-contrast', 7), ref('image-alt', 10), ref('button-name', 10), ref('html-has-lang', 7), ref('label', 7)] },
    'best-practices': { title: 'Best Practices', score: 0.92, auditRefs: [ref('errors-in-console', 1), ref('is-on-https', 5), ref('image-aspect-ratio', 1)] },
    seo: { title: 'SEO', score: 0.9, auditRefs: [ref('meta-description', 1), ref('document-title', 1), ref('link-text', 1), ref('crawlable-anchors', 1)] },
  },
  audits: {
    'first-contentful-paint': metric('First Contentful Paint', 2480, 'millisecond', '2.5 s', 0.68),
    'largest-contentful-paint': metric('Largest Contentful Paint', 5120, 'millisecond', '5.1 s', 0.24),
    'total-blocking-time': metric('Total Blocking Time', 410, 'millisecond', '410 ms', 0.66),
    'cumulative-layout-shift': metric('Cumulative Layout Shift', 0.14, 'unitless', '0.14', 0.78),
    'speed-index': metric('Speed Index', 4300, 'millisecond', '4.3 s', 0.76),
    'render-blocking-resources': op('Eliminate render-blocking resources', 860, 0, 0.3, 'Resources are blocking the first paint of your page. Consider delivering critical JS/CSS inline and deferring all non-critical JS/styles. [Learn more](https://example.test/docs).', [
      { url: 'https://shop.example.test/css/theme.css', totalBytes: 68200, wastedMs: 610 }, { url: 'https://cdn.example.test/fonts.css', totalBytes: 2400, wastedMs: 250 }]),
    'uses-responsive-images': op('Properly size images', 690, 412000, 0.4, 'Serve images that are appropriately-sized to save cellular data and improve load time.', [
      { url: 'https://shop.example.test/img/hero-2400.jpg', totalBytes: 498000, wastedBytes: 371000 }, { url: 'https://shop.example.test/img/promo.png', totalBytes: 61000, wastedBytes: 41000 }]),
    'offscreen-images': op('Defer offscreen images', 240, 156000, 0.6, 'Consider lazy-loading offscreen and hidden images after all critical resources have finished loading.', [
      { url: 'https://shop.example.test/img/footer-banner.jpg', totalBytes: 98000, wastedBytes: 98000 }, { url: 'https://shop.example.test/img/gallery-4.webp', totalBytes: 58000, wastedBytes: 58000 }]),
    'unused-javascript': op('Reduce unused JavaScript', 1150, 288000, 0.2, 'Reduce unused JavaScript and defer loading scripts until they are required.', [
      { url: 'https://shop.example.test/js/vendor.bundle.js', totalBytes: 342000, wastedBytes: 201000 }, { url: 'https://widgets.example.test/chat.js', totalBytes: 118000, wastedBytes: 87000 }]),
    'modern-image-formats': op('Serve images in next-gen formats', 450, 219000, 0.5, 'Image formats like WebP and AVIF often provide better compression than PNG or JPEG.', [
      { url: 'https://shop.example.test/img/hero-2400.jpg', totalBytes: 498000, wastedBytes: 189000 }, { url: 'https://shop.example.test/img/promo.png', totalBytes: 61000, wastedBytes: 30000 }]),
    'uses-text-compression': op('Enable text compression', 0, 0, 1, 'Text-based resources should be served with compression.', []),
    'mainthread-work-breakdown': diag('Minimize main-thread work', 0.35, '4.6 s', 'Consider reducing the time spent parsing, compiling and executing JS.'),
    'bootup-time': diag('Reduce JavaScript execution time', 0.48, '2.1 s', 'Consider reducing the time spent parsing, compiling, and executing JS.'),
    'dom-size': diag('Avoid an excessive DOM size', 0.71, '1,684 elements', 'A large DOM will increase memory usage and cause longer style calculations.'),
    'font-display': diag('Ensure text remains visible during webfont load', 0.5, '', 'Use the font-display CSS feature so text stays visible while web fonts load.'),
    'third-party-summary': diag('Reduce the impact of third-party code', null, 'Third-party code blocked the main thread for 320 ms', 'Limit the number of redundant third-party providers.', 'informative'),
    'uses-long-cache-ttl': diag('Serve static assets with an efficient cache policy', 0.62, '14 resources found', 'A long cache lifetime can speed up repeat visits to your page.'),
    'color-contrast': { title: 'Background and foreground colors do not have a sufficient contrast ratio.', score: 0, scoreDisplayMode: 'binary', description: 'Low-contrast text is difficult or impossible for many users to read.' },
    'image-alt': { title: 'Image elements do not have [alt] attributes', score: 0, scoreDisplayMode: 'binary', description: 'Informative elements should aim for short, descriptive alternate text.' },
    'button-name': { title: 'Buttons have an accessible name', score: 1, scoreDisplayMode: 'binary' },
    'html-has-lang': { title: '<html> element has a [lang] attribute', score: 1, scoreDisplayMode: 'binary' },
    label: { title: 'Form elements have associated labels', score: 1, scoreDisplayMode: 'binary' },
    'errors-in-console': { title: 'Browser errors were logged to the console', score: 0, scoreDisplayMode: 'binary', description: 'Errors logged to the console indicate unresolved problems.' },
    'is-on-https': { title: 'Uses HTTPS', score: 1, scoreDisplayMode: 'binary' },
    'image-aspect-ratio': { title: 'Displays images with correct aspect ratio', score: 1, scoreDisplayMode: 'binary' },
    'meta-description': { title: 'Document has a meta description', score: 1, scoreDisplayMode: 'binary' },
    'document-title': { title: 'Document has a <title> element', score: 1, scoreDisplayMode: 'binary' },
    'link-text': { title: 'Links do not have descriptive text', score: 0, scoreDisplayMode: 'binary', description: 'Descriptive link text helps search engines understand your content.' },
    'crawlable-anchors': { title: 'Links are crawlable', score: 1, scoreDisplayMode: 'binary' },
  },
}
