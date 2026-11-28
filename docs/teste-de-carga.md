# Teste de carga

> **Última rodada:** 2026-11-28, contra o Supabase de produção (banco **Micro**: 1 GB de RAM, 2 CPUs compartilhadas), antes e depois das correções do tempo real do mesmo dia. Tempo real limitado a **400 conexões** (o plano Pro inclui ~500; acima disso o Supabase cobra ou recusa, e a rodada de 2026-11-27 com 1.103 conexões gerou aviso de uso justo). Script e passo a passo: `e2e/carga/`.

## Rodada de 2026-11-28: antes e depois

Mesma carga nas duas: ~1.150 pessoas no banco (257 chamadas, 150 psicólogos na fila do SOS, 200 pacientes esperando o SOS, 250 navegando) e 400 conexões de tempo real, cada uma com os **mesmos canais que a tela da pessoa abre** (estado da conta, notificações, conversas, fila do SOS, presença do psicólogo, sala e presença da chamada).

| No pico (100%) | Antes | Depois | |
|---|---|---|---|
| CPU do banco | 74–79% | 59–62% | −20% |
| Tempo total do banco no teste | 459 s | 261 s | −43% |
| Tempo real lendo mudanças (`postgres_changes`) | 378 s (82%), 132 ms por leitura | 198 s (76%), 58 ms por leitura | −48% |
| Escutas com erro `Too many database timeouts` | 12.110 | 185 | −98% |
| `count_available_psychologists` | 4,5 ms | 1,2 ms | −73% |
| Pedidos/s do app | 266 | 266 | |
| Resposta do app p50 / p95 / p99 | 176 / 202 / 258 ms | 175 / 202 / 278 ms | igual |
| Falhas dos pedidos do app | 0% | 0% | |
| Memória livre | ~285–335 MB | ~305–315 MB | |

Degraus (depois): 10% → 7% de CPU; 25% → 16%; 50% → 29% (antes 41%); 100% → 59–62% (antes 74–79%). A resposta do app ficou igual em todos (~170 ms é a viagem da rede desta máquina até São Paulo).

O que mudou entre as duas (migration `20261128120000_escala_tempo_real.sql`):
- A lista de conversas recebe um aviso do banco no canal privado `conversas:<id>` em vez de escutar a tabela `conversas`.
- A presença da chamada (`participant_presence`, a tabela que mais muda) e `conversas` saíram do `postgres_changes`; a tela da chamada já lê o outro lado a cada 15 s.
- `count_available_psychologists` numa consulta só (antes uma por psicólogo online).

**O que ainda pesa:** o `postgres_changes` continua sendo 76% do tempo do banco (notificações, sala da chamada, presença do psicólogo, mensagens). Com o tempo real perto de 500 conexões, a CPU deve passar dos 80%. Próximos passos, por ordem:
1. **Aumentar o pool de conexões do Realtime com o banco** (Supabase → Realtime → Settings → "Database connection pool size"). Não foi alterado: a mudança em produção foi bloqueada pela verificação automática de permissões e fica para decisão da equipe. Na rodada de 2026-11-27, 300 pessoas conectando no mesmo segundo tiveram entradas recusadas (`IncreaseConnectionPool`).
2. Tirar `psychologist_presence` do `postgres_changes` (a tela só precisa saber quando o servidor apaga a linha) e trocar as escutas de notificações e da sala da chamada por avisos do banco em canais privados, como a fila do SOS e as conversas.
3. Subir o banco para **Small** antes de ~1.000 pessoas ao mesmo tempo.
4. **Conexões de tempo real:** cada pessoa com o app aberto usa uma. O plano Pro inclui ~500 ao mesmo tempo; acima disso é preciso tirar o limite de gastos (paga o excedente) ou elas são recusadas.

**Teste local (Supabase na própria máquina):** 300 conexões entrando no mesmo segundo funcionaram sem erro (1.382 entradas), e o canal novo de conversas aceitou todas as entradas. Acima de ~300 conexões o Supabase local recusa por limite próprio, então ele não serve para medir o tempo real acima disso.

---

# Rodada de 2026-11-27

## Resumo

