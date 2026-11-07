# 20. Segurança: proteções que valem para o app inteiro

> **Status:** Pronto, com pendência externa (ajustes de senha no painel do Supabase e senha do admin).
> **Última verificação:** 2026-11-01 (varredura: cadastro de psicólogo pela edge function não aceita mais `approved`/outro `user_id`; link `javascript:` no documento do psicólogo bloqueado no banco e no painel do admin; `subscribers` não é mais lido por e-mail reaproveitado; jsPDF 4.2.1 e dependências atualizadas). Antes: 2026-10-30 (verificação em duas etapas obrigatória para o admin). Antes: 2026-10-27 (varredura: RLS em todas as tabelas, funções abertas a visitantes conferem o acesso, todas as edge functions exigem login, segredo ou assinatura; corrigidos documento do psicólogo aprovado, `cleanup-user` e presença na chamada).
> **Quem usa:** todos (proteção invisível).

## Princípio

**O banco é a última palavra.** A tela pode esconder um botão, mas a regra vale de verdade no Postgres (RLS, gatilhos, funções) ou na edge function. Qualquer pessoa pode chamar a API do Supabase direto com a chave pública que está no app, então nenhuma regra pode depender só da tela.

## Proteções e como validar cada uma

| Ameaça | Proteção | Como validar |
|---|---|---|
| Ver dados de outra pessoa | RLS em todas as tabelas | Como paciente A, `select` em tabela de B pela API → 0 linhas |
| Dados pessoais do psicólogo (CPF, Pix, e-mail, documentos) | Leitura por coluna bloqueada; o próprio lê por `get_my_psychologist_private` | `has_column_privilege('authenticated','public.psychologists','cpf','select')` = `false` |
| Virar Completo sem pagar | Gatilho `a_guard_subscriber_client_write`; sem política de inserção para o usuário | Paciente tenta gravar em `subscribers` → recusado ou ignorado |
| Psicólogo se aprovar ou se desbloquear | Gatilho `a_guard_psychologist_client_write` (também trava CRP e CPF já aprovados) | Update em `approved` pela API → valor não muda |
| Paciente se desbloquear | Gatilho `a_guard_patient_client_write` | Idem em `patients.is_blocked` |
| Pessoa não aprovada acessando a fila do SOS | Políticas exigem `psychologist_can_attend` | Conta "psicólogo" pendente → `select` em `emergency_requests` → 0 linhas |
| Gravar dados em nome de outro (funções com ID) | Funções conferem quem chama (`assert_caller_is`); originais viraram `*_unchecked`, só para o servidor | Chamar `add_patient_activity` com ID de outro → "Acesso negado" |
| Disparar rotinas automáticas | Cabeçalho `x-cron-secret` com segredo guardado no banco (`internal_secrets`) ou service role | Chamar `/functions/v1/auto-decline-appointments` com a chave pública → 401 |
| Esgotar o limite de outra pessoa | `check_rate_limit` só no servidor | `has_function_privilege('authenticated','public.check_rate_limit(text,int,int)','execute')` = `false` |
| Repetição e força bruta | Limites por pessoa: SOS 5/10 min, agendamento 10/h, suporte 3/h, chat 30/min, depoimentos 5/h, curtidas 60/min, avaliações 10/h, conversas 10/h, relatos 5/h, códigos de empresa 20/15 min | Exceder → "Muitas ações em pouco tempo" |
| Clique duplo | No app, escritas idênticas em andamento viram uma só requisição (`src/lib/requestDedupe.ts`) | Duplo clique em "Agendar" → uma só consulta |
| SQL injection | Consultas sempre parametrizadas; SQL dinâmico só em migrações, com identificadores escapados | Revisão de código (sem teste manual) |
| XSS (script injetado) | O React escapa todo texto; não há HTML cru com dado do usuário; **CSP** no app publicado bloqueia script de fora | No app publicado, `index.html` tem `Content-Security-Policy` |
| HTML injetado em e-mail | `escapeHtml` nos e-mails de suporte | Ficha 17 |
| Arquivo malicioso ou enorme | Buckets aceitam só imagem e PDF, até 10 MB; buckets privados com links assinados | Subir `.html` ou arquivo de 20 MB → recusado |
| Redirecionamento para site falso | Links de notificação só aceitam caminho do próprio app (`/...`, nunca `//site`) | Ficha 07 |
| Tipo de conta falsificado | Admin e psicólogo vêm do banco, não de `user_metadata` | Ficha 01 |
| Cancelar o SOS de outra pessoa | `emergency-cleanup` exige o login do próprio paciente | Chamada sem token → 401 |
| Senha fraca | 8+ caracteres com letras e números no app | Ficha 01 |
| Reabrir atendimento encerrado | Gatilho `prevent_reopen_finished_call` | Ficha 03 |
| Prompt injection | O app não usa IA | Não se aplica |
| App dentro de outro site (clickjacking) | `src/lib/frameGuard.ts`: fora do editor da Lovable, o app não abre dentro de iframe de outro site | Página com `<iframe src="...">` de outro domínio → aviso "o Soliv não abre dentro de outros sites" |
| Ver quem curtiu nos grupos | Curtidas legíveis só pelo dono | Ficha 16 |
| Alterar a própria pontuação de questionário | Gatilho recalcula em qualquer alteração | Ficha 13 |
| Burlar o limite do diário | Gatilho `enforce_journal_daily_limit` | Ficha 15 |
| Webhook falso do Stripe | Assinatura conferida com `STRIPE_WEBHOOK_SECRET` | Ficha 08 |
| TURN usado por estranhos (custo) | `ice-servers` só entrega TURN a quem está numa sala de chamada das últimas 24 h | Conta sem sala recente → resposta com `"turn": false` |
| Ler documentos de todos os psicólogos editando os próprios metadados | Removidas as regras antigas `admin_document_access` e `admin_upload_documents` (confiavam em `is_super_admin` dentro de `user_metadata`, que o usuário edita); admin só pela tabela `admin_users` | `select count(*) from pg_policy where polname in ('admin_document_access','admin_upload_documents')` = 0 |
| Consultar plano e SOS de outra pessoa | `can_use_sos` só para o servidor; `validate_route_access`, `prune_stale_psychologist_presence`, `can_access_document` e `can_upload_document` fechadas para o app | `has_function_privilege('authenticated','public.can_use_sos(uuid)','execute')` = `false` |
| Criar conta já como admin | `handle_new_user` só aceita paciente ou psicólogo vindo do cadastro | Cadastro com `user_type: "admin"` nos metadados → perfil de paciente |
| Psicólogo se aprovar pela inscrição | Gatilho `a_guard_registration_client_insert`: inscrição feita pelo app nasce sempre "pendente" | Inserir em `psychologist_registrations` com `status: 'approved'` → fica `pending` |
| Forjar chamada conectada, trocar participante ou o cronômetro da sala | Gatilho `a_guard_webrtc_client_update`: só o paciente grava a resposta (o que marca a conexão), só o psicólogo mexe no cronômetro (e não aumenta), ninguém troca o outro participante, o SOS da sala ou quem encerrou; o app não cria salas | Ficha 03 |
| Forjar "sem áudio/vídeo" ou o último sinal na chamada (devolver o SOS, tirar do repasse) | Gatilho `a_guard_participant_presence`: pelo app só quem está na sala grava presença, o papel vem da sala, o último sinal é a hora do servidor e o estado da mídia só muda por `report_call_media` | Ficha 03 |
| Trocar o documento do CRP depois de aprovado | `guard_psychologist_client_write` trava `document_url` e `documents` após a aprovação; no armazenamento, o dono só sobrescreve ou apaga os próprios arquivos antes da aprovação (`my_psychologist_documents_locked`) | Psicólogo aprovado → update em `document_url` pela API → valor não muda |
| Apagar a conta pulando a exclusão normal | `cleanup-user` (desfaz cadastro que falhou) só vale para conta criada há menos de 24 h, sem aprovação, sem consultas e que não é admin | Conta antiga chama `cleanup-user` → 403 "use Perfil > Excluir conta" |
| Senha do admin descoberta ou vazada | Verificação em duas etapas obrigatória: `is_super_admin()` só vale com o token `aal2` (depois do código do app autenticador), e as edge functions de admin conferem o mesmo (`_shared/adminMfa.ts`) | Admin entra só com a senha e chama `get_admin_metrics` pela API → "Access denied" |
| Virar psicólogo aprovado pela edge function de cadastro | `psychologist-management?action=register` usa só o `user_id` e o e-mail do token, só os campos do formulário e grava sempre `pending` (a service role pula o gatilho do banco) | Chamar o register com `"approved": true` ou outro `user_id` → recusado ou fica pendente |
| Script no link do documento (ataque ao admin) | Gatilho `validate_psychologist_document_links`: `document_url`/`documents` só `https://` ou caminho do armazenamento; no app, `src/lib/safeUrl.ts` só abre links http(s) | Update em `document_url` = `javascript:alert(1)` → "Link do documento inválido" |
| Ver o plano de outra conta pelo e-mail reaproveitado | Política `select_own_subscription`: por e-mail só linha ainda sem dono | Conta nova com e-mail antigo de outra pessoa → 0 linhas da conta antiga |

