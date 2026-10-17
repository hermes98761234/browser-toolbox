import { describe, expect, it } from 'vitest'
import { lint, score, tokenize } from './container-file-linter'

const ids = (t: string) => lint(t).map((i) => i.rule)

describe('container-file-linter', () => {
  it('joins continuations and tracks stages', () => {
    const t = tokenize('# c\nFROM node:20 AS build\nRUN a \\\n  && b\n\nfrom alpine:3.20\n')
    expect(t.map((i) => [i.cmd, i.line, i.end, i.stage])).toEqual([['FROM', 2, 2, 0], ['RUN', 3, 4, 0], ['FROM', 6, 6, 1]])
    expect(t[1].args).toBe('a && b')
    expect(t[2].rawCmd).toBe('from')
  })
  it('flags unpinned and latest base images', () => {
    expect(ids('FROM ubuntu\nUSER app')).toContain('from-latest')
    expect(ids('FROM ubuntu:latest\nUSER app')).toContain('from-latest')
    expect(ids('FROM registry.io:5000/team/img\nUSER app')).toContain('from-latest')
    expect(ids('FROM ubuntu:24.04\nUSER app')).not.toContain('from-latest')
    expect(ids('FROM ubuntu@sha256:abc\nUSER app')).not.toContain('from-digest')
  })
  it('apt rules', () => {
    const r = ids('FROM debian:12\nRUN apt-get update\nRUN apt-get install curl\nUSER 1000')
    expect(r).toEqual(expect.arrayContaining(['apt-update-alone', 'apt-yes', 'apt-recommends', 'apt-lists']))
    const ok = ids('FROM debian:12\nRUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*\nUSER 1000')
    expect(ok.filter((x) => x.startsWith('apt'))).toEqual([])
  })
  it('root user and caching', () => {
    expect(ids('FROM node:20\nCOPY . .\nRUN npm ci')).toEqual(expect.arrayContaining(['root-user', 'copy-all-early']))
    expect(ids('FROM node:20\nUSER root')).toContain('root-user')
    expect(ids('FROM node:20\nCOPY package.json .\nRUN npm ci\nCOPY . .\nUSER node')).not.toContain('copy-all-early')
  })
  it('stages, cmd form and misc', () => {
    const r = ids('FROM a:1 AS b\nFROM c:1\nCOPY --from=x /a /b\nCMD node s.js\nCMD ["x"]\nEXPOSE 70000\nENV DB_PASSWORD=hunter2\nWORKDIR app\nfoo bar')
    expect(r).toEqual(expect.arrayContaining(['copy-from', 'cmd-shell', 'multi-cmd', 'expose', 'secret', 'workdir-rel', 'unknown']))
    expect(ids('FROM a:1 AS b\nFROM c:1\nCOPY --from=b /a /b\nUSER x')).not.toContain('copy-from')
  })
  it('disabled rules and score', () => {
    expect(lint('FROM ubuntu', ['from-latest', 'root-user', 'healthcheck'])).toEqual([])
    expect(score([])).toBe(100)
    expect(score(lint('FROM ubuntu'))).toBe(100 - 6 - 6 - 2)
  })
})
