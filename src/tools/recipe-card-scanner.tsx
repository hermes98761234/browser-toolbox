import { useEffect, useRef, useState } from 'react'
import { Area, Btn, Check, CopyButton, download, FileDrop, JsonButtons, Note, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { otsu } from './lib/note-ocr'
import { formatIngredient, parseIngredient, parseRecipe, toMarkdown, type Ingredient, type Recipe } from './lib/recipe-card-scanner'

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string; boundingBox: DOMRectReadOnly }[]> }
const TextDetectorCtor = (globalThis as unknown as { TextDetector?: new () => Detector }).TextDetector

const SAMPLE = `Grandma's Banana Bread
Serves 8
Prep time: 15 min   Bake: 1 hour

Ingredients
3 ripe bananas, mashed
1/3 cup melted butter
3/4 cup sugar
1 egg, beaten
1 tsp vanilla extract
1 tsp baking soda
Pinch of salt
1 1/2 cups all-purpose flour

Directions
1. Preheat the oven to 350°F (175°C) and butter a 4x8 inch loaf pan.
2. Mix the butter into the mashed bananas
in a large bowl.
3. Stir in sugar, egg and vanilla. Sprinkle the soda and salt over and mix.
4. Add the flour last and stir just until combined.
5. Pour into the pan and bake about 1 hour, until a skewer comes out clean.

Notes
Walnuts or chocolate chips (1/2 cup) are a good addition.`

interface Saved { id: string; recipe: Recipe; saved: string }
const DEF = { text: SAMPLE, recipe: parseRecipe(SAMPLE), target: 8, box: [] as Saved[], mode: 'bw' as 'color' | 'gray' | 'bw', flatten: true, contrast: 1.3 }

/** A photographed index card with handwriting, slight tilt and a shadow. */
function sampleCard(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 1000; c.height = 680
  const g = c.getContext('2d')!
  g.fillStyle = '#7c6f64'; g.fillRect(0, 0, c.width, c.height)
  g.save(); g.translate(500, 340); g.rotate(-0.025)
  g.fillStyle = '#fbf6e9'; g.fillRect(-460, -310, 920, 620)
  g.strokeStyle = '#93c5fd'; g.lineWidth = 2
  for (let y = -220; y < 300; y += 34) { g.beginPath(); g.moveTo(-460, y); g.lineTo(460, y); g.stroke() }
  g.strokeStyle = '#f87171'; g.beginPath(); g.moveTo(-460, -250); g.lineTo(460, -250); g.stroke()
  g.fillStyle = '#1e293b'; g.font = 'bold 40px "Comic Sans MS", "Segoe Print", cursive'
  g.fillText("Grandma's Banana Bread", -430, -265)
  g.font = '23px "Comic Sans MS", "Segoe Print", cursive'
  const left = ['Serves 8 · 15 min + 1 hr', '3 ripe bananas', '1/3 cup melted butter', '3/4 cup sugar', '1 egg, beaten', '1 tsp vanilla', '1 tsp baking soda', 'pinch of salt', '1 1/2 cups flour']
  left.forEach((l, i) => g.fillText(l, -430, -228 + i * 34))
  const right = ['1. Oven 350°F, butter pan', '2. Mash bananas + butter', '3. Stir in sugar, egg,', '    vanilla, soda, salt', '4. Fold in flour', '5. Bake ~1 hr until', '    skewer comes out clean']
  right.forEach((l, i) => g.fillText(l, 20, -194 + i * 34))
  g.restore()
  const sh = g.createLinearGradient(0, 0, 1000, 680)
  sh.addColorStop(0, 'rgba(255,240,200,0.15)'); sh.addColorStop(1, 'rgba(0,0,0,0.45)')
  g.fillStyle = sh; g.fillRect(0, 0, 1000, 680)
  return c
}

function fit(src: CanvasImageSource & { width: number; height: number }, max = 1400) {
  const k = Math.min(1, max / Math.max(src.width, src.height))
  const c = document.createElement('canvas')
  c.width = Math.round(src.width * k); c.height = Math.round(src.height * k)
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height)
  return c
}

