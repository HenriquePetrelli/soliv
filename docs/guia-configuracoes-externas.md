# Guia das configurações externas

Passo a passo do que precisa ser feito **fora do código** (nos painéis da Supabase, Lovable, Resend, Firebase, Cloudflare e Stripe) para o Soliv funcionar por completo.

**Regras para todos os passos:**
- Nenhuma chave, senha ou arquivo de conta de serviço deve ir para o chat ou para o GitHub. Cadastre direto no painel.
- Onde o guia diz "secret das edge functions", use um destes caminhos:
  - **Supabase:** Project Settings → Edge Functions → Secrets → Add new secret;
  - **Lovable:** peça "adicione o secret `NOME`". Ela abre um formulário seguro para colar o valor.
- Depois de cada passo, faça o teste indicado. Quando terminar, conte ao Claude o que já foi feito, para ele atualizar as pendências.

| Ordem | O quê | Tempo | Depende de | Sem isso |
|---|---|---|---|---|
| 1 | Senha do admin | 5 min | nada | qualquer pessoa com acesso ao repositório entra como admin |
| 2 | Domínio e e-mails | 1 a 2 h (mais a espera do DNS) | comprar o domínio | "Esqueci minha senha" e os e-mails de suporte não chegam a ninguém de fora da equipe |
| 3 | Login no Supabase | 5 min | passo 2 | senhas fracas ou vazadas são aceitas pela API e o e-mail não é confirmado |
| 4 | Firebase (push) | 30 min | nada | nenhum aviso chega com o app fechado, inclusive o SOS para o psicólogo |
| 5 | TURN (vídeo) | 15 min | nada | 10% a 20% das chamadas não conectam (4G e redes de empresa) |
| 6 | Webhook do Stripe | 10 min | nada | cancelamento, troca de plano e cobrança recusada feitos fora do app só aparecem quando o paciente abre o app |

---

## 1. Senha do admin

**Por quê:** uma migração antiga (`supabase/migrations/20250729171947-8c6e37ba-06ef-4ba2-96e4-260ba4e8a0f3.sql`) grava a senha do admin em texto puro, e ela está no histórico do GitHub.

1. Entre no app com a conta de admin → **Meu perfil** → **Alterar senha**. Use uma senha nova e longa (16+ caracteres; um gerenciador de senhas ajuda).
2. Se você usou a mesma senha em qualquer outro lugar (e-mail, Stripe, Supabase), troque lá também.
3. Opcional, mais tarde: trocar o e-mail da conta admin (`admin@calmconnect.com`) por um do domínio novo (passo 2), em Meu perfil → E-mail.

**Teste:** sair e entrar de novo com a senha nova; a antiga deve dar "Email ou senha incorretos".

> **Verificação em duas etapas:** desde 2026-10-30, depois da senha o painel pede um código de um app autenticador. No primeiro login, a tela mostra um QR code para cadastrar o app (Google Authenticator, Microsoft Authenticator, Authy ou 1Password). Confira em Supabase → **Authentication → Multi-Factor** (ou "Sign In / Providers → MFA") que **TOTP** está ligado; vem ligado por padrão. Se perder o celular, remova o fator em **Authentication → Users → (o admin)** e cadastre de novo no próximo login.

---

## 2. Domínio e e-mails

**Por quê:** sem domínio próprio, o Supabase só envia e-mail de login (redefinir senha, confirmar cadastro) para os e-mails da equipe, no máximo 30 por hora e em inglês. O Resend também recusa os e-mails de suporte e de aviso de consulta, porque o remetente `soliv.app` não está verificado.

### 2.1 Comprar o domínio
Ex.: `soliv.com.br` (Registro.br) ou `soliv.app` (qualquer registrador). Guarde o acesso ao painel de DNS.

