import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Btn, Check, download, FileDrop, Note, Panel, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { brush, floodFill, lrv, recolor, toLab, type Layer } from './lib/wall-color-previewer'

type Tool = 'fill' | 'unfill' | 'brush' | 'erase' | 'compare'
interface State { layers: (Layer & { name: string })[]; active: number; tol: number; size: number; smart: boolean; split: number; showMask: boolean }

const DEF: State = {
  layers: [
    { name: 'Main walls', color: '#8fa58a', strength: 1 },
    { name: 'Accent wall', color: '#2f4f6a', strength: 1 },
    { name: 'Trim / other', color: '#f2ede3', strength: 1 },
  ],
  active: 0, tol: 12, size: 18, smart: true, split: 0.5, showMask: false,
}

const SWATCHES: [string, [string, string][]][] = [
  ['Whites & neutrals', [['Chalk white', '#f4f1ea'], ['Warm white', '#f2ede3'], ['Linen', '#e9e0d1'], ['Greige', '#c9c0b1'], ['Pebble grey', '#a9a8a2'], ['Charcoal', '#3d3f42']]],
  ['Greens', [['Sage', '#8fa58a'], ['Eucalyptus', '#6f8f7f'], ['Olive', '#7a7a4f'], ['Forest', '#2f4a3a'], ['Mint', '#cfe3d4']]],
  ['Blues', [['Powder blue', '#bcd0de'], ['Coastal blue', '#6f93ad'], ['Slate blue', '#56687e'], ['Deep navy', '#2f4f6a'], ['Teal', '#2f6f73']]],
  ['Warm', [['Blush', '#e8c9c0'], ['Terracotta', '#c0694a'], ['Ochre', '#c99a3e'], ['Butter', '#f1df9e'], ['Clay', '#a5776a'], ['Aubergine', '#5a3d4f']]],
]

