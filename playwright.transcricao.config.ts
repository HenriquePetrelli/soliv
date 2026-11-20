import { defineConfig } from "@playwright/test";

/**
 * Teste de ponta a ponta da transcrição das chamadas, no Supabase LOCAL.
 * Passo a passo em `e2e/transcricao/LEIA-ME.md`. Fica fora do
 * `playwright.config.ts` (smoke do CI), que não sobe o Supabase.
 */
const PORT = Number(process.env.E2E_PORT ?? 4174);
export default defineConfig({
  testDir: "./e2e/transcricao",
  timeout: 4 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
  },
  webServer: {
    command: `npx vite build --mode e2e-local && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
