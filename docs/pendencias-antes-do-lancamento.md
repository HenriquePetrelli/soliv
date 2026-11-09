# Pendências antes do lançamento

O que precisa ser resolvido antes de o app ficar pronto. Ao resolver um item, mova-o para "Resolvidas" com a data e o que foi feito.

> **Passo a passo das configurações externas** (pendências 2, 5, 6 e 17; a 1, a 3 e o webhook do Stripe já foram resolvidos): `docs/guia-configuracoes-externas.md`.

## Críticas

### 2. Domínio do Soliv e envio de e-mails

- **Situação:** o Soliv ainda não tem domínio próprio. Sem ele, não dá para enviar e-mail com remetente do Soliv para os usuários.
- **Em espera (2026-10-13):** `soliv.com.br` está registrado por uma pessoa física, sem site, e vence em **03/12/2026** (foi renovado em 12/2025). `soliv.com` e `soliv.app` também estão ocupados. Decisão: aguardar o vencimento antes de escolher outro domínio. Lembretes agendados para 26/11/2026 (uma semana antes) e 10/12/2026 (para ver se foi renovado ou entrou no processo de liberação do Registro.br).
- **O que depende do domínio:**

  | E-mail | Onde é enviado | Remetente hoje | O que acontece sem domínio |
  |---|---|---|---|
  | Redefinir senha, confirmar cadastro, trocar e-mail, convite, link e código | Supabase (Authentication) | "Supabase Auth" | Só chega para os e-mails da equipe do projeto (no máximo 30 por hora), em inglês e com "powered by Supabase". **Paciente que esquece a senha não consegue entrar.** |
  | Pedido de suporte (paciente e psicólogo) | `send-support-request`, `send-psychologist-support-request` | `noreply@soliv.app` | O Resend recusa remetente de domínio não verificado: o e-mail não sai |
  | Aviso de consulta por e-mail | `send-appointment-notification` | `notifications@soliv.app` | Idem (o aviso no app e o push continuam funcionando) |
  | Aprovação, recusa e bloqueio de psicólogo | `psychologist-management`, `admin-psychologist-management` | `onboarding@resend.dev` | O endereço de teste do Resend só entrega para o dono da conta do Resend |

