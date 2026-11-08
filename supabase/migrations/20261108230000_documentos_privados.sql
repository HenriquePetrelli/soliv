-- Documentos e fotos do chat fora do acesso público (achado na varredura de 2026-11-08).
--
-- O bucket `documents` guarda os documentos de cadastro dos psicólogos (CRP,
-- identidade) em `<user_id>/...` e as fotos do chat em `chat-images/<conversa>/...`.
-- Ele estava como público: qualquer pessoa com o link abria o arquivo sem login,
-- mesmo depois de a conversa expirar ou de o admin trocar o documento.
-- `psychologist-documents` também estava público (hoje vazio).
--
-- Aplicar SÓ depois de o front com `src/lib/storageDocument.ts` estar publicado
-- (os botões "Visualizar" do admin passam a usar link assinado). As fotos do
-- chat já usam link assinado (`ChatImage.tsx`).

-- 1) Quem pode ler os documentos de cadastro no bucket `documents`:
--    o próprio psicólogo (pasta com o id dele) e o admin.
DROP POLICY IF EXISTS "Owners and admins read registration documents" ON storage.objects;
CREATE POLICY "Owners and admins read registration documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR (SELECT public.is_super_admin())
  )
);

-- 2) Buckets privados: leitura só com link assinado e pelas políticas acima.
UPDATE storage.buckets SET public = false WHERE id IN ('documents', 'psychologist-documents');

-- 3) Limpeza: versões antigas de create_psychologist_profile, sem uso e sem
--    permissão de execução para o app (a versão em uso confere auth.uid()).
DROP FUNCTION IF EXISTS public.create_psychologist_profile(uuid, text, text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.create_psychologist_profile(uuid, text, text, text, text, text, text, text, boolean, text, text, text, text);
