import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RouteSkeleton from '@/components/skeletons/RouteSkeleton';
import { hasRouteSkeleton } from '@/components/skeletons/routeSkeletons';

// Todos os endereços declarados no App, com parâmetros trocados por um valor.
const appRoutes = [...readFileSync('src/App.tsx', 'utf8').matchAll(/path="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((path) => path !== '*')
  .map((path) => path.replace(/:[A-Za-z]+/g, 'x'));

describe('skeleton de cada tela', () => {
  it('todo endereço do app tem o próprio skeleton', () => {
    expect(appRoutes.length).toBeGreaterThan(40);
    expect(appRoutes.filter((path) => !hasRouteSkeleton(path))).toEqual([]);
  });

  it('o Perfil não mostra o skeleton da Home', () => {
    render(
      <MemoryRouter initialEntries={['/profile']}>
        <RouteSkeleton />
      </MemoryRouter>,
    );
    expect(screen.getAllByLabelText('Carregando')).toHaveLength(1);
    expect(document.querySelectorAll('.grid-cols-2')).toHaveLength(0);
  });

  it('telas com cabeçalho roxo já mostram o título', () => {
    render(
      <MemoryRouter initialEntries={['/questionarios']}>
        <RouteSkeleton />
      </MemoryRouter>,
    );
    expect(screen.getByText('Questionários do mês')).toBeInTheDocument();
  });
});

describe('skeleton das telas internas do paciente', () => {
  it.each([
    ['/habitos/novo', 'Adicionar hábito'],
    ['/habitos/novo/water', 'Beber água'],
    ['/habitos/abc/editar', 'Editar hábito'],
    ['/questionarios/gad7', 'Ansiedade (GAD-7)'],
    ['/questionarios/phq9', 'Humor (PHQ-9)'],
    ['/safety-plan/novo', 'Novo plano de segurança'],
    ['/safety-plan/abc', 'Editar plano de segurança'],
    ['/safety-plan/abc/ver', 'Plano de segurança'],
    ['/sounds/category/sleep', 'Para Dormir'],
    ['/sounds/subcategory/nature', 'Sons da Natureza'],
    ['/sounds/player/sleep-1', '432 Hz'],
    ['/support-group/x', 'Grupo de Apoio'],
  ])('%s mostra o título da tela (%s)', (path, title) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <RouteSkeleton />
      </MemoryRouter>,
    );
    expect(screen.getByText(title)).toBeInTheDocument();
  });
});
