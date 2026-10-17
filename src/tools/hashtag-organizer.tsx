import { useMemo, useState } from 'react'
import { Bar, Btn, CopyButton, JsonButtons, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, uid, useToolState } from '../kit'
import { charCount, extractTags, formatTags, PLATFORMS, pickRotation, shuffle, tagIssues, type Fmt } from './lib/hashtag-organizer'

interface TagSet { id: string; name: string; folder: string; platform: string; tags: string[] }
interface State { sets: TagSet[]; uses: Record<string, number>; fmt: Fmt; rotN: number; sel: string }

const mk = (name: string, folder: string, platform: string, text: string): TagSet => ({ id: uid(), name, folder, platform, tags: extractTags(text) })
const SETS = [
  mk('City breaks', 'Travel', 'ig', '#travel #citybreak #wanderlust #travelgram #europetravel #weekendgetaway #streetphotography #instatravel #travelphotography #explore #oldtown #citylife #traveltheworld #passportready #igtravel'),
  mk('Beach days', 'Travel', 'ig', '#beach #beachlife #sunset #oceanview #travel #summervibes #islandlife #saltwater #seaside #vitaminsea'),
  mk('Home cooking', 'Food', 'ig', '#homecooking #foodie #recipeoftheday #eeeeeats #foodstagram #comfortfood #easyrecipes #cookingathome #yummy #instafood #homemade #dinnerideas'),
  mk('Coffee', 'Food', 'tt', '#coffee #coffeetok #latteart #barista #coffeelover #morningroutine'),
  mk('Product launch', 'Brand', 'li', '#productlaunch #startup #saas #buildinpublic #innovation'),
  mk('Shorts', 'Brand', 'yt', '#shorts #tutorial #howto #tips #diy'),
]
const DEF: State = { sets: SETS, uses: {}, fmt: 'space', rotN: 8, sel: SETS[0].id }

