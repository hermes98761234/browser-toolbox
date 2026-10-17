import { useEffect, useRef, useState } from 'react'
import { Btn, Note, Panel, Row, Seg, Select, Slider, Split, Txt, download, useToolState } from '../kit'
import { makeZip } from './lib/image-compressor'
import { draw, frameCount, progress, total, type Align, type Ease, type LT } from './lib/lower-third-designer'

type Bg = 'checker' | 'scene' | 'green' | 'dark'
interface State extends LT { bg: Bg; res: '1080' | '720'; fps: number; exportBg: 'transparent' | 'green' | 'black'; loop: boolean }

const DEF: State = {
  name: 'Dr. Maya Chen', title: 'Marine Biologist · Ocean Lab', template: 'bar', align: 'left',
  primary: '#ffffff', accent: '#6366f1', text: '#0f172a', sub: '#111827', font: 'system-ui, sans-serif', size: 64, margin: 12, side: 10,
  tIn: 0.9, hold: 3, tOut: 0.6, ease: 'cubic', bg: 'scene', res: '1080', fps: 30, exportBg: 'transparent', loop: true,
}

const PRESETS: { name: string; v: Partial<LT> }[] = [
  { name: 'Corporate bar', v: { template: 'bar', primary: '#ffffff', accent: '#6366f1', text: '#0f172a', sub: '#111827', ease: 'cubic', font: 'system-ui, sans-serif' } },
  { name: 'Minimal line', v: { template: 'line', primary: '#ffffff', accent: '#f59e0b', text: '#ffffff', sub: '#ffffff', ease: 'expo', font: 'system-ui, sans-serif' } },
  { name: 'Breaking news', v: { template: 'news', primary: '#0b1f4d', accent: '#e11d48', text: '#ffffff', sub: '#ffffff', ease: 'cubic', font: '"Arial Black", Arial, sans-serif' } },
  { name: 'Neon pill', v: { template: 'pill', primary: '#7c3aed', accent: '#06b6d4', text: '#ffffff', sub: '#e0f2fe', ease: 'back', font: 'system-ui, sans-serif' } },
  { name: 'Documentary', v: { template: 'underline', primary: '#ffffff', accent: '#facc15', text: '#ffffff', sub: '#e5e7eb', ease: 'cubic', font: 'Georgia, serif' } },
  { name: 'Sport split', v: { template: 'split', primary: '#111827', accent: '#22c55e', text: '#ffffff', sub: '#052e16', ease: 'back', font: 'Impact, "Arial Narrow", sans-serif' } },
]
const FONTS: [string, string][] = [
  ['system-ui, sans-serif', 'System sans'], ['Georgia, serif', 'Georgia (serif)'], ['"Arial Black", Arial, sans-serif', 'Arial Black'],
  ['Impact, "Arial Narrow", sans-serif', 'Impact'], ['"Trebuchet MS", sans-serif', 'Trebuchet'], ['ui-monospace, monospace', 'Monospace'],
]
const BG: Record<Bg, string> = {
  checker: 'repeating-conic-gradient(#cbd5e1 0% 25%, #f8fafc 0% 50%) 0 0 / 24px 24px',
  scene: 'radial-gradient(ellipse at 70% 30%, #fde68a 0%, transparent 25%), linear-gradient(180deg, #38bdf8 0%, #7dd3fc 45%, #166534 46%, #14532d 70%, #052e16 100%)',
  green: '#00b140',
  dark: '#111827',
}

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
}

