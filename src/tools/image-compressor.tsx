import { useEffect, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Num, Panel, pct, Row, Seg, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { fitSize, fmtBytes, makeZip, uniqueNames } from './lib/image-compressor'

type Fmt = 'image/jpeg' | 'image/webp' | 'image/png'

interface Opts {
  format: Fmt
  quality: number
  mode: 'quality' | 'target'
  targetKb: number
  maxW: number
  maxH: number
  resize: boolean
}

interface Out {
  blob: Blob
  url: string
  w: number
  h: number
  q: number
}

interface Item {
  id: string
  name: string
  src: Blob
  url: string
  w: number
  h: number
  out?: Out
  error?: string
}

const DEF: Opts = { format: 'image/webp', quality: 75, mode: 'quality', targetKb: 150, maxW: 1920, maxH: 1920, resize: true }
const EXT: Record<Fmt, string> = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' }

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Encoder unavailable'))), type, q))

async function encode(it: Item, o: Opts): Promise<Out> {
  const bmp = await createImageBitmap(it.src)
  const [w, h] = o.resize ? fitSize(bmp.width, bmp.height, o.maxW, o.maxH) : [bmp.width, bmp.height]
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  if (o.format === 'image/jpeg') {
    g.fillStyle = '#fff' // JPEG has no alpha: flatten transparency on white
    g.fillRect(0, 0, w, h)
  }
  g.imageSmoothingQuality = 'high'
  g.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  let blob: Blob
  let q = o.quality / 100
  if (o.format === 'image/png') {
    blob = await toBlob(c, 'image/png')
    q = 1
  } else if (o.mode === 'target') {
    // Binary search for the highest quality whose output fits the target size.
    const target = o.targetKb * 1024
    let lo = 0.02, hi = 0.98
    blob = await toBlob(c, o.format, lo)
    q = lo
    for (let i = 0; i < 8; i++) {
      const mid = (lo + hi) / 2
      const b = await toBlob(c, o.format, mid)
      if (b.size <= target) {
        blob = b
        q = mid
        lo = mid
      } else hi = mid
    }
  } else blob = await toBlob(c, o.format, q)
  if (blob.type !== o.format) throw new Error(`This browser can't encode ${EXT[o.format].toUpperCase()}`)
  return { blob, url: URL.createObjectURL(blob), w, h, q }
}

async function sampleImage(): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = 2400
  c.height = 1600
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, 1600)
  sky.addColorStop(0, '#1e3a8a')
  sky.addColorStop(0.55, '#f59e0b')
  sky.addColorStop(1, '#7c2d12')
  g.fillStyle = sky
  g.fillRect(0, 0, 2400, 1600)
  g.fillStyle = '#fde68a'
  g.beginPath()
  g.arc(1700, 820, 170, 0, Math.PI * 2)
  g.fill()
  const ridge = (y: number, amp: number, col: string, seed: number) => {
    g.fillStyle = col
    g.beginPath()
    g.moveTo(0, 1600)
    for (let x = 0; x <= 2400; x += 20) g.lineTo(x, y + Math.sin(x / 210 + seed) * amp + Math.sin(x / 63 + seed * 3) * amp * 0.25)
    g.lineTo(2400, 1600)
    g.fill()
  }
  ridge(1000, 90, '#7c3aed', 1)
  ridge(1120, 70, '#4c1d95', 2)
  ridge(1260, 55, '#1e1b4b', 4)
  // Film grain so the encoders have real detail to work on.
  const img = g.getImageData(0, 0, 2400, 1600)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 26
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  g.putImageData(img, 0, 0)
  g.font = 'bold 72px system-ui, sans-serif'
  g.fillStyle = 'rgba(255,255,255,.85)'
  g.fillText("Sample sunset · 2400×1600", 80, 260)
  return toBlob(c, 'image/png')
}

async function loadItem(name: string, src: Blob): Promise<Item> {
  const bmp = await createImageBitmap(src)
  const it: Item = { id: uid(), name, src, url: URL.createObjectURL(src), w: bmp.width, h: bmp.height }
  bmp.close()
  return it
}

