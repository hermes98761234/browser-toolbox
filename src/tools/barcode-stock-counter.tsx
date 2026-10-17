import { useEffect, useRef, useState } from 'react'
import { Btn, Check, CsvButton, FileDrop, JsonButtons, Note, Num, Panel, Row, Split, Stat, Stats, Table, useToolState } from '../kit'
import { decodeImage, encode, validGtin } from './lib/barcode-stock-counter'

interface Item { code: string; name: string; qty: number; expected: number | null; updated: number }
interface State { items: Item[]; step: number; subtract: boolean; beep: boolean; scans: number; location: string }

const SAMPLES: [string, string][] = [
  ['5901234123457', 'Notebook A5 lined'],
  ['4006381333931', 'Highlighter yellow'],
  ['9780201379624', 'Book: Design Patterns'],
  ['0036000291452', 'Tissue box 100ct'],
  ['96385074', 'Eraser small'],
]
const T = Date.UTC(2026, 9, 1)
const DEF: State = {
  items: [
    { code: '5901234123457', name: 'Notebook A5 lined', qty: 24, expected: 30, updated: T },
    { code: '4006381333931', name: 'Highlighter yellow', qty: 58, expected: 60, updated: T },
    { code: '9780201379624', name: 'Book: Design Patterns', qty: 3, expected: 3, updated: T },
  ],
  step: 1, subtract: false, beep: true, scans: 0, location: 'Store room A',
}

interface Detector { detect: (src: CanvasImageSource) => Promise<{ rawValue: string; format: string }[]> }
type DetectorCtor = new (o?: { formats?: string[] }) => Detector
const BD = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector

function BarcodeSvg({ code, height = 60 }: { code: string; height?: number }) {
  const mods = encode(code)
  const w = mods.length + 18
  return (
    <svg viewBox={`0 0 ${w} ${height + 12}`} width="100%" style={{ background: '#fff', borderRadius: 6, display: 'block' }} aria-label={`Barcode ${code}`}>
      {mods.map((m, i) => (m ? <rect key={i} x={i + 9} y={4} width={1} height={height} fill="#000" /> : null))}
      <text x={w / 2} y={height + 11} textAnchor="middle" fontSize={8} fontFamily="monospace" fill="#000">{code}</text>
    </svg>
  )
}

/** Renders a sample label to noisy pixels and decodes it with the built-in scan-line decoder. */
function decodeLabel(code: string): string | null {
  const mods = encode(code)
  const px = 3.3, W = Math.round((mods.length + 24) * px), H = 80
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#f4f1ea'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#111'
  mods.forEach((m, i) => m && g.fillRect((i + 12) * px, 8, px, H - 16))
  const d = g.getImageData(0, 0, W, H)
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 50
    d.data[i] += n
    d.data[i + 1] += n
    d.data[i + 2] += n
  }
  return decodeImage(d.data, W, H)
}

