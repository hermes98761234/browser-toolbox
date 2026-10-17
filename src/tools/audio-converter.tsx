import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { adtsHeader, concat, db, encodeWav, estimateBytes, gainFade, mixChannels, muxOggOpus, normGain, peak, slice, sniff, soundBounds, type Depth } from './lib/audio-converter'
import { fmtBytes, makeZip, uniqueNames } from './lib/image-compressor'

type Fmt = 'wav' | 'opus' | 'aac'
const DEF = {
  fmt: 'wav' as Fmt, depth: 16 as Depth, dither: true, kbps: 128, rate: 0, channels: 0,
  norm: 'off' as 'off' | 'peak' | 'rms', target: -1, trimSilence: false, threshold: -50, start: 0, end: 0, fadeIn: 0, fadeOut: 0,
}
type S = typeof DEF

interface Item {
  id: string; name: string; size: number; kind: string; rate: number; ch: Float32Array[]; src: string
  status: 'ready' | 'working' | 'done' | 'error'; out?: { url: string; name: string; size: number; blob: Blob }; err?: string
}

const FORMATS: { id: Fmt | 'mp3'; name: string; ext: string; note: string }[] = [
  { id: 'wav', name: 'WAV', ext: '.wav', note: 'Lossless PCM · 16/24-bit or 32-bit float' },
  { id: 'opus', name: 'Opus (Ogg)', ext: '.opus', note: 'Best lossy quality per bit · WebCodecs' },
  { id: 'aac', name: 'AAC (ADTS)', ext: '.aac', note: 'Plays on Apple devices & most players · WebCodecs' },
  { id: 'mp3', name: 'MP3', ext: '.mp3', note: 'Not available: browsers ship no MP3 encoder' },
]
const RATES = [8000, 11025, 16000, 22050, 24000, 32000, 44100, 48000, 88200, 96000]

