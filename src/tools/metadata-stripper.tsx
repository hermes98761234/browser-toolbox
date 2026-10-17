import { useCallback, useEffect, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { display, dms, findTiff, jpegWithExif, parseTiff, writeTiff, type Tag } from './lib/exif-viewer'
import { concat, crc32, detect, scan, stripLossless, uniqueNames, zip, type Block } from './lib/metadata-stripper'

type Mode = 'lossless' | 'reencode'
const DEF = {
  mode: 'lossless' as Mode,
  keepIcc: true,
  keepOrientation: true,
  quality: 0.92,
}

interface Meta {
  blocks: Block[]
  tags: Tag[]
  gps: string | null
  camera: string | null
}
interface Item {
  id: string
  name: string
  type: string
  url: string
  size: number
  before: Meta
  out?: { bytes: Uint8Array; url: string; after: Meta; method: string }
  err?: string
}

const SENSITIVE =
  /^(GPS|Make|Model|BodySerialNumber|LensSerialNumber|CameraOwnerName|Artist|Copyright|DateTime|ImageUniqueID|Software|LensModel|UserComment|ImageDescription|OffsetTime|SubSecTime)/

function readMeta(b: Uint8Array): Meta {
  const t = findTiff(b)
  let tags: Tag[] = []
  try {
    tags = t ? parseTiff(t).filter((x) => !/Pointer$/.test(x.name) && x.ifd !== 'IFD1') : []
  } catch {
    tags = []
  }
  const get = (n: string) => tags.find((x) => x.name === n)
  const la = get('GPSLatitude'),
    lo = get('GPSLongitude')
  const gps =
    la && lo
      ? `${dms(la.value, String(get('GPSLatitudeRef')?.value ?? 'N')).toFixed(5)}, ${dms(lo.value, String(get('GPSLongitudeRef')?.value ?? 'E')).toFixed(5)}`
      : null
  const cam = [get('Make')?.value, get('Model')?.value].filter(Boolean).join(' ') || null
  return { blocks: scan(b), tags, gps, camera: cam }
}

const kb = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`)

async function canvasDemo(w: number, h: number, hue: number, type: string): Promise<Uint8Array> {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, `hsl(${hue},70%,55%)`)
  sky.addColorStop(1, `hsl(${hue + 40},80%,80%)`)
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)
  g.fillStyle = `hsl(${hue + 180},30%,25%)`
  g.beginPath()
  g.moveTo(0, h)
  for (let x = 0; x <= w; x += 20) g.lineTo(x, h * 0.65 + Math.sin(x / 47) * 30 + Math.cos(x / 13) * 8)
  g.lineTo(w, h)
  g.fill()
  g.fillStyle = '#fff8'
  g.font = 'bold 28px system-ui'
  g.fillText(type === 'image/png' ? 'screenshot.png' : 'IMG_2048.jpg', 20, 44)
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), type, 0.9))
  return new Uint8Array(await blob.arrayBuffer())
}

function pngChunk(type: string, body: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(type)
  const out = new Uint8Array(12 + body.length)
  new DataView(out.buffer).setUint32(0, body.length)
  out.set(t, 4)
  out.set(body, 8)
  new DataView(out.buffer).setUint32(8 + body.length, crc32(concat([t, body])))
  return out
}

async function demoFiles(): Promise<File[]> {
  const tiff = writeTiff(
    [
      { id: 0x010f, type: 2, value: 'Apple' },
      { id: 0x0110, type: 2, value: 'iPhone 15 Pro' },
      { id: 0x0112, type: 3, value: [1] },
      { id: 0x0131, type: 2, value: '18.1' },
      { id: 0x0132, type: 2, value: '2026:09:14 18:22:31' },
      { id: 0x013b, type: 2, value: 'Jane Doe' },
    ],
    [
      { id: 0x829a, type: 5, value: [[1, 250]] },
      { id: 0x829d, type: 5, value: [[178, 100]] },
      { id: 0x8827, type: 3, value: [64] },
      { id: 0x9003, type: 2, value: '2026:09:14 18:22:31' },
      { id: 0x920a, type: 5, value: [[678, 100]] },
      { id: 0xa431, type: 2, value: 'F2LXK9QWPN' },
      {
        id: 0xa434,
        type: 2,
        value: 'iPhone 15 Pro back triple camera 6.78mm f/1.78',
      },
    ],
    [
      { id: 0x01, type: 2, value: 'N' },
      {
        id: 0x02,
        type: 5,
        value: [
          [48, 1],
          [51, 1],
          [2958, 100],
        ],
      },
      { id: 0x03, type: 2, value: 'E' },
      {
        id: 0x04,
        type: 5,
        value: [
          [2, 1],
          [17, 1],
          [4012, 100],
        ],
      },
      { id: 0x06, type: 5, value: [[3520, 100]] },
    ],
  )
  const jpg = jpegWithExif(await canvasDemo(800, 533, 200, 'image/jpeg'), tiff)
  const png = await canvasDemo(640, 400, 280, 'image/png')
  const enc = new TextEncoder()
  const ihdrEnd = 8 + 25
  const text = [
    pngChunk('tEXt', enc.encode('Author\0Jane Doe')),
    pngChunk('tEXt', enc.encode('Software\0Greenshot 1.3')),
    pngChunk('tEXt', enc.encode('Comment\0Bank account page - 14 Sep')),
  ]
  const png2 = concat([png.subarray(0, ihdrEnd), ...text, png.subarray(ihdrEnd)])
  return [new File([jpg as BlobPart], 'IMG_2048.jpg', { type: 'image/jpeg' }), new File([png2 as BlobPart], 'screenshot.png', { type: 'image/png' })]
}

async function reencode(f: File, quality: number): Promise<Uint8Array> {
  const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' })
  const c = document.createElement('canvas')
  c.width = bmp.width
  c.height = bmp.height
  c.getContext('2d')!.drawImage(bmp, 0, 0)
  bmp.close()
  const type = /^image\/(jpeg|png|webp)$/.test(f.type) ? f.type : 'image/png'
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, type, quality))
  if (!blob) throw new Error('Could not encode image')
  return new Uint8Array(await blob.arrayBuffer())
}

function MetaList({ m, title }: { m: Meta; title: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <h4 style={{ margin: '4px 0 8px' }}>{title}</h4>
      {m.blocks.length === 0 && m.tags.length === 0 ? (
        <Note tone="ok">No metadata blocks found.</Note>
      ) : (
        <>
          <Row>
            {m.blocks.map((b, i) => (
              <span
                key={i}
                className="k-chip"
                style={{
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 12,
                  border: '1px solid var(--line)',
                  color: b.sensitive ? 'var(--err)' : 'var(--muted)',
                }}
                title={b.detail}
              >
                {b.kind} · {kb(b.bytes)}
              </span>
            ))}
          </Row>
          {m.tags.length > 0 && (
            <Table
              head={['Tag', 'Value']}
              rows={m.tags.map((t) => [
                <span
                  key="n"
                  style={{
                    color: SENSITIVE.test(t.name) ? 'var(--err)' : undefined,
                    fontWeight: SENSITIVE.test(t.name) ? 700 : 400,
                  }}
                >
                  {t.name}
                </span>,
                <span key="v" style={{ wordBreak: 'break-word' }}>
                  {display(t)}
                </span>,
              ])}
              max={40}
            />
          )}
          {m.blocks
            .filter((b) => b.detail)
            .map((b, i) => (
              <p key={i} className="muted" style={{ margin: '4px 0', fontSize: 13 }}>
                {b.kind}: “{b.detail}”
              </p>
            ))}
        </>
      )}
    </div>
  )
}

export default function MetadataStripper() {
  const [s, set] = useToolState('metadata-stripper', DEF)
  const [items, setItems] = useState<Item[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [sel, setSel] = useState(0)
  const urls = useRef<string[]>([])

  const process = useCallback(
    async (fs: File[]) => {
      urls.current.forEach((u) => URL.revokeObjectURL(u))
      urls.current = []
      const out: Item[] = []
      for (const f of fs) {
        const b = new Uint8Array(await f.arrayBuffer())
        const url = URL.createObjectURL(f)
        urls.current.push(url)
        const before = readMeta(b)
        const item: Item = {
          id: f.name + f.size,
          name: f.name,
          type: f.type || detect(b),
          url,
          size: f.size,
          before,
        }
        try {
          let bytes: Uint8Array | null = null
          let method = ''
          if (s.mode === 'lossless') {
            const o = before.tags.find((t) => t.name === 'Orientation')
            bytes = stripLossless(b, {
              keepIcc: s.keepIcc,
              orientation: s.keepOrientation ? Number(o?.value ?? 1) : 1,
            })
            method = 'Lossless (blocks removed, pixels untouched)'
          }
          if (!bytes) {
            bytes = await reencode(f, s.quality)
            method = s.mode === 'lossless' ? 'Re-encoded (format has no lossless path)' : 'Re-encoded via canvas'
          }
          const ourl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: f.type }))
          urls.current.push(ourl)
          item.out = { bytes, url: ourl, after: readMeta(bytes), method }
        } catch (e) {
          item.err = (e as Error).message
        }
        out.push(item)
      }
      setItems(out)
      setSel((i) => Math.min(i, Math.max(0, out.length - 1)))
    },
    [s.mode, s.keepIcc, s.keepOrientation, s.quality],
  )

  useEffect(() => {
    if (!files.length) {
      void demoFiles().then(setFiles)
      return
    }
    const t = setTimeout(() => void process(files), 0)
    return () => clearTimeout(t)
  }, [files, process])
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const cur = items[sel]
  const done = items.filter((i) => i.out)
  const removed = items.reduce((a, i) => a + i.before.blocks.filter((b) => !i.out?.after.blocks.some((x) => x.kind === b.kind)).length, 0)
  const gpsCount = items.filter((i) => i.before.gps).length
  const saved = done.reduce((a, i) => a + i.size - i.out!.bytes.length, 0)
  const outName = (n: string) => n.replace(/(\.[^.]*)?$/, (e) => `-clean${e || '.png'}`)

  return (
    <Split wide="right">
      <div>
        <Panel title="Photos">
          <FileDrop
            accept="image/*"
            multiple
            onFiles={(fs) => {
              setSel(0)
              setFiles(fs)
            }}
            label="Drop photos (JPEG, PNG, WebP, …) — nothing is uploaded"
          />
          <Btn
            kind="ghost"
            onClick={() =>
              void demoFiles().then((f) => {
                setSel(0)
                setFiles(f)
              })
            }
          >
            Load demo photos
          </Btn>
        </Panel>
        <Panel title="Method">
          <Seg
            value={s.mode}
            onChange={(mode) => set({ mode })}
            options={[
              ['lossless', 'Lossless strip'],
              ['reencode', 'Canvas re-encode'],
            ]}
          />
          {s.mode === 'lossless' ? (
            <>
              <p className="muted" style={{ fontSize: 13 }}>
                Cuts EXIF, XMP, IPTC, comments and text chunks out of the file. Image data stays bit-identical.
              </p>
              <Check label="Keep colour profile (ICC)" value={s.keepIcc} onChange={(keepIcc) => set({ keepIcc })} />
              <Check label="Keep rotation (Orientation tag only)" value={s.keepOrientation} onChange={(keepOrientation) => set({ keepOrientation })} />
            </>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 13 }}>
                Redraws pixels on a canvas and saves a brand-new file. Rotation is baked in. Works for any format the browser can open.
              </p>
              <Slider
                label="JPEG/WebP quality"
                value={s.quality}
                onChange={(quality) => set({ quality })}
                min={0.5}
                max={1}
                step={0.01}
                show={(v) => `${Math.round(v * 100)}%`}
              />
            </>
          )}
        </Panel>
        <Panel
          title="Files"
          actions={
            done.length > 1 && (
              <Btn
                kind="primary"
                onClick={() =>
                  download(
                    'clean-photos.zip',
                    new Blob([zip(uniqueNames(done.map((i) => outName(i.name))).map((name, k) => ({ name, data: done[k].out!.bytes }))) as BlobPart]),
                    'application/zip',
                  )
                }
              >
                ⬇ ZIP all
              </Btn>
            )
          }
        >
          {items.map((it, i) => (
            <button
              key={it.id + i}
              type="button"
              onClick={() => setSel(i)}
              className="k-btn ghost"
              style={{
                display: 'flex',
                gap: 10,
                width: '100%',
                alignItems: 'center',
                textAlign: 'left',
                marginBottom: 6,
                outline: i === sel ? '2px solid var(--accent)' : undefined,
              }}
            >
              <img
                src={it.url}
                alt=""
                style={{
                  width: 44,
                  height: 44,
                  objectFit: 'cover',
                  borderRadius: 6,
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {it.name}
                </b>
                <span className="muted" style={{ fontSize: 12 }}>
                  {it.before.blocks.length} block(s) {it.before.gps ? '· 📍 GPS' : ''} → {it.out ? `${it.out.after.blocks.length} left` : (it.err ?? '…')}
                </span>
              </span>
            </button>
          ))}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Files cleaned" value={`${done.length}/${items.length}`} />
          <Stat label="Blocks removed" value={removed} tone="good" />
          <Stat label="Had GPS location" value={gpsCount} tone={gpsCount ? 'bad' : undefined} />
          <Stat label="Bytes saved" value={kb(Math.max(0, saved))} />
        </Stats>
        {cur && (
          <Panel
            title={cur.name}
            actions={
              cur.out && (
                <Btn
                  kind="primary"
                  onClick={() =>
                    download(
                      outName(cur.name),
                      new Blob([cur.out!.bytes as BlobPart], {
                        type: cur.type,
                      }),
                      cur.type,
                    )
                  }
                >
                  ⬇ Clean file
                </Btn>
              )
            }
          >
            {cur.before.gps && <Note tone="err">📍 This photo reveals where it was taken: {cur.before.gps}. Anyone you send the original to can see it on a map.</Note>}
            {cur.before.camera && <Note tone="warn">📷 Camera identified: {cur.before.camera}. Serial numbers can link photos to one device.</Note>}
            {cur.err && <Note tone="err">{cur.err}</Note>}
            <Row>
              <figure style={{ margin: 0, flex: '1 1 200px' }}>
                <img
                  src={cur.url}
                  alt="original"
                  style={{
                    width: '100%',
                    maxHeight: 220,
                    objectFit: 'contain',
                    borderRadius: 8,
                    background: 'var(--line)',
                  }}
                />
                <figcaption className="muted" style={{ fontSize: 12 }}>
                  Original · {kb(cur.size)}
                </figcaption>
              </figure>
              {cur.out && (
                <figure style={{ margin: 0, flex: '1 1 200px' }}>
                  <img
                    src={cur.out.url}
                    alt="cleaned"
                    style={{
                      width: '100%',
                      maxHeight: 220,
                      objectFit: 'contain',
                      borderRadius: 8,
                      background: 'var(--line)',
                    }}
                  />
                  <figcaption className="muted" style={{ fontSize: 12 }}>
                    Clean · {kb(cur.out.bytes.length)} · {cur.out.method}
                  </figcaption>
                </figure>
              )}
            </Row>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 16,
                marginTop: 12,
              }}
            >
              <MetaList m={cur.before} title="Before" />
              {cur.out && <MetaList m={cur.out.after} title="After" />}
            </div>
          </Panel>
        )}
        <Note>
          Red tags are the ones that identify people, places or devices. Social networks usually strip metadata on upload, but email, chat "send as file", cloud links and
          marketplaces often keep it. Everything here runs locally in your browser.
        </Note>
      </div>
    </Split>
  )
}
