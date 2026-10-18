import { useState, type ReactNode } from 'react'
import { Btn, Note, Panel, Seg, Split, Txt, useToolState } from '../kit'
import { NODES, pathTo, PLANTS, ROOT, type Plant, type Step } from './lib/plant-identifier-key'

const G = '#3f9d4b', G2 = '#2f7a3a', G3 = '#7cc47f', GREY = '#8fae9a', STEM = '#6b4f2c', POT = '#c2703d'

/** Pointed leaf from (x,y) of length l, half-width w, rotated a degrees (0 = up). */
const leaf = (x: number, y: number, l: number, w: number, a: number, fill = G, k?: string | number) => (
  <path key={k ?? `${x}${y}${a}`} d={`M0,0 Q${w},${-l / 2} 0,${-l} Q${-w},${-l / 2} 0,0Z`} transform={`translate(${x} ${y}) rotate(${a})`} fill={fill} stroke={G2} strokeWidth={0.6} />
)
const heartP = (x: number, y: number, s: number, a: number, fill: string, k: string | number) => (
  <path key={k} d="M0,0 C-7,-4 -9,-12 -4,-15 C-1,-17 0,-15 0,-13 C0,-15 1,-17 4,-15 C9,-12 7,-4 0,0Z" transform={`translate(${x} ${y}) rotate(${a}) scale(${s})`} fill={fill} stroke={G2} strokeWidth={0.5} />
)
const pot = <path d="M20,52 h24 l-3,10 h-18z" fill={POT} />
const fan = (n: number, l: number, w: number, spread: number, y = 54, fill = G) => Array.from({ length: n }, (_, i) => leaf(32, y, l, w, -spread + (2 * spread * i) / Math.max(1, n - 1), fill, i))

