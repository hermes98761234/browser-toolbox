import { useMemo, useState } from 'react'
import { Bar, BarChart, Btn, CopyButton, FileDrop, Note, num, Panel, pct, Row, Seg, Select, Split, Stat, Stats, Table, useToolState } from '../kit'
import { encodeWav } from './lib/audio-trimmer'
import { analyze, camelot, DEMOS, keyName, NOTES, scaleNotes, synthProgression, type Analysis, type ProfileId } from './lib/key-detector'

const SR = 22050
const MAX_SEC = 480

interface Track {
  name: string
  mono: Float32Array
  url: string
  demoKey?: string
}

async function decode(file: File): Promise<Float32Array> {
  const ac = new AudioContext()
  try {
    const buf = await ac.decodeAudioData(await file.arrayBuffer())
    const dur = Math.min(buf.duration, MAX_SEC)
    const off = new OfflineAudioContext(1, Math.ceil(dur * SR), SR) // resample + downmix
    const src = off.createBufferSource()
    src.buffer = buf
    src.connect(off.destination)
    src.start()
    return (await off.startRendering()).getChannelData(0)
  } finally {
    void ac.close()
  }
}

function demoTrack(i: number): Track {
  const d = DEMOS[i]
  const mono = synthProgression(d.chords, SR, d.bpm, d.name.includes('432') ? 432 : 440)
  const wav = encodeWav([mono], SR)
  return { name: d.name, mono, url: URL.createObjectURL(new Blob([wav.slice().buffer as ArrayBuffer], { type: 'audio/wav' })), demoKey: d.key }
}