export default function BarcodeStockCounter() {
  const [s, set] = useToolState('barcode-stock-counter', DEF)
  const [cam, setCam] = useState(false)
  const [err, setErr] = useState('')
  const [last, setLast] = useState<{ code: string; at: number; via: string } | null>(null)
  const [manual, setManual] = useState('')
  const [filter, setFilter] = useState('')
  const video = useRef<HTMLVideoElement>(null)
  const recent = useRef<{ code: string; t: number }>({ code: '', t: 0 })
  const audio = useRef<AudioContext | null>(null)

  const record = (code: string, via: string) => {
    code = code.trim()
    if (!code) return
    const now = Date.now()
    if (via === 'camera' && recent.current.code === code && now - recent.current.t < 1500) return
    recent.current = { code, t: now }
    setLast({ code, at: now, via })
    set((st) => {
      const delta = st.subtract ? -st.step : st.step
      const ex = st.items.find((i) => i.code === code)
      const sample = SAMPLES.find(([c]) => c === code)?.[1]
      const items = ex
        ? st.items.map((i) => (i.code === code ? { ...i, qty: Math.max(0, i.qty + delta), updated: now } : i))
        : [{ code, name: sample ?? '', qty: Math.max(0, delta), expected: null, updated: now }, ...st.items]
      return { ...st, items, scans: st.scans + 1 }
    })
    if (s.beep) {
      try {
        const ac = audio.current ?? (audio.current = new AudioContext())
        const o = ac.createOscillator(), g = ac.createGain()
        o.frequency.value = s.subtract ? 660 : 1320
        g.gain.setValueAtTime(0.15, ac.currentTime)
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12)
        o.connect(g).connect(ac.destination)
        o.start()
        o.stop(ac.currentTime + 0.13)
      } catch { /* no audio */ }
    }
    navigator.vibrate?.(60)
  }
  const recordRef = useRef(record)
  useEffect(() => { recordRef.current = record })

  // camera scanning loop
  useEffect(() => {
    if (!cam) return
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false
    const detector = BD ? new BD({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'itf', 'data_matrix'] }) : null
    const canvas = document.createElement('canvas')
    const run = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        const v = video.current!
        v.srcObject = stream
        await v.play()
      } catch (e) {
        setErr(`Camera unavailable: ${e instanceof Error ? e.message : e}`)
        setCam(false)
        return
      }
      const loop = async () => {
        if (stopped) return
        const v = video.current
        if (v && v.readyState >= 2) {
          try {
            if (detector) {
              const r = await detector.detect(v)
              if (r[0]) recordRef.current(r[0].rawValue, 'camera')
            } else {
              const w = 640, h = Math.round((v.videoHeight / v.videoWidth) * 640) || 480
              canvas.width = w
              canvas.height = h
              const g = canvas.getContext('2d', { willReadFrequently: true })!
              g.drawImage(v, 0, 0, w, h)
              const c = decodeImage(g.getImageData(0, 0, w, h).data, w, h, 15)
              if (c) recordRef.current(c, 'camera')
            }
          } catch { /* frame not ready */ }
        }
        timer = window.setTimeout(loop, 180)
      }
      void loop()
    }
    void run()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [cam])

  const fromImage = async (f: File) => {
    setErr('')
    const bmp = await createImageBitmap(f)
    let code: string | null = null
    if (BD) {
      const r = await new BD().detect(bmp).catch(() => [])
      code = r[0]?.rawValue ?? null
    }
    if (!code) {
      const w = Math.min(1200, bmp.width), h = Math.round((bmp.height / bmp.width) * w)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const g = c.getContext('2d')!
      g.drawImage(bmp, 0, 0, w, h)
      code = decodeImage(g.getImageData(0, 0, w, h).data, w, h, 41)
    }
    if (code) record(code, 'image')
    else setErr('No barcode found in that image. Try a sharper, straight-on photo (EAN/UPC are decoded without BarcodeDetector).')
  }

  const scanSample = (code: string) => {
    const r = decodeLabel(code)
    if (r) record(r, 'demo label')
    else setErr('Demo decode failed')
  }

  const edit = (code: string, p: Partial<Item>) => set({ items: s.items.map((i) => (i.code === code ? { ...i, ...p } : i)) })
  const units = s.items.reduce((a, i) => a + i.qty, 0)
  const variances = s.items.filter((i) => i.expected !== null && i.expected !== i.qty)
  const shown = s.items.filter((i) => !filter || `${i.code} ${i.name}`.toLowerCase().includes(filter.toLowerCase()))

  return (
    <Split>
      <div>
        <Panel title="Scan">
          <Row>
            <Btn kind={cam ? 'danger' : 'primary'} disabled={!navigator.mediaDevices?.getUserMedia} onClick={() => { setErr(''); setCam(!cam) }}>{cam ? '■ Stop camera' : '📷 Start camera'}</Btn>
            <Check label={`Subtract mode (−${s.step})`} value={s.subtract} onChange={(subtract) => set({ subtract })} />
          </Row>
          <div style={{ position: 'relative', display: cam ? 'block' : 'none', marginTop: 8 }}>
            <video ref={video} muted playsInline style={{ width: '100%', borderRadius: 10, background: '#000' }} />
            <div style={{ position: 'absolute', left: '8%', right: '8%', top: '50%', height: 2, background: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {BD ? 'Using the native BarcodeDetector (EAN, UPC, Code 128/39, QR, ITF, DataMatrix).' : 'BarcodeDetector is not available here — using the built-in EAN-13 / UPC-A / EAN-8 decoder. Hold the barcode horizontally across the red line.'}
          </p>
          {err && <Note tone="err">{err}</Note>}
          {last && (
            <Note tone="ok">
              <span>Scanned <b className="mono">{last.code}</b> via {last.via} — {s.items.find((i) => i.code === last.code)?.name || 'new item'}: <b>{s.items.find((i) => i.code === last.code)?.qty ?? 0}</b></span>
            </Note>
          )}
          <form onSubmit={(e) => { e.preventDefault(); record(manual, 'keyboard'); setManual('') }}>
            <label className="k-field">
              <span className="k-label">Type a code or use a USB/Bluetooth scanner (Enter adds)</span>
              <input className="k-text" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="e.g. 5901234123457" inputMode="numeric" />
            </label>
            {manual && /^\d+$/.test(manual) && manual.length >= 8 && <span className="k-hint" style={{ color: validGtin(manual) ? 'var(--ok)' : 'var(--warn)' }}>{validGtin(manual) ? '✓ valid GTIN check digit' : '⚠ check digit does not match'}</span>}
          </form>
          <FileDrop accept="image/*" onFiles={(f) => void fromImage(f[0])} label="…or decode a photo of a barcode" />
        </Panel>
        <Panel title="Demo labels — tap to scan">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
            {SAMPLES.map(([code, name]) => (
              <button key={code} type="button" onClick={() => scanSample(code)} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 6, background: 'var(--panel)', cursor: 'pointer', color: 'inherit', textAlign: 'center' }}>
                <BarcodeSvg code={code} height={44} />
                <span style={{ fontSize: 12 }}>{name}</span>
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>Each tap renders the label to pixels with noise and decodes it with the same scan-line decoder used for the camera fallback.</p>
        </Panel>
        <Panel title="Settings">
          <Row>
            <Num label="Quantity per scan" value={s.step} onChange={(step) => set({ step: Math.max(1, Math.round(step)) })} min={1} step={1} />
            <label className="k-field"><span className="k-label">Location / count name</span><input className="k-text" value={s.location} onChange={(e) => set({ location: e.target.value })} /></label>
          </Row>
          <Check label="Beep and vibrate on scan" value={s.beep} onChange={(beep) => set({ beep })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Items (SKUs)" value={s.items.length} />
          <Stat label="Total units" value={units} tone="accent" />
          <Stat label="Scans" value={s.scans} sub="this count" />
          <Stat label="Variances" value={variances.length} sub={variances.length ? `${variances.reduce((a, i) => a + i.qty - (i.expected ?? 0), 0)} units net` : 'all match'} tone={variances.length ? 'bad' : 'good'} />
        </Stats>
        <Panel
          title={`Stock list — ${s.location}`}
          actions={
            <>
              <CsvButton name={`stock-${s.location.replace(/\W+/g, '-')}.csv`} rows={() => [['Barcode', 'Name', 'Counted', 'Expected', 'Variance', 'Last scan'], ...s.items.map((i) => [i.code, i.name, i.qty, i.expected ?? '', i.expected === null ? '' : i.qty - i.expected, new Date(i.updated).toISOString()])]} />
              <JsonButtons name="stock-count.json" data={s} onLoad={(d) => d && Array.isArray(d.items) && set({ ...DEF, ...d })} />
              <Btn kind="ghost" onClick={() => confirm('Set all counted quantities to 0?') && set({ items: s.items.map((i) => ({ ...i, qty: 0 })), scans: 0 })}>Zero counts</Btn>
            </>
          }
        >
          <input className="k-text" placeholder="Filter by code or name…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginBottom: 8 }} />
          {s.items.length ? (
            <Table
              head={['Barcode', 'Name', 'Counted', 'Expected', 'Δ', '']}
              rows={shown.map((i) => {
                const v = i.expected === null ? null : i.qty - i.expected
                return [
                  <span key="c" className="mono" style={{ fontSize: 13 }}>{i.code}</span>,
                  <input key="n" value={i.name} placeholder="Name…" onChange={(e) => edit(i.code, { name: e.target.value })} style={{ minWidth: 120 }} aria-label="Item name" />,
                  <Row key="q" wrap={false}>
                    <Btn kind="ghost" onClick={() => edit(i.code, { qty: Math.max(0, i.qty - 1), updated: Date.now() })}>−</Btn>
                    <input type="number" min={0} value={i.qty} onChange={(e) => edit(i.code, { qty: Math.max(0, Math.round(Number(e.target.value) || 0)) })} style={{ width: 64 }} aria-label="Counted" />
                    <Btn kind="ghost" onClick={() => edit(i.code, { qty: i.qty + 1, updated: Date.now() })}>+</Btn>
                  </Row>,
                  <input key="e" type="number" min={0} value={i.expected ?? ''} placeholder="—" onChange={(e) => edit(i.code, { expected: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} style={{ width: 64 }} aria-label="Expected" />,
                  <b key="v" style={{ color: v === null ? 'var(--muted)' : v === 0 ? 'var(--ok)' : 'var(--err)' }}>{v === null ? '—' : v > 0 ? `+${v}` : v}</b>,
                  <Btn key="x" kind="ghost" onClick={() => set({ items: s.items.filter((x) => x.code !== i.code) })} title="Remove">✕</Btn>,
                ]
              })}
            />
          ) : (
            <p className="muted">Nothing counted yet — scan a barcode to start.</p>
          )}
        </Panel>
        <div className="k-note info" style={{ display: 'block' }}>Counts are stored in this browser only. Enter the expected quantity to see stock-take variances, then export the CSV for your inventory system.</div>
      </div>
    </Split>
  )
}
