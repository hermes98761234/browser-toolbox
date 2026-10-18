import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, CsvButton, download, FileDrop, JsonButtons, Note, num, Panel, Row, Seg, Select, Slider, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { encodeWav, fmtSec, heat, mono, peakFreq, spectrogram, syllables, synthBird, type Spectrogram } from './lib/bird-song-recorder'

// ---------- audio blobs in IndexedDB (metadata lives in the tool state) ----------
const DB = 'tb-bird-song-recorder'
const db = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('audio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
async function idb<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const d = await db()
  return new Promise((res, rej) => { const q = f(d.transaction('audio', mode).objectStore('audio')); q.onsuccess = () => res(q.result as T); q.onerror = () => rej(q.error) })
}

interface Ann { id: string; t0: number; t1: number; f0: number; f1: number; label: string }
interface Rec { id: string; title: string; at: string; place: string; lat?: number; lon?: number; notes: string; dur: number; trim: [number, number]; anns: Ann[] }
interface State { recs: Rec[]; sel: string; fMin: number; fMax: number; fft: number; floor: number }

const DEMO: Rec = { id: 'demo', title: 'Dawn chorus (synthetic demo)', at: '2026-05-14T05:42', place: 'Garden hedge, east side', notes: 'Generated in code: whistles, rising chirps and a trill.', dur: 8, trim: [0, 8], anns: [{ id: 'a1', t0: 0.38, t1: 0.92, f0: 2500, f1: 3600, label: 'Two whistles' }, { id: 'a2', t0: 0.98, t1: 1.3, f0: 3300, f1: 7200, label: 'Rising chirps' }] }
const DEF: State = { recs: [DEMO], sel: 'demo', fMin: 1000, fMax: 12000, fft: 1024, floor: -90 }

interface Pcm { x: Float32Array; rate: number }
const SYN_RATE = 32000

