# E-mails de login (Supabase Auth)

Os e-mails de redefinir senha, confirmar cadastro, trocar e-mail, link de acesso, convite e código de confirmação são enviados pelo **Supabase**, não pelo código do app. Por isso o texto, o remetente e o visual são configurados no painel do Supabase.

## Como estava

- Remetente "Supabase Auth", texto em inglês ("Reset Your Password"), link azul simples e rodapé "powered by Supabase".
- Servidor de e-mail padrão do Supabase: **só entrega para os e-mails da equipe do projeto**, no máximo 30 por hora. Um paciente de verdade não recebe o e-mail de redefinir senha.

## Como fica

Modelos em português em `supabase/templates/`, no mesmo padrão dos e-mails de grandes empresas (Google, Nubank, Spotify, Airbnb, Slack):

| Elemento | No Soliv |
|---|---|
| Remetente e assunto claros | "Soliv", assunto "Redefina sua senha do Soliv" |
| Marca | Logo do Soliv no topo, cartão branco com borda, botão roxo, sem gradiente nem emoji |
| Por que chegou | "Recebemos um pedido para redefinir a senha da conta ana@… no Soliv" |
| Uma ação só | Botão "Criar nova senha" |
| Validade | "O link vale por 1 hora e só pode ser usado uma vez" |
| Não foi você | "Pode ignorar este e-mail. Sua senha continua a mesma" |
| Botão não abre | Link completo para copiar e colar |
| Ajuda | "No app, abra Perfil > Suporte"; CVV 188 (app de saúde mental) |
| Texto de prévia | Linha escondida que aparece na lista da caixa de entrada |

A logo vem de `{{ .SiteURL }}/email/soliv-logo.png` (arquivo `public/email/soliv-logo.png`, publicado junto com o app). PNG porque o Gmail não mostra SVG.

## Passo a passo no painel do Supabase

> **Domínio do Soliv: `solivsaude.com.br`** (pendência crítica 2 em `docs/pendencias-antes-do-lancamento.md`). Até ele estar verificado no Resend e o SMTP ligado, os e-mails de login chegam só para a equipe do projeto.

### 1. Servidor de e-mail próprio (Resend)

O app já usa o Resend para os e-mails de suporte e de consultas.

1. No [Resend](https://resend.com/domains), confira que o domínio do Soliv (`solivsaude.com.br`) está **verificado** (registros DNS SPF e DKIM). Sem isso, os e-mails caem no spam ou não saem.
2. Supabase → **Authentication → Emails → SMTP Settings** → ligar **Enable Custom SMTP**:
   - **Sender email:** `nao-responda@solivsaude.com.br` (ou outro endereço do domínio verificado)
   - **Sender name:** `Soliv`
   - **Host:** `smtp.resend.com`
   - **Port:** `465`
   - **Username:** `resend`
   - **Password:** uma API key do Resend (pode ser a mesma do secret `RESEND_API_KEY` ou uma nova só para isso)
3. Salvar. Com o SMTP próprio, o rodapé "powered by Supabase" e o limite de 30 por hora deixam de existir. Ajuste em **Rate Limits** o limite de e-mails por hora (ex.: 100).

### 2. Modelos em português

Supabase → **Authentication → Emails → Templates**. Para cada modelo, troque o **Subject** e cole o conteúdo do arquivo no **Message body** (aba Source):

| Modelo no painel | Assunto | Arquivo |
|---|---|---|
| Reset Password | `Redefina sua senha do Soliv` | `supabase/templates/recovery.html` |
| Confirm signup | `Confirme seu e-mail no Soliv` | `supabase/templates/confirmation.html` |
| Change Email Address | `Confirme seu novo e-mail no Soliv` | `supabase/templates/email_change.html` |
| Magic Link | `Seu link de acesso ao Soliv` | `supabase/templates/magic_link.html` |
| Invite user | `Você foi convidado para o Soliv` | `supabase/templates/invite.html` |
| Reauthentication | `Seu código de confirmação do Soliv` | `supabase/templates/reauthentication.html` |

### 3. Site URL e validade

- **Authentication → URL Configuration → Site URL:** o endereço publicado do app (o mesmo que abre a tela de login). A logo do e-mail e o link de "Criar nova senha" usam esse endereço. Em **Redirect URLs**, inclua `<endereço do app>/reset-password`.
- **Authentication → Providers → Email → Email OTP Expiration:** `3600` (1 hora), que é o prazo escrito nos e-mails.

## Como conferir

1. No app publicado, tela de entrada → **Esqueci minha senha** com um e-mail que **não** é da equipe do Supabase.
2. O e-mail chega com remetente "Soliv", assunto "Redefina sua senha do Soliv", logo no topo e tudo em português.
3. "Criar nova senha" abre a tela de nova senha do app; depois de trocar, entrar com a senha nova funciona.
4. Usar o mesmo link de novo: o app avisa que o link venceu ou já foi usado.

## Onde está

- Modelos: `supabase/templates/*.html` (também ligados em `supabase/config.toml` para o ambiente local).
- Logo: `public/email/soliv-logo.png`.
- Teste: `src/test/authEmailTemplates.test.ts` (português, variáveis certas, sem "Supabase").
