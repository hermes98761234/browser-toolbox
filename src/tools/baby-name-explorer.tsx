import { useMemo, useState } from 'react'
import { BarChart, Btn, Check, CopyButton, CsvButton, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Txt, useToolState } from '../kit'
import { NAMES, ORIGINS, score, syllables, type Name } from './lib/baby-name-explorer'

const DEF = { q: '', gender: 'all' as 'all' | 'm' | 'f' | 'u', origin: 'all', minLen: 2, maxLen: 12, letter: '', syl: 0, surname: 'Carter', list: ['Olivia', 'Felix', 'Isla', 'Theodore', 'Luna'] as string[], sort: 'match' as 'match' | 'az' | 'len' }
const G: Record<Name['g'], [string, string]> = { m: ['Boy', '#0ea5e9'], f: ['Girl', '#ec4899'], u: ['Unisex', '#a855f7'] }
const BY = new Map(NAMES.map((n) => [n.name, n]))

/** Names a partner shared via ?with=A,B,C in the URL. */
function partnerFromUrl(): string[] {
  const m = /[?&]with=([^&]+)/.exec(location.hash)
  if (!m) return []
  try { return decodeURIComponent(m[1]).split(',').map((x) => x.trim()).filter((x) => BY.has(x)) } catch { return [] }
}

function flow(first: string, last: string): string {
  if (!last.trim()) return ''
  const a = first.toLowerCase(), b = last.trim().toLowerCase()
  const notes: string[] = []
  if (/[aeiouy]$/.test(a) && /^[aeiouy]/.test(b)) notes.push('vowels run together')
  if (a.slice(-1) === b[0]) notes.push('same sound at the join')
  if (a[0] === b[0]) notes.push('alliteration')
  if (Math.abs(syllables(first) - syllables(last)) >= 2) notes.push('nice syllable contrast')
  return notes.join(', ')
}

