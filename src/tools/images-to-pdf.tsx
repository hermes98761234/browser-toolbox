import { useEffect, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, num, Panel, Row, Select, Seg, Slider, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { fmtBytes } from './lib/image-compressor'
import { effectiveDpi, MM, move, PAGES, pageSize, place, type Fit, type Orient, type PageKey } from './lib/images-to-pdf'

interface Img { id: string; name: string; url: string; type: string; w: number; h: number; size: number; rot: number; blob: Blob; sample?: boolean }

const DEF = { page: 'a4' as PageKey, orient: 'auto' as Orient, fit: 'contain' as Fit, margin: 10, bg: '#ffffff', reencode: false, quality: 0.85, title: 'Photos', fileName: 'photos.pdf' }

let seq = 0
const nid = () => `i${++seq}`

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => rej(new Error('Cannot decode image'))
    im.src = url
  })
}

async function fromBlob(blob: Blob, name: string): Promise<Img> {
  const url = URL.createObjectURL(blob)
  const im = await loadImg(url)
  return { id: nid(), name, url, type: blob.type, w: im.naturalWidth, h: im.naturalHeight, size: blob.size, rot: 0, blob }
}

/** Synthetic sample photos so the first screen shows a real document. */
async function samples(): Promise<Img[]> {
  const specs: [string, number, number, string, string][] = [
    ['sunset.jpg', 1600, 1067, '#f97316', '#7c3aed'],
    ['forest.jpg', 1000, 1400, '#065f46', '#a3e635'],
    ['ocean.png', 1400, 900, '#0ea5e9', '#1e3a8a'],
  ]
  const out: Img[] = []
  for (const [name, w, h, a, b] of specs) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d')!
    const g = x.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, a)
    g.addColorStop(1, b)
    x.fillStyle = g
    x.fillRect(0, 0, w, h)
    x.fillStyle = 'rgba(255,255,255,0.18)'
    for (let i = 0; i < 14; i++) {
      x.beginPath()
      x.arc(((i * 397) % w), ((i * 211) % h), 40 + ((i * 53) % 160), 0, Math.PI * 2)
      x.fill()
    }
    x.fillStyle = '#fff'
    x.font = `bold ${Math.round(w / 12)}px system-ui, sans-serif`
    x.textAlign = 'center'
    x.fillText(name.split('.')[0].toUpperCase(), w / 2, h / 2)
    x.font = `${Math.round(w / 36)}px system-ui, sans-serif`
    x.fillText(`${w} × ${h} px sample`, w / 2, h / 2 + w / 18)
    const type = name.endsWith('.png') ? 'image/png' : 'image/jpeg'
    const blob = await new Promise<Blob>((r) => c.toBlob((bl) => r(bl!), type, 0.88))
    out.push({ ...(await fromBlob(blob, name)), sample: true })
  }
  return out
}

/** Re-renders an image to JPEG/PNG bytes (rotation, unsupported formats, re-compression). */
async function rasterize(img: Img, asJpeg: boolean, quality: number, bg: string): Promise<{ bytes: Uint8Array; jpeg: boolean; w: number; h: number }> {
  const im = await loadImg(img.url)
  const swap = img.rot % 180 !== 0
  const c = document.createElement('canvas')
  c.width = swap ? img.h : img.w
  c.height = swap ? img.w : img.h
  const x = c.getContext('2d')!
  if (asJpeg) {
    x.fillStyle = bg
    x.fillRect(0, 0, c.width, c.height)
  }
  x.translate(c.width / 2, c.height / 2)
  x.rotate((img.rot * Math.PI) / 180)
  x.drawImage(im, -img.w / 2, -img.h / 2)
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), asJpeg ? 'image/jpeg' : 'image/png', quality))
  return { bytes: new Uint8Array(await blob.arrayBuffer()), jpeg: asJpeg, w: c.width, h: c.height }
}

