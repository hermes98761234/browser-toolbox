import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, LineChart, Note, num, Panel, Row, Select, Slider, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { encodeWav, muxOggOpus } from './lib/audio-converter'
import { fmtBytes, makeZip, uniqueNames } from './lib/image-compressor'
import { albumLoudness, PRESETS, type Measure, type NormOptions, type NormResult } from './lib/loudness-normalizer'

type Fmt = 'wav16' | 'wav24' | 'opus'
interface S { preset: string; target: number; ceiling: number; mode: 'limit' | 'reduce' | 'off'; album: boolean; fmt: Fmt; kbps: number; sel: number }
const DEF: S = { preset: 'stream', target: -14, ceiling: -1, mode: 'limit', album: false, fmt: 'wav16', kbps: 160, sel: 0 }

interface Item { id: string; name: string; fs: number; ch: Float32Array[]; before?: Measure; after?: Measure; res?: Omit<NormResult, 'out'>; out?: Float32Array[]; url?: string; status: string }

// ---------- demo signals ----------
function rng(seed: number) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5 }
function demoItems(): Item[] {
  const fs = 48000
  const mk = (name: string, sec: number, chs: number, f: (t: number, i: number, r: () => number) => number[]): Item => {
    const n = fs * sec, ch = Array.from({ length: chs }, () => new Float32Array(n)), r = rng(name.length * 31)
    for (let i = 0; i < n; i++) { const v = f(i / fs, i, r); for (let c = 0; c < chs; c++) ch[c][i] = v[c] ?? v[0] }
    return { id: uid(), name, fs, ch, status: 'demo' }
  }
  // quiet voice memo: band-limited noise "syllables" with pitch buzz, pauses
  let lp = 0, bp = 0
  const voice = mk('voice-memo-quiet.wav', 12, 1, (t, _i, r) => {
    const syl = Math.max(0, Math.sin(t * Math.PI * 4.2)) ** 2 * (Math.sin(t * 0.9) > -0.6 ? 1 : 0.05)
    const buzz = Math.sin(2 * Math.PI * (130 + 20 * Math.sin(t * 3)) * t) * 0.6 + Math.sin(2 * Math.PI * 260 * t) * 0.3
    lp += 0.25 * (r() - lp); bp = lp - bp * 0.2
    return [0.12 * syl * (buzz + bp * 1.5)]
  })
  // hot EDM loop: kick, bass, hats, already loud with near-clipping peaks
  const edm = mk('edm-loop-hot.wav', 10, 2, (t, _i, r) => {
    const beat = t % 0.5, kick = Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-beat * 30)) * beat) * Math.exp(-beat * 9)
    const bass = Math.tanh(3 * Math.sin(2 * Math.PI * 55 * t)) * 0.35 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 2 * t))
    const hb = (t + 0.25) % 0.25, hat = r() * Math.exp(-hb * 60) * 0.5
    const pad = 0.12 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277.2 * t) + Math.sin(2 * Math.PI * 329.6 * t))
    return [Math.tanh(1.6 * (kick * 0.9 + bass + hat + pad)) * 0.98, Math.tanh(1.6 * (kick * 0.9 + bass + hat * 0.6 + pad * 1.1)) * 0.98]
  })
  // dynamic podcast: quiet host, loud jingle
  const pod = mk('podcast-dynamic.wav', 14, 2, (t, _i, r) => {
    const loud = t > 5 && t < 8
    const s = loud ? 0.5 * Math.sin(2 * Math.PI * 440 * t) * Math.sin(2 * Math.PI * 3 * t) ** 2 + 0.3 * Math.sin(2 * Math.PI * 660 * t) : 0.06 * Math.max(0, Math.sin(t * Math.PI * 3.7)) * (Math.sin(2 * Math.PI * 180 * t) + r() * 0.8)
    return [s, s * 0.95]
  })
  // EBU reference: 1 kHz −23 dBFS stereo sine must read −23.0 LUFS
  const ref = mk('ebu-reference-1kHz-23dBFS.wav', 8, 2, (t) => [10 ** (-23 / 20) * Math.sin(2 * Math.PI * 1000 * t)])
  return [voice, edm, pod, ref]
}

