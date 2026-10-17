import { useEffect, useRef, useState } from 'react'
import { Btn, color, CopyButton, download, Note, Num, Panel, Row, Seg, Slider, Split, Txt, useToolState } from '../kit'
import { areas, cssFor, htmlFor, invalidAreas, isName, paint, resize, validTrack, type Cells, type GridSpec } from './lib/css-grid-builder'

interface State extends GridSpec {
  brush: string
}

const T = (cols: string[], rows: string[], cells: string[][], gap = 16): Pick<State, 'cols' | 'rows' | 'cells' | 'colGap' | 'rowGap'> => ({ cols, rows, cells, colGap: gap, rowGap: gap })

const TEMPLATES: Record<string, () => ReturnType<typeof T>> = {
  'Holy grail': () => T(['200px', '1fr', '200px'], ['auto', '1fr', 'auto'], [['header', 'header', 'header'], ['nav', 'main', 'aside'], ['footer', 'footer', 'footer']]),
  Dashboard: () => T(['220px', '1fr', '1fr', '1fr'], ['64px', '160px', '1fr', '1fr'], [['sidebar', 'topbar', 'topbar', 'topbar'], ['sidebar', 'kpi1', 'kpi2', 'kpi3'], ['sidebar', 'chart', 'chart', 'feed'], ['sidebar', 'table', 'table', 'feed']]),
  Blog: () => T(['1fr', 'minmax(0, 680px)', '260px', '1fr'], ['auto', '320px', '1fr', 'auto'], [['header', 'header', 'header', 'header'], ['.', 'hero', 'hero', '.'], ['.', 'article', 'sidebar', '.'], ['footer', 'footer', 'footer', 'footer']], 24),
  Gallery: () => T(['1fr', '1fr', '1fr', '1fr'], ['200px', '200px', '200px'], [['feature', 'feature', 'p1', 'p2'], ['feature', 'feature', 'p3', 'p4'], ['p5', 'p6', 'wide', 'wide']], 8),
  Landing: () => T(['1fr', '1fr', '1fr'], ['72px', '420px', '220px', '120px'], [['nav', 'nav', 'nav'], ['hero', 'hero', 'signup'], ['f1', 'f2', 'f3'], ['cta', 'cta', 'cta']], 20),
}

const DEF: State = { ...TEMPLATES['Holy grail'](), container: 'layout', stackBelow: 640, brush: 'main' }

function TrackList({ label, list, onChange }: { label: string; list: string[]; onChange: (l: string[]) => void }) {
  return (
    <div className="k-field">
      <span className="k-label">{label} ({list.length})</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {list.map((t, i) => (
          <input
            key={i}
            value={t}
            onChange={(e) => onChange(list.map((x, j) => (j === i ? e.target.value : x)))}
            aria-label={`${label} track ${i + 1}`}
            style={{ width: Math.max(64, t.length * 8 + 20), padding: '5px 7px', borderRadius: 6, fontFamily: 'ui-monospace, monospace', fontSize: 13, border: `1px solid ${validTrack(t) ? 'var(--line)' : 'var(--err)'}`, background: 'var(--panel)', color: 'inherit' }}
          />
        ))}
        <Btn kind="ghost" title="Remove last track" disabled={list.length <= 1} onClick={() => onChange(list.slice(0, -1))}>−</Btn>
        <Btn kind="ghost" title="Add track" disabled={list.length >= 12} onClick={() => onChange([...list, '1fr'])}>+</Btn>
      </div>
    </div>
  )
}

