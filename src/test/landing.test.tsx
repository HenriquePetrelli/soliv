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
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Um lugar seguro para cuidar da sua mente');
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', LOGIN_PATH);
    expect(within(header).getByRole('link', { name: 'Criar conta' })).toHaveAttribute('href', '/signup-type');
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
