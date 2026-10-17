import { useMemo } from 'react'
import { BarChart, Btn, Check, color, CsvButton, FileDrop, JsonButtons, Note, Panel, pct, Row, Split, Stat, Stats, uid, useToolState } from '../kit'
import { grade, parseCsv, stats, type Assignment, type Category, type ScaleRow, type Student } from './lib/gradebook-calculator'

const SCALES: Record<string, ScaleRow[]> = {
  'US +/−': [['A', 93], ['A−', 90], ['B+', 87], ['B', 83], ['B−', 80], ['C+', 77], ['C', 73], ['C−', 70], ['D+', 67], ['D', 63], ['D−', 60], ['F', 0]].map(([letter, min]) => ({ letter: letter as string, min: min as number })),
  'A–F (10-point)': [['A', 90], ['B', 80], ['C', 70], ['D', 60], ['F', 0]].map(([letter, min]) => ({ letter: letter as string, min: min as number })),
  'Pass / Fail': [{ letter: 'Pass', min: 60 }, { letter: 'Fail', min: 0 }],
}

const CATS: Category[] = [
  { id: 'hw', name: 'Homework', weight: 20, drop: 1 },
  { id: 'qz', name: 'Quizzes', weight: 20, drop: 0 },
  { id: 'mid', name: 'Midterm', weight: 25, drop: 0 },
  { id: 'fin', name: 'Final exam', weight: 35, drop: 0 },
]
const ASG: Assignment[] = [
  { id: 'h1', name: 'HW 1', cat: 'hw', max: 10 }, { id: 'h2', name: 'HW 2', cat: 'hw', max: 10 }, { id: 'h3', name: 'HW 3', cat: 'hw', max: 10 },
  { id: 'q1', name: 'Quiz 1', cat: 'qz', max: 20 }, { id: 'q2', name: 'Quiz 2', cat: 'qz', max: 20 },
  { id: 'm', name: 'Midterm', cat: 'mid', max: 100 }, { id: 'f', name: 'Final', cat: 'fin', max: 100 },
]
const NAMES = ['Ava Martin', 'Ben Okafor', 'Chloe Nguyen', 'Diego Ruiz', 'Emma Novak', 'Farid Haddad', 'Grace Kim', 'Hugo Silva', 'Isla Brown', 'Jonas Weber', 'Kira Patel', 'Liam O’Neill']
const STUDENTS: Student[] = NAMES.map((name, i) => {
  const ability = 0.55 + ((i * 37) % 41) / 100
  const scores: Record<string, number | null> = {}
  ASG.forEach((a, j) => {
    const noise = (((i + 3) * (j + 5) * 7919) % 23) / 100 - 0.11
    scores[a.id] = i === 5 && a.id === 'h3' ? null : Math.round(a.max * Math.min(1, Math.max(0.2, ability + noise)) * 2) / 2
  })
  return { id: `s${i}`, name, scores }
})
const DEF = { cats: CATS, asg: ASG, students: STUDENTS, scale: SCALES['US +/−'], missingZero: false, pass: 60 }

const cell: React.CSSProperties = { width: 56, padding: '3px 4px', textAlign: 'right' }

