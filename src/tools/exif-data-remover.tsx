import { useEffect, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Panel, Row, Seg, Split, Stat, Stats, useToolState } from '../kit'
import { display, dms, findTiff, jpegWithExif, parseTiff, writeTiff, type Tag } from './lib/exif-viewer'
import { nearestCity } from './lib/exif-metadata-stripper'
import { detect, scan, stripLossless, uniqueNames, zip } from './lib/metadata-stripper'
import { cleanName, countFields, kb, summarize } from './lib/exif-data-remover'

type Method = 'lossless' | 'redraw'
const DEF = { method: 'lossless' as Method, keepOrientation: true }

interface Meta { fields: number; tags: Tag[]; gps: [number, number] | null; camera: string; when: string }
interface Item {
  id: string
  name: string
  thumb: string
  before: Meta
  bytesBefore: number
  out?: { bytes: Uint8Array; name: string; after: Meta; method: string; type: string }
  err?: string
}

function readMeta(b: Uint8Array): Meta {
  let tags: Tag[] = []
  try {
    const t = findTiff(b)
    tags = t ? parseTiff(t).filter((x) => !/Pointer$/.test(x.name) && x.ifd !== 'IFD1') : []
  } catch {
    tags = []
  }
  const get = (n: string) => tags.find((x) => x.name === n)
  const la = get('GPSLatitude'), lo = get('GPSLongitude')
  const gps: [number, number] | null = la && lo ? [dms(la.value, String(get('GPSLatitudeRef')?.value ?? 'N')), dms(lo.value, String(get('GPSLongitudeRef')?.value ?? 'E'))] : null
  return {
    fields: countFields(tags, scan(b)),
    tags,
    gps: gps && Number.isFinite(gps[0]) && Number.isFinite(gps[1]) ? gps : null,
    camera: [get('Make'), get('Model')].filter(Boolean).map((t) => display(t!)).join(' '),
    when: get('DateTimeOriginal') ? display(get('DateTimeOriginal')!) : '',
  }
}

async function redraw(f: Blob, type: string): Promise<{ bytes: Uint8Array; type: string }> {
  const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' })
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  c.getContext('2d')!.drawImage(bmp, 0, 0)
  bmp.close()
  const t = /^image\/(jpeg|png|webp)$/.test(type) ? type : 'image/jpeg'
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, t, 0.92))
  if (!blob) throw new Error('This browser could not re-encode the image')
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: t }
}

async function demoPhoto(name: string, hue: number, cam: [string, string], gps: [number, number] | null, date: string): Promise<File> {
  const c = document.createElement('canvas')
  c.width = 640
  c.height = 420
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, 420)
  sky.addColorStop(0, `hsl(${hue},70%,60%)`)
  sky.addColorStop(1, `hsl(${hue + 35},80%,85%)`)
  g.fillStyle = sky
  g.fillRect(0, 0, 640, 420)
  g.fillStyle = `hsl(${hue + 50},90%,70%)`
  g.beginPath()
  g.arc(480, 110, 46, 0, 7)
  g.fill()
  g.fillStyle = `hsl(${hue + 170},35%,28%)`
  g.beginPath()
  g.moveTo(0, 420)
  for (let x = 0; x <= 640; x += 16) g.lineTo(x, 280 + Math.sin(x / 53 + hue) * 40 + Math.cos(x / 17) * 9)
  g.lineTo(640, 420)
  g.fill()
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.88))
  const deg = (v: number): [number, number][] => {
    const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60)
    return [[d, 1], [m, 1], [Math.round(((a - d) * 60 - m) * 6000), 100]]
  }
  const tiff = writeTiff(
    [{ id: 0x010f, type: 2, value: cam[0] }, { id: 0x0110, type: 2, value: cam[1] }, { id: 0x0112, type: 3, value: [1] }, { id: 0x0131, type: 2, value: 'Camera 4.2' }, { id: 0x0132, type: 2, value: date }, { id: 0x013b, type: 2, value: 'Alex Morgan' }],
    [{ id: 0x829a, type: 5, value: [[1, 320]] }, { id: 0x829d, type: 5, value: [[18, 10]] }, { id: 0x8827, type: 3, value: [100] }, { id: 0x9003, type: 2, value: date }, { id: 0x920a, type: 5, value: [[52, 10]] }, { id: 0xa431, type: 2, value: 'SN 7Q4K92XL' }],
    gps ? [{ id: 1, type: 2, value: gps[0] >= 0 ? 'N' : 'S' }, { id: 2, type: 5, value: deg(gps[0]) }, { id: 3, type: 2, value: gps[1] >= 0 ? 'E' : 'W' }, { id: 4, type: 5, value: deg(gps[1]) }, { id: 6, type: 5, value: [[4120, 100]] }] : [],
  )
  const bytes = jpegWithExif(new Uint8Array(await blob.arrayBuffer()), tiff)
  return new File([bytes as BlobPart], name, { type: 'image/jpeg' })
}

