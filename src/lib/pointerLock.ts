/**
 * Menus e janelas do Radix travam os cliques da página (`pointer-events: none`
 * no body) enquanto estão abertos. Quando um item de menu abre uma janela, o
 * menu fecha e a janela abre ao mesmo tempo, e a trava às vezes fica para trás
 * depois que a janela fecha: a tela aparece normal, mas nada responde ao toque.
 *
 * Depois de fechar uma janela (e da animação de saída), se não restou nenhuma
 * janela ou menu aberto, a trava é retirada.
 */
const OPEN_LAYER = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
].join(', ');

const EXIT_ANIMATION_MS = 350;

export const releaseStuckPointerLock = () => {
  if (typeof document === 'undefined') return;
  globalThis.setTimeout(() => {
    // A página (ou, nos testes, o ambiente) pode ter sumido nesse meio-tempo.
    if (typeof document === 'undefined' || !document.body) return;
    const { body } = document;
    if (body.style.pointerEvents !== 'none') return;
    if (document.querySelector(OPEN_LAYER)) return;
    body.style.removeProperty('pointer-events');
  }, EXIT_ANIMATION_MS);
};
