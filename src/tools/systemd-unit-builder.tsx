import { useMemo, useState, type ReactNode } from 'react'
import { Btn, Check, CopyButton, download, Note, Num, Panel, Ring, Row, Seg, Select, Split, Table, Txt, Area, useToolState } from '../kit'
import { hardening, nextElapses, parseCalendar, serviceFile, timerFile, validate, type RestartPolicy, type SvcType, type Unit } from './lib/systemd-unit-builder'

const BASE: Unit = {
  name: 'webapp', description: 'Node.js web application', documentation: 'https://example.com/docs',
  after: 'network-online.target', wants: 'network-online.target', requires: '', type: 'simple',
  execStartPre: '', execStart: '/usr/bin/node /srv/webapp/server.js', execStop: '', execReload: '', pidFile: '', remainAfterExit: false,
  workingDirectory: '/srv/webapp', user: 'webapp', group: 'webapp', dynamicUser: false,
  environment: 'NODE_ENV=production\nPORT=8080', environmentFile: '-/etc/webapp/env', restart: 'on-failure', restartSec: '5s',
  startLimitBurst: 5, startLimitIntervalSec: '2min', timeoutStartSec: '', timeoutStopSec: '20s', killMode: '', standardOutput: 'journal', syslogIdentifier: 'webapp',
  noNewPrivileges: true, privateTmp: true, protectSystem: 'strict', protectHome: 'true', privateDevices: true, protectKernel: true, restrictSuid: true,
  readWritePaths: '/srv/webapp/data', capabilityBoundingSet: '', memoryMax: '512M', cpuQuota: '', limitNofile: '65536', nice: '',
  wantedBy: 'multi-user.target', timer: false, onCalendar: 'daily', onBootSec: '', onUnitActiveSec: '', persistent: true, randomizedDelaySec: '', accuracySec: '',
}

const PRESETS: Record<string, [string, Partial<Unit>]> = {
  node: ['Node.js web app (hardened)', {}],
  python: ['Python worker (venv)', {
    name: 'worker', description: 'Background job worker', documentation: '', execStart: '/opt/worker/venv/bin/python -m worker', workingDirectory: '/opt/worker',
    user: 'worker', group: 'worker', environment: 'PYTHONUNBUFFERED=1', environmentFile: '', restart: 'always', restartSec: '10s', readWritePaths: '/var/lib/worker', memoryMax: '1G', cpuQuota: '150%', syslogIdentifier: 'worker',
  }],
  backup: ['Nightly backup (oneshot + timer)', {
    name: 'backup', description: 'Nightly restic backup', documentation: '', type: 'oneshot', execStartPre: '', execStart: '/usr/bin/restic backup /home /etc\n/usr/bin/restic forget --keep-daily 7 --keep-weekly 4 --prune',
    workingDirectory: '', user: 'root', group: '', environment: 'RESTIC_REPOSITORY=/mnt/backup/restic', environmentFile: '/etc/restic/env', restart: 'no', wantedBy: '',
    after: 'network-online.target', wants: 'network-online.target', timer: true, onCalendar: '*-*-* 02:30:00', persistent: true, randomizedDelaySec: '15min', readWritePaths: '', protectSystem: 'full', protectHome: 'read-only', memoryMax: '', limitNofile: '', nice: '10', syslogIdentifier: 'backup', timeoutStopSec: '',
  }],
  compose: ['Docker Compose stack', {
    name: 'compose-app', description: 'Docker Compose application', documentation: '', after: 'docker.service network-online.target', wants: 'network-online.target', requires: 'docker.service',
    type: 'oneshot', remainAfterExit: true, execStart: '/usr/bin/docker compose up -d --remove-orphans', execStop: '/usr/bin/docker compose down', execReload: '/usr/bin/docker compose up -d --remove-orphans',
    workingDirectory: '/srv/compose-app', user: 'root', group: '', environment: '', environmentFile: '', restart: 'no', timeoutStartSec: '0', noNewPrivileges: false, privateTmp: false, protectSystem: '', protectHome: '',
    privateDevices: false, protectKernel: false, restrictSuid: false, readWritePaths: '', memoryMax: '', limitNofile: '', syslogIdentifier: '', timeoutStopSec: '',
  }],
  go: ['Go binary, DynamicUser', {
    name: 'api', description: 'Go HTTP API', documentation: '', execStart: '/usr/local/bin/api -listen :9000', workingDirectory: '', dynamicUser: true, user: '', group: '',
    environment: 'GOMAXPROCS=2', environmentFile: '', restart: 'always', restartSec: '2s', readWritePaths: '', capabilityBoundingSet: 'CAP_NET_BIND_SERVICE', memoryMax: '256M', syslogIdentifier: 'api',
  }],
  cleanup: ['Cache cleanup every 15 min', {
    name: 'cache-clean', description: 'Purge stale cache files', documentation: '', type: 'oneshot', execStart: "/bin/sh -c 'find /var/cache/app -type f -mmin +60 -delete'",
    workingDirectory: '', user: 'app', group: 'app', environment: '', environmentFile: '', restart: 'no', wantedBy: '', after: '', wants: '', timer: true, onCalendar: '*:0/15', onBootSec: '5min',
    persistent: false, readWritePaths: '/var/cache/app', memoryMax: '', limitNofile: '', syslogIdentifier: '',
  }],
}

