import { useState, type CSSProperties, type ReactNode } from 'react'
import { Btn, color, CopyButton, download, Num, Panel, Row, Select, Slider, Split, uid, useToolState } from '../kit'
import { CONTAINER_DEFAULT, fullCss, isLength, ITEM_DEFAULT, type Container, type Item } from './lib/flexbox-playground'

interface State {
  c: Container
  items: Item[]
  width: number
  height: number
  sel: number
}

const mk = (p: Partial<Item> = {}): Item => ({ id: uid(), ...ITEM_DEFAULT, ...p })
const LABELS = ['Home', 'Products & services', 'About', 'Blog', 'Contact us', 'Careers', 'Help', 'Login', 'Shop', 'News', 'FAQ', 'Docs']
const SIZES = [14, 22, 16, 28, 14, 18, 15, 20, 14, 24, 16, 18]

const DEF: State = {
  c: { ...CONTAINER_DEFAULT, justify: 'space-between', alignItems: 'center', rowGap: 10, colGap: 10 },
  items: [mk(), mk({ grow: 1, basis: '0%' }), mk(), mk({ alignSelf: 'flex-end' }), mk()],
  width: 100,
  height: 260,
  sel: 1,
}

const PRESETS: [string, () => Pick<State, 'c' | 'items'>][] = [
  ['Navbar', () => ({ c: { ...CONTAINER_DEFAULT, alignItems: 'center', colGap: 12, rowGap: 12 }, items: [mk(), mk({ grow: 1, basis: '0%' }), mk(), mk(), mk()] })],
  ['Perfect centering', () => ({ c: { ...CONTAINER_DEFAULT, justify: 'center', alignItems: 'center' }, items: [mk()] })],
  ['Wrapping cards', () => ({ c: { ...CONTAINER_DEFAULT, wrap: 'wrap', rowGap: 12, colGap: 12, alignContent: 'flex-start' }, items: Array.from({ length: 7 }, () => mk({ grow: 1, shrink: 1, basis: '140px' })) })],
  ['Sidebar + main', () => ({ c: { ...CONTAINER_DEFAULT, colGap: 12, rowGap: 12 }, items: [mk({ basis: '160px', shrink: 0 }), mk({ grow: 1, basis: '0%' })] })],
  ['Equal columns', () => ({ c: { ...CONTAINER_DEFAULT, colGap: 10, rowGap: 10 }, items: [mk({ grow: 1, basis: '0%' }), mk({ grow: 1, basis: '0%' }), mk({ grow: 1, basis: '0%' })] })],
  ['Sticky footer', () => ({ c: { ...CONTAINER_DEFAULT, direction: 'column' }, items: [mk(), mk({ grow: 1, basis: 'auto' }), mk()] })],
  ['Push last right', () => ({ c: { ...CONTAINER_DEFAULT, alignItems: 'center', colGap: 8, rowGap: 8 }, items: [mk(), mk(), mk(), mk({ order: 1 })] })],
  ['Baseline labels', () => ({ c: { ...CONTAINER_DEFAULT, alignItems: 'baseline', colGap: 16, rowGap: 16, justify: 'center' }, items: [mk(), mk(), mk(), mk()] })],
]

const Tip = ({ children }: { children: ReactNode }) => (
  <div className="k-note" style={{ background: 'color-mix(in srgb, var(--accent2) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent2) 35%, transparent)' }}>{children}</div>
)

const EXPLAIN: Record<string, string> = {
  direction: 'Sets the main axis. Row = left→right, column = top→bottom; -reverse flips the start.',
  wrap: 'Whether items may break onto new lines when they do not fit the main axis.',
  justify: 'Distributes free space along the main axis.',
  alignItems: 'Aligns items on the cross axis within their line.',
  alignContent: 'Distributes the lines themselves on the cross axis (only with wrapping and spare space).',
}

const px = (v: string) => (/^\d+(\.\d+)?$/.test(v) ? `${v}px` : v)

