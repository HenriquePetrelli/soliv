import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getPageSeo, PUBLIC_PAGES, SEARCH_INDEXING_ENABLED, SITE_URL } from '@/lib/seo';

const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('SEO das rotas', () => {
  it('páginas públicas com canonical no domínio; no Google só quando a busca estiver ligada', () => {
    const seo = getPageSeo('/patient-signup/');
    expect(seo.isPublic).toBe(true);
    expect(seo.indexable).toBe(SEARCH_INDEXING_ENABLED);
    expect(seo.canonical).toBe(`${SITE_URL}/patient-signup`);
    expect(getPageSeo('/').canonical).toBe(`${SITE_URL}/`);
  });

  it('telas com login ficam fora da busca', () => {
    for (const p of ['/home', '/sos', '/admin-dashboard', '/psychologist-dashboard', '/consultation-call/abc']) {
      expect(getPageSeo(p).indexable).toBe(false);
    }
  });

  it('index.html e robots.txt seguem a chave da busca', () => {
    const html = read('index.html');
    const robots = read('public/robots.txt');
    if (SEARCH_INDEXING_ENABLED) {
      expect(html).toContain('<meta name="robots" content="index, follow" />');
      expect(robots).toMatch(/^Sitemap: /m);
    } else {
      expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
      expect(robots).not.toMatch(/^Sitemap: /m);
    }
  });

  it('sitemap lista exatamente as páginas públicas', () => {
    const locs = [...read('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.sort()).toEqual(Object.keys(PUBLIC_PAGES).map((p) => getPageSeo(p).canonical).sort());
  });

  it('robots.txt não bloqueia nenhuma página pública', () => {
    const disallows = read('public/robots.txt')
      .split('\n')
      .filter((l) => l.startsWith('Disallow:'))
      .map((l) => l.replace('Disallow:', '').trim());
    for (const page of Object.keys(PUBLIC_PAGES)) {
      expect(disallows.filter((d) => page.startsWith(d))).toEqual([]);
    }
  });
});
