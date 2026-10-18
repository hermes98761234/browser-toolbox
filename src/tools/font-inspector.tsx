import { useEffect, useMemo, useState } from 'react'
import { Btn, Check, CopyButton, download, FileDrop, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { embedding, featureLabel, NAME_IDS, parseFont, toPath, type Font, type Outline } from './lib/font-inspector'
import { demoFont } from './lib/font-inspector-demo'
import { brotliSupported } from './lib/font-inspector-woff2'
import { fmtBytes } from './lib/image-compressor'

type Tab = 'glyphs' | 'glyph' | 'waterfall'
const DEF = { tab: 'glyphs' as Tab, text: 'The quick brown fox jumps over the lazy dog. 0123456789', points: true, metrics: true, byId: false, feats: {} as Record<string, boolean> }
const SIZES = [12, 16, 20, 24, 32, 40, 56, 72, 96]
const PAGE = 240

interface Loaded { name: string; size: number; bytes: Uint8Array; font: Font | null; error: string; family: string; rendered: boolean }

const hex = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`
const chr = (cp: number) => (cp < 32 || (cp >= 0x7f && cp < 0xa0) ? '' : String.fromCodePoint(cp))
let famSeq = 0

function GlyphSvg({ o, f, family, cp, size, adv }: { o: Outline | null; f: Font; family: string; cp?: number; size: number; adv: number }) {
  const asc = f.hhea?.ascender ?? f.head.yMax, desc = f.hhea?.descender ?? f.head.yMin
  const h = asc - desc, w = Math.max(adv, h * 0.3)
  return (
    <svg viewBox={`${-h * 0.08} ${-asc - h * 0.04} ${w + h * 0.16} ${h * 1.08}`} style={{ width: '100%', height: size, display: 'block' }} aria-hidden>
      {o && (o.contours.length || o.d) ? <path d={toPath(o)} transform="scale(1,-1)" fill="currentColor" /> : cp !== undefined && f.outlines !== 'glyf' ? <text x={0} y={0} fontSize={f.head.unitsPerEm} style={{ fontFamily: `"${family}", monospace` }} fill="currentColor">{chr(cp)}</text> : null}
    </svg>
  )
}

function Detail({ f, gid, cp, family, points, metrics }: { f: Font; gid: number; cp?: number; family: string; points: boolean; metrics: boolean }) {
  const o = f.glyph(gid)
  const adv = f.adv[gid] ?? 0
  const asc = f.hhea?.ascender ?? f.head.yMax, desc = f.hhea?.descender ?? f.head.yMin
  const top = Math.max(asc, o?.yMax ?? 0, f.os2?.winAscent ?? 0), bot = Math.min(desc, o?.yMin ?? 0)
  const left = Math.min(0, o?.xMin ?? 0), right = Math.max(adv, o?.xMax ?? 0, (top - bot) * 0.5)
  const pad = (top - bot) * 0.1, W = right - left + pad * 2 + (top - bot) * 0.35
  const sw = (top - bot) / 300
  const lines: [string, number, string][] = [['baseline', 0, 'var(--fg)'], ['ascender', asc, 'var(--accent)'], ['descender', desc, 'var(--accent)']]
  if (f.os2?.capHeight) lines.push(['cap height', f.os2.capHeight, 'var(--ok)'])
  if (f.os2?.xHeight) lines.push(['x-height', f.os2.xHeight, 'var(--warn)'])
  for (let i = lines.length - 1; i > 0; i--) {
    const j = lines.findIndex((l) => l[1] === lines[i][1])
    if (j < i) {
      lines[j] = [`${lines[j][0]} = ${lines[i][0]}`, lines[j][1], lines[j][2]]
      lines.splice(i, 1)
    }
  }
  const pts = o?.contours.flat() ?? []
  const svg = o ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${o.xMin} ${-o.yMax} ${o.xMax - o.xMin} ${o.yMax - o.yMin}"><path transform="scale(1,-1)" d="${toPath(o)}"/></svg>` : ''
  return (
    <>
      <svg viewBox={`${left - pad} ${-top - pad} ${W} ${top - bot + pad * 2}`} style={{ width: '100%', maxHeight: 460, display: 'block', background: 'var(--panel2)', borderRadius: 10 }}>
        {metrics && (
          <g fontSize={sw * 11} fontFamily="var(--mono)">
            <rect x={0} y={-top - pad} width={adv} height={top - bot + pad * 2} fill="color-mix(in srgb, var(--accent) 6%, transparent)" />
            {lines.map(([n, y, c]) => (
              <g key={n}>
                <line x1={left - pad} x2={left - pad + W} y1={-y} y2={-y} stroke={c} strokeWidth={sw} strokeDasharray={n === 'baseline' ? undefined : `${sw * 6} ${sw * 4}`} opacity={0.75} />
                <text x={right + pad * 0.4} y={-y - sw * 3} fill={c}>{n} {y}</text>
              </g>
            ))}
            {[0, adv].map((x, i) => <line key={i} x1={x} x2={x} y1={-top - pad} y2={-bot + pad} stroke="var(--muted)" strokeWidth={sw} />)}
            {o && <rect x={o.xMin} y={-o.yMax} width={o.xMax - o.xMin} height={o.yMax - o.yMin} fill="none" stroke="var(--err)" strokeWidth={sw} strokeDasharray={`${sw * 2} ${sw * 3}`} opacity={0.6} />}
          </g>
        )}
        {o && (o.contours.length || o.d) ? (
          <path d={toPath(o)} transform="scale(1,-1)" fill="color-mix(in srgb, var(--fg) 82%, transparent)" fillRule="nonzero" />
        ) : cp !== undefined ? (
          <text x={0} y={0} fontSize={f.head.unitsPerEm} style={{ fontFamily: `"${family}"` }} fill="var(--fg)">{chr(cp)}</text>
        ) : null}
        {points && o && !o.d && o.contours.map((c, ci) => (
          <polygon key={ci} points={c.map((p) => `${p.x},${-p.y}`).join(' ')} fill="none" stroke="var(--accent2)" strokeWidth={sw * 0.8} strokeDasharray={`${sw * 3} ${sw * 2}`} />
        ))}
        {points && pts.map((p, i) => (p.on ? <circle key={i} cx={p.x} cy={-p.y} r={sw * 3.2} fill="var(--accent)" /> : <circle key={i} cx={p.x} cy={-p.y} r={sw * 3} fill="var(--panel)" stroke="var(--accent2)" strokeWidth={sw * 1.2} />))}
      </svg>
      <Table
        head={['Glyph', 'Value']}
        rows={[
          ['Glyph ID', gid],
          ['Code point', cp !== undefined ? `${hex(cp)}  ${chr(cp)}` : 'not in cmap'],
          ['Advance width', adv],
          ['Bounding box', o ? `${o.xMin}, ${o.yMin} → ${o.xMax}, ${o.yMax}` : 'empty'],
          ['Side bearings (L / R)', o ? `${o.xMin} / ${adv - o.xMax}` : '—'],
          ['Contours · points', o ? `${o.contours.length} · ${pts.length} (${pts.filter((p) => !p.on).length} off-curve)` : '—'],
          ...(o?.composite.length ? [['Composite of', o.composite.map((g) => `#${g}`).join(' + ')]] : []),
        ]}
      />
      <Row>
        {svg && <Btn onClick={() => download(`glyph-${gid}.svg`, svg, 'image/svg+xml')}>⬇ Glyph SVG</Btn>}
        {o && <CopyButton text={toPath(o)} label="Copy path data" />}
      </Row>
    </>
  )
}

