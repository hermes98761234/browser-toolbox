import { useState } from 'react'
import { Area, Btn, Check, CopyButton, download, FileDrop, Note, Panel, Row, Seg, Split, Txt, uid, useToolState } from '../kit'
import { format, inText, parseBibtex, sentenceCase, sortKey, toBibtex, toPlain, type Kind, type Source, type Style } from './lib/citation-generator'

const KINDS: [Kind, string][] = [['book', '📕 Book'], ['journal', '📄 Journal article'], ['website', '🌐 Web page'], ['chapter', '📑 Book chapter'], ['newspaper', '📰 Newspaper / magazine']]
const STYLES: [Style, string][] = [['apa', 'APA 7'], ['mla', 'MLA 9'], ['chicago', 'Chicago 17']]

const blank = (kind: Kind = 'book'): Source => ({ id: uid(), kind, authors: '', editors: '', title: '', container: '', publisher: '', place: '', year: '', month: '', day: '', volume: '', issue: '', pages: '', edition: '', doi: '', url: '', accessed: '' })

const SAMPLE: Source[] = [
  { ...blank('journal'), id: 's1', authors: 'Kahneman, Daniel\nTversky, Amos', title: 'Prospect theory: An analysis of decision under risk', container: 'Econometrica', year: '1979', volume: '47', issue: '2', pages: '263-291', doi: '10.2307/1914185' },
  { ...blank('book'), id: 's2', authors: 'Kernighan, Brian W.\nRitchie, Dennis M.', title: 'The C programming language', publisher: 'Prentice Hall', place: 'Englewood Cliffs, NJ', year: '1988', edition: '2' },
  { ...blank('website'), id: 's3', authors: '{World Health Organization}', title: 'Physical activity', container: 'WHO Fact Sheets', year: '2024', month: '6', day: '26', url: 'https://www.who.int/news-room/fact-sheets/detail/physical-activity', accessed: '2026-10-01' },
  { ...blank('chapter'), id: 's4', authors: 'Bandura, Albert', editors: 'Ramachandran, V. S.', title: 'Self-efficacy', container: 'Encyclopedia of human behavior', publisher: 'Academic Press', place: 'New York', year: '1994', pages: '71-81', volume: '' },
]

const DEF = { style: 'apa' as Style, sentence: false, sources: SAMPLE, sel: 's1' }

const BIB_DEMO = `@article{shannon1948,
  author  = {Shannon, Claude E.},
  title   = {A Mathematical Theory of Communication},
  journal = {Bell System Technical Journal},
  year    = {1948}, volume = {27}, number = {3}, pages = {379--423},
  doi     = {10.1002/j.1538-7305.1948.tb01338.x}
}`

async function copyRich(html: string) {
  const plain = toPlain(html.replace(/<\/p>/g, '\n'))
  try {
    const CI = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem
    if (CI && navigator.clipboard?.write) {
      await navigator.clipboard.write([new CI({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })])
      return
    }
  } catch { /* fall through */ }
  await navigator.clipboard?.writeText(plain)
}

