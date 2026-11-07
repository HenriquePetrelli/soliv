# Pendências antes do lançamento

O que precisa ser resolvido antes de o app ficar pronto. Ao resolver um item, mova-o para "Resolvidas" com a data e o que foi feito.

> **Passo a passo das configurações externas** (pendências 2, 5 e 6; a parte de empresa e contas está na 17; a 1, a 3 e o webhook do Stripe já foram resolvidos): `docs/guia-configuracoes-externas.md`.

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
- **Enquanto isso:** dá para colar os modelos em português no Supabase (Authentication → Email Templates) para testar com os e-mails da equipe; para usuários de fora, nenhum e-mail chega.
- **Como conferir:** pedir "Esqueci minha senha" com um e-mail que não é da equipe; o e-mail chega em português, com a logo e remetente "Soliv". Enviar um pedido de suporte e conferir que ele chega na caixa da equipe.
- **Registrado em:** 2026-10-05.

### 17. Abrir a empresa e as contas no nome dela

- **Situação:** ainda não há LTDA nem CNPJ. Sem eles não dá para ativar o Stripe no modo real, criar as contas das lojas como organização, registrar o domínio no nome da empresa nem preencher os documentos jurídicos (`[RAZÃO SOCIAL]`, `[CNPJ]`).
- **O que fazer, nesta ordem:**
  1. Contratar contador e definir o regime (Simples Nacional; perguntar sobre o Fator R, que pode baixar a alíquota inicial de cerca de 15,5% para 6%) e os CNAEs.
  2. Abrir a LTDA (contrato social com os dois sócios administradores, Junta Comercial, CNPJ, inscrição municipal) e um acordo de sócios (quotas, saída, de quem são o código, a marca e as contas).
  3. Conta bancária PJ (recebe o Stripe e paga os repasses por Pix) e certificado e-CNPJ A1.
  4. Pedir o número D-U-N-S (gratuito; Apple e Google exigem para contas de organização e pode levar semanas).
  5. Passar Supabase, Lovable, Firebase, Resend, Cloudflare e GitHub para um e-mail da empresa, com os dois sócios como administradores, cartão PJ e alerta de gasto.
- **Registrado em:** 2026-11-06.

### 18. Supabase no plano Pro antes do primeiro paciente

- **Situação:** o projeto está no plano gratuito: sem backup diário, com risco de pausa por falta de uso e logs guardados por 1 dia. Uma perda apagaria diários, planos de segurança e registros de atendimento que precisam ser guardados por 5 anos.
- **O que fazer:** assinar o Pro (US$ 25 por mês) e, junto, ligar "Prevent use of leaked passwords" (pendência 6). Avaliar o backup de ponto no tempo (PITR) quando houver volume.
- **Registrado em:** 2026-11-06.

### 19. Nota fiscal das mensalidades

- **Situação:** cada cobrança do Plus e do Premium é uma venda de serviço, e o app não emite nota fiscal.
- **O que fazer:** contratar um emissor de NFS-e com API (NFE.io, Focus NFe, eNotas ou similar) e pedir ao Claude a ligação com o evento `invoice.paid` do `stripe-webhook`. A cobrança das empresas (B2B) também precisa de nota e boleto, hoje feitos fora do app.
- **Depende de:** CNPJ, inscrição municipal e e-CNPJ (pendência 17).
- **Registrado em:** 2026-11-06.

### 20. Preço do Premium menor que o repasse

- **Situação:** o Premium custa R$ 120,00, e o repasse de quem usa a consulta e o SOS do mês é R$ 140,00 (R$ 90 + R$ 50). Com a taxa do Stripe e o imposto (15,5%), cada Premium que usa tudo dá prejuízo de cerca de R$ 44. Para empatar nesse caso, o Premium precisaria custar cerca de R$ 176. O Plus que usa o SOS deixa cerca de R$ 5.
- **O que fazer:** decidir entre subir o preço, mudar o valor do repasse ou tirar o SOS do Premium. Ao decidir, pedir ao Claude para atualizar `src/lib/plans.ts`, os preços no Stripe, os repasses em `sync_psychologist_payments` e os Termos.
- **Decisão (2026-11-07):** três planos, sem nenhum dar prejuízo mesmo com a cota inteira usada (imposto de 15,5%):

  | Plano | Preço | O que dá por mês | Repasse | Sobra no pior caso |
  |---|---|---|---|---|
  | Plus | R$ 69,90 | 1 SOS | SOS R$ 50 | ≈ R$ 5,40 |
  | Gold | R$ 120,00 | 1 SOS **ou** 1 consulta | SOS R$ 50 ou consulta R$ 90 | ≈ R$ 5,38 (consulta) |
  | Premium | R$ 159,90 | 1 SOS **e** 1 consulta | SOS R$ 40 e consulta R$ 85 | ≈ R$ 2,23 |

  "Sobra" é o preço menos a taxa do Stripe (≈ 4,7% + R$ 0,39), o Simples Nacional e o repasse, antes dos custos fixos. Falta mudar o app: plano Gold no banco e nas edge functions (`PLAN_LIMITS` em `supabase/functions/_shared/billing.ts`) com cota compartilhada entre SOS e consulta, preço novo do Premium e preço do Gold no Stripe (`STRIPE_PRICE_GOLD`), **repasse por plano** em `sync_psychologist_payments` (hoje é R$ 90 e R$ 50 para todos), telas de planos, Termos e ficha 09.
