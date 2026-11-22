-- guard_testimonial_ban é a função do trigger de bloqueio de depoimentos.
-- Ninguém precisa chamá-la pela API (/rest/v1/rpc): o trigger dispara sem
-- essa permissão. O scanner de segurança apontava que visitantes sem login
-- podiam executá-la.
REVOKE EXECUTE ON FUNCTION public.guard_testimonial_ban() FROM PUBLIC, anon, authenticated;