export default function ImageCompressor() {
  const [o, set, reset] = useToolState('image-compressor', DEF)
  const [items, setItems] = useState<Item[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [split, setSplit] = useState(50)
  const [zoom, setZoom] = useState('1')
  const [busy, setBusy] = useState(false)
  const [webp] = useState(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    return c.toDataURL('image/webp').startsWith('data:image/webp')
  })
  const job = useRef(0)

  useEffect(() => {
    let live = true
    void sampleImage()
      .then((b) => loadItem('sample-sunset.png', b))
      .then((it) => live && setItems((cur) => (cur.length ? cur : [it])))
    return () => {
      live = false
    }
  }, [])

  // Re-encode everything whenever the settings or the file list change (debounced, latest wins).
  const key = items.map((i) => i.id).join()
  useEffect(() => {
    if (!items.length) return
    const n = ++job.current
    const t = setTimeout(async () => {
      setBusy(true)
      for (const it of items) {
        let patch: Partial<Item>
        try {
          patch = { out: await encode(it, o), error: undefined }
        } catch (e) {
          patch = { out: undefined, error: (e as Error).message }
        }
        if (n !== job.current) return
        setItems((cur) =>
          cur.map((x) => {
            if (x.id !== it.id) return x
            if (x.out) URL.revokeObjectURL(x.out.url)
            return { ...x, ...patch }
          }),
        )
      }
      setBusy(false)
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o, key])

  const add = async (files: File[]) => {
    const loaded: Item[] = []
    for (const f of files.filter((f) => f.type.startsWith('image/'))) {
      try {
        loaded.push(await loadItem(f.name, f))
      } catch {
        /* undecodable image: skip */
      }
    }
    if (!loaded.length) return
    setItems((cur) => [...cur.filter((x) => !x.name.startsWith('sample-')), ...loaded])
    setSel(loaded[0].id)
  }

  const outName = (it: Item) => it.name.replace(/\.[^.]*$/, '') + '.' + EXT[o.format]
  const cur = items.find((i) => i.id === sel) ?? items[0]
  const before = items.reduce((a, i) => a + i.src.size, 0)
  const after = items.reduce((a, i) => a + (i.out?.blob.size ?? i.src.size), 0)
  const saved = before ? 1 - after / before : 0

  const zip = async () => {
    const done = items.filter((i) => i.out)
    const names = uniqueNames(done.map(outName))
    const files = await Promise.all(done.map(async (i, k) => ({ name: names[k], data: new Uint8Array(await i.out!.blob.arrayBuffer()) })))
    download('compressed-images.zip', new Blob([makeZip(files).slice().buffer], { type: 'application/zip' }))
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Images">
          <FileDrop accept="image/*" multiple onFiles={(f) => void add(f)} label="Drop images (JPEG, PNG, WebP, GIF, AVIF…) or click to choose" />
          <p className="muted" style={{ fontSize: 13 }}>Everything runs on your device with the browser's own encoders. Nothing is uploaded.</p>
        </Panel>
        <Panel title="Output format">
          <Seg value={o.format} onChange={(format) => set({ format })} options={[['image/webp', 'WebP'], ['image/jpeg', 'JPEG'], ['image/png', 'PNG']]} />
          {o.format === 'image/webp' && !webp && <Note tone="warn">This browser can't encode WebP; choose JPEG.</Note>}
          {o.format === 'image/png' ? (
            <Note>
              <div style={{ gridColumn: '1 / -1' }}>PNG is lossless — savings come only from resizing. Use it for screenshots and graphics with sharp edges.</div>
            </Note>
          ) : (
            <>
              <div style={{ margin: '10px 0' }}>
                <Seg value={o.mode} onChange={(mode) => set({ mode })} options={[['quality', 'Set quality'], ['target', 'Target file size']]} />
              </div>
              {o.mode === 'quality' ? (
                <Slider label="Quality" value={o.quality} onChange={(quality) => set({ quality })} min={5} max={100} show={(v) => String(v)} />
              ) : (
                <Num label="Max size per image" value={o.targetKb} onChange={(targetKb) => set({ targetKb })} unit="KB" min={5} />
              )}
              <Row>
                {[['Web', 75], ['Email', 60], ['Archive', 90]].map(([l, q]) => (
                  <Btn key={l} kind="ghost" onClick={() => set({ mode: 'quality', quality: q as number })}>{l} {q}</Btn>
                ))}
              </Row>
            </>
          )}
        </Panel>
        <Panel title="Resize">
          <Check label="Limit dimensions (keeps aspect ratio, never enlarges)" value={o.resize} onChange={(resize) => set({ resize })} />
          {o.resize && (
            <Row>
              <Num label="Max width" value={o.maxW} onChange={(maxW) => set({ maxW })} unit="px" min={0} />
              <Num label="Max height" value={o.maxH} onChange={(maxH) => set({ maxH })} unit="px" min={0} />
            </Row>
          )}
          <Btn kind="ghost" onClick={reset}>Reset settings</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Original" value={fmtBytes(before)} sub={`${items.length} image${items.length === 1 ? '' : 's'}`} />
          <Stat label="Compressed" value={fmtBytes(after)} tone="accent" sub={busy ? 'encoding…' : 'ready'} />
          <Stat label="Saved" value={pct(saved, 0)} tone={saved > 0 ? 'good' : 'bad'} sub={fmtBytes(before - after)} />
        </Stats>
        {cur && (
          <Panel title="Before / after" actions={cur.out && <Btn kind="primary" onClick={() => download(outName(cur), cur.out!.blob)}>⬇ {outName(cur)}</Btn>}>
            <div style={{ position: 'relative', width: '100%', aspectRatio: `${cur.w} / ${cur.h}`, maxHeight: 520, overflow: 'hidden', borderRadius: 8, background: 'repeating-conic-gradient(var(--line) 0 25%, transparent 0 50%) 0 0 / 20px 20px', userSelect: 'none' }}>
              <img src={cur.url} alt="original" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${zoom})` }} />
              {cur.out && <img src={cur.out.url} alt="compressed" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${zoom})`, clipPath: `inset(0 0 0 ${(split - 50) / Number(zoom) + 50}%)` }} />}
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${split}%`, width: 2, background: '#fff', boxShadow: '0 0 4px #0008' }} />
              <span style={{ position: 'absolute', left: 8, top: 8, background: '#000a', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 12 }}>Original · {fmtBytes(cur.src.size)}</span>
              {cur.out && <span style={{ position: 'absolute', right: 8, top: 8, background: '#000a', color: '#fff', padding: '2px 8px', borderRadius: 6, fontSize: 12 }}>{EXT[o.format].toUpperCase()} · {fmtBytes(cur.out.blob.size)}</span>}
            </div>
            <input type="range" min={0} max={100} value={split} onChange={(e) => setSplit(Number(e.target.value))} aria-label="Comparison split" style={{ width: '100%' }} />
            <Row>
              <span className="muted" style={{ fontSize: 13 }}>Zoom into the centre to judge artefacts:</span>
              <Seg value={zoom} onChange={setZoom} options={[['1', '1×'], ['2', '2×'], ['4', '4×']]} label="Zoom" />
            </Row>
            {cur.error && <Note tone="err">{cur.error}</Note>}
            {cur.out && (
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                {cur.w}×{cur.h} → {cur.out.w}×{cur.out.h} px{o.format !== 'image/png' && ` · quality ${Math.round(cur.out.q * 100)}`} · {cur.out.blob.size > cur.src.size ? 'larger than the original — try a lower quality or another format' : `${pct(1 - cur.out.blob.size / cur.src.size, 0)} smaller`}
              </p>
            )}
          </Panel>
        )}
        <Panel
          title="Batch"
          actions={
            <>
              <Btn onClick={() => void zip()} disabled={!items.some((i) => i.out)}>⬇ All as ZIP</Btn>
              <Btn kind="ghost" onClick={() => setItems([])} disabled={!items.length}>Clear</Btn>
            </>
          }
        >
          <Table
            head={['', 'File', 'Original', 'Compressed', 'Saved', '']}
            rows={items.map((i) => {
              const s = i.out ? 1 - i.out.blob.size / i.src.size : NaN
              return [
                <img key="t" src={i.out?.url ?? i.url} alt="" onClick={() => setSel(i.id)} style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', outline: i.id === cur?.id ? '2px solid var(--accent)' : undefined }} />,
                <button key="n" type="button" className="k-btn ghost" onClick={() => setSel(i.id)} style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.name}</button>,
                `${fmtBytes(i.src.size)} · ${i.w}×${i.h}`,
                i.error ? <span key="e" style={{ color: 'var(--err)' }}>{i.error}</span> : i.out ? `${fmtBytes(i.out.blob.size)} · ${i.out.w}×${i.out.h}` : '…',
                <b key="s" style={{ color: s >= 0 ? 'var(--ok)' : 'var(--err)' }}>{pct(s, 0)}</b>,
                <Btn key="d" kind="ghost" disabled={!i.out} onClick={() => download(outName(i), i.out!.blob)} title="Download">⬇</Btn>,
              ]
            })}
          />
        </Panel>
      </div>
    </Split>
  )
}
