import { describe, expect, it } from 'vitest'
import { aesDec, aesEnc, decryptPdf, encryptPdf, hexOf, inspectPdf, md5, permsToP, pToPerms, rc4, samplePdf, type Perms } from './pdf-password-protector'

const te = (s: string) => new TextEncoder().encode(s)
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
// Ghostscript 10.02 output ("Hello RC4"), user password "user", owner "owner", /P -44.
const GS_R2 = 'JVBERi0xLjcKJcfsj6IKJSVJbnZvY2F0aW9uOiBncyAtcSAtZE5PUEFVU0UgLWRCQVRDSCAtc0RFVklDRT1wZGZ3cml0ZSAtZENvbXByZXNzRm9udHM9dHJ1ZSAtZFN1YnNldEZvbnRzPXRydWUgLXNPd25lclBhc3N3b3JkPT8gLXNVc2VyUGFzc3dvcmQ9PyAtZEVuY3J5cHRpb25SPTIgLWRLZXlMZW5ndGg9NDAgLWRQZXJtaXNzaW9ucz0tNDQgLXNPdXRwdXRGaWxlPT8gPwo1IDAgb2JqCjw8L0xlbmd0aCA2IDAgUi9GaWx0ZXIgL0ZsYXRlRGVjb2RlPj4Kc3RyZWFtCidm6lvb+VPJXyQrqwatfnFLzQrWYYK4fztDC1D2uVeSWZOJENjjzB5HBOpuB/5ec2D+8wO5cquS7L8oQyJd773Q9Pe+IAacZgprSd6Q9tZ/onplbmRzdHJlYW0KZW5kb2JqCjYgMCBvYmoKODIKZW5kb2JqCjQgMCBvYmoKPDwvVHlwZS9QYWdlL01lZGlhQm94IFswIDAgNTk1IDg0Ml0KL1JvdGF0ZSAwL1BhcmVudCAzIDAgUgovUmVzb3VyY2VzPDwvUHJvY1NldFsvUERGIC9UZXh0XQovRm9udCA4IDAgUgo+PgovQ29udGVudHMgNSAwIFIKPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFsKNCAwIFIKXSAvQ291bnQgMQo+PgplbmRvYmoKMSAwIG9iago8PC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAzIDAgUgovTWV0YWRhdGEgOSAwIFIKPj4KZW5kb2JqCjggMCBvYmoKPDwvUjcKNyAwIFI+PgplbmRvYmoKNyAwIG9iago8PC9CYXNlRm9udC9IZWx2ZXRpY2EvVHlwZS9Gb250Ci9TdWJ0eXBlL1R5cGUxPj4KZW5kb2JqCjkgMCBvYmoKPDwvVHlwZS9NZXRhZGF0YQovU3VidHlwZS9YTUwvTGVuZ3RoIDExODM+PnN0cmVhbQo8P3hwYWNrZXQgYmVnaW49J++7vycgaWQ9J1c1TTBNcENlaGlIenJlU3pOVGN6a2M5ZCc/Pgo8P2Fkb2JlLXhhcC1maWx0ZXJzIGVzYz0iQ1JMRiI/Pgo8eDp4bXBtZXRhIHhtbG5zOng9J2Fkb2JlOm5zOm1ldGEvJyB4OnhtcHRrPSdYTVAgdG9vbGtpdCAyLjkuMS0xMywgZnJhbWV3b3JrIDEuNic+CjxyZGY6UkRGIHhtbG5zOnJkZj0naHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIycgeG1sbnM6aVg9J2h0dHA6Ly9ucy5hZG9iZS5jb20vaVgvMS4wLyc+CjxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiIHhtbG5zOnBkZj0naHR0cDovL25zLmFkb2JlLmNvbS9wZGYvMS4zLycgcGRmOlByb2R1Y2VyPSdHUEwgR2hvc3RzY3JpcHQgMTAuMDIuMScvPgo8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9J2h0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8nPjx4bXA6TW9kaWZ5RGF0ZT4yMDI2LTEwLTE4VDAxOjU0OjQ5KzAzOjAwPC94bXA6TW9kaWZ5RGF0ZT4KPHhtcDpDcmVhdGVEYXRlPjIwMjYtMTAtMThUMDE6NTQ6NDkrMDM6MDA8L3htcDpDcmVhdGVEYXRlPgo8eG1wOkNyZWF0b3JUb29sPlVua25vd25BcHBsaWNhdGlvbjwveG1wOkNyZWF0b3JUb29sPjwvcmRmOkRlc2NyaXB0aW9uPgo8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4YXBNTT0naHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLycgeGFwTU06RG9jdW1lbnRJRD0ndXVpZDo0ZTUxYmQ1OC0wMjlhLTExZmQtMDAwMC05MGY0N2VmMGMwYjAnLz4KPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6ZGM9J2h0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvJyBkYzpmb3JtYXQ9J2FwcGxpY2F0aW9uL3BkZic+PGRjOnRpdGxlPjxyZGY6QWx0PjxyZGY6bGkgeG1sOmxhbmc9J3gtZGVmYXVsdCc+VW50aXRsZWQ8L3JkZjpsaT48L3JkZjpBbHQ+PC9kYzp0aXRsZT48L3JkZjpEZXNjcmlwdGlvbj4KPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAo8P3hwYWNrZXQgZW5kPSd3Jz8+CmVuZHN0cmVhbQplbmRvYmoKMiAwIG9iago8PC9Qcm9kdWNlcihVXDIxMVxyXDM3M1wpZlwyMDVcMzAzclwzMzI5UlwzNzNcMDMzXDMxNVwwMzFcMzAyXDIzNlwwMzZcMDM3XDI1MlwyMDBcMDIyKQovQ3JlYXRpb25EYXRlKFZcMzQzc1wzNTNcXDhcMzMzXDIwMDdcMjIxalwwMjFcMjQ3X1wyMTVcMDAwXDMzMFwyMzZcMDAzXGJcMjUwXDIzNlwwMDQpCi9Nb2REYXRlKFZcMzQzc1wzNTNcXDhcMzMzXDIwMDdcMjIxalwwMjFcMjQ3X1wyMTVcMDAwXDMzMFwyMzZcMDAzXGJcMjUwXDIzNlwwMDQpPj5lbmRvYmoKMTAgMCBvYmoKPDwvRmlsdGVyIC9TdGFuZGFyZCAvViAxIC9MZW5ndGggNDAgL1IgMiAvUCAtNDQgL08gKJToCUQZZip3REL7By49nxnp0TDsCaTQBh54/pIPerYvKQovVSAo0dLNnEQzsEyuTT1rmNNWtNFkqbPTWOzXOQYB0J9+xv0pPj4KZW5kb2JqCnhyZWYKMCAxMQowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDA1ODIgMDAwMDAgbiAKMDAwMDAwMTk5OCAwMDAwMCBuIAowMDAwMDAwNTIzIDAwMDAwIG4gCjAwMDAwMDAzODIgMDAwMDAgbiAKMDAwMDAwMDIxMiAwMDAwMCBuIAowMDAwMDAwMzY0IDAwMDAwIG4gCjAwMDAwMDA2NzUgMDAwMDAgbiAKMDAwMDAwMDY0NiAwMDAwMCBuIAowMDAwMDAwNzM5IDAwMDAwIG4gCjAwMDAwMDIyNjggMDAwMDAgbiAKdHJhaWxlcgo8PCAvU2l6ZSAxMSAvUm9vdCAxIDAgUiAvSW5mbyAyIDAgUgovSUQgWzwzRDExRTdCMTdFMThCMzgxMEUzRTQxQUVGQTA3NUExMj48M0QxMUU3QjE3RTE4QjM4MTBFM0U0MUFFRkEwNzVBMTI+XQovRW5jcnlwdCAxMCAwIFIgPj4Kc3RhcnR4cmVmCjI0MTAKJSVFT0YK'
const GS_R3 = 'JVBERi0xLjcKJcfsj6IKJSVJbnZvY2F0aW9uOiBncyAtcSAtZE5PUEFVU0UgLWRCQVRDSCAtc0RFVklDRT1wZGZ3cml0ZSAtZENvbXByZXNzRm9udHM9dHJ1ZSAtZFN1YnNldEZvbnRzPXRydWUgLXNPd25lclBhc3N3b3JkPT8gLXNVc2VyUGFzc3dvcmQ9PyAtZEVuY3J5cHRpb25SPTMgLWRLZXlMZW5ndGg9MTI4IC1kUGVybWlzc2lvbnM9LTQ0IC1zT3V0cHV0RmlsZT0/ID8KNSAwIG9iago8PC9MZW5ndGggNiAwIFIvRmlsdGVyIC9GbGF0ZURlY29kZT4+CnN0cmVhbQos5JMtHgPTKprgI1gauJpadaUCcRxlAAVzEIfqdLNc/xOPhwjnHitzXrT6lrPziIBm2oJ1dnrQR2x+xApB5WyE9ypoEiOSlwVYQPxGZDyT6+oZZW5kc3RyZWFtCmVuZG9iago2IDAgb2JqCjgyCmVuZG9iago0IDAgb2JqCjw8L1R5cGUvUGFnZS9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCi9Sb3RhdGUgMC9QYXJlbnQgMyAwIFIKL1Jlc291cmNlczw8L1Byb2NTZXRbL1BERiAvVGV4dF0KL0ZvbnQgOCAwIFIKPj4KL0NvbnRlbnRzIDUgMCBSCj4+CmVuZG9iagozIDAgb2JqCjw8IC9UeXBlIC9QYWdlcyAvS2lkcyBbCjQgMCBSCl0gL0NvdW50IDEKPj4KZW5kb2JqCjEgMCBvYmoKPDwvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMyAwIFIKL01ldGFkYXRhIDkgMCBSCj4+CmVuZG9iago4IDAgb2JqCjw8L1I3CjcgMCBSPj4KZW5kb2JqCjcgMCBvYmoKPDwvQmFzZUZvbnQvSGVsdmV0aWNhL1R5cGUvRm9udAovU3VidHlwZS9UeXBlMT4+CmVuZG9iago5IDAgb2JqCjw8L1R5cGUvTWV0YWRhdGEKL1N1YnR5cGUvWE1ML0xlbmd0aCAxMTgzPj5zdHJlYW0KPD94cGFja2V0IGJlZ2luPSfvu78nIGlkPSdXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQnPz4KPD9hZG9iZS14YXAtZmlsdGVycyBlc2M9IkNSTEYiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSdhZG9iZTpuczptZXRhLycgeDp4bXB0az0nWE1QIHRvb2xraXQgMi45LjEtMTMsIGZyYW1ld29yayAxLjYnPgo8cmRmOlJERiB4bWxuczpyZGY9J2h0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMnIHhtbG5zOmlYPSdodHRwOi8vbnMuYWRvYmUuY29tL2lYLzEuMC8nPgo8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczpwZGY9J2h0dHA6Ly9ucy5hZG9iZS5jb20vcGRmLzEuMy8nIHBkZjpQcm9kdWNlcj0nR1BMIEdob3N0c2NyaXB0IDEwLjAyLjEnLz4KPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSdodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvJz48eG1wOk1vZGlmeURhdGU+MjAyNi0xMC0xOFQwMTo1NDo0OSswMzowMDwveG1wOk1vZGlmeURhdGU+Cjx4bXA6Q3JlYXRlRGF0ZT4yMDI2LTEwLTE4VDAxOjU0OjQ5KzAzOjAwPC94bXA6Q3JlYXRlRGF0ZT4KPHhtcDpDcmVhdG9yVG9vbD5Vbmtub3duQXBwbGljYXRpb248L3htcDpDcmVhdG9yVG9vbD48L3JkZjpEZXNjcmlwdGlvbj4KPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eGFwTU09J2h0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8nIHhhcE1NOkRvY3VtZW50SUQ9J3V1aWQ6NGU1MWJkNTgtMDI5YS0xMWZkLTAwMDAtZmRkYmU2N2QxNTk3Jy8+CjxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIiIHhtbG5zOmRjPSdodHRwOi8vcHVybC5vcmcvZGMvZWxlbWVudHMvMS4xLycgZGM6Zm9ybWF0PSdhcHBsaWNhdGlvbi9wZGYnPjxkYzp0aXRsZT48cmRmOkFsdD48cmRmOmxpIHhtbDpsYW5nPSd4LWRlZmF1bHQnPlVudGl0bGVkPC9yZGY6bGk+PC9yZGY6QWx0PjwvZGM6dGl0bGU+PC9yZGY6RGVzY3JpcHRpb24+CjwvcmRmOlJERj4KPC94OnhtcG1ldGE+CiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKPD94cGFja2V0IGVuZD0ndyc/PgplbmRzdHJlYW0KZW5kb2JqCjIgMCBvYmoKPDwvUHJvZHVjZXIoXDMyMztcMjUyXDM3MlwyNTRcMjcyY1wzMTZcMDI1XDM0NFwyNjBcMDI1Zm9cMzQ2b1wyMzE9XDI2NVBcMzEwXDIwNlwwMjQpCi9DcmVhdGlvbkRhdGUoXDMyMFFcMzI0XDM1MlwzMzFcMzQ0PVwyMTVQXDI1N1wzNDNWOitcMjQ2dlwyMDM9XDI1MEdcMzEyXDIzMFwwMDIpCi9Nb2REYXRlKFwzMjBRXDMyNFwzNTJcMzMxXDM0ND1cMjE1UFwyNTdcMzQzVjorXDI0NnZcMjAzPVwyNTBHXDMxMlwyMzBcMDAyKT4+ZW5kb2JqCjEwIDAgb2JqCjw8L0ZpbHRlciAvU3RhbmRhcmQgL1YgMiAvTGVuZ3RoIDEyOCAvUiAzIC9QIC00NCAvTyAoC6ODX4j5A4jnTlRYQSXOFCvg3iTGsNN3RuB1uJF1ZnEpCi9VIChcKcb6L09H0xTSqkhnt8WWtlwov05eTnWKQWQATlb/+gEIKT4+CmVuZG9iagp4cmVmCjAgMTEKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwNTgzIDAwMDAwIG4gCjAwMDAwMDE5OTkgMDAwMDAgbiAKMDAwMDAwMDUyNCAwMDAwMCBuIAowMDAwMDAwMzgzIDAwMDAwIG4gCjAwMDAwMDAyMTMgMDAwMDAgbiAKMDAwMDAwMDM2NSAwMDAwMCBuIAowMDAwMDAwNjc2IDAwMDAwIG4gCjAwMDAwMDA2NDcgMDAwMDAgbiAKMDAwMDAwMDc0MCAwMDAwMCBuIAowMDAwMDAyMjU3IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgMTEgL1Jvb3QgMSAwIFIgL0luZm8gMiAwIFIKL0lEIFs8OTcwRUY5MzBGMjM3NjZBOENDN0EyNDc4QkRDNzVDRkY+PDk3MEVGOTMwRjIzNzY2QThDQzdBMjQ3OEJEQzc1Q0ZGPl0KL0VuY3J5cHQgMTAgMCBSID4+CnN0YXJ0eHJlZgoyNDAyCiUlRU9GCg=='
const ALL: Perms = { print: true, printHigh: true, modify: true, copy: true, annotate: true, fillForms: true, accessibility: true, assemble: true }