export default function GradebookCalculator() {
  const [s, set, reset] = useToolState('gradebook-calculator', DEF)
  const results = useMemo(() => s.students.map((st) => grade(st, s.cats, s.asg, s.scale, s.missingZero)), [s])
  const finals = results.map((r) => r.pct)
  const st = stats(finals)
  const totalW = s.cats.reduce((a, c) => a + c.weight, 0)
  const scaleSorted = [...s.scale].sort((a, b) => b.min - a.min)
  const dist = scaleSorted.map((r) => ({ label: r.letter, value: results.filter((x) => x.letter === r.letter).length }))
  const hist = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}–${i === 9 ? 100 : i * 10 + 9}`, value: finals.filter((p) => Number.isFinite(p) && Math.min(9, Math.floor(p * 10)) === i).length, color: color(1) }))
  const catColor = (id: string) => color(Math.max(0, s.cats.findIndex((c) => c.id === id)))
  const editCat = (id: string, p: Partial<Category>) => set({ cats: s.cats.map((c) => (c.id === id ? { ...c, ...p } : c)) })
  const editAsg = (id: string, p: Partial<Assignment>) => set({ asg: s.asg.map((a) => (a.id === id ? { ...a, ...p } : a)) })
  const setScore = (sid: string, aid: string, v: string) => set({ students: s.students.map((x) => (x.id === sid ? { ...x, scores: { ...x.scores, [aid]: v.trim() === '' || !Number.isFinite(Number(v)) ? null : Number(v) } } : x)) })

  const csvRows = () => [
    ['Student', ...s.asg.map((a) => a.name), 'Final %', 'Letter'],
    ['Points possible', ...s.asg.map((a) => a.max), '', ''],
    ...s.students.map((x, i) => [x.name, ...s.asg.map((a) => x.scores[a.id] ?? ''), Number.isFinite(results[i].pct) ? (results[i].pct * 100).toFixed(2) : '', results[i].letter]),
  ]
  const importCsv = async (f: File) => {
    const rows = parseCsv(await f.text())
    if (rows.length < 2) return
    const head = rows[0].map((h) => h.trim())
    const maxRow = rows.find((r) => /^(points? possible|max|out of)/i.test(r[0]?.trim() ?? ''))
    const asg = s.asg.map((a) => ({ ...a }))
    const colIds = head.map((h, ci) => {
      if (ci === 0 || /^(final %|letter|final|total)$/i.test(h)) return null
      let a = asg.find((x) => x.name.toLowerCase() === h.toLowerCase())
      if (!a) {
        const vals = rows.slice(1).map((r) => Number(r[ci])).filter(Number.isFinite)
        const mx = maxRow && Number(maxRow[ci]) > 0 ? Number(maxRow[ci]) : Math.max(100, ...vals)
        a = { id: uid(), name: h, cat: s.cats[0]?.id ?? 'hw', max: mx }
        asg.push(a)
      } else if (maxRow && Number(maxRow[ci]) > 0) a.max = Number(maxRow[ci])
      return a.id
    })
    const students = rows.slice(1).filter((r) => r !== maxRow && r[0]?.trim()).map((r) => ({
      id: uid(), name: r[0].trim(),
      scores: Object.fromEntries(colIds.flatMap((id, ci) => (id ? [[id, r[ci]?.trim() === '' || !Number.isFinite(Number(r[ci])) ? null : Number(r[ci])]] : []))),
    }))
    set({ asg, students })
  }

  return (
    <div>
      <Stats>
        <Stat label="Class average" value={pct(st.mean, 1)} tone="accent" sub={`${st.n} students`} />
        <Stat label="Median" value={pct(st.median, 1)} sub={`σ ${pct(st.sd, 1)}`} />
        <Stat label="Range" value={`${pct(st.min, 0)} – ${pct(st.max, 0)}`} />
        <Stat label={`At or above ${s.pass}%`} value={pct(finals.filter((p) => p * 100 >= s.pass).length / (st.n || 1), 0)} tone={finals.some((p) => p * 100 < s.pass) ? 'bad' : 'good'} sub={`${finals.filter((p) => p * 100 < s.pass).length} below`} />
      </Stats>
      {totalW !== 100 && <Note tone="warn">Category weights add up to {totalW}%. Grades are normalised by the total, but most syllabi use 100%.</Note>}
      <Panel title="Gradebook" actions={<>
        <Btn onClick={() => set({ students: [...s.students, { id: uid(), name: `Student ${s.students.length + 1}`, scores: {} }] })}>+ Student</Btn>
        <Btn onClick={() => set({ asg: [...s.asg, { id: uid(), name: `Item ${s.asg.length + 1}`, cat: s.cats[0]?.id ?? '', max: 10 }] })}>+ Assignment</Btn>
        <CsvButton name="gradebook.csv" rows={csvRows} />
        <JsonButtons name="gradebook.json" data={s} onLoad={(d) => set(d)} />
        <Btn kind="ghost" onClick={reset}>Reset</Btn>
      </>}>
        <div className="k-table-wrap">
          <table className="k-table" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>
                <th>Student</th>
                {s.asg.map((a) => <th key={a.id} style={{ borderBottom: `3px solid ${catColor(a.cat)}`, textAlign: 'right' }}>{a.name}<div className="muted" style={{ fontWeight: 400 }}>/{a.max}</div></th>)}
                {s.cats.map((c) => <th key={c.id} style={{ textAlign: 'right', color: catColor(c.id) }}>{c.name}</th>)}
                <th style={{ textAlign: 'right' }}>Final</th><th>Grade</th><th />
              </tr>
            </thead>
            <tbody>
              {s.students.map((x, i) => {
                const r = results[i]
                return (
                  <tr key={x.id}>
                    <td><input value={x.name} onChange={(e) => set({ students: s.students.map((y) => (y.id === x.id ? { ...y, name: e.target.value } : y)) })} style={{ width: 130 }} aria-label="Student name" /></td>
                    {s.asg.map((a) => {
                      const v = x.scores[a.id]
                      const bad = v !== null && v !== undefined && (v < 0 || v > a.max)
                      return <td key={a.id}><input type="number" value={v ?? ''} placeholder="—" onChange={(e) => setScore(x.id, a.id, e.target.value)} style={{ ...cell, borderColor: bad ? 'var(--err)' : undefined }} aria-label={`${x.name} ${a.name}`} /></td>
                    })}
                    {s.cats.map((c) => <td key={c.id} style={{ textAlign: 'right' }} className="muted">{r.byCat[c.id] === null ? '—' : pct(r.byCat[c.id]!, 0)}</td>)}
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{pct(r.pct, 1)}</td>
                    <td><b style={{ color: r.pct * 100 < s.pass ? 'var(--err)' : 'var(--ok)' }}>{r.letter}</b></td>
                    <td><Btn kind="ghost" onClick={() => set({ students: s.students.filter((y) => y.id !== x.id) })} title="Remove student">✕</Btn></td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Average</td>
                {s.asg.map((a) => { const m = stats(s.students.map((x) => x.scores[a.id] ?? NaN)).mean; return <td key={a.id} style={{ textAlign: 'right' }}>{Number.isFinite(m) ? pct(m / a.max, 0) : '—'}</td> })}
                {s.cats.map((c) => <td key={c.id} style={{ textAlign: 'right' }}>{pct(stats(results.map((r) => r.byCat[c.id] ?? NaN)).mean, 0)}</td>)}
                <td style={{ textAlign: 'right' }}>{pct(st.mean, 1)}</td><td /><td />
              </tr>
            </tfoot>
          </table>
        </div>
        <Row>
          <Check label="Count missing scores as zero" value={s.missingZero} onChange={(missingZero) => set({ missingZero })} />
          <span className="muted" style={{ fontSize: 13 }}>Otherwise blanks are excluded (e.g. excused). Empty categories are skipped and weights renormalised.</span>
        </Row>
        <FileDrop accept=".csv,text/csv" onFiles={([f]) => void importCsv(f)} label="Import CSV: first column = student, then one column per assignment (optional “Points possible” row)" />
      </Panel>
      <Split>
        <div>
          <Panel title="Categories & weights" actions={<Btn onClick={() => set({ cats: [...s.cats, { id: uid(), name: 'New category', weight: 0, drop: 0 }] })}>+ Category</Btn>}>
            <table className="k-table">
              <thead><tr><th>Category</th><th>Weight %</th><th>Drop lowest</th><th /></tr></thead>
              <tbody>
                {s.cats.map((c) => (
                  <tr key={c.id}>
                    <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: catColor(c.id), marginRight: 6 }} /><input value={c.name} onChange={(e) => editCat(c.id, { name: e.target.value })} style={{ width: 120 }} aria-label="Category" /></td>
                    <td><input type="number" min={0} value={c.weight} onChange={(e) => editCat(c.id, { weight: Math.max(0, Number(e.target.value) || 0) })} style={cell} aria-label="Weight" /></td>
                    <td><input type="number" min={0} value={c.drop} onChange={(e) => editCat(c.id, { drop: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={cell} aria-label="Drop lowest" /></td>
                    <td><Btn kind="ghost" disabled={s.asg.some((a) => a.cat === c.id)} title="Remove (only when empty)" onClick={() => set({ cats: s.cats.filter((x) => x.id !== c.id) })}>✕</Btn></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td><td style={{ color: totalW === 100 ? 'var(--ok)' : 'var(--warn)' }}>{totalW}%</td><td /><td /></tr></tfoot>
            </table>
          </Panel>
          <Panel title="Assignments">
            <table className="k-table">
              <thead><tr><th>Name</th><th>Category</th><th>Points</th><th /></tr></thead>
              <tbody>
                {s.asg.map((a) => (
                  <tr key={a.id}>
                    <td><input value={a.name} onChange={(e) => editAsg(a.id, { name: e.target.value })} style={{ width: 110 }} aria-label="Assignment" /></td>
                    <td><select value={a.cat} onChange={(e) => editAsg(a.id, { cat: e.target.value })} aria-label="Category">{s.cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
                    <td><input type="number" min={0.5} value={a.max} onChange={(e) => editAsg(a.id, { max: Math.max(0.5, Number(e.target.value) || 1) })} style={cell} aria-label="Max points" /></td>
                    <td><Btn kind="ghost" onClick={() => set({ asg: s.asg.filter((x) => x.id !== a.id) })} title="Remove">✕</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="Letter grade scale" actions={<>{Object.keys(SCALES).map((k) => <Btn key={k} onClick={() => set({ scale: SCALES[k] })}>{k}</Btn>)}</>}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6 }}>
              {scaleSorted.map((r) => (
                <div key={r.letter} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <b style={{ width: 40 }}>{r.letter}</b>≥
                  <input type="number" value={r.min} onChange={(e) => set({ scale: s.scale.map((x) => (x.letter === r.letter ? { ...x, min: Number(e.target.value) || 0 } : x)) })} style={{ ...cell, width: 54 }} aria-label={`${r.letter} minimum`} />%
                </div>
              ))}
            </div>
            <Row>
              <label className="k-field" style={{ maxWidth: 160 }}><span className="k-label">Passing threshold %</span><input type="number" value={s.pass} onChange={(e) => set({ pass: Number(e.target.value) || 0 })} /></label>
            </Row>
          </Panel>
        </div>
        <div>
          <Panel title="Grade distribution">
            <BarChart bars={dist.map((d, i) => ({ ...d, color: color(i) }))} fy={(v) => String(Math.round(v))} height={220} />
          </Panel>
          <Panel title="Score histogram (final %)">
            <BarChart bars={hist} fy={(v) => String(Math.round(v))} height={200} />
          </Panel>
          <Panel title="Ranking">
            {s.students.map((x, i) => ({ x, r: results[i] })).filter((o) => Number.isFinite(o.r.pct)).sort((a, b) => b.r.pct - a.r.pct).map(({ x, r }, k) => (
              <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, marginBottom: 3 }}>
                <span className="muted" style={{ width: 22 }}>{k + 1}.</span>
                <span style={{ flex: 1 }}>{x.name}</span>
                <span style={{ width: 120, height: 8, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${r.pct * 100}%`, background: r.pct * 100 < s.pass ? 'var(--err)' : 'var(--accent)' }} /></span>
                <b style={{ width: 52, textAlign: 'right' }}>{pct(r.pct, 1)}</b><span style={{ width: 34 }}>{r.letter}</span>
              </div>
            ))}
          </Panel>
        </div>
      </Split>
    </div>
  )
}
