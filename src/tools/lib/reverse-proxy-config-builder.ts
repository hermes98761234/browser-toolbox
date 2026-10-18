// Reverse proxy config generator: one option set → nginx, Caddy, Apache, Traefik (dynamic YAML), HAProxy.

export type Server = 'nginx' | 'caddy' | 'apache' | 'traefik' | 'haproxy'
export type Tls = 'none' | 'acme' | 'custom'
export type Lb = 'round_robin' | 'least_conn' | 'ip_hash'
export type Cache = 'off' | 'static' | 'all'

export interface Upstream { host: string; port: number; weight: number }

export interface ProxyOpts {
  domain: string
  aliases: string
  upstreams: Upstream[]
  upstreamTls: boolean
  lb: Lb
  path: string
  stripPath: boolean
  tls: Tls
  email: string
  certFile: string
  keyFile: string
  redirectHttp: boolean
  tlsMin: '1.2' | '1.3'
  http2: boolean
  http3: boolean
  websockets: boolean
  gzip: boolean
  brotli: boolean
  cache: Cache
  cacheMinutes: number
  rateLimit: boolean
  rps: number
  burst: number
  hsts: boolean
  hstsMaxAge: number
  hstsPreload: boolean
  secHeaders: boolean
  csp: string
  maxBodyMb: number
  connectTimeout: number
  readTimeout: number
  healthPath: string
}

export const DEFAULTS: ProxyOpts = {
  domain: 'app.example.com',
  aliases: 'www.app.example.com',
  upstreams: [
    { host: '127.0.0.1', port: 3000, weight: 1 },
    { host: '127.0.0.1', port: 3001, weight: 1 },
  ],
  upstreamTls: false,
  lb: 'least_conn',
  path: '/',
  stripPath: false,
  tls: 'acme',
  email: 'admin@example.com',
  certFile: '/etc/ssl/certs/app.example.com.pem',
  keyFile: '/etc/ssl/private/app.example.com.key',
  redirectHttp: true,
  tlsMin: '1.2',
  http2: true,
  http3: false,
  websockets: true,
  gzip: true,
  brotli: false,
  cache: 'static',
  cacheMinutes: 60,
  rateLimit: true,
  rps: 10,
  burst: 20,
  hsts: true,
  hstsMaxAge: 31536000,
  hstsPreload: false,
  secHeaders: true,
  csp: "default-src 'self'",
  maxBodyMb: 25,
  connectTimeout: 5,
  readTimeout: 60,
  healthPath: '/healthz',
}

export interface Warning { level: 'err' | 'warn' | 'info'; text: string }

const id = (d: string) => d.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'app'
const names = (o: ProxyOpts) => [o.domain, ...o.aliases.split(/[\s,]+/)].map((s) => s.trim()).filter(Boolean)
const normPath = (p: string) => {
  let x = p.trim() || '/'
  if (!x.startsWith('/')) x = '/' + x
  return x
}
const prefix = (o: ProxyOpts) => normPath(o.path).replace(/\/+$/, '')
const hstsValue = (o: ProxyOpts) => `max-age=${o.hstsMaxAge}; includeSubDomains${o.hstsPreload ? '; preload' : ''}`
const ups = (o: ProxyOpts) => (o.upstreams.length ? o.upstreams : DEFAULTS.upstreams.slice(0, 1))

