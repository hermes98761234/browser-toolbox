import { useEffect, useMemo, useState } from 'react'
import { Area, Btn, Check, CopyButton, download, FileDrop, Note, Panel, pct, Row, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { fmtBytes } from './lib/image-compressor'
import { DEFAULT_OPTS, optimize, PLUGINS, type Opts } from './lib/svg-optimizer'

// A deliberately bloated, editor-exported icon: comments, metadata, Inkscape/Sodipodi data, long decimals,
// rgb() colors, default values, wrapper groups and absolute path data.
const SAMPLE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!-- Created with Inkscape (http://www.inkscape.org/) -->
<svg
   xmlns:dc="http://purl.org/dc/elements/1.1/"
   xmlns:cc="http://creativecommons.org/ns#"
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:svg="http://www.w3.org/2000/svg"
   xmlns="http://www.w3.org/2000/svg"
   xmlns:xlink="http://www.w3.org/1999/xlink"
   xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd"
   xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
   width="240.00000"
   height="240.00000"
   viewBox="0 0 240.00000 240.00000"
   version="1.1"
   id="svg8"
   inkscape:version="1.2.2 (b0a8486541, 2022-12-01)"
   sodipodi:docname="mountain-badge.svg">
  <defs id="defs2">
    <linearGradient inkscape:collect="always" id="sky" x1="0.0000000" y1="0.0000000" x2="0.0000000" y2="1.0000000">
      <stop style="stop-color:rgb(99,102,241);stop-opacity:1" offset="0.00000000" id="stop1" />
      <stop style="stop-color:rgb(14,165,233);stop-opacity:1" offset="1.00000000" id="stop2" />
    </linearGradient>
  </defs>
  <sodipodi:namedview id="base" pagecolor="#ffffff" bordercolor="#666666" borderopacity="1.0" inkscape:zoom="2.8" inkscape:cx="120.35714" inkscape:cy="119.82143" inkscape:document-units="px" inkscape:current-layer="layer1" showgrid="false" />
  <metadata id="metadata5">
    <rdf:RDF>
      <cc:Work rdf:about="">
        <dc:format>image/svg+xml</dc:format>
        <dc:type rdf:resource="http://purl.org/dc/dcmitype/StillImage" />
        <dc:title>Mountain badge</dc:title>
      </cc:Work>
    </rdf:RDF>
  </metadata>
  <g inkscape:label="Layer 1" inkscape:groupmode="layer" id="layer1">
    <g id="g840">
      <!-- background circle -->
      <circle style="fill:url(#sky);fill-opacity:1;stroke:none;stroke-width:1.00000000" id="path10" cx="120.00000" cy="120.00000" r="110.00000" />
    </g>
    <g id="g850" style="fill:#FFFFFF">
      <circle cx="170.000001" cy="72.499999" r="16.0000004" style="fill-opacity:0.90000000" id="sun" />
    </g>
    <path style="fill:rgb(16,185,129);fill-opacity:1.0;stroke:none" d="M 30.000000,170.000000 L 85.000000,95.000000 L 115.000000,135.000000 L 145.000000,100.000000 L 210.000000,170.000000 L 210.000000,170.000000 C 190.000000,205.000000 150.000000,230.000000 120.000000,230.000000 C 90.000000,230.000000 50.000000,205.000000 30.000000,170.000000 Z" id="path20" inkscape:connector-curvature="0" sodipodi:nodetypes="ccccccc" />
    <path style="fill:#ffffff;fill-opacity:0.85000000;stroke:none" d="M 85.000000,95.000000 L 99.500000,114.800000 L 92.000000,111.000000 L 85.000000,118.000000 L 78.000000,111.000000 L 71.200000,114.000000 Z M 145.000000,100.000000 L 158.000000,114.000000 L 151.000000,112.000000 L 145.000000,118.000000 L 139.000000,112.000000 L 132.400000,115.000000 Z" id="path30" />
    <g id="g900">
      <g id="g901">
        <rect x="0" y="0" width="0" height="0" id="rect-empty" />
      </g>
    </g>
    <text xml:space="preserve" style="font-size:18.6667px;font-family:sans-serif;fill:rgb(255,255,255);fill-opacity:1;stroke:none" x="120.00000" y="207.00000" text-anchor="middle" id="text40"><tspan sodipodi:role="line" id="tspan42" x="120.00000" y="207.00000">PEAK</tspan></text>
  </g>
</svg>
`

const DEF = { ...DEFAULT_OPTS, src: SAMPLE, name: 'mountain-badge.svg' }

interface Diff { pct: number; max: number; w: number; h: number }

/** Renders an SVG string to RGBA pixels on a fixed-size canvas. */
async function raster(svg: string, w: number, h: number): Promise<Uint8ClampedArray> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0, w, h)
    return ctx.getImageData(0, 0, w, h).data
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function gzipSize(s: string): Promise<number> {
  if (typeof CompressionStream === 'undefined') return NaN
  const buf = await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
  return buf.byteLength
}

const bytes = (s: string) => new TextEncoder().encode(s).length

export default function SvgOptimizer() {
  const [s, set, reset] = useToolState('svg-optimizer', DEF)
  const [diff, setDiff] = useState<Diff | null>(null)
  const [diffErr, setDiffErr] = useState('')
  const [gz, setGz] = useState<[number, number]>([NaN, NaN])
  const [view, setView] = useState<'side' | 'diff'>('side')

  const opts: Opts = s
  const res = useMemo(() => {
    try {
      return { ...optimize(s.src, opts), err: '' }
    } catch (e) {
      return { svg: '', report: { removed: {} }, err: (e as Error).message }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.src, ...PLUGINS.map(([k]) => s[k]), s.pretty, s.precision])

  const before = bytes(s.src)
  const after = bytes(res.svg)

  useEffect(() => {
    let live = true
    if (!res.svg) return
    void Promise.all([gzipSize(s.src), gzipSize(res.svg)]).then((g) => live && setGz(g))
    // Pixel comparison at a fixed size taken from the optimized viewBox / size.
    const m = /viewBox="[-\d.e ]*?([\d.e]+) ([\d.e]+)"/.exec(res.svg)
    const ar = m ? Number(m[1]) / Number(m[2]) : 1
    const w = ar >= 1 ? 320 : Math.max(16, Math.round(320 * ar)), h = ar >= 1 ? Math.max(16, Math.round(320 / ar)) : 320
    void Promise.all([raster(s.src, w, h), raster(res.svg, w, h)])
      .then(([a, b]) => {
        let bad = 0, max = 0
        for (let i = 0; i < a.length; i += 4) {
          const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3]))
          if (d > max) max = d
          if (d > 8) bad++
        }
        if (live) {
          setDiff({ pct: bad / (w * h), max, w, h })
          setDiffErr('')
        }
      })
      .catch(() => live && setDiffErr('The browser could not render one of the versions as an image (external references or invalid SVG).'))
    return () => {
      live = false
    }
  }, [s.src, res.svg])

  const removed = Object.entries(res.report.removed)
  const same = diff && diff.pct < 0.001
  const outUrl = useMemo(() => (res.svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(res.svg)}` : ''), [res.svg])
  const inUrl = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s.src)}`, [s.src])
  const checker = { background: 'repeating-conic-gradient(var(--line) 0 25%, transparent 0 50%) 0 0/16px 16px', borderRadius: 10, padding: 10, display: 'grid', placeItems: 'center', minHeight: 200 }

  return (
    <Split wide="right">
      <div>
        <Panel title="Input SVG" actions={<Btn kind="ghost" onClick={reset}>Sample</Btn>}>
          <FileDrop accept=".svg,image/svg+xml" onFiles={async ([f]) => set({ src: await f.text(), name: f.name })} label="Drop an .svg file or click to choose" />
          <div style={{ marginTop: 8 }}>
            <Area value={s.src} onChange={(src) => set({ src })} rows={9} mono placeholder="<svg …>…</svg>" />
          </div>
        </Panel>
        <Panel title="Plugins">
          {PLUGINS.map(([k, label, hint]) => (
            <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={s[k] as boolean} onChange={(e) => set({ [k]: e.target.checked } as Partial<typeof DEF>)} style={{ marginTop: 3 }} />
              <span>
                <b>{label}</b>
                <br />
                <span className="muted" style={{ fontSize: 12.5 }}>{hint}</span>
              </span>
            </label>
          ))}
          <Slider label="Decimal places" value={s.precision} onChange={(precision) => set({ precision })} min={0} max={6} step={1} show={(v) => String(v)} />
          <Check label="Pretty-print output (indented)" value={s.pretty} onChange={(pretty) => set({ pretty })} />
          <Row>
            <Btn onClick={() => set({ ...DEFAULT_OPTS })}>Default plugins</Btn>
            <Btn onClick={() => set({ ...DEFAULT_OPTS, numbers: false, paths: false, groups: false, defaults: false, ids: false })}>Safe only</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Original" value={fmtBytes(before)} sub={Number.isFinite(gz[0]) ? `${fmtBytes(gz[0])} gzipped` : undefined} />
          <Stat label="Optimized" value={res.svg ? fmtBytes(after) : '—'} sub={Number.isFinite(gz[1]) ? `${fmtBytes(gz[1])} gzipped` : undefined} tone="accent" />
          <Stat label="Saved" value={res.svg ? pct(1 - after / (before || 1)) : '—'} tone={after < before ? 'good' : undefined} sub={res.svg ? `${fmtBytes(Math.max(0, before - after))} smaller` : undefined} />
          <Stat label="Rendering" value={diffErr ? '?' : !diff ? '…' : same ? 'Identical' : pct(diff.pct, 2) + ' px'} tone={same ? 'good' : diff ? 'bad' : undefined} sub={diff ? `max channel Δ ${diff.max} @ ${diff.w}×${diff.h}` : undefined} />
        </Stats>
        {res.err && <Note tone="err">Could not parse the SVG: {res.err}</Note>}
        {diffErr && <Note tone="warn">{diffErr}</Note>}
        {diff && !same && <Note tone="warn">Some pixels differ (beyond anti-aliasing noise). Try more decimal places or turn off "Round numbers" / "Collapse groups" / "Remove default values".</Note>}
        <Panel title="Preview" actions={<Row><Btn kind={view === 'side' ? 'primary' : 'ghost'} onClick={() => setView('side')}>Before / after</Btn><Btn kind={view === 'diff' ? 'primary' : 'ghost'} onClick={() => setView('diff')}>Overlay diff</Btn></Row>}>
          {view === 'side' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <figure style={{ margin: 0 }}>
                <div style={checker}><img src={inUrl} alt="Original" style={{ maxWidth: '100%', maxHeight: 260 }} /></div>
                <figcaption className="muted" style={{ textAlign: 'center', fontSize: 13 }}>Original · {fmtBytes(before)}</figcaption>
              </figure>
              <figure style={{ margin: 0 }}>
                <div style={checker}>{outUrl && <img src={outUrl} alt="Optimized" style={{ maxWidth: '100%', maxHeight: 260 }} />}</div>
                <figcaption className="muted" style={{ textAlign: 'center', fontSize: 13 }}>Optimized · {fmtBytes(after)}</figcaption>
              </figure>
            </div>
          ) : (
            <div style={{ ...checker, position: 'relative' }}>
              <div style={{ position: 'relative', isolation: 'isolate' }}>
                <img src={inUrl} alt="Original" style={{ maxWidth: '100%', maxHeight: 300, display: 'block' }} />
                {outUrl && <img src={outUrl} alt="Optimized (difference blend)" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'difference' }} />}
              </div>
              <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>Difference blend: identical areas turn black / transparent, changes light up.</p>
            </div>
          )}
        </Panel>
        {removed.length > 0 && (
          <Panel title="What was removed">
            <Row>
              {removed.map(([k, n]) => (
                <span key={k} className="k-btn ghost" style={{ cursor: 'default' }}>{n} × {k}</span>
              ))}
            </Row>
          </Panel>
        )}
        <Panel
          title="Optimized SVG"
          actions={
            <>
              <CopyButton text={res.svg} />
              <Btn kind="primary" disabled={!res.svg} onClick={() => download(s.name.replace(/\.svg$/i, '') + '.min.svg', res.svg, 'image/svg+xml')}>⬇ Download</Btn>
            </>
          }
        >
          <textarea className="k-area mono" readOnly value={res.svg} rows={9} spellCheck={false} />
        </Panel>
      </div>
    </Split>
  )
}
