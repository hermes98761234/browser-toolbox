import { useMemo } from 'react'
import { Area, Btn, Check, color, CopyButton, CsvButton, Note, Num, Panel, Row, Select, Seg, Split, Stat, Stats, useToolState } from '../kit'
import { makeGroups, parsePairs, parseRoster, sizesFor } from './lib/group-maker'

const SAMPLE = `Ava, girl, 5
Liam, boy, 3
Mia, girl, 4
Noah, boy, 5
Zoe, girl, 2
Ethan, boy, 4
Chloe, girl, 3
Lucas, boy, 2
Isla, girl, 5
Mason, boy, 1
Lily, girl, 3
Oliver, boy, 4
Emma, girl, 1
James, boy, 3
Ruby, girl, 4
Leo, boy, 2
Grace, girl, 3
Jack, boy, 5
Sofia, girl, 2
Henry, boy, 3
Ella, girl, 4
Max, boy, 1
Aria, girl, 3
Theo, boy, 4
Nora, girl, 2
Sam, boy, 3`

const THEMES: Record<string, string[]> = {
  numbers: [],
  colors: ['Red', 'Blue', 'Green', 'Orange', 'Purple', 'Teal', 'Pink', 'Yellow', 'Grey', 'Lime', 'Indigo', 'Amber'],
  animals: ['Owls', 'Foxes', 'Otters', 'Wolves', 'Pandas', 'Eagles', 'Dolphins', 'Tigers', 'Koalas', 'Falcons', 'Lynxes', 'Bears'],
  planets: ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Ceres', 'Eris', 'Vesta'],
}

const DEF = {
  roster: SAMPLE,
  pairs: 'Noah - Jack\nAva - Isla\nMason + Leo',
  mode: 'size' as 'size' | 'count',
  k: 4,
  seed: 1,
  balanceTag: true,
  balanceSkill: true,
  theme: 'animals',
  showDetails: true,
}

