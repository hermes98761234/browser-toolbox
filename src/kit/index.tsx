// Building blocks shared by every tool: layout, inputs, results, tables, charts, persistence.
// Tools are English-only and import everything they need from here.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { clamp, decodeState, download, encodeState, fmt, niceTicks, toCsv } from '../kitlib'

export { clamp, download, fmt, niceTicks, toCsv }

// ---------- state ----------

/** Reads `s=` from the tool's share link (#/tool/<slug>?s=…). */
function sharedState(): unknown {
  const m = /[?&]s=([^&]+)/.exec(location.hash)
  if (!m) return undefined
  try {
    return decodeState(m[1])
  } catch {
    return undefined
  }
}

function mergeDef<S>(def: S, v: unknown): S {
  if (v === undefined || v === null) return def
  if (typeof def === 'object' && def && !Array.isArray(def) && typeof v === 'object' && !Array.isArray(v)) return { ...def, ...(v as object) }
  return Array.isArray(def) === Array.isArray(v) ? (v as S) : def
}

/**
 * Tool state persisted in localStorage under `tb:<id>`, overridable by a share link.
 * Returns [state, update(patch | fn), reset].
 */
export function useToolState<S>(id: string, def: S): [S, (p: Partial<S> | ((s: S) => S)) => void, () => void] {
  const key = `tb:${id}`
  const [state, setState] = useState<S>(() => {
    const shared = sharedState()
    if (shared !== undefined) return mergeDef(def, shared)
    try {
      const raw = localStorage.getItem(key)
      if (raw) return mergeDef(def, JSON.parse(raw))
    } catch {
      /* ignore */
    }
    return def
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      /* quota or private mode */
    }
  }, [key, state])
  const update = useCallback(
    (p: Partial<S> | ((s: S) => S)) => setState((s) => (typeof p === 'function' ? (p as (s: S) => S)(s) : ({ ...s, ...p } as S))),
    [],
  )
  const reset = useCallback(() => setState(def), [def])
  return [state, update, reset]
}

/** Link that reopens the current tool with `state` (inputs only; keep it small). */
export function shareLink(state: unknown): string {
  const base = location.hash.replace(/\?.*$/, '')
  return `${location.origin}${location.pathname}${base}?s=${encodeState(state)}`
}

// ---------- formatting ----------

export const money = (x: number, cur = '$', digits = 2) =>
  Number.isFinite(x) ? `${x < 0 ? '−' : ''}${cur}${Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}` : '—'
export const num = (x: number, digits = 2) =>
  Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'
export const pct = (x: number, digits = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : '—')
export const uid = () => Math.random().toString(36).slice(2, 10)
export const today = () => new Date().toISOString().slice(0, 10)

/** Categorical palette used by charts (works on light and dark). */
export const PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#f97316', '#ec4899', '#84cc16', '#64748b', '#eab308']
export const color = (i: number) => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length]

// ---------- layout ----------

export function Panel({ title, children, actions, className = '' }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`k-panel ${className}`}>
      {(title || actions) && (
        <header className="k-panel-head">
          {title && <h3>{title}</h3>}
          {actions && <div className="k-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/** Inputs on the left, results on the right (stacked on phones). */
export function Split({ children, wide }: { children: ReactNode; wide?: 'left' | 'right' }) {
  return <div className={`k-split ${wide ? `wide-${wide}` : ''}`}>{children}</div>
}

export function Row({ children, wrap = true }: { children: ReactNode; wrap?: boolean }) {
  return <div className={`k-row ${wrap ? 'wrap' : ''}`}>{children}</div>
}

export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'ok' | 'err' }) {
  return <div className={`k-note ${tone}`}>{children}</div>
}

// ---------- inputs ----------

function Field({ label, hint, children, error }: { label: ReactNode; hint?: ReactNode; children: ReactNode; error?: boolean }) {
  return (
    <label className={`k-field ${error ? 'err' : ''}`}>
      <span className="k-label">{label}</span>
      {children}
      {hint && <span className="k-hint">{hint}</span>}
    </label>
  )
}

export function Num({
  label, value, onChange, unit, min, max, step = 'any', hint,
}: {
  label: ReactNode; value: number; onChange: (v: number) => void; unit?: string; min?: number; max?: number; step?: number | 'any'; hint?: ReactNode
}) {
  const [text, setText] = useState(String(value))
  const [prev, setPrev] = useState(value)
  if (prev !== value) {
    // External change (reset, preset): show it unless the text already means the same number.
    setPrev(value)
    if (Number(text) !== value) setText(String(value))
  }
  const bad = text.trim() === '' || !Number.isFinite(Number(text)) || (min !== undefined && Number(text) < min) || (max !== undefined && Number(text) > max)
  return (
    <Field label={label} hint={hint} error={bad}>
      <span className="k-input">
        <input
          type="number"
          inputMode="decimal"
          value={text}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            setText(e.target.value)
            const v = Number(e.target.value)
            if (e.target.value.trim() !== '' && Number.isFinite(v)) {
              setPrev(v)
              onChange(v)
            }
          }}
        />
        {unit && <span className="k-unit">{unit}</span>}
      </span>
    </Field>
  )
}

