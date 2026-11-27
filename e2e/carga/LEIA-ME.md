# Teste de carga (k6)

Simula gente usando o app ao mesmo tempo, com os mesmos intervalos do código:
chamadas (presença, aviso de mídia, cronômetro, releitura da sala),
psicólogos na fila do SOS (e respondendo no chat), pacientes esperando o SOS,
pacientes navegando (conversas, notificações, lido) e uma conexão de tempo
real por pessoa (canal privado `sos-queue` + escuta das próprias conversas).
Sobe em 4 degraus (10%, 25%, 50% e 100%) e mede o banco ao mesmo tempo.
Resultado da última rodada: `docs/teste-de-carga.md`.

## Cuidados (roda contra o Supabase de verdade)

- Contas próprias `@loadtest.invalid`, apagadas no fim (`cleanup.sql`).
- Pedidos de SOS criados já encerrados: não aparecem na fila de ninguém.
- Não chama Stripe nem manda e-mail. Push: só se alguma conta de teste tiver
  aparelho (não tem).
- Psicólogos de teste ficam "online" durante o teste (aparecem na contagem de
  disponíveis do SOS). Rodar fora do horário de uso.

## Passo a passo

Arquivos de trabalho numa pasta fora do repositório (ex.: `$S`), com
`chmod 700`. Chaves pela API de gerenciamento (`/v1/projects/<ref>/api-keys?reveal=true`):
`service.key` e `anon.key`; o código de convite em `invite.txt`
(`select signup_invite_code from app_settings`).

```bash
node e2e/carga/setup.mjs "$S"        # cria e loga as contas (people.json)
node e2e/carga/world.mjs "$S"        # monta world.sql e world.json
# aplicar world.sql pela API (database/query)
e2e/carga/sampler.sh "$S" &          # CPU/memória/conexões do banco em metrics.csv
cd "$S" && cp <repo>/e2e/carga/soliv.js . && \
  K6_AUTO_EXTENSION_RESOLUTION=false SSL_CERT_FILE=/root/.ccr/ca-bundle.crt \
  k6 run -q --summary-export full.json soliv.js
touch "$S/stop"                      # para o sampler
# aplicar cleanup.sql pela API e apagar as chaves de $S
```

Variáveis: `SCALE` (0.1 = 10% do pico), `RAMP`, `HOLD`, `LAST_HOLD`,
`NO_RT=1` (sem tempo real), `ONLY_RT=300` + `RT_DUR=2m` (só tempo real, todos
conectando ao mesmo tempo). O login do Supabase limita pedidos por IP: acima
de ~1.100 logins seguidos a partir de uma máquina ele responde 429.
