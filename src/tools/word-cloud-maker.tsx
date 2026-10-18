import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, num, Panel, PALETTE, Row, Seg, Select, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { Board, countWords, dilate, fitFactor, parseWeighted, rng, shapeMask, sizeFor, spiral, stopSet, type Scale, type Shape, type Sprite, type WordCount } from './lib/word-cloud-maker'

const SAMPLE = `Our neighbourhood garden started as an empty lot with broken glass and tall weeds. Twelve families met on a rainy Saturday, borrowed shovels, and cleared the soil one bucket at a time. Today the garden has thirty raised beds, a shared compost corner, a rain barrel system and a tiny library box full of seed packets.

Every bed is different. Some grow tomatoes, beans and squash; others grow herbs, flowers for the bees, or peppers that are far too hot. Children run a worm farm and measure the compost temperature every week. Older neighbours teach pruning, seed saving and how to read the soil. Volunteers water the beds in turns during the dry summer weeks.

The garden is also a meeting place. People share harvests, recipes and tools. A Friday soup night turns extra vegetables into dinner for anyone who comes. Local schools visit to plant seeds and learn where food comes from. The garden proves that a small patch of soil, some water, patience and good neighbours can grow far more than vegetables: it grows community.`

const PALETTES: Record<string, string[]> = {
  Vivid: PALETTE.slice(0, 9),
  Ocean: ['#03045e', '#0077b6', '#00b4d8', '#48cae4', '#0096c7', '#023e8a'],
  Sunset: ['#7f1d1d', '#c2410c', '#ea580c', '#f59e0b', '#be123c', '#9d174d'],
  Forest: ['#14532d', '#166534', '#15803d', '#65a30d', '#4d7c0f', '#854d0e'],
  Berry: ['#4c1d95', '#7c3aed', '#c026d3', '#db2777', '#9333ea', '#be185d'],
  Mono: ['#0f172a', '#334155', '#475569', '#64748b'],
}
const FONTS: [string, string][] = [
  ['system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', 'Sans'],
  ['Georgia, "Times New Roman", serif', 'Serif'],
  ['Impact, "Arial Narrow Bold", "Helvetica Neue", sans-serif', 'Condensed'],
  ['"Courier New", ui-monospace, monospace', 'Mono'],
  ['"Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive', 'Casual'],
]
const SIZES: [string, string][] = [['960x600', 'Landscape 960×600'], ['800x800', 'Square 800×800'], ['1200x630', 'Social 1200×630'], ['600x900', 'Portrait 600×900']]
type Rot = 'none' | 'hv' | 'mixed' | 'tilt'

const DEF = {
  mode: 'text' as 'text' | 'list', text: SAMPLE, list: 'garden: 9\ncommunity: 6\nsoil: 5\nseeds: 5\nneighbours: 4\ncompost: 4\nwater: 4\nharvest: 3\nbees: 3\nvolunteers: 3\nrecipes: 2\nschools: 2\npatience: 2',
  langs: ['en'] as string[], extra: '', minLen: 3, numbers: false, max: 120, excluded: [] as string[],
  shape: 'ellipse' as Shape | 'image', size: '960x600', font: FONTS[0][0], weight: 700, scale: 'sqrt' as Scale, fMin: 14, fMax: 88,
  fill: true, rot: 'hv' as Rot, vert: 0.3, pad: 1, palette: 'Vivid', custom: '#1d4ed8, #9333ea, #db2777', colorBy: 'rank' as 'rank' | 'random', bg: '#ffffff', transparent: false, seed: 7,
}

interface Placed { word: string; count: number; size: number; x: number; y: number; rot: number; color: string }
const CELL = 2

