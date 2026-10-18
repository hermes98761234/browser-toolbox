import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, FileDrop, LineChart, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, Table, useToolState } from '../kit'
import { bitPlane, chiSeries, chiSquare, coverImage, embedLsb, histogram, rsAnalysis, verdict, type Ch } from './lib/steganography-detector'

interface Img { name: string; w: number; h: number; data: Uint8ClampedArray; note?: string }
interface Prefs { ch: 'all' | '0' | '1' | '2'; bit: number; rate: number }
const DEF: Prefs = { ch: '0', bit: 0, rate: 0.4 }
const SW = 480, SH = 320
const CH_NAME = ['Red', 'Green', 'Blue']
const CH_COLOR = ['#ef4444', '#10b981', '#3b82f6']
const MAX_PX = 2048

function Pixels({ img, data }: { img: Img; data: Uint8ClampedArray }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    c.width = img.w
    c.height = img.h
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), img.w, img.h), 0, 0)
  }, [img, data])
  return <canvas ref={ref} style={{ width: '100%', imageRendering: 'pixelated', borderRadius: 8, background: '#000', display: 'block' }} />
}

async function decode(f: File): Promise<Img> {
  const bmp = await createImageBitmap(f, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const w = Math.min(bmp.width, MAX_PX), h = Math.min(bmp.height, MAX_PX)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(bmp, 0, 0)
  const notes: string[] = []
  if (bmp.width > MAX_PX || bmp.height > MAX_PX) notes.push(`Analysed the top-left ${w}×${h} pixels.`)
  if (/jpe?g/i.test(f.type) || /\.jpe?g$/i.test(f.name)) notes.push('JPEG files hide data in DCT coefficients, not pixel LSBs — these spatial tests are not meaningful for JPEG.')
  return { name: f.name, w, h, data: g.getImageData(0, 0, w, h).data, note: notes.join(' ') }
}

export default function SteganographyDetector() {
  const [p, set] = useToolState('steganography-detector', DEF)
  const clean = useMemo<Img>(() => ({ name: 'Sample — clean cover', w: SW, h: SH, data: coverImage(SW, SH) }), [])
  const stego = useMemo<Img>(() => ({ name: 'Sample — 60% LSB embedded', w: SW, h: SH, data: embedLsb(clean.data, 0.6) }), [clean])
  const [img, setImg] = useState<Img>(() => stego)
  const [err, setErr] = useState('')

  const res = useMemo(() => ([0, 1, 2] as Ch[]).map((ch) => ({
    ch, chi: chiSquare(histogram(img.data, ch)), series: chiSeries(img.data, ch, 50), rs: rsAnalysis(img.data, img.w, img.h, ch), hist: histogram(img.data, ch),
  })), [img])
  const plane = useMemo(() => bitPlane(img.data, p.ch === 'all' ? 'all' : (Number(p.ch) as Ch), p.bit), [img, p.ch, p.bit])
  // Peak p over prefixes of ≥ 10 % of the image (the classic attack curve), so sequential partial payloads count.
  const maxP = Math.max(...res.flatMap((r) => r.series.filter(([x]) => x >= 10).map(([, y]) => y)))
  const meanRate = res.reduce((a, r) => a + (Number.isFinite(r.rs.rate) ? r.rs.rate : 0), 0) / 3
  const v = verdict(maxP, meanRate)
  const hasAlphaIssue = useMemo(() => {
    for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 255) return true
    return false
  }, [img])

  const download = () => {
    const c = document.createElement('canvas')
    c.width = img.w
    c.height = img.h
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0)
    c.toBlob((b) => {
      if (!b) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = img.name.replace(/\.[a-z]+$/i, '').replace(/[^\w.-]+/g, '-') + '.png'
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    }, 'image/png')
  }

  return (
    <Split>
      <div>
        <Panel title="Image">
          <FileDrop accept="image/png,image/bmp,image/webp,image/gif,image/jpeg" onFiles={async ([f]) => {
            try {
              setErr('')
              setImg(await decode(f))
            } catch {
              setErr('Could not decode this image in the browser.')
            }
          }} label="Drop a PNG / BMP (lossless) or click to choose" />
          <Row>
            <Btn kind={img === clean ? 'primary' : 'normal'} onClick={() => setImg(clean)}>Clean sample</Btn>
            <Btn kind={img === stego ? 'primary' : 'normal'} onClick={() => setImg(stego)}>Stego sample (60%)</Btn>
            <Btn kind="ghost" onClick={download}>⬇ PNG</Btn>
          </Row>
          <p style={{ margin: '6px 0' }}><b>{img.name}</b> <span className="muted">· {img.w}×{img.h}</span></p>
          {err && <Note tone="err">{err}</Note>}
          {img.note && <Note tone="warn">{img.note}</Note>}
          {hasAlphaIssue && <Note tone="warn">The image has transparent pixels; browsers may alter colour values under transparency.</Note>}
          <Pixels img={img} data={img.data} />
        </Panel>
        <Panel title="Bit-plane viewer">
          <Seg<Prefs['ch']> value={p.ch} onChange={(ch) => set({ ch })} options={[['0', 'Red'], ['1', 'Green'], ['2', 'Blue'], ['all', 'RGB']]} />
          <Slider label="Bit" value={p.bit} onChange={(bit) => set({ bit })} min={0} max={7} show={(x) => (x === 0 ? '0 (LSB)' : x === 7 ? '7 (MSB)' : String(x))} />
          <Pixels img={img} data={plane} />
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>In natural images the LSB plane still shows faint structure; embedded regions turn into uniform static. Compare bit 0 with bit 1–2.</p>
        </Panel>
        <Panel title="Experiment: embed random bits">
          <Slider label="Fraction of pixels" value={p.rate} onChange={(rate) => set({ rate })} min={0.05} max={1} step={0.05} show={(x) => `${Math.round(x * 100)}%`} />
          <Btn onClick={() => setImg({ ...img, name: `${img.name} + LSB ${Math.round(p.rate * 100)}%`, data: embedLsb(img.data, p.rate, Date.now() % 100000), note: undefined })}>Embed into the current image</Btn>
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>LSB replacement of pseudo-random bits in raster order (R, G and B), the simplest form of steganography.</p>
        </Panel>
      </div>
      <div>
        <Note tone={v.level === 'clean' ? 'ok' : v.level === 'suspicious' ? 'warn' : 'err'}><b>{v.text}.</b> Results are statistical evidence, not proof: they can miss careful embedding (±1 matching, random pixel order, low payloads) and can flag unusual clean images.</Note>
        <Stats>
          <Stat label="Chi-square p (peak)" value={maxP.toFixed(3)} sub="≈1 → LSB pairs equalised" tone={maxP > 0.9 ? 'bad' : maxP < 0.1 ? 'good' : undefined} />
          <Stat label="RS estimate" value={`${Math.max(0, meanRate * 100).toFixed(1)}%`} sub="of pixels carry message bits" tone={meanRate > 0.25 ? 'bad' : meanRate < 0.05 ? 'good' : undefined} />
          <Stat label="Est. payload" value={`${Math.max(0, Math.round((meanRate * img.w * img.h * 3) / 8)).toLocaleString()} B`} sub="at 3 bits per pixel" />
        </Stats>
        <Panel title="Chi-square attack along the image">
          <LineChart
            series={res.map((r) => ({ name: CH_NAME[r.ch], color: CH_COLOR[r.ch], points: r.series }))}
            height={240} yMin={0} yMax={1} xLabel="% of image scanned (top → bottom)" fx={(x) => `${Math.round(x)}%`} fy={(y) => y.toFixed(2)}
          />
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Westfeld–Pfitzmann: LSB replacement makes the counts of each value pair (2k, 2k+1) equal. A p-value near 1 over the first part of the image that then falls to 0 is the signature of a sequentially embedded message.</p>
        </Panel>
        <Panel title="RS analysis (Fridrich, Goljan & Du)">
          <Table
            head={['Channel', 'R_M', 'S_M', 'R_−M', 'S_−M', 'Estimated rate', 'χ² p (whole)']}
            rows={res.map((r) => [
              <b key="c" style={{ color: CH_COLOR[r.ch] }}>{CH_NAME[r.ch]}</b>,
              r.rs.rm.toFixed(3), r.rs.sm.toFixed(3), r.rs.rmn.toFixed(3), r.rs.smn.toFixed(3),
              Number.isFinite(r.rs.rate) ? `${(r.rs.rate * 100).toFixed(1)}%` : 'n/a', r.chi.p.toFixed(3),
            ])}
          />
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Groups of 4 pixels are classed as regular / singular by how flipping LSBs changes their smoothness. In clean images R_M ≈ R_−M and S_M ≈ S_−M; embedding pushes R_M and S_M together. Expect a few percent of error on clean images.</p>
        </Panel>
        <Panel title="Histograms">
          <LineChart series={res.map((r) => ({ name: CH_NAME[r.ch], color: CH_COLOR[r.ch], points: r.hist.map((c, i) => [i, c] as [number, number]) }))} height={200} xMin={0} xMax={255} fx={(x) => String(Math.round(x))} fy={(y) => String(Math.round(y))} />
          <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>Combs or gaps in the histogram come from editing; LSB replacement smooths neighbouring pairs.</p>
        </Panel>
      </div>
    </Split>
  )
}
