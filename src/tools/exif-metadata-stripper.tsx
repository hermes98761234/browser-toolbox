import { useEffect, useMemo, useState } from 'react'
import { Btn, Check, CsvButton, download, FileDrop, Note, num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { display, dms, findTiff, jpegWithExif, parseTiff, writeTiff, type Tag } from './lib/exif-viewer'
import { exposureScore, keepable, keptTiff, LAND, level, nearestCity, PRESETS, riskOf, tileXY, type Risk } from './lib/exif-metadata-stripper'
import { concat, crc32, detect, scan, stripLossless, uniqueNames, zip, type Block } from './lib/metadata-stripper'

type Mode = 'selective' | 'reencode'
const DEF = { mode: 'selective' as Mode, keep: PRESETS['Privacy-safe'](['Orientation', 'ExposureTime', 'FNumber', 'ISO', 'FocalLength', 'XResolution', 'YResolution', 'ResolutionUnit', 'ColorSpace']), keepIcc: true, quality: 0.92, preset: 'Privacy-safe' }

interface Item {
  id: string
  name: string
  type: string
  bytes: Uint8Array
  url: string
  tags: Tag[]
  blocks: Block[]
  thumb: boolean
  gps: { lat: number; lon: number; alt?: number } | null
  score: number
  err?: string
}

const RISK_COLOR: Record<Risk, string> = { high: 'var(--err)', medium: 'var(--warn)', low: 'var(--ok)' }
const Badge = ({ r, children }: { r: Risk; children?: React.ReactNode }) => (
  <span style={{ background: RISK_COLOR[r], color: '#fff', borderRadius: 999, padding: '1px 8px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{children ?? r}</span>
)
const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`)

function analyze(name: string, type: string, bytes: Uint8Array): Item {
  let tags: Tag[] = []
  try {
    const t = findTiff(bytes)
    tags = t ? parseTiff(t).filter((x) => !/Pointer$/.test(x.name)) : []
  } catch {
    tags = []
  }
  const main = tags.filter((t) => t.ifd !== 'IFD1')
  const thumb = tags.some((t) => t.ifd === 'IFD1' && t.name === 'ThumbnailLength')
  const get = (n: string) => main.find((x) => x.name === n)
  const la = get('GPSLatitude'), lo = get('GPSLongitude')
  const gps = la && lo ? { lat: dms(la.value, String(get('GPSLatitudeRef')?.value ?? 'N')), lon: dms(lo.value, String(get('GPSLongitudeRef')?.value ?? 'E')), alt: get('GPSAltitude') ? Number(display(get('GPSAltitude')!).replace(/[^\d.-]/g, '')) : undefined } : null
  const blocks = scan(bytes)
  const extra = blocks.filter((b) => b.kind !== 'EXIF')
  return { id: Math.random().toString(36).slice(2), name, type, bytes, url: URL.createObjectURL(new Blob([bytes as BlobPart], { type })), tags: main, blocks, thumb, gps: gps && Number.isFinite(gps.lat) ? gps : null, score: exposureScore(main.map((t) => t.name), extra, thumb) }
}

async function canvasPhoto(w: number, h: number, hue: number, label: string, type: string): Promise<Uint8Array> {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, `hsl(${hue},65%,60%)`)
  sky.addColorStop(1, `hsl(${hue + 30},70%,85%)`)
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)
  g.fillStyle = `hsl(${hue + 160},25%,28%)`
  g.beginPath()
  g.moveTo(0, h)
  for (let x = 0; x <= w; x += 16) g.lineTo(x, h * 0.62 + Math.sin(x / 41 + hue) * 26 + Math.cos(x / 11) * 6)
  g.lineTo(w, h)
  g.fill()
  g.fillStyle = '#ffffffcc'
  g.font = 'bold 26px system-ui'
  g.fillText(label, 18, 40)
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), type, 0.9))
  return new Uint8Array(await blob.arrayBuffer())
}

function pngText(png: Uint8Array, entries: [string, string][]): Uint8Array {
  const enc = new TextEncoder()
  const chunk = (body: Uint8Array) => {
    const t = enc.encode('tEXt')
    const out = new Uint8Array(12 + body.length)
    new DataView(out.buffer).setUint32(0, body.length)
    out.set(t, 4)
    out.set(body, 8)
    new DataView(out.buffer).setUint32(8 + body.length, crc32(concat([t, body])))
    return out
  }
  return concat([png.subarray(0, 33), ...entries.map(([k, v]) => chunk(enc.encode(`${k}\0${v}`))), png.subarray(33)])
}

const rat = (x: number, d = 100): [number, number] => [Math.round(x * d), d]
const dmsOf = (v: number): [number, number][] => {
  const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60)
  return [[d, 1], [m, 1], rat((a - d - m / 60) * 3600)]
}

async function demo(): Promise<Item[]> {
  const phone = writeTiff(
    [{ id: 0x010f, type: 2, value: 'Apple' }, { id: 0x0110, type: 2, value: 'iPhone 15 Pro' }, { id: 0x0112, type: 3, value: [1] }, { id: 0x0131, type: 2, value: '18.1' }, { id: 0x0132, type: 2, value: '2026:09:14 07:42:10' }],
    [{ id: 0x829a, type: 5, value: [[1, 120]] }, { id: 0x829d, type: 5, value: [[178, 100]] }, { id: 0x8827, type: 3, value: [80] }, { id: 0x9003, type: 2, value: '2026:09:14 07:42:10' }, { id: 0x9011, type: 2, value: '+03:00' }, { id: 0x920a, type: 5, value: [[678, 100]] }, { id: 0xa420, type: 2, value: '7F3A2C91E0B44D5A' }, { id: 0xa434, type: 2, value: 'iPhone 15 Pro back camera 6.78mm f/1.78' }],
    [{ id: 0x01, type: 2, value: 'N' }, { id: 0x02, type: 5, value: dmsOf(50.4489) }, { id: 0x03, type: 2, value: 'E' }, { id: 0x04, type: 5, value: dmsOf(30.5251) }, { id: 0x06, type: 5, value: [rat(168.4, 10)] }],
  )
  const dslr = writeTiff(
    [{ id: 0x010f, type: 2, value: 'Canon' }, { id: 0x0110, type: 2, value: 'EOS R6' }, { id: 0x0112, type: 3, value: [1] }, { id: 0x013b, type: 2, value: 'Jane Doe' }, { id: 0x8298, type: 2, value: '© 2026 Jane Doe Photography' }],
    [{ id: 0x829a, type: 5, value: [[1, 500]] }, { id: 0x829d, type: 5, value: [[56, 10]] }, { id: 0x8827, type: 3, value: [200] }, { id: 0x9003, type: 2, value: '2026:08:02 16:05:51' }, { id: 0x920a, type: 5, value: [[85, 1]] }, { id: 0xa430, type: 2, value: 'Jane Doe' }, { id: 0xa431, type: 2, value: '043021005518' }, { id: 0xa434, type: 2, value: 'RF85mm F2 MACRO IS STM' }],
  )
  const a = jpegWithExif(await canvasPhoto(800, 560, 205, 'IMG_4471.jpg', 'image/jpeg'), phone)
  const b = jpegWithExif(await canvasPhoto(720, 480, 25, 'portrait_session.jpg', 'image/jpeg'), dslr)
  const c = pngText(await canvasPhoto(640, 400, 280, 'Screenshot.png', 'image/png'), [['Author', 'jane.doe'], ['Software', 'Greenshot 1.3'], ['Comment', 'Bank account page - 14 Sep']])
  return [analyze('IMG_4471.jpg', 'image/jpeg', a), analyze('portrait_session.jpg', 'image/jpeg', b), analyze('Screenshot.png', 'image/png', c)]
}

async function reencode(it: Item, quality: number): Promise<Uint8Array> {
  const bmp = await createImageBitmap(new Blob([it.bytes as BlobPart], { type: it.type }), { imageOrientation: 'from-image' })
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  c.getContext('2d')!.drawImage(bmp, 0, 0)
  bmp.close()
  const type = /^image\/(jpeg|png|webp)$/.test(it.type) ? it.type : 'image/png'
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type, quality))
  if (!blob) throw new Error('Could not encode image')
  return new Uint8Array(await blob.arrayBuffer())
}

function WorldMap({ points, active }: { points: { lat: number; lon: number; id: string }[]; active?: string }) {
  const P = (lon: number, lat: number) => `${(lon + 180).toFixed(1)},${(90 - lat).toFixed(1)}`
  return (
    <svg viewBox="0 0 360 180" style={{ width: '100%', background: 'color-mix(in srgb, var(--accent) 10%, var(--panel))', borderRadius: 8 }} role="img" aria-label="World map of photo locations">
      {[-60, -30, 0, 30, 60].map((l) => <line key={l} x1={0} x2={360} y1={90 - l} y2={90 - l} stroke="var(--line)" strokeWidth={0.4} />)}
      {[-120, -60, 0, 60, 120].map((l) => <line key={l} y1={0} y2={180} x1={l + 180} x2={l + 180} stroke="var(--line)" strokeWidth={0.4} />)}
      {LAND.map((poly, i) => <polygon key={i} points={poly.map(([lo, la]) => P(lo, la)).join(' ')} fill="var(--panel2)" stroke="var(--muted)" strokeWidth={0.4} />)}
      {points.map((p) => (
        <g key={p.id}>
          <circle cx={p.lon + 180} cy={90 - p.lat} r={p.id === active ? 9 : 5} fill="var(--err)" opacity={0.25} />
          <circle cx={p.lon + 180} cy={90 - p.lat} r={2.6} fill="var(--err)" stroke="#fff" strokeWidth={0.8} />
        </g>
      ))}
    </svg>
  )
}

function StreetMap({ lat, lon }: { lat: number; lon: number }) {
  const z = 15
  const [fx, fy] = tileXY(lat, lon, z)
  const tx = Math.floor(fx), ty = Math.floor(fy)
  const W = 360, H = 240
  const ox = W / 2 - (fx - tx + 1) * 256, oy = H / 2 - (fy - ty + 1) * 256
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: W, height: H, overflow: 'hidden', borderRadius: 8, background: 'var(--panel2)' }}>
      {[-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => (
        <img key={`${dx},${dy}`} alt="" src={`https://tile.openstreetmap.org/${z}/${tx + dx}/${ty + dy}.png`} width={256} height={256} style={{ position: 'absolute', left: ox + (dx + 1) * 256, top: oy + (dy + 1) * 256 }} />
      )))}
      <div style={{ position: 'absolute', left: W / 2 - 9, top: H / 2 - 9, width: 18, height: 18, borderRadius: 9, background: 'var(--err)', border: '3px solid #fff', boxShadow: '0 0 0 6px rgba(239,68,68,.3)' }} />
      <span style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 10, background: '#fffc', padding: '0 4px' }}>© OpenStreetMap</span>
    </div>
  )
}

