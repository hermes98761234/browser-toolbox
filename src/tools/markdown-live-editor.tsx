import { useMemo, useRef } from 'react'
import { Btn, Check, CopyButton, FileDrop, Panel, Row, Seg, Split, Stat, Stats, download, uid, useToolState } from '../kit'
import { markdown, safeUrl, textStats } from './lib/markdown-live-editor'

const SAMPLE = `# Markdown Live Editor

Write on the left, see the result on the right. **Bold**, *italic*, ~~strikethrough~~ and \`inline code\` all work.
Drafts save automatically in this browser.

## Lists & tasks

- Fresh coffee
- Write the release notes
  - Changelog
  - Screenshots
- [x] Set up the repo
- [ ] Ship it 🚀

1. First
2. Second
3. Third

## Links & images

Visit [the CommonMark spec](https://commonmark.org "CommonMark") or just paste a URL: https://www.markdownguide.org

Images use the same idea with a bang: \`![alt text](https://example.com/photo.jpg)\`.

## Code

\`\`\`ts
function greet(name: string): string {
  return \`Hello, \${name}!\`
}
\`\`\`

> **Tip:** quotes can contain *any* Markdown,
> even multiple lines.

## Table

| Feature        | Shortcut | Status |
|:---------------|:--------:|-------:|
| Bold           | Ctrl+B   | ✅ |
| Italic         | Ctrl+I   | ✅ |
| Link           | Ctrl+K   | ✅ |

---

Raw HTML like <kbd>Ctrl</kbd> is shown as text unless you enable *Allow HTML* (it is sanitized either way).
`

const TOOLS: [string, string][] = [
  ['B', 'Bold (Ctrl+B)'],
  ['I', 'Italic (Ctrl+I)'],
  ['S', 'Strikethrough'],
  ['H', 'Heading'],
  ['🔗', 'Link (Ctrl+K)'],
  ['🖼', 'Image'],
  ['<>', 'Inline code'],
  ['{ }', 'Code block'],
  ['•', 'Bullet list'],
  ['1.', 'Numbered list'],
  ['☑', 'Task list'],
  ['❝', 'Quote'],
  ['▦', 'Table'],
  ['—', 'Horizontal rule'],
]

interface Draft { id: string; text: string; updated: number }
const first: Draft = { id: 'welcome', text: SAMPLE, updated: 0 }
const DEF = { drafts: [first] as Draft[], cur: 'welcome', view: 'split' as 'split' | 'edit' | 'preview', allowHtml: false, sync: true }

const TAGS = new Set('a abbr b blockquote br code dd del details div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img input ins kbd li mark ol p pre q s small span strong sub summary sup table tbody td tfoot th thead tr u ul'.split(' '))
const ATTRS = new Set(['href', 'src', 'alt', 'title', 'id', 'class', 'start', 'type', 'checked', 'disabled', 'colspan', 'rowspan', 'open', 'loading'])

/** Allow-list sanitizer (DOMPurify-style): unknown tags are unwrapped, script-like content dropped. */
function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const walk = (el: Element) => {
    for (const c of [...el.children]) {
      const tag = c.tagName.toLowerCase()
      if (['script', 'style', 'iframe', 'object', 'embed', 'template', 'svg', 'math', 'form', 'link', 'meta', 'base'].includes(tag)) {
        c.remove()
        continue
      }
      for (const a of [...c.attributes]) {
        const n = a.name.toLowerCase()
        if (n === 'style' && /^text-align:\s*(left|right|center)$/i.test(a.value.trim())) continue
        if (!ATTRS.has(n)) c.removeAttribute(a.name)
        else if (n === 'href' || n === 'src') c.setAttribute(n, safeUrl(a.value, n === 'src'))
        else if (n === 'type' && a.value.toLowerCase() !== 'checkbox') c.removeAttribute(a.name)
      }
      if (tag === 'input') c.setAttribute('disabled', '')
      if (tag === 'a') {
        c.setAttribute('target', '_blank')
        c.setAttribute('rel', 'noopener noreferrer')
      }
      walk(c)
      if (!TAGS.has(tag)) c.replaceWith(...c.childNodes)
    }
  }
  walk(doc.body)
  return doc.body.innerHTML
}

