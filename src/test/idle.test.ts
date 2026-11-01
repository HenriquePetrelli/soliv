import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterPageSettles, isConstrainedNetwork } from '@/lib/idle';

const setConnection = (value: unknown) =>
  Object.defineProperty(navigator, 'connection', { value, configurable: true });

describe('isConstrainedNetwork', () => {
  afterEach(() => setConnection(undefined));

  it('economia de dados ou 2G/3G não pré-carrega', () => {
    setConnection({ saveData: true, effectiveType: '4g' });
    expect(isConstrainedNetwork()).toBe(true);
    setConnection({ effectiveType: 'slow-2g' });
    expect(isConstrainedNetwork()).toBe(true);
    setConnection({ effectiveType: '3g' });
    expect(isConstrainedNetwork()).toBe(true);
  });

  it('4G ou sem a informação pré-carrega', () => {
    setConnection({ effectiveType: '4g' });
    expect(isConstrainedNetwork()).toBe(false);
    setConnection(undefined);
    expect(isConstrainedNetwork()).toBe(false);
  });
});

describe('afterPageSettles', () => {
  it('roda depois do atraso e pode ser cancelado', () => {
    vi.useFakeTimers();
    const ran = vi.fn();
    const cancelled = vi.fn();
    afterPageSettles(ran, { minDelayMs: 1000 });
    const cancel = afterPageSettles(cancelled, { minDelayMs: 1000 });
    cancel();
    vi.advanceTimersByTime(5000);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
