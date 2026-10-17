import { useEffect, useMemo, useState } from 'react'
import { Btn, CopyButton, CsvButton, download, FileDrop, Note, num, Panel, Row, Split, Stat, Stats, Table, Txt } from '../kit'
import { display, dms, findTiff, jpegWithExif, parseTiff, rat, stripJpeg, writeTiff, type Tag } from './lib/exif-viewer'

interface Loaded { name: string; size: number; type: string; url: string; bytes: Uint8Array; tags: Tag[]; w: number; h: number }

/** Paints a small landscape and stamps realistic EXIF on it, so the first screen has data. */
async function demoPhoto(): Promise<File> {
  const c = document.createElement('canvas')
  c.width = 960
  c.height = 640
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, 640)
  sky.addColorStop(0, '#1e3a8a')
  sky.addColorStop(0.55, '#f97316')
  sky.addColorStop(1, '#fde68a')
  g.fillStyle = sky
  g.fillRect(0, 0, 960, 640)
  g.fillStyle = '#fef3c7'
  g.beginPath()
  g.arc(620, 380, 60, 0, Math.PI * 2)
  g.fill()
  const ridge = (y: number, amp: number, col: string, seed: number) => {
    g.fillStyle = col
    g.beginPath()
    g.moveTo(0, 640)
    for (let x = 0; x <= 960; x += 8) g.lineTo(x, y + Math.sin(x / 90 + seed) * amp + Math.sin(x / 31 + seed * 2) * amp * 0.3)
    g.lineTo(960, 640)
    g.fill()
  }
  ridge(420, 40, '#7c2d12', 1)
  ridge(480, 30, '#431407', 3)
  ridge(560, 18, '#1c0a03', 5)
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.88))
  const tiff = writeTiff(
    [
      { id: 0x010f, type: 2, value: 'FUJIFILM' },
      { id: 0x0110, type: 2, value: 'X-T5' },
      { id: 0x0112, type: 3, value: [1] },
      { id: 0x011a, type: 5, value: [[300, 1]] },
      { id: 0x011b, type: 5, value: [[300, 1]] },
      { id: 0x0128, type: 3, value: [2] },
      { id: 0x0131, type: 2, value: 'Digital Camera X-T5 Ver2.10' },
      { id: 0x0132, type: 2, value: '2026:06:21 20:41:07' },
      { id: 0x013b, type: 2, value: 'Demo Photographer' },
    ],
    [
      { id: 0x829a, type: 5, value: [[1, 500]] },
      { id: 0x829d, type: 5, value: [[56, 10]] },
      { id: 0x8822, type: 3, value: [3] },
      { id: 0x8827, type: 3, value: [160] },
      { id: 0x9003, type: 2, value: '2026:06:21 20:41:07' },
      { id: 0x9010, type: 2, value: '+02:00' },
      { id: 0x9204, type: 10, value: [[-1, 3]] },
      { id: 0x9207, type: 3, value: [5] },
      { id: 0x9209, type: 3, value: [16] },
      { id: 0x920a, type: 5, value: [[35, 1]] },
      { id: 0xa001, type: 3, value: [1] },
      { id: 0xa002, type: 4, value: [960] },
      { id: 0xa003, type: 4, value: [640] },
      { id: 0xa402, type: 3, value: [0] },
      { id: 0xa403, type: 3, value: [0] },
      { id: 0xa405, type: 3, value: [53] },
      { id: 0xa406, type: 3, value: [1] },
      { id: 0xa432, type: 5, value: [[16, 1], [55, 1], [28, 10], [28, 10]] },
      { id: 0xa433, type: 2, value: 'FUJIFILM' },
      { id: 0xa434, type: 2, value: 'XF16-55mmF2.8 R LM WR' },
    ],
    [
      { id: 0x01, type: 2, value: 'N' },
      { id: 0x02, type: 5, value: [[46, 1], [33, 1], [5412, 100]] },
      { id: 0x03, type: 2, value: 'E' },
      { id: 0x04, type: 5, value: [[7, 1], [58, 1], [3180, 100]] },
      { id: 0x05, type: 3, value: [0] },
      { id: 0x06, type: 5, value: [[23425, 10]] },
      { id: 0x07, type: 5, value: [[18, 1], [41, 1], [7, 1]] },
      { id: 0x1d, type: 2, value: '2026:06:21' },
    ],
  )
  const bytes = jpegWithExif(new Uint8Array(await blob.arrayBuffer()), tiff)
  return new File([bytes as BlobPart], 'demo-alps-sunset.jpg', { type: 'image/jpeg' })
}

