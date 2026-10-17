import { useEffect, useMemo, useState } from 'react'
import { Btn, Check, CopyButton, download, FileDrop, Note, Panel, pct, Row, Seg, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { mix, mmcq, roles, type Swatch } from './lib/color-palette-extractor'
import { gpl, hex, hsl, luminance, textOn, type RGB } from './lib/image-palette-extractor'

type Sort = 'pop' | 'hue' | 'light'
type Fmt = 'css' | 'scss' | 'tailwind' | 'json' | 'gpl'
const DEF = { k: 8, step: 2, ignoreWhite: false, ignoreBlack: false, sort: 'pop' as Sort, prefix: 'palette', fmt: 'css' as Fmt, roleVars: true }
const MAX = 400

type Demo = 'autumn' | 'lagoon' | 'neon'
function demo(kind: Demo): ImageData {
  const W = 480, H = 320
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const grad = (stops: string[], y1 = H) => {
    const gr = g.createLinearGradient(0, 0, 0, y1)
    stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s))
    return gr
  }
  const circle = (x: number, y: number, r: number, col: string) => {
    g.fillStyle = col
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  if (kind === 'autumn') {
    g.fillStyle = grad(['#f6d7a7', '#e9a56b'])
    g.fillRect(0, 0, W, H)
    for (let i = 0; i < 14; i++) {
      const x = 20 + i * 34
      g.fillStyle = '#4a2c1d'
      g.fillRect(x - 4, 170, 8, 150)
      circle(x, 150 - (i % 3) * 18, 42 - (i % 4) * 4, ['#c0392b', '#e67e22', '#d35400', '#f1c40f', '#8e3b1f'][i % 5])
    }
    g.fillStyle = '#6b4226'
    g.fillRect(0, 280, W, 40)
  } else if (kind === 'lagoon') {
    g.fillStyle = grad(['#9be7ff', '#e0f7fa'], H * 0.45)
    g.fillRect(0, 0, W, H * 0.45)
    g.fillStyle = grad(['#00b4d8', '#0077b6', '#03045e'])
    g.fillRect(0, H * 0.45, W, H * 0.55)
    g.fillStyle = '#f9e4b7'
    g.beginPath()
    g.ellipse(W * 0.5, H * 0.5, 170, 34, 0, 0, Math.PI * 2)
    g.fill()
    for (let i = 0; i < 4; i++) circle(170 + i * 45, 130 - i * 4, 26, '#2d6a4f')
    circle(400, 60, 28, '#fff3b0')
  } else {
    g.fillStyle = grad(['#0d0221', '#261447', '#2e2157'])
    g.fillRect(0, 0, W, H)
    circle(W / 2, 150, 90, '#ff2a6d')
    g.fillStyle = '#0d0221'
    for (let i = 0; i < 6; i++) g.fillRect(140, 150 + i * 14, 200, 5 + i)
    for (let i = 0; i < 12; i++) {
      g.fillStyle = ['#05d9e8', '#d1f7ff', '#01012b', '#ff2a6d'][i % 4]
      const h = 60 + ((i * 37) % 90)
      g.fillRect(i * 40, H - h, 34, h)
    }
  }
  return g.getImageData(0, 0, W, H)
}

function toUrl(d: ImageData) {
  const c = document.createElement('canvas')
  c.width = d.width
  c.height = d.height
  c.getContext('2d')!.putImageData(d, 0, 0)
  return c.toDataURL()
}

async function loadBlob(f: Blob): Promise<ImageData> {
  const bmp = await createImageBitmap(f)
  const s = Math.min(1, MAX / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * s))
  c.height = Math.max(1, Math.round(bmp.height * s))
  const g = c.getContext('2d')!
  g.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return g.getImageData(0, 0, c.width, c.height)
}

