#!/usr/bin/env bash
# Teste de ponta a ponta da transcrição das chamadas, todo LOCAL.
# Passo a passo e o que cada parte valida: e2e/transcricao/LEIA-ME.md.
#
# Precisa de: Docker, Node (npx), espaço para as imagens do Supabase.
# Não toca na produção: o Supabase, as edge functions e o gateway de
# transcrição sobem nesta máquina.
#
# Uso: e2e/transcricao/rodar.sh [--manter]   (--manter deixa tudo de pé no fim)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${E2E_WORK_DIR:-$REPO/.e2e-transcricao}"
KEEP="${1:-}"
PIDS=()

cleanup() {
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  if [ "$KEEP" != "--manter" ]; then
    (cd "$WORK" && npx -y supabase@latest stop --no-backup >/dev/null 2>&1) || true
  fi
}
trap cleanup EXIT

wait_for() { # url, nome
  for _ in $(seq 1 120); do curl -s -o /dev/null "$1" && return 0; sleep 2; done
  echo "não subiu: $2" >&2; exit 1
}

# 1. Supabase local com o esquema do repositório ------------------------------
# As migrations antigas do Lovable não seguem o padrão de nome da CLI e algumas
# não rodam de novo do zero (dependiam do estado da época). Então: o Supabase
# sobe vazio e as migrations são aplicadas aqui, em ordem; uma que falhe inteira
# é aplicada comando a comando, ignorando o que já não se aplica.
mkdir -p "$WORK"
if ! docker ps --format '{{.Names}}' | grep -q '^supabase_db_soliv-e2e$'; then
  rm -rf "$WORK/supabase" && mkdir -p "$WORK/supabase/migrations"
  sed 's/^project_id = .*/project_id = "soliv-e2e"/' "$REPO/supabase/config.toml" > "$WORK/supabase/config.toml"
  cp -r "$REPO/supabase/templates" "$REPO/supabase/functions" "$WORK/supabase/"
  (cd "$WORK" && npx -y supabase@latest start -x studio,imgproxy,vector,logflare,supavisor,mailpit)
  : > "$WORK/aplicadas.txt"
fi
DB="supabase_db_soliv-e2e"
touch "$WORK/aplicadas.txt" "$WORK/parciais.txt"
for f in $(ls "$REPO/supabase/migrations" | sort); do
  grep -qx "$f" "$WORK/aplicadas.txt" && continue
  if ! docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction -q \
      < "$REPO/supabase/migrations/$f" >/dev/null 2>&1; then
    docker exec -i "$DB" psql -U postgres -d postgres -q < "$REPO/supabase/migrations/$f" >/dev/null 2>&1 || true
    echo "$f" >> "$WORK/parciais.txt"
  fi
  echo "$f" >> "$WORK/aplicadas.txt"
done
# Sobras de migrations antigas que a produção não tem (conferido com o esquema
# da produção em 2026-11-20).
docker exec -i "$DB" psql -U postgres -d postgres -q >/dev/null 2>&1 <<'SQL' || true
DROP POLICY IF EXISTS "Admins can view all documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Owners can view their own documents" ON storage.objects;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS valid_cpf_format;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS valid_crp_format;
SQL
echo "migrations: $(wc -l < "$WORK/aplicadas.txt") aplicadas ($(wc -l < "$WORK/parciais.txt") em partes)"

STATUS="$(cd "$WORK" && npx -y supabase@latest status -o env 2>/dev/null)"
val() { echo "$STATUS" | grep "^$1=" | head -1 | cut -d= -f2- | tr -d '"'; }
export E2E_SUPABASE_URL="$(val API_URL)"
export E2E_SUPABASE_ANON_KEY="$(val ANON_KEY)"
export E2E_SUPABASE_SERVICE_KEY="$(val SERVICE_ROLE_KEY)"

# 2. Gateway de transcrição falso ---------------------------------------------
node "$REPO/e2e/transcricao/mockGateway.mjs" 8787 \
  "$REPO/e2e/transcricao/audio/paciente.wav=Eu estou me sentindo muito ansioso com o trabalho e não consigo dormir." \
  "$REPO/e2e/transcricao/audio/psicologo.wav=Entendo. Vamos respirar juntos, devagar, e conversar sobre isso." \
  > "$WORK/gateway.log" 2>&1 &
PIDS+=($!)
wait_for http://127.0.0.1:8787/log "gateway falso"

# 3. Edge functions do repositório, com o Deno da máquina ---------------------
(
  cd "$REPO"
  SUPABASE_URL="$E2E_SUPABASE_URL" \
  SUPABASE_ANON_KEY="$E2E_SUPABASE_ANON_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$E2E_SUPABASE_SERVICE_KEY" \
  LOVABLE_API_KEY=local-test-key \
  LOVABLE_AI_GATEWAY_URL=http://127.0.0.1:8787/v1/chat/completions \
  NO_PROXY=127.0.0.1,localhost \
  exec npx -y deno run -A --node-modules-dir=none --no-lock \
    --import-map=e2e/transcricao/import_map.e2e.json e2e/transcricao/functionsHost.ts 54399 \
    transcribe-call-chunk emergency-sos ice-servers psychologist-schedule
) > "$WORK/funcoes.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 120); do grep -q "funções em" "$WORK/funcoes.log" && break; sleep 2; done
grep -q "funções em" "$WORK/funcoes.log" || { cat "$WORK/funcoes.log"; exit 1; }

# 4. Testes (o app é construído no modo e2e-local pelo próprio Playwright) ----
cd "$REPO"
npx playwright test -c playwright.transcricao.config.ts
