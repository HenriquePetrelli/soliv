# Desempenho: carregamento inicial

> **Última verificação:** 2026-11-01. Medido com o build publicado (`vite preview`) no Chromium, com rede 4G simulada (150 ms de latência, 1,6 Mbps) e processador 4x mais lento (celular intermediário).

## Resultado

| Métrica | Antes | Depois |
|---|---|---|
| Primeira coisa na tela (first paint) | ~2,4 s (tela branca até o JS rodar) | **~0,9 s** (tela de abertura do próprio HTML) |
| JavaScript do carregamento inicial (gzip) | 207 KB | **168 KB** (−19%) |
| Domínios externos antes do texto aparecer | 2 (Google Fonts) | 0 |
| Abas pré-carregadas disputando a rede com a Home | 6 de uma vez, logo no início | uma por vez, só depois da página carregar |

## O que foi feito (padrões de apps grandes)

1. **App shell no HTML.** `index.html` traz a tela de abertura (logo + barra) dentro do `#root`, com CSS inline e as cores claro/escuro. Aparece assim que o HTML chega; o React a substitui ao montar. Antes a tela ficava branca até baixar e rodar ~200 KB de JavaScript.
2. **Fonte servida pelo app.** Poppins em `public/fonts` (subconjunto latino, 5 pesos de ~8 KB), com `preload` dos dois pesos mais usados. Antes vinha do Google Fonts: dois domínios a mais para resolver e conectar. A CSP ficou mais restrita (sem `fonts.googleapis.com`, `fonts.gstatic.com` nem o hash do `onload`).
3. **Code splitting por perfil.** O chunk manual `radix` foi removido (ele levava react-dom, menus, popover, abas e tooltip para o carregamento inicial). Layouts de psicólogo e admin, a verificação em duas etapas e o pedido de aceite dos Termos (com o texto completo dos documentos) viraram `lazy`: o paciente e quem está deslogado não baixam esse código.
4. **Trabalho secundário depois da primeira tela.** `src/lib/idle.ts` (`afterPageSettles`): espera o `load` e um momento ocioso. Usado por:
   - pré-carregamento das abas principais (`preloadCoreRoutesFor`), uma por vez e nunca com "economia de dados" ou rede 2G/3G;
   - push e conferência de bloqueio da conta (`DeferredMount` no `App.tsx`).
5. **Pré-carregar na intenção.** Os itens do menu (barra inferior e menu lateral) baixam a tela ao passar o mouse ou encostar o dedo, então a troca de aba continua instantânea mesmo sem o pré-carregamento antecipado.

## Como medir de novo

```bash
npm run build
npx vite preview --host 127.0.0.1 --port 4173
```

No Chrome: DevTools → Lighthouse (mobile) ou Performance com "Fast 4G" e CPU 4x. Conferir também o tamanho do JS inicial: os arquivos listados no `dist/index.html` (`<script>` e `modulepreload`).

## Próximos passos possíveis

- **Service worker com cache dos arquivos** (ex.: `vite-plugin-pwa`): reabrir o app ficaria quase instantâneo. Precisa conviver com o `firebase-messaging-sw.js` e com a atualização frequente pela Lovable (avisar "nova versão" em vez de servir versão velha), por isso ficou de fora.
- **Cabeçalhos de cache na hospedagem**: `/assets/*` (nome com hash) com `Cache-Control: public, max-age=31536000, immutable`; `index.html` sem cache. Depende do que a hospedagem permite configurar.
- `sonner` (28 KB) e os esqueletos de todas as telas (`PageSkeletons`, 24 KB) ainda estão no pacote inicial.
