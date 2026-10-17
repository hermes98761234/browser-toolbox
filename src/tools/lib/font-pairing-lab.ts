// Font pairing data and Google Fonts CSS2 API helpers.

export type Cat = 'serif' | 'sans-serif' | 'display' | 'handwriting' | 'monospace'
/** family → [category, available weights] */
export const FONTS: Record<string, [Cat, number[]]> = {
  'Playfair Display': ['serif', [400, 500, 600, 700, 800, 900]],
  'Source Sans 3': ['sans-serif', [300, 400, 600, 700]],
  Montserrat: ['sans-serif', [300, 400, 500, 600, 700, 800]],
  Merriweather: ['serif', [300, 400, 700, 900]],
  'Open Sans': ['sans-serif', [300, 400, 600, 700]],
  Lora: ['serif', [400, 500, 600, 700]],
  Roboto: ['sans-serif', [300, 400, 500, 700]],
  'Roboto Slab': ['serif', [300, 400, 500, 700]],
  Oswald: ['sans-serif', [300, 400, 500, 600, 700]],
  'PT Serif': ['serif', [400, 700]],
  'PT Sans': ['sans-serif', [400, 700]],
  Raleway: ['sans-serif', [300, 400, 500, 600, 700, 800]],
  'Libre Baskerville': ['serif', [400, 700]],
  'Work Sans': ['sans-serif', [300, 400, 500, 600, 700]],
  'DM Serif Display': ['serif', [400]],
  'DM Sans': ['sans-serif', [400, 500, 700]],
  'Space Grotesk': ['sans-serif', [300, 400, 500, 600, 700]],
  'IBM Plex Sans': ['sans-serif', [300, 400, 500, 600, 700]],
  'IBM Plex Serif': ['serif', [300, 400, 500, 600, 700]],
  'IBM Plex Mono': ['monospace', [400, 500, 600]],
  Inter: ['sans-serif', [300, 400, 500, 600, 700, 800]],
  'Cormorant Garamond': ['serif', [300, 400, 500, 600, 700]],
  Poppins: ['sans-serif', [300, 400, 500, 600, 700, 800]],
  Nunito: ['sans-serif', [300, 400, 600, 700, 800]],
  'Abril Fatface': ['display', [400]],
  Lato: ['sans-serif', [300, 400, 700, 900]],
  'Bebas Neue': ['display', [400]],
  'Crimson Pro': ['serif', [300, 400, 500, 600, 700]],
  'Josefin Sans': ['sans-serif', [300, 400, 600, 700]],
  'Fraunces': ['serif', [300, 400, 600, 700, 900]],
  'Archivo': ['sans-serif', [400, 500, 600, 700, 800]],
  'Archivo Black': ['sans-serif', [400]],
  'Rubik': ['sans-serif', [300, 400, 500, 700]],
  'Karla': ['sans-serif', [300, 400, 500, 700]],
  'Spectral': ['serif', [300, 400, 500, 600, 700]],
  'EB Garamond': ['serif', [400, 500, 600, 700]],
  'Syne': ['sans-serif', [400, 600, 700, 800]],
  'Manrope': ['sans-serif', [300, 400, 500, 600, 700, 800]],
  'Sora': ['sans-serif', [300, 400, 600, 700]],
  'Outfit': ['sans-serif', [300, 400, 500, 600, 700]],
  'Pacifico': ['handwriting', [400]],
  'Caveat': ['handwriting', [400, 500, 700]],
  'Quicksand': ['sans-serif', [300, 400, 500, 700]],
  'Zilla Slab': ['serif', [300, 400, 500, 700]],
  'Alegreya': ['serif', [400, 500, 700, 800]],
  'Alegreya Sans': ['sans-serif', [300, 400, 500, 700]],
  'JetBrains Mono': ['monospace', [400, 500, 700]],
  'Bitter': ['serif', [300, 400, 500, 700]],
  'Cabin': ['sans-serif', [400, 500, 600, 700]],
  'Noto Serif': ['serif', [400, 700]],
  'Noto Sans': ['sans-serif', [400, 500, 700]],
}

