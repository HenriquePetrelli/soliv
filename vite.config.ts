import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { CONTENT_SECURITY_POLICY } from "./src/lib/contentSecurityPolicy";

// CSP e cabeçalhos de segurança só no build publicado.
const securityMeta = (policy = CONTENT_SECURITY_POLICY) => ({
  name: "soliv-security-meta",
  apply: "build" as const,
  transformIndexHtml: (html: string) =>
    html.replace(
      "<meta charset=\"UTF-8\" />",
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`,
    ),
});

// Só no teste de ponta a ponta da transcrição (`--mode e2e-local`, ver
// e2e/transcricao/LEIA-ME.md): o build aponta para o Supabase local em vez do
// projeto de produção, e a CSP do build libera esse endereço. Nenhum outro modo muda.
const PROD_SUPABASE_URL = "https://ihrrgmmsfuvlasmzdmwf.supabase.co";
const LOCAL_SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321";
const LOCAL_SUPABASE_ANON_KEY =
  process.env.E2E_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const localSupabase = () => ({
  name: "soliv-e2e-local-supabase",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (id.endsWith("/src/integrations/supabase/client.ts")) {
      return code
        .replace(PROD_SUPABASE_URL, LOCAL_SUPABASE_URL)
        .replace(/SUPABASE_PUBLISHABLE_KEY = "[^"]+"/, `SUPABASE_PUBLISHABLE_KEY = "${LOCAL_SUPABASE_ANON_KEY}"`);
    }
    return null;
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  },
  optimizeDeps: {
    // Force re-bundle on each dev start to avoid stale Vite cache issues
    force: true,
  },
  plugins: [
    react(),
    securityMeta(
      mode === 'e2e-local'
        ? CONTENT_SECURITY_POLICY.replace("connect-src 'self'", `connect-src 'self' ${new URL(LOCAL_SUPABASE_URL).origin} ws://${new URL(LOCAL_SUPABASE_URL).host}`)
        : CONTENT_SECURITY_POLICY,
    ),
    mode === 'development' && componentTagger(),
    mode === 'e2e-local' && localSupabase(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Só bibliotecas que TODA tela usa ficam em chunks fixos. Antes havia
        // um chunk "radix" com menus, popover, abas e tooltip: o Rollup juntava
        // ali também o react-dom e o arquivo inteiro entrava no carregamento
        // inicial. Sem ele, cada componente do Radix vai junto da tela que usa.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'supabase': ['@supabase/supabase-js'],
          'query': ['@tanstack/react-query'],
        },
      },
    },
  },
}));
