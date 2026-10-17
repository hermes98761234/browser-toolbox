import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Num, Panel, Row, Select, Seg, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { exifDate, fitRect, grid, PAGES, pagesNeeded, type Cell } from './lib/contact-sheet-maker'

interface Photo {
  id: string
  name: string
  date: string | null
  w: number
  h: number
  bytes: number
  img: CanvasImageSource
}

const DEF = {
  title: 'Summer trip — roll 1',
  page: 'A4',
  landscape: false,
  cols: 4,
  rows: 5,
  margin: 10,
  gap: 4,
  fill: 'fit' as 'fit' | 'fill',
  style: 'paper' as 'paper' | 'film',
  showName: true,
  showDate: true,
  showSize: false,
  showIndex: true,
  sort: 'name' as 'name' | 'date' | 'added',
  dpi: 200,
}
type S = typeof DEF

const MAX_THUMB = 900

function demoPhotos(): Photo[] {
  const scenes = ['#f97316', '#0ea5e9', '#a855f7', '#10b981', '#ef4444', '#eab308', '#14b8a6', '#6366f1', '#ec4899', '#84cc16', '#f59e0b', '#64748b', '#0284c7', '#dc2626']
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  return scenes.map((c, i) => {
    const portrait = i % 5 === 3
    const W = portrait ? 400 : 600, H = portrait ? 600 : 400
    const cv = document.createElement('canvas')
    cv.width = W
    cv.height = H
    const g = cv.getContext('2d')!
    const sky = g.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#1e3a8a')
    sky.addColorStop(0.6, c)
    sky.addColorStop(1, '#fde68a')
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)
    g.fillStyle = 'rgba(255,250,220,.9)'
    g.beginPath()
    g.arc(W * (0.2 + rnd() * 0.6), H * (0.2 + rnd() * 0.3), 20 + rnd() * 30, 0, 7)
    g.fill()
    for (let layer = 0; layer < 3; layer++) {
      g.fillStyle = `rgba(${20 + layer * 15},${30 + layer * 20},${40 + layer * 10},${0.55 + layer * 0.2})`
      g.beginPath()
      g.moveTo(0, H)
      let y = H * (0.55 + layer * 0.12)
      for (let x = 0; x <= W; x += W / 12) {
        y += (rnd() - 0.5) * H * 0.12
        g.lineTo(x, y)
      }
      g.lineTo(W, H)
      g.fill()
    }
    const d = new Date(Date.UTC(2025, 6, 3 + Math.floor(i / 3), 7 + ((i * 5) % 12), (i * 17) % 60))
    return { id: uid(), name: `IMG_${2041 + i}.JPG`, date: d.toISOString().slice(0, 16).replace('T', ' '), w: W * 8, h: H * 8, bytes: 2_400_000 + Math.round(rnd() * 3e6), img: cv }
  })
}

async function loadPhoto(f: File): Promise<Photo | null> {
  try {
    const bmp = await createImageBitmap(f)
    const k = Math.min(1, MAX_THUMB / Math.max(bmp.width, bmp.height))
    const cv = document.createElement('canvas')
    cv.width = Math.round(bmp.width * k)
    cv.height = Math.round(bmp.height * k)
    cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height)
    const date = /jpe?g$/i.test(f.type) || /\.jpe?g$/i.test(f.name) ? exifDate(await f.slice(0, 256 * 1024).arrayBuffer()) : null
    const out = { id: uid(), name: f.name, date: date ?? new Date(f.lastModified).toISOString().slice(0, 16).replace('T', ' ') + ' (file)', w: bmp.width, h: bmp.height, bytes: f.size, img: cv }
    bmp.close()
    return out
  } catch {
    return null
  }
}

