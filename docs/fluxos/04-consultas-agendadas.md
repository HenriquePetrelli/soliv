# 04. Consultas agendadas

> **Status:** Pronto.
> **Última verificação:** 2026-10-29 (psicólogo excluído: consultas ficam no histórico do paciente com o nome guardado; as ativas são canceladas com aviso e devolução). Antes: 2026-10-28 (decisões de produto: anotação privada do psicólogo separada do resumo; consulta depois do fim de um plano que não renova não é marcada e, se já estava, é cancelada quando o plano termina). Antes: 2026-10-17 (segunda varredura: listas atualizam sozinhas, aceitar não ressuscita consulta cancelada, rotina de expiração não recusa o que acabou de ser aceito, pedido sem duplicar, horário proposto protegido no banco, lembretes do horário novo, plano vencido, psicólogo avisado do pedido expirado). Antes: 2026-10-05 (varredura das regras para paciente e psicólogo: horários de outros pacientes aparecem ocupados, fuso de Brasília, dois pedidos simultâneos, horário proposto reservado, cancelar com novo horário proposto, calendário até o limite do psicólogo).
> **Quem usa:** paciente Flex ou Completo (1 consulta por mês; no Flex, no lugar do SOS, incluindo o plano da empresa) e psicólogo aprovado.

## Resumo

O paciente escolhe psicólogo, dia e horário dentro da agenda real dele. O psicólogo aceita, recusa ou propõe outro horário. No dia, os dois entram na sala de vídeo (ficha 03). A consulta só conta como realizada com pelo menos **5 minutos de chamada com os dois conectados**. Se não aconteceu ou foi interrompida antes disso, a consulta do mês volta para o paciente e ela não entra no repasse.

## Telas

| Rota | Quem | Tela |
|---|---|---|
| `/appointments` | Paciente | Agendar, próximas consultas, histórico (com "Avaliar" e "Relatar problema") |
| `/psychologist-dashboard` (Início) | Psicólogo | Resumo: consultas de hoje, próximos dias, pedidos para responder e a próxima consulta do dia |
| `/psicologo/consultas` | Psicólogo | Aba Próximas (pedidos, hoje, próximos dias) e aba Histórico ("Consulta interrompida", resumo da sessão) |
| `/consultation-call/:appointmentId` | Os dois | Sala da consulta |
| `/notifications`, `/psychologist-notifications` | Os dois | Avisos de pedido, confirmação, mudança e lembrete |

## Como funciona

### 1. Agendar
1. O paciente escolhe o psicólogo numa lista com nome, especialidade, CRP e quantas consultas e SOS ele já concluiu no app e a nota real dos pacientes, com o número de avaliações (função `get_psychologists_public_stats`, que devolve só os totais de psicólogos aprovados). Sem avaliação, aparece "Sem avaliações ainda". Cidade, estado e endereço do psicólogo não aparecem. Depois vê só os horários livres: horário-padrão combinado com exceções do dia, sem férias, sem conflito com outras consultas, respeitando antecedência mínima, intervalo entre consultas e até quantos dias à frente (ficha 05).
2. Confirma. A edge function `appointments` confere de novo, no servidor, a agenda, os conflitos e o plano Flex ou Completo (assinado e dentro da validade), e **reserva a cota do mês numa única operação** (dois pedidos ao mesmo tempo não passam os dois). Se a consulta não for criada, a reserva é desfeita. Também limita a 10 tentativas por hora. Toda consulta criada pelo app é do tipo `regular` (o servidor ignora outro tipo enviado) e a observação é cortada em 1.000 caracteres. Cada pedido leva um id gerado no aparelho: se a resposta se perde e a pessoa tenta de novo, o servidor devolve o pedido já criado (sem outro pedido e sem "limite do mês já usado").
3. A consulta nasce como `pending` e o psicólogo é notificado (app e push).

