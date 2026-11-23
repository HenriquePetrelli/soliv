# 01. Cadastro, login, senha e perfis

> **Status:** Pronto, com pendência externa (SMTP e modelos de e-mail; ajustes de senha no painel do Supabase).
> **Última verificação:** 2026-10-21 (varredura de funcionamento: cadastros funcionam com a confirmação de e-mail ligada, cadastro do paciente numa operação só, bloqueio vale para quem já está logado, login sem confiar em dados editáveis, e-mail sem espaços). Antes: 2026-10-04.
> **Quem usa:** todos.

## Resumo

Existem três perfis: **paciente**, **psicólogo** e **admin**. O paciente se cadastra e já usa o app. O psicólogo se cadastra, envia o documento do CRP e só atende depois que o admin aprova. O admin não tem cadastro pelo app: a conta é criada à mão no Supabase (`docs/creating-an-admin-account.md`).

## Telas

| Rota | Tela |
|---|---|
| `/` | Login |
| `/signup-type` | Escolha entre paciente e psicólogo |
| `/patient-signup` | Cadastro do paciente |
| `/psychologist-signup` | Cadastro do psicólogo (com envio de documento: a conta é criada primeiro e o documento vai para a pasta da pessoa no bucket `documents`) |
| `/reset-password` | Nova senha (link enviado por e-mail) |
| `/profile`, `/account-settings` | Perfil e "Alterar dados da conta" do paciente |
| `/psychologist-profile` | Perfil do psicólogo |

## Como funciona

### Cadastro só com convite (enquanto o app está em teste)
Com o cadastro fechado, os dois cadastros (paciente e psicólogo) mostram no topo o campo **Código de convite** ("O Soliv está em fase de testes"). O app confere o código ao sair do campo e antes de enviar (`check_signup_invite_code`, 10 tentativas a cada 15 min por IP); sem o código certo, não envia. Quem decide é o banco: o gatilho `on_auth_user_signup_invite` (antes de criar a conta em `auth.users`) recusa a conta sem o código, então nem chamando a API direto dá para se cadastrar. O código não fica guardado nos dados do usuário.
- O código fica em `app_settings.signup_invite_code` (o app não lê a tabela). **Enquanto ele estiver preenchido, o admin entra sem o código do app autenticador**; com o cadastro aberto, a verificação em duas etapas volta a ser exigida (`admin_mfa_required()`, migration `20261123140000_mfa_do_admin_segue_codigo_de_convite.sql`). Trocar: `UPDATE public.app_settings SET signup_invite_code = 'NOVO-CODIGO', updated_at = now();`. Abrir o cadastro para todos (lançamento): `... SET signup_invite_code = NULL ...`; o campo some sozinho.
- Contas criadas pelo painel do Supabase ou pela API de admin também precisam do código (`signup_invite_code` nos dados do usuário), ou abrir o cadastro por um momento.
- Migration `20261123120000_codigo_de_convite_no_cadastro.sql`; app: `src/lib/signupInvite.ts`, `src/components/SignupInviteCodeField.tsx`; testes: `src/test/signupInvite.test.tsx`.

### Cadastro do paciente
1. Escolhe "Sou paciente" e preenche nome, e-mail, senha, sintomas ("O que você tem sentido?") e, se tiver, o **código da empresa**.
2. Marca "Tenho 18 anos ou mais", aceita Termos e Política e dá o consentimento para dados de saúde.
3. O Supabase cria o login. **Numa operação só**, um gatilho no banco (`handle_new_user`) cria o perfil (`profiles`) e a linha do paciente (`patients`, com CPF, cidade, telefone e sintomas enviados no cadastro) e grava os aceites em `legal_acceptances`, com versão e data. Se o CPF já tem cadastro, nada é criado (nem o login) e a tela orienta a entrar ou recuperar a senha. Depois de copiados, CPF, telefone e endereço saem dos dados do login (que vão dentro do token).
   - Com **"Confirmar e-mail"** ligado no Supabase, a tela diz "Conta criada! Enviamos um link para o seu e-mail" e a pessoa entra depois de confirmar. Antes, a segunda gravação falhava sem sessão e a conta ficava sem os dados do paciente.
4. Se houver código de empresa válido, o paciente já entra no plano da empresa (ficha 10).

