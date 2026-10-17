import { useMemo, useState } from 'react'
import { Area, Btn, Check, CopyButton, Note, Panel, Row, Seg, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { decode, encode, inspect, NAMED, type Form, type Scope } from './lib/html-entity-converter'

const SAMPLE = 'Café “Le Petit” — 5 € < 10 € & open 9–5 ✓\nFish & chips: £7.50 · Ünïcödé 😀 ≥ ∞'
const DEF = { mode: 'encode' as 'encode' | 'decode', text: SAMPLE, scope: 'nonascii' as Scope, form: 'named' as Form, keepNl: true, q: '' }

/** Browser fallback for the ~2,000 HTML5 names not in the compact table. DOMParser documents never run scripts. */
function domDecode(entity: string): string | null {
  if (typeof DOMParser === 'undefined' || !/^&[A-Za-z][A-Za-z0-9]*;$/.test(entity)) return null
  return new DOMParser().parseFromString(`<!doctype html><body>${entity}`, 'text/html').body.textContent
}

const ENTITY_LIST = Object.entries(NAMED).filter(([n]) => n !== 'Tab' && n !== 'NewLine').sort((a, b) => a[1] - b[1])

export default function HtmlEntityConverter() {
  const [s, set] = useToolState('html-entity-converter', DEF)
  const [pick, setPick] = useState<number | null>(null)

  const res = useMemo(() => {
    if (s.mode === 'encode') return { out: encode(s.text, s.scope, s.form, s.keepNl), count: 0, unknown: [] as string[] }
    const d = decode(s.text, domDecode)
    return { out: d.text, count: d.count, unknown: d.unknown }
  }, [s.text, s.mode, s.scope, s.form, s.keepNl])
  const plain = s.mode === 'encode' ? s.text : res.out
  const cps = useMemo(() => inspect(plain, 300), [plain])
  const refs = s.mode === 'encode' ? (res.out.match(/&#?[\w]+;/g) ?? []).length : res.count
  const nonAscii = [...plain].filter((c) => c.codePointAt(0)! > 126).length
  const list = ENTITY_LIST.filter(([n, cp]) => !s.q || n.toLowerCase().includes(s.q.toLowerCase()) || String.fromCodePoint(cp) === s.q || cp.toString(16) === s.q.toLowerCase().replace(/^u\+/, ''))
  const sel = pick !== null ? cps[pick] : null

  return (
    <Split wide="right">
      <div>
        <Panel title="Input">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['encode', 'Text → entities'], ['decode', 'Entities → text']]} />
          <div style={{ marginTop: 10 }}>
            <Area value={s.text} onChange={(text) => set({ text })} rows={7} mono placeholder={s.mode === 'encode' ? 'Text to escape…' : 'Text with &amp;entities;…'} />
          </div>
          <Row>
            <Btn kind="ghost" onClick={() => set({ text: SAMPLE, mode: 'encode' })}>Text sample</Btn>
            <Btn kind="ghost" onClick={() => set({ text: '&lt;p class=&quot;x&quot;&gt;Caf&eacute; &#8212; 5&nbsp;&euro; &#x1F600; &Kopf; &hearts;&lt;/p&gt;', mode: 'decode' })}>Entity sample</Btn>
            <Btn onClick={() => set({ text: res.out, mode: s.mode === 'encode' ? 'decode' : 'encode' })}>⇅ Swap</Btn>
          </Row>
        </Panel>
        {s.mode === 'encode' && (
          <Panel title="Encoding options">
            <p className="k-label" style={{ margin: '0 0 6px' }}>What to encode</p>
            <Seg value={s.scope} onChange={(scope) => set({ scope })} options={[['basic', 'Only & < > " \''], ['nonascii', '+ non-ASCII'], ['all', 'Everything']]} />
            <p className="k-label" style={{ margin: '12px 0 6px' }}>Reference style</p>
            <Seg value={s.form} onChange={(form) => set({ form })} options={[['named', 'Named (&eacute;)'], ['decimal', 'Decimal (&#233;)'], ['hex', 'Hex (&#xE9;)']]} />
            <Check label="Keep line breaks as-is" value={s.keepNl} onChange={(keepNl) => set({ keepNl })} />
            <Note>Named style falls back to hex for characters without a name. The apostrophe becomes <code>&amp;#39;</code> because <code>&amp;apos;</code> is not valid in HTML 4.</Note>
          </Panel>
        )}
        <Panel title="Entity reference">
          <Txt label="Search name, character or hex" value={s.q} onChange={(q) => set({ q })} placeholder="e.g. arrow, é, 2014" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 6, maxHeight: 340, overflow: 'auto', marginTop: 8 }}>
            {list.slice(0, 400).map(([n, cp]) => (
              <button key={n} type="button" className="k-btn ghost" title={`U+${cp.toString(16).toUpperCase().padStart(4, '0')} · click to append`} onClick={() => set({ text: s.text + (s.mode === 'encode' ? String.fromCodePoint(cp) : `&${n};`) })} style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', padding: '4px 8px' }}>
                <b style={{ fontSize: 18, minWidth: 18, textAlign: 'center' }}>{cp === 160 ? '⍽' : String.fromCodePoint(cp)}</b>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>&amp;{n};</span>
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>{list.length} of {ENTITY_LIST.length} common entities. Decoding also understands all other HTML5 names via the browser's parser.</p>
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Input" value={`${[...s.text].length} chars`} />
          <Stat label="Output" value={`${[...res.out].length} chars`} sub={`${res.out.length > s.text.length ? '+' : ''}${res.out.length - s.text.length}`} />
          <Stat label={s.mode === 'encode' ? 'References written' : 'References decoded'} value={refs} tone="accent" />
          <Stat label="Non-ASCII characters" value={nonAscii} />
        </Stats>
        {res.unknown.length > 0 && <Note tone="warn">Unknown entities left as-is: {res.unknown.join(' ')}</Note>}
        <Panel title={s.mode === 'encode' ? 'Encoded HTML' : 'Decoded text'} actions={<CopyButton text={res.out} />}>
          <textarea className="k-area mono" readOnly rows={7} value={res.out} spellCheck={false} />
          {s.mode === 'encode' && (
            <p className="muted" style={{ fontSize: 13 }}>
              Rendered by the browser: <span style={{ color: 'var(--fg)' }}>{decode(res.out, domDecode).text}</span>
            </p>
          )}
        </Panel>
        <Panel title="Code point inspector">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
            {cps.map((c, i) => (
              <button key={i} type="button" onClick={() => setPick(i)} title={c.hex} className="k-btn ghost" style={{ minWidth: 34, padding: '4px 6px', fontSize: 18, outline: pick === i ? '2px solid var(--accent)' : undefined, background: c.cp > 126 ? 'rgba(99,102,241,.12)' : undefined }}>
                {c.ch === ' ' ? '␠' : c.ch === '\n' ? '↵' : c.ch === ' ' ? '⍽' : c.ch}
              </button>
            ))}
          </div>
          {sel ? (
            <Table
              head={['Property', 'Value']}
              rows={[
                ['Character', <b key="c" style={{ fontSize: 28 }}>{sel.ch}</b>],
                ['Code point', `${sel.hex} (decimal ${sel.cp})`],
                ['Category', sel.cat],
                ['UTF-8 bytes', <code key="u8">{sel.utf8}</code>],
                ['UTF-16 units', <code key="u16">{sel.utf16}</code>],
                ['HTML', <code key="h">{[sel.named, `&#${sel.cp};`, `&#x${sel.cp.toString(16).toUpperCase()};`].filter(Boolean).join('  ')}</code>],
                ['JavaScript', <code key="j">{sel.js}</code>],
                ['CSS content', <code key="css">{sel.css}</code>],
                ['URL encoded', <code key="url">{sel.url}</code>],
              ]}
            />
          ) : (
            <Table
              head={['Char', 'Code point', 'Category', 'Named', 'UTF-8']}
              rows={cps.filter((c) => c.cp > 126 || /[&<>"']/.test(c.ch)).slice(0, 40).map((c) => [<b key="c" style={{ fontSize: 18 }}>{c.ch}</b>, c.hex, c.cat, <code key="n">{c.named || '—'}</code>, <code key="u">{c.utf8}</code>])}
            />
          )}
          <p className="muted" style={{ fontSize: 12.5 }}>{sel ? 'Click another character, or ' : 'Special and non-ASCII characters are listed; '}click a character above for full details.</p>
        </Panel>
      </div>
    </Split>
  )
}
