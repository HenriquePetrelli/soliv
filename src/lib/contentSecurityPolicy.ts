/**
 * Política de segurança de conteúdo (CSP) do app publicado. O navegador só
 * executa scripts do próprio app e só conversa com o Supabase, o Firebase e
 * o coletor de erros do Grafana Cloud:
 * se alguém conseguir injetar HTML (XSS), o script injetado não roda e não
 * consegue mandar o login da pessoa para fora.
 *
 * Só no build de produção (o servidor de desenvolvimento usa scripts inline).
 */

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
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.googleapis.com https://*.grafana.net",
  "frame-src 'self' blob: https://*.supabase.co",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
