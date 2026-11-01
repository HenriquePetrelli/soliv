import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { CONTENT_SECURITY_POLICY } from "./src/lib/contentSecurityPolicy";

// CSP e cabeçalhos de segurança só no build publicado.
const securityMeta = () => ({
  name: "soliv-security-meta",
  apply: "build" as const,
  transformIndexHtml: (html: string) =>
    html.replace(
      "<meta charset=\"UTF-8\" />",
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`,
    ),
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
    securityMeta(),
    mode === 'development' && componentTagger(),
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
