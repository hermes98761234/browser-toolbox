import { useEffect, useRef, useState } from 'react'
import { Btn, CopyButton, LineChart, Note, Num, Panel, Row, Seg, Select, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import type { Alg, HashReq, Verified } from './lib/password-hash-tester'

interface State {
  tab: 'hash' | 'verify' | 'bench' | 'vectors'
  alg: Alg; password: string; cost: number; variant: '2a' | '2b' | '2y'; m: number; t: number; p: number; ln: number; r: number; sp: number; iters: number; len: number
  saltHex: string; vHash: string; vPassword: string; benchAlg: Alg; budget: number
}

const ALGS: [Alg, string][] = [['argon2id', 'Argon2id'], ['bcrypt', 'bcrypt'], ['scrypt', 'scrypt'], ['argon2i', 'Argon2i'], ['argon2d', 'Argon2d'], ['pbkdf2-sha256', 'PBKDF2-SHA256'], ['pbkdf2-sha512', 'PBKDF2-SHA512']]

const DEF: State = {
  tab: 'hash', alg: 'argon2id', password: 'correct horse battery staple', cost: 10, variant: '2b', m: 19456, t: 2, p: 1, ln: 15, r: 8, sp: 1, iters: 600000, len: 32,
  saltHex: '', vHash: '$argon2i$v=19$m=65536,t=2,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG', vPassword: 'password', benchAlg: 'bcrypt', budget: 1500,
}

const EXAMPLES: [string, string, string][] = [
  ['Argon2i reference CLI example', '$argon2i$v=19$m=65536,t=2,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG', 'password'],
  ['bcrypt OpenBSD test vector', '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW', 'U*U'],
  ['bcrypt, empty password', '$2a$05$CCCCCCCCCCCCCCCCCCCCC.7uG0VCzI2bS7j6ymqJi9CdcdxiRTWNy', ''],
]

const OWASP: Record<string, string> = {
  argon2id: 'OWASP: Argon2id with m = 19 MiB, t = 2, p = 1 (or m = 46 MiB, t = 1) at minimum.',
  argon2i: 'Argon2i resists side channels but needs more passes; prefer Argon2id for passwords.',
  argon2d: 'Argon2d is fastest against GPUs but data-dependent; not recommended for password storage on shared hardware.',
  bcrypt: 'OWASP: cost ≥ 10. Inputs are truncated to 72 bytes (UTF-8).',
  scrypt: 'OWASP: N = 2^17 (ln = 17), r = 8, p = 1 at minimum.',
  'pbkdf2-sha256': 'OWASP: 600,000 iterations for PBKDF2-HMAC-SHA256 (FIPS-compliant option).',
  'pbkdf2-sha512': 'OWASP: 210,000 iterations for PBKDF2-HMAC-SHA512.',
}

const randHex = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('')
const hexBytes = (h: string) => new Uint8Array((h.match(/[0-9a-f]{2}/gi) ?? []).map((x) => parseInt(x, 16)))
const ms = (v: number) => (v < 1000 ? `${v.toFixed(v < 10 ? 1 : 0)} ms` : `${(v / 1000).toFixed(2)} s`)

interface Reply { id: number; done?: boolean; out?: string; ms?: number; verified?: Verified; tests?: [string, boolean][]; point?: [number, number]; error?: string }

function useHasher() {
  const w = useRef<Worker | null>(null)
  const cbs = useRef(new Map<number, (r: Reply) => void>())
  const n = useRef(0)
  useEffect(() => () => w.current?.terminate(), [])
  const ensure = () => {
    if (!w.current) {
      w.current = new Worker(new URL('./lib/password-hash-tester.worker.ts', import.meta.url), { type: 'module' })
      w.current.onmessage = (e: MessageEvent<Reply>) => {
        const cb = cbs.current.get(e.data.id)
        cb?.(e.data)
        if (e.data.done) cbs.current.delete(e.data.id)
      }
    }
    return w.current
  }
  const run = (msg: object, cb: (r: Reply) => void) => {
    const id = ++n.current
    cbs.current.set(id, cb)
    ensure().postMessage({ ...msg, id })
  }
  const cancel = () => {
    w.current?.terminate()
    w.current = null
    cbs.current.clear()
  }
  return { run, cancel }
}

export default function PasswordHashTester() {
  const [s, set, reset] = useToolState('password-hash-tester', DEF)
  const [busy, setBusy] = useState(false)
  const [out, setOut] = useState<{ text: string; ms: number; alg: string } | null>(null)
  const [ver, setVer] = useState<{ v?: Verified; ms?: number; error?: string } | null>(null)
  const [tests, setTests] = useState<{ list: [string, boolean][]; ms: number } | null>(null)
  const [bench, setBench] = useState<{ alg: Alg; pts: [number, number][] } | null>(null)
  const [err, setErr] = useState('')
  const H = useHasher()
  const [salt, setSalt] = useState(() => s.saltHex || randHex(16))

  const req = (alg: Alg): HashReq => ({ alg, password: s.password, salt: hexBytes(salt), cost: s.cost, variant: s.variant, m: s.m, t: s.t, p: s.p, ln: s.ln, r: s.r, sp: s.sp, iters: s.iters, len: s.len })
  const saltOk = s.alg === 'bcrypt' ? hexBytes(salt).length === 16 : hexBytes(salt).length >= 8

  const doHash = () => {
    setBusy(true)
    setErr('')
    H.run({ op: 'hash', req: req(s.alg) }, (r) => {
      setBusy(false)
      if (r.error) setErr(r.error)
      else setOut({ text: r.out!, ms: r.ms!, alg: s.alg })
    })
  }
  const doVerify = (hash = s.vHash, pw = s.vPassword) => {
    setBusy(true)
    setVer(null)
    H.run({ op: 'verify', encoded: hash, password: pw }, (r) => {
      setBusy(false)
      setVer(r.error ? { error: r.error } : { v: r.verified, ms: r.ms })
    })
  }
  const doTests = () => {
    setTests(null)
    H.run({ op: 'selftest' }, (r) => setTests({ list: r.tests ?? [], ms: r.ms ?? 0 }))
  }
  const doBench = () => {
    const a = s.benchAlg
    const [key, values] = a === 'bcrypt' ? ['cost', [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]] : a.startsWith('argon2') ? ['m', [1024, 4096, 8192, 19456, 32768, 47104, 65536, 131072, 262144]] : a === 'scrypt' ? ['ln', [10, 11, 12, 13, 14, 15, 16, 17]] : ['iters', [10000, 50000, 100000, 210000, 310000, 600000, 1000000, 2000000]]
    setBench({ alg: a, pts: [] })
    setBusy(true)
    H.run({ op: 'bench', req: { ...req(a), salt: hexBytes(randHex(16)), password: 'benchmark' }, key, values, budgetMs: s.budget }, (r) => {
      if (r.point) setBench((b) => (b ? { ...b, pts: [...b.pts, r.point!] } : b))
      if (r.done) setBusy(false)
      if (r.error) setErr(r.error)
    })
  }
  // self-test once on first open (cheap: tiny parameters) and show a sample hash
  useEffect(() => {
    doTests()
    if (saltOk) doHash()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const argon = s.alg.startsWith('argon2')
  const benchKey = s.benchAlg === 'bcrypt' ? 'cost' : s.benchAlg.startsWith('argon2') ? 'memory (MiB)' : s.benchAlg === 'scrypt' ? 'ln (N = 2^ln)' : 'iterations'
  const allPass = tests && tests.list.every(([, ok]) => ok)

  return (
    <div>
      <Row>
        <Seg value={s.tab} onChange={(tab) => set({ tab })} options={[['hash', 'Hash'], ['verify', 'Verify'], ['bench', 'Timing per cost'], ['vectors', 'Test vectors']]} />
        <span className="muted" style={{ fontSize: 13 }}>🔒 All hashing runs locally in a Web Worker. Nothing is sent anywhere.</span>
      </Row>
      {s.tab === 'hash' && (
        <Split>
          <Panel title="Parameters" actions={<Btn kind="ghost" onClick={() => { reset(); setOut(null) }}>Reset</Btn>}>
            <Select label="Algorithm" value={s.alg} onChange={(alg) => { set({ alg }); setOut(null) }} options={ALGS} />
            <Txt label="Password" value={s.password} onChange={(password) => set({ password })} hint={s.alg === 'bcrypt' && new TextEncoder().encode(s.password).length > 72 ? '⚠ longer than 72 bytes: bcrypt ignores the rest' : `${new TextEncoder().encode(s.password).length} bytes UTF-8`} />
            {s.alg === 'bcrypt' && (
              <Row>
                <Num label="Cost (log₂ rounds)" value={s.cost} onChange={(cost) => set({ cost })} min={4} max={14} step={1} hint={`${(2 ** s.cost).toLocaleString('en-US')} rounds`} />
                <Select label="Prefix" value={s.variant} onChange={(variant) => set({ variant })} options={[['2b', '$2b$ (current)'], ['2a', '$2a$'], ['2y', '$2y$ (PHP)']]} />
              </Row>
            )}
            {argon && (
              <Row>
                <Num label="Memory m" value={s.m} onChange={(m) => set({ m })} unit="KiB" min={8} max={1048576} step={1024} hint={`${(s.m / 1024).toFixed(1)} MiB`} />
                <Num label="Passes t" value={s.t} onChange={(t) => set({ t })} min={1} max={20} step={1} />
                <Num label="Lanes p" value={s.p} onChange={(p) => set({ p })} min={1} max={16} step={1} />
              </Row>
            )}
            {s.alg === 'scrypt' && (
              <Row>
                <Num label="ln (N = 2^ln)" value={s.ln} onChange={(ln) => set({ ln })} min={1} max={20} step={1} hint={`N = ${(2 ** s.ln).toLocaleString('en-US')}, memory ≈ ${((128 * s.r * 2 ** s.ln) / 1048576).toFixed(0)} MiB`} />
                <Num label="r (block size)" value={s.r} onChange={(r) => set({ r })} min={1} max={32} step={1} />
                <Num label="p (parallel)" value={s.sp} onChange={(sp) => set({ sp })} min={1} max={16} step={1} />
              </Row>
            )}
            {s.alg.startsWith('pbkdf2') && <Num label="Iterations" value={s.iters} onChange={(iters) => set({ iters })} min={1} step={10000} />}
            {s.alg !== 'bcrypt' && <Num label="Output length" value={s.len} onChange={(len) => set({ len })} unit="bytes" min={4} max={128} step={1} />}
            <Row>
              <Txt label={`Salt (hex, ${s.alg === 'bcrypt' ? 'exactly 16' : '≥ 8'} bytes)`} value={salt} onChange={setSalt} />
              <Btn onClick={() => setSalt(randHex(16))}>🎲 New salt</Btn>
            </Row>
            {!saltOk && <Note tone="err">Salt must be {s.alg === 'bcrypt' ? 'exactly 16 bytes (32 hex characters)' : 'at least 8 bytes'}.</Note>}
            <Note tone="info">{OWASP[s.alg]}</Note>
            <Btn kind="primary" onClick={doHash} disabled={busy || !saltOk}>{busy ? 'Hashing…' : 'Hash password'}</Btn>
            {busy && <Btn kind="ghost" onClick={() => { H.cancel(); setBusy(false) }}>Cancel</Btn>}
          </Panel>
          <div>
            {err && <Note tone="err">{err}</Note>}
            {out ? (
              <>
                <Stats>
                  <Stat label="Time" value={ms(out.ms)} tone={out.ms < 100 ? 'bad' : out.ms > 2000 ? 'bad' : 'good'} sub={out.ms < 100 ? 'too fast for password storage?' : out.ms > 2000 ? 'slow for interactive logins' : 'a reasonable login delay'} />
                  <Stat label="Algorithm" value={ALGS.find((a) => a[0] === out.alg)?.[1]} sub={`${out.text.length} characters`} />
                </Stats>
                <Panel title="Encoded hash" actions={<><CopyButton text={out.text} /><Btn onClick={() => { set({ tab: 'verify', vHash: out.text, vPassword: s.password }); setVer(null) }}>Verify it →</Btn></>}>
                  <code style={{ wordBreak: 'break-all', display: 'block', fontSize: 14, padding: 10, background: 'var(--bg2, rgba(127,127,127,.08))', borderRadius: 8 }}>{out.text}</code>
                  <Table head={['Part', 'Value']} rows={out.text.split('$').filter(Boolean).map((part, i) => [['id / version', 'version / cost', 'params', 'salt', 'hash'][Math.min(i, 4)], <code key="c" style={{ wordBreak: 'break-all' }}>{part}</code>])} />
                </Panel>
              </>
            ) : <Panel title="Encoded hash"><p className="muted">Choose an algorithm and press <b>Hash password</b>. The output uses the standard formats: modular crypt <code>$2b$…</code> for bcrypt and PHC strings (<code>$argon2id$v=19$m=…,t=…,p=…$salt$hash</code>) for the others, so it can be pasted into most libraries.</p></Panel>}
          </div>
        </Split>
      )}
      {s.tab === 'verify' && (
        <Split>
          <Panel title="Verify a stored hash">
            <Txt label="Stored hash" value={s.vHash} onChange={(vHash) => { set({ vHash }); setVer(null) }} />
            <Txt label="Password to check" value={s.vPassword} onChange={(vPassword) => { set({ vPassword }); setVer(null) }} />
            <Btn kind="primary" onClick={() => doVerify()} disabled={busy}>{busy ? 'Checking…' : 'Verify'}</Btn>
            <h4 style={{ margin: '14px 0 6px' }}>Examples</h4>
            {EXAMPLES.map(([n, h, pw]) => <div key={n}><Btn kind="ghost" onClick={() => { set({ vHash: h, vPassword: pw }); doVerify(h, pw) }}>{n}</Btn></div>)}
          </Panel>
          <div>
            {ver?.error && <Note tone="err">{ver.error}</Note>}
            {ver?.v && (
              <>
                <Stats>
                  <Stat label="Result" value={ver.v.match ? '✓ Match' : '✗ No match'} tone={ver.v.match ? 'good' : 'bad'} />
                  <Stat label="Algorithm" value={ver.v.alg} sub={`checked in ${ms(ver.ms ?? 0)}`} />
                </Stats>
                <Panel title="Parsed parameters"><Table head={['Field', 'Value']} rows={ver.v.fields.map(([k, v]) => [k, <code key="v" style={{ wordBreak: 'break-all' }}>{v}</code>])} /></Panel>
              </>
            )}
            {!ver && <Note>Paste a bcrypt (<code>$2a$/$2b$/$2y$</code>) or PHC string (<code>$argon2id$</code>, <code>$argon2i$</code>, <code>$argon2d$</code>, <code>$scrypt$</code>, <code>$pbkdf2-sha256$</code>, <code>$pbkdf2-sha512$</code>). The hash is recomputed with the stored salt and parameters and compared in constant time.</Note>}
          </div>
        </Split>
      )}
      {s.tab === 'bench' && (
        <Split>
          <Panel title="Timing per cost on this device">
            <Select label="Algorithm" value={s.benchAlg} onChange={(benchAlg) => set({ benchAlg })} options={ALGS} />
            <Num label="Stop after a hash takes longer than" value={s.budget} onChange={(budget) => set({ budget })} unit="ms" min={100} step={100} />
            <Row>
              <Btn kind="primary" onClick={doBench} disabled={busy}>{busy ? 'Running…' : 'Run benchmark'}</Btn>
              {busy && <Btn kind="ghost" onClick={() => { H.cancel(); setBusy(false) }}>Stop</Btn>}
            </Row>
            <p className="muted" style={{ fontSize: 13 }}>{s.benchAlg.startsWith('argon2') ? `Memory is varied with t = ${s.t}, p = ${s.p}.` : s.benchAlg === 'scrypt' ? `N is varied with r = ${s.r}, p = ${s.sp}.` : s.benchAlg === 'bcrypt' ? 'Each +1 in cost doubles the work.' : 'PBKDF2 uses the browser’s native WebCrypto HMAC.'} This JavaScript implementation is typically 2–5× slower than native server libraries, so a server can afford roughly one step more.</p>
            <Note tone="info">{OWASP[s.benchAlg]}</Note>
          </Panel>
          <div>
            {bench && bench.pts.length > 0 ? (
              <>
                <Panel title={`${ALGS.find((a) => a[0] === bench.alg)?.[1]}: time vs ${benchKey}`}>
                  <LineChart series={[{ name: 'time (ms)', points: bench.pts.map(([v, t]) => [bench.alg.startsWith('argon2') ? v / 1024 : v, t]) }]} xLabel={benchKey} yLabel="ms" fy={(v) => v.toFixed(0)} height={240} />
                </Panel>
                <Panel title="Results">
                  <Table head={[benchKey, 'time', 'hashes / s (one core)']} rows={bench.pts.map(([v, t]) => [bench.alg.startsWith('argon2') ? `${(v / 1024).toFixed(1)} MiB` : v.toLocaleString('en-US'), ms(t), (1000 / t).toFixed(t > 1000 ? 2 : 1)])} />
                </Panel>
              </>
            ) : <Panel title="Results"><p className="muted">Run the benchmark to see how the cost parameter trades login delay against attacker work. Aim for roughly 250 ms–1 s per hash on your server.</p></Panel>}
          </div>
        </Split>
      )}
      {s.tab === 'vectors' && (
        <Panel title="Self-test against published test vectors" actions={<Btn onClick={doTests}>Run again</Btn>}>
          {tests ? (
            <>
              <Note tone={allPass ? 'ok' : 'err'}>{allPass ? `All ${tests.list.length} vectors pass (${ms(tests.ms)}).` : 'Some vectors failed: this browser’s results are not trustworthy.'}</Note>
              <Table head={['Vector', 'Result']} rows={tests.list.map(([n, ok]) => [n, <b key="r" style={{ color: ok ? 'var(--ok)' : 'var(--err)' }}>{ok ? '✓ pass' : '✗ fail'}</b>])} />
            </>
          ) : <p className="muted">Running…</p>}
          <p className="muted" style={{ fontSize: 13 }}>BLAKE2b, Argon2 (all three variants, RFC 9106 §5 with secret and associated data), bcrypt (OpenBSD/John-the-Ripper vectors), scrypt (RFC 7914) and PBKDF2-HMAC-SHA256 are implemented from their specifications in this tool; Blowfish’s initial P-array and S-boxes (hex digits of π) are computed with Machin’s formula rather than embedded.</p>
        </Panel>
      )}
    </div>
  )
}
