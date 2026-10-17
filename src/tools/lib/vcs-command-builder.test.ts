import { describe, expect, it } from 'vitest'
import { build, defaults, INTENTS, render, search, shq } from './vcs-command-builder'

const get = (id: string) => INTENTS.find((i) => i.id === id)!

describe('vcs command builder', () => {
  it('quotes shell values only when needed', () => {
    expect(shq('feature/login')).toBe('feature/login')
    expect(shq('HEAD@{1}')).toBe('HEAD@{1}')
    expect(shq('Fix the bug')).toBe("'Fix the bug'")
    expect(shq("it's")).toBe("'it'\\''s'")
    expect(shq('*.psd')).toBe("'*.psd'")
    expect(shq('')).toBe("''")
  })
  it('renders flags and optional params', () => {
    const it0 = get('init')
    expect(render(it0.c[0], { dir: '' }, { main: true, bare: false }, it0)).toBe('git init -b main')
    expect(render(it0.c[0], { dir: 'my app' }, { main: false, bare: true }, it0)).toBe("git init --bare 'my app'")
  })
  it('builds default commands for every intent without leftovers', () => {
    for (const i of INTENTS) {
      const d = defaults(i)
      for (const line of build(i, d.vals, d.flags)) {
        expect(line).not.toMatch(/\[\w+\]/)
        expect(line.replace(/@\{\d+\}/g, "")).not.toMatch(/\{\w+\??\}/)
      }
    }
  })
  it('handles intent-specific variants', () => {
    const c = get('commit')
    expect(build(c, { msg: 'Fix login' }, { all: true })).toEqual(["git commit -a -m 'Fix login'"])
    expect(build(get('amend'), { msg: '' }, { noedit: true })).toEqual(['git commit --amend --no-edit'])
    expect(build(get('delbranch'), { name: 'x' }, { force: true })).toEqual(['git branch -D x'])
    expect(build(get('clone'), { url: 'u', dir: '', br: 'dev' }, { branch: true, shallow: true })).toEqual(['git clone --depth 1 --branch dev u'])
    expect(build(get('undocommit'), { n: '2' }, {})).toEqual(['git reset --soft HEAD~2'])
  })
  it('finds intents from plain language', () => {
    expect(search('undo last commit')[0].id).toBe('undocommit')
    expect(search('rename branch')[0].id).toBe('rename')
    expect(search('zzzz')).toHaveLength(0)
  })
})
