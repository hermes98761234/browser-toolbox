import { Area, Btn, CopyButton, Note, num, Panel, Row, Split, Stat, Stats, Table, useToolState } from '../kit'
import { apca, contrast, over, parseColor, suggest, toHex, verdict, type RGBA } from './lib/contrast-checker'

const PAIRS: [string, string, string][] = [
  ['Muted grey', '#8a8a8a', '#ffffff'],
  ['Brand blue', '#3b82f6', '#ffffff'],
  ['Dark mode', '#94a3b8', '#0f172a'],
  ['Warning', '#ffffff', '#f59e0b'],
  ['Link on beige', '#2563eb', '#f5f5dc'],
  ['Translucent', 'rgba(0,0,0,0.55)', '#ffffff'],
]

const DEF = { fg: '#6b7280', bg: '#ffffff', palette: '#0f172a\n#334155\n#64748b\n#94a3b8\n#e2e8f0\n#ffffff\n#3b82f6\n#f59e0b' }

function Badge({ ok, label, need }: { ok: boolean; label: string; need: string }) {
  return (
    <div style={{ border: `1px solid ${ok ? 'var(--ok)' : 'var(--err)'}`, borderRadius: 10, padding: '8px 10px', minWidth: 120, flex: 1 }}>
      <div style={{ fontWeight: 800, color: ok ? 'var(--ok)' : 'var(--err)' }}>{ok ? '✓ Pass' : '✗ Fail'}</div>
      <div style={{ fontSize: 13 }}>{label}</div>
      <div className="muted" style={{ fontSize: 12 }}>needs {need}</div>
    </div>
  )
}

function ColorField({ label, value, onChange, parsed }: { label: string; value: string; onChange: (v: string) => void; parsed: RGBA | null }) {
  return (
    <label className="k-field" style={{ flex: 1, minWidth: 180 }}>
      <span className="k-label">{label}</span>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="color" value={parsed ? toHex(parsed) : '#000000'} onChange={(e) => onChange(e.target.value)} aria-label={`${label} picker`} style={{ width: 44, height: 40, padding: 0, border: '1px solid var(--line)', borderRadius: 8, background: 'none' }} />
        <input className="k-text mono" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} style={{ flex: 1, minWidth: 0, borderColor: parsed ? undefined : 'var(--err)' }} />
      </span>
      {!parsed && <span className="k-hint" style={{ color: 'var(--err)' }}>Use #hex, rgb(), hsl() or a colour name</span>}
    </label>
  )
}

