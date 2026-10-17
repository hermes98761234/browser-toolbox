import { useEffect, useRef, useState } from 'react'
import { Btn, Check, CsvButton, FileDrop, Note, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, uid, useToolState } from '../kit'
import { decodeLine, encodeCode128, encodeEan, FORMAT_NAMES, gtinCheck, scanRows, validGtin, type Decoded } from './lib/barcode-scanner'

interface Item { id: string; code: string; format: string; qty: number; time: string; note: string }
interface Detected { rawValue: string; format: string }
interface Detector { detect(src: CanvasImageSource): Promise<Detected[]> }
type DetectorCtor = { new (o?: { formats?: string[] }): Detector; getSupportedFormats(): Promise<string[]> }

const NATIVE = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
const DEMOS = [
  { label: 'EAN-13', code: '4006381333931' },
  { label: 'UPC-A', code: '036000291452' },
  { label: 'EAN-8', code: '96385074' },
  { label: 'Code 128', code: 'TB-2026-0042' },
] as const

const now = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const DEF = {
  items: [
    { id: 'a', code: '5901234123457', format: 'ean_13', qty: 2, time: '2026-10-17 09:12', note: 'Shelf A3' },
    { id: 'b', code: '036000291452', format: 'upc_a', qty: 1, time: '2026-10-17 09:13', note: '' },
  ] as Item[],
  beep: true,
  continuous: true,
  engine: 'auto' as 'auto' | 'builtin',
}

/** Tries horizontal then vertical scanlines of a picture with the built-in decoder. */
function decodePixels(img: ImageData): Decoded | null {
  const { width: w, height: h, data } = img
  const lumAt = (x: number, y: number) => {
    const i = (y * w + x) * 4
    return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
  }
  for (const y of scanRows(h, 21)) {
    const r = decodeLine(Array.from({ length: w }, (_, x) => lumAt(x, y)))
    if (r) return r
  }
  for (const x of scanRows(w, 9)) {
    const r = decodeLine(Array.from({ length: h }, (_, y) => lumAt(x, y)))
    if (r) return r
  }
  return null
}

function drawBarcode(c: HTMLCanvasElement, code: string) {
  const mods = /^\d+$/.test(code) && [8, 12, 13].includes(code.length) ? encodeEan(code) : encodeCode128(code)
  const px = 3, q = 12
  c.width = (mods.length + 2 * q) * px
  c.height = 150
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.fillStyle = '#000'
  ;[...mods].forEach((b, i) => b === '1' && g.fillRect((q + i) * px, 10, px, 110))
  g.font = '18px ui-monospace, monospace'
  g.textAlign = 'center'
  g.fillText(code, c.width / 2, 142)
}

function beep() {
  try {
    const ac = new AudioContext()
    const o = ac.createOscillator()
    const gn = ac.createGain()
    o.frequency.value = 1400
    gn.gain.value = 0.08
    o.connect(gn).connect(ac.destination)
    o.start()
    o.stop(ac.currentTime + 0.09)
    o.onended = () => void ac.close()
  } catch {
    /* audio blocked */
  }
}

