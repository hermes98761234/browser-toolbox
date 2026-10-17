import { describe as d, expect, it } from 'vitest'
import { applyExpr, parseOctal, parseSymbolic, toChmodSymbolic, toOctal, toSymbolic, umaskDefaults } from './chmod-calculator'

d('chmod', () => {
  it('octal round trip', () => {
    expect(parseOctal('755')).toBe(0o755)
    expect(parseOctal('4755')).toBe(0o4755)
    expect(parseOctal('9')).toBeNull()
    expect(toOctal(0o644)).toBe('644')
    expect(toOctal(0o1777)).toBe('1777')
  })
  it('symbolic strings', () => {
    expect(toSymbolic(0o755)).toBe('rwxr-xr-x')
    expect(toSymbolic(0o4755)).toBe('rwsr-xr-x')
    expect(toSymbolic(0o1777)).toBe('rwxrwxrwt')
    expect(toSymbolic(0o2644)).toBe('rw-r-Sr--')
    expect(parseSymbolic('drwxrwxrwt')).toBe(0o1777)
    expect(parseSymbolic('rw-r-Sr--')).toBe(0o2644)
    expect(parseSymbolic('rwxq')).toBeNull()
    expect(toChmodSymbolic(0o4750)).toBe('u=rwxs,g=rx,o=')
  })
  it('applies expressions', () => {
    expect(applyExpr(0o644, 'u+x')).toBe(0o744)
    expect(applyExpr(0o777, 'go-w')).toBe(0o755)
    expect(applyExpr(0o000, 'a=r,u+w')).toBe(0o644)
    expect(applyExpr(0o640, 'o=g')).toBe(0o644)
    expect(applyExpr(0o755, '+t')).toBe(0o1755)
    expect(applyExpr(0o755, 'u+s,g+s')).toBe(0o6755)
    expect(applyExpr(0o644, 'a+X')).toBe(0o644)
    expect(applyExpr(0o644, 'a+X', true)).toBe(0o755)
    expect(applyExpr(0o744, 'a+X')).toBe(0o755)
    expect(() => applyExpr(0o644, 'u*x')).toThrow()
  })
  it('umask', () => {
    expect(umaskDefaults(0o022)).toEqual({ file: 0o644, dir: 0o755 })
    expect(umaskDefaults(0o077)).toEqual({ file: 0o600, dir: 0o700 })
  })
})
