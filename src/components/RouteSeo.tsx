import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyPageSeo } from '@/lib/seo';

/**
 * Atualiza título, descrição, canonical e robots a cada troca de rota.
 * Fica antes das rotas: as telas que definem o próprio título (document.title)
 * rodam depois e prevalecem.
 */
export default function RouteSeo() {
  const { pathname } = useLocation();
  useEffect(() => {
    applyPageSeo(pathname);
  }, [pathname]);
  return null;
}
