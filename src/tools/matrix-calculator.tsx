import { useMemo, useState, type ReactNode } from 'react'
import { Btn, Check, CopyButton, Note, Num, Panel, Row, Select, Split, Stat, Stats, useToolState } from '../kit'
import { add, charPoly, cholesky, det, eigenvector, inverse, isSquare, jacobi, lu, mul, parseMatrix, polyRoots, power, qr, rref, solveSystem, toFraction, trace, transpose, type Mat, type Step } from './lib/matrix-calculator'

type Op = 'det' | 'inv' | 'rref' | 'transpose' | 'eigen' | 'lu' | 'qr' | 'chol' | 'power' | 'mul' | 'add' | 'sub' | 'solve'
const OPS: [Op, string][] = [
  ['det', 'Determinant |A|'], ['inv', 'Inverse A⁻¹'], ['rref', 'Row reduce (RREF) & rank'], ['transpose', 'Transpose Aᵀ'], ['eigen', 'Eigenvalues & eigenvectors'],
  ['lu', 'LU decomposition (PA = LU)'], ['qr', 'QR decomposition'], ['chol', 'Cholesky (A = LLᵀ)'], ['power', 'Power Aᵏ'],
  ['mul', 'Product A × B'], ['add', 'Sum A + B'], ['sub', 'Difference A − B'], ['solve', 'Solve A·x = b (b = first column of B)'],
]
const USES_B: Op[] = ['mul', 'add', 'sub', 'solve']

const DEF = {
  a: [['4', '-2', '1'], ['-2', '4', '-2'], ['1', '-2', '4']],
  b: [['11'], ['-16'], ['17']],
  op: 'eigen' as Op,
  k: 3,
  frac: true,
}

const num = (s: string) => {
  const f = /^\s*(-?\d*\.?\d+)\s*\/\s*(\d*\.?\d+)\s*$/.exec(s)
  return f ? Number(f[1]) / Number(f[2]) : s.trim() === '' ? 0 : Number(s)
}

