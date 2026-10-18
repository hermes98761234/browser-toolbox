import { useState } from 'react'
import { BarChart, Btn, CsvButton, FileDrop, JsonButtons, Note, Panel, Row, Seg, Select, Split, Stat, Stats, Table, uid, useToolState } from '../kit'
import { exportCsv, importCsv, key, LEVELS, level, mentoring, personStats, skillStats, type Matrix } from './lib/skills-matrix'

const COLORS = ['transparent', '#dbeafe', '#93c5fd', '#3b82f6', '#1e40af']
const INK = ['var(--muted)', '#1e3a8a', '#1e3a8a', '#ffffff', '#ffffff']

function sample(): Matrix {
  const skills = [
    ['fe', 'React', 'Frontend', 3, 3], ['ts', 'TypeScript', 'Frontend', 3, 3], ['css', 'CSS / design systems', 'Frontend', 3, 2],
    ['api', 'Node APIs', 'Backend', 3, 2], ['sql', 'PostgreSQL', 'Backend', 3, 2], ['k8', 'Kubernetes', 'Platform', 3, 2],
    ['ci', 'CI/CD pipelines', 'Platform', 2, 3], ['sec', 'App security', 'Platform', 3, 1], ['ux', 'User research', 'Product', 2, 2], ['data', 'Analytics / SQL reporting', 'Product', 2, 2],
  ].map(([id, name, group, target, need]) => ({ id: id as string, name: name as string, group: group as string, target: target as number, need: need as number }))
  const people = [['a', 'Alex Kim', 'Senior FE'], ['b', 'Bea Novak', 'FE'], ['c', 'Carlos Ruiz', 'Backend'], ['d', 'Dee Patel', 'Platform'], ['e', 'Emil Berg', 'Full-stack'], ['f', 'Fatima Zahra', 'Product'], ['g', 'Gus Mendes', 'Junior']]
    .map(([id, name, role]) => ({ id, name, role }))
  const grid: Record<string, number[]> = {
    a: [4, 4, 3, 2, 1, 0, 2, 2, 1, 1], b: [3, 3, 4, 1, 1, 0, 1, 0, 2, 0], c: [1, 3, 0, 4, 4, 2, 2, 3, 0, 2], d: [0, 2, 0, 2, 2, 4, 4, 2, 0, 1],
    e: [3, 3, 2, 3, 3, 1, 2, 1, 1, 2], f: [1, 0, 2, 0, 1, 0, 0, 0, 4, 3], g: [2, 2, 1, 1, 0, 0, 1, 0, 0, 0],
  }
  const r: Record<string, number> = {}
  for (const [p, lv] of Object.entries(grid)) lv.forEach((v, j) => v && (r[key(p, skills[j].id)] = v))
  const interest = Object.fromEntries([['g', 'fe'], ['g', 'ts'], ['b', 'ts'], ['e', 'k8'], ['a', 'sec'], ['f', 'sql'], ['g', 'ci'], ['c', 'k8']].map(([p, s]) => [key(p, s), true]))
  return { skills, people, r, interest }
}
const DEF = { m: sample(), mode: 'rate' as 'rate' | 'interest', sort: 'group' as 'group' | 'gap' | 'name' }