export default function CssGridBuilder() {
  const [s, set, reset] = useToolState('css-grid-builder', DEF)
  const [drag, setDrag] = useState<{ r0: number; c0: number; r1: number; c1: number } | null>(null)
  const [width, setWidth] = useState(1200)
  const [tab, setTab] = useState<'css' | 'html'>('css')
  const box = useRef<HTMLDivElement>(null)
  const [avail, setAvail] = useState(700)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAvail(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = Math.min(1, avail / width)

  const cells: Cells = resize(s.cells, s.rows.length, s.cols.length)
  const list = areas(cells)
  const bad = invalidAreas(cells)
  const badTracks = [...s.cols, ...s.rows].filter((t) => !validTrack(t))
  const names = [...new Set([...list.map((b) => b.name), s.brush].filter((n) => n && n !== '.'))]
  const colorOf = (n: string) => (n === '.' ? 'transparent' : color(Math.max(0, names.indexOf(n))))
  const spec: GridSpec = { ...s, cells }
  const css = cssFor(spec)
  const html = htmlFor(spec)
  const brushOk = s.brush === '.' || isName(s.brush)

  const setTracks = (p: Partial<Pick<State, 'cols' | 'rows'>>) => {
    const cols = p.cols ?? s.cols
    const rows = p.rows ?? s.rows
    set({ ...p, cells: resize(s.cells, rows.length, cols.length) })
  }
  const finish = () => {
    const d = drag
    if (d && brushOk) set({ cells: paint(cells, d.r0, d.c0, d.r1, d.c1, s.brush) })
    setDrag(null)
  }
  const inSel = (r: number, c: number) => drag && r >= Math.min(drag.r0, drag.r1) && r <= Math.max(drag.r0, drag.r1) && c >= Math.min(drag.c0, drag.c1) && c <= Math.max(drag.c0, drag.c1)

  const previewDoc = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
*{box-sizing:border-box}body{margin:0;padding:16px;font:600 14px system-ui,sans-serif;background:#f8fafc;min-height:100vh}
.${s.container}{min-height:calc(100vh - 32px)}
.${s.container}>div{border-radius:10px;padding:12px;color:#fff;display:flex;align-items:flex-start;min-height:48px;box-shadow:inset 0 0 0 2px #0001}
${list.map((b) => `.${b.name}{background:${colorOf(b.name)}}`).join('\n')}
${css}</style></head><body>${html}</body></html>`

  return (
    <Split wide="right">
      <div>
        <Panel title="Tracks">
          <TrackList label="Columns" list={s.cols} onChange={(cols) => setTracks({ cols })} />
          <TrackList label="Rows" list={s.rows} onChange={(rows) => setTracks({ rows })} />
          {badTracks.length > 0 && <Note tone="err">Not a valid track size: {badTracks.join(', ')}. Use e.g. 1fr, 240px, auto, 20%, minmax(200px, 1fr).</Note>}
          <Row>
            <Num label="Column gap" value={s.colGap} onChange={(colGap) => set({ colGap })} min={0} unit="px" />
            <Num label="Row gap" value={s.rowGap} onChange={(rowGap) => set({ rowGap })} min={0} unit="px" />
          </Row>
        </Panel>
        <Panel title="Paint areas">
          <Txt label="Brush (area name)" value={s.brush} onChange={(brush) => set({ brush: brush.trim() })} hint="Type a new name, or pick one below; “.” erases" />
          {!brushOk && <Note tone="err">Area names must start with a letter and contain only letters, digits, - or _.</Note>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {names.map((n) => (
              <button key={n} type="button" onClick={() => set({ brush: n })} className="k-btn" style={{ background: colorOf(n), color: '#fff', outline: s.brush === n ? '3px solid var(--fg, #000)' : undefined, outlineOffset: 1 }}>{n}</button>
            ))}
            <button type="button" onClick={() => set({ brush: '.' })} className={`k-btn ${s.brush === '.' ? 'primary' : ''}`}>⌫ Eraser</button>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Drag across cells in the editor to paint a rectangle with the brush. Each area must stay a single rectangle.</p>
        </Panel>
        <Panel title="Options">
          <Txt label="Container class" value={s.container} onChange={(container) => set({ container: container.replace(/[^\w-]/g, '') || 'layout' })} />
          <Num label="Stack into one column below" value={s.stackBelow} onChange={(stackBelow) => set({ stackBelow })} min={0} unit="px" hint="0 turns the media query off" />
          <div className="k-field">
            <span className="k-label">Templates</span>
            <Row>
              {Object.keys(TEMPLATES).map((k) => (
                <Btn key={k} onClick={() => set({ ...TEMPLATES[k](), brush: areas(TEMPLATES[k]().cells)[0]?.name ?? 'main' })}>{k}</Btn>
              ))}
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
              <Btn kind="ghost" onClick={() => set({ cells: resize([], s.rows.length, s.cols.length) })}>Clear areas</Btn>
            </Row>
          </div>
        </Panel>
      </div>
      <div>
        <Panel title={`Editor · ${s.cols.length} × ${s.rows.length}`}>
          <div
            onPointerUp={finish}
            onPointerLeave={() => drag && finish()}
            style={{ display: 'grid', gridTemplateColumns: `36px repeat(${s.cols.length}, minmax(0, 1fr))`, gridTemplateRows: `24px repeat(${s.rows.length}, 56px)`, gap: 4, userSelect: 'none', touchAction: 'none' }}
          >
            <span />
            {s.cols.map((t, c) => <span key={c} className="muted" style={{ fontSize: 11, textAlign: 'center', fontFamily: 'ui-monospace, monospace', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{t}</span>)}
            {cells.map((row, r) => [
              <span key={`h${r}`} className="muted" style={{ fontSize: 11, alignSelf: 'center', fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.rows[r]}</span>,
              ...row.map((n, c) => (
                <div
                  key={`${r}-${c}`}
                  onPointerDown={(e) => {
                    // Touch pointers are captured by the start cell; release so pointerenter fires on the others.
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
                    setDrag({ r0: r, c0: c, r1: r, c1: c })
                  }}
                  onPointerEnter={() => drag && setDrag({ ...drag, r1: r, c1: c })}
                  style={{
                    borderRadius: 6,
                    cursor: 'crosshair',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#fff',
                    background: inSel(r, c) ? (s.brush === '.' ? 'var(--line)' : colorOf(s.brush)) : n === '.' ? 'transparent' : colorOf(n),
                    opacity: inSel(r, c) ? 0.7 : 1,
                    border: n === '.' && !inSel(r, c) ? '2px dashed var(--line)' : bad.includes(n) ? '3px solid var(--err)' : '2px solid transparent',
                    overflow: 'hidden',
                  }}
                >
                  {n === '.' ? '' : n}
                </div>
              )),
            ])}
          </div>
          {bad.length > 0 && <Note tone="err">Area{bad.length > 1 ? 's' : ''} {bad.join(', ')} {bad.length > 1 ? 'are' : 'is'} not rectangular — browsers will ignore the whole grid-template-areas value. Repaint or erase cells.</Note>}
        </Panel>
        <Panel title="Live preview" actions={<span className="muted" style={{ fontSize: 13 }}>{width}px wide{scale < 1 ? ` · shown at ${Math.round(scale * 100)}%` : ''}{s.stackBelow > 0 && width <= s.stackBelow ? ' · stacked' : ''}</span>}>
          <Slider label="Viewport width" value={width} onChange={setWidth} min={320} max={1440} step={10} unit="px" show={String} />
          <div ref={box} style={{ height: 460 * scale, overflow: 'hidden', border: '1px solid var(--line)', borderRadius: 8, background: '#f8fafc' }}>
            <iframe title="Grid preview" srcDoc={previewDoc} sandbox="" style={{ width, height: 460, border: 0, display: 'block', transform: `scale(${scale})`, transformOrigin: '0 0' }} />
          </div>
        </Panel>
        <Panel
          title="Code"
          actions={
            <>
              <Seg value={tab} onChange={setTab} options={[['css', 'CSS'], ['html', 'HTML']]} />
              <CopyButton text={tab === 'css' ? css : html} label="Copy" />
              <Btn onClick={() => download('grid-layout.html', `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width">\n<style>\n${css}</style>\n</head>\n<body>\n${html}</body>\n</html>\n`, 'text/html')}>⬇ HTML file</Btn>
            </>
          }
        >
          <pre style={{ margin: 0, padding: 12, borderRadius: 8, background: 'var(--panel)', border: '1px solid var(--line)', overflowX: 'auto', fontSize: 13, lineHeight: 1.5 }}>
            <code>{tab === 'css' ? css : html}</code>
          </pre>
        </Panel>
      </div>
    </Split>
  )
}