const demo = () =>
  Promise.all([
    demoPhoto('IMG_4021.jpg', 200, ['Apple', 'iPhone 15 Pro'], [48.85837, 2.29448], '2026:07:12 19:41:07'),
    demoPhoto('PXL_20260803.jpg', 20, ['Google', 'Pixel 8'], [40.68925, -74.0445], '2026:08:03 10:12:55'),
    demoPhoto('DSC08817.jpg', 120, ['SONY', 'ILCE-7M4'], null, '2026:09:21 08:05:30'),
  ])

export default function ExifDataRemover() {
  const [s, set] = useToolState('exif-data-remover', DEF)
  const [files, setFiles] = useState<File[]>([])
  const [res, setRes] = useState<{ files: File[]; opt: string; items: Item[] }>({ files: [], opt: '', items: [] })
  const opt = `${s.method}:${s.keepOrientation}`
  const items = res.items
  const busy = res.files !== files || res.opt !== opt
  const [isDemo, setIsDemo] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const urls = useRef<string[]>([])

  useEffect(() => {
    void demo().then(setFiles)
  }, [])

  useEffect(() => {
    if (!files.length) return
    let stop = false
    void (async () => {
      const out: Item[] = []
      const made: string[] = []
      for (const f of files) {
        const b = new Uint8Array(await f.arrayBuffer())
        const thumb = URL.createObjectURL(f)
        made.push(thumb)
        const it: Item = { id: `${f.name}:${f.size}:${out.length}`, name: f.name, thumb, before: readMeta(b), bytesBefore: f.size }
        try {
          let bytes: Uint8Array | null = null
          let type = f.type || `image/${detect(b)}`
          let method = 'Lossless'
          if (s.method === 'lossless') {
            const o = Number(it.before.tags.find((t) => t.name === 'Orientation')?.value ?? 1)
            bytes = stripLossless(b, { keepIcc: true, orientation: s.keepOrientation ? o : 1 })
          }
          if (!bytes) {
            const r = await redraw(f, type)
            bytes = r.bytes
            type = r.type
            method = s.method === 'lossless' ? 'Redrawn (no lossless path for this format)' : 'Redrawn on canvas'
          }
          const ext = type === f.type ? undefined : `.${type.split('/')[1].replace('jpeg', 'jpg')}`
          it.out = { bytes, type, method, name: cleanName(f.name, ext), after: readMeta(bytes) }
        } catch (e) {
          it.err = (e as Error).message
        }
        out.push(it)
      }
      if (stop) return made.forEach((u) => URL.revokeObjectURL(u))
      urls.current.forEach((u) => URL.revokeObjectURL(u))
      urls.current = made
      setRes({ files, opt: `${s.method}:${s.keepOrientation}`, items: out })
    })()
    return () => {
      stop = true
    }
  }, [files, s.method, s.keepOrientation])

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const done = items.filter((i) => i.out)
  const sum = summarize(done.map((i) => ({ fieldsBefore: i.before.fields, fieldsAfter: i.out!.after.fields, gps: !!i.before.gps, bytesBefore: i.bytesBefore, bytesAfter: i.out!.bytes.length })))
  const saveOne = (i: Item) => i.out && download(i.out.name, new Blob([i.out.bytes as BlobPart], { type: i.out.type }))
  const saveAll = () => {
    if (done.length === 1) return saveOne(done[0])
    const names = uniqueNames(done.map((i) => i.out!.name))
    download('clean-photos.zip', new Blob([zip(done.map((i, k) => ({ name: names[k], data: i.out!.bytes }))) as BlobPart], { type: 'application/zip' }))
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Drop photos">
          <FileDrop
            accept="image/jpeg,image/png,image/webp,image/*"
            multiple
            onFiles={(fs) => {
              setIsDemo(false)
              setFiles(fs)
            }}
            label={<>Drop any number of photos — they are cleaned instantly</>}
          />
          {isDemo && <Note>Showing 3 demo photos with camera, owner and GPS data. Drop your own to replace them.</Note>}
          <div style={{ marginTop: 12 }}>
            <Btn kind="primary" onClick={saveAll} disabled={!done.length || busy}>
              ⬇ {done.length > 1 ? `Download all ${done.length} clean photos (ZIP)` : 'Download clean photo'}
            </Btn>
          </div>
        </Panel>
        <Panel title="How to clean">
          <Seg value={s.method} onChange={(method) => set({ method })} options={[['lossless', 'Lossless (recommended)'], ['redraw', 'Redraw on canvas']]} />
          <p className="muted" style={{ fontSize: 13 }}>
            {s.method === 'lossless'
              ? 'Cuts the EXIF, GPS, XMP, IPTC and comment blocks out of the file. Pixels are not touched, so quality and size stay the same.'
              : 'Draws the picture onto a blank canvas and saves a brand-new file. Nothing but pixels survives — slight JPEG re-compression.'}
          </p>
          <Check label="Keep rotation (Orientation tag only)" value={s.keepOrientation} onChange={(keepOrientation) => set({ keepOrientation })} />
        </Panel>
        <Note tone="ok">Everything happens on your device. Photos are never uploaded.</Note>
      </div>

      <div>
        <Stats>
          <Stat label="Photos cleaned" value={`${done.length}/${items.length}`} tone={done.length && done.length === items.length ? 'good' : undefined} />
          <Stat label="Fields removed" value={sum.removed} tone="accent" />
          <Stat label="Locations removed" value={sum.gps} tone={sum.gps ? 'bad' : undefined} sub="photos had GPS" />
          <Stat label="Size" value={kb(sum.after)} sub={`was ${kb(sum.before)}`} />
        </Stats>
        <Panel title={busy ? 'Cleaning…' : 'Before → after'}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
            {items.map((i) => {
              const a = i.out?.after
              const near = i.before.gps ? nearestCity(i.before.gps[0], i.before.gps[1]) : null
              return (
                <div key={i.id} style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: 'var(--panel)' }}>
                  <div style={{ position: 'relative' }}>
                    <img src={i.thumb} alt={i.name} style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block' }} />
                    {i.before.gps && <span style={{ position: 'absolute', top: 8, left: 8, background: '#dc2626', color: '#fff', fontSize: 12, padding: '2px 8px', borderRadius: 99 }}>📍 GPS removed</span>}
                  </div>
                  <div style={{ padding: 10 }}>
                    <b style={{ wordBreak: 'break-all', fontSize: 14 }}>{i.name}</b>
                    {i.err ? (
                      <Note tone="err">{i.err}</Note>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '6px 0' }}>
                          <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--err)' }}>{i.before.fields}</span>
                          <span className="muted">fields →</span>
                          <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--ok)' }}>{a?.fields ?? '…'}</span>
                        </div>
                        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                          {i.before.camera && <div>📷 {i.before.camera}</div>}
                          {i.before.when && <div>🕒 {i.before.when}</div>}
                          {near && <div>📍 {near.km < 30 ? `in ${near.name}` : `${Math.round(near.km)} km ${near.bearing} of ${near.name}`}</div>}
                          {!i.before.fields && <div>Already clean</div>}
                          {i.out && <div>{i.out.method} · {kb(i.bytesBefore)} → {kb(i.out.bytes.length)}</div>}
                        </div>
                        <Row>
                          <Btn onClick={() => saveOne(i)} disabled={!i.out}>⬇ Clean copy</Btn>
                          {i.before.fields > 0 && <Btn kind="ghost" onClick={() => setOpen(open === i.id ? null : i.id)}>{open === i.id ? 'Hide' : 'What was inside?'}</Btn>}
                        </Row>
                        {open === i.id && (
                          <div style={{ fontSize: 12, marginTop: 6, maxHeight: 180, overflow: 'auto' }}>
                            {i.before.tags.map((t) => (
                              <div key={t.ifd + t.id} style={{ display: 'flex', gap: 6, textDecoration: a?.tags.some((x) => x.name === t.name) ? undefined : 'line-through' }}>
                                <span style={{ color: t.ifd === 'GPS' ? 'var(--err)' : 'var(--muted)', minWidth: 110 }}>{t.name}</span>
                                <span style={{ wordBreak: 'break-word' }}>{display(t)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {!items.length && <p className="muted">Drop photos on the left to get started.</p>}
        </Panel>
        <Note>
          “Fields” counts every EXIF and GPS tag plus each XMP, IPTC, comment or PNG text block. The colour profile is kept so colours look the same. With “Keep rotation”
          a single Orientation tag is written back so phone photos don’t appear sideways.
        </Note>
      </div>
    </Split>
  )
}