### 2. Resposta do psicólogo (`psychologist-schedule`)
- **Aceitar** → `scheduled`; o paciente é avisado. A cota do mês já foi reservada no pedido.
- **Recusar** → `declined`; a cota volta.
- **Propor outro horário** → `reschedule_proposed`. Só horários livres da agenda dele (mesma lista que o paciente vê). O horário proposto fica reservado até o paciente responder. O paciente aceita (o horário muda; o servidor confere de novo conflito e agenda, ex.: férias marcadas depois) ou recusa (a cota volta).
- **Sem resposta**: o pedido expira em 24 h ou quando o horário chega (`auto-decline-appointments`, de hora em hora); a cota volta, o paciente é avisado e o psicólogo recebe "Pedido de consulta expirou". A rotina só recusa o que continua sem resposta no momento de gravar (um aceite feito no mesmo instante vale).
- **Respostas ao mesmo tempo**: aceitar, recusar ou propor só grava se a consulta ainda está como o psicólogo viu. Se o paciente cancelou nesse meio-tempo, aparece "Esta consulta mudou enquanto você respondia" e a consulta continua cancelada.
- **Horário proposto** fica protegido também pelo banco (`prevent_appointment_overlap`): um paciente pedindo e o psicólogo propondo o mesmo horário a outro paciente, ao mesmo tempo, não passam os dois.

### 3. Lembretes
24 h e 1 h antes, no app e por push (`queue_appointment_reminders`, a cada 10 min). Se a consulta muda de horário (proposta aceita), os lembretes valem para o horário novo (`reset_appointment_reminders`).

### 3a. Listas em dia
As telas de consultas do paciente (Próximas) e do psicólogo (Início, Consultas, pedidos) se atualizam sozinhas quando chega um aviso de consulta (pedido, confirmação, proposta, cancelamento) e ao voltar para o app.

### 4. Atendimento
1. A sala abre **10 min antes** e fica aberta até **15 min depois do fim previsto** (duração padrão de 50 min). Ao entrar, a consulta vira `in_progress`.
2. Se o outro não entra em 2 min após o horário, aparece o botão **Avisar**: manda push "Estão esperando você na consulta", no máximo a cada 3 min.
3. O cronômetro compartilhado avisa aos 5 min finais e ao zerar, mas não derruba a chamada.

### 5. Conclusão
- Só conta como concluída com pelo menos **5 minutos de chamada com os dois conectados** (`webrtc_sessions.media_seconds`, somado pelo banco a partir do aviso que cada lado manda a cada 20 s enquanto a mídia passa; o app não consegue alterar). Vale para o botão "Concluir" do psicólogo, para o "Encerrar" da sala e para a rotina. Salas criadas antes desta regra seguem a anterior (bastava conectar).
- Quem sai da sala sem a outra pessoa ter entrado não encerra a consulta: ela continua "em andamento" até o fim da janela (a outra pessoa ainda pode entrar), e o app avisa isso.
- Salvar o resumo da sessão no histórico não muda o status da consulta. **O paciente vê o resumo** no histórico dele (a tela do psicólogo avisa). Ao lado fica a **anotação privada**, que só o psicólogo da consulta lê (tabela `appointment_private_notes`, decisão de 2026-10-28); ela também aparece no histórico do paciente na tela do psicólogo durante a consulta seguinte. Até 10.000 caracteres; a mensagem de uma proposta, até 1.000.
- A rotina `finalize-stale-appointments` (a cada 10 min) fecha o que ficou aberto 30 min após o fim previsto:
  - **5 min ou mais de chamada** → `completed`, e entra no repasse do psicólogo (ficha 09);
  - **conectou mas não chegou a 5 min** (caiu e ninguém conseguiu voltar) → `cancelled` como "Interrompida", a consulta do mês volta para o paciente, não entra no repasse e os dois são avisados;
  - **não conectou** → `no_show`, a consulta do mês volta para o paciente e ele é avisado.
- Na sala, se os dois estão presentes mas o áudio/vídeo não passa por 45 s, aparece "A chamada não está conectando": os dois podem "Tentar de novo" (conexão nova) e o psicólogo pode "Marcar como interrompida" na hora (devolve a consulta do mês).

