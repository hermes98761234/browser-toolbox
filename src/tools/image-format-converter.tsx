import { useEffect, useState, type ReactNode } from 'react'
import { Btn, download, FileDrop, Note, Num, Panel, pct, Row, Seg, Slider, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { EXT, fmtBytes, MIME, outName, sizeChange, sniff, targetSize, type Fmt, type Resize } from './lib/image-format-converter'
import { zipStore } from './lib/pdf-splitter'

interface State {
  fmt: Fmt
  quality: number
  resize: Resize
  pct: number
  maxW: number
  boxW: number
  boxH: number
  bg: string
  flatten: boolean
  suffix: string
}

const DEF: State = { fmt: 'webp', quality: 82, resize: 'orig', pct: 50, maxW: 1920, boxW: 1024, boxH: 1024, bg: '#ffffff', flatten: false, suffix: '' }

interface Item {
  id: string
  name: string
  blob: Blob
  url: string
  kind: string
  w: number
  h: number
}

interface Result {
  blob: Blob
  url: string
  w: number
  h: number
  ok: boolean
  ms: number
}

const Tip = ({ children }: { children: ReactNode }) => (
  <div className="k-note" style={{ background: 'color-mix(in srgb, var(--accent2) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent2) 35%, transparent)' }}>{children}</div>
)
const CHECKER = 'repeating-conic-gradient(#d4d4d8 0 25%, #fafafa 0 50%) 0 0 / 16px 16px'
const LABEL: Record<Fmt, string> = { png: 'PNG', jpeg: 'JPG', webp: 'WebP', avif: 'AVIF' }
const toBlob = (c: HTMLCanvasElement, type: string, q?: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, q))

async function sampleImages(): Promise<File[]> {
  const photo = document.createElement('canvas')
  photo.width = 1600
  photo.height = 1000
  const g = photo.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, 1000)
  sky.addColorStop(0, '#1e3a8a')
  sky.addColorStop(0.55, '#f97316')
  sky.addColorStop(1, '#fde68a')
  g.fillStyle = sky
  g.fillRect(0, 0, 1600, 1000)
  g.fillStyle = '#fef3c7'
  g.beginPath()
  g.arc(1100, 560, 110, 0, Math.PI * 2)
  g.fill()
  const hills = ['#7c2d12', '#431407', '#1c0a04']
  hills.forEach((c, k) => {
    g.fillStyle = c
    g.beginPath()
    g.moveTo(0, 1000)
    for (let x = 0; x <= 1600; x += 20) g.lineTo(x, 640 + k * 110 + Math.sin(x / (170 - k * 30) + k) * (60 - k * 10) + Math.sin(x / 47) * 12)
    g.lineTo(1600, 1000)
    g.fill()
  })
  const img = g.getImageData(0, 0, 1600, 1000)
  let seed = 7
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const n = ((seed >> 16) % 17) - 8
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  g.putImageData(img, 0, 0)

  const logo = document.createElement('canvas')
  logo.width = logo.height = 512
  const l = logo.getContext('2d')!
  const grad = l.createLinearGradient(0, 0, 512, 512)
  grad.addColorStop(0, '#6366f1')
  grad.addColorStop(1, '#ec4899')
  l.fillStyle = grad
  l.beginPath()
  l.roundRect(56, 56, 400, 400, 96)
  l.fill()
  l.fillStyle = '#fff'
  l.font = 'bold 220px system-ui, sans-serif'
  l.textAlign = 'center'
  l.textBaseline = 'middle'
  l.fillText('Tb', 256, 270)

  const a = await toBlob(photo, 'image/png')
  const b = await toBlob(logo, 'image/png')
  return [new File([a!], 'sunset-photo.png', { type: 'image/png' }), new File([b!], 'logo-transparent.png', { type: 'image/png' })]
}

async function toItem(f: File): Promise<Item | null> {
  try {
    const bmp = await createImageBitmap(f)
    const kind = sniff(new Uint8Array(await f.slice(0, 64).arrayBuffer()))
    const it = { id: uid(), name: f.name, blob: f, url: URL.createObjectURL(f), kind, w: bmp.width, h: bmp.height }
    bmp.close()
    return it
  } catch {
    return null
  }
}