export function Slider({ label, value, onChange, min, max, step = 1, unit = '', show = (v: number) => num(v, 2) }: {
  label: ReactNode; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; show?: (v: number) => string
}) {
  return (
    <Field label={<>{label} <b className="k-val">{show(value)}{unit}</b></>}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </Field>
  )
}

export function Txt({ label, value, onChange, placeholder, hint, type = 'text' }: {
  label: ReactNode; value: string; onChange: (v: string) => void; placeholder?: string; hint?: ReactNode; type?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <input className="k-text" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Field>
  )
}

export function Area({ label, value, onChange, rows = 6, placeholder, mono }: {
  label?: ReactNode; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; mono?: boolean
}) {
  const ta = <textarea className={`k-area ${mono ? 'mono' : ''}`} rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} spellCheck={!mono} />
  return label ? <Field label={label}>{ta}</Field> : ta
}

export function Select<V extends string | number>({ label, value, onChange, options }: {
  label: ReactNode; value: V; onChange: (v: V) => void; options: readonly (readonly [V, string])[] | readonly V[]
}) {
  const opts = (options as readonly unknown[]).map((o) => (Array.isArray(o) ? (o as [V, string]) : ([o, String(o)] as [V, string])))
  return (
    <Field label={label}>
      <select
        className="k-select"
        value={String(value)}
        onChange={(e) => {
          const hit = opts.find(([v]) => String(v) === e.target.value)
          if (hit) onChange(hit[0])
        }}
      >
        {opts.map(([v, l]) => (
          <option key={String(v)} value={String(v)}>
            {l}
          </option>
        ))}
      </select>
    </Field>
  )
}

export function Check({ label, value, onChange }: { label: ReactNode; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="k-check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  )
}

/** Segmented control. */
export function Seg<V extends string>({ value, onChange, options, label }: {
  value: V; onChange: (v: V) => void; options: readonly (readonly [V, string])[]; label?: string
}) {
  return (
    <div className="k-seg" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button type="button" key={v} role="radio" aria-checked={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function Btn({ children, onClick, kind = 'normal', disabled, title }: {
  children: ReactNode; onClick: () => void; kind?: 'normal' | 'primary' | 'danger' | 'ghost'; disabled?: boolean; title?: string
}) {
  return (
    <button type="button" className={`k-btn ${kind}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  )
}

/** Drop zone + file picker. */
export function FileDrop({ accept, multiple, onFiles, label = 'Drop a file here or click to choose' }: {
  accept?: string; multiple?: boolean; onFiles: (files: File[]) => void; label?: ReactNode
}) {
  const [over, setOver] = useState(false)
  const id = useId()
  return (
    <label
      htmlFor={id}
      className={`k-drop ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const fs = [...e.dataTransfer.files]
        if (fs.length) onFiles(multiple ? fs : fs.slice(0, 1))
      }}
    >
      <input
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const fs = [...(e.target.files ?? [])]
          if (fs.length) onFiles(fs)
          e.target.value = ''
        }}
      />
      <span>📂 {label}</span>
    </label>
  )
}

// ---------- results ----------

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'accent' }) {
  return (
    <div className={`k-stat ${tone ?? ''}`}>
      <span className="k-stat-label">{label}</span>
      <b className="k-stat-value">{value}</b>
      {sub && <span className="k-stat-sub">{sub}</span>}
    </div>
  )
}