- **1.100 pessoas usando ao mesmo tempo** (206 chamadas, 150 psicólogos na fila do SOS, 200 pacientes esperando o SOS, 250 navegando e uma conexão de tempo real por pessoa): o banco ficou em **~58% de CPU**, as respostas não ficaram mais lentas em nenhum degrau e **0,02%** dos pedidos falharam.
- Pela tendência (CPU cresce em linha reta com o número de pessoas), o Micro chega a ~80% de CPU por volta de **1.500 pessoas** com essa mistura de uso. A memória livre caiu de ~450 MB para ~240–285 MB no pico.
- **O maior consumidor do banco não é o app, é o tempo real:** 72% do tempo do banco foi a leitura das mudanças para o `postgres_changes` (52 ms por leitura). As consultas do app custam de 0,1 a 4 ms.
- **Gargalo encontrado: muita gente conectando ao mesmo tempo.** Com a subida gradual, as 2.720 entradas em canais deram certo. Com 300 pessoas conectando no mesmo segundo (como depois de uma queda da internet ou de uma atualização do app), o tempo real ficou sem conexões com o banco: 2.451 avisos `Too many database timeouts` nas escutas `postgres_changes` e 39 entradas no canal privado do SOS recusadas (`IncreaseConnectionPool: Please increase your connection pool size`).

## Degraus

Latência medida desta máquina (EUA) até São Paulo; ~170 ms é só a viagem da rede. O que importa é ela não subir.

| Degrau | Pessoas | Pedidos/s | CPU do banco | Memória livre | p50 / p95 / p99 | Falhas |
|---|---|---|---|---|---|---|
| 10% | ~110 | 23 | 7% | ~445 MB | 175 / 211 / 427 ms | 0 |
| 25% | ~275 | 57 | 14–18% | ~445 MB | 174 / 200 / 403 ms | 0 |
| 50% | ~550 | 114 | 26–29% | ~370 MB | 173 / 198 / 266 ms | 0 |
| 100% | ~1.100 | 234 | 57–60% | 236–285 MB | 174 / 201 / 275 ms | 0,02% (12 de 56 mil) |

Todos os tipos de pedido ficaram com p95 entre 198 e 206 ms no pico (presença e leitura da chamada, aviso de mídia, cronômetro, fila do SOS, contagem de disponíveis, conferência do SOS, conversas, notificações, envio de mensagem, lido).

## Tempo do banco por consulta (durante o teste)

| Consulta | Tempo total | Chamadas | Por chamada |
|---|---|---|---|
| Leitura das mudanças do tempo real (`postgres_changes`) | 191 s | 3.669 | 52 ms |
| `count_available_psychologists` | 24,8 s | 6.143 | 4,0 ms |
| Presença da chamada (`participant_presence`, gravação) | 8,3 s | 12.387 | 0,67 ms |
| `call_clock` | 7,3 s | 6.292 | 1,2 ms |
| `listar_conversas` | 7,2 s | 5.836 | 1,2 ms |
| `report_call_media` | 6,7 s | 12.381 | 0,5 ms |
| Total do banco | 264 s | | |

Tabelas que mais mudaram (todas no tempo real): `participant_presence` (18,5 mil gravações), `webrtc_sessions` (6,4 mil), `conversas` (2,3 mil), `mensagens` (2,5 mil).

## Tempo real

- 1.102 conexões ao mesmo tempo, 2.720 entradas em canal (fila do SOS privada + conversas), nenhuma recusada na subida gradual.
- Aviso da fila do SOS entregue a todos os conectados, em ~1,2 s (p95 1,25 s, contando o tempo da API que dispara o aviso).
- Cerca de 250 conexões caíram e voltaram durante o teste.
- Conectando 300 de uma vez: falhas descritas no resumo.

## O que fazer (por ordem de efeito)

1. **Aumentar o "Database connection pool size" do Realtime** (Supabase → Realtime → Settings; pela API, `connection_pool` em `config/realtime`), hoje no padrão. É o que recusou as entradas em massa. Cabe no Micro (60 conexões diretas).
2. **Tirar do `postgres_changes` as tabelas que mais mudam:** `participant_presence` (a tela já confere a cada 15 s) e, depois, trocar as escutas de `webrtc_sessions` e `conversas` por avisos do banco em canais privados (`realtime.send`, como já é a fila do SOS). Diminui os 72% do tempo do banco gastos pelo tempo real e as consultas que ele faz a cada entrada em canal.
3. `count_available_psychologists` (4 ms, cresce com o número de psicólogos online): guardar a conta por alguns segundos no banco.
4. Subir o banco para **Small** antes de passar de ~1.000 pessoas ao mesmo tempo (memória livre no pico ficou abaixo de 300 MB).

## O que o teste não cobre

- Vídeo e áudio (vão direto entre os aparelhos ou pelo TURN, não pelo Supabase) e a transcrição.
- Edge functions (`check-subscription`, `emergency-sos` e outras) e o Stripe.
- Login em massa: o login limita pedidos por IP (o teste recebeu 429 depois de ~1.100 logins de uma máquina). Em uso real cada pessoa tem seu IP, mas muitas atrás do mesmo IP (empresa, operadora) podem esbarrar.
