# Monitoramento no Grafana Cloud (plano gratuito)

Como saber, sem depender de alguém reclamar, que o Soliv caiu ou está dando erro. Tudo cabe no **plano Free** do Grafana Cloud (US$ 0, sem cartão). Não marque "enterprise plugins": o Soliv não precisa deles.

| O que | Ferramenta do Grafana | Situação |
|---|---|---|
| Erros no app (site, Android e iOS) | Frontend Observability (SDK Faro) | **Pronto e configurado** (app Soliv, São Paulo); liga na próxima publicação |
| Erros nas edge functions | Loki (logs) | **Pronto no código**, faltam 3 secrets no Supabase |
| O app está no ar? | Synthetic Monitoring | Função `health` **pronta**, falta criar as checagens |
| Saúde do banco | Integração Supabase (Metrics API) | Só ligar no painel |
| Avisos | Alerting (e-mail, Telegram etc.) | Criar as regras abaixo |

## 1. Criar a conta

1. grafana.com → **Create free account**.
2. Ao criar a *stack*, escolha a região **mais perto do Brasil** que aparecer (São Paulo, se houver; senão, Estados Unidos). Anote o nome da stack (ex.: `soliv`).
3. Fique no **Free**. O Free nunca cobra: se a cota do mês acabar, o Grafana para de receber dados até o mês virar.

## 2. Erros do app (Frontend Observability)

O que já está no código (`src/lib/monitoring/`):
- carrega o SDK Faro **depois** que o app começa a abrir (não pesa na primeira tela, ~42 KB à parte);
- envia erros não tratados, telas que quebraram (`AppErrorBoundary`), tempo de carregamento (Web Vitals) e a sessão;
- **não** envia usuário, console, tempo de cada requisição, localização nem gravação de tela;
- antes de sair do aparelho apaga e-mail, telefone, CPF, ids, tokens e tudo depois de `?` e `#` nos endereços (o link de "redefinir senha" leva o token no `#`). Conferido no navegador: o erro chega como `teste para [email] id :id` e a página como `/reset-password`.

Passo a passo:
1. Grafana Cloud (sua stack, `….grafana.net`) → **Observability → Frontend** → **Create new**.
2. Nome: `Soliv`. Em **CORS allowed origins / Domains**, coloque:
   - `https://calmconnect-auth-flow.lovable.app` (e o domínio próprio, quando houver)
   - `https://localhost` (app Android)
   - `capacitor://localhost` (app iOS)
3. Escolha **Manual instrumentation** e **React**. **Não** cole o código que a tela mostra: o Soliv já tem o dele. O exemplo do Grafana liga o *tracing*, que acrescenta cabeçalhos em toda chamada ao Supabase (risco de quebrar o CORS) e manda as URLs com ids; também não limpa dados pessoais.
4. **Feito em 2026-11-12:** app **Soliv** criado na região `sa-east-1` (São Paulo). O endereço do coletor está em `DEFAULT_FARO_URL` (`src/lib/monitoring/index.ts`) e vale para o site e para os apps Android/iOS sem configurar nada. Não é segredo: fica visível no app, como as chaves do Firebase.
   - Para trocar de app/coletor: `VITE_FARO_URL=<novo endereço>` (no build ou na variável do GitHub). Para desligar: `VITE_FARO_URL=off`.
5. Publique. Abra o app publicado, espere um erro real (ou force um) e veja em Observability → Frontend → **Soliv** → **Errors**. As versões aparecem como `web`, `android-N` e `ios-N`.

O monitoramento só liga no build publicado; no `npm run dev` fica desligado.

**Cota:** 50 mil sessões/mês no Free (uma sessão = uma pessoa usando o app por um período; dura até 4 h ou 15 min parada). Dá para uns 1.500 usuários ativos por dia. Se chegar perto, coloque `VITE_FARO_SAMPLE_RATE=0.5` (metade das sessões) em vez de pagar.

## 3. Erros das edge functions (Loki)

O que já está no código: as 41 funções passam por `monitored()` (`supabase/functions/_shared/monitoring.ts`). Quando uma função responde **5xx** ou lança uma exceção, uma linha vai para o Loki com o nome da função, o método, o status e a mensagem de erro (limpa de e-mail, ids, tokens e chaves do Stripe). A resposta para o usuário não muda nem atrasa. Sem os secrets, nada é enviado.

Passo a passo:
1. Grafana Cloud → **My Account** (grafana.com/orgs/…) → na stack, **Loki → Details**. Anote a **URL** (ex.: `https://logs-prod-024.grafana.net`) e o **User** (um número).
2. **Access Policies → Create access policy**: nome `soliv-edge-logs`, escopo **logs:write** (só isso) → **Add token** → copie o token.
3. Supabase → Edge Functions → **Secrets** (ou peça para a Lovable: "adicione o secret NOME"):
   - `GRAFANA_LOKI_URL` = a URL do passo 1
   - `GRAFANA_LOKI_USER` = o número do passo 1
   - `GRAFANA_LOKI_TOKEN` = o token do passo 2 (**este é segredo**)