export function securityHeaders(o: ProxyOpts): [string, string][] {
  const h: [string, string][] = []
  if (o.hsts && o.tls !== 'none') h.push(['Strict-Transport-Security', hstsValue(o)])
  if (o.secHeaders) {
    h.push(['X-Content-Type-Options', 'nosniff'], ['X-Frame-Options', 'SAMEORIGIN'], ['Referrer-Policy', 'strict-origin-when-cross-origin'],
      ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'])
    if (o.csp.trim()) h.push(['Content-Security-Policy', o.csp.trim()])
  }
  return h
}

const STATIC_EXT = 'css|js|mjs|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf'

// ---------------- nginx ----------------
export function nginx(o: ProxyOpts): string {
  const n = id(o.domain)
  const tls = o.tls !== 'none'
  const L: string[] = []
  const sch = o.upstreamTls ? 'https' : 'http'
  L.push(`# ${o.domain} — reverse proxy (nginx ≥ 1.25)`)
  L.push(`upstream ${n}_backend {`)
  if (o.lb !== 'round_robin') L.push(`    ${o.lb};`)
  for (const u of ups(o)) L.push(`    server ${u.host}:${u.port}${u.weight !== 1 ? ` weight=${u.weight}` : ''} max_fails=3 fail_timeout=10s;`)
  L.push('    keepalive 32;', '}', '')
  if (o.rateLimit) L.push(`limit_req_zone $binary_remote_addr zone=${n}_rl:10m rate=${o.rps}r/s;`, '')
  if (o.cache !== 'off') L.push(`proxy_cache_path /var/cache/nginx/${n} levels=1:2 keys_zone=${n}_cache:10m max_size=1g inactive=${o.cacheMinutes * 2}m use_temp_path=off;`, '')
  if (o.websockets) L.push('map $http_upgrade $connection_upgrade {', '    default upgrade;', "    ''      close;", '}', '')
  if (tls && o.redirectHttp) {
    L.push('server {', '    listen 80;', '    listen [::]:80;', `    server_name ${names(o).join(' ')};`)
    if (o.tls === 'acme') L.push('    location /.well-known/acme-challenge/ { root /var/www/certbot; }')
    L.push('    location / { return 301 https://$host$request_uri; }', '}', '')
  }
  L.push('server {')
  if (tls) {
    L.push('    listen 443 ssl;', '    listen [::]:443 ssl;')
    if (o.http2) L.push('    http2 on;')
    if (o.http3) L.push('    listen 443 quic reuseport;', '    listen [::]:443 quic reuseport;', '    http3 on;')
  } else L.push('    listen 80;', '    listen [::]:80;')
  L.push(`    server_name ${names(o).join(' ')};`, '')
  if (tls) {
    const cert = o.tls === 'acme' ? `/etc/letsencrypt/live/${o.domain}/fullchain.pem` : o.certFile
    const key = o.tls === 'acme' ? `/etc/letsencrypt/live/${o.domain}/privkey.pem` : o.keyFile
    L.push(`    ssl_certificate     ${cert};`, `    ssl_certificate_key ${key};`, `    ssl_protocols ${o.tlsMin === '1.3' ? 'TLSv1.3' : 'TLSv1.2 TLSv1.3'};`,
      '    ssl_prefer_server_ciphers off;', '    ssl_session_cache shared:SSL:10m;', '    ssl_session_timeout 1d;', '')
  }
  L.push(`    client_max_body_size ${o.maxBodyMb}m;`)
  if (o.gzip) L.push('    gzip on;', '    gzip_vary on;', '    gzip_min_length 1024;', '    gzip_proxied any;', '    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;')
  if (o.brotli) L.push('    brotli on;            # needs the ngx_brotli module', '    brotli_comp_level 5;', '    brotli_types text/plain text/css application/json application/javascript image/svg+xml;')
  const hs = securityHeaders(o)
  if (hs.length) L.push('')
  for (const [k, v] of hs) L.push(`    add_header ${k} "${v}" always;`)
  if (o.http3 && tls) L.push('    add_header Alt-Svc \'h3=":443"; ma=86400\' always;')
  const pre = prefix(o)
  const target = `${sch}://${n}_backend${o.stripPath && pre ? '/' : ''}`
  const common = (ind: string, regex = false) => {
    const c: string[] = []
    // A regex location cannot carry a URI in proxy_pass, so prefix stripping uses rewrite there.
    if (regex && o.stripPath && pre) c.push(`${ind}rewrite ^${pre}/(.*)$ /$1 break;`)
    c.push(`${ind}proxy_pass ${regex ? `${sch}://${n}_backend` : target};`, `${ind}proxy_http_version 1.1;`, `${ind}proxy_set_header Host $host;`, `${ind}proxy_set_header X-Real-IP $remote_addr;`,
      `${ind}proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`, `${ind}proxy_set_header X-Forwarded-Proto $scheme;`)
    if (o.websockets) c.push(`${ind}proxy_set_header Upgrade $http_upgrade;`, `${ind}proxy_set_header Connection $connection_upgrade;`)
    else c.push(`${ind}proxy_set_header Connection "";`)
    if (o.upstreamTls) c.push(`${ind}proxy_ssl_server_name on;`)
    c.push(`${ind}proxy_connect_timeout ${o.connectTimeout}s;`, `${ind}proxy_read_timeout ${o.readTimeout}s;`, `${ind}proxy_send_timeout ${o.readTimeout}s;`)
    if (o.rateLimit) c.push(`${ind}limit_req zone=${n}_rl burst=${o.burst} nodelay;`, `${ind}limit_req_status 429;`)
    return c
  }
  if (o.cache === 'static') {
    L.push('', `    location ~* ^${pre}/.*\\.(${STATIC_EXT})$ {`, ...common('        ', true), `        proxy_cache ${n}_cache;`, `        proxy_cache_valid 200 301 ${o.cacheMinutes}m;`,
      '        proxy_cache_use_stale error timeout updating http_502 http_503;', '        add_header X-Cache-Status $upstream_cache_status always;', '    }')
  }
  L.push('', `    location ${pre}/ {`, ...common('        '))
  if (o.cache === 'all') L.push(`        proxy_cache ${n}_cache;`, `        proxy_cache_valid 200 ${o.cacheMinutes}m;`, '        proxy_cache_bypass $http_authorization $cookie_session;', '        proxy_no_cache $http_authorization $cookie_session;',
    '        proxy_cache_use_stale error timeout updating http_502 http_503;', '        add_header X-Cache-Status $upstream_cache_status always;')
  L.push('    }')
  if (o.healthPath.trim()) L.push('', `    location = ${normPath(o.healthPath)} {`, `        proxy_pass ${sch}://${n}_backend;`, '        access_log off;', '    }')
  L.push('}')
  return L.join('\n')
}

// ---------------- Caddy ----------------
export function caddy(o: ProxyOpts): string {
  const L: string[] = []
  const tls = o.tls !== 'none'
  const sch = o.upstreamTls ? 'https://' : ''
  L.push(`# ${o.domain} — Caddyfile (Caddy 2.7+)`)
  const protos = [o.http2 || !tls ? 'h1 h2' : 'h1', o.http3 && tls ? 'h3' : ''].join(' ').trim()
  const glob: string[] = []
  if (o.tls === 'acme' && o.email) glob.push(`    email ${o.email}`)
  if (o.rateLimit) glob.push('    order rate_limit before basicauth')
  glob.push('    servers {', `        protocols ${protos}`, '    }')
  L.push('{', ...glob, '}', '')
  const site = names(o).map((d) => (tls ? d : `http://${d}`)).join(', ')
  L.push(`${site} {`)
  if (o.tls === 'custom') L.push(`    tls ${o.certFile} ${o.keyFile} {`, `        protocols tls${o.tlsMin}`, '    }')
  else if (o.tls === 'acme' && o.tlsMin === '1.3') L.push('    tls {', '        protocols tls1.3', '    }')
  const enc = [o.brotli ? 'br' : '', o.gzip ? 'gzip' : ''].filter(Boolean)
  if (o.brotli) L.push('    # Brotli encoding needs a Caddy build with a br encoder plugin; plain Caddy ships zstd and gzip')
  if (enc.length) L.push(`    encode ${o.brotli ? 'zstd ' : ''}${enc.join(' ')}`)
  L.push(`    request_body {`, `        max_size ${o.maxBodyMb}MB`, '    }')
  const hs = securityHeaders(o)
  if (hs.length) {
    L.push('    header {')
    for (const [k, v] of hs) L.push(`        ${k} "${v}"`)
    L.push('        -Server', '    }')
  }
  if (o.rateLimit) L.push('    # needs the caddy-ratelimit plugin (github.com/mholt/caddy-ratelimit)', '    rate_limit {', '        zone per_ip {', '            key {remote_host}',
    `            events ${o.rps}`, '            window 1s', '        }', '    }')
  if (o.cache !== 'off') {
    L.push('    @static path_regexp static \\.(' + STATIC_EXT + ')$')
    L.push(`    header @static Cache-Control "public, max-age=${o.cacheMinutes * 60}"`)
    if (o.cache === 'all') L.push('    # Full response caching needs the cache-handler plugin (github.com/caddyserver/cache-handler)')
  }
  const pre = prefix(o)
  const block = pre ? (o.stripPath ? `handle_path ${pre}/*` : `handle ${pre}/*`) : 'handle'
  L.push(`    ${block} {`)
  L.push(`        reverse_proxy ${ups(o).map((u) => `${sch}${u.host}:${u.port}`).join(' ')} {`)
  const pol = o.lb === 'round_robin' ? (ups(o).some((u) => u.weight !== 1) ? `weighted_round_robin ${ups(o).map((u) => u.weight).join(' ')}` : 'round_robin') : o.lb === 'least_conn' ? 'least_conn' : 'ip_hash'
  if (ups(o).length > 1) L.push(`            lb_policy ${pol}`)
  if (o.healthPath.trim()) L.push(`            health_uri ${normPath(o.healthPath)}`, '            health_interval 10s')
  L.push('            transport http {', `                dial_timeout ${o.connectTimeout}s`, `                response_header_timeout ${o.readTimeout}s`)
  if (o.upstreamTls) L.push('                tls')
  L.push('            }')
  if (o.websockets) L.push('            # WebSockets are proxied automatically; keep upgraded connections across reloads', '            stream_close_delay 5m')
  L.push('        }', '    }', '}')
  return L.join('\n')
}

// ---------------- Apache ----------------
export function apache(o: ProxyOpts): string {
  const L: string[] = []
  const tls = o.tls !== 'none'
  const n = id(o.domain)
  const sch = o.upstreamTls ? 'https' : 'http'
  const pre = prefix(o)
  const [first, ...rest] = names(o)
  L.push(`# ${o.domain} — Apache httpd 2.4`, '# a2enmod proxy proxy_http proxy_balancer lbmethod_byrequests lbmethod_bybusyness headers rewrite ssl' +
    (o.websockets ? ' proxy_wstunnel' : '') + (o.cache !== 'off' ? ' cache cache_disk' : '') + (o.gzip ? ' deflate' : '') + (o.brotli ? ' brotli' : '') + (o.http2 ? ' http2' : ''), '')
  if (tls && o.redirectHttp) {
    L.push('<VirtualHost *:80>', `    ServerName ${first}`)
    if (rest.length) L.push(`    ServerAlias ${rest.join(' ')}`)
    L.push(`    Redirect permanent / https://${first}/`, '</VirtualHost>', '')
  }
  L.push(`<Proxy "balancer://${n}">`)
  for (const u of ups(o)) L.push(`    BalancerMember ${sch}://${u.host}:${u.port}${u.weight !== 1 ? ` loadfactor=${u.weight}` : ''} connectiontimeout=${o.connectTimeout}`)
  L.push(`    ProxySet lbmethod=${o.lb === 'least_conn' ? 'bybusyness' : 'byrequests'}${o.lb === 'ip_hash' ? ' stickysession=ROUTEID' : ''}`, '</Proxy>', '')
  L.push(`<VirtualHost *:${tls ? 443 : 80}>`, `    ServerName ${first}`)
  if (rest.length) L.push(`    ServerAlias ${rest.join(' ')}`)
  if (o.http2) L.push(`    Protocols ${tls ? 'h2' : 'h2c'} http/1.1`)
  if (o.http3) L.push('    # HTTP/3 is not available in Apache httpd; put a QUIC-capable proxy or CDN in front')
  if (tls) {
    const cert = o.tls === 'acme' ? `/etc/letsencrypt/live/${o.domain}/fullchain.pem` : o.certFile
    const key = o.tls === 'acme' ? `/etc/letsencrypt/live/${o.domain}/privkey.pem` : o.keyFile
    L.push('', '    SSLEngine on', `    SSLCertificateFile ${cert}`, `    SSLCertificateKeyFile ${key}`, `    SSLProtocol -all ${o.tlsMin === '1.3' ? '+TLSv1.3' : '+TLSv1.2 +TLSv1.3'}`)
    if (o.tls === 'acme') L.push('    # certificates issued by certbot --apache (or use mod_md: MDomain ' + o.domain + ')')
  }
  L.push('', `    LimitRequestBody ${o.maxBodyMb * 1024 * 1024}`, '    ProxyPreserveHost On', '    ProxyRequests Off', `    ProxyTimeout ${o.readTimeout}`, `    RequestHeader set X-Forwarded-Proto "${tls ? 'https' : 'http'}"`)
  if (o.upstreamTls) L.push('    SSLProxyEngine on')
  const hs = securityHeaders(o)
  if (hs.length) L.push('')
  for (const [k, v] of hs) L.push(`    Header always set ${k} "${v}"`)
  if (o.gzip || o.brotli) {
    L.push('')
    if (o.brotli) L.push('    AddOutputFilterByType BROTLI_COMPRESS text/html text/plain text/css application/json application/javascript image/svg+xml')
    if (o.gzip) L.push('    AddOutputFilterByType DEFLATE text/html text/plain text/css application/json application/javascript image/svg+xml')
  }
  if (o.cache !== 'off') {
    L.push('', '    CacheQuickHandler off', '    CacheRoot /var/cache/apache2/mod_cache_disk', `    CacheDefaultExpire ${o.cacheMinutes * 60}`, '    CacheIgnoreHeaders Set-Cookie')
    if (o.cache === 'static') L.push(`    <LocationMatch "\\.(${STATIC_EXT})$">`, '        CacheEnable disk', '    </LocationMatch>')
    else L.push(`    CacheEnable disk ${pre || '/'}`)
  }
  if (o.rateLimit) L.push('', `    # Apache has no built-in per-client request rate limit (mod_ratelimit limits bandwidth).`, `    # Use mod_evasive or mod_qos, e.g. QS_SrvMaxConnPerIP ${o.burst}`)
  if (o.healthPath.trim()) L.push('', `    ProxyPass ${normPath(o.healthPath)} balancer://${n}${normPath(o.healthPath)}`)
  const from = pre ? pre + '/' : '/'
  const to = `balancer://${n}${o.stripPath ? '/' : from}`
  if (o.websockets) L.push('', '    RewriteEngine On', '    RewriteCond %{HTTP:Upgrade} =websocket [NC]', `    RewriteRule ^${from}(.*) ${o.upstreamTls ? 'wss' : 'ws'}://${ups(o)[0].host}:${ups(o)[0].port}${o.stripPath ? '/' : from}$1 [P,L]`)
  L.push('', `    ProxyPass ${from} ${to}`, `    ProxyPassReverse ${from} ${to}`, '</VirtualHost>')
  return L.join('\n')
}

// ---------------- Traefik (file provider) ----------------
export function traefik(o: ProxyOpts): string {
  const n = id(o.domain)
  const tls = o.tls !== 'none'
  const pre = prefix(o)
  const L: string[] = []
  const mws: string[] = []
  L.push(`# ${o.domain} — Traefik v3 dynamic configuration (file provider)`)
  if (o.http3) L.push('# HTTP/3: enable on the entrypoint in the STATIC config: entryPoints.websecure.http3: {}')
  L.push('# Static config needs entryPoints "web" (:80) and "websecure" (:443)' + (o.tls === 'acme' ? ' and certificatesResolvers.le.acme (email ' + o.email + ')' : ''))
  L.push('http:', '  routers:')
  const rule = `${names(o).map((d) => `Host(\`${d}\`)`).join(' || ')}${pre ? ` && PathPrefix(\`${pre}\`)` : ''}`
  if (o.rateLimit) mws.push(`${n}-ratelimit`)
  if (o.gzip || o.brotli) mws.push(`${n}-compress`)
  if (securityHeaders(o).length) mws.push(`${n}-headers`)
  if (pre && o.stripPath) mws.push(`${n}-strip`)
  mws.push(`${n}-body`)
  L.push(`    ${n}:`, `      rule: "${rule}"`, `      entryPoints: [${tls ? 'websecure' : 'web'}]`, `      service: ${n}`)
  if (mws.length) L.push(`      middlewares: [${mws.join(', ')}]`)
  if (tls) {
    L.push('      tls:')
    if (o.tls === 'acme') L.push('        certResolver: le')
    else L.push(`        options: ${n}-tls`)
  }
  if (tls && o.redirectHttp) L.push(`    ${n}-http:`, `      rule: "${rule}"`, '      entryPoints: [web]', `      middlewares: [${n}-https]`, `      service: ${n}`)
  L.push('', '  middlewares:')
  if (tls && o.redirectHttp) L.push(`    ${n}-https:`, '      redirectScheme:', '        scheme: https', '        permanent: true')
  if (o.rateLimit) L.push(`    ${n}-ratelimit:`, '      rateLimit:', `        average: ${o.rps}`, '        period: 1s', `        burst: ${o.burst}`)
  if (o.gzip || o.brotli) L.push(`    ${n}-compress:`, '      compress:', `        encodings: [${[o.brotli ? 'br' : '', o.gzip ? 'gzip' : ''].filter(Boolean).join(', ')}]`, '        minResponseBodyBytes: 1024')
  const hs = securityHeaders(o)
  if (hs.length) {
    L.push(`    ${n}-headers:`, '      headers:')
    if (o.hsts && tls) L.push(`        stsSeconds: ${o.hstsMaxAge}`, '        stsIncludeSubdomains: true', `        stsPreload: ${o.hstsPreload}`)
    if (o.secHeaders) {
      L.push('        contentTypeNosniff: true', '        customFrameOptionsValue: SAMEORIGIN', '        referrerPolicy: strict-origin-when-cross-origin', '        permissionsPolicy: "camera=(), microphone=(), geolocation=()"')
      if (o.csp.trim()) L.push(`        contentSecurityPolicy: "${o.csp.trim()}"`)
    }
  }
  if (pre && o.stripPath) L.push(`    ${n}-strip:`, '      stripPrefix:', `        prefixes: ["${pre}"]`)
  L.push(`    ${n}-body:`, '      buffering:', `        maxRequestBodyBytes: ${o.maxBodyMb * 1024 * 1024}`)
  L.push('', '  services:', `    ${n}:`, '      loadBalancer:')
  if (o.lb === 'ip_hash') L.push('        sticky:', '          cookie:', `            name: ${n}_sticky`, '            secure: true', '            httpOnly: true')
  if (o.lb === 'least_conn') L.push('        # Traefik balances with weighted round robin; least-connections is not available')
  L.push('        servers:')
  for (const u of ups(o)) {
    L.push(`          - url: "${o.upstreamTls ? 'https' : 'http'}://${u.host}:${u.port}"`)
    if (u.weight !== 1) L.push(`            weight: ${u.weight}`)
  }
  L.push('        passHostHeader: true')
  if (o.healthPath.trim()) L.push('        healthCheck:', `          path: ${normPath(o.healthPath)}`, '          interval: 10s', `          timeout: ${o.connectTimeout}s`)
  L.push(`        serversTransport: ${n}-transport`)
  L.push(`  serversTransports:`, `    ${n}-transport:`, '      forwardingTimeouts:', `        dialTimeout: ${o.connectTimeout}s`, `        responseHeaderTimeout: ${o.readTimeout}s`)
  if (o.cache !== 'off') L.push('# Traefik has no built-in response cache; put Souin/Varnish in front or cache in the app')
  if (tls) {
    L.push('', 'tls:')
    if (o.tls === 'custom') L.push('  certificates:', `    - certFile: ${o.certFile}`, `      keyFile: ${o.keyFile}`)
    L.push('  options:', `    ${n}-tls:`, `      minVersion: VersionTLS${o.tlsMin.replace('.', '')}`, `      alpnProtocols: [${o.http2 ? 'h2, ' : ''}http/1.1]`)
  }
  return L.join('\n')
}

// ---------------- HAProxy ----------------
export function haproxy(o: ProxyOpts): string {
  const n = id(o.domain)
  const tls = o.tls !== 'none'
  const pre = prefix(o)
  const pem = o.tls === 'acme' ? `/etc/haproxy/certs/${o.domain}.pem` : o.certFile
  const L: string[] = []
  L.push(`# ${o.domain} — HAProxy 2.8+`, 'global', '    log stdout format raw local0', '    maxconn 4096')
  if (tls) L.push(`    ssl-default-bind-options ssl-min-ver TLSv${o.tlsMin} no-tls-tickets`)
  L.push('', 'defaults', '    mode http', '    log global', '    option httplog', '    option forwardfor', `    timeout connect ${o.connectTimeout}s`, '    timeout client 30s',
    `    timeout server ${o.readTimeout}s`)
  if (o.websockets) L.push('    timeout tunnel 1h          # keeps WebSocket connections open')
  if (o.cache !== 'off') L.push('', `cache ${n}_cache`, '    total-max-size 256        # MB', '    max-object-size 1048576', `    max-age ${o.cacheMinutes * 60}`)
  L.push('', `frontend ${n}_front`)
  if (tls) {
    L.push(`    bind :443 ssl crt ${pem} alpn ${o.http2 ? 'h2,' : ''}http/1.1`)
    if (o.http3) L.push(`    bind quic4@:443 ssl crt ${pem} alpn h3`, '    http-response set-header alt-svc "h3=\\":443\\"; ma=86400"')
    L.push('    bind :80')
    if (o.redirectHttp) L.push('    http-request redirect scheme https code 301 unless { ssl_fc }')
    if (o.tls === 'acme') L.push('    # PEM = fullchain + key; issue with certbot or acme.sh --deploy-hook haproxy')
  } else L.push('    bind :80')
  L.push(`    acl host_ok hdr(host),field(1,:) -i ${names(o).join(' ')}`, '    http-request deny deny_status 421 unless host_ok')
  L.push(`    http-request deny deny_status 413 if { req.body_size gt ${o.maxBodyMb * 1024 * 1024} }`)
  if (o.rateLimit) L.push(`    stick-table type ip size 100k expire 30s store http_req_rate(1s)`, '    http-request track-sc0 src', `    http-request deny deny_status 429 if { sc_http_req_rate(0) gt ${o.rps + o.burst} }`)
  for (const [k, v] of securityHeaders(o)) L.push(`    http-response set-header ${k} "${v.replace(/"/g, '\\"')}"`)
  if (o.gzip) L.push('    filter compression', '    compression algo gzip', '    compression type text/html text/plain text/css application/json application/javascript image/svg+xml')
  if (o.brotli) L.push('    # HAProxy has no Brotli encoder (gzip/deflate only)')
  L.push(`    default_backend ${n}_back`, '', `backend ${n}_back`)
  L.push(`    balance ${o.lb === 'round_robin' ? 'roundrobin' : o.lb === 'least_conn' ? 'leastconn' : 'source'}`)
  if (pre && o.stripPath) L.push(`    http-request replace-path ^${pre}/?(.*) /\\1`)
  L.push(`    http-request set-header X-Forwarded-Proto ${tls ? 'https if { ssl_fc }' : 'http'}`)
  if (o.cache !== 'off') {
    const cond = o.cache === 'static' ? ` if { path_reg \\.(${STATIC_EXT})$ }` : ''
    L.push(`    http-request cache-use ${n}_cache${cond}`, `    http-response cache-store ${n}_cache`)
  }
  if (o.healthPath.trim()) L.push(`    option httpchk GET ${normPath(o.healthPath)}`, '    http-check expect status 200')
  ups(o).forEach((u, i) => L.push(`    server s${i + 1} ${u.host}:${u.port}${o.healthPath.trim() ? ' check' : ''}${u.weight !== 1 ? ` weight ${u.weight}` : ''}${o.upstreamTls ? ' ssl verify required ca-file /etc/ssl/certs/ca-certificates.crt' : ''}`))
  return L.join('\n')
}