function icon(name: string): ReactNode {
  switch (name) {
    case 'succulent':
      return <>{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => leaf(32, 34, 20, 7, a, '#8fb8a8', a))}{[22, 67, 112, 157, 202, 247, 292, 337].map((a) => leaf(32, 34, 12, 5, a, '#a7cbbd', a))}</>
    case 'broad':
      return <>{leaf(32, 58, 46, 16, 0)}<path d="M32,58 V14" stroke={G2} strokeWidth={1.2} /></>
    case 'pads':
      return <>{pot}<g fill={G}><ellipse cx={32} cy={44} rx={6} ry={9} /><ellipse cx={24} cy={30} rx={5} ry={8} transform="rotate(-30 24 30)" /><ellipse cx={41} cy={30} rx={5} ry={8} transform="rotate(35 41 30)" /><ellipse cx={17} cy={20} rx={4} ry={7} transform="rotate(-55 17 20)" /><ellipse cx={49} cy={21} rx={4} ry={7} transform="rotate(60 49 21)" /></g><circle cx={14} cy={15} r={2.5} fill="#ec4899" /><circle cx={53} cy={16} r={2.5} fill="#ec4899" /></>
    case 'opuntia':
      return <>{pot}<g fill={G}><ellipse cx={32} cy={40} rx={10} ry={13} /><ellipse cx={22} cy={21} rx={7} ry={10} transform="rotate(-20 22 21)" /><ellipse cx={42} cy={22} rx={7} ry={10} transform="rotate(20 42 22)" /></g>{[[28, 34], [36, 38], [30, 46], [34, 30], [22, 18], [24, 25], [41, 18], [44, 25]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={1.1} fill="#fef3c7" />)}</>
    case 'aloe':
      return <>{pot}{fan(7, 40, 5, 60, 54, '#6fae8a')}{[-28, 0, 28].map((a) => <path key={a} d="M0,-10 l2,-1 M0,-20 l-2,-1 M0,-30 l2,-1" transform={`translate(32 54) rotate(${a})`} stroke="#e2f2e6" strokeWidth={1} />)}</>
    case 'jade':
      return <>{pot}<path d="M32,52 V30 M32,40 L22,28 M32,36 L42,24" stroke={STEM} strokeWidth={3} fill="none" />{[[22, 28, -40], [22, 28, 20], [42, 24, -20], [42, 24, 40], [32, 30, -10], [32, 30, 30]].map(([x, y, a], i) => <ellipse key={i} cx={0} cy={-6} rx={4} ry={6} transform={`translate(${x} ${y}) rotate(${a})`} fill="#4c9a6a" stroke="#b91c1c" strokeWidth={0.6} />)}</>
    case 'needle':
      return <><path d="M32,60 V8" stroke={STEM} strokeWidth={2} />{Array.from({ length: 16 }, (_, i) => <path key={i} d={`M32,${12 + i * 3} l${i % 2 ? 9 : -9},-4`} stroke="#2d5a3d" strokeWidth={1.6} />)}<circle cx={32} cy={8} r={2} fill="#93c5fd" /></>
    case 'lavender':
      return <>{fan(6, 18, 2, 50, 60, GREY)}{[-12, 0, 12].map((d) => <g key={d}><path d={`M${32 + d / 3},58 L${32 + d},14`} stroke={GREY} strokeWidth={1.2} />{[0, 1, 2, 3, 4].map((j) => <ellipse key={j} cx={32 + d - j * d / 40} cy={14 + j * 3.4} rx={2.2} ry={1.8} fill="#8b5cf6" />)}</g>)}</>
    case 'frond':
      return <>{[-45, -15, 15, 45].map((a) => <g key={a} transform={`translate(32 58) rotate(${a})`}><path d="M0,0 Q4,-25 0,-48" stroke={G2} fill="none" strokeWidth={1.2} />{Array.from({ length: 9 }, (_, i) => <g key={i}>{leaf(0.5, -8 - i * 4.5, 7 - i * 0.5, 1.6, 70, G, `a${i}`)}{leaf(0.5, -8 - i * 4.5, 7 - i * 0.5, 1.6, -70, G, `b${i}`)}</g>)}</g>)}</>
    case 'palm':
      return <>{pot}<path d="M30,52 L28,30 M34,52 L37,26" stroke="#ca8a04" strokeWidth={2} />{[[28, 30, -50], [28, 30, -15], [37, 26, 20], [37, 26, 55]].map(([x, y, a]) => <g key={a} transform={`translate(${x} ${y}) rotate(${a})`}><path d="M0,0 Q6,-12 2,-22" stroke={G2} fill="none" />{Array.from({ length: 7 }, (_, i) => <g key={i}>{leaf(1, -3 - i * 2.8, 8, 1, 80, G, `l${i}`)}{leaf(1, -3 - i * 2.8, 8, 1, -60, G, `r${i}`)}</g>)}</g>)}</>
    case 'strap':
      return <>{pot}{[-14, -6, 2, 10, 16].map((a, i) => <path key={a} d={`M0,0 Q5,-20 0,${-36 - (i % 2) * 8} Q-5,-20 0,0Z`} transform={`translate(${26 + i * 3} 53) rotate(${a})`} fill={G2} stroke="#facc15" strokeWidth={1} />)}</>
    case 'arching':
      return <>{pot}{[-70, -45, -20, 20, 45, 70].map((a) => <path key={a} d={`M32,52 Q${32 + a / 3},20 ${32 + a / 1.6},${28 + Math.abs(a) / 3}`} stroke={G} strokeWidth={3} fill="none" />)}<path d="M38,52 Q54,46 54,60" stroke={G3} fill="none" />{fan(4, 8, 1.5, 40, 61, G3)}</>
    case 'orchid':
      return <>{pot}{[-60, -20, 25, 65].map((a) => leaf(32, 52, 18, 6, a, '#3d7a4f', a))}<path d="M34,50 Q38,20 52,16" stroke={G2} fill="none" />{[[40, 26], [46, 20], [52, 17]].map(([x, y]) => <g key={x}><circle cx={x} cy={y} r={4.5} fill="#f0abfc" /><circle cx={x} cy={y} r={1.4} fill="#a21caf" /></g>)}</>
    case 'tulip':
      return <><path d="M32,62 V22" stroke={G2} strokeWidth={2} />{leaf(32, 62, 30, 6, -22, GREY, 1)}{leaf(32, 62, 26, 6, 25, GREY, 2)}<path d="M24,22 Q24,6 28,10 L32,4 L36,10 Q40,6 40,22 Q32,28 24,22Z" fill="#ef4444" /></>
    case 'vine':
      return <><path d="M10,6 Q30,20 20,34 Q10,48 34,58" stroke={G2} strokeWidth={1.5} fill="none" />{[[16, 12, 30], [26, 22, 110], [18, 36, -40], [20, 46, 100], [30, 56, 60]].map(([x, y, a], i) => heartP(x, y, 0.8, a, G, i))}</>
    case 'ivy':
      return <path d="M32,58 L32,48 C22,52 12,46 14,40 C8,36 12,28 20,30 C18,20 26,14 32,10 C38,14 46,20 44,30 C52,28 56,36 50,40 C52,46 42,52 32,48" fill="#2d6a3e" stroke="#e5e7eb" strokeWidth={0.8} />
    case 'heart':
      return heartP(32, 58, 3, 0, G, 'h')
    case 'pothos':
      return <>{heartP(32, 58, 3, 0, '#4d9a52', 'p')}<path d="M24,26 q4,6 0,12 M38,22 q-3,8 2,14 M30,40 q6,2 6,8" stroke="#facc15" strokeWidth={2.4} fill="none" opacity={0.8} /></>
    case 'monstera':
      return <><path d="M32,60 C10,58 4,34 14,18 C22,6 42,6 50,18 C60,34 54,58 32,60Z" fill={G2} /><path d="M32,60 L32,12 M32,40 L10,34 M32,32 L12,22 M32,40 L54,34 M32,32 L52,22" stroke="#0c1a2e" strokeWidth={2.6} /><g fill="#0c1a2e"><ellipse cx={24} cy={44} rx={2} ry={1.4} /><ellipse cx={40} cy={44} rx={2} ry={1.4} /></g></>
    case 'compound':
      return <><path d="M32,62 V6" stroke={G2} strokeWidth={1.2} />{[0, 1, 2, 3].flatMap((i) => [leaf(32, 52 - i * 12, 14, 4, -65, G, `l${i}`), leaf(32, 52 - i * 12, 14, 4, 65, G, `r${i}`)])}{leaf(32, 8, 12, 4, 0, G, 't')}</>
    case 'trio':
      return <><path d="M32,62 V30" stroke={G2} strokeWidth={1.5} />{leaf(32, 32, 22, 9, 0, G, 1)}{leaf(32, 32, 20, 9, -60, G, 2)}{leaf(32, 32, 20, 9, 60, G, 3)}<circle cx={50} cy={54} r={5} fill="#dc2626" /><circle cx={14} cy={52} r={3.5} fill="#fff" /></>
    case 'thorn':
      return <><path d="M32,62 V10" stroke="#3f6212" strokeWidth={3} />{[52, 42, 32, 22].map((y, i) => <path key={y} d={`M32,${y} l${i % 2 ? 4 : -4},-1 l${i % 2 ? -4 : 4},-3z`} fill="#7f1d1d" />)}{leaf(32, 40, 12, 5, -60, G, 1)}{leaf(32, 28, 12, 5, 60, G, 2)}<circle cx={32} cy={10} r={7} fill="#e11d48" /><circle cx={32} cy={10} r={3} fill="#9f1239" /></>
    case 'zz':
      return <>{pot}{[-18, 0, 18].map((a) => <g key={a} transform={`translate(32 52) rotate(${a})`}><path d="M0,0 V-44" stroke="#14532d" strokeWidth={2} />{[0, 1, 2, 3].flatMap((i) => [<ellipse key={`l${i}`} cx={-4} cy={-16 - i * 8} rx={3.4} ry={2} fill="#166534" />, <ellipse key={`r${i}`} cx={4} cy={-16 - i * 8} rx={3.4} ry={2} fill="#166534" />])}</g>)}</>
    case 'cutleaf':
      return <><path d="M32,62 V20" stroke={G2} strokeWidth={1.5} />{Array.from({ length: 6 }, (_, i) => <g key={i}>{leaf(32, 56 - i * 6, 10, 1.5, -70, G, `l${i}`)}{leaf(32, 56 - i * 6, 10, 1.5, 70, G, `r${i}`)}</g>)}{[0, 40, 80, 120, 160, 200, 240, 280, 320].map((a) => <ellipse key={a} cx={0} cy={-6} rx={3} ry={5} transform={`translate(32 16) rotate(${a})`} fill="#f97316" />)}<circle cx={32} cy={16} r={4} fill="#fbbf24" /></>
    case 'tomato':
      return <><path d="M32,62 V8" stroke={G2} strokeWidth={2} />{[0, 1, 2].flatMap((i) => [leaf(32, 50 - i * 14, 16, 7, -70, G, `l${i}`), leaf(32, 50 - i * 14, 16, 7, 70, G, `r${i}`)])}<circle cx={44} cy={30} r={6} fill="#dc2626" /><circle cx={20} cy={18} r={2.5} fill="#facc15" /></>
    case 'square':
      return <><rect x={30} y={8} width={4} height={54} fill={G2} />{[50, 34, 18].flatMap((y) => [leaf(32, y, 18, 8, -75, G, `l${y}`), leaf(32, y, 18, 8, 75, G, `r${y}`)])}<path d="M18,49 l3,2 l3,-2 l3,2 M40,49 l3,2 l3,-2 l3,2" stroke={G2} fill="none" strokeWidth={0.6} /></>
    case 'basil':
      return <><path d="M32,62 V10" stroke={G2} strokeWidth={2} />{[48, 30].flatMap((y) => [leaf(32, y, 20, 10, -70, '#4ade80', `l${y}`), leaf(32, y, 20, 10, 70, '#4ade80', `r${y}`)])}{leaf(32, 14, 12, 6, -30, '#4ade80', 't1')}{leaf(32, 14, 12, 6, 30, '#4ade80', 't2')}</>
    case 'fuzzy':
      return <>{pot}{[-70, -35, 0, 35, 70].map((a) => <ellipse key={a} cx={0} cy={-12} rx={8} ry={11} transform={`translate(32 52) rotate(${a})`} fill="#4d7c5a" stroke="#c4d7c9" strokeWidth={1.5} strokeDasharray="1 1.5" />)}{[[26, 34], [38, 34], [32, 30]].map(([x, y]) => <circle key={x + y} cx={x} cy={y} r={3.5} fill="#a855f7" />)}</>
    case 'sunflower':
      return <><path d="M32,62 V24" stroke={G2} strokeWidth={3} />{heartP(32, 44, 1.3, -110, G, 1)}{heartP(32, 52, 1.3, 110, G, 2)}{Array.from({ length: 14 }, (_, i) => <ellipse key={i} cx={0} cy={-11} rx={2.5} ry={6} transform={`translate(32 18) rotate(${i * 26})`} fill="#facc15" />)}<circle cx={32} cy={18} r={7} fill="#78350f" /></>
    case 'coin':
      return <>{pot}{[[20, 26, 7], [42, 22, 8], [32, 14, 6], [28, 36, 6], [44, 38, 5]].map(([x, y, r]) => <g key={x + y}><path d={`M32,52 Q${(x + 32) / 2},${y + 10} ${x},${y}`} stroke={G2} fill="none" /><circle cx={x} cy={y} r={r} fill={G} stroke={G2} /><circle cx={x} cy={y} r={0.9} fill="#d9f99d" /></g>)}</>
    case 'tree':
      return <>{pot}<path d="M32,52 V10" stroke={STEM} strokeWidth={3} />{[[44, -55], [36, 55], [28, -50], [20, 50], [12, 0]].map(([y, a]) => <ellipse key={y} cx={0} cy={-9} rx={5.5} ry={9} transform={`translate(32 ${y}) rotate(${a})`} fill="#14532d" stroke="#16a34a" strokeWidth={0.8} />)}<path d="M32,4 l2,6 h-4z" fill="#b91c1c" /></>
    case 'fiddle':
      return <>{pot}<path d="M32,52 V20" stroke={STEM} strokeWidth={3} />{[[40, -55], [30, 55], [18, 0]].map(([y, a]) => <path key={y} d="M0,0 C-6,-2 -5,-8 -3,-10 C-8,-14 -8,-22 0,-24 C8,-22 8,-14 3,-10 C5,-8 6,-2 0,0Z" transform={`translate(32 ${y}) rotate(${a})`} fill="#3f7d3a" stroke="#a3d977" strokeWidth={0.7} />)}</>
    case 'hosta':
      return <>{[-55, -20, 20, 55].map((a) => <g key={a} transform={`translate(32 60) rotate(${a})`}><path d="M0,0 C12,-10 12,-30 0,-38 C-12,-30 -12,-10 0,0Z" fill="#4a8c5c" stroke="#f1f5c8" strokeWidth={2} /><path d="M0,-2 V-34 M0,-10 q6,-6 6,-18 M0,-10 q-6,-6 -6,-18" stroke="#2f5d3c" fill="none" strokeWidth={0.6} /></g>)}</>
    case 'pattern':
      return <>{[-35, 0, 35].map((a) => <g key={a} transform={`translate(32 60) rotate(${a})`}><ellipse cx={0} cy={-20} rx={10} ry={19} fill="#4d7c4a" /><path d="M0,-2 V-38" stroke="#ef4444" strokeWidth={1} />{[-28, -20, -12].map((y) => <g key={y}><ellipse cx={-5} cy={y} rx={2.5} ry={1.4} fill="#1f3b22" /><ellipse cx={5} cy={y} rx={2.5} ry={1.4} fill="#1f3b22" /></g>)}</g>)}</>
    case 'shrub':
      return <><path d="M32,62 V40 M32,50 L20,40 M32,50 L44,40" stroke={STEM} strokeWidth={2} />{leaf(24, 50, 12, 5, -70, G, 1)}{leaf(40, 50, 12, 5, 70, G, 2)}{[[20, 30], [44, 30], [32, 22]].map(([x, y]) => <g key={x + y}>{Array.from({ length: 9 }, (_, i) => <circle key={i} cx={x + 7 * Math.cos(i * 0.7)} cy={y + 6 * Math.sin(i * 0.7)} r={3.2} fill={i % 2 ? '#60a5fa' : '#93c5fd'} />)}<circle cx={x} cy={y} r={4} fill="#818cf8" /></g>)}</>
    case 'spathe':
      return <>{pot}{fan(5, 34, 7, 55, 52, '#166534')}<path d="M32,52 V14" stroke={G2} /><path d="M32,8 C40,12 40,24 32,30 C24,24 24,12 32,8Z" fill="#f8fafc" stroke="#cbd5e1" /><rect x={31} y={14} width={2} height={10} rx={1} fill="#fde68a" /></>
    default:
      return <circle cx={32} cy={32} r={20} fill={G} />
  }
}

