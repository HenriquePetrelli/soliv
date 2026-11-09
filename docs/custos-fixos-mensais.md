# Custos fixos mensais do Soliv

Levantamento de 2026-11-09. Os preços são em dólar (cobrados no cartão internacional) e vieram das páginas de preço de cada serviço e de comparativos recentes. **Confira no painel de cada um antes de fechar o orçamento**: os preços mudam e há IOF (3,5%) sobre compras em dólar no cartão.

Conversão usada como referência: **US$ 1 ≈ R$ 5,50** (ajuste para a cotação do dia).

## 1. Resumo

| Serviço | Para que serve no Soliv | Plano | US$/mês | R$/mês (aprox.) |
|---|---|---|---|---|
| Supabase | Banco, login, edge functions, storage, rotinas | Pro | 25,00 | 137,50 |
| Grafana Cloud | Monitoramento e alertas | Pro (taxa da plataforma) | 19,00 | 104,50 |
| Lovable | Editor e publicação do app web | Pro | 25,00 | 137,50 |
| Claude | Desenvolvimento (Claude Code) | Pro | 20,00 | 110,00 |
| Resend | E-mails (suporte, avisos de consulta, login via SMTP) | Pro | 20,00 | 110,00 |
| Apple Developer | Publicar na App Store | US$ 99/ano | 8,25 | 45,40 |
| Domínio | `soliv.com.br` (Registro.br) | R$ 40/ano | — | 3,35 |
| **Total fixo** | | | **≈ 117,25** | **≈ R$ 648** |
| **Total + IOF 3,5%** | | | | **≈ R$ 670** |

Se o Claude for o plano **Max** em vez do Pro, some **US$ 80** (Max 5x, US$ 100) ou **US$ 180** (Max 20x, US$ 200): total de **≈ R$ 1.110** ou **≈ R$ 1.680** com IOF.

## 2. Detalhes de cada serviço

### Supabase Pro — US$ 25/mês
- Inclui US$ 10 de crédito de computação, que cobre a instância **Micro** do projeto `ihrrgmmsfuvlasmzdmwf`. Subir para Small custa cerca de US$ 15 a mais por mês.
- Incluído: 8 GB de banco, 100 mil usuários ativos por mês, 100 GB de storage, 2 milhões de chamadas de edge function. Acima disso, cobra por uso (ex.: US$ 0,125 por GB extra de banco).
- Habilita "Prevent use of leaked passwords" (pendência do painel, ver `docs/guia-configuracoes-externas.md`, passo 3) e backups diários.
- Cada projeto extra na organização (ex.: um de homologação) custa a partir de US$ 10/mês.

### Grafana Cloud Pro — US$ 19/mês + uso
- US$ 19 é a taxa fixa da plataforma. Métricas, logs e traces acima da cota grátis são cobrados à parte (métricas: cerca de US$ 6,50 por mil séries acima de 10 mil).
- Para o tamanho atual do app, a tendência é ficar dentro da cota e pagar só a taxa. Se o uso couber no plano **Free** (10 mil séries, 50 GB de logs, 14 dias de retenção), dá para economizar os US$ 19.

### Lovable Pro — US$ 25/mês
- 100 créditos por mês (mais créditos diários). Créditos extras são comprados à parte.
- Anual sai por cerca de US$ 21/mês.
- Necessário para domínio próprio no app publicado (passo 2.6 do guia).

### Claude Pro — US$ 20/mês
- Usado no desenvolvimento (Claude Code). Max 5x: US$ 100; Max 20x: US$ 200.
- Anual do Pro sai por cerca de US$ 17/mês.

### Resend Pro — US$ 20/mês
- 50 mil e-mails/mês, sem limite diário. Excedente: US$ 0,90 por mil.
- O plano **Free** (3 mil/mês, máximo de 100 por dia) atende no começo, mas o limite diário pode travar o "Esqueci minha senha" num dia de pico. Recomendado assinar o Pro no lançamento.

### Apple Developer — US$ 99/ano (≈ US$ 8,25/mês)
- Obrigatório para publicar no iOS (ver `docs/publicacao-lojas.md`).

### Domínio — cerca de R$ 40/ano
- Valor do `.com.br` no Registro.br. Um `.app` em registrador estrangeiro fica em torno de US$ 15 a 20/ano.

## 3. Serviços sem custo fixo (pagos só por uso, ou grátis)

| Serviço | Uso no Soliv | Custo |
|---|---|---|
| Stripe | Assinaturas e avulsos | Sem mensalidade. Por transação com cartão nacional: cerca de 3,99% + R$ 0,39. Ex.: no Completo (R$ 159,90), ≈ R$ 6,77 por cobrança |
| Firebase Cloud Messaging | Push (SOS, lembretes, chat) | Grátis |
| Cloudflare Realtime TURN | Chamadas de vídeo em redes restritas | 1.000 GB/mês grátis; depois, US$ 0,05 por GB |
| GitHub Actions | Testes e builds Android/iOS | Grátis em repositório público. Em privado: 2.000 min/mês grátis, mas o build iOS roda em macOS, que consome 10x (cada build de ~15 min gasta ~150 min da cota) |
| Google Play Console | Publicar no Android | US$ 25 uma única vez (não é mensal) |

## 4. Custos variáveis que crescem com o uso

Não entram no total fixo, mas vale acompanhar:
- **Repasses aos psicólogos**: R$ 85,00 por consulta agendada e R$ 40,00 por SOS realizado (`docs/fluxos/09-repasses.md`). É o maior custo variável.
- **Taxa do Stripe** em cada cobrança (acima).
- **Excedentes** de Supabase (banco, egress, edge functions), Grafana (séries e logs), Resend (e-mails) e Cloudflare TURN (tráfego de vídeo).

## 5. Onde economizar

- Pagar anual onde existe desconto (Lovable, Claude, Resend): cerca de 15% a 20% a menos.
- Ficar no Grafana Cloud Free e no Resend Free enquanto o volume for baixo: −US$ 39/mês (≈ −R$ 215).
- Cenário mínimo para lançar (Supabase Pro + Lovable Pro + Claude Pro + Apple + domínio, com Grafana e Resend no Free): **≈ US$ 78/mês ≈ R$ 445 com IOF**.