- **Já pronto no código:** 6 modelos de e-mail de login em português, com a logo do Soliv (`supabase/templates/`), e o passo a passo em `docs/emails-de-autenticacao.md`.
- **O que fazer quando houver domínio:**
  1. Registrar o domínio (ex.: `soliv.com.br` ou `soliv.app`).
  2. No [Resend](https://resend.com/domains), adicionar o domínio e criar os registros DNS que ele pedir (SPF e DKIM) até aparecer "Verified".
  3. Supabase → Authentication → SMTP Settings: SMTP do Resend com remetente do domínio (passo a passo em `docs/emails-de-autenticacao.md`).
  4. Trocar os remetentes das 5 edge functions da tabela pelo domínio novo (pedir ao Claude; é uma troca de texto) e publicar as funções.
  5. Ligar o domínio ao app publicado na Lovable e usar esse endereço como Site URL no Supabase (a logo do e-mail e os links vêm dele).
- **Enquanto isso:** dá para colar os modelos em português no Supabase (Authentication → Email Templates) para testar com os e-mails da equipe; para usuários de fora, nenhum e-mail chega. **Feito em 2026-11-08:** os 6 modelos em português (`supabase/templates/`) e os assuntos foram colados no Supabase pela API e conferidos iguais ao repositório (teste `s01-32`). Já valem para os e-mails da equipe; a logo vem do Site URL atual (`calmconnect-auth-flow.lovable.app/email/soliv-logo.png`).
- **Limite atual:** sem SMTP próprio o Supabase manda no máximo **2 e-mails de login por hora** para o projeto inteiro (`rate_limit_email_sent = 2`). Depois do SMTP do Resend, subir esse limite em Authentication → Rate Limits.
- **Como conferir:** pedir "Esqueci minha senha" com um e-mail que não é da equipe; o e-mail chega em português, com a logo e remetente "Soliv". Enviar um pedido de suporte e conferir que ele chega na caixa da equipe.
- **Registrado em:** 2026-10-05.

### 17. Planos e preços no Stripe em modo real

- **Situação:** os planos Essencial (R$ 69,90), Flex (R$ 120,00) e Completo (R$ 159,90) estão configurados só no **modo de teste** do Stripe (produtos, preços e secrets `STRIPE_PRICE_*` conferidos em 2026-11-07). Produtos e preços do modo de teste não passam para o modo real.
- **Antes de tudo (bloqueia o resto):** ativar a conta do Stripe para o modo real (Configurações → Ativar pagamentos): CNPJ (MEI ou empresa), dados do responsável, endereço, descrição do negócio e conta bancária para receber. Sem isso o Stripe não libera o modo real. Situação em 2026-11-07: ainda sem empresa aberta; o app segue no modo de teste.
- **O que fazer no lançamento:**
  1. No Stripe em **modo real**, criar os 3 produtos com preço recorrente mensal em **BRL**: Essencial R$ 69,90, Flex R$ 120,00 e Completo R$ 159,90 (o Claude cria pela API se a chave `sk_live_` for salva no formulário seguro do ambiente).
  2. Supabase → Edge Functions → Secrets: trocar `STRIPE_SECRET_KEY` pela chave real e `STRIPE_PRICE_ESSENCIAL`, `STRIPE_PRICE_FLEX` e `STRIPE_PRICE_COMPLETO` pelos IDs dos preços reais (`price_...`).
  3. Criar o webhook no modo real (mesmo destino e eventos do teste) e trocar `STRIPE_WEBHOOK_SECRET` (ficha 08).
  4. Avulsos no modo real: criar os 4 produtos de cobrança única em BRL (SOS avulso R$ 79,90 e R$ 54,90; consulta avulsa R$ 149,90 e R$ 109,90) e cadastrar `STRIPE_PRICE_GRATIS_SOS_AVULSO`, `STRIPE_PRICE_GRATIS_AGENDADA_AVULSO`, `STRIPE_PRICE_ASSINATURA_SOS_AVULSO` e `STRIPE_PRICE_ASSINATURA_AGENDADA_AVULSO`. Sem eles o app cobra o valor de tabela com um nome genérico.
  5. Portal do cliente (Configurações → Billing → Customer portal) no modo real: se a troca de plano estiver ligada, listar só os 3 planos novos, ou deixar desligada (o app já faz a troca). No modo de teste está desligada e o cancelamento é no fim do período (conferido em 2026-11-08).
  6. Métodos de pagamento: hoje só cartão e Apple Pay. Se ligar **Pix ou boleto** no modo real, antes inscrever `checkout.session.async_payment_succeeded` e `checkout.session.async_payment_failed` no webhook e pedir ao Claude para tratar esses eventos (o pagamento confirma depois; hoje o avulso só é liberado com o pagamento já aprovado).
- **Conferido em 2026-11-08 (modo de teste):** os 7 preços ativos (3 planos e 4 avulsos, em BRL) batem um a um com os secrets `STRIPE_PRICE_*` do Supabase; o webhook "soliv" está ativo com os 8 eventos e nenhuma entrega falhando.
- **Como conferir:** assinar um plano com cartão real de baixo valor (ou cupom de 100%), ver o plano no Perfil e cancelar dentro dos 7 dias (o reembolso sai automático).
- **Registrado em:** 2026-11-07.

### 25. Publicar o app Android e iOS nas lojas

- **Situação (2026-11-09):** o projeto está pronto para gerar os dois apps pelo GitHub Actions, sem Android Studio nem Mac. **Android:** assinatura de release lida de fora do repositório, `versionCode` automático, `targetSdkVersion 36` (exigido pelo Play desde 31/08/2026), workflow `Android (AAB)`. **iOS:** plataforma adicionada ao Capacitor (`ios/`, Swift Package Manager, iOS 15+, só iPhone), textos de câmera, microfone e fotos, push pelo Firebase (o `AppDelegate` troca o token da Apple pelo do FCM), workflow `iOS (TestFlight)`.
- **O que falta (só o dono da conta faz):** passo a passo em `docs/publicacao-lojas.md`.
  1. Android: gerar a chave de upload, cadastrar os 4 secrets `ANDROID_*`, criar o app no Play Console (Play App Signing), enviar o primeiro AAB para o teste interno.
  2. iOS: conta Apple Developer (com D-U-N-S, pode levar semanas: começar já), App ID com push, chave APNs enviada ao Firebase, app iOS no Firebase (`GoogleService-Info.plist`), app e chave de API na App Store Connect, 5 secrets, enviar ao TestFlight.
  3. Fazer o roteiro de testes no aparelho (seção 4 do guia) nos dois.
- **Bloqueado pela pendência 26** (pagamento dentro dos apps) para a revisão das lojas.
- **Registrado em:** 2026-11-09.

### 26. Pagamento dentro dos apps das lojas

- **Situação:** a assinatura é vendida pelo checkout do Stripe também dentro do app instalado. Apple e Google exigem o sistema de pagamento deles para bens e serviços digitais. A exceção da Apple (diretriz 3.1.3(d)) cobre serviço ao vivo entre duas pessoas, como consulta; grupos e recursos do app não entram. No Brasil, desde junho de 2026 (acordo com o CADE), a Apple aceita pagamento alternativo ou link para o site ao lado da compra pela Apple, com comissão menor.
- **Decidir (com o advogado):** o modelo de cobrança nos apps (opções em `docs/publicacao-lojas.md`, seção 3).
- **Registrado em:** 2026-11-09.

## Importantes

### 27. Ligar o monitoramento (Grafana Cloud, plano gratuito)

- **Situação (2026-11-09):** o código está pronto e fica desligado até receber as configurações. O app envia erros (site, Android e iOS) pelo SDK Faro, limpos de dados pessoais (`src/lib/monitoring/`). As 41 edge functions enviam ao Loki os erros 5xx (`supabase/functions/_shared/monitoring.ts`). A nova função `health` responde se o backend e o banco estão de pé.
- **O que fazer:** passo a passo em `docs/monitoramento-grafana.md`: criar a conta Free, colocar `VITE_FARO_URL` (Lovable e variável do GitHub), os 3 secrets `GRAFANA_LOKI_*` no Supabase, publicar as edge functions (todas mudaram, mais a `health`), criar as 3 checagens de "no ar", ligar a integração do Supabase e os alertas.
- **Como conferir:** derrubar uma tela de propósito no app publicado e ver o erro em Frontend → Errors; a checagem da `health` verde; a consulta `{app="soliv", source="edge-function"}` no Explore sem erro de autenticação.
- **Registrado em:** 2026-11-09.

### 24. Voltar a exigir o código de verificação do admin

- **Situação:** com o app em teste, o admin entra só com a senha; o código do app autenticador (verificação em duas etapas) é pedido apenas quando o ambiente está em produção. O ambiente fica na tabela `public.app_settings` (migration `20261109120000_bloqueio_flexivel_e_mfa_por_ambiente.sql`), começando em `test`. O banco (`is_super_admin`), as edge functions de admin (`adminMfaSatisfied`) e o painel leem o mesmo valor.
- **O que fazer no lançamento:** no SQL Editor do Supabase, rodar `UPDATE public.app_settings SET environment = 'production', updated_at = now();`. Na hora, o painel e as funções voltam a exigir o código.
- **Como conferir:** entrar com a conta de admin; depois da senha, a tela do código precisa aparecer e o painel não abre sem ele.
- **Aplicado em 2026-11-09:** migration no Supabase (registrada no histórico) e 11 edge functions publicadas pela CLI com `--use-api`, mesmo `verify_jwt` de antes: `account-block-status` (nova), `admin-block-*`, `admin-update-*`, `admin-delete-*`, `admin-psychologist-management`, `psychologist-management`, `confirm-payment` e `payment-sync`. Conferido no banco, numa transação desfeita: aviso de bloqueio só com a senha certa (com prazo e por tempo indeterminado), sessões encerradas ao bloquear, admin com token aal1 aceito em `test` e recusado em `production`.
- **Registrado em:** 2026-11-09.

### 5. Configurar o TURN das chamadas de vídeo

- **Adiado para perto do lançamento (2026-10-13):** a Cloudflare pede cartão para liberar o TURN, mesmo dentro dos 1.000 GB grátis por mês (depois, US$ 0,05 por GB). Sem TURN o app funciona; a diferença aparece com usuários reais em 4G e redes de empresa. Ao configurar, ligar o aviso de cobrança em Manage Account → Billing → Notifications.

- **Onde:** secrets das edge functions (função `ice-servers`).
- **Por quê:** sem TURN, a chamada de vídeo (SOS e consulta) não conecta quando um dos lados está em rede que bloqueia conexão direta: muitas redes 4G/5G (NAT da operadora) e redes corporativas. Estimativa comum: 10% a 20% das chamadas. O app já está pronto; falta a conta.
- **O que fazer:** uma das opções:
  1. Cloudflare Realtime TURN (recomendado, tem cota gratuita): criar uma chave TURN no painel da Cloudflare e cadastrar `CLOUDFLARE_TURN_KEY_ID` e `CLOUDFLARE_TURN_API_TOKEN`.
  2. Outro provedor (Twilio, Metered, coturn próprio): cadastrar `TURN_URLS` (separadas por vírgula), `TURN_USERNAME` e `TURN_CREDENTIAL`.
- **Como testar:** fazer uma chamada com um lado no 4G e o outro numa rede corporativa ou de outra operadora e confirmar que o vídeo conecta.
- **Registrado em:** 2026-10-04.

### 6. Ajustes de segurança no painel do Supabase (Authentication)

- **Onde:** Supabase → Authentication → Policies/Settings (não dá para configurar pelo código).
- **O que fazer:**
  1. ~~Tamanho mínimo de senha: 8, com letras e números ("Letters and digits"), e validade do link/código de e-mail em 1 hora (`3600`).~~ **Feito em 2026-10-13.**
  2. Ativar "Prevent use of leaked passwords" (recusa senhas que já vazaram na internet). Só existe no plano Pro do Supabase: fica para quando assinar o Pro.
  3. "Confirm email": ligar depois do domínio (pendência 2), para o e-mail de confirmação chegar. O app já está pronto (desde 2026-10-21 o paciente é criado pelo banco e o psicólogo conclui o cadastro no primeiro acesso).
- **Registrado em:** 2026-10-04.

### 16. Revisão jurídica dos documentos

- **Situação:** política de privacidade, termos de uso (paciente e psicólogo) e registro de tratamento (`docs/lgpd/`) estão em versão para revisão. Os registros de acesso do Marco Civil já são guardados por 7 meses na tabela `access_logs` (migration `20261109210000_registros_de_acesso_marco_civil.sql`, aba **Registros de acesso** do admin; aplicada no Supabase em 2026-11-09 e registrada no histórico, com o gatilho de login em `auth.sessions` e a rotina `purge-access-logs` criados. Conferido no banco, numa transação desfeita: login e uso do app gravados com o IP certo, repetição ignorada, paciente sem leitura da tabela nem da consulta do admin, admin busca e exporta e as duas ações entram na Auditoria); falta o advogado avaliar a ausência da porta de origem (LEIA-ME, item 10). O registro ainda tem itens **[DECIDIR]** (prazo dos demais logs de segurança e auditoria) e **[CONFIRMAR]** (hospedagem do front-end pela Lovable, regiões e cláusulas da transferência internacional de dados).
- **Atualizado em 2026-11-07:** os Termos do paciente (planos Grátis, Essencial, Flex e Completo) e do psicólogo (repasse R$ 85,00 e R$ 40,00) mudaram e continuam na versão 1.0, porque ainda não foram publicados; incluir na revisão.
- **O que fazer:** revisão por um advogado de proteção de dados antes do lançamento; depois, pedir ao Claude para atualizar os textos e a versão dos documentos (o app pede o aceite de novo quando a versão muda).
- **Registrado em:** 2026-10-13 (estava só na ficha 18).

## Menores

Nenhuma no momento.

## Resolvidas

### 19. Teste de ponta a ponta dos planos novos (registrada em 2026-11-07, feito em 2026-11-09)

- **Resultado: 51 checagens, 50 passaram;** a outra era critério errado do teste (o SOS recusado no Flex volta com 200 e `SOS_NOT_ALLOWED`, que o app trata como "SOS indisponível"; conferido no banco que nenhum pedido foi criado). Modo de teste do Stripe, cartão 4242, chamando as mesmas edge functions e regras do banco que o app, com o login de cada conta.
  1. **Assinar o Flex:** o checkout que o app abre sai em R$ 120,00/mês; com o pagamento, o webhook grava "Flex" e o Perfil mostra o plano (2 contas).
  2. **Flex divide o atendimento:** depois do SOS, Agendar fica bloqueado e o servidor recusa a consulta ("Limite mensal de atendimento já utilizado em um SOS"); na outra conta, com consulta pedida, o SOS fica indisponível; com a consulta recusada pela psicóloga, a cota volta e o SOS é liberado de novo.
  3. **Subir para o Completo:** prévia de R$ 39,89 (diferença proporcional), troca na hora; quem usou o SOS pode agendar e quem pediu consulta pode usar o SOS no mesmo mês.
  4. **Plano Grátis:** diário só leitura, 3 hábitos e o 4º recusado, 1 plano de segurança e o 2º recusado, chat só leitura, grupos sem publicar nem reagir (11 de 11, com as mensagens certas).
  5. **Repasse:** SOS e consulta com chamada real de mais de 5 min com os dois conectados (311 s e 338 s); concluir a consulta com 1 min foi recusado; sincronizar deu **R$ 125,00** pendentes (R$ 85 + R$ 40) e sincronizar de novo não duplicou.
  - **Telas** (app rodando localmente, mesmo Supabase): Perfil com "Plano Grátis" e "Plano Completo", SOS sem plano com "Comprar um SOS avulso (R$ 79,90)", Planos com "Plano Atual: Completo — Renova em 09/12/2026".
- **O que foi simulado, e por quê:** a página de pagamento do Stripe não abre na sessão do Claude, então o pagamento foi feito pela API do Stripe com o mesmo cliente, preço e dados do checkout aberto pelo app; a consulta (marcada para o dia seguinte) foi trazida para a hora do teste; os dois atendimentos foram movidos para a semana anterior antes de sincronizar, porque o repasse só fecha semanas encerradas; a sincronização rodou direto no banco (o botão do admin pede a verificação em 2 etapas); a psicóloga de teste foi aprovada direto no banco.
- **Falta testar pelo celular/navegador de verdade:** a página de pagamento do Stripe (cartão, 3-D Secure, volta ao app) e o vídeo das chamadas (o teste mediu a conexão pelos avisos de mídia que o app manda, sem câmera). Itens do roteiro: `s06-21` a `s06-24` e `s03-42`.
- **Contas de teste** (senha passada na conversa de 2026-11-09; começam com `e2emw8j6r5f.` e terminam com `@example.com`): `flex1` e `flex2` (hoje no Completo, com assinatura de teste ativa no Stripe), `gratis` e `psico` (psicóloga aprovada, com R$ 125,00 de repasse pendente de teste). Apagar antes do lançamento (ou pedir ao Claude), junto com as assinaturas de teste.
- **Observação para deploys:** desde 2026-11-08 o `supabase/config.toml` é aceito pela CLI (v3) e lista o `verify_jwt` de **todas** as 45 funções igual ao Supabase (14 que faltavam foram incluídas; chaves antigas trocadas e `[inbucket]` virou `[local_smtp]`). Mesmo assim, depois de publicar pela CLI, conferir em Edge Functions que nenhuma mudou (teste `s19-08`). O histórico de migrations do Supabase também não bate com os nomes dos arquivos (o Lovable registra com outros números): não usar `supabase db push`; aplicar só a migration nova.

### 18. Avisar os psicólogos do novo valor do repasse (registrada em 2026-11-07, encerrada em 2026-11-09)

- O repasse mudou para R$ 85,00 (consulta) e R$ 40,00 (SOS) em 2026-11-07. Não há o que avisar: o app ainda não está em produção e não há psicólogos atendendo de verdade (só contas de teste). Os psicólogos que se cadastrarem já entram com os Termos e os valores novos.

### 23. Avisos do lint (registrada e resolvida em 2026-11-08)

- O `npx eslint .` não rodava (`typescript-eslint` 8.11 com ESLint 9.39); subiu para 8.46 e passou a mostrar 397 avisos. Todos tratados: **0 erros e 0 avisos**, sem mudar o que o app faz (tipos, 690 testes, build e as telas públicas no navegador conferidos depois).
- `any` (324): trocados por tipos de verdade no app e nas edge functions (`catch (error: unknown)` com `errorText`/`errorName` em `src/utils/errorMessage.ts` e `_shared/errors.ts` nas funções, que devolvem o mesmo texto de antes). Nos testes, o `any` continua liberado na configuração (os falsos do Supabase e do navegador precisam dele). Nenhum `any` implícito novo (128 antes e depois, todos antigos).
- Dependências de hooks (31): os efeitos que buscam dados quando o usuário ou um id muda ficaram marcados como intencionais, com o motivo na linha; incluir as funções faria o efeito rodar sem parar.
- Fast refresh (24): funções e constantes que estavam junto dos componentes foram para arquivos próprios (ex.: `src/components/moodOptions.ts`, `src/lib/routePermissions.ts`, `src/components/legal/consents.ts`); a regra fica desligada só para os componentes do shadcn/ui e os contextos (provider e hook no mesmo arquivo).
- Estilo (18): `const`, chaves nos `case`, blocos vazios comentados, `import` no `tailwind.config.ts`.
- As edge functions mudaram só em tipos (mesmo comportamento); vão junto na próxima publicação delas. Não foi possível checar os tipos delas com o Deno nesta sessão (a rede não chega a `esm.sh` e `deno.land`); o `deno lint` passa sem erro de sintaxe.

### 22. Limpezas no Stripe de teste e nos secrets (registrada e resolvida em 2026-11-08)

- Canceladas no Stripe (modo de teste) as 2 assinaturas de US$ 15 ("myproduct", sem e-mail) criadas pelo `stripe trigger` em 28/09 e 13/10, que renovavam sozinhas. Apagados dos secrets do Supabase `DAILY_API_KEY` e `FIREBASE_SERVER_KEY`, sem uso no código (o push usa a conta de serviço: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`).
- Ficou de propósito: a assinatura de teste do `paciente01@gmail.com` no preço antigo do Premium (R$ 120, lida como Completo), a única ativa. Trocar para um plano novo no próximo teste de assinatura.

### 21. Documentos dos psicólogos e fotos do chat em bucket público (registrada e resolvida em 2026-11-08)

- Os buckets `documents` (documentos de cadastro e fotos do chat) e `psychologist-documents` estavam públicos: quem tinha o link abria sem login. O admin passou a abrir os documentos com link assinado de 5 minutos (`src/lib/storageDocument.ts`) e a migration `20261108230000_documentos_privados.sql` foi aplicada: os 4 buckets agora são privados. Conferido: o link público responde 400; pelo banco, o admin (com 2 etapas) e o dono leem o documento, e outra conta ou o admin sem 2 etapas não.
- Se a Lovable ainda não tiver publicado o front de 2026-11-08, os botões "Visualizar" e "Baixar" do painel de aprovação só voltam a abrir depois da publicação (o visualizador embaixo deles já funciona).

### 20. Edge functions antigas publicadas fora do repositório (registrada e resolvida em 2026-11-08)

- O Supabase tinha 6 edge functions que não existiam mais em `supabase/functions/` nem eram chamadas pelo app (sobras das versões antigas da Lovable), algumas sem as checagens de acesso atuais; uma delas mexia em contas de administrador. Apagadas em 2026-11-08: a lista do Supabase agora é igual às pastas do repositório e a chamada a elas responde 404. No banco só existe um admin, com 2 etapas; nada indica uso indevido.

### Varredura do Supabase (resolvida em 2026-11-07)

- Limpeza (funções e tabela sem uso, índices duplicados), índices nas chaves estrangeiras, políticas otimizadas e unificadas, visitante sem login sem acesso além do cadastro, funções internas fechadas para o app, lembretes de hábitos 478 ms → 27 ms. Testes de ponta a ponta repetidos depois: tudo igual para o usuário. Detalhes: `docs/visao-geral-do-produto.md` (2026-11-07) e ficha 20. Ficaram de fora, por decisão: `pg_net` no schema `public` (mover reinstala a extensão das rotinas) e índices ainda sem uso (o app ainda tem pouco tráfego para julgar; revisar depois do lançamento).

### Planos Essencial, Flex e Completo no modo de teste (resolvido em 2026-11-07)

- Plus virou Essencial, Premium virou Completo e o Flex é novo; Plano Grátis com limites; repasse R$ 85,00 / R$ 40,00. Migration `20261107120000_planos_essencial_flex_completo.sql` aplicada no Supabase, 12 edge functions publicadas (mesmo `verify_jwt` de antes), produtos e preços do modo de teste no Stripe e secrets `STRIPE_PRICE_ESSENCIAL`, `STRIPE_PRICE_FLEX` e `STRIPE_PRICE_COMPLETO` conferidos. Falta o modo real (pendência 17), o aviso aos psicólogos (18) e o teste pelo app (19).

### 8. SOS por mensagem (sugerida em 2026-10-04, feita em 2026-11-02)

- Na confirmação do SOS, "Por vídeo" (padrão) ou "Por mensagem". Conversa em tela cheia, 25 min a partir da 1ª resposta do psicólogo, "digitando…" e "visto". Psicólogo fora da conversa por 60 s ou sem responder por 2 min: o paciente pode chamar outro psicólogo (SOS devolvido) e o psicólogo recebe push urgente. Cota e repasse como no vídeo; mensagens guardadas por 3 meses (ficha 02).

### 10. Plano pós-crise para o paciente (sugerida em 2026-10-04, feita em 2026-11-01)

- Na chamada (SOS ou consulta), o psicólogo preenche um plano de segurança com o paciente pelo botão "Plano pós-crise". O paciente recebe ao fim do atendimento, em "Recomendados para você", e salva (pode editar antes) ou ignora. O plano salvo mantém o selo "Recomendado por [nome]" (ficha 14).

### 9. Triagem rápida no SOS (sugerida em 2026-10-04, feita em 2026-10-31)

- Opções para tocar na tela de confirmação, todas opcionais (ficha 02). Risco de suicídio ou perigo: números de emergência na hora e pedido na frente da fila do psicólogo. O pedido continua indo para todos os psicólogos online.

### 7. Repositório renomeado para `soliv` (registrada em 2026-10-04, resolvida em 2026-10-13)

- Renomeado direto no GitHub (`HenriquePetrelli/soliv`), sem desconectar a Lovable: a sincronização continuou. O endereço antigo (`calmconnect-auth-flow`) redireciona para o novo.
- Não desconectar a Lovable do GitHub: ao reconectar, ela cria um repositório novo e não importa o existente.

### Webhook do Stripe no modo de teste (resolvido em 2026-10-13)

- Destino "soliv" na área restrita do Stripe apontando para `stripe-webhook`, com os 8 eventos que o app trata, e `STRIPE_WEBHOOK_SECRET` nos secrets. Teste com `stripe trigger customer.subscription.updated`: `invoice.paid`, `customer.subscription.created` e `customer.subscription.updated` entregues com 200.
- No lançamento: repetir no modo real com as chaves de produção (ficha 08).

### 3. Firebase para o push (registrada em 2026-10-04, resolvida em 2026-10-13)

- App Web criado no projeto Firebase `app-soliv` (o mesmo do app Android) e configuração no `.env` (6 valores e a chave do certificado push da Web). A conta de serviço (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) foi cadastrada nos secrets das edge functions.
- Teste: aviso de teste criado pelo banco para a conta paciente01 chegou como push.
- Limites do push pelo navegador (não são defeitos do app): no Android, a economia de bateria pode atrasar ou bloquear o push com o Chrome fechado (liberar em Configurações → Apps → Chrome → Bateria → "Sem restrições"); no iPhone, só funciona com o site adicionado à Tela de Início pelo Safari (iOS 16.4+); no computador, só com o Chrome aberto ou rodando em segundo plano. O app Android instalado recebe sempre.

### 1. Senha do admin exposta no repositório (registrada em 2026-10-03, resolvida em 2026-10-13)

- A senha da conta de admin, que estava em texto puro na migração `20250729171947-8c6e37ba-06ef-4ba2-96e4-260ba4e8a0f3.sql`, foi trocada. A senha antiga continua no histórico do Git, mas não abre mais a conta.
- Em 2026-10-30, a verificação em duas etapas passou a ser obrigatória para o admin (app autenticador; ficha 19). Fica para depois: trocar o e-mail do admin quando houver domínio (em 2026-11-08 a única conta admin no banco é `admin@admin.com`, com 2 etapas; o `admin@calmconnect.com` citado antes não existe mais).

### Decisões de produto (registradas de 2026-10-04 a 2026-10-19, decididas em 2026-10-28)

- **4. SOS de antes da correção do repasse:** não serão pagos; o app ainda não estava em produção. Os registros foram apagados do livro.
- **11. Resumo da sessão:** dois campos. O resumo continua visível ao paciente; a **anotação privada** fica só com o psicólogo (ficha 04).
- **12. Denúncias nos grupos:** mantidas as 3 denúncias pendentes de pessoas diferentes (ficha 16).
- **13. SOS curto:** o SOS só entra no repasse com 5 minutos de chamada com os dois conectados, como a consulta (ficha 09).
- **14. Repasses de psicólogo excluído:** arquivados por 5 anos sem ligação com a conta, só para o admin; depois uma rotina apaga (ficha 09).
- **15. Consulta depois do fim do plano:** cancelada quando o plano termina, com aviso ao paciente 3 dias antes; com o plano marcado para não renovar, não dá para agendar depois do fim (fichas 04 e 08).

### Avaliação da consulta agendada (registrada em 2026-10-04, resolvida em 2026-10-04)

- O fim da chamada já pedia a avaliação; faltava o resto. Agora: se o paciente fechar o app ou a chamada cair antes da tela de avaliação, o app convida a avaliar ao abrir de novo (sem bloquear, dá para pular); o histórico de consultas mostra a nota de cada consulta ou o botão "Avaliar" (até 30 dias depois); a avaliação fica ligada à consulta e ao psicólogo e entra na média dele.
- Achados no caminho e corrigidos: o histórico de consultas do paciente aparecia sempre vazio (usava a lista de próximas consultas), e qualquer usuário podia gravar avaliação para uma sessão da qual não participou, mexendo na média de qualquer psicólogo.

### Varredura de segurança (resolvida em 2026-10-04)

- Corrigido (migrations `20261003210511_25be134c-176c-4bfc-8b28-4715f7b98a8f.sql` e `20261004220000_storage_upload_limits.sql` e edge functions): rotinas agendadas que qualquer pessoa podia disparar com a chave pública do app; psicólogo não aprovado lendo e aceitando pedidos de SOS (com nome e sintomas do paciente); Premium grátis inserindo a própria assinatura; psicólogo se aprovando e paciente se desbloqueando direto na tabela; CPF, Pix, e-mail e documentos de todos os psicólogos visíveis para qualquer usuário; funções que gravavam dados de outros usuários; limite de requisições que dava para esgotar no nome de outra pessoa (bloquear o SOS dela); cancelamento do SOS de outra pessoa; injeção de HTML nos e-mails de suporte; papel do usuário (admin/psicólogo) lido de um campo que o próprio usuário edita; força bruta de código de empresa; uploads sem limite de tipo e tamanho no servidor.
- Verificado sem problema: SQL injection (todas as consultas usam parâmetros; o SQL dinâmico só existe em migrations, com identificadores escapados), XSS (o React escapa o texto; o único HTML cru é o CSS do gráfico), webhook do Stripe (assinatura conferida), prompt injection (o app não usa IA).

### Excluir conversa apagava para os dois lados (registrada em 2026-10-04, resolvida em 2026-10-04)

- "Excluir" agora oculta a conversa só para quem excluiu, como no WhatsApp; o outro lado continua com o histórico, e a conversa volta à lista se chegar mensagem nova. Reabrir com o mesmo psicólogo recupera a conversa (antes dava erro de conversa duplicada). Migration `20261003232116_d6f3adac-0952-4317-8e77-a3a5ec8ff312.sql`.

### Ajustes de privacidade achados ao documentar (registrados e resolvidos em 2026-10-04)

- Curtidas dos grupos de apoio não são mais legíveis por outros usuários (só os totais); trocar a reação passou a funcionar (falhava em silêncio); o autor não altera mais os contadores do próprio depoimento; a pontuação dos questionários é recalculada em qualquer alteração; o limite de 2 anotações por dia do diário é conferido também no banco (e a data não pode ser retroativa). Migration `20261003232116_d6f3adac-0952-4317-8e77-a3a5ec8ff312.sql`.
- Mensagens de regra do banco voltaram a aparecer para o usuário: o app trocava todas por uma mensagem genérica, porque os erros do Supabase chegam como objeto e não como `Error` (`src/utils/errorMessage.ts`).
- O app publicado não abre mais dentro de outros sites (proteção contra clickjacking, `src/lib/frameGuard.ts`), já que a hospedagem não permite o cabeçalho `X-Frame-Options`.
