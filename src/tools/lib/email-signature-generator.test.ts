import { describe, expect, it } from 'vitest'
import { buildSignature, plainSignature, safeUrl, telHref, type Sig } from './email-signature-generator'

const S: Sig = {
  name: 'Ann <Lee>', title: 'CTO', company: 'Acme', phone: '+1 (555) 010-2030', mobile: '', email: 'ann@acme.io', website: 'acme.io', address: '', logo: '', logoSize: 80,
  accent: '#4f46e5', font: 'Arial, sans-serif', layout: 'classic', linkedin: 'linkedin.com/in/ann', x: 'javascript:alert(1)', github: '', instagram: '', cta: 'Book a call', ctaUrl: 'cal.com/ann', disclaimer: '',
}

describe('email signature', () => {
  it('sanitises urls', () => {
    expect(safeUrl('acme.io')).toBe('https://acme.io')
    expect(safeUrl('javascript:alert(1)')).toBe('')
    expect(safeUrl('mailto:a@b.c')).toBe('mailto:a@b.c')
    expect(telHref('+1 (555) 010-2030')).toBe('tel:+15550102030')
  })
  it('builds escaped table html', () => {
    const h = buildSignature(S)
    expect(h.startsWith('<table')).toBe(true)
    expect(h).toContain('Ann &lt;Lee&gt;')
    expect(h).toContain('href="mailto:ann@acme.io"')
    expect(h).toContain('href="https://linkedin.com/in/ann"')
    expect(h).not.toContain('javascript:')
    expect(h).toContain('https://cal.com/ann')
    for (const layout of ['stacked', 'minimal', 'banner'] as const) expect(buildSignature({ ...S, layout })).toContain('CTO')
  })
  it('plain text', () => {
    expect(plainSignature(S)).toBe('--\nAnn <Lee>\nCTO, Acme\nP +1 (555) 010-2030\nann@acme.io | acme.io')
  })
})