export default function FontInspector() {
  const [s, set] = useToolState('font-inspector', DEF)
  const [L, setL] = useState<Loaded | null>(null)
  const [sel, setSel] = useState(0)
  const [shown, setShown] = useState(PAGE)
  const [filter, setFilter] = useState('')
  const [axes, setAxes] = useState<Record<string, number>>({})

  const open = async (name: string, bytes: Uint8Array) => {
    const family = `fi-font-${++famSeq}`
    let font: Font | null = null, error = ''
    try {
      font = await parseFont(bytes)
    } catch (e) {
      error = (e as Error).message
    }
    let rendered = true
    try {
      const ff = new FontFace(family, bytes.slice().buffer)
      await ff.load()
      document.fonts.add(ff)
    } catch {
      rendered = false
    }
    setL({ name, size: bytes.length, bytes, font, error, family, rendered })
    setSel(font ? (font.cmap.get(65) ?? font.cmap.get(97) ?? 0) : 0)
    setShown(PAGE)
    setAxes(Object.fromEntries((font?.axes ?? []).map((a) => [a.tag, a.def])))
  }

  useEffect(() => {
    let live = true
    const t = setTimeout(() => live && void open('Toolbox Grotesk Demo (generated).ttf', demoFont()), 0)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [])

  const f = L?.font ?? null
  const byGid = useMemo(() => {
    const m = new Map<number, number>()
    if (f) for (const [cp, g] of f.cmap) if (!m.has(g)) m.set(g, cp)
    return m
  }, [f])
  const cells = useMemo(() => {
    if (!f) return [] as { gid: number; cp?: number }[]
    const q = filter.trim()
    if (q) {
      const hexes = [...q.matchAll(/U\+([0-9a-f]{2,6})/gi)].map((m) => parseInt(m[1], 16))
      const cps = hexes.length ? hexes : [...new Set([...q].map((c) => c.codePointAt(0)!))]
      return cps.map((cp) => ({ cp, gid: f.cmap.get(cp) ?? -1 }))
    }
    if (s.byId) return Array.from({ length: f.numGlyphs }, (_, g) => ({ gid: g, cp: byGid.get(g) }))
    return [...f.cmap].sort((a, b) => a[0] - b[0]).map(([cp, gid]) => ({ cp, gid }))
  }, [f, filter, s.byId, byGid])

  const feats = [...new Set([...(f?.gsub?.features ?? []), ...(f?.gpos?.features ?? [])])].sort()
  const featCss = Object.entries(s.feats).filter(([t]) => feats.includes(t)).map(([t, on]) => `"${t}" ${on ? 1 : 0}`).join(', ') || 'normal'
  const varCss = Object.entries(axes).map(([t, v]) => `"${t}" ${v}`).join(', ') || 'normal'
  const n = f?.names ?? {}
  const o2 = f?.os2

  const metricsRows: [string, string | number][] = f
    ? [
        ['Units per em', f.head.unitsPerEm],
        ['hhea ascender / descender / gap', f.hhea ? `${f.hhea.ascender} / ${f.hhea.descender} / ${f.hhea.lineGap}` : '—'],
        ['Typo ascender / descender / gap', o2 ? `${o2.typoAscender} / ${o2.typoDescender} / ${o2.typoLineGap}` : '—'],
        ['Win ascent / descent', o2 ? `${o2.winAscent} / ${o2.winDescent}` : '—'],
        ['Cap height · x-height', o2 ? `${o2.capHeight ?? '—'} · ${o2.xHeight ?? '—'}` : '—'],
        ['Weight · width class', o2 ? `${o2.weight} · ${o2.width}` : '—'],
        ['Italic angle', f.post ? `${f.post.italicAngle}°` : '—'],
        ['Underline position / thickness', f.post ? `${f.post.underlinePosition} / ${f.post.underlineThickness}` : '—'],
        ['Monospaced', f.post ? (f.post.isFixedPitch ? 'yes' : 'no') : '—'],
        ['Font bounding box', `${f.head.xMin}, ${f.head.yMin} → ${f.head.xMax}, ${f.head.yMax}`],
        ['Line height (hhea)', f.hhea ? `${+((f.hhea.ascender - f.hhea.descender + f.hhea.lineGap) / f.head.unitsPerEm).toFixed(3)} em` : '—'],
        ['Vendor · revision', `${o2?.vendor || '—'} · ${+f.head.revision.toFixed(3)}`],
        ['Created · modified', `${f.head.created || '—'} · ${f.head.modified || '—'}`],
        ['Embedding (fsType)', o2 ? embedding(o2.fsType) : '—'],
      ]
    : []

  return (
    <Split wide="right">
      <div>
        <Panel title="Font file">
          <FileDrop accept=".ttf,.otf,.woff,.woff2,.ttc,font/*" onFiles={async ([file]) => file && open(file.name, new Uint8Array(await file.arrayBuffer()))} label="Drop a TTF, OTF, WOFF or WOFF2 font — it never leaves your device" />
          <Row>
            <Btn onClick={() => open('Toolbox Grotesk Demo (generated).ttf', demoFont())}>Load demo font</Btn>
            {L && <Btn kind="ghost" onClick={() => download(L.name.replace(/\.\w+$/, '') + (f?.format.startsWith('WOFF') ? '.woff' : '.ttf'), new Blob([L.bytes as Uint8Array<ArrayBuffer>]), 'font/ttf')}>⬇ Original</Btn>}
          </Row>
          {!brotliSupported() && <Note tone="warn">This browser has no Brotli DecompressionStream, so WOFF2 tables can’t be parsed here (previews still work).</Note>}
          {L?.error && <Note tone="err">{L.error}</Note>}
          {f?.note && <Note>{f.note}</Note>}
          {L && !L.rendered && <Note tone="warn">The browser’s font sanitizer rejected this file, so the waterfall falls back to a system font{f ? ' (the parsed tables and outlines above are still accurate)' : ''}.</Note>}
        </Panel>
        {f && L && (
          <>
            <Stats>
              <Stat label="Family" value={n[16] ?? n[1] ?? '—'} sub={n[17] ?? n[2]} tone="accent" />
              <Stat label="Format" value={f.format.replace(/ \(.*/, '')} sub={f.outlines === 'none' ? 'no outlines' : `${f.outlines} outlines`} />
              <Stat label="Glyphs" value={f.numGlyphs.toLocaleString()} sub={`${f.cmap.size.toLocaleString()} characters mapped`} />
              <Stat label="File size" value={fmtBytes(L.size)} sub={`${f.recs.length} tables`} />
            </Stats>
            <Panel title="Names">
              <Table head={['Field', 'Value']} rows={Object.entries(n).filter(([k]) => NAME_IDS[+k]).map(([k, v]) => [NAME_IDS[+k], <span key={k} style={{ wordBreak: 'break-word' }}>{v.length > 160 ? v.slice(0, 160) + '…' : v}</span>])} />
            </Panel>
            <Panel title="Vertical metrics & flags" actions={<CopyButton label="Copy JSON" text={() => JSON.stringify({ names: n, head: f.head, hhea: f.hhea, os2: f.os2, post: f.post, axes: f.axes, gsub: f.gsub, gpos: f.gpos }, null, 2)} />}>
              <Table head={['Metric', 'Value']} rows={metricsRows} />
            </Panel>
            <Panel title="OpenType layout">
              {f.gsub || f.gpos ? (
                <>
                  <p className="muted" style={{ fontSize: 13, margin: '0 0 6px' }}>Scripts: {[...new Set([...(f.gsub?.scripts ?? []), ...(f.gpos?.scripts ?? [])])].join(', ') || '—'}{f.hasKern ? ' · legacy kern table' : ''}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {feats.map((t) => (
                      <span key={t} title={featureLabel(t)} style={{ fontFamily: 'var(--mono)', fontSize: 12, padding: '2px 8px', borderRadius: 99, border: '1px solid var(--line)', background: f.gsub?.features.includes(t) && f.gpos?.features.includes(t) ? 'var(--panel2)' : f.gpos?.features.includes(t) ? 'color-mix(in srgb, var(--accent2) 12%, transparent)' : 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
                        {t}{featureLabel(t) && <span className="muted"> · {featureLabel(t)}</span>}
                      </span>
                    ))}
                  </div>
                  <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Blue tint = substitution (GSUB), purple = positioning (GPOS).</p>
                </>
              ) : (
                <p className="muted">No GSUB or GPOS table{f.hasKern ? ' (has a legacy kern table)' : ''}.</p>
              )}
              {f.axes.length > 0 && <Table head={['Axis', 'Min', 'Default', 'Max']} rows={f.axes.map((a) => [`${a.tag} ${n[a.nameId] ? `(${n[a.nameId]})` : ''}`, a.min, a.def, a.max])} />}
            </Panel>
            <Panel title="Tables">
              <details>
                <summary className="muted">{f.recs.map((r) => r.tag.trim()).join(' · ')}</summary>
                <Table head={['Tag', 'Size']} rows={f.recs.map((r) => [<code key={r.tag}>{r.tag}</code>, fmtBytes(r.length)])} />
              </details>
            </Panel>
          </>
        )}
      </div>
      <div>
        <Panel title={L ? L.name : 'Preview'} actions={<Seg value={s.tab} onChange={(tab) => set({ tab })} options={[['glyphs', 'Glyphs'], ['glyph', 'Glyph'], ['waterfall', 'Waterfall']]} />}>
          {!L && <p className="muted">Loading…</p>}
          {L && s.tab === 'glyphs' && (
            <>
              <Row>
                <Txt label="Find" value={filter} onChange={setFilter} placeholder="Type characters or U+00E9" />
                {f && <Check label="All glyphs by ID" value={s.byId} onChange={(byId) => set({ byId })} />}
              </Row>
              {!f && <p className="muted">Tables unavailable — showing characters through the browser’s font engine.</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6, marginTop: 8 }}>
                {f && cells.slice(0, shown).map((c, i) => (
                  <button key={i} onClick={() => { if (c.gid >= 0) { setSel(c.gid); set({ tab: 'glyph' }) } }} title={`${c.cp !== undefined ? hex(c.cp) + ' · ' : ''}glyph ${c.gid}`}
                    style={{ border: `1px solid ${c.gid === sel ? 'var(--accent)' : 'var(--line)'}`, background: 'var(--panel2)', borderRadius: 8, padding: '4px 2px 2px', color: c.gid < 0 ? 'var(--err)' : 'var(--fg)', cursor: 'pointer' }}>
                    {c.gid < 0 ? <div style={{ height: 46, display: 'grid', placeItems: 'center', fontSize: 11 }}>missing</div> : <GlyphSvg o={f.glyph(c.gid)} f={f} family={L.family} cp={c.cp} size={46} adv={f.adv[c.gid] || f.head.unitsPerEm / 2} />}
                    <div className="muted" style={{ fontSize: 10, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{c.cp !== undefined ? hex(c.cp) : `#${c.gid}`}</div>
                  </button>
                ))}
              </div>
              {f && cells.length > shown && <Row><Btn onClick={() => setShown(shown + PAGE * 2)}>Show more ({(cells.length - shown).toLocaleString()} left)</Btn></Row>}
            </>
          )}
          {L && s.tab === 'glyph' && f && (
            <>
              <Row>
                <Btn kind="ghost" onClick={() => setSel(Math.max(0, sel - 1))} disabled={sel <= 0}>← Prev</Btn>
                <Btn kind="ghost" onClick={() => setSel(Math.min(f.numGlyphs - 1, sel + 1))} disabled={sel >= f.numGlyphs - 1}>Next →</Btn>
                <Check label="Points" value={s.points} onChange={(points) => set({ points })} />
                <Check label="Metrics" value={s.metrics} onChange={(metrics) => set({ metrics })} />
              </Row>
              <Detail f={f} gid={sel} cp={byGid.get(sel)} family={L.family} points={s.points} metrics={s.metrics} />
            </>
          )}
          {L && s.tab === 'glyph' && !f && <p className="muted">Glyph outlines need the font tables, which couldn’t be read.</p>}
          {L && s.tab === 'waterfall' && (
            <>
              <Txt label="Sample text" value={s.text} onChange={(text) => set({ text })} />
              {feats.length > 0 && (
                <Row>
                  {feats.map((t) => <Check key={t} label={<code title={featureLabel(t)}>{t}</code>} value={s.feats[t] ?? ['liga', 'kern', 'calt', 'clig', 'ccmp', 'locl', 'mark', 'mkmk', 'rlig'].includes(t)} onChange={(v) => set({ feats: { ...s.feats, [t]: v } })} />)}
                </Row>
              )}
              {f?.axes.map((a) => <Slider key={a.tag} label={`${a.tag}${n[a.nameId] ? ` · ${n[a.nameId]}` : ''}`} value={axes[a.tag] ?? a.def} min={a.min} max={a.max} step={(a.max - a.min) / 100} onChange={(v) => setAxes({ ...axes, [a.tag]: v })} show={(v) => v.toFixed(0)} />)}
              <div style={{ marginTop: 10, overflow: 'hidden' }}>
                {SIZES.map((px) => (
                  <div key={px} style={{ display: 'flex', alignItems: 'baseline', gap: 10, borderTop: '1px solid var(--line)', padding: '4px 0' }}>
                    <span className="muted" style={{ fontFamily: 'var(--mono)', fontSize: 11, width: 34, flex: 'none' }}>{px}px</span>
                    <span style={{ fontFamily: `"${L.family}", var(--mono)`, fontSize: px, lineHeight: 1.25, whiteSpace: 'nowrap', fontFeatureSettings: featCss, fontVariationSettings: varCss }}>{s.text || 'Hamburgefonstiv'}</span>
                  </div>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 12 }}>Rendered by the browser from the file itself (FontFace), with the selected OpenType features applied.</p>
            </>
          )}
        </Panel>
      </div>
    </Split>
  )
}
