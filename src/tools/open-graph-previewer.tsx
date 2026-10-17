import { useMemo, useState } from 'react'
import { Area, Btn, CopyButton, FileDrop, Note, Panel, Row, Seg, Split, Stat, Stats, Table, useToolState } from '../kit'

const IMG = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#0ea5e9"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><circle cx="1010" cy="140" r="220" fill="#fff" opacity=".08"/><circle cx="160" cy="560" r="180" fill="#fff" opacity=".08"/><text x="80" y="300" font-family="system-ui,sans-serif" font-size="78" font-weight="800" fill="#fff">Ship faster with</text><text x="80" y="390" font-family="system-ui,sans-serif" font-size="78" font-weight="800" fill="#fff">offline-first apps</text><text x="80" y="480" font-family="system-ui,sans-serif" font-size="34" fill="#e0e7ff">acme.dev/blog · 8 min read</text></svg>`)

const SAMPLE = `<head>
  <meta charset="utf-8">
  <title>Ship faster with offline-first apps | Acme Blog</title>
  <meta name="description" content="A practical guide to service workers, IndexedDB sync and conflict resolution — with code you can copy into your next project.">
  <link rel="canonical" href="https://acme.dev/blog/offline-first">
  <meta name="theme-color" content="#6366f1">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Acme Blog">
  <meta property="og:title" content="Ship faster with offline-first apps">
  <meta property="og:description" content="Service workers, IndexedDB sync and conflict resolution, explained with copy-paste code.">
  <meta property="og:url" content="https://acme.dev/blog/offline-first">
  <meta property="og:image" content="${IMG.slice(0, 40)}…(sample image)">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Title card: Ship faster with offline-first apps">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@acmedev">
</head>`

type Platform = 'facebook' | 'x' | 'linkedin' | 'slack' | 'discord' | 'imessage' | 'google'
const PLATFORMS: [Platform, string][] = [['facebook', 'Facebook'], ['x', 'X / Twitter'], ['linkedin', 'LinkedIn'], ['slack', 'Slack'], ['discord', 'Discord'], ['imessage', 'iMessage / WhatsApp'], ['google', 'Google']]

interface Meta { tags: [string, string][]; get: (k: string) => string; title: string; desc: string; image: string; url: string; site: string; host: string; card: string; theme: string; icon: string }

function parse(html: string): Meta {
  const doc = new DOMParser().parseFromString(html.includes('<head') || html.includes('<html') ? html : `<head>${html}</head>`, 'text/html')
  const tags: [string, string][] = []
  doc.querySelectorAll('meta').forEach((m) => {
    const k = m.getAttribute('property') ?? m.getAttribute('name') ?? (m.getAttribute('charset') ? 'charset' : m.getAttribute('http-equiv') ?? '')
    const v = m.getAttribute('content') ?? m.getAttribute('charset') ?? ''
    if (k) tags.push([k.toLowerCase(), v])
  })
  const docTitle = doc.querySelector('title')?.textContent?.trim() ?? ''
  if (docTitle) tags.unshift(['<title>', docTitle])
  const canon = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? ''
  if (canon) tags.push(['<link canonical>', canon])
  const icon = doc.querySelector('link[rel~="icon"]')?.getAttribute('href') ?? ''
  if (icon) tags.push(['<link icon>', icon])
  const get = (k: string) => tags.find(([n]) => n === k)?.[1]?.trim() ?? ''
  const url = get('og:url') || canon
  let host = ''
  try { host = url ? new URL(url).hostname.replace(/^www\./, '') : '' } catch { host = '' }
  return {
    tags, get, url, host, icon, theme: get('theme-color'),
    title: get('og:title') || get('twitter:title') || docTitle,
    desc: get('og:description') || get('twitter:description') || get('description'),
    image: get('og:image') || get('og:image:url') || get('twitter:image'),
    site: get('og:site_name') || host,
    card: get('twitter:card') || (get('og:image') ? 'summary_large_image' : 'summary'),
  }
}

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

