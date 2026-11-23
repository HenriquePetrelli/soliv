import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { fakeDb, fakeSupabase } from './fakeSupabase';

vi.mock('@/integrations/supabase/client', () => ({ supabase: fakeSupabase }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import SignUpForm from '@/components/SignUpForm';
import { PsychologistService } from '@/services/psychologist.service';
import {
  checkSignupInviteCode,
  normalizeSignupInviteCode,
  signupInviteErrorMessage,
  signupInviteMetadata,
} from '@/lib/signupInvite';

const CODE = 'SOLIV-TESTE-2026';

beforeEach(() => {
  fakeDb.rpcHandlers = {
    signup_invite_required: () => ({ data: true, error: null }),
    check_signup_invite_code: (_db, params) => ({
      data: params.p_code === CODE ? { valid: true } : { valid: false, error: 'invalid' },
      error: null,
    }),
  };
});

describe('código de convite: regras', () => {
  it('normaliza sem espaços e em maiúsculas; só manda quando digitado', () => {
    expect(normalizeSignupInviteCode(' soliv-teste 2026 ')).toBe('SOLIV-TESTE2026');
    expect(signupInviteMetadata(' soliv-teste-2026')).toEqual({ signup_invite_code: CODE });
    expect(signupInviteMetadata('   ')).toEqual({});
  });

  it('confere no banco e traduz as recusas', async () => {
    expect(await checkSignupInviteCode('soliv-teste-2026')).toEqual({ valid: true });
    expect(await checkSignupInviteCode('errado')).toEqual({ valid: false, error: 'invalid' });

    fakeDb.rpcHandlers.check_signup_invite_code = () => ({ data: { valid: false, error: 'too_many_attempts' }, error: null });
    expect(await checkSignupInviteCode('x')).toEqual({ valid: false, error: 'too_many_attempts' });

    fakeDb.rpcHandlers.check_signup_invite_code = () => ({ data: null, error: { message: 'offline' } });
    expect(await checkSignupInviteCode('x')).toEqual({ valid: false, error: 'unavailable' });

    expect(signupInviteErrorMessage('too_many_attempts')).toMatch(/15 minutos/);
    expect(signupInviteErrorMessage('invalid')).toMatch(/inválido/);
  });
});

describe('cadastro do paciente', () => {
  const renderForm = () =>
    render(
      <MemoryRouter>
        <SignUpForm userType="patient" />
      </MemoryRouter>,
    );

  it('com o cadastro fechado, mostra o código e avisa quando está errado', async () => {
    renderForm();
    const field = await screen.findByLabelText('Código de convite');
    fireEvent.change(field, { target: { value: 'errado' } });
    fireEvent.blur(field);
    expect(await screen.findByRole('alert')).toHaveTextContent('Código de convite inválido');

    fireEvent.change(field, { target: { value: 'soliv-teste-2026' } });
    expect((field as HTMLInputElement).value).toBe(CODE);
    fireEvent.blur(field);
    await waitFor(() => expect(screen.queryByText(/Código de convite inválido/)).not.toBeInTheDocument());
  });

  it('com o cadastro aberto, o campo some', async () => {
    fakeDb.rpcHandlers.signup_invite_required = () => ({ data: false, error: null });
    renderForm();
    await waitFor(() => expect(screen.queryByLabelText('Código de convite')).not.toBeInTheDocument());
  });
});

describe('cadastro do psicólogo', () => {
  it('manda o código nos dados do cadastro e explica a recusa do banco', async () => {
    const signUp = vi.fn(async () => ({ data: { user: null, session: null }, error: { message: 'Database error saving new user' } }));
    (fakeSupabase.auth as Record<string, unknown>).signUp = signUp;

    const result = await PsychologistService.signUpPsychologist(
      {
        email: 'psi@teste.local',
        password: 'senhaForte123',
        fullName: 'Psi Teste',
        cpf: '12345678909',
        crp: '06/123456',
        specialty: 'Psicologia Clínica',
        areaAtendimento: ['Ansiedade'],
        bio: 'Psicóloga clínica com experiência em ansiedade e depressão em adultos.',
        state: 'SP',
        city: 'São Paulo',
        inviteCode: 'soliv-teste-2026',
      },
      new File(['%PDF'], 'crp.pdf', { type: 'application/pdf' }),
    );

    const options = (signUp.mock.calls[0] as unknown as [{ options: { data: Record<string, unknown> } }])[0].options;
    expect(options.data.signup_invite_code).toBe(CODE);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/código de convite/);
  });
});

describe('recusa do banco', () => {
  it('mostra a frase do banco em português', async () => {
    const { getAuthErrorMessage } = await import('@/utils/errorMessage');
    const fromDb = { code: 'P0001', message: 'Código de convite inválido. Confira com quem te convidou.', hint: 'signup_invite_code_required' };
    expect(getAuthErrorMessage(fromDb, 'genérica')).toBe('Código de convite inválido. Confira com quem te convidou.');
  });
});
