import { useMemo, useState } from 'react'
import { Bar, Btn, CopyButton, CsvButton, download, FileDrop, Note, num, Panel, pct, Row, Seg, Slider, Split, Stat, Stats, useToolState } from '../kit'
import { kmeans, textOn } from './lib/image-palette-extractor'
import { assignRoles, balance, harmonies, hex, lrv, lrvSteps, lrvWord, regions, ROLES, undertone, type RGB, type Role } from './lib/room-palette-extractor'

const DEMOS = {
  sage: { name: 'Sage living room', wall: '#a9b49c', floor: '#9a6b43', sofa: '#2f3e5c', accent: '#d9a12b', trim: '#f2efe6', rug: '#e4dccb' },
  terracotta: { name: 'Terracotta bedroom', wall: '#e9dccb', floor: '#5b4636', sofa: '#7d8c86', accent: '#c0583a', trim: '#fbf8f2', rug: '#cdb8a0' },
  coastal: { name: 'Coastal kitchen', wall: '#cfdde3', floor: '#c9b28f', sofa: '#ffffff', accent: '#1f5f8b', trim: '#f7f7f4', rug: '#8fa8b5' },
} as const
type DemoId = keyof typeof DEMOS

/** Draws a simple photo-like room scene so the tool works without an upload. */
function demoImage(id: DemoId): ImageData {
  const d = DEMOS[id], W = 320, H = 240
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  const grad = (col: string, a: number, b: number) => { const gr = g.createLinearGradient(0, a, 0, b); gr.addColorStop(0, col); gr.addColorStop(1, col + 'dd'); return gr }
  g.fillStyle = d.trim; g.fillRect(0, 0, W, 18)
  g.fillStyle = grad(d.wall, 18, 160); g.fillRect(0, 18, W, 142)
  g.fillStyle = d.floor; g.fillRect(0, 160, W, 80)
  g.strokeStyle = 'rgba(0,0,0,.18)'; for (let y = 168; y < H; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke() }
  g.fillStyle = d.trim; g.fillRect(0, 154, W, 7); g.fillRect(200, 40, 90, 80)
  g.fillStyle = '#bcd3e6'; g.fillRect(206, 46, 36, 68); g.fillRect(248, 46, 36, 68)
  g.fillStyle = d.rug; g.fillRect(40, 190, 220, 40)
  g.fillStyle = d.sofa; g.fillRect(30, 110, 160, 34); g.fillRect(24, 130, 172, 40); g.fillRect(20, 120, 14, 50); g.fillRect(182, 120, 14, 50)
  g.fillStyle = d.accent; g.fillRect(46, 112, 26, 22); g.fillRect(150, 112, 26, 22); g.fillRect(70, 50, 60, 40); g.fillRect(250, 135, 18, 25)
  g.fillStyle = '#4f7a46'; g.beginPath(); g.arc(300, 120, 18, 0, 7); g.fill()
  const img = g.getImageData(0, 0, W, H)
  let seed = 3
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647
    const n = ((seed / 2147483647) - 0.5) * 14
    for (let k = 0; k < 3; k++) img.data[i + k] = Math.max(0, Math.min(255, img.data[i + k] + n))
  }
  return img
}

async function fileImage(f: File): Promise<ImageData> {
  const bmp = await createImageBitmap(f)
  const sc = Math.min(1, 320 / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc))
  const g = c.getContext('2d')!
  g.drawImage(bmp, 0, 0, c.width, c.height)
  return g.getImageData(0, 0, c.width, c.height)
}

const toRgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
const shade = (c: RGB, f: number) => hex(c.map((v) => Math.round(Math.min(255, Math.max(0, f < 1 ? v * f : v + (255 - v) * (f - 1))))) as RGB)

