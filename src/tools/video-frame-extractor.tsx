import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, CsvButton, download, FileDrop, LineChart, Note, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { clock } from './lib/frame-grabber'
import { fmtBytes, makeZip } from './lib/image-compressor'
import { detectCuts, difference, duplicates, sampleStep, scenes, signature, suggestThreshold, type Metric, type Sig } from './lib/video-frame-extractor'

interface State { metric: Metric; threshold: number; minGap: number; rate: number; pick: 'first' | 'middle'; dedupe: boolean; dupDiff: number; cols: number; fmt: 'png' | 'jpeg'; maxW: number }
const DEF: State = { metric: 'both', threshold: 0.3, minGap: 0.5, rate: 10, pick: 'middle', dedupe: true, dupDiff: 0.08, cols: 4, fmt: 'png', maxW: 0 }
interface Analysis { times: number[]; sigs: Sig[]; thumbs: string[]; w: number; h: number; dur: number }

const SCENES = ['Intro', 'Ocean', 'City', 'Intro', 'Forest', 'The End']
/** Records a ~7 s synthetic clip with six hard-cut scenes (one repeated) to demonstrate detection. */
async function makeDemo(): Promise<Blob | null> {
  if (typeof MediaRecorder === 'undefined') return null
  const W = 640, H = 360, per = 1.2
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const stream = c.captureStream(30)
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t))
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 3_000_000 })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<void>((r) => (rec.onstop = () => r()))
  const t0 = performance.now()
  let raf = 0
  const text = (s: string, y: number, size: number, col: string) => {
    g.fillStyle = col
    g.font = `bold ${size}px system-ui, sans-serif`
    g.textAlign = 'center'
    g.fillText(s, W / 2, y)
  }
  const draw = () => {
    const t = (performance.now() - t0) / 1000
    const k = Math.min(SCENES.length - 1, Math.floor(t / per)), u = t - k * per
    const name = SCENES[k]
    if (name === 'Intro') {
      g.fillStyle = '#111a3a'
      g.fillRect(0, 0, W, H)
      g.fillStyle = '#6366f1'
      g.beginPath()
      g.arc(W / 2, H / 2 - 40, 46 + u * 6, 0, 7)
      g.fill()
      text('NORTHWIND TRAVEL', H / 2 + 60, 36, '#fff')
      text('a demo clip', H / 2 + 92, 18, '#a5b4fc')
    } else if (name === 'Ocean') {
      const gr = g.createLinearGradient(0, 0, 0, H)
      gr.addColorStop(0, '#7dd3fc')
      gr.addColorStop(1, '#0369a1')
      g.fillStyle = gr
      g.fillRect(0, 0, W, H)
      for (let i = 0; i < 4; i++) {
        g.fillStyle = `rgba(255,255,255,${0.15 + i * 0.08})`
        g.beginPath()
        g.moveTo(0, H)
        for (let x = 0; x <= W; x += 16) g.lineTo(x, H * (0.55 + i * 0.1) + 10 * Math.sin(x / 40 + u * 4 + i))
        g.lineTo(W, H)
        g.fill()
      }
    } else if (name === 'City') {
      const gr = g.createLinearGradient(0, 0, 0, H)
      gr.addColorStop(0, '#f97316')
      gr.addColorStop(1, '#7c2d12')
      g.fillStyle = gr
      g.fillRect(0, 0, W, H)
      for (let i = 0; i < 14; i++) {
        const bh = 90 + ((i * 53) % 170)
        g.fillStyle = '#1c1917'
        g.fillRect(i * 50 - u * 20, H - bh, 42, bh)
        g.fillStyle = '#fde68a'
        for (let w = 0; w < bh / 24 - 1; w++) if ((i + w) % 3) g.fillRect(i * 50 - u * 20 + 8, H - bh + 10 + w * 24, 8, 10)
      }
    } else if (name === 'Forest') {
      g.fillStyle = '#d9f99d'
      g.fillRect(0, 0, W, H)
      for (let i = 0; i < 16; i++) {
        const x = (i * 47 + u * 15) % (W + 60) - 30, th = 120 + ((i * 37) % 120)
        g.fillStyle = i % 2 ? '#166534' : '#15803d'
        g.beginPath()
        g.moveTo(x, H - th - 20)
        g.lineTo(x - 34, H - 20)
        g.lineTo(x + 34, H - 20)
        g.fill()
      }
      g.fillStyle = '#3f6212'
      g.fillRect(0, H - 22, W, 22)
    } else {
      g.fillStyle = '#f8fafc'
      g.fillRect(0, 0, W, H)
      text('The End', H / 2, 56, '#0f172a')
      text('thanks for watching', H / 2 + 40, 20, '#64748b')
    }
    raf = requestAnimationFrame(draw)
  }
  draw()
  rec.start(250)
  await new Promise((r) => setTimeout(r, per * SCENES.length * 1000))
  rec.stop()
  cancelAnimationFrame(raf)
  await done
  stream.getTracks().forEach((tr) => tr.stop())
  return new Blob(chunks, { type: 'video/webm' })
}

