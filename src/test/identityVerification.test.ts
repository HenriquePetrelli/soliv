import { describe, expect, it } from 'vitest';
import {
  autoPromptFor,
  identityDocumentPath,
  parseIdentityStatus,
  promptMarksFor,
  validateIdentityFile,
} from '@/lib/identityVerification';

const NOW = '2026-11-19T12:00:00.000Z';

describe('autoPromptFor', () => {
  it('mostra no primeiro login, com ou sem plano', () => {
    expect(autoPromptFor({ identity_status: 'nao_enviado' }, false)).toBe('first_login');
    expect(autoPromptFor({ identity_status: 'nao_enviado' }, true)).toBe('first_login');
  });

  it('depois de "Não autenticar agora", só volta no primeiro plano pago', () => {
    const seen = { identity_status: 'nao_enviado', identity_prompt_seen_at: NOW };
    expect(autoPromptFor(seen, false)).toBeNull();
    expect(autoPromptFor(seen, true)).toBe('first_plan');
    expect(autoPromptFor({ ...seen, identity_prompt_after_plan_at: NOW }, true)).toBeNull();
  });

  it('não mostra para quem já enviou ou foi aprovado', () => {
    expect(autoPromptFor({ identity_status: 'pendente' }, true)).toBeNull();
    expect(autoPromptFor({ identity_status: 'aprovado' }, true)).toBeNull();
  });

  it('recusado segue a mesma regra de quem não enviou', () => {
    expect(autoPromptFor({ identity_status: 'recusado', identity_prompt_seen_at: NOW }, true)).toBe('first_plan');
  });
});

describe('promptMarksFor', () => {
  it('quem já tem plano no primeiro login não vê a modal de novo', () => {
    expect(promptMarksFor('first_login', true, NOW)).toEqual({
      identity_prompt_seen_at: NOW,
      identity_prompt_after_plan_at: NOW,
    });
  });
  it('sem plano, marca só o primeiro login', () => {
    expect(promptMarksFor('first_login', false, NOW)).toEqual({ identity_prompt_seen_at: NOW });
  });
  it('primeiro plano marca só a segunda vez', () => {
    expect(promptMarksFor('first_plan', true, NOW)).toEqual({ identity_prompt_after_plan_at: NOW });
  });
});

describe('arquivo do documento', () => {
  it('aceita imagens e recusa o resto', () => {
    expect(validateIdentityFile({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(validateIdentityFile({ type: '', size: 1000, name: 'foto.HEIC' })).toBeNull();
    expect(validateIdentityFile({ type: 'application/pdf', size: 1000 })).toMatch(/foto ou imagem/);
    expect(validateIdentityFile({ type: 'image/png', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(validateIdentityFile({ type: 'image/png', size: 0 })).toMatch(/vazio/);
  });

  it('guarda na pasta do usuário', () => {
    expect(identityDocumentPath('u1', { type: 'image/jpeg', name: 'IMG.JPEG' }, 5)).toBe('u1/documento-5.jpg');
    expect(identityDocumentPath('u1', { type: 'image/png', name: 'semextensao' }, 5)).toBe('u1/documento-5.png');
  });

  it('situação desconhecida vira não enviada', () => {
    expect(parseIdentityStatus(null)).toBe('nao_enviado');
    expect(parseIdentityStatus('aprovado')).toBe('aprovado');
  });
});