export default function ContrastChecker() {
  const [s, set, reset] = useToolState('contrast-checker', DEF)
  const fg = parseColor(s.fg), bg = parseColor(s.bg)
  const ok = !!(fg && bg)
  const ratio = ok ? contrast(fg, bg) : NaN
  const v = verdict(ratio)
  const lc = ok ? apca(fg, bg) : NaN
  const shownBg = bg ? (bg.a < 1 ? over(bg, { r: 255, g: 255, b: 255, a: 1 }) : bg) : { r: 255, g: 255, b: 255, a: 1 }
  const shownFg = fg ? (fg.a < 1 ? over(fg, shownBg) : fg) : { r: 0, g: 0, b: 0, a: 1 }
  const fgCss = toHex(shownFg), bgCss = toHex(shownBg)
  const grade = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA large only' : 'Fail'

  const targets: [string, number][] = [['AA text (4.5:1)', 4.5], ['AAA text (7:1)', 7], ['Large text / UI (3:1)', 3]]
  const sugg = ok
    ? targets.map(([label, t]) => ({ label, t, fg: suggest(fg, shownBg, t), bg: suggest(bg, shownFg, t, true) }))
    : []

  const pal = s.palette.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean).slice(0, 12)
  const palC = pal.map((p) => parseColor(p))

  return (
    <div>
      <Stats>
        <Stat label="Contrast ratio" value={ok ? `${num(ratio, 2)} : 1` : '—'} tone={ratio >= 4.5 ? 'good' : ratio >= 3 ? 'accent' : 'bad'} sub={grade} />
        <Stat label="APCA Lc" value={ok ? num(lc, 1) : '—'} sub={Math.abs(lc) >= 75 ? 'body text OK' : Math.abs(lc) >= 60 ? 'content text min' : Math.abs(lc) >= 45 ? 'large / bold text' : 'non-text only'} />
        <Stat label="Text colour" value={fgCss} sub={fg && fg.a < 1 ? `${Math.round(fg.a * 100)}% opacity, blended` : 'opaque'} />
        <Stat label="Background" value={bgCss} />
      </Stats>
      <Split>
        <div>
          <Panel title="Colours" actions={<Btn onClick={() => set({ fg: s.bg, bg: s.fg })}>⇅ Swap</Btn>}>
            <Row>
              <ColorField label="Text / foreground" value={s.fg} onChange={(fgv) => set({ fg: fgv })} parsed={fg} />
              <ColorField label="Background" value={s.bg} onChange={(bgv) => set({ bg: bgv })} parsed={bg} />
            </Row>
            <div className="muted" style={{ fontSize: 13, margin: '6px 0' }}>Examples:</div>
            <Row>
              {PAIRS.map(([n, a, b]) => (
                <button key={n} type="button" onClick={() => set({ fg: a, bg: b })} className="k-btn" style={{ background: toHex(over(parseColor(b)!, { r: 255, g: 255, b: 255, a: 1 })), color: toHex(over(parseColor(a)!, parseColor(b)!)), borderColor: 'var(--line)' }}>
                  {n}
                </button>
              ))}
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </Row>
          </Panel>
          <Panel title="WCAG 2.2 results">
            <Row>
              <Badge ok={v.normalAA} label="AA normal text" need="4.5:1" />
              <Badge ok={v.normalAAA} label="AAA normal text" need="7:1" />
            </Row>
            <div style={{ height: 8 }} />
            <Row>
              <Badge ok={v.largeAA} label="AA large text" need="3:1" />
              <Badge ok={v.largeAAA} label="AAA large text" need="4.5:1" />
              <Badge ok={v.ui} label="UI components & icons" need="3:1" />
            </Row>
            <p className="muted" style={{ fontSize: 13 }}>Large text = at least 24 px (18 pt) regular or 18.66 px (14 pt) bold. Ratios are not rounded up: 4.49:1 fails AA.</p>
          </Panel>
          <Panel title="Suggested fixes">
            {ok && (
              <Table
                head={['Target', 'Adjust text', 'Adjust background']}
                rows={sugg.map((x) => [
                  x.label,
                  ...[x.fg, x.bg].map((r, k) =>
                    r ? (
                      <button key={k} type="button" className="k-btn" title="Apply" onClick={() => set(k === 0 ? { fg: toHex(r.color) } : { bg: toHex(r.color) })} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <i style={{ width: 16, height: 16, borderRadius: 4, background: toHex(r.color), border: '1px solid var(--line)', display: 'inline-block' }} />
                        <span className="mono">{toHex(r.color)}</span>
                        <span className="muted">{num(r.ratio, 2)}:1{r.deltaL === 0 ? ' ✓' : ''}</span>
                      </button>
                    ) : (
                      <span key={k} className="muted">not reachable</span>
                    ),
                  ),
                ])}
              />
            )}
            <p className="muted" style={{ fontSize: 13 }}>Suggestions keep the hue and chroma (OKLCH) and change only lightness, choosing the smallest change. Click one to apply it.</p>
          </Panel>
        </div>
        <div>
          <Panel title="Live preview" actions={<CopyButton label="Copy CSS" text={`color: ${fgCss};\nbackground-color: ${bgCss};`} />}>
            <div style={{ background: bgCss, color: fgCss, borderRadius: 12, padding: 20, border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.15 }}>Large heading text</div>
              <div style={{ fontSize: 19, fontWeight: 700, margin: '8px 0' }}>Bold 14 pt counts as large text</div>
              <p style={{ fontSize: 16, lineHeight: 1.6, margin: '8px 0' }}>
                Body text at 16 px. The quick brown fox jumps over the lazy dog. Good contrast helps people with low vision, older readers and anyone using a phone in bright sunlight.
              </p>
              <p style={{ fontSize: 13, margin: '8px 0' }}>Small print at 13 px — fine details, captions and legal notes are the first to become unreadable.</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
                <span style={{ border: `2px solid ${fgCss}`, borderRadius: 8, padding: '6px 14px', fontWeight: 700 }}>Outlined button</span>
                <span style={{ background: fgCss, color: bgCss, borderRadius: 8, padding: '8px 14px', fontWeight: 700 }}>Inverted button</span>
                <span style={{ textDecoration: 'underline', fontWeight: 600 }}>A text link</span>
                <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" fill={fgCss} /></svg>
              </div>
            </div>
          </Panel>
          <Panel title="Palette matrix">
            <Area value={s.palette} onChange={(palette) => set({ palette })} rows={3} mono placeholder="One colour per line" />
            <div className="k-table-wrap" style={{ marginTop: 10 }}>
              <table className="k-table" style={{ textAlign: 'center' }}>
                <thead>
                  <tr>
                    <th className="muted" style={{ fontSize: 12 }}>text ↓ / bg →</th>
                    {palC.map((p, j) => (
                      <th key={j} title={pal[j]}>
                        <i style={{ display: 'inline-block', width: 22, height: 22, borderRadius: 6, background: p ? toHex(p) : 'transparent', border: '1px solid var(--line)' }} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {palC.map((a, i) => (
                    <tr key={i}>
                      <th>
                        <i style={{ display: 'inline-block', width: 22, height: 22, borderRadius: 6, background: a ? toHex(a) : 'transparent', border: '1px solid var(--line)' }} />
                      </th>
                      {palC.map((b, j) => {
                        if (!a || !b || i === j) return <td key={j} className="muted">·</td>
                        const r = contrast(a, b)
                        return (
                          <td key={j} title={`${pal[i]} on ${pal[j]}`} onClick={() => set({ fg: pal[i], bg: pal[j] })} style={{ cursor: 'pointer', background: toHex(b), color: toHex(a), fontWeight: 700, fontSize: 12, outline: r >= 4.5 ? undefined : '1px dashed rgba(239,68,68,.6)', outlineOffset: -3 }}>
                            {num(r, 1)}
                            <div style={{ fontSize: 10 }}>{r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA18' : '✗'}</div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {palC.some((p) => !p) && <Note tone="warn">Some palette entries could not be parsed.</Note>}
            <p className="muted" style={{ fontSize: 13 }}>Click a cell to load that pair above. Dashed cells fail AA for body text.</p>
          </Panel>
        </div>
      </Split>
    </div>
  )
}