/** Demo living room drawn in code, so the tool works without a photo. */
function drawRoom(ctx: CanvasRenderingContext2D, W: number, H: number) {
  const poly = (pts: number[][], fill: string | CanvasGradient) => {
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
  }
  const bx0 = 200, bx1 = 760, by0 = 70, by1 = 440
  const light = ctx.createRadialGradient(330, 200, 30, 330, 220, 620)
  light.addColorStop(0, '#e4dccd'); light.addColorStop(1, '#cbc1b1')
  poly([[0, 0], [W, 0], [bx1, by0], [bx0, by0]], '#ecebe6')
  poly([[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]], light)
  const lw = ctx.createLinearGradient(0, 0, bx0, 0)
  lw.addColorStop(0, '#bdb3a3'); lw.addColorStop(1, '#cfc5b5')
  poly([[0, 0], [bx0, by0], [bx0, by1], [0, H]], lw)
  const rw = ctx.createLinearGradient(bx1, 0, W, 0)
  rw.addColorStop(0, '#d6ccbc'); rw.addColorStop(1, '#c8beae')
  poly([[W, 0], [bx1, by0], [bx1, by1], [W, H]], rw)
  // crown shadow between ceiling and walls
  ctx.strokeStyle = '#8f8778'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(0, 0); ctx.lineTo(bx0, by0); ctx.lineTo(bx1, by0); ctx.lineTo(W, 0)
  ctx.stroke()
  // wooden floor with perspective planks
  const fl = ctx.createLinearGradient(0, by1, 0, H)
  fl.addColorStop(0, '#8a6342'); fl.addColorStop(1, '#a87b52')
  poly([[0, H], [bx0, by1], [bx1, by1], [W, H]], fl)
  ctx.strokeStyle = 'rgba(60,40,20,.35)'
  ctx.lineWidth = 1.5
  for (let i = 0; i <= 14; i++) {
    const t = i / 14
    ctx.beginPath()
    ctx.moveTo(bx0 + (bx1 - bx0) * t, by1)
    ctx.lineTo(W * t, H)
    ctx.stroke()
  }
  // baseboards with a shadow gap
  poly([[bx0, by1 - 14], [bx1, by1 - 14], [bx1, by1], [bx0, by1]], '#f3f1ec')
  ctx.fillStyle = '#6f6656'
  ctx.fillRect(bx0, by1 - 16, bx1 - bx0, 2.5)
  poly([[0, H - 26], [bx0, by1 - 14], [bx0, by1], [0, H]], '#e6e3dc')
  poly([[0, H - 29], [bx0, by1 - 16.5], [bx0, by1 - 14], [0, H - 26]], '#6f6656')
  // window with sky and frame
  ctx.fillStyle = '#6b6354'
  ctx.fillRect(252, 122, 156, 216)
  ctx.fillStyle = '#f7f6f2'
  ctx.fillRect(255, 125, 150, 210)
  const sky = ctx.createLinearGradient(0, 135, 0, 325)
  sky.addColorStop(0, '#7fb3e0'); sky.addColorStop(1, '#d6ecf7')
  ctx.fillStyle = sky
  ctx.fillRect(265, 135, 130, 190)
  ctx.fillStyle = '#7aa36b'
  ctx.beginPath()
  ctx.ellipse(300, 330, 70, 40, 0, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#f7f6f2'
  ctx.fillRect(327, 135, 6, 190)
  ctx.fillRect(265, 228, 130, 6)
  // framed picture
  ctx.fillStyle = '#3a2d22'
  ctx.fillRect(500, 150, 170, 112)
  const art = ctx.createLinearGradient(510, 160, 660, 252)
  art.addColorStop(0, '#e9a15b'); art.addColorStop(0.5, '#d2524a'); art.addColorStop(1, '#3d5a80')
  ctx.fillStyle = art
  ctx.fillRect(510, 160, 150, 92)
  // sofa
  ctx.fillStyle = '#3f4b55'
  ctx.beginPath()
  ctx.roundRect(445, 315, 280, 85, 14)
  ctx.fill()
  ctx.fillStyle = '#4b5964'
  ctx.beginPath()
  ctx.roundRect(430, 370, 310, 75, 12)
  ctx.fill()
  ctx.fillStyle = '#2b333a'
  ctx.fillRect(445, 445, 10, 18); ctx.fillRect(715, 445, 10, 18)
  ctx.fillStyle = '#d9b44a'
  ctx.beginPath()
  ctx.roundRect(470, 335, 60, 45, 8)
  ctx.fill()
  // plant
  ctx.fillStyle = '#b8653f'
  ctx.beginPath()
  ctx.moveTo(95, 470); ctx.lineTo(165, 470); ctx.lineTo(155, 540); ctx.lineTo(105, 540)
  ctx.fill()
  ctx.fillStyle = '#3f7a46'
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.32
    ctx.beginPath()
    ctx.ellipse(130 + Math.cos(a) * 55, 465 + Math.sin(a) * 75, 14, 42, a + Math.PI / 2, 0, Math.PI * 2)
    ctx.fill()
  }
  // floor lamp
  ctx.fillStyle = '#2e2e2e'
  ctx.fillRect(812, 250, 5, 300)
  ctx.fillRect(790, 548, 50, 6)
  ctx.fillStyle = '#fde9a8'
  ctx.strokeStyle = '#5b4a2a'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(785, 250); ctx.lineTo(845, 250); ctx.lineTo(832, 200); ctx.lineTo(798, 200); ctx.closePath()
  ctx.fill()
  ctx.stroke()
  // soft sensor noise for realism (deterministic)
  const im = ctx.getImageData(0, 0, W, H)
  let seed = 7
  for (let i = 0; i < im.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const n = ((seed >> 16) % 7) - 3
    im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n
  }
  ctx.putImageData(im, 0, 0)
}

