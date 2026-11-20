import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import NoPrescriptionNotice from '@/components/calls/NoPrescriptionNotice';
import { NO_PRESCRIPTION_TEXT } from '@/lib/noPrescription';
import termsPatientMd from '../../docs/lgpd/termos-de-uso-paciente.md?raw';
import termsPsychologistMd from '../../docs/lgpd/termos-de-uso-psicologo.md?raw';

describe('aviso de que o Soliv não receita medicamentos', () => {
  it('mostra o texto do paciente', () => {
    render(<NoPrescriptionNotice userType="patient" />);
    expect(screen.getByRole('note')).toHaveTextContent(NO_PRESCRIPTION_TEXT.patient);
  });

  it('mostra o texto do psicólogo', () => {
    render(<NoPrescriptionNotice userType="psychologist" variant="banner" />);
    expect(screen.getByRole('note')).toHaveTextContent(NO_PRESCRIPTION_TEXT.psychologist);
  });

  it('está nos Termos do paciente e do psicólogo', () => {
    expect(termsPatientMd).toMatch(/O Soliv não receita medicamentos/);
    expect(termsPsychologistMd).toMatch(/não receita medicamentos/);
  });
});