### 6. Avaliação
- Ao fim da chamada, o paciente avalia (nota e comentário).
- Se fechou o app antes, o convite aparece ao reabrir (dá para pular).
- No histórico, o botão **Avaliar** vale até 30 dias depois. A nota entra na média do psicólogo.

### 7. Cancelamento (`cancel_appointment`)

| Quem cancela | Quando | A consulta do mês volta? |
|---|---|---|
| Paciente | Pedido ainda não confirmado (inclusive com novo horário proposto), ou com 24 h ou mais de antecedência | Sim |
| Paciente | Com menos de 24 h | Não, conta como usada (o app avisa antes) |
| Psicólogo | Qualquer momento antes do início | Sim, e o paciente é avisado |

Com novo horário proposto, o limite "já começou" vale para o horário proposto (antes, passado o horário original, não dava mais para cancelar).

Toda devolução da consulta do mês (cancelar, recusar, expirar, não realizada, interrompida) passa por `release_appointment_quota`: só devolve se a cota marcada é do mesmo mês em que a consulta foi pedida. Assim, recusar em outubro um pedido feito em setembro não libera uma segunda consulta em outubro.

### 8. Problema técnico
- **Paciente**: no histórico, **Relatar problema** (do horário da consulta até 48 h depois). O psicólogo é avisado.
- **Psicólogo**: no histórico, **Consulta interrompida**. Cancela a consulta, devolve a consulta do mês ao paciente, avisa o paciente e tira do repasse. É recusado se a consulta já entrou num repasse pago.

## Regras

- **Psicólogo excluído**: as consultas ficam no histórico do paciente com o nome do psicólogo (`psychologist_name`), sem avaliação pendente; as ativas são canceladas com aviso e a consulta do mês volta (ficha 19).

- **Plano que não vai renovar**: a consulta precisa ser marcada antes do fim do plano ("Seu plano termina em DD/MM. Agende até essa data ou renove o plano."). As que já estavam marcadas para depois são canceladas quando o plano termina (ficha 08).

- Status: `pending`, `scheduled`/`confirmed`, `reschedule_proposed`, `in_progress`, `completed`, `declined`, `cancelled`, `no_show`.
- O paciente **não** altera a consulta direto: tudo passa por funções do banco ou pela edge function, com transições permitidas definidas (`PSYCHOLOGIST_TRANSITIONS` em `psychologist-schedule`).
- Cada psicólogo vê só as próprias consultas. "Hoje" e "Próximas" não repetem consulta.
- Horários sempre no fuso de Brasília.

## Onde está no código

- **Telas e componentes**: `src/pages/Appointments.tsx`, `src/components/appointments/` (`AppointmentForm`, `PsychologistSelection`, `AppointmentHistory`, `CancelAppointmentDialog`, `ConsultationVideoCall`, `ReportConsultationProblemDialog`), `src/components/psychologist/ConsultationHistory.tsx`.
- **Hooks**: `useAppointmentUpdates` (atualiza as listas), `useAppointments`, `useAvailableTimeSlots`, `usePsychologistSchedule`, `useAppointmentVideoCall`, `usePendingCallFeedback`.
- **Regras puras**: `src/lib/appointmentCancellation.ts`, `appointmentRating.ts`, `consultationWindow.ts`, `consultationProblem.ts`, `bookingRules.ts`.
- **Edge functions**: `appointments` (criar e listar), `psychologist-schedule` (aceitar, recusar, propor, concluir), `auto-decline-appointments`, `send-appointment-notification`, `notification-push`.
- **Banco**: `appointments`, `appointment_reminders_sent`, `appointment_problem_reports`, `session_feedback`, `subscribers` (cota). Funções: `release_appointment_quota`, `appointment_call_connected` (conectou e 5 min de chamada), `report_call_media`, `cancel_appointment`, `get_or_create_appointment_webrtc_session`, `notify_consultation_waiting`, `report_consultation_problem`, `finalize_stale_appointments`, `queue_appointment_reminders`. Gatilhos `guard_appointment_client_update` e `track_call_connected` (em `webrtc_sessions`). Gatilho `reset_appointment_reminders`. Migração mais recente: `20261010020833_86f25c89-6910-4bb4-81e1-7f1fe2948f03.sql`.