export function Stats({ children }: { children: ReactNode }) {
  return <div className="k-stats">{children}</div>
}

export function Table({ head, rows, foot, max }: { head: ReactNode[]; rows: ReactNode[][]; foot?: ReactNode[]; max?: number }) {
  const shown = max ? rows.slice(0, max) : rows
  return (
    <div className="k-table-wrap">
      <table className="k-table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr>
              {foot.map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {max && rows.length > max && <p className="k-more">+ {rows.length - max} more rows (export to see all)</p>}
    </div>
  )
}

export function Bar({ value, max = 1, color: c = 'var(--accent)' }: { value: number; max?: number; color?: string }) {
  return (
    <span className="k-bar">
      <span style={{ width: `${clamp((value / (max || 1)) * 100, 0, 100)}%`, background: c }} />
    </span>
  )
}

export function CsvButton({ name, rows }: { name: string; rows: () => (string | number)[][] }) {
  return <Btn onClick={() => download(name, toCsv(rows()), 'text/csv')}>⬇ CSV</Btn>
}

export function JsonButtons<S>({ name, data, onLoad }: { name: string; data: S; onLoad: (s: S) => void }) {
  return (
    <>
      <Btn onClick={() => download(name, JSON.stringify(data, null, 2), 'application/json')}>⬇ Backup</Btn>
      <label className="k-btn">
        ⬆ Restore
        <input
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              onLoad(JSON.parse(await f.text()) as S)
            } catch {
              /* not JSON: ignore */
            }
          }}
        />
      </label>
    </>
  )
}

export function CopyButton({ text, label = 'Copy' }: { text: string | (() => string); label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Btn
      onClick={() => {
        void navigator.clipboard?.writeText(typeof text === 'function' ? text() : text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1200)
        })
      }}
    >
      {done ? '✓ Copied' : `⧉ ${label}`}
    </Btn>
  )
}

// ---------- charts (SVG, theme-aware) ----------

export interface Series {
  name: string
  points: [number, number][]
  color?: string
  dashed?: boolean
  area?: boolean
}

function useWidth<T extends HTMLElement>(def = 600): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(def)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