interface Img { w: number; h: number; src: Uint8ClampedArray; lab: Float32Array }
interface Doc { img: Img; before: HTMLCanvasElement; mask: Uint8Array }

function makeDoc(source: CanvasImageSource | null, w: number, h: number): Doc {
  const scale = Math.min(1, 1200 / Math.max(w, h))
  const W = Math.round(w * scale), H = Math.round(h * scale)
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  if (source) ctx.drawImage(source, 0, 0, W, H)
  else drawRoom(ctx, W, H)
  const src = ctx.getImageData(0, 0, W, H).data
  const img = { w: W, h: H, src, lab: toLab(src) }
  const mask = new Uint8Array(W * H)
  if (!source) for (const [x, y] of [[720, 110], [60, 300], [850, 300]]) floodFill(img.lab, W, H, x, y, 12, mask, 1)
  return { img, before: c, mask }
}

export default function WallColorPreviewer() {
  const [s, set, reset] = useToolState('wall-color-previewer', DEF)
  const [tool, setTool] = useState<Tool>('fill')
  const [ver, setVer] = useState(0)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState('Demo room loaded: the walls are pre-selected. Pick a colour, or upload your own photo.')
  const [doc, setDoc] = useState<Doc>(() => makeDoc(null, 900, 600))
  const [undoN, setUndoN] = useState(0)
  const undo = useRef<Uint8Array[]>([])
  const out = useRef<HTMLCanvasElement | null>(null)
  const view = useRef<HTMLCanvasElement>(null)
  const drag = useRef(false)
  const raf = useRef(0)

  const load = (source: CanvasImageSource | null, w: number, h: number) => {
    setDoc(makeDoc(source, w, h))
    undo.current = []
    setUndoN(0)
  }

  const render = useCallback(() => {
    const I = doc.img, cv = view.current
    if (!cv) return
    if (!out.current) out.current = document.createElement('canvas')
    const o = out.current
    o.width = I.w; o.height = I.h
    const px = recolor(I.src, I.lab, doc.mask, s.layers)
    if (s.showMask) {
      const m = doc.mask
      for (let i = 0; i < m.length; i++) if (m[i] && ((i % I.w) + Math.floor(i / I.w)) % 8 < 3) px.set([255, 0, 200], i * 4)
    }
    o.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px), I.w, I.h), 0, 0)
    cv.width = I.w; cv.height = I.h
    const ctx = cv.getContext('2d')!
    ctx.drawImage(o, 0, 0)
    if (tool === 'compare') {
      const x = Math.round(I.w * s.split)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, x, I.h)
      ctx.clip()
      ctx.drawImage(doc.before, 0, 0)
      ctx.restore()
      ctx.fillStyle = '#fff'
      ctx.fillRect(x - 1.5, 0, 3, I.h)
      ctx.beginPath()
      ctx.arc(x, I.h / 2, 16, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#333'
      ctx.font = 'bold 14px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('◂▸', x, I.h / 2 + 5)
      ctx.font = 'bold 15px system-ui'
      const tag = (t: string, tx: number) => {
        ctx.fillStyle = 'rgba(0,0,0,.55)'
        ctx.fillRect(tx - 40, 10, 80, 24)
        ctx.fillStyle = '#fff'
        ctx.fillText(t, tx, 27)
      }
      tag('Before', Math.max(50, x / 2)); tag('After', Math.min(I.w - 50, x + (I.w - x) / 2))
    }
  }, [doc, s.layers, s.showMask, s.split, tool])

  useEffect(() => {
    render()
  }, [render, ver])

  const coords = (e: React.PointerEvent) => {
    const r = view.current!.getBoundingClientRect(), I = doc.img
    return [((e.clientX - r.left) / r.width) * I.w, ((e.clientY - r.top) / r.height) * I.h]
  }
  const pushUndo = () => {
    undo.current.push(doc.mask.slice())
    if (undo.current.length > 15) undo.current.shift()
    setUndoN(undo.current.length)
  }
  const apply = (e: React.PointerEvent, first: boolean) => {
    const I = doc.img
    const [x, y] = coords(e)
    if (tool === 'compare') {
      set({ split: Math.min(1, Math.max(0, x / I.w)) })
      return
    }
    const layer = s.active + 1
    if (tool === 'fill' || tool === 'unfill') {
      if (!first) return
      pushUndo()
      const tmp = new Uint8Array(I.w * I.h)
      const n = floodFill(I.lab, I.w, I.h, Math.floor(x), Math.floor(y), s.tol, tmp, 1)
      const m = doc.mask
      for (let i = 0; i < m.length; i++) if (tmp[i]) m[i] = tool === 'fill' ? layer : m[i] === layer ? 0 : m[i]
      setInfo(`${tool === 'fill' ? 'Added' : 'Removed'} ${n.toLocaleString()} pixels (${((n / m.length) * 100).toFixed(1)}% of the image).`)
    } else {
      if (first) pushUndo()
      const r = (s.size * I.w) / 900
      if (tool === 'brush') brush(I.lab, I.w, I.h, x, y, r, doc.mask, layer, s.smart ? s.tol * 1.5 : 0)
      else {
        const m = doc.mask, tmp = m.slice()
        brush(I.lab, I.w, I.h, x, y, r, tmp, 0)
        for (let i = 0; i < m.length; i++) if (m[i] === layer && !tmp[i]) m[i] = 0
      }
    }
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => setVer((v) => v + 1))
  }

  const onFile = (f: File) => {
    const url = URL.createObjectURL(f)
    const im = new Image()
    setBusy(true)
    im.onload = () => {
      load(im, im.naturalWidth, im.naturalHeight)
      URL.revokeObjectURL(url)
      setBusy(false)
      setInfo('Photo loaded. Click a wall with the Fill tool, then refine edges with the brush.')
    }
    im.onerror = () => {
      setBusy(false)
      setInfo('Could not read that image.')
    }
    im.src = url
  }

  const L = s.layers[s.active]
  const setLayer = (p: Partial<State['layers'][number]>) => set({ layers: s.layers.map((l, i) => (i === s.active ? { ...l, ...p } : l)) })
  const counts = useMemo(() => {
    const c = [0, 0, 0, 0]
    for (const v of doc.mask) c[v]++
    return c.slice(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, ver])
  const total = doc.mask.length || 1
  const lr = lrv(L.color)

  return (
    <Split wide="right">
      <div>
        <Panel title="Wall layers">
          <Seg value={String(s.active)} onChange={(v) => set({ active: +v })} options={s.layers.map((l, i) => [String(i), l.name] as [string, string])} />
          <Row>
            <input type="color" value={L.color} onChange={(e) => setLayer({ color: e.target.value })} aria-label="Paint colour" style={{ width: 54, height: 40, border: 0, background: 'none' }} />
            <input className="k-text" value={L.name} onChange={(e) => setLayer({ name: e.target.value })} aria-label="Layer name" style={{ flex: 1 }} />
          </Row>
          <Slider label="Coverage / opacity" value={Math.round(L.strength * 100)} onChange={(v) => setLayer({ strength: v / 100 })} min={0} max={100} unit="%" show={(v) => String(v)} />
          {SWATCHES.map(([g, list]) => (
            <div key={g} style={{ marginTop: 8 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{g}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {list.map(([n, c]) => (
                  <button key={n} type="button" title={`${n} ${c}`} onClick={() => setLayer({ color: c })}
                    style={{ width: 34, height: 34, borderRadius: 8, background: c, cursor: 'pointer', border: L.color === c ? '3px solid var(--accent)' : '1px solid var(--line)' }} />
                ))}
              </div>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12 }}>Generic colour names. To match a real paint, copy its hex code from the maker’s colour card into the picker.</p>
        </Panel>
        <Panel title="Selection">
          <Seg value={tool} onChange={setTool} options={[['fill', '🪣 Fill'], ['unfill', '− Fill'], ['brush', '🖌 Brush'], ['erase', '⌫ Erase'], ['compare', '◂▸ Compare']]} />
          <Slider label="Fill tolerance" value={s.tol} onChange={(tol) => set({ tol })} min={2} max={40} show={(v) => String(v)} />
          <Slider label="Brush size" value={s.size} onChange={(size) => set({ size })} min={3} max={80} unit=" px" show={(v) => String(v)} />
          <Check label="Smart brush (only paints colours similar to the spot under the brush)" value={s.smart} onChange={(smart) => set({ smart })} />
          <Check label="Show selection pattern" value={s.showMask} onChange={(showMask) => set({ showMask })} />
          <Row>
            <Btn onClick={() => { const u = undo.current.pop(); setUndoN(undo.current.length); if (u) setDoc({ ...doc, mask: u }) }} disabled={!undoN}>↶ Undo</Btn>
            <Btn kind="ghost" onClick={() => { pushUndo(); setDoc({ ...doc, mask: doc.mask.map((v) => (v === s.active + 1 ? 0 : v)) }) }}>Clear layer</Btn>
          </Row>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label={`${L.name} colour`} value={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><i style={{ width: 18, height: 18, borderRadius: 4, background: L.color, display: 'inline-block', border: '1px solid var(--line)' }} />{L.color}</span>} />
          <Stat label="Light reflectance (est.)" value={`LRV ${lr.toFixed(0)}`} sub={lr > 60 ? 'bright: opens up a room' : lr > 30 ? 'mid-tone' : 'dark: cosy, absorbs light'} />
          <Stat label="Selected" value={`${((counts[s.active] / total) * 100).toFixed(1)}%`} sub="of image in this layer" />
        </Stats>
        <Panel
          title="Preview"
          actions={
            <>
              <Btn onClick={() => load(null, 900, 600)}>Demo room</Btn>
              <Btn onClick={() => out.current?.toBlob((b) => b && download('wall-colour-preview.png', b))}>⬇ PNG</Btn>
              <Btn kind="ghost" onClick={reset}>Reset colours</Btn>
            </>
          }
        >
          <canvas
            ref={view}
            onPointerDown={(e) => {
              drag.current = true
              ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
              apply(e, true)
            }}
            onPointerMove={(e) => drag.current && tool !== 'fill' && tool !== 'unfill' && apply(e, false)}
            onPointerUp={() => (drag.current = false)}
            style={{ width: '100%', height: 'auto', borderRadius: 10, display: 'block', touchAction: 'none', cursor: tool === 'compare' ? 'ew-resize' : 'crosshair' }}
          />
          {tool === 'compare' && <Slider label="Before / after" value={Math.round(s.split * 100)} onChange={(v) => set({ split: v / 100 })} min={0} max={100} unit="%" show={(v) => String(v)} />}
          <Note tone={busy ? 'warn' : 'info'}>{busy ? 'Loading…' : info}</Note>
          <FileDrop accept="image/*" onFiles={([f]) => onFile(f)} label="Drop a room photo or click to choose (stays on your device)" />
        </Panel>
        <Panel title="How it works">
          <p>
            <b>Fill</b> grows a region from the pixel you click, adding neighbours whose colour is within the tolerance (measured in the perceptual OKLab space)
            of both the clicked colour and the neighbour they connect to, so it follows soft lighting but stops at edges. <b>Brush</b> and <b>Erase</b> refine edges.
          </p>
          <p>
            Recolouring keeps each pixel’s lightness relative to the wall’s average, so shadows, light falloff and texture survive, while hue and chroma come from the
            paint. Screens and lighting vary: always test a physical sample on the wall before buying.
          </p>
        </Panel>
      </div>
    </Split>
  )
}
