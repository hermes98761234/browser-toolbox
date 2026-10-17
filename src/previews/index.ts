// Procedural card thumbnails: a stylised mock of the tool's UI in its category colours.
// Deterministic per tool, drawn once on a 320×180 canvas when a card scrolls into view.
import type { Kind, Tool } from '../lib/catalog'
import { CAT_STYLE } from '../lib/data'

type Ctx = CanvasRenderingContext2D

export function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h},${s}%,${l}%,${a})`

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number | number[]) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

type Draw = (ctx: Ctx, x: number, y: number, w: number, h: number, hue: number, r: () => number) => void

const line = (ctx: Ctx, x: number, y: number, w: number, c: string, t = 5) => {
  ctx.fillStyle = c
  rr(ctx, x, y, w, t, t / 2)
  ctx.fill()
}

const field = (ctx: Ctx, x: number, y: number, w: number, hue: number) => {
  line(ctx, x, y, w * 0.4, hsl(hue, 15, 60), 4)
  ctx.strokeStyle = hsl(hue, 30, 82)
  ctx.lineWidth = 1.5
  rr(ctx, x, y + 8, w, 16, 4)
  ctx.stroke()
  line(ctx, x + 6, y + 14, w * 0.3, hsl(hue, 20, 40), 4)
}

const chartLine = (ctx: Ctx, x: number, y: number, w: number, h: number, hue: number, r: () => number, area = true) => {
  const n = 9
  let v = 0.3 + r() * 0.3
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    v = Math.min(0.95, Math.max(0.08, v + (r() - 0.35) * 0.25))
    pts.push([x + (i / (n - 1)) * w, y + h - v * h])
  }
  if (area) {
    const g = ctx.createLinearGradient(0, y, 0, y + h)
    g.addColorStop(0, hsl(hue, 80, 55, 0.45))
    g.addColorStop(1, hsl(hue, 80, 55, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(x, y + h)
    for (const p of pts) ctx.lineTo(...p)
    ctx.lineTo(x + w, y + h)
    ctx.fill()
  }
  ctx.strokeStyle = hsl(hue, 80, 48)
  ctx.lineWidth = 2.5
  ctx.lineJoin = 'round'
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)))
  ctx.stroke()
}

const bars = (ctx: Ctx, x: number, y: number, w: number, h: number, hue: number, r: () => number, n = 7) => {
  const bw = w / n
  for (let i = 0; i < n; i++) {
    const v = 0.2 + r() * 0.8
    ctx.fillStyle = hsl(hue + (i % 3) * 25, 75, 50 + (i % 2) * 8)
    rr(ctx, x + i * bw + bw * 0.15, y + h - v * h, bw * 0.7, v * h, 3)
    ctx.fill()
  }
}

const KIND_DRAW: Record<Kind, Draw> = {
  calculator: (ctx, x, y, w, h, hue, r) => {
    const fw = w * 0.42
    for (let i = 0; i < 3; i++) field(ctx, x, y + i * 30, fw, hue)
    ctx.fillStyle = hsl(hue, 70, 96)
    rr(ctx, x + fw + 14, y, w - fw - 14, h, 8)
    ctx.fill()
    line(ctx, x + fw + 24, y + 10, 50, hsl(hue, 20, 60), 4)
    ctx.fillStyle = hsl(hue, 75, 38)
    ctx.font = 'bold 22px system-ui, sans-serif'
    ctx.fillText((r() * 9000 + 100).toFixed(0), x + fw + 24, y + 40)
    bars(ctx, x + fw + 24, y + 50, w - fw - 34, h - 58, hue, r, 6)
  },
  converter: (ctx, x, y, w, h, hue, r) => {
    const fw = (w - 40) / 2
    for (const [i, xx] of [x, x + fw + 40].entries()) {
      ctx.fillStyle = hsl(hue, 70, 96)
      rr(ctx, xx, y + 10, fw, h - 20, 8)
      ctx.fill()
      line(ctx, xx + 10, y + 22, fw * 0.5, hsl(hue, 20, 60), 4)
      ctx.fillStyle = hsl(hue + i * 40, 70, 40)
      ctx.font = 'bold 18px system-ui, sans-serif'
      ctx.fillText((r() * 999).toFixed(i ? 2 : 0), xx + 10, y + 52)
      for (let k = 0; k < 3; k++) line(ctx, xx + 10, y + 66 + k * 10, fw * (0.4 + r() * 0.4), hsl(hue, 20, 82), 4)
    }
    ctx.fillStyle = hsl(hue, 80, 50)
    ctx.beginPath()
    ctx.arc(x + fw + 20, y + h / 2, 13, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 15px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('⇄', x + fw + 20, y + h / 2 + 5)
    ctx.textAlign = 'left'
  },
  tracker: (ctx, x, y, w, h, hue, r) => {
    const lw = w * 0.55
    for (let i = 0; i < 5; i++) {
      const yy = y + i * (h / 5)
      ctx.fillStyle = r() > 0.4 ? hsl(140, 60, 45) : hsl(hue, 20, 80)
      rr(ctx, x, yy + 3, 12, 12, 3)
      ctx.fill()
      line(ctx, x + 18, yy + 7, lw * (0.4 + r() * 0.4), hsl(hue, 15, 55), 5)
    }
    chartLine(ctx, x + lw + 10, y + 4, w - lw - 10, h - 8, hue, r)
  },
  planner: (ctx, x, y, w, h, hue, r) => {
    const cols = 7, rows = 4
    const cw = w / cols, ch = h / rows
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        ctx.fillStyle = r() > 0.72 ? hsl(hue + r() * 60, 70, 60) : hsl(hue, 30, 94)
        rr(ctx, x + j * cw + 2, y + i * ch + 2, cw - 4, ch - 4, 4)
        ctx.fill()
      }
  },
  generator: (ctx, x, y, w, h, hue, r) => {
    for (let i = 0; i < 3; i++) {
      const xx = x + i * (w / 3) + 4
      ctx.fillStyle = hsl(hue + i * 30, 70, 92)
      rr(ctx, xx, y + (i % 2) * 8, w / 3 - 8, h - 8, 8)
      ctx.fill()
      ctx.fillStyle = hsl(hue + i * 30, 75, 52)
      rr(ctx, xx + 8, y + 10 + (i % 2) * 8, w / 3 - 24, h * 0.4, 6)
      ctx.fill()
      for (let k = 0; k < 3; k++) line(ctx, xx + 8, y + h * 0.55 + k * 10 + (i % 2) * 8, (w / 3 - 24) * (0.5 + r() * 0.5), hsl(hue, 15, 70), 4)
    }
  },
  visualizer: (ctx, x, y, w, h, hue, r) => {
    ctx.fillStyle = hsl(hue, 40, 14)
    rr(ctx, x, y, w, h, 8)
    ctx.fill()
    ctx.strokeStyle = hsl(hue, 30, 30)
    ctx.lineWidth = 1
    for (let i = 1; i < 6; i++) {
      ctx.beginPath()
      ctx.moveTo(x, y + (i * h) / 6)
      ctx.lineTo(x + w, y + (i * h) / 6)
      ctx.stroke()
    }
    chartLine(ctx, x + 6, y + 8, w - 12, h - 16, hue, r)
    chartLine(ctx, x + 6, y + 8, w - 12, h - 16, hue + 120, r, false)
  },
  editor: (ctx, x, y, w, h, hue, r) => {
    ctx.fillStyle = hsl(hue, 30, 92)
    rr(ctx, x, y, w, 18, 5)
    ctx.fill()
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = hsl(hue + i * 40, 60, 55)
      rr(ctx, x + 6 + i * 18, y + 4, 12, 10, 3)
      ctx.fill()
    }
    ctx.fillStyle = '#fff'
    rr(ctx, x, y + 24, w, h - 24, 6)
    ctx.fill()
    ctx.lineCap = 'round'
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = hsl(hue + k * 70, 75, 52)
      ctx.lineWidth = 4
      ctx.beginPath()
      let px = x + 14 + r() * 20, py = y + 40 + r() * (h - 60)
      ctx.moveTo(px, py)
      for (let i = 0; i < 5; i++) {
        px += 15 + r() * 25
        py = Math.min(y + h - 8, Math.max(y + 32, py + (r() - 0.5) * 40))
        ctx.quadraticCurveTo(px - 10, py - 20 * r(), px, py)
      }
      ctx.stroke()
    }
  },
  analyzer: (ctx, x, y, w, h, hue, r) => {
    bars(ctx, x, y + 6, w * 0.62, h - 6, hue, r, 8)
    const cx = x + w * 0.8, cy = y + h * 0.45
    ctx.strokeStyle = hsl(hue, 70, 40)
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(cx, cy, 22, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx + 16, cy + 16)
    ctx.lineTo(cx + 34, cy + 34)
    ctx.stroke()
  },
  learning: (ctx, x, y, w, h, hue, r) => {
    for (let i = 2; i >= 0; i--) {
      ctx.fillStyle = hsl(hue, 60, 96 - i * 8)
      rr(ctx, x + w * 0.15 + i * 8, y + i * 6, w * 0.7, h - 12, 10)
      ctx.fill()
    }
    ctx.fillStyle = hsl(hue, 70, 35)
    ctx.font = 'bold 26px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(['?', 'A', '✓', 'π', 'Aa'][Math.floor(r() * 5)], x + w / 2, y + h / 2 + 4)
    ctx.textAlign = 'left'
    line(ctx, x + w * 0.3, y + h - 34, w * 0.4, hsl(hue, 30, 75), 6)
  },
  timer: (ctx, x, y, w, h, hue, r) => {
    const cx = x + w / 2, cy = y + h / 2, rad = h / 2 - 4
    ctx.lineWidth = 10
    ctx.strokeStyle = hsl(hue, 30, 88)
    ctx.beginPath()
    ctx.arc(cx, cy, rad, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = hsl(hue, 80, 50)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (0.3 + r() * 0.6))
    ctx.stroke()
    ctx.fillStyle = hsl(hue, 60, 30)
    ctx.font = 'bold 18px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(`${String(Math.floor(r() * 59)).padStart(2, '0')}:${String(Math.floor(r() * 59)).padStart(2, '0')}`, cx, cy + 6)
    ctx.textAlign = 'left'
  },
  reference: (ctx, x, y, w, h, hue, r) => {
    const rows = 6, cols = 3
    for (let i = 0; i < rows; i++) {
      ctx.fillStyle = i === 0 ? hsl(hue, 60, 50) : i % 2 ? hsl(hue, 30, 95) : hsl(hue, 30, 89)
      rr(ctx, x, y + (i * h) / rows, w, h / rows - 2, 3)
      ctx.fill()
      for (let j = 0; j < cols; j++) line(ctx, x + 8 + (j * w) / cols, y + (i * h) / rows + h / rows / 2 - 4, (w / cols - 20) * (0.4 + r() * 0.6), i === 0 ? '#fff' : hsl(hue, 15, 60), 4)
    }
  },
  utility: (ctx, x, y, w, h, hue, r) => {
    for (let i = 0; i < 4; i++) {
      const yy = y + i * (h / 4) + 4
      line(ctx, x, yy + 5, w * (0.35 + r() * 0.25), hsl(hue, 15, 55), 5)
      const on = r() > 0.4
      ctx.fillStyle = on ? hsl(hue, 75, 50) : hsl(hue, 15, 80)
      rr(ctx, x + w - 40, yy, 32, 16, 8)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(x + w - (on ? 16 : 32), yy + 8, 6, 0, Math.PI * 2)
      ctx.fill()
    }
  },
}

/** Isometric wireframe surface used as the backdrop of 3D tools. */
function surface3d(ctx: Ctx, cx: number, cy: number, s: number, hue: number, r: () => number) {
  const n = 9
  const a = r() * 2 + 1, b = r() * 2 + 1
  const P = (i: number, j: number) => {
    const u = i / (n - 1) - 0.5, v = j / (n - 1) - 0.5
    const z = Math.sin(u * a * 5) * Math.cos(v * b * 5) * 0.18
    return [cx + (u - v) * s * 0.9, cy + (u + v) * s * 0.45 - z * s] as const
  }
  ctx.lineWidth = 1.2
  for (let i = 0; i < n; i++) {
    ctx.strokeStyle = hsl(hue + 180, 80, 70, 0.75)
    ctx.beginPath()
    for (let j = 0; j < n; j++) (j ? ctx.lineTo : ctx.moveTo).apply(ctx, [...P(i, j)])
    ctx.stroke()
    ctx.beginPath()
    for (let j = 0; j < n; j++) (j ? ctx.lineTo : ctx.moveTo).apply(ctx, [...P(j, i)])
    ctx.stroke()
  }
}

export function drawPreview(c: HTMLCanvasElement, t: Tool) {
  const ctx = c.getContext('2d')
  if (!ctx) return
  const W = c.width, H = c.height
  const r = rng(t.n * 2654435761)
  const { hue, icon } = CAT_STYLE[t.cat] ?? { hue: 220, icon: '🧰' }
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, hsl(hue, 70, 52))
  g.addColorStop(1, hsl(hue + 35, 75, 32))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // soft blobs
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = hsl(hue + 60 * r(), 90, 75, 0.18)
    ctx.beginPath()
    ctx.arc(r() * W, r() * H, 30 + r() * 70, 0, Math.PI * 2)
    ctx.fill()
  }
  if (t.dim === '3D') surface3d(ctx, W * 0.72, H * 0.5, 150, hue, r)
  // app window
  const x = 18, y = 22, w = t.dim === '3D' ? W * 0.56 : W * 0.72, h = H - 44
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.35)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 6
  ctx.fillStyle = '#ffffff'
  rr(ctx, x, y, w, h, 10)
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = hsl(hue, 40, 94)
  rr(ctx, x, y, w, 16, [10, 10, 0, 0])
  ctx.fill()
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = ['#f87171', '#fbbf24', '#34d399'][i]
    ctx.beginPath()
    ctx.arc(x + 10 + i * 9, y + 8, 3, 0, Math.PI * 2)
    ctx.fill()
  }
  KIND_DRAW[t.kind](ctx, x + 10, y + 24, w - 20, h - 32, hue, r)
  // category icon
  ctx.font = `${t.dim === '3D' ? 40 : 54}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,.3)'
  ctx.shadowBlur = 10
  ctx.fillText(icon, t.dim === '3D' ? W - 40 : W - 44, t.dim === '3D' ? 36 : H / 2)
  ctx.shadowBlur = 0
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}