export default function BarcodeScanner() {
  const [s, set] = useToolState('barcode-scanner', DEF)
  const [on, setOn] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'info' | 'ok' | 'warn' | 'err'; text: string } | null>(null)
  const [manual, setManual] = useState('')
  const [demo, setDemo] = useState(0)
  const [nativeFormats, setNativeFormats] = useState<string[]>([])
  const video = useRef<HTMLVideoElement>(null)
  const demoCv = useRef<HTMLCanvasElement>(null)
  const last = useRef({ code: '', t: 0 })
  const sref = useRef(s)
  useEffect(() => {
    sref.current = s
  })

  useEffect(() => {
    void NATIVE?.getSupportedFormats().then(setNativeFormats).catch(() => setNativeFormats([]))
  }, [])
  useEffect(() => {
    if (demoCv.current) drawBarcode(demoCv.current, DEMOS[demo].code)
  }, [demo])

  const add = (code: string, format: string) => {
    const t = Date.now()
    if (code === last.current.code && t - last.current.t < 2500) return false
    last.current = { code, t }
    if (sref.current.beep) beep()
    navigator.vibrate?.(60)
    set((st) => {
      const hit = st.items.find((i) => i.code === code)
      return hit
        ? { ...st, items: [{ ...hit, qty: hit.qty + 1, time: now() }, ...st.items.filter((i) => i !== hit)] }
        : { ...st, items: [{ id: uid(), code, format, qty: 1, time: now(), note: '' }, ...st.items] }
    })
    setMsg({ tone: 'ok', text: `✓ ${FORMAT_NAMES[format] ?? format}: ${code}` })
    return true
  }

  const nativeOn = () => !!NATIVE && nativeFormats.length > 0 && sref.current.engine === 'auto'
  const detect = async (src: CanvasImageSource, w: number, h: number): Promise<Decoded | { format: string; text: string } | null> => {
    if (nativeOn()) {
      const r = await new NATIVE!().detect(src)
      if (r[0]) return { format: r[0].format, text: r[0].rawValue }
    }
    const k = Math.min(1, 900 / w)
    const c = document.createElement('canvas')
    c.width = Math.round(w * k)
    c.height = Math.round(h * k)
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(src, 0, 0, c.width, c.height)
    return decodePixels(g.getImageData(0, 0, c.width, c.height))
  }

  // Camera loop.
  useEffect(() => {
    if (!on) return
    let stream: MediaStream | null = null
    let timer = 0
    let stop = false
    const loop = async () => {
      const v = video.current
      if (stop || !v) return
      if (v.readyState >= 2 && v.videoWidth) {
        try {
          const r = await detect(v, v.videoWidth, v.videoHeight)
          if (r && add(r.text, r.format) && !sref.current.continuous) {
            setOn(false)
            return
          }
        } catch {
          /* frame not ready */
        }
      }
      timer = window.setTimeout(() => void loop(), 180)
    }
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false })
        if (stop) return stream.getTracks().forEach((t) => t.stop())
        video.current!.srcObject = stream
        await video.current!.play()
        setMsg({ tone: 'info', text: 'Point the camera at a barcode, hold it level and fill about half the width.' })
        void loop()
      } catch (e) {
        setMsg({ tone: 'err', text: `Camera unavailable (${(e as Error).name}). Allow camera access, use HTTPS, or try an image / the demo below.` })
        setOn(false)
      }
    })()
    return () => {
      stop = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on])

  const fromFile = async (f: File) => {
    try {
      const bmp = await createImageBitmap(f)
      const r = await detect(bmp, bmp.width, bmp.height)
      if (r) add(r.text, r.format)
      else setMsg({ tone: 'warn', text: 'No barcode found in that image. Try a sharper, straighter photo.' })
    } catch {
      setMsg({ tone: 'err', text: 'Could not read that image.' })
    }
  }
  const scanDemo = async () => {
    const c = demoCv.current!
    last.current.code = ''
    // Blur slightly so the decoder works on a realistic, imperfect image.
    const t = document.createElement('canvas')
    t.width = c.width
    t.height = c.height
    const g = t.getContext('2d')!
    g.filter = 'blur(0.8px)'
    g.drawImage(c, 0, 0)
    const r = decodePixels(g.getImageData(0, 0, t.width, t.height))
    if (r) add(r.text, r.format)
    else setMsg({ tone: 'err', text: 'Demo decode failed.' })
  }
  const addManual = () => {
    const code = manual.trim()
    if (!code) return
    const digits = /^\d+$/.test(code)
    if (digits && [8, 12, 13, 14].includes(code.length) && !validGtin(code)) {
      setMsg({ tone: 'warn', text: `${code}: check digit should be ${gtinCheck(code.slice(0, -1))}. Added anyway.` })
    }
    last.current.code = ''
    add(code, digits ? ({ 8: 'ean_8', 12: 'upc_a', 13: 'ean_13' } as Record<number, string>)[code.length] ?? 'manual' : 'manual')
    setManual('')
  }

  const total = s.items.reduce((a, i) => a + i.qty, 0)
  return (
    <Split wide="right">
      <div>
        <Panel title="Camera">
          <div style={{ position: 'relative', background: '#0f172a', borderRadius: 10, overflow: 'hidden', aspectRatio: '4 / 3', display: 'grid', placeItems: 'center' }}>
            <video ref={video} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: on ? 'block' : 'none' }} />
            {on ? (
              <div style={{ position: 'absolute', left: '10%', right: '10%', top: '35%', bottom: '35%', border: '3px solid rgba(255,255,255,.85)', borderRadius: 12, boxShadow: '0 0 0 999px rgba(0,0,0,.35)' }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 2, background: '#ef4444' }} />
              </div>
            ) : (
              <span style={{ color: '#94a3b8', padding: 16, textAlign: 'center' }}>📷 Camera is off</span>
            )}
          </div>
          <Row>
            <Btn kind={on ? 'danger' : 'primary'} disabled={!navigator.mediaDevices?.getUserMedia} onClick={() => setOn(!on)}>{on ? '■ Stop camera' : '▶ Start camera'}</Btn>
            <Check label="Keep scanning" value={s.continuous} onChange={(continuous) => set({ continuous })} />
            <Check label="Beep" value={s.beep} onChange={(beep) => set({ beep })} />
          </Row>
          <Seg value={s.engine} onChange={(engine) => set({ engine })} options={[['auto', 'Auto engine'], ['builtin', 'Built-in decoder']]} label="Decoder" />
          <p className="muted" style={{ marginBottom: 0 }}>
            {NATIVE && nativeFormats.length ? `Native BarcodeDetector: ${nativeFormats.map((f) => FORMAT_NAMES[f] ?? f).join(', ')}.` : 'No native BarcodeDetector in this browser: using the built-in EAN-13 / UPC-A / EAN-8 / Code 128 decoder.'}
          </p>
          {msg && <Note tone={msg.tone}>{msg.text}</Note>}
        </Panel>
        <Panel title="Image or manual entry">
          <FileDrop accept="image/*" label="Decode a photo of a barcode" onFiles={([f]) => void fromFile(f)} />
          <Row wrap={false}>
            <div style={{ flex: 1 }}>
              <Txt label="Type a code" value={manual} onChange={setManual} placeholder="e.g. 5901234123457" />
            </div>
            <Btn onClick={addManual} disabled={!manual.trim()}>Add</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Unique codes" value={s.items.length} />
          <Stat label="Total scans" value={total} tone="accent" />
          <Stat label="Last scan" value={s.items[0]?.code ?? '—'} sub={s.items[0] ? (FORMAT_NAMES[s.items[0].format] ?? s.items[0].format) : undefined} />
        </Stats>
        <Panel
          title="Scanned list"
          actions={
            <>
              <CsvButton name="barcodes.csv" rows={() => [['Code', 'Format', 'Quantity', 'Last scanned', 'Note'], ...s.items.map((i) => [i.code, FORMAT_NAMES[i.format] ?? i.format, i.qty, i.time, i.note])]} />
              <Btn kind="ghost" onClick={() => confirm('Clear the whole list?') && set({ items: [] })}>Clear</Btn>
            </>
          }
        >
          {s.items.length === 0 ? <p className="muted">Nothing scanned yet. Start the camera, drop a photo or decode the demo barcode.</p> : (
            <Table
              head={['Code', 'Format', 'Qty', 'Time', 'Note', '']}
              rows={s.items.map((i) => {
                const gt = /^\d+$/.test(i.code) && [8, 12, 13, 14].includes(i.code.length)
                return [
                  <span key="c" className="mono" style={{ fontFamily: 'var(--mono)' }}>{i.code} {gt && (validGtin(i.code) ? <span title="Valid check digit" style={{ color: 'var(--ok)' }}>✓</span> : <span title="Invalid check digit" style={{ color: 'var(--err)' }}>✗</span>)}</span>,
                  FORMAT_NAMES[i.format] ?? i.format,
                  <span key="q" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                    <Btn kind="ghost" onClick={() => set({ items: s.items.map((x) => (x.id === i.id ? { ...x, qty: Math.max(1, x.qty - 1) } : x)) })}>−</Btn>
                    <b>{i.qty}</b>
                    <Btn kind="ghost" onClick={() => set({ items: s.items.map((x) => (x.id === i.id ? { ...x, qty: x.qty + 1 } : x)) })}>+</Btn>
                  </span>,
                  <span key="t" className="muted">{i.time}</span>,
                  <input key="n" value={i.note} placeholder="note" onChange={(e) => set({ items: s.items.map((x) => (x.id === i.id ? { ...x, note: e.target.value } : x)) })} aria-label="Note" style={{ width: 120 }} />,
                  <Btn key="x" kind="ghost" title="Remove" onClick={() => set({ items: s.items.filter((x) => x.id !== i.id) })}>✕</Btn>,
                ]
              })}
            />
          )}
        </Panel>
        <Panel title="Demo barcode">
          <Seg value={String(demo) as '0'} onChange={(v) => setDemo(Number(v))} options={DEMOS.map((d, i) => [String(i) as '0', d.label] as const)} label="Demo barcode" />
          <canvas ref={demoCv} style={{ display: 'block', width: '100%', maxWidth: 380, margin: '10px auto 0', borderRadius: 8, border: '1px solid var(--line)', background: '#fff' }} />
          <Row>
            <Btn kind="primary" onClick={() => void scanDemo()}>Decode this barcode</Btn>
          </Row>
          <p className="muted" style={{ marginBottom: 0 }}>Runs the built-in scanline decoder on a slightly blurred render. You can also aim another phone's camera at this screen.</p>
        </Panel>
        <Note>
          Scanning the same code again bumps its quantity, which makes this handy for stock counts. The list stays in this browser; export CSV for a spreadsheet. Camera access needs HTTPS and your permission. Video never leaves the device.
        </Note>
      </div>
    </Split>
  )
}
