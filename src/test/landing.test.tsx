import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from '@/pages/Landing';
import { LOGIN_PATH } from '@/lib/authPaths';
import { getPageSeo } from '@/lib/seo';
import { ROUTE_PERMISSIONS } from '@/lib/routePermissions';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

describe('Página de apresentação', () => {
  it('mostra a promessa e leva para criar conta e para o login', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ajuda emocional na hora em que você precisa');
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', LOGIN_PATH);
    expect(within(header).getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/signup-type');
  });

  it('dá destaque ao SOS, com seção própria e atalho no topo', () => {
    const { container } = render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    expect(container.querySelector('section#sos')).not.toBeNull();
    expect(screen.getByRole('link', { name: /Como funciona o SOS/ })).toHaveAttribute('href', '#sos');
    expect(container.querySelector('section#comunidade')).not.toBeNull();
    expect(container.querySelector('section#habitos')).not.toBeNull();
  });

  it('mantém o CVV 188 e o SAMU 192 à vista', () => {
    render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'CVV 188' })).toHaveAttribute('href', 'tel:188');
    expect(screen.getByRole('link', { name: 'SAMU 192' })).toHaveAttribute('href', 'tel:192');
  });

  it('o login em /entrar é público e tem SEO próprio', () => {
    expect(ROUTE_PERMISSIONS.public).toContain(LOGIN_PATH);
    expect(getPageSeo(LOGIN_PATH).isPublic).toBe(true);
  });
});
