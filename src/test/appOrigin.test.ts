import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_ORIGIN, appOrigin, isAllowedOrigin } from '../../supabase/functions/_shared/origin';

const req = (origin?: string) => new Request('https://x.supabase.co/functions/v1/create-checkout', {
  method: 'POST',
  headers: origin ? { origin } : {},
});

describe('links de volta do Stripe (appOrigin)', () => {
  it('aceita o site, as prévias da Lovable, o app nativo e o local', () => {
    for (const origin of [
      'https://solivsaude.com.br',
      'https://www.solivsaude.com.br',
      'https://id-preview--abc.lovable.app',
      'https://abc.lovableproject.com',
      'capacitor://localhost',
      'http://localhost:8080',
    ]) {
      expect(isAllowedOrigin(origin)).toBe(true);
      expect(appOrigin(req(origin))).toBe(origin);
    }
  });

  it('troca qualquer outra origem pelo site', () => {
    for (const origin of [
      'https://lovable.app.site-falso.com',
      'https://solivsaude.com.br.site-falso.com',
      'http://solivsaude.com.br',
      'https://evil.com',
      'null',
    ]) {
      expect(isAllowedOrigin(origin)).toBe(false);
      expect(appOrigin(req(origin))).toBe(DEFAULT_APP_ORIGIN);
    }
    expect(appOrigin(req())).toBe(DEFAULT_APP_ORIGIN);
  });
});