export const GEN: Record<Server, (o: ProxyOpts) => string> = { nginx, caddy, apache, traefik, haproxy }
export const FILE: Record<Server, string> = { nginx: 'nginx.conf', caddy: 'Caddyfile', apache: 'apache-vhost.conf', traefik: 'traefik-dynamic.yml', haproxy: 'haproxy.cfg' }

export function warnings(o: ProxyOpts, s: Server): Warning[] {
  const w: Warning[] = []
  const tls = o.tls !== 'none'
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$|^localhost$/i.test(o.domain.trim())) w.push({ level: 'err', text: `"${o.domain}" doesn't look like a valid host name.` })
  if (!o.upstreams.length) w.push({ level: 'err', text: 'Add at least one upstream server.' })
  for (const u of o.upstreams) if (!(u.port > 0 && u.port < 65536)) w.push({ level: 'err', text: `Upstream ${u.host}: port ${u.port} is out of range.` })
  if (o.http3 && !tls) w.push({ level: 'err', text: 'HTTP/3 (QUIC) always requires TLS — enable a certificate.' })
  if (o.hsts && !tls) w.push({ level: 'warn', text: 'HSTS is only honoured over HTTPS; it is omitted while TLS is off.' })
  if (tls && !o.redirectHttp) w.push({ level: 'warn', text: 'Plain-HTTP requests are not redirected to HTTPS.' })
  if (o.hstsPreload && o.hstsMaxAge < 31536000) w.push({ level: 'err', text: 'HSTS preload requires max-age ≥ 31536000 (1 year).' })
  if (o.hstsPreload) w.push({ level: 'info', text: 'Preload is hard to undo: every subdomain must serve HTTPS for months after removal.' })
  if (o.gzip && tls && o.cache === 'all') w.push({ level: 'warn', text: 'Compression on TLS pages that reflect user input plus secrets (CSRF tokens) can enable BREACH-style attacks.' })
  if (o.cache === 'all') w.push({ level: 'warn', text: 'Caching all responses can serve one user\'s private page to another. Make sure the app sends Cache-Control: private on personalised responses.' })
  if (o.websockets && o.readTimeout < 60) w.push({ level: 'warn', text: `Read timeout ${o.readTimeout}s will drop idle WebSocket connections; use ≥ 60 s or app-level pings.` })
  if (o.rateLimit && o.burst === 0) w.push({ level: 'info', text: 'Burst 0 rejects any request above the steady rate — browsers loading many assets at once may hit 429s.' })
  if (o.rateLimit && o.rps < 2) w.push({ level: 'warn', text: 'Below 2 req/s per IP is very strict; users behind NAT share an IP.' })
  if (o.maxBodyMb <= 0) w.push({ level: 'warn', text: 'Request body limit of 0 disables the check on some servers (unlimited uploads).' })
  if (o.upstreamTls && o.upstreams.some((u) => /^(127\.|localhost)/.test(u.host))) w.push({ level: 'info', text: 'TLS to a loopback upstream adds cost without much protection.' })
  if (o.lb === 'ip_hash' && o.upstreams.length < 2) w.push({ level: 'info', text: 'Sticky sessions only matter with two or more upstreams.' })
  if (o.secHeaders && /unsafe-inline|unsafe-eval|\*/.test(o.csp)) w.push({ level: 'warn', text: 'CSP contains unsafe-inline/unsafe-eval or a wildcard, which weakens XSS protection.' })
  if (s === 'caddy' && o.rateLimit) w.push({ level: 'warn', text: 'Caddy: rate limiting needs the caddy-ratelimit plugin (xcaddy build).' })
  if (s === 'caddy' && o.brotli) w.push({ level: 'warn', text: 'Caddy: Brotli needs a plugin; zstd is used as the built-in alternative.' })
  if (s === 'caddy' && o.cache === 'all') w.push({ level: 'warn', text: 'Caddy: full response caching needs the cache-handler plugin.' })
  if (s === 'nginx' && o.brotli) w.push({ level: 'warn', text: 'nginx: brotli directives need the ngx_brotli module.' })
  if (s === 'nginx' && o.http3) w.push({ level: 'info', text: 'nginx: QUIC needs 1.25+ built with --with-http_v3_module and UDP 443 open.' })
  if (s === 'apache' && o.http3) w.push({ level: 'err', text: 'Apache httpd cannot serve HTTP/3.' })
  if (s === 'apache' && o.rateLimit) w.push({ level: 'warn', text: 'Apache: request rate limiting needs a third-party module (mod_evasive / mod_qos).' })
  if (s === 'apache' && o.websockets && o.upstreams.length > 1) w.push({ level: 'info', text: 'Apache: WebSocket upgrades go to the first upstream only in this config.' })
  if (s === 'traefik' && o.cache !== 'off') w.push({ level: 'warn', text: 'Traefik: no built-in cache — the cache option is not applied.' })
  if (s === 'traefik' && o.lb === 'least_conn') w.push({ level: 'info', text: 'Traefik: least-connections is not available; weighted round robin is used.' })
  if (s === 'traefik' && o.http3) w.push({ level: 'info', text: 'Traefik: HTTP/3 is switched on in the static entrypoint config.' })
  if (s === 'haproxy' && o.brotli) w.push({ level: 'warn', text: 'HAProxy: no Brotli — only gzip/deflate compression.' })
  if (s === 'haproxy' && o.http3) w.push({ level: 'info', text: 'HAProxy: QUIC needs a build with USE_QUIC and a QUIC-capable TLS library.' })
  if (s === 'haproxy' && o.cache === 'all') w.push({ level: 'info', text: 'HAProxy: its small-object cache stores responses up to max-object-size only.' })
  return w
}

