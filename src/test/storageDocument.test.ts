import { describe, it, expect, vi, beforeEach } from 'vitest';

const createSignedUrl = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ createSignedUrl }) } },
}));

import { extractDocumentRef, openStorageDocument } from '@/lib/storageDocument';

const BASE = 'https://proj.supabase.co/storage/v1/object';

describe('documentos do psicólogo no Storage', () => {
  beforeEach(() => {
    createSignedUrl.mockReset();
    vi.restoreAllMocks();
  });

  it('acha bucket e caminho em link público, assinado ou caminho puro', () => {
    expect(extractDocumentRef(`${BASE}/public/documents/u1/doc%20crp.png`)).toEqual({ bucket: 'documents', path: 'u1/doc crp.png' });
    expect(extractDocumentRef(`${BASE}/sign/documents/u1/a.pdf?token=x`)).toEqual({ bucket: 'documents', path: 'u1/a.pdf' });
    expect(extractDocumentRef('u1/a.pdf')).toEqual({ bucket: 'psychologist-documents', path: 'u1/a.pdf' });
    expect(extractDocumentRef('https://outro.site/a.pdf')).toBeUndefined();
    expect(extractDocumentRef(null)).toBeUndefined();
  });

  it('abre com link assinado (funciona com o bucket privado)', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: `${BASE}/sign/documents/u1/a.pdf?token=t` } });
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    await openStorageDocument(`${BASE}/public/documents/u1/a.pdf`);
    expect(createSignedUrl).toHaveBeenCalledWith('u1/a.pdf', 300);
    expect(tab.opener).toBeNull();
    expect(tab.location.href).toContain('/sign/documents/u1/a.pdf');
  });

  it('sem permissão para assinar, usa o link guardado; link perigoso não abre', async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'not allowed' } });
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    await openStorageDocument(`${BASE}/public/documents/u1/a.pdf`);
    expect(tab.location.href).toBe(`${BASE}/public/documents/u1/a.pdf`);

    const tab2 = { opener: {}, location: { href: '' }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(tab2 as unknown as Window);
    await openStorageDocument('javascript:alert(1)');
    expect(tab2.close).toHaveBeenCalled();
    expect(tab2.location.href).toBe('');
  });
});