const seeked = (v: HTMLVideoElement, t: number) =>
  new Promise<void>((res) => {
    const on = () => {
      v.removeEventListener('seeked', on)
      clearTimeout(tm)
      res()
    }
    const tm = setTimeout(on, 4000)
    v.addEventListener('seeked', on)
    v.currentTime = t
  })
const toBlob = (c: HTMLCanvasElement, type: string, q = 0.92) => new Promise<Blob>((r, rej) => c.toBlob((b) => (b ? r(b) : rej(new Error('Encoding failed'))), type, q))

export default function VideoFrameExtractor() {
  const [s, set, reset] = useToolState('video-frame-extractor', DEF)
  const vRef = useRef<HTMLVideoElement>(null)
  const [src, setSrc] = useState<{ url: string; name: string; size: number } | null>(null)
  const [status, setStatus] = useState('Recording a 7-second demo clip with six scenes…')
  const [an, setAn] = useState<Analysis | null>(null)
  const [busy, setBusy] = useState('')
  const [skip, setSkip] = useState<Set<number>>(new Set())
  const cancel = useRef(false)

  const load = (b: Blob, name: string) => {
    setSrc((old) => {
      if (old) URL.revokeObjectURL(old.url)
      return { url: URL.createObjectURL(b), name, size: b.size }
    })
    setAn(null)
    setSkip(new Set())
    setStatus('Loading…')
  }
  useEffect(() => {
    let live = true
    void makeDemo().then((b) => {
      if (!live) return
      if (b) load(b, 'demo-scenes.webm')
      else setStatus('This browser cannot record a demo clip. Open a video file to start.')
    })
    return () => { live = false }
  }, [])

  const analyze = async () => {
    const v = vRef.current
    if (!v || !Number.isFinite(v.duration) || !v.videoWidth) return
    cancel.current = false
    const dur = v.duration
    const w = 64, h = Math.max(8, Math.round((64 * v.videoHeight) / v.videoWidth / 8) * 8)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d', { willReadFrequently: true })!
    const tc = document.createElement('canvas')
    tc.width = 192
    tc.height = Math.round((192 * v.videoHeight) / v.videoWidth)
    const tg = tc.getContext('2d')!
    const step = sampleStep(dur, s.rate)
    const times: number[] = [], sigs: Sig[] = [], thumbs: string[] = []
    for (let t = 0; t < dur - 1e-3 && !cancel.current; t += step) {
      await seeked(v, t)
      g.drawImage(v, 0, 0, w, h)
      const sig = signature(g.getImageData(0, 0, w, h).data, w, h)
      tg.drawImage(v, 0, 0, tc.width, tc.height)
      times.push(t)
      sigs.push(sig)
      thumbs.push(tc.toDataURL('image/jpeg', 0.72))
      if (times.length % 5 === 0) setBusy(`Analyzing ${clock(t)} / ${clock(dur)}`)
    }
    setAn({ times, sigs, thumbs, w: v.videoWidth, h: v.videoHeight, dur })
    setSkip(new Set())
    setBusy('')
    setStatus('')
  }

  const onMeta = () => {
    const v = vRef.current!
    // MediaRecorder WebM has no duration until we seek past the end
    if (!Number.isFinite(v.duration)) {
      const fix = () => {
        if (!Number.isFinite(v.duration)) return
        v.removeEventListener('durationchange', fix)
        void seeked(v, 0).then(analyze)
      }
      v.addEventListener('durationchange', fix)
      v.currentTime = 1e101
      return
    }
    void analyze()
  }

  // Scores depend on the metric; recompute from stored signatures instead of re-seeking.
  const scores = useMemo(() => (an ? an.sigs.map((sg, i) => (i ? difference(an.sigs[i - 1], sg, s.metric) : 0)) : []), [an, s.metric])
  const result = useMemo(() => {
    if (!an) return null
    const cuts = detectCuts(an.times, scores, s.threshold, s.minGap)
    const sc = scenes(an.times, scores, cuts, an.dur, s.pick)
    const dups = s.dedupe ? duplicates(sc.map((x) => an.sigs[x.key]), s.metric, s.dupDiff) : sc.map(() => -1)
    return { sc, dups }
  }, [an, scores, s.threshold, s.minGap, s.pick, s.dedupe, s.dupDiff, s.metric])

  const keep = result ? result.sc.map((_, i) => result.dups[i] < 0 && !skip.has(i)) : []
  const chosen = result ? result.sc.filter((_, i) => keep[i]) : []
  const base = (src?.name ?? 'video').replace(/\.[^.]+$/, '')
  const fname = (i: number, t: number, ext: string) => `${base}-scene${String(i + 1).padStart(3, '0')}-${clock(t).replace(/[:.]/g, '-')}.${ext}`

  /** Captures the given times at up to maxW pixels wide (0 = native). */
  const capture = async (times: number[], maxW: number) => {
    const v = vRef.current!
    const out: HTMLCanvasElement[] = []
    for (const [i, t] of times.entries()) {
      setBusy(`Capturing frame ${i + 1} / ${times.length}`)
      await seeked(v, t)
      const k = maxW ? Math.min(1, maxW / v.videoWidth) : 1
      const c = document.createElement('canvas')
      c.width = Math.round(v.videoWidth * k)
      c.height = Math.round(v.videoHeight * k)
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height)
      out.push(c)
    }
    return out
  }

  const exportZip = async () => {
    if (!an || !result) return
    const idx = result.sc.map((_, i) => i).filter((i) => keep[i])
    const cs = await capture(idx.map((i) => an.times[result.sc[i].key]), s.maxW)
    const files = []
    for (const [j, c] of cs.entries()) {
      const i = idx[j]
      const b = await toBlob(c, `image/${s.fmt}`)
      files.push({ name: fname(i, an.times[result.sc[i].key], s.fmt === 'jpeg' ? 'jpg' : 'png'), data: new Uint8Array(await b.arrayBuffer()) })
    }
    files.push({ name: `${base}-scenes.csv`, data: new TextEncoder().encode(csvRows().map((r) => r.map((x) => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : x)).join(',')).join('\n')) })
    download(`${base}-keyframes.zip`, new Blob([makeZip(files) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }))
    setBusy('')
  }

  const sheetCanvas = async (): Promise<HTMLCanvasElement | null> => {
    if (!an || !result) return null
    const idx = result.sc.map((_, i) => i).filter((i) => keep[i])
    const cw = 360, chh = Math.round((cw * an.h) / an.w), pad = 16, cap = 30, head = 64
    const cs = await capture(idx.map((i) => an.times[result.sc[i].key]), cw)
    const cols = Math.max(1, Math.min(s.cols, idx.length)), rows = Math.ceil(idx.length / cols)
    const c = document.createElement('canvas')
    c.width = pad + cols * (cw + pad)
    c.height = head + rows * (chh + cap + pad) + pad
    const g = c.getContext('2d')!
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, c.width, c.height)
    g.fillStyle = '#0f172a'
    g.font = 'bold 22px system-ui, sans-serif'
    g.fillText(src?.name ?? 'video', pad, 34)
    g.font = '14px system-ui, sans-serif'
    g.fillStyle = '#475569'
    g.fillText(`${idx.length} keyframes · ${clock(an.dur)} · ${an.w}×${an.h} · threshold ${s.threshold}`, pad, 54)
    cs.forEach((im, j) => {
      const i = idx[j], sc = result.sc[i]
      const x = pad + (j % cols) * (cw + pad), y = head + Math.floor(j / cols) * (chh + cap + pad)
      g.drawImage(im, x, y, cw, chh)
      g.strokeStyle = '#cbd5e1'
      g.strokeRect(x + 0.5, y + 0.5, cw - 1, chh - 1)
      g.fillStyle = '#0f172a'
      g.font = 'bold 14px system-ui, sans-serif'
      g.fillText(`#${i + 1}  ${clock(an.times[sc.key])}`, x, y + chh + 20)
      g.fillStyle = '#64748b'
      g.font = '13px system-ui, sans-serif'
      const d = `${clock(sc.start)} – ${clock(sc.end)}`
      g.fillText(d, x + cw - g.measureText(d).width, y + chh + 20)
    })
    setBusy('')
    return c
  }
  const exportSheetPng = async () => {
    const c = await sheetCanvas()
    if (c) download(`${base}-contact-sheet.png`, await toBlob(c, 'image/png'))
  }
  const exportSheetPdf = async () => {
    if (!an || !result) return
    const idx = result.sc.map((_, i) => i).filter((i) => keep[i])
    const cs = await capture(idx.map((i) => an.times[result.sc[i].key]), 720)
    setBusy('Building PDF…')
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold)
    const PW = 841.89, PH = 595.28, M = 36, cols = Math.max(1, Math.min(s.cols, 4)), cw = (PW - 2 * M - (cols - 1) * 14) / cols
    const chh = (cw * an.h) / an.w, rowH = chh + 30, rows = Math.max(1, Math.floor((PH - 2 * M - 40) / rowH))
    let page = doc.addPage([PW, PH])
    const header = (p: typeof page, n: number) => {
      p.drawText((src?.name ?? 'video').replace(/[^\x20-\x7e]/g, '?'), { x: M, y: PH - M - 14, size: 14, font: bold, color: rgb(0.06, 0.09, 0.16) })
      p.drawText(`${idx.length} keyframes · duration ${clock(an.dur)} · page ${n}`, { x: M, y: PH - M - 30, size: 9, font, color: rgb(0.4, 0.45, 0.53) })
    }
    header(page, 1)
    for (const [j, c] of cs.entries()) {
      const slot = j % (cols * rows)
      if (j && slot === 0) {
        page = doc.addPage([PW, PH])
        header(page, Math.floor(j / (cols * rows)) + 1)
      }
      const x = M + (slot % cols) * (cw + 14), y = PH - M - 44 - Math.floor(slot / cols) * rowH - chh
      const img = await doc.embedJpg(new Uint8Array(await (await toBlob(c, 'image/jpeg', 0.86)).arrayBuffer()))
      page.drawImage(img, { x, y, width: cw, height: chh })
      const sc = result.sc[idx[j]]
      page.drawText(`#${idx[j] + 1}  ${clock(an.times[sc.key])}`, { x, y: y - 13, size: 9, font: bold, color: rgb(0.06, 0.09, 0.16) })
      const d = `${clock(sc.start)} - ${clock(sc.end)}`
      page.drawText(d, { x: x + cw - font.widthOfTextAtSize(d, 8), y: y - 13, size: 8, font, color: rgb(0.4, 0.45, 0.53) })
    }
    const bytes = await doc.save()
    download(`${base}-contact-sheet.pdf`, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }))
    setBusy('')
  }

  const csvRows = (): (string | number)[][] => [
    ['scene', 'start_s', 'end_s', 'duration_s', 'keyframe_s', 'keyframe_clock', 'cut_score', 'duplicate_of', 'exported', 'file'],
    ...(result && an ? result.sc.map((x, i) => [i + 1, x.start.toFixed(3), x.end.toFixed(3), (x.end - x.start).toFixed(3), an.times[x.key].toFixed(3), clock(an.times[x.key]), x.score.toFixed(3), result.dups[i] >= 0 ? result.dups[i] + 1 : '', keep[i] ? 'yes' : 'no', keep[i] ? fname(i, an.times[x.key], s.fmt === 'jpeg' ? 'jpg' : 'png') : '']) : []),
  ]

  const chart = an ? [
    { name: 'Change score', points: an.times.map((t, i) => [t, scores[i]] as [number, number]), area: true },
    { name: 'Threshold', points: [[0, s.threshold], [an.dur, s.threshold]] as [number, number][], dashed: true, color: 'var(--err)' },
  ] : []
  const nDup = result ? result.dups.filter((d) => d >= 0).length : 0

  return (
    <Split wide="right">
      <div>
        <Panel title="Video">
          <FileDrop accept="video/*" onFiles={([f]) => load(f, f.name)} label="Drop a video (MP4, WebM, MOV…) or click" />
          {src && <p className="muted" style={{ margin: '8px 0' }}>🎞 <b>{src.name}</b> · {fmtBytes(src.size)}{an ? ` · ${an.w}×${an.h} · ${clock(an.dur)}` : ''}</p>}
          {src && <video ref={vRef} src={src.url} controls muted playsInline preload="auto" onLoadedMetadata={onMeta} style={{ width: '100%', borderRadius: 8, background: '#000' }} />}
          {(status || busy) && <Note>{busy || status}</Note>}
          {busy.startsWith('Analyzing') && <Btn kind="ghost" onClick={() => { cancel.current = true }}>Stop</Btn>}
        </Panel>
        <Panel title="Scene detection" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <span className="k-label">Difference metric</span>
          <Seg value={s.metric} onChange={(metric) => set({ metric })} options={[['hist', 'Color histogram'], ['ssim', 'Structure (SSIM)'], ['both', 'Both']]} />
          <Slider label="Cut threshold" value={s.threshold} onChange={(threshold) => set({ threshold })} min={0.02} max={0.9} step={0.01} />
          <Row>
            <Btn disabled={!an} onClick={() => set({ threshold: suggestThreshold(scores) })}>✨ Suggest threshold</Btn>
          </Row>
          <Slider label="Minimum scene length" value={s.minGap} onChange={(minGap) => set({ minGap })} min={0} max={10} step={0.1} unit=" s" />
          <Row>
            <Select label="Analysis rate" value={s.rate} onChange={(rate) => set({ rate })} options={[[2, '2 samples/s'], [5, '5 samples/s'], [10, '10 samples/s'], [15, '15 samples/s']]} />
            <Select label="Keyframe" value={s.pick} onChange={(pick) => set({ pick })} options={[['middle', 'Middle of scene'], ['first', 'Start of scene']]} />
          </Row>
          <Btn kind="primary" disabled={!src || !!busy} onClick={() => void analyze()}>↻ Re-analyze</Btn>
          <Check label="Remove near-duplicate keyframes" value={s.dedupe} onChange={(dedupe) => set({ dedupe })} />
          {s.dedupe && <Slider label="Duplicate tolerance" value={s.dupDiff} onChange={(dupDiff) => set({ dupDiff })} min={0.01} max={0.4} step={0.01} />}
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>The histogram cue catches color changes; SSIM catches layout changes with similar colors. Gradual fades may need a lower threshold.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Samples" value={an?.times.length ?? '—'} sub={an ? `every ${sampleStep(an.dur, s.rate).toFixed(2)} s` : ''} />
          <Stat label="Scenes" value={result?.sc.length ?? '—'} />
          <Stat label="Duplicates removed" value={nDup} />
          <Stat label="Keyframes" value={chosen.length} tone="accent" />
        </Stats>
        <Panel title="Change score over time">
          {an ? <LineChart series={chart} height={200} xLabel="seconds" fx={(v) => v.toFixed(1)} fy={(v) => v.toFixed(2)} yMin={0} yMax={Math.min(1, Math.max(s.threshold * 1.3, ...scores, 0.1))} markers={result && result.sc.length <= 16 ? result.sc.slice(1).map((x, i) => ({ x: x.start, label: `#${i + 2}` })) : []} /> : <Note>Waiting for a video…</Note>}
        </Panel>
        <Panel
          title="Keyframes"
          actions={<>
            <Btn kind="primary" disabled={!chosen.length || !!busy} onClick={() => void exportZip()}>⬇ Frames ZIP</Btn>
            <Btn disabled={!chosen.length || !!busy} onClick={() => void exportSheetPng()}>Contact sheet PNG</Btn>
            <Btn disabled={!chosen.length || !!busy} onClick={() => void exportSheetPdf()}>PDF</Btn>
            <CsvButton name={`${base}-scenes.csv`} rows={csvRows} />
          </>}
        >
          <Row>
            <Select label="Frame format" value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['png', 'PNG (lossless)'], ['jpeg', 'JPEG']]} />
            <Select label="Frame size" value={s.maxW} onChange={(maxW) => set({ maxW })} options={[[0, 'Original'], [1920, '≤ 1920 px'], [1280, '≤ 1280 px'], [640, '≤ 640 px']]} />
            <Select label="Sheet columns" value={s.cols} onChange={(cols) => set({ cols })} options={[2, 3, 4, 5, 6]} />
          </Row>
          {result && an && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {result.sc.map((x, i) => {
                const dup = result.dups[i]
                const on = keep[i]
                return (
                  <figure key={i} style={{ margin: 0, opacity: on ? 1 : 0.45, border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', background: 'var(--panel)' }}>
                    <img src={an.thumbs[x.key]} alt={`Scene ${i + 1}`} style={{ width: '100%', display: 'block', cursor: 'pointer' }} onClick={() => { if (vRef.current) vRef.current.currentTime = an.times[x.key] }} />
                    <figcaption style={{ padding: '6px 8px', fontSize: 12.5 }}>
                      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 700 }}>
                        <input type="checkbox" checked={on} disabled={dup >= 0} onChange={() => setSkip((k) => { const n = new Set(k); if (n.has(i)) n.delete(i); else n.add(i); return n })} />
                        #{i + 1} · {clock(an.times[x.key])}
                      </label>
                      <span className="muted">{(x.end - x.start).toFixed(1)} s{i ? ` · cut ${x.score.toFixed(2)}` : ''}{dup >= 0 ? ` · dup of #${dup + 1}` : ''}</span>
                    </figcaption>
                  </figure>
                )
              })}
            </div>
          )}
          <p className="muted" style={{ fontSize: 13 }}>Click a thumbnail to jump there in the player. Untick scenes you don't need. Exports re-capture each keyframe at full quality. Need manual frame stepping instead? Use Frame Grabber.</p>
        </Panel>
      </div>
    </Split>
  )
}