function sprite(ctx: CanvasRenderingContext2D, word: string, font: string, rot: number): { s: Sprite; ax: number; ay: number } {
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const m = ctx.measureText(word)
  const l = -m.actualBoundingBoxLeft, r = m.actualBoundingBoxRight, t = -m.actualBoundingBoxAscent, b = m.actualBoundingBoxDescent
  const a = (rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  const pts = [[l, t], [r, t], [l, b], [r, b]].map(([x, y]) => [x * c - y * s, x * s + y * c])
  const minX = Math.floor(Math.min(...pts.map((p) => p[0]))) - 1, maxX = Math.ceil(Math.max(...pts.map((p) => p[0]))) + 1
  const minY = Math.floor(Math.min(...pts.map((p) => p[1]))) - 1, maxY = Math.ceil(Math.max(...pts.map((p) => p[1]))) + 1
  const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY)
  ctx.canvas.width = Math.max(ctx.canvas.width, w)
  ctx.canvas.height = Math.max(ctx.canvas.height, h)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.setTransform(c, s, -s, c, -minX, -minY)
  ctx.fillStyle = '#000'
  ctx.fillText(word, 0, 0)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  const img = ctx.getImageData(0, 0, w, h).data
  const gw = Math.ceil(w / CELL), gh = Math.ceil(h / CELL)
  const bits = new Uint8Array(gw * gh)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (img[(y * w + x) * 4 + 3] > 40) bits[Math.floor(y / CELL) * gw + Math.floor(x / CELL)] = 1
  return { s: { w: gw, h: gh, bits }, ax: -minX / CELL, ay: -minY / CELL }
}

