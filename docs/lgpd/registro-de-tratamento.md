# Registro das operações de tratamento de dados (LGPD art. 37)

> Documento interno, montado a partir do código em 24/09/2026 e atualizado em 28/09/2026 com as decisões do responsável (controlador LTDA, só maiores de 18, guarda de 5 anos dos atendimentos, falhas técnicas avaliadas caso a caso). Descreve o que o Soliv **de fato** coleta, onde guarda, por quanto tempo e com quem compartilha. Precisa ser revisado por quem responde juridicamente pelo app antes de servir de base para a política de privacidade. Itens marcados com **[DECIDIR]** não têm resposta no código.

## Controlador e encarregado

- Controlador: **[RAZÃO SOCIAL] LTDA** (sociedade limitada, com três sócios), CNPJ **[CNPJ]**, **[ENDEREÇO]**.
- Encarregado (DPO) e canal do titular: **[NOME]** — **[E-MAIL]**.
- Público: **somente maiores de 18 anos**.

## Titulares

Pacientes, psicólogos, administradores.

## Dados sensíveis (art. 11)

Quase tudo o que o paciente registra é **dado pessoal sensível referente à saúde**: sintomas, humor, diário, plano de segurança, depoimentos em grupos, histórico de SOS e consultas, avaliações de atendimento. Base legal proposta: **consentimento específico e destacado** (art. 11, I) para o uso do app, e **tutela da saúde, em procedimento realizado por profissionais de saúde** (art. 11, II, "f") para o atendimento psicológico (SOS e consultas). Obrigação legal (art. 11, II, "a") para a guarda dos registros de atendimento por 5 anos (Resolução CFP 01/2009). **Pendente no app:** o cadastro ainda não tem o passo de consentimento destacado nem a confirmação de maioridade (ver `LEIA-ME.md`).

## Inventário

| Dado | Onde (tabela / bucket) | Titular | Finalidade | Retenção hoje |
|---|---|---|---|---|
| Nome, e-mail, senha (hash) | `auth.users`, `profiles` | todos | conta e login | até excluir a conta |
| Cidade, estado, sintomas selecionados, humor | `patients`, `patient_mood_logs` | paciente | personalizar o app; contexto para o psicólogo no SOS | até excluir a conta |
| Diário privado | `private_journals` | paciente | registro pessoal (só o paciente lê) | até excluir a conta |
| Hábitos (água, sono, movimento, refeições e como se sentia antes de comer, cafeína, tempo de tela, atividades prazerosas, nome e horários de remédios, consumo de cigarro/álcool, vontades e recaídas; **dado de saúde**) | `user_habits`, `habit_events` | paciente | autocuidado, lembretes por push (texto discreto, sem nome do remédio nem do vício) e "Seus padrões" (calculados no aparelho); só o paciente lê | até o paciente apagar o hábito com o histórico ou excluir a conta |
| Questionários GAD-7 (ansiedade) e PHQ-9 (depressão): respostas, pontuação e alerta da pergunta 9 (**dado de saúde**) | `mental_health_screenings` | paciente | acompanhamento mensal; o psicólogo que atende o paciente (consulta aceita, em andamento ou realizada) lê só o que o paciente escolheu compartilhar | até o paciente apagar os resultados ou excluir a conta |
| Vínculo com empresa (B2B) | `organizations`, `organization_members` | paciente e RH | liberar o plano pago pela empresa; o RH vê só totais agregados (5+ pessoas); o admin vê a lista para controlar vagas | enquanto durar o vínculo; o vínculo removido fica como histórico |
| Plano de segurança e contatos de emergência (dados de **terceiros**) | `safety_plans`, `emergency_contacts` | paciente (+ contatos) | atendimento em crise; o psicólogo do SOS ativo lê, com registro em log; a última versão aberta fica no aparelho do paciente para abrir sem internet | até excluir a conta; a cópia do aparelho sai ao sair da conta |
| Plano pós-crise recomendado pelo psicólogo | `safety_plan_suggestions` (+ `recommended_by` em `safety_plans`) | psicólogo do atendimento e paciente | tutela da saúde: o psicólogo deixa um plano de segurança com o paciente; o paciente decide se salva; o psicólogo relê o que recomendou, sem ver a decisão do paciente; o admin não lê | até excluir a conta do paciente; se o psicólogo sair, fica só o nome dele no selo |
| SOS por mensagem (conversa escrita do atendimento) | `sos_messages`, `sos_chat_state` | paciente e psicólogo do atendimento | atendimento em crise por escrito (tutela da saúde); presença e "visto" para o paciente não ficar sem resposta; o admin não lê | 3 meses (rotina `purge-old-sos-messages`), como o chat; sai antes se a conta for excluída |
| Metas, conquistas, estatísticas | `patient_weekly_goals`, `patient_achievements`, `patient_statistics` | paciente | engajamento | atividades: 3 meses (`cleanup_quarterly_activities`); o resto até excluir a conta |
| Depoimentos, curtidas e denúncias em grupos | `group_testimonials`, `group_testimonial_likes`, `group_testimonial_reports` | paciente | comunidade de apoio; moderação | até excluir a conta ou o admin remover |
| Pedidos de SOS (com a triagem opcional do que o paciente sente, **dado de saúde**; o psicólogo vê antes de aceitar) e sessões de vídeo (metadados, sem gravação) | `emergency_requests`, `webrtc_sessions`, `participant_presence`, `sos_trace_events` | paciente, psicólogo | atendimento de emergência; diagnóstico de falhas | **5 anos** a partir do atendimento. Ao excluir a conta, vão para `care_record_archive`, sem ligação com o login; a rotina `purge-expired-care-records` apaga o que passou de 5 anos (desde 2026-09-29) |
| Avaliação do atendimento e notas clínicas do psicólogo | `session_feedback` | paciente, psicólogo | qualidade; registro do psicólogo | **5 anos** (Resolução CFP 01/2009) — idem |
| Consultas agendadas e resumo da sessão | `appointments` | paciente, psicólogo | agendamento; registro do psicólogo (o resumo é visível ao paciente) | **5 anos** — idem. Se o psicólogo é excluído, as consultas ficam no histórico do paciente só com o nome dele (`psychologist_name`) |
| Anotação privada do psicólogo sobre a consulta (**dado de saúde**) | `appointment_private_notes` | paciente (assunto), psicólogo (autor) | registro clínico do psicólogo; só o psicólogo da consulta lê | junto com a consulta (apagada com ela) |
| Chat paciente–psicólogo | `conversas`, `mensagens` | ambos | comunicação | arquivada após 1 mês; conversa apagada 3 meses depois de aberta e cada mensagem (com a foto) 3 meses depois de enviada, mesmo em conversa reaberta (`gerenciar_expiracao_conversas`, `chat-cleanup`); mensagens não enviadas e rascunhos saem do aparelho ao sair da conta |
| Assinatura, uso de cota | `subscribers` (+ Stripe) | paciente | cobrança e limites do plano | até excluir a conta; Stripe guarda o próprio histórico fiscal |
| CPF, CRP, documentos de identidade (CPF, telefone e endereço não ficam nos dados do login, que vão no token de acesso: são copiados para o cadastro e apagados dali) | `psychologists`, `psychologist_registrations`, bucket `psychologist-documents` (privado) | psicólogo | verificação profissional | reprovados: apagados após 3 dias (`psychologist-cleanup`); aprovados: até excluir a conta |
| Chave PIX, repasses, comprovantes | `psychologist_payments`, `payment_logs`, `payout_items`, bucket `payment-receipts` (privado) | psicólogo | pagamento do psicólogo | **5 anos** (obrigação fiscal). Ao excluir o psicólogo, vão para `archived_psychologist_payouts` (nome, CPF, CRP, Pix, valores, sem ligação com a conta, só o admin lê) e a rotina `purge-archived-payouts` apaga após 5 anos |
| Tokens de push | `fcm_tokens` | todos | notificações | desativado no logout; apagado ao excluir a conta |
| Avisos do app (sino) e registro de envio | `notifications`, `notification_logs` | todos | avisar de consultas, mensagens, SOS e conquistas; o push na tela bloqueada usa texto discreto (sem nome do psicólogo nem menção ao SOS) | lidos: 90 dias; qualquer aviso: 180 dias; registro de envio: 30 dias (sem o token do aparelho) |
| Registros de acesso (data, hora, IP, navegador, e-mail e ID da conta) | `access_logs` | todos | cumprimento de obrigação legal (Marco Civil, art. 15; LGPD art. 7º, II e art. 16, I) | **7 meses** (6 da lei + 1 de folga), mesmo após a exclusão da conta; a rotina `purge-access-logs` apaga o que passar disso. Só o admin consulta e exporta (com MFA), e cada consulta e exportação fica em `admin_audit_log` com o motivo |
| Logs de segurança e auditoria | `security_audit_log`, `admin_audit_log`, `rate_limits` | todos | segurança, prestação de contas | **[DECIDIR com o advogado]** |