- **Registrado em:** 2026-11-06.

### 21. SOS on-line e a norma do CFP sobre urgência e emergência

- **Situação:** a Resolução CFP 11/2018, citada nos termos do psicólogo, tratava o atendimento de pessoas em urgência e emergência por meios on-line como inadequado. É preciso confirmar o que diz a norma em vigor (Resolução CFP 09/2024) sobre o SOS por vídeo e por mensagem, que é o centro do produto.
- **O que fazer:** parecer específico do advogado (pergunta 14 de `docs/lgpd/LEIA-ME.md`); depois, atualizar as citações dos termos e, se houver restrição, a forma de apresentar o SOS. Perguntar também ao CRP da sede se a empresa precisa de registro de pessoa jurídica com psicólogo responsável técnico.
- **Registrado em:** 2026-11-06.

## Importantes

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

- **Situação:** política de privacidade, termos de uso (paciente e psicólogo) e registro de tratamento (`docs/lgpd/`) estão em versão para revisão. O registro ainda tem itens **[DECIDIR]** (prazo dos logs de segurança além dos 6 meses do Marco Civil) e **[CONFIRMAR]** (hospedagem do front-end pela Lovable, regiões e cláusulas da transferência internacional de dados).
- **O que fazer:** revisão por um advogado de proteção de dados antes do lançamento; depois, pedir ao Claude para atualizar os textos e a versão dos documentos (o app pede o aceite de novo quando a versão muda).
- **Registrado em:** 2026-10-13 (estava só na ficha 18).

### 22. Publicar o app Android na Google Play

- **Situação:** `android/app/build.gradle` não tem assinatura de release, a minificação está desligada e a versão é 1 / 1.0. O alvo é a API 35; conferir se o Google Play já exige a API 36 para apps novos.
- **O que fazer:** conta do Play Console como organização (US$ 25; conta pessoal nova exige teste fechado com 12 testadores por 14 dias), chave de assinatura guardada fora do GitHub e com cópia, AAB, ficha da loja, formulário de Segurança dos dados, declaração de app de saúde, classificação etária e uma página pública para pedir a exclusão da conta (exigência do Google).
- **Depende de:** D-U-N-S (pendência 17).
- **Registrado em:** 2026-11-06.

### 23. App para iPhone

- **Situação:** o pacote `@capacitor/ios` está instalado, mas a plataforma não foi adicionada (não existe `ios/`). No iPhone, hoje só pelo Safari, e o push só chega com o site na Tela de Início.
- **O que fazer:** Apple Developer Program como organização (US$ 99 por ano), `npx cap add ios` num Mac (ou serviço de compilação na nuvem), permissões de câmera e microfone, chave APNs no Firebase e revisão da Apple. Os ícones já estão em `docs/visual/assets/ios/`.
- **Registrado em:** 2026-11-06.

### 24. Regras de pagamento das lojas

- **Situação:** as assinaturas são vendidas pelo Stripe. Apple e Google exigem o sistema de pagamento delas para conteúdo digital, com exceção para serviços prestados em tempo real entre pessoas (na Apple, regra 3.1.3(d)).
- **O que fazer:** confirmar que o Plus e o Premium (SOS e consulta com psicólogo) se encaixam na exceção nas duas lojas antes de enviar o app.
- **Registrado em:** 2026-11-06.

### 25. Psicólogos online para o SOS

- **Situação:** o SOS só funciona se houver psicólogo online, e o app não tem escala de plantão nem cobertura mínima por horário. Um paciente pagante pode não achar ninguém (o app mostra CVV 188 e SAMU 192).
- **O que fazer:** decidir a operação (escala de plantão, valor por hora, meta de tempo de espera) e depois pedir ao Claude um painel para o admin ver os horários sem cobertura.
- **Registrado em:** 2026-11-06.

