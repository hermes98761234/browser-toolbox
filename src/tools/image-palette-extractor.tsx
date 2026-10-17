import { useMemo, useState } from 'react'
import { Bar, Btn, CopyButton, download, FileDrop, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { aseBytes, cssVars, gpl, hex, hsl, kmeans, luminance, textOn, type Cluster, type RGB } from './lib/image-palette-extractor'

const DEF = { k: 8, space: 'lab' as 'lab' | 'rgb', sort: 'share' as 'share' | 'hue' | 'light', prefix: 'brand' }
const MAX = 360

/** Procedural demo pictures so the tool works without an upload. */
function demo(kind: 'sunset' | 'reef'): ImageData {
  const W = 480, H = 320
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  if (kind === 'sunset') {
    const sky = g.createLinearGradient(0, 0, 0, H * 0.62)
    sky.addColorStop(0, '#2b1055')
    sky.addColorStop(0.45, '#d53369')
    sky.addColorStop(1, '#fbb040')
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#ffe29a'
    g.beginPath()
    g.arc(W * 0.62, H * 0.56, 46, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#3a1c52'
    g.beginPath()
    g.moveTo(0, H * 0.62)
    for (let x = 0; x <= W; x += 20) g.lineTo(x, H * 0.62 - 40 * Math.abs(Math.sin(x / 70)) - 10)
    g.lineTo(W, H)
    g.lineTo(0, H)
    g.fill()
    const sea = g.createLinearGradient(0, H * 0.7, 0, H)
    sea.addColorStop(0, '#1b2a4e')
    sea.addColorStop(1, '#0b132b')
    g.fillStyle = sea
    g.fillRect(0, H * 0.72, W, H * 0.28)
  } else {
    const water = g.createLinearGradient(0, 0, 0, H)
    water.addColorStop(0, '#6dd5ed')
    water.addColorStop(1, '#2193b0')
    g.fillStyle = water
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#f4e1b0'
    g.fillRect(0, H * 0.78, W, H * 0.22)
    const blobs: [string, number, number, number][] = [['#ff6f61', 90, 230, 50], ['#ffb347', 210, 250, 38], ['#7fc97f', 330, 225, 55], ['#ff6f61', 420, 260, 30], ['#c17bd8', 160, 200, 26]]
    for (const [col, x, y, r] of blobs) {
      g.fillStyle = col
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = '#fcd34d'
    for (let i = 0; i < 7; i++) {
      g.beginPath()
      g.ellipse(60 + i * 60, 80 + 25 * Math.sin(i), 16, 8, 0, 0, Math.PI * 2)
      g.fill()
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

async function loadFile(f: File): Promise<ImageData> {
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

export default function ImagePaletteExtractor() {
  const [s, set, reset] = useToolState('image-palette-extractor', DEF)
  const [img, setImg] = useState<{ data: ImageData; url: string; name: string } | null>(() => {
    const d = demo('sunset')
    return { data: d, url: toUrl(d), name: 'Demo: sunset' }
  })
  const [err, setErr] = useState('')

  const clusters = useMemo<Cluster[]>(() => (img ? kmeans(img.data.data, s.k, { space: s.space }) : []), [img, s.k, s.space])
  const sorted = useMemo(() => {
    const c = [...clusters]
    if (s.sort === 'hue') c.sort((a, b) => hsl(a.rgb)[0] - hsl(b.rgb)[0])
    if (s.sort === 'light') c.sort((a, b) => luminance(b.rgb) - luminance(a.rgb))
    return c
  }, [clusters, s.sort])
  const colors: RGB[] = sorted.map((c) => c.rgb)
  const names = colors.map((_, i) => `${s.prefix || 'color'}-${i + 1}`)
  const pre = s.prefix.trim().replace(/[^\w-]/g, '-') || 'color'
  const css = cssVars(colors, pre)
  const scss = colors.map((c, i) => `$${pre}-${i + 1}: ${hex(c)};`).join('\n') + '\n'
  const json = JSON.stringify(sorted.map((c, i) => ({ name: names[i], hex: hex(c.rgb), rgb: c.rgb, share: Number(c.share.toFixed(4)) })), null, 2)

  const pngStrip = () => {
    const c = document.createElement('canvas')
    c.width = 120 * colors.length
    c.height = 160
    const g = c.getContext('2d')!
    colors.forEach((col, i) => {
      g.fillStyle = hex(col)
      g.fillRect(i * 120, 0, 120, 160)
      g.fillStyle = textOn(col)
      g.font = '600 16px system-ui, sans-serif'
      g.fillText(hex(col).toUpperCase(), i * 120 + 12, 146)
    })
    c.toBlob((b) => b && download('palette.png', b, 'image/png'))
  }

  const warm = colors.length ? colors.filter((c) => { const h = hsl(c)[0]; return h < 70 || h > 300 }).length / colors.length : 0
  const avgL = colors.length ? sorted.reduce((a, c) => a + hsl(c.rgb)[2] * c.share, 0) : 0

  return (
    <Split wide="right">
      <div>
        <Panel title="Image" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <FileDrop
            accept="image/*"
            onFiles={([f]) => {
              setErr('')
              loadFile(f)
                .then((data) => setImg({ data, url: toUrl(data), name: f.name }))
                .catch(() => setErr('Could not decode that image.'))
            }}
            label="Drop an image or click to choose"
          />
          <Row>
            {(['sunset', 'reef'] as const).map((k) => (
              <Btn key={k} onClick={() => { const d = demo(k); setImg({ data: d, url: toUrl(d), name: `Demo: ${k}` }) }}>Demo: {k}</Btn>
            ))}
          </Row>
          {err && <Note tone="err">{err}</Note>}
          {img && (
            <figure style={{ margin: '10px 0 0' }}>
              <img src={img.url} alt={img.name} style={{ width: '100%', borderRadius: 10, display: 'block' }} />
              <div style={{ display: 'flex', height: 18, borderRadius: 6, overflow: 'hidden', marginTop: 6 }}>
                {clusters.map((c, i) => <div key={i} title={`${hex(c.rgb)} · ${(c.share * 100).toFixed(1)}%`} style={{ flex: c.share, background: hex(c.rgb) }} />)}
              </div>
              <figcaption className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>{img.name} · analysed at {img.data.width}×{img.data.height}px, processed locally</figcaption>
            </figure>
          )}
        </Panel>
        <Panel title="Clustering">
          <Slider label="Number of colours" value={s.k} min={2} max={16} onChange={(k) => set({ k })} show={(v) => String(v)} />
          <div className="k-label">Colour distance</div>
          <Seg value={s.space} onChange={(space) => set({ space })} options={[['lab', 'Perceptual (CIELAB)'], ['rgb', 'RGB']]} label="Colour space" />
          <Note>k-means groups similar pixels and reports each group's average colour. Lab distance matches how different colours look to people, so small but distinct accents survive.</Note>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Dominant colour" value={colors[0] ? hex(sorted.slice().sort((a, b) => b.share - a.share)[0].rgb).toUpperCase() : '—'} tone="accent" sub={clusters[0] ? `${(clusters[0].share * 100).toFixed(1)}% of pixels` : undefined} />
          <Stat label="Colours" value={colors.length} />
          <Stat label="Weighted lightness" value={`${Math.round(avgL)}%`} sub={avgL > 60 ? 'light image' : avgL < 35 ? 'dark image' : 'mid-tone'} />
          <Stat label="Warm hues" value={`${Math.round(warm * 100)}%`} sub="of palette swatches" />
        </Stats>
        <Panel
          title="Palette"
          actions={<Seg value={s.sort} onChange={(sort) => set({ sort })} options={[['share', 'By share'], ['hue', 'By hue'], ['light', 'By lightness']]} label="Sort" />}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {sorted.map((c, i) => {
              const h = hex(c.rgb), [hh, ss, ll] = hsl(c.rgb)
              return (
                <button
                  type="button"
                  key={h + i}
                  onClick={() => void navigator.clipboard?.writeText(h)}
                  title="Click to copy hex"
                  style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', padding: 0, background: 'var(--panel)', cursor: 'pointer', textAlign: 'left', color: 'var(--fg)' }}
                >
                  <div style={{ background: h, color: textOn(c.rgb), height: 78, padding: 8, fontWeight: 700, display: 'flex', alignItems: 'flex-end' }}>{h.toUpperCase()}</div>
                  <div style={{ padding: '6px 8px', fontSize: 12, lineHeight: 1.5 }}>
                    <div><b>{names[i]}</b></div>
                    <div className="mono">rgb({c.rgb.join(', ')})</div>
                    <div className="mono">hsl({hh}, {ss}%, {ll}%)</div>
                    <Bar value={c.share} max={sorted.reduce((m, x) => Math.max(m, x.share), 0)} color={h} />
                    <div className="muted">{(c.share * 100).toFixed(1)}%</div>
                  </div>
                </button>
              )
            })}
          </div>
        </Panel>
        <Panel title="Export">
          <Txt label="Name prefix" value={s.prefix} onChange={(prefix) => set({ prefix })} />
          <pre className="mono" style={{ background: 'var(--bg)', padding: 10, borderRadius: 8, fontSize: 12.5, maxHeight: 200, overflow: 'auto' }}>{css}</pre>
          <Row>
            <CopyButton text={css} label="CSS variables" />
            <CopyButton text={scss} label="SCSS" />
            <CopyButton text={json} label="JSON" />
            <Btn onClick={() => download('palette.ase', new Blob([aseBytes(colors, names) as BlobPart]), 'application/octet-stream')}>⬇ .ase (Adobe)</Btn>
            <Btn onClick={() => download('palette.gpl', gpl(colors, names), 'text/plain')}>⬇ .gpl (GIMP/Inkscape)</Btn>
            <Btn onClick={pngStrip}>⬇ PNG swatches</Btn>
          </Row>
        </Panel>
      </div>
    </Split>
  )
}