export default function ExifMetadataStripper() {
  const [s, set] = useToolState('exif-metadata-stripper', DEF)
  const [items, setItems] = useState<Item[]>([])
  const [sel, setSel] = useState('')
  const [osm, setOsm] = useState(false)
  const [busy, setBusy] = useState('')
  const [after, setAfter] = useState<Record<string, { size: number; fields: number; blocks: number }>>({})

  useEffect(() => {
    let alive = true
    void demo().then((d) => { if (alive) { setItems(d); setSel(d[0].id) } })
    return () => { alive = false }
  }, [])

  const it = items.find((x) => x.id === sel) ?? items[0]
  const keep = useMemo(() => new Set(s.keep), [s.keep])
  const allNames = useMemo(() => [...new Set(items.flatMap((x) => x.tags.map((t) => t.name)))].sort((a, b) => ['high', 'medium', 'low'].indexOf(riskOf(a).risk) - ['high', 'medium', 'low'].indexOf(riskOf(b).risk) || a.localeCompare(b)), [items])
  const toggle = (n: string, on: boolean) => set({ keep: on ? [...s.keep, n] : s.keep.filter((x) => x !== n), preset: '' })
  const applyPreset = (p: string) => set({ preset: p, keep: PRESETS[p]([...new Set([...allNames, 'Orientation'])]) })

  const add = async (files: File[]) => {
    const out: Item[] = []
    for (const f of files) {
      const bytes = new Uint8Array(await f.arrayBuffer())
      const item = analyze(f.name, f.type || 'application/octet-stream', bytes)
      if (detect(bytes) === 'other') item.err = 'Unsupported format (JPEG, PNG or WebP only)'
      out.push(item)
    }
    setItems((prev) => [...out, ...prev.filter((p) => !p.name.match(/^(IMG_4471\.jpg|portrait_session\.jpg|Screenshot\.png)$/))])
    if (out[0]) setSel(out[0].id)
    setAfter({})
  }

  const clean = async (x: Item): Promise<Uint8Array> => {
    if (s.mode === 'reencode') return reencode(x, s.quality)
    const base = stripLossless(x.bytes, { keepIcc: s.keepIcc })
    if (!base) return reencode(x, s.quality)
    if (detect(base) === 'jpeg') {
      const t = keptTiff(x.tags, keep)
      if (t) return jpegWithExif(base, t)
    }
    return base
  }
  const cleanName = (n: string) => n.replace(/(\.[^.]*)?$/, (e) => `-clean${e || '.jpg'}`)
  const verify = (x: Item, out: Uint8Array) => {
    const a = analyze(x.name, x.type, out)
    URL.revokeObjectURL(a.url)
    setAfter((p) => ({ ...p, [x.id]: { size: out.length, fields: a.tags.length, blocks: a.blocks.length } }))
  }
  const one = async (x: Item) => {
    setBusy(x.id)
    try {
      const out = await clean(x)
      verify(x, out)
      download(cleanName(x.name), new Blob([out as BlobPart], { type: x.type }))
    } finally {
      setBusy('')
    }
  }
  const all = async () => {
    setBusy('all')
    try {
      const ok = items.filter((x) => !x.err)
      const outs = await Promise.all(ok.map(clean))
      ok.forEach((x, i) => verify(x, outs[i]))
      const names = uniqueNames(ok.map((x) => cleanName(x.name)))
      download('photos-clean.zip', new Blob([zip(outs.map((data, i) => ({ name: names[i], data }))) as BlobPart], { type: 'application/zip' }))
    } finally {
      setBusy('')
    }
  }

  const withGps = items.filter((x) => x.gps)
  const highFields = items.reduce((a, x) => a + x.tags.filter((t) => riskOf(t.name).risk === 'high').length, 0)
  const removed = it ? it.tags.filter((t) => !(s.mode === 'selective' && keep.has(t.name) && keepable(t) && detect(it.bytes) === 'jpeg')) : []
  const report = () => [
    ['File', 'Format', 'Size', 'Fields', 'High-risk', 'GPS', 'Nearest city', 'Extra blocks', 'Thumbnail', 'Score', 'Level'],
    ...items.map((x) => {
      const c = x.gps ? nearestCity(x.gps.lat, x.gps.lon) : null
      return [x.name, detect(x.bytes), x.bytes.length, x.tags.length, x.tags.filter((t) => riskOf(t.name).risk === 'high').length, x.gps ? `${x.gps.lat.toFixed(5)}, ${x.gps.lon.toFixed(5)}` : '', c ? `${Math.round(c.km)} km ${c.bearing} of ${c.name}` : '', x.blocks.filter((b) => b.kind !== 'EXIF').map((b) => b.kind).join(' '), x.thumb ? 'yes' : '', x.score, level(x.score)]
    }),
  ]

  return (
    <Split wide="right">
      <div>
        <Panel title="Photos">
          <FileDrop accept="image/jpeg,image/png,image/webp" multiple label="Drop photos to audit (JPEG, PNG, WebP) — nothing is uploaded" onFiles={add} />
          <p className="muted" style={{ fontSize: 13 }}>Three demo photos are loaded: a phone shot with GPS, a DSLR portrait with serial numbers and a screenshot with text notes.</p>
        </Panel>
        <Panel title="What to keep">
          <Row>
            {Object.keys(PRESETS).map((p) => <Btn key={p} kind={s.preset === p ? 'primary' : 'ghost'} onClick={() => applyPreset(p)}>{p}</Btn>)}
          </Row>
          <div style={{ maxHeight: 340, overflow: 'auto', marginTop: 8 }}>
            {allNames.map((n) => {
              const r = riskOf(n)
              return (
                <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderBottom: '1px solid var(--line)' }}>
                  <Check label={n} value={keep.has(n)} onChange={(v) => toggle(n, v)} />
                  <span style={{ marginLeft: 'auto' }}><Badge r={r.risk} /></span>
                </div>
              )
            })}
          </div>
          <Note>Kept fields are re-written into a fresh, minimal EXIF block (JPEG only). PNG text chunks, XMP, IPTC, comments and embedded thumbnails are always removed.</Note>
        </Panel>
        <Panel title="Method">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['selective', 'Lossless, selective'], ['reencode', 'Re-encode via canvas']]} />
          {s.mode === 'selective' ? (
            <Check label="Keep ICC colour profile" value={s.keepIcc} onChange={(keepIcc) => set({ keepIcc })} />
          ) : (
            <>
              <Slider label="JPEG / WebP quality" value={s.quality} min={0.5} max={1} step={0.01} onChange={(quality) => set({ quality })} show={(v) => `${Math.round(v * 100)}%`} />
              <Note tone="warn">Re-encoding drops every metadata field (keep list ignored) and also any hidden data appended after the image, at a small quality cost.</Note>
            </>
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Photos" value={items.length} />
          <Stat label="Reveal location" value={withGps.length} tone={withGps.length ? 'bad' : 'good'} />
          <Stat label="High-risk fields" value={highFields} tone={highFields ? 'bad' : 'good'} />
          <Stat label="Will be removed" value={removed.length} sub={it ? `from ${it.name}` : undefined} tone="accent" />
        </Stats>
        <Panel title="Batch privacy report" actions={<>
          <CsvButton name="photo-privacy-report.csv" rows={report} />
          <Btn onClick={() => download('photo-privacy-report.json', JSON.stringify(report().slice(1).map((r) => Object.fromEntries(report()[0].map((h, i) => [h, r[i]]))), null, 2), 'application/json')}>⬇ JSON</Btn>
          <Btn kind="primary" disabled={!items.length || busy !== ''} onClick={all}>{busy === 'all' ? 'Cleaning…' : '⬇ Clean all (ZIP)'}</Btn>
        </>}>
          <Table
            head={['', 'File', 'Fields', 'Leaks', 'Risk', 'After']}
            rows={items.map((x) => [
              <img key="i" src={x.url} alt="" style={{ width: 44, height: 32, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', outline: x.id === it?.id ? '2px solid var(--accent)' : undefined }} onClick={() => setSel(x.id)} />,
              <button key="n" type="button" className="k-btn ghost" style={{ padding: 0 }} onClick={() => setSel(x.id)}>{x.name}<br /><span className="muted" style={{ fontSize: 12 }}>{detect(x.bytes).toUpperCase()} · {kb(x.bytes.length)}</span></button>,
              x.tags.length + x.blocks.filter((b) => b.sensitive && b.kind !== 'EXIF').length,
              <span key="l" style={{ fontSize: 12 }}>{[x.gps && '📍 GPS', x.tags.some((t) => /Serial|UniqueID/.test(t.name)) && '🔢 serial', x.tags.some((t) => /Owner|Artist/.test(t.name)) && '👤 name', x.tags.some((t) => /^DateTime/.test(t.name)) && '🕒 time', x.blocks.some((b) => /Text|Comment|XMP|IPTC/.test(b.kind)) && '📝 text', x.thumb && '🖼 thumb'].filter(Boolean).join(' · ') || x.err || '—'}</span>,
              <Badge key="r" r={level(x.score)}>{x.score}</Badge>,
              after[x.id] ? <span key="a" style={{ color: 'var(--ok)', fontSize: 12 }}>✓ {after[x.id].fields} fields, {kb(after[x.id].size)}</span> : '',
            ])}
          />
        </Panel>
        {withGps.length > 0 && (
          <Panel title="Where these photos say you were">
            <WorldMap points={withGps.map((x) => ({ ...x.gps!, id: x.id }))} active={it?.id} />
          </Panel>
        )}
        {it && (
          <Panel title={it.name} actions={<Btn kind="primary" disabled={!!it.err || busy !== ''} onClick={() => one(it)}>{busy === it.id ? 'Cleaning…' : '⬇ Clean & download'}</Btn>}>
            {it.gps && (() => {
              const c = nearestCity(it.gps.lat, it.gps.lon)
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 12 }}>
                  <div>
                    <Note tone="err">
                      📍 This photo reveals a location: <b>{it.gps.lat.toFixed(5)}, {it.gps.lon.toFixed(5)}</b>
                      {it.gps.alt !== undefined && <> at {num(it.gps.alt, 0)} m altitude</>} — about <b>{c.km < 1 ? 'right in' : `${Math.round(c.km)} km ${c.bearing} of`} {c.name}</b>. Anyone who downloads the original can see this.
                    </Note>
                    <Row>
                      <Btn onClick={() => setOsm(!osm)}>{osm ? 'Hide street map' : '🗺 Show street map'}</Btn>
                      <a className="k-btn ghost" href={`https://www.openstreetmap.org/?mlat=${it.gps.lat}&mlon=${it.gps.lon}#map=16/${it.gps.lat}/${it.gps.lon}`} target="_blank" rel="noreferrer">Open in OSM ↗</a>
                    </Row>
                    <p className="muted" style={{ fontSize: 12 }}>The street map loads tiles from openstreetmap.org, which reveals the approximate area to their servers — it is off until you ask.</p>
                  </div>
                  {osm ? <StreetMap lat={it.gps.lat} lon={it.gps.lon} /> : <img src={it.url} alt="" style={{ width: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 8 }} />}
                </div>
              )
            })()}
            {!it.gps && <img src={it.url} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 8, marginBottom: 8 }} />}
            {it.thumb && <Note tone="warn">Contains an embedded thumbnail — it can show the original, uncropped picture even after you crop the photo.</Note>}
            {it.blocks.filter((b) => b.sensitive && b.kind !== 'EXIF').length > 0 && (
              <Note tone="warn">Other metadata blocks: {it.blocks.filter((b) => b.sensitive && b.kind !== 'EXIF').map((b) => `${b.kind}${b.detail ? ` (${b.detail})` : ''}, ${kb(b.bytes)}`).join(' · ')} — always removed.</Note>
            )}
            {it.tags.length ? (
              <Table
                head={['Keep', 'Field', 'Value', 'Risk', 'Why it matters']}
                rows={it.tags.map((t) => {
                  const r = riskOf(t.name)
                  const can = keepable(t) && detect(it.bytes) === 'jpeg' && s.mode === 'selective'
                  return [
                    <input key="k" type="checkbox" checked={can && keep.has(t.name)} disabled={!can} onChange={(e) => toggle(t.name, e.target.checked)} aria-label={`Keep ${t.name}`} />,
                    <span key="n"><b>{t.name}</b><br /><span className="muted" style={{ fontSize: 12 }}>{r.cat}</span></span>,
                    <code key="v" style={{ wordBreak: 'break-word', textDecoration: can && keep.has(t.name) ? undefined : 'line-through', opacity: can && keep.has(t.name) ? 1 : 0.7 }}>{display(t)}</code>,
                    <Badge key="r" r={r.risk} />,
                    <span key="w" style={{ fontSize: 13 }}>{r.why}</span>,
                  ]
                })}
              />
            ) : (
              <Note tone="ok">No EXIF fields in this file.</Note>
            )}
            {after[it.id] && <Note tone="ok">Verified output: {after[it.id].fields} EXIF fields and {after[it.id].blocks} metadata blocks remain · {kb(after[it.id].size)} (was {kb(it.bytes.length)}).</Note>}
          </Panel>
        )}
      </div>
    </Split>
  )
}