function MatrixView({ M, frac, label }: { M: Mat; frac: boolean; label?: ReactNode }) {
  const f = (x: number) => (frac ? toFraction(x) : Number.isInteger(x) ? String(x) : Number(x.toPrecision(6)).toString())
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, margin: '4px 12px 4px 0', verticalAlign: 'middle' }}>
      {label && <b style={{ fontStyle: 'italic' }}>{label} =</b>}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${M[0]?.length ?? 1}, auto)`, gap: '2px 14px', padding: '4px 10px', borderLeft: '2px solid var(--fg)', borderRight: '2px solid var(--fg)', borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 14 }}>
        {M.flatMap((r, i) => r.map((v, j) => <span key={`${i}-${j}`} style={{ textAlign: 'right' }}>{f(v)}</span>))}
      </div>
    </div>
  )
}

function Grid({ name, g, onChange }: { name: string; g: string[][]; onChange: (g: string[][]) => void }) {
  const rows = g.length, cols = g[0]?.length ?? 1
  const resize = (r: number, c: number) => onChange(Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => g[i]?.[j] ?? '0')))
  const [paste, setPaste] = useState<string | null>(null)
  return (
    <div>
      <Row>
        <div style={{ width: 90 }}><Select label="Rows" value={rows} onChange={(r) => resize(r, cols)} options={[1, 2, 3, 4, 5, 6, 7, 8]} /></div>
        <div style={{ width: 90 }}><Select label="Columns" value={cols} onChange={(c) => resize(rows, c)} options={[1, 2, 3, 4, 5, 6, 7, 8]} /></div>
      </Row>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'inline-grid', gridTemplateColumns: `repeat(${cols}, 62px)`, gap: 4, padding: '6px 10px', borderLeft: '2px solid var(--fg)', borderRight: '2px solid var(--fg)', borderRadius: 8 }}>
          {g.flatMap((r, i) =>
            r.map((v, j) => (
              <input
                key={`${i}-${j}`}
                className="k-text mono"
                style={{ width: 62, padding: '6px 4px', textAlign: 'center', borderColor: Number.isFinite(num(v)) ? undefined : 'var(--err)' }}
                value={v}
                aria-label={`${name}[${i + 1},${j + 1}]`}
                onChange={(e) => onChange(g.map((row, a) => row.map((x, b) => (a === i && b === j ? e.target.value : x))))}
              />
            )),
          )}
        </div>
      </div>
      <Row>
        <Btn kind="ghost" onClick={() => onChange(g.map((r, i) => r.map((_, j) => (i === j ? '1' : '0'))))}>Identity</Btn>
        <Btn kind="ghost" onClick={() => onChange(g.map((r) => r.map(() => String(Math.floor(Math.random() * 19) - 9))))}>Random</Btn>
        <Btn kind="ghost" onClick={() => onChange(g.map((r) => r.map(() => '0')))}>Zero</Btn>
        <Btn kind="ghost" onClick={() => setPaste(paste === null ? g.map((r) => r.join(' ')).join('\n') : null)}>Paste text</Btn>
      </Row>
      {paste !== null && (
        <div>
          <textarea className="k-area mono" rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} style={{ width: '100%' }} aria-label={`Paste ${name}`} />
          <Btn
            onClick={() => {
              const M = parseMatrix(paste)
              if (M) {
                onChange(M.map((r) => r.map(String)))
                setPaste(null)
              }
            }}
          >
            Load {name}
          </Btn>
          <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>Rows on lines or separated by “;”, values by spaces or commas.</span>
        </div>
      )}
    </div>
  )
}

function Steps({ steps, frac }: { steps: Step[]; frac: boolean }) {
  const [open, setOpen] = useState(false)
  if (!steps.length) return null
  return (
    <div style={{ marginTop: 10 }}>
      <Btn kind="ghost" onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} {steps.length} step{steps.length === 1 ? '' : 's'}</Btn>
      {open && (
        <ol style={{ paddingLeft: 22 }}>
          {steps.slice(0, 80).map((s, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              <div className="mono" style={{ fontWeight: 600 }}>{s.op}</div>
              <MatrixView M={s.M} frac={frac} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export default function MatrixCalculator() {
  const [s, set, reset] = useToolState('matrix-calculator', DEF)
  const A = useMemo(() => s.a.map((r) => r.map(num)), [s.a])
  const B = useMemo(() => s.b.map((r) => r.map(num)), [s.b])
  const bad = A.flat().some((v) => !Number.isFinite(v)) || (USES_B.includes(s.op) && B.flat().some((v) => !Number.isFinite(v)))
  const sq = isSquare(A)
  const fmt = (x: number) => (s.frac ? toFraction(x) : String(Number(x.toPrecision(6))))

  const out = useMemo((): { node: ReactNode; result?: Mat; steps?: Step[]; text?: string } => {
    if (bad) return { node: <Note tone="err">Some entries are not numbers (fractions like 3/4 are fine).</Note> }
    try {
      switch (s.op) {
        case 'det': {
          const d = det(A)
          return { node: <div style={{ fontSize: 28, fontWeight: 800 }}>|A| = {fmt(d.det)}</div>, steps: d.steps, text: String(d.det) }
        }
        case 'inv': {
          const r = inverse(A)
          if (!r.inv) return { node: <Note tone="warn">A is singular (rank &lt; {A.length}), so it has no inverse.</Note>, steps: r.steps }
          return { node: <MatrixView M={r.inv} frac={s.frac} label="A⁻¹" />, result: r.inv, steps: r.steps }
        }
        case 'rref': {
          const r = rref(A)
          return { node: <><MatrixView M={r.R} frac={s.frac} label="RREF(A)" /><p>Rank <b>{r.rank}</b> · pivot columns {r.pivots.map((p) => p + 1).join(', ') || 'none'} · nullity {A[0].length - r.rank}</p></>, result: r.R, steps: r.steps }
        }
        case 'transpose': {
          const T = transpose(A)
          return { node: <MatrixView M={T} frac={s.frac} label="Aᵀ" />, result: T }
        }
        case 'power': {
          const P = power(A, s.k)
          return { node: <MatrixView M={P} frac={s.frac} label={<>A<sup>{s.k}</sup></>} />, result: P }
        }
        case 'lu': {
          const { P, L, U } = lu(A)
          return { node: <><MatrixView M={P} frac={s.frac} label="P" /><MatrixView M={L} frac={s.frac} label="L" /><MatrixView M={U} frac={s.frac} label="U" /></> }
        }
        case 'qr': {
          const { Q, R } = qr(A)
          return { node: <><MatrixView M={Q} frac={false} label="Q" /><MatrixView M={R} frac={false} label="R" /></> }
        }
        case 'chol': {
          const L = cholesky(A)
          if (!L) return { node: <Note tone="warn">Cholesky needs a symmetric positive-definite matrix.</Note> }
          return { node: <MatrixView M={L} frac={false} label="L" />, result: L }
        }
        case 'eigen': {
          if (!sq) throw new Error('Eigenvalues need a square matrix')
          const sym = A.every((r, i) => r.every((v, j) => Math.abs(v - A[j][i]) < 1e-12))
          if (sym) {
            const j = jacobi(A)
            return {
              node: (
                <>
                  <p>Symmetric matrix: all eigenvalues are real and the eigenvectors are orthonormal (Jacobi method).</p>
                  {j.values.map((v, i) => (
                    <div key={i} style={{ margin: '6px 0' }}>
                      <b>λ{i + 1} = {fmt(v)}</b> <span className="muted">→</span> <MatrixView M={j.vectors.map((r) => [r[i]])} frac={false} label={`v${i + 1}`} />
                    </div>
                  ))}
                </>
              ),
            }
          }
          const cp = charPoly(A)
          const roots = polyRoots(cp)
          return {
            node: (
              <>
                <p className="mono" style={{ fontSize: 13 }}>
                  det(λI − A) = {cp.map((c, i) => ({ c, p: cp.length - 1 - i })).filter((t) => t.c !== 0).map((t, i) => `${i ? (t.c < 0 ? ' − ' : ' + ') : t.c < 0 ? '−' : ''}${Math.abs(t.c) === 1 && t.p ? '' : fmt(Math.abs(t.c))}${t.p ? `λ${t.p > 1 ? `^${t.p}` : ''}` : ''}`).join('')}
                </p>
                {roots.map((z, i) => (
                  <div key={i} style={{ margin: '6px 0' }}>
                    <b>λ{i + 1} = {z.im === 0 ? fmt(z.re) : `${Number(z.re.toPrecision(6))} ${z.im < 0 ? '−' : '+'} ${Number(Math.abs(z.im).toPrecision(6))}i`}</b>{' '}
                    {z.im === 0 && <><span className="muted">→</span> <MatrixView M={eigenvector(A, z.re).map((v) => [v])} frac={false} label={`v${i + 1}`} /></>}
                  </div>
                ))}
              </>
            ),
          }
        }
        case 'mul': {
          const P = mul(A, B)
          return { node: <MatrixView M={P} frac={s.frac} label="A × B" />, result: P }
        }
        case 'add':
        case 'sub': {
          const P = add(A, B, s.op === 'add' ? 1 : -1)
          return { node: <MatrixView M={P} frac={s.frac} label={s.op === 'add' ? 'A + B' : 'A − B'} />, result: P }
        }
        case 'solve': {
          if (B.length !== A.length) throw new Error(`b needs ${A.length} rows`)
          const r = solveSystem(A, B.map((row) => row[0]))
          if (r.kind !== 'unique') return { node: <Note tone="warn">{r.kind === 'none' ? 'The system is inconsistent: no solution.' : 'Infinitely many solutions (free variables). See the RREF steps.'}</Note>, steps: r.steps }
          return { node: <MatrixView M={r.x!.map((v) => [v])} frac={s.frac} label="x" />, result: r.x!.map((v) => [v]), steps: r.steps }
        }
      }
    } catch (e) {
      return { node: <Note tone="err">{(e as Error).message}</Note> }
    }
    return { node: null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [A, B, s.op, s.k, s.frac, bad, sq])

  const props = useMemo(() => {
    if (bad) return null
    const r = rref(A).rank
    return {
      det: sq ? det(A).det : NaN,
      rank: r,
      trace: sq ? trace(A) : NaN,
      fro: Math.sqrt(A.flat().reduce((a, v) => a + v * v, 0)),
      sym: sq && A.every((row, i) => row.every((v, j) => Math.abs(v - A[j][i]) < 1e-12)),
    }
  }, [A, sq, bad])

  return (
    <Split>
      <div>
        <Panel title="Matrix A" actions={<Btn kind="ghost" onClick={reset}>Example</Btn>}>
          <Grid name="A" g={s.a} onChange={(a) => set({ a })} />
        </Panel>
        {USES_B.includes(s.op) && (
          <Panel title={s.op === 'solve' ? 'Vector b (matrix B)' : 'Matrix B'} actions={<Btn kind="ghost" onClick={() => set({ a: s.b, b: s.a })}>⇄ Swap A, B</Btn>}>
            <Grid name="B" g={s.b} onChange={(b) => set({ b })} />
          </Panel>
        )}
      </div>
      <div>
        <div style={{ marginBottom: 14 }}>
        <Panel title="Operation">
          <Select label="Compute" value={s.op} onChange={(op) => set({ op })} options={OPS} />
          <Row>
            {s.op === 'power' && <Num label="Exponent k" value={s.k} onChange={(k) => set({ k: Math.max(-20, Math.min(50, Math.round(k))) })} step={1} />}
            <Check label="Show exact fractions" value={s.frac} onChange={(frac) => set({ frac })} />
          </Row>
        </Panel>
        </div>
        {props && (
          <Stats>
            <Stat label="Size" value={`${A.length} × ${A[0].length}`} sub={props.sym ? 'symmetric' : sq ? 'square' : 'rectangular'} />
            <Stat label="Determinant" value={sq ? fmt(props.det) : '—'} tone={sq && props.det === 0 ? 'bad' : 'accent'} sub={sq ? (props.det === 0 ? 'singular' : 'invertible') : 'needs square'} />
            <Stat label="Rank" value={props.rank} sub={sq ? `trace ${fmt(props.trace)}` : undefined} />
            <Stat label="Frobenius norm" value={Number(props.fro.toPrecision(5))} />
          </Stats>
        )}
        <Panel
          title="Result"
          actions={
            out.result && (
              <>
                <CopyButton text={() => out.result!.map((r) => r.map((v) => Number(v.toPrecision(10))).join('\t')).join('\n')} label="Copy" />
                <Btn onClick={() => set({ a: out.result!.map((r) => r.map((v) => (s.frac ? toFraction(v).replace('−', '-') : String(Number(v.toPrecision(10)))))) })}>Use as A</Btn>
              </>
            )
          }
        >
          <div style={{ overflowX: 'auto' }}>{out.node}</div>
          {out.steps && <Steps steps={out.steps} frac={s.frac} />}
        </Panel>
        <Note>Enter integers, decimals or fractions (e.g. 3/4). Exact-looking fractions are recovered from floating point with denominators up to 1000.</Note>
      </div>
    </Split>
  )
}