### Cadastro do psicólogo
1. Preenche dados profissionais (CRP, CPF, especialidade, cidade, área de atendimento) e envia o documento (PDF, JPG ou PNG).
2. O documento vai para o storage. A função `create_psychologist_profile` cria o cadastro como **pendente**.
   - Com **"Confirmar e-mail"** ligado, não há sessão logo após criar a conta: ela fica criada (antes era apagada e nenhum psicólogo conseguia se cadastrar) e a tela pede para confirmar o e-mail. No primeiro acesso, o login leva a `/psicologo/concluir-cadastro` ("Falta pouco"), onde o psicólogo envia o documento; o cadastro vai para análise com os dados guardados no cadastro. CPF e endereço saem dos dados do login depois disso.
3. O admin recebe notificação e analisa em **Painel → Psicólogos** (ficha 19).
4. Se aprovado, o psicólogo passa a entrar no painel. Se recusado, recebe o motivo por e-mail e o cadastro é apagado depois de alguns dias pela rotina `psychologist-cleanup-daily`.

### Login
1. E-mail e senha. O app descobre o tipo de conta **no banco** (admin, psicólogo aprovado ou paciente) e leva à área certa: `/admin-dashboard`, `/psychologist-dashboard` ou `/home`. Tudo o que o login precisa (admin, tipo de conta, nome, bloqueio, situação do cadastro do psicólogo) vem numa consulta só, `get_login_state` (migration `20261004131952_4fcada17-7812-48f8-b314-6ff7269b9832.sql`), compartilhada entre a tela de login e o controle de acesso (`src/lib/loginState.ts`).
2. Conta bloqueada pelo admin vê o motivo e até quando vale o bloqueio.
   - O bloqueio vale também **para quem já está com o app aberto**: o app confere ao abrir, ao voltar para ele e a cada 5 minutos (`AccountStatusWatcher`), mostra o motivo e sai da conta. O servidor também suspende o login da conta pelo mesmo período (`ban_duration` nas funções `admin-block-patient` e `admin-block-psychologist`); nesse tempo, o login mostra "Sua conta está bloqueada no momento". Desbloquear tira a suspensão na hora. Antes, só a tela de login conferia e quem estava logado continuava usando o app.
   - E-mail com espaço ou maiúscula (colado, teclado do celular) entra normalmente.
3. Psicólogo em análise vê "Seu cadastro ainda está sendo analisado"; recusado vê o aviso de recusa.

### Recuperar senha
"Esqueci a senha" manda um e-mail com link para `/reset-password`. Ali a pessoa define a nova senha. Link vencido ou já usado mostra o aviso e permite pedir outro.

O e-mail (e os outros e-mails de login: confirmar cadastro, trocar e-mail, convite, link e código) é do Supabase, com os modelos em português e a logo do Soliv de `supabase/templates/`. A configuração no painel está em `docs/emails-de-autenticacao.md`.

### Sair
Desativa o push daquele aparelho e encerra a sessão em todos os aparelhos. Se o servidor falhar, encerra pelo menos no aparelho atual e sempre volta para o login. O psicólogo fica **offline** na hora, saindo da fila do SOS.

## Regras

- **Senha nova** (cadastro, troca e recuperação): mínimo de 8 caracteres, com letras e números (`src/lib/password.ts`). Quem já tem conta com senha de 6 caracteres continua entrando.
- **O tipo de conta vem só do banco**, nunca de dados que o próprio usuário edita (`user_metadata`). Isso vale também para a tela de login e o painel do psicólogo, que antes ainda olhavam `is_super_admin` e `account_status` nos metadados. No cadastro, o banco só aceita paciente ou psicólogo (quem tenta criar a conta como admin vira paciente).
- **A inscrição do psicólogo nasce sempre pendente**, mesmo que o app envie outro status; só o admin aprova.
- **Rotas protegidas**: `RouteGuard` deixa cada tipo de conta ver só as suas telas e manda para o login quem não está logado.
- **Psicólogo não aprovado** não acessa o painel nem a fila do SOS. A fila é bloqueada também no banco (ficha 20).
- **Ninguém muda a própria aprovação, bloqueio ou nota.** O banco ignora essas colunas quando a alteração vem do próprio usuário.
- **CRP e CPF** de psicólogo já aprovado não mudam sem nova análise.

## Onde está no código

