import { useMemo, useState } from 'react'
import { Area, Btn, Check, CopyButton, download, FileDrop, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { buildSprite, processIcon, SAMPLES, standalone, uniqueIds, type ColorMode } from './lib/icon-sprite-builder'

interface Src { key: string; name: string; svg: string }
interface State { icons: Src[]; prefix: string; color: ColorMode; titles: boolean; hidden: boolean; previewColor: string; size: number; file: string }

const DEF: State = {
  icons: SAMPLES.map(([name, svg]) => ({ key: name, name, svg })),
  prefix: 'icon-', color: 'keep', titles: true, hidden: false, previewColor: '#4f46e5', size: 40, file: 'sprite.svg',
}
type Usage = 'external' | 'inline' | 'css' | 'react'

const pre = { fontFamily: 'var(--mono)', fontSize: 12.5, background: '#0b1220', color: '#e2e8f0', padding: 12, borderRadius: 10, margin: 0, overflow: 'auto', whiteSpace: 'pre' } as const

export default function IconSpriteBuilder() {
  const [s, set, reset] = useToolState('icon-sprite-builder', DEF)
  const [paste, setPaste] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [usage, setUsage] = useState<Usage>('external')

  const built = useMemo(() => {
    const ids = uniqueIds(s.icons.map((i) => i.name), s.prefix)
    return s.icons.map((src, i) => ({ src, icon: processIcon(src.svg, ids[i], s.color) }))
  }, [s.icons, s.prefix, s.color])
  const sprite = useMemo(() => buildSprite(built.map((b) => ({ icon: b.icon, title: b.src.name })), { titles: s.titles, hidden: s.hidden }), [built, s.titles, s.hidden])
  const srcBytes = s.icons.reduce((a, i) => a + i.svg.length, 0)
  const cur = built.find((b) => b.src.key === sel) ?? built[0]
  const warnCount = built.reduce((a, b) => a + b.icon.warnings.length, 0)
  const dupes = s.icons.length - new Set(s.icons.map((i) => i.name.toLowerCase())).size
  const badPrefix = s.prefix !== '' && !/^[A-Za-z][\w-]*$/.test(s.prefix)

  const add = (items: { name: string; svg: string }[]) => set({ icons: [...s.icons, ...items.map((x) => ({ ...x, key: uid() }))] })
  const ref = (id: string) => (usage === 'inline' ? `#${id}` : `${s.file}#${id}`)
  const snippet = (id: string, name: string) => {
    if (usage === 'css') return `.icon {\n  width: 1em;\n  height: 1em;\n  vertical-align: -0.125em;\n  fill: currentColor; /* for fill-based icons */\n}\n.icon-${name.replace(/\W+/g, '-')} { color: ${s.previewColor}; }`
    if (usage === 'react') return `export function Icon({ name, title, ...props }) {\n  return (\n    <svg className="icon" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} {...props}>\n      {title && <title>{title}</title>}\n      <use href={\`${s.file}#${s.prefix}\${name}\`} />\n    </svg>\n  )\n}\n\n// <Icon name="${id.slice(s.prefix.length)}" />`
    return `<svg class="icon" aria-hidden="true">\n  <use href="${ref(id)}"></use>\n</svg>`
  }

  return (
    <Split>
      <div>
        <Panel title="Icons" actions={<><Btn onClick={() => set({ icons: DEF.icons })}>Samples</Btn><Btn kind="ghost" onClick={() => set({ icons: [] })}>Clear</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <FileDrop accept=".svg,image/svg+xml" multiple onFiles={async (fs) => add(await Promise.all(fs.map(async (f) => ({ name: f.name.replace(/\.svg$/i, ''), svg: await f.text() }))))} label="Drop SVG files or click to choose (multiple)" />
          <Area value={paste} onChange={setPaste} rows={3} mono placeholder="…or paste SVG markup here" />
          <Btn disabled={!/<svg[\s>]/i.test(paste)} onClick={() => { add([{ name: `icon-${s.icons.length + 1}`, svg: paste }]); setPaste('') }}>Add pasted SVG</Btn>
          <div style={{ marginTop: 10, display: 'grid', gap: 6, maxHeight: 420, overflow: 'auto' }}>
            {built.map(({ src, icon }, i) => (
              <div key={src.key} style={{ display: 'grid', gridTemplateColumns: '34px 1fr auto auto auto', gap: 6, alignItems: 'center' }}>
                <img alt="" width={28} height={28} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(standalone(icon, s.previewColor))}`} />
                <input className="k-text" value={src.name} aria-label="Icon name" onChange={(e) => set({ icons: s.icons.map((x) => (x.key === src.key ? { ...x, name: e.target.value } : x)) })} />
                <button type="button" className="k-btn ghost" title="Move up" disabled={i === 0} onClick={() => { const a = s.icons.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; set({ icons: a }) }}>↑</button>
                <span className="muted" style={{ fontSize: 12, minWidth: 54, textAlign: 'right' }}>{icon.bytes} B{icon.warnings.length ? ' ⚠' : ''}</span>
                <button type="button" className="k-btn ghost" title="Remove" onClick={() => set({ icons: s.icons.filter((x) => x.key !== src.key) })}>✕</button>
              </div>
            ))}
          </div>
          {s.icons.length > 1 && <Btn kind="ghost" onClick={() => set({ icons: [...s.icons].sort((a, b) => a.name.localeCompare(b.name)) })}>Sort A→Z</Btn>}
        </Panel>
        <Panel title="Options">
          <Row>
            <Txt label="ID prefix" value={s.prefix} onChange={(prefix) => set({ prefix })} />
            <Txt label="Sprite file name" value={s.file} onChange={(file) => set({ file })} />
          </Row>
          {badPrefix && <Note tone="err">IDs must start with a letter and contain only letters, digits, - and _.</Note>}
          <Seg<ColorMode> value={s.color} onChange={(color) => set({ color })} options={[['keep', 'Keep colours'], ['current', 'Colours → currentColor']]} />
          <Check label="Add <title> to each symbol (accessible name)" value={s.titles} onChange={(titles) => set({ titles })} />
          <Check label="Hidden sprite for inlining into HTML" value={s.hidden} onChange={(hidden) => set({ hidden })} />
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Scripts, event handlers, editor metadata and external links are stripped. Internal IDs (gradients, clip paths) are prefixed per icon so they can’t collide.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Icons" value={s.icons.length} sub={dupes ? `${dupes} duplicate name${dupes > 1 ? 's' : ''} renamed` : 'unique ids'} tone="accent" />
          <Stat label="Sprite size" value={`${(sprite.length / 1024).toFixed(1)} KB`} sub={`sources ${(srcBytes / 1024).toFixed(1)} KB`} />
          <Stat label="Warnings" value={warnCount} sub="see per-icon notes" tone={warnCount ? 'bad' : 'good'} />
        </Stats>
        <Panel title="Preview">
          <Row>
            <label className="k-field" style={{ minWidth: 120 }}>
              <span className="k-label">Colour (currentColor)</span>
              <input type="color" value={s.previewColor} onChange={(e) => set({ previewColor: e.target.value })} style={{ width: '100%', height: 36, border: 'none', background: 'none' }} />
            </label>
            <div style={{ flex: 1, minWidth: 180 }}><Slider label="Size" value={s.size} onChange={(size) => set({ size })} min={16} max={96} unit=" px" show={(v) => String(v)} /></div>
          </Row>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(84, s.size + 30)}px, 1fr))`, gap: 8 }}>
            {built.map(({ src, icon }) => (
              <button key={src.key} type="button" onClick={() => setSel(src.key)} title={icon.id}
                style={{ display: 'grid', justifyItems: 'center', gap: 6, padding: 10, borderRadius: 10, cursor: 'pointer', background: 'var(--panel)', border: `2px solid ${cur?.src.key === src.key ? 'var(--accent)' : 'var(--line)'}`, color: 'var(--fg)' }}>
                <img alt={src.name} width={s.size} height={s.size} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(standalone(icon, s.previewColor))}`} />
                <span style={{ fontSize: 11, wordBreak: 'break-all' }}>{icon.id}</span>
              </button>
            ))}
          </div>
          {!built.length && <Note>Add some SVG icons to build a sprite.</Note>}
        </Panel>
        {cur && (
          <Panel title={`Use “${cur.icon.id}”`} actions={<CopyButton text={() => snippet(cur.icon.id, cur.src.name)} label="Copy snippet" />}>
            <Seg<Usage> value={usage} onChange={setUsage} options={[['external', 'External file'], ['inline', 'Inline sprite'], ['css', 'CSS'], ['react', 'React']]} />
            <pre style={{ ...pre, marginTop: 8 }}>{snippet(cur.icon.id, cur.src.name)}</pre>
            {cur.icon.warnings.map((w) => <Note key={w} tone="warn">{w}</Note>)}
            {usage === 'external' && <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>External sprites must be served from the same origin (or with CORS) for &lt;use&gt; to load them.</p>}
          </Panel>
        )}
        <Panel title={s.file} actions={<><CopyButton text={sprite} /><Btn kind="primary" disabled={!built.length || badPrefix} onClick={() => download(s.file || 'sprite.svg', sprite, 'image/svg+xml')}>⬇ Download</Btn></>}>
          <pre style={{ ...pre, maxHeight: 320 }}>{sprite}</pre>
        </Panel>
      </div>
    </Split>
  )
}
