import { useState } from 'react'
import { Area, Btn, Check, CopyButton, Note, Num, Panel, Row, Seg, Slider, Split, uid, useToolState } from '../kit'
import { layerCss, parseShadow, shadowCss, smooth, type Layer } from './lib/box-shadow-designer'

const L = (x: number, y: number, blur: number, spread: number, color: string, alpha: number, inset = false): Layer => ({ id: uid(), x, y, blur, spread, color, alpha, inset, on: true })

const PRESETS: [string, () => Layer[], Partial<Box>?][] = [
  ['Smooth (layered)', () => smooth(6, 0, 32, 56, 0.28, '#0f172a', uid)],
  ['Material 2dp', () => [L(0, 3, 1, -2, '#000000', 0.2), L(0, 2, 2, 0, '#000000', 0.14), L(0, 1, 5, 0, '#000000', 0.12)]],
  ['Material 8dp', () => [L(0, 5, 5, -3, '#000000', 0.2), L(0, 8, 10, 1, '#000000', 0.14), L(0, 3, 14, 2, '#000000', 0.12)]],
  ['Floating card', () => [L(0, 1, 2, 0, '#0f172a', 0.06), L(0, 10, 30, -6, '#0f172a', 0.25)]],
  ['Brutalist', () => [L(6, 6, 0, 0, '#111111', 1)], { radius: 4, box: '#fde047', border: true }],
  ['Neumorphic', () => [L(10, 10, 24, 0, '#a3b1c6', 0.6), L(-10, -10, 24, 0, '#ffffff', 0.9)], { bg: '#e0e5ec', box: '#e0e5ec' }],
  ['Inner pressed', () => [L(0, 2, 6, 0, '#000000', 0.25, true), L(0, -1, 0, 0, '#ffffff', 0.6, true)], { bg: '#e2e8f0', box: '#e2e8f0' }],
  ['Neon glow', () => [L(0, 0, 8, 0, '#22d3ee', 0.9), L(0, 0, 24, 4, '#22d3ee', 0.5), L(0, 0, 60, 8, '#a855f7', 0.45)], { bg: '#0b1020', box: '#111827' }],
  ['Focus ring', () => [L(0, 0, 0, 2, '#ffffff', 1), L(0, 0, 0, 4, '#6366f1', 1)], { radius: 10 }],
]

interface Box { bg: string; box: string; radius: number; w: number; h: number; border: boolean }
const DEF = {
  layers: smooth(6, 0, 32, 56, 0.28, '#0f172a', uid),
  sel: 0,
  box: { bg: '#f1f5f9', box: '#ffffff', radius: 18, w: 260, h: 180, border: false } as Box,
  smoothN: 6, smoothY: 32, smoothBlur: 56, smoothA: 0.28, smoothColor: '#0f172a',
  format: 'css' as 'css' | 'tailwind' | 'js',
}