export function LineChart({ series, height = 260, xLabel, yLabel, fx = (v) => fmt(v, 3), fy = (v) => fmt(v, 3), yMin, yMax, xMin, xMax, markers = [] }: {
  series: Series[]; height?: number; xLabel?: string; yLabel?: string; fx?: (v: number) => string; fy?: (v: number) => string
  yMin?: number; yMax?: number; xMin?: number; xMax?: number; markers?: { x: number; label: string }[]
}) {
  const [ref, W] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const pts = series.flatMap((s) => s.points).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
  const x0 = xMin ?? Math.min(...pts.map((p) => p[0]))
  const x1 = xMax ?? Math.max(...pts.map((p) => p[0]))
  let y0 = yMin ?? Math.min(0, ...pts.map((p) => p[1]))
  let y1 = yMax ?? Math.max(...pts.map((p) => p[1]))
  if (!(y1 > y0)) {
    y1 = y0 + 1
    y0 = y0 - (yMin === undefined ? 1 : 0)
  }
  const L = 56, R = 12, T = 12, B = xLabel ? 42 : 28
  const sx = (x: number) => L + ((x - x0) / (x1 - x0 || 1)) * (W - L - R)
  const sy = (y: number) => T + (1 - (y - y0) / (y1 - y0)) * (height - T - B)
  const yt = niceTicks(y0, y1, 5).filter((v) => v >= y0 && v <= y1)
  const xt = niceTicks(x0, x1, Math.max(2, Math.floor(W / 90))).filter((v) => v >= x0 && v <= x1)
  const hx = hover === null ? null : x0 + ((hover - L) / (W - L - R)) * (x1 - x0)
  const near = (s: Series) => {
    if (hx === null || !s.points.length) return null
    let best = s.points[0]
    for (const p of s.points) if (Math.abs(p[0] - hx) < Math.abs(best[0] - hx)) best = p
    return best
  }
  if (!pts.length) return <div ref={ref} className="k-chart empty">No data yet</div>
  return (
    <div ref={ref} className="k-chart">
      <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} onMouseMove={(e) => setHover(e.nativeEvent.offsetX)} onMouseLeave={() => setHover(null)} role="img" aria-label={yLabel ?? 'chart'}>
        {yt.map((v) => (
          <g key={`y${v}`}>
            <line className="grid" x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} />
            <text x={L - 6} y={sy(v) + 4} textAnchor="end">{fy(v)}</text>
          </g>
        ))}
        {xt.map((v) => (
          <text key={`x${v}`} x={sx(v)} y={height - B + 16} textAnchor="middle">{fx(v)}</text>
        ))}
        <line className="axis" x1={L} x2={W - R} y1={sy(Math.max(y0, Math.min(0, y1)))} y2={sy(Math.max(y0, Math.min(0, y1)))} />
        {xLabel && <text x={(L + W - R) / 2} y={height - 6} textAnchor="middle" className="lbl">{xLabel}</text>}
        {yLabel && <text x={12} y={T + 4} className="lbl">{yLabel}</text>}
        {markers.map((m) => (
          <g key={m.label}>
            <line x1={sx(m.x)} x2={sx(m.x)} y1={T} y2={height - B} stroke="var(--muted)" strokeDasharray="4 4" />
            <text x={sx(m.x) + 4} y={T + 12} className="lbl">{m.label}</text>
          </g>
        ))}
        {series.map((s, i) => {
          const c = s.color ?? color(i)
          const d = s.points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)).map(([x, y], j) => `${j ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join('')
          return (
            <g key={s.name}>
              {s.area && s.points.length > 1 && (
                <path d={`${d}L${sx(s.points[s.points.length - 1][0])},${sy(Math.max(y0, 0))}L${sx(s.points[0][0])},${sy(Math.max(y0, 0))}Z`} fill={c} opacity={0.15} />
              )}
              <path d={d} fill="none" stroke={c} strokeWidth={2.2} strokeDasharray={s.dashed ? '6 4' : undefined} strokeLinejoin="round" />
            </g>
          )
        })}
        {hx !== null && hover! >= L && hover! <= W - R && (
          <g>
            <line x1={hover!} x2={hover!} y1={T} y2={height - B} stroke="var(--muted)" opacity={0.5} />
            {series.map((s, i) => {
              const p = near(s)
              return p ? <circle key={s.name} cx={sx(p[0])} cy={sy(p[1])} r={4} fill={s.color ?? color(i)} /> : null
            })}
          </g>
        )}
      </svg>
      {hx !== null && hover! >= L && hover! <= W - R && (
        <div className="k-tip" style={{ left: Math.min(hover! + 12, W - 180) }}>
          {series.map((s, i) => {
            const p = near(s)
            return p ? (
              <div key={s.name}>
                <i style={{ background: s.color ?? color(i) }} /> {s.name}: <b>{fy(p[1])}</b> <span className="muted">@ {fx(p[0])}</span>
              </div>
            ) : null
          })}
        </div>
      )}
      {series.length > 1 && <Legend items={series.map((s, i) => [s.name, s.color ?? color(i)])} />}
    </div>
  )
}

export function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="k-legend">
      {items.map(([n, c]) => (
        <span key={n}>
          <i style={{ background: c }} />
          {n}
        </span>
      ))}
    </div>
  )
}

export function BarChart({ bars, height = 240, fy = (v) => fmt(v, 3), stacks }: {
  bars: { label: string; value: number | number[]; color?: string }[]; height?: number; fy?: (v: number) => string; stacks?: { name: string; color?: string }[]
}) {
  const [ref, W] = useWidth<HTMLDivElement>()
  const vals = bars.map((b) => (Array.isArray(b.value) ? b.value.reduce((a, c) => a + c, 0) : b.value))
  const lo = Math.min(0, ...vals)
  const hi = Math.max(0, ...vals) || 1
  const L = 56, R = 8, T = 10, B = 40
  const sy = (y: number) => T + (1 - (y - lo) / (hi - lo || 1)) * (height - T - B)
  const bw = (W - L - R) / Math.max(1, bars.length)
  const yt = niceTicks(lo, hi, 5).filter((v) => v >= lo && v <= hi)
  const every = Math.ceil(bars.length / Math.max(1, Math.floor((W - L) / 56)))
  return (
    <div ref={ref} className="k-chart">
      <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label="bar chart">
        {yt.map((v) => (
          <g key={v}>
            <line className="grid" x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} />
            <text x={L - 6} y={sy(v) + 4} textAnchor="end">{fy(v)}</text>
          </g>
        ))}
        {bars.map((b, i) => {
          const x = L + i * bw + bw * 0.12
          const w = bw * 0.76
          const parts = Array.isArray(b.value) ? b.value : [b.value]
          let acc = 0
          return (
            <g key={b.label + i}>
              {parts.map((v, j) => {
                const y0 = acc
                acc += v
                const top = sy(Math.max(y0, acc))
                const h = Math.abs(sy(y0) - sy(acc))
                return <rect key={j} x={x} y={top} width={w} height={Math.max(0.5, h)} rx={Math.min(4, w / 4)} fill={Array.isArray(b.value) ? (stacks?.[j]?.color ?? color(j)) : (b.color ?? color(0))}>
                  <title>{`${b.label}${stacks ? ` · ${stacks[j]?.name}` : ''}: ${fy(v)}`}</title>
                </rect>
              })}
              {i % every === 0 && (
                <text x={x + w / 2} y={height - B + 16} textAnchor="middle">{b.label.length > 10 ? b.label.slice(0, 9) + '…' : b.label}</text>
              )}
            </g>
          )
        })}
        <line className="axis" x1={L} x2={W - R} y1={sy(0)} y2={sy(0)} />
      </svg>
      {stacks && <Legend items={stacks.map((s, i) => [s.name, s.color ?? color(i)])} />}
    </div>
  )
}

export function Donut({ slices, size = 220, center, fv = (v) => fmt(v, 3) }: {
  slices: { label: string; value: number; color?: string }[]; size?: number; center?: ReactNode; fv?: (v: number) => string
}) {
  const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0)
  const r = size / 2 - 6, ir = r * 0.62, c = size / 2
  const arcs = useMemo(() => {
    let a = -Math.PI / 2
    return slices.map((s, i) => {
      const da = total ? (Math.max(0, s.value) / total) * Math.PI * 2 : 0
      const a0 = a
      a += da
      return { ...s, a0, a1: a, col: s.color ?? color(i) }
    })
  }, [slices, total])
  const arc = (a0: number, a1: number) => {
    if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = (rr: number, a: number) => `${(c + rr * Math.cos(a)).toFixed(2)},${(c + rr * Math.sin(a)).toFixed(2)}`
    return `M${p(r, a0)}A${r},${r} 0 ${large} 1 ${p(r, a1)}L${p(ir, a1)}A${ir},${ir} 0 ${large} 0 ${p(ir, a0)}Z`
  }
  return (
    <div className="k-donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="donut chart">
        {total === 0 && <circle cx={c} cy={c} r={(r + ir) / 2} fill="none" stroke="var(--line)" strokeWidth={r - ir} />}
        {arcs.map((s) => s.a1 > s.a0 && (
          <path key={s.label} d={arc(s.a0, s.a1)} fill={s.col}>
            <title>{`${s.label}: ${fv(s.value)} (${pct(s.value / (total || 1))})`}</title>
          </path>
        ))}
      </svg>
      {center && <div className="k-donut-center">{center}</div>}
      <div className="k-legend col">
        {arcs.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.col }} />
            {s.label} <b>{fv(s.value)}</b> <span className="muted">{pct(s.value / (total || 1), 0)}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Circular progress ring. */
export function Ring({ value, size = 96, label, color: c = 'var(--accent)' }: { value: number; size?: number; label?: ReactNode; color?: string }) {
  const r = size / 2 - 7
  const L = 2 * Math.PI * r
  return (
    <div className="k-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth={8} strokeLinecap="round" strokeDasharray={`${clamp(value, 0, 1) * L} ${L}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span>{label ?? pct(value, 0)}</span>
    </div>
  )
}