const mb = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`)

function ellipsize(ctx: CanvasRenderingContext2D, s: string, max: number) {
  if (ctx.measureText(s).width <= max) return s
  while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1)
  return s + '…'
}

function drawPage(ctx: CanvasRenderingContext2D, s: S, photos: Photo[], page: number, k: number) {
  const [pw, ph] = pageSize(s)
  const film = s.style === 'film'
  const { caption, header } = reserve(s)
  const cells = grid({ pageW: pw, pageH: ph, margin: s.margin, gap: s.gap, cols: s.cols, rows: s.rows, header, caption })
  const per = cells.length
  const total = pagesNeeded(photos.length, s.cols, s.rows)
  ctx.fillStyle = film ? '#111' : '#fff'
  ctx.fillRect(0, 0, pw * k, ph * k)
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = film ? '#f5f5f5' : '#111'
  ctx.font = `600 ${4.2 * k}px system-ui, sans-serif`
  if (s.title) ctx.fillText(ellipsize(ctx, s.title, (pw - 2 * s.margin - 30) * k), s.margin * k, (s.margin + 5) * k)
  ctx.font = `${2.6 * k}px system-ui, sans-serif`
  ctx.textAlign = 'right'
  ctx.fillStyle = film ? '#f59e0b' : '#666'
  ctx.fillText(`Sheet ${page + 1} / ${total} · ${photos.length} frames`, (pw - s.margin) * k, (s.margin + 5) * k)
  ctx.textAlign = 'left'
  photos.slice(page * per, page * per + per).forEach((p, i) => {
    const c: Cell = cells[i]
    const box = { x: c.x * k, y: c.y * k, w: c.w * k, h: c.h * k }
    ctx.fillStyle = film ? '#000' : '#f1f1f1'
    ctx.fillRect(box.x, box.y, box.w, box.h)
    const r = fitRect(p.w / p.h, box, s.fill)
    ctx.save()
    ctx.beginPath()
    ctx.rect(box.x, box.y, box.w, box.h)
    ctx.clip()
    ctx.drawImage(p.img, r.dx, r.dy, r.dw, r.dh)
    ctx.restore()
    let y = box.y + box.h + 3.6 * k
    const n = page * per + i + 1
    ctx.font = `${2.4 * k}px system-ui, sans-serif`
    if (s.showName || s.showSize || s.showIndex) {
      let x = box.x
      if (s.showIndex) {
        ctx.fillStyle = film ? '#f59e0b' : '#2563eb'
        ctx.font = `700 ${2.4 * k}px ui-monospace, monospace`
        const t = film ? `▸${n}A ` : `${n}. `
        ctx.fillText(t, x, y)
        x += ctx.measureText(t).width
        ctx.font = `${2.4 * k}px system-ui, sans-serif`
      }
      ctx.fillStyle = film ? '#e5e5e5' : '#222'
      const txt = [s.showName ? p.name : '', s.showSize ? `${p.w}×${p.h} · ${mb(p.bytes)}` : ''].filter(Boolean).join(' · ')
      ctx.fillText(ellipsize(ctx, txt, box.x + box.w - x), x, y)
      y += 3.2 * k
    }
    if (s.showDate && p.date) {
      ctx.fillStyle = film ? '#a3a3a3' : '#666'
      ctx.fillText(ellipsize(ctx, p.date, box.w), box.x, y)
    }
  })
}

function reserve(s: S) {
  const lines = (s.showName || s.showSize || s.showIndex ? 1 : 0) + (s.showDate ? 1 : 0)
  return { caption: lines ? 1.5 + lines * 3.2 : 0, header: s.title ? 10 : 4 }
}

function pageSize(s: S): [number, number] {
  const [w, h] = PAGES[s.page] ?? PAGES.A4
  return s.landscape ? [h, w] : [w, h]
}

export default function ContactSheetMaker() {
  const [s, set, reset] = useToolState('contact-sheet-maker', DEF)
  const [photos, setPhotos] = useState<Photo[]>(() => demoPhotos())
  const [demo, setDemo] = useState(true)
  const [busy, setBusy] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const sorted = useMemo(() => {
    const a = [...photos]
    if (s.sort === 'name') a.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }))
    if (s.sort === 'date') a.sort((x, y) => (x.date ?? '').localeCompare(y.date ?? ''))
    return a
  }, [photos, s.sort])
  const [pw, ph] = pageSize(s)
  const pages = pagesNeeded(sorted.length, s.cols, s.rows)
  const cell = grid({ pageW: pw, pageH: ph, margin: s.margin, gap: s.gap, cols: s.cols, rows: s.rows, ...reserve(s) })[0]
  const tooSmall = cell.w < 12 || cell.h < 10

  useEffect(() => {
    const host = box.current
    if (!host) return
    const k = 2.6
    host.querySelectorAll('canvas').forEach((cv, i) => {
      cv.width = Math.round(pw * k)
      cv.height = Math.round(ph * k)
      drawPage(cv.getContext('2d')!, s, sorted, i, k)
    })
  }, [s, sorted, pw, ph, pages])

  const add = async (fs: File[]) => {
    setBusy(`Reading ${fs.length} image(s)…`)
    const loaded = (await Promise.all(fs.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif)$/i.test(f.name)).map(loadPhoto))).filter((p): p is Photo => !!p)
    setPhotos((ps) => [...(demo ? [] : ps), ...loaded])
    setDemo(false)
    setBusy(loaded.length ? '' : 'None of those files could be decoded as images.')
  }

  const render = (i: number) => {
    const k = s.dpi / 25.4
    const cv = document.createElement('canvas')
    cv.width = Math.round(pw * k)
    cv.height = Math.round(ph * k)
    drawPage(cv.getContext('2d')!, s, sorted, i, k)
    return cv
  }
  const blob = (cv: HTMLCanvasElement, type: string) => new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), type, 0.92))

  const exportPdf = async () => {
    setBusy('Building PDF…')
    try {
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.create()
      doc.setTitle(s.title || 'Contact sheet')
      for (let i = 0; i < pages; i++) {
        const jpg = await doc.embedJpg(await (await blob(render(i), 'image/jpeg')).arrayBuffer())
        const pg = doc.addPage([(pw * 72) / 25.4, (ph * 72) / 25.4])
        pg.drawImage(jpg, { x: 0, y: 0, width: pg.getWidth(), height: pg.getHeight() })
      }
      download('contact-sheet.pdf', new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' }))
      setBusy('')
    } catch (e) {
      setBusy(`PDF failed: ${(e as Error).message}`)
    }
  }
  const exportPng = async () => {
    for (let i = 0; i < pages; i++) download(`contact-sheet-${i + 1}.png`, await blob(render(i), 'image/png'))
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Photos" actions={<Btn kind="ghost" onClick={() => { setPhotos(demoPhotos()); setDemo(true) }}>Demo roll</Btn>}>
          <FileDrop accept="image/*" multiple onFiles={(f) => void add(f)} label="Drop photos (JPEG dates are read from EXIF)" />
          {demo && <Note>Showing 14 generated demo frames. Add your own photos to replace them; nothing is uploaded.</Note>}
          {busy && <Note tone={busy.includes('fail') || busy.includes('None') ? 'err' : 'info'}>{busy}</Note>}
          <Row>
            <Select label="Order" value={s.sort} onChange={(sort) => set({ sort })} options={[['name', 'File name'], ['date', 'Capture date'], ['added', 'As added']]} />
            {!demo && <Btn kind="danger" onClick={() => { setPhotos([]); setDemo(false) }}>Clear all</Btn>}
          </Row>
          <Table
            max={8}
            head={['', 'File', 'Taken', '']}
            rows={sorted.map((p, i) => [
              i + 1,
              <span key="n" style={{ wordBreak: 'break-all' }}>{p.name}</span>,
              <span key="d" className="muted" style={{ fontSize: 12 }}>{p.date ?? '—'}</span>,
              <Btn key="x" kind="ghost" title="Remove" onClick={() => setPhotos((ps) => ps.filter((q) => q.id !== p.id))}>✕</Btn>,
            ])}
          />
        </Panel>
        <Panel title="Layout">
          <Row>
            <Select label="Paper" value={s.page} onChange={(page) => set({ page })} options={Object.keys(PAGES)} />
            <Check label="Landscape" value={s.landscape} onChange={(landscape) => set({ landscape })} />
          </Row>
          <Row>
            <Num label="Columns" value={s.cols} min={1} max={12} step={1} onChange={(cols) => set({ cols: Math.round(Math.min(12, Math.max(1, cols))) })} />
            <Num label="Rows" value={s.rows} min={1} max={15} step={1} onChange={(rows) => set({ rows: Math.round(Math.min(15, Math.max(1, rows))) })} />
          </Row>
          <Row>
            <Num label="Margin" unit="mm" value={s.margin} min={0} max={40} onChange={(margin) => set({ margin: Math.max(0, margin) })} />
            <Num label="Gap" unit="mm" value={s.gap} min={0} max={20} onChange={(gap) => set({ gap: Math.max(0, gap) })} />
          </Row>
          <Row>
            {([[3, 4], [4, 5], [5, 7], [6, 6]] as const).map(([c, r]) => (
              <Btn key={c + 'x' + r} onClick={() => set({ cols: c, rows: r })}>{c}×{r}</Btn>
            ))}
          </Row>
          {tooSmall && <Note tone="warn">Cells are tiny ({cell.w.toFixed(0)}×{cell.h.toFixed(0)} mm). Use fewer columns/rows or a bigger sheet.</Note>}
          <Seg value={s.fill} onChange={(fill) => set({ fill })} options={[['fit', 'Fit whole photo'], ['fill', 'Fill cell (crop)']]} />
          <div style={{ height: 8 }} />
          <Seg value={s.style} onChange={(style) => set({ style })} options={[['paper', 'Paper'], ['film', 'Film (dark)']]} />
        </Panel>
        <Panel title="Captions">
          <Txt label="Sheet title" value={s.title} onChange={(title) => set({ title })} />
          <Row>
            <Check label="Frame #" value={s.showIndex} onChange={(showIndex) => set({ showIndex })} />
            <Check label="File name" value={s.showName} onChange={(showName) => set({ showName })} />
            <Check label="Capture date" value={s.showDate} onChange={(showDate) => set({ showDate })} />
            <Check label="Pixels & size" value={s.showSize} onChange={(showSize) => set({ showSize })} />
          </Row>
          <Btn kind="ghost" onClick={reset}>Reset settings</Btn>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Frames" value={sorted.length} />
          <Stat label="Sheets" value={pages} sub={`${s.cols * s.rows} per sheet`} />
          <Stat label="Thumbnail" value={`${cell.w.toFixed(0)}×${cell.h.toFixed(0)} mm`} sub={`${Math.round((cell.w / 25.4) * s.dpi)} px wide at ${s.dpi} dpi`} />
          <Stat label="Paper" value={`${s.page}`} sub={`${pw.toFixed(0)}×${ph.toFixed(0)} mm`} />
        </Stats>
        <Panel
          title="Preview"
          actions={
            <>
              <Select label="" value={s.dpi} onChange={(dpi) => set({ dpi })} options={[[150, '150 dpi'], [200, '200 dpi'], [300, '300 dpi']]} />
              <Btn kind="primary" onClick={() => void exportPdf()} disabled={!sorted.length}>⬇ PDF</Btn>
              <Btn onClick={() => void exportPng()} disabled={!sorted.length}>⬇ PNG</Btn>
            </>
          }
        >
          <div ref={box} style={{ display: 'grid', gap: 16, justifyItems: 'center' }}>
            {Array.from({ length: pages }, (_, i) => (
              <canvas key={i} style={{ width: '100%', maxWidth: s.landscape ? 760 : 560, boxShadow: '0 2px 12px rgba(0,0,0,.25)', borderRadius: 2 }} />
            ))}
          </div>
        </Panel>
      </div>
    </Split>
  )
}
