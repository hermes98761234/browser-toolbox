import { useState } from 'react'
import { Area, Btn, CopyButton, CsvButton, Note, num, Panel, Row, Seg, Split, Stat, Stats, uid, useToolState } from '../kit'
import { apca, apcaUse, deltaOk, hexOk, matrix, norm, parsePalette, simulateHex, suggest, toOklch, wcag, wcagGrade, type Metric } from './lib/color-contrast-checker'
import { CVD_INFO, type Cvd } from './lib/colorblind-simulator'

interface Sw { id: string; name: string; hex: string }
const mk = (pairs: [string, string][]): Sw[] => pairs.map(([name, hex]) => ({ id: uid(), name, hex }))
const PRESETS: Record<string, [string, string][]> = {
  'Product UI': [['Ink', '#111827'], ['Slate', '#64748b'], ['Mist', '#e2e8f0'], ['Paper', '#ffffff'], ['Brand', '#4f46e5'], ['Sky', '#38bdf8'], ['Success', '#16a34a'], ['Danger', '#ef4444']],
  'Warm editorial': [['Espresso', '#2b1d14'], ['Clay', '#b5651d'], ['Sand', '#e9d8b4'], ['Cream', '#fbf6ec'], ['Olive', '#6b7b3a'], ['Rust', '#c2410c']],
  'Dark theme': [['Night', '#0b1020'], ['Panel', '#1e293b'], ['Text', '#e5e7eb'], ['Muted', '#94a3b8'], ['Accent', '#a78bfa'], ['Teal', '#2dd4bf'], ['Warn', '#fbbf24']],
  Pastels: [['Lavender', '#c4b5fd'], ['Mint', '#a7f3d0'], ['Peach', '#fed7aa'], ['Rose', '#fecdd3'], ['Charcoal', '#374151'], ['White', '#ffffff']],
}
const TARGETS: Record<Metric, [string, string][]> = {
  wcag: [['3', '3:1 large/UI'], ['4.5', '4.5:1 AA'], ['7', '7:1 AAA']],
  apca: [['45', 'Lc 45 large'], ['60', 'Lc 60 content'], ['75', 'Lc 75 body'], ['90', 'Lc 90 preferred']],
}
const DEF = { palette: mk(PRESETS['Product UI']), metric: 'wcag' as Metric, target: { wcag: '4.5', apca: '60' } as Record<Metric, string>, cvd: 'none' as Cvd | 'none', sel: [5, 3] as [number, number] }

