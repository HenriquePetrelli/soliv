import { isProjectLovableHost } from '../../supabase/functions/_shared/origin';

/**
 * Proteção contra clickjacking: outro site não pode exibir o Soliv dentro de
 * um iframe invisível e induzir a pessoa a clicar (ex.: em "Excluir conta").
 * O normal seria o cabeçalho X-Frame-Options, que a hospedagem da Lovable não
 * deixa configurar; então o próprio app confere quem o está exibindo.
 *
 * Liberados: o próprio site, o editor da Lovable, as prévias deste projeto e
 * o localhost. Outros sites em *.lovable.app não: qualquer pessoa publica lá.
 * Quando o navegador não informa quem é o site de fora (Firefox), o app abre
 * normalmente, para não quebrar o preview da Lovable.
 */

const TRUSTED_ANCESTOR =
  /^https:\/\/([a-z0-9-]+\.)*(lovable\.dev|gptengineer\.app)$|^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

const isTrustedAncestor = (origin: string): boolean => {
  if (TRUSTED_ANCESTOR.test(origin)) return true;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.origin === origin && isProjectLovableHost(url.hostname);
  } catch {
    return false;
  }
};

export interface FrameContext {
  isFramed: boolean;
  ownOrigin: string;
  ancestorOrigin: string | null;
}

export const isUntrustedFrame = ({ isFramed, ownOrigin, ancestorOrigin }: FrameContext): boolean => {
  if (!isFramed || !ancestorOrigin) return false;
  if (ancestorOrigin === ownOrigin) return false;
  return !isTrustedAncestor(ancestorOrigin);
};

export const currentFrameContext = (): FrameContext => {
  let isFramed = false;
  try {
    isFramed = window.self !== window.top;
  } catch {
    isFramed = true; // acesso ao topo bloqueado: está num iframe de outra origem
  }
  let ancestorOrigin: string | null = window.location.ancestorOrigins?.[0] ?? null;
  if (!ancestorOrigin && isFramed && document.referrer) {
    try {
      ancestorOrigin = new URL(document.referrer).origin;
    } catch {
      ancestorOrigin = null;
    }
  }
  return { isFramed, ownOrigin: window.location.origin, ancestorOrigin };
};

/** Troca a página por um aviso com link para abrir o Soliv fora do outro site. */
export const renderFrameBlockedNotice = () => {
  document.title = 'Soliv';
  const url = window.location.href;
  document.body.innerHTML = '';
  const box = document.createElement('div');
  box.setAttribute('style', 'font-family: system-ui, sans-serif; max-width: 360px; margin: 64px auto; padding: 24px; text-align: center; line-height: 1.5;');
  const text = document.createElement('p');
  text.textContent = 'Por segurança, o Soliv não abre dentro de outros sites.';
  const link = document.createElement('a');
  link.href = url;
  link.target = '_top';
  link.rel = 'noopener';
  link.textContent = 'Abrir o Soliv';
  link.setAttribute('style', 'display: inline-block; margin-top: 12px; color: #7C3AED; font-weight: 600;');
  box.append(text, link);
  document.body.append(box);
};
