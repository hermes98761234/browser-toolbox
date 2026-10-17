import { useMemo, useState } from 'react'
import { Area, Btn, Check, CopyButton, Note, Num, Panel, Row, Select, Split, Stat, Stats, Txt, color, download, useToolState } from '../kit'
import { DIRS, generate, parseWords, suggestSize, type Dir, type Placement, type Puzzle } from './lib/word-search-maker'

type Level = 'easy' | 'medium' | 'hard' | 'custom'
interface State {
  title: string; instructions: string; words: string; auto: boolean; rows: number; cols: number; level: Level; dirs: Dir[]
  overlap: boolean; fill: 'alphabet' | 'word-letters'; seed: number; lower: boolean; sortList: boolean
}
const LEVELS: Record<Exclude<Level, 'custom'>, { dirs: Dir[]; overlap: boolean; fill: State['fill'] }> = {
  easy: { dirs: ['E', 'S'], overlap: false, fill: 'alphabet' },
  medium: { dirs: ['E', 'S', 'SE', 'NE'], overlap: true, fill: 'alphabet' },
  hard: { dirs: ['E', 'S', 'SE', 'NE', 'W', 'N', 'NW', 'SW'], overlap: true, fill: 'word-letters' },
}
const DEF: State = {
  title: 'Space Explorer', instructions: 'Find and circle every word. Words can go across, down or diagonally.',
  words: 'Planet\nComet\nGalaxy\nOrbit\nNebula\nAsteroid\nRocket\nTelescope\nGravity\nAstronaut\nMoon\nSatellite\nEclipse\nMeteor',
  auto: true, rows: 14, cols: 14, level: 'medium', ...LEVELS.medium, seed: 2024, lower: false, sortList: true,
}
const PRESETS: [string, string, string][] = [
  ['Space', 'Space Explorer', DEF.words],
  ['Fruits', 'Fruit Basket', 'Apple\nBanana\nCherry\nMango\nPapaya\nKiwi\nLemon\nOrange\nPeach\nGrape\nMelon\nPlum'],
  ['Animals', 'Wild Animals', 'Elephant\nGiraffe\nZebra\nLion\nTiger\nMonkey\nPanda\nKoala\nRhino\nHippo\nCheetah\nGorilla'],
  ['Spanish verbs', 'Verbos', 'Hablar\nComer\nVivir\nSer\nEstar\nTener\nHacer\nIr\nPoder\nDecir\nSalir\nVenir'],
]
const ARROW: Record<Dir, string> = { E: '→', S: '↓', SE: '↘', NE: '↗', W: '←', N: '↑', NW: '↖', SW: '↙' }
const CELL = 34

function svgString(p: Puzzle, s: State, answers: boolean, placed: Placement[]): string {
  const gw = p.cols * CELL, gh = p.rows * CELL
  const list = (s.sortList ? [...placed].sort((a, b) => a.label.localeCompare(b.label)) : placed).map((x) => (s.lower ? x.label.toLowerCase() : x.label))
  const cols = gw > 500 ? 4 : 3
  const listRows = Math.ceil(list.length / cols)
  const W = Math.max(gw, 520) + 40, top = 90, H = top + gh + 40 + listRows * 26 + 20
  const x0 = (W - gw) / 2
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  const o: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Arial, Helvetica, sans-serif">`, `<rect width="${W}" height="${H}" fill="#fff"/>`]
  o.push(`<text x="${W / 2}" y="40" text-anchor="middle" font-size="26" font-weight="700">${esc(s.title)}${answers ? ' — Answer key' : ''}</text>`)
  o.push(`<text x="${W / 2}" y="66" text-anchor="middle" font-size="13" fill="#444">${esc(s.instructions)}</text>`)
  o.push(`<rect x="${x0 - 6}" y="${top - 6}" width="${gw + 12}" height="${gh + 12}" rx="8" fill="none" stroke="#222" stroke-width="1.5"/>`)
  if (answers) placed.forEach((pl, i) => {
    const [dr, dc] = DIRS[pl.dir], n = [...pl.word].length - 1
    o.push(`<line x1="${x0 + (pl.c + 0.5) * CELL}" y1="${top + (pl.r + 0.5) * CELL}" x2="${x0 + (pl.c + dc * n + 0.5) * CELL}" y2="${top + (pl.r + dr * n + 0.5) * CELL}" stroke="${color(i)}" stroke-opacity="0.35" stroke-width="${CELL * 0.72}" stroke-linecap="round"/>`)
  })
  p.grid.forEach((row, r) => row.forEach((ch, c) => o.push(`<text x="${x0 + (c + 0.5) * CELL}" y="${top + (r + 0.5) * CELL + 7}" text-anchor="middle" font-size="20">${esc(s.lower ? ch.toLowerCase() : ch)}</text>`)))
  list.forEach((w, i) => o.push(`<text x="${20 + (i % cols) * ((W - 40) / cols)}" y="${top + gh + 44 + Math.floor(i / cols) * 26}" font-size="15">☐ ${esc(w)}</text>`))
  o.push('</svg>')
  return o.join('')
}