// ---------- encoding ----------
async function resample(ch: Float32Array[], from: number, to: number): Promise<Float32Array[]> {
  if (from === to) return ch
  const oac = new OfflineAudioContext(ch.length, Math.ceil((ch[0].length * to) / from), to)
  const buf = oac.createBuffer(ch.length, ch[0].length, from)
  ch.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i))
  const src = oac.createBufferSource()
  src.buffer = buf
  src.connect(oac.destination)
  src.start()
  const r = await oac.startRendering()
  return Array.from({ length: r.numberOfChannels }, (_, i) => r.getChannelData(i).slice())
}
async function encodeOpus(ch0: Float32Array[], fs: number, kbps: number, title: string): Promise<Uint8Array> {
  const ch = await resample(ch0.slice(0, 2), fs, 48000)
  const packets: Uint8Array[] = [], durs: number[] = []
  let desc: Uint8Array | undefined, fail: Error | null = null
  const enc = new AudioEncoder({
    output: (chunk, meta) => {
      const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); packets.push(b); durs.push(chunk.duration ?? 20000)
      const d = meta?.decoderConfig?.description
      if (d && !desc) desc = new Uint8Array(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d)
    },
    error: (e) => { fail = e as Error },
  })
  enc.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: ch.length, bitrate: kbps * 1000 })
  const n = ch[0].length
  for (let i = 0; i < n; i += 4800) {
    const m = Math.min(4800, n - i), data = new Float32Array(m * ch.length)
    ch.forEach((c, k) => data.set(c.subarray(i, i + m), k * m))
    const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: m, numberOfChannels: ch.length, timestamp: Math.round((i / 48000) * 1e6), data })
    enc.encode(ad); ad.close()
    if (enc.encodeQueueSize > 20) await new Promise((r) => setTimeout(r, 0))
  }
  await enc.flush(); enc.close()
  if (fail) throw fail
  const head = desc && String.fromCharCode(...desc.subarray(0, 8)) === 'OpusHead' ? desc : undefined
  return muxOggOpus(packets, durs.map((d) => Math.round((d * 48000) / 1e6)), { channels: ch.length, preSkip: head ? head[10] | (head[11] << 8) : 312, inputRate: fs, total: n, head, tags: [`TITLE=${title}`] })
}

