# 19. Painel do admin

> **Status:** Pronto.
> **Última verificação:** 2026-11-22 (consultas agendadas e SOS com detalhes, plano de segurança e transcrição; subitens por psicólogo e por paciente). Antes: 2026-10-30 (verificação em duas etapas obrigatória para o admin). Antes: 2026-10-29 (excluir psicólogo não apaga mais o histórico de consultas dos pacientes). Antes: 2026-10-24 (varredura: Auditoria passou a registrar aprovar e recusar psicólogo, confirmar repasse, moderação dos grupos e mudanças em empresas; cartão de saúde das rotinas na Visão geral). Antes: 2026-10-02 (painel redesenhado); proteções do banco reforçadas em 2026-10-04.
> **Quem usa:** admin (conta criada à mão; ver `docs/creating-an-admin-account.md`).

## Resumo

Painel único em `/admin-dashboard`, com a seção na URL (`?secao=...`), para recarregar e voltar sem perder o lugar. Mesmo padrão do paciente e do psicólogo (`AdminLayout`): a partir de 768 px (tablet deitado e computador), menu lateral com todas as seções; abaixo disso (celular e tablet em pé), cabeçalho (perfil, marca, sino de avisos) e barra inferior com Início, Psicólogos (com o número de pendentes), Pacientes, Repasses e "Mais", que abre todas as seções. Cada seção tem título e descrição no topo. Os avisos ficam em `/admin-notifications`, dentro do mesmo layout.

| Grupo | Seção | O que faz |
|---|---|---|
| Geral | Visão geral | Números do app; cada cartão leva à seção |
| Pessoas | Psicólogos | Aprovar ou recusar cadastros (com documento), editar, bloquear, excluir |
| Pessoas | › Consultas agendadas / SOS (embaixo de Psicólogos) | Psicólogos com consultas (ou SOS atendidos), com a contagem; clicando, todos os atendimentos dele, com os detalhes |
| Pessoas | Pacientes | Editar, bloquear por período, excluir (cancela a assinatura) |
| Pessoas | › Consultas agendadas / SOS (embaixo de Pacientes) | Pacientes com consultas (ou SOS), com a contagem; clicando, todos os atendimentos dele, com os detalhes |
| Pessoas | Empresas | B2B (ficha 10) |
| Atendimento | Consultas agendadas | Números dos 30 dias (realizadas, canceladas, faltas, próximas, tempo médio em chamada, com transcrição, avaliação) e a lista de todas; clicando, os detalhes |
| Atendimento | SOS | Métricas (aceite, resolução, avaliação média, total) e a lista com paciente e psicólogo; clicando, os detalhes |
| Atendimento | Chat | Métricas e metadados das conversas; arquivar (sem ver o conteúdo) |
| Moderação | Grupos de apoio | Depoimentos, curtidas e denúncias; editar e excluir |
| Moderação | Auditoria | Histórico das ações dos admins: bloquear, editar e excluir contas; aprovar e recusar psicólogo; confirmar repasse (valor e E2E); editar e excluir depoimento, revisar denúncia; cadastrar e alterar empresa e vínculos (com o que mudou: de → para). As ações no banco são registradas pelo gatilho `audit_admin_change` |
| Financeiro | Repasses | Sincronizar e confirmar pagamentos (ficha 09) |
| Conta | Meu perfil | E-mail, troca de senha (com a senha atual), tema, notificações no aparelho e sair |

## Como funciona

- **Entrada com verificação em duas etapas** (obrigatória com o cadastro aberto; enquanto o cadastro pede o código de convite, o admin entra só com a senha, ver `admin_mfa_required()` e a pendência 24):
  1. depois da senha, o admin vai para `/admin/verificacao`;
  2. na primeira vez, cadastra um app autenticador (Google Authenticator, Microsoft Authenticator, Authy ou 1Password) lendo o QR code, ou digitando a chave, e confirma um código de 6 dígitos;
  3. nas próximas, só digita o código;
  4. sem o código, a conta não acessa nada do painel.

  A regra vale no servidor, não só na tela: `is_super_admin()` só reconhece o admin com o token de nível `aal2` (depois do código), e as edge functions de admin conferem o mesmo (`supabase/functions/_shared/adminMfa.ts`). Com a senha sozinha (`aal1`), `get_login_state` diz apenas que a conta é de admin, para o app levar à tela do código.
  Trocar a senha (Meu perfil) pede a senha atual **e** o código do app: o Supabase só troca a senha de quem tem a verificação em duas etapas com o código confirmado.
  Perdeu o celular? Outra pessoa com acesso ao Supabase remove a verificação em **Authentication → Users → (o admin) → remover o fator MFA**. No próximo login, o admin cadastra o app de novo.
- **Aprovação de psicólogo**:
  1. o admin recebe notificação de cadastro novo;
  2. abre o documento por link temporário assinado;
  3. aprova ou recusa com motivo (`psychologist-management`);
  4. o psicólogo recebe e-mail;
  5. cadastros recusados são apagados depois de alguns dias pela rotina `psychologist-cleanup-daily`.