function RoomSvg({ p }: { p: Record<Role, RGB> }) {
  const w = hex(p.wall), wl = shade(p.wall, 0.86), t = hex(p.trim), fl = hex(p.floor), fu = hex(p.furnishing), fd = shade(p.furnishing, 0.78), a = hex(p.accent)
  return (
    <svg viewBox="0 0 400 260" style={{ width: '100%', borderRadius: 10, display: 'block' }} role="img" aria-label="Room recoloured with the palette">
      <polygon points="0,0 400,0 330,40 70,40" fill={shade(p.trim, 1.04)} />
      <polygon points="70,40 330,40 330,190 70,190" fill={w} />
      <polygon points="0,0 70,40 70,190 0,260" fill={wl} />
      <polygon points="400,0 330,40 330,190 400,260" fill={wl} />
      <polygon points="0,260 70,190 330,190 400,260" fill={fl} />
      {[205, 220, 238].map((y) => <line key={y} x1={0} x2={400} y1={y} y2={y} stroke="#000" strokeOpacity={0.12} />)}
      <polygon points="70,183 330,183 330,190 70,190" fill={t} />
      <polygon points="0,252 70,184 70,190 0,260" fill={t} />
      <rect x={232} y={62} width={76} height={72} fill={t} />
      <rect x={238} y={68} width={30} height={60} fill="#cfe2f1" /><rect x={272} y={68} width={30} height={60} fill="#cfe2f1" />
      <rect x={10} y={60} width={44} height={150} fill={t} transform="skewY(29)" opacity={0.95} />
      <rect x={14} y={66} width={36} height={144} fill={shade(p.wall, 0.75)} transform="skewY(29)" />
      <rect x={110} y={64} width={60} height={44} fill={a} stroke={t} strokeWidth={3} />
      <polygon points="110,232 300,232 280,206 128,206" fill={shade(p.furnishing, 1.45)} />
      <rect x={96} y={140} width={128} height={30} rx={6} fill={fd} />
      <rect x={90} y={160} width={140} height={34} rx={6} fill={fu} />
      <rect x={84} y={150} width={16} height={46} rx={5} fill={fd} /><rect x={220} y={150} width={16} height={46} rx={5} fill={fd} />
      <rect x={106} y={144} width={24} height={20} rx={4} fill={a} /><rect x={190} y={144} width={24} height={20} rx={4} fill={a} />
      <rect x={262} y={168} width={34} height={26} fill={fd} /><rect x={274} y={150} width={10} height={18} rx={3} fill={a} />
    </svg>
  )
}

interface State { demo: DemoId; k: number; pick: Partial<Record<Role, number>>; custom: Partial<Record<Role, string>>; focus: Role }
const DEF: State = { demo: 'sage', k: 7, pick: {}, custom: {}, focus: 'wall' }