export default function CitationGenerator() {
  const [s, set, reset] = useToolState('citation-generator', DEF)
  const [bib, setBib] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const cur = s.sources.find((x) => x.id === s.sel) ?? s.sources[0]
  const edit = (p: Partial<Source>) => cur && set({ sources: s.sources.map((x) => (x.id === cur.id ? { ...x, ...p } : x)) })
  const F = (k: keyof Source, label: string, ph = '', hint?: string) => <Txt label={label} value={String(cur?.[k] ?? '')} onChange={(v) => edit({ [k]: v })} placeholder={ph} hint={hint} />
  const sorted = [...s.sources].sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.year.localeCompare(b.year))
  const fmt = (x: Source) => format(x, s.style, { sentence: s.sentence })
  const heading = s.style === 'apa' ? 'References' : s.style === 'mla' ? 'Works Cited' : 'Bibliography'
  const allHtml = `<p><b>${heading}</b></p>` + sorted.map((x) => `<p style="padding-left:2em;text-indent:-2em">${fmt(x)}</p>`).join('')

  const importBib = (text: string) => {
    const got = parseBibtex(text, uid)
    if (!got.length) return setMsg({ tone: 'err', text: 'No BibTeX entries found. Entries look like @article{key, author = {…}, …}.' })
    set({ sources: [...s.sources, ...got], sel: got[0].id })
    setMsg({ tone: 'ok', text: `Imported ${got.length} entr${got.length === 1 ? 'y' : 'ies'}.` })
    setBib('')
  }
  const missing = cur ? [!cur.title && 'title', !cur.year && 'year', cur.kind !== 'website' && !cur.authors && 'author', cur.kind === 'journal' && !cur.container && 'journal name'].filter(Boolean) : []

  return (
    <Split>
      <div>
        <Panel
          title="Source details"
          actions={<><Btn onClick={() => { const n = blank(cur?.kind); set({ sources: [...s.sources, n], sel: n.id }) }}>+ New</Btn><Btn kind="ghost" onClick={reset}>Reset</Btn></>}
        >
          {cur ? (
            <>
              <div className="k-field">
                <span className="k-label">Source type</span>
                <Row>
                  {KINDS.map(([k, l]) => <Btn key={k} kind={cur.kind === k ? 'primary' : 'normal'} onClick={() => edit({ kind: k })}>{l}</Btn>)}
                </Row>
              </div>
              <Area label="Authors (one per line: Last, First — or {Organisation})" value={cur.authors} onChange={(authors) => edit({ authors })} rows={3} placeholder={'Doe, Jane\nSmith, John A.'} />
              {F('title', cur.kind === 'chapter' ? 'Chapter title' : cur.kind === 'website' ? 'Page title' : cur.kind === 'journal' || cur.kind === 'newspaper' ? 'Article title' : 'Book title')}
              {cur.kind === 'chapter' && <Area label="Editors (one per line)" value={cur.editors} onChange={(editors) => edit({ editors })} rows={2} />}
              {cur.kind !== 'book' && F('container', { journal: 'Journal', website: 'Website name', chapter: 'Book title', newspaper: 'Newspaper / magazine', book: '' }[cur.kind])}
              <Row>
                {F('year', 'Year', '2024')}
                {(cur.kind === 'website' || cur.kind === 'newspaper') && F('month', 'Month (1–12)')}
                {(cur.kind === 'website' || cur.kind === 'newspaper') && F('day', 'Day')}
                {(cur.kind === 'journal') && F('volume', 'Volume')}
                {(cur.kind === 'journal') && F('issue', 'Issue')}
              </Row>
              <Row>
                {(cur.kind === 'journal' || cur.kind === 'chapter' || cur.kind === 'newspaper') && F('pages', 'Pages', '45-67')}
                {(cur.kind === 'book' || cur.kind === 'chapter') && F('edition', 'Edition', '2')}
              </Row>
              {(cur.kind === 'book' || cur.kind === 'chapter' || cur.kind === 'website') && (
                <Row>
                  {F('publisher', cur.kind === 'website' ? 'Publisher (if different)' : 'Publisher')}
                  {cur.kind !== 'website' && F('place', 'Place (Chicago)', 'New York')}
                </Row>
              )}
              <Row>
                {cur.kind !== 'website' && F('doi', 'DOI', '10.1000/xyz')}
                {F('url', 'URL', 'https://…')}
              </Row>
              {cur.kind === 'website' && <Txt label="Accessed on" type="date" value={cur.accessed} onChange={(accessed) => edit({ accessed })} />}
              {missing.length > 0 && <Note tone="warn">Missing: {missing.join(', ')}. The citation still renders, but most styles expect these.</Note>}
            </>
          ) : <Note>No sources yet. Click “+ New” or import BibTeX.</Note>}
        </Panel>
        <Panel title="Import BibTeX">
          <FileDrop accept=".bib,.txt,text/plain" onFiles={async (fs) => importBib(await fs[0].text())} label="Drop a .bib file" />
          <Area value={bib} onChange={setBib} rows={5} mono placeholder="…or paste @article{…} entries here" />
          <Row>
            <Btn kind="primary" disabled={!bib.trim()} onClick={() => importBib(bib)}>Import</Btn>
            <Btn kind="ghost" onClick={() => setBib(BIB_DEMO)}>Paste example</Btn>
          </Row>
          {msg && <Note tone={msg.tone}>{msg.text}</Note>}
        </Panel>
      </div>
      <div>
        <Panel title="Citation style" actions={<Seg value={s.style} onChange={(style) => set({ style })} options={STYLES} />}>
          {s.style === 'apa' && <Check label="Convert titles to sentence case (APA)" value={s.sentence} onChange={(sentence) => set({ sentence })} />}
          {cur && (
            <>
              <div className="k-label" style={{ marginTop: 8 }}>Reference entry</div>
              <p style={{ fontSize: 16, lineHeight: 1.6, paddingLeft: '2em', textIndent: '-2em', margin: '6px 0 10px' }} dangerouslySetInnerHTML={{ __html: fmt(cur) }} />
              <Row>
                <CopyButton text={() => toPlain(fmt(cur))} label="Copy text" />
                <Btn onClick={() => void copyRich(fmt(cur))}>⧉ Copy with italics</Btn>
              </Row>
              <div className="k-label" style={{ marginTop: 12 }}>In-text citation</div>
              <Row>
                <code style={{ fontSize: 15, padding: '4px 8px', background: 'var(--panel2)', borderRadius: 6 }}>{inText(cur, s.style)}</code>
                <CopyButton text={inText(cur, s.style)} />
              </Row>
              {s.style === 'apa' && s.sentence && cur.title !== sentenceCase(cur.title) && <p className="muted" style={{ fontSize: 12 }}>Sentence case applied; words with internal capitals (NASA, iPhone) are kept. Re-capitalise proper nouns in the title field if needed.</p>}
            </>
          )}
        </Panel>
        <Panel
          title={`${heading} (${s.sources.length})`}
          actions={
            <>
              <Btn onClick={() => { void copyRich(allHtml).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) }) }}>{copied ? '✓ Copied' : '⧉ Copy all'}</Btn>
              <Btn onClick={() => download('references.txt', sorted.map((x) => toPlain(fmt(x))).join('\n\n'), 'text/plain')}>⬇ TXT</Btn>
              <Btn onClick={() => download('references.bib', s.sources.map(toBibtex).join('\n\n'), 'application/x-bibtex')}>⬇ BibTeX</Btn>
            </>
          }
        >
          {sorted.map((x) => (
            <div key={x.id} onClick={() => set({ sel: x.id })} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', margin: '0 -10px', borderRadius: 8, cursor: 'pointer', background: x.id === cur?.id ? 'var(--panel2)' : undefined, borderLeft: `3px solid ${x.id === cur?.id ? 'var(--accent)' : 'transparent'}` }}>
              <p style={{ flex: 1, margin: 0, paddingLeft: '2em', textIndent: '-2em', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: fmt(x) }} />
              <Btn kind="ghost" title="Remove" onClick={() => set({ sources: s.sources.filter((y) => y.id !== x.id), sel: s.sources.find((y) => y.id !== x.id)?.id ?? '' })}>✕</Btn>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12 }}>Entries are sorted by first author (or title) with hanging indents. Click one to edit it. “Copy” keeps italics when pasted into Word or Google Docs.</p>
        </Panel>
      </div>
    </Split>
  )
}
