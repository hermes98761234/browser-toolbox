import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Btn, download, FileDrop, Note, num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { applyRegion, normRect, scanMetadata, type MetaReport, type Mode, type Region } from './lib/image-redaction-tool'

interface Src { name: string; canvas: HTMLCanvasElement; meta: MetaReport | null; bytes: number }
type Fmt = 'image/png' | 'image/jpeg' | 'image/webp'

const DEF = { mode: 'solid' as Mode, color: '#000000', block: 14, pad: 4, fmt: 'image/png' as Fmt, quality: 0.9 }

const MODES: [Mode, string][] = [['solid', '■ Solid box'], ['pixelate', '▦ Pixelate'], ['blur', '◌ Heavy blur']]

/** Synthetic demo card with obviously fake personal data. */
function demoCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 960
  c.height = 600
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, 0, 960, 600)
  grad.addColorStop(0, '#e0f2fe')
  grad.addColorStop(1, '#ede9fe')
  g.fillStyle = grad
  g.fillRect(0, 0, 960, 600)
  g.fillStyle = '#4f46e5'
  g.fillRect(0, 0, 960, 90)
  g.fillStyle = '#fff'
  g.font = 'bold 34px system-ui, sans-serif'
  g.fillText('SAMPLE MEMBER CARD', 40, 58)
  g.font = '18px system-ui, sans-serif'
  g.fillText('demo only · not a real document', 600, 56)
  // cartoon portrait
  g.fillStyle = '#cbd5e1'
  g.fillRect(40, 130, 240, 300)
  g.fillStyle = '#fcd9b6'
  g.beginPath()
  g.ellipse(160, 255, 72, 90, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#7c4a1e'
  g.beginPath()
  g.ellipse(160, 190, 80, 42, 0, Math.PI, Math.PI * 2)
  g.fill()
  g.fillStyle = '#1e293b'
  for (const x of [130, 190]) {
    g.beginPath()
    g.arc(x, 250, 8, 0, Math.PI * 2)
    g.fill()
  }
  g.strokeStyle = '#9f1239'
  g.lineWidth = 4
  g.beginPath()
  g.arc(160, 285, 26, 0.2, Math.PI - 0.2)
  g.stroke()
  g.fillStyle = '#334155'
  g.fillRect(40, 380, 240, 50)
  const rows: [string, string][] = [['Name', 'Jane Q. Example'], ['Member no.', '4821 7730 1956 0042'], ['Date of birth', '1990-04-17'], ['Email', 'jane.example@mail.test'], ['Phone', '+1 555 0100 1234'], ['Address', '12 Demo Street, Sampletown']]
  rows.forEach(([k, v], i) => {
    g.fillStyle = '#64748b'
    g.font = '18px system-ui, sans-serif'
    g.fillText(k, 320, 150 + i * 62)
    g.fillStyle = '#0f172a'
    g.font = 'bold 26px system-ui, sans-serif'
    g.fillText(v, 320, 178 + i * 62)
  })
  // barcode-like strip
  for (let x = 40; x < 920; x += 6) {
    g.fillStyle = (x * 7) % 13 > 5 ? '#0f172a' : '#e2e8f0'
    g.fillRect(x, 520, (x * 3) % 5 === 0 ? 4 : 2, 50)
  }
  return c
}

const DEMO_REGIONS: Omit<Region, 'id'>[] = [
  { x: 316, y: 214, w: 300, h: 36, mode: 'solid', color: '#000000', block: 14, source: 'manual' },
  { x: 316, y: 400, w: 330, h: 36, mode: 'pixelate', color: '#000000', block: 14, source: 'manual' },
  { x: 76, y: 150, w: 168, h: 210, mode: 'blur', color: '#000000', block: 18, source: 'manual' },
]