/** Shadow flattening (divide by blurred background), contrast and optional Otsu binarisation. */
function cleanup(src: HTMLCanvasElement, mode: string, flatten: boolean, contrast: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = src.width; c.height = src.height
  const g = c.getContext('2d')!
  g.drawImage(src, 0, 0)
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data
  let bg: Uint8ClampedArray | null = null
  if (flatten) {
    const b = document.createElement('canvas')
    b.width = c.width; b.height = c.height
    const bgx = b.getContext('2d')!
    bgx.filter = `blur(${Math.max(8, Math.round(c.width / 40))}px)`
    bgx.drawImage(src, 0, 0)
    bg = bgx.getImageData(0, 0, c.width, c.height).data
  }
  const n = c.width * c.height, gray = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      let v = d[i * 4 + k]
      if (bg) v = (v / Math.max(24, bg[i * 4 + k])) * 235
      d[i * 4 + k] = (v - 128) * contrast + 128
    }
    gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]
  }
  const th = otsu(gray)
  for (let i = 0; i < n; i++) {
    if (mode === 'color') continue
    const v = mode === 'bw' ? (gray[i] > th ? 255 : 0) : gray[i]
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v
  }
  g.putImageData(img, 0, 0)
  return c
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!)

function cardHtml(r: Recipe, k: number, servings: number) {
  return `<!doctype html><meta charset="utf-8"><title>${esc(r.title)}</title><style>
body{font:15px/1.5 Georgia,serif;color:#222;margin:0;padding:24px}.card{max-width:720px;margin:auto;border:2px solid #222;border-radius:10px;padding:22px 26px}
h1{margin:0 0 4px;font-size:28px}.meta{color:#666;margin-bottom:14px}.cols{display:grid;grid-template-columns:1fr 1.5fr;gap:24px}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #999;padding-bottom:3px}ul,ol{padding-left:20px;margin:0}li{margin:4px 0}
.notes{margin-top:14px;font-style:italic;color:#444}@media print{body{padding:0}}</style>
<div class="card"><h1>${esc(r.title)}</h1><div class="meta">${[servings ? `Serves ${servings}` : '', r.prep && `Prep ${esc(r.prep)}`, r.cook && `Cook ${esc(r.cook)}`].filter(Boolean).join(' · ')}</div>
<div class="cols"><div><h2>Ingredients</h2><ul>${r.ingredients.map((g) => `<li>${esc(formatIngredient(g, k))}</li>`).join('')}</ul></div>
<div><h2>Method</h2><ol>${r.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div></div>${r.notes ? `<div class="notes">${esc(r.notes)}</div>` : ''}</div>`
}

const rawLine = (g: Ingredient) => formatIngredient(g, 1)

/** Free-text ingredient editor: keeps what you type, re-parses it into qty / unit / item. */
function IngLine({ g, onChange }: { g: Ingredient; onChange: (g: Ingredient) => void }) {
  const [text, setText] = useState(() => rawLine(g))
  const [prev, setPrev] = useState(g)
  if (prev !== g) {
    setPrev(g)
    if (rawLine(parseIngredient(text)) !== rawLine(g)) setText(rawLine(g))
  }
  return <input aria-label="Ingredient line" className="k-text" style={{ flex: 1, minWidth: 0 }} value={text} onChange={(e) => { setText(e.target.value); onChange(parseIngredient(e.target.value)) }} />
}

