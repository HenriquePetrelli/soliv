import { Capacitor } from '@capacitor/core';

/**
 * Apple e Google exigem o pagamento da loja para assinaturas de conteúdo
 * digital vendidas dentro do app instalado. Decisão (2026-11-09, opção A):
 * nos apps Android e iOS a assinatura não é vendida nem trocada; quem já
 * assina (pelo site) usa normalmente, e pode cancelar. O site segue vendendo.
 * Atendimento avulso (SOS ou consulta com psicólogo, ao vivo, pessoa a pessoa)
 * continua à venda no app: é a exceção 3.1.3(d) da Apple.
 * Nos apps, nenhum texto aponta para comprar fora (regra das lojas).
 */
export const canSellSubscriptionsHere = () => !Capacitor.isNativePlatform();