export default function ColorContrastChecker() {
  const [s, set, reset] = useToolState('color-contrast-checker', DEF)
  const [paste, setPaste] = useState('')
  const pal = s.palette.filter((p) => hexOk(p.hex))
  const colors = pal.map((p) => norm(p.hex))
  const M = matrix(colors, s.cvd)
  const tgt = Number(s.target[s.metric])
  const score = (fg: string, bg: string) => (s.metric === 'wcag' ? wcag(fg, bg) : Math.abs(apca(fg, bg)))
  const ok = (fg: string, bg: string) => score(fg, bg) >= tgt
  const pairs = M.flatMap((row, i) => row.map((p, j) => ({ ...p, i, j })).filter((p) => p.i !== p.j))
  const passing = pairs.filter((p) => ok(p.fg, p.bg))
  const best = pairs.length ? pairs.reduce((a, b) => (score(b.fg, b.bg) > score(a.fg, a.bg) ? b : a)) : null
  const [si, sj] = [Math.min(s.sel[0], pal.length - 1), Math.min(s.sel[1], pal.length - 1)]
  const fg = colors[si] ?? '#000000', bg = colors[sj] ?? '#ffffff'
  const fgS = simulateHex(fg, s.cvd), bgS = simulateHex(bg, s.cvd)
  const ratio = wcag(fg, bg), lc = apca(fg, bg)
  const fixFg = suggest(fg, bg, s.metric, tgt), fixBg = suggest(bg, fg, s.metric, tgt)
  const edit = (id: string, p: Partial<Sw>) => set({ palette: s.palette.map((x) => (x.id === id ? { ...x, ...p } : x)) })
  const replace = (idx: number, hex: string) => edit(pal[idx].id, { hex })
  const fmtS = (fgc: string, bgc: string) => (s.metric === 'wcag' ? `${num(wcag(fgc, bgc), 2)}` : `${num(apca(fgc, bgc), 0)}`)
  const confusable = (() => {
    const out: [string, string, number][] = []
    if (s.cvd === 'none') return out
    for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) {
      const d0 = deltaOk(colors[i], colors[j]), d = deltaOk(simulateHex(colors[i], s.cvd), simulateHex(colors[j], s.cvd))
      if (d < 6 && d0 >= 6) out.push([pal[i].name, pal[j].name, d])
    }
    return out
  })()

  return (
    <Split wide="right">
      <div>
        <Panel title="Palette" actions={<Btn onClick={() => set({ palette: [...s.palette, { id: uid(), name: `Colour ${s.palette.length + 1}`, hex: '#888888' }] })}>+ Colour</Btn>}>
          <div style={{ display: 'grid', gap: 6 }}>
            {s.palette.map((p, i) => (
              <Row key={p.id} wrap={false}>
                <input type="color" value={hexOk(p.hex) ? norm(p.hex) : '#000000'} onChange={(e) => edit(p.id, { hex: e.target.value })} aria-label={`${p.name} colour`} style={{ width: 36, height: 32, border: 0, padding: 0, background: 'none' }} />
                <input className="k-text" style={{ width: 110 }} value={p.name} onChange={(e) => edit(p.id, { name: e.target.value })} aria-label="Name" />
                <input className="k-text" style={{ width: 92, fontFamily: 'var(--mono)', borderColor: hexOk(p.hex) ? undefined : 'var(--err)' }} value={p.hex} onChange={(e) => edit(p.id, { hex: e.target.value })} aria-label="Hex" />
                <span className="muted" style={{ fontSize: 11, flex: 1 }}>L {hexOk(p.hex) ? num(toOklch(p.hex)[0] * 100, 0) : '—'}</span>
                <Btn kind="ghost" onClick={() => set({ palette: s.palette.filter((x) => x.id !== p.id), sel: [0, Math.min(1, s.palette.length - 2)] })} title={`Remove ${i + 1}`}>✕</Btn>
              </Row>
            ))}
          </div>
          <h4 style={{ margin: '12px 0 6px' }}>Presets</h4>
          <Row>{Object.keys(PRESETS).map((k) => <Btn key={k} kind="ghost" onClick={() => set({ palette: mk(PRESETS[k]), sel: [0, 1] })}>{k}</Btn>)}</Row>
          <Area label="Paste a palette (CSS, JSON, any text with hex codes)" value={paste} onChange={setPaste} rows={3} mono />
          <Btn disabled={!parsePalette(paste).length} onClick={() => { set({ palette: parsePalette(paste).slice(0, 16).map((hex, i) => ({ id: uid(), name: `C${i + 1}`, hex })), sel: [0, 1] }); setPaste('') }}>Import {parsePalette(paste).length || ''} colours</Btn>
        </Panel>
        <Panel title="Standard">
          <Seg value={s.metric} onChange={(metric) => set({ metric })} options={[['wcag', 'WCAG 2.x ratio'], ['apca', 'APCA Lc (WCAG 3 draft)']]} />
          <div style={{ marginTop: 8 }}>
            <Seg value={s.target[s.metric]} onChange={(v) => set({ target: { ...s.target, [s.metric]: v } })} options={TARGETS[s.metric]} />
          </div>
          <h4 style={{ margin: '12px 0 6px' }}>Colour-vision simulation</h4>
          <Seg value={s.cvd} onChange={(cvd) => set({ cvd })} options={[['none', 'Normal'], ...(Object.keys(CVD_INFO) as Cvd[]).map((c) => [c, CVD_INFO[c][0]] as [Cvd, string])]} />
          {s.cvd !== 'none' && <p className="muted" style={{ fontSize: 13 }}>{CVD_INFO[s.cvd][0]}: {CVD_INFO[s.cvd][1]} missing, {CVD_INFO[s.cvd][2]} (Machado 2009 model). The matrix now shows simulated colours.</p>}
          <Btn kind="ghost" onClick={reset}>Reset</Btn>
        </Panel>
      </div>

      <div>
        <Stats>
          <Stat label="Pairs passing" value={`${passing.length} / ${pairs.length}`} sub={`${s.metric === 'wcag' ? `≥ ${tgt}:1` : `|Lc| ≥ ${tgt}`}`} tone="accent" />
          <Stat label="AAA pairs" value={pairs.filter((p) => p.ratio >= 7).length} sub="ratio ≥ 7:1" />
          <Stat label="Body-text pairs" value={pairs.filter((p) => Math.abs(p.lc) >= 75).length} sub="APCA |Lc| ≥ 75" />
          <Stat label="Best pair" value={best ? fmtS(best.fg, best.bg) : '—'} sub={best ? `${pal[best.i].name} on ${pal[best.j].name}` : undefined} />
        </Stats>
        <Panel title="Contrast matrix — text (rows) on background (columns)" actions={<CsvButton name="contrast-matrix.csv" rows={() => [['text \\ background', ...pal.map((p) => p.name)], ...M.map((row, i) => [pal[i].name, ...row.map((p) => (s.metric === 'wcag' ? +p.ratio.toFixed(2) : +p.lc.toFixed(1)))])]} />}>
          <div className="k-table-wrap">
            <table style={{ borderCollapse: 'separate', borderSpacing: 3, fontSize: 12 }}>
              <thead>
                <tr>
                  <th />
                  {pal.map((p, j) => <th key={p.id} style={{ fontWeight: 600, padding: 2, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis' }}><i style={{ display: 'block', height: 8, borderRadius: 4, background: simulateHex(colors[j], s.cvd), border: '1px solid var(--line)' }} />{p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {M.map((row, i) => (
                  <tr key={pal[i].id}>
                    <th style={{ textAlign: 'right', fontWeight: 600, paddingRight: 4, whiteSpace: 'nowrap' }}>{pal[i].name}</th>
                    {row.map((p, j) => {
                      const pass = i !== j && ok(p.fg, p.bg)
                      const selected = i === si && j === sj
                      return (
                        <td key={j} onClick={() => set({ sel: [i, j] })} title={`${pal[i].name} on ${pal[j].name}: ${num(p.ratio, 2)}:1, Lc ${num(p.lc, 1)}`}
                          style={{ background: p.bg, color: p.fg, minWidth: 58, height: 46, textAlign: 'center', borderRadius: 6, cursor: 'pointer', outline: selected ? '3px solid var(--accent)' : '1px solid var(--line)', opacity: i === j ? 0.35 : 1 }}>
                          <b style={{ fontSize: 15 }}>Aa</b>
                          <div style={{ fontSize: 10.5, fontWeight: 700 }}>{i === j ? '—' : `${fmtS(p.fg, p.bg)}${pass ? ' ✓' : ' ✗'}`}</div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Click a cell for details and fixes. APCA is polarity-aware: the value for light-on-dark (negative Lc) differs from dark-on-light.</p>
        </Panel>

        {pal.length >= 2 && (
          <Panel title={`${pal[si].name} on ${pal[sj].name}`} actions={<Btn kind="ghost" onClick={() => set({ sel: [sj, si] })}>⇄ Swap</Btn>}>
            <div style={{ background: bgS, color: fgS, borderRadius: 10, padding: 16, border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>Large heading 28px</div>
              <p style={{ fontSize: 16, margin: '6px 0' }}>Body text at 16px. The quick brown fox jumps over the lazy dog — 0123456789.</p>
              <p style={{ fontSize: 13, margin: 0 }}>Small print at 13px for captions and footnotes.</p>
              <Row><span style={{ border: `2px solid ${fgS}`, borderRadius: 8, padding: '4px 12px', fontWeight: 600 }}>Button</span><span style={{ fontSize: 22 }}>★ ✓ ⚠</span></Row>
            </div>
            <Stats>
              <Stat label="WCAG 2.x" value={`${num(ratio, 2)}:1`} sub={wcagGrade(ratio)} tone={ratio >= 4.5 ? 'good' : ratio >= 3 ? 'accent' : 'bad'} />
              <Stat label="APCA Lc" value={num(lc, 1)} sub={apcaUse(lc)} tone={Math.abs(lc) >= 60 ? 'good' : Math.abs(lc) >= 45 ? 'accent' : 'bad'} />
            </Stats>
            <table className="k-table" style={{ fontSize: 13 }}>
              <tbody>
                {([['Normal text AA', 4.5], ['Normal text AAA', 7], ['Large text AA (≥24px or 19px bold)', 3], ['Large text AAA', 4.5], ['UI components & graphics (1.4.11)', 3]] as [string, number][]).map(([l, t]) => (
                  <tr key={l}><td>{l}</td><td style={{ textAlign: 'right' }}>{t}:1</td><td style={{ color: ratio >= t ? 'var(--ok)' : 'var(--err)', fontWeight: 700 }}>{ratio >= t ? 'Pass' : 'Fail'}</td></tr>
                ))}
              </tbody>
            </table>
            <h4 style={{ margin: '12px 0 6px' }}>Nearest passing colours (OKLCH, same hue) for {s.metric === 'wcag' ? `${tgt}:1` : `Lc ${tgt}`}</h4>
            {([['Text', fixFg, si, fg], ['Background', fixBg, sj, bg]] as const).map(([lab, fix, idx, orig]) => (
              <Row key={lab}>
                <span style={{ width: 90 }}>{lab}</span>
                <i style={{ width: 22, height: 22, borderRadius: 6, background: orig, border: '1px solid var(--line)' }} />→
                {fix ? (
                  <>
                    <i style={{ width: 22, height: 22, borderRadius: 6, background: fix.hex, border: '1px solid var(--line)' }} />
                    <code>{fix.hex}</code>
                    <span className="muted" style={{ fontSize: 12 }}>{fix.dL === 0 ? 'already passes' : `ΔL ${num(fix.dL * 100, 1)}`}</span>
                    {fix.dL > 0 && <Btn onClick={() => replace(idx, fix.hex)}>Apply</Btn>}
                    <CopyButton text={fix.hex} />
                  </>
                ) : <span className="muted">no colour of this hue reaches the target against {lab === 'Text' ? 'this background' : 'this text'}</span>}
              </Row>
            ))}
          </Panel>
        )}

        {s.cvd !== 'none' && (
          <Panel title={`${CVD_INFO[s.cvd][0]} — colours that become hard to tell apart`}>
            {confusable.length ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>{confusable.map(([a, b, d]) => <li key={a + b}><b>{a}</b> and <b>{b}</b> (ΔE-OK {num(d, 1)}) — do not rely on colour alone to distinguish them.</li>)}</ul>
            ) : <Note tone="ok">No pair collapses below ΔE-OK 6 under this simulation.</Note>}
          </Panel>
        )}
        <Note>
          WCAG 2.x uses relative luminance and the (L1 + 0.05)/(L2 + 0.05) ratio. APCA Lc is computed with the 0.0.98G-4g constants and is a draft for WCAG 3 —
          treat it as guidance. Suggestions keep the OKLCH hue and chroma (reduced only when out of sRGB gamut) and change lightness as little as possible.
        </Note>
      </div>
    </Split>
  )
}