// ---------------- highlighting ----------------
export type TokKind = 'com' | 'str' | 'kw' | 'var' | 'num' | 'punct' | 'txt'
const TOKEN = /(#.*$)|("(?:[^"\\]|\\.)*"|'[^']*'|`[^`]*`)|(\$[A-Za-z_]\w*|\{[a-z_.]+\}|%\{[^}]+\}|%\[[^\]]+\])|(\b\d+(?:\.\d+)?[a-zA-Z]{0,2}\b)|([{};[\]<>])/g

/** Tokenises one line: first word = directive, then comments, strings, variables, numbers. */
export function highlightLine(line: string): [TokKind, string][] {
  const out: [TokKind, string][] = []
  const m = /^(\s*)(-\s+)?([A-Za-z_][\w.-]*:?|<\/?[A-Za-z]+|@[\w]+)/.exec(line)
  let rest = line
  if (m && !line.trimStart().startsWith('#')) {
    out.push(['txt', m[1] + (m[2] ?? '')], ['kw', m[3]])
    rest = line.slice(m[0].length)
  }
  let last = 0
  for (const t of rest.matchAll(TOKEN)) {
    if (t.index > last) out.push(['txt', rest.slice(last, t.index)])
    const k: TokKind = t[1] ? 'com' : t[2] ? 'str' : t[3] ? 'var' : t[4] ? 'num' : 'punct'
    out.push([k, t[0]])
    last = t.index + t[0].length
  }
  if (last < rest.length) out.push(['txt', rest.slice(last)])
  return out
}
