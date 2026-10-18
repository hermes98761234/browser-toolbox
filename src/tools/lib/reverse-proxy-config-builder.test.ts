import { describe, expect, it } from 'vitest'
import { apache, caddy, DEFAULTS, haproxy, highlightLine, nginx, traefik, warnings } from './reverse-proxy-config-builder'

describe('reverse proxy config builder', () => {
  it('nginx: upstream, TLS, websockets, rate limit', () => {
    const c = nginx(DEFAULTS)
    expect(c).toContain('upstream app_example_com_backend {')
    expect(c).toContain('least_conn;')
    expect(c).toContain('server 127.0.0.1:3001 max_fails=3')
    expect(c).toContain('listen 443 ssl;')
    expect(c).toContain('http2 on;')
    expect(c).toContain('proxy_set_header Upgrade $http_upgrade;')
    expect(c).toContain('limit_req zone=app_example_com_rl burst=20 nodelay;')
    expect(c).toContain('return 301 https://$host$request_uri;')
    // balanced braces
    expect((c.match(/{/g) ?? []).length).toBe((c.match(/}/g) ?? []).length)
  })
  it('nginx: strip prefix uses trailing slash, regex location uses rewrite', () => {
    const c = nginx({ ...DEFAULTS, path: '/api', stripPath: true })
    expect(c).toContain('location /api/ {')
    expect(c).toContain('proxy_pass http://app_example_com_backend/;')
    expect(c).toContain('rewrite ^/api/(.*)$ /$1 break;')
  })
  it('no TLS: plain listener and no HSTS', () => {
    const o = { ...DEFAULTS, tls: 'none' as const }
    expect(nginx(o)).not.toContain('Strict-Transport-Security')
    expect(caddy(o)).toContain('http://app.example.com')
  })
  it('other servers carry the essentials', () => {
    expect(caddy(DEFAULTS)).toContain('reverse_proxy 127.0.0.1:3000 127.0.0.1:3001')
    expect(caddy(DEFAULTS)).toContain('lb_policy least_conn')
    expect(apache(DEFAULTS)).toContain('BalancerMember http://127.0.0.1:3000')
    expect(apache(DEFAULTS)).toContain('lbmethod=bybusyness')
    expect(traefik(DEFAULTS)).toContain('rule: "Host(`app.example.com`) || Host(`www.app.example.com`)"')
    expect(traefik(DEFAULTS)).toContain('average: 10')
    expect(haproxy(DEFAULTS)).toContain('balance leastconn')
    expect(haproxy(DEFAULTS)).toContain('timeout tunnel 1h')
  })
  it('warnings flag risky combos', () => {
    const w = warnings({ ...DEFAULTS, tls: 'none', http3: true, hsts: true }, 'nginx').map((x) => x.text)
    expect(w.some((t) => t.includes('HTTP/3'))).toBe(true)
    expect(w.some((t) => t.includes('HSTS'))).toBe(true)
    expect(warnings({ ...DEFAULTS, hstsPreload: true, hstsMaxAge: 3600 }, 'nginx').some((x) => x.level === 'err')).toBe(true)
    expect(warnings({ ...DEFAULTS, http3: true }, 'apache').some((x) => x.level === 'err')).toBe(true)
    expect(warnings(DEFAULTS, 'nginx').filter((x) => x.level === 'err')).toEqual([])
  })
  it('highlights directives, comments, strings and variables', () => {
    const t = highlightLine('    proxy_set_header Host $host; # c')
    expect(t.find((x) => x[0] === 'kw')?.[1]).toBe('proxy_set_header')
    expect(t.find((x) => x[0] === 'var')?.[1]).toBe('$host')
    expect(t.find((x) => x[0] === 'com')?.[1]).toBe('# c')
    expect(highlightLine('add_header X "a b";').some((x) => x[0] === 'str' && x[1] === '"a b"')).toBe(true)
  })
})