async function readFile(f: File): Promise<Loaded> {
  const bytes = new Uint8Array(await f.arrayBuffer())
  const t = findTiff(bytes)
  const tags = t ? parseTiff(t) : []
  const url = URL.createObjectURL(f)
  const { w, h } = await new Promise<{ w: number; h: number }>((res) => {
    const img = new Image()
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => res({ w: 0, h: 0 })
    img.src = url
  })
  return { name: f.name, size: f.size, type: f.type || 'unknown', url, bytes, tags, w, h }
}

const TILE = 256
function OsmMap({ lat, lon }: { lat: number; lon: number }) {
  const [z, setZ] = useState(14)
  const n = 2 ** z
  const fx = ((lon + 180) / 360) * n
  const lr = (lat * Math.PI) / 180
  const fy = ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2) * n
  const tx = Math.floor(fx), ty = Math.floor(fy)
  const tiles: [number, number][] = []
  for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) tiles.push([tx + dx, ty + dy])
  return (
    <div>
      <div style={{ position: 'relative', height: 280, overflow: 'hidden', borderRadius: 10, background: 'var(--line)' }}>
        {tiles.map(([x, y]) => (
          <img
            key={`${x}/${y}`}
            alt=""
            src={`https://tile.openstreetmap.org/${z}/${((x % n) + n) % n}/${y}.png`}
            width={TILE}
            height={TILE}
            loading="lazy"
            style={{ position: 'absolute', left: `calc(50% + ${(x - fx) * TILE}px)`, top: 140 + (y - fy) * TILE, maxWidth: 'none' }}
          />
        ))}
        <div style={{ position: 'absolute', left: '50%', top: 140, transform: 'translate(-50%, -100%)', fontSize: 30, lineHeight: 1, filter: 'drop-shadow(0 2px 2px #0006)' }}>📍</div>
        <span style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 10, background: '#fffc', color: '#333', padding: '0 4px', borderRadius: 4 }}>© OpenStreetMap contributors</span>
      </div>
      <Row>
        <Btn onClick={() => setZ(Math.min(18, z + 1))}>＋</Btn>
        <Btn onClick={() => setZ(Math.max(3, z - 1))}>－</Btn>
        <a className="k-btn" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${z}/${lat}/${lon}`} target="_blank" rel="noreferrer">Open in OSM ↗</a>
        <a className="k-btn" href={`https://www.google.com/maps?q=${lat},${lon}`} target="_blank" rel="noreferrer">Google Maps ↗</a>
      </Row>
    </div>
  )
}

