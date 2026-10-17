// Dockerfile / Containerfile linter: tokenizer + rules (caching, pinning, root user, cache cleanup, …).

export type Severity = 'error' | 'warning' | 'info'

export interface Instr {
  /** 1-based line where the instruction starts. */
  line: number
  /** Last physical line (after continuations). */
  end: number
  cmd: string
  /** Raw spelling of the instruction keyword (to detect lower case). */
  rawCmd: string
  args: string
  /** Index of the build stage (0-based) the instruction belongs to; -1 before the first FROM. */
  stage: number
}

export interface Issue {
  rule: string
  severity: Severity
  line: number
  message: string
  fix: string
}

export const KNOWN = ['FROM', 'RUN', 'CMD', 'LABEL', 'MAINTAINER', 'EXPOSE', 'ENV', 'ADD', 'COPY', 'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK', 'SHELL']

/** Joins backslash continuations, drops comments/blank lines, splits keyword and arguments. */
export function tokenize(text: string): Instr[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: Instr[] = []
  let stage = -1
  for (let i = 0; i < lines.length; i++) {
    const first = lines[i]
    const t = first.trim()
    if (!t || t.startsWith('#')) continue
    let body = t
    const start = i
    while (/\\\s*$/.test(body) && i + 1 < lines.length) {
      body = body.replace(/\\\s*$/, ' ')
      i++
      const nx = lines[i].trim()
      if (nx.startsWith('#')) continue
      body += nx
    }
    body = body.replace(/\\\s*$/, '').trim()
    const m = /^(\S+)\s*([\s\S]*)$/.exec(body)
    if (!m) continue
    const cmd = m[1].toUpperCase()
    if (cmd === 'FROM') stage++
    out.push({ line: start + 1, end: i + 1, cmd, rawCmd: m[1], args: m[2].replace(/\s+/g, ' ').trim(), stage })
  }
  return out
}

export interface RuleInfo {
  id: string
  title: string
  severity: Severity
  group: 'Base image' | 'Caching & size' | 'Security' | 'Correctness' | 'Style'
}

export const RULES: RuleInfo[] = [
  { id: 'from-first', title: 'FROM must be the first instruction (after ARG)', severity: 'error', group: 'Correctness' },
  { id: 'from-latest', title: 'Base image without a pinned tag or uses :latest', severity: 'warning', group: 'Base image' },
  { id: 'from-digest', title: 'Base image not pinned by digest', severity: 'info', group: 'Base image' },
  { id: 'stage-dup', title: 'Duplicate stage name', severity: 'error', group: 'Correctness' },
  { id: 'copy-from', title: 'COPY --from refers to an unknown stage', severity: 'error', group: 'Correctness' },
  { id: 'unknown', title: 'Unknown instruction', severity: 'error', group: 'Correctness' },
  { id: 'root-user', title: 'Final stage runs as root', severity: 'warning', group: 'Security' },
  { id: 'sudo', title: 'sudo inside RUN', severity: 'warning', group: 'Security' },
  { id: 'curl-pipe', title: 'Piping a download into a shell', severity: 'warning', group: 'Security' },
  { id: 'secret', title: 'Secret-looking value in ENV/ARG', severity: 'error', group: 'Security' },
  { id: 'apt-update-alone', title: 'apt-get update in its own RUN (stale cache)', severity: 'warning', group: 'Caching & size' },
  { id: 'apt-yes', title: 'apt-get install without -y', severity: 'error', group: 'Correctness' },
  { id: 'apt-recommends', title: 'apt-get install without --no-install-recommends', severity: 'info', group: 'Caching & size' },
  { id: 'apt-lists', title: 'apt lists not removed in the same layer', severity: 'warning', group: 'Caching & size' },
  { id: 'apt-upgrade', title: 'apt-get upgrade / dist-upgrade in image', severity: 'info', group: 'Base image' },
  { id: 'apk-cache', title: 'apk add without --no-cache', severity: 'warning', group: 'Caching & size' },
  { id: 'yum-clean', title: 'yum/dnf install without clean all', severity: 'warning', group: 'Caching & size' },
  { id: 'pip-cache', title: 'pip install without --no-cache-dir', severity: 'info', group: 'Caching & size' },
  { id: 'npm-ci', title: 'npm install instead of npm ci', severity: 'info', group: 'Caching & size' },
  { id: 'copy-all-early', title: 'COPY . before installing dependencies (busts layer cache)', severity: 'warning', group: 'Caching & size' },
  { id: 'many-runs', title: 'Several consecutive RUN layers', severity: 'info', group: 'Caching & size' },
  { id: 'add-local', title: 'ADD used for plain local files', severity: 'warning', group: 'Style' },
  { id: 'cmd-shell', title: 'CMD/ENTRYPOINT in shell form', severity: 'info', group: 'Correctness' },
  { id: 'multi-cmd', title: 'Multiple CMD/ENTRYPOINT in one stage', severity: 'warning', group: 'Correctness' },
  { id: 'cd-run', title: 'cd inside RUN instead of WORKDIR', severity: 'info', group: 'Style' },
  { id: 'workdir-rel', title: 'Relative WORKDIR', severity: 'warning', group: 'Correctness' },
  { id: 'maintainer', title: 'MAINTAINER is deprecated', severity: 'info', group: 'Style' },
  { id: 'expose', title: 'Invalid EXPOSE port', severity: 'error', group: 'Correctness' },
  { id: 'healthcheck', title: 'No HEALTHCHECK in final stage', severity: 'info', group: 'Correctness' },
  { id: 'lowercase', title: 'Instruction not in upper case', severity: 'info', group: 'Style' },
]