const DEMO = /^(voice-memo-quiet|edm-loop-hot|podcast-dynamic|ebu-reference-1kHz-23dBFS)\.wav$/
const f1 = (v: number | undefined, unit = '') => (v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(1)}${unit}`)
const sgn = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(1)

export default function LoudnessNormalizer() {
  const [s, set, reset] = useToolState('loudness-normalizer', DEF)
  const [items, setItems] = useState<Item[]>(demoItems)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [opus, setOpus] = useState(false)
  const worker = useRef<Worker | null>(null)
  const pending = useRef(new Map<number, (d: unknown) => void>())
  const seq = useRef(0)
  const first = useRef(true)

  useEffect(() => {
    const w = new Worker(new URL('./lib/loudness-normalizer.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ id: number }>) => { pending.current.get(e.data.id)?.(e.data); pending.current.delete(e.data.id) }
    worker.current = w
    if (typeof AudioEncoder !== 'undefined') void AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 }).then((r) => setOpus(!!r.supported)).catch(() => {})
    return () => w.terminate()
  }, [])
  const call = <T,>(msg: object, transfer: Transferable[] = []) => new Promise<T>((res, rej) => {
    const id = ++seq.current
    pending.current.set(id, (d) => { const r = d as { ok: boolean; msg?: string }; if (r.ok) res(d as T); else rej(new Error(r.msg)) })
    worker.current!.postMessage({ id, ...msg }, transfer)
  })
  const copy = (ch: Float32Array[]) => ch.map((c) => c.slice())

  // measure anything not yet measured
  useEffect(() => {
    const todo = items.filter((it) => !it.before && it.status !== 'measuring')
    if (!todo.length || !worker.current) return
    setItems((l) => l.map((it) => (todo.includes(it) ? { ...it, status: 'measuring' } : it)))
    void (async () => {
      for (const it of todo) {
        const c = copy(it.ch)
        try {
          const { m } = await call<{ m: Measure }>({ type: 'measure', ch: c, fs: it.fs }, c.map((x) => x.buffer))
          setItems((l) => l.map((x) => (x.id === it.id ? { ...x, before: m, status: 'measured' } : x)))
        } catch (e) { setItems((l) => l.map((x) => (x.id === it.id ? { ...x, status: 'error: ' + (e as Error).message } : x))) }
      }
    })()
  }, [items])

  const measured = items.filter((it) => it.before)
  const album = useMemo(() => (measured.length ? albumLoudness(measured.map((it) => it.before!)) : -Infinity), [measured])
  const allMeasured = items.length > 0 && measured.length === items.length

  const run = async () => {
    setBusy('Normalising…'); setErr('')
    const opts: NormOptions = { target: s.target, ceiling: s.ceiling, mode: s.mode }
    const albumGain = s.album && Number.isFinite(album) ? s.target - album : undefined
    for (const it of items) {
      if (!it.before) continue
      setBusy(`Normalising ${it.name}…`)
      const c = copy(it.ch)
      try {
        const { r, after } = await call<{ r: NormResult; after: Measure }>({ type: 'normalize', ch: c, fs: it.fs, m: it.before, o: { ...opts, gainOverride: albumGain } }, c.map((x) => x.buffer))
        const url = URL.createObjectURL(new Blob([encodeWav(r.out, it.fs, 16) as BlobPart], { type: 'audio/wav' }))
        setItems((l) => l.map((x) => { if (x.id !== it.id) return x; if (x.url) URL.revokeObjectURL(x.url); return { ...x, after, out: r.out, url, res: { gain: r.gain, limited: r.limited, capped: r.capped }, status: 'done' } }))
      } catch (e) { setErr(`${it.name}: ${(e as Error).message}`) }
    }
    setBusy('')
  }
  useEffect(() => {
    if (first.current && allMeasured) { first.current = false; void run() }
  })

  const addFiles = async (files: File[]) => {
    setErr('')
    const ctx = new AudioContext()
    const added: Item[] = []
    for (const f of files) {
      try {
        const buf = await ctx.decodeAudioData(await f.arrayBuffer())
        added.push({ id: uid(), name: f.name, fs: buf.sampleRate, ch: Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i).slice()), status: 'new' })
      } catch { setErr(`Could not decode ${f.name} (unsupported format).`) }
    }
    void ctx.close()
    setItems((l) => [...l.filter((x) => !DEMO.test(x.name)), ...added])
  }

  const encode = async (it: Item) => {
    const base = it.name.replace(/\.[^.]+$/, '') + `_${s.target}LUFS`
    if (s.fmt === 'opus') return { name: base + '.opus', data: await encodeOpus(it.out!, it.fs, s.kbps, base) }
    return { name: base + '.wav', data: encodeWav(it.out!, it.fs, s.fmt === 'wav24' ? 24 : 16, s.fmt === 'wav16') }
  }
  const dlOne = async (it: Item) => { const f = await encode(it); download(f.name, new Blob([f.data as BlobPart], { type: s.fmt === 'opus' ? 'audio/ogg' : 'audio/wav' })) }
  const dlAll = async () => {
    setBusy('Encoding…')
    try {
      const files = [] as { name: string; data: Uint8Array }[]
      for (const it of items.filter((x) => x.out)) files.push(await encode(it))
      const names = uniqueNames(files.map((f) => f.name))
      const zip = makeZip(files.map((f, i) => ({ name: names[i], data: f.data })))
      download(`normalized_${s.target}LUFS.zip`, new Blob([zip as BlobPart], { type: 'application/zip' }))
    } catch (e) { setErr((e as Error).message) }
    setBusy('')
  }

  const sel = items[Math.min(s.sel, items.length - 1)]
  const curve = (m: Measure | undefined) => (m ? m.curve.map((v, i) => [1.5 + i * 0.5, Math.max(-60, v)] as [number, number]).filter(([, v]) => Number.isFinite(v)) : [])
  const done = items.filter((it) => it.after)

  return (
    <Split wide="right">
      <div>
        <Panel title="Target">
          <Select label="Preset" value={s.preset} onChange={(preset) => { const p = PRESETS.find((x) => x.id === preset); set(p ? { preset, target: p.target, ceiling: p.ceiling } : { preset }) }} options={[...PRESETS.map((p) => [p.id, p.label] as [string, string]), ['custom', 'Custom']]} />
          <Slider label="Integrated loudness" value={s.target} onChange={(target) => set({ target, preset: 'custom' })} min={-36} max={-6} step={0.5} unit=" LUFS" show={(v) => v.toFixed(1)} />
          <Slider label="True-peak ceiling" value={s.ceiling} onChange={(ceiling) => set({ ceiling, preset: 'custom' })} min={-6} max={0} step={0.1} unit=" dBTP" show={(v) => v.toFixed(1)} />
          <Select label="When the gain would exceed the ceiling" value={s.mode} onChange={(mode) => set({ mode })} options={[['limit', 'Apply true-peak limiter (hit target)'], ['reduce', 'Reduce gain (never limit)'], ['off', 'Ignore ceiling (may clip)']] as const} />
          <Check label={<>Album mode — one gain for all files (album loudness {f1(album, ' LUFS')})</>} value={s.album} onChange={(album) => set({ album })} />
          <Row>
            <Btn kind="primary" disabled={!!busy || !allMeasured} onClick={() => void run()}>{busy || '▶ Normalise all'}</Btn>
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
          {err && <Note tone="err">{err}</Note>}
        </Panel>
        <Panel title="Files">
          <FileDrop accept="audio/*,video/*" multiple onFiles={(f) => void addFiles(f)} label="Drop audio files (WAV, MP3, FLAC, OGG, M4A…)" />
          <Row>
            <Btn onClick={() => setItems(demoItems())}>Load demo set</Btn>
            <Btn kind="ghost" onClick={() => setItems([])}>Clear</Btn>
          </Row>
          <Select label="Output format" value={s.fmt} onChange={(fmt) => set({ fmt })} options={[['wav16', 'WAV 16-bit (dithered)'], ['wav24', 'WAV 24-bit'], ...(opus ? [['opus', 'Opus (Ogg)'] as [Fmt, string]] : [])] as [Fmt, string][]} />
          {s.fmt === 'opus' && <Slider label="Opus bitrate" value={s.kbps} onChange={(kbps) => set({ kbps })} min={48} max={256} step={16} unit=" kbps" show={(v) => String(v)} />}
          <Btn disabled={!done.length || !!busy} onClick={() => void dlAll()}>⬇ Download all ({done.length}) as ZIP</Btn>
        </Panel>
        <Note>
          Measurement follows ITU-R BS.1770-4 / EBU R128: K-weighting, 400 ms blocks with 75 % overlap, −70 LUFS absolute and −10 LU relative gates; LRA per EBU Tech 3342 (3 s short-term, −20 LU gate, 10th–95th percentile); true peak via 4× oversampling. The bundled 1 kHz −23 dBFS reference must read −23.0 LUFS.
        </Note>
      </div>

      <div>
        <Stats>
          <Stat label="Files" value={items.length} sub={`${done.length} normalised`} />
          <Stat label="Target" value={`${s.target.toFixed(1)} LUFS`} sub={`ceiling ${s.ceiling.toFixed(1)} dBTP`} tone="accent" />
          <Stat label="Album loudness" value={f1(album, ' LUFS')} sub={s.album ? `gain ${Number.isFinite(album) ? sgn(s.target - album) : '—'} dB` : 'per-file gain'} />
          <Stat label="Max spread after" value={done.length ? `${(Math.max(...done.map((d) => d.after!.integrated)) - Math.min(...done.map((d) => d.after!.integrated))).toFixed(1)} LU` : '—'} sub={done.length ? `before ${(Math.max(...done.map((d) => d.before!.integrated)) - Math.min(...done.map((d) => d.before!.integrated))).toFixed(1)} LU` : ''} tone="good" />
        </Stats>
        <Panel title="Before → after">
          <Table
            head={['File', 'Integrated', 'True peak', 'LRA', 'Gain', 'Limiter', '']}
            rows={items.map((it, i) => [
              <div key="n" style={{ minWidth: 150 }}>
                <a href="#" onClick={(e) => { e.preventDefault(); set({ sel: i }) }} style={{ fontWeight: i === s.sel ? 700 : 500, wordBreak: 'break-all' }}>{it.name}</a>
                <div className="muted" style={{ fontSize: 12 }}>{it.before ? `${num(it.before.duration, 1)} s · ${it.fs / 1000} kHz · ${it.ch.length} ch` : it.status}</div>
              </div>,
              <span key="i">{f1(it.before?.integrated)} → <b>{f1(it.after?.integrated)}</b></span>,
              <span key="t" style={{ color: it.before && it.before.truePeak > s.ceiling ? 'var(--warn)' : undefined }}>{f1(it.before?.truePeak)} → <b>{f1(it.after?.truePeak)}</b></span>,
              <span key="l" title={it.before ? `max momentary ${f1(it.before.momentaryMax)} · max short-term ${f1(it.before.shortTermMax)} LUFS` : ''}>{f1(it.before?.lra, ' LU')}</span>,
              it.res ? `${sgn(it.res.gain)} dB${it.res.capped ? ' (capped)' : ''}` : '—',
              it.res ? (it.res.limited > 0.05 ? `−${it.res.limited.toFixed(1)} dB` : 'none') : '—',
              <span key="d" style={{ display: 'flex', gap: 4 }}>
                {it.url && <Btn kind="ghost" title="Download" onClick={() => void dlOne(it)}>⬇</Btn>}
                <Btn kind="ghost" title="Remove" onClick={() => setItems((l) => l.filter((x) => x.id !== it.id))}>✕</Btn>
              </span>,
            ])}
          />
        </Panel>
        {sel && (
          <Panel title={`Short-term loudness — ${sel.name}`}>
            <LineChart
              series={[
                { name: 'Before', points: curve(sel.before), color: '#94a3b8' },
                { name: 'After', points: curve(sel.after), color: 'var(--accent)' },
                ...(sel.before ? [{ name: 'Target', points: [[0, s.target], [sel.before.duration, s.target]] as [number, number][], color: '#10b981', dashed: true }] : []),
              ]}
              height={220}
              xLabel="time (s)"
              yLabel="LUFS (3 s)"
              fx={(v) => num(v, 1)}
              fy={(v) => num(v, 0)}
              yMin={-60}
            />
            {sel.url && <audio controls src={sel.url} style={{ width: '100%', marginTop: 8 }} />}
            {sel.out && <p className="muted" style={{ fontSize: 13 }}>Preview is the normalised result (16-bit WAV, {fmtBytes(sel.out[0].length * sel.out.length * 2)}).</p>}
          </Panel>
        )}
      </div>
    </Split>
  )
}