export default function GroupMaker() {
  const [s, set, reset] = useToolState('group-maker', DEF)
  const people = useMemo(() => parseRoster(s.roster), [s.roster])
  const pairs = useMemo(() => parsePairs(s.pairs), [s.pairs])
  const sizes = useMemo(() => sizesFor(people.length, s.mode, s.k), [people.length, s.mode, s.k])
  const res = useMemo(() => makeGroups(people, sizes, pairs, s.seed, { balanceTag: s.balanceTag, balanceSkill: s.balanceSkill }), [people, sizes, pairs, s.seed, s.balanceTag, s.balanceSkill])
  const names = new Set(people.map((p) => p.name.toLowerCase()))
  const unknown = pairs.flatMap((p) => [p.a, p.b]).filter((n) => !names.has(n.toLowerCase()))
  const validPairs = pairs.filter((p) => names.has(p.a.toLowerCase()) && names.has(p.b.toLowerCase()) && p.a.toLowerCase() !== p.b.toLowerCase()).length
  const broken = res.apartBroken.length + res.togetherBroken.length
  const gName = (i: number) => (THEMES[s.theme]?.[i] ? `Team ${THEMES[s.theme][i]}` : `Group ${i + 1}`)
  const hasSkill = people.some((p) => p.skill !== null)
  const tags = [...new Set(people.map((p) => p.tag).filter(Boolean))]
  const avg = (g: typeof people) => (g.length ? g.reduce((a, p) => a + (p.skill ?? 0), 0) / g.length : 0)
  const avgs = res.groups.map(avg)
  const spread = avgs.length ? Math.max(...avgs) - Math.min(...avgs) : 0
  const asText = () => res.groups.map((g, i) => `${gName(i)}\n${g.map((p) => `  - ${p.name}`).join('\n')}`).join('\n\n')

  return (
    <Split wide="right">
      <div>
        <Panel title={`Roster (${people.length})`}>
          <Area value={s.roster} onChange={(roster) => set({ roster })} rows={10} placeholder={'One per line: Name, tag, skill\nAnna, girl, 4'} />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0' }}>
            One name per line. Optional: a <b>tag</b> to spread evenly (gender, class, language) and a <b>skill</b> number to balance.
          </p>
          <Row>
            <Btn kind="ghost" onClick={() => set({ roster: SAMPLE })}>Sample class</Btn>
            <Btn kind="ghost" onClick={() => set({ roster: people.map((p) => p.name).join('\n') })}>Names only</Btn>
          </Row>
        </Panel>
        <Panel title="Grouping">
          <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['size', 'People per group'], ['count', 'Number of groups']]} />
          <Num label={s.mode === 'size' ? 'Max people per group' : 'Groups'} value={s.k} onChange={(k) => set({ k: Math.max(1, Math.round(k)) })} min={1} step={1} />
          <Check label={`Spread tags evenly${tags.length ? ` (${tags.join(', ')})` : ''}`} value={s.balanceTag} onChange={(balanceTag) => set({ balanceTag })} />
          <Check label="Balance skill totals" value={s.balanceSkill} onChange={(balanceSkill) => set({ balanceSkill })} />
          <Select label="Group names" value={s.theme} onChange={(theme) => set({ theme })} options={[['numbers', 'Group 1, 2, 3…'], ['colors', 'Colours'], ['animals', 'Animals'], ['planets', 'Planets']]} />
        </Panel>
        <Panel title="Constraints">
          <Area value={s.pairs} onChange={(pairs) => set({ pairs })} rows={4} placeholder={'Anna - Ben   (keep apart)\nCleo + Dan   (keep together)'} />
          <p className="muted" style={{ fontSize: 13, margin: '6px 0' }}><b>A - B</b> keeps apart, <b>A + B</b> keeps together.</p>
          {unknown.length > 0 && <Note tone="warn">Not in roster: {[...new Set(unknown)].join(', ')}</Note>}
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Groups" value={res.groups.length} sub={`sizes ${[...new Set(sizes)].sort((a, b) => b - a).join(' / ')}`} />
          <Stat label="Constraints met" value={`${validPairs - broken}/${validPairs}`} tone={broken ? 'bad' : 'good'} />
          {hasSkill && <Stat label="Skill spread" value={spread.toFixed(2)} sub="max − min group average" />}
          <Stat label="Shuffle #" value={s.seed} />
        </Stats>
        {(res.apartBroken.length > 0 || res.togetherBroken.length > 0) && (
          <Note tone="err">
            Couldn't satisfy: {[...res.apartBroken.map((p) => `${p.a} ≠ ${p.b}`), ...res.togetherBroken.map((p) => `${p.a} = ${p.b}`)].join(', ')}. Try another shuffle or change the group size.
          </Note>
        )}
        <Panel
          title="Groups"
          actions={
            <>
              <Btn kind="primary" onClick={() => set({ seed: s.seed + 1 })}>🔀 Shuffle</Btn>
              <Btn onClick={() => window.print()}>🖨 Print cards</Btn>
              <CopyButton text={asText} />
              <CsvButton name="groups.csv" rows={() => [['Group', 'Name', 'Tag', 'Skill'], ...res.groups.flatMap((g, i) => g.map((p) => [gName(i), p.name, p.tag, p.skill ?? '']))]} />
            </>
          }
        >
          <Check label="Show tags & skill on cards" value={s.showDetails} onChange={(showDetails) => set({ showDetails })} />
          <style>{`
            .gm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin-top:10px}
            .gm-card{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--panel);break-inside:avoid}
            .gm-card h4{margin:0;padding:8px 12px;color:#fff;display:flex;justify-content:space-between;align-items:center}
            .gm-card ol{margin:0;padding:8px 12px 10px 32px}
            .gm-card li{padding:2px 0}
            .gm-tag{font-size:11px;padding:0 6px;border-radius:99px;border:1px solid var(--line);margin-left:6px;color:var(--muted)}
            @media print{
              body *{visibility:hidden}
              .gm-grid,.gm-grid *{visibility:visible}
              .gm-grid{position:absolute;left:0;top:0;width:100%;grid-template-columns:repeat(2,1fr);gap:16px}
              .gm-card{border:2px solid #000;font-size:16pt}
              .gm-card h4{-webkit-print-color-adjust:exact;print-color-adjust:exact}
            }
          `}</style>
          <div className="gm-grid">
            {res.groups.map((g, i) => (
              <div key={i} className="gm-card">
                <h4 style={{ background: color(i) }}>
                  <span>{gName(i)}</span>
                  <small style={{ opacity: 0.9 }}>{g.length}{hasSkill && s.showDetails ? ` · ⌀${avgs[i].toFixed(1)}` : ''}</small>
                </h4>
                <ol>
                  {g.map((p) => (
                    <li key={p.name}>
                      {p.name}
                      {s.showDetails && p.tag && <span className="gm-tag">{p.tag}</span>}
                      {s.showDetails && p.skill !== null && <span className="gm-tag">★{p.skill}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          {people.length === 0 && <Note>Add some names to the roster to make groups.</Note>}
        </Panel>
        <Row>
          <Btn kind="ghost" onClick={reset}>Reset everything</Btn>
        </Row>
      </div>
    </Split>
  )
}