export default function FlexboxPlayground() {
  const [s, set, reset] = useToolState('flexbox-playground', DEF)
  const [focus, setFocus] = useState<keyof typeof EXPLAIN>('justify')
  const c = s.c
  const sel = Math.min(s.sel, s.items.length - 1)
  const it = s.items[sel]
  const setC = (p: Partial<Container>) => set({ c: { ...c, ...p } })
  const setI = (p: Partial<Item>) => set({ items: s.items.map((x, i) => (i === sel ? { ...x, ...p } : x)) })
  const css = fullCss(c, s.items)
  const html = `<div class="container">\n${s.items.map((_, i) => `  <div class="item item-${i + 1}">${LABELS[i % LABELS.length]}</div>`).join('\n')}\n</div>`
  const column = c.direction.startsWith('column')

  // The preview is driven by CSS custom properties, like a real component would be.
  const vars = {
    '--fx-dir': c.direction, '--fx-wrap': c.wrap, '--fx-justify': c.justify, '--fx-items': c.alignItems, '--fx-content': c.alignContent, '--fx-gap': `${c.rowGap}px ${c.colGap}px`,
  } as CSSProperties
  const box: CSSProperties = {
    ...vars, display: 'flex', flexDirection: 'var(--fx-dir)' as CSSProperties['flexDirection'], flexWrap: 'var(--fx-wrap)' as CSSProperties['flexWrap'], justifyContent: 'var(--fx-justify)', alignItems: 'var(--fx-items)', alignContent: 'var(--fx-content)', gap: 'var(--fx-gap)',
    width: `${s.width}%`, height: s.height, padding: 10, borderRadius: 12, border: '2px dashed var(--line)', background: 'repeating-linear-gradient(45deg, transparent 0 10px, color-mix(in srgb, var(--line) 35%, transparent) 10px 11px)', overflow: 'auto', boxSizing: 'border-box', transition: 'width .2s',
  }

  const pick = <K extends keyof Container>(k: K, label: string, opts: readonly string[]) => (
    <div style={{ flex: '1 1 140px', minWidth: 0 }} onFocus={() => setFocus(k as keyof typeof EXPLAIN)} onMouseEnter={() => setFocus(k as keyof typeof EXPLAIN)}>
      <Select label={label} value={c[k] as string} onChange={(v) => setC({ [k]: v } as Partial<Container>)} options={opts} />
    </div>
  )

  return (
    <Split>
      <div>
        <Panel title="Container" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            {pick('direction', 'flex-direction', ['row', 'row-reverse', 'column', 'column-reverse'])}
            {pick('wrap', 'flex-wrap', ['nowrap', 'wrap', 'wrap-reverse'])}
          </Row>
          <Row>
            {pick('justify', 'justify-content', ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'])}
            {pick('alignItems', 'align-items', ['stretch', 'flex-start', 'flex-end', 'center', 'baseline'])}
          </Row>
          {pick('alignContent', 'align-content', ['normal', 'flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly', 'stretch'])}
          <Row>
            <Num label="row-gap" value={c.rowGap} onChange={(rowGap) => setC({ rowGap })} unit="px" min={0} max={100} />
            <Num label="column-gap" value={c.colGap} onChange={(colGap) => setC({ colGap })} unit="px" min={0} max={100} />
          </Row>
          <Tip><b>{focus}:</b> {EXPLAIN[focus]}</Tip>
        </Panel>
        <Panel
          title={`Item ${sel + 1}`}
          actions={
            <>
              <Btn onClick={() => set({ items: [...s.items, mk()], sel: s.items.length })} disabled={s.items.length >= 12}>+ Item</Btn>
              <Btn kind="ghost" onClick={() => set({ items: s.items.filter((_, i) => i !== sel), sel: Math.max(0, sel - 1) })} disabled={s.items.length <= 1}>Remove</Btn>
            </>
          }
        >
          {it && (
            <>
              <Row>
                <Num label="flex-grow" value={it.grow} onChange={(grow) => setI({ grow: Math.max(0, grow) })} min={0} step={1} />
                <Num label="flex-shrink" value={it.shrink} onChange={(shrink) => setI({ shrink: Math.max(0, shrink) })} min={0} step={1} />
              </Row>
              <Row>
                <label className={`k-field ${isLength(it.basis) ? '' : 'err'}`}>
                  <span className="k-label">flex-basis</span>
                  <input className="k-text" value={it.basis} onChange={(e) => setI({ basis: e.target.value })} list="fx-basis" />
                  <datalist id="fx-basis">{['auto', '0%', '100px', '160px', '25%', '50%', 'content'].map((v) => <option key={v} value={v} />)}</datalist>
                </label>
                <Num label="order" value={it.order} onChange={(order) => setI({ order: Math.round(order) })} step={1} />
              </Row>
              <Select label="align-self" value={it.alignSelf} onChange={(alignSelf) => setI({ alignSelf })} options={['auto', 'stretch', 'flex-start', 'flex-end', 'center', 'baseline']} />
              <Row>
                <label className={`k-field ${isLength(it.w) ? '' : 'err'}`}>
                  <span className="k-label">width</span>
                  <input className="k-text" value={it.w} placeholder="auto" onChange={(e) => setI({ w: e.target.value })} />
                </label>
                <label className={`k-field ${isLength(it.h) ? '' : 'err'}`}>
                  <span className="k-label">height</span>
                  <input className="k-text" value={it.h} placeholder="auto" onChange={(e) => setI({ h: e.target.value })} />
                </label>
              </Row>
              <Row>
                <Btn kind="ghost" onClick={() => setI({ grow: 1, shrink: 1, basis: '0%' })}>flex: 1</Btn>
                <Btn kind="ghost" onClick={() => setI({ grow: 0, shrink: 0, basis: 'auto' })}>flex: none</Btn>
                <Btn kind="ghost" onClick={() => setI({ ...ITEM_DEFAULT })}>initial</Btn>
              </Row>
            </>
          )}
        </Panel>
      </div>

      <div>
        <Panel title="Presets">
          <Row>
            {PRESETS.map(([name, f]) => (
              <Btn key={name} kind="ghost" onClick={() => set({ ...f(), sel: 0 })}>{name}</Btn>
            ))}
          </Row>
        </Panel>
        <Panel title="Preview" actions={<span className="muted" style={{ fontSize: 13 }}>main axis {column ? '↓' : '→'}{c.direction.endsWith('reverse') ? ' (reversed)' : ''} · cross axis {column ? '→' : '↓'}</span>}>
          <Row>
            <Slider label="Container width" value={s.width} onChange={(width) => set({ width })} min={30} max={100} unit="%" show={(v) => String(v)} />
            <Slider label="Container height" value={s.height} onChange={(height) => set({ height })} min={80} max={520} unit="px" show={(v) => String(v)} />
          </Row>
          <div style={box}>
            {s.items.map((x, i) => (
              <button
                key={x.id}
                type="button"
                onClick={() => set({ sel: i })}
                style={{
                  flex: `${x.grow} ${x.shrink} ${x.basis || 'auto'}`, alignSelf: x.alignSelf, order: x.order, width: x.w ? px(x.w) : undefined, height: x.h ? px(x.h) : undefined,
                  minWidth: 0, padding: '10px 12px', borderRadius: 8, border: i === sel ? '3px solid var(--fg)' : '3px solid transparent', background: color(i), color: '#fff', font: 'inherit', fontSize: SIZES[i % SIZES.length], fontWeight: 700, cursor: 'pointer', textAlign: 'left', boxShadow: '0 1px 3px rgba(0,0,0,.2)', overflow: 'hidden',
                }}
                title={`Item ${i + 1}: flex ${x.grow} ${x.shrink} ${x.basis}${x.order ? `, order ${x.order}` : ''}`}
              >
                <span style={{ fontSize: 11, opacity: 0.85, display: 'block' }}>{i + 1}</span>
                {LABELS[i % LABELS.length]}
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>Click an item to edit it. Shrink the container width to see flex-shrink and wrapping in action.</p>
        </Panel>
        <Panel title="Generated code" actions={<><CopyButton text={css} label="Copy CSS" /><CopyButton text={html} label="Copy HTML" /><Btn onClick={() => download('flexbox.html', `<!doctype html>\n<meta charset="utf-8">\n<style>\n${css}\n.item { padding: 10px 12px; background: #6366f1; color: #fff; border-radius: 8px; }\n</style>\n${html}\n`, 'text/html')}>⬇ HTML file</Btn></>}>
          <pre style={{ margin: 0, padding: 12, borderRadius: 10, background: 'var(--panel)', border: '1px solid var(--line)', overflow: 'auto', fontSize: 13, maxHeight: 320 }}>{css}</pre>
        </Panel>
      </div>
    </Split>
  )
}