export default function BirdSongRecorder() {
  const [s, set, reset] = useToolState('bird-song-recorder', DEF)
  const [pcm, setPcm] = useState<Pcm | null>(null)
  const [err, setErr] = useState('')
  const [rec, setRec] = useState<{ el: number; level: number } | null>(null)
  const [selBox, setSelBox] = useState<Omit<Ann, 'id' | 'label'> | null>(null)
  const [label, setLabel] = useState('')
  const [speed, setSpeed] = useState<'1' | '0.5'>('1')
  const [playT, setPlayT] = useState<number | null>(null)
  const [view, setView] = useState<[number, number] | null>(null)
  const actx = useRef<AudioContext | null>(null)
  const media = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; an: AnalyserNode; raf: number } | null>(null)
  const live = useRef<HTMLCanvasElement>(null)
  const cv = useRef<HTMLCanvasElement>(null)
  const src = useRef<AudioBufferSourceNode | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const anchor = useRef<{ t: number; f: number } | null>(null)
  const cur = s.recs.find((r) => r.id === s.sel) ?? s.recs[0]
  const ac = () => (actx.current ??= new AudioContext())
  const edit = (p: Partial<Rec>) => cur && set((st) => ({ ...st, recs: st.recs.map((r) => (r.id === cur.id ? { ...r, ...p } : r)) }))

  // load audio of the selected recording
  useEffect(() => {
    let off = false
    void (async () => {
      if (!cur) { setPcm(null); return }
      if (cur.id === 'demo') { setPcm({ x: synthBird(SYN_RATE, 8, 1), rate: SYN_RATE }); return }
      try {
        const blob = await idb<Blob | undefined>('readonly', (st) => st.get(cur.id))
        if (!blob) throw new Error('Audio for this entry is missing (it is stored only in this browser).')
        const buf = await ac().decodeAudioData(await blob.arrayBuffer())
        if (!off) setPcm({ x: mono([...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i))), rate: buf.sampleRate })
      } catch (e) { if (!off) { setPcm(null); setErr(e instanceof Error ? e.message : String(e)) } }
    })()
    return () => { off = true }
  }, [cur?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const dur = pcm ? pcm.x.length / pcm.rate : 0
  const sp = useMemo<Spectrogram | null>(() => {
    if (!pcm) return null
    const hop = Math.max(s.fft / 4, Math.ceil(pcm.x.length / 6000))
    return spectrogram(pcm.x, pcm.rate, s.fft, hop)
  }, [pcm, s.fft])
  const nyq = pcm ? pcm.rate / 2 : 16000
  const fMax = Math.min(s.fMax, nyq), fMin = Math.min(s.fMin, fMax - 500)
  const [v0, v1] = view ?? [0, dur]

  // render the spectrogram once into an offscreen image (time × frequency)
  const specImg = useMemo(() => {
    if (!sp) return null
    const W = sp.frames.length, H = 256
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const g = c.getContext('2d')!
    const im = g.createImageData(W, H)
    for (let x = 0; x < W; x++) {
      const f = sp.frames[x]
      for (let y = 0; y < H; y++) {
        const hz = fMax - ((y + 0.5) / H) * (fMax - fMin)
        const k = Math.min(f.length - 1, Math.round(hz / sp.binHz))
        const [r, gg, b] = heat((f[k] - s.floor) / -s.floor)
        const o = (y * W + x) * 4
        im.data[o] = r; im.data[o + 1] = gg; im.data[o + 2] = b; im.data[o + 3] = 255
      }
    }
    g.putImageData(im, 0, 0)
    return c
  }, [sp, fMin, fMax, s.floor])

  useEffect(() => {
    const c = cv.current, im = specImg
    if (!c || !im || !dur) return
    const W = c.clientWidth || 700, H = 300, L = 44, B = 22
    const dpr = Math.min(2, devicePixelRatio || 1)
    c.width = W * dpr; c.height = H * dpr
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.fillStyle = '#0b1020'; g.fillRect(0, 0, W, H)
    const sx0 = (v0 / dur) * im.width, sw = ((v1 - v0) / dur) * im.width
    g.imageSmoothingEnabled = true
    g.drawImage(im, sx0, 0, Math.max(1, sw), im.height, L, 0, W - L, H - B)
    const tx = (t: number) => L + ((t - v0) / (v1 - v0)) * (W - L), fy = (f: number) => (1 - (f - fMin) / (fMax - fMin)) * (H - B)
    g.fillStyle = 'rgba(0,0,0,.55)'
    if (cur) { g.fillRect(L, 0, Math.max(0, tx(cur.trim[0]) - L), H - B); g.fillRect(tx(cur.trim[1]), 0, Math.max(0, W - tx(cur.trim[1])), H - B) }
    g.font = '11px system-ui'; g.fillStyle = '#cbd5e1'; g.textAlign = 'right'
    for (let f = Math.ceil(fMin / 1000) * 1000; f <= fMax; f += fMax - fMin > 6000 ? 2000 : 1000) { g.fillText(`${f / 1000}k`, L - 4, fy(f) + 4); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(L, fy(f), W - L, 1); g.fillStyle = '#cbd5e1' }
    g.textAlign = 'center'
    const step = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60].find((st) => (v1 - v0) / st <= 10) ?? 60
    for (let t = Math.ceil(v0 / step) * step; t <= v1; t += step) g.fillText(t >= 60 ? fmtSec(t) : `${num(t, 2)}s`, tx(t), H - 6)
    for (const a of cur?.anns ?? []) {
      g.strokeStyle = '#22d3ee'; g.lineWidth = 1.5; g.strokeRect(tx(a.t0), fy(a.f1), tx(a.t1) - tx(a.t0), fy(a.f0) - fy(a.f1))
      g.fillStyle = '#22d3ee'; g.textAlign = 'left'; g.fillText(a.label, tx(a.t0) + 3, Math.max(12, fy(a.f1) - 4))
    }
    if (selBox) { g.strokeStyle = '#fbbf24'; g.setLineDash([5, 4]); g.strokeRect(tx(selBox.t0), fy(selBox.f1), tx(selBox.t1) - tx(selBox.t0), fy(selBox.f0) - fy(selBox.f1)); g.setLineDash([]) }
    if (playT !== null) { g.fillStyle = '#f43f5e'; g.fillRect(tx(playT) - 1, 0, 2, H - B) }
  }, [specImg, dur, v0, v1, fMin, fMax, cur, selBox, playT])

  const stop = () => { try { src.current?.stop() } catch { /* already stopped */ } src.current = null; setPlayT(null) }
  const play = (from: number, to: number) => {
    if (!pcm) return
    stop()
    const ctx = ac()
    void ctx.resume()
    const a = Math.max(0, Math.floor(from * pcm.rate)), b = Math.min(pcm.x.length, Math.ceil(to * pcm.rate))
    if (b - a < 10) return
    const buf = ctx.createBuffer(1, b - a, pcm.rate)
    buf.copyToChannel(pcm.x.slice(a, b), 0)
    const n = ctx.createBufferSource()
    n.buffer = buf
    n.playbackRate.value = Number(speed)
    n.connect(ctx.destination)
    const start = ctx.currentTime
    n.start()
    src.current = n
    const tick = () => {
      if (src.current !== n) return
      const t = from + (ctx.currentTime - start) * Number(speed)
      if (t >= to) { setPlayT(null); return }
      setPlayT(t)
      requestAnimationFrame(tick)
    }
    n.onended = () => { if (src.current === n) { src.current = null; setPlayT(null) } }
    requestAnimationFrame(tick)
  }

  // ---------- recording ----------
  const startRec = async () => {
    setErr('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setErr('Recording is not supported in this browser. You can still import audio files.'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const ctx = ac()
      await ctx.resume()
      const an = ctx.createAnalyser()
      an.fftSize = 2048
      ctx.createMediaStreamSource(stream).connect(an)
      const mr = new MediaRecorder(stream)
      const chunks: Blob[] = []
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      mr.onstop = () => void saveBlob(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), true)
      mr.start(250)
      const bins = new Uint8Array(an.frequencyBinCount), td = new Float32Array(an.fftSize)
      const t0 = ctx.currentTime
      const loop = () => {
        const c = live.current
        if (c) {
          const g = c.getContext('2d')!
          g.drawImage(c, -2, 0)
          an.getByteFrequencyData(bins)
          const hzPerBin = ctx.sampleRate / an.fftSize
          for (let y = 0; y < c.height; y++) {
            const hz = 12000 - (y / c.height) * 11000
            const [r, gg, b] = heat(bins[Math.min(bins.length - 1, Math.round(hz / hzPerBin))] / 255)
            g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`
            g.fillRect(c.width - 2, y, 2, 1)
          }
        }
        an.getFloatTimeDomainData(td)
        let pk = 0
        for (const v of td) pk = Math.max(pk, Math.abs(v))
        setRec({ el: ctx.currentTime - t0, level: pk })
        if (media.current) media.current.raf = requestAnimationFrame(loop)
      }
      media.current = { mr, stream, chunks, an, raf: requestAnimationFrame(loop) }
      setRec({ el: 0, level: 0 })
    } catch { setErr('Microphone permission was denied or no microphone is available.') }
  }
  const stopRec = () => {
    const m = media.current
    if (!m) return
    cancelAnimationFrame(m.raf)
    media.current = null
    m.mr.stop()
    m.stream.getTracks().forEach((t) => t.stop())
    setRec(null)
  }
  const saveBlob = async (blob: Blob, recorded: boolean, name = '') => {
    try {
      const buf = await ac().decodeAudioData(await blob.arrayBuffer())
      const id = uid()
      await idb('readwrite', (st) => st.put(blob, id))
      const now = new Date()
      const at = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      const r: Rec = { id, title: name || (recorded ? `Recording ${at.replace('T', ' ')}` : 'Imported audio'), at, place: '', notes: '', dur: buf.duration, trim: [0, buf.duration], anns: [] }
      set((st) => ({ ...st, recs: [r, ...st.recs], sel: id }))
      setView(null); setSelBox(null)
    } catch { setErr('Could not decode that audio.') }
  }
  useEffect(() => () => { media.current?.stream.getTracks().forEach((t) => t.stop()); try { src.current?.stop() } catch { /* noop */ } }, [])

  // ---------- canvas interaction ----------
  const toTF = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const L = 44, B = 22
    const t = v0 + ((e.clientX - r.left - L) / (r.width - L)) * (v1 - v0)
    const f = fMax - ((e.clientY - r.top) / (r.height - B)) * (fMax - fMin)
    return { t: Math.max(0, Math.min(dur, t)), f: Math.max(fMin, Math.min(fMax, f)), x: e.clientX, y: e.clientY }
  }
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => { const p = toTF(e); drag.current = { x: p.x, y: p.y }; anchor.current = { t: p.t, f: p.f }; e.currentTarget.setPointerCapture(e.pointerId); setSelBox({ t0: p.t, t1: p.t, f0: p.f, f1: p.f }) }
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return
    const p = toTF(e)
    const a = anchor.current
    if (!a) return
    setSelBox({ t0: Math.min(a.t, p.t), t1: Math.max(a.t, p.t), f0: Math.min(a.f, p.f), f1: Math.max(a.f, p.f) })
  }
  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current
    drag.current = null
    anchor.current = null
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) { const p = toTF(e); setSelBox(null); play(p.t, cur?.trim[1] ?? dur) }
  }

  const range: [number, number] = selBox && selBox.t1 - selBox.t0 > 0.02 ? [selBox.t0, selBox.t1] : (cur?.trim ?? [0, dur])
  const band: [number, number] = selBox && selBox.f1 - selBox.f0 > 100 ? [selBox.f0, selBox.f1] : [fMin, fMax]
  const syl = sp ? syllables(sp, band[0], band[1]).filter(([a, b]) => b > range[0] && a < range[1]) : []
  const pk = sp ? peakFreq(sp, range[0], range[1], band[0], band[1]) : null
  const wav = () => {
    if (!pcm || !cur) return
    const a = Math.floor(cur.trim[0] * pcm.rate), b = Math.ceil(cur.trim[1] * pcm.rate)
    download(`${cur.title.replace(/[^\w-]+/g, '_')}.wav`, new Blob([encodeWav([pcm.x.slice(a, b)], pcm.rate) as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }), 'audio/wav')
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Record">
          {!rec ? (
            <Row><Btn kind="primary" onClick={() => void startRec()}>⏺ Start recording</Btn></Row>
          ) : (
            <>
              <Row><Btn kind="danger" onClick={stopRec}>⏹ Stop & save</Btn><b style={{ alignSelf: 'center' }}>{fmtSec(rec.el)}</b></Row>
              <div style={{ height: 8, background: 'var(--line)', borderRadius: 4, margin: '6px 0' }}><div style={{ height: 8, borderRadius: 4, width: `${Math.min(100, rec.level * 100)}%`, background: rec.level > 0.95 ? 'var(--err)' : 'var(--ok)' }} /></div>
            </>
          )}
          <canvas ref={live} width={320} height={120} style={{ width: '100%', height: 120, background: '#000004', borderRadius: 8, display: rec ? 'block' : 'none' }} />
          <FileDrop accept="audio/*" onFiles={(f) => void saveBlob(f[0], false, f[0].name.replace(/\.[^.]+$/, ''))} label="…or import an audio file" />
          {err && <Note tone="err">{err}</Note>}
          <p className="muted" style={{ fontSize: 13 }}>Browser noise suppression and auto gain are switched off for natural sound. Point the phone towards the bird and keep still; recordings stay on this device.</p>
        </Panel>
        <Panel title={`Library (${s.recs.length})`} actions={<><JsonButtons name="bird-recordings.json" data={s} onLoad={(d) => Array.isArray(d.recs) && set(d)} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          {s.recs.map((r) => (
            <button key={r.id} type="button" onClick={() => { stop(); setSelBox(null); setView(null); set({ sel: r.id }) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 10, marginBottom: 6, borderRadius: 10, cursor: 'pointer', color: 'inherit', background: 'var(--panel2)', border: `2px solid ${r.id === cur?.id ? 'var(--accent)' : 'transparent'}` }}>
              <b>🐦 {r.title}</b>
              <div className="muted" style={{ fontSize: 13 }}>{r.at.replace('T', ' ')} · {fmtSec(r.dur)}{r.place ? ` · ${r.place}` : ''}{r.anns.length ? ` · ${r.anns.length} notes` : ''}</div>
            </button>
          ))}
          <p className="muted" style={{ fontSize: 12 }}>Backup saves the details and annotations; the audio itself stays in this browser. Use WAV export to keep sound files.</p>
        </Panel>
      </div>

      <div>
        {cur && (
          <>
            <Panel title="Spectrogram" actions={<><Seg value={speed} onChange={setSpeed} options={[['1', '1×'], ['0.5', '½× (octave lower)']]} /><Btn kind="primary" onClick={() => (playT !== null ? stop() : play(range[0], range[1]))}>{playT !== null ? '⏸ Stop' : selBox ? '▶ Play selection' : '▶ Play'}</Btn></>}>
              <canvas ref={cv} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} style={{ width: '100%', height: 300, display: 'block', borderRadius: 8, cursor: 'crosshair', touchAction: 'none' }} />
              <Row>
                <Slider label="Lowest frequency" value={fMin} min={0} max={8000} step={250} onChange={(v) => set({ fMin: Math.min(v, s.fMax - 500) })} show={(v) => `${num(v / 1000, 2)} kHz`} />
                <Slider label="Highest frequency" value={s.fMax} min={2000} max={Math.max(12000, nyq)} step={250} onChange={(v) => set({ fMax: Math.max(v, s.fMin + 500) })} show={(v) => `${num(v / 1000, 2)} kHz`} />
              </Row>
              <Row>
                <Select label="FFT size" value={s.fft} onChange={(fft) => set({ fft })} options={[[512, '512 (sharper in time)'], [1024, '1024'], [2048, '2048 (sharper in pitch)']]} />
                <Slider label="Contrast floor" value={s.floor} min={-120} max={-40} step={5} unit=" dB" onChange={(floor) => set({ floor })} />
              </Row>
              <Row>
                <Btn onClick={() => set({ fMin: 1000, fMax: 12000 })}>Birds 1–12 kHz</Btn>
                <Btn onClick={() => selBox && setView([selBox.t0, Math.max(selBox.t0 + 0.1, selBox.t1)])} disabled={!selBox}>Zoom to selection</Btn>
                <Btn kind="ghost" onClick={() => setView(null)} disabled={!view}>Whole recording</Btn>
              </Row>
              <p className="muted" style={{ fontSize: 13 }}>Drag on the spectrogram to select a call (time and frequency), click to play from a point. Half speed drops the pitch an octave, which makes fast trills easier to hear.</p>
            </Panel>
            <Stats>
              <Stat label={selBox ? 'Selection' : 'Trimmed length'} value={`${num(range[1] - range[0], 2)} s`} sub={`${fmtSec(range[0])} → ${fmtSec(range[1])}`} />
              <Stat label="Peak frequency" value={pk ? `${num(pk.f / 1000, 2)} kHz` : '—'} sub={`in ${num(band[0] / 1000, 1)}–${num(band[1] / 1000, 1)} kHz`} tone="accent" />
              <Stat label="Syllables" value={syl.length} sub={range[1] > range[0] ? `${num(syl.length / (range[1] - range[0]), 1)} per second` : undefined} />
            </Stats>
            {selBox && (
              <Panel title="Annotate selection">
                <Row>
                  <Txt label="Label" value={label} onChange={setLabel} placeholder="e.g. alarm call, song phrase, species guess" />
                </Row>
                <Row>
                  <Btn kind="primary" onClick={() => { edit({ anns: [...cur.anns, { id: uid(), ...selBox, label: label || 'Call' }].sort((a, b) => a.t0 - b.t0) }); setLabel(''); setSelBox(null) }}>+ Add annotation</Btn>
                  <Btn onClick={() => edit({ trim: [selBox.t0, selBox.t1] })}>Trim to selection</Btn>
                  <Btn kind="ghost" onClick={() => setSelBox(null)}>Clear</Btn>
                </Row>
              </Panel>
            )}
            <Panel title="Details" actions={<><Btn onClick={wav} disabled={!pcm}>⬇ WAV (trimmed)</Btn><CsvButton name="annotations.csv" rows={() => [['start_s', 'end_s', 'low_hz', 'high_hz', 'label'], ...cur.anns.map((a) => [num(a.t0, 3), num(a.t1, 3), Math.round(a.f0), Math.round(a.f1), a.label])]} />{cur.id !== 'demo' && <Btn kind="danger" onClick={() => { if (confirm('Delete this recording?')) { void idb('readwrite', (st) => st.delete(cur.id)); set((st) => ({ ...st, recs: st.recs.filter((r) => r.id !== cur.id), sel: st.recs.find((r) => r.id !== cur.id)?.id ?? '' })) } }}>Delete</Btn>}</>}>
              <Row>
                <Txt label="Title / species" value={cur.title} onChange={(title) => edit({ title })} />
                <Txt label="Date & time" type="datetime-local" value={cur.at} onChange={(at) => edit({ at })} />
              </Row>
              <Row>
                <Txt label="Location" value={cur.place} onChange={(place) => edit({ place })} placeholder="Habitat, landmark…" />
                <Btn onClick={() => navigator.geolocation?.getCurrentPosition((p) => edit({ lat: p.coords.latitude, lon: p.coords.longitude }), () => setErr('Location unavailable.'))}>📍 Use my location</Btn>
              </Row>
              {cur.lat !== undefined && <p className="muted" style={{ fontSize: 13 }}>GPS {num(cur.lat, 5)}, {num(cur.lon ?? 0, 5)}</p>}
              <Txt label="Notes" value={cur.notes} onChange={(notes) => edit({ notes })} placeholder="Weather, behaviour, what you saw…" />
              <Row>
                <label className="k-field"><span className="k-label">Trim start (s)</span><input className="k-text" type="number" step={0.05} min={0} value={num(cur.trim[0], 2)} onChange={(e) => edit({ trim: [Math.max(0, Math.min(Number(e.target.value) || 0, cur.trim[1] - 0.05)), cur.trim[1]] })} /></label>
                <label className="k-field"><span className="k-label">Trim end (s)</span><input className="k-text" type="number" step={0.05} value={num(cur.trim[1], 2)} onChange={(e) => edit({ trim: [cur.trim[0], Math.min(dur || cur.dur, Math.max(cur.trim[0] + 0.05, Number(e.target.value) || 0))] })} /></label>
                <Btn kind="ghost" onClick={() => edit({ trim: [0, dur || cur.dur] })}>Reset trim</Btn>
              </Row>
              {cur.anns.map((a) => (
                <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', borderTop: '1px solid var(--line)', fontSize: 14 }}>
                  <span style={{ color: '#06b6d4' }}>▭</span>
                  <input value={a.label} onChange={(e) => edit({ anns: cur.anns.map((x) => (x.id === a.id ? { ...x, label: e.target.value } : x)) })} style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, color: 'inherit', font: 'inherit' }} aria-label="Annotation label" />
                  <span className="muted">{num(a.t0, 2)}–{num(a.t1, 2)} s · {num(a.f0 / 1000, 1)}–{num(a.f1 / 1000, 1)} kHz</span>
                  <Btn kind="ghost" onClick={() => play(a.t0, a.t1)} title="Play">▶</Btn>
                  <Btn kind="ghost" onClick={() => edit({ anns: cur.anns.filter((x) => x.id !== a.id) })} title="Remove">✕</Btn>
                </div>
              ))}
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