export default function OpenGraphPreviewer() {
  const [s, set, reset] = useToolState('open-graph-previewer', { html: SAMPLE, platform: 'all' as Platform | 'all' })
  const [local, setLocal] = useState('')
  const m = useMemo(() => parse(s.html), [s.html])
  const isSample = m.image.startsWith('data:image/svg+xml') && m.image.endsWith('(sample image)')
  const img = local || (isSample ? IMG : m.image)
  const [dims, setDims] = useState<[number, number] | null>(null)

  const checks: [boolean | 'warn', string][] = [
    [!!m.get('og:title'), `og:title present${m.get('og:title') ? ` (${m.get('og:title').length} chars)` : ''}`],
    [m.get('og:title').length > 0 && m.get('og:title').length <= 60 ? true : 'warn', 'og:title ≤ 60 characters (longer titles get cut)'],
    [!!m.get('og:description'), 'og:description present'],
    [m.desc.length >= 50 && m.desc.length <= 200 ? true : 'warn', `Description 50–200 characters (now ${m.desc.length})`],
    [!!m.image, 'og:image present'],
    [!m.image || isSample || /^https:\/\//.test(m.image) ? true : 'warn', 'og:image is an absolute https:// URL'],
    [!!(m.get('og:image:width') && m.get('og:image:height')), 'og:image:width / height declared (faster first render)'],
    [dims ? (Math.abs(dims[0] / dims[1] - 1.91) < 0.1 && dims[0] >= 1200 ? true : 'warn') : 'warn', dims ? `Image ${dims[0]}×${dims[1]} (ideal 1200×630, 1.91:1)` : 'Image size unknown (ideal 1200×630)'],
    [!!m.get('og:image:alt'), 'og:image:alt for accessibility'],
    [!!m.get('og:url'), 'og:url (canonical URL for the share)'],
    [!!m.get('og:type'), 'og:type (website, article, product…)'],
    [!!m.get('twitter:card'), 'twitter:card set (X falls back to og:* but needs the card type)'],
    [!!m.get('description'), 'Plain meta description for search engines'],
  ]
  const ok = checks.filter(([c]) => c === true).length

  const fixed = useMemo(() => {
    const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    const t: [string, string, string][] = [
      ['property', 'og:type', m.get('og:type') || 'website'],
      ['property', 'og:site_name', m.site],
      ['property', 'og:title', m.title],
      ['property', 'og:description', m.desc],
      ['property', 'og:url', m.url],
      ['property', 'og:image', isSample ? 'https://example.com/og-image.png' : m.image],
      ['property', 'og:image:width', m.get('og:image:width') || (dims ? String(dims[0]) : '1200')],
      ['property', 'og:image:height', m.get('og:image:height') || (dims ? String(dims[1]) : '630')],
      ['property', 'og:image:alt', m.get('og:image:alt') || m.title],
      ['name', 'twitter:card', m.image ? 'summary_large_image' : 'summary'],
      ['name', 'twitter:title', m.get('twitter:title') || m.title],
      ['name', 'twitter:description', m.get('twitter:description') || m.desc],
      ['name', 'twitter:image', isSample ? 'https://example.com/og-image.png' : m.get('twitter:image') || m.image],
      ['name', 'twitter:site', m.get('twitter:site')],
      ['name', 'description', m.get('description') || m.desc],
    ]
    return t.filter(([, , v]) => v).map(([a, k, v]) => `<meta ${a}="${k}" content="${esc(v)}">`).join('\n')
  }, [m, dims, isSample])

  const pic = (h: number | string, r = 0, w: number | string = '100%') =>
    img ? <img src={img} alt="" onLoad={(e) => setDims([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])} style={{ width: w, height: h, objectFit: 'cover', display: 'block', borderRadius: r, background: '#e2e8f0' }} /> : <div style={{ width: w, height: h, background: '#e2e8f0', borderRadius: r, display: 'grid', placeItems: 'center', color: '#64748b', fontSize: 12 }}>no image</div>
  const host = (m.host || 'example.com').toUpperCase()

  const cards: Record<Platform, React.ReactNode> = {
    facebook: (
      <div style={{ border: '1px solid #dadde1', background: '#fff', color: '#050505', maxWidth: 500, fontFamily: 'Helvetica, Arial, sans-serif' }}>
        {pic(261, 0)}
        <div style={{ background: '#f0f2f5', padding: '10px 12px' }}>
          <div style={{ fontSize: 12, color: '#65676b' }}>{host}</div>
          <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.25, margin: '3px 0' }}>{cut(m.title, 88)}</div>
          <div style={{ fontSize: 14, color: '#65676b' }}>{cut(m.desc, 110)}</div>
        </div>
      </div>
    ),
    x: m.card === 'summary' ? (
      <div style={{ display: 'flex', border: '1px solid #cfd9de', borderRadius: 16, overflow: 'hidden', maxWidth: 500, background: '#fff', color: '#0f1419', fontFamily: 'system-ui, sans-serif' }}>
        {pic(130, 0, 130)}
        <div style={{ padding: 12, fontSize: 15 }}><div style={{ color: '#536471' }}>{m.host}</div><div>{cut(m.title, 70)}</div><div style={{ color: '#536471' }}>{cut(m.desc, 100)}</div></div>
      </div>
    ) : (
      <div style={{ maxWidth: 500, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1px solid #cfd9de' }}>
          {pic(262, 0)}
          <span style={{ position: 'absolute', left: 12, bottom: 12, background: '#000b', color: '#fff', fontSize: 13, padding: '0 6px', borderRadius: 4 }}>{cut(m.title, 70)}</span>
        </div>
        <div style={{ fontSize: 13, color: '#536471', marginTop: 4 }}>From {m.host || 'example.com'}</div>
      </div>
    ),
    linkedin: (
      <div style={{ maxWidth: 552, background: '#fff', color: 'rgba(0,0,0,.9)', fontFamily: 'system-ui, sans-serif', border: '1px solid #e0dfdc' }}>
        {pic(288, 0)}
        <div style={{ padding: '8px 12px', background: '#eef3f8' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{cut(m.title, 70)}</div>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,.6)' }}>{m.host}</div>
        </div>
      </div>
    ),
    slack: (
      <div style={{ borderLeft: '4px solid #dddddd', paddingLeft: 12, maxWidth: 480, fontFamily: 'Lato, system-ui, sans-serif', color: '#1d1c1d', background: '#fff', padding: 10 }}>
        <div style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><b>{m.site}</b></div>
        <div style={{ color: '#1264a3', fontWeight: 700, fontSize: 15 }}>{cut(m.title, 100)}</div>
        <div style={{ fontSize: 15, margin: '2px 0 8px' }}>{cut(m.desc, 180)}</div>
        {pic(180, 8, 340)}
      </div>
    ),
    discord: (
      <div style={{ background: '#2b2d31', borderLeft: `4px solid ${m.theme || '#1e1f22'}`, borderRadius: 4, padding: '8px 16px 16px 12px', maxWidth: 432, color: '#dbdee1', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ fontSize: 12, color: '#b5bac1', margin: '6px 0' }}>{m.site}</div>
        <div style={{ color: '#00a8fc', fontWeight: 600, fontSize: 16 }}>{cut(m.title, 100)}</div>
        <div style={{ fontSize: 14, margin: '6px 0 12px' }}>{cut(m.desc, 300)}</div>
        {pic(210, 4)}
      </div>
    ),
    imessage: (
      <div style={{ maxWidth: 300, borderRadius: 18, overflow: 'hidden', background: '#e9e9eb', color: '#000', fontFamily: '-apple-system, system-ui, sans-serif' }}>
        {pic(157, 0)}
        <div style={{ padding: '8px 12px' }}><div style={{ fontWeight: 600, fontSize: 14 }}>{cut(m.title, 60)}</div><div style={{ fontSize: 13, color: '#6e6e73' }}>{m.host}</div></div>
      </div>
    ),
    google: (
      <div style={{ maxWidth: 600, fontFamily: 'arial, sans-serif', background: '#fff', padding: 12, borderRadius: 8 }}>
        <div style={{ fontSize: 14, color: '#202124' }}>{m.site}</div>
        <div style={{ fontSize: 12, color: '#4d5156' }}>{m.url || 'https://example.com'}</div>
        <div style={{ fontSize: 20, color: '#1a0dab', margin: '4px 0' }}>{cut(m.get('<title>') || m.title, 60)}</div>
        <div style={{ fontSize: 14, color: '#4d5156', lineHeight: 1.58 }}>{cut(m.get('description') || m.desc, 158)}</div>
      </div>
    ),
  }
  const shown = s.platform === 'all' ? PLATFORMS : PLATFORMS.filter(([p]) => p === s.platform)

  return (
    <Split>
      <div>
        <Panel title="Page <head> HTML" actions={<><Btn kind="ghost" onClick={() => set({ html: '' })}>Clear</Btn><Btn kind="ghost" onClick={() => { reset(); setLocal(''); setDims(null) }}>Sample</Btn></>}>
          <Area value={s.html} onChange={(html) => { set({ html }); setDims(null) }} rows={14} mono placeholder="Paste the page source or just the <meta> tags" />
          <p className="k-hint">Tip: in your browser press Ctrl+U (view source) on the page and copy the head. Browsers can't fetch other sites' HTML for you because of CORS, so pasting keeps it 100% offline.</p>
          <FileDrop accept="image/*" onFiles={([f]) => { setLocal(URL.createObjectURL(f)); setDims(null) }} label="Optional: drop a local image to preview as og:image" />
        </Panel>
        <Panel title={`Checklist · ${ok}/${checks.length}`}>
          {checks.map(([c, t]) => (
            <div key={t} style={{ display: 'flex', gap: 8, padding: '3px 0' }}>
              <span>{c === true ? '✅' : c === 'warn' ? '⚠️' : '❌'}</span>
              <span>{t}</span>
            </div>
          ))}
        </Panel>
        <Panel title="Found tags">
          <Table head={['Tag', 'Content']} rows={m.tags.map(([k, v]) => [<code key="k">{k}</code>, <span key="v" style={{ wordBreak: 'break-all' }}>{cut(v, 120)}</span>])} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Score" value={`${Math.round((ok / checks.length) * 100)}%`} tone={ok / checks.length > 0.8 ? 'good' : ok / checks.length > 0.5 ? 'accent' : 'bad'} />
          <Stat label="Title" value={m.title.length} sub="characters" />
          <Stat label="Description" value={m.desc.length} sub="characters" />
          <Stat label="Card type" value={<span style={{ fontSize: '0.75em' }}>{m.card}</span>} />
        </Stats>
        <Panel title="Link previews">
          <Row>
            <Seg value={s.platform} onChange={(platform) => set({ platform })} options={[['all', 'All'], ...PLATFORMS]} />
          </Row>
          {!m.title && <Note tone="warn">No title found. Paste HTML containing &lt;title&gt; or og:title.</Note>}
          {shown.map(([p, n]) => (
            <div key={p} style={{ margin: '14px 0' }}>
              <div className="k-label" style={{ marginBottom: 6 }}>{n}</div>
              {cards[p]}
            </div>
          ))}
          <p className="k-hint">Approximate mock-ups of each platform's card layout. Real crawlers also cache previews; use each platform's debugger to refresh after changes.</p>
        </Panel>
        <Panel title="Recommended tags" actions={<CopyButton text={fixed} />}>
          <pre className="mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12, margin: 0 }}>{fixed}</pre>
        </Panel>
      </div>
    </Split>
  )
}
