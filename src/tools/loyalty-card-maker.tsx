import { Area, Btn, Check, download, FileDrop, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { cardSvg, layoutSheet, PAGES, sheetSvg, SIZES, type Design } from './lib/loyalty-card-maker'

const BASE: Design = {
  business: 'Bean & Leaf', tagline: 'Neighbourhood coffee bar', reward: 'Your 10th coffee is on us!', stamps: 10, icon: '☕', shape: 'circle',
  bg: '#fff7ed', bg2: '#fde7cf', accent: '#9a3412', ink: '#431407', font: 'rounded', radius: 3, logo: '', freeLast: true, numbers: true, preview: 3,
  backTitle: 'How it works', terms: 'One stamp per hot or iced drink. Card has no cash value and cannot be combined with other offers. Lost cards cannot be replaced.',
  address: '14 Market Lane, Riverside', phone: '(555) 014-2233', web: 'beanandleaf.example', nameLine: true, expiryLine: true,
}

const PRESETS: { name: string; d: Partial<Design> }[] = [
  { name: 'Coffee bar', d: { ...BASE } },
  { name: 'Hair salon', d: { business: 'Studio Lumen', tagline: 'Cut · Colour · Care', reward: '6th cut half price', stamps: 6, icon: '✂', shape: 'rounded', bg: '#faf5ff', bg2: '#ede9fe', accent: '#7e22ce', ink: '#3b0764', font: 'serif', backTitle: 'Your visits', terms: 'One stamp per paid service over $25. Valid for 12 months from first stamp.', address: '220 Elm Street', phone: '(555) 300-7781', web: 'studiolumen.example' } },
  { name: 'Bakery', d: { business: 'Golden Crumb', tagline: 'Baked fresh every morning', reward: '8 pastries → 1 free', stamps: 8, icon: '🥐', shape: 'circle', bg: '#fffbeb', bg2: '#fef3c7', accent: '#b45309', ink: '#451a03', font: 'serif', backTitle: 'Sweet rewards', terms: 'One stamp per pastry or loaf. Free item of equal or lesser value.', address: '3 Mill Road', phone: '(555) 120-4410', web: 'goldencrumb.example' } },
  { name: 'Car wash', d: { business: 'SparkleWash', tagline: 'Express & detailing', reward: 'Every 5th wash FREE', stamps: 5, icon: '🚗', shape: 'square', bg: '#eff6ff', bg2: '#dbeafe', accent: '#1d4ed8', ink: '#172554', font: 'sans', backTitle: 'Wash club', terms: 'Stamp per Deluxe wash or above. One card per vehicle.', address: 'Route 9 & Oak Ave', phone: '(555) 700-9274', web: 'sparklewash.example' } },
  { name: 'Pet groomer', d: { business: 'Happy Paws', tagline: 'Grooming with love', reward: '10th groom free + bandana', stamps: 10, icon: '🐾', shape: 'circle', bg: '#f0fdfa', bg2: '#ccfbf1', accent: '#0f766e', ink: '#134e4a', font: 'rounded', backTitle: 'Good dog rewards', terms: 'One stamp per full groom. Please book ahead for weekends.', address: '58 Bark Street', phone: '(555) 455-1290', web: 'happypaws.example' } },
  { name: 'Smoothie bar', d: { business: 'Berry Good', tagline: 'Fresh juices & bowls', reward: '12 stamps = free large bowl', stamps: 12, icon: '🍓', shape: 'rounded', bg: '#fff1f2', bg2: '#ffe4e6', accent: '#be123c', ink: '#4c0519', font: 'sans', backTitle: 'Stay fresh', terms: 'One stamp per smoothie or bowl. Expires 6 months after issue.', address: 'Unit 4, Harbour Walk', phone: '(555) 233-8812', web: 'berrygood.example' } },
]

const ICONS = ['☕', '★', '♥', '✂', '🥐', '🍕', '🍔', '🍦', '🍓', '🐾', '🚗', '💅', '📚', '🌿', '🍺', '✓']

const DEF = { d: BASE, size: 'us', page: 'letter', margin: 12.7, gap: 0, crop: true, rotate: true, sheets: 1, view: 'both' as 'front' | 'back' | 'both' }

function printHtml(pages: string[], pw: number, ph: number) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Loyalty cards</title><style>@page{size:${pw}mm ${ph}mm;margin:0}html,body{margin:0;padding:0}.p{width:${pw}mm;height:${ph}mm;page-break-after:always;break-after:page;overflow:hidden}.p:last-child{page-break-after:auto}svg{display:block}</style></head><body>${pages.map((p) => `<div class="p">${p}</div>`).join('')}</body></html>`
  const f = document.createElement('iframe')
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(f)
  const doc = f.contentDocument!
  doc.open()
  doc.write(html)
  doc.close()
  setTimeout(() => {
    f.contentWindow?.focus()
    f.contentWindow?.print()
    setTimeout(() => f.remove(), 2000)
  }, 400)
}

async function svgToPng(svg: string, wmm: number, hmm: number, dpi = 300): Promise<Blob | null> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const c = document.createElement('canvas')
    c.width = Math.round((wmm / 25.4) * dpi)
    c.height = Math.round((hmm / 25.4) * dpi)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    return await new Promise((r) => c.toBlob(r, 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

export default function LoyaltyCardMaker() {
  const [s, set, reset] = useToolState('loyalty-card-maker', DEF)
  const d = s.d
  const upd = (p: Partial<Design>) => set({ d: { ...d, ...p } })
  const card = SIZES.find((c) => c.id === s.size) ?? SIZES[0]
  const page = PAGES[s.page] ?? PAGES.letter
  const sheet = layoutSheet(page.w, page.h, card.w, card.h, s.margin, s.gap, s.rotate)
  const front = cardSvg(d, card.w, card.h, 'front')
  const back = cardSvg(d, card.w, card.h, 'back')
  const dp = { ...d, preview: 0 }
  const sheetFront = sheetSvg(dp, page.w, page.h, card, sheet, 'front', s.crop)
  const slug = d.business.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'loyalty-card'
  const print = (which: 'front' | 'back' | 'duplex') => {
    const pages: string[] = []
    for (let i = 0; i < s.sheets; i++) {
      if (which !== 'back') pages.push(sheetFront)
      if (which !== 'front') pages.push(sheetSvg(dp, page.w, page.h, card, sheet, 'back', s.crop))
    }
    printHtml(pages, page.w, page.h)
  }
  const preview = (svg: string, label: string) => (
    <figure style={{ margin: 0, flex: '1 1 260px' }}>
      <div style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,.18))' }} dangerouslySetInnerHTML={{ __html: svg.replace(/width="[^"]+mm" height="[^"]+mm"/, 'width="100%"') }} />
      <figcaption className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 6 }}>{label}</figcaption>
    </figure>
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Template" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            {PRESETS.map((p) => (
              <Btn key={p.name} onClick={() => set({ d: { ...BASE, ...p.d, logo: d.logo } })}>{p.d.icon} {p.name}</Btn>
            ))}
          </Row>
        </Panel>
        <Panel title="Front">
          <Txt label="Business name" value={d.business} onChange={(business) => upd({ business })} />
          <Txt label="Tagline" value={d.tagline} onChange={(tagline) => upd({ tagline })} />
          <Txt label="Reward text" value={d.reward} onChange={(reward) => upd({ reward })} />
          <Slider label="Stamps" value={d.stamps} min={4} max={20} onChange={(stamps) => upd({ stamps, preview: Math.min(d.preview, stamps) })} />
          <div className="k-label">Stamp icon</div>
          <Row>
            {ICONS.map((ic) => (
              <button key={ic} type="button" className={`k-btn ${ic === d.icon ? 'primary' : ''}`} style={{ minWidth: 38, padding: '4px 6px' }} onClick={() => upd({ icon: ic })} aria-label={`Icon ${ic}`}>{ic}</button>
            ))}
          </Row>
          <div className="k-label" style={{ marginTop: 8 }}>Stamp box</div>
          <Seg value={d.shape} onChange={(shape) => upd({ shape })} options={[['circle', 'Circle'], ['rounded', 'Rounded'], ['square', 'Square']]} />
          <Check label="Last box says FREE" value={d.freeLast} onChange={(freeLast) => upd({ freeLast })} />
          <Check label="Number empty boxes" value={d.numbers} onChange={(numbers) => upd({ numbers })} />
          <Slider label="Preview stamps (screen only)" value={d.preview} min={0} max={d.stamps} onChange={(p) => upd({ preview: p })} />
          <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>Printed cards always come out empty.</p>
        </Panel>
        <Panel title="Style">
          <Row>
            <label className="k-field"><span className="k-label">Background</span><input type="color" value={d.bg} onChange={(e) => upd({ bg: e.target.value })} /></label>
            <label className="k-field"><span className="k-label">Gradient to</span><input type="color" value={d.bg2} onChange={(e) => upd({ bg2: e.target.value })} /></label>
            <label className="k-field"><span className="k-label">Accent</span><input type="color" value={d.accent} onChange={(e) => upd({ accent: e.target.value })} /></label>
            <label className="k-field"><span className="k-label">Text</span><input type="color" value={d.ink} onChange={(e) => upd({ ink: e.target.value })} /></label>
          </Row>
          <Select label="Font" value={d.font} onChange={(font) => upd({ font })} options={[['sans', 'Clean sans'], ['serif', 'Classic serif'], ['rounded', 'Friendly rounded'], ['mono', 'Typewriter']]} />
          <Slider label="Corner radius" value={d.radius} min={0} max={8} step={0.5} unit=" mm" onChange={(radius) => upd({ radius })} />
          <div className="k-label">Logo (optional)</div>
          <FileDrop accept="image/*" label={d.logo ? 'Replace logo' : 'Drop a logo (PNG/SVG/JPG)'} onFiles={([f]) => {
            const r = new FileReader()
            r.onload = () => upd({ logo: String(r.result) })
            r.readAsDataURL(f)
          }} />
          {d.logo && <Btn kind="ghost" onClick={() => upd({ logo: '' })}>Remove logo</Btn>}
          {d.logo.length > 400_000 && <Note tone="warn">Large logo — it is stored in your browser; use a smaller file if saving fails.</Note>}
        </Panel>
        <Panel title="Back">
          <Txt label="Heading" value={d.backTitle} onChange={(backTitle) => upd({ backTitle })} />
          <Area label="Terms" value={d.terms} onChange={(terms) => upd({ terms })} rows={3} />
          <Txt label="Address" value={d.address} onChange={(address) => upd({ address })} />
          <Row>
            <Txt label="Phone" value={d.phone} onChange={(phone) => upd({ phone })} />
            <Txt label="Website" value={d.web} onChange={(web) => upd({ web })} />
          </Row>
          <Check label="“Name” line" value={d.nameLine} onChange={(nameLine) => upd({ nameLine })} />
          <Check label="“Valid until” line" value={d.expiryLine} onChange={(expiryLine) => upd({ expiryLine })} />
        </Panel>
      </div>
      <div>
        <Panel title="Card preview" actions={<Seg value={s.view} onChange={(view) => set({ view })} options={[['both', 'Both'], ['front', 'Front'], ['back', 'Back']]} />}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, padding: '8px 4px' }}>
            {s.view !== 'back' && preview(front, `Front · ${card.w} × ${card.h} mm`)}
            {s.view !== 'front' && preview(back, 'Back')}
          </div>
          <Row>
            <Btn onClick={() => download(`${slug}-front.svg`, cardSvg(dp, card.w, card.h, 'front'), 'image/svg+xml')}>⬇ Front SVG</Btn>
            <Btn onClick={() => download(`${slug}-back.svg`, back, 'image/svg+xml')}>⬇ Back SVG</Btn>
            <Btn onClick={() => void svgToPng(cardSvg(dp, card.w, card.h, 'front'), card.w, card.h).then((b) => b && download(`${slug}-front.png`, b))}>⬇ Front PNG (300 dpi)</Btn>
          </Row>
        </Panel>
        <Stats>
          <Stat label="Cards per sheet" value={sheet.perPage} tone={sheet.perPage ? 'accent' : 'bad'} sub={`${sheet.cols} × ${sheet.rows}${sheet.rotated ? ', rotated' : ''}`} />
          <Stat label="Sheets" value={s.sheets} />
          <Stat label="Cards total" value={sheet.perPage * s.sheets} />
          <Stat label="Paper use" value={`${Math.round(((sheet.perPage * card.w * card.h) / (page.w * page.h)) * 100)}%`} />
        </Stats>
        <Panel title="Print layout">
          <Row>
            <Select label="Card size" value={s.size} onChange={(size) => set({ size })} options={SIZES.map((c) => [c.id, c.label] as [string, string])} />
            <Select label="Paper" value={s.page} onChange={(p) => set({ page: p })} options={Object.entries(PAGES).map(([k, v]) => [k, v.label] as [string, string])} />
          </Row>
          <Row>
            <Num label="Margin" value={s.margin} onChange={(margin) => set({ margin })} unit="mm" min={0} max={40} />
            <Num label="Gap between cards" value={s.gap} onChange={(gap) => set({ gap })} unit="mm" min={0} max={20} />
            <Num label="Sheets" value={s.sheets} onChange={(sheets) => set({ sheets: Math.max(1, Math.min(50, Math.round(sheets))) })} min={1} max={50} />
          </Row>
          <Check label="Crop marks" value={s.crop} onChange={(crop) => set({ crop })} />
          <Check label="Rotate cards when more fit" value={s.rotate} onChange={(rotate) => set({ rotate })} />
          {sheet.perPage === 0 && <Note tone="err">The card does not fit on the page with these margins.</Note>}
          <div style={{ maxWidth: 360, margin: '10px auto', boxShadow: '0 2px 12px rgba(0,0,0,.15)', background: '#fff' }} dangerouslySetInnerHTML={{ __html: sheetFront.replace(/width="[^"]+mm" height="[^"]+mm"/, 'width="100%"') }} />
          <Row>
            <Btn kind="primary" disabled={!sheet.perPage} onClick={() => print('front')}>🖨 Print fronts</Btn>
            <Btn disabled={!sheet.perPage} onClick={() => print('back')}>🖨 Print backs</Btn>
            <Btn disabled={!sheet.perPage} onClick={() => print('duplex')}>🖨 Duplex (front + back)</Btn>
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>
            Print at 100% / “Actual size” on card stock (250–350 g/m²). Backs are mirrored for double-sided printing flipped on the long edge; for single-sided printers print fronts, reload the sheet face-down and print backs. Use a gap of 3–5 mm if you cut with scissors rather than a guillotine.
          </p>
        </Panel>
      </div>
    </Split>
  )
}