export default function ImageRedactionTool() {
  const [s, set, reset] = useToolState('image-redaction-tool', DEF)
  const [src, setSrc] = useState<Src | null>(() => (typeof document === 'undefined' ? null : { name: 'demo-card.png', canvas: demoCanvas(), meta: null, bytes: 0 }))
  const [regions, setRegions] = useState<Region[]>(() => DEMO_REGIONS.map((r) => ({ ...r, id: uid() })))
  const [sel, setSel] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string } | null>(null)
  const [report, setReport] = useState<{ size: number; meta: MetaReport; verified: boolean } | null>(null)
  const view = useRef<HTMLCanvasElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const hasFD = typeof window !== 'undefined' && 'FaceDetector' in window

  useEffect(() => {
    const out = view.current
    if (!out || !src) return
    out.width = src.canvas.width
    out.height = src.canvas.height
    const g = out.getContext('2d', { willReadFrequently: true })!
    g.drawImage(src.canvas, 0, 0)
    if (!regions.length) return
    const id = g.getImageData(0, 0, out.width, out.height)
    for (const r of regions) applyRegion(id, r)
    g.putImageData(id, 0, 0)
  }, [src, regions])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !(e.target instanceof HTMLInputElement)) {
        setRegions((rs) => rs.filter((r) => r.id !== sel))
        setSel(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel])

  const load = async (f: File) => {
    setMsg(null)
    setReport(null)
    try {
      const bytes = new Uint8Array(await f.arrayBuffer())
      const bmp = await createImageBitmap(new Blob([bytes], { type: f.type || 'image/*' }))
      const c = document.createElement('canvas')
      c.width = bmp.width
      c.height = bmp.height
      c.getContext('2d')!.drawImage(bmp, 0, 0)
      bmp.close()
      setSrc({ name: f.name, canvas: c, meta: scanMetadata(bytes), bytes: f.size })
      setRegions([])
      setSel(null)
    } catch {
      setMsg({ tone: 'err', text: 'Could not decode this file as an image.' })
    }
  }

  const toImg = (e: RPointerEvent) => {
    const el = svg.current!
    const r = el.getBoundingClientRect()
    return [((e.clientX - r.left) / r.width) * (src?.canvas.width ?? 1), ((e.clientY - r.top) / r.height) * (src?.canvas.height ?? 1)] as const
  }
  const onDown = (e: RPointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).getAttribute('data-id')) return
    const [x, y] = toImg(e)
    e.currentTarget.setPointerCapture(e.pointerId)
    setDraft({ x0: x, y0: y, x1: x, y1: y })
    setSel(null)
  }
  const onMove = (e: RPointerEvent) => {
    if (!draft) return
    const [x, y] = toImg(e)
    setDraft({ ...draft, x1: x, y1: y })
  }
  const onUp = () => {
    if (!draft || !src) return
    const r = normRect(draft.x0, draft.y0, draft.x1, draft.y1, src.canvas.width, src.canvas.height, s.pad)
    setDraft(null)
    if (r.w < 4 || r.h < 4) return
    const reg: Region = { ...r, id: uid(), mode: s.mode, color: s.color, block: s.block, source: 'manual' }
    setRegions((rs) => [...rs, reg])
    setSel(reg.id)
    setReport(null)
  }

  const detectFaces = async () => {
    if (!src) return
    try {
      const FD = (window as unknown as { FaceDetector: new (o: object) => { detect: (i: CanvasImageSource) => Promise<{ boundingBox: DOMRectReadOnly }[]> } }).FaceDetector
      const faces = await new FD({ fastMode: false, maxDetectedFaces: 30 }).detect(src.canvas)
      if (!faces.length) {
        setMsg({ tone: 'warn', text: 'No faces detected. Draw boxes by hand for anything the detector missed.' })
        return
      }
      const W = src.canvas.width, H = src.canvas.height
      setRegions((rs) => [...rs, ...faces.map(({ boundingBox: b }) => ({ ...normRect(b.x, b.y, b.x + b.width, b.y + b.height, W, H, Math.max(b.width, b.height) * 0.18), id: uid(), mode: 'pixelate' as Mode, color: s.color, block: Math.max(12, Math.round(b.width / 8)), source: 'face' as const }))])
      setMsg({ tone: 'ok', text: `${faces.length} face${faces.length > 1 ? 's' : ''} suggested. Review each box: detection can miss profiles, small or partly covered faces.` })
    } catch (e) {
      setMsg({ tone: 'err', text: `Face detection failed: ${(e as Error).message}` })
    }
  }

  const exportImage = async () => {
    if (!src) return
    const c = document.createElement('canvas')
    c.width = src.canvas.width
    c.height = src.canvas.height
    const g = c.getContext('2d')!
    if (s.fmt === 'image/jpeg') {
      g.fillStyle = '#fff'
      g.fillRect(0, 0, c.width, c.height)
    }
    g.drawImage(src.canvas, 0, 0)
    const id = g.getImageData(0, 0, c.width, c.height)
    for (const r of regions) applyRegion(id, r)
    g.putImageData(id, 0, 0)
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, s.fmt, s.quality))
    if (!blob) return setMsg({ tone: 'err', text: 'This browser cannot encode that format.' })
    // verify: decode what we are about to save and check solid boxes are flat; scan its metadata
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const bmp = await createImageBitmap(blob)
    const v = document.createElement('canvas')
    v.width = bmp.width
    v.height = bmp.height
    const vg = v.getContext('2d', { willReadFrequently: true })!
    vg.drawImage(bmp, 0, 0)
    bmp.close()
    let verified = true
    for (const r of regions.filter((x) => x.mode === 'solid')) {
      const inner = normRect(r.x + 2, r.y + 2, r.x + r.w - 2, r.y + r.h - 2, v.width, v.height)
      if (!inner.w || !inner.h) continue
      const d = vg.getImageData(inner.x, inner.y, inner.w, inner.h).data
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 24) verified = false
    }
    setReport({ size: blob.size, meta: scanMetadata(bytes), verified })
    const ext = s.fmt === 'image/png' ? 'png' : s.fmt === 'image/jpeg' ? 'jpg' : 'webp'
    download(`${src.name.replace(/\.\w+$/, '')}-redacted.${ext}`, blob, s.fmt)
  }

  const edit = (id: string, p: Partial<Region>) => setRegions((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const selR = regions.find((r) => r.id === sel)
  const W = src?.canvas.width ?? 1, H = src?.canvas.height ?? 1
  const area = regions.reduce((t, r) => t + r.w * r.h, 0)
  const meta = src?.meta
  const metaList = meta ? (['exif', 'gps', 'xmp', 'iptc', 'icc', 'text'] as const).filter((k) => meta[k]) : []

  return (
    <Split wide="right">
      <div>
        <Panel title="Image" actions={<Btn kind="ghost" onClick={() => { reset(); setSrc({ name: 'demo-card.png', canvas: demoCanvas(), meta: null, bytes: 0 }); setRegions(DEMO_REGIONS.map((r) => ({ ...r, id: uid() }))); setSel(null); setReport(null); setMsg(null) }}>Demo / reset</Btn>}>
          <FileDrop accept="image/*" label="Drop a photo or screenshot" onFiles={([f]) => void load(f)} />
          {src && <p className="muted" style={{ fontSize: 13 }}>{src.name} · {W}×{H}px{src.bytes ? ` · ${num(src.bytes / 1024, 0)} KB` : ' · generated demo'}</p>}
          {meta && (metaList.length ? <Note tone="warn">Source contains metadata: {metaList.map((k) => k.toUpperCase()).join(', ')}{meta.gps ? ' (including GPS location!)' : ''}. It will not be copied to the export.</Note> : <Note tone="ok">No EXIF/XMP/IPTC metadata found in the source {meta.format}.</Note>)}
          <p className="muted" style={{ fontSize: 12 }}>Everything happens locally; the image is never uploaded.</p>
        </Panel>
        <Panel title="New boxes">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={MODES} />
          <Row>
            {s.mode === 'solid' ? <label className="k-field"><span className="k-label">Fill colour</span><input type="color" value={s.color} onChange={(e) => set({ color: e.target.value })} /></label> : <Slider label={s.mode === 'pixelate' ? 'Block size' : 'Blur radius'} value={s.block} onChange={(block) => set({ block })} min={6} max={60} unit=" px" show={(v) => v.toFixed(0)} />}
            <Slider label="Padding around box" value={s.pad} onChange={(pad) => set({ pad })} min={0} max={30} unit=" px" show={(v) => v.toFixed(0)} />
          </Row>
          <Row>
            <Btn disabled={!hasFD || !src} onClick={() => void detectFaces()} title={hasFD ? 'Uses the browser’s built-in FaceDetector' : 'FaceDetector API not available in this browser'}>🙂 Suggest faces</Btn>
            <Btn disabled={!regions.length} onClick={() => { setRegions(regions.slice(0, -1)); setReport(null) }}>Undo</Btn>
            <Btn kind="danger" disabled={!regions.length} onClick={() => { setRegions([]); setSel(null); setReport(null) }}>Clear all</Btn>
          </Row>
          {!hasFD && <p className="muted" style={{ fontSize: 12 }}>Face suggestions need the browser's built-in Shape Detection API (FaceDetector), which this browser does not expose. No models are downloaded; draw boxes by hand instead.</p>}
          {msg && <Note tone={msg.tone}>{msg.text}</Note>}
          <Note tone="info">Use a <b>solid box</b> for text such as names, numbers and addresses. Pixelation and blur can sometimes be partially reversed for short, known-format text; they suit faces and backgrounds.</Note>
        </Panel>
        <Panel title="Export">
          <Seg value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP']]} />
          {s.fmt !== 'image/png' && <Slider label="Quality" value={s.quality} onChange={(quality) => set({ quality })} min={0.5} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />}
          <Btn kind="primary" disabled={!src} onClick={() => void exportImage()}>⬇ Save redacted image</Btn>
          {report && (
            <Note tone={report.verified && !report.meta.exif && !report.meta.gps ? 'ok' : 'warn'}>
              Saved {num(report.size / 1024, 0)} KB. Pixels rebuilt from scratch: {report.verified ? 'solid boxes verified flat after decoding' : 'some solid boxes are not flat'}. Metadata in output: {report.meta.exif || report.meta.xmp || report.meta.iptc || report.meta.text ? 'present' : 'none (EXIF, GPS, XMP, IPTC stripped)'}.
            </Note>
          )}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Redaction boxes" value={regions.length} sub={`${regions.filter((r) => r.source === 'face').length} from face detection`} tone="accent" />
          <Stat label="Area covered" value={`${num((area / (W * H)) * 100, 1)} %`} sub={`${num(area, 0)} px`} />
          <Stat label="Output" value={s.fmt.split('/')[1].toUpperCase()} sub="re-encoded, metadata-free" tone="good" />
        </Stats>
        <Panel title="Draw boxes over anything sensitive">
          <div style={{ position: 'relative', lineHeight: 0, borderRadius: 10, overflow: 'hidden', background: 'repeating-conic-gradient(#e2e8f0 0% 25%, #fff 0% 50%) 50% / 20px 20px' }}>
            <canvas ref={view} style={{ width: '100%', height: 'auto', display: 'block' }} />
            <svg ref={svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}>
              {regions.map((r, i) => (
                <g key={r.id}>
                  <rect data-id={r.id} x={r.x} y={r.y} width={r.w} height={r.h} fill="transparent" stroke={r.id === sel ? '#f59e0b' : r.source === 'face' ? '#22c55e' : '#6366f1'} strokeWidth={Math.max(2, W / 400)} strokeDasharray={r.id === sel ? undefined : `${W / 120} ${W / 200}`} style={{ cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); setSel(r.id) }} />
                  <text x={r.x + 4} y={r.y - 6} fontSize={Math.max(12, W / 60)} fill={r.id === sel ? '#f59e0b' : '#6366f1'} fontWeight={700} style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>{i + 1}</text>
                </g>
              ))}
              {draft && (() => { const r = normRect(draft.x0, draft.y0, draft.x1, draft.y1, W, H); return <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(99,102,241,0.18)" stroke="#6366f1" strokeWidth={Math.max(2, W / 400)} /> })()}
            </svg>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Drag on the image to add a box (works with touch). Click a box to select it; Delete removes it. Boxes are applied to the real pixels, so the saved file contains no hidden original data.</p>
        </Panel>
        <Panel title="Boxes">
          {regions.length ? (
            <Table head={['#', 'Effect', 'Strength / colour', 'Position', 'Size', '']} rows={regions.map((r, i) => [
              <b key="i" style={{ color: r.id === sel ? '#f59e0b' : undefined, cursor: 'pointer' }} onClick={() => setSel(r.id)}>{i + 1}{r.source === 'face' ? ' 🙂' : ''}</b>,
              <select key="m" value={r.mode} onChange={(e) => edit(r.id, { mode: e.target.value as Mode })} aria-label="Effect">{MODES.map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select>,
              r.mode === 'solid' ? <input key="c" type="color" value={r.color} onChange={(e) => edit(r.id, { color: e.target.value })} aria-label="Colour" style={{ minWidth: 40, width: 48 }} /> : <input key="b" type="number" min={4} max={120} value={r.block} onChange={(e) => edit(r.id, { block: Math.max(4, Number(e.target.value) || 4) })} aria-label="Strength" style={{ width: 64 }} />,
              `${r.x}, ${r.y}`, `${r.w}×${r.h}`,
              <Btn key="x" kind="ghost" onClick={() => setRegions(regions.filter((x) => x.id !== r.id))}>✕</Btn>,
            ])} />
          ) : <Note>No boxes yet: drag over the image to cover names, numbers, faces or plates.</Note>}
          {selR && <p className="muted" style={{ fontSize: 12 }}>Selected box {regions.indexOf(selR) + 1}: {selR.mode}.</p>}
        </Panel>
      </div>
    </Split>
  )
}