4. Publique as edge functions de novo (todas mudaram, mais a nova `health`).
5. Para ver: Grafana → **Explore** → Loki → consulta `{app="soliv", source="edge-function"}`.

**Cota:** 50 GB de logs/mês. Cada erro é uma linha curta (~300 bytes); não chega perto.

## 4. "O app está no ar?" (Synthetic Monitoring)

A função nova `health` (pública, `verify_jwt = false`) responde **200** quando as edge functions rodam **e** o banco responde, e **503** quando o banco não responde. Ela não devolve nenhum dado, só `{"status":"ok","db":"ok","db_ms":42}`.

Grafana Cloud → **Testing & synthetics → Synthetics → Add new check → API Endpoint (HTTP)**. Crie estas 3, cada uma com **1 local de teste** (probe: São Paulo, se houver; senão o mais perto):

| Checagem | Endereço | Frequência | Esperado | Execuções/mês |
|---|---|---|---|---|
| Site | `https://calmconnect-auth-flow.lovable.app` | 2 min | status 200 | ~21.600 |
| Backend + banco | `https://ihrrgmmsfuvlasmzdmwf.supabase.co/functions/v1/health` | 2 min | status 200 e corpo contém `"ok"` | ~21.600 |
| Login (Supabase Auth) | `https://ihrrgmmsfuvlasmzdmwf.supabase.co/auth/v1/health` com o cabeçalho `apikey: <chave anon>` | 5 min | status 200 | ~8.600 |
| **Total** | | | | **~52 mil de 100 mil grátis** |

Cuidado com a conta: **cada local a mais multiplica** as execuções. 3 checagens a cada 1 min em 3 locais dariam ~390 mil e sairiam do Free (no Free, as checagens param). Com a tabela acima, sobra margem para mais uma checagem quando o domínio próprio existir.

As checagens de navegador (abrir a tela de login de verdade) têm cota de 10 mil/mês; uma a cada 15 min de 1 local gasta ~2.900. Opcional.

## 5. Saúde do banco (Supabase)

1. Supabase → **Integrations** (ou Settings → Observability) → **Grafana Cloud** → conectar. A integração lê a Metrics API do projeto (CPU, memória, disco, conexões, ~200 métricas do Postgres) a cada minuto.
2. Se pedir chave, use uma **Secret key** (`sb_secret_...`) criada só para isso.
3. Depois de 1 dia, confira em **Cost management → Usage** quantas *séries ativas* entraram. O Free tem 10 mil; o Supabase costuma usar bem menos. Se passar, dá para filtrar as métricas na integração.

## 6. Avisos (Alerting)

Grafana → **Alerting → Contact points** → crie um com seu e-mail (e/ou Telegram, Discord, Slack). Depois **Alert rules → New alert rule**:

| Regra | Condição | Por quê |
|---|---|---|
| App fora do ar | a checagem *Site* ou *Backend + banco* falha por 2 execuções seguidas (as checagens já trazem um alerta pronto: "Synthetics → check → Alerting → sensibilidade *High*") | site, edge functions ou banco caíram |
| Login fora do ar | a checagem *Login* falha por 10 min | ninguém consegue entrar |
| Muitos erros no app | em Frontend → `Soliv` → Errors: mais de 20 erros em 15 min | algo quebrou depois de uma publicação |
| Erros nas edge functions | Loki: `sum(count_over_time({app="soliv", source="edge-function"}[10m])) > 5` | pagamento, SOS ou agendamento falhando |
| Erro no SOS (crítico) | Loki: `sum(count_over_time({app="soliv", fn=~"emergency-sos\|psychologist-emergency\|initiate-webrtc"}[5m])) > 0` | qualquer falha no atendimento de crise avisa na hora |

Alertas são gratuitos e não gastam cota.

## 7. Custos e limites (conferidos em 2026-11-09)

| Item | Free | Se passar (plano Pro, US$ 19/mês + uso) |
|---|---|---|
| Sessões do app | 50 mil/mês | US$ 0,75 por mil |
| Checagens HTTP | 100 mil/mês | US$ 5 por 10 mil |
| Checagens de navegador | 10 mil/mês | US$ 50 por 10 mil |
| Logs | 50 GB/mês | por GB |
| Métricas | 10 mil séries | ~US$ 6,50 por mil |
| Histórico | 14 dias | 13 meses (métricas), 30 dias (logs) |
| Usuários do Grafana | 3 | por usuário |

Passar para o Pro só quando chegar perto das 50 mil sessões ou quando precisar de mais de 14 dias de histórico. No Pro, ligar **Cost management → Usage limits** para não ter conta surpresa.

## 8. Privacidade (LGPD)

O Grafana Labs entra como operador em `docs/lgpd/registro-de-tratamento.md` e na política de privacidade (seção 6). Itens para o advogado: região dos dados e transferência internacional (`docs/lgpd/LEIA-ME.md`, item 7). Para desligar tudo a qualquer momento: publicar com `VITE_FARO_URL=off` e apagar os 3 secrets `GRAFANA_LOKI_*`.
