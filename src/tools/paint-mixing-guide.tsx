import { useState } from 'react'
import { Btn, JsonButtons, Note, num, Num, Panel, Row, Split, Stat, Stats, uid, useToolState } from '../kit'
import { bestRecipe, deltaE00, fitWeights, hex, hexLab, mixLab, mixRgb, parseHex, pig, PIGMENTS, toParts, type Fit } from './lib/paint-mixing-guide'

interface Part { id: string; w: number }
interface Recipe { id: string; name: string; target: string; parts: Part[]; dE: number }
const TARGETS: [string, string][] = [['Sage green', '#8a9a72'], ['Sky blue', '#7fb3dd'], ['Brick red', '#9c4a3a'], ['Lavender', '#b4a3d0'], ['Olive', '#6b6b2e'], ['Warm skin', '#e2b190'], ['Teal', '#2f7f7a'], ['Slate grey', '#5f6b75']]
const DEF = {
  target: '#8a9a72',
  palette: ['white', 'black', 'lemon', 'cadyellow', 'ochre', 'cadred', 'quinmag', 'ultramarine', 'phthaloblue', 'sienna', 'burntumber'],
  mix: [{ id: 'ultramarine', w: 1 }, { id: 'cadyellow', w: 3 }, { id: 'white', w: 2 }] as Part[],
  amount: 100,
  recipes: [] as Recipe[],
}
const quality = (d: number) => (d < 1 ? ['Imperceptible', 'good'] : d < 2.5 ? ['Very close', 'good'] : d < 5 ? ['Close — adjust by eye', undefined] : ['Out of gamut for these pigments', 'bad']) as [string, 'good' | 'bad' | undefined]

function Swatch({ c, size = 44, title }: { c: string; size?: number; title?: string }) {
  return <span title={title ?? c} style={{ display: 'inline-block', width: size, height: size, borderRadius: 8, background: c, border: '1px solid rgba(0,0,0,.2)', flex: 'none' }} />
}

function Pair({ a, b, h = 70 }: { a: string; b: string; h?: number }) {
  return (
    <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--line)', height: h }}>
      <div style={{ flex: 1, background: a, display: 'flex', alignItems: 'flex-end', padding: 6 }}><small style={{ background: 'rgba(255,255,255,.75)', color: '#111', borderRadius: 4, padding: '0 5px' }}>target {a}</small></div>
      <div style={{ flex: 1, background: b, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 6 }}><small style={{ background: 'rgba(255,255,255,.75)', color: '#111', borderRadius: 4, padding: '0 5px' }}>mix {b}</small></div>
    </div>
  )
}

const partsText = (ids: string[], w: number[]) => {
  const p = toParts(w)
  return ids.map((id, i) => `${p[i]} ${pig(id)?.name}`).join(' + ')
}

