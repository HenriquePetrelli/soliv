import { describe, it, expect, vi, afterEach } from 'vitest';

const native = vi.hoisted(() => ({ value: false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.value } }));

import { soundUrl, SOUNDS_STORAGE_BASE } from '@/lib/soundUrl';
import { prefetchSounds } from '@/lib/soundPrefetch';

afterEach(() => {
  native.value = false;
});

describe('endereço dos sons', () => {
  it('no site, sai do próprio site', () => {
    expect(soundUrl('/sounds/sleep/rain.mp3')).toBe('/sounds/sleep/rain.mp3');
  });

  it('no app, vem do Supabase Storage', () => {
    native.value = true;
    expect(soundUrl('/sounds/sleep/rain.mp3')).toBe(`${SOUNDS_STORAGE_BASE}/sleep/rain.mp3`);
  });

  it('no app, não baixa sons adiantado', () => {
    native.value = true;
    prefetchSounds(['https://exemplo/som-app.mp3']);
    expect(document.head.querySelector('link[href="https://exemplo/som-app.mp3"]')).toBeNull();
  });
});
