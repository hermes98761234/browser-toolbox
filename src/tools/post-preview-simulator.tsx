import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Area, Bar, Btn, Check, CopyButton, FileDrop, Note, Panel, Row, Seg, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { countChars, cropRect, tokens, truncate } from './lib/post-preview-simulator'

interface Feed { id: string; name: string; limit: number; url?: number; trunc: number; lines: number; more: string; ratio: number; note: string }

const FEEDS: Feed[] = [
  { id: 'micro', name: 'Microblog', limit: 280, url: 23, trunc: Infinity, lines: Infinity, more: '', ratio: 16 / 9, note: '280 characters, every link counts as 23. Images crop to 16:9 in the timeline.' },
  { id: 'pro', name: 'Professional network', limit: 3000, trunc: 210, lines: 3, more: '…see more', ratio: 1.91, note: 'Feed shows ~210 characters or 3 lines before “see more”. Link images are 1.91:1.' },
  { id: 'photo', name: 'Photo feed', limit: 2200, trunc: 125, lines: 2, more: '… more', ratio: 1, note: 'The image leads; only ~125 characters of caption show. Square or 4:5 portrait.' },
  { id: 'forum', name: 'Community forum', limit: 40000, trunc: 300, lines: 6, more: 'Read more', ratio: 4 / 3, note: 'Title up to 300 characters; body preview is clipped to a few lines.' },
  { id: 'link', name: 'Chat link preview', limit: Infinity, trunc: 155, lines: 3, more: '…', ratio: 1.91, note: 'Unfurled link: title ~60 characters, description ~155, 1.91:1 thumbnail.' },
]

interface State {
  name: string
  handle: string
  title: string
  text: string
  link: string
  portrait: boolean
  fx: number
  fy: number
  dark: boolean
  hidden: string[]
}

const DEF: State = {
  name: 'Northwind Coffee',
  handle: 'northwindcoffee',
  title: 'We’re opening our second roastery — and you can help name the first blend',
  text: 'Big news! ☕ After three years in our tiny corner shop, we’re opening a second roastery downtown on May 4.\n\nTo celebrate, we’re letting YOU name our first single-origin blend. Drop your best name in the comments — the winner gets free coffee for a year.\n\nThanks for every cup, every review and every early-morning visit. See you there! #coffee #smallbusiness @citymarket',
  link: 'https://example.com/blog/second-roastery-opening',
  portrait: false,
  fx: 0.5,
  fy: 0.45,
  dark: false,
  hidden: [],
}

