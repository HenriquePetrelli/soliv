import { describe, expect, it } from 'vitest';
import { isUntrustedFrame } from '@/lib/frameGuard';

const own = 'https://soliv.lovable.app';

describe('isUntrustedFrame', () => {
  it('abre normalmente fora de iframe', () => {
    expect(isUntrustedFrame({ isFramed: false, ownOrigin: own, ancestorOrigin: null })).toBe(false);
  });

  it('libera o editor e o preview da Lovable, o próprio site e o localhost', () => {
    for (const ancestor of ['https://lovable.dev', 'https://www.lovable.dev', 'https://id-preview--82bda655-81e5-448f-832e-ea464e8925dc.lovable.app', own, 'http://localhost:3000']) {
      expect(isUntrustedFrame({ isFramed: true, ownOrigin: own, ancestorOrigin: ancestor })).toBe(false);
    }
  });

  it('bloqueia outro site', () => {
    expect(isUntrustedFrame({ isFramed: true, ownOrigin: own, ancestorOrigin: 'https://site-falso.com' })).toBe(true);
    expect(isUntrustedFrame({ isFramed: true, ownOrigin: own, ancestorOrigin: 'https://lovable.dev.site-falso.com' })).toBe(true);
    // Site de outra pessoa publicado na Lovable.
    expect(isUntrustedFrame({ isFramed: true, ownOrigin: own, ancestorOrigin: 'https://site-falso.lovable.app' })).toBe(true);
    expect(isUntrustedFrame({ isFramed: true, ownOrigin: own, ancestorOrigin: 'https://id-preview--x.lovable.app' })).toBe(true);
  });

  it('sem saber quem é o site de fora, não bloqueia (não quebra o preview)', () => {
    expect(isUntrustedFrame({ isFramed: true, ownOrigin: own, ancestorOrigin: null })).toBe(false);
  });
});
