import { useEffect, useState } from 'react'
import { Area, Btn, CopyButton, Note, Panel, Row, Seg, Select, Slider, Split, Txt, useToolState } from '../kit'
import { type Cat, cssSnippet, FONTS, googleUrl, nearestWeight, PAIRS, RATIOS, scale, stack } from './lib/font-pairing-lab'

type Tpl = 'article' | 'landing' | 'card'
const DEF = {
  head: 'Playfair Display', body: 'Source Sans 3', headWeight: 700, bodyWeight: 400, base: 17, ratio: 1.333, lineHeight: 1.6,
  title: 'The quiet art of choosing type',
  text: 'Good typography is invisible: the reader simply reads. A strong pairing gives headings a voice of their own while the body text stays calm, open and easy on the eyes, even across long paragraphs on a small phone screen.',
  tpl: 'article' as Tpl, dark: false, favs: [] as string[], mood: 'All',
}
const CATS: Cat[] = ['serif', 'sans-serif', 'display', 'handwriting', 'monospace']
const byCat = CATS.map((c) => [c, Object.keys(FONTS).filter((f) => FONTS[f][0] === c).sort()] as const)
const ALL_URL = googleUrl(Object.fromEntries(Object.keys(FONTS).map((f) => [f, [400, 700]])))

function useLink(id: string, href: string) {
  useEffect(() => {
    const el = document.createElement('link')
    el.id = id
    el.rel = 'stylesheet'
    el.href = href
    document.head.appendChild(el)
    return () => el.remove()
  }, [id, href])
}

