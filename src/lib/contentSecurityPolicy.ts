/**
 * Política de segurança de conteúdo (CSP) do app publicado. O navegador só
 * executa scripts do próprio app e só conversa com o Supabase, o Firebase e
 * o coletor de erros do Grafana Cloud:
 * se alguém conseguir injetar HTML (XSS), o script injetado não roda e não
 * consegue mandar o login da pessoa para fora.
 *
 * Só no build de produção (o servidor de desenvolvimento usa scripts inline).
 */

/** Projeto do Supabase do app (o mesmo de src/integrations/supabase/client.ts). */
export const SUPABASE_HOST = 'ihrrgmmsfuvlasmzdmwf.supabase.co';

// Hash do onload="this.media='all'" que carrega a fonte sem travar a página.
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // A fonte (Poppins) é servida pelo próprio app (public/fonts): sem script
  // inline nem Google Fonts.
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  // Só o projeto do Soliv no Supabase: com "*.supabase.co", um script injetado
  // poderia mandar dados para um projeto Supabase de outra pessoa.
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} https://*.googleapis.com https://*.grafana.net`,
  `frame-src 'self' blob: https://${SUPABASE_HOST}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