export default function RecipeCardScanner() {
  const [s, set] = useToolState('recipe-card-scanner', DEF)
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null)
  const [cam, setCam] = useState<MediaStream | null>(null)
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState<'scan' | 'text'>('scan')
  const outRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const r = s.recipe
  const k = r.servings && s.target > 0 ? s.target / r.servings : 1

  useEffect(() => { setSrc(sampleCard()) }, []) // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => {
    const o = outRef.current
    if (!o || !src) return
    const c = cleanup(fit(src), s.mode, s.flatten, s.contrast)
    o.width = c.width; o.height = c.height
    o.getContext('2d')!.drawImage(c, 0, 0)
  }, [src, s.mode, s.flatten, s.contrast, tab])
  useEffect(() => {
    if (videoRef.current && cam) videoRef.current.srcObject = cam
    return () => cam?.getTracks().forEach((t) => t.stop())
  }, [cam])

  const setR = (p: Partial<Recipe>) => set({ recipe: { ...r, ...p } })
  const editIng = (i: number, g: Ingredient) => setR({ ingredients: r.ingredients.map((x, j) => (j === i ? g : x)) })
  const parse = (text = s.text) => { const p = parseRecipe(text); set({ text, recipe: p, target: p.servings ?? s.target }) }

  const openCam = async () => {
    try { setCam(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 } } })); setMsg('') }
    catch { setMsg('Camera unavailable or permission denied. Use a photo file instead.') }
  }
  const snap = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    setSrc(c); setCam(null)
  }
  const load = async (f: File) => {
    try { const b = await createImageBitmap(f); const c = fit(b, 2400); setSrc(c); setMsg('') } catch { setMsg('Could not read that image.') }
  }
  const detect = async () => {
    if (!TextDetectorCtor || !outRef.current) return
    try {
      setMsg('Detecting text…')
      const res = await new TextDetectorCtor().detect(outRef.current)
      const lines = res.sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x).map((x) => x.rawValue)
      if (!lines.length) { setMsg('No text found. Try the B/W cleanup or type the text.'); return }
      parse(lines.join('\n')); setTab('text'); setMsg(`Recognised ${lines.length} lines. Check and fix them below.`)
    } catch { setMsg('Text detection failed in this browser.') }
  }
  const printCard = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(cardHtml(r, k, Math.round(s.target * 10) / 10))
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
  }
  const save = () => set({ box: [{ id: uid(), recipe: r, saved: new Date().toISOString().slice(0, 10) }, ...s.box.filter((b) => b.recipe.title !== r.title)] })

  return (
    <Split>
      <div>
        <Panel title="1 · Capture the card" actions={<Seg value={tab} onChange={setTab} options={[['scan', 'Photo'], ['text', 'Text']]} />}>
          {tab === 'scan' ? (
            <>
              <Row>
                <FileDrop accept="image/*" onFiles={(f) => void load(f[0])} label="Drop a photo of the card" />
                {cam ? <Btn kind="primary" onClick={snap}>📸 Capture</Btn> : <Btn onClick={() => void openCam()} disabled={!navigator.mediaDevices?.getUserMedia}>📷 Camera</Btn>}
                <Btn kind="ghost" onClick={() => setSrc(sampleCard())}>Sample card</Btn>
              </Row>
              {cam && <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 8, marginTop: 8 }} />}
              <canvas ref={outRef} style={{ width: '100%', borderRadius: 8, border: '1px solid var(--line)', marginTop: 8, background: '#fff' }} />
              <Row>
                <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['color', 'Colour'], ['gray', 'Grey'], ['bw', 'B/W']]} />
                <Check label="Remove shadows" value={s.flatten} onChange={(flatten) => set({ flatten })} />
              </Row>
              <Slider label="Contrast" min={0.6} max={2.5} step={0.05} value={s.contrast} onChange={(contrast) => set({ contrast })} />
              <Row>
                <Btn kind="primary" disabled={!TextDetectorCtor} onClick={() => void detect()}>🔎 Detect text</Btn>
                <Btn onClick={() => outRef.current?.toBlob((b) => b && download('recipe-card-clean.png', b, 'image/png'))}>⬇ Clean PNG</Btn>
              </Row>
              {!TextDetectorCtor && <Note>This browser has no built-in text recognition (Shape Detection API). The cleaned, high-contrast image is easier to read: switch to <b>Text</b> and type or paste the card (phone keyboards and Live Text / Google Lens can copy text from a photo).</Note>}
            </>
          ) : (
            <>
              <Area value={s.text} onChange={(text) => set({ text })} rows={16} placeholder="Paste or type the recipe…" />
              <Row>
                <Btn kind="primary" onClick={() => parse()}>Parse into card →</Btn>
                <Btn kind="ghost" onClick={() => parse(SAMPLE)}>Sample text</Btn>
              </Row>
              <Note>Headings like <i>Ingredients</i>, <i>Directions</i> and <i>Notes</i> help; without them the parser guesses from quantities and sentence length. <i>Serves 4</i>, <i>Prep 10 min</i>, <i>Cook 1 hour</i> are picked up anywhere.</Note>
            </>
          )}
          {msg && <Note tone="warn">{msg}</Note>}
        </Panel>
        <Panel title="Recipe box" actions={<JsonButtons name="recipe-box.json" data={s.box} onLoad={(box) => Array.isArray(box) && set({ box })} />}>
          {s.box.length === 0 ? <Note>Saved cards appear here (kept in this browser). Use “Save to box”.</Note> : s.box.map((b) => (
            <Row key={b.id} wrap={false}>
              <button type="button" className="k-btn ghost" style={{ flex: 1, textAlign: 'left' }} onClick={() => set({ recipe: b.recipe, target: b.recipe.servings ?? 4, text: toMarkdown(b.recipe) })}>
                <b>{b.recipe.title}</b> <span className="muted">· {b.recipe.ingredients.length} ingredients · {b.saved}</span>
              </button>
              <Btn kind="ghost" title="Delete" onClick={() => set({ box: s.box.filter((x) => x.id !== b.id) })}>✕</Btn>
            </Row>
          ))}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Ingredients" value={r.ingredients.length} />
          <Stat label="Steps" value={r.steps.length} />
          <Stat label="Servings" value={r.servings ?? '—'} sub={k !== 1 ? `scaled ×${Math.round(k * 100) / 100}` : 'original'} tone="accent" />
          <Stat label="Time" value={[r.prep, r.cook].filter(Boolean).join(' + ') || '—'} />
        </Stats>
        <Panel
          title="2 · Recipe card"
          actions={
            <>
              <Btn kind="primary" onClick={save}>★ Save to box</Btn>
              <Btn onClick={printCard}>🖨 Print</Btn>
              <Btn onClick={() => download(`${r.title.replace(/\W+/g, '-').toLowerCase() || 'recipe'}.md`, toMarkdown(r, k), 'text/markdown')}>⬇ Markdown</Btn>
              <Btn onClick={() => download('recipe-card.html', cardHtml(r, k, s.target), 'text/html')}>⬇ HTML</Btn>
              <CopyButton text={() => toMarkdown(r, k)} />
            </>
          }
        >
          <Txt label="Title" value={r.title} onChange={(title) => setR({ title })} />
          <Row>
            <Num label="Original servings" min={1} value={r.servings ?? 4} onChange={(v) => setR({ servings: v })} />
            <Num label="Make for" min={0.5} value={s.target} onChange={(target) => set({ target })} unit="servings" />
            <Txt label="Prep" value={r.prep} onChange={(prep) => setR({ prep })} />
            <Txt label="Cook" value={r.cook} onChange={(cook) => setR({ cook })} />
          </Row>
          <h4 style={{ margin: '14px 0 6px' }}>Ingredients {k !== 1 && <span className="muted">(scaled)</span>}</h4>
          {r.ingredients.map((g, i) => (
            <Row key={i} wrap={false}>
              <IngLine g={g} onChange={(x) => editIng(i, x)} />
              <span style={{ minWidth: 120, fontWeight: 600 }}>{formatIngredient(g, k)}</span>
              <Btn kind="ghost" title="Remove" onClick={() => setR({ ingredients: r.ingredients.filter((_, j) => j !== i) })}>✕</Btn>
            </Row>
          ))}
          <Btn kind="ghost" onClick={() => setR({ ingredients: [...r.ingredients, { qty: 1, qty2: null, unit: '', item: 'new ingredient' }] })}>+ Ingredient</Btn>
          <h4 style={{ margin: '14px 0 6px' }}>Steps</h4>
          {r.steps.map((st, i) => (
            <Row key={i} wrap={false}>
              <b style={{ width: 22 }}>{i + 1}.</b>
              <textarea className="k-area" rows={2} style={{ flex: 1 }} value={st} aria-label={`Step ${i + 1}`} onChange={(e) => setR({ steps: r.steps.map((x, j) => (j === i ? e.target.value : x)) })} />
              <Btn kind="ghost" title="Move up" disabled={i === 0} onClick={() => { const a = [...r.steps]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setR({ steps: a }) }}>↑</Btn>
              <Btn kind="ghost" title="Remove" onClick={() => setR({ steps: r.steps.filter((_, j) => j !== i) })}>✕</Btn>
            </Row>
          ))}
          <Btn kind="ghost" onClick={() => setR({ steps: [...r.steps, ''] })}>+ Step</Btn>
          <Area label="Notes" value={r.notes} onChange={(notes) => setR({ notes })} rows={2} />
        </Panel>
      </div>
    </Split>
  )
}