## Compartilhamento (operadores)

| Operador | O quê | Por quê |
|---|---|---|
| Supabase | todo o banco, arquivos e autenticação | hospedagem da infraestrutura |
| Stripe | e-mail, dados de pagamento (o cartão fica só no Stripe) | cobrança da assinatura |
| Resend | e-mail e conteúdo de avisos (consultas, suporte) | envio de e-mails |
| Google Firebase Cloud Messaging | token do aparelho, título/texto da notificação | push |
| Google e Twilio (STUN) | endereço IP durante a chamada | estabelecer a conexão de vídeo; o áudio/vídeo vai direto entre os participantes e **não é gravado** |
| Lovable | código e build do app | hospedagem do front-end **[CONFIRMAR]** |
| Grafana Labs (Grafana Cloud) | erros do app e das edge functions: tela, navegador, sistema, versão do app, mensagem e pilha do erro, sessão anônima do próprio SDK. Antes de sair, e-mail, telefone, CPF, ids, tokens e o que vem depois de `?` e `#` nos endereços são apagados (`src/lib/monitoring/scrub.ts`, `supabase/functions/_shared/monitoring.ts`). Sem usuário, console, gravação de tela nem localização. Guarda: 14 dias (plano gratuito) | monitorar falhas e disponibilidade (legítimo interesse, art. 7º, IX) **[CONFIRMAR região e base legal]** |

Transferência internacional (art. 33): todos os operadores acima processam dados fora do Brasil **[CONFIRMAR regiões e cláusulas contratuais]**.

## Direitos do titular (art. 18)

| Direito | Como é atendido hoje |
|---|---|
| Confirmação e acesso | pelo próprio app e pela exportação completa ("Baixar meus dados") |
| Correção | telas de perfil e conta |
| Eliminação | **paciente: "Excluir conta" em Alterar dados da conta** (edge function `delete-own-account`); psicólogo: via suporte |
| Portabilidade | paciente: "Baixar meus dados" (JSON com todas as tabelas dele) em Alterar dados da conta |
| Revogação do consentimento | equivale hoje à exclusão da conta |

## Segurança (art. 46)

RLS em todas as tabelas com dado pessoal; buckets de documentos e comprovantes privados com URL assinada; acesso do psicólogo ao plano de segurança limitado ao SOS ativo e auditado; admins nunca leem diário nem plano de segurança; logs verbosos desligados em produção.