export default function BoxShadowDesigner() {
  const [s, set, reset] = useToolState('box-shadow-designer', DEF)
  const [paste, setPaste] = useState('')
  const [pasteErr, setPasteErr] = useState('')
  const sel = Math.min(s.sel, s.layers.length - 1)
  const cur = s.layers[sel]
  const shadow = shadowCss(s.layers, ', ')
  const edit = (p: Partial<Layer>) => set({ layers: s.layers.map((l, i) => (i === sel ? { ...l, ...p } : l)) })
  const setBox = (p: Partial<Box>) => set({ box: { ...s.box, ...p } })
  const move = (d: number) => {
    const j = sel + d
    if (j < 0 || j >= s.layers.length) return
    const x = [...s.layers]
    ;[x[sel], x[j]] = [x[j], x[sel]]
    set({ layers: x, sel: j })
  }
  const code =
    s.format === 'css'
      ? `.card {\n  border-radius: ${s.box.radius}px;\n  box-shadow: ${shadowCss(s.layers)};\n}`
      : s.format === 'tailwind'
        ? `shadow-[${shadow.replace(/ /g, '_')}]`
        : `boxShadow: '${shadow}'`

  return (
    <Split>
      <div>
        <Panel title="Layers" actions={<><Btn onClick={() => set({ layers: [...s.layers, L(0, 4, 12, 0, '#000000', 0.15)], sel: s.layers.length })}>+ Layer</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {s.layers.map((l, i) => (
              <div key={l.id} onClick={() => set({ sel: i })} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${i === sel ? 'var(--accent)' : 'var(--line)'}`, background: i === sel ? 'var(--panel2)' : undefined, opacity: l.on ? 1 : 0.5 }}>
                <input type="checkbox" checked={l.on} onChange={(e) => set({ layers: s.layers.map((q, k) => (k === i ? { ...q, on: e.target.checked } : q)) })} onClick={(e) => e.stopPropagation()} aria-label="Enabled" />
                <span style={{ width: 16, height: 16, borderRadius: 4, background: l.color, opacity: Math.max(0.15, l.alpha), border: '1px solid var(--line)' }} />
                <code style={{ fontSize: 11.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{layerCss(l)}</code>
              </div>
            ))}
            {!s.layers.length && <Note>No layers — add one or pick a preset.</Note>}
          </div>
        </Panel>
        {cur && (
          <Panel
            title={`Layer ${sel + 1}`}
            actions={
              <>
                <Btn kind="ghost" title="Move up" disabled={sel === 0} onClick={() => move(-1)}>↑</Btn>
                <Btn kind="ghost" title="Move down" disabled={sel === s.layers.length - 1} onClick={() => move(1)}>↓</Btn>
                <Btn onClick={() => set({ layers: [...s.layers.slice(0, sel + 1), { ...cur, id: uid() }, ...s.layers.slice(sel + 1)], sel: sel + 1 })}>Duplicate</Btn>
                <Btn kind="danger" onClick={() => set({ layers: s.layers.filter((_, i) => i !== sel), sel: Math.max(0, sel - 1) })}>Delete</Btn>
              </>
            }
          >
            <Slider label="Offset X" value={cur.x} onChange={(x) => edit({ x })} min={-100} max={100} unit="px" />
            <Slider label="Offset Y" value={cur.y} onChange={(y) => edit({ y })} min={-100} max={100} unit="px" />
            <Slider label="Blur" value={cur.blur} onChange={(blur) => edit({ blur })} min={0} max={150} unit="px" />
            <Slider label="Spread" value={cur.spread} onChange={(spread) => edit({ spread })} min={-60} max={60} unit="px" />
            <Row>
              <label className="k-field">
                <span className="k-label">Colour</span>
                <input type="color" value={cur.color} onChange={(e) => edit({ color: e.target.value })} style={{ width: 64, height: 36 }} />
              </label>
              <Slider label="Opacity" value={cur.alpha} onChange={(alpha) => edit({ alpha })} min={0} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
            </Row>
            <Check label="Inset (inner shadow)" value={cur.inset} onChange={(inset) => edit({ inset })} />
          </Panel>
        )}
        <Panel title="Smooth shadow generator">
          <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>Stacks several soft layers with eased offsets — looks more like real light than a single shadow.</p>
          <Row>
            <Num label="Layers" value={s.smoothN} onChange={(smoothN) => set({ smoothN: Math.max(2, Math.min(10, Math.round(smoothN))) })} min={2} max={10} />
            <Num label="Final Y offset" value={s.smoothY} onChange={(smoothY) => set({ smoothY })} unit="px" />
            <Num label="Final blur" value={s.smoothBlur} onChange={(smoothBlur) => set({ smoothBlur: Math.max(0, smoothBlur) })} unit="px" />
          </Row>
          <Row>
            <Slider label="Total opacity" value={s.smoothA} onChange={(smoothA) => set({ smoothA })} min={0.05} max={1} step={0.01} show={(v) => `${Math.round(v * 100)}%`} />
            <input type="color" value={s.smoothColor} onChange={(e) => set({ smoothColor: e.target.value })} aria-label="Shadow colour" style={{ width: 54, height: 36, alignSelf: 'end' }} />
          </Row>
          <Btn kind="primary" onClick={() => set({ layers: smooth(s.smoothN, 0, s.smoothY, s.smoothBlur, s.smoothA, s.smoothColor, uid), sel: 0 })}>Generate layers</Btn>
        </Panel>
      </div>
      <div>
        <Panel title="Preview">
          <div style={{ background: s.box.bg, borderRadius: 12, minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, transition: 'background .2s' }}>
            <div style={{ width: s.box.w, maxWidth: '100%', height: s.box.h, background: s.box.box, borderRadius: s.box.radius, boxShadow: shadow, border: s.box.border ? '2px solid #111' : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13, fontFamily: 'var(--mono)' }}>
              {s.layers.filter((l) => l.on).length} layer{s.layers.filter((l) => l.on).length === 1 ? '' : 's'}
            </div>
          </div>
          <div style={{ height: 10 }} />
          <Row>
            <label className="k-field"><span className="k-label">Background</span><input type="color" value={s.box.bg} onChange={(e) => setBox({ bg: e.target.value })} style={{ width: 56, height: 32 }} /></label>
            <label className="k-field"><span className="k-label">Box</span><input type="color" value={s.box.box} onChange={(e) => setBox({ box: e.target.value })} style={{ width: 56, height: 32 }} /></label>
            <Slider label="Radius" value={s.box.radius} onChange={(radius) => setBox({ radius })} min={0} max={120} unit="px" />
          </Row>
          <Row>
            <Slider label="Width" value={s.box.w} onChange={(w) => setBox({ w })} min={60} max={420} unit="px" />
            <Slider label="Height" value={s.box.h} onChange={(h) => setBox({ h })} min={40} max={320} unit="px" />
            <Check label="Border" value={s.box.border} onChange={(border) => setBox({ border })} />
          </Row>
        </Panel>
        <Panel title="Presets">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 12 }}>
            {PRESETS.map(([name, mk, box]) => {
              const layers = mk()
              const b = { ...s.box, ...DEF.box, ...box }
              return (
                <button key={name} type="button" onClick={() => set({ layers: mk(), sel: 0, box: { ...s.box, ...DEF.box, ...box } })} style={{ background: b.bg, border: '1px solid var(--line)', borderRadius: 10, padding: '18px 8px 8px', cursor: 'pointer' }}>
                  <div style={{ width: 64, height: 40, margin: '0 auto 12px', background: b.box, borderRadius: Math.min(12, b.radius), boxShadow: shadowCss(layers, ', '), border: b.border ? '2px solid #111' : undefined }} />
                  <span style={{ fontSize: 12, color: b.bg === '#0b1020' ? '#e2e8f0' : '#334155', fontWeight: 600 }}>{name}</span>
                </button>
              )
            })}
          </div>
        </Panel>
        <Panel title="Code" actions={<><Seg value={s.format} onChange={(format) => set({ format })} options={[['css', 'CSS'], ['tailwind', 'Tailwind'], ['js', 'JS / React']]} /><CopyButton text={code} /></>}>
          <pre style={{ margin: 0, padding: 12, background: 'var(--panel2)', borderRadius: 8, overflowX: 'auto', fontSize: 12.5, fontFamily: 'var(--mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{code}</pre>
        </Panel>
        <Panel title="Import an existing box-shadow">
          <Area value={paste} onChange={setPaste} rows={3} mono placeholder="box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 1px 2px rgba(0,0,0,.24);" />
          <Btn
            onClick={() => {
              const ls = parseShadow(paste, uid)
              if (!ls.length) return setPasteErr('Could not find any shadow layers in that text.')
              setPasteErr('')
              set({ layers: ls, sel: 0 })
            }}
          >
            Import
          </Btn>
          {pasteErr && <Note tone="err">{pasteErr}</Note>}
        </Panel>
      </div>
    </Split>
  )
}
