# 09. Repasses aos psicólogos

> **Status:** Pronto, com decisão pendente (SOS atendidos antes de 2026-10-04).
> **Última verificação:** 2026-11-02 (SOS por mensagem: 5 min entre a 1ª resposta e o fim, com 3 respostas do psicólogo). Antes: 2026-10-28 (decisões de produto: SOS só com 5 minutos de chamada; repasses de psicólogo excluído arquivados por 5 anos; SOS antigos sem repasse apagados do livro). Antes: 2026-10-19 (varredura de funcionamento: cada item sabe se foi pago, pendente calculado a partir do livro, consulta interrompida sai do repasse enquanto não paga, confirmação numa operação só com E2E único, semana fechada no horário de Brasília). Antes: 2026-10-04 (só entram chamadas que conectaram; chave Pix sempre atual).
> **Quem usa:** admin (paga) e psicólogo (acompanha).

## Resumo

Cada atendimento realizado vira um item a pagar ao psicólogo:

| Atendimento | Valor | Quando entra |
|---|---|---|
| Consulta agendada | R$ 85,00 | Status `completed` **e** pelo menos 5 min de chamada com os dois conectados |
| SOS | R$ 40,00 | Status `completed` **e** a chamada conectou os dois lados |

Valores fixos, iguais para todos os planos (Essencial, Flex, Completo e empresa). Desde 2026-11-07 (migration `20261107120000_planos_essencial_flex_completo.sql`); antes eram R$ 90,00 e R$ 50,00. Cada item do livro guarda o valor de quando entrou: itens já registrados não mudam.

O admin paga por PIX fora do app e registra no painel com o **código E2E do PIX**. O psicólogo vê o pendente, o pago e os comprovantes.

## Telas

| Rota | Quem | Tela |
|---|---|---|
| `/admin-dashboard` → Repasses | Admin | Lista de psicólogos com valor pendente, "Sincronizar", "Confirmar pagamento" |
| `/psychologist-payments` | Psicólogo | Pendente, pago e "Repasses recebidos" (com E2E e comprovante) |

## Como funciona

1. **Contagem** (`sync_psychologist_payments`): cada consulta ou SOS concluído, em que a chamada conectou (`webrtc_sessions.connected_at`), entra **uma única vez** num livro de itens (`payout_items`, chave única por origem). O valor pendente é **a soma dos itens ainda não pagos** (`recompute_psychologist_pending`), recalculada a cada sincronização e a cada ajuste. Rodar várias vezes não duplica. Entram as semanas fechadas até a última segunda-feira, 0h no horário de Brasília.
2. **Quando roda**: toda segunda às 9h (rotina `weekly-payment-sync`, que chama a edge function `payment-sync`) e quando o admin toca em "Sincronizar".
3. **Pagar**: o admin faz o PIX e, no painel, toca em "Confirmar". Informa o **E2E** (32 caracteres, obrigatório) e, se quiser, o comprovante (imagem ou PDF até 5 MB).
4. **Confirmar** (`confirm-payment` → `confirm_psychologist_payout`, numa operação só no banco): só confirma se o valor pendente ainda for o que o admin viu. Marca cada item como pago (`paid_at`, `payment_log_id`), atualiza os totais e grava o registro com o E2E, tudo junto. Assim, dois cliques ou duas abas não pagam duas vezes, atendimentos novos no meio do caminho não entram sem ser vistos, e o repasse nunca fica pago sem o E2E registrado. E2E já usado é recusado (índice único).
5. **Psicólogo** vê em "Repasses recebidos" o E2E para conferir no extrato e o comprovante (link temporário).
6. **Consulta interrompida** (ficha 04): enquanto o item não foi pago, marcar "Consulta interrompida" tira a consulta do repasse (mesmo depois da sincronização semanal) e o pendente é recalculado. Depois de paga, só pelo suporte. Antes, bastava a consulta ter sido sincronizada para o app recusar.

## Regras