export default function PaintMixingGuide() {
  const [s, set, reset] = useToolState('paint-mixing-guide', DEF)
  const [found, setFound] = useState<{ key: string; fits: Fit[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const target = parseHex(s.target) ? s.target : '#888888'
  const tLab = hexLab(target)
  const mixHex = hex(mixRgb(s.mix))
  const mixDE = deltaE00(tLab, mixLab(s.mix))
  const total = s.mix.reduce((a, p) => a + Math.max(0, p.w), 0) || 1
  // naive screen average for comparison
  const naive = hex([0, 1, 2].map((k) => Math.round(s.mix.reduce((a, p) => a + (mixRgb([{ id: p.id, w: 1 }])[k] * Math.max(0, p.w)) / total, 0))))

  const fitKey = `${target}|${s.palette.join()}`
  const fits = found?.key === fitKey ? found.fits : null
  const search = () => {
    setBusy(true)
    setTimeout(() => {
      setFound({ key: fitKey, fits: bestRecipe(s.palette, tLab, 3).slice(0, 6) })
      setBusy(false)
    }, 20)
  }

  const optimiseMix = () => {
    const ids = s.mix.map((p) => p.id)
    if (new Set(ids).size !== ids.length) return
    const f = fitWeights(ids, tLab)
    set({ mix: ids.map((id, i) => ({ id, w: Math.round(f.w[i] * 100) / 10 })) })
  }
  const save = (ids: string[], w: number[], dE: number) => set({ recipes: [{ id: uid(), name: TARGETS.find((t) => t[1] === s.target)?.[0] ?? `Mix ${s.recipes.length + 1}`, target: s.target, parts: ids.map((id, i) => ({ id, w: w[i] })), dE }, ...s.recipes] })
  const editMix = (i: number, p: Partial<Part>) => set({ mix: s.mix.map((x, j) => (j === i ? { ...x, ...p } : x)) })

  return (
    <Split wide="right">
      <div>
        <Panel title="Target colour">
          <Row>
            <input type="color" value={target} onChange={(e) => set({ target: e.target.value })} style={{ width: 64, height: 48, border: 'none', background: 'none', padding: 0 }} aria-label="Pick target colour" />
            <input className="k-text mono" value={s.target} onChange={(e) => set({ target: e.target.value })} style={{ maxWidth: 120 }} aria-label="Target hex" />
          </Row>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {TARGETS.map(([n, c]) => (
              <button key={c} type="button" className="k-btn ghost" onClick={() => set({ target: c })} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Swatch c={c} size={16} />{n}</button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>L* {num(tLab[0], 1)} · a* {num(tLab[1], 1)} · b* {num(tLab[2], 1)}</p>
        </Panel>
        <Panel title="My palette" actions={<Btn kind="ghost" onClick={() => set({ palette: PIGMENTS.map((p) => p.id) })}>All</Btn>}>
          {PIGMENTS.map((p) => {
            const on = s.palette.includes(p.id)
            return (
              <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={on} onChange={() => set({ palette: on ? s.palette.filter((x) => x !== p.id) : [...s.palette, p.id] })} />
                <Swatch c={hex(mixRgb([{ id: p.id, w: 1 }]))} size={22} title="masstone" />
                <Swatch c={hex(mixRgb([{ id: p.id, w: 1 }, { id: 'white', w: 4 }]))} size={22} title="tint 1:4 with white" />
                <span style={{ flex: 1 }}>{p.name} <span className="muted" style={{ fontSize: 12 }}>{p.ci}</span></span>
              </label>
            )
          })}
          <Note>Swatches show masstone and a 1:4 tint with white. Pigment parameters are our own rough approximations, not measured spectra — real paints vary by brand and binder.</Note>
        </Panel>
      </div>
      <div>
        <Panel title="Find a recipe" actions={<Btn kind="primary" onClick={search} disabled={busy || s.palette.length < 2}>{busy ? 'Searching…' : '🎯 Match target'}</Btn>}>
          {!fits && <p className="muted">Tries every pair and trio from your palette ({s.palette.length} pigments) and optimises the ratios with a Kubelka–Munk model, ranking by CIEDE2000 colour difference.</p>}
          {fits && fits.map((f, k) => {
            const h = hex(mixRgb(f.ids.map((id, i) => ({ id, w: f.w[i] }))))
            const [ql, tone] = quality(f.dE)
            return (
              <div key={f.ids.join()} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 12, alignItems: 'center', padding: '8px 0', borderTop: k ? '1px solid var(--line)' : undefined }}>
                <Pair a={target} b={h} h={50} />
                <div>
                  <b>{partsText(f.ids, f.w)}</b>
                  <div className="muted" style={{ fontSize: 13 }}>ΔE₀₀ {num(f.dE, 2)} · <span style={{ color: tone === 'good' ? 'var(--ok)' : tone === 'bad' ? 'var(--err)' : undefined }}>{ql}</span></div>
                </div>
                <Row wrap={false}>
                  <Btn onClick={() => set({ mix: f.ids.map((id, i) => ({ id, w: Math.round(f.w[i] * 100) / 10 })) })}>Use</Btn>
                  <Btn kind="ghost" onClick={() => save(f.ids, f.w, f.dE)}>Save</Btn>
                </Row>
              </div>
            )
          })}
        </Panel>
        <Panel title="Mixer">
          <Pair a={target} b={mixHex} />
          <Stats>
            <Stat label="ΔE₀₀ to target" value={num(mixDE, 2)} tone={quality(mixDE)[1]} sub={quality(mixDE)[0]} />
            <Stat label="Screen average (wrong)" value={<Swatch c={naive} size={30} />} sub="RGB averaging ignores pigment absorption" />
          </Stats>
          {s.mix.map((p, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px minmax(120px, 1fr) minmax(100px, 1.4fr) 64px 30px', gap: 8, alignItems: 'center', margin: '6px 0' }}>
              <Swatch c={hex(mixRgb([{ id: p.id, w: 1 }]))} size={26} />
              <select className="k-select" value={p.id} onChange={(e) => editMix(i, { id: e.target.value })} aria-label="Pigment">
                {PIGMENTS.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
              </select>
              <input type="range" min={0} max={10} step={0.1} value={p.w} onChange={(e) => editMix(i, { w: Number(e.target.value) })} aria-label="Amount" />
              <span className="mono" style={{ textAlign: 'right' }}>{num((p.w / total) * 100, 0)}%</span>
              <Btn kind="ghost" onClick={() => set({ mix: s.mix.filter((_, j) => j !== i) })} disabled={s.mix.length < 2} title="Remove">✕</Btn>
            </div>
          ))}
          <Row>
            <Btn onClick={() => set({ mix: [...s.mix, { id: PIGMENTS.find((q) => !s.mix.some((m) => m.id === q.id))!.id, w: 1 }] })} disabled={s.mix.length >= 4}>+ Pigment</Btn>
            <Btn onClick={optimiseMix} disabled={new Set(s.mix.map((m) => m.id)).size !== s.mix.length} title="Keep these pigments, find the best ratios">Optimise ratios</Btn>
            <Btn kind="primary" onClick={() => save(s.mix.map((m) => m.id), s.mix.map((m) => m.w / total), mixDE)}>Save recipe</Btn>
          </Row>
          <div style={{ marginTop: 10 }}>
            <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>Tint ladder (mix + white) and shade ladder (mix + black):</div>
            <div style={{ display: 'flex', gap: 3 }}>
              {[0.6, 0.4, 0.25, 0.1].map((k) => <Swatch key={`w${k}`} c={hex(mixRgb([...s.mix.map((m) => ({ id: m.id, w: (m.w / total) * (1 - k) })), { id: 'white', w: k * 3 }]))} size={34} title={`+ white`} />)}
              <Swatch c={mixHex} size={34} title="mix" />
              {[0.03, 0.08, 0.15].map((k) => <Swatch key={`b${k}`} c={hex(mixRgb([...s.mix.map((m) => ({ id: m.id, w: (m.w / total) * (1 - k) })), { id: 'black', w: k }]))} size={34} title="+ black" />)}
            </div>
          </div>
          <Row>
            <Num label="Batch size" value={s.amount} onChange={(amount) => set({ amount })} unit="g / mL" min={1} />
            <div style={{ fontSize: 14 }}>{s.mix.map((m) => <div key={m.id}>{pig(m.id)?.name}: <b>{num((m.w / total) * s.amount, 1)}</b></div>)}</div>
          </Row>
        </Panel>
        <Panel title="Saved recipes" actions={<><JsonButtons name="paint-recipes.json" data={s.recipes} onLoad={(r) => Array.isArray(r) && set({ recipes: r })} /><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          {s.recipes.length === 0 && <p className="muted">Nothing saved yet. Save a match or your mixer to keep it here (stored in this browser).</p>}
          {s.recipes.map((r) => {
            const h = hex(mixRgb(r.parts))
            return (
              <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--line)' }}>
                <Swatch c={r.target} size={30} title="target" /><Swatch c={h} size={30} title="mix" />
                <input className="k-text" value={r.name} onChange={(e) => set({ recipes: s.recipes.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)) })} style={{ maxWidth: 140 }} aria-label="Recipe name" />
                <span style={{ flex: 1, fontSize: 13 }}>{partsText(r.parts.map((p) => p.id), r.parts.map((p) => p.w))} <span className="muted">ΔE {num(r.dE, 1)}</span></span>
                <Btn kind="ghost" onClick={() => { const tot = r.parts.reduce((a, p) => a + p.w, 0) || 1; set({ target: r.target, mix: r.parts.map((p) => ({ id: p.id, w: Math.round((p.w / tot) * 100) / 10 })) }) }}>Load</Btn>
                <Btn kind="ghost" onClick={() => set({ recipes: s.recipes.filter((x) => x.id !== r.id) })}>✕</Btn>
              </div>
            )
          })}
        </Panel>
        <Note>Approximate model: two-constant Kubelka–Munk with opaque layers. It predicts direction and rough ratios; always test a small swatch and adjust by eye.</Note>
      </div>
    </Split>
  )
}
