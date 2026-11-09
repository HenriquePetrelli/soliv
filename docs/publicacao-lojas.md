# Publicação nas lojas (Android e iOS)

O app nativo é o mesmo build web empacotado pelo Capacitor (`android/` e `ios/`). Os dois apps são gerados pelo **GitHub Actions**, então não é preciso ter Android Studio nem Mac:

| Workflow | Quando roda | O que entrega |
|---|---|---|
| `Android (AAB)` (`.github/workflows/android-release.yml`) | mudança em `android/` na `main` (conferência), **Run workflow** ou tag `v*` | o `.aab` para baixar na própria execução (assinado quando os secrets existem) |
| `iOS (TestFlight)` (`.github/workflows/ios-release.yml`) | mudança em `ios/` na `main` (compila no simulador), **Run workflow** ou tag `v*` | o build assinado, enviado direto ao TestFlight |

O número da versão (`versionCode` no Android, número do build no iOS) é o número da execução do workflow, então nunca se repete. A versão que aparece na loja (ex.: `1.0.0`) é o campo pedido no **Run workflow**, ou a tag (`v1.0.1` vira `1.0.1`).

> **Antes de enviar para revisão:** ver a seção [Pagamentos nas lojas](#pagamentos-nas-lojas). É o ponto com mais risco de recusa.

---

## 1. Android (Google Play)

### 1.1 Gerar a chave de upload (uma vez, na sua máquina)

Precisa do Java instalado (o `keytool` vem com ele). No terminal:

```bash
keytool -genkeypair -v -keystore soliv-upload.jks -alias soliv-upload -keyalg RSA -keysize 4096 -validity 10000
```

Ele pede uma senha e seus dados (nome, empresa, cidade). **Guarde o arquivo `soliv-upload.jks` e a senha num cofre de senhas, com uma cópia de segurança.** Nunca coloque o arquivo no repositório (o `.gitignore` já bloqueia `*.jks`).

Com o Play App Signing (passo 1.3), esta é só a **chave de upload**: o Google guarda a chave definitiva do app. Se a de upload for perdida, dá para pedir a troca no Play Console sem perder o app.

### 1.2 Cadastrar os secrets no GitHub

Converter a chave em texto (base64):

```bash
base64 -i soliv-upload.jks | tr -d '\n' > soliv-upload.b64
```

No GitHub: **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | conteúdo do `soliv-upload.b64` (depois apague esse arquivo) |
| `ANDROID_KEYSTORE_PASSWORD` | senha do arquivo |
| `ANDROID_KEY_ALIAS` | `soliv-upload` |
| `ANDROID_KEY_PASSWORD` | senha da chave (a mesma, se você não definiu outra) |

Na aba **Variables** (não são secretos), os 7 valores `VITE_FIREBASE_*` do `.env` (os mesmos do site). Sem eles o app funciona, mas o push pela web fica desligado no build.

### 1.3 Play Console

1. Criar a conta de desenvolvedor (US$ 25, uma vez) e o app: nome **Soliv**, idioma português (Brasil), app, gratuito.
2. **Play App Signing:** vem ativado em app novo. Ao enviar o primeiro AAB, confirme a opção "O Google gera e gerencia a chave de assinatura do app".
3. Rodar o workflow **Android (AAB)** (aba Actions → Android (AAB) → Run workflow, versão `1.0.0`) e baixar o `.aab` no fim da execução.
4. Enviar o AAB em **Teste → Teste interno** primeiro (até 100 testadores por e-mail), testar, e só depois promover para produção.
5. Preencher antes da revisão:
   - **Política de privacidade:** URL pública da política (`docs/lgpd/politica-de-privacidade.md` publicada no site).
   - **Segurança dos dados:** o que o app coleta (conta, saúde e bem-estar, mensagens, fotos enviadas no chat, áudio e vídeo das chamadas, identificadores do aparelho para push), com criptografia em trânsito e exclusão de conta pelo app.
   - **Exclusão de conta:** existe no app (Perfil → Alterar dados da conta → Excluir minha conta); o Play também pede um link da web para isso.
   - **Público-alvo:** 18 anos ou mais. **Classificação de conteúdo:** questionário IARC.
   - **Apps de saúde:** declarar que é app de saúde mental e bem-estar, sem dispositivo médico.
   - **Acesso para revisão:** uma conta de paciente de teste (e-mail e senha), porque o app exige login.
6. Desde 31/08/2026 o Play exige que app novo mire a API 36: o projeto já está em `targetSdkVersion 36`.

### 1.4 Build na sua máquina (opcional)

Crie `android/keystore.properties` (fica fora do git):

```properties
storeFile=/caminho/para/soliv-upload.jks
storePassword=SUA_SENHA
keyAlias=soliv-upload
keyPassword=SUA_SENHA
```

E rode, na raiz do projeto:

```bash
npm run build && npx cap sync android && (cd android && ./gradlew bundleRelease -PversionCode=2 -PversionName=1.0.0)
```

O AAB sai em `android/app/build/outputs/bundle/release/app-release.aab`.

---

## 2. iOS (App Store)

### 2.1 Conta Apple Developer (comece já: é o passo mais demorado)

1. Inscrição em [developer.apple.com/programs](https://developer.apple.com/programs/) (US$ 99 por ano).
2. Para publicar no nome da empresa (recomendado: o nome do vendedor aparece na loja), a Apple pede o número **D-U-N-S** do CNPJ. Se a empresa não tiver, a própria Apple encaminha o pedido (gratuito, pode levar até algumas semanas).
3. Anote o **Team ID** (Membership details, 10 caracteres).

### 2.2 Identificador do app e push

1. Em **Certificates, Identifiers & Profiles → Identifiers**, crie um App ID: `br.com.soliv.app`, marcando **Push Notifications**.
2. Em **Keys**, crie uma chave com **Apple Push Notifications service (APNs)**. Baixe o arquivo `.p8` (só dá para baixar uma vez) e anote o **Key ID**.

### 2.3 Firebase (mesmo projeto `app-soliv` do Android)

1. **Configurações do projeto → Seus apps → Adicionar app → iOS**, com o pacote `br.com.soliv.app`.
2. Baixe o `GoogleService-Info.plist`. Ele não é secreto (como o `google-services.json` do Android). Pode ser commitado em `ios/App/App/GoogleService-Info.plist` ou, se preferir, cadastrado como secret (abaixo).
3. **Cloud Messaging → Configuração do app Apple → Chave de autenticação de APNs:** envie o `.p8` do passo 2.2, com o Key ID e o Team ID.

Sem esse passo o push não chega no iPhone. O servidor já envia pelo Firebase com as opções da Apple (`_shared/fcm.ts`).

### 2.4 App Store Connect

1. Em [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps → +**: plataforma iOS, nome **Soliv**, idioma português (Brasil), pacote `br.com.soliv.app`, SKU `soliv`.
2. **Usuários e acesso → Integrações → Chaves da API da App Store Connect:** gere uma chave com a função **Administrador** (o workflow usa ela para criar os certificados e o perfil de distribuição sozinho). Baixe o `.p8` e anote o **Key ID** e o **Issuer ID**.

### 2.5 Secrets no GitHub

| Secret | Valor |
|---|---|
| `APPLE_TEAM_ID` | Team ID (2.1) |
| `ASC_KEY_ID` | Key ID da chave da App Store Connect (2.4) |
| `ASC_ISSUER_ID` | Issuer ID (2.4) |
| `ASC_KEY_P8_BASE64` | `base64 -i AuthKey_XXXX.p8 \| tr -d '\n'` |
| `IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64` | só se o plist não for commitado: `base64 -i GoogleService-Info.plist \| tr -d '\n'` |

### 2.6 Enviar ao TestFlight

Aba **Actions → iOS (TestFlight) → Run workflow** (versão `1.0.0`). O build aparece no TestFlight depois do processamento da Apple (10 a 30 minutos). Instale o app **TestFlight** no iPhone e adicione os testadores em App Store Connect → TestFlight.

Para a revisão da App Store:
- **Privacidade do app:** mesmos dados do formulário do Play (saúde, conteúdo do usuário, contato, identificadores), ligados à identidade do usuário, sem rastreamento.
- **URL da política de privacidade** e **URL de suporte**.
- **Notas para o revisor:** conta de teste e uma explicação do SOS (atendimento por psicólogos com CRP, não é serviço de emergência; em risco imediato, CVV 188 / SAMU 192).
- Exclusão de conta dentro do app: já existe (exigência da Apple).
- Faixa etária: 17+ (temas de saúde mental).

---

## 3. Pagamentos nas lojas

Hoje a assinatura é vendida pelo checkout do Stripe, inclusive dentro do app instalado. As duas lojas exigem o sistema de pagamento delas para **bens e serviços digitais**, com exceções:

- **Apple (diretriz 3.1.3(d)):** serviços em tempo real entre duas pessoas (o exemplo dado é "consultas médicas") podem ser cobrados por fora. Serviços de um para vários (grupos) e conteúdo digital do app não entram nessa exceção.
- **Apple no Brasil (acordo com o CADE, em vigor desde junho de 2026):** o app pode oferecer pagamento alternativo ou link para o site, sempre ao lado da compra pela Apple, com comissão menor que a padrão.
- **Google Play:** bens físicos e serviços prestados fora do app não precisam do faturamento do Play; conteúdo digital precisa. No Brasil também há regras de pagamento alternativo em andamento.

Os planos do Soliv misturam consulta e SOS com psicólogo (pessoa a pessoa, ao vivo) com recursos do app (diário, respiração, grupos, conteúdos). A decisão sobre o modelo de cobrança nos apps está registrada em `docs/pendencias-antes-do-lancamento.md`.

---

## 4. Roteiro de testes no aparelho (Android e iPhone)

Fazer nos dois, com o build da loja de teste (teste interno do Play e TestFlight):

1. Cadastro, login, saída e entrada de novo (a sessão continua ao fechar e abrir o app).
2. Permissões: câmera e microfone pedidos na primeira chamada, com o texto em português.
3. **SOS:** pedido, psicólogo aceita, chamada de vídeo e de áudio com imagem e som dos dois lados, encerramento e avaliação.
4. Consulta agendada: entrar na sala no horário, vídeo, encerrar.
5. **Push com o app fechado e com a tela bloqueada:** mensagem nova, consulta confirmada, SOS aceito (texto discreto na tela bloqueada). Tocar no push abre a tela certa.
6. Chat: enviar texto e foto (galeria e câmera).
7. Bloqueio de conta pelo admin com o app aberto: o app sai e mostra o aviso.
8. Pagamento (conforme a decisão da seção 3).
9. Excluir a conta pelo app.
10. Tela em modo escuro, fonte grande do sistema e iPhone com a "ilha" / Android com navegação por gestos (nada escondido atrás das barras).