export default function SkillsMatrix() {
  const [s, set, reset] = useToolState('skills-matrix', DEF)
  const [err, setErr] = useState('')
  const m = s.m
  const setM = (p: Partial<Matrix>) => set({ m: { ...m, ...p } })
  const stats = skillStats(m)
  const pstats = personStats(m, stats)
  const mentors = mentoring(m)
  const skills = [...stats].sort((a, b) => (s.sort === 'gap' ? b.gap - a.gap || +b.spof - +a.spof : s.sort === 'name' ? a.skill.name.localeCompare(b.skill.name) : a.skill.group.localeCompare(b.skill.group))).map((x) => x.skill)
  const gaps = stats.filter((x) => x.gap > 0), spofs = stats.filter((x) => x.spof)
  const coverage = stats.reduce((a, x) => a + Math.min(x.covered, x.skill.need), 0) / (stats.reduce((a, x) => a + x.skill.need, 0) || 1)
  const click = (pid: string, sid: string, back: boolean) => {
    const k = key(pid, sid)
    if (s.mode === 'interest') return setM({ interest: { ...m.interest, [k]: !m.interest[k] } })
    const v = (level(m, pid, sid) + (back ? 4 : 1)) % 5
    setM({ r: { ...m.r, [k]: v } })
  }
  const editSkill = (id: string, p: Partial<Matrix['skills'][number]>) => setM({ skills: m.skills.map((x) => (x.id === id ? { ...x, ...p } : x)) })

  return (
    <div>
      <Stats>
        <Stat label="Team" value={`${m.people.length} people`} sub={`${m.skills.length} skills`} />
        <Stat label="Coverage of needs" value={`${Math.round(coverage * 100)}%`} tone={coverage >= 0.9 ? 'good' : coverage < 0.7 ? 'bad' : 'accent'} sub="people at target ÷ people needed" />
        <Stat label="Skill gaps" value={gaps.length} tone={gaps.length ? 'bad' : 'good'} sub={gaps.slice(0, 3).map((x) => x.skill.name).join(', ') || 'none'} />
        <Stat label="Single points of failure" value={spofs.length} tone={spofs.length ? 'bad' : 'good'} sub={spofs.slice(0, 3).map((x) => x.skill.name).join(', ') || 'none'} />
      </Stats>
      <Panel
        title="Matrix"
        actions={
          <>
            <Seg value={s.mode} onChange={(mode) => set({ mode })} options={[['rate', 'Click = rate'], ['interest', 'Click = wants to learn']]} />
            <Select label="" value={s.sort} onChange={(sort) => set({ sort })} options={[['group', 'Skills by group'], ['gap', 'Biggest gaps first'], ['name', 'A → Z']]} />
          </>
        }
      >
        <div className="k-table-wrap">
          <table className="k-table" style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>Person</th>
                {skills.map((sk) => (
                  <th key={sk.id} style={{ verticalAlign: 'bottom', minWidth: 62, fontSize: 12, whiteSpace: 'normal' }} title={`${sk.group} · target ${LEVELS[sk.target]} · need ${sk.need}`}>
                    <div className="muted" style={{ fontSize: 10, fontWeight: 400 }}>{sk.group}</div>{sk.name}
                  </th>
                ))}
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {m.people.map((p, i) => (
                <tr key={p.id}>
                  <td>
                    <input value={p.name} aria-label="Name" onChange={(e) => setM({ people: m.people.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)) })} style={{ width: 130, fontWeight: 600 }} />
                    <input value={p.role} aria-label="Role" onChange={(e) => setM({ people: m.people.map((x) => (x.id === p.id ? { ...x, role: e.target.value } : x)) })} style={{ width: 130, fontSize: 12 }} className="muted" />
                  </td>
                  {skills.map((sk) => {
                    const v = level(m, p.id, sk.id), int = m.interest[key(p.id, sk.id)]
                    return (
                      <td key={sk.id} style={{ padding: 0 }}>
                        <button type="button" onClick={(e) => click(p.id, sk.id, e.shiftKey)} onContextMenu={(e) => { e.preventDefault(); click(p.id, sk.id, true) }}
                          title={`${p.name} · ${sk.name}: ${LEVELS[v]}${int ? ' · wants to learn' : ''}`}
                          style={{ width: '100%', minWidth: 58, height: 40, border: v >= sk.target ? '2px solid #16a34a' : '1px solid var(--line)', borderRadius: 6, background: COLORS[v], color: INK[v], fontWeight: 700, cursor: 'pointer', position: 'relative' }}>
                          {v || '·'}
                          {int && <span style={{ position: 'absolute', top: 1, right: 3, fontSize: 11, color: '#f59e0b' }}>★</span>}
                        </button>
                      </td>
                    )
                  })}
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <b>{Math.round((pstats[i].total / (pstats[i].max || 1)) * 100)}%</b>
                    <Btn kind="ghost" title="Remove person" onClick={() => setM({ people: m.people.filter((x) => x.id !== p.id) })}>✕</Btn>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><b>At target / needed</b></td>
                {skills.map((sk) => {
                  const st = stats.find((x) => x.skill.id === sk.id)!
                  return <td key={sk.id} style={{ textAlign: 'center', color: st.risk === 'gap' ? 'var(--err)' : st.risk === 'spof' ? 'var(--warn)' : 'var(--ok)', fontWeight: 700 }}>{st.covered}/{sk.need}{st.risk === 'spof' ? ' ⚠' : ''}</td>
                })}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <Row>
          <Btn onClick={() => setM({ people: [...m.people, { id: uid(), name: 'New person', role: '' }] })}>+ Person</Btn>
          <Btn onClick={() => setM({ skills: [...m.skills, { id: uid(), name: 'New skill', group: 'General', target: 3, need: 2 }] })}>+ Skill</Btn>
          <CsvButton name="skills-matrix.csv" rows={() => exportCsv(m)} />
          <JsonButtons name="skills-matrix.json" data={s} onLoad={(d) => set(d)} />
          <Btn kind="ghost" onClick={reset}>Reset sample</Btn>
        </Row>
        <div className="k-legend" style={{ marginTop: 8 }}>
          {LEVELS.map((l, i) => <span key={l}><i style={{ background: COLORS[i] || 'var(--line)' }} />{i} {l}</span>)}
          <span><i style={{ background: 'transparent', border: '2px solid #16a34a' }} />meets target</span>
          <span style={{ color: '#f59e0b' }}>★ wants to learn</span>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>Click a cell to raise the level (wraps 4 → 0); shift-click or right-click lowers it. Switch to “wants to learn” to mark interest, which drives the mentoring suggestions.</p>
      </Panel>
      <Split>
        <div>
          <Panel title="Coverage vs need">
            <BarChart bars={stats.map((x) => ({ label: x.skill.name, value: [Math.min(x.covered, x.skill.need), Math.max(0, x.covered - x.skill.need), x.gap] }))} stacks={[{ name: 'Covered', color: '#16a34a' }, { name: 'Extra depth', color: '#86efac' }, { name: 'Gap', color: '#ef4444' }]} fy={(v) => String(Math.round(v))} />
          </Panel>
          <Panel title="Skill targets">
            <Table
              head={['Skill', 'Group', 'Target level', 'People needed', 'Avg', '']}
              rows={m.skills.map((sk) => [
                <input key="n" value={sk.name} onChange={(e) => editSkill(sk.id, { name: e.target.value })} style={{ width: 140 }} aria-label="Skill name" />,
                <input key="g" value={sk.group} onChange={(e) => editSkill(sk.id, { group: e.target.value })} style={{ width: 90 }} aria-label="Group" />,
                <select key="t" value={sk.target} onChange={(e) => editSkill(sk.id, { target: Number(e.target.value) })} aria-label="Target">{LEVELS.slice(1).map((l, i) => <option key={l} value={i + 1}>{i + 1} {l}</option>)}</select>,
                <input key="d" type="number" min={0} max={50} value={sk.need} onChange={(e) => editSkill(sk.id, { need: Math.max(0, Math.round(Number(e.target.value) || 0)) })} style={{ width: 60 }} aria-label="Needed" />,
                (stats.find((x) => x.skill.id === sk.id)?.avg ?? 0).toFixed(1),
                <Btn key="x" kind="ghost" title="Remove skill" onClick={() => setM({ skills: m.skills.filter((x) => x.id !== sk.id) })}>✕</Btn>,
              ])}
            />
          </Panel>
        </div>
        <div>
          <Panel title="Risks and gaps">
            {gaps.length === 0 && spofs.length === 0 && <Note tone="ok">Every skill has enough people at target level and no single point of failure.</Note>}
            {gaps.map((x) => <Note key={x.skill.id} tone="err"><b>{x.skill.name}</b>: {x.covered} of {x.skill.need} needed at “{LEVELS[x.skill.target]}” or above. {x.learners ? `${x.learners} interested learner${x.learners > 1 ? 's' : ''} could close it.` : 'Nobody has asked to learn it: consider hiring or training.'}</Note>)}
            {spofs.filter((x) => x.gap === 0).map((x) => <Note key={x.skill.id} tone="warn"><b>{x.skill.name}</b> depends on one person ({pstats.find((p) => p.unique.includes(x.skill.name))?.person.name}). Cross-train a second.</Note>)}
          </Panel>
          <Panel title="Mentoring suggestions">
            {mentors.length ? <Table head={['Skill', 'Mentor', 'Learner']} rows={mentors.map((x) => [x.skill, x.mentor, x.learner])} /> : <p className="muted">Mark interests (★) to get mentor ↔ learner pairs.</p>}
          </Panel>
          <Panel title="People">
            <Table head={['Person', 'Score', 'Expert in', 'Only one covering']} rows={pstats.map((p) => [p.person.name, `${Math.round((p.total / (p.max || 1)) * 100)}%`, p.strengths.join(', ') || '—', p.unique.length ? <span key="u" style={{ color: 'var(--warn)' }}>{p.unique.join(', ')}</span> : '—'])} />
          </Panel>
          <Panel title="Import CSV">
            <FileDrop accept=".csv,text/csv" onFiles={async ([f]) => { const r = importCsv(await f.text(), uid); if (r) { setErr(''); set({ m: r }) } else setErr('Could not read that CSV. Expected: Name, Role (optional), then one column per skill with 0–4.') }} label="Name, Role, Group / Skill… with 0–4 (append * for “wants to learn”)" />
            {err && <Note tone="err">{err}</Note>}
          </Panel>
        </div>
      </Split>
    </div>
  )
}