function Icon({ name, size = 72 }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" style={{ flex: 'none', background: 'color-mix(in srgb, var(--ok) 10%, transparent)', borderRadius: 12 }}>
      {icon(name)}
    </svg>
  )
}

const PET: Record<Plant['pets'], [string, string]> = {
  toxic: ['⚠ Toxic to cats & dogs', 'var(--err)'],
  mild: ['Mildly irritating to pets', 'var(--warn)'],
  safe: ['Considered pet-safe', 'var(--ok)'],
}

function PlantCard({ id, path, onRestart }: { id: string; path?: Step[]; onRestart?: () => void }) {
  const p = PLANTS[id]
  const [pet, petColor] = PET[p.pets]
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Icon name={p.icon} size={110} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{ margin: 0 }}>{p.name}</h2>
          <i className="muted">{p.latin}</i> · <span className="muted">{p.where}</span>
          <div style={{ color: petColor, fontWeight: 700, marginTop: 6 }}>{pet}</div>
        </div>
      </div>
      <p><b>Key features:</b> {p.features}</p>
      <p><b>Care:</b> {p.care}</p>
      {p.look && <p><b>Look-alikes:</b> {p.look}</p>}
      {path && (
        <details>
          <summary>How the key gets here ({path.length} steps)</summary>
          <ol style={{ fontSize: 14 }}>
            {path.map((s) => <li key={s.node}>{NODES[s.node].q} → <b>{NODES[s.node].opts[s.choice].t}</b></li>)}
          </ol>
        </details>
      )}
      {onRestart && <Btn kind="primary" onClick={onRestart}>Identify another plant</Btn>}
    </div>
  )
}