## Como validar

### Teste manual
1. **Agendar** (paciente Completo) → aparece "Aguardando confirmação"; o psicólogo recebe a notificação.
2. **Aceitar** → o paciente recebe "Consulta confirmada".
3. **Propor outro horário** → o paciente aceita → o horário muda nos dois lados.
4. **Segunda consulta no mês** → aviso de cota usada.
5. **Cancelar** com mais de 24 h → o aviso diz que a consulta do mês volta → agendar outra funciona.
6. **Dia da consulta**: 10 min antes, o botão "Entrar" fica ativo → os dois entram → chamada conecta → o psicólogo encerra → o paciente avalia.
7. **Ninguém aparece**: entrar sozinho → depois de 2 min, "Avisar" → o outro recebe push. Deixar passar 30 min após o fim → a consulta vira "Não realizada" e a consulta do mês volta.
8. **Saiu sozinho**: o psicólogo entra, ninguém aparece, ele sai → aviso "Você saiu da sala"; a consulta continua "Em andamento" e depois vira "Não realizada", sem entrar no repasse.
9. **Duplo agendamento**: dois toques rápidos em "Agendar" (ou duas abas) → só uma consulta é criada.
10. **Histórico**: "Avaliar" em consulta concluída; "Relatar problema" (paciente) e "Consulta interrompida" (psicólogo).

### Testes automáticos
`appointmentRules` (listas em dia, pedido sem duplicar), `availableTimeSlots`, `bookingRules`, `consultationWindow`, `consultationProblem`, `consultasChatRules`, `appointmentFeedback`, `upcomingConsultationsStartCall`, `consultationCallRouteAccess`, `consultationVideoCallSession`, `webrtcSessionReuse.e2e`.

### Conferência no banco
```sql
-- Consultas de um paciente
select id, status, scheduled_at, duration, video_room_id, cancellation_reason
from appointments where patient_id = '<id>' order by scheduled_at desc;

-- A chamada conectou? Quanto tempo os dois ficaram em chamada?
select a.id, a.status, s.connected_at, s.media_seconds, s.media_tracked, (s.connected_at is not null) as conectou
from appointments a left join webrtc_sessions s on s.id::text = a.video_room_id
where a.id = '<id da consulta>';

-- Cota Completo do mês
select subscription_tier, appointments_used_this_month, appointments_last_used
from subscribers where user_id = '<id do paciente>';

-- Relatos de problema
select * from appointment_problem_reports order by created_at desc limit 20;
```

## Pendências


## Problemas comuns

| Sintoma | Causa provável | O que olhar |
|---|---|---|
| Nenhum horário disponível | Psicólogo sem horário-padrão, de férias ou com antecedência mínima maior que o dia escolhido | Ficha 05; `psychologist_availability`, `psychologist_vacations`, `psychologist_booking_rules` |
| "Seu plano não inclui consultas" | Paciente não é Completo (ou plano vencido) | `subscribers` |
| Botão "Entrar" não aparece | Fora da janela (10 min antes até 15 min depois do fim) ou consulta não confirmada | Status e horário da consulta |
| Psicólogo não consegue concluir | A chamada nunca conectou | `webrtc_sessions.connected_at`; a rotina vai marcar `no_show` |
| Encerrou e a consulta continuou "Em andamento" | A outra pessoa nunca entrou, ou a chamada teve menos de 5 min | Esperado; a rotina fecha como `no_show` ou "Interrompida" (e devolve a consulta do mês) |
| Psicólogo não consegue concluir: "menos de 5 minutos" | A chamada caiu antes de 5 min de conversa | Marcar como "Consulta interrompida" (devolve a consulta do mês) |
| Consulta ficou "Em andamento" | Ninguém concluiu | A rotina fecha 30 min após o fim previsto; conferir `cron.job_run_details` (ficha 21) |