## Conferência rápida no banco (tudo deve dar `true`)

```sql
select
  to_regclass('public.internal_secrets') is not null as segredo_rotinas,
  (select count(*) from cron.job where command like '%/functions/v1/%' and command not like '%x-cron-secret%') = 0 as rotinas_com_segredo,
  not has_function_privilege('authenticated', 'public.check_rate_limit(text,int,int)', 'execute') as limite_so_servidor,
  exists(select 1 from pg_trigger where tgname = 'a_guard_subscriber_client_write') as assinatura_protegida,
  exists(select 1 from pg_trigger where tgname = 'a_guard_psychologist_client_write') as aprovacao_protegida,
  exists(select 1 from pg_trigger where tgname = 'a_guard_patient_client_write') as bloqueio_protegido,
  not has_column_privilege('authenticated', 'public.psychologists', 'cpf', 'select') as cpf_oculto,
  exists(select 1 from pg_trigger where tgname = 'rate_limit_mensagens') as limite_chat,
  not exists(select 1 from pg_policy where polname in ('admin_document_access', 'admin_upload_documents')) as documentos_sem_metadados,
  not has_function_privilege('authenticated', 'public.can_use_sos(uuid)', 'execute') as cota_sos_so_servidor,
  exists(select 1 from pg_trigger where tgname = 'a_guard_registration_client_insert') as inscricao_protegida,
  exists(select 1 from pg_trigger where tgname = 'a_guard_webrtc_client_update') as sala_video_protegida,
  exists(select 1 from pg_trigger where tgname = 'a_guard_participant_presence') as presenca_protegida,
  pg_get_functiondef('public.is_super_admin(uuid)'::regprocedure) like '%aal2%' as admin_com_duas_etapas,
  pg_get_functiondef('public.guard_psychologist_client_write'::regproc) like '%document_url := OLD.document_url%' as documento_aprovado_travado,
  not exists(select 1 from pg_policies where schemaname = 'storage' and policyname in ('psychologist_own_documents', 'Admin and owner access to psychologist documents')) as arquivos_sem_regras_antigas,
  (select bool_and(file_size_limit = 10485760 and allowed_mime_types is not null) from storage.buckets
     where id in ('documents', 'psychologist-documents', 'payment-receipts')) as uploads_limitados;
```