const rgbStr = (c: RGB) => `rgb(${c.join(', ')})`
const hslStr = (c: RGB) => { const [h, s, l] = hsl(c); return `hsl(${h} ${s}% ${l}%)` }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export default function ColorPaletteExtractor() {
  const [s, set, reset] = useToolState('color-palette-extractor', DEF)
  const [img, setImg] = useState(() => { const d = demo('autumn'); return { data: d, url: toUrl(d), name: 'Demo: autumn' } })
  const [err, setErr] = useState('')
  const [picked, setPicked] = useState<RGB | null>(null)
  const [copied, setCopied] = useState('')

  const openImg = (f: Blob, name: string) => {
    setErr('')
    loadBlob(f).then((data) => { setImg({ data, url: toUrl(data), name }); setPicked(null) }).catch(() => setErr('Could not decode that image.'))
  }
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'))
      if (f) openImg(f, 'Pasted image')
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const sw = useMemo(() => mmcq(img.data.data, s.k, { step: s.step, ignoreWhite: s.ignoreWhite, ignoreBlack: s.ignoreBlack }), [img, s.k, s.step, s.ignoreWhite, s.ignoreBlack])
  const sorted = useMemo(() => {
    const c = [...sw]
    if (s.sort === 'hue') c.sort((a, b) => hsl(a.rgb)[0] - hsl(b.rgb)[0])
    if (s.sort === 'light') c.sort((a, b) => luminance(b.rgb) - luminance(a.rgb))
    return c
  }, [sw, s.sort])
  const rl = useMemo(() => roles(sw), [sw])
  const dom = sw[0]
  const pre = slug(s.prefix) || 'palette'
  const names = sorted.map((_, i) => `${pre}-${i + 1}`)
  const roleList = rl.filter((r) => r.swatch).map((r) => [slug(r.role), r.swatch!.rgb] as [string, RGB])

  const code = useMemo(() => {
    const all: [string, RGB][] = [...sorted.map((c, i) => [names[i], c.rgb] as [string, RGB]), ...(s.roleVars ? roleList.map(([n, c]) => [`${pre}-${n}`, c] as [string, RGB]) : [])]
    if (s.fmt === 'css') return `:root {\n${all.map(([n, c]) => `  --${n}: ${hex(c)};`).join('\n')}\n}\n`
    if (s.fmt === 'scss') return all.map(([n, c]) => `$${n}: ${hex(c)};`).join('\n') + '\n'
    if (s.fmt === 'tailwind') return `// tailwind.config.js → theme.extend.colors\n${pre.replace(/-/g, '')}: {\n${all.map(([n, c]) => `  '${n.slice(pre.length + 1)}': '${hex(c)}',`).join('\n')}\n},\n`
    if (s.fmt === 'json') return JSON.stringify({ colors: sorted.map((c, i) => ({ name: names[i], hex: hex(c.rgb), rgb: c.rgb, share: +c.share.toFixed(4) })), roles: Object.fromEntries(roleList.map(([n, c]) => [n, hex(c)])) }, null, 2)
    return gpl(sorted.map((c) => c.rgb), names, `${s.prefix} (${img.name})`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, s.fmt, s.roleVars, pre, img.name, rl])
  const ext = { css: 'css', scss: 'scss', tailwind: 'js', json: 'json', gpl: 'gpl' }[s.fmt]

  const copy = (h: string) => {
    void navigator.clipboard?.writeText(h)
    setCopied(h)
    setTimeout(() => setCopied(''), 1000)
  }
  const pick = (e: React.MouseEvent<HTMLImageElement>) => {
    const el = e.currentTarget
    const x = Math.floor((e.nativeEvent.offsetX / el.clientWidth) * img.data.width)
    const y = Math.floor((e.nativeEvent.offsetY / el.clientHeight) * img.data.height)
    const i = (Math.min(img.data.height - 1, y) * img.data.width + Math.min(img.data.width - 1, x)) * 4
    const d = img.data.data
    setPicked([d[i], d[i + 1], d[i + 2]])
  }
  const pngStrip = () => {
    const c = document.createElement('canvas')
    c.width = 140 * sorted.length
    c.height = 180
    const g = c.getContext('2d')!
    sorted.forEach((col, i) => {
      g.fillStyle = hex(col.rgb)
      g.fillRect(i * 140, 0, 140, 180)
      g.fillStyle = textOn(col.rgb)
      g.font = '600 18px system-ui, sans-serif'
      g.fillText(hex(col.rgb).toUpperCase(), i * 140 + 12, 150)
      g.font = '14px system-ui, sans-serif'
      g.fillText(pct(col.share, 1), i * 140 + 12, 170)
    })
    c.toBlob((b) => b && download(`${pre}.png`, b, 'image/png'))
  }

  const chip = (c: RGB, big = false) => (
    <button
      type="button"
      onClick={() => copy(hex(c))}
      title="Click to copy HEX"
      style={{ background: hex(c), color: textOn(c), border: '1px solid var(--line)', borderRadius: 10, padding: big ? '28px 10px 8px' : '18px 8px 6px', font: 'inherit', fontWeight: 700, cursor: 'pointer', textAlign: 'left', width: '100%' }}
    >
      {copied === hex(c) ? '✓ Copied' : hex(c).toUpperCase()}
    </button>
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Image" actions={<Btn kind="ghost" onClick={() => { reset(); setPicked(null) }}>Reset</Btn>}>
          <FileDrop accept="image/*" onFiles={([f]) => openImg(f, f.name)} label="Drop, choose or paste (Ctrl+V) an image" />
          <Row>
            {(['autumn', 'lagoon', 'neon'] as Demo[]).map((k) => (
              <Btn key={k} kind="ghost" onClick={() => { const d = demo(k); setImg({ data: d, url: toUrl(d), name: `Demo: ${k}` }); setPicked(null) }}>Demo: {k}</Btn>
            ))}
          </Row>
          {err && <Note tone="err">{err}</Note>}
          <img src={img.url} alt={img.name} onClick={pick} style={{ width: '100%', borderRadius: 10, cursor: 'crosshair', display: 'block', marginTop: 8 }} />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0' }}>{img.name} · {img.data.width}×{img.data.height}px analysed · click the image to sample a pixel</p>
          {picked && (
            <Row>
              <span style={{ width: 36, height: 36, borderRadius: 8, background: hex(picked), border: '1px solid var(--line)' }} />
              <span><b>{hex(picked).toUpperCase()}</b> <span className="muted">{rgbStr(picked)}</span></span>
              <CopyButton text={hex(picked)} label="HEX" />
            </Row>
          )}
        </Panel>
        <Panel title="Quantization">
          <Slider label="Colours" value={s.k} min={2} max={16} onChange={(k) => set({ k })} />
          <div className="k-label">Sampling</div>
          <Seg value={String(s.step) as '1' | '2' | '5'} onChange={(v) => set({ step: Number(v) })} options={[['5', 'Fast'], ['2', 'Balanced'], ['1', 'Every pixel']]} />
          <Check label="Ignore near-white pixels (backgrounds)" value={s.ignoreWhite} onChange={(ignoreWhite) => set({ ignoreWhite })} />
          <Check label="Ignore near-black pixels" value={s.ignoreBlack} onChange={(ignoreBlack) => set({ ignoreBlack })} />
          <div className="k-label">Sort swatches by</div>
          <Seg value={s.sort} onChange={(sort) => set({ sort })} options={[['pop', 'Coverage'], ['hue', 'Hue'], ['light', 'Lightness']]} />
          <Note>Median cut (MMCQ, the algorithm used by Color Thief) repeatedly splits the 5-bit RGB colour cube at the median of its longest side — first by pixel count, then by count × volume so small but distinct accents survive.</Note>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Dominant colour" value={dom ? <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><i style={{ width: 18, height: 18, borderRadius: 4, background: hex(dom.rgb), display: 'inline-block' }} />{hex(dom.rgb).toUpperCase()}</span> : '—'} sub={dom ? `${pct(dom.share)} of pixels` : ''} />
          <Stat label="Swatches" value={sw.length} />
          <Stat label="Avg. lightness" value={`${Math.round(sw.reduce((a, c) => a + hsl(c.rgb)[2] * c.share, 0))}%`} />
          <Stat label="Avg. saturation" value={`${Math.round(sw.reduce((a, c) => a + hsl(c.rgb)[1] * c.share, 0))}%`} tone="accent" />
        </Stats>
        <Panel title="Palette" actions={<Btn onClick={pngStrip}>⬇ PNG</Btn>}>
          <div style={{ display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
            {sorted.map((c, i) => <span key={i} title={`${hex(c.rgb)} · ${pct(c.share)}`} style={{ flex: c.share, background: hex(c.rgb) }} />)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            {sorted.map((c: Swatch, i) => (
              <div key={i}>
                {chip(c.rgb, true)}
                <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>
                  <b>--{names[i]}</b> · {pct(c.share)}
                  <div className="muted">{rgbStr(c.rgb)}</div>
                  <div className="muted">{hslStr(c.rgb)}</div>
                  <div style={{ display: 'flex', marginTop: 4, borderRadius: 4, overflow: 'hidden' }}>
                    {[0.6, 0.3, 0, -0.3, -0.6].map((t) => <span key={t} title={hex(mix(c.rgb, t))} onClick={() => copy(hex(mix(c.rgb, t)))} style={{ flex: 1, height: 12, background: hex(mix(c.rgb, t)), cursor: 'pointer' }} />)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Role swatches (Vibrant-style)">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {rl.map((r) => (
              <div key={r.role}>
                <div className="k-label">{r.role}</div>
                {r.swatch ? chip(r.swatch.rgb) : <div className="muted" style={{ border: '1px dashed var(--line)', borderRadius: 10, padding: '18px 8px 6px', fontSize: 13 }}>none in image</div>}
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Roles pick the swatch closest to a saturation/lightness target — handy for accent, background and text colours of a theme built from the picture.</p>
        </Panel>
        <Panel title="Export" actions={<><CopyButton text={code} /><Btn kind="primary" onClick={() => download(`${pre}.${ext}`, code, 'text/plain')}>⬇ .{ext}</Btn></>}>
          <Row>
            <Seg value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['css', 'CSS vars'], ['scss', 'SCSS'], ['tailwind', 'Tailwind'], ['json', 'JSON'], ['gpl', 'GIMP .gpl']]} />
          </Row>
          <Row>
            <Txt label="Name prefix" value={s.prefix} onChange={(prefix) => set({ prefix })} />
            <Check label="Include role variables" value={s.roleVars} onChange={(roleVars) => set({ roleVars })} />
          </Row>
          <textarea className="k-area mono" readOnly value={code} rows={10} style={{ width: '100%', fontSize: 13 }} />
        </Panel>
      </div>
    </Split>
  )
}
