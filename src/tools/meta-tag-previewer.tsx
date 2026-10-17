import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Area, Btn, CopyButton, download, FileDrop, Note, Panel, Row, Seg, Select, Split, Txt, useToolState } from '../kit'
import { breadcrumb, buildTags, fit, hostOf, lint, parseHead, type Meta } from './lib/meta-tag-previewer'

const DEF: Meta = {
  title: 'How to Grow Tomatoes on a Balcony: A Beginner’s Guide',
  description: 'Pick the right variety, pot size and soil, then water and feed on a simple weekly routine. Our step-by-step guide gets you ripe tomatoes by mid-summer.',
  url: 'https://www.greenbalcony.example/guides/balcony-tomatoes',
  siteName: 'Green Balcony', image: 'https://www.greenbalcony.example/og/balcony-tomatoes.jpg', imageAlt: 'Cherry tomatoes ripening in a pot on a sunny balcony',
  type: 'article', card: 'summary_large_image', twSite: 'greenbalcony', twCreator: 'mia_grows', locale: 'en_US', author: 'Mia Hart', published: '2026-05-04', themeColor: '#16a34a', robots: 'index, follow', keywords: '',
}

let ctx: CanvasRenderingContext2D | null = null
const measure = (font: string) => (s: string) => {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return s.length * 9
  ctx.font = font
  return ctx.measureText(s).width
}
const gTitle = measure('20px Arial, sans-serif')

