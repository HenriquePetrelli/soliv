-- Índice para a verificação de consultas em aberto (finalize_stale_appointments,
-- a cada 10 min) e os lembretes: olha só as consultas ainda abertas.
-- Faltava na produção (achado ao comparar o esquema em 2026-11-20); aplicado
-- e registrado no histórico em 2026-11-20. IF NOT EXISTS: não faz nada se já existir.
CREATE INDEX IF NOT EXISTS appointments_open_scheduled_idx
  ON public.appointments (scheduled_at)
  WHERE status IN ('scheduled', 'confirmed', 'in_progress');