const KEY_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#10b981', '#14b8a6', '#0ea5e9', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899']
const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function KeyDetector() {
  const [s, set] = useToolState('key-detector', { profile: 'both' as ProfileId, demo: 0 })
  const [track, setTrack] = useState<Track>(() => demoTrack(0))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const a: Analysis = useMemo(() => analyze(track.mono, SR, s.profile), [track, s.profile])
  const replace = (t: Track) => {
    URL.revokeObjectURL(track.url)
    setTrack(t)
  }

  const onFile = async (f: File) => {
    setBusy(true)
    setErr('')
    try {
      const mono = await decode(f)
      replace({ name: f.name, mono, url: URL.createObjectURL(f) })
    } catch {
      setErr(`Could not decode “${f.name}”. Try WAV, MP3, OGG, M4A or FLAC.`)
    } finally {
      setBusy(false)
    }
  }

  const best = a.ranked[0]
  const rel = { tonic: best.minor ? (best.tonic + 3) % 12 : (best.tonic + 9) % 12, minor: !best.minor }
  const par = { tonic: best.tonic, minor: !best.minor }
  const dom = { tonic: (best.tonic + 7) % 12, minor: best.minor }
  const sub = { tonic: (best.tonic + 5) % 12, minor: best.minor }
  const conf = a.conf[0]
  const scalePcs = (best.minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).map((x) => (x + best.tonic) % 12)
  const a4 = 440 * Math.pow(2, a.tuning / 1200)
  const summary = `${track.name}: ${best.name} (${camelot(best)}), confidence ${pct(conf, 0)}, tuning A4 ≈ ${num(a4, 1)} Hz`

  return (
    <Split wide="right">
      <div>
        <Panel title="Audio">
          <FileDrop accept="audio/*" onFiles={(f) => void onFile(f[0])} label="Drop a song (MP3, WAV, OGG, M4A, FLAC)" />
          {busy && <Note>Decoding and analysing…</Note>}
          {err && <Note tone="err">{err}</Note>}
          <p className="muted" style={{ fontSize: 13, margin: '12px 0 6px' }}>Or try a synthetic demo generated in your browser</p>
          <Select label="Demo progression" value={s.demo} onChange={(demo) => set({ demo })} options={DEMOS.map((d, i) => [i, d.name] as const)} />
          <Row>
            <Btn kind="primary" onClick={() => replace(demoTrack(s.demo))}>Load demo</Btn>
          </Row>
          <div style={{ marginTop: 10 }}>
            <b style={{ fontSize: 14, wordBreak: 'break-word' }}>{track.name}</b>
            <span className="muted" style={{ fontSize: 13 }}> · {fmtT(track.mono.length / SR)}{track.mono.length / SR >= MAX_SEC - 1 ? ` (first ${MAX_SEC / 60} min analysed)` : ''}</span>
            <audio controls src={track.url} style={{ width: '100%', marginTop: 8 }} />
          </div>
          {track.demoKey && <Note tone={track.demoKey === best.name ? 'ok' : 'warn'}>Ground truth: <b>{track.demoKey}</b> — detector says <b>{best.name}</b>.</Note>}
        </Panel>
        <Panel title="Key profile">
          <Seg value={s.profile} onChange={(profile) => set({ profile })} options={[['both', 'Both (avg)'], ['kk', 'Krumhansl'], ['temperley', 'Temperley']]} />
          <p className="muted" style={{ fontSize: 13 }}>
            The pitch-class profile of the audio is correlated (Pearson r) with each key profile rotated to all 12 tonics, major and minor. Krumhansl–Kessler comes from listener ratings; Temperley's from note counts in a textbook corpus and is stricter about chromatic notes.
          </p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Estimated key" value={best.name} sub={`Camelot ${camelot(best)}`} tone="accent" />
          <Stat label="Confidence" value={pct(conf, 0)} sub={`r = ${num(best.r, 3)} · runner-up ${a.ranked[1].name}`} tone={conf > 0.5 ? 'good' : conf < 0.25 ? 'bad' : undefined} />
          <Stat label="Tuning" value={`${a.tuning >= 0 ? '+' : ''}${num(a.tuning, 1)} ¢`} sub={`A4 ≈ ${num(a4, 1)} Hz`} />
        </Stats>
        <Panel title="Pitch-class profile (chroma)" actions={<CopyButton text={summary} label="Copy result" />}>
          <BarChart bars={a.chroma.map((v, i) => ({ label: NOTES[i], value: v, color: scalePcs.includes(i) ? 'var(--accent)' : '#94a3b8' }))} fy={(v) => num(v, 2)} height={200} />
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>Highlighted bars belong to the detected key's scale. Tuning offset is compensated before folding into 12 bins.</p>
        </Panel>
        <Panel title="Top candidates">
          <Table
            head={['#', 'Key', 'Camelot', 'r', 'Confidence']}
            rows={a.ranked.slice(0, 6).map((k, i) => [i + 1, <b key="k">{k.name}</b>, camelot(k), num(k.r, 3), <span key="c" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Bar value={a.conf[i]} /> {pct(a.conf[i], 0)}</span>])}
          />
          {a.ranked[1].tonic === rel.tonic && a.ranked[1].minor === rel.minor && <Note>The runner-up is the relative key — they share all seven notes, so the tonal centre decides. Listen for which chord feels like “home”.</Note>}
        </Panel>
        <Panel title="Related keys">
          <Table
            head={['Relation', 'Key', 'Camelot', 'Scale']}
            rows={[
              ['Detected', best.name, camelot(best), scaleNotes(best).join(' ')],
              ['Relative', keyName(rel), camelot(rel), scaleNotes(rel).join(' ')],
              ['Parallel', keyName(par), camelot(par), scaleNotes(par).join(' ')],
              ['Dominant', keyName(dom), camelot(dom), 'harmonic mixing: +1 on the wheel'],
              ['Subdominant', keyName(sub), camelot(sub), 'harmonic mixing: −1 on the wheel'],
            ]}
          />
        </Panel>
        {a.timeline.length > 1 && (
          <Panel title="Key over time (10 s windows)">
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
              {a.timeline.map((seg, i) => (
                <div key={i} title={`${fmtT(seg.t0)}–${fmtT(seg.t1)}: ${seg.key.name}`} style={{ flex: seg.t1 - seg.t0, background: KEY_COLORS[(seg.key.tonic * 7) % 12], opacity: seg.key.minor ? 0.7 : 1, color: '#fff', fontSize: 11, padding: '8px 2px', textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {camelot(seg.key)}
                </div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12 }}>Colours follow the circle of fifths. Short windows are noisier than the whole-song estimate; a lasting change suggests a modulation.</p>
          </Panel>
        )}
      </div>
    </Split>
  )
}