export default function ImageFormatConverter() {
  const [s, set, reset] = useToolState('image-format-converter', DEF)
  const [items, setItems] = useState<Item[]>([])
  const [results, setResults] = useState<Record<string, Result>>({})
  const [support, setSupport] = useState<Record<Fmt, boolean>>({ png: true, jpeg: true, webp: true, avif: true })
  const [sel, setSel] = useState('')
  const [bad, setBad] = useState<string[]>([])

  const add = async (files: File[]) => {
    const got = await Promise.all(files.map(toItem))
    setBad(files.filter((_, i) => !got[i]).map((f) => f.name))
    const ok = got.filter((x): x is Item => !!x)
    setItems((xs) => [...xs, ...ok])
    if (ok[0]) setSel(ok[0].id)
  }

  useEffect(() => {
    let live = true
    const c = document.createElement('canvas')
    c.width = c.height = 2
    void Promise.all((['webp', 'avif'] as Fmt[]).map(async (f) => [f, (await toBlob(c, MIME[f]))?.type === MIME[f]] as const)).then((r) => {
      if (live) setSupport((x) => ({ ...x, ...Object.fromEntries(r) }))
    })
    void sampleImages()
      .then((fs) => Promise.all(fs.map(toItem)))
      .then((got) => {
        if (!live) return
        const ok = got.filter((x): x is Item => !!x)
        setItems(ok)
        setSel(ok[0]?.id ?? '')
      })
    return () => {
      live = false
    }
  }, [])

  const lossy = s.fmt !== 'png'
  const key = `${s.fmt}|${s.quality}|${s.resize}|${s.pct}|${s.maxW}|${s.boxW}|${s.boxH}|${s.bg}|${s.flatten}`

  useEffect(() => {
    let live = true
    const timer = setTimeout(async () => {
      for (const it of items) {
        const k = `${it.id}|${key}`
        if (!live) return
        const t0 = performance.now()
        const bmp = await createImageBitmap(it.blob)
        const [w, h] = targetSize(bmp.width, bmp.height, s.resize, s.pct, s.maxW, s.boxW, s.boxH)
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const g = c.getContext('2d')!
        if (s.fmt === 'jpeg' || s.flatten) {
          g.fillStyle = s.bg
          g.fillRect(0, 0, w, h)
        }
        g.imageSmoothingQuality = 'high'
        g.drawImage(bmp, 0, 0, w, h)
        bmp.close()
        const blob = await toBlob(c, MIME[s.fmt], lossy ? s.quality / 100 : undefined)
        if (!blob || !live) continue
        const r: Result = { blob, url: URL.createObjectURL(blob), w, h, ok: blob.type === MIME[s.fmt], ms: performance.now() - t0 }
        setResults((x) => ({ ...x, [k]: r }))
      }
    }, 250)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [items, key, s.resize, s.pct, s.maxW, s.boxW, s.boxH, s.bg, s.flatten, s.fmt, s.quality, lossy])

  const rows = items.map((it) => ({ it, r: results[`${it.id}|${key}`] }))
  const before = rows.reduce((a, x) => a + x.it.blob.size, 0)
  const done = rows.filter((x) => x.r)
  const after = done.reduce((a, x) => a + x.r!.blob.size, 0)
  const beforeDone = done.reduce((a, x) => a + x.it.blob.size, 0)
  const cur = rows.find((x) => x.it.id === sel) ?? rows[0]
  const fallback = done.some((x) => !x.r!.ok)
  const name = (it: Item) => outName(it.name, s.fmt, s.suffix)

  const zip = async () => {
    const files = await Promise.all(done.map(async (x) => ({ name: name(x.it), data: new Uint8Array(await x.r!.blob.arrayBuffer()) })))
    download(`converted-${EXT[s.fmt]}.zip`, new Blob([zipStore(files) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
  }

  return (
    <Split>
      <div>
        <Panel title="Images" actions={<>{items.length > 0 && <Btn kind="ghost" onClick={() => setItems([])}>Clear</Btn>}<Btn kind="ghost" onClick={() => void sampleImages().then(add)}>Samples</Btn></>}>
          <FileDrop accept="image/*" multiple onFiles={(f) => void add(f)} label="Drop images (PNG, JPG, WebP, AVIF, GIF, BMP, SVG…)" />
          {bad.length > 0 && <Note tone="err">Your browser could not decode: {bad.join(', ')}</Note>}
          <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>{items.length} image{items.length === 1 ? '' : 's'} · {fmtBytes(before)}</p>
        </Panel>
        <Panel title="Output" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Seg value={s.fmt} onChange={(fmt) => set({ fmt })} options={(Object.keys(LABEL) as Fmt[]).map((f) => [f, LABEL[f] + (support[f] ? '' : ' ✕')] as const)} label="Format" />
          {!support[s.fmt] && <Note tone="warn">This browser cannot encode {LABEL[s.fmt]}; it would fall back to PNG. AVIF encoding works in recent Chrome/Edge; try WebP elsewhere.</Note>}
          {lossy ? (
            <Slider label="Quality" value={s.quality} onChange={(quality) => set({ quality })} min={10} max={100} step={1} show={(v) => String(v)} />
          ) : (
            <Tip>PNG is lossless: quality does not apply. Resize to make files smaller.</Tip>
          )}
          <div className="k-label" style={{ margin: '10px 0 6px', fontWeight: 650, fontSize: 13 }}>Resize</div>
          <Seg value={s.resize} onChange={(resize) => set({ resize })} options={[['orig', 'Original'], ['pct', 'Percent'], ['maxw', 'Max width'], ['box', 'Fit box']]} label="Resize" />
          <Row>
            {s.resize === 'pct' && <Num label="Scale" value={s.pct} onChange={(v) => set({ pct: v })} unit="%" min={1} max={400} />}
            {s.resize === 'maxw' && <Num label="Max width" value={s.maxW} onChange={(maxW) => set({ maxW })} unit="px" min={1} />}
            {s.resize === 'box' && (
              <>
                <Num label="Max width" value={s.boxW} onChange={(boxW) => set({ boxW })} unit="px" min={1} />
                <Num label="Max height" value={s.boxH} onChange={(boxH) => set({ boxH })} unit="px" min={1} />
              </>
            )}
          </Row>
          <Row>
            <label className="k-field" style={{ flex: '0 0 auto' }}>
              <span className="k-label">Background</span>
              <input type="color" value={s.bg} onChange={(e) => set({ bg: e.target.value })} style={{ width: 56, height: 36 }} />
            </label>
            <label className="k-check" style={{ paddingBottom: 8 }}>
              <input type="checkbox" checked={s.flatten || s.fmt === 'jpeg'} disabled={s.fmt === 'jpeg'} onChange={(e) => set({ flatten: e.target.checked })} /> Flatten transparency
            </label>
          </Row>
          <Txt label="File name suffix" value={s.suffix} onChange={(suffix) => set({ suffix })} placeholder="e.g. -web" />
          <Tip>
            <b>Which format?</b> WebP ≈ 25–35% smaller than JPG at similar quality and keeps transparency. AVIF is smaller still but slower to encode. PNG for screenshots, logos and pixel art. JPG has no transparency.
          </Tip>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Images" value={`${done.length}/${items.length}`} sub="converted" />
          <Stat label="Before" value={fmtBytes(beforeDone)} />
          <Stat label="After" value={fmtBytes(after)} tone="accent" />
          <Stat label="Change" value={pct(sizeChange(beforeDone, after), 0)} tone={after <= beforeDone ? 'good' : 'bad'} sub={after <= beforeDone ? 'smaller' : 'larger'} />
        </Stats>
        {fallback && <Note tone="warn">Some outputs came back as PNG because the browser does not support encoding {LABEL[s.fmt]}.</Note>}
        {cur && (
          <Panel title={`Compare · ${cur.it.name}`}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                ['Original', cur.it.url, `${cur.it.kind} · ${cur.it.w}×${cur.it.h} · ${fmtBytes(cur.it.blob.size)}`],
                [LABEL[s.fmt], cur.r?.url, cur.r ? `${cur.r.w}×${cur.r.h} · ${fmtBytes(cur.r.blob.size)} · ${Math.round(cur.r.ms)} ms` : 'converting…'],
              ].map(([t, url, sub]) => (
                <figure key={t} style={{ margin: 0 }}>
                  <div style={{ background: CHECKER, borderRadius: 8, aspectRatio: '4 / 3', display: 'grid', placeItems: 'center', overflow: 'hidden', border: '1px solid var(--line)' }}>
                    {url && <img src={url} alt={t} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
                  </div>
                  <figcaption style={{ fontSize: 13, marginTop: 4 }}>
                    <b>{t}</b> <span className="muted">{sub}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Panel>
        )}
        <Panel title="Results" actions={done.length > 1 ? <Btn kind="primary" onClick={() => void zip()}>⬇ All as ZIP</Btn> : undefined}>
          <Table
            head={['File', 'From', 'Size', 'Before', 'After', 'Change', '']}
            rows={rows.map(({ it, r }) => {
              const ch = r ? sizeChange(it.blob.size, r.blob.size) : 0
              return [
                <button key="n" type="button" onClick={() => setSel(it.id)} style={{ all: 'unset', cursor: 'pointer', fontWeight: it.id === cur?.it.id ? 700 : 400, color: it.id === cur?.it.id ? 'var(--accent)' : undefined }}>{name(it)}</button>,
                it.kind,
                r ? `${r.w}×${r.h}` : `${it.w}×${it.h}`,
                fmtBytes(it.blob.size),
                r ? fmtBytes(r.blob.size) : '…',
                r ? <b key="c" style={{ color: ch <= 0 ? 'var(--ok)' : 'var(--err)' }}>{ch > 0 ? '+' : ''}{pct(ch, 0)}</b> : '',
                r ? <Btn key="d" kind="ghost" onClick={() => download(name(it), r.blob)}>⬇</Btn> : '',
              ]
            })}
          />
          {!items.length && <Tip>Add some images to convert. Everything runs locally; nothing is uploaded.</Tip>}
        </Panel>
      </div>
    </Split>
  )
}
