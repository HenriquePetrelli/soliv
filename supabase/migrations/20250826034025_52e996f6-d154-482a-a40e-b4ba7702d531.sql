-- Aumentar tempo de expiração das sessões WebRTC de 2 horas para 24 horas
ALTER TABLE public.webrtc_sessions 
ALTER COLUMN expires_at SET DEFAULT (now() + INTERVAL '24 hours');

-- Atualizar sessões existentes que ainda não expiraram para ter mais tempo
UPDATE public.webrtc_sessions 
SET expires_at = now() + INTERVAL '24 hours'
WHERE expires_at > now() 
  AND expires_at < now() + INTERVAL '6 hours';