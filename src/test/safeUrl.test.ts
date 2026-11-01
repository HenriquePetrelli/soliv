import { describe, expect, it } from 'vitest';
import { safeHttpUrl } from '@/lib/safeUrl';

describe('safeHttpUrl', () => {
  it('aceita https e http', () => {
    expect(safeHttpUrl('https://x.supabase.co/storage/v1/object/sign/documents/a.pdf?token=1')).toContain('https://');
    expect(safeHttpUrl('http://localhost:8080/a.pdf')).toBe('http://localhost:8080/a.pdf');
  });

  it('recusa esquemas perigosos', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('  JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHttpUrl('vbscript:msgbox')).toBeNull();
  });

  it('vazio vira null', () => {
    expect(safeHttpUrl('')).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});
