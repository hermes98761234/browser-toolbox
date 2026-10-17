import { useEffect, useRef, useState } from 'react'
import { Bar, Btn, Check, download, FileDrop, Note, Num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { applyPattern, planSize, resampleRGBA, type Fit, type Mode, type SizeOpts } from './lib/batch-image-resizer'
import { fmtBytes, makeZip, uniqueNames } from './lib/image-compressor'

type Fmt = 'same' | 'image/jpeg' | 'image/png' | 'image/webp'
interface State extends SizeOpts {
  format: Fmt
  quality: number
  algo: 'lanczos' | 'browser'
  bg: string
  pattern: string
}
const DEF: State = { mode: 'exact', w: 1080, h: 1080, pct: 50, fit: 'cover', noUpscale: false, format: 'image/jpeg', quality: 0.86, algo: 'lanczos', bg: '#ffffff', pattern: '{name}-{w}x{h}' }

interface Item { id: string; name: string; type: string; size: number; w: number; h: number; bmp: ImageBitmap; thumb: string }
interface Out { blob: Blob; url: string; w: number; h: number; name: string }

const PRESETS: [string, Partial<State>][] = [
  ['Instagram 1080²', { mode: 'exact', w: 1080, h: 1080, fit: 'cover' }],
  ['Story 1080×1920', { mode: 'exact', w: 1080, h: 1920, fit: 'cover' }],
  ['Full HD 1920×1080', { mode: 'exact', w: 1920, h: 1080, fit: 'contain' }],
  ['Open Graph 1200×630', { mode: 'exact', w: 1200, h: 630, fit: 'cover' }],
  ['Web 1600 max', { mode: 'fit', w: 1600, h: 1600, noUpscale: true }],
  ['Email 800 wide', { mode: 'width', w: 800, noUpscale: true }],
  ['Thumbnail 300²', { mode: 'exact', w: 300, h: 300, fit: 'cover' }],
  ['Half size', { mode: 'percent', pct: 50 }],
]
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

async function sample(name: string, w: number, h: number, hue: number, alpha: boolean): Promise<File> {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  if (!alpha) {
    const sky = g.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, `hsl(${hue} 70% 62%)`)
    sky.addColorStop(1, `hsl(${hue + 40} 80% 85%)`)
    g.fillStyle = sky
    g.fillRect(0, 0, w, h)
    g.fillStyle = `hsl(${hue + 180} 60% 30%)`
    g.beginPath()
    g.moveTo(0, h)
    for (let x = 0; x <= w; x += w / 12) g.lineTo(x, h * (0.62 + 0.12 * Math.sin(x / w * 9 + hue)))
    g.lineTo(w, h)
    g.fill()
    g.fillStyle = 'rgb(255 255 255 / .9)'
    g.beginPath()
    g.arc(w * 0.72, h * 0.28, Math.min(w, h) * 0.09, 0, 7)
    g.fill()
  } else {
    g.fillStyle = `hsl(${hue} 80% 55%)`
    g.beginPath()
    g.arc(w / 2, h / 2, w * 0.42, 0, 7)
    g.fill()
  }
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgb(0 0 0 / ${alpha ? 0.5 : 0.18})`
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(w * 0.05 + i * w * 0.0225, h * 0.86)
    g.lineTo(w * 0.05 + i * w * 0.0225, h * 0.94)
    g.stroke()
  }
  g.fillStyle = alpha ? '#fff' : 'rgb(255 255 255 / .95)'
  g.font = `bold ${Math.round(w / 16)}px system-ui, sans-serif`
  g.textAlign = 'center'
  g.fillText(`${w} × ${h}`, w / 2, h * 0.5)
  const type = alpha ? 'image/png' : 'image/jpeg'
  const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), type, 0.92))
  return new File([b], name, { type })
}

async function toItem(f: File): Promise<Item> {
  const bmp = await createImageBitmap(f)
  const k = 72 / Math.max(bmp.width, bmp.height)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * k))
  c.height = Math.max(1, Math.round(bmp.height * k))
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return { id: uid(), name: f.name, type: f.type, size: f.size, w: bmp.width, h: bmp.height, bmp, thumb: c.toDataURL('image/png') }
}

function outType(s: State, it: Item): string {
  if (s.format !== 'same') return s.format
  return it.type in EXT ? it.type : 'image/png'
}

async function render(it: Item, s: State, n: number): Promise<Out> {
  const p = planSize(it.w, it.h, s)
  const type = outType(s, it)
  const c = document.createElement('canvas')
  c.width = p.outW
  c.height = p.outH
  const g = c.getContext('2d')!
  if (type === 'image/jpeg' || (s.mode === 'exact' && s.fit === 'contain')) {
    g.fillStyle = s.bg
    g.fillRect(0, 0, c.width, c.height)
  }
  if (s.algo === 'browser') {
    g.imageSmoothingQuality = 'high'
    g.drawImage(it.bmp, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh)
  } else {
    const src = document.createElement('canvas')
    src.width = p.sw
    src.height = p.sh
    const sg = src.getContext('2d', { willReadFrequently: true })!
    sg.drawImage(it.bmp, -p.sx, -p.sy)
    const px = resampleRGBA(sg.getImageData(0, 0, p.sw, p.sh).data, p.sw, p.sh, p.dw, p.dh)
    const tmp = document.createElement('canvas')
    tmp.width = p.dw
    tmp.height = p.dh
    tmp.getContext('2d')!.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, p.dw, p.dh), 0, 0)
    g.drawImage(tmp, p.dx, p.dy)
  }
  const blob = await new Promise<Blob>((r, rej) => c.toBlob((b) => (b ? r(b) : rej(new Error('encode failed'))), type, s.quality))
  return { blob, url: URL.createObjectURL(blob), w: p.outW, h: p.outH, name: applyPattern(s.pattern, it.name, p.outW, p.outH, n, EXT[blob.type] ?? 'png') }
}

export default function BatchImageResizer() {
  const [s, set, reset] = useToolState('batch-image-resizer', DEF)
  const [items, setItems] = useState<Item[]>([])
  const [outs, setOuts] = useState<Record<string, Out>>({})
  const [progress, setProgress] = useState<[number, number]>([0, 0])
  const [err, setErr] = useState('')
  const gen = useRef(0)

  useEffect(() => {
    let live = true
    void Promise.all([sample('sample-mountains.jpg', 2400, 1600, 205, false), sample('sample-portrait.jpg', 1500, 2250, 20, false), sample('sample-logo.png', 1000, 1000, 265, true)])
      .then((fs) => Promise.all(fs.map(toItem)))
      .then((its) => live && setItems(its))
    return () => {
      live = false
    }
  }, [])

  // Re-render every image (debounced) whenever the inputs or settings change.
  const key = JSON.stringify(s) + items.map((i) => i.id).join()
  useEffect(() => {
    if (!items.length) return
    const my = ++gen.current
    const t = setTimeout(async () => {
      const next: Record<string, Out> = {}
      for (let i = 0; i < items.length; i++) {
        if (gen.current !== my) return
        setProgress([i, items.length])
        await new Promise((r) => setTimeout(r, 0))
        try {
          next[items[i].id] = await render(items[i], s, i + 1)
        } catch (e) {
          setErr(`${items[i].name}: ${(e as Error).message}`)
        }
      }
      if (gen.current !== my) return
      setProgress([items.length, items.length])
      setOuts((old) => {
        Object.values(old).forEach((o) => URL.revokeObjectURL(o.url))
        return next
      })
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const add = async (fs: File[]) => {
    setErr('')
    const ok = fs.filter((f) => f.type.startsWith('image/'))
    if (ok.length < fs.length) setErr(`${fs.length - ok.length} file(s) skipped — not images.`)
    const loaded: Item[] = []
    for (const f of ok) {
      try {
        loaded.push(await toItem(f))
      } catch {
        setErr(`Could not decode ${f.name} (unsupported format in this browser).`)
      }
    }
    setItems((cur) => [...cur.filter((x) => !x.name.startsWith('sample-')), ...loaded])
  }

  const done = items.filter((i) => outs[i.id])
  const inBytes = items.reduce((a, i) => a + i.size, 0)
  const outBytes = done.reduce((a, i) => a + outs[i.id].blob.size, 0)
  const running = progress[0] < progress[1]
  const zip = async () => {
    const names = uniqueNames(done.map((i) => outs[i.id].name))
    const files = await Promise.all(done.map(async (it, i) => ({ name: names[i], data: new Uint8Array(await outs[it.id].blob.arrayBuffer()) })))
    download('resized-images.zip', new Blob([makeZip(files) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
  }
  const needsBox = s.mode === 'exact' || s.mode === 'fit'

  return (
    <Split>
      <div>
        <Panel title="Images">
          <FileDrop accept="image/*" multiple onFiles={(fs) => void add(fs)} label="Drop images here or click to choose (JPEG, PNG, WebP, GIF, AVIF…)" />
          <Row>
            <Btn kind="ghost" disabled={!items.length} onClick={() => setItems([])}>Clear all</Btn>
          </Row>
          {err && <Note tone="warn">{err}</Note>}
        </Panel>
        <Panel title="Size">
          <Seg value={s.mode} onChange={(mode: Mode) => set({ mode })} options={[['exact', 'Exact'], ['fit', 'Fit in box'], ['width', 'Width'], ['height', 'Height'], ['percent', '%']]} />
          <div style={{ height: 10 }} />
          <Row>
            {(needsBox || s.mode === 'width') && <Num label="Width" value={s.w} onChange={(w) => set({ w })} unit="px" min={1} max={20000} />}
            {(needsBox || s.mode === 'height') && <Num label="Height" value={s.h} onChange={(h) => set({ h })} unit="px" min={1} max={20000} />}
            {s.mode === 'percent' && <Num label="Scale" value={s.pct} onChange={(pct) => set({ pct })} unit="%" min={1} max={800} />}
          </Row>
          {s.mode === 'exact' && (
            <>
              <Seg value={s.fit} onChange={(fit: Fit) => set({ fit })} options={[['cover', 'Crop to fill'], ['contain', 'Pad to fit'], ['stretch', 'Stretch']]} />
              <p className="muted" style={{ fontSize: 13 }}>
                {s.fit === 'cover' ? 'Keeps the aspect ratio and trims the edges (centre crop).' : s.fit === 'contain' ? 'Keeps the whole image and fills the empty bars with the background colour.' : 'Forces the exact size; the picture is distorted if the ratio differs.'}
              </p>
            </>
          )}
          {s.mode === 'fit' && <p className="muted" style={{ fontSize: 13 }}>Scales each image so it fits inside the box, keeping its proportions.</p>}
          <Check label="Don’t enlarge smaller images" value={s.noUpscale} onChange={(noUpscale) => set({ noUpscale })} />
          <div className="k-label" style={{ marginTop: 10 }}>Presets</div>
          <Row>
            {PRESETS.map(([n, p]) => (
              <Btn key={n} onClick={() => set(p)}>{n}</Btn>
            ))}
          </Row>
        </Panel>
        <Panel title="Output" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Select label="Format" value={s.format} onChange={(format: Fmt) => set({ format })} options={[['same', 'Keep original'], ['image/jpeg', 'JPEG'], ['image/png', 'PNG'], ['image/webp', 'WebP']]} />
            <Select label="Resampling" value={s.algo} onChange={(algo: State['algo']) => set({ algo })} options={[['lanczos', 'Lanczos-3 (sharp)'], ['browser', 'Browser (fast)']]} />
          </Row>
          {s.format !== 'image/png' && <Slider label="Quality" value={Math.round(s.quality * 100)} onChange={(q) => set({ quality: q / 100 })} min={40} max={100} unit="%" show={String} />}
          <Row>
            <label className="k-field">
              <span className="k-label">Background</span>
              <input type="color" value={s.bg} onChange={(e) => set({ bg: e.target.value })} style={{ width: 64, height: 36 }} />
            </label>
            <Txt label="File names" value={s.pattern} onChange={(pattern) => set({ pattern })} hint="Tokens: {name} {w} {h} {n}" />
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>Background is used for padding and for transparent areas in JPEG output.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Images" value={items.length} sub={running ? `processing ${progress[0] + 1}/${progress[1]}…` : 'ready'} />
          <Stat label="Original size" value={fmtBytes(inBytes)} />
          <Stat label="Resized size" value={fmtBytes(outBytes)} tone="accent" />
          <Stat label="Change" value={inBytes ? `${outBytes <= inBytes ? '−' : '+'}${Math.abs(Math.round((1 - outBytes / inBytes) * 100))}%` : '—'} tone={outBytes <= inBytes ? 'good' : 'bad'} />
        </Stats>
        {running && <Bar value={progress[0]} max={progress[1]} />}
        <Panel
          title="Results"
          actions={<Btn kind="primary" disabled={!done.length || running} onClick={() => void zip()}>⬇ Download ZIP ({done.length})</Btn>}
        >
          {items.length ? (
            <Table
              head={['', 'File', 'Original', 'Resized', 'Size', '']}
              rows={items.map((it) => {
                const o = outs[it.id]
                return [
                  <img key="t" src={o?.url ?? it.thumb} alt="" style={{ width: 64, height: 64, objectFit: 'contain', background: 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 12px 12px', borderRadius: 6 }} />,
                  <div key="n" style={{ maxWidth: 190, wordBreak: 'break-all' }}>{it.name}<div className="muted" style={{ fontSize: 12 }}>→ {o?.name ?? '…'}</div></div>,
                  `${it.w}×${it.h}`,
                  o ? <b key="r">{o.w}×{o.h}</b> : '…',
                  o ? <span key="s">{fmtBytes(it.size)} → <b>{fmtBytes(o.blob.size)}</b></span> : fmtBytes(it.size),
                  <Row key="a" wrap={false}>
                    <Btn kind="ghost" disabled={!o} onClick={() => o && download(o.name, o.blob)} title="Download">⬇</Btn>
                    <Btn kind="ghost" onClick={() => setItems(items.filter((x) => x.id !== it.id))} title="Remove">✕</Btn>
                  </Row>,
                ]
              })}
            />
          ) : (
            <Note>Add some images to resize them all at once.</Note>
          )}
        </Panel>
        {done[0] && (
          <Panel title={`Preview · ${outs[done[0].id].name}`}>
            <div style={{ background: 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 16px 16px', borderRadius: 10, padding: 8, textAlign: 'center' }}>
              <img src={outs[done[0].id].url} alt="Resized preview" style={{ maxWidth: '100%', maxHeight: 360 }} />
            </div>
          </Panel>
        )}
        <Note>
          Lanczos-3 is the windowed-sinc filter used by professional resizers (and by the Pica library): it keeps fine detail sharp when shrinking photos, unlike plain bilinear scaling. Everything runs locally; images never leave your device.
        </Note>
      </div>
    </Split>
  )
}
