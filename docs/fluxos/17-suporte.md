# 17. Suporte (paciente e psicólogo)

> **Status:** Pronto, com pendência externa (domínio do Soliv para o e-mail sair).
> **Última verificação:** 2026-10-04 (proteção contra HTML injetado no e-mail, validação de campos, limite de envios).
> **Quem usa:** paciente e psicólogo.

## Resumo

Formulário de "fale com a gente". Cada envio vira um chamado no banco e um e-mail para a equipe (soliv.suporte@gmail.com), enviado pela Resend. A resposta à pessoa é feita por e-mail, fora do app.

## Telas

| Rota | Tela |
|---|---|
| `/paciente/suporte` | Suporte do paciente: e-mail de retorno, telefone (opcional), descrição |
| `/psicologo/suporte` | Suporte do psicólogo: os mesmos campos |

## Como funciona

1. A pessoa preenche e envia. O app chama a edge function (`send-support-request` ou `send-psychologist-support-request`).
2. A função:
   - confere o login;
   - valida o e-mail, a descrição (até 5.000 caracteres) e o telefone (até 30);
   - aplica o limite de **3 envios por hora**;
   - grava o chamado.
3. Manda o e-mail para a equipe com o número do chamado. O texto da pessoa é **escapado**: um HTML colado vira texto e não vira link nem formatação no e-mail.
4. A tela mostra "Solicitação enviada". Em erro, mostra uma mensagem genérica, sem detalhes técnicos.

## Onde está no código

- **Telas**: `src/pages/Support.tsx`, `src/pages/PsychologistSupport.tsx`.
- **Edge functions**: `send-support-request`, `send-psychologist-support-request`; proteções em `supabase/functions/_shared/guards.ts` (`escapeHtml`, `isValidEmail`, `isBoundedText`, `withinRateLimit`).
- **Banco**: `support_tickets` (paciente), `suporte_psicologo` (psicólogo). Secret: `RESEND_API_KEY`.

## Como validar

### Teste manual
1. Enviar com e-mail inválido (`abc`) → recusa ("Confira o e-mail e a descrição").
2. Enviar uma descrição com `<a href="http://x.com">clique</a>` → no e-mail recebido, aparece o texto literal, sem link.
3. Enviar 4 vezes em seguida → a 4ª é recusada ("Muitas solicitações em pouco tempo").

### Conferência no banco
```sql
select id, email, status, created_at from support_tickets order by created_at desc limit 20;
select id, email_retorno, created_at from suporte_psicologo order by created_at desc limit 20;
```

## Pendências

- **Domínio do Soliv** (pendência crítica 2): o e-mail do pedido sai de `nao-responda@solivsaude.com.br`, e o Resend só envia de domínio verificado. Até o domínio ser verificado no Resend, o pedido não chega à equipe.

## Problemas comuns

| Sintoma | Causa provável | O que olhar |
|---|---|---|
| Chamado gravado, mas o e-mail não chegou | `RESEND_API_KEY` ausente ou domínio do remetente não verificado na Resend | Logs da edge function; painel da Resend |
| "Muitas solicitações" | Mais de 3 por hora | Esperado |
