import { useMemo, useState } from 'react'
import { Btn, download, FileDrop, JsonButtons, Note, Panel, Seg, Split, uid, useToolState } from '../kit'
import { md, search, snippet, zip } from './lib/markdown-notes'

interface Doc { id: string; title: string; body: string; tags: string[]; pinned: boolean; updated: number }
interface State { notes: Doc[]; cur: string; view: 'edit' | 'split' | 'preview' }

const now = Date.now()
const DEF: State = {
  cur: 'welcome',
  view: 'split',
  notes: [
    { id: 'welcome', title: 'Welcome to Markdown Notes', pinned: true, updated: now, tags: ['guide'], body: `# Welcome 👋

Notes live **only in this browser** (localStorage). Use *Backup* or *ZIP* to keep a copy.

## What works
- **bold**, *italic*, ~~strike~~, ==highlight==, \`inline code\`
- [x] task lists
- [ ] tables, quotes and code blocks
- links like https://example.org and [[Weekly plan]] wiki links between notes

> Tip: search with several words (all must match) and filter by tag with \`#tag\`.

| Shortcut | Action |
|---|---|
| Ctrl + S | nothing — it saves as you type |
| \`#recipes\` in search | only notes tagged *recipes* |

\`\`\`js
const answer = 6 * 7
\`\`\`` },
    { id: 'plan', title: 'Weekly plan', pinned: false, updated: now - 36e5, tags: ['todo', 'work'], body: `## This week
1. Finish the quarterly report
2. Book dentist appointment
3. Call the plumber about the kitchen tap

## Habits
- [x] Run 3× (Mon, Wed, Sat)
- [ ] Read 20 pages a day
- [ ] No phone after 22:00

See also [[Pasta e ceci]] for Thursday dinner.` },
    { id: 'pasta', title: 'Pasta e ceci', pinned: false, updated: now - 864e5, tags: ['recipes'], body: `Serves 4 · 35 min

### Ingredients
- 2 cans chickpeas (keep the liquid)
- 200 g ditalini
- 1 onion, 2 garlic cloves, rosemary
- 400 g crushed tomatoes

### Method
1. Soften onion and garlic in olive oil, add rosemary.
2. Add tomatoes and chickpeas, simmer 10 min, blend a third.
3. Add pasta and 750 ml water, cook until **al dente**.

> Finish with good olive oil and black pepper.` },
    { id: 'ideas', title: 'Gift ideas', pinned: false, updated: now - 3 * 864e5, tags: ['personal'], body: `- Mum: pottery class voucher
- Alex: *Project Hail Mary* hardcover
- Sam: hiking socks + trail map` },
  ],
}

const CSS = `.mdn-prev{line-height:1.6;overflow-wrap:anywhere}.mdn-prev h1,.mdn-prev h2,.mdn-prev h3{margin:.8em 0 .3em;line-height:1.25}.mdn-prev h1{font-size:1.6em}.mdn-prev h2{font-size:1.3em}
.mdn-prev pre{background:color-mix(in srgb,var(--fg) 7%,transparent);padding:10px 12px;border-radius:8px;overflow:auto}.mdn-prev code{font-family:ui-monospace,monospace;font-size:.92em;background:color-mix(in srgb,var(--fg) 7%,transparent);padding:1px 4px;border-radius:4px}.mdn-prev pre code{background:none;padding:0}
.mdn-prev blockquote{margin:.6em 0;padding:.2em 12px;border-left:4px solid var(--accent);color:var(--muted)}.mdn-prev table{border-collapse:collapse;margin:.6em 0}.mdn-prev td,.mdn-prev th{border:1px solid var(--line);padding:4px 10px}
.mdn-prev li.task{list-style:none;margin-left:-1.2em}.mdn-prev img{max-width:100%}.mdn-prev mark{background:#fde68a;color:#111;border-radius:3px}.mdn-prev a.wiki{border-bottom:1px dashed var(--accent);text-decoration:none}`

const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'note'
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 6e4)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

