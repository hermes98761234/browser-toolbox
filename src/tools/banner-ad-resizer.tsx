import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, FileDrop, download, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { fmtBytes, makeZip } from './lib/image-compressor'
import { classify, contain, DEFAULT_RULES, ELEMENTS, fitText, IAB_MAX_BYTES, resolve, SIZES, type ElementId, type LayoutClass, type Rect, type Rules } from './lib/banner-ad-resizer'

interface Content { headline: string; sub: string; cta: string; logo: string; bg1: string; bg2: string; text: string; ctaBg: string; ctaText: string; font: string }
interface S { c: Content; rules: Rules; sizes: string[]; edit: string; el: ElementId; fmt: 'png' | 'jpeg'; quality: number; scale: 1 | 2; guides: boolean }
const DEF: S = {
  c: { headline: 'Hear every detail. Feel nothing else.', sub: 'Nova X2 noise-cancelling headphones · 40 h battery', cta: 'Shop now →', logo: 'NOVA', bg1: '#0f172a', bg2: '#4338ca', text: '#ffffff', ctaBg: '#facc15', ctaText: '#111827', font: 'system-ui, sans-serif' },
  rules: DEFAULT_RULES,
  sizes: ['300x250', '336x280', '728x90', '970x250', '300x600', '160x600', '320x50', '320x100', '1200x628'],
  edit: '300x250', el: 'headline', fmt: 'png', quality: 0.86, scale: 1, guides: true,
}
const key = (w: number, h: number) => `${w}x${h}`
const FONTS: [string, string][] = [['system-ui, sans-serif', 'System sans'], ['Georgia, serif', 'Serif'], ['"Trebuchet MS", sans-serif', 'Trebuchet'], ['Impact, "Arial Black", sans-serif', 'Impact'], ['"Courier New", monospace', 'Mono']]

