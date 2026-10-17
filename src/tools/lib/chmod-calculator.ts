// Unix permission math: 12-bit mode (setuid 4000, setgid 2000, sticky 1000, rwx for u/g/o).

export const SUID = 0o4000
export const SGID = 0o2000
export const STICKY = 0o1000
export const WHO = ['u', 'g', 'o'] as const
export type Who = (typeof WHO)[number]
const SHIFT: Record<Who, number> = { u: 6, g: 3, o: 0 }

/** Octal string: 3 digits normally, 4 when a special bit is set (or `always4`). */
export function toOctal(mode: number, always4 = false): string {
  const m = mode & 0o7777
  return m > 0o777 || always4 ? m.toString(8).padStart(4, '0') : m.toString(8).padStart(3, '0')
}

/** Parses 1–4 octal digits ("755", "0644", "4755"). Returns null when invalid. */
export function parseOctal(s: string): number | null {
  const t = s.trim().replace(/^0o/i, '')
  if (!/^[0-7]{1,4}$/.test(t)) return null
  return parseInt(t, 8)
}

/** The 9-character ls -l permission string (with s/S/t/T). */
export function toSymbolic(mode: number): string {
  let out = ''
  for (const w of WHO) {
    const b = (mode >> SHIFT[w]) & 7
    out += b & 4 ? 'r' : '-'
    out += b & 2 ? 'w' : '-'
    const x = (b & 1) !== 0
    const special = w === 'u' ? mode & SUID : w === 'g' ? mode & SGID : mode & STICKY
    const ch = w === 'o' ? 't' : 's'
    out += special ? (x ? ch : ch.toUpperCase()) : x ? 'x' : '-'
  }
  return out
}

/** Parses "rwxr-xr-x" (optionally with a leading type char like "d" or "-"). */
export function parseSymbolic(s: string): number | null {
  let t = s.trim()
  if (t.length === 10) t = t.slice(1)
  if (!/^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/.test(t)) return null
  let m = 0
  WHO.forEach((w, i) => {
    const c = t.slice(i * 3, i * 3 + 3)
    let b = 0
    if (c[0] === 'r') b |= 4
    if (c[1] === 'w') b |= 2
    if ('xst'.includes(c[2])) b |= 1
    if ('sStT'.includes(c[2])) m |= w === 'u' ? SUID : w === 'g' ? SGID : STICKY
    m |= b << SHIFT[w]
  })
  return m
}

/** Symbolic command form, e.g. "u=rwx,g=rx,o=rx" or "u=rwxs,g=rx,o=t". */
export function toChmodSymbolic(mode: number): string {
  return WHO.map((w) => {
    const b = (mode >> SHIFT[w]) & 7
    let p = (b & 4 ? 'r' : '') + (b & 2 ? 'w' : '') + (b & 1 ? 'x' : '')
    if (w === 'u' && mode & SUID) p += 's'
    if (w === 'g' && mode & SGID) p += 's'
    if (w === 'o' && mode & STICKY) p += 't'
    return `${w}=${p}`
  }).join(',')
}

/**
 * Applies a chmod symbolic expression ("u+x,go-w", "a=r", "+t", "g=u") to `mode`.
 * Empty "who" means "a" (umask is ignored, as with explicit modes). Throws on syntax errors.
 */
export function applyExpr(mode: number, expr: string, isDir = false): number {
  let m = mode & 0o7777
  for (const clause of expr.split(',').map((c) => c.trim()).filter(Boolean)) {
    const head = /^([ugoa]*)/.exec(clause)![1]
    let rest = clause.slice(head.length)
    if (!rest || !'+-='.includes(rest[0])) throw new Error(`"${clause}": expected +, - or = after who`)
    const who: Who[] = !head || head.includes('a') ? [...WHO] : WHO.filter((w) => head.includes(w))
    while (rest.length) {
      const op = rest[0]
      if (!'+-='.includes(op)) throw new Error(`"${clause}": unexpected "${op}"`)
      const pm = /^[+=-]([ugo](?![rwxXst])|[rwxXst]*)/.exec(rest)
      if (!pm) throw new Error(`"${clause}": bad permission list`)
      const perms = pm[1]
      rest = rest.slice(pm[0].length)
      const orig = m
      for (const w of who) {
        let bits = 0
        let special = 0
        if (perms.length === 1 && 'ugo'.includes(perms)) {
          bits = (orig >> SHIFT[perms as Who]) & 7
        } else {
          if (perms.includes('r')) bits |= 4
          if (perms.includes('w')) bits |= 2
          if (perms.includes('x')) bits |= 1
          // X: execute only for directories or when someone already has execute
          if (perms.includes('X') && (isDir || (orig & 0o111) !== 0)) bits |= 1
          if (perms.includes('s')) special |= w === 'u' ? SUID : w === 'g' ? SGID : 0
          if (perms.includes('t') && w === 'o') special |= STICKY
        }
        const mask = 7 << SHIFT[w]
        const smask = w === 'u' ? SUID : w === 'g' ? SGID : STICKY
        if (op === '+') m |= (bits << SHIFT[w]) | special
        else if (op === '-') m &= ~((bits << SHIFT[w]) | special)
        else {
          m = (m & ~mask) | (bits << SHIFT[w])
          // like GNU chmod: '=' clears special bits on files, keeps them on directories unless named
          if (!isDir) m &= ~smask
          m |= special
        }
      }
    }
  }
  return m & 0o7777
}

/** Default permissions for new files and directories under a umask. */
export function umaskDefaults(umask: number): { file: number; dir: number } {
  return { file: 0o666 & ~umask, dir: 0o777 & ~umask }
}

/** Plain-English summary. */
export function describe(mode: number): string[] {
  const names: Record<Who, string> = { u: 'Owner', g: 'Group', o: 'Others' }
  const lines = WHO.map((w) => {
    const b = (mode >> SHIFT[w]) & 7
    const can = [b & 4 && 'read', b & 2 && 'write', b & 1 && 'execute'].filter(Boolean) as string[]
    return `${names[w]} can ${can.length ? can.join(', ').replace(/, ([^,]*)$/, ' and $1') : 'do nothing'}.`
  })
  if (mode & SUID) lines.push('setuid: executables run with the file owner’s privileges.')
  if (mode & SGID) lines.push('setgid: executables run with the group’s privileges; in directories, new files inherit the group.')
  if (mode & STICKY) lines.push('sticky: in a directory, only a file’s owner can delete or rename it (like /tmp).')
  if (mode & 0o002) lines.push('⚠ World-writable: anyone on the system can modify this.')
  return lines
}
