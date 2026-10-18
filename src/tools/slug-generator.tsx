import { Area, Btn, Check, CopyButton, CsvButton, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { DEFAULTS, lint, slugify, uniqueSlugs, type SlugOptions } from './lib/slug-generator'

interface State { mode: 'single' | 'batch'; title: string; batch: string; base: string; opts: SlugOptions; taken: string }

const DEF: State = {
  mode: 'single',
  title: '10 Crème Brûlée Recipes You’ll Love — Easy & Quick!',
  batch: 'How to Brew the Perfect Cup of Coffee\nKyiv Travel Guide: 48 Hours in the City\nКиїв: що подивитися за вихідні\nRock & Roll Hall of Fame\nHow to Brew the Perfect Cup of Coffee\nÜber uns — Café Müller\nTop 5 C# Tips for 2026\nΑθήνα: ένας οδηγός',
  base: 'https://example.com/blog/',
  opts: { ...DEFAULTS, custom: 'C#=csharp\nC++=cpp' },
  taken: 'about\ncontact',
}

const EXAMPLES = ['10 Crème Brûlée Recipes You’ll Love — Easy & Quick!', 'Київ — столиця України', 'Straße & Ärger: Ein Überblick', 'Q&A: What’s New in v2.0?', 'Ελληνική κουζίνα', '   Lots   of — punctuation!!! ???  ']

export default function SlugGenerator() {
  const [s, set, reset] = useToolState('slug-generator', DEF)
  const o = s.opts
  const setO = (p: Partial<SlugOptions>) => set({ opts: { ...o, ...p } })
  const one = slugify(s.title, o)
  const titles = s.batch.split('\n').map((t) => t.trim()).filter(Boolean)
  const taken = s.taken.split(/[\n,]/).map((t) => t.trim()).filter(Boolean)
  const slugs = uniqueSlugs(titles.map((t) => slugify(t, o)), o.sep, taken)
  const raw = titles.map((t) => slugify(t, o))
  const issues = lint(one, s.title)

  return (
    <Split wide="right">
      <div>
        <Panel title="Options" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <label className="k-field"><span className="k-label">Separator</span><Seg value={o.sep} onChange={(sep) => setO({ sep })} options={[['-', 'hyphen -'], ['_', 'underscore _'], ['.', 'dot .']]} /></label>
          </Row>
          <Row>
            <Num label="Max length" unit="chars" min={0} max={300} step={1} value={o.maxLen} onChange={(maxLen) => setO({ maxLen: Math.max(0, Math.round(maxLen)) })} hint="0 = no limit; cuts at a word boundary" />
            <Select label="Cyrillic" value={o.cyrillic} onChange={(cyrillic) => setO({ cyrillic })} options={[['uk', 'Ukrainian (national 2010)'], ['ru', 'Russian (simplified)']]} />
          </Row>
          <Check label="Lowercase" value={o.lower} onChange={(lower) => setO({ lower })} />
          <Check label="ASCII only (transliterate Cyrillic & Greek, drop other scripts)" value={o.ascii} onChange={(ascii) => setO({ ascii })} />
          <Check label="German umlauts as ae / oe / ue" value={o.germanUmlauts} onChange={(germanUmlauts) => setO({ germanUmlauts })} />
          <Check label="Spell out symbols (& → and, % → percent, + → plus)" value={o.symbols} onChange={(symbols) => setO({ symbols })} />
          <Check label="Remove English stop words (a, the, of, to…)" value={o.stopWords} onChange={(stopWords) => setO({ stopWords })} />
          <Area label="Custom replacements (from=to, one per line, applied first)" value={o.custom} onChange={(custom) => setO({ custom })} rows={3} mono />
        </Panel>
        <Panel title="How it works">
          <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7, fontSize: 14 }}>
            <li>Custom replacements, then letters like ß, æ, ø, ł and Cyrillic/Greek are transliterated.</li>
            <li>Unicode NFKD splits accented letters (é → e + ◌́) and the accents are removed.</li>
            <li>Symbols become words; apostrophes inside words vanish (don’t → dont).</li>
            <li>Everything that isn’t a letter or digit becomes one separator; ends are trimmed.</li>
            <li>Optional: lowercase, stop-word removal, word-boundary truncation, duplicate numbering.</li>
          </ol>
        </Panel>
      </div>
      <div>
        <Row><Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['single', 'Single title'], ['batch', 'Batch (one per line)']]} /></Row>
        {s.mode === 'single' ? (
          <>
            <Panel title="Title">
              <Txt label="Text to convert" value={s.title} onChange={(title) => set({ title })} placeholder="Type a title…" />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {EXAMPLES.map((e) => <Btn key={e} kind="ghost" onClick={() => set({ title: e })}>{e.trim().slice(0, 26)}{e.trim().length > 26 ? '…' : ''}</Btn>)}
              </div>
            </Panel>
            <Panel title="Slug" actions={<><CopyButton text={one} label="Copy slug" /><CopyButton text={s.base + one} label="Copy URL" /></>}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, wordBreak: 'break-all', padding: '10px 12px', background: 'var(--panel2)', borderRadius: 10, minHeight: 50 }}>{one || <span className="muted">(empty)</span>}</div>
              <Txt label="Base URL for preview" value={s.base} onChange={(base) => set({ base })} />
              <div style={{ fontFamily: 'var(--mono)', fontSize: 14, wordBreak: 'break-all' }}><span className="muted">{s.base}</span><b style={{ color: 'var(--accent)' }}>{one}</b></div>
              {issues.map((i) => <Note key={i.text} tone={i.tone}>{i.text}</Note>)}
            </Panel>
            <Stats>
              <Stat label="Length" value={one.length} sub={`${s.title.length} chars in title`} tone={one.length > 75 ? 'bad' : 'good'} />
              <Stat label="Words" value={one ? one.split(o.sep).length : 0} />
              <Stat label="URL length" value={(s.base + one).length} sub="keep links under ~100" />
            </Stats>
          </>
        ) : (
          <>
            <Panel title="Titles">
              <Area value={s.batch} onChange={(batch) => set({ batch })} rows={8} placeholder="One title per line" />
              <Area label="Slugs already in use (avoid these)" value={s.taken} onChange={(t) => set({ taken: t })} rows={2} mono />
            </Panel>
            <Panel title={`${slugs.length} slugs`} actions={<><CopyButton text={() => slugs.join('\n')} label="Copy all" /><CsvButton name="slugs.csv" rows={() => [['title', 'slug', 'url'], ...titles.map((t, i) => [t, slugs[i], s.base + slugs[i]])]} /></>}>
              <Table
                head={['Title', 'Slug', '']}
                rows={titles.map((t, i) => [
                  <span key="t" style={{ fontSize: 13 }}>{t}</span>,
                  <span key="s" style={{ fontFamily: 'var(--mono)', fontSize: 13, wordBreak: 'break-all', color: !slugs[i] ? 'var(--err)' : undefined }}>
                    {slugs[i] || '(empty)'}
                    {slugs[i] !== raw[i] && slugs[i] && <span className="muted" title="Renamed to stay unique"> ↺ dup</span>}
                  </span>,
                  <CopyButton key="c" text={slugs[i]} label="" />,
                ])}
              />
              {slugs.some((x, i) => x !== raw[i]) && <p className="muted" style={{ fontSize: 13 }}>↺ Duplicates got a numeric suffix so every URL stays unique.</p>}
            </Panel>
          </>
        )}
      </div>
    </Split>
  )
}
