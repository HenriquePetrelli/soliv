import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminNav } from '@/components/admin/AdminNav';
import { ADMIN_NAV_ITEMS, adminNavGroupOf, isAdminSection } from '@/components/admin/adminNavConfig';

describe('menu do admin', () => {
  it('mostra os grupos, marca a seção ativa e o número de pendências', () => {
    const onSelect = vi.fn();
    render(<AdminNav active="patients" onSelect={onSelect} onLogout={() => {}} badges={{ psychologists: 3 }} />);
    for (const group of ['Geral', 'Pessoas', 'Atendimento', 'Moderação', 'Financeiro', 'Conta']) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Pacientes' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('3 pendentes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Empresas/ }));
    expect(onSelect).toHaveBeenCalledWith('companies');
  });

  it('cada seção tem um grupo, e só seções válidas são aceitas na URL', () => {
    expect(ADMIN_NAV_ITEMS).toHaveLength(11);
    expect(ADMIN_NAV_ITEMS.every((item) => adminNavGroupOf(item.value) !== '')).toBe(true);
    expect(isAdminSection('payments')).toBe(true);
    expect(isAdminSection('qualquer')).toBe(false);
    expect(isAdminSection(null)).toBe(false);
  });
});