async function pdfText(bytes: Uint8Array, password?: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({ data: bytes.slice(), password, useWorkerFetch: false, disableFontFace: true })
  const doc = await task.promise
  const page = await doc.getPage(1)
  const tc = await page.getTextContent()
  const meta = await doc.getMetadata()
  const text = tc.items.map((i) => ('str' in i ? i.str : '')).join(' ')
  const n = doc.numPages
  await task.destroy()
  return { text, n, title: (meta.info as { Title?: string }).Title }
}

describe('primitives', () => {
  it('md5 matches RFC 1321 vectors', () => {
    expect(hexOf(md5(te('')))).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(hexOf(md5(te('abc')))).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(hexOf(md5(te('12345678901234567890123456789012345678901234567890123456789012345678901234567890')))).toBe('57edf4a22be3c955ac49da2e2107b67a')
  })
  it('rc4 matches the Wikipedia vector', () => {
    expect(hexOf(rc4(te('Key'), te('Plaintext')))).toBe('bbf316e8d940af0ad3')
  })
  it('AES without padding round-trips and matches FIPS-197 ECB', async () => {
    const key = Uint8Array.from({ length: 16 }, (_, i) => i)
    const pt = Uint8Array.from({ length: 16 }, (_, i) => i * 0x11)
    const ct = await aesEnc(key, new Uint8Array(16), pt, false)
    expect(hexOf(ct)).toBe('69c4e0d86a7b0430d8cdb78070b4c55a')
    expect(hexOf(await aesDec(key, new Uint8Array(16), ct, false))).toBe(hexOf(pt))
  })
  it('permission flags map to P', () => {
    expect(permsToP({ ...ALL })).toBe(-4)
    const none = Object.fromEntries(Object.keys(ALL).map((k) => [k, false])) as Perms
    expect(permsToP(none)).toBe(-3904)
    expect(pToPerms(-44)).toMatchObject({ print: true, modify: false, copy: true, annotate: false })
  })
})

