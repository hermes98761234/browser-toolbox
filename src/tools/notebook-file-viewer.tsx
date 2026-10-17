import { useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Panel, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { markdown } from './lib/markdown-live-editor'
import { ansiToHtml, esc, highlight, parseNotebook, stats, toScript, type Cell, type Notebook, type Output } from './lib/notebook-file-viewer'

interface Opts {
  code: boolean
  outputs: boolean
  prompts: boolean
  filter: string
}
const DEF: Opts = { code: true, outputs: true, prompts: true, filter: '' }

const CSS = `.nbv{font-size:15px}.nbv .cell{display:grid;grid-template-columns:var(--pw,64px) minmax(0,1fr);gap:8px;margin:0 0 14px}
.nbv .pr{font-family:var(--mono);font-size:12px;color:var(--muted);text-align:right;padding-top:9px;white-space:nowrap}.nbv .pr.out{color:#dc2626;opacity:.75}
.nbv pre{margin:0;font-family:var(--mono);font-size:13px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
.nbv .src{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:8px 12px;overflow:auto}
.nbv .o{padding:4px 2px;overflow:auto}.nbv .o img{max-width:100%;height:auto;background:#fff;border-radius:6px}
.nbv .o.err{background:rgba(220,38,38,.07);border-left:3px solid #dc2626;padding:6px 10px;border-radius:0 6px 6px 0}.nbv .o.stderr{background:rgba(217,119,6,.09)}
.nbv iframe{width:100%;border:0;background:#fff;border-radius:6px;min-height:40px}
.nbv .md{line-height:1.6;overflow-wrap:anywhere}.nbv .md h1,.nbv .md h2{border-bottom:1px solid var(--line);padding-bottom:.2em}.nbv .md code{font-family:var(--mono);background:var(--panel2);padding:.1em .35em;border-radius:5px;font-size:.9em}
.nbv .md pre{background:var(--panel2);padding:10px;border-radius:8px;overflow:auto}.nbv .md table{border-collapse:collapse;display:block;overflow:auto}.nbv .md th,.nbv .md td{border:1px solid var(--line);padding:4px 10px}.nbv .md img{max-width:100%}.nbv .md blockquote{margin:.6em 0;padding:.1em 1em;border-left:4px solid var(--accent);color:var(--muted)}
.nbv .t-kw{color:#7c3aed;font-weight:600}.nbv .t-str{color:#b45309}.nbv .t-com{color:#64748b;font-style:italic}.nbv .t-num{color:#0d9488}.nbv .t-fn{color:#2563eb;font-weight:600}.nbv .t-bi{color:#0e7490}.nbv .t-deco{color:#c026d3}.nbv .t-call{color:#1d4ed8}
.nbv .raw{color:var(--muted)}
@media (prefers-color-scheme: dark){:root:not([data-theme=light]) .nbv .t-kw{color:#c4b5fd}:root:not([data-theme=light]) .nbv .t-str{color:#fcd34d}:root:not([data-theme=light]) .nbv .t-fn,:root:not([data-theme=light]) .nbv .t-call{color:#93c5fd}:root:not([data-theme=light]) .nbv .t-num{color:#5eead4}:root:not([data-theme=light]) .nbv .t-bi{color:#67e8f9}}
:root[data-theme=dark] .nbv .t-kw{color:#c4b5fd}:root[data-theme=dark] .nbv .t-str{color:#fcd34d}:root[data-theme=dark] .nbv .t-fn,:root[data-theme=dark] .nbv .t-call{color:#93c5fd}:root[data-theme=dark] .nbv .t-num{color:#5eead4}:root[data-theme=dark] .nbv .t-bi{color:#67e8f9}
@media (max-width:600px){.nbv .cell{grid-template-columns:minmax(0,1fr)}.nbv .pr{text-align:left;padding:0}}`

const FRAME_CSS = '<style>body{margin:0;font:13px system-ui,sans-serif;color:#0f172a}table{border-collapse:collapse}th,td{border:1px solid #e2e8f0;padding:4px 8px;text-align:right}thead th{background:#f1f5f9}tbody tr:nth-child(odd){background:#f8fafc}</style>'

function outputHtml(o: Output): string {
  if (o.kind === 'stream') return `<div class="o ${o.name === 'stderr' ? 'stderr' : ''}"><pre>${ansiToHtml(o.text)}</pre></div>`
  if (o.kind === 'error') return `<div class="o err"><pre>${ansiToHtml(o.traceback || `${o.ename}: ${o.evalue}`)}</pre></div>`
  const d = o.data
  if (o.mime === 'image/png' || o.mime === 'image/jpeg' || o.mime === 'image/gif') return `<div class="o"><img alt="output" src="data:${o.mime};base64,${esc(d.replace(/\s/g, ''))}"></div>`
  // SVG and HTML can carry scripts: SVG goes through <img> (scripts never run there), HTML into a script-less sandboxed frame.
  if (o.mime === 'image/svg+xml') return `<div class="o"><img alt="svg output" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(d)}"></div>`
  if (o.mime === 'text/html') return `<div class="o"><iframe sandbox="allow-same-origin" srcdoc="${esc(FRAME_CSS + d)}"></iframe></div>`
  if (o.mime === 'text/markdown') return `<div class="o md">${markdown(d).html}</div>`
  return `<div class="o"><pre>${ansiToHtml(d)}</pre></div>`
}

function cellHtml(c: Cell, lang: string, o: Opts): string {
  if (c.type === 'markdown') {
    let src = c.source
    for (const [n, uri] of Object.entries(c.attachments)) src = src.split(`attachment:${n}`).join(uri)
    return `<div class="cell"><div></div><div class="md">${markdown(src).html}</div></div>`
  }
  if (c.type === 'raw') return `<div class="cell"><div class="pr">raw</div><pre class="src raw">${esc(c.source)}</pre></div>`
  const n = c.count ?? ' '
  let h = ''
  if (o.code) h += `<div class="cell"><div class="pr">${o.prompts ? `In [${n}]:` : ''}</div><pre class="src">${highlight(c.source, lang)}</pre></div>`
  if (o.outputs && c.outputs.length) {
    const hasResult = c.outputs.some((x) => x.kind === 'data' && x.count != null)
    h += `<div class="cell"><div class="pr out">${o.prompts && hasResult ? `Out[${n}]:` : ''}</div><div>${c.outputs.map(outputHtml).join('')}</div></div>`
  }
  return h
}

function notebookHtml(nb: Notebook, o: Opts): string {
  const f = o.filter.trim().toLowerCase()
  return nb.cells
    .map((c, i) => (f && !c.source.toLowerCase().includes(f) ? '' : `<section id="nbc-${i}">${cellHtml(c, nb.lang, o)}</section>`))
    .join('')
}

/** Builds a demo notebook, with a real PNG chart drawn on a canvas. */
function sampleNotebook(): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const temp = [2.1, 3.4, 7.2, 12.5, 17.1, 20.4, 22.6, 22.0, 17.8, 12.0, 6.5, 2.9]
  let png = ''
  try {
    const cv = document.createElement('canvas')
    cv.width = 560
    cv.height = 260
    const g = cv.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, 560, 260)
    g.strokeStyle = '#e2e8f0'
    g.fillStyle = '#475569'
    g.font = '11px sans-serif'
    for (let t = 0; t <= 25; t += 5) {
      const y = 220 - t * 8
      g.beginPath(); g.moveTo(40, y); g.lineTo(545, y); g.stroke()
      g.fillText(String(t), 18, y + 4)
    }
    g.strokeStyle = '#1f77b4'
    g.lineWidth = 2.5
    g.beginPath()
    temp.forEach((v, i) => (i ? g.lineTo(60 + i * 43, 220 - v * 8) : g.moveTo(60, 220 - v * 8)))
    g.stroke()
    g.fillStyle = '#1f77b4'
    temp.forEach((v, i) => { g.beginPath(); g.arc(60 + i * 43, 220 - v * 8, 3.5, 0, 7); g.fill(); g.fillStyle = '#475569'; g.fillText(months[i], 50 + i * 43, 240); g.fillStyle = '#1f77b4' })
    g.fillStyle = '#0f172a'
    g.font = 'bold 13px sans-serif'
    g.fillText('Mean monthly temperature (°C)', 190, 20)
    png = cv.toDataURL('image/png').split(',')[1]
  } catch { /* no canvas */ }
  const rows = months.slice(0, 5).map((m, i) => `<tr><th>${i}</th><td>${m}</td><td>${temp[i]}</td><td>${[48, 41, 39, 44, 58][i]}</td></tr>`).join('')
  const cells = [
    { cell_type: 'markdown', source: '# Weather exploration\n\nA small **demo notebook** that shows how the viewer renders the usual output types:\n\n- Markdown with *emphasis*, `code`, tables and lists\n- `stdout` streams and rich `text/html` tables (pandas)\n- PNG and SVG figures\n- Error tracebacks with ANSI colours\n\n| Source | Station | Years |\n|---|---|---|\n| Synthetic | Demo-1 | 1991–2020 |' },
    { cell_type: 'code', execution_count: 1, source: 'import numpy as np\nimport pandas as pd\nimport matplotlib.pyplot as plt\n\nmonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",\n          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]\ntemp = np.array([2.1, 3.4, 7.2, 12.5, 17.1, 20.4, 22.6, 22.0, 17.8, 12.0, 6.5, 2.9])\nrain = np.array([48, 41, 39, 44, 58, 62, 70, 66, 52, 57, 60, 55])\nprint(f"Annual mean: {temp.mean():.2f} °C, range {temp.max() - temp.min():.1f} °C")', outputs: [{ output_type: 'stream', name: 'stdout', text: `Annual mean: ${(temp.reduce((a, b) => a + b) / 12).toFixed(2)} °C, range ${(22.6 - 2.1).toFixed(1)} °C\n` }] },
    { cell_type: 'markdown', source: '## The data frame\nPandas renders HTML tables; they are shown in a sandboxed frame without scripts.' },
    { cell_type: 'code', execution_count: 2, source: 'df = pd.DataFrame({"month": months, "temp": temp, "rain_mm": rain})\ndf.head()', outputs: [{ output_type: 'execute_result', execution_count: 2, metadata: {}, data: { 'text/plain': '  month  temp  rain_mm\n0   Jan   2.1       48', 'text/html': `<table><thead><tr><th></th><th>month</th><th>temp</th><th>rain_mm</th></tr></thead><tbody>${rows}</tbody></table>` } }] },
    { cell_type: 'markdown', source: '## Plots\n### Matplotlib PNG' },
    { cell_type: 'code', execution_count: 3, source: 'fig, ax = plt.subplots(figsize=(7, 3.2))\nax.plot(months, temp, marker="o")  # line chart\nax.set_title("Mean monthly temperature (°C)")\nplt.show()', outputs: png ? [{ output_type: 'display_data', metadata: {}, data: { 'image/png': png, 'text/plain': '<Figure size 700x320 with 1 Axes>' } }] : [] },
    { cell_type: 'markdown', source: '### SVG output' },
    { cell_type: 'code', execution_count: 4, source: '@interact\ndef bars(n=5):\n    return svg_bars(range(1, n + 1))\n\nbars()', outputs: [{ output_type: 'execute_result', execution_count: 4, metadata: {}, data: { 'image/svg+xml': `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="110">${[1, 2, 3, 4, 5].map((v) => `<rect x="${v * 50 - 30}" y="${100 - v * 18}" width="34" height="${v * 18}" rx="4" fill="#10b981"/>`).join('')}</svg>`, 'text/plain': '<SVG>' } }] },
    { cell_type: 'markdown', source: '## Errors\nTracebacks keep their colours:' },
    { cell_type: 'code', execution_count: 5, source: 'ratio = temp.max() / (temp.min() - 2.1)\nint("twelve")', outputs: [{ output_type: 'error', ename: 'ValueError', evalue: "invalid literal for int() with base 10: 'twelve'", traceback: ['\u001b[0;31m---------------------------------------------------------------------------\u001b[0m', '\u001b[0;31mValueError\u001b[0m                                Traceback (most recent call last)', 'Cell \u001b[0;32mIn[5], line 2\u001b[0m\n\u001b[1;32m      1\u001b[0m ratio \u001b[38;5;241m=\u001b[39m temp\u001b[38;5;241m.\u001b[39mmax() \u001b[38;5;241m/\u001b[39m (temp\u001b[38;5;241m.\u001b[39mmin() \u001b[38;5;241m-\u001b[39m \u001b[38;5;241m2.1\u001b[39m)\n\u001b[0;32m----> 2\u001b[0m \u001b[38;5;28mint\u001b[39m(\u001b[38;5;124m"\u001b[39m\u001b[38;5;124mtwelve\u001b[39m\u001b[38;5;124m"\u001b[39m)', "\u001b[0;31mValueError\u001b[0m: invalid literal for int() with base 10: 'twelve'"] }, { output_type: 'stream', name: 'stderr', text: 'RuntimeWarning: divide by zero encountered in scalar divide\n' }] },
  ]
  return JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: { kernelspec: { display_name: 'Python 3 (ipykernel)', language: 'python', name: 'python3' }, language_info: { name: 'python', version: '3.12.4' } }, cells: cells.map((c) => ({ metadata: {}, outputs: [], ...c })) })
}