interface State { trail: Step[]; view: 'key' | 'browse' }

export default function PlantIdentifierKey() {
  const [s, set] = useToolState<State>('plant-identifier-key', { trail: [], view: 'key' })
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<string | null>(null)

  let node = ROOT
  let result: string | null = null
  for (const st of s.trail) {
    const to = NODES[node]?.opts[st.choice]?.to
    if (!to) break
    if (to.startsWith('p:')) result = to.slice(2)
    else node = to
  }
  const valid = s.trail.every((st, i) => (i === 0 ? st.node === ROOT : true))
  const trail = valid ? s.trail : []
  const cur = NODES[node]
  const choose = (choice: 0 | 1) => set({ trail: [...trail, { node, choice }] })
  const back = () => set({ trail: trail.slice(0, -1) })
  const restart = () => set({ trail: [] })
  const step = trail.length + 1
  const list = Object.entries(PLANTS).filter(([, p]) => (p.name + ' ' + p.latin).toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
      <Panel title="Plant identifier key" actions={<Seg value={s.view} onChange={(view) => set({ view })} options={[['key', '🔎 Identify'], ['browse', '🌿 Browse all']]} />}>
        <Note>A simplified dichotomous key for {Object.keys(PLANTS).length} common house and garden plants. Answer two-way questions about what you see; real identification may need flowers, a botanist or a local field guide.</Note>
      </Panel>
      {s.view === 'key' ? (
        <Split wide="left">
          <Panel title={result ? 'Result' : `Question ${step}`} actions={<>{trail.length > 0 && <Btn onClick={back}>← Back</Btn>}{trail.length > 0 && <Btn kind="ghost" onClick={restart}>Start over</Btn>}</>}>
            {result ? (
              <PlantCard id={result} path={trail} onRestart={restart} />
            ) : (
              <>
                <h2 style={{ marginTop: 0 }}>{cur.q}</h2>
                {cur.hint && <p className="muted">💡 {cur.hint}</p>}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  {cur.opts.map((o, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => choose(i as 0 | 1)}
                      style={{ display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', padding: 14, borderRadius: 14, border: '2px solid var(--line)', background: 'var(--panel)', color: 'inherit', cursor: 'pointer', font: 'inherit' }}
                    >
                      <Icon name={o.icon} size={84} />
                      <span><b style={{ color: 'var(--accent)' }}>{i === 0 ? 'A' : 'B'}.</b> {o.t}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </Panel>
          <Panel title="Your answers">
            {trail.length === 0 ? (
              <p className="muted">Answers appear here. Click any of them to go back to that question.</p>
            ) : (
              <ol style={{ paddingLeft: 18, margin: 0 }}>
                {trail.map((st, i) => (
                  <li key={st.node} style={{ marginBottom: 8 }}>
                    <button type="button" onClick={() => set({ trail: trail.slice(0, i) })} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
                      <span className="muted" style={{ fontSize: 13 }}>{NODES[st.node].q}</span>
                      <br />
                      <b>{NODES[st.node].opts[st.choice].t}</b>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <p className="muted" style={{ fontSize: 13 }}>Tips: look at a mature, healthy leaf; check the stem shape and leaf arrangement; smell a crushed leaf (wash hands after — several plants here irritate skin).</p>
          </Panel>
        </Split>
      ) : (
        <Split wide="left">
          <Panel title="All plants in the key" actions={<Txt label="" value={q} onChange={setQ} placeholder="Search…" />}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
              {list.map(([id, p]) => (
                <button key={id} type="button" onClick={() => setPick(id)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 10, borderRadius: 12, border: `2px solid ${pick === id ? 'var(--accent)' : 'var(--line)'}`, background: 'var(--panel)', color: 'inherit', cursor: 'pointer', font: 'inherit', fontSize: 13 }}>
                  <Icon name={p.icon} size={64} />
                  <b style={{ textAlign: 'center' }}>{p.name}</b>
                  <span className="muted">{p.where}</span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Details">
            {pick ? <PlantCard id={pick} path={pathTo(pick) ?? undefined} /> : <p className="muted">Pick a plant to see its features, care and the path through the key.</p>}
            {pick && <Btn onClick={() => { set({ view: 'key', trail: pathTo(pick) ?? [] }) }}>Show in the key</Btn>}
          </Panel>
        </Split>
      )}
    </div>
  )
}