- **Bloquear, editar e excluir** usam edge functions próprias (`admin-block-*`, `admin-update-*`, `admin-delete-*`). Cada uma confere se quem chama é admin e grava em `admin_audit_log`: quem, quando, em quem e detalhes.
- **Excluir psicólogo** (`admin-delete-psychologist`), nesta ordem; se um passo falhar, nada é excluído:
  1. arquiva os repasses por 5 anos (ficha 09);
  2. cancela as consultas ainda ativas (futuras ou não fechadas), avisa cada paciente ("o psicólogo não atende mais pelo Soliv") e devolve a consulta do mês (`detach_psychologist_from_appointments`);
  3. as consultas ficam no histórico do paciente com o nome do psicólogo guardado (`appointments.psychologist_name`, sem ligação com a conta); antes eram apagadas junto, com o resumo e a avaliação;
  4. as anotações privadas do psicólogo saem com ele;
  5. apaga o resto da conta (agenda, presença, chat, documentos, login).
- **Detalhes de um atendimento** (consulta ou SOS, em qualquer lista acima): paciente, psicólogo (CRP), horários, duração (na consulta, o tempo com os dois na chamada), avaliação do paciente (estrelas, se ajudou, se se sentiu ouvido, comentário, reclamação) e do psicólogo (estrelas, sintomas, anotações clínicas). O plano de segurança do paciente e a transcrição da chamada (falas do paciente e do psicólogo; abas para ver só um lado) abrem num clique a mais. O atendimento aberto fica na URL (`?atendimento=`), e a pessoa escolhida também (`?pessoa=`).
- **Privacidade**: o admin nunca vê o conteúdo do chat, o diário nem os hábitos. Desde 2026-11-22 lê, a partir do detalhe de um atendimento, o plano de segurança e a transcrição; **cada abertura do detalhe, do plano e da transcrição fica na Auditoria** (`view_care_detail`, `view_safety_plan`, `view_call_transcript`), com o paciente.

## Regras

- Admin é quem tem linha ativa em `admin_users` (`is_super_admin`). Não depende de dados que o usuário edita.
- `admin_audit_log` só é gravado pelas edge functions (service role) e pelas funções do banco que o admin chama, e só lido por admin. Ninguém edita ou apaga pelo app.
- As listas e os detalhes de atendimentos só passam por funções SECURITY DEFINER que conferem `is_super_admin()`; as tabelas continuam com as regras de antes.

## Onde está no código

- **Tela e navegação**: `src/pages/AdminDashboard.tsx`, `src/components/admin/` (`AdminLayout`, `AdminNav`, `adminNavConfig`, `PatientsPanel`, `OrganizationsPanel`, `ChatModerationPanel`, `GroupTestimonialModerationPanel`, `AuditLogPanel`, `BlockPatientModal`, `EditPatientModal`, `care/` com `AdminCarePanels`, `AdminCareList` e `AdminCareDetailDialog`), `src/lib/adminCare.ts`, `src/components/psychologist/PsychologistApprovalPanel.tsx`, `src/components/payments/PaymentsPanel.tsx`.
- **Hooks**: `usePsychologistManagement`, `usePatientManagement`, `useChatModeration`, `useGroupTestimonialModeration`, `useAdminAuditLog`.
- **Edge functions**: `psychologist-management`, `admin-psychologist-management`, `admin-block-patient`, `admin-block-psychologist`, `admin-update-patient`, `admin-update-psychologist`, `admin-delete-patient`, `admin-delete-psychologist`, `payment-sync`, `confirm-payment`.
- **Banco**: `admin_users`, `admin_audit_log`. Funções: `get_admin_metrics`, `get_sos_metrics`, `admin_list_appointments`, `admin_list_sos`, `admin_list_care_people`, `admin_appointment_metrics`, `admin_get_care_detail`, `admin_get_care_safety_plan`, `admin_get_call_transcript`, `get_chat_usage_metrics`, `get_admin_conversas_overview`, `get_admin_group_testimonials`, `get_admin_audit_log`.

## Como validar

### Teste manual
1. Entrar como admin → vai direto para o painel, sem erro de perfil.
2. Visão geral → os números carregam; tocar em "Psicólogos pendentes" leva à seção.
3. Aprovar um psicólogo de teste → ele consegue entrar → aparece em Auditoria.
4. Bloquear um paciente por 1 dia → ele vê o aviso ao entrar → Auditoria registra o motivo e a duração.
5. Chat → vê números e participantes, sem nenhum texto de mensagem.
6. Recarregar a página numa seção → continua na mesma seção.
7. Celular → barra inferior com Início, Psicólogos, Pacientes, Repasses e Mais; "Mais" abre todas as seções.
8. Sino → abre as notificações dentro do painel, com a barra e o menu.

### Testes automáticos
`adminNav`, `adminLayout`, `chatModerationPanel.render`, `useGroupTestimonialModeration`, `confirmPayoutDialog`.

### Conferência no banco
```sql
select user_id, is_active from admin_users;
select created_at, action, target_type, target_name from admin_audit_log order by created_at desc limit 20;
```

## Pendências

- Nenhuma. A senha exposta foi trocada em 2026-10-13, e a verificação em duas etapas é obrigatória desde 2026-10-30.

## Problemas comuns

| Sintoma | Causa provável | O que olhar |
|---|---|---|
| Admin cai na Home de paciente | Sem linha ativa em `admin_users` | SQL acima |
| Documento do psicólogo não abre | Link assinado vencido | Reabrir o detalhe |
| Ação falha com "Admin access required" | Sessão expirada ou conta sem admin | Sair e entrar de novo |