- **Telas**: `src/pages/Index.tsx`, `SignupType.tsx`, `PatientSignUp.tsx`, `PsychologistSignUpPublic.tsx`, `PsychologistCompleteSignup.tsx`, `ResetPassword.tsx`, `AccountSettings.tsx`, `Profile.tsx`, `PsychologistProfile.tsx`.
- **Componentes**: `src/components/LoginForm.tsx`, `SignUpForm.tsx`, `RouteGuard.tsx`, `AccountStatusWatcher.tsx`, `legal/LegalAcceptanceGate.tsx`.
- **Sessão e tipo de conta**: `src/contexts/AuthContext.tsx` (`getUserType`, `signOut`).
- **Cadastro do psicólogo**: `src/services/psychologist.service.ts`.
- **Banco**: `profiles`, `patients`, `psychologists`, `psychologist_registrations`, `legal_acceptances`, `admin_users`. Funções: `is_super_admin`, `get_psychologist_rejection_status`, `create_psychologist_profile`, `psychologist_can_attend`.
- **Migração mais recente**: `20261011121731_6aa454a1-eb1c-4103-a55e-921be29efc4c.sql` (`handle_new_user` cria o paciente; `patients.user_id` único).
- **Gatilhos de proteção**: `a_guard_psychologist_client_write`, `a_guard_patient_client_write`, `a_guard_registration_client_insert`, `prevent_user_type_change`.

## Como validar

### Teste manual
1. **Cadastro de paciente** com senha `abc123` → recusa ("precisa ter pelo menos 8 caracteres"). Com `calma2024` → cria a conta e entra na Home.
2. **Login com senha errada** → "Email ou senha incorretos".
3. **Recuperar senha**: pedir o link, abrir, definir a nova senha, entrar com ela.
4. **Sair** → volta para o login; voltar no navegador não reabre a área logada.
5. **Cadastro de psicólogo** → tentar entrar → "em análise". Aprovar no admin → entrar → painel do psicólogo.
6. **Documento do psicólogo**: cadastrar com um PNG ou PDF → cadastro concluído e o admin abre o documento. Escolher um arquivo `.docx` ou de 6 MB → o campo fica vermelho com o motivo e o cadastro não é enviado.
7. **Bloqueio**: o admin bloqueia um paciente por 1 dia → o paciente vê o motivo ao entrar. Desbloquear → entra normalmente.
8. **Rotas**: logado como paciente, abrir `/admin-dashboard` → é redirecionado.

### Testes automáticos
`loginForm`, `accountStatusWatcher`, `psychologistSignupUpload`, `signOut`, `resetPassword`, `password`, `legal`, `sintomas`, `psychologistOfflineOnSignOut`, `adminNav`. Rodar com `npx vitest run src/test/loginForm.test.tsx` (e os demais).

### Conferência no banco
```sql
-- Tipo de conta e aprovação de um e-mail
select u.email, p.user_type, ps.approved, ps.approval_status, ps.is_blocked
from auth.users u
left join profiles p on p.user_id = u.id
left join psychologists ps on ps.user_id = u.id
where u.email = 'pessoa@exemplo.com';

-- Aceites legais gravados no cadastro
select document, version, accepted_at from legal_acceptances
where user_id = (select id from auth.users where email = 'pessoa@exemplo.com');
```

## Pendências

- **No painel do Supabase** (Authentication), item 6 de `docs/pendencias-antes-do-lancamento.md`: senha mínima 8 e "Letters and digits"; "Confirm email" só depois do domínio; "Prevent use of leaked passwords" só no plano Pro. A verificação em duas etapas do admin já é obrigatória (ficha 19).
- **E-mails de login** (pendência crítica 2): o Soliv ainda não tem domínio; sem ele não há SMTP próprio e o e-mail de redefinir senha só chega para a equipe do projeto, em inglês. Passo a passo em `docs/emails-de-autenticacao.md`.

## Problemas comuns

| Sintoma | Causa provável | O que olhar |
|---|---|---|
| "Confirme seu email antes de fazer login" | Conta criada, e-mail não confirmado | Caixa de spam; em Authentication → Users, a coluna "confirmed" |
| Psicólogo aprovado continua vendo "em análise" | `psychologists.approved`/`approval_status` ou `psychologist_registrations.status` não atualizados | SQL acima; reaprovar pelo painel |
| Depois de sair, volta logado | Sessão local não apagada (corrigido em 2026-10-03) | Limpar os dados do site; conferir se a versão publicada é a atual |
| Admin vê a Home de paciente | Conta sem linha ativa em `admin_users` | `select * from admin_users where user_id = ...` |
| Tela pede o aceite dos Termos de novo | A versão de um documento legal mudou | Esperado; `src/lib/legal.ts` |
