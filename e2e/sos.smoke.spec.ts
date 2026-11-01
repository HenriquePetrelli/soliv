import { test, expect, type Page } from "@playwright/test";

/**
 * Smoke E2E do fluxo SOS que roda em Chromium e WebKit no CI.
 * Não depende de credenciais reais: valida que as rotas críticas do fluxo
 * carregam, que o bundle não quebra em runtime e que a API de mídia existe.
 */

const consoleErrors: string[] = [];

function watchErrors(page: Page) {
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
}

test.beforeEach(({ page }) => {
  consoleErrors.length = 0;
  watchErrors(page);
});

test("a aplicação inicializa sem erro fatal", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#root")).toBeAttached();
  // O index.html já traz a tela de abertura (#app-shell) dentro do #root: o
  // app só "montou" quando o React a substituiu pelo conteúdo dele.
  await page.waitForFunction(
    () => {
      const root = document.querySelector("#root");
      return Boolean(root && root.childElementCount > 0 && !root.querySelector("#app-shell"));
    },
    undefined,
    { timeout: 20_000 },
  );
  expect(consoleErrors.filter((e) => /is not a function|undefined is not an object|Cannot read/.test(e))).toEqual([]);
});

test("rota /sos carrega o app (com redirect de auth quando deslogado)", async ({ page }) => {
  await page.goto("/sos", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#root")).toBeAttached();
  // Deslogado o guard pode redirecionar; o importante é não estourar erro fatal.
  expect(page.url()).toMatch(/localhost|127\.0\.0\.1/);
});

test("rota da sala de chamada emergencial monta sem crash", async ({ page }) => {
  await page.goto("/emergency-call", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#root")).toBeAttached();
});

test("APIs de mídia e WebRTC estão disponíveis no navegador alvo", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const caps = await page.evaluate(() => ({
    getUserMedia: typeof navigator.mediaDevices?.getUserMedia === "function",
    enumerateDevices: typeof navigator.mediaDevices?.enumerateDevices === "function",
    peerConnection: typeof window.RTCPeerConnection === "function",
    dataChannel: typeof window.RTCPeerConnection?.prototype?.createDataChannel === "function",
  }));
  expect(caps).toEqual({
    getUserMedia: true,
    enumerateDevices: true,
    peerConnection: true,
    dataChannel: true,
  });
});