export default function MarkdownNotes() {
  const [s, set, reset] = useToolState('markdown-notes', DEF)
  const [q, setQ] = useState('')
  const cur = s.notes.find((n) => n.id === s.cur) ?? s.notes[0]
  const hits = search(s.notes, q)
  const list = hits.map((h) => s.notes.find((n) => n.id === h.id)!).sort((a, b) => (q.trim() ? 0 : Number(b.pinned) - Number(a.pinned) || b.updated - a.updated))
  const tags = [...new Set(s.notes.flatMap((n) => n.tags))].sort()
  const html = useMemo(() => (cur ? md(cur.body) : ''), [cur])
  const edit = (p: Partial<Doc>) => cur && set({ notes: s.notes.map((n) => (n.id === cur.id ? { ...n, ...p, updated: Date.now() } : n)) })
  const create = (title = 'Untitled note', body = '') => {
    const id = uid()
    set({ notes: [{ id, title, body, tags: [], pinned: false, updated: Date.now() }, ...s.notes], cur: id })
  }
  const openWiki = (title: string) => {
    const hit = s.notes.find((n) => n.title.toLowerCase() === title.toLowerCase())
    if (hit) set({ cur: hit.id })
    else create(title, `# ${title}\n\n`)
  }
  const words = cur ? (cur.body.match(/\S+/g) ?? []).length : 0
  const toggleTag = (t: string) => setQ(q.includes(`#${t}`) ? q.replace(`#${t}`, '').trim() : `${q} #${t}`.trim())
  const exportZip = () => {
    const used = new Set<string>()
    const files = s.notes.map((n) => {
      let name = slug(n.title)
      while (used.has(name)) name += '-1'
      used.add(name)
      return { name: `${name}.md`, text: `---\ntitle: ${n.title}\ntags: [${n.tags.join(', ')}]\nupdated: ${new Date(n.updated).toISOString()}\n---\n\n${n.body}\n` }
    })
    download('markdown-notes.zip', new Blob([zip(files) as BlobPart], { type: 'application/zip' }))
  }
  const importFiles = async (fs: File[]) => {
    const added: Doc[] = []
    for (const f of fs) {
      const text = await f.text()
      const fm = /^---\n([\s\S]*?)\n---\n*/.exec(text)
      const title = fm && /title:\s*(.+)/.exec(fm[1])?.[1]
      const tg = fm && /tags:\s*\[(.*)\]/.exec(fm[1])?.[1]
      added.push({ id: uid(), title: title?.trim() || f.name.replace(/\.(md|markdown|txt)$/i, ''), body: fm ? text.slice(fm[0].length) : text, tags: tg ? tg.split(',').map((t) => t.trim()).filter(Boolean) : [], pinned: false, updated: f.lastModified || Date.now() })
    }
    if (added.length) set({ notes: [...added, ...s.notes], cur: added[0].id })
  }

  return (
    <Split wide="right">
      <div>
        <style>{CSS}</style>
        <Panel title={`Notes (${s.notes.length})`} actions={<Btn kind="primary" onClick={() => create()}>+ New</Btn>}>
          <input className="k-text" type="search" placeholder="Search… (try: pasta  or  #todo)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search notes" style={{ width: '100%' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
            {tags.map((t) => (
              <button key={t} type="button" className={`k-btn ${q.includes(`#${t}`) ? 'primary' : 'ghost'}`} style={{ padding: '2px 10px', fontSize: 12 }} onClick={() => toggleTag(t)}>#{t}</button>
            ))}
          </div>
          {list.length === 0 && <Note>No notes match “{q}”.</Note>}
          <div style={{ display: 'grid', gap: 6, maxHeight: 520, overflow: 'auto' }}>
            {list.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => set({ cur: n.id })}
                style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 10, border: `1px solid ${n.id === cur?.id ? 'var(--accent)' : 'var(--line)'}`, background: n.id === cur?.id ? 'color-mix(in srgb, var(--accent) 10%, var(--panel))' : 'var(--panel)', color: 'inherit', cursor: 'pointer', font: 'inherit' }}
              >
                <b>{n.pinned ? '📌 ' : ''}{n.title || 'Untitled'}</b>
                <div className="muted" style={{ fontSize: 12, margin: '2px 0' }}>{snippet(n.body, q, 90)}</div>
                <div className="muted" style={{ fontSize: 11 }}>{ago(n.updated)}{n.tags.length ? ` · ${n.tags.map((t) => `#${t}`).join(' ')}` : ''}</div>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Import & export">
          <FileDrop accept=".md,.markdown,.txt,text/markdown,text/plain" multiple onFiles={(fs) => void importFiles(fs)} label="Drop .md files to import" />
          <div className="k-row wrap" style={{ marginTop: 8 }}>
            <Btn onClick={exportZip}>🗜 All as ZIP</Btn>
            <JsonButtons name="markdown-notes.json" data={s} onLoad={(d) => d?.notes && set(d)} />
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </div>
        </Panel>
      </div>
      <div>
        {cur ? (
          <Panel
            title={<input value={cur.title} onChange={(e) => edit({ title: e.target.value })} aria-label="Title" style={{ font: 'inherit', fontWeight: 700, border: 'none', background: 'transparent', color: 'inherit', width: '100%', minWidth: 120 }} />}
            actions={
              <>
                <Seg value={s.view} onChange={(view) => set({ view })} options={[['edit', 'Edit'], ['split', 'Split'], ['preview', 'Preview']]} />
                <Btn kind="ghost" title="Pin" onClick={() => edit({ pinned: !cur.pinned })}>{cur.pinned ? '📌' : '📍'}</Btn>
                <Btn kind="ghost" title="Download .md" onClick={() => download(`${slug(cur.title)}.md`, cur.body, 'text/markdown')}>⬇</Btn>
                <Btn kind="danger" title="Delete note" onClick={() => { if (confirm(`Delete “${cur.title}”?`)) set({ notes: s.notes.filter((n) => n.id !== cur.id), cur: s.notes.find((n) => n.id !== cur.id)?.id ?? '' }) }}>🗑</Btn>
              </>
            }
          >
            <input className="k-text" value={cur.tags.join(', ')} onChange={(e) => edit({ tags: e.target.value.split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean) })} placeholder="tags, comma separated" aria-label="Tags" style={{ width: '100%', marginBottom: 8 }} />
            <div style={{ display: 'grid', gridTemplateColumns: s.view === 'split' ? 'repeat(auto-fit, minmax(260px, 1fr))' : '1fr', gap: 12 }}>
              {s.view !== 'preview' && (
                <textarea className="k-area mono" value={cur.body} onChange={(e) => edit({ body: e.target.value })} rows={24} aria-label="Markdown" spellCheck style={{ minHeight: 420 }} />
              )}
              {s.view !== 'edit' && (
                <div
                  className="mdn-prev"
                  style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '4px 14px', minHeight: 420, overflow: 'auto' }}
                  onClick={(e) => {
                    const a = (e.target as HTMLElement).closest('a[data-note]')
                    if (a) { e.preventDefault(); openWiki(a.getAttribute('data-note') ?? '') }
                  }}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              )}
            </div>
            <p className="muted" style={{ fontSize: 12 }}>{words} words · {cur.body.length} characters · ~{Math.max(1, Math.round(words / 230))} min read · saved {ago(cur.updated)}</p>
          </Panel>
        ) : (
          <Panel title="No note"><Btn kind="primary" onClick={() => create()}>Create a note</Btn></Panel>
        )}
      </div>
    </Split>
  )
}