### 2.2 Verificar o domínio no Resend
1. [resend.com/domains](https://resend.com/domains) → **Add Domain** → digite o domínio.
2. O Resend mostra 3 ou 4 registros DNS (MX/TXT do SPF e TXT do DKIM). Copie cada um para o painel de DNS do registrador, exatamente como aparece.
3. Volte ao Resend e clique em **Verify**. Pode levar de minutos a algumas horas. Siga quando aparecer **Verified**.
4. Confira que o secret `RESEND_API_KEY` existe nas edge functions. Se não existir: Resend → API Keys → Create → cadastre como secret.

### 2.3 Avisar o Claude
Diga apenas **qual é o domínio** (não é segredo). O Claude troca os remetentes das 5 edge functions que mandam e-mail:
- `send-support-request` e `send-psychologist-support-request` (hoje usam `noreply@soliv.app`);
- `send-appointment-notification` (hoje usa `notifications@soliv.app`);
- `psychologist-management` e `admin-psychologist-management` (hoje usam `onboarding@resend.dev`, o endereço de teste do Resend, que só entrega para o dono da conta).

Depois você faz o deploy dessas funções na Lovable.

### 2.4 E-mails de login pelo Resend (SMTP)
Supabase → **Authentication → Emails → SMTP Settings** → ligar **Enable Custom SMTP**:

| Campo | Valor |
|---|---|
| Sender email | `nao-responda@SEU-DOMINIO` |
| Sender name | `Soliv` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | uma API key do Resend (pode criar uma só para isso) |

Depois, em **Authentication → Rate Limits**, suba o limite de e-mails por hora (ex.: 100).

### 2.5 Modelos em português
Supabase → **Authentication → Emails → Templates**. Para cada um dos 6 modelos, troque o assunto e cole o arquivo correspondente de `supabase/templates/`. A tabela com assunto e arquivo de cada modelo está em `docs/emails-de-autenticacao.md` (seção 2).

### 2.6 Endereço do app
1. Lovable → **Project Settings → Domains** → ligar o domínio (ou um subdomínio como `app.SEU-DOMINIO`) ao app publicado.
2. Supabase → **Authentication → URL Configuration**:
   - **Site URL:** o endereço do app (ex.: `https://app.soliv.com.br`);
   - **Redirect URLs:** adicione `https://app.soliv.com.br/reset-password` e `https://app.soliv.com.br/**`.

**Teste:**
- "Esqueci minha senha" com um e-mail que **não** é da equipe → o e-mail chega em português, com a logo e o remetente "Soliv", e o link abre a tela de nova senha;
- pedido de suporte no app → chega na caixa da equipe;
- aprovar um psicólogo de teste → ele recebe o e-mail.

---

## 3. Login no Supabase

Supabase → **Authentication → Providers → Email** (e **Policies**/**Settings**, conforme a versão do painel):

1. **Minimum password length:** `8`. O app já exige 8 com letras e números; o servidor ainda aceita 6 de quem chama a API direto.
2. **Password requirements:** "Letters and digits" (letras e números), como o app já exige.
3. **Prevent use of leaked passwords:** só existe no plano Pro do Supabase. No plano gratuito, fica desligado; ligar quando assinar o Pro.
   - **Require current password when updating:** deixe **desligado**. O app já pede a senha atual nas próprias telas, e ligar isso quebraria a troca de senha e o "Esqueci minha senha".
   - **Email OTP expiration:** `3600` (1 hora), o prazo escrito nos e-mails.
4. **Confirm email:** ligar, **só depois do passo 2** (o e-mail de confirmação precisa chegar). O app já está pronto para isso:
   - o paciente é criado pelo banco no cadastro;
   - o psicólogo conclui o cadastro (envia o documento) no primeiro acesso, em `/psicologo/concluir-cadastro`;
   - nas empresas com domínio, o benefício só vale com o e-mail confirmado.

**Teste:**
- criar uma conta de paciente com um e-mail novo → chega o e-mail de confirmação → depois de confirmar, o login funciona e os dados do cadastro aparecem no perfil;
- criar uma conta de psicólogo → confirmar o e-mail → no primeiro login, o app pede o documento → depois de enviar, aparece "em análise";
- tentar cadastrar com a senha `12345678` → recusada.

---

## 4. Firebase (push no celular)

**Por quê:** é o que entrega avisos com o app fechado: o SOS para o psicólogo, os lembretes de consulta e de hábitos, as mensagens do chat e as mudanças na consulta. Sem ele, os avisos só aparecem com o app aberto.

O app Android já está ligado ao projeto Firebase **`app-soliv`** (`android/app/google-services.json`, pacote `br.com.soliv.app`). Faltam duas partes:

**A. Push no navegador (site e celular pelo navegador).** As 7 variáveis `VITE_FIREBASE_*` do `.env` estão vazias; sem elas, o botão "Notificações push" nem aparece no perfil.
1. [console.firebase.google.com](https://console.firebase.google.com) → projeto **app-soliv** → engrenagem → **Project settings → General**.
2. Em **Your apps**: se já houver um app Web (`</>`), abra-o; se não, **Add app → Web (`</>`)**, nome "Soliv Web", sem Firebase Hosting → **Register app**.
3. Copie os 6 valores do `firebaseConfig`: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
4. **Project settings → Cloud Messaging → Web configuration → Web Push certificates → Generate key pair**. Copie a chave (é a `VITE_FIREBASE_VAPID_KEY`).
5. Mande os 7 valores para o Claude. **Esses não são secretos**: todo app Web do Firebase os expõe no navegador. O Claude coloca no `.env` e a Lovable publica.

**B. Envio pelo servidor (vale para o navegador e o Android).**
1. **Project settings → Cloud Messaging**: confirme que a **Firebase Cloud Messaging API (V1)** está **Enabled**.
2. **Project settings → Service accounts → Generate new private key**. Baixa um arquivo JSON. **Este é secreto: não mande no chat nem coloque no GitHub.**
3. Do JSON, cadastre 3 secrets nas edge functions:

   | Secret | Campo do JSON |
   |---|---|
   | `FIREBASE_PROJECT_ID` | `project_id` (deve ser `app-soliv`) |
   | `FIREBASE_CLIENT_EMAIL` | `client_email` |
   | `FIREBASE_PRIVATE_KEY` | `private_key` (o texto inteiro, de `-----BEGIN PRIVATE KEY-----` até `-----END PRIVATE KEY-----`, com os `\n`) |

4. Apague o arquivo JSON do computador depois de cadastrar (ou guarde num cofre de senhas).

**Teste:**
1. No celular (Chrome no Android, ou o app instalado), entre com uma conta de paciente → Perfil → ligar as notificações → aceitar a permissão.
2. Feche o app.
3. De outra conta (o psicólogo), mande uma mensagem no chat para esse paciente → em até 1 minuto chega o push "Nova mensagem", sem o texto da mensagem.
4. Psicólogo com o app fechado e online no SOS; um paciente pede SOS → o psicólogo recebe o push.

Para conferir no banco: `select title, push_attempts, push_sent_at from notifications where push order by created_at desc limit 10;` → o aviso do teste tem `push_sent_at` preenchido. Se ficar vazio com `push_attempts` subindo, os secrets do Firebase estão errados.

---

## 5. TURN (chamadas de vídeo)

**Por quê:** sem TURN, a chamada não conecta quando um dos lados está numa rede que bloqueia a conexão direta (muitas redes 4G/5G e redes de empresa).

**Opção recomendada: Cloudflare Realtime TURN** (tem cota gratuita mensal).
1. [dash.cloudflare.com](https://dash.cloudflare.com) → crie uma conta, se não tiver → **Realtime → TURN Server** (às vezes aparece como "Calls → TURN") → **Create TURN key**.
2. A Cloudflare mostra o **Turn Token ID** e o **API Token**, este só uma vez. Cadastre como secrets:
   - `CLOUDFLARE_TURN_KEY_ID` = Turn Token ID;
   - `CLOUDFLARE_TURN_API_TOKEN` = API Token.

**Outra opção** (Twilio, Metered ou servidor próprio): cadastrar `TURN_URLS` (endereços separados por vírgula, ex.: `turn:turn.exemplo.com:3478,turns:turn.exemplo.com:5349`), `TURN_USERNAME` e `TURN_CREDENTIAL`.

**Teste:**
1. Durante uma chamada, no computador: F12 → aba **Rede** → procure `ice-servers` → a resposta tem `"turn": true`.
2. Faça uma chamada com um lado no 4G do celular e o outro no Wi-Fi de uma empresa ou de outra operadora → o vídeo conecta.

---

## 6. Webhook do Stripe

**Por quê:** é o Stripe avisando o app na hora sobre cancelamento, renovação, troca de plano e cobrança recusada. Sem ele, o app só descobre quando o paciente abre o app ou quando a rotina de hora em hora roda, e o aviso "Pagamento não aprovado" não sai.

1. [dashboard.stripe.com](https://dashboard.stripe.com) → **Developers → Webhooks → Add endpoint**. Faça primeiro no modo de teste e repita no modo real quando for lançar.
2. **Endpoint URL:** `https://ihrrgmmsfuvlasmzdmwf.supabase.co/functions/v1/stripe-webhook`
3. **Events to send** (os que o app trata):
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Salve. Na página do endpoint, clique em **Reveal** no **Signing secret** (`whsec_...`) e cadastre como secret `STRIPE_WEBHOOK_SECRET`.
5. Confira que `STRIPE_SECRET_KEY` existe nos secrets. Cadastre também `STRIPE_PRICE_ESSENCIAL`, `STRIPE_PRICE_FLEX` e `STRIPE_PRICE_COMPLETO` com os IDs dos preços do modo real (`price_...`).

**Teste:**
1. Stripe → no endpoint → **Send test event** → `customer.subscription.updated` → a resposta deve ser **200**. Se for 400, o `STRIPE_WEBHOOK_SECRET` está errado.
2. Assine um plano de teste no app (cartão `4242 4242 4242 4242`), depois cancele pelo **painel do Stripe** (não pelo app) → abra o app → aparece "Plano cancelado - Essencial disponível até DD/MM/AAAA" (ou Flex, ou Completo).
3. Cartão de teste que recusa na renovação (`4000 0000 0000 0341`) → chega o aviso "Pagamento não aprovado".

---

## Depois de tudo

Conte ao Claude quais passos foram feitos. Ele:
- marca as pendências como resolvidas em `docs/pendencias-antes-do-lancamento.md`;
- troca os remetentes dos e-mails (passo 2.3), se ainda não tiver trocado;
- ajuda a rodar o teste manual completo com o checklist de testes.