const RULE = Object.fromEntries(RULES.map((r) => [r.id, r]))

const DEP_INSTALL = /\b(npm (ci|install|i)\b|yarn( install)?\b|pnpm (i|install)\b|pip3? install\b.*(-r |requirements)|poetry install|bundle install|go mod download|composer install|mvn |gradle )/

/** Lints a Dockerfile. `disabled` holds rule ids to skip. */
export function lint(text: string, disabled: string[] = []): Issue[] {
  const ins = tokenize(text)
  const issues: Issue[] = []
  const add = (rule: string, line: number, message: string, fix: string) => {
    if (!disabled.includes(rule)) issues.push({ rule, severity: RULE[rule].severity, line, message, fix })
  }
  if (!ins.length) return issues

  const firstNonArg = ins.find((i) => i.cmd !== 'ARG')
  if (firstNonArg && firstNonArg.cmd !== 'FROM') add('from-first', firstNonArg.line, `First instruction is ${firstNonArg.cmd}, not FROM.`, 'Start the file with FROM (only ARG may precede it).')

  const stages: string[] = []
  const lastStage = Math.max(0, ...ins.map((i) => i.stage))
  let runStreak = 0
  const cmdCount = new Map<string, number>()

  for (const it of ins) {
    const a = it.args
    if (it.cmd !== 'RUN') runStreak = 0
    if (!KNOWN.includes(it.cmd)) {
      add('unknown', it.line, `"${it.rawCmd}" is not a Dockerfile instruction.`, `Valid instructions: ${KNOWN.join(', ')}.`)
      continue
    }
    if (it.rawCmd !== it.cmd) add('lowercase', it.line, `"${it.rawCmd}" should be written as ${it.cmd}.`, 'Upper-case instructions make the file easier to scan.')

    switch (it.cmd) {
      case 'FROM': {
        const parts = a.split(' ').filter((p) => !p.startsWith('--'))
        const image = parts[0] ?? ''
        const asIdx = parts.findIndex((p) => p.toLowerCase() === 'as')
        const name = asIdx >= 0 ? parts[asIdx + 1] : undefined
        if (name) {
          if (stages.includes(name.toLowerCase())) add('stage-dup', it.line, `Stage name "${name}" is used twice.`, 'Give each build stage a unique name.')
          stages.push(name.toLowerCase())
        } else stages.push(`#${it.stage}`)
        const isStage = stages.slice(0, -1).includes(image.toLowerCase())
        if (image && image !== 'scratch' && !isStage && !image.startsWith('$')) {
          const noReg = image.replace(/^[^/]+\.[^/]+\//, '').replace(/^localhost(:\d+)?\//, '')
          const hasDigest = image.includes('@sha256:')
          const tag = /:([^/@]+)$/.exec(noReg.split('@')[0])?.[1]
          if (!hasDigest && (!tag || tag === 'latest'))
            add('from-latest', it.line, `"${image}" ${tag ? 'uses the moving :latest tag' : 'has no tag (implies :latest)'}.`, `Pin a version, e.g. ${noReg.split(':')[0]}:<version>, so builds are reproducible.`)
          else if (!hasDigest) add('from-digest', it.line, `"${image}" is pinned by tag only; tags can be re-pushed.`, 'For fully reproducible builds append @sha256:<digest>.')
        }
        break
      }
      case 'RUN': {
        runStreak++
        if (runStreak === 3) add('many-runs', it.line, 'Three or more RUN instructions in a row each create a layer.', 'Combine related commands with && to reduce layers and image size.')
        if (/\bsudo\b/.test(a)) add('sudo', it.line, 'sudo is unnecessary in a build and can behave unpredictably.', 'RUN already executes as the current USER; switch with USER root/USER app instead.')
        if (/\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/.test(a)) add('curl-pipe', it.line, 'A downloaded script is piped straight into a shell.', 'Download, verify a checksum (sha256sum -c), then execute.')
        if (/(^|&&|;)\s*cd\s+\S+/.test(a)) add('cd-run', it.line, '"cd" only affects this RUN.', 'Use WORKDIR to change directories for later instructions.')
        const apt = /\bapt(-get)?\s+(-\S+\s+)*install\b/.test(a)
        const aptUpd = /\bapt(-get)? (-\S+ )*update\b/.test(a)
        if (aptUpd && !apt) add('apt-update-alone', it.line, 'apt-get update in a separate layer gets cached; later installs use a stale index.', 'Run "apt-get update && apt-get install -y …" in the same RUN.')
        if (apt) {
          if (!/(\s-y\b|\s-[a-z]*y[a-z]*\b|--yes|--assume-yes|-qq)/.test(a)) add('apt-yes', it.line, 'apt-get install will wait for confirmation and fail.', 'Add -y.')
          if (!/--no-install-recommends/.test(a)) add('apt-recommends', it.line, 'Recommended packages bloat the image.', 'Add --no-install-recommends.')
          if (!/rm -rf \/var\/lib\/apt\/lists/.test(a)) add('apt-lists', it.line, 'Package lists stay in the layer (~20–40 MB).', 'End the RUN with "&& rm -rf /var/lib/apt/lists/*".')
        }
        if (/\bapt(-get)? (-\S+ )*(dist-)?upgrade\b/.test(a)) add('apt-upgrade', it.line, 'Upgrading inside the image makes builds non-reproducible.', 'Prefer a newer base image tag instead of upgrading in place.')
        if (/\bapk (-\S+ )*add\b/.test(a) && !/--no-cache/.test(a)) add('apk-cache', it.line, 'apk keeps its index cache in the layer.', 'Use "apk add --no-cache …".')
        if (/\b(yum|dnf|microdnf) (-\S+ )*install\b/.test(a) && !/\b(yum|dnf|microdnf) clean all\b/.test(a)) add('yum-clean', it.line, 'The package manager cache stays in the layer.', 'Append "&& yum clean all" (or dnf clean all).')
        if (/\bpip3? install\b/.test(a) && !/--no-cache-dir/.test(a)) add('pip-cache', it.line, 'pip caches wheels inside the image.', 'Use "pip install --no-cache-dir …" (or set PIP_NO_CACHE_DIR=1).')
        if (/\bnpm (install|i)\b(?!\s+-g)/.test(a)) add('npm-ci', it.line, 'npm install may change the lockfile and resolve different versions.', 'Use "npm ci" with a committed package-lock.json.')
        break
      }
      case 'COPY':
      case 'ADD': {
        const from = /--from=(\S+)/.exec(a)?.[1]
        if (from && !/^\d+$/.test(from) && !stages.includes(from.toLowerCase()) && !from.includes('/') && !from.includes(':'))
          add('copy-from', it.line, `Stage "${from}" is not defined above.`, 'Name the stage with "FROM image AS name" before copying from it.')
        if (from && /^\d+$/.test(from) && Number(from) >= it.stage) add('copy-from', it.line, `Stage index ${from} is not an earlier stage.`, 'Copy only from earlier stages.')
        const srcs = a.replace(/--\S+/g, '').trim().split(' ').slice(0, -1)
        if (it.cmd === 'ADD' && srcs.length && srcs.every((s) => !/^https?:\/\//.test(s) && !/\.(tar|tgz|tar\.gz|tar\.bz2|tar\.xz|txz)$/.test(s)))
          add('add-local', it.line, 'ADD has implicit URL download and tar extraction behaviour.', 'Use COPY for plain files and directories.')
        if (!from && srcs.some((s) => s === '.' || s === './' || s === '*')) {
          const later = ins.find((j) => j.line > it.line && j.stage === it.stage && j.cmd === 'RUN' && DEP_INSTALL.test(j.args))
          if (later) add('copy-all-early', it.line, `The whole context is copied before dependencies are installed (line ${later.line}); every source change re-installs them.`, 'Copy only the manifest first (e.g. COPY package*.json ./), install, then COPY . .')
        }
        break
      }
      case 'CMD':
      case 'ENTRYPOINT': {
        if (!a.startsWith('[')) add('cmd-shell', it.line, `${it.cmd} in shell form runs under /bin/sh -c, so the process does not receive SIGTERM.`, `Use exec form: ${it.cmd} ["executable", "arg"].`)
        const key = `${it.stage}:${it.cmd}`
        cmdCount.set(key, (cmdCount.get(key) ?? 0) + 1)
        if (cmdCount.get(key) === 2) add('multi-cmd', it.line, `Only the last ${it.cmd} in a stage takes effect.`, `Remove the earlier ${it.cmd}.`)
        break
      }
      case 'WORKDIR':
        if (!a.startsWith('/') && !a.startsWith('$') && !/^[A-Za-z]:/.test(a)) add('workdir-rel', it.line, `WORKDIR "${a}" is relative to the previous one.`, 'Use an absolute path, e.g. WORKDIR /app.')
        break
      case 'MAINTAINER':
        add('maintainer', it.line, 'MAINTAINER is deprecated.', 'Use LABEL org.opencontainers.image.authors="…".')
        break
      case 'EXPOSE':
        for (const p of a.split(' ')) {
          const n = /^(\d+)(-(\d+))?(\/(tcp|udp|sctp))?$/i.exec(p)
          if (!p.startsWith('$') && (!n || Number(n[1]) < 1 || Number(n[1]) > 65535 || (n[3] !== undefined && Number(n[3]) > 65535)))
            add('expose', it.line, `"${p}" is not a valid port.`, 'Use a number 1–65535, optionally with /tcp or /udp.')
        }
        break
      case 'ENV':
      case 'ARG': {
        const keys = a.match(/([A-Za-z_][A-Za-z0-9_]*)(?==\S|\s+\S)/g) ?? []
        for (const k of keys)
          if (/(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_KEY|ACCESS_KEY)/i.test(k) && /=\S|\s\S/.test(a))
            add('secret', it.line, `${k} looks like a secret; ${it.cmd} values are stored in image history.`, 'Use build secrets (RUN --mount=type=secret) or inject at runtime.')
        break
      }
    }
  }

  const final = ins.filter((i) => i.stage === lastStage)
  const users = final.filter((i) => i.cmd === 'USER')
  const lastUser = users[users.length - 1]
  const fromFinal = final.find((i) => i.cmd === 'FROM')
  if (!lastUser || /^(root|0)(:|$)/.test(lastUser.args))
    add('root-user', lastUser?.line ?? fromFinal?.line ?? 1, lastUser ? 'The last USER switches back to root.' : 'No USER instruction: the container runs as root.', 'Create an unprivileged user and add "USER app" (or USER 10001) near the end.')
  if (fromFinal && !/^scratch\b/.test(fromFinal.args) && !final.some((i) => i.cmd === 'HEALTHCHECK'))
    add('healthcheck', fromFinal.line, 'The final image declares no HEALTHCHECK.', 'Add e.g. HEALTHCHECK CMD curl -f http://localhost:8080/health || exit 1 (or rely on your orchestrator).')

  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 }
  return issues.sort((x, y) => x.line - y.line || order[x.severity] - order[y.severity])
}

/** 0–100 score: errors −15, warnings −6, infos −2. */
export function score(issues: Issue[]): number {
  const p = issues.reduce((s, i) => s + (i.severity === 'error' ? 15 : i.severity === 'warning' ? 6 : 2), 0)
  return Math.max(0, 100 - p)
}
