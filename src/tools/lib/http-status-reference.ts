// HTTP status code dataset (IANA-registered codes plus a few widely seen unofficial ones) and search.
// Text written for this project; section numbers point at the defining RFC.
import { fuzzyScore } from './food-diary'

export type Cat = '1xx' | '2xx' | '3xx' | '4xx' | '5xx'
export interface Status {
  code: number
  name: string
  /** RFC number and section, e.g. "9110 15.5.5". Empty for unofficial codes. */
  ref: string
  summary: string
  causes: string[]
  fixes: string[]
  headers: string
  official: boolean
  /** Origin of unofficial codes (nginx, Cloudflare …). */
  vendor?: string
  deprecated?: boolean
}

// code | name | ref | summary | causes (;) | fixes (;) | related headers | flags (u:vendor, d)
const RAW = `100|Continue|9110 15.2.1|Interim response: the server got the request headers and the client may send the body.|Client sent "Expect: 100-continue" before a large upload|Nothing to fix; clients that do not want it can omit the Expect header|Expect|
101|Switching Protocols|9110 15.2.2|The server agrees to switch to the protocol named in the Upgrade header (typically WebSocket).|WebSocket handshake; HTTP/1.1 → h2c upgrade|If a WebSocket fails behind a proxy, make sure it forwards Upgrade and Connection headers|Upgrade, Connection|
102|Processing|2518 10.1|Interim WebDAV response saying a long request is still being processed. Removed from later WebDAV specs.|Long-running WebDAV operations|Prefer 202 Accepted plus a status URL for long jobs|—|d
103|Early Hints|8297 2|Interim response carrying Link headers so the browser can preload resources while the final response is prepared.|Server or CDN sends preload/preconnect hints early|Only include Link headers that are also valid for the final response|Link|
200|OK|9110 15.3.1|The request succeeded; the body depends on the method (representation for GET, result for POST).|Normal success|None needed; for APIs returning nothing, 204 may be clearer|Content-Type, Content-Length|
201|Created|9110 15.3.2|The request created one or more new resources.|Successful POST or PUT that creates an item|Return a Location header pointing at the new resource|Location, ETag|
202|Accepted|9110 15.3.3|The request was accepted for processing but is not finished; the outcome is not yet known.|Queued background jobs, async APIs|Give clients a status URL (Location or body link) to poll|Location, Retry-After|
203|Non-Authoritative Information|9110 15.3.4|Success, but a transforming proxy modified the origin's response.|A proxy rewrote headers or content|Rarely used; check intermediaries if unexpected|—|
204|No Content|9110 15.3.5|Success with no response body.|DELETE or PUT that has nothing to return; form autosave|Don't send a body; clients must not try to parse JSON from it|ETag|
205|Reset Content|9110 15.3.6|Success; the client should reset the document view (e.g. clear a form).|Form submissions in data-entry apps|Rare; most apps use 204 and handle reset client-side|—|
206|Partial Content|9110 15.3.7|The server is delivering only the byte range(s) requested.|Range requests: video seeking, resumable downloads|Make sure Content-Range is correct; multiple ranges use multipart/byteranges|Range, Content-Range, Accept-Ranges|
207|Multi-Status|4918 11.1|WebDAV: the body (XML) holds separate status codes for several resources.|PROPFIND or batch WebDAV operations|Read each response element in the body; the 207 itself says little|—|
208|Already Reported|5842 7.1|WebDAV: members of a binding were already listed earlier in this multistatus response.|WebDAV bindings with loops|Nothing to fix; avoids repeating the same resource|—|
226|IM Used|3229 10.4.1|The response is the result of instance manipulations (delta encoding) applied to the current instance.|Delta encoding with A-IM header|Very rare; ensure the client advertised the IM it can apply|A-IM, IM|
300|Multiple Choices|9110 15.4.1|The resource has several representations and the client may choose one.|Content negotiation with no clear winner|Provide a list of choices and preferably a Location for the default|Location|
301|Moved Permanently|9110 15.4.2|The resource has a new permanent URL. Clients may change POST to GET when following it.|Site restructure, domain move, HTTP → HTTPS|Update links and bookmarks; use 308 if the method must be preserved; avoid redirect chains|Location|
302|Found|9110 15.4.3|The resource is temporarily at another URL. Clients may change POST to GET.|Login redirects, temporary moves|Use 303 after POST on purpose, or 307 to keep the method|Location|
303|See Other|9110 15.4.4|Look at another URL with GET, typically after a POST (Post/Redirect/Get pattern).|Form submission redirecting to a result page|This is usually the correct choice after a successful POST in web apps|Location|
304|Not Modified|9110 15.4.5|The cached copy is still valid; no body is sent.|Conditional GET with If-None-Match or If-Modified-Since matched|Nothing to fix; if content looks stale, check ETag/Last-Modified generation|ETag, Last-Modified, If-None-Match, If-Modified-Since|
305|Use Proxy|9110 15.4.6|Deprecated: asked the client to use a proxy. Must not be used.|Legacy systems|Do not use|—|d
306|(Unused)|9110 15.4.7|Reserved; was used in an earlier draft and is no longer used.|—|Do not use|—|d
307|Temporary Redirect|9110 15.4.8|Temporarily at another URL; the client must repeat the same method and body.|Temporary moves of API endpoints; HSTS internal redirects in browsers|Use this instead of 302 when the method must not change|Location|
308|Permanent Redirect|9110 15.4.9|Permanently at another URL; the client must repeat the same method and body.|API endpoint moved permanently|Use instead of 301 for non-GET endpoints; update clients|Location|
400|Bad Request|9110 15.5.1|The server cannot process the request because of a client error (malformed syntax, invalid framing, bad parameters).|Malformed JSON; missing required fields; invalid query parameters; oversized or corrupt cookies|Validate the request body and parameters; check Content-Type matches the body; clear cookies for the site|Content-Type|
401|Unauthorized|9110 15.5.2|Authentication is missing or invalid. The response must include a WWW-Authenticate challenge.|Missing or expired token; wrong credentials; Authorization header stripped by a proxy|Log in again or refresh the token; send "Authorization: Bearer …"; check the header survives proxies and CORS|WWW-Authenticate, Authorization|
402|Payment Required|9110 15.5.3|Reserved for future use; some APIs use it for billing problems.|Exceeded paid quota; card declined (API-specific)|Check the account's billing status with the provider|—|
403|Forbidden|9110 15.5.4|The server understood the request but refuses it. Re-authenticating will not help (unlike 401).|Insufficient permissions; IP or geo block; WAF rule; file system permissions; missing CSRF token|Check user roles and ACLs; check web-server file permissions; review WAF logs; include the CSRF token|—|
404|Not Found|9110 15.5.5|No current representation was found for the target URL (or the server hides that it exists).|Typo in the URL; deleted page; wrong base path or API version; routing misconfiguration; SPA deep link without a fallback|Check the URL and route table; add redirects for moved content; configure the SPA fallback to index.html|—|
405|Method Not Allowed|9110 15.5.6|The method is not supported by this resource. The response must list allowed methods in Allow.|POST to a GET-only route; missing route for PUT/DELETE; static hosts rejecting POST|Use a supported method; add the handler; check the Allow header|Allow|
406|Not Acceptable|9110 15.5.7|No representation matches the request's Accept-* headers.|Strict Accept header (e.g. only application/xml) on a JSON API|Relax the Accept header or add the representation on the server|Accept, Accept-Language, Accept-Encoding|
407|Proxy Authentication Required|9110 15.5.8|Like 401, but the client must authenticate with a proxy.|Corporate proxy needs credentials|Configure proxy credentials in the client or OS|Proxy-Authenticate, Proxy-Authorization|
408|Request Timeout|9110 15.5.9|The server did not receive a complete request in time and closed the connection.|Slow upload; idle keep-alive connection; client stalled|Retry the request; increase the server's client body timeout for slow networks|Connection|
409|Conflict|9110 15.5.10|The request conflicts with the current state of the resource.|Concurrent edits; duplicate unique key; version mismatch|Re-fetch the resource, merge and retry; tell the user what conflicted|ETag|
410|Gone|9110 15.5.11|The resource is permanently gone and no forwarding address is known.|Deliberately removed content or retired API version|Remove links to it; search engines drop 410 pages faster than 404|—|
411|Length Required|9110 15.5.12|The server requires a Content-Length header.|Chunked upload to a server that does not accept it|Send Content-Length (buffer the body first)|Content-Length|
412|Precondition Failed|9110 15.5.13|A condition in the request headers (If-Match, If-Unmodified-Since …) evaluated to false.|Optimistic-concurrency update with a stale ETag|Re-fetch to get the current ETag, merge, retry|If-Match, If-Unmodified-Since, ETag|
413|Content Too Large|9110 15.5.14|The request body is larger than the server is willing to process (formerly "Payload Too Large").|Upload exceeds nginx client_max_body_size or app limits|Raise the limit (e.g. client_max_body_size) or upload in chunks; compress the body|Retry-After|
414|URI Too Long|9110 15.5.15|The request target is longer than the server will interpret.|Huge query strings; GET used for a large form; redirect loop appending parameters|Send data in a POST body; fix redirect loops|—|
415|Unsupported Media Type|9110 15.5.16|The content format (Content-Type or Content-Encoding) is not supported for this resource.|Sending form data to a JSON endpoint; missing Content-Type header|Set the right Content-Type (e.g. application/json) and encode the body to match|Content-Type, Accept-Post, Accept-Encoding|
416|Range Not Satisfiable|9110 15.5.17|None of the requested ranges overlap the current resource.|Resuming a download after the file changed; bad Range header|Restart the download without Range; check Content-Range for the size|Range, Content-Range|
417|Expectation Failed|9110 15.5.18|The Expect header could not be met by the server.|Expect: 100-continue unsupported by a proxy or server|Remove the Expect header from the client|Expect|
418|(Unused)|9110 15.5.19|Reserved because "I'm a teapot" (an April Fools' RFC) was deployed as a joke; not to be assigned.|Easter eggs or deliberate joke responses; some bot blockers|Treat it as a refusal; if your own server sends it, use a real 4xx code|—|
421|Misdirected Request|9110 15.5.20|The request reached a server that cannot answer for this scheme/authority (common with HTTP/2 connection reuse).|Reused TLS connection for a different host; certificate or SNI mismatch|Client should retry on a new connection; check virtual host and certificate setup|—|
422|Unprocessable Content|9110 15.5.21|The syntax is fine but the content is semantically invalid (validation errors).|Validation failure: invalid email, missing field values, business rule violations|Read the error details in the body and correct the fields|—|
423|Locked|4918 11.3|WebDAV: the resource is locked.|File checked out or locked by another user|Wait for the lock to be released or ask its owner|If, Lock-Token|
424|Failed Dependency|4918 11.4|WebDAV: the method failed because another action it depended on failed.|An earlier part of a batch operation failed|Fix the first failing operation|—|
425|Too Early|8470 5.2|The server is unwilling to process a request that might be replayed (TLS 1.3 early data).|Non-idempotent request sent in 0-RTT data|Client retries after the handshake completes (automatic in browsers)|Early-Data|
426|Upgrade Required|9110 15.5.22|The server refuses the request with the current protocol and names the required one in Upgrade.|Server requires TLS or a newer HTTP version|Switch to the protocol in the Upgrade header|Upgrade|
428|Precondition Required|6585 3|The server requires conditional requests to prevent lost updates.|Update without If-Match|GET the resource, then send its ETag in If-Match|If-Match|
429|Too Many Requests|6585 4|The client sent too many requests in a given time (rate limiting).|Exceeding an API rate limit; aggressive polling or crawling|Honour Retry-After; use exponential backoff with jitter; cache responses; batch requests|Retry-After, RateLimit-*|
431|Request Header Fields Too Large|6585 5|A single header or all headers together are too large.|Bloated cookies; huge Authorization tokens; many tracking cookies|Clear cookies for the domain; shrink tokens; raise header buffer limits on the server|Cookie|
451|Unavailable For Legal Reasons|7725 3|Access denied because of a legal demand (censorship, court order, sanctions).|Geo-blocking for legal reasons; takedown orders|Nothing technical to fix; the response may link to the blocking authority|Link (rel="blocked-by")|
500|Internal Server Error|9110 15.6.1|A generic server error: something unexpected went wrong.|Unhandled exception; misconfiguration; bad deployment; database errors|Check server logs and stack traces; reproduce locally; add error handling; roll back a bad deploy|—|
501|Not Implemented|9110 15.6.2|The server does not support the functionality (e.g. an unknown method).|Unsupported HTTP method; placeholder endpoints|Use a supported method; implement the feature|—|
502|Bad Gateway|9110 15.6.3|A gateway or proxy got an invalid response from the upstream server.|Upstream app crashed or not listening; wrong upstream port; upstream closed the connection; protocol mismatch|Check the app is running on the expected port; read proxy error logs; check timeouts and keep-alive settings|—|
503|Service Unavailable|9110 15.6.4|The server is temporarily unable to handle the request (overload or maintenance).|Maintenance mode; overload; no healthy instances behind the load balancer; rate limiting at the edge|Retry later honouring Retry-After; scale up; check health checks|Retry-After|
504|Gateway Timeout|9110 15.6.5|A gateway or proxy did not get a timely response from upstream.|Slow database queries; long synchronous jobs; upstream hang; proxy timeout too short|Optimise or make the work async (202); raise proxy_read_timeout carefully; check upstream health|—|
505|HTTP Version Not Supported|9110 15.6.6|The server does not support the HTTP major version used.|Very old or very new protocol version; malformed request line|Use HTTP/1.1 or a version the server supports|—|
506|Variant Also Negotiates|2295 8.1|Transparent content negotiation misconfiguration: the chosen variant itself negotiates.|Server configuration loop in content negotiation|Fix the server's variant configuration|—|
507|Insufficient Storage|4918 11.5|WebDAV: the server cannot store the representation.|Disk full; storage quota exceeded|Free space or raise the quota|—|
508|Loop Detected|5842 7.2|WebDAV: the server found an infinite loop while processing a request with Depth: infinity.|Cyclic bindings in WebDAV collections|Remove the cycle or avoid Depth: infinity|—|
510|Not Extended|2774 7|Further extensions to the request are required (HTTP Extension Framework, now historic).|Legacy extension framework|Rarely seen; the spec is historic|—|d
511|Network Authentication Required|6585 6|The client must authenticate to gain network access (captive portal).|Hotel or airport Wi-Fi login page|Open any http page in a browser and complete the portal login|—|
444|No Response||nginx closed the connection without sending a response (logged only, never sent).|nginx "return 444" rules blocking bots or bad hosts|Check nginx rules for return 444|—|u:nginx
499|Client Closed Request||nginx: the client closed the connection before the server answered (logged only).|User navigated away; client timeout shorter than server processing|Speed up the endpoint or raise the client timeout|—|u:nginx
520|Web Server Returned an Unknown Error||Cloudflare: the origin returned an empty, unknown or unexpected response.|Origin crash; headers too large; connection reset|Check origin logs; disable firewall blocks on Cloudflare IPs|—|u:Cloudflare
521|Web Server Is Down||Cloudflare: the origin refused the connection.|Origin offline; firewall blocking Cloudflare|Start the origin; allow Cloudflare IP ranges|—|u:Cloudflare
522|Connection Timed Out||Cloudflare: TCP connection to the origin timed out.|Origin overloaded; network routing problems; firewall dropping packets|Check origin load and firewall; verify DNS points at the right IP|—|u:Cloudflare
523|Origin Is Unreachable||Cloudflare: could not reach the origin (DNS or routing).|Wrong DNS A record; routing issue|Fix DNS records for the origin|—|u:Cloudflare
524|A Timeout Occurred||Cloudflare: connected to the origin but it did not reply with HTTP before the proxy timeout.|Long-running request on the origin|Make the work async or move it to a non-proxied subdomain|—|u:Cloudflare
525|SSL Handshake Failed||Cloudflare: TLS handshake with the origin failed.|No valid certificate or SNI on origin; cipher mismatch|Install a valid certificate on the origin; check SSL mode|—|u:Cloudflare
526|Invalid SSL Certificate||Cloudflare (Full strict mode): the origin certificate is invalid.|Expired or self-signed origin certificate|Install a valid or Cloudflare Origin CA certificate|—|u:Cloudflare`

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const STATUSES: Status[] = RAW.split('\n').map((line) => {
  const [code, name, ref, summary, causes, fixes, headers, flags] = line.split('|')
  return {
    code: Number(code), name, ref, summary,
    causes: causes === '—' ? [] : causes.split(';').map((s) => cap(s.trim())),
    fixes: fixes.split(';').map((s) => cap(s.trim())),
    headers, official: !flags?.startsWith('u:'), vendor: flags?.startsWith('u:') ? flags.slice(2) : undefined, deprecated: flags === 'd',
  }
}).sort((a, b) => a.code - b.code)

