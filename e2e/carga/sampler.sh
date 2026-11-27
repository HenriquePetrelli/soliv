#!/usr/bin/env bash
# A cada 10 s: CPU, memória, carga e conexões do banco (métricas do Supabase);
# a cada 15 s: um aviso no canal sos-queue com a hora, para medir a entrega.
S="$1"; ref=ihrrgmmsfuvlasmzdmwf; SK=$(cat "$S/service.key")
echo "t,cpu_pct,mem_avail_mb,load1,backends" > "$S/metrics.csv"
prev_total=""; prev_idle=""; n=0
while [ ! -f "$S/stop" ]; do
  m=$(curl -s -m 8 -u "service_role:$SK" "https://$ref.supabase.co/customer/v1/privileged/metrics")
  read total idle < <(echo "$m" | awk '/^node_cpu_seconds_total/ && /service_type="db"/ {split($NF,a," "); v=$NF; t+=v; if ($0 ~ /mode="idle"/ || $0 ~ /mode="iowait"/) i+=v} END {printf "%f %f\n", t, i}')
  mem=$(echo "$m" | awk '/^node_memory_MemAvailable_bytes/ && /service_type="db"/ {printf "%d", $NF/1048576}')
  load=$(echo "$m" | awk '/^node_load1\{/ && /service_type="db"/ {print $NF}')
  back=$(echo "$m" | awk '/^pg_stat_database_num_backends/ {s+=$NF} END {print s+0}')
  if [ -n "$prev_total" ]; then
    cpu=$(awk -v t="$total" -v i="$idle" -v pt="$prev_total" -v pi="$prev_idle" 'BEGIN { dt=t-pt; if (dt>0) printf "%.1f", 100*(1-(i-pi)/dt); else print "" }')
    [ -n "$cpu" ] && echo "$(date -u +%H:%M:%S),$cpu,$mem,$load,$back" >> "$S/metrics.csv"
  fi
  if [ "$total" != "$prev_total" ]; then prev_total=$total; prev_idle=$idle; fi
  n=$((n+1))
  if [ $((n % 3)) -eq 0 ]; then
    ts=$(date +%s%3N)
    jq -n --arg q "select realtime.send(jsonb_build_object('ts', $ts), 'queue-changed', 'sos-queue', true)" '{query:$q}' > "$S/bq.json"
    curl -s -m 8 -o /dev/null -X POST "https://api.supabase.com/v1/projects/$ref/database/query" -H "Authorization: Bearer x" -H "Content-Type: application/json" --data @"$S/bq.json" &
  fi
  sleep 5
done