export default function ImagesToPdf() {
  const [s, set, reset] = useToolState('images-to-pdf', DEF)
  const [imgs, setImgs] = useState<Img[]>([])
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [out, setOut] = useState<{ size: number; pages: number } | null>(null)
  const dragFrom = useRef<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const margin = s.margin * MM

  useEffect(() => {
    let live = true
    void samples().then((x) => live && setImgs((cur) => (cur.length ? cur : x)))
    return () => {
      live = false
    }
  }, [])

  const add = async (files: File[]) => {
    setErr('')
    const ok: Img[] = []
    for (const f of files) {
      try {
        ok.push(await fromBlob(f, f.name))
      } catch {
        setErr(`Skipped ${f.name}: not a decodable image.`)
      }
    }
    setImgs((cur) => [...cur.filter((i) => !i.sample), ...ok])
    setOut(null)
  }

  const dims = (i: Img): [number, number] => (i.rot % 180 ? [i.h, i.w] : [i.w, i.h])

  const build = async () => {
    if (!imgs.length) return
    setErr('')
    try {
      const { PDFDocument, rgb } = await import('pdf-lib')
      const doc = await PDFDocument.create()
      doc.setTitle(s.title || 'Images')
      doc.setCreator('Browser Toolbox · Images To PDF')
      const bg = parseInt(s.bg.slice(1), 16)
      for (const [k, img] of imgs.entries()) {
        setBusy(`Adding image ${k + 1} of ${imgs.length}…`)
        const native = (img.type === 'image/jpeg' || img.type === 'image/png') && img.rot === 0 && !s.reencode
        const r = native
          ? { bytes: new Uint8Array(await img.blob.arrayBuffer()), jpeg: img.type === 'image/jpeg', w: img.w, h: img.h }
          : await rasterize(img, s.reencode || img.type !== 'image/png', s.quality, s.bg)
        const emb = r.jpeg ? await doc.embedJpg(r.bytes) : await doc.embedPng(r.bytes)
        const [pw, ph] = pageSize(s.page, s.orient, r.w, r.h, margin)
        const page = doc.addPage([pw, ph])
        if (s.bg.toLowerCase() !== '#ffffff') page.drawRectangle({ x: 0, y: 0, width: pw, height: ph, color: rgb(((bg >> 16) & 255) / 255, ((bg >> 8) & 255) / 255, (bg & 255) / 255) })
        const p = place(r.w, r.h, pw, ph, margin, s.fit)
        if (p.clip) {
          // clip "cover" images to the margin box
          const { pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = await import('pdf-lib')
          page.pushOperators(pushGraphicsState(), rectangle(margin, margin, pw - 2 * margin, ph - 2 * margin), clip(), endPath())
          page.drawImage(emb, p)
          page.pushOperators(popGraphicsState())
        } else page.drawImage(emb, p)
      }
      const bytes = await doc.save()
      download(s.fileName.endsWith('.pdf') ? s.fileName : `${s.fileName}.pdf`, new Blob([bytes as BlobPart], { type: 'application/pdf' }), 'application/pdf')
      setOut({ size: bytes.length, pages: imgs.length })
    } catch (e) {
      setErr(`Could not build the PDF: ${(e as Error).message}`)
    }
    setBusy('')
  }

  const total = imgs.reduce((a, i) => a + i.size, 0)
  const minDpi = imgs.reduce((m, i) => {
    const [w, h] = dims(i)
    const [pw, ph] = pageSize(s.page, s.orient, w, h, margin)
    return Math.min(m, effectiveDpi(w, place(w, h, pw, ph, margin, s.fit).w))
  }, Infinity)

  return (
    <Split wide="right">
      <div>
        <Panel title="Add images">
          <FileDrop accept="image/*" multiple onFiles={(f) => void add(f)} label="Drop JPG, PNG, WebP or GIF images (or click)" />
          {err && <Note tone="err">{err}</Note>}
          <Note>Images never leave your browser. JPEG and PNG are embedded byte-for-byte (no quality loss); other formats are converted.</Note>
        </Panel>
        <Panel title="Page setup" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Select label="Page size" value={s.page} onChange={(page) => set({ page })} options={Object.entries(PAGES).map(([k, v]) => [k as PageKey, v.label] as const)} />
          {s.page !== 'fit' && <Seg value={s.orient} onChange={(orient) => set({ orient })} options={[['auto', 'Auto'], ['portrait', 'Portrait'], ['landscape', 'Landscape']]} />}
          <div style={{ height: 8 }} />
          <Seg value={s.fit} onChange={(fit) => set({ fit })} options={[['contain', 'Fit'], ['cover', 'Fill'], ['stretch', 'Stretch'], ['actual', '96 dpi']]} />
          <Slider label="Margin" value={s.margin} onChange={(margin) => set({ margin })} min={0} max={40} unit=" mm" />
          <Row>
            <label className="k-field">
              <span className="k-label">Background</span>
              <input type="color" value={s.bg} onChange={(e) => set({ bg: e.target.value })} style={{ height: 36, width: 64 }} />
            </label>
            <Txt label="File name" value={s.fileName} onChange={(fileName) => set({ fileName })} />
          </Row>
          <Txt label="Document title" value={s.title} onChange={(title) => set({ title })} />
          <Check label="Re-compress everything as JPEG (smaller file)" value={s.reencode} onChange={(reencode) => set({ reencode })} />
          {s.reencode && <Slider label="JPEG quality" value={s.quality} onChange={(quality) => set({ quality })} min={0.4} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} />}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Pages" value={imgs.length} />
          <Stat label="Images" value={fmtBytes(total)} sub="input size" />
          <Stat label="Lowest print res." value={Number.isFinite(minDpi) ? `${Math.round(minDpi)} dpi` : '—'} tone={minDpi < 150 ? 'bad' : 'good'} sub={minDpi < 150 ? 'may look soft in print' : 'print-ready'} />
          <Stat label="Output" value={out ? fmtBytes(out.size) : '—'} tone="accent" sub={out ? `${out.pages} pages saved` : 'not built yet'} />
        </Stats>
        <Panel
          title="Pages (drag to reorder)"
          actions={
            <>
              <Btn onClick={() => setImgs((c) => [...c].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })))}>A→Z</Btn>
              <Btn kind="ghost" onClick={() => setImgs([])} disabled={!imgs.length}>Clear</Btn>
              <Btn kind="primary" onClick={() => void build()} disabled={!imgs.length || !!busy}>{busy || '⬇ Create PDF'}</Btn>
            </>
          }
        >
          {!imgs.length && <Note>Add some images to start. Each image becomes one page.</Note>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
            {imgs.map((img, k) => {
              const [w, h] = dims(img)
              const [pw, ph] = pageSize(s.page, s.orient, w, h, margin)
              const p = place(w, h, pw, ph, margin, s.fit)
              const sc = 140 / Math.max(pw, ph)
              const dpi = effectiveDpi(w, p.w)
              return (
                <div
                  key={img.id}
                  draggable
                  onDragStart={() => (dragFrom.current = k)}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setOver(k)
                  }}
                  onDragLeave={() => setOver(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragFrom.current !== null) setImgs((c) => move(c, dragFrom.current!, k))
                    dragFrom.current = null
                    setOver(null)
                  }}
                  style={{ border: `2px ${over === k ? 'dashed var(--accent)' : 'solid var(--line)'}`, borderRadius: 10, padding: 8, background: 'var(--panel2)', cursor: 'grab', textAlign: 'center' }}
                >
                  <div style={{ height: 146, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'relative', width: pw * sc, height: ph * sc, background: s.bg, boxShadow: '0 1px 4px rgb(0 0 0 / 0.3)', overflow: 'hidden' }}>
                      <img
                        src={img.url}
                        alt={img.name}
                        style={{
                          position: 'absolute',
                          left: p.x * sc + (p.w * sc) / 2,
                          top: (ph - p.y - p.h) * sc + (p.h * sc) / 2,
                          width: (img.rot % 180 ? p.h : p.w) * sc,
                          height: (img.rot % 180 ? p.w : p.h) * sc,
                          transform: `translate(-50%, -50%) rotate(${img.rot}deg)`,
                        }}
                      />
                      {s.fit === 'cover' && margin > 0 && <div style={{ position: 'absolute', inset: 0, border: `${margin * sc}px solid ${s.bg}` }} />}
                    </div>
                  </div>
                  <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={img.name}>
                    <b>{k + 1}.</b> {img.name}
                  </div>
                  <div className="muted" style={{ fontSize: 11, color: dpi < 150 ? 'var(--warn)' : undefined }}>
                    {w}×{h} · {fmtBytes(img.size)} · {num(dpi, 0)} dpi
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 6 }}>
                    {([
                      ['◀', 'Move left', k === 0, () => setImgs((c) => move(c, k, k - 1))],
                      ['↻', 'Rotate 90°', false, () => setImgs((c) => c.map((x) => (x.id === img.id ? { ...x, rot: (x.rot + 90) % 360 } : x)))],
                      ['▶', 'Move right', k === imgs.length - 1, () => setImgs((c) => move(c, k, k + 1))],
                      ['✕', 'Remove', false, () => setImgs((c) => c.filter((x) => x.id !== img.id))],
                    ] as const).map(([t, title, dis, fn]) => (
                      <button key={title} type="button" className="k-btn ghost" title={title} aria-label={title} disabled={dis} onClick={fn} style={{ padding: '2px 8px', minWidth: 0 }}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
        <Note>Tip: "Fit" keeps the whole photo, "Fill" crops to cover the page, "96 dpi" places images at screen size (never upscaled). Aim for 150–300 dpi for printing.</Note>
      </div>
    </Split>
  )
}