export default function NotebookFileViewer() {
  const [o, set, reset] = useToolState('notebook-file-viewer', DEF)
  const [src, setSrc] = useState<{ name: string; text: string } | null>(null)
  const sample = useMemo(() => sampleNotebook(), [])
  const file = src ?? { name: 'weather-demo.ipynb', text: sample }
  const parsed = useMemo(() => {
    try {
      return { nb: parseNotebook(file.text), err: '' }
    } catch (e) {
      return { nb: null, err: (e as Error).message }
    }
  }, [file.text])
  const nb = parsed.nb
  const html = useMemo(() => (nb ? notebookHtml(nb, o) : ''), [nb, o])
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const frames = host.current?.querySelectorAll('iframe') ?? []
    const fit = (f: HTMLIFrameElement) => {
      try {
        const d = f.contentDocument
        if (d?.body) f.style.height = Math.min(800, d.documentElement.scrollHeight + 4) + 'px'
      } catch { /* cross-origin */ }
    }
    frames.forEach((f) => {
      f.addEventListener('load', () => fit(f))
      fit(f)
    })
  }, [html])

  const st = nb ? stats(nb) : null
  const toc = useMemo(() => {
    if (!nb) return []
    const out: { i: number; level: number; text: string }[] = []
    nb.cells.forEach((c, i) => {
      if (c.type !== 'markdown') return
      for (const m of c.source.matchAll(/^(#{1,4})\s+(.+)$/gm)) out.push({ i, level: m[1].length, text: m[2].replace(/[*_`]/g, '') })
    })
    return out
  }, [nb])
  const base = file.name.replace(/\.ipynb$/i, '')

  const exportHtml = () => {
    if (!nb) return
    const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(nb.title || base)}</title><style>:root{--line:#e2e8f0;--panel2:#f8fafc;--muted:#64748b;--accent:#4f46e5;--mono:ui-monospace,Menlo,Consolas,monospace}body{font:15px/1.5 system-ui,sans-serif;max-width:980px;margin:32px auto;padding:0 16px;color:#0f172a}${CSS}</style></head><body><div class="nbv">${notebookHtml(nb, o)}</div><script>document.querySelectorAll('iframe').forEach(f=>f.onload=()=>{try{f.style.height=f.contentDocument.documentElement.scrollHeight+4+'px'}catch(e){}})</script></body></html>`
    download(`${base}.html`, doc, 'text/html')
  }

  return (
    <Split wide="right">
      <div>
        <Panel title="Open notebook">
          <FileDrop accept=".ipynb,application/x-ipynb+json,application/json" onFiles={async ([f]) => setSrc({ name: f.name, text: await f.text() })} label="Drop an .ipynb file or click to choose" />
          <p className="muted" style={{ fontSize: 13 }}>
            Showing <b>{file.name}</b>. {src && <a href="#" onClick={(e) => { e.preventDefault(); setSrc(null) }}>Back to the demo</a>}
          </p>
          <Note>Everything renders locally: the file is never uploaded and nothing is executed.</Note>
        </Panel>
        <Panel title="View">
          <Check label="Show code" value={o.code} onChange={(code) => set({ code })} />
          <Check label="Show outputs" value={o.outputs} onChange={(outputs) => set({ outputs })} />
          <Check label="In/Out prompts" value={o.prompts} onChange={(prompts) => set({ prompts })} />
          <Txt label="Filter cells containing" value={o.filter} onChange={(filter) => set({ filter })} placeholder="e.g. plt." />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <Btn disabled={!nb} onClick={exportHtml}>⬇ HTML</Btn>
            <Btn disabled={!nb} onClick={() => nb && download(`${base}.py`, toScript(nb), 'text/x-python')}>⬇ Script (# %%)</Btn>
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </div>
        </Panel>
        {toc.length > 0 && (
          <Panel title="Outline">
            {toc.map((t, k) => (
              <a
                key={k}
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  host.current?.querySelector(`#nbc-${t.i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                style={{ display: 'block', padding: '3px 0', paddingLeft: (t.level - 1) * 14, color: t.level === 1 ? 'var(--fg)' : 'var(--accent)', fontWeight: t.level === 1 ? 700 : 400, textDecoration: 'none', fontSize: 14 }}
              >
                {t.text}
              </a>
            ))}
          </Panel>
        )}
      </div>
      <div>
        {parsed.err && <Note tone="err">Could not read this file: {parsed.err}</Note>}
        {nb && st && (
          <>
            <Stats>
              <Stat label="Cells" value={nb.cells.length} sub={`${st.code} code · ${st.markdown} markdown`} />
              <Stat label="Kernel" value={<span style={{ fontSize: 15 }}>{nb.kernel}</span>} sub={`nbformat ${nb.nbformat}`} />
              <Stat label="Outputs" value={st.outputs} sub={`${st.images} images · ${st.errors} errors`} tone={st.errors ? 'bad' : undefined} />
              <Stat label="Code lines" value={st.lines} sub={st.inOrder ? 'executed in order' : 'out-of-order execution'} tone={st.inOrder ? 'good' : 'accent'} />
            </Stats>
            {st.unexecuted > 0 && <Note tone="warn">{st.unexecuted} code cell(s) were never executed, so their outputs are missing.</Note>}
            <Panel title={`📓 ${file.name}`}>
              <style>{CSS}</style>
              <div ref={host} className="nbv" dangerouslySetInnerHTML={{ __html: html || '<p class="muted">No cells match the filter.</p>' }} />
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