export interface Pair { id: string; head: string; body: string; mood: string; why: string }
const P = (head: string, body: string, mood: string, why: string): Pair => ({ id: `${head}|${body}`, head, body, mood, why })
export const PAIRS: Pair[] = [
  P('Playfair Display', 'Source Sans 3', 'Editorial', 'High-contrast Didone headlines over a calm humanist sans — the classic magazine look.'),
  P('Montserrat', 'Merriweather', 'Friendly', 'Geometric caps-friendly headings with a sturdy screen serif for long reading.'),
  P('Lora', 'Open Sans', 'Warm', 'Brushed contemporary serif titles; neutral, legible body.'),
  P('Oswald', 'Lato', 'Bold', 'Condensed, poster-like headings with a round, quiet body.'),
  P('Roboto Slab', 'Roboto', 'Systematic', 'Superfamily pairing: shared skeleton, different texture.'),
  P('Libre Baskerville', 'Work Sans', 'Bookish', 'Transitional serif elegance with a slightly quirky grotesque.'),
  P('DM Serif Display', 'DM Sans', 'Modern', 'Designed together: tight display serif with a low-contrast geometric sans.'),
  P('Space Grotesk', 'IBM Plex Sans', 'Tech', 'Idiosyncratic grotesque headings with an engineered workhorse.'),
  P('Cormorant Garamond', 'Poppins', 'Luxury', 'Delicate Garamond display paired with crisp geometric text.'),
  P('Abril Fatface', 'Lato', 'Poster', 'Heavy fat-face display needs a very quiet body.'),
  P('Bebas Neue', 'Inter', 'Impact', 'All-caps condensed headlines + the UI-optimised Inter.'),
  P('Fraunces', 'Inter', 'Soft serif', 'A “wonky” old-style variable serif against neutral Inter.'),
  P('Archivo Black', 'Archivo', 'Brutal', 'One family, two widths: dense black headings, open body.'),
  P('Syne', 'Manrope', 'Creative', 'Experimental extended display with a polished geometric body.'),
  P('EB Garamond', 'Karla', 'Literary', 'Renaissance serif titles with a grotesque that has personality.'),
  P('Spectral', 'Rubik', 'Approachable', 'Screen-first serif with a slightly rounded sans.'),
  P('IBM Plex Serif', 'IBM Plex Sans', 'Corporate', 'A full superfamily: consistent metrics and tone.'),
  P('Sora', 'Noto Sans', 'Product', 'Wide tech display; Noto covers every language for the body.'),
  P('Zilla Slab', 'Cabin', 'Outdoorsy', 'Friendly slab headings with a humanist sans.'),
  P('Josefin Sans', 'Crimson Pro', 'Vintage', 'Art-deco geometric caps over a Garamond-like text face.'),
  P('Outfit', 'Bitter', 'Contrast', 'Clean geometric titles; a slab body made for screens.'),
  P('Pacifico', 'Quicksand', 'Playful', 'Script logo-style headings need a round, simple body.'),
  P('Alegreya', 'Alegreya Sans', 'Calligraphic', 'Sister families with shared calligraphic rhythm.'),
  P('Raleway', 'PT Serif', 'Elegant', 'Thin, wide sans headings with a sturdy PT Serif body.'),
  P('Poppins', 'Lora', 'Balanced', 'Geometric headlines, serif text — reverse of the usual formula.'),
  P('Space Grotesk', 'JetBrains Mono', 'Developer', 'For docs and dev tools: technical feel throughout.'),
]

export const stack = (family: string) => {
  const c = FONTS[family]?.[0] ?? 'sans-serif'
  const fb = c === 'serif' ? 'Georgia, "Times New Roman", serif' : c === 'monospace' ? 'ui-monospace, Menlo, monospace' : c === 'handwriting' ? 'cursive' : 'system-ui, -apple-system, "Segoe UI", sans-serif'
  return `"${family}", ${fb}`
}

/** Closest available weight. */
export const nearestWeight = (family: string, w: number) => (FONTS[family]?.[1] ?? [400]).reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a))

/** Google Fonts CSS2 URL for families with the given weights (deduplicated, sorted). */
export function googleUrl(req: Record<string, number[]>): string {
  const fams = Object.entries(req)
    .filter(([f]) => f)
    .map(([f, ws]) => {
      const w = [...new Set(ws.map((x) => nearestWeight(f, x)))].sort((a, b) => a - b)
      return `family=${f.replace(/ /g, '+')}${w.length === 1 && w[0] === 400 ? '' : `:wght@${w.join(';')}`}`
    })
  return `https://fonts.googleapis.com/css2?${fams.join('&')}&display=swap`
}

/** Modular type scale: size of step n from a base (px). */
export const scale = (base: number, ratio: number, n: number) => +(base * ratio ** n).toFixed(2)

export const RATIOS: [number, string][] = [[1.125, 'Major second 1.125'], [1.2, 'Minor third 1.2'], [1.25, 'Major third 1.25'], [1.333, 'Perfect fourth 1.333'], [1.414, 'Augmented fourth 1.414'], [1.5, 'Perfect fifth 1.5'], [1.618, 'Golden ratio 1.618']]

export function cssSnippet(o: { head: string; body: string; headWeight: number; bodyWeight: number; base: number; ratio: number; lineHeight: number }): string {
  const url = googleUrl({ [o.head]: [o.headWeight], [o.body]: [o.bodyWeight, 700] })
  const sizes = [3, 2, 1].map((n, i) => `h${i + 1} { font-size: ${(scale(o.base, o.ratio, n) / 16).toFixed(3)}rem; }`)
  return [
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link href="${url}" rel="stylesheet">`,
    '',
    `:root {`,
    `  --font-heading: ${stack(o.head)};`,
    `  --font-body: ${stack(o.body)};`,
    `}`,
    `body { font-family: var(--font-body); font-weight: ${nearestWeight(o.body, o.bodyWeight)}; font-size: ${o.base / 16}rem; line-height: ${o.lineHeight}; }`,
    `h1, h2, h3 { font-family: var(--font-heading); font-weight: ${nearestWeight(o.head, o.headWeight)}; line-height: 1.15; }`,
    ...sizes,
  ].join('\n')
}