function sampleProduct(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 420; c.height = 420
  const g = c.getContext('2d')!
  g.lineCap = 'round'
  // headband
  g.strokeStyle = '#e2e8f0'; g.lineWidth = 34
  g.beginPath(); g.arc(210, 220, 150, Math.PI * 1.05, Math.PI * 1.95); g.stroke()
  g.strokeStyle = '#94a3b8'; g.lineWidth = 10
  g.beginPath(); g.arc(210, 220, 150, Math.PI * 1.1, Math.PI * 1.9); g.stroke()
  // ear cups
  for (const x of [72, 348]) {
    const gr = g.createLinearGradient(x - 50, 0, x + 50, 0)
    gr.addColorStop(0, '#f8fafc'); gr.addColorStop(1, '#cbd5e1')
    g.fillStyle = gr
    g.beginPath(); g.ellipse(x, 270, 56, 92, 0, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#1e293b'
    g.beginPath(); g.ellipse(x + (x < 210 ? 22 : -22), 270, 30, 70, 0, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#facc15'
    g.beginPath(); g.arc(x + (x < 210 ? -26 : 26), 300, 6, 0, Math.PI * 2); g.fill()
  }
  return c
}

type Assets = { product: CanvasImageSource & { width: number; height: number }; logo: (CanvasImageSource & { width: number; height: number }) | null }

/** Draws the creative at W×H (in CSS px; `k` = pixel ratio). Returns element rectangles for hit-testing. */
function render(cv: HTMLCanvasElement, W: number, H: number, k: number, s: S, a: Assets): Partial<Record<ElementId, Rect>> {
  cv.width = Math.round(W * k); cv.height = Math.round(H * k)
  const g = cv.getContext('2d')!
  g.setTransform(k, 0, 0, k, 0, 0)
  const { c } = s
  const rules = s.rules[classify(W, H)]
  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, c.bg1); bg.addColorStop(1, c.bg2)
  g.fillStyle = bg; g.fillRect(0, 0, W, H)
  // soft accent shape
  g.fillStyle = 'rgba(255,255,255,0.07)'
  g.beginPath(); g.arc(W * 0.85, H * 0.2, Math.max(W, H) * 0.45, 0, Math.PI * 2); g.fill()
  const out: Partial<Record<ElementId, Rect>> = {}
  const measure = (weight: number) => (t: string, size: number) => { g.font = `${weight} ${size}px ${c.font}`; return g.measureText(t).width }
  const text = (id: ElementId, str: string, weight: number, color: string) => {
    const r = rules[id], box = resolve(r, W, H)
    out[id] = box
    const f = fitText(str, box, Math.max(1, r.lines), measure(weight), 6, 140)
    g.font = `${weight} ${f.size}px ${c.font}`; g.fillStyle = color; g.textBaseline = 'top'
    const lh = f.size * 1.15, th = f.lines.length * lh
    const y0 = r.v === 'top' ? box.y : r.v === 'bottom' ? box.y + box.h - th : box.y + (box.h - th) / 2
    f.lines.forEach((l, i) => {
      const lw = g.measureText(l).width
      const x = r.align === 'left' ? box.x : r.align === 'right' ? box.x + box.w - lw : box.x + (box.w - lw) / 2
      g.fillText(l, x, y0 + i * lh + f.size * 0.04)
    })
  }
  for (const e of ELEMENTS) {
    const r = rules[e.id]
    if (!r.show) continue
    if (e.id === 'image') {
      const box = resolve(r, W, H)
      const rc = contain(box, a.product.width, a.product.height, r.h, r.v)
      g.save(); g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = Math.min(W, H) * 0.05
      g.drawImage(a.product, rc.x, rc.y, rc.w, rc.h); g.restore()
      out.image = rc
    } else if (e.id === 'logo') {
      const box = resolve(r, W, H)
      if (a.logo) { const rc = contain(box, a.logo.width, a.logo.height, r.h, r.v); g.drawImage(a.logo, rc.x, rc.y, rc.w, rc.h); out.logo = rc; continue }
      // text mark: circle + word
      const f = fitText(c.logo, { w: box.w - box.h * 1.2, h: box.h }, 1, measure(800), 5, 100)
      g.font = `800 ${f.size}px ${c.font}`
      const tw = g.measureText(c.logo).width, d = f.size * 0.95, total = d + f.size * 0.35 + tw
      const x0 = r.h === 'left' ? box.x : r.h === 'right' ? box.x + box.w - total : box.x + (box.w - total) / 2
      const cy = r.v === 'top' ? box.y + d / 2 : r.v === 'bottom' ? box.y + box.h - d / 2 : box.y + box.h / 2
      g.fillStyle = c.ctaBg; g.beginPath(); g.arc(x0 + d / 2, cy, d / 2, 0, Math.PI * 2); g.fill()
      g.fillStyle = c.bg2; g.beginPath(); g.arc(x0 + d / 2, cy, d / 4.5, 0, Math.PI * 2); g.fill()
      g.fillStyle = c.text; g.textBaseline = 'middle'; g.fillText(c.logo, x0 + d + f.size * 0.35, cy + f.size * 0.05)
      out.logo = { x: x0, y: cy - d / 2, w: total, h: d }
    } else if (e.id === 'headline') text('headline', c.headline, 800, c.text)
    else if (e.id === 'sub') text('sub', c.sub, 400, c.text + 'd9')
    else {
      const box = resolve(r, W, H)
      const pad = box.h * 0.45
      const f = fitText(c.cta, { w: box.w - pad * 2, h: box.h * 0.55 }, 1, measure(700), 5, 60)
      g.font = `700 ${f.size}px ${c.font}`
      const bw = Math.min(box.w, g.measureText(c.cta).width + pad * 2)
      const bx = r.h === 'left' ? box.x : r.h === 'right' ? box.x + box.w - bw : box.x + (box.w - bw) / 2
      g.fillStyle = c.ctaBg
      g.beginPath(); g.roundRect(bx, box.y, bw, box.h, Math.min(box.h / 2, 12)); g.fill()
      g.fillStyle = c.ctaText; g.textBaseline = 'middle'; g.textAlign = 'center'
      g.fillText(c.cta, bx + bw / 2, box.y + box.h / 2 + f.size * 0.04)
      g.textAlign = 'left'
      out.cta = { x: bx, y: box.y, w: bw, h: box.h }
    }
  }
  // 1 px border (IAB requires a visible border on white-background ads; harmless otherwise)
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, W - 1, H - 1)
  return out
}