export default function FontPairingLab() {
  const [s, set, reset] = useToolState('font-pairing-lab', DEF)
  const [status, setStatus] = useState<'loading' | 'ok' | 'fallback'>('loading')
  useLink('fpl-gallery', ALL_URL)
  useLink('fpl-current', googleUrl({ [s.head]: [s.headWeight, 400, 700], [s.body]: [s.bodyWeight, 400, 700] }))
  useEffect(() => {
    let alive = true
    const fs = document.fonts
    if (!fs) return
    const t = setTimeout(async () => {
      try {
        const got = await Promise.all([fs.load(`${nearestWeight(s.head, s.headWeight)} 32px "${s.head}"`), fs.load(`${nearestWeight(s.body, s.bodyWeight)} 16px "${s.body}"`)])
        if (alive) setStatus(got.every((faces) => faces.length > 0) ? 'ok' : 'fallback')
      } catch {
        if (alive) setStatus('fallback')
      }
    }, 600)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [s.head, s.body, s.headWeight, s.bodyWeight])

  const hw = nearestWeight(s.head, s.headWeight), bw = nearestWeight(s.body, s.bodyWeight)
  const id = `${s.head}|${s.body}`
  const fav = s.favs.includes(id)
  const curated = PAIRS.find((p) => p.id === id)
  const moods = ['All', '★ Favorites', ...new Set(PAIRS.map((p) => p.mood))]
  const gallery = s.mood === 'All' ? PAIRS : s.mood === '★ Favorites' ? s.favs.map((f) => PAIRS.find((p) => p.id === f) ?? { id: f, head: f.split('|')[0], body: f.split('|')[1], mood: 'Custom', why: 'Your own combination.' }) : PAIRS.filter((p) => p.mood === s.mood)
  const H = (n: number) => scale(s.base, s.ratio, n)
  const fg = s.dark ? '#e7e9ee' : '#1b1f27', muted = s.dark ? '#9aa3b2' : '#5b6372', bg = s.dark ? '#14171d' : '#fbfaf7', accent = s.dark ? '#f2b56b' : '#b4532a'
  const hs = { fontFamily: stack(s.head), fontWeight: hw, color: fg, lineHeight: 1.15, margin: '0 0 0.4em' }
  const bs = { fontFamily: stack(s.body), fontWeight: bw, fontSize: s.base, lineHeight: s.lineHeight, color: fg }
  const css = cssSnippet({ head: s.head, body: s.body, headWeight: s.headWeight, bodyWeight: s.bodyWeight, base: s.base, ratio: s.ratio, lineHeight: s.lineHeight })
  const pick = (head: string, body: string) => set({ head, body })
  const random = () => {
    const fonts = Object.keys(FONTS)
    const head = fonts[Math.floor(Math.random() * fonts.length)]
    const pool = fonts.filter((f) => FONTS[f][0] !== FONTS[head][0] && FONTS[f][0] !== 'display' && FONTS[f][0] !== 'handwriting')
    set({ head, body: pool[Math.floor(Math.random() * pool.length)] })
  }
  const fontSelect = (label: string, value: string, onChange: (v: string) => void) => (
    <label className="k-field" style={{ flex: '1 1 160px' }}>
      <span className="k-label">{label}</span>
      <select className="k-select" value={value} onChange={(e) => onChange(e.target.value)} style={{ fontFamily: stack(value) }}>
        {byCat.map(([c, list]) => (
          <optgroup key={c} label={c}>{list.map((f) => <option key={f} value={f}>{f}</option>)}</optgroup>
        ))}
      </select>
    </label>
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Pair" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            {fontSelect('Heading font', s.head, (head) => set({ head }))}
            {fontSelect('Body font', s.body, (body) => set({ body }))}
          </Row>
          <Row>
            <Btn onClick={() => set({ head: s.body, body: s.head })}>⇄ Swap</Btn>
            <Btn onClick={random}>🎲 Random</Btn>
            <Btn kind={fav ? 'primary' : 'normal'} onClick={() => set({ favs: fav ? s.favs.filter((f) => f !== id) : [...s.favs, id] })}>{fav ? '★ Saved' : '☆ Save pair'}</Btn>
          </Row>
          {curated && <Note tone="ok"><b>{curated.mood}:</b> {curated.why}</Note>}
          {!curated && FONTS[s.head]?.[0] === FONTS[s.body]?.[0] && s.head !== s.body && <Note tone="warn">Both fonts are {FONTS[s.head][0]} — similar-but-different faces often clash. Contrast categories or use one superfamily.</Note>}
        </Panel>
        <Panel title="Type settings">
          <Row>
            <Select label="Heading weight" value={hw} onChange={(headWeight: number) => set({ headWeight })} options={FONTS[s.head][1].map((w) => [w, String(w)] as [number, string])} />
            <Select label="Body weight" value={bw} onChange={(bodyWeight: number) => set({ bodyWeight })} options={FONTS[s.body][1].map((w) => [w, String(w)] as [number, string])} />
          </Row>
          <Slider label="Body size" value={s.base} min={12} max={24} step={0.5} unit=" px" onChange={(base) => set({ base })} />
          <Slider label="Line height" value={s.lineHeight} min={1.1} max={2.1} step={0.05} onChange={(lineHeight) => set({ lineHeight })} />
          <Select label="Type scale" value={s.ratio} onChange={(ratio: number) => set({ ratio })} options={RATIOS} />
          <p className="k-hint" style={{ margin: 0 }}>h1 {H(3)} px · h2 {H(2)} px · h3 {H(1)} px · body {s.base} px · measure ≈ 60–75 characters per line is ideal.</p>
        </Panel>
        <Panel title="Sample text">
          <Txt label="Headline" value={s.title} onChange={(title) => set({ title })} />
          <Area label="Paragraph" value={s.text} onChange={(text) => set({ text })} rows={5} />
        </Panel>
      </div>
      <div>
        <Panel title="Preview" actions={<>
          <Seg value={s.tpl} onChange={(tpl) => set({ tpl })} options={[['article', 'Article'], ['landing', 'Landing'], ['card', 'Cards']]} label="Template" />
          <Seg value={s.dark ? 'd' : 'l'} onChange={(v) => set({ dark: v === 'd' })} options={[['l', '☀'], ['d', '☾']]} label="Theme" />
        </>}>
          <div style={{ background: bg, borderRadius: 12, padding: 'clamp(16px, 4vw, 40px)', border: '1px solid var(--line)', overflow: 'hidden' }}>
            {s.tpl === 'article' && (
              <article style={{ maxWidth: '36em', margin: '0 auto' }}>
                <div style={{ ...bs, fontSize: s.base * 0.8, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent, fontWeight: 700, marginBottom: 8 }}>Essay · 6 min read</div>
                <h1 style={{ ...hs, fontSize: H(3) }}>{s.title}</h1>
                <p style={{ ...bs, color: muted, fontSize: H(0.5), marginTop: 0 }}>A short guide to contrast, rhythm and restraint.</p>
                <p style={bs}>{s.text}</p>
                <h2 style={{ ...hs, fontSize: H(2), marginTop: '1em' }}>Contrast, not conflict</h2>
                <p style={bs}>Pair fonts that differ clearly in one way — classification, weight or width — and agree in another, such as x-height or proportions. <a style={{ color: accent }}>Links</a>, <b>bold</b> and <i>italic</i> should all still feel like the same voice.</p>
                <blockquote style={{ ...hs, fontSize: H(1), fontStyle: 'italic', borderLeft: `3px solid ${accent}`, paddingLeft: '0.8em', margin: '1em 0' }}>“Typography is what language looks like.”</blockquote>
                <h3 style={{ ...hs, fontSize: H(1) }}>Numbers 0123456789</h3>
                <p style={bs}>Sphinx of black quartz, judge my vow. 3 × 4 = 12 — “quotes” & ampersands.</p>
              </article>
            )}
            {s.tpl === 'landing' && (
              <div style={{ textAlign: 'center', padding: '2em 0' }}>
                <div style={{ ...bs, fontSize: s.base * 0.85, color: accent, fontWeight: 700, letterSpacing: '0.08em' }}>NEW · VERSION 2.0</div>
                <h1 style={{ ...hs, fontSize: H(4), margin: '0.3em 0' }}>{s.title}</h1>
                <p style={{ ...bs, color: muted, fontSize: H(0.5), maxWidth: '30em', margin: '0 auto 1.4em' }}>{s.text.split('. ')[0]}.</p>
                <span style={{ ...bs, display: 'inline-block', background: accent, color: '#fff', padding: '0.7em 1.4em', borderRadius: 999, fontWeight: 700 }}>Get started</span>
                <span style={{ ...bs, display: 'inline-block', padding: '0.7em 1.4em', color: fg, fontWeight: 600 }}>Learn more →</span>
              </div>
            )}
            {s.tpl === 'card' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                {['Morning ritual', 'Field notes', 'Slow travel'].map((t, i) => (
                  <div key={t} style={{ background: s.dark ? '#1d2129' : '#fff', borderRadius: 14, padding: 18, boxShadow: '0 1px 3px rgb(0 0 0 / 0.08)' }}>
                    <div style={{ height: 80, borderRadius: 10, background: [`linear-gradient(135deg,#f2b56b,#b4532a)`, `linear-gradient(135deg,#7dd3fc,#6366f1)`, `linear-gradient(135deg,#86efac,#0f766e)`][i], marginBottom: 12 }} />
                    <h3 style={{ ...hs, fontSize: H(1.5) }}>{t}</h3>
                    <p style={{ ...bs, fontSize: s.base * 0.92, color: muted, margin: 0 }}>{s.text.slice(0, 90)}…</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="k-hint" style={{ margin: '6px 0 0' }}>{status === 'ok' ? '✓ Fonts loaded from Google Fonts.' : status === 'loading' ? 'Loading fonts…' : '⚠ Google Fonts unreachable — showing the fallback stack (Georgia / system sans).'}</p>
        </Panel>
        <Panel title="CSS" actions={<CopyButton text={css} label="Copy CSS" />}>
          <pre style={{ margin: 0, fontSize: 12.5, overflowX: 'auto', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>{css}</pre>
        </Panel>
        <Panel title="Curated pairs" actions={<select className="k-select" value={s.mood} onChange={(e) => set({ mood: e.target.value })} aria-label="Filter" style={{ width: 'auto' }}>{moods.map((m) => <option key={m}>{m}</option>)}</select>}>
          {gallery.length === 0 && <p className="muted">No favorites yet — press “☆ Save pair”.</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
            {gallery.map((p) => (
              <button key={p.id} type="button" onClick={() => pick(p.head, p.body)} style={{ textAlign: 'left', background: p.id === id ? 'color-mix(in srgb, var(--accent) 12%, var(--panel))' : 'var(--panel)', border: `1px solid ${p.id === id ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 12, padding: 12, cursor: 'pointer', color: 'var(--fg)' }}>
                <div style={{ fontFamily: stack(p.head), fontWeight: 700, fontSize: 22, lineHeight: 1.1 }}>{p.head}</div>
                <div style={{ fontFamily: stack(p.body), fontSize: 14, color: 'var(--muted)', margin: '4px 0' }}>with {p.body} — the quick brown fox jumps.</div>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)' }}>{p.mood}{s.favs.includes(p.id) ? ' · ★' : ''}</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </Split>
  )
}