export default function BabyNameExplorer() {
  const [s, set] = useToolState('baby-name-explorer', DEF)
  const [partner] = useState(partnerFromUrl)
  const [pick, setPick] = useState<Name | null>(null)
  const [only, setOnly] = useState(false)
  const results = useMemo(() => {
    const r = NAMES.map((n) => ({ n, sc: score(n, s.q) })).filter(({ n, sc }) =>
      sc > 0 && (s.gender === 'all' || n.g === s.gender || (s.gender !== 'u' && n.g === 'u')) && (s.origin === 'all' || n.origin === s.origin) &&
      n.name.length >= s.minLen && n.name.length <= s.maxLen && (!s.letter || n.name.startsWith(s.letter)) && (!s.syl || Math.min(4, syllables(n.name)) === s.syl))
    if (s.sort === 'az') r.sort((a, b) => a.n.name.localeCompare(b.n.name))
    else if (s.sort === 'len') r.sort((a, b) => a.n.name.length - b.n.name.length || a.n.name.localeCompare(b.n.name))
    else r.sort((a, b) => b.sc - a.sc || a.n.name.localeCompare(b.n.name))
    return r.map((x) => x.n)
  }, [s.q, s.gender, s.origin, s.minLen, s.maxLen, s.letter, s.syl, s.sort])
  const shown = only ? results.filter((n) => s.list.includes(n.name)) : results
  const toggle = (name: string) => set({ list: s.list.includes(name) ? s.list.filter((x) => x !== name) : [...s.list, name] })
  const matches = s.list.filter((x) => partner.includes(x))
  const link = `${location.origin}${location.pathname}${location.hash.replace(/\?.*$/, '')}?with=${encodeURIComponent(s.list.join(','))}`
  const surprise = () => { if (results.length) setPick(results[Math.floor(Math.random() * results.length)]) }
  const letters = 'ABCDEFGHIJKLMNOPRSTVWXYZ'.split('')
  const byOrigin = ORIGINS.map((o) => ({ label: o.split(' ')[0], value: results.filter((n) => n.origin === o).length }))

  const card = (n: Name) => (
    <div key={n.name + n.origin} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-start', background: s.list.includes(n.name) ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : undefined }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 19, fontWeight: 800 }}>
          {n.name} <span style={{ fontSize: 11, fontWeight: 700, color: G[n.g][1], verticalAlign: 'middle' }}>{G[n.g][0].toUpperCase()}</span>
        </div>
        <div style={{ fontSize: 13 }}>“{n.meaning}”</div>
        <div className="muted" style={{ fontSize: 12 }}>{n.origin} · {n.name.length} letters · {syllables(n.name)} syl.</div>
      </div>
      <button type="button" className="k-btn ghost" onClick={() => toggle(n.name)} title={s.list.includes(n.name) ? 'Remove from shortlist' : 'Add to shortlist'} style={{ fontSize: 18, color: s.list.includes(n.name) ? '#ec4899' : 'var(--muted)' }}>
        {s.list.includes(n.name) ? '♥' : '♡'}
      </button>
    </div>
  )

  return (
    <Split wide="right">
      <div>
        <Panel title="Search & filters">
          <Txt label="Search name, meaning or origin" value={s.q} onChange={(q) => set({ q })} placeholder="e.g. Sofi, light, Norse…" hint="Typos are fine: “Elenor” still finds Eleanor." />
          <span className="k-label">Gender</span>
          <Seg value={s.gender} onChange={(gender) => set({ gender })} options={[['all', 'All'], ['f', 'Girl'], ['m', 'Boy'], ['u', 'Unisex only']]} />
          <Select label="Origin" value={s.origin} onChange={(origin) => set({ origin })} options={[['all', 'All origins'], ...ORIGINS.map((o) => [o, o] as [string, string])]} />
          <Row>
            <Num label="Min letters" min={2} max={12} value={s.minLen} onChange={(minLen) => set({ minLen })} />
            <Num label="Max letters" min={2} max={14} value={s.maxLen} onChange={(maxLen) => set({ maxLen })} />
            <Select label="Syllables" value={s.syl} onChange={(syl) => set({ syl })} options={[[0, 'Any'], [1, '1'], [2, '2'], [3, '3'], [4, '4+']]} />
          </Row>
          <span className="k-label">Starts with</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <Btn kind={s.letter ? 'ghost' : 'primary'} onClick={() => set({ letter: '' })}>Any</Btn>
            {letters.map((l) => <Btn key={l} kind={s.letter === l ? 'primary' : 'ghost'} onClick={() => set({ letter: s.letter === l ? '' : l })}>{l}</Btn>)}
          </div>
          <Row>
            <Btn onClick={() => set({ ...DEF, list: s.list, surname: s.surname })}>Clear filters</Btn>
            <Btn kind="primary" onClick={surprise} disabled={!results.length}>🎲 Surprise me</Btn>
          </Row>
          {pick && <Note tone="ok"><b style={{ fontSize: 18 }}>{pick.name}</b> — {pick.origin}, “{pick.meaning}”. <Btn kind="ghost" onClick={() => toggle(pick.name)}>{s.list.includes(pick.name) ? '♥ Shortlisted' : '♡ Shortlist'}</Btn></Note>}
        </Panel>
        <Panel title={`Shortlist (${s.list.length})`} actions={<CsvButton name="baby-names.csv" rows={() => [['Name', 'Gender', 'Origin', 'Meaning'], ...s.list.map((x) => BY.get(x)).filter(Boolean).map((n) => [n!.name, G[n!.g][0], n!.origin, n!.meaning])]} />}>
          <Txt label="Surname (to test the full name)" value={s.surname} onChange={(surname) => set({ surname })} />
          {s.list.length === 0 && <Note>Tap ♡ on names you like.</Note>}
          {s.list.map((x, i) => {
            const f = flow(x, s.surname)
            return (
              <Row key={x} wrap={false}>
                <span style={{ flex: 1 }}><b>{x} {s.surname}</b>{f && <span className="muted" style={{ fontSize: 12 }}> · {f}</span>}<span className="muted" style={{ fontSize: 12 }}> · {x[0]}.{s.surname.trim()[0] ?? ''}.</span></span>
                <Btn kind="ghost" title="Move up" disabled={i === 0} onClick={() => { const l = [...s.list]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; set({ list: l }) }}>↑</Btn>
                <Btn kind="ghost" title="Remove" onClick={() => toggle(x)}>✕</Btn>
              </Row>
            )
          })}
          <h4 style={{ margin: '14px 0 6px' }}>Share with your partner</h4>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Send this link. When your partner opens it, names you both picked show up as matches.</p>
          <Row><CopyButton text={link} label="Copy share link" /></Row>
        </Panel>
        {partner.length > 0 && (
          <Panel title="Partner’s picks">
            <Stats><Stat label="Their names" value={partner.length} /><Stat label="Matches" value={matches.length} tone="good" /></Stats>
            {matches.length ? <Note tone="ok">You both like: <b>{matches.join(', ')}</b> 💞</Note> : <Note>No overlap yet. Tap ♥ on their picks below.</Note>}
            <div style={{ display: 'grid', gap: 6 }}>{partner.map((x) => BY.get(x)).filter(Boolean).map((n) => card(n!))}</div>
          </Panel>
        )}
      </div>
      <div>
        <Stats>
          <Stat label="Matching names" value={results.length} sub={`of ${NAMES.length}`} tone="accent" />
          <Stat label="Girls / boys / unisex" value={`${results.filter((n) => n.g === 'f').length} / ${results.filter((n) => n.g === 'm').length} / ${results.filter((n) => n.g === 'u').length}`} />
          <Stat label="Shortlisted" value={s.list.length} />
        </Stats>
        <Panel title="Names" actions={<Seg value={s.sort} onChange={(sort) => set({ sort })} options={[['match', 'Best match'], ['az', 'A–Z'], ['len', 'Shortest']]} />}>
          <Check label="Show shortlisted only" value={only} onChange={setOnly} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 8, maxHeight: 720, overflow: 'auto', paddingRight: 4 }}>
            {shown.slice(0, 240).map(card)}
          </div>
          {shown.length > 240 && <p className="muted">Showing 240 of {shown.length}. Narrow the filters to see more.</p>}
          {!shown.length && <Note>No names match. Loosen a filter or check the spelling.</Note>}
        </Panel>
        <Panel title="Results by origin">
          <BarChart bars={byOrigin} height={180} fy={(v) => String(Math.round(v))} />
        </Panel>
      </div>
    </Split>
  )
}