export default function HashtagOrganizer() {
  const [s, set, reset] = useToolState('hashtag-organizer', DEF)
  const [input, setInput] = useState('')
  const [q, setQ] = useState('')
  const [out, setOut] = useState<{ label: string; text: string } | null>(null)
  const cur = s.sets.find((x) => x.id === s.sel) ?? s.sets[0]
  const pf = PLATFORMS.find((p) => p.id === cur?.platform) ?? PLATFORMS[0]

  const patch = (p: Partial<TagSet>) => cur && set({ sets: s.sets.map((x) => (x.id === cur.id ? { ...x, ...p } : x)) })
  const folders = useMemo(() => [...new Set(s.sets.map((x) => x.folder || 'Unsorted'))].sort(), [s.sets])
  const inSets = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const st of s.sets) for (const t of st.tags) m.set(t.toLowerCase(), [...(m.get(t.toLowerCase()) ?? []), st.name])
    return m
  }, [s.sets])
  const matches = (st: TagSet) => !q || st.name.toLowerCase().includes(q.toLowerCase()) || st.tags.some((t) => t.toLowerCase().includes(q.replace(/^#/, '').toLowerCase()))

  const addTags = () => {
    if (!cur) return
    const have = new Set(cur.tags.map((t) => t.toLowerCase()))
    const add = extractTags(input).filter((t) => !have.has(t.toLowerCase()))
    patch({ tags: [...cur.tags, ...add] })
    setInput('')
  }
  const newSet = () => {
    const n: TagSet = { id: uid(), name: 'New set', folder: cur?.folder ?? 'Unsorted', platform: cur?.platform ?? 'ig', tags: [] }
    set({ sets: [...s.sets, n], sel: n.id })
  }
  const show = (label: string, tags: string[], count = false) => {
    const text = formatTags(tags, s.fmt)
    setOut({ label, text })
    void navigator.clipboard?.writeText(text).catch(() => undefined)
    if (count) {
      const uses = { ...s.uses }
      for (const t of tags) uses[t.toLowerCase()] = (uses[t.toLowerCase()] ?? 0) + 1
      set({ uses })
    }
  }

  const tags = cur?.tags ?? []
  const joined = formatTags(tags, s.fmt)
  const chars = charCount(joined)
  const bad = tags.filter((t) => tagIssues(t).length)
  const [lo, hi] = pf.best

  return (
    <Split wide="right">
      <div>
        <Panel title="Hashtag sets" actions={<Btn onClick={newSet}>+ Set</Btn>}>
          <Txt label="Search sets and tags" value={q} onChange={setQ} placeholder="#travel or set name" />
          {folders.map((f) => {
            const list = s.sets.filter((x) => (x.folder || 'Unsorted') === f && matches(x))
            if (!list.length) return null
            return (
              <div key={f} style={{ marginTop: 10 }}>
                <div className="k-label">📁 {f}</div>
                {list.map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => set({ sel: x.id })}
                    style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, padding: '8px 10px', margin: '4px 0', borderRadius: 10, border: `1px solid ${x.id === cur?.id ? 'var(--accent)' : 'var(--line)'}`, background: x.id === cur?.id ? 'color-mix(in srgb, var(--accent) 10%, var(--panel))' : 'var(--panel)', color: 'inherit', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
                  >
                    <span>{x.name}</span>
                    <span className="muted" style={{ fontSize: 12 }}>{PLATFORMS.find((p) => p.id === x.platform)?.name} · {x.tags.length}</span>
                  </button>
                ))}
              </div>
            )
          })}
          <Row>
            <JsonButtons name="hashtag-sets.json" data={s} onLoad={(d) => d && Array.isArray(d.sets) && set(d)} />
            <Btn kind="ghost" onClick={() => set({ uses: {} })} disabled={!Object.keys(s.uses).length}>Clear usage</Btn>
            <Btn kind="ghost" onClick={reset}>Reset</Btn>
          </Row>
        </Panel>
      </div>

      {cur ? (
        <div>
          <Stats>
            <Stat label="Tags" value={`${tags.length} / ${pf.max}`} sub={`${pf.name} best: ${lo}–${hi}`} tone={tags.length > pf.max ? 'bad' : 'accent'} />
            <Stat label="Characters" value={pf.chars ? `${chars} / ${pf.chars}` : chars} sub="hashtag block only" tone={pf.chars && chars > pf.chars ? 'bad' : undefined} />
            <Stat label="Problems" value={bad.length} tone={bad.length ? 'bad' : 'good'} sub={bad.length ? bad.slice(0, 2).map((t) => `#${t}`).join(' ') : 'all tags valid'} />
            <Stat label="Shared with other sets" value={tags.filter((t) => (inSets.get(t.toLowerCase())?.length ?? 0) > 1).length} />
          </Stats>
          <Panel title="Edit set" actions={<Btn kind="danger" onClick={() => set({ sets: s.sets.filter((x) => x.id !== cur.id), sel: s.sets.find((x) => x.id !== cur.id)?.id ?? '' })}>Delete set</Btn>}>
            <Row>
              <Txt label="Name" value={cur.name} onChange={(name) => patch({ name })} />
              <Txt label="Folder" value={cur.folder} onChange={(folder) => patch({ folder })} placeholder="e.g. Travel" />
              <Select label="Platform" value={cur.platform} onChange={(platform) => patch({ platform })} options={PLATFORMS.map((p) => [p.id, p.name] as [string, string])} />
            </Row>
            <div style={{ margin: '6px 0 10px' }}>
              <Bar value={tags.length} max={pf.max} color={tags.length > pf.max ? 'var(--err)' : tags.length > hi ? 'var(--warn)' : 'var(--ok)'} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tags.map((t, i) => {
                const issues = tagIssues(t)
                const shared = (inSets.get(t.toLowerCase())?.length ?? 0) > 1
                const used = s.uses[t.toLowerCase()] ?? 0
                return (
                  <span
                    key={t}
                    title={[...issues, shared ? `also in: ${inSets.get(t.toLowerCase())!.filter((n) => n !== cur.name).join(', ')}` : '', used ? `copied ${used}×` : ''].filter(Boolean).join(' · ') || undefined}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 4px 3px 10px', borderRadius: 999, fontSize: 14, border: `1px solid ${issues.length ? 'var(--err)' : i >= pf.max ? 'var(--warn)' : 'var(--line)'}`, background: issues.length ? 'color-mix(in srgb, var(--err) 10%, var(--panel))' : 'var(--panel2)' }}
                  >
                    #{t}
                    {shared && <span style={{ color: 'var(--accent2)', fontSize: 11 }}>●</span>}
                    {used > 0 && <sup className="muted">{used}</sup>}
                    <button type="button" aria-label={`Remove ${t}`} onClick={() => patch({ tags: tags.filter((x) => x !== t) })} style={{ border: 0, background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✕</button>
                  </span>
                )
              })}
              {!tags.length && <span className="muted">No tags yet — paste some below.</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <Txt label="Add tags" value={input} onChange={setInput} placeholder="Paste a caption, “#a #b” or “a, b, c”" />
              </div>
              <Btn kind="primary" onClick={addTags} disabled={!extractTags(input).length}>Add {extractTags(input).length || ''}</Btn>
            </div>
            <Row>
              <Btn kind="ghost" onClick={() => patch({ tags: [...tags].sort((a, b) => a.localeCompare(b)) })}>Sort A–Z</Btn>
              <Btn kind="ghost" onClick={() => patch({ tags: tags.map((t) => t.toLowerCase()) })}>lowercase</Btn>
              <Btn kind="ghost" disabled={!bad.length} onClick={() => patch({ tags: tags.filter((t) => !tagIssues(t).length) })}>Remove invalid</Btn>
              <Btn kind="ghost" disabled={tags.length <= pf.max} onClick={() => patch({ tags: tags.slice(0, pf.max) })}>Trim to {pf.max}</Btn>
            </Row>
            <p className="muted" style={{ fontSize: 13 }}>Red = will not work as a hashtag · <span style={{ color: 'var(--accent2)' }}>●</span> also used in another set · small number = times copied by rotation.</p>
          </Panel>
          <Panel title="Copy for a post">
            <Seg value={s.fmt} onChange={(fmt: Fmt) => set({ fmt })} options={[['space', 'One line'], ['line', 'One per line'], ['dots', 'Dot spacer (first comment)']]} />
            <Row>
              <CopyButton text={() => joined} label={`Copy all ${tags.length}`} />
              <Btn onClick={() => show('Shuffled order', shuffle(tags))}>🔀 Copy shuffled</Btn>
              <Num label="Rotation size" value={s.rotN} onChange={(rotN) => set({ rotN: Math.max(1, Math.round(rotN)) })} min={1} max={pf.max} />
              <Btn kind="primary" disabled={!tags.length} onClick={() => show(`Rotation: ${Math.min(s.rotN, tags.length)} least-used tags`, pickRotation(tags, s.uses, s.rotN), true)}>♻ Copy rotation</Btn>
            </Row>
            {out ? (
              <>
                <div className="k-label" style={{ marginTop: 8 }}>{out.label} — copied ✓ ({charCount(out.text)} chars)</div>
                <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--panel2)', padding: 10, borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 13, margin: 0 }}>{out.text}</pre>
              </>
            ) : (
              <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--panel2)', padding: 10, borderRadius: 8, fontFamily: 'var(--mono)', fontSize: 13 }}>{joined || '—'}</pre>
            )}
            <Note>
              Rotation picks the tags you have used least (counts are saved), in random order, so consecutive posts don’t repeat an identical block — repetitive hashtag blocks are a common spam signal. {pf.name} allows {pf.max} tags{pf.chars ? ` and ${pf.chars} characters` : ''}; {lo}–{hi} focused tags usually perform best.
            </Note>
          </Panel>
        </div>
      ) : (
        <Note>Create a set to start.</Note>
      )}
    </Split>
  )
}
