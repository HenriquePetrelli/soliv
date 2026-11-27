# Teste de carga

> **Última rodada:** 2026-11-27, contra o Supabase de produção (banco **Micro**: 1 GB de RAM, 2 CPUs compartilhadas), depois das correções de escala do mesmo dia. Script e passo a passo: `e2e/carga/`.

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