### 26. Monitoramento de erros e números de uso

- **Situação:** não há Sentry nem painel de métricas. Uma falha em produção só aparece se alguém reclamar ou se a equipe olhar `sos_trace_events`.
- **O que fazer:** conta gratuita no Sentry ligada ao app e às edge functions, sem enviar dado de saúde; uma aba de números no painel do admin (assinantes, cancelamentos, tempo de espera do SOS, chamadas que falham).
- **Registrado em:** 2026-11-06.

### 27. LGPD na operação

- **O que fazer:**
  1. Nomear o encarregado (DPO) e criar caixas de e-mail que recebem: `suporte@`, `privacidade@` e `financeiro@` (o Resend só envia). Trocar o e-mail do admin (`admin@calmconnect.com`).
  2. Guardar os registros de acesso por 6 meses (Marco Civil, art. 15): o Supabase guarda 1 dia no gratuito e 7 no Pro. Depois da decisão do advogado, pedir ao Claude uma tabela de acessos com limpeza automática.
  3. Aceitar os contratos de dados (DPA) de Supabase, Stripe, Resend, Google, Cloudflare e Lovable e anotar a região e a garantia da transferência internacional.
  4. Incluir a Cloudflare na política de privacidade antes de ligar o TURN (pendência 5): ela passa a retransmitir as chamadas e vê o IP.
  5. Relatório de impacto (RIPD) e um plano curto de resposta a incidente (aviso à ANPD e aos titulares em até 3 dias úteis).
  6. Mostrar razão social, CNPJ, endereço e contato no app e informar a renovação automática na tela de planos (Decreto 7.962/2013).
- **Registrado em:** 2026-11-06.

### 28. Marca no INPI

- **Situação:** nenhum pedido. O `soliv.com.br` estar com outra pessoa é motivo para fazer logo a busca de anterioridade.
- **O que fazer:** busca e pedido nas classes 9 (aplicativo) e 44 (serviços de psicologia), talvez 42.
- **Registrado em:** 2026-11-06.

### 29. Documento fiscal dos repasses

- **Situação:** o repasse registra o Pix e o código E2E, mas não pede nota fiscal nem recibo do psicólogo.
- **O que fazer:** decidir com o contador entre nota do psicólogo PJ e RPA para pessoa física (psicólogo não pode ser MEI); depois, pedir ao Claude um campo para anexar a nota no repasse.
- **Registrado em:** 2026-11-06.

### 30. Não há API para conferir se o CRP do psicólogo está ativo

- **Situação:** o cadastro recebe o número do CRP e um documento, e o admin aprova na mão. O Conselho Federal de Psicologia tem a consulta pública do Cadastro Nacional (cadastro.cfp.org.br), mas não oferece uma API para o app conferir sozinho se o registro está ativo. Também não há nova conferência depois da aprovação: um psicólogo com o registro suspenso ou cancelado continuaria atendendo, inclusive no SOS.
- **O que fazer:**
  1. Agora: checklist do admin na aprovação. Conferir no Cadastro Nacional o nome, o número, o CRP da região e a situação "ativo", e o cadastro e-Psi. Guardar a data e quem conferiu.
  2. Conferir de novo de tempos em tempos (por exemplo, a cada 6 meses e antes de cada repasse grande), com um aviso no painel do admin para os cadastros vencidos. Pedir ao Claude a data da última conferência e o lembrete.
  3. Nos termos do psicólogo, manter a obrigação de avisar o Soliv se o registro for suspenso ou cancelado, com bloqueio na hora.
  4. Perguntar ao CFP ou ao CRP da sede se existe convênio ou serviço de consulta para empresas. Ler os dados da página de consulta pública por robô quebra fácil e pode ir contra as regras do site: só com autorização.
- **Registrado em:** 2026-11-06.

## Melhorias sugeridas

- **Pagar os repasses pela API Pix do banco** (registrada em 2026-11-06): hoje o admin faz cada Pix e cola o E2E no painel; com mais psicólogos, a API do banco PJ paga e confirma sozinha.
- **Confirmação de consulta por e-mail** (registrada em 2026-11-06): comentário pendente em `supabase/functions/appointments/index.ts:545`; hoje vai pelo aviso no app e pelo push. Depende do domínio (pendência 2).
- **Criar `.env.example`** (registrada em 2026-11-06): o README manda copiar esse arquivo, que não existe. Só os nomes das variáveis, sem valores.

## Resolvidas

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
- Em 2026-10-30, a verificação em duas etapas passou a ser obrigatória para o admin (app autenticador; ficha 19). Fica para depois: trocar o e-mail `admin@calmconnect.com` quando houver domínio.

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
