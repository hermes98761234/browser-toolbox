import { useMemo, useState } from 'react'
import { Area, Btn, CopyButton, download, FileDrop, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'

interface Icon { id: string; src: string; sizes: string; type: string; purpose: string }
interface Shortcut { id: string; name: string; url: string; description: string }
type Display = 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser'

const DEF = {
  name: 'Trail Notes — Hiking Journal',
  short_name: 'Trail Notes',
  description: 'Log hikes offline, track elevation and share routes with friends.',
  id: '/',
  start_url: '/?source=pwa',
  scope: '/',
  display: 'standalone' as Display,
  orientation: 'any',
  theme_color: '#166534',
  background_color: '#f0fdf4',
  lang: 'en',
  dir: 'ltr',
  categories: 'travel, sports, lifestyle',
  icons: [
    { id: 'i1', src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { id: 'i2', src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { id: 'i3', src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ] as Icon[],
  shortcuts: [
    { id: 's1', name: 'New hike', url: '/hikes/new', description: 'Start logging a hike' },
    { id: 's2', name: 'My routes', url: '/routes', description: '' },
  ] as Shortcut[],
  glyph: '⛰',
  pad: 18,
}
type S = typeof DEF

function build(s: S) {
  const m: Record<string, unknown> = {
    name: s.name, short_name: s.short_name, description: s.description || undefined, id: s.id || undefined,
    start_url: s.start_url, scope: s.scope || undefined, display: s.display, orientation: s.orientation === 'any' ? undefined : s.orientation,
    theme_color: s.theme_color, background_color: s.background_color, lang: s.lang || undefined, dir: s.dir === 'auto' ? undefined : s.dir,
    categories: s.categories.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean),
    icons: s.icons.filter((i) => i.src).map(({ src, sizes, type, purpose }) => ({ src, sizes, type, ...(purpose && purpose !== 'any' ? { purpose } : {}) })),
    shortcuts: s.shortcuts.filter((x) => x.name && x.url).map(({ name, url, description }) => ({ name, url, ...(description ? { description } : {}) })),
  }
  for (const k of Object.keys(m)) if (m[k] === undefined || (Array.isArray(m[k]) && !(m[k] as unknown[]).length)) delete m[k]
  return m
}

/** Draws the icon: source image (or glyph) on the background colour; maskable adds safe-zone padding. */
function drawIcon(size: number, s: S, img: HTMLImageElement | null, maskable: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const pad = maskable ? Math.max(0.1, s.pad / 100) * size : img ? 0 : size * 0.08
  if (maskable || !img) {
    g.fillStyle = s.theme_color
    if (maskable) g.fillRect(0, 0, size, size)
    else {
      const r = size * 0.22
      g.beginPath()
      g.roundRect(0, 0, size, size, r)
      g.fill()
    }
  }
  const inner = size - pad * 2
  if (img) {
    const k = Math.min(inner / img.naturalWidth, inner / img.naturalHeight)
    const w = img.naturalWidth * k, h = img.naturalHeight * k
    g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
  } else {
    g.fillStyle = '#ffffff'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `${Math.round(inner * 0.62)}px system-ui, "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
    g.fillText(s.glyph || s.short_name.slice(0, 2), size / 2, size / 2 + inner * 0.04)
  }
  return c
}

const lum = (hex: string) => {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

const SIZES: [string, number, boolean][] = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true], ['favicon-32.png', 32, false]]

export default function WebManifestGenerator() {
  const [s, set, reset] = useToolState('web-manifest-generator', DEF)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [imported, setImported] = useState('')
  const [err, setErr] = useState('')
  const manifest = useMemo(() => build(s), [s])
  const json = JSON.stringify(manifest, null, 2)

  const previews = useMemo(() => {
    const out: Record<string, string> = {}
    for (const [n, px, mask] of SIZES) out[n] = drawIcon(Math.min(px, 192), s, img, mask).toDataURL()
    return out
  }, [s, img])

  const loadImg = (f: File) => {
    const i = new Image()
    i.onload = () => setImg(i)
    i.src = URL.createObjectURL(f)
  }
  const saveIcon = (n: string, px: number, mask: boolean) => drawIcon(px, s, img, mask).toBlob((b) => b && download(n, b))

  const importJson = () => {
    try {
      const m = JSON.parse(imported) as Record<string, unknown>
      const str = (k: string) => (typeof m[k] === 'string' ? (m[k] as string) : '')
      set({
        name: str('name'), short_name: str('short_name'), description: str('description'), id: str('id'), start_url: str('start_url') || '/', scope: str('scope'),
        display: (['standalone', 'fullscreen', 'minimal-ui', 'browser'].includes(str('display')) ? str('display') : 'browser') as Display,
        orientation: str('orientation') || 'any', theme_color: str('theme_color') || '#000000', background_color: str('background_color') || '#ffffff', lang: str('lang'), dir: str('dir') || 'ltr',
        categories: Array.isArray(m.categories) ? (m.categories as string[]).join(', ') : '',
        icons: Array.isArray(m.icons) ? (m.icons as Partial<Icon>[]).map((i) => ({ id: uid(), src: i.src ?? '', sizes: i.sizes ?? '', type: i.type ?? '', purpose: i.purpose ?? 'any' })) : [],
        shortcuts: Array.isArray(m.shortcuts) ? (m.shortcuts as Partial<Shortcut>[]).map((x) => ({ id: uid(), name: x.name ?? '', url: x.url ?? '', description: x.description ?? '' })) : [],
      })
      setErr('')
      setImported('')
    } catch (e) {
      setErr(`Not valid JSON: ${(e as Error).message}`)
    }
  }

  const sizesOf = (p: string) => s.icons.filter((i) => (i.purpose || 'any').split(' ').includes(p)).flatMap((i) => i.sizes.split(/\s+/)).map((x) => Number(x.split('x')[0]) || (x === 'any' ? 9999 : 0))
  const anyS = sizesOf('any')
  const checks: [boolean | 'warn', string][] = [
    [!!(s.name || s.short_name), 'name or short_name'],
    [s.short_name.length > 0 && s.short_name.length <= 12 ? true : 'warn', `short_name ≤ 12 characters for home screens (now ${s.short_name.length})`],
    [anyS.some((x) => x >= 192), 'Icon of at least 192×192'],
    [anyS.some((x) => x >= 512), 'Icon of at least 512×512 (splash screen, install UI)'],
    [sizesOf('maskable').length > 0 ? true : 'warn', 'Maskable icon (Android adaptive icons)'],
    [!!s.start_url, 'start_url'],
    [s.display !== 'browser', 'display is standalone, fullscreen or minimal-ui'],
    [/^#[0-9a-f]{6}$/i.test(s.theme_color) && /^#[0-9a-f]{6}$/i.test(s.background_color), 'theme_color and background_color'],
    [s.id ? true : 'warn', 'id (stable app identity even if start_url changes)'],
    [!s.scope || s.start_url.startsWith(s.scope) || /^https?:/.test(s.start_url), 'start_url is inside scope'],
    [s.description.length > 0 ? true : 'warn', 'description (shown in install dialogs and stores)'],
  ]
  const ok = checks.filter(([c]) => c === true).length
  const fails = checks.filter(([c]) => c === false).length

  const head = `<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="${s.theme_color}">
<link rel="icon" href="/icons/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-title" content="${s.short_name.replace(/"/g, '&quot;')}">`

  const editIcon = (id: string, p: Partial<Icon>) => set({ icons: s.icons.map((i) => (i.id === id ? { ...i, ...p } : i)) })
  const editSc = (id: string, p: Partial<Shortcut>) => set({ shortcuts: s.shortcuts.map((i) => (i.id === id ? { ...i, ...p } : i)) })
  const cell = (v: string, on: (x: string) => void, w = 140, ph = '') => <input className="k-text" style={{ width: w }} value={v} placeholder={ph} onChange={(e) => on(e.target.value)} />

  return (
    <Split>
      <div>
        <Panel title="App identity" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label="Name" value={s.name} onChange={(name) => set({ name })} />
          <Row>
            <Txt label="Short name" value={s.short_name} onChange={(short_name) => set({ short_name })} hint="Home-screen label" />
            <Txt label="Language" value={s.lang} onChange={(lang) => set({ lang })} />
          </Row>
          <Area label="Description" value={s.description} onChange={(description) => set({ description })} rows={2} />
          <Txt label="Categories (comma separated)" value={s.categories} onChange={(categories) => set({ categories })} />
        </Panel>
        <Panel title="Launch & display">
          <Row>
            <Txt label="start_url" value={s.start_url} onChange={(start_url) => set({ start_url })} />
            <Txt label="scope" value={s.scope} onChange={(scope) => set({ scope })} />
            <Txt label="id" value={s.id} onChange={(id) => set({ id })} />
          </Row>
          <Seg value={s.display} onChange={(display) => set({ display })} options={[['standalone', 'Standalone'], ['fullscreen', 'Fullscreen'], ['minimal-ui', 'Minimal UI'], ['browser', 'Browser']]} />
          <Row>
            <Select label="Orientation" value={s.orientation} onChange={(orientation) => set({ orientation })} options={['any', 'natural', 'portrait', 'portrait-primary', 'landscape', 'landscape-primary']} />
            <Select label="Text direction" value={s.dir} onChange={(dir) => set({ dir })} options={['ltr', 'rtl', 'auto']} />
          </Row>
          <Row>
            <label className="k-field"><span className="k-label">Theme colour</span><span style={{ display: 'flex', gap: 6 }}><input type="color" value={s.theme_color} onChange={(e) => set({ theme_color: e.target.value })} /><input className="k-text" style={{ width: 100 }} value={s.theme_color} onChange={(e) => set({ theme_color: e.target.value })} /></span></label>
            <label className="k-field"><span className="k-label">Background (splash)</span><span style={{ display: 'flex', gap: 6 }}><input type="color" value={s.background_color} onChange={(e) => set({ background_color: e.target.value })} /><input className="k-text" style={{ width: 100 }} value={s.background_color} onChange={(e) => set({ background_color: e.target.value })} /></span></label>
          </Row>
        </Panel>
        <Panel title="Icons" actions={<Btn onClick={() => set({ icons: [...s.icons, { id: uid(), src: '/icons/icon-384.png', sizes: '384x384', type: 'image/png', purpose: 'any' }] })}>+ Icon</Btn>}>
          <Table
            head={['src', 'sizes', 'type', 'purpose', '']}
            rows={s.icons.map((i) => [
              cell(i.src, (src) => editIcon(i.id, { src }), 170),
              cell(i.sizes, (sizes) => editIcon(i.id, { sizes }), 80),
              cell(i.type, (type) => editIcon(i.id, { type }), 90),
              <select key="p" className="k-select" value={i.purpose} onChange={(e) => editIcon(i.id, { purpose: e.target.value })}>{['any', 'maskable', 'monochrome', 'any maskable'].map((p) => <option key={p}>{p}</option>)}</select>,
              <Btn key="x" kind="ghost" onClick={() => set({ icons: s.icons.filter((x) => x.id !== i.id) })}>✕</Btn>,
            ])}
          />
        </Panel>
        <Panel title="Icon generator">
          <FileDrop accept="image/*" onFiles={([f]) => loadImg(f)} label="Drop a square logo (SVG/PNG) — or use the glyph below" />
          <Row>
            <Txt label="Glyph / initials (no logo)" value={s.glyph} onChange={(glyph) => set({ glyph: [...glyph].slice(0, 2).join('') })} />
            {img && <Btn kind="ghost" onClick={() => setImg(null)}>Remove logo</Btn>}
          </Row>
          <Slider label="Maskable safe-zone padding" value={s.pad} onChange={(pad) => set({ pad })} min={10} max={30} unit="%" show={(v) => String(v)} />
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {SIZES.map(([n, px, mask]) => (
              <div key={n} style={{ textAlign: 'center' }}>
                <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto' }}>
                  {previews[n] && <img src={previews[n]} alt={n} width={72} height={72} style={{ borderRadius: mask && n.startsWith('maskable') ? '50%' : 8, imageRendering: px <= 32 ? 'pixelated' : undefined }} />}
                </div>
                <Btn kind="ghost" onClick={() => saveIcon(n, px, mask)}>⬇ {px}px</Btn>
                <div className="k-hint">{n.replace('.png', '')}</div>
              </div>
            ))}
          </div>
          <p className="k-hint">The maskable preview is cropped to a circle like Android launchers do; keep the logo inside the safe zone (inner 80%).</p>
        </Panel>
        <Panel title="Shortcuts (long-press menu)" actions={<Btn onClick={() => set({ shortcuts: [...s.shortcuts, { id: uid(), name: 'New', url: '/', description: '' }] })}>+ Shortcut</Btn>}>
          <Table
            head={['name', 'url', 'description', '']}
            rows={s.shortcuts.map((x) => [cell(x.name, (name) => editSc(x.id, { name }), 110), cell(x.url, (url) => editSc(x.id, { url }), 120), cell(x.description, (description) => editSc(x.id, { description }), 150), <Btn key="x" kind="ghost" onClick={() => set({ shortcuts: s.shortcuts.filter((y) => y.id !== x.id) })}>✕</Btn>])}
          />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Installable checks" value={`${ok}/${checks.length}`} tone={fails ? 'bad' : 'good'} sub={fails ? `${fails} blocking` : 'ready to install'} />
          <Stat label="Icons" value={s.icons.length} />
          <Stat label="Size" value={`${new Blob([json]).size} B`} />
        </Stats>
        <Panel title="Preview">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <div style={{ width: 170, height: 300, borderRadius: 22, border: '6px solid #111', background: 'linear-gradient(160deg,#1e3a8a,#0f766e)', padding: 12, display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', alignContent: 'start', gap: 8, boxSizing: 'border-box' }}>
              {[0, 1, 2, 3].map((k) => (
                <div key={k} style={{ textAlign: 'center', minWidth: 0 }}>
                  <div style={{ width: 38, height: 38, margin: '0 auto', borderRadius: '50%', overflow: 'hidden', background: k === 0 ? undefined : '#ffffff33' }}>
                    {k === 0 && previews['maskable-512.png'] && <img src={previews['maskable-512.png']} alt="" width={38} height={38} />}
                  </div>
                  <div style={{ color: '#fff', fontSize: 9, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k === 0 ? s.short_name || s.name : ['Maps', 'Mail', 'Photos'][k - 1]}</div>
                </div>
              ))}
            </div>
            <div style={{ width: 170, height: 300, borderRadius: 22, border: '6px solid #111', background: s.background_color, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 14, background: s.theme_color }} />
              {previews['icon-512.png'] && <img src={previews['icon-512.png']} alt="" width={64} height={64} />}
              <div style={{ color: lum(s.background_color) > 0.5 ? '#0f172a' : '#f8fafc', fontSize: 13, fontWeight: 600, textAlign: 'center', padding: '0 8px' }}>{s.name}</div>
            </div>
            <div style={{ width: 260, borderRadius: 10, background: '#fff', color: '#202124', boxShadow: '0 4px 20px #0003', padding: 14, alignSelf: 'center', fontFamily: 'system-ui, sans-serif' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {previews['icon-192.png'] && <img src={previews['icon-192.png']} alt="" width={36} height={36} />}
                <div><b style={{ fontSize: 14 }}>Install app?</b><div style={{ fontSize: 12, color: '#5f6368' }}>{s.name}</div></div>
              </div>
              <div style={{ fontSize: 12, color: '#5f6368', margin: '8px 0' }}>{s.description}</div>
              <div style={{ textAlign: 'right' }}><span style={{ color: s.theme_color, fontWeight: 600, fontSize: 13, marginRight: 14 }}>Cancel</span><span style={{ background: s.theme_color, color: '#fff', borderRadius: 4, padding: '4px 10px', fontSize: 13 }}>Install</span></div>
            </div>
          </div>
          <p className="k-hint">Home screen, splash screen (background colour + 512 icon + name) and the browser install prompt.</p>
        </Panel>
        <Panel title="Checklist">
          {checks.map(([c, t]) => <div key={t} style={{ padding: '2px 0' }}>{c === true ? '✅' : c === 'warn' ? '⚠️' : '❌'} {t}</div>)}
        </Panel>
        <Panel title="manifest.webmanifest" actions={<><CopyButton text={json} /><Btn kind="primary" onClick={() => download('manifest.webmanifest', json, 'application/manifest+json')}>⬇ Download</Btn></>}>
          <pre className="mono" style={{ maxHeight: 360, overflow: 'auto', fontSize: 12, margin: 0 }}>{json}</pre>
        </Panel>
        <Panel title="Add to <head>" actions={<CopyButton text={head} />}>
          <pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0 }}>{head}</pre>
          <Note>Serve the file with <code>Content-Type: application/manifest+json</code> over HTTPS. Installation also needs a service worker with a fetch handler on some browsers.</Note>
        </Panel>
        <Panel title="Import an existing manifest">
          <Area value={imported} onChange={setImported} rows={4} mono placeholder='{"name": "…", "icons": [...]}' />
          <Btn onClick={importJson} disabled={!imported.trim()}>Load into editor</Btn>
          {err && <Note tone="err">{err}</Note>}
        </Panel>
      </div>
    </Split>
  )
}