export default function WordCloudMaker() {
  const [s, set, reset] = useToolState('word-cloud-maker', DEF)
  const [maskImg, setMaskImg] = useState<Uint8Array | null>(null)
  const [maskKey, setMaskKey] = useState(0)
  const svgRef = useRef<SVGSVGElement>(null)
  const text = useDeferredValue(s.mode === 'text' ? s.text : s.list)
  const [W, H] = s.size.split('x').map(Number)
  const colors = s.palette === 'Custom' ? s.custom.split(/[\s,;]+/).filter((c) => /^#[0-9a-f]{3,8}$/i.test(c)) : PALETTES[s.palette]
  const pal = colors.length ? colors : PALETTES.Vivid

  const counts = useMemo<WordCount[]>(() => (s.mode === 'text' ? countWords(text, { stop: stopSet(s.langs, s.extra), minLen: s.minLen, numbers: s.numbers }) : parseWeighted(text)), [text, s.mode, s.langs, s.extra, s.minLen, s.numbers])
  const used = counts.filter((w) => !s.excluded.includes(w.word)).slice(0, Math.max(1, s.max))

  const usedKey = used.map((w) => w.word + w.count).join('|')
  const palKey = pal.join()
  const result = useMemo(() => {
    if (typeof document === 'undefined' || !used.length) return { placed: [] as Placed[], skipped: 0 }
    const gw = Math.ceil(W / CELL), gh = Math.ceil(H / CELL)
    const allowed = s.shape === 'image' ? (maskImg && maskImg.length === gw * gh ? maskImg : null) : s.shape === 'rect' ? null : shapeMask(s.shape, gw, gh)
    const board = new Board(gw, gh, allowed)
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const rand = rng(s.seed)
    const pts = spiral(Math.hypot(gw, gh) / 2, gw / gh, 1.5)
    const cMin = Math.min(...used.map((w) => w.count)), cMax = Math.max(...used.map((w) => w.count))
    const area = (allowed ? allowed.reduce((a, x) => a + x, 0) : gw * gh) * CELL * CELL
    const k = s.fill ? fitFactor(used.map((w) => ({ word: w.word, size: sizeFor(w.count, cMin, cMax, s.fMin, s.fMax, s.scale) })), area) : 1
    const placed: Placed[] = []
    let skipped = 0
    used.forEach((w, rank) => {
      let size = sizeFor(w.count, cMin, cMax, s.fMin, s.fMax, s.scale) * k
      const r = rand()
      const rot = s.rot === 'none' ? 0 : s.rot === 'hv' ? (r < s.vert ? -90 : 0) : s.rot === 'mixed' ? [-90, -45, 0, 0, 45, 90][Math.floor(r * 6)] : Math.round((r * 2 - 1) * 30)
      const color = s.colorBy === 'rank' ? pal[Math.min(pal.length - 1, Math.floor((rank / used.length) * pal.length))] : pal[Math.floor(rand() * pal.length)]
      const jx = (rand() - 0.5) * gw * 0.1, jy = (rand() - 0.5) * gh * 0.1
      for (let attempt = 0; attempt < 4; attempt++) {
        const sp = sprite(ctx, w.word, `${s.weight} ${size.toFixed(1)}px ${s.font}`, rot)
        const d = dilate(sp.s, s.pad)
        const ax = sp.ax + s.pad, ay = sp.ay + s.pad
        const cx = gw / 2 + jx, cy = gh / 2 + jy
        for (const [dx, dy] of pts) {
          const x = Math.round(cx + dx - ax), y = Math.round(cy + dy - ay)
          if (board.fits(d, x, y)) {
            board.put(d, x, y)
            placed.push({ word: w.word, count: w.count, size, x: (x + ax) * CELL, y: (y + ay) * CELL, rot, color })
            return
          }
        }
        size *= 0.8
        if (size < 6) break
      }
      skipped++
    })
    return { placed, skipped }
  }, [usedKey, W, H, s.shape, maskKey, s.font, s.weight, s.scale, s.fMin, s.fMax, s.rot, s.vert, s.pad, palKey, s.colorBy, s.seed, s.fill]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMask = async (f: File) => {
    const img = await createImageBitmap(f)
    const gw = Math.ceil(W / CELL), gh = Math.ceil(H / CELL)
    const c = document.createElement('canvas')
    c.width = gw
    c.height = gh
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, gw, gh)
    const k = Math.min(gw / img.width, gh / img.height)
    ctx.drawImage(img, (gw - img.width * k) / 2, (gh - img.height * k) / 2, img.width * k, img.height * k)
    const d = ctx.getImageData(0, 0, gw, gh).data
    const m = new Uint8Array(gw * gh)
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114 < 128 ? 1 : 0
    setMaskImg(m)
    setMaskKey((k2) => k2 + 1)
    set({ shape: 'image' })
  }
  const svgText = () => {
    const el = svgRef.current
    if (!el) return ''
    const c = el.cloneNode(true) as SVGSVGElement
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    c.removeAttribute('style')
    return new XMLSerializer().serializeToString(c)
  }
  const png = (scale = 2) => {
    const c = document.createElement('canvas')
    c.width = W * scale
    c.height = H * scale
    const ctx = c.getContext('2d')!
    ctx.scale(scale, scale)
    if (!s.transparent) { ctx.fillStyle = s.bg; ctx.fillRect(0, 0, W, H) }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    for (const p of result.placed) {
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rot * Math.PI) / 180)
      ctx.font = `${s.weight} ${p.size.toFixed(1)}px ${s.font}`
      ctx.fillStyle = p.color
      ctx.fillText(p.word, 0, 0)
      ctx.restore()
    }
    c.toBlob((b) => b && download('word-cloud.png', b, 'image/png'), 'image/png')
  }
  const toggleLang = (l: string) => set({ langs: s.langs.includes(l) ? s.langs.filter((x) => x !== l) : [...s.langs, l] })

  return (
    <Split wide="right">
      <div>
        <Panel title="Words" actions={<Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['text', 'From text'], ['list', 'Weighted list']]} />}>
          {s.mode === 'text' ? (
            <>
              <textarea className="k-area" rows={9} value={s.text} onChange={(e) => set({ text: e.target.value })} aria-label="Text" />
              <FileDrop accept=".txt,.md,.csv,text/*" onFiles={async (f) => set({ text: await f[0].text(), excluded: [] })} label="Load a text file" />
              <div style={{ margin: '6px 0' }}>
                <span className="k-label">Stop words</span>
                <Row>{([['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['uk', 'Ukrainian']] as [string, string][]).map(([l, n]) => <Check key={l} label={n} value={s.langs.includes(l)} onChange={() => toggleLang(l)} />)}</Row>
              </div>
              <Txt label="Extra words to ignore" value={s.extra} onChange={(extra) => set({ extra })} placeholder="comma or space separated" />
              <Row>
                <Slider label="Min length" value={s.minLen} onChange={(minLen) => set({ minLen })} min={1} max={8} show={(v) => String(v)} />
                <Check label="Keep numbers" value={s.numbers} onChange={(numbers) => set({ numbers })} />
              </Row>
            </>
          ) : (
            <>
              <textarea className="k-area mono" rows={10} value={s.list} onChange={(e) => set({ list: e.target.value })} aria-label="Weighted words" />
              <p className="muted" style={{ fontSize: 12 }}>One entry per line: <code>word: weight</code>, <code>word, weight</code> or just <code>word</code>. Phrases are allowed.</p>
            </>
          )}
          <Slider label="Max words" value={s.max} onChange={(max) => set({ max })} min={10} max={250} show={(v) => String(v)} />
        </Panel>
        <Panel title="Layout">
          <Row>
            <Select label="Canvas" value={s.size} onChange={(size) => set({ size })} options={SIZES} />
            <Select label="Shape" value={s.shape} onChange={(shape) => set({ shape })} options={[['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['heart', 'Heart'], ['star', 'Star'], ['diamond', 'Diamond'], ['cloud', 'Cloud'], ...(maskImg ? [['image', 'Uploaded mask'] as [Shape | 'image', string]] : [])]} />
          </Row>
          <FileDrop accept="image/*" onFiles={(f) => void loadMask(f[0])} label="Custom shape: dark areas of an image become the mask" />
          <span className="k-label">Rotation</span>
          <Seg value={s.rot} onChange={(rot) => set({ rot })} options={[['none', 'Horizontal'], ['hv', '0° / 90°'], ['mixed', '±45° / 90°'], ['tilt', 'Tilted ±30°']]} />
          {s.rot === 'hv' && <Slider label="Vertical share" value={s.vert} onChange={(vert) => set({ vert })} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)} %`} />}
          <Row>
            <Select label="Font" value={s.font} onChange={(font) => set({ font })} options={FONTS} />
            <Select label="Weight" value={s.weight} onChange={(weight) => set({ weight })} options={[[400, 'Regular'], [700, 'Bold'], [900, 'Black']]} />
          </Row>
          <Row>
            <Slider label="Smallest" value={s.fMin} onChange={(fMin) => set({ fMin: Math.min(fMin, s.fMax) })} min={6} max={40} unit="px" show={(v) => String(v)} />
            <Slider label="Largest" value={s.fMax} onChange={(fMax) => set({ fMax: Math.max(fMax, s.fMin) })} min={20} max={180} unit="px" show={(v) => String(v)} />
          </Row>
          <Row>
            <Check label="Auto-fit to shape" value={s.fill} onChange={(fill) => set({ fill })} />
            <Select label="Size scale" value={s.scale} onChange={(scale) => set({ scale })} options={[['linear', 'Linear'], ['sqrt', 'Square root'], ['log', 'Logarithmic']]} />
            <Slider label="Spacing" value={s.pad} onChange={(pad) => set({ pad })} min={0} max={4} show={(v) => `${v * CELL}px`} />
          </Row>
        </Panel>
        <Panel title="Colours">
          <Row>{[...Object.keys(PALETTES), 'Custom'].map((p) => (
            <button key={p} type="button" className={`k-btn ${s.palette === p ? 'primary' : 'ghost'}`} onClick={() => set({ palette: p })}>
              {p !== 'Custom' && <span style={{ display: 'inline-flex', marginRight: 6 }}>{PALETTES[p].slice(0, 5).map((c) => <i key={c} style={{ width: 8, height: 14, background: c }} />)}</span>}{p}
            </button>
          ))}</Row>
          {s.palette === 'Custom' && <Txt label="Custom colours (hex)" value={s.custom} onChange={(custom) => set({ custom })} placeholder="#123456, #abcdef" />}
          <Row>
            <Seg value={s.colorBy} onChange={(colorBy) => set({ colorBy })} options={[['rank', 'By frequency'], ['random', 'Random']]} />
            <label className="k-field" style={{ maxWidth: 120 }}><span className="k-label">Background</span><input type="color" value={s.bg} onChange={(e) => set({ bg: e.target.value })} /></label>
            <Check label="Transparent PNG" value={s.transparent} onChange={(transparent) => set({ transparent })} />
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Unique words" value={num(counts.length, 0)} sub={s.mode === 'text' ? 'after stop words' : 'from list'} />
          <Stat label="Placed" value={result.placed.length} sub={result.skipped ? `${result.skipped} did not fit` : 'all fitted'} tone={result.skipped ? undefined : 'good'} />
          <Stat label="Top word" value={used[0]?.word ?? '—'} sub={used[0] ? `× ${num(used[0].count, 1)}` : ''} tone="accent" />
          <Stat label="Canvas" value={`${W}×${H}`} sub={`PNG export ${W * 2}×${H * 2}`} />
        </Stats>
        <Panel title="Word cloud" actions={<>
          <Btn onClick={() => set({ seed: s.seed + 1 })}>🔀 Shuffle</Btn>
          <Btn kind="primary" onClick={() => png(2)} disabled={!result.placed.length}>⬇ PNG</Btn>
          <Btn onClick={() => download('word-cloud.svg', svgText(), 'image/svg+xml')} disabled={!result.placed.length}>⬇ SVG</Btn>
          <Btn kind="ghost" onClick={() => { reset(); setMaskImg(null) }}>Reset</Btn>
        </>}>
          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)', background: s.transparent ? 'repeating-conic-gradient(#e5e7eb 0 25%, #fff 0 50%) 0 0 / 20px 20px' : s.bg }}>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Word cloud">
              {!s.transparent && <rect width={W} height={H} fill={s.bg} />}
              {result.placed.map((p) => (
                <text key={p.word} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rot})`} textAnchor="middle" fontFamily={s.font} fontWeight={s.weight} fontSize={p.size.toFixed(1)} fill={p.color}>
                  <title>{`${p.word}: ${num(p.count, 1)}`}</title>{p.word}
                </text>
              ))}
            </svg>
          </div>
          {!used.length && <Note>Add some text or a word list to build the cloud.</Note>}
          {result.skipped > 0 && <Note tone="warn">{result.skipped} smaller words did not fit. Try a smaller “Largest” size, less spacing, a bigger canvas or the rectangle shape.</Note>}
        </Panel>
        <Panel title="Frequencies" actions={s.excluded.length ? <Btn kind="ghost" onClick={() => set({ excluded: [] })}>Restore {s.excluded.length} hidden</Btn> : undefined}>
          <Table
            head={['#', 'Word', 'Count', 'Show']}
            rows={counts.slice(0, 60).map((w, i) => [i + 1, w.word, num(w.count, 1), <Check key="c" label="" value={!s.excluded.includes(w.word)} onChange={(v) => set({ excluded: v ? s.excluded.filter((x) => x !== w.word) : [...s.excluded, w.word] })} />])}
            max={60}
          />
          <p className="muted" style={{ fontSize: 12 }}>Untick a word to remove it from the cloud. Layout: own Archimedean-spiral placement with pixel-level collision tests on a 2 px grid.</p>
        </Panel>
      </div>
    </Split>
  )
}