- Só admin confirma pagamento. O psicólogo só lê os próprios dados.
- O CPF e a chave Pix do psicólogo não são visíveis para outros usuários (ficha 20).
- SOS que o paciente redirecionou para outro psicólogo (`psychologist_unavailable`) **não** entra no repasse.
- Psicólogo sozinho na sala não recebe: consulta ou SOS sem a chamada conectar os dois lados não entra, mesmo concluído.
- **Tempo mínimo**: consulta e SOS só entram com **5 minutos** de chamada com os dois conectados (`appointment_call_connected` e `sos_call_payable`). **SOS por mensagem**: 5 minutos entre a primeira resposta do psicólogo e o fim, com pelo menos 3 respostas dele e uma mensagem do paciente. Abaixo disso o SOS não é pago, mas a devolução do SOS do mês ao paciente segue a regra de sempre (só volta se a chamada nunca conectou ou terminou por falha).
- **Psicólogo excluído**: antes de apagar a conta, `admin-delete-psychologist` arquiva os repasses (resumo, histórico de pagamentos e itens) em `archived_psychologist_payouts`, com nome, CPF, CRP e Pix, sem ligação com a conta. Só o admin lê. Os comprovantes ficam no bucket `payment-receipts`, na pasta com o id antigo. A rotina `purge-archived-payouts` apaga depois de 5 anos. Se o arquivo falhar, nada é excluído.
- A chave Pix do repasse pendente acompanha a do cadastro: trocou a chave, o painel do admin mostra a nova na hora (gatilho `sync_payment_pix_key`).

## Onde está no código

- **Telas e componentes**: `src/pages/PsychologistPayments.tsx`; em `src/components/payments/`: `PaymentsPanel`, `ConfirmPayoutDialog`, `PaymentDetailsModal`, `PayoutHistory`.
- **Hooks**: `usePayments`.
- **Edge functions**: `payment-sync` (admin ou rotina agendada), `confirm-payment`.
- **Banco**: `payout_items` (com `paid_at` e `payment_log_id`), `psychologist_payments`, `payment_logs` (E2E único); bucket `payment-receipts`. Funções: `sync_psychologist_payments`, `recompute_psychologist_pending`, `confirm_psychologist_payout`, `report_consultation_problem`, `appointment_call_connected`, `sos_call_connected`; gatilho `sync_payment_pix_key`. Migração mais recente: `20261010211027_982927ac-d7c2-4159-82ba-63c00c401de7.sql`.

## Como validar

### Teste manual
1. Concluir uma consulta (com chamada conectada) e um SOS com o mesmo psicólogo.
2. Admin → Repasses → "Sincronizar" → o psicólogo aparece com R$ 125,00 pendentes.
3. "Sincronizar" de novo → continua R$ 125,00 (não duplica).
4. "Confirmar" com E2E de 32 caracteres → o pendente zera; o psicólogo vê em "Repasses recebidos".
5. Tentar confirmar de novo com o mesmo E2E → recusado.
6. Psicólogo entra sozinho numa consulta e sai → ela não entra no repasse (fica "não realizada").
7. Chamada que conecta e cai antes de 5 min sem voltar → "Interrompida", fora do repasse.
7. Psicólogo troca a chave Pix no perfil → o admin vê a chave nova em Repasses.

### Testes automáticos
`confirmPayoutDialog`.

### Conferência no banco
```sql
-- Itens de um psicólogo (paid_at vazio = ainda a pagar)
select source_type, amount, occurred_at, counted_at, paid_at, backfilled
from payout_items where psychologist_user_id = '<id>' order by occurred_at desc;

-- Totais
select name, total_pending_amount, total_paid_amount, scheduled_pending_count, emergency_pending_count
from psychologist_payments order by total_pending_amount desc;

-- Pagamentos registrados
select created_at, amount_paid, scheduled_count, emergency_count, details from payment_logs
where psychologist_id = '<id>' order by created_at desc;
```

## Pendências

- Nenhuma. Os SOS de antes de 2026-10-04 não serão pagos (decisão de 2026-10-28; o app ainda não estava em produção) e foram apagados do livro.

## Problemas comuns

| Sintoma | Causa provável | O que olhar |
|---|---|---|
| Consulta feita não aparece no repasse | Chamada não conectou (virou `no_show`) ou a sincronização ainda não rodou | Status da consulta; "Sincronizar" |
| SOS ou consulta concluída não entrou | A chamada não chegou a conectar os dois lados | `connected_at` da sessão em `webrtc_sessions` |
| Valor dobrado | Não deve acontecer (chave única no livro) | `payout_items` com o mesmo `source_id` |
| "O valor pendente mudou" ao confirmar | Entrou atendimento novo depois que o admin abriu a tela | Esperado; reabrir e conferir |
| Rotina semanal não roda | Rotina sem o cabeçalho do segredo | `cron.job_run_details` do `weekly-payment-sync` (ficha 21) |
