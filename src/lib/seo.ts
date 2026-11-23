// SEO das páginas: endereço oficial (canonical), título, descrição e se o
// Google pode indexar. Só as páginas abertas sem login entram na busca; as
// telas do app (que pedem login) ficam com "noindex".

export const SITE_URL = 'https://solivsaude.com.br';

// Desligado até o lançamento: nenhuma página aparece no Google, para o público
// não chegar ao cadastro antes da hora. No lançamento, trocar para `true`, pôr
// de volta "index, follow" no index.html e a linha Sitemap no robots.txt
// (lista B de docs/pendencias-antes-do-lancamento.md).
export const SEARCH_INDEXING_ENABLED = false;

export const DEFAULT_TITLE = 'Soliv — Bem-estar Emocional';
export const DEFAULT_DESCRIPTION =
  'Soliv conecta pacientes e psicólogos para cuidar do bem-estar emocional com atendimentos online, sons, respiração guiada e SOS.';

export interface PublicPageSeo {
  title: string;
  description: string;
}

// Mantenha igual ao public/sitemap.xml.
export const PUBLIC_PAGES: Record<string, PublicPageSeo> = {
  '/': {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  '/signup-type': {
    title: 'Criar conta | Soliv',
    description: 'Crie sua conta na Soliv como paciente ou como psicólogo.',
  },
  '/patient-signup': {
    title: 'Cadastro de paciente | Soliv',
    description:
      'Cadastre-se na Soliv e tenha psicólogos online, SOS emocional, respiração guiada, sons relaxantes e diário em um só app.',
  },
  '/psychologist-signup': {
    title: 'Cadastro de psicólogo | Soliv',
    description:
      'Psicólogo com CRP ativo: atenda pacientes online pela Soliv, em consultas agendadas e no SOS emocional.',
  },
  '/termos': {
    title: 'Termos de Uso | Soliv',
    description: 'Termos de Uso da Soliv para pacientes.',
  },
  '/termos-psicologo': {
    title: 'Termos de Uso do Psicólogo | Soliv',
    description: 'Termos de Uso da Soliv para psicólogos.',
  },
  '/privacidade': {
    title: 'Política de Privacidade | Soliv',
    description: 'Como a Soliv trata e protege seus dados pessoais, conforme a LGPD.',
  },
};

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname || '/';
}

export function getPageSeo(pathname: string) {
  const path = normalizePath(pathname);
  const page = PUBLIC_PAGES[path];
  return {
    path,
    isPublic: Boolean(page),
    indexable: Boolean(page) && SEARCH_INDEXING_ENABLED,
    title: page?.title ?? DEFAULT_TITLE,
    description: page?.description ?? DEFAULT_DESCRIPTION,
    canonical: `${SITE_URL}${path === '/' ? '/' : path}`,
  };
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/** Aplica o SEO da rota no <head>. As telas com login podem trocar o título depois. */
export function applyPageSeo(pathname: string) {
  const seo = getPageSeo(pathname);
  document.title = seo.title;
  upsertMeta('name', 'description', seo.description);
  upsertMeta('name', 'robots', seo.indexable ? 'index, follow' : 'noindex, nofollow');
  upsertMeta('property', 'og:title', seo.title);
  upsertMeta('property', 'og:description', seo.description);
  upsertMeta('property', 'og:url', seo.canonical);
  upsertMeta('name', 'twitter:title', seo.title);
  upsertMeta('name', 'twitter:description', seo.description);
  upsertCanonical(seo.canonical);
  return seo;
}