const MD_CSS = `.mdp{line-height:1.6;overflow-wrap:anywhere}.mdp h1,.mdp h2{border-bottom:1px solid var(--line);padding-bottom:.25em}.mdp h1{font-size:1.8em;margin:.4em 0 .5em}.mdp h2{font-size:1.4em;margin:1.2em 0 .5em}
.mdp code{font-family:var(--mono);background:var(--grid);padding:.1em .35em;border-radius:5px;font-size:.9em}.mdp pre{background:#0f172a;color:#e2e8f0;padding:12px 14px;border-radius:10px;overflow:auto}.mdp pre code{background:none;padding:0;color:inherit}
.mdp blockquote{margin:1em 0;padding:.2em 1em;border-left:4px solid var(--accent);background:var(--grid);border-radius:0 8px 8px 0}.mdp table{border-collapse:collapse;margin:1em 0;display:block;overflow:auto}.mdp th,.mdp td{border:1px solid var(--line);padding:6px 12px}.mdp th{background:var(--grid)}
.mdp img{max-width:100%;border-radius:8px}.mdp li.task{list-style:none;margin-left:-1.3em}.mdp li.task input{display:inline-block;width:auto;margin:0 .45em 0 0;vertical-align:middle}.mdp ul,.mdp ol{padding-left:1.6em}.mdp li{margin:.15em 0}.mdp hr{border:0;border-top:2px solid var(--line);margin:1.5em 0}.mdp a{color:var(--accent)}.mdp kbd{border:1px solid var(--line);border-bottom-width:2px;border-radius:4px;padding:0 .3em;font-size:.85em}`