export default function RoomPaletteExtractor() {
  const [s, set] = useToolState('room-palette-extractor', DEF)
  const [upload, setUpload] = useState<ImageData | null>(null)
  const [err, setErr] = useState('')
  const img = useMemo(() => upload ?? demoImage(s.demo), [upload, s.demo])
  const preview = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    c.getContext('2d')!.putImageData(img, 0, 0)
    return c.toDataURL()
  }, [img])

  const regs = useMemo(() => {
    const cl = kmeans(img.data, s.k, { space: 'lab', maxSamples: 30000 })
    return regions(img.data, img.width, img.height, cl.map((c) => c.rgb), 2).sort((a, b) => b.share - a.share)
  }, [img, s.k])
  const auto = useMemo(() => assignRoles(regs), [regs])
  const idx = (r: Role) => Math.min(regs.length - 1, s.pick[r] ?? auto[r])
  const pal = Object.fromEntries(ROLES.map(({ id }) => [id, s.custom[id] ? toRgb(s.custom[id]!) : regs[idx(id)]?.rgb ?? [200, 200, 200]])) as Record<Role, RGB>
  const shares = Object.fromEntries(ROLES.map(({ id }) => [id, 0])) as Record<Role, number>
  // Each cluster's area goes to the first role that uses it; unassigned clusters count towards furnishings.
  const owner = new Map<number, Role>()
  for (const { id } of ROLES) if (!owner.has(idx(id))) owner.set(idx(id), id)
  regs.forEach((r, i) => { shares[owner.get(i) ?? 'furnishing'] += r.share })
  const bal = balance(shares)
  const dWT = Math.abs(lrv(pal.wall) - lrv(pal.trim)), dWF = Math.abs(lrv(pal.wall) - lrv(pal.floor))
  const tones = ROLES.map(({ id }) => undertone(pal[id]))
  const warm = tones.filter((t) => t.kind === 'warm').length, cool = tones.filter((t) => t.kind === 'cool').length
  const focusRgb = pal[s.focus]

  const load = async (f: File) => {
    setErr('')
    try { setUpload(await fileImage(f)); set({ pick: {}, custom: {} }) } catch { setErr('Could not read that image.') }
  }
  const setRole = (r: Role, c: RGB) => set({ custom: { ...s.custom, [r]: hex(c) } })
  const rows = () => [['Role', 'Hex', 'R', 'G', 'B', 'LRV', 'Undertone'], ...ROLES.map(({ id, name }) => [name, hex(pal[id]), ...pal[id], num(lrv(pal[id]), 1), undertone(pal[id]).label])]
  const svgCard = () => {
    const sw = ROLES.map(({ id, name }, i) => `<rect x="${20 + i * 116}" y="20" width="100" height="100" rx="10" fill="${hex(pal[id])}" stroke="#ccc"/><text x="${20 + i * 116}" y="140" font-family="sans-serif" font-size="14" font-weight="bold">${name}</text><text x="${20 + i * 116}" y="158" font-family="monospace" font-size="12">${hex(pal[id])}  LRV ${num(lrv(pal[id]), 0)}</text>`).join('')
    download('room-palette.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="180"><rect width="600" height="180" fill="#fff"/>${sw}</svg>`, 'image/svg+xml')
  }

  return (
    <Split>
      <div>
        <Panel title="Room photo">
          <FileDrop accept="image/*" onFiles={(f) => void load(f[0])} label="Drop a room photo or click to choose" />
          <Row>
            <span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>or try a demo:</span>
            <Seg value={upload ? ('' as DemoId) : s.demo} onChange={(demo) => { setUpload(null); set({ demo, pick: {}, custom: {} }) }} options={Object.entries(DEMOS).map(([k, v]) => [k as DemoId, v.name])} />
          </Row>
          {err && <Note tone="err">{err}</Note>}
          {preview && <img src={preview} alt="Room being analysed" style={{ width: '100%', borderRadius: 10, marginTop: 10 }} />}
          <Slider label="Colours to extract" value={s.k} min={4} max={10} onChange={(k) => set({ k, pick: {} })} />
          <div style={{ display: 'flex', height: 26, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' }}>
            {regs.map((r, i) => <div key={i} title={`${hex(r.rgb)} · ${pct(r.share, 0)}`} style={{ flex: r.share, background: hex(r.rgb) }} />)}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Your photo stays on this device. Lighting changes how paint looks: daylight photos give the truest colours.</p>
        </Panel>
        <Panel title="Checks">
          <b>60 · 30 · 10 balance</b> <span className="muted">score {pct(bal.score, 0)}</span>
          {([['Dominant (walls + trim)', bal.dominant, 0.6], ['Secondary (furnishings + floor)', bal.secondary, 0.3], ['Accent', bal.accent, 0.1]] as const).map(([l, v, t]) => (
            <div key={l} style={{ margin: '6px 0' }}>
              <Row wrap={false}><span style={{ flex: 1, fontSize: 14 }}>{l}</span><span style={{ fontSize: 14 }}>{pct(v, 0)} <span className="muted">/ {pct(t, 0)}</span></span></Row>
              <Bar value={v} max={1} color={Math.abs(v - t) > 0.12 ? 'var(--warn)' : 'var(--ok)'} />
            </div>
          ))}
          {bal.accent < 0.04 && <Note tone="warn">The accent barely shows. Add a few more accent pieces (cushions, a throw, art) to reach roughly 10%.</Note>}
          {bal.accent > 0.2 && <Note tone="warn">The accent covers a lot of the room. Keep bold colours to about a tenth so they stay special.</Note>}
          <Note tone={dWT >= 30 ? 'ok' : 'warn'}>Wall vs trim LRV difference: <b>{num(dWT, 0)}</b> points. {dWT >= 30 ? 'Edges read clearly.' : 'A difference of 30+ points is commonly recommended so frames and edges stand out, especially for people with low vision.'}</Note>
          <Note tone={dWF >= 20 ? 'ok' : 'info'}>Wall vs floor LRV difference: <b>{num(dWF, 0)}</b>. {dWF >= 20 ? 'Floor and walls are easy to tell apart.' : 'Floor and walls are close in lightness; a contrasting rug or skirting helps define the room.'}</Note>
          <Note>{warm && cool ? `Mix of ${warm} warm and ${cool} cool colours. Mixing works best when one temperature leads and the other is used for accents.` : warm ? 'All warm: cosy and inviting. Add a cool accent if it feels heavy.' : cool ? 'All cool: calm and airy. A warm wood or brass accent adds warmth.' : 'Neutral scheme: add texture to keep it lively.'}</Note>
        </Panel>
      </div>

      <div>
        <Panel title="Your room in this palette" actions={<><CopyButton text={() => ROLES.map(({ id, name }) => `${name}: ${hex(pal[id])}`).join('\n')} label="Copy hex" /><CsvButton name="room-palette.csv" rows={rows} /><Btn onClick={svgCard}>⬇ SVG card</Btn><Btn kind="ghost" onClick={() => set({ pick: {}, custom: {} })}>Auto roles</Btn></>}>
          <RoomSvg p={pal} />
        </Panel>
        <Panel title="Decorating roles">
          {ROLES.map(({ id, name, hint }, i) => {
            const c = pal[id], v = lrv(c)
            return (
              <div key={id} onClick={() => set({ focus: id })} style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 12, padding: 8, marginBottom: 6, borderRadius: 10, cursor: 'pointer', border: `2px solid ${s.focus === id ? 'var(--accent)' : 'var(--line)'}` }}>
                <label style={{ background: hex(c), color: textOn(c), borderRadius: 8, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, cursor: 'pointer', minHeight: 64 }} title="Pick a custom colour">
                  {hex(c)}
                  <input type="color" value={hex(c)} onChange={(e) => setRole(id, toRgb(e.target.value))} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                </label>
                <div>
                  <Row wrap={false}><b style={{ flex: 1 }}>{name}</b><span className="muted" style={{ fontSize: 13 }}>{pct(shares[id], 0)} of photo</span></Row>
                  <div className="muted" style={{ fontSize: 13 }}>{hint}</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>LRV <b>{num(v, 0)}</b> ({lrvWord(v)}) · {tones[i].label}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                    {regs.map((r, j) => (
                      <button key={j} type="button" title={`Use ${hex(r.rgb)}`} onClick={(e) => { e.stopPropagation(); const cu = { ...s.custom }; delete cu[id]; set({ pick: { ...s.pick, [id]: j }, custom: cu }) }}
                        style={{ width: 22, height: 22, borderRadius: 6, background: hex(r.rgb), border: !s.custom[id] && idx(id) === j ? '2px solid var(--accent)' : '1px solid var(--line)', cursor: 'pointer', padding: 0 }} />
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </Panel>
        <Panel title={`Alternatives for ${ROLES.find((r) => r.id === s.focus)!.name.toLowerCase()}`}>
          <p className="muted" style={{ fontSize: 13 }}>Click a swatch to try it in the room. Select another role above to explore its options.</p>
          <b style={{ fontSize: 14 }}>Same hue, different lightness (LRV 85 → 25)</b>
          <div style={{ display: 'flex', gap: 6, margin: '6px 0 12px' }}>
            {lrvSteps(focusRgb).map((c, i) => (
              <button key={i} type="button" onClick={() => setRole(s.focus, c)} style={{ flex: 1, height: 44, borderRadius: 8, border: '1px solid var(--line)', background: hex(c), color: textOn(c), fontSize: 11, cursor: 'pointer' }}>LRV {num(lrv(c), 0)}</button>
            ))}
          </div>
          {harmonies(focusRgb).map((h) => (
            <div key={h.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 150, fontSize: 14 }}>{h.name}</span>
              {h.colors.map((c, i) => (
                <button key={i} type="button" title={hex(c)} onClick={() => setRole(s.focus, c)} style={{ flex: 1, height: 32, borderRadius: 6, border: '1px solid var(--line)', background: hex(c), color: textOn(c), fontSize: 11, cursor: 'pointer' }}>{hex(c)}</button>
              ))}
            </div>
          ))}
        </Panel>
        <Stats>
          <Stat label="Wall LRV" value={num(lrv(pal.wall), 0)} sub={lrv(pal.wall) < 20 ? 'Dark: cosy, absorbs light' : lrv(pal.wall) > 75 ? 'Bright: bounces light' : 'Balanced'} />
          <Stat label="Balance" value={pct(bal.score, 0)} tone={bal.score > 0.75 ? 'good' : undefined} sub="vs 60-30-10" />
          <Stat label="Temperature" value={warm > cool ? 'Warm' : cool > warm ? 'Cool' : 'Neutral'} sub={`${warm} warm · ${cool} cool`} />
        </Stats>
      </div>
    </Split>
  )
}