## Onde está no código

- **Edge functions**: `supabase/functions/_shared/guards.ts` (`isTrustedCaller`, `withinRateLimit`, `escapeHtml`, `isValidEmail`, `isBoundedText`, `safeEqual`).
- **App**: `src/lib/requestDedupe.ts`, `installRequestDedupe.ts`, `contentSecurityPolicy.ts` (CSP aplicada pelo `vite.config.ts` só no build), `frameGuard.ts`, `password.ts`, `src/contexts/AuthContext.tsx`.
- **Banco**: migrações de segurança `20261003210511_25be134c-….sql`, `20261004220000_storage_upload_limits.sql` e `20261003232116_d6f3adac-0952-4317-8e77-a3a5ec8ff312.sql`.
- **Mensagens de erro**: `src/utils/errorMessage.ts` mostra as mensagens de regra do banco e esconde o texto técnico.

## Pendências

- **Painel do Supabase** (pendência 6): senha mínima 8 e "Letters and digits"; "Confirm email" depois do domínio; "Prevent use of leaked passwords" só no plano Pro.
- **Sem cabeçalhos de hospedagem** como `X-Frame-Options` (a Lovable não permite configurar). A proteção contra clickjacking é feita pelo próprio app (`frameGuard`), e cobre Chrome, Edge e Safari; no Firefox, que não informa o site de fora, o app abre normalmente.

## Como reagir a um incidente

1. **Chave vazada** (service role, Stripe, Firebase): gere uma nova no painel do serviço e troque o secret nas edge functions.
2. **Segredo das rotinas**: troque o valor com `update internal_secrets set value = '<novo valor aleatório>' where name = 'cron_secret';`. As rotinas leem na hora e as funções guardam o valor por até 5 minutos.
3. **Conta comprometida**: bloqueie pelo painel do admin e, em Authentication → Users, force a saída de todos os aparelhos.
4. **Investigar**: consulte `admin_audit_log`, `security_audit_log`, `sos_trace_events` e os logs das edge functions no Supabase.