export default function MarkdownLiveEditor() {
  const [s, set, reset] = useToolState('markdown-live-editor', DEF)
  const ta = useRef<HTMLTextAreaElement>(null)
  const pv = useRef<HTMLDivElement>(null)
  const draft = s.drafts.find((d) => d.id === s.cur) ?? s.drafts[0] ?? first
  const text = draft.text
  const { html, headings } = useMemo(() => {
    const r = markdown(text, { allowHtml: s.allowHtml })
    return { html: typeof DOMParser === 'undefined' ? r.html : sanitize(r.html), headings: r.headings }
  }, [text, s.allowHtml])
  const st = textStats(text)
  const titleOf = (d: Draft) => /^#{1,6}\s+(.+)$/m.exec(d.text)?.[1].replace(/[*_`~]/g, '').slice(0, 40) || d.text.trim().split('\n')[0].slice(0, 40) || 'Untitled'
  const setText = (t: string) => set((x) => ({ ...x, drafts: x.drafts.map((d) => (d.id === draft.id ? { ...d, text: t, updated: Date.now() } : d)) }))

  const edit = (fn: (sel: string) => [string, number?, number?]) => {
    const el = ta.current
    if (!el) return
    const a = el.selectionStart, b = el.selectionEnd
    const [rep, s0, s1] = fn(text.slice(a, b))
    setText(text.slice(0, a) + rep + text.slice(b))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(a + (s0 ?? rep.length), a + (s1 ?? rep.length))
    })
  }
  const wrap = (l: string, r: string, ph: string) => edit((sel) => [`${l}${sel || ph}${r}`, l.length, l.length + (sel || ph).length])
  const prefix = (p: string | ((i: number) => string)) => edit((sel) => {
    const lines = (sel || 'Item').split('\n')
    const out = lines.map((x, i) => (typeof p === 'string' ? p : p(i)) + x).join('\n')
    return [out, 0, out.length]
  })
  const link = () => edit((sel) => [`[${sel || 'link text'}](https://)`, sel ? sel.length + 3 : 1, sel ? sel.length + 11 : 10])
  const runTool = (t: string) => {
    switch (t) {
      case 'Bold (Ctrl+B)':
        return wrap('**', '**', 'bold')
      case 'Italic (Ctrl+I)':
        return wrap('*', '*', 'italic')
      case 'Strikethrough':
        return wrap('~~', '~~', 'text')
      case 'Heading':
        return prefix('## ')
      case 'Link (Ctrl+K)':
        return link()
      case 'Image':
        return wrap('![', '](https://)', 'alt text')
      case 'Inline code':
        return wrap('`', '`', 'code')
      case 'Code block':
        return wrap('\n```\n', '\n```\n', 'code')
      case 'Bullet list':
        return prefix('- ')
      case 'Numbered list':
        return prefix((i) => `${i + 1}. `)
      case 'Task list':
        return prefix('- [ ] ')
      case 'Quote':
        return prefix('> ')
      case 'Table':
        return edit(() => ['\n| Column A | Column B |\n|----------|----------|\n| Cell     | Cell     |\n'])
      case 'Horizontal rule':
        return edit(() => ['\n\n---\n\n'])
    }
  }
  const fullHtml = () => `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titleOf(draft).replace(/</g, '&lt;')}</title>\n<style>:root{--line:#e1e6f0;--grid:#f1f5f9;--accent:#4f46e5;--mono:ui-monospace,Menlo,Consolas,monospace}body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#0f172a}${MD_CSS}</style></head>\n<body class="mdp">\n${html}\n</body></html>\n`
  const fname = titleOf(draft).replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'document'
  const onScroll = () => {
    const a = ta.current, b = pv.current
    if (!s.sync || !a || !b || s.view !== 'split') return
    b.scrollTop = (a.scrollTop / Math.max(1, a.scrollHeight - a.clientHeight)) * (b.scrollHeight - b.clientHeight)
  }
  const H = 560

  const editor = (
    <Panel title="Markdown" actions={<span className="muted" style={{ fontSize: 12 }}>{st.words} words</span>}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {TOOLS.map(([l, t]) => (
          <button key={t} type="button" className="k-btn ghost" title={t} aria-label={t} onClick={() => runTool(t)} style={{ minWidth: 34, padding: '4px 8px', fontWeight: l === 'B' ? 800 : 600, fontStyle: l === 'I' ? 'italic' : undefined, textDecoration: l === 'S' ? 'line-through' : undefined }}>{l}</button>
        ))}
      </div>
      <textarea
        ref={ta}
        className="k-area mono"
        value={text}
        spellCheck
        onChange={(e) => setText(e.target.value)}
        onScroll={onScroll}
        onKeyDown={(e) => {
          if (!(e.ctrlKey || e.metaKey)) {
            if (e.key === 'Tab') {
              e.preventDefault()
              edit(() => ['  '])
            }
            return
          }
          const k = e.key.toLowerCase()
          if (k === 'b' || k === 'i' || k === 'k') {
            e.preventDefault()
            if (k === 'b') wrap('**', '**', 'bold')
            else if (k === 'i') wrap('*', '*', 'italic')
            else link()
          }
        }}
        style={{ width: '100%', height: H, resize: 'vertical', fontSize: 14, lineHeight: 1.55 }}
        aria-label="Markdown source"
      />
    </Panel>
  )
  const preview = (
    <Panel title="Preview" actions={<CopyButton text={() => html} label="Copy HTML" />}>
      <style>{MD_CSS}</style>
      <div ref={pv} className="mdp" style={{ height: s.view === 'preview' ? 'auto' : H + 42, overflow: 'auto', paddingRight: 6 }} dangerouslySetInnerHTML={{ __html: html }} />
    </Panel>
  )

  return (
    <div>
      <Row>
        <Seg value={s.view} onChange={(view) => set({ view })} options={[['split', '◫ Split'], ['edit', '✎ Editor'], ['preview', '👁 Preview']]} />
        <Check label="Allow HTML (sanitized)" value={s.allowHtml} onChange={(allowHtml) => set({ allowHtml })} />
        <Check label="Sync scroll" value={s.sync} onChange={(sync) => set({ sync })} />
        <span style={{ flex: 1 }} />
        <Btn onClick={() => download(`${fname}.md`, text, 'text/markdown')}>⬇ .md</Btn>
        <Btn onClick={() => download(`${fname}.html`, fullHtml(), 'text/html')}>⬇ .html</Btn>
        <CopyButton text={() => text} label="Copy Markdown" />
      </Row>
      {s.view === 'split' ? (
        <Split>
          {editor}
          {preview}
        </Split>
      ) : s.view === 'edit' ? editor : preview}
      <Split>
        <Panel
          title="Drafts"
          actions={
            <>
              <Btn onClick={() => { const d = { id: uid(), text: '# New document\n\n', updated: Date.now() }; set((x) => ({ ...x, drafts: [d, ...x.drafts], cur: d.id })) }}>+ New</Btn>
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </>
          }
        >
          <div style={{ display: 'grid', gap: 4 }}>
            {s.drafts.map((d) => (
              <div key={d.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button type="button" className={`k-btn ${d.id === draft.id ? 'primary' : 'ghost'}`} style={{ flex: 1, justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => set({ cur: d.id })}>
                  {titleOf(d)}
                </button>
                <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{d.updated ? new Date(d.updated).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'sample'}</span>
                <Btn kind="ghost" title="Delete draft" disabled={s.drafts.length < 2} onClick={() => confirm(`Delete “${titleOf(d)}”?`) && set((x) => { const drafts = x.drafts.filter((y) => y.id !== d.id); return { ...x, drafts, cur: drafts[0].id } })}>✕</Btn>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <FileDrop accept=".md,.markdown,.txt,text/markdown,text/plain" onFiles={async ([f]) => { const d = { id: uid(), text: await f.text(), updated: Date.now() }; set((x) => ({ ...x, drafts: [d, ...x.drafts], cur: d.id })) }} label="Open a .md file as a new draft" />
          </div>
        </Panel>
        <div>
          <Stats>
            <Stat label="Words" value={st.words} sub={`${st.chars} characters`} />
            <Stat label="Reading time" value={`${st.minutes} min`} sub="at 230 wpm" />
            <Stat label="Headings" value={headings.length} />
          </Stats>
          <Panel title="Outline">
            {headings.length === 0 ? <p className="muted">Add # headings to build an outline.</p> : (
              <nav style={{ display: 'grid', gap: 2 }}>
                {headings.map((h) => (
                  <a key={h.id} href={`#${h.id}`} onClick={(e) => { e.preventDefault(); pv.current?.querySelector(`#${CSS.escape(h.id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }} style={{ paddingLeft: (h.level - 1) * 14, fontSize: 14, color: 'var(--fg)' }}>
                    {h.text}
                  </a>
                ))}
              </nav>
            )}
          </Panel>
        </div>
      </Split>
    </div>
  )
}