/** Placeholder share art (used when the image URL can't be loaded here). */
function sampleArt(title: string): string {
  const c = document.createElement('canvas')
  c.width = 1200
  c.height = 630
  const g = c.getContext('2d')!
  const gr = g.createLinearGradient(0, 0, 1200, 630)
  gr.addColorStop(0, '#14532d')
  gr.addColorStop(1, '#65a30d')
  g.fillStyle = gr
  g.fillRect(0, 0, 1200, 630)
  for (let i = 0; i < 9; i++) {
    g.fillStyle = i % 3 ? '#ef4444' : '#f97316'
    g.beginPath()
    g.arc(820 + (i % 3) * 110, 180 + Math.floor(i / 3) * 120, 46, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = '#fff'
  g.font = 'bold 64px system-ui, sans-serif'
  const words = title.split(' ')
  let line = '', y = 200
  for (const w of words) {
    if (g.measureText(line + w).width > 640 && line) { g.fillText(line, 70, y); line = ''; y += 78 }
    line += w + ' '
  }
  g.fillText(line, 70, y)
  g.font = '28px system-ui, sans-serif'
  g.fillText('sample artwork · image URL not reachable', 70, 570)
  return c.toDataURL('image/jpeg', 0.85)
}

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="k-label" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}

export default function MetaTagPreviewer() {
  const [s, set, reset] = useToolState('meta-tag-previewer', DEF)
  const [upload, setUpload] = useState<string>('')
  const [loaded, setLoaded] = useState<{ src: string; size: { w: number; h: number } | 'error' } | null>(null)
  const [paste, setPaste] = useState('')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [msg, setMsg] = useState('')

  const src = upload || s.image.trim()
  useEffect(() => {
    if (!src) return
    let alive = true
    const im = new Image()
    im.onload = () => alive && setLoaded({ src, size: { w: im.naturalWidth, h: im.naturalHeight } })
    im.onerror = () => alive && setLoaded({ src, size: 'error' })
    im.src = src
    return () => { alive = false }
  }, [src])
  const size = loaded && loaded.src === src ? loaded.size : null
  const art = useMemo(() => sampleArt(s.title || 'Your page title'), [s.title])
  const img = !src ? '' : size === 'error' ? art : src
  const tags = buildTags(s)
  const titlePx = gTitle(s.title.trim())
  const issues = lint(s, titlePx, upload ? null : size)
  const host = hostOf(s.url)
  const large = s.card === 'summary_large_image'
  const F = (k: keyof Meta, label: string, hint?: string, type?: string) => <Txt label={label} value={s[k] as string} onChange={(v) => set({ [k]: v } as Partial<Meta>)} hint={hint} type={type} />

  const gW = device === 'desktop' ? 600 : 330
  const gTitleText = fit(s.title || 'Untitled page', device === 'desktop' ? 580 : 320 * 1.9, gTitle)
  const gDesc = fit(s.description, device === 'desktop' ? 1250 : 840, measure('14px Arial, sans-serif'))
  const box = { border: '1px solid #dadde1', borderRadius: 8, overflow: 'hidden', background: '#fff', color: '#1c1e21', maxWidth: 440, fontFamily: 'Helvetica, Arial, sans-serif' } as const
  const imgEl = (ratio: string, style: React.CSSProperties = {}) => img ? <div style={{ aspectRatio: ratio, background: `#ddd url(${JSON.stringify(img)}) center/cover`, ...style }} role="img" aria-label={s.imageAlt} /> : <div style={{ aspectRatio: ratio, background: '#e5e7eb', display: 'grid', placeItems: 'center', color: '#888', ...style }}>no image</div>

  return (
    <Split>
      <div>
        <Panel title="Page details" actions={<Btn kind="ghost" onClick={() => { reset(); setUpload('') }}>Reset</Btn>}>
          {F('title', `Title (${s.title.length} chars)`, '30–60 characters')}
          <Area label={`Description (${s.description.length} chars)`} value={s.description} onChange={(description) => set({ description })} rows={3} />
          {F('url', 'Page URL (canonical)', 'absolute https:// address')}
          <Row>
            {F('siteName', 'Site name')}
            <Select label="og:type" value={s.type} onChange={(type) => set({ type })} options={['website', 'article', 'product', 'profile']} />
          </Row>
          {F('image', 'Share image URL', '1200 × 630 px recommended')}
          <Row>
            <FileDrop accept="image/*" label="…or preview a local image" onFiles={([f]) => { const r = new FileReader(); r.onload = () => setUpload(String(r.result)); r.readAsDataURL(f) }} />
            {upload && <Btn kind="ghost" onClick={() => setUpload('')}>Remove local image</Btn>}
          </Row>
          {F('imageAlt', 'Image alt text')}
          <Row>
            <Select label="Twitter / X card" value={s.card} onChange={(card) => set({ card })} options={[['summary_large_image', 'Large image'], ['summary', 'Summary (small)']]} />
            {F('twSite', 'X @site')}
            {F('twCreator', 'X @creator')}
          </Row>
          <Row>
            {F('author', 'Author')}
            {s.type === 'article' && F('published', 'Published', undefined, 'date')}
            {F('locale', 'Locale')}
          </Row>
          <Row>
            <Select label="Robots" value={s.robots} onChange={(robots) => set({ robots })} options={['index, follow', 'noindex, follow', 'index, nofollow', 'noindex, nofollow']} />
            <label className="k-field" style={{ flex: '0 0 110px' }}><span className="k-label">Theme colour</span><input type="color" value={s.themeColor || '#ffffff'} onChange={(e) => set({ themeColor: e.target.value })} style={{ height: 38, width: '100%', border: 0, background: 'none' }} /></label>
          </Row>
        </Panel>
        <Panel title="Generated tags" actions={<><CopyButton text={tags} /><Btn onClick={() => download('meta-tags.html', tags, 'text/html')}>⬇ .html</Btn></>}>
          <textarea className="k-area mono" readOnly value={tags} rows={16} style={{ width: '100%', fontSize: 12, whiteSpace: 'pre', overflowX: 'auto' }} />
        </Panel>
        <Panel title="Import from existing HTML">
          <Area value={paste} onChange={setPaste} rows={4} placeholder="Paste a page's <head> (View source → copy) to load its tags" mono />
          <Row>
            <Btn onClick={() => { const p = parseHead(paste); const n = Object.keys(p).length; setMsg(n ? `Loaded ${n} field(s).` : 'No meta tags found.'); if (n) set({ ...DEF, ...Object.fromEntries(Object.keys(DEF).map((k) => [k, ''])), type: 'website', card: 'summary_large_image', robots: 'index, follow', ...p } as Meta) }}>Load tags</Btn>
            {msg && <span className="muted">{msg}</span>}
          </Row>
        </Panel>
      </div>
      <div>
        <Panel title="Checks">
          {issues.map((i) => <Note key={i.text} tone={i.tone}>{i.tone === 'ok' ? '✓ ' : i.tone === 'err' ? '✕ ' : '! '}{i.text}</Note>)}
        </Panel>
        <Panel title="Previews" actions={<Seg value={device} onChange={setDevice} options={[['desktop', 'Desktop'], ['mobile', 'Mobile']]} />}>
          <Card label="Google search result">
            <div style={{ background: '#fff', color: '#202124', padding: 14, borderRadius: 8, border: '1px solid #e5e7eb', maxWidth: gW + 28, fontFamily: 'Arial, sans-serif' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ width: 26, height: 26, borderRadius: 13, background: s.themeColor || '#e8eaed', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>{(s.siteName || host)[0]?.toUpperCase()}</span>
                <span style={{ lineHeight: 1.25 }}><span style={{ fontSize: 14, display: 'block' }}>{s.siteName || host}</span><span style={{ fontSize: 12, color: '#4d5156' }}>{breadcrumb(s.url)}</span></span>
              </div>
              <div style={{ color: '#1a0dab', fontSize: 20, lineHeight: 1.3, margin: '4px 0' }}>{gTitleText}</div>
              <div style={{ fontSize: 14, color: '#4d5156', lineHeight: 1.58, display: 'flex', gap: 10 }}>
                <span style={{ flex: 1 }}>{s.type === 'article' && s.published && <span style={{ color: '#70757a' }}>{new Date(`${s.published}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} — </span>}{gDesc}</span>
                {device === 'mobile' && img && <span style={{ width: 92, height: 92, borderRadius: 8, flex: 'none', background: `url(${JSON.stringify(img)}) center/cover` }} />}
              </div>
            </div>
            {s.robots.includes('noindex') && <Note tone="warn">robots “{s.robots}” keeps this page out of search results.</Note>}
          </Card>
          <Card label="Facebook">
            <div style={box}>
              {imgEl('1.91 / 1')}
              <div style={{ background: '#f0f2f5', padding: '10px 12px', borderTop: '1px solid #dadde1' }}>
                <div style={{ fontSize: 12, color: '#606770', textTransform: 'uppercase' }}>{host}</div>
                <div style={{ fontSize: 16, fontWeight: 600, margin: '3px 0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{s.title}</div>
                <div style={{ fontSize: 14, color: '#606770', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{s.description}</div>
              </div>
            </div>
          </Card>
          <Card label={`X (Twitter) · ${large ? 'large image card' : 'summary card'}`}>
            {large ? (
              <div style={{ ...box, borderRadius: 16, border: '1px solid #cfd9de', position: 'relative' }}>
                {imgEl('1.91 / 1')}
                <span style={{ position: 'absolute', left: 12, bottom: 12, background: 'rgba(0,0,0,.77)', color: '#fff', fontSize: 13, padding: '2px 6px', borderRadius: 4, maxWidth: '85%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{s.title}</span>
              </div>
            ) : (
              <div style={{ ...box, borderRadius: 16, border: '1px solid #cfd9de', display: 'flex' }}>
                {imgEl('1 / 1', { width: 130, flex: 'none', borderRight: '1px solid #cfd9de' })}
                <div style={{ padding: '10px 12px', minWidth: 0, fontSize: 15 }}>
                  <div style={{ color: '#536471' }}>{host}</div>
                  <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{s.title}</div>
                  <div style={{ color: '#536471', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{s.description}</div>
                </div>
              </div>
            )}
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>From {host}</div>
          </Card>
          <Card label="LinkedIn">
            <div style={{ ...box, borderRadius: 2 }}>
              {imgEl('1.91 / 1')}
              <div style={{ padding: '8px 12px' }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{s.title}</div>
                <div style={{ fontSize: 12, color: '#666' }}>{host}</div>
              </div>
            </div>
          </Card>
          <Card label="Slack / Discord unfurl">
            <div style={{ borderLeft: `4px solid ${s.themeColor || '#ddd'}`, padding: '4px 12px', maxWidth: 520, background: 'var(--panel)' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{s.siteName || host}</div>
              <div style={{ fontWeight: 700, color: '#1d9bd1', margin: '2px 0' }}>{s.title}</div>
              <div style={{ fontSize: 14, marginBottom: 6 }}>{s.description}</div>
              {img && large && imgEl('1.91 / 1', { maxWidth: 360, borderRadius: 6 })}
            </div>
          </Card>
          <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Approximate mock-ups for planning: each platform caches cards and changes layouts over time. Use their official debuggers to refresh a cached card after you publish.</p>
        </Panel>
      </div>
    </Split>
  )
}