const fmtDur = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`

/** Short stereo demo: soft chime arpeggio with silence at both ends (shows auto-trim). */
function demoItem(): Item {
  const rate = 44100, len = rate * 5
  const L = new Float32Array(len), R = new Float32Array(len)
  const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25]
  notes.forEach((f, k) => {
    const t0 = 0.7 + k * 0.5
    for (let i = Math.round(t0 * rate); i < Math.min(len - rate * 0.6, (t0 + 1.6) * rate); i++) {
      const t = i / rate - t0
      const v = 0.22 * Math.exp(-3 * t) * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t))
      const pan = k / (notes.length - 1)
      L[i] += v * (1 - pan * 0.7)
      R[i] += v * (0.3 + pan * 0.7)
    }
  })
  const src = URL.createObjectURL(new Blob([encodeWav([L, R], rate) as BlobPart], { type: 'audio/wav' }))
  return { id: uid(), name: 'demo-chime.wav', size: 44 + len * 4, kind: 'WAV (demo)', rate, ch: [L, R], src, status: 'ready' }
}

async function resample(ch: Float32Array[], from: number, to: number): Promise<Float32Array[]> {
  if (from === to || !ch[0]?.length) return ch
  const len = Math.max(1, Math.ceil((ch[0].length * to) / from))
  const oac = new OfflineAudioContext(ch.length, len, to)
  const buf = oac.createBuffer(ch.length, ch[0].length, from)
  ch.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i))
  const src = oac.createBufferSource()
  src.buffer = buf
  src.connect(oac.destination)
  src.start()
  const r = await oac.startRendering()
  return Array.from({ length: r.numberOfChannels }, (_, i) => r.getChannelData(i).slice())
}

async function webcodecs(ch: Float32Array[], rate: number, codec: string, kbps: number, aac: boolean) {
  const packets: Uint8Array[] = [], durs: number[] = []
  let desc: Uint8Array | undefined
  let fail: Error | null = null
  const enc = new AudioEncoder({
    output: (chunk, meta) => {
      const b = new Uint8Array(chunk.byteLength)
      chunk.copyTo(b)
      packets.push(b)
      durs.push(chunk.duration ?? 20000)
      const d = meta?.decoderConfig?.description
      if (d && !desc) desc = new Uint8Array(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d)
    },
    error: (e) => { fail = e as Error },
  })
  enc.configure({ codec, sampleRate: rate, numberOfChannels: ch.length, bitrate: kbps * 1000, ...(aac ? { aac: { format: 'aac' as const } } : {}) })
  const n = ch[0].length, block = 4800
  for (let i = 0; i < n; i += block) {
    const m = Math.min(block, n - i)
    const data = new Float32Array(m * ch.length)
    ch.forEach((c, k) => data.set(c.subarray(i, i + m), k * m))
    const ad = new AudioData({ format: 'f32-planar', sampleRate: rate, numberOfFrames: m, numberOfChannels: ch.length, timestamp: Math.round((i / rate) * 1e6), data })
    enc.encode(ad)
    ad.close()
    if (enc.encodeQueueSize > 20) await new Promise((r) => setTimeout(r, 0))
  }
  await enc.flush()
  enc.close()
  if (fail) throw fail
  return { packets, durs, desc }
}

async function convert(it: Item, s: S): Promise<{ data: Uint8Array; ext: string; mime: string }> {
  let ch = it.ch, rate = it.rate
  if (s.start > 0 || s.end > 0) ch = slice(ch, rate, s.start, s.end)
  if (s.trimSilence) { const [a, b] = soundBounds(ch, rate, s.threshold); ch = slice(ch, rate, Math.max(0, a - 0.02), b + 0.02) }
  if (!ch[0]?.length) throw new Error('Nothing left after trimming')
  const lossy = s.fmt !== 'wav'
  const nch = Math.min(lossy ? 2 : 8, s.channels || ch.length)
  ch = mixChannels(ch, nch).map((c) => c.slice())
  let to = s.rate || rate
  if (s.fmt === 'opus') to = 48000
  if (s.fmt === 'aac' && to !== 44100 && to !== 48000) to = 48000
  ch = await resample(ch, rate, to)
  rate = to
  const g = s.norm === 'off' ? 1 : normGain(ch, s.norm, s.target)
  gainFade(ch, rate, g, s.fadeIn, s.fadeOut)
  if (s.fmt === 'wav') return { data: encodeWav(ch, rate, s.depth, s.dither && s.depth === 16), ext: '.wav', mime: 'audio/wav' }
  if (s.fmt === 'opus') {
    const { packets, durs, desc } = await webcodecs(ch, 48000, 'opus', s.kbps, false)
    const head = desc && String.fromCharCode(...desc.subarray(0, 8)) === 'OpusHead' ? desc : undefined
    const preSkip = head ? head[10] | (head[11] << 8) : 312
    const data = muxOggOpus(packets, durs.map((d) => Math.round((d * 48000) / 1e6)), { channels: ch.length, preSkip, inputRate: it.rate, total: ch[0].length, head, tags: [`TITLE=${it.name.replace(/\.[^.]+$/, '')}`] })
    return { data, ext: '.opus', mime: 'audio/ogg' }
  }
  const { packets } = await webcodecs(ch, rate, 'mp4a.40.2', s.kbps, true)
  const frames = packets.map((p) => (p[0] === 0xff && (p[1] & 0xf6) === 0xf0 ? p : concat([adtsHeader(p.length, rate, ch.length), p])))
  return { data: concat(frames), ext: '.aac', mime: 'audio/aac' }
}

function Wave({ it, s }: { it: Item; s: S }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const dur = it.ch[0].length / it.rate
  const bounds = useMemo(() => soundBounds(it.ch, it.rate, s.threshold), [it, s.threshold])
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const W = (c.width = c.clientWidth * devicePixelRatio), H = (c.height = 120 * devicePixelRatio)
    const g = c.getContext('2d')!
    const css = getComputedStyle(c)
    g.clearRect(0, 0, W, H)
    let a = s.start, b = s.end > 0 ? Math.min(dur, s.end) : dur
    if (s.trimSilence) { a = Math.max(a, bounds[0]); b = Math.min(b, bounds[1]) }
    g.fillStyle = css.getPropertyValue('--line') || '#ddd'
    g.globalAlpha = 0.5
    g.fillRect(0, 0, (a / dur) * W, H)
    g.fillRect((b / dur) * W, 0, W, H)
    g.globalAlpha = 1
    g.fillStyle = css.getPropertyValue('--accent') || '#6366f1'
    const n = it.ch[0].length
    for (let x = 0; x < W; x++) {
      const i0 = Math.floor((x / W) * n), i1 = Math.max(i0 + 1, Math.floor(((x + 1) / W) * n))
      let mn = 0, mx = 0
      for (let i = i0; i < i1; i += Math.max(1, Math.floor((i1 - i0) / 200))) for (const ch of it.ch) { mn = Math.min(mn, ch[i]); mx = Math.max(mx, ch[i]) }
      g.fillRect(x, H / 2 - mx * H * 0.48, 1, Math.max(1, (mx - mn) * H * 0.48))
    }
  }, [it, s.start, s.end, s.trimSilence, bounds, dur])
  return <canvas ref={ref} style={{ width: '100%', height: 120, display: 'block', borderRadius: 8, background: 'var(--bg)' }} />
}

export default function AudioConverter() {
  const [s, set, reset] = useToolState('audio-converter', DEF)
  const [items, setItems] = useState<Item[]>(() => [demoItem()])
  const [sel, setSel] = useState(0)
  const [sup, setSup] = useState({ opus: false, aac: false, checked: false })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    void (async () => {
      const r = { opus: false, aac: false, checked: true }
      if (typeof AudioEncoder !== 'undefined') {
        try { r.opus = !!(await AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })).supported } catch { /* no */ }
        try { r.aac = !!(await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 })).supported } catch { /* no */ }
      }
      setSup(r)
    })()
  }, [])
  const ok = (f: Fmt | 'mp3') => f === 'wav' || (f === 'opus' && sup.opus) || (f === 'aac' && sup.aac)
  const fmt: Fmt = ok(s.fmt) ? s.fmt : 'wav'
  const cfg = { ...s, fmt }

  const add = async (files: File[]) => {
    setMsg('')
    for (const f of files) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer())
        const sn = sniff(bytes)
        const ctx = new OfflineAudioContext(1, 1, sn.rate && sn.rate >= 8000 && sn.rate <= 192000 ? sn.rate : 48000)
        const buf = await ctx.decodeAudioData(bytes.buffer.slice(0))
        const ch = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i).slice())
        const it: Item = { id: uid(), name: f.name, size: f.size, kind: sn.kind, rate: buf.sampleRate, ch, src: URL.createObjectURL(f), status: 'ready' }
        setItems((l) => [...l, it])
      } catch {
        setMsg(`Could not decode “${f.name}”: this browser does not support that format or the file is damaged.`)
      }
    }
  }
  const patch = (id: string, p: Partial<Item>) => setItems((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)))
  const run = async (list: Item[]) => {
    setBusy(true)
    for (const it of list) {
      patch(it.id, { status: 'working', err: undefined })
      try {
        const r = await convert(it, cfg)
        if (it.out) URL.revokeObjectURL(it.out.url)
        const blob = new Blob([r.data as BlobPart], { type: r.mime })
        patch(it.id, { status: 'done', out: { blob, url: URL.createObjectURL(blob), name: it.name.replace(/\.[^.]+$/, '') + r.ext, size: blob.size } })
      } catch (e) {
        patch(it.id, { status: 'error', err: (e as Error).message })
      }
    }
    setBusy(false)
  }
  const zipAll = async () => {
    const outs = items.filter((x) => x.out)
    const names = uniqueNames(outs.map((x) => x.out!.name))
    const files = await Promise.all(outs.map(async (x, i) => ({ name: names[i], data: new Uint8Array(await x.out!.blob.arrayBuffer()) })))
    download('converted-audio.zip', new Blob([makeZip(files) as BlobPart], { type: 'application/zip' }))
  }
  const cur = items[Math.min(sel, items.length - 1)]
  const done = items.filter((x) => x.out)
  const totalDur = items.reduce((a, x) => a + x.ch[0].length / x.rate, 0)
  const outRate = fmt === 'opus' ? 48000 : fmt === 'aac' && s.rate !== 44100 ? 48000 : s.rate || cur?.rate || 44100
  const est = items.reduce((a, x) => a + estimateBytes(fmt, x.ch[0].length / x.rate, fmt === 'wav' ? s.rate || x.rate : outRate, Math.min(fmt === 'wav' ? 8 : 2, s.channels || x.ch.length), s.depth, s.kbps), 0)
  const inSize = items.reduce((a, x) => a + x.size, 0)

  return (
    <Split>
      <div>
        <Panel title="Files" actions={<Btn kind="ghost" onClick={() => { setItems([demoItem()]); setSel(0) }}>Demo</Btn>}>
          <FileDrop accept="audio/*,.mp3,.wav,.ogg,.opus,.m4a,.aac,.flac,.webm" multiple onFiles={(f) => void add(f)} label="Drop audio files (MP3, WAV, OGG, M4A, FLAC…) or click" />
          {msg && <Note tone="err">{msg}</Note>}
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            {items.map((x, i) => (
              <div key={x.id} onClick={() => setSel(i)} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${i === sel ? 'var(--accent)' : 'var(--line)'}` }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</b>
                  <span className="muted" style={{ fontSize: 12 }}>{x.kind} · {num(x.rate / 1000, 2)} kHz · {x.ch.length === 1 ? 'mono' : x.ch.length === 2 ? 'stereo' : `${x.ch.length} ch`} · {fmtDur(x.ch[0].length / x.rate)} · {fmtBytes(x.size)}</span>
                </span>
                <span style={{ fontSize: 12, color: x.status === 'error' ? 'var(--err)' : x.status === 'done' ? 'var(--ok)' : 'var(--muted)' }}>{x.status === 'working' ? '⏳' : x.status === 'done' ? '✓' : x.status === 'error' ? '⚠' : ''}</span>
                <Btn kind="ghost" title="Remove" onClick={() => { setItems((l) => l.filter((y) => y.id !== x.id)); setSel(0) }}>✕</Btn>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Output format">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
            {FORMATS.map((f) => {
              const can = ok(f.id)
              return (
                <button key={f.id} type="button" disabled={!can} onClick={() => can && f.id !== 'mp3' && set({ fmt: f.id })} className="k-btn"
                  style={{ display: 'block', textAlign: 'left', whiteSpace: 'normal', height: 'auto', padding: 10, opacity: can ? 1 : 0.45, borderColor: fmt === f.id ? 'var(--accent)' : undefined, outline: fmt === f.id ? '2px solid var(--accent)' : undefined, cursor: can ? 'pointer' : 'not-allowed' }}>
                  <b>{f.name}</b> <span className="muted">{f.ext}</span>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{f.id !== 'wav' && f.id !== 'mp3' && sup.checked && !can ? 'Not supported by this browser' : f.note}</div>
                </button>
              )
            })}
          </div>
          {fmt === 'wav' ? (
            <Row>
              <Select label="Bit depth" value={s.depth} onChange={(depth) => set({ depth })} options={[[16, '16-bit PCM'], [24, '24-bit PCM'], [32, '32-bit float']]} />
              {s.depth === 16 && <Check label="TPDF dither" value={s.dither} onChange={(dither) => set({ dither })} />}
            </Row>
          ) : (
            <>
              <Select label="Bitrate" value={s.kbps} onChange={(kbps) => set({ kbps })} options={(fmt === 'opus' ? [24, 32, 48, 64, 96, 128, 160, 192, 256] : [64, 96, 128, 160, 192, 256, 320]).map((k) => [k, `${k} kbps${k === 32 ? ' · voice' : k === 128 ? ' · music' : k === 192 ? ' · high' : ''}`] as const)} />
              <p className="muted" style={{ fontSize: 13 }}>{fmt === 'opus' ? 'Opus always encodes at 48 kHz (players resample); the original rate is stored in the header. Max 2 channels.' : 'AAC-LC at 44.1 or 48 kHz, max 2 channels, written as a raw .aac (ADTS) stream.'}</p>
            </>
          )}
          <Note tone="warn">MP3 export is not offered: browsers include MP3 <i>decoders</i> but no encoder, and this tool does not ship a third-party one. MP3 files are fine as <b>input</b>.</Note>
        </Panel>
        <Panel title="Processing" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Select label="Sample rate" value={s.rate} onChange={(rate) => set({ rate })} options={[[0, 'Keep original'], ...RATES.map((r) => [r, `${num(r / 1000, 3)} kHz`] as const)]} />
            <Select label="Channels" value={s.channels} onChange={(channels) => set({ channels })} options={[[0, 'Keep'], [1, 'Mono (mix down)'], [2, 'Stereo']]} />
          </Row>
          <Row>
            <Select label="Normalize" value={s.norm} onChange={(norm) => set({ norm })} options={[['off', 'Off'], ['peak', 'Peak'], ['rms', 'RMS (loudness)']]} />
            {s.norm !== 'off' && <Slider label="Target" value={s.target} min={s.norm === 'peak' ? -12 : -30} max={0} step={0.5} unit=" dBFS" onChange={(target) => set({ target })} />}
          </Row>
          <Row>
            <Slider label="Trim start" value={s.start} min={0} max={30} step={0.1} unit=" s" onChange={(start) => set({ start })} />
            <Slider label="Trim end (0 = full)" value={s.end} min={0} max={600} step={0.5} unit=" s" onChange={(end) => set({ end })} />
          </Row>
          <Check label="Auto-trim leading/trailing silence" value={s.trimSilence} onChange={(trimSilence) => set({ trimSilence })} />
          {s.trimSilence && <Slider label="Silence threshold" value={s.threshold} min={-80} max={-20} unit=" dBFS" onChange={(threshold) => set({ threshold })} />}
          <Row>
            <Slider label="Fade in" value={s.fadeIn} min={0} max={5} step={0.1} unit=" s" onChange={(fadeIn) => set({ fadeIn })} />
            <Slider label="Fade out" value={s.fadeOut} min={0} max={5} step={0.1} unit=" s" onChange={(fadeOut) => set({ fadeOut })} />
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Files" value={items.length} sub={`${fmtDur(totalDur)} total`} />
          <Stat label="Input size" value={fmtBytes(inSize)} />
          <Stat label="Est. output" value={fmtBytes(est)} sub={inSize ? `${num((est / inSize) * 100, 0)}% of input` : ''} tone="accent" />
          <Stat label="Converted" value={`${done.length} / ${items.length}`} tone={done.length === items.length && items.length ? 'good' : undefined} />
        </Stats>
        <Panel title="Convert" actions={<>
          <Btn kind="primary" disabled={busy || !items.length} onClick={() => void run(items)}>{busy ? 'Converting…' : `▶ Convert all to ${FORMATS.find((f) => f.id === fmt)!.name}`}</Btn>
          <Btn disabled={done.length < 2} onClick={() => void zipAll()}>⬇ ZIP ({done.length})</Btn>
        </>}>
          <Table
            head={['File', 'Status', 'Output', '']}
            rows={items.map((x) => [
              x.name,
              x.status === 'error' ? <span key="e" style={{ color: 'var(--err)' }}>{x.err}</span> : x.status,
              x.out ? `${x.out.name} · ${fmtBytes(x.out.size)}` : '—',
              x.out ? <Btn key="d" onClick={() => download(x.out!.name, x.out!.blob)}>⬇</Btn> : <Btn key="c" kind="ghost" disabled={busy} onClick={() => void run([x])}>Convert</Btn>,
            ])}
          />
        </Panel>
        {cur && (
          <Panel title={`Preview · ${cur.name}`}>
            <Wave it={cur} s={s} />
            <p className="muted" style={{ fontSize: 13 }}>Shaded areas are cut by the trim settings. Peak {num(db(peak(cur.ch)), 1)} dBFS.</p>
            <div className="k-label">Original</div>
            <audio controls src={cur.src} style={{ width: '100%' }} />
            {cur.out && (
              <>
                <div className="k-label">Converted ({cur.out.name}, {fmtBytes(cur.out.size)})</div>
                <audio controls src={cur.out.url} style={{ width: '100%' }} />
              </>
            )}
          </Panel>
        )}
        <Note>Everything runs locally: files are decoded with the Web Audio API, resampled with an OfflineAudioContext and encoded by this page (WAV) or the browser's WebCodecs encoder (Opus, AAC). Nothing is uploaded.</Note>
      </div>
    </Split>
  )
}
