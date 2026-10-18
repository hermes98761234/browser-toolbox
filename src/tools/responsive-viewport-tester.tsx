import { useEffect, useRef, useState } from 'react'
import { Area, Btn, Check, Note, Num, Panel, Row, Seg, Slider, Txt, uid, useToolState } from '../kit'
import { breakpoint, DEVICES, frameScale, mapScroll, normalizeUrl, oriented, type Device } from './lib/responsive-viewport-tester'

const SAMPLE = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { --c: #4f46e5; font-family: system-ui, sans-serif; }
  body { margin: 0; color: #1f2430; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; background: var(--c); color: #fff; }
  nav a { color: #fff; margin-left: 16px; text-decoration: none; }
  .burger { display: none; font-size: 22px; }
  .hero { padding: 48px 20px; text-align: center; background: linear-gradient(#eef2ff, #fff); }
  .hero h1 { font-size: clamp(28px, 6vw, 56px); margin: 0 0 10px; }
  .bp::after { content: "xs  < 640px"; background: #111; color: #fff; padding: 4px 10px; border-radius: 99px; font: 600 13px monospace; }
  .grid { display: grid; grid-template-columns: 1fr; gap: 16px; padding: 20px; max-width: 1100px; margin: auto; }
  .card { border: 1px solid #e3e5ee; border-radius: 12px; padding: 18px; }
  .card b { display: block; font-size: 18px; margin-bottom: 6px; }
  footer { padding: 30px 20px; background: #f3f4f8; text-align: center; }
  @media (max-width: 639px) { nav { display: none; } .burger { display: block; } }
  @media (min-width: 640px) { .grid { grid-template-columns: 1fr 1fr; } .bp::after { content: "sm  ≥ 640px"; } }
  @media (min-width: 1024px) { .grid { grid-template-columns: repeat(3, 1fr); } .bp::after { content: "lg  ≥ 1024px"; } }
  @media (min-width: 1280px) { .bp::after { content: "xl  ≥ 1280px"; } }
  @media (orientation: landscape) and (max-height: 500px) { .hero { padding: 16px; } }
</style></head>
<body>
  <header><strong>◆ Lumen</strong><nav><a href="#">Product</a><a href="#">Pricing</a><a href="#">Docs</a></nav><span class="burger">☰</span></header>
  <section class="hero"><h1>Build pages that fit</h1><p>One layout, every screen size.</p><span class="bp"></span></section>
  <main class="grid">
    <div class="card"><b>Fluid type</b>Headings scale with the viewport using clamp().</div>
    <div class="card"><b>Grid columns</b>1 column on phones, 2 on tablets, 3 on laptops.</div>
    <div class="card"><b>Collapsing nav</b>Links fold into a menu icon below 640px.</div>
    <div class="card"><b>Landscape</b>Short landscape screens get a tighter hero.</div>
    <div class="card"><b>Scroll sync</b>Scroll any frame: the others follow.</div>
    <div class="card"><b>Paste yours</b>Replace this HTML with your own page.</div>
    <div class="card"><b>Images</b>Use max-width: 100% so media never overflows.</div>
    <div class="card"><b>Touch targets</b>Keep buttons at least 44px tall on phones.</div>
    <div class="card"><b>Line length</b>Aim for 45–75 characters per line of body text.</div>
  </main>
  <footer>Sample page for the Responsive Viewport Tester</footer>
</body></html>`

interface State { mode: 'html' | 'url'; url: string; html: string; on: string[]; custom: Device[]; landscape: boolean; zoom: number; maxH: number; sync: boolean }
const DEF: State = { mode: 'html', url: 'localhost:5173', html: SAMPLE, on: ['ip', 'ipm', 'lap'], custom: [], landscape: false, zoom: 1, maxH: 560, sync: true }

export default function ResponsiveViewportTester() {
  const [s, set, reset] = useToolState('responsive-viewport-tester', DEF)
  const [html, setHtml] = useState(s.html)
  const [nonce, setNonce] = useState(0)
  const [access, setAccess] = useState<Record<string, boolean>>({})
  const [cw, setCw] = useState('600')
  const [ch, setCh] = useState('900')
  const frames = useRef<Record<string, HTMLIFrameElement | null>>({})
  const lock = useRef<{ id: string; t: number } | null>(null)
  const syncRef = useRef(s.sync)
  useEffect(() => { syncRef.current = s.sync }, [s.sync])

  // Debounce srcdoc updates so typing doesn't reload every frame on each key.
  useEffect(() => {
    const t = setTimeout(() => setHtml(s.html), 500)
    return () => clearTimeout(t)
  }, [s.html])

  const all = [...DEVICES, ...s.custom]
  const shown = all.filter((d) => s.on.includes(d.id))
  const url = normalizeUrl(s.url)

  const onScroll = (id: string) => {
    if (!syncRef.current) return
    if (lock.current && lock.current.id !== id) return
    if (lock.current) clearTimeout(lock.current.t)
    lock.current = { id, t: window.setTimeout(() => { lock.current = null }, 150) }
    const src = frames.current[id]?.contentWindow
    if (!src) return
    const se = src.document.scrollingElement ?? src.document.documentElement
    const fromMax = se.scrollHeight - src.innerHeight
    for (const [k, f] of Object.entries(frames.current)) {
      if (k === id || !f) continue
      try {
        const w = f.contentWindow!
        const te = w.document.scrollingElement ?? w.document.documentElement
        w.scrollTo(0, mapScroll(src.scrollY, fromMax, te.scrollHeight - w.innerHeight))
      } catch { /* cross-origin frame: cannot sync */ }
    }
  }
  const onLoad = (id: string) => {
    const f = frames.current[id]
    let ok = false
    try {
      const w = f?.contentWindow
      if (w && w.document) {
        w.addEventListener('scroll', () => onScroll(id), { passive: true })
        ok = true
      }
    } catch { ok = false }
    setAccess((a) => ({ ...a, [id]: ok }))
  }
  const toggle = (id: string) => set({ on: s.on.includes(id) ? s.on.filter((x) => x !== id) : [...s.on, id] })
  const addCustom = () => {
    const w = Math.round(Number(cw)), h = Math.round(Number(ch))
    if (!(w >= 200 && w <= 3840 && h >= 200 && h <= 3000)) return
    const d: Device = { id: uid(), name: `Custom ${w}×${h}`, w, h, dpr: 1, kind: 'custom' }
    set({ custom: [...s.custom, d], on: [...s.on, d.id] })
  }
  const blockedAll = s.mode === 'url' && shown.length > 0 && shown.every((d) => access[d.id] === false)

  return (
    <div>
      <Panel title="Source" actions={<Btn kind="ghost" onClick={() => { reset(); setHtml(SAMPLE) }}>Reset</Btn>}>
        <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['html', 'Paste HTML (always works)'], ['url', 'Load a URL']]} />
        {s.mode === 'url' ? (
          <>
            <Row>
              <Txt label="Page URL" value={s.url} onChange={(v) => set({ url: v })} placeholder="localhost:5173 or https://example.com" hint={url ? `Loading ${url}` : 'Enter a host or full URL'} />
              {url && <a className="k-btn" href={url} target="_blank" rel="noreferrer" style={{ alignSelf: 'center' }}>Open ↗</a>}
            </Row>
            <Note tone="warn">Many public sites refuse to be shown inside another page (X-Frame-Options or a CSP frame-ancestors rule), and frames then stay blank or show an error. Your own dev server (localhost) usually works. Cross-origin frames can't share scroll position, so sync only works in Paste HTML mode or for same-origin pages.</Note>
          </>
        ) : (
          <Area value={s.html} onChange={(v) => set({ html: v })} rows={7} mono />
        )}
      </Panel>
      <Panel title="Viewports">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 4px' }}>
          {all.map((d) => (
            <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <Check label={<>{d.name} <span className="muted" style={{ fontWeight: 400 }}>{d.w}×{d.h}</span></>} value={s.on.includes(d.id)} onChange={() => toggle(d.id)} />
              {d.kind === 'custom' && <Btn kind="ghost" onClick={() => set({ custom: s.custom.filter((x) => x.id !== d.id), on: s.on.filter((x) => x !== d.id) })} title="Remove">✕</Btn>}
            </span>
          ))}
        </div>
        <Row>
          <label className="k-field" style={{ maxWidth: 110 }}><span className="k-label">Width</span><span className="k-input"><input type="number" value={cw} onChange={(e) => setCw(e.target.value)} min={200} max={3840} /></span></label>
          <label className="k-field" style={{ maxWidth: 110 }}><span className="k-label">Height</span><span className="k-input"><input type="number" value={ch} onChange={(e) => setCh(e.target.value)} min={200} max={3000} /></span></label>
          <Btn onClick={addCustom}>+ Custom size</Btn>
          <Btn kind={s.landscape ? 'primary' : 'normal'} onClick={() => set({ landscape: !s.landscape })}>⟳ {s.landscape ? 'Landscape' : 'Portrait'}</Btn>
          <Check label="Sync scrolling" value={s.sync} onChange={(sync) => set({ sync })} />
          <Btn onClick={() => setNonce((n) => n + 1)}>↻ Reload all</Btn>
        </Row>
        <Row>
          <div style={{ minWidth: 200, flex: 1 }}><Slider label="Zoom" value={s.zoom} onChange={(zoom) => set({ zoom })} min={0.25} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} /></div>
          <div style={{ minWidth: 200, flex: 1 }}><Num label="Frame height budget" value={s.maxH} onChange={(maxH) => set({ maxH: Math.max(200, maxH) })} unit="px" min={200} step={20} /></div>
        </Row>
      </Panel>
      {blockedAll && <Note tone="info">If the frames look blank, this site likely blocks embedding. Try Paste HTML: copy the page's HTML (View source) or test your local build.</Note>}
      <div style={{ display: 'flex', gap: 18, overflowX: 'auto', alignItems: 'flex-start', padding: '6px 2px 14px' }}>
        {shown.length === 0 && <Note>Tick at least one viewport.</Note>}
        {shown.map((d) => {
          const [w, h] = oriented(d, s.landscape)
          const k = frameScale(h, s.maxH, s.zoom)
          return (
            <figure key={d.id} style={{ margin: 0, flex: '0 0 auto' }}>
              <figcaption style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, marginBottom: 6, width: Math.max(150, w * k) }}>
                <b>{d.name}</b>
                <span className="muted">{w}×{h} · {Math.round(k * 100)}% · <code>{breakpoint(w)}</code>{access[d.id] === false && s.sync ? ' · no sync' : ''}</span>
              </figcaption>
              <div style={{ width: w * k, height: h * k, overflow: 'hidden', borderRadius: d.kind === 'phone' ? 18 : 8, border: '6px solid #1f2430', background: '#fff', boxSizing: 'content-box' }}>
                <iframe
                  key={`${d.id}-${nonce}-${s.mode}-${s.mode === 'url' ? url : ''}`}
                  ref={(el) => { frames.current[d.id] = el }}
                  title={d.name}
                  src={s.mode === 'url' ? url || 'about:blank' : undefined}
                  srcDoc={s.mode === 'html' ? html : undefined}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                  onLoad={() => onLoad(d.id)}
                  style={{ width: w, height: h, border: 0, transform: `scale(${k})`, transformOrigin: '0 0', display: 'block', background: '#fff' }}
                />
              </div>
            </figure>
          )
        })}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Frames render at the real CSS width, then scale down to fit, so media queries behave exactly as on a device of that width. Device pixel ratio, touch input and the browser's own UI are not emulated; use your browser's device toolbar for those.</p>
    </div>
  )
}