const kb = (b: number) => (b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(2)} MB`)

export default function ExifViewer() {
  const [img, setImg] = useState<Loaded | null>(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  const open = async (f: File) => {
    setErr('')
    try {
      const l = await readFile(f)
      setImg((old) => {
        if (old) URL.revokeObjectURL(old.url)
        return l
      })
    } catch (e) {
      setErr(String(e))
    }
  }
  useEffect(() => {
    void demoPhoto().then(open)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const get = (name: string) => img?.tags.find((t) => t.name === name)
  const show = (name: string) => {
    const t = get(name)
    return t ? display(t) : ''
  }
  const gps = useMemo(() => {
    if (!img) return null
    const T = (n: string) => img.tags.find((t) => t.name === n)
    const la = T('GPSLatitude'), lo = T('GPSLongitude')
    if (!la || !lo) return null
    const lat = dms(la.value, String(T('GPSLatitudeRef')?.value ?? 'N'))
    const lon = dms(lo.value, String(T('GPSLongitudeRef')?.value ?? 'E'))
    const alt = T('GPSAltitude') ? rat(T('GPSAltitude')!.value) * (T('GPSAltitudeRef')?.value === 1 ? -1 : 1) : NaN
    return Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0) ? { lat, lon, alt } : null
  }, [img])

  const rows = (img?.tags ?? []).filter((t) => !/Pointer$|MakerNote|Thumbnail/.test(t.name))
  const shown = rows.filter((t) => !q || `${t.name} ${display(t)}`.toLowerCase().includes(q.toLowerCase()))
  const camera = [show('Make'), show('Model')].filter(Boolean).join(' ').replace(/^(\w+) \1 /i, '$1 ')
  const settings = [show('FocalLength'), show('FNumber'), show('ExposureTime'), get('ISO') ? `ISO ${get('ISO')!.value}` : '', show('ExposureBiasValue')].filter(Boolean)

  const stripped = async () => {
    if (!img) return
    const base = img.name.replace(/\.[^.]+$/, '')
    if (img.bytes[0] === 0xff && img.bytes[1] === 0xd8) {
      download(`${base}-clean.jpg`, new Blob([stripJpeg(img.bytes) as BlobPart], { type: 'image/jpeg' }))
      return
    }
    // other formats: re-encode through a canvas, which drops all metadata
    const im = new Image()
    im.src = img.url
    await im.decode()
    const c = document.createElement('canvas')
    c.width = im.naturalWidth
    c.height = im.naturalHeight
    c.getContext('2d')!.drawImage(im, 0, 0)
    c.toBlob((b) => b && download(`${base}-clean.png`, b), 'image/png')
  }

  return (
    <Split>
      <div>
        <Panel title="Photo">
          <FileDrop accept="image/*,.heic,.tif,.tiff,.dng" onFiles={(f) => void open(f[0])} label="Drop a photo (JPEG, PNG, WebP, TIFF, HEIC)" />
          {err && <Note tone="err">{err}</Note>}
          {img && img.w > 0 && <img src={img.url} alt={img.name} style={{ width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: 10, marginTop: 10, background: 'var(--line)' }} />}
          {img && <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>{img.name} · {kb(img.size)} · {img.w ? `${img.w}×${img.h}px` : 'preview not supported by this browser'}</p>}
          <Row>
            <Btn onClick={() => void demoPhoto().then(open)}>Load demo photo</Btn>
            <Btn kind="primary" disabled={!img} onClick={() => void stripped()}>⬇ Copy without metadata</Btn>
          </Row>
        </Panel>
        <Panel title="Location">
          {gps ? (
            <>
              <p style={{ margin: '0 0 8px' }}>
                <b className="mono">{gps.lat.toFixed(6)}, {gps.lon.toFixed(6)}</b>
                {Number.isFinite(gps.alt) && <span className="muted"> · altitude {num(gps.alt, 0)} m</span>}
              </p>
              <OsmMap key={`${gps.lat},${gps.lon}`} lat={gps.lat} lon={gps.lon} />
              <Note tone="warn">This photo reveals where it was taken. Use “Copy without metadata” before sharing it publicly.</Note>
            </>
          ) : (
            <Note tone="ok">No GPS position in this file.</Note>
          )}
        </Panel>
      </div>
      <div>
        {img && (
          <Stats>
            <Stat label="Camera" value={camera || '—'} sub={show('LensModel') || show('Software')} />
            <Stat label="Exposure" value={settings.slice(1, 4).join(' · ') || '—'} sub={settings[0] ? `${settings[0]}${get('FocalLengthIn35mmFilm') ? ` (${show('FocalLengthIn35mmFilm')} equiv.)` : ''}` : undefined} tone="accent" />
            <Stat label="Taken" value={(show('DateTimeOriginal') || show('DateTime') || '—').replace(/^(\d{4}):(\d\d):(\d\d)/, '$1-$2-$3')} sub={show('OffsetTimeOriginal') || show('OffsetTime') ? `UTC${show('OffsetTimeOriginal') || show('OffsetTime')}` : undefined} />
            <Stat label="Tags found" value={rows.length} sub={rows.length ? `${new Set(rows.map((r) => r.ifd)).size} IFDs` : 'no EXIF block'} />
          </Stats>
        )}
        <Panel
          title="All metadata"
          actions={
            <>
              <CopyButton label="Copy" text={() => shown.map((t) => `${t.name}: ${display(t)}`).join('\n')} />
              <CsvButton name="exif.csv" rows={() => [['Group', 'Tag', 'Value'], ...rows.map((t) => [t.ifd, t.name, display(t)])]} />
              <Btn onClick={() => download('exif.json', JSON.stringify(Object.fromEntries(rows.map((t) => [t.name, display(t)])), null, 2), 'application/json')}>⬇ JSON</Btn>
            </>
          }
        >
          <Txt label="Filter" value={q} onChange={setQ} placeholder="e.g. lens, GPS, ISO" />
          {img && !rows.length ? (
            <Note tone="warn">No EXIF metadata found. Screenshots, images saved from messengers or social networks usually have it removed.</Note>
          ) : (
            <Table
              head={['Group', 'Tag', 'Value']}
              rows={shown.map((t) => [<span key="g" className="muted">{t.ifd}</span>, t.name, <span key="v" style={{ wordBreak: 'break-word' }}>{display(t)}</span>])}
            />
          )}
        </Panel>
        <Note>Everything is parsed in your browser; the photo is never uploaded. Map tiles are loaded from OpenStreetMap only when the photo has GPS data.</Note>
      </div>
    </Split>
  )
}
