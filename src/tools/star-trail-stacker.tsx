import { useEffect, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, num, useToolState } from '../kit'
import type { Job, Src } from './lib/star-trail-stacker.worker'

interface Settings { mode: 'lighten' | 'mean'; tail: number; comet: boolean; gap: boolean; shift: number; sens: number; from: number; to: number }
const DEF: Settings = { mode: 'lighten', tail: 0.15, comet: false, gap: true, shift: 2.5, sens: 3.5, from: 1, to: 999 }

interface Frame { id: string; name: string; src: Src; on: boolean }
const DEMO_W = 1440, DEMO_H = 960, DEMO_N = 36
const demoFrames = (): Frame[] => Array.from({ length: DEMO_N }, (_, i) => ({ id: `d${i}`, name: `demo-${String(i + 1).padStart(2, '0')}`, src: { kind: 'demo', i: i * 2 }, on: true }))

const PREVIEW_W = 960

export default function StarTrailStacker() {
  const [s, set, reset] = useToolState('star-trail-stacker', DEF)
  const [frames, setFrames] = useState<Frame[]>(demoFrames)
  const [busy, setBusy] = useState<null | { what: string; p: number }>(null)
  const [stats, setStats] = useState<{ stars: number; segments: number; ms: number } | null>(null)
  const [err, setErr] = useState('')
  const cv = useRef<HTMLCanvasElement>(null)
  const worker = useRef<Worker | null>(null)
  const jobId = useRef(0)
  const isDemo = frames[0]?.src.kind === 'demo'
  const first = frames[0]?.src
  const fullW = first?.kind === 'blob' ? first.w : DEMO_W
  const fullH = first?.kind === 'blob' ? first.h : DEMO_H
  const lo = Math.max(1, Math.min(frames.length, s.from)), hi = Math.max(lo, Math.min(frames.length, s.to))
  const used = frames.filter((f, i) => f.on && i + 1 >= lo && i + 1 <= hi)

  const getWorker = () => {
    if (!worker.current) worker.current = new Worker(new URL('./lib/star-trail-stacker.worker.ts', import.meta.url), { type: 'module' })
    return worker.current
  }
  useEffect(() => () => worker.current?.terminate(), [])

  const job = (png: boolean): Job => {
    const W = png ? fullW : Math.min(PREVIEW_W, fullW)
    return { id: ++jobId.current, srcs: used.map((f) => f.src), W, H: Math.round((fullH * W) / fullW), mode: s.mode, tail: s.comet ? s.tail : 1, gap: s.gap, shift: s.shift / 100, sens: s.sens, png }
  }

  // live preview (debounced)
  const key = JSON.stringify([s, used.map((f) => f.id)])
  useEffect(() => {
    if (!used.length) return
    const t = setTimeout(() => {
      const j = job(false)
      const w = getWorker()
      setBusy({ what: 'Preview', p: 0 })
      w.onmessage = (e) => {
        const m = e.data
        if (m.id !== jobId.current) return
        if (m.error) {
          setErr(m.error)
          setBusy(null)
        } else if (m.progress !== undefined) setBusy({ what: 'Preview', p: m.progress })
        else if (m.done) {
          const c = cv.current
          if (c) {
            c.width = m.W
            c.height = m.H
            c.getContext('2d')!.putImageData(new ImageData(m.rgba, m.W, m.H), 0, 0)
          }
          setStats(m.stats)
          setErr('')
          setBusy(null)
        }
      }
      w.postMessage(j)
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const exportPng = () => {
    const j = job(true)
    const w = getWorker()
    setBusy({ what: `Rendering ${j.W}×${j.H}`, p: 0 })
    w.onmessage = (e) => {
      const m = e.data
      if (m.id !== jobId.current) return
      if (m.error) {
        setErr(m.error)
        setBusy(null)
      } else if (m.progress !== undefined) setBusy({ what: `Rendering ${j.W}×${j.H}`, p: m.progress })
      else if (m.done) {
        download(`star-trails-${used.length}f-${j.W}x${j.H}.png`, m.blob)
        setBusy(null)
      }
    }
    w.postMessage(j)
  }

  const onFiles = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/')).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    if (!imgs.length) return
    setBusy({ what: 'Reading frames', p: 0 })
    try {
      const out: Frame[] = []
      for (const [i, f] of imgs.entries()) {
        const b = await createImageBitmap(f)
        out.push({ id: `${f.name}-${i}-${f.size}`, name: f.name, src: { kind: 'blob', blob: f, w: b.width, h: b.height }, on: true })
        b.close()
        setBusy({ what: 'Reading frames', p: (i + 1) / imgs.length })
      }
      setFrames(out)
      set({ from: 1, to: 999 })
      setErr('')
    } catch {
      setErr('One of the files could not be decoded as an image (RAW files must be converted to JPEG/PNG/TIFF-compatible formats first).')
    }
    setBusy(null)
  }

  const mixed = frames.some((f) => f.src.kind === 'blob' && (f.src.w !== fullW || f.src.h !== fullH))

  return (
    <Split wide="right">
      <div>
        <Panel title="Frames">
          <FileDrop accept="image/*" multiple onFiles={onFiles} label="Drop your night-sky frames (JPEG/PNG, same camera position)" />
          {isDemo ? (
            <Note>Showing {DEMO_N} generated demo frames (1440×960, 1° of sky rotation each). Drop your own sequence to replace them.</Note>
          ) : (
            <Row>
              <Btn kind="ghost" onClick={() => setFrames(demoFrames())}>Back to demo frames</Btn>
            </Row>
          )}
          {mixed && <Note tone="warn">Frames have different sizes; all are scaled to the first frame ({fullW}×{fullH}).</Note>}
          <Row>
            <Slider label="First frame" value={lo} onChange={(from) => set({ from })} min={1} max={Math.max(1, frames.length)} show={(v) => num(v, 0)} />
            <Slider label="Last frame" value={hi} onChange={(to) => set({ to })} min={1} max={Math.max(1, frames.length)} show={(v) => num(v, 0)} />
          </Row>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0' }}>Untick frames with aeroplanes, car lights or clouds:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 150, overflow: 'auto' }}>
            {frames.map((f, i) => (
              <button key={f.id} type="button" title={f.name} onClick={() => setFrames(frames.map((x) => (x.id === f.id ? { ...x, on: !x.on } : x)))}
                style={{ minWidth: 34, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--line)', cursor: 'pointer', fontSize: 12, background: f.on && i + 1 >= lo && i + 1 <= hi ? 'var(--accent)' : 'var(--panel2)', color: f.on && i + 1 >= lo && i + 1 <= hi ? 'var(--on-accent, #fff)' : 'var(--muted)', textDecoration: f.on ? undefined : 'line-through' }}>
                {i + 1}
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Stacking">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['lighten', 'Lighten (trails)'], ['mean', 'Mean (low-noise sky)']]} />
          {s.mode === 'lighten' && (
            <>
              <Check label="Comet-tail fade (older positions dim out)" value={s.comet} onChange={(comet) => set({ comet })} />
              {s.comet && <Slider label="Tail brightness at the start" value={s.tail} onChange={(tail) => set({ tail })} min={0.02} max={0.9} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />}
              <Check label="Fill gaps between frames" value={s.gap} onChange={(gap) => set({ gap })} />
              {s.gap && (
                <>
                  <Slider label="Max star movement per frame" value={s.shift} onChange={(shift) => set({ shift })} min={0.3} max={6} step={0.1} unit="% of width" />
                  <Slider label="Star detection threshold" value={s.sens} onChange={(sens) => set({ sens })} min={2} max={10} step={0.5} unit=" σ" />
                </>
              )}
            </>
          )}
          <Btn kind="ghost" onClick={reset}>Reset settings</Btn>
        </Panel>
        <Panel title="Tips">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.5 }}>
            <li>Shoot on a tripod with fixed exposure, focus and white balance; use an intervalometer with a 1–2 s gap.</li>
            <li>Dotted trails come from that gap: <b>Fill gaps</b> pairs each star with its next position and draws the missing arc.</li>
            <li><b>Mean</b> averages frames: no trails, but much less noise for a clean foreground layer.</li>
            <li>Everything runs in a background worker, in horizontal strips, so 24 MP sequences don't exhaust memory.</li>
          </ul>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Frames stacked" value={`${used.length} / ${frames.length}`} />
          <Stat label="Output" value={`${fullW}×${fullH}`} sub={`${num((fullW * fullH) / 1e6, 1)} MP PNG`} />
          <Stat label="Stars per frame" value={stats && s.gap && s.mode === 'lighten' ? num(stats.stars, 0) : '—'} sub={stats && s.gap && s.mode === 'lighten' ? `${num(stats.segments, 0)} gap segments` : 'gap filling off'} />
          <Stat label="Preview time" value={stats ? `${num(stats.ms / 1000, 2)} s` : '—'} tone="accent" />
        </Stats>
        <Panel title="Result" actions={<Btn kind="primary" onClick={exportPng} disabled={!used.length || !!busy}>⬇ Full-resolution PNG</Btn>}>
          {err && <Note tone="err">{err}</Note>}
          {!used.length && <Note tone="warn">No frames selected.</Note>}
          <div style={{ position: 'relative' }}>
            <canvas ref={cv} style={{ width: '100%', borderRadius: 10, background: '#02040c', display: 'block', aspectRatio: `${fullW} / ${fullH}` }} />
            {busy && (
              <div style={{ position: 'absolute', left: 10, bottom: 10, right: 10, background: 'rgba(15,23,42,.8)', color: '#e2e8f0', padding: '6px 10px', borderRadius: 8, fontSize: 13 }}>
                {busy.what}… {Math.round(busy.p * 100)}%
                <div style={{ height: 4, background: '#334155', borderRadius: 2, marginTop: 4 }}>
                  <div style={{ width: `${busy.p * 100}%`, height: 4, background: '#38bdf8', borderRadius: 2 }} />
                </div>
              </div>
            )}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Preview is {Math.min(PREVIEW_W, fullW)} px wide; the PNG export re-stacks every frame at full resolution.</p>
        </Panel>
      </div>
    </Split>
  )
}