export default function WordSearchMaker() {
  const [s, set, reset] = useToolState('word-search-maker', DEF)
  const [showKey, setShowKey] = useState(false)
  const [found, setFound] = useState<string[]>([])
  const [sel, setSel] = useState<[number, number] | null>(null)
  const words = useMemo(() => parseWords(s.words), [s.words])
  const size = s.auto ? suggestSize(words) : 0
  const rows = s.auto ? size : Math.max(5, Math.min(30, Math.round(s.rows)))
  const cols = s.auto ? size : Math.max(5, Math.min(30, Math.round(s.cols)))
  const dirs = useMemo(() => (s.dirs.length ? s.dirs : (['E'] as Dir[])), [s.dirs])
  const puzzle = useMemo(() => generate(words, { rows, cols, dirs, seed: s.seed, overlap: s.overlap, fill: s.fill }), [words, rows, cols, dirs, s.seed, s.overlap, s.fill])
  const placed = useMemo(() => [...puzzle.placed].sort((a, b) => words.findIndex((w) => w.word === a.word) - words.findIndex((w) => w.word === b.word)), [puzzle, words])
  const key = `${s.seed}|${rows}|${cols}|${s.words}|${dirs.join()}`
  const [foundKey, setFoundKey] = useState(key)
  if (foundKey !== key) { setFoundKey(key); setFound([]); setSel(null) }

  const setLevel = (level: Level) => set(level === 'custom' ? { level } : { level, ...LEVELS[level] })
  const toggleDir = (d: Dir) => set({ level: 'custom', dirs: s.dirs.includes(d) ? s.dirs.filter((x) => x !== d) : [...s.dirs, d] })

  const clickCell = (r: number, c: number) => {
    if (!sel) return setSel([r, c])
    const [r0, c0] = sel
    setSel(null)
    const hit = placed.find((pl) => {
      const [dr, dc] = DIRS[pl.dir], n = [...pl.word].length - 1
      const end: [number, number] = [pl.r + dr * n, pl.c + dc * n]
      return (pl.r === r0 && pl.c === c0 && end[0] === r && end[1] === c) || (pl.r === r && pl.c === c && end[0] === r0 && end[1] === c0)
    })
    if (hit && !found.includes(hit.word)) setFound([...found, hit.word])
  }

  const printBoth = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${s.title}</title><style>@page{margin:12mm}body{margin:0}svg{width:100%;height:auto;max-height:95vh;display:block;margin:auto}.pb{page-break-before:always}</style></head><body>${svgString(puzzle, s, false, placed)}<div class="pb"></div>${svgString(puzzle, s, true, placed)}<script>onload=()=>{print()}</script></body></html>`
    const w = window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank')
    if (!w) download('word-search.html', html, 'text/html')
  }
  const asText = () => puzzle.grid.map((r) => r.map((ch) => (s.lower ? ch.toLowerCase() : ch)).join(' ')).join('\n') + '\n\n' + placed.map((p) => p.label).join(', ')
  const dirsUsed = [...new Set(placed.map((p) => p.dir))]

  return (
    <Split wide="right">
      <div>
        <Panel title="Words" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <div className="k-row wrap" style={{ gap: 6, marginBottom: 8 }}>
            {PRESETS.map(([n, t, w]) => <Btn key={n} onClick={() => set({ title: t, words: w })}>{n}</Btn>)}
          </div>
          <Txt label="Title" value={s.title} onChange={(title) => set({ title })} />
          <Area label="Vocabulary (one per line, or comma-separated)" value={s.words} onChange={(w) => set({ words: w })} rows={9} />
          <Txt label="Instructions" value={s.instructions} onChange={(instructions) => set({ instructions })} />
        </Panel>
        <Panel title="Difficulty & grid">
          <Select label="Difficulty" value={s.level} onChange={setLevel} options={[['easy', 'Easy — across & down only'], ['medium', 'Medium — plus diagonals, shared letters'], ['hard', 'Hard — all 8 directions, look-alike filler'], ['custom', 'Custom']]} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 44px)', gap: 4, margin: '6px 0 10px' }} role="group" aria-label="Directions">
            {(['NW', 'N', 'NE', 'W', '', 'E', 'SW', 'S', 'SE'] as (Dir | '')[]).map((d, i) => d ? (
              <button key={d} type="button" className={`k-btn ${s.dirs.includes(d) ? 'primary' : ''}`} onClick={() => toggleDir(d)} title={d} style={{ padding: 6 }}>{ARROW[d]}</button>
            ) : <span key={i} />)}
          </div>
          <Check label="Words may share letters" value={s.overlap} onChange={(overlap) => set({ overlap, level: 'custom' })} />
          <Select label="Filler letters" value={s.fill} onChange={(fill) => set({ fill, level: 'custom' })} options={[['alphabet', 'Random A–Z'], ['word-letters', 'Letters from the word list (harder)']]} />
          <Check label={`Auto size (${suggestSize(words)} × ${suggestSize(words)})`} value={s.auto} onChange={(auto) => set({ auto })} />
          {!s.auto && <Row><Num label="Rows" value={s.rows} onChange={(r) => set({ rows: r })} min={5} max={30} step={1} /><Num label="Columns" value={s.cols} onChange={(c) => set({ cols: c })} min={5} max={30} step={1} /></Row>}
          <Check label="Lowercase letters" value={s.lower} onChange={(lower) => set({ lower })} />
          <Check label="Sort word list A–Z" value={s.sortList} onChange={(sortList) => set({ sortList })} />
        </Panel>
      </div>
      <div>
        <Stats>
          <Stat label="Words placed" value={`${placed.length} / ${words.length}`} tone={puzzle.unplaced.length ? 'bad' : 'good'} />
          <Stat label="Grid" value={`${rows} × ${cols}`} sub={`${rows * cols} letters`} />
          <Stat label="Directions used" value={dirsUsed.map((d) => ARROW[d]).join(' ') || '—'} />
          <Stat label="Found (play)" value={`${found.length} / ${placed.length}`} tone="accent" />
        </Stats>
        {puzzle.unplaced.length > 0 && <Note tone="warn">Could not fit: {puzzle.unplaced.join(', ')}. Enlarge the grid, allow more directions or shared letters, or try a new layout.</Note>}
        <Panel title={s.title || 'Puzzle'} actions={<Row>
          <Btn onClick={() => set({ seed: Math.floor(Math.random() * 1e9) })}>🔀 New layout</Btn>
          <Check label="Answer key" value={showKey} onChange={setShowKey} />
        </Row>}>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>{s.instructions} <i>Try it: click the first and last letter of a word.</i></p>
          <div style={{ overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${cols * CELL} ${rows * CELL}`} style={{ width: '100%', maxWidth: cols * CELL * 1.3, display: 'block', margin: 'auto', userSelect: 'none', touchAction: 'manipulation' }} role="grid" aria-label="Word search grid">
              {placed.map((pl, i) => {
                if (!showKey && !found.includes(pl.word)) return null
                const [dr, dc] = DIRS[pl.dir], n = [...pl.word].length - 1
                return <line key={pl.word} x1={(pl.c + 0.5) * CELL} y1={(pl.r + 0.5) * CELL} x2={(pl.c + dc * n + 0.5) * CELL} y2={(pl.r + dr * n + 0.5) * CELL} stroke={color(i)} strokeOpacity={0.35} strokeWidth={CELL * 0.72} strokeLinecap="round" />
              })}
              {puzzle.grid.map((row, r) => row.map((ch, c) => (
                <g key={`${r}-${c}`} onClick={() => clickCell(r, c)} style={{ cursor: 'pointer' }}>
                  <rect x={c * CELL} y={r * CELL} width={CELL} height={CELL} fill={sel && sel[0] === r && sel[1] === c ? 'var(--accent)' : 'transparent'} opacity={0.35} rx={6} />
                  <text x={(c + 0.5) * CELL} y={(r + 0.5) * CELL + 7} textAnchor="middle" fontSize={20} fill="var(--fg)" fontFamily="ui-monospace, monospace">{s.lower ? ch.toLowerCase() : ch}</text>
                </g>
              )))}
            </svg>
          </div>
          <div style={{ columns: '3 120px', marginTop: 12 }}>
            {(s.sortList ? [...placed].sort((a, b) => a.label.localeCompare(b.label)) : placed).map((pl) => (
              <div key={pl.word} style={{ textDecoration: found.includes(pl.word) ? 'line-through' : undefined, color: found.includes(pl.word) ? 'var(--muted)' : undefined }}>
                {found.includes(pl.word) ? '☑' : '☐'} {s.lower ? pl.label.toLowerCase() : pl.label} {showKey && <small className="muted">{ARROW[pl.dir]} r{pl.r + 1}c{pl.c + 1}</small>}
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Export">
          <Row>
            <Btn kind="primary" onClick={printBoth}>🖨 Print puzzle + answer key</Btn>
            <Btn onClick={() => download('word-search.svg', svgString(puzzle, s, false, placed), 'image/svg+xml')}>⬇ Puzzle SVG</Btn>
            <Btn onClick={() => download('word-search-answers.svg', svgString(puzzle, s, true, placed), 'image/svg+xml')}>⬇ Answer key SVG</Btn>
            <CopyButton text={asText} label="Copy as text" />
          </Row>
          <p className="muted" style={{ fontSize: 13 }}>SVGs are vector and print sharply at any size; the layout is reproducible from the same words and seed ({s.seed}).</p>
        </Panel>
      </div>
    </Split>
  )
}
