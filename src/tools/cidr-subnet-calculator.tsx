import { useMemo } from 'react'
import { Btn, CopyButton, CsvButton, Note, Num, Panel, Row, Slider, Split, Stat, Stats, Table, Txt, useToolState } from '../kit'
import { binary, bits, count, expandIPv6, fmtAddr, info, ipv4Class, parseCidr, prefixForHosts, split, type Cidr, type Info } from './lib/cidr-subnet-calculator'

const PRESETS = ['192.168.1.130/24', '10.0.0.0/8', '172.16.40.0/22', '100.64.0.0/10', '203.0.113.7 255.255.255.248', '2001:db8:abcd:12::/56', 'fe80::1ff:fe23:4567:890a/64']
const DEF = { cidr: '192.168.1.130/24', sub: 26, hosts: 50 }

function Bits({ v, n, prefix, label }: { v: 4 | 6; n: bigint; prefix: number; label: string }) {
  const groups = binary(v, n)
  const size = v === 4 ? 8 : 16
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 2 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontFamily: 'var(--mono)', fontSize: v === 4 ? 14 : 11 }}>
        {groups.map((g, gi) => (
          <span key={gi} style={{ whiteSpace: 'nowrap' }}>
            {g.split('').map((b, bi) => {
              const net = gi * size + bi < prefix
              return (
                <span key={bi} style={{ color: net ? 'var(--accent)' : 'var(--warn)', fontWeight: net ? 700 : 400 }}>{b}</span>
              )
            })}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function CidrSubnetCalculator() {
  const [s, set, reset] = useToolState('cidr-subnet-calculator', DEF)
  const parsed = useMemo(() => parseCidr(s.cidr), [s.cidr])
  const ok = typeof parsed !== 'string'
  const c = ok ? (parsed as Cidr) : null
  const i = c ? info(c) : null
  const maxSub = c ? Math.min(bits(c.v), c.prefix + 16) : 32
  const sub = c ? Math.min(Math.max(s.sub, c.prefix), maxSub) : s.sub
  const sp = c ? split(c, sub, 512) : null
  const a = (n: bigint) => (c ? fmtAddr(c.v, n) : '')
  const hp = c ? prefixForHosts(c.v, Math.max(1, s.hosts)) : 0

  const details: [string, string][] = i && c
    ? [
        ['Network address', `${a(i.network)}/${i.prefix}`],
        [c.v === 4 ? 'Broadcast address' : 'Last address', a(i.last)],
        ['First usable host', a(i.firstHost)],
        ['Last usable host', a(i.lastHost)],
        [c.v === 4 ? 'Subnet mask' : 'Prefix mask', a(i.mask)],
        ['Wildcard (inverse) mask', a(i.wildcard)],
        ['Total addresses', count(i.total)],
        ['Usable hosts', count(i.usable)],
        ['Address type', i.kind],
        ...(c.v === 4
          ? ([
              ['Legacy class', ipv4Class(i.network)],
              ['Hex / integer', `0x${i.input.toString(16).padStart(8, '0')} / ${i.input}`],
              ['Reverse DNS zone', `${a(i.network).split('.').slice(0, Math.max(1, Math.floor(i.prefix / 8))).reverse().join('.')}.in-addr.arpa`],
            ] as [string, string][])
          : ([
              ['Expanded', expandIPv6(i.input)],
              ['/64 subnets inside', i.prefix <= 64 ? count(1n << BigInt(64 - i.prefix)) : '— (smaller than /64)'],
            ] as [string, string][])),
      ]
    : []

  const rowOf = (r: Info, k: number) => [String(k + 1), `${a(r.network)}/${r.prefix}`, a(r.firstHost), a(r.lastHost), a(r.last), count(r.usable)]

  return (
    <Split wide="right">
      <div>
        <Panel title="Network">
          <Txt label="IP address / prefix" value={s.cidr} onChange={(cidr) => set({ cidr })} placeholder="192.168.1.0/24 or 2001:db8::/48" hint="Accepts CIDR (a.b.c.d/n), a dotted netmask (a.b.c.d 255.255.255.0) or IPv6." />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {PRESETS.map((p) => (
              <Btn key={p} kind={p === s.cidr ? 'primary' : 'ghost'} onClick={() => set({ cidr: p })}>{p}</Btn>
            ))}
          </div>
          {!ok && <Note tone="err">{parsed as string}</Note>}
          {i && !i.aligned && <Note tone="warn">The address has host bits set — the network is {a(i.network)}/{i.prefix}.</Note>}
          {c && (
            <Row>
              <Btn onClick={() => set({ cidr: `${a(i!.network)}/${Math.max(0, c.prefix - 1)}` })} disabled={c.prefix === 0}>Wider /{Math.max(0, c.prefix - 1)}</Btn>
              <Btn onClick={() => set({ cidr: `${a(i!.network)}/${Math.min(bits(c.v), c.prefix + 1)}` })} disabled={c.prefix === bits(c.v)}>Narrower /{Math.min(bits(c.v), c.prefix + 1)}</Btn>
              <Btn kind="ghost" onClick={reset}>Reset</Btn>
            </Row>
          )}
        </Panel>
        {c && i && (
          <Panel title="Binary view">
            <Bits v={c.v} n={i.input} prefix={c.prefix} label="Address" />
            <Bits v={c.v} n={i.mask} prefix={c.prefix} label="Mask" />
            <Bits v={c.v} n={i.network} prefix={c.prefix} label="Network (address AND mask)" />
            <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', margin: '8px 0 4px' }}>
              <div style={{ width: `${(c.prefix / bits(c.v)) * 100}%`, background: 'var(--accent)' }} />
              <div style={{ flex: 1, background: 'var(--warn)' }} />
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              <b style={{ color: 'var(--accent)' }}>{c.prefix} network bits</b> · <b style={{ color: 'var(--warn)' }}>{bits(c.v) - c.prefix} host bits</b>
            </div>
          </Panel>
        )}
        {c && (
          <Panel title="How big a subnet do I need?">
            <Num label="Hosts needed" value={s.hosts} onChange={(hosts) => set({ hosts })} min={1} step={1} />
            <Note tone="ok">
              Use a <b>/{hp}</b> — {count(info({ v: c.v, addr: 0n, prefix: hp }).usable)} usable addresses.
              {hp >= c.prefix && <> This network holds {count(1n << BigInt(hp - c.prefix))} of them.</>}
            </Note>
            {hp >= c.prefix && hp <= c.prefix + 16 && <Btn onClick={() => set({ sub: hp })}>Split into /{hp}</Btn>}
          </Panel>
        )}
      </div>
      <div>
        {i && c && (
          <Stats>
            <Stat label="Network" value={`${a(i.network)}/${i.prefix}`} tone="accent" />
            <Stat label="Usable hosts" value={count(i.usable)} sub={`of ${count(i.total)} addresses`} />
            <Stat label={c.v === 4 ? 'Mask' : 'Prefix'} value={c.v === 4 ? a(i.mask) : `/${i.prefix}`} />
            <Stat label="Type" value={i.kind} />
          </Stats>
        )}
        {i && (
          <Panel title="Details" actions={<CopyButton text={() => details.map(([k, v]) => `${k}: ${v}`).join('\n')} label="Copy all" />}>
            <Table head={['Field', 'Value']} rows={details.map(([k, v]) => [k, <code key="v" style={{ wordBreak: 'break-all' }}>{v}</code>])} />
          </Panel>
        )}
        {c && sp && (
          <Panel
            title={`Split into /${sub} subnets`}
            actions={<CsvButton name={`subnets-${sub}.csv`} rows={() => [['#', 'Subnet', 'First host', 'Last host', c.v === 4 ? 'Broadcast' : 'Last address', 'Usable'], ...sp.rows.map(rowOf)]} />}
          >
            {c.prefix < bits(c.v) ? (
              <>
                <Slider label="New prefix" value={sub} min={c.prefix} max={maxSub} onChange={(v) => set({ sub: v })} show={(v) => `/${v}`} />
                <p className="muted" style={{ fontSize: 13 }}>
                  {count(sp.count)} subnet{sp.count === 1n ? '' : 's'} × {count(sp.rows[0]?.usable ?? 0n)} usable hosts each
                  {sp.count > BigInt(sp.rows.length) && ` — showing the first ${sp.rows.length}`}.
                </p>
                <Table head={['#', 'Subnet', 'First host', 'Last host', c.v === 4 ? 'Broadcast' : 'Last', 'Usable']} rows={sp.rows.map(rowOf)} max={64} />
              </>
            ) : (
              <Note>A host route cannot be split further.</Note>
            )}
          </Panel>
        )}
      </div>
    </Split>
  )
}
