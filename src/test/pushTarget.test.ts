import { describe, expect, it } from 'vitest';
import { isAppPath, pushTarget } from '@/lib/pushTarget';

describe('pushTarget (link da notificação)', () => {
  it('aceita caminhos do próprio app', () => {
    expect(pushTarget({ url: '/appointments' })).toBe('/appointments');
    expect(pushTarget({ url: '/chat?conversa=1' })).toBe('/chat?conversa=1');
  });

  it('recusa endereços que o navegador trata como outro site', () => {
    for (const url of ['//site-falso.com', '/\\site-falso.com', '/\\/site-falso.com', 'https://site-falso.com', 'javascript:alert(1)', '/a\nb', 'appointments']) {
      expect(isAppPath(url)).toBe(false);
      expect(pushTarget({ url })).toBeNull();
    }
  });

  it('SOS sem link abre o painel do psicólogo', () => {
    expect(pushTarget({ type: 'sos' })).toBe('/psychologist-dashboard');
    expect(pushTarget({ type: 'sos', url: '//site-falso.com' })).toBe('/psychologist-dashboard');
  });
});