describe('decrypt third-party files (Ghostscript)', () => {
  for (const [name, b] of [['R2 RC4-40', GS_R2], ['R3 RC4-128', GS_R3]] as const) {
    it(name, async () => {
      const bytes = b64(b)
      const info = await inspectPdf(bytes)
      expect(info.encrypted).toBe(true)
      expect(info.openWithoutPassword).toBe(false)
      expect(info.P).toBe(-44)
      await expect(decryptPdf(bytes, 'nope')).rejects.toThrow(/Wrong password/)
      for (const pw of ['user', 'owner']) {
        const r = await decryptPdf(bytes, pw)
        expect(r.as).toBe(pw)
        expect((await inspectPdf(r.bytes)).encrypted).toBe(false)
        expect((await pdfText(r.bytes)).text).toContain('Hello RC4')
      }
    })
  }
})

describe('encrypt → pdf.js → decrypt', () => {
  for (const method of ['AES-256', 'AES-128', 'RC4-128'] as const) {
    it(method, async () => {
      const src = await samplePdf()
      const enc = await encryptPdf(src, { user: 'open sesame', owner: 'boss', perms: { ...ALL, modify: false }, method, encryptMetadata: true })
      expect(enc.streams).toBeGreaterThan(2)
      expect(new TextDecoder('latin1').decode(enc.bytes)).not.toContain('Quarterly')
      const info = await inspectPdf(enc.bytes)
      expect(info.method).toBe(method)
      expect(info.perms?.modify).toBe(false)
      expect(info.openWithoutPassword).toBe(false)
      // pdf.js refuses without the password and opens with either password.
      await expect(pdfText(enc.bytes)).rejects.toThrow(/password/i)
      await expect(pdfText(enc.bytes, 'wrong')).rejects.toThrow(/password/i)
      const viaUser = await pdfText(enc.bytes, 'open sesame')
      expect(viaUser.n).toBe(3)
      expect(viaUser.text).toContain('Quarterly report')
      expect(viaUser.title).toBe('Quarterly report (sample)')
      expect((await pdfText(enc.bytes, 'boss')).text).toContain('Quarterly report')
      // Own decryptor, both passwords.
      const dec = await decryptPdf(enc.bytes, 'boss')
      expect(dec.as).toBe('owner')
      expect((await pdfText(dec.bytes)).text).toContain('Revenue grew')
      expect((await decryptPdf(enc.bytes, 'open sesame')).as).toBe('user')
    })
  }
  it('empty user password opens without prompt but keeps permissions', async () => {
    const enc = await encryptPdf(await samplePdf(), { user: '', owner: 'owner-only', perms: { ...ALL, copy: false, print: false }, method: 'AES-256', encryptMetadata: true })
    const info = await inspectPdf(enc.bytes)
    expect(info.openWithoutPassword).toBe(true)
    expect(info.perms).toMatchObject({ copy: false, print: false, modify: true })
    expect((await pdfText(enc.bytes)).n).toBe(3)
  })
  it('unicode passwords (AES-256 uses UTF-8)', async () => {
    const enc = await encryptPdf(await samplePdf(), { user: 'пароль-密码', owner: '', perms: ALL, method: 'AES-256', encryptMetadata: false })
    expect((await pdfText(enc.bytes, 'пароль-密码')).text).toContain('Quarterly')
    expect((await decryptPdf(enc.bytes, 'пароль-密码')).as).toBe('owner')
  })
  it('re-encrypting a pdf-lib object-stream file works', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const d = await PDFDocument.load(await samplePdf())
    const withObjStm = await d.save({ useObjectStreams: true })
    const enc = await encryptPdf(withObjStm, { user: 'a', owner: 'b', perms: ALL, method: 'AES-128', encryptMetadata: true })
    expect((await pdfText(enc.bytes, 'a')).text).toContain('Quarterly')
  })
})