function Thumb({ w, h, s, a, active, onClick }: { w: number; h: number; s: S; a: Assets; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (ref.current) render(ref.current, w, h, 1, s, a) }, [w, h, s, a])
  const sc = Math.min(1, 300 / w, 260 / h)
  return (
    <button type="button" onClick={onClick} style={{ background: 'none', border: active ? '2px solid var(--accent)' : '1px solid var(--line)', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <canvas ref={ref} style={{ width: w * sc, height: h * sc }} />
      <span style={{ fontSize: 12 }}><b>{w}×{h}</b> <span className="muted">{SIZES.find((x) => x.w === w && x.h === h)?.name} · {classify(w, h)}</span></span>
    </button>
  )
}

export default function BannerAdResizer() {
  const [s, set, reset] = useToolState('banner-ad-resizer', DEF)
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null)
  const [prodImg, setProdImg] = useState<HTMLImageElement | null>(null)
  const [report, setReport] = useState<{ name: string; bytes: number }[]>([])
  const product = useMemo(() => sampleProduct(), [])
  const assets: Assets = useMemo(() => ({ product: prodImg ?? product, logo: logoImg }), [prodImg, product, logoImg])
  const big = useRef<HTMLCanvasElement>(null)
  const rects = useRef<Partial<Record<ElementId, Rect>>>({})
  const [ew, eh] = s.edit.split('x').map(Number)
  const cls: LayoutClass = classify(ew, eh)
  const rule = s.rules[cls][s.el]
  const scale = Math.min(1, 620 / ew, 520 / eh)

  useEffect(() => {
    const cv = big.current
    if (!cv) return
    rects.current = render(cv, ew, eh, 2, s, assets)
    if (s.guides) {
      const g = cv.getContext('2d')!
      for (const [id, r] of Object.entries(rects.current) as [ElementId, Rect][]) {
        g.setLineDash(id === s.el ? [] : [4, 3]); g.lineWidth = id === s.el ? 2 : 1
        g.strokeStyle = id === s.el ? '#f43f5e' : 'rgba(255,255,255,0.6)'
        g.strokeRect(r.x, r.y, r.w, r.h)
        const box = resolve(s.rules[cls][id], ew, eh)
        if (id === s.el) { g.setLineDash([2, 2]); g.strokeStyle = 'rgba(244,63,94,0.6)'; g.strokeRect(box.x, box.y, box.w, box.h) }
      }
      g.setLineDash([])
    }
  }, [s, assets, ew, eh, cls])

  const setRule = (p: Partial<typeof rule>) => set({ rules: { ...s.rules, [cls]: { ...s.rules[cls], [s.el]: { ...rule, ...p } } } })
  const setC = (p: Partial<Content>) => set({ c: { ...s.c, ...p } })
  const loadImg = (f: File, cb: (i: HTMLImageElement) => void) => { const i = new Image(); i.onload = () => cb(i); i.src = URL.createObjectURL(f) }
  const chosen = SIZES.filter((z) => s.sizes.includes(key(z.w, z.h)))

  const exportZip = async () => {
    const files: { name: string; data: Uint8Array }[] = []
    const rep: { name: string; bytes: number }[] = []
    for (const z of chosen) {
      const cv = document.createElement('canvas')
      render(cv, z.w, z.h, s.scale, s, assets)
      const blob = await new Promise<Blob>((res) => cv.toBlob((b) => res(b!), `image/${s.fmt}`, s.quality))
      const name = `banner_${z.w}x${z.h}${s.scale === 2 ? '@2x' : ''}.${s.fmt === 'jpeg' ? 'jpg' : 'png'}`
      files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) })
      rep.push({ name, bytes: blob.size })
    }
    setReport(rep)
    download('banners.zip', new Blob([makeZip(files) as BlobPart], { type: 'application/zip' }))
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Creative">
          <Txt label="Headline" value={s.c.headline} onChange={(headline) => setC({ headline })} />
          <Txt label="Subtext" value={s.c.sub} onChange={(sub) => setC({ sub })} />
          <Row>
            <Txt label="Button" value={s.c.cta} onChange={(cta) => setC({ cta })} />
            <Txt label="Logo text" value={s.c.logo} onChange={(logo) => setC({ logo })} />
          </Row>
          <Row>
            {([['bg1', 'Bg 1'], ['bg2', 'Bg 2'], ['text', 'Text'], ['ctaBg', 'Button'], ['ctaText', 'Btn text']] as [keyof Content, string][]).map(([k, l]) => (
              <label key={k} className="k-field" style={{ width: 64 }}><span className="k-label">{l}</span><input type="color" value={s.c[k]} onChange={(e) => setC({ [k]: e.target.value })} style={{ width: '100%', height: 32 }} /></label>
            ))}
          </Row>
          <Select label="Font" value={s.c.font} onChange={(font) => setC({ font })} options={FONTS} />
          <Row>
            <FileDrop accept="image/*" onFiles={([f]) => loadImg(f, setProdImg)} label={prodImg ? 'Product image ✓ (replace)' : 'Product image (PNG with transparency)'} />
            <FileDrop accept="image/*" onFiles={([f]) => loadImg(f, setLogoImg)} label={logoImg ? 'Logo ✓ (replace)' : 'Logo image (optional)'} />
          </Row>
          {(prodImg || logoImg) && <Btn kind="ghost" onClick={() => { setProdImg(null); setLogoImg(null) }}>Use sample artwork</Btn>}
        </Panel>

        <Panel title={`Anchor rules · ${cls} layouts`} actions={<Btn kind="ghost" onClick={() => set({ rules: { ...s.rules, [cls]: DEFAULT_RULES[cls] } })}>Reset {cls}</Btn>}>
          <Seg value={s.el} onChange={(el) => set({ el })} options={ELEMENTS.map((e) => [e.id, e.label] as [ElementId, string])} />
          <Check label="Show this element" value={rule.show} onChange={(show) => setRule({ show })} />
          <Row>
            <Seg value={rule.h} onChange={(h) => setRule({ h, align: h === 'center' ? 'center' : h })} options={[['left', '⇤ Left'], ['center', '↔ Center'], ['right', 'Right ⇥']]} />
            <Seg value={rule.v} onChange={(v) => setRule({ v })} options={[['top', '⤒ Top'], ['middle', '↕ Middle'], ['bottom', 'Bottom ⤓']]} />
          </Row>
          <Row>
            <Slider label="Offset X" value={rule.x} onChange={(x) => setRule({ x })} min={-50} max={50} step={0.5} unit="% W" show={(v) => String(v)} />
            <Slider label="Offset Y" value={rule.y} onChange={(y) => setRule({ y })} min={-50} max={50} step={0.5} unit="% H" show={(v) => String(v)} />
          </Row>
          <Row>
            <Slider label="Width" value={rule.w} onChange={(w) => setRule({ w })} min={2} max={100} step={0.5} unit="% W" show={(v) => String(v)} />
            <Slider label="Height" value={rule.hh} onChange={(hh) => setRule({ hh })} min={2} max={100} step={0.5} unit="% H" show={(v) => String(v)} />
          </Row>
          {(s.el === 'headline' || s.el === 'sub') && <Row><Slider label="Max lines" value={rule.lines} onChange={(lines) => setRule({ lines })} min={1} max={6} show={(v) => String(v)} /><Seg value={rule.align} onChange={(align) => setRule({ align })} options={[['left', 'Left'], ['center', 'Center'], ['right', 'Right']]} /></Row>}
          <p className="muted" style={{ fontSize: 13 }}>Rules apply to every <b>{cls}</b> size (aspect {cls === 'strip' ? '≥ 2.5' : cls === 'tall' ? '≤ 0.6' : 'between 0.6 and 2.5'}). Offsets push away from the anchored edge; text auto-sizes to its box; images keep their aspect.</p>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Sizes" value={chosen.length} sub={`${chosen.filter((z) => classify(z.w, z.h) === 'box').length} box · ${chosen.filter((z) => classify(z.w, z.h) === 'strip').length} strip · ${chosen.filter((z) => classify(z.w, z.h) === 'tall').length} tall`} />
          <Stat label="Editing" value={`${ew}×${eh}`} sub={`${cls} layout`} tone="accent" />
          <Stat label="Output" value={`${s.fmt.toUpperCase()} ${s.scale}×`} sub={report.length ? `${fmtBytes(report.reduce((a, r) => a + r.bytes, 0))} total` : 'zip of all sizes'} />
          <Stat label="Over 150 KB" value={report.length ? report.filter((r) => r.bytes > IAB_MAX_BYTES).length : '—'} tone={report.some((r) => r.bytes > IAB_MAX_BYTES) ? 'bad' : 'good'} sub="IAB initial load" />
        </Stats>
        <Panel title={`${ew}×${eh} — ${SIZES.find((z) => key(z.w, z.h) === s.edit)?.name ?? ''}`} actions={<Check label="Guides" value={s.guides} onChange={(guides) => set({ guides })} />}>
          <div style={{ display: 'flex', justifyContent: 'center', background: 'repeating-conic-gradient(var(--line) 0% 25%, transparent 0% 50%) 50% / 16px 16px', padding: 12, borderRadius: 8 }}>
            <canvas ref={big} style={{ width: ew * scale, height: eh * scale, cursor: 'pointer', maxWidth: '100%' }}
              onClick={(e) => {
                const b = e.currentTarget.getBoundingClientRect(), x = ((e.clientX - b.left) / b.width) * ew, y = ((e.clientY - b.top) / b.height) * eh
                const hit = (Object.entries(rects.current) as [ElementId, Rect][]).reverse().find(([, r]) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
                if (hit) set({ el: hit[0] })
              }} />
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Click an element to edit its rule. Red = selected element (solid) and its rule box (dotted).</p>
        </Panel>
        <Panel title="All sizes" actions={<>
          <Select label="Format" value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['png', 'PNG'], ['jpeg', 'JPEG']] as const} />
          <Select label="Scale" value={s.scale} onChange={(scale) => set({ scale })} options={[[1, '1×'], [2, '2× (retina)']] as const} />
          <Btn kind="primary" onClick={() => void exportZip()}>⬇ ZIP ({chosen.length})</Btn>
        </>}>
          {s.fmt === 'jpeg' && <Slider label="JPEG quality" value={s.quality} onChange={(quality) => set({ quality })} min={0.4} max={1} step={0.02} />}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
            {chosen.map((z) => <Thumb key={key(z.w, z.h)} w={z.w} h={z.h} s={s} a={assets} active={s.edit === key(z.w, z.h)} onClick={() => set({ edit: key(z.w, z.h) })} />)}
          </div>
          <details style={{ marginTop: 10 }}>
            <summary>Choose sizes ({chosen.length}/{SIZES.length})</summary>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', marginTop: 6 }}>
              {SIZES.map((z) => { const k = key(z.w, z.h); return <Check key={k} label={`${k} ${z.name}`} value={s.sizes.includes(k)} onChange={(on) => set({ sizes: on ? [...s.sizes, k] : s.sizes.filter((x) => x !== k) })} /> })}
            </div>
          </details>
          {report.length > 0 && <Table head={['File', 'Size', 'IAB ≤ 150 KB']} rows={report.map((r) => [r.name, fmtBytes(r.bytes), r.bytes > IAB_MAX_BYTES ? '✗ too big — try JPEG' : '✓'])} />}
          <Row><Btn kind="ghost" onClick={reset}>Reset everything</Btn></Row>
        </Panel>
        <Note>Uploaded images stay in memory only (not saved); text, colours, sizes and anchor rules are remembered in this browser.</Note>
      </div>
    </Split>
  )
}