export const CATS: { id: Cat; name: string; blurb: string }[] = [
  { id: '1xx', name: 'Informational', blurb: 'Interim responses; the request is still in progress.' },
  { id: '2xx', name: 'Success', blurb: 'The request was received, understood and accepted.' },
  { id: '3xx', name: 'Redirection', blurb: 'Further action (usually following Location) is needed.' },
  { id: '4xx', name: 'Client error', blurb: 'The request is wrong or not allowed; retrying unchanged will not help.' },
  { id: '5xx', name: 'Server error', blurb: 'The server failed to fulfil a valid request.' },
]

export const catOf = (code: number): Cat => `${Math.floor(code / 100)}xx` as Cat

/** Status codes cacheable by default (heuristic freshness allowed), RFC 9110 §15.1. */
export const CACHEABLE = new Set([200, 203, 204, 206, 300, 301, 308, 404, 405, 410, 414, 501])

/** Generally safe for a client to retry automatically (with backoff). */
export const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504])

export function rfcUrl(ref: string): string {
  const [rfc, sec] = ref.split(' ')
  return `https://www.rfc-editor.org/rfc/rfc${rfc}${sec ? `#section-${sec}` : ''}`
}

/** Search: exact code / code prefix ("40", "5xx") first, then fuzzy text over name, summary, causes and fixes. */
export function search(q: string, list: Status[] = STATUSES): Status[] {
  const t = q.trim().toLowerCase()
  if (!t) return list
  const cls = /^([1-5])xx$/.exec(t)
  if (cls) return list.filter((s) => String(s.code)[0] === cls[1])
  if (/^\d{1,3}$/.test(t)) return list.filter((s) => String(s.code).startsWith(t))
  return list
    .map((s) => ({
      s,
      sc: Math.max(fuzzyScore(t, s.name) * 2, fuzzyScore(t, `${s.name} ${s.summary}`), fuzzyScore(t, `${s.causes.join(' ')} ${s.fixes.join(' ')} ${s.headers}`) * 0.7),
    }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc || a.s.code - b.s.code)
    .map((x) => x.s)
}