export default function LowerThirdDesigner() {
  const [s, set, reset] = useToolState('lower-third-designer', DEF)
  const cv = useRef<HTMLCanvasElement>(null)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [job, setJob] = useState<string>('')
  const sRef = useRef(s)
  useEffect(() => {
    sRef.current = s
  })
  const dur = total(s)

  // Preview loop
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      setT((x) => {
        const d = total(sRef.current) + 0.6
        const n = x + dt
        if (n > d) {
          if (sRef.current.loop) return 0
          setPlaying(false)
          return d
        }
        return n
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  useEffect(() => {
    const c = cv.current
    const ctx = c?.getContext('2d')
    if (c && ctx) draw(ctx, c.width, c.height, t, s)
  }, [t, s])

  const res = s.res === '1080' ? [1920, 1080] : [1280, 720]
  const frame = (W: number, H: number) => {
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    return { c, ctx: c.getContext('2d')! }
  }
  const paint = (ctx: CanvasRenderingContext2D, W: number, H: number, time: number) => {
    draw(ctx, W, H, time, s)
    if (s.exportBg !== 'transparent') {
      ctx.save()
      ctx.globalCompositeOperation = 'destination-over'
      ctx.fillStyle = s.exportBg === 'green' ? '#00b140' : '#000000'
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }
  }
  const slug = (s.name || 'lower-third').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lower-third'

  const exportPng = () => {
    const [W, H] = res
    const { c, ctx } = frame(W, H)
    paint(ctx, W, H, s.tIn + s.hold / 2)
    c.toBlob((b) => b && download(`${slug}.png`, b, 'image/png'), 'image/png')
  }

  const exportSeq = async () => {
    const [W, H] = res
    const { c, ctx } = frame(W, H)
    const n = frameCount(s, s.fps)
    const files: { name: string; data: Uint8Array }[] = []
    for (let i = 0; i <= n; i++) {
      paint(ctx, W, H, i / s.fps)
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
      if (blob) files.push({ name: `${slug}_${String(i).padStart(4, '0')}.png`, data: new Uint8Array(await blob.arrayBuffer()) })
      if (i % 5 === 0) setJob(`Rendering PNG frames… ${i}/${n}`)
    }
    setJob('Packing ZIP…')
    download(`${slug}_png_${s.fps}fps.zip`, new Blob([makeZip(files) as BlobPart], { type: 'application/zip' }), 'application/zip')
    setJob('')
  }

  const exportWebm = async () => {
    const mime = pickMime()
    if (!mime) return setJob('MediaRecorder with WebM is not supported in this browser — use the PNG sequence instead.')
    const [W, H] = res
    const { c, ctx } = frame(W, H)
    paint(ctx, W, H, 0)
    const stream = c.captureStream(s.fps)
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: s.res === '1080' ? 8e6 : 5e6 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const done = new Promise<void>((r) => (rec.onstop = () => r()))
    rec.start(250)
    const d = total(s) + 0.2
    const t0 = performance.now()
    await new Promise<void>((resolve) => {
      const step = () => {
        const time = (performance.now() - t0) / 1000
        paint(ctx, W, H, Math.min(time, d))
        setJob(`Recording WebM in real time… ${time.toFixed(1)} / ${d.toFixed(1)} s`)
        if (time >= d) return resolve()
        requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
    rec.stop()
    await done
    stream.getTracks().forEach((tr) => tr.stop())
    download(`${slug}.webm`, new Blob(chunks, { type: 'video/webm' }), 'video/webm')
    setJob('')
  }

  const run = (f: () => Promise<void>) => {
    setJob('Starting…')
    f().catch((e) => setJob(`Export failed: ${(e as Error).message}`))
  }
  const ph = progress(t, s).phase
  const color = (label: string, k: 'primary' | 'accent' | 'text' | 'sub') => (
    <label className="k-field" style={{ minWidth: 0 }}>
      <span className="k-label">{label}</span>
      <input type="color" value={s[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<State>)} style={{ width: '100%', height: 36, border: 'none', background: 'none' }} />
    </label>
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Text" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Txt label="Name (line 1)" value={s.name} onChange={(name) => set({ name })} />
          <Txt label="Title (line 2)" value={s.title} onChange={(title) => set({ title })} />
          <Select label="Font" value={s.font} onChange={(font) => set({ font })} options={FONTS} />
          <Slider label="Name size" value={s.size} onChange={(size) => set({ size })} min={28} max={120} unit=" px @1080p" />
        </Panel>
        <Panel title="Template">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
            {PRESETS.map((p) => (
              <Btn key={p.name} kind={s.template === p.v.template ? 'primary' : 'normal'} onClick={() => set(p.v)}>{p.name}</Btn>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 10 }}>
            {color('Primary', 'primary')}
            {color('Accent', 'accent')}
            {color('Name text', 'text')}
            {color('Title text', 'sub')}
          </div>
        </Panel>
        <Panel title="Position">
          <Seg value={s.align} onChange={(align: Align) => set({ align })} options={[['left', 'Left'], ['center', 'Center'], ['right', 'Right']]} label="Alignment" />
          <Slider label="Distance from bottom" value={s.margin} onChange={(margin) => set({ margin })} min={2} max={60} unit="%" />
          <Slider label="Distance from side" value={s.side} onChange={(side) => set({ side })} min={0} max={30} unit="%" />
          <p className="muted" style={{ fontSize: 13 }}>Broadcast title-safe area is about 10% in from each edge.</p>
        </Panel>
        <Panel title="Animation">
          <Slider label="In" value={s.tIn} onChange={(tIn) => set({ tIn })} min={0} max={3} step={0.05} unit=" s" />
          <Slider label="Hold" value={s.hold} onChange={(hold) => set({ hold })} min={0} max={15} step={0.25} unit=" s" />
          <Slider label="Out" value={s.tOut} onChange={(tOut) => set({ tOut })} min={0} max={3} step={0.05} unit=" s" />
          <Seg value={s.ease} onChange={(ease: Ease) => set({ ease })} options={[['cubic', 'Smooth'], ['expo', 'Snappy'], ['back', 'Overshoot'], ['linear', 'Linear']]} label="Easing" />
        </Panel>
      </div>
      <div>
        <Panel title="Preview" actions={<Seg value={s.bg} onChange={(bg: Bg) => set({ bg })} options={[['scene', 'Scene'], ['checker', 'Alpha'], ['green', 'Green'], ['dark', 'Dark']]} label="Backdrop" />}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', background: BG[s.bg], borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)' }}>
            <canvas ref={cv} width={1920} height={1080} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
            <div style={{ position: 'absolute', inset: '10%', border: '1px dashed rgba(255,255,255,.35)', pointerEvents: 'none' }} />
          </div>
          <div style={{ marginTop: 10 }}>
            <Row wrap={false}>
              <Btn kind="primary" onClick={() => { if (!playing && t >= dur) setT(0); setPlaying(!playing) }}>{playing ? '⏸' : '▶'}</Btn>
              <Btn onClick={() => { setPlaying(false); setT(s.tIn + s.hold / 2) }} title="Jump to hold">Hold</Btn>
              <input type="range" min={0} max={dur + 0.6} step={0.01} value={Math.min(t, dur + 0.6)} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)) }} style={{ flex: 1, minWidth: 60 }} aria-label="Timeline" />
              <span className="mono" style={{ whiteSpace: 'nowrap' }}>{t.toFixed(2)} s · {ph}</span>
            </Row>
            <label className="k-check" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={s.loop} onChange={(e) => set({ loop: e.target.checked })} /> Loop preview
            </label>
          </div>
        </Panel>
        <Panel title="Export">
          <Row>
            <Seg value={s.res} onChange={(r: '1080' | '720') => set({ res: r })} options={[['1080', '1920×1080'], ['720', '1280×720']]} label="Resolution" />
            <Seg value={String(s.fps) as '25' | '30' | '60'} onChange={(f) => set({ fps: Number(f) })} options={[['25', '25 fps'], ['30', '30 fps'], ['60', '60 fps']]} label="Frame rate" />
          </Row>
          <div style={{ margin: '10px 0' }}>
            <Seg value={s.exportBg} onChange={(exportBg: State['exportBg']) => set({ exportBg })} options={[['transparent', 'Transparent'], ['green', 'Green screen'], ['black', 'Black']]} label="Export background" />
          </div>
          <Row>
            <Btn kind="primary" disabled={!!job} onClick={() => run(exportWebm)}>⬇ WebM video</Btn>
            <Btn disabled={!!job} onClick={() => run(exportSeq)}>⬇ PNG sequence (ZIP)</Btn>
            <Btn disabled={!!job} onClick={exportPng}>⬇ Still PNG</Btn>
          </Row>
          {job && <Note tone={job.startsWith('Export failed') || job.includes('not supported') ? 'err' : 'info'}>{job}</Note>}
          <p className="muted" style={{ fontSize: 13 }}>
            {dur.toFixed(2)} s · {frameCount(s, s.fps) + 1} frames. WebM records in real time with VP9/VP8; Chromium keeps the alpha channel, other browsers may flatten it — the PNG
            sequence is always transparent and imports into Premiere, Resolve, Final Cut and OBS as an image sequence.
          </p>
        </Panel>
        {(s.name.length > 34 || s.title.length > 60) && <Note tone="warn">Long text: viewers read a lower third in 2–4 seconds. Keep the name short and the title under ~40 characters.</Note>}
      </div>
    </Split>
  )
}