function demoImage(): string {
  const c = document.createElement('canvas')
  c.width = 1600
  c.height = 1000
  const g = c.getContext('2d')!
  const bg = g.createLinearGradient(0, 0, 1600, 1000)
  bg.addColorStop(0, '#78350f')
  bg.addColorStop(1, '#f59e0b')
  g.fillStyle = bg
  g.fillRect(0, 0, 1600, 1000)
  g.fillStyle = 'rgba(255,255,255,0.08)'
  for (let i = 0; i < 40; i++) g.fillRect((i * 173) % 1600, (i * 97) % 1000, 60, 60)
  g.fillStyle = '#fef3c7'
  g.beginPath()
  g.ellipse(800, 470, 260, 80, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#fff7ed'
  g.fillRect(560, 470, 480, 300)
  g.beginPath()
  g.ellipse(800, 770, 240, 50, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#451a03'
  g.beginPath()
  g.ellipse(800, 470, 220, 60, 0, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = 34
  g.strokeStyle = '#fff7ed'
  g.beginPath()
  g.arc(1060, 600, 90, -Math.PI / 2, Math.PI / 2)
  g.stroke()
  g.fillStyle = '#fff'
  g.font = 'bold 72px system-ui, sans-serif'
  g.textAlign = 'center'
  g.fillText('NOW OPEN · MAY 4', 800, 200)
  return c.toDataURL('image/jpeg', 0.85)
}

function Rich({ text, accent }: { text: string; accent: string }) {
  return (
    <>
      {tokens(text).map((t, i) => (t.kind === 'text' ? <span key={i}>{t.t}</span> : <span key={i} style={{ color: accent }}>{t.kind === 'url' ? t.t.replace(/^https?:\/\//, '').slice(0, 26) + (t.t.length > 34 ? '…' : '') : t.t}</span>))}
    </>
  )
}

function Crop({ img, ratio, fx, fy, radius = 12 }: { img: { url: string; w: number; h: number } | null; ratio: number; fx: number; fy: number; radius?: number }) {
  if (!img) return null
  const r = cropRect(img.w, img.h, ratio, fx, fy)
  return (
    <div style={{ position: 'relative', overflow: 'hidden', aspectRatio: String(ratio), borderRadius: radius, background: '#0002' }}>
      <img src={img.url} alt="" style={{ position: 'absolute', width: `${(img.w / r.w) * 100}%`, left: `${(-r.x / r.w) * 100}%`, top: `${(-r.y / r.h) * 100}%`, maxWidth: 'none' }} />
    </div>
  )
}

export default function PostPreviewSimulator() {
  const [s, set, reset] = useToolState('post-preview-simulator', DEF)
  const [img, setImg] = useState<{ url: string; w: number; h: number } | null>(() => ({ url: demoImage(), w: 1600, h: 1000 }))
  const th = s.dark
    ? { bg: '#0f1419', fg: '#e7e9ea', muted: '#8b98a5', line: '#2f3336', accent: '#4ea1f3', card: '#16202a' }
    : { bg: '#ffffff', fg: '#0f1419', muted: '#536471', line: '#e5e7eb', accent: '#1d6fd8', card: '#f7f9fa' }
  const card: CSSProperties = { background: th.bg, color: th.fg, border: `1px solid ${th.line}`, borderRadius: 14, padding: 14, fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', fontSize: 15, lineHeight: 1.4 }
  const initials = s.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const avatar = (size = 40) => <div style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg,#f59e0b,#b45309)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: size * 0.38, flex: 'none' }}>{initials}</div>
  const host = useMemo(() => { try { return new URL(s.link).hostname } catch { return 'example.com' } }, [s.link])
  const body = (f: Feed) => {
    const t = truncate(s.text, f.trunc, f.lines)
    return (
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        <Rich text={t.shown} accent={th.accent} />
        {t.cut && <span style={{ color: th.muted, fontWeight: 600 }}> {f.more}</span>}
      </div>
    )
  }
  const counts = FEEDS.map((f) => ({ f, n: f.id === 'link' ? countChars(s.title) : countChars(f.id === 'forum' ? s.title : s.text, f.url) }))
  const lim = (f: Feed) => (f.id === 'forum' ? 300 : f.id === 'link' ? 60 : f.limit)
  const actions = (items: string[]) => <div style={{ display: 'flex', justifyContent: 'space-between', color: th.muted, fontSize: 13, marginTop: 10, maxWidth: 420 }}>{items.map((a) => <span key={a}>{a}</span>)}</div>

  const render: Record<string, ReactNode> = {
    micro: (
      <div style={{ display: 'flex', gap: 10 }}>
        {avatar()}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div><b>{s.name}</b> <span style={{ color: th.muted }}>@{s.handle} · 2h</span></div>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '2px 0 10px' }}>
            {(() => {
              const over = countChars(s.text, 23) - 280
              if (over <= 0) return <Rich text={s.text} accent={th.accent} />
              const ch = [...s.text]
              const cut = Math.max(0, ch.length - over)
              return <><Rich text={ch.slice(0, cut).join('')} accent={th.accent} /><mark style={{ background: '#fecaca', color: '#7f1d1d' }} title={`${over} characters over the limit`}>{ch.slice(cut).join('')}</mark></>
            })()}
          </div>
          <Crop img={img} ratio={16 / 9} fx={s.fx} fy={s.fy} />
          {actions(['💬 24', '🔁 51', '♡ 386', '📊 12K'])}
        </div>
      </div>
    ),
    pro: (
      <div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          {avatar(48)}
          <div><b>{s.name}</b><div style={{ color: th.muted, fontSize: 13 }}>2,481 followers · 2h · 🌐</div></div>
        </div>
        {body(FEEDS[1])}
        <div style={{ margin: '10px -14px 0' }}><Crop img={img} ratio={1.91} fx={s.fx} fy={s.fy} radius={0} /></div>
        <div style={{ color: th.muted, fontSize: 13, padding: '8px 0', borderBottom: `1px solid ${th.line}` }}>👍❤️ 214 · 37 comments</div>
        {actions(['👍 Like', '💬 Comment', '↗ Share', '✉ Send'])}
      </div>
    ),
    photo: (
      <div style={{ margin: -14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 10 }}>{avatar(32)}<b style={{ fontSize: 14 }}>{s.handle}</b></div>
        <Crop img={img} ratio={s.portrait ? 4 / 5 : 1} fx={s.fx} fy={s.fy} radius={0} />
        <div style={{ padding: 12, fontSize: 14 }}>
          <div style={{ fontSize: 20, marginBottom: 6 }}>♡ 💬 ↗</div>
          <b>1,204 likes</b>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><b>{s.handle}</b> {(() => { const t = truncate(s.text.replace(/\n+/g, ' '), 125, 2); return <><Rich text={t.shown} accent={th.accent} />{t.cut && <span style={{ color: th.muted }}> … more</span>}</> })()}</div>
        </div>
      </div>
    ),
    forum: (
      <div>
        <div style={{ color: th.muted, fontSize: 13 }}>r/localbusiness · Posted by u/{s.handle} · 5h</div>
        <div style={{ fontWeight: 700, fontSize: 18, margin: '4px 0 8px' }}>{truncate(s.title, 300).shown}</div>
        <div style={{ color: th.fg, opacity: 0.9 }}>{body(FEEDS[3])}</div>
        <div style={{ marginTop: 10, maxWidth: 360 }}><Crop img={img} ratio={4 / 3} fx={s.fx} fy={s.fy} radius={8} /></div>
        {actions(['⬆ 1.2k ⬇', '💬 143 Comments', '↗ Share', '★ Save'])}
      </div>
    ),
    link: (
      <div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}><b>{s.name}</b><span style={{ color: th.muted, fontSize: 12 }}>Today at 9:41</span></div>
        <div style={{ color: th.accent, wordBreak: 'break-all', margin: '2px 0 6px' }}>{s.link}</div>
        <div style={{ borderLeft: `4px solid ${th.accent}`, background: th.card, borderRadius: 6, padding: 10, maxWidth: 420 }}>
          <div style={{ color: th.muted, fontSize: 12 }}>{host}</div>
          <div style={{ color: th.accent, fontWeight: 700, margin: '2px 0' }}>{truncate(s.title, 60).shown}{truncate(s.title, 60).cut && '…'}</div>
          <div style={{ fontSize: 14, marginBottom: 8 }}>{(() => { const t = truncate(s.text.replace(/\n+/g, ' '), 155, 3); return t.shown + (t.cut ? '…' : '') })()}</div>
          <Crop img={img} ratio={1.91} fx={s.fx} fy={s.fy} radius={6} />
        </div>
      </div>
    ),
  }

  return (
    <Split>
      <div>
        <Panel title="Post" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Txt label="Display name" value={s.name} onChange={(name) => set({ name })} />
            <Txt label="Handle" value={s.handle} onChange={(handle) => set({ handle: handle.replace(/[^\w.]/g, '') })} />
          </Row>
          <Txt label="Title / headline (forum, link preview)" value={s.title} onChange={(title) => set({ title })} />
          <Area label="Post text" value={s.text} onChange={(text) => set({ text })} rows={8} />
          <Txt label="Link" value={s.link} onChange={(link) => set({ link })} />
          <Row>
            <CopyButton text={s.text} label="Copy text" />
          </Row>
        </Panel>
        <Panel title="Length per feed">
          {counts.map(({ f, n }) => {
            const L = lim(f)
            const t = f.id === 'forum' || f.id === 'link' ? null : truncate(s.text, f.trunc, f.lines)
            return (
              <div key={f.id} style={{ marginBottom: 10 }}>
                <Row wrap={false}>
                  <b style={{ flex: 1 }}>{f.name}{f.id === 'forum' || f.id === 'link' ? ' (title)' : ''}</b>
                  <span style={{ color: n > L ? 'var(--err)' : undefined, fontVariantNumeric: 'tabular-nums' }}>{n} / {L.toLocaleString('en-US')}</span>
                </Row>
                <Bar value={n} max={L} color={n > L ? 'var(--err)' : n > L * 0.9 ? 'var(--warn)' : 'var(--accent)'} />
                {t?.cut && <span className="k-hint">Feed cuts after “…{t.shown.slice(-28).trim()}”</span>}
              </div>
            )
          })}
        </Panel>
        <Panel title="Image & crop">
          <FileDrop accept="image/*" label="Drop an image" onFiles={([f]) => {
            const url = URL.createObjectURL(f)
            const im = new Image()
            im.onload = () => setImg({ url, w: im.naturalWidth, h: im.naturalHeight })
            im.src = url
          }} />
          {img && (
            <>
              <div style={{ position: 'relative', marginTop: 10, cursor: 'crosshair' }} onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                set({ fx: Math.round(((e.clientX - r.left) / r.width) * 100) / 100, fy: Math.round(((e.clientY - r.top) / r.height) * 100) / 100 })
              }}>
                <img src={img.url} alt="Source" style={{ width: '100%', display: 'block', borderRadius: 8 }} />
                {[[16 / 9, '#38bdf8'], [1, '#f472b6'], [1.91, '#a3e635']].map(([ratio, col]) => {
                  const r = cropRect(img.w, img.h, ratio as number, s.fx, s.fy)
                  return <div key={col as string} style={{ position: 'absolute', left: `${(r.x / img.w) * 100}%`, top: `${(r.y / img.h) * 100}%`, width: `${(r.w / img.w) * 100}%`, height: `${(r.h / img.h) * 100}%`, border: `2px dashed ${col}`, pointerEvents: 'none' }} />
                })}
                <div style={{ position: 'absolute', left: `${s.fx * 100}%`, top: `${s.fy * 100}%`, width: 18, height: 18, margin: -9, borderRadius: '50%', border: '3px solid #fff', boxShadow: '0 0 0 2px #0008', pointerEvents: 'none' }} />
              </div>
              <p className="k-hint">Click to set the focal point. Dashed frames: <span style={{ color: '#38bdf8' }}>16:9</span>, <span style={{ color: '#f472b6' }}>1:1</span>, <span style={{ color: '#a3e635' }}>1.91:1</span>. {img.w}×{img.h}px</p>
              <Check label="Photo feed: 4:5 portrait instead of square" value={s.portrait} onChange={(portrait) => set({ portrait })} />
              <Btn kind="ghost" onClick={() => setImg(null)}>Remove image</Btn>
            </>
          )}
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Characters" value={countChars(s.text)} />
          <Stat label="Words" value={(s.text.match(/\S+/g) ?? []).length} />
          <Stat label="Hashtags" value={tokens(s.text).filter((t) => t.kind === 'tag').length} />
          <Stat label="Over limit" value={counts.filter(({ f, n }) => n > lim(f)).length} tone={counts.some(({ f, n }) => n > lim(f)) ? 'bad' : 'good'} sub="feeds" />
        </Stats>
        <Panel title="Previews" actions={<Seg value={s.dark ? 'd' : 'l'} onChange={(v) => set({ dark: v === 'd' })} options={[['l', '☀ Light'], ['d', '☾ Dark']]} label="Theme" />}>
          <Row>
            {FEEDS.map((f) => (
              <Check key={f.id} label={f.name} value={!s.hidden.includes(f.id)} onChange={(v) => set({ hidden: v ? s.hidden.filter((x) => x !== f.id) : [...s.hidden, f.id] })} />
            ))}
          </Row>
          <div style={{ display: 'grid', gap: 18, marginTop: 12 }}>
            {FEEDS.filter((f) => !s.hidden.includes(f.id)).map((f) => (
              <div key={f.id}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{f.name}</div>
                <div className="k-hint" style={{ marginBottom: 6 }}>{f.note}</div>
                <div style={{ ...card, maxWidth: 560 }}>{render[f.id]}</div>
              </div>
            ))}
          </div>
          <Note>Mockups are generic approximations of common feed layouts; exact limits vary by app, device and font.</Note>
        </Panel>
      </div>
    </Split>
  )
}