const TABS = [['unit', 'Unit'], ['exec', 'Exec'], ['restart', 'Restart'], ['security', 'Security'], ['limits', 'Limits'], ['timer', 'Timer']] as const
type Tab = (typeof TABS)[number][0]

/** Colours INI-style lines: [Section], Key=, values, comments. */
function Highlight({ text }: { text: string }) {
  return (
    <pre className="mono" style={{ margin: 0, padding: 12, background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: 8, overflowX: 'auto', fontSize: 13, lineHeight: 1.55 }}>
      {text.split('\n').map((l, i) => {
        let el: ReactNode = l
        if (/^\[.*\]$/.test(l)) el = <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{l}</span>
        else if (/^[#;]/.test(l)) el = <span className="muted">{l}</span>
        else if (l.includes('=')) {
          const k = l.indexOf('=')
          el = (
            <>
              <span style={{ color: '#0ea5e9' }}>{l.slice(0, k)}</span>
              <span className="muted">=</span>
              <span style={{ color: l.slice(k + 1) === '' ? 'var(--err)' : 'var(--ok)' }}>{l.slice(k + 1) || '⟨required⟩'}</span>
            </>
          )
        }
        return <div key={i}>{el || ' '}</div>
      })}
    </pre>
  )
}

export default function SystemdUnitBuilder() {
  const [u, set, reset] = useToolState<Unit>('systemd-unit-builder', BASE)
  const [tab, setTab] = useState<Tab>('unit')
  const [preset, setPreset] = useState('node')
  const [now] = useState(() => Date.now())
  const svc = serviceFile(u)
  const tmr = u.timer ? timerFile(u) : ''
  const issues = validate(u)
  const score = hardening(u)
  const errs = issues.filter((i) => i.level === 'err').length
  const runs = useMemo(() => {
    if (!u.timer) return []
    return u.onCalendar.split('\n').map((l) => l.trim()).filter(Boolean).map((expr) => {
      try {
        const spec = parseCalendar(expr)
        return { expr, norm: spec.normalized, next: nextElapses(spec, new Date(now), 5), err: '' }
      } catch (e) {
        return { expr, norm: '', next: [] as Date[], err: (e as Error).message }
      }
    })
  }, [u.timer, u.onCalendar, now])
  const enable = u.timer ? `${u.name}.timer` : `${u.name}.service`
  const cmds = [
    `sudo cp ${u.name}.service ${u.timer ? `${u.name}.timer ` : ''}/etc/systemd/system/`,
    `sudo systemd-analyze verify /etc/systemd/system/${u.name}.service`,
    'sudo systemctl daemon-reload',
    `sudo systemctl enable --now ${enable}`,
    u.timer ? `systemctl list-timers ${u.name}.timer` : `systemctl status ${u.name}`,
    `journalctl -u ${u.name} -f`,
  ].join('\n')

  const T = (label: string, k: keyof Unit, hint?: string, ph?: string) => <Txt label={label} value={String(u[k])} onChange={(v) => set({ [k]: v } as Partial<Unit>)} hint={hint} placeholder={ph} />
  const C = (label: string, k: keyof Unit) => <Check label={label} value={Boolean(u[k])} onChange={(v) => set({ [k]: v } as Partial<Unit>)} />

  return (
    <Split>
      <div>
        <Panel title="Start from a preset" actions={<Btn kind="ghost" onClick={reset}>Reset</Btn>}>
          <Row>
            <Select label="Preset" value={preset} onChange={setPreset} options={Object.entries(PRESETS).map(([k, [l]]) => [k, l] as [string, string])} />
            <div style={{ alignSelf: 'end' }}>
              <Btn kind="primary" onClick={() => set({ ...BASE, ...PRESETS[preset][1] })}>Load preset</Btn>
            </div>
          </Row>
        </Panel>
        <Panel title="Directives">
          <Seg value={tab} onChange={setTab} options={TABS} />
          <div style={{ marginTop: 12 }}>
            {tab === 'unit' && (
              <>
                <Row>
                  {T('Unit name', 'name', 'File becomes <name>.service')}
                  {T('Description', 'description')}
                </Row>
                {T('Documentation', 'documentation', 'URL or man:page(8)')}
                <Row>
                  {T('After', 'after', 'Ordering only')}
                  {T('Wants', 'wants', 'Soft dependency')}
                  {T('Requires', 'requires', 'Hard dependency')}
                </Row>
                {T('WantedBy (Install)', 'wantedBy', 'multi-user.target for servers; empty for timer jobs')}
              </>
            )}
            {tab === 'exec' && (
              <>
                <Select<SvcType> label="Type" value={u.type} onChange={(type) => set({ type })} options={[['simple', 'simple — main process stays in foreground'], ['exec', 'exec — like simple, waits for exec()'], ['notify', 'notify — app calls sd_notify(READY=1)'], ['forking', 'forking — classic daemon that forks'], ['oneshot', 'oneshot — runs to completion'], ['idle', 'idle — simple, delayed until jobs settle']]} />
                <Area label="ExecStart (one command per line; several only for oneshot)" value={u.execStart} onChange={(execStart) => set({ execStart })} rows={2} mono />
                <Area label="ExecStartPre" value={u.execStartPre} onChange={(execStartPre) => set({ execStartPre })} rows={1} mono />
                <Row>
                  {T('ExecReload', 'execReload', undefined, '/bin/kill -HUP $MAINPID')}
                  {T('ExecStop', 'execStop')}
                </Row>
                {u.type === 'forking' && T('PIDFile', 'pidFile', undefined, '/run/app.pid')}
                {u.type === 'oneshot' && C('RemainAfterExit — stay "active" after the command exits', 'remainAfterExit')}
                <Row>
                  {T('WorkingDirectory', 'workingDirectory')}
                  {T('User', 'user')}
                  {T('Group', 'group')}
                </Row>
                {C('DynamicUser — allocate a throwaway user at runtime', 'dynamicUser')}
                <Area label="Environment (KEY=value per line)" value={u.environment} onChange={(environment) => set({ environment })} rows={3} mono />
                {T('EnvironmentFile', 'environmentFile', 'Prefix with - to ignore a missing file')}
              </>
            )}
            {tab === 'restart' && (
              <>
                <Select<RestartPolicy> label="Restart" value={u.restart} onChange={(restart) => set({ restart })} options={[['no', 'no — never restart'], ['on-failure', 'on-failure — non-zero exit, signal, timeout, watchdog'], ['on-abnormal', 'on-abnormal — signal, timeout, watchdog'], ['on-abort', 'on-abort — uncaught signal only'], ['on-watchdog', 'on-watchdog — watchdog timeout only'], ['on-success', 'on-success — clean exit only'], ['always', 'always — whatever happened']]} />
                <Row>
                  {T('RestartSec', 'restartSec', 'Delay before restarting')}
                  <Num label="StartLimitBurst" value={u.startLimitBurst} onChange={(startLimitBurst) => set({ startLimitBurst: Math.max(0, Math.round(startLimitBurst)) })} min={0} hint="0 = don't write" />
                  {T('StartLimitIntervalSec', 'startLimitIntervalSec')}
                </Row>
                <Row>
                  {T('TimeoutStartSec', 'timeoutStartSec', '0 or infinity disables')}
                  {T('TimeoutStopSec', 'timeoutStopSec')}
                </Row>
                <Row>
                  <Select label="KillMode" value={u.killMode} onChange={(killMode) => set({ killMode })} options={[['', '(default: control-group)'], ['mixed', 'mixed'], ['process', 'process'], ['none', 'none']]} />
                  <Select label="StandardOutput" value={u.standardOutput} onChange={(standardOutput) => set({ standardOutput })} options={[['', '(default)'], ['journal', 'journal'], ['null', 'null'], ['inherit', 'inherit']]} />
                  {T('SyslogIdentifier', 'syslogIdentifier')}
                </Row>
                <Note>Restart helper: a service that crashes is restarted after RestartSec. If it starts more than StartLimitBurst times within StartLimitIntervalSec, systemd gives up and marks it failed.</Note>
              </>
            )}
            {tab === 'security' && (
              <>
                {C('NoNewPrivileges — block setuid privilege escalation', 'noNewPrivileges')}
                {C('PrivateTmp — private /tmp and /var/tmp', 'privateTmp')}
                {C('PrivateDevices — no access to physical devices', 'privateDevices')}
                {C('ProtectKernelTunables/Modules/ControlGroups', 'protectKernel')}
                {C('RestrictSUIDSGID — no creating setuid files', 'restrictSuid')}
                <Row>
                  <Select label="ProtectSystem" value={u.protectSystem} onChange={(protectSystem) => set({ protectSystem })} options={[['', 'off'], ['true', 'true — /usr, /boot read-only'], ['full', 'full — also /etc'], ['strict', 'strict — whole FS read-only']]} />
                  <Select label="ProtectHome" value={u.protectHome} onChange={(protectHome) => set({ protectHome })} options={[['', 'off'], ['read-only', 'read-only'], ['true', 'true — hidden'], ['tmpfs', 'tmpfs']]} />
                </Row>
                {T('ReadWritePaths', 'readWritePaths', 'Space-separated writable paths')}
                {T('CapabilityBoundingSet', 'capabilityBoundingSet', 'e.g. CAP_NET_BIND_SERVICE (empty = not set)')}
              </>
            )}
            {tab === 'limits' && (
              <Row>
                {T('MemoryMax', 'memoryMax', 'e.g. 512M, 2G')}
                {T('CPUQuota', 'cpuQuota', '100% = one core')}
                {T('LimitNOFILE', 'limitNofile', 'Open files')}
                {T('Nice', 'nice', '−20 … 19')}
              </Row>
            )}
            {tab === 'timer' && (
              <>
                {C('Generate a .timer unit for this service', 'timer')}
                {u.timer && (
                  <>
                    <Area label="OnCalendar (one expression per line)" value={u.onCalendar} onChange={(onCalendar) => set({ onCalendar })} rows={2} mono />
                    <Row>
                      {['hourly', 'daily', 'weekly', 'Mon..Fri 09:00', '*:0/15', '*-*-01 03:00', 'Sat *-*-1..7 04:00'].map((x) => (
                        <Btn key={x} kind="ghost" onClick={() => set({ onCalendar: x })}>{x}</Btn>
                      ))}
                    </Row>
                    <Row>
                      {T('OnBootSec', 'onBootSec', 'After boot')}
                      {T('OnUnitActiveSec', 'onUnitActiveSec', 'After last activation')}
                    </Row>
                    <Row>
                      {T('RandomizedDelaySec', 'randomizedDelaySec', 'Spread load')}
                      {T('AccuracySec', 'accuracySec', 'Default 1min')}
                    </Row>
                    {C('Persistent — catch up runs missed while powered off', 'persistent')}
                  </>
                )}
              </>
            )}
          </div>
        </Panel>
      </div>
      <div>
        <Panel title="Checks">
          <Row wrap={false}>
            <Ring value={score / 10} label={<span>{score.toFixed(1)}/10</span>} color={score >= 7 ? 'var(--ok)' : score >= 4 ? 'var(--warn)' : 'var(--err)'} />
            <div style={{ flex: 1 }}>
              <b>Hardening estimate</b>
              <div className="muted" style={{ fontSize: 13 }}>Approximate score from the sandboxing options set (in the spirit of <code>systemd-analyze security</code>, not the same number).</div>
              <div style={{ marginTop: 6 }}>{errs ? <b style={{ color: 'var(--err)' }}>{errs} error{errs > 1 ? 's' : ''}</b> : <b style={{ color: 'var(--ok)' }}>No errors</b>}</div>
            </div>
          </Row>
          {issues.map((i, k) => (
            <Note key={k} tone={i.level}>
              <b>{i.field}:</b> {i.msg}
            </Note>
          ))}
        </Panel>
        <Panel title={`${u.name}.service`} actions={<><CopyButton text={svc} /><Btn onClick={() => download(`${u.name}.service`, svc, 'text/plain')}>⬇ .service</Btn></>}>
          <Highlight text={svc} />
        </Panel>
        {u.timer && (
          <Panel title={`${u.name}.timer`} actions={<><CopyButton text={tmr} /><Btn onClick={() => download(`${u.name}.timer`, tmr, 'text/plain')}>⬇ .timer</Btn></>}>
            <Highlight text={tmr} />
            {runs.map((r) => (
              <div key={r.expr} style={{ marginTop: 10 }}>
                {r.err ? (
                  <Note tone="err">{r.expr}: {r.err}</Note>
                ) : (
                  <>
                    <div className="muted" style={{ fontSize: 13 }}>
                      <code>{r.expr}</code> normalizes to <code>{r.norm}</code> — next runs (your local time):
                    </div>
                    <Table head={['#', 'When', 'In']} rows={r.next.map((d, i) => [i + 1, d.toLocaleString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }), rel(d, now)])} />
                  </>
                )}
              </div>
            ))}
          </Panel>
        )}
        <Panel title="Install" actions={<CopyButton text={cmds} />}>
          <pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}>{cmds}</pre>
        </Panel>
      </div>
    </Split>
  )
}

function rel(d: Date, now: number): string {
  const s = Math.round((d.getTime() - now) / 1000)
  if (s < 3600) return `${Math.floor(s / 60)} min`
  if (s < 86400 * 2) return `${(s / 3600).toFixed(1)} h`
  return `${(s / 86400).toFixed(1)} days`
}
