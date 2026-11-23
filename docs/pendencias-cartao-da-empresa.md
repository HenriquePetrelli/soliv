# Pendências que dependem do cartão e da conta da empresa

O que está parado esperando o **cartão de crédito da empresa (Nubank PJ)** ou a **conta bancária / CNPJ** da empresa. Quando o cartão chegar, fazer tudo de uma vez nesta lista.

Ao resolver um item, marque o quadradinho e atualize a pendência correspondente em `docs/pendencias-antes-do-lancamento.md`.

> Registrado em 2026-11-23. Valores conferidos nas telas dos serviços nessa data; podem mudar.

## Precisa do cartão para começar

- [ ] **Cloudflare Realtime — TURN das chamadas de vídeo (pendência 5).**
  - Custo: US$ 0/mês; 1.000 GB por mês grátis, depois US$ 0,05 por GB.
  - Por quê: sem TURN, parte das chamadas (SOS e consulta) não conecta no 4G e em redes de empresa.
  - Passos: Cloudflare → Realtime → TURN Server → Create TURN key (`soliv`) → cadastrar `CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_API_TOKEN` em Supabase → Edge Functions → Secrets → ligar o aviso de cobrança (Manage Account → Billing → Notifications, ex.: a partir de US$ 1). Detalhes: `docs/guia-configuracoes-externas.md`, seção 5.
- [ ] **Apple Developer Program — app iOS (pendência 25).**
  - Custo: US$ 99 por ano.
  - Antes: a conta como empresa pede o **D-U-N-S** do CNPJ (grátis, mas pode levar semanas; pedir já).
  - Passos: `docs/publicacao-lojas.md`.
- [ ] **Google Play Console — app Android (pendência 25).**
  - Custo: US$ 25, uma vez só.
  - Passos: `docs/publicacao-lojas.md`.

## Precisa da conta bancária e do CNPJ (não do cartão)

- [ ] **Stripe em modo real (pendência 17).** Ativar a conta (Configurações → Ativar pagamentos) com CNPJ, dados do responsável, endereço e **conta bancária da empresa** para receber. Sem isso o app não cobra de verdade. O resto (planos reais, secrets, webhook) fica na lista B de `docs/pendencias-antes-do-lancamento.md`.

## Já pagos: passar para o cartão da empresa

Serviços que já estão em uso. Conferir em qual cartão estão hoje e trocar para o da empresa, para as despesas ficarem no CNPJ.

- [ ] **Supabase Pro** (banco, login, edge functions). Organization → Billing → Payment methods.
- [ ] **Lovable** (site publicado e IA da transcrição das chamadas). Settings → Plans & Billing.
- [ ] **Registro.br** (`solivsaude.com.br`). Conferir a renovação automática e o titular do domínio (CPF ou CNPJ).

## Opcionais, mais para frente

- [ ] **E-mail da equipe** (ex.: `contato@solivsaude.com.br`, para os alertas do Grafana, pendência 29): o Zoho Mail grátis ou o redirecionamento para um Gmail **não pedem cartão**; o Google Workspace pede (cerca de R$ 30 por mês por pessoa).
- [ ] **Resend** (e-mails do app): o plano grátis tem limite diário de envios; com cadastros abertos, pode ser preciso o plano pago. Conferir antes do lançamento (lista B).
- [ ] **Grafana Cloud**: segue no plano grátis (~53,6 mil das 100 mil execuções de checagem por mês). Só precisa de cartão se passar das cotas.
