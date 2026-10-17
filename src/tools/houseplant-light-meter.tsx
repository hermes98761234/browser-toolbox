import { useEffect, useRef, useState } from 'react'
import { Btn, CsvButton, Note, Num, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { band, BANDS, dli, fit, frameLuminance, luxFromExposure, PLANTS, type Fit } from './lib/houseplant-light-meter'

type Source = 'demo' | 'camera' | 'sensor'
interface Reading { spot: string; lux: number; when: string; src: string }
interface State { k: number; hours: number; aperture: number; manualLux: number; spot: string; readings: Reading[] }

const DEF: State = {
  k: 4000,
  hours: 10,
  aperture: 1.8,
  manualLux: 3200,
  spot: 'Living room shelf',
  readings: [
    { spot: 'South window sill', lux: 24000, when: '2026-10-12 12:30', src: 'demo' },
    { spot: 'Desk, 2 m from window', lux: 2100, when: '2026-10-12 12:35', src: 'demo' },
    { spot: 'Hallway corner', lux: 180, when: '2026-10-12 12:40', src: 'demo' },
  ],
}

// Log-scale helpers for the 10 … 100 000 lux axis
const LMIN = 10
const LMAX = 100000
const pos = (lux: number) => (Math.log10(Math.min(LMAX, Math.max(LMIN, lux))) - 1) / 4
const FIT: Record<Fit, [string, string]> = { ideal: ['Ideal', 'var(--ok)'], ok: ['Tolerates', 'var(--accent)'], low: ['Too dark', 'var(--err)'], high: ['Too bright', 'var(--warn)'] }
const fmtLux = (x: number) => (x >= 10000 ? `${(x / 1000).toFixed(0)}k` : x >= 1000 ? `${(x / 1000).toFixed(1)}k` : `${Math.round(x)}`)

interface Sensor { illuminance: number | null; start: () => void; stop: () => void; addEventListener: (t: string, f: () => void) => void }

export default function HouseplantLightMeter() {
  const [s, set, reset] = useToolState('houseplant-light-meter', DEF)
  const [src, setSrc] = useState<Source>('demo')
  const [camLux, setCamLux] = useState<number | null>(null)
  const [camInfo, setCamInfo] = useState('')
  const [yLin, setYLin] = useState(0)
  const [clipped, setClipped] = useState(0)
  const [sensorLux, setSensorLux] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const [known, setKnown] = useState(500)
  const video = useRef<HTMLVideoElement>(null)
  const hasSensor = typeof window !== 'undefined' && 'AmbientLightSensor' in window
  const hasCam = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  // Camera loop
  useEffect(() => {
    if (src !== 'camera') return
    let stream: MediaStream | null = null
    let timer = 0
    let smooth: number | null = null
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 48
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        const v = video.current
        if (!v || !ctx) return
        v.srcObject = stream
        await v.play()
        const track = stream.getVideoTracks()[0]
        timer = window.setInterval(() => {
          ctx.drawImage(v, 0, 0, 64, 48)
          const f = frameLuminance(ctx.getImageData(0, 0, 64, 48).data)
          const st = track.getSettings() as MediaTrackSettings & { exposureTime?: number; iso?: number }
          // Image Capture spec: exposureTime is in units of 100 µs.
          const exp = st.exposureTime && st.iso ? luxFromExposure(s.aperture, st.exposureTime / 10000, st.iso, f.y) : null
          const raw = exp != null ? (exp * s.k) / 4000 : f.y * s.k
          smooth = smooth == null ? raw : smooth * 0.7 + raw * 0.3
          setYLin(f.y)
          setClipped(f.clipped)
          setCamLux(smooth)
          setCamInfo(exp != null ? `exposure-compensated (1/${Math.round(10000 / (st.exposureTime ?? 1))} s, ISO ${st.iso})` : 'brightness × calibration factor (camera hides its exposure)')
        }, 250)
      } catch (e) {
        setErr(`Camera unavailable: ${(e as Error).message}. Showing the demo instead.`)
        setSrc('demo')
      }
    })()
    return () => {
      clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [src, s.k, s.aperture])

  // Ambient light sensor
  useEffect(() => {
    if (src !== 'sensor' || !hasSensor) return
    try {
      const S = (window as unknown as { AmbientLightSensor: new (o: { frequency: number }) => Sensor }).AmbientLightSensor
      const sensor = new S({ frequency: 2 })
      sensor.addEventListener('reading', () => setSensorLux(sensor.illuminance))
      sensor.addEventListener('error', () => {
        setErr('The light sensor is blocked (permission or browser flag). Try the camera instead.')
        setSrc('demo')
      })
      sensor.start()
      return () => sensor.stop()
    } catch (e) {
      queueMicrotask(() => {
        setErr(`Light sensor failed: ${(e as Error).message}`)
        setSrc('demo')
      })
    }
  }, [src, hasSensor])

  const lux = src === 'camera' ? (camLux ?? 0) : src === 'sensor' ? (sensorLux ?? 0) : s.manualLux
  const b = band(lux)
  const d = dli(lux, s.hours)
  const save = () => set({ readings: [{ spot: s.spot || 'Spot', lux: Math.round(lux), when: new Date().toISOString().slice(0, 16).replace('T', ' '), src }, ...s.readings].slice(0, 50) })
  const calibrate = () => {
    if (camLux && camLux > 0 && known > 0) set({ k: Math.round((s.k * known) / camLux) })
  }
  const suits = PLANTS.map((p) => ({ p, f: fit(lux, p) }))

  return (
    <Split>
      <div>
        <Panel title="Measure">
          <Seg
            value={src}
            onChange={(v) => {
              setErr('')
              setSrc(v)
            }}
            options={[['demo', 'Manual / demo'], ...(hasCam ? [['camera', '📷 Camera'] as const] : []), ...(hasSensor ? [['sensor', '💡 Light sensor'] as const] : [])]}
          />
          {err && <Note tone="warn">{err}</Note>}
          {src === 'demo' && (
            <>
              <Slider label="Light level" value={Math.log10(Math.max(1, s.manualLux))} onChange={(v) => set({ manualLux: Math.round(10 ** v) })} min={1} max={5} step={0.01} show={(v) => `${Math.round(10 ** v).toLocaleString('en-US')}`} unit=" lux" />
              <p className="muted" style={{ fontSize: 13 }}>Drag to explore, or type a reading from a real lux meter. Use the camera {hasSensor ? 'or light sensor ' : ''}for a live estimate.</p>
            </>
          )}
          {src === 'camera' && (
            <>
              <video ref={video} playsInline muted style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 10, background: '#000' }} />
              <p className="muted" style={{ fontSize: 13 }}>
                Point the camera at the spot from where the plant's leaves would face (towards the light), or lay white paper in the spot and fill the frame with it. Method: {camInfo || 'starting…'}
              </p>
              {clipped > 0.25 && <Note tone="warn">{Math.round(clipped * 100)}% of the frame is blown out, so the real light is probably even brighter.</Note>}
              <Row>
                <Num label="Known lux right now" value={known} onChange={setKnown} min={1} hint="From a lux meter or a reference" />
                <div style={{ alignSelf: 'end' }}><Btn onClick={calibrate}>Calibrate</Btn></div>
              </Row>
              <Row>
                <Num label="Calibration factor" hint={`Frame brightness ${(yLin * 100).toFixed(1)}%`} value={s.k} onChange={(k) => set({ k: Math.max(1, k) })} min={1} />
                <Num label="Lens f-number" value={s.aperture} onChange={(aperture) => set({ aperture })} min={1} max={4} step={0.1} hint="Used only when exposure is exposed" />
              </Row>
            </>
          )}
          {src === 'sensor' && <p className="muted">Reading the device's ambient light sensor. Hold the phone where the plant sits, screen facing the window.</p>}
          <Note tone="warn">Phone readings are approximate. Cameras auto-adjust exposure and light sensors sit behind the screen glass, so expect ±50% or worse. Use readings to compare spots, not as lab values. Calibrating against a real lux meter once makes them far more useful.</Note>
        </Panel>
        <Panel title="Save this spot">
          <Row>
            <Txt label="Spot name" value={s.spot} onChange={(spot) => set({ spot })} />
            <div style={{ alignSelf: 'end' }}><Btn kind="primary" onClick={save}>Save reading</Btn></div>
          </Row>
          <Table head={['Spot', 'Lux', 'Level', 'When', '']} rows={s.readings.map((r, i) => [r.spot, Math.round(r.lux).toLocaleString('en-US'), <span key="b" style={{ color: band(r.lux).color, fontWeight: 700 }}>{band(r.lux).name}</span>, r.when.slice(5), <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ readings: s.readings.filter((_, j) => j !== i) })}>✕</Btn>])} max={10} />
          <Row>
            <CsvButton name="light-readings.csv" rows={() => [['Spot', 'Lux', 'Level', 'When', 'Source'], ...s.readings.map((r) => [r.spot, r.lux, band(r.lux).name, r.when, r.src])]} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Estimated light" value={`${Math.round(lux).toLocaleString('en-US')} lux`} sub={`≈ ${Math.round(lux / 10.76).toLocaleString('en-US')} foot-candles`} tone="accent" />
          <Stat label="Light level" value={<span style={{ color: b.color }}>{b.name}</span>} />
          <Stat label="Daily light integral" value={`${d.toFixed(1)} mol/m²/d`} sub={`if this lasts ${s.hours} h`} />
        </Stats>
        <Panel title="Where this sits">
          <div style={{ position: 'relative', height: 34, borderRadius: 8, overflow: 'hidden', display: 'flex' }}>
            {BANDS.map((x, i) => {
              const lo = i ? BANDS[i - 1].max : LMIN
              const hi = Math.min(x.max, LMAX)
              return <div key={x.name} title={x.name} style={{ width: `${(pos(hi) - pos(lo)) * 100}%`, background: x.color, opacity: 0.85 }} />
            })}
            <div style={{ position: 'absolute', left: `calc(${pos(lux) * 100}% - 2px)`, top: 0, bottom: 0, width: 4, background: 'var(--fg)', boxShadow: '0 0 0 2px var(--panel)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }} className="muted">
            {[10, 100, 1000, 10000, 100000].map((v) => <span key={v}>{fmtLux(v)}</span>)}
          </div>
          <p style={{ marginBottom: 0 }}><b style={{ color: b.color }}>{b.name}.</b> {b.tip}</p>
          <Slider label="Hours of this light per day" value={s.hours} onChange={(hours) => set({ hours })} min={2} max={16} unit=" h" show={(v) => String(v)} />
        </Panel>
        <Panel title="Plant suitability">
          {suits.map(({ p, f }) => (
            <div key={p[0]} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 160px) 1fr 82px', gap: 8, alignItems: 'center', padding: '3px 0' }}>
              <span style={{ fontSize: 14 }}>{p[0]}</span>
              <div style={{ position: 'relative', height: 12, boxShadow: 'inset 0 0 0 1px var(--line)', borderRadius: 6 }}>
                <div style={{ position: 'absolute', left: `${pos(p[1]) * 100}%`, width: `${(pos(p[3]) - pos(p[1])) * 100}%`, top: 3, height: 6, background: 'var(--line)', borderRadius: 3 }} />
                <div style={{ position: 'absolute', left: `${pos(p[2]) * 100}%`, width: `${(pos(p[3]) - pos(p[2])) * 100}%`, top: 0, height: 12, background: 'var(--ok)', opacity: 0.55, borderRadius: 6 }} />
                <div style={{ position: 'absolute', left: `calc(${pos(lux) * 100}% - 1px)`, top: -3, height: 18, width: 2, background: 'var(--fg)' }} />
              </div>
              <b style={{ color: FIT[f][1], fontSize: 13 }}>{FIT[f][0]}</b>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 13 }}>Green = ideal range, grey = survives. Light varies with season and time of day, so measure around midday and again on a cloudy day.</p>
        </Panel>
      </div>
    </Split>
  )
}
