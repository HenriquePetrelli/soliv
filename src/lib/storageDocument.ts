import { supabase } from '@/integrations/supabase/client';
import { safeHttpUrl } from '@/lib/safeUrl';

/**
 * Documentos do psicólogo (CRP, identidade) ficam no Storage. O banco guarda o
 * link (`document_url`) no formato público ou assinado, ou só o caminho.
 * Daqui sai o bucket e o caminho para gerar um link assinado, que continua
 * funcionando quando o bucket deixa de ser público.
 */
export const extractDocumentRef = (
  url?: string | null,
): { bucket: string; path: string } | undefined => {
  if (!url) return undefined;

  const cleanUrl = url.split('?')[0];

  const supabaseMatch = cleanUrl.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/,
  );
  if (supabaseMatch) {
    return {
      bucket: decodeURIComponent(supabaseMatch[1]),
      path: decodeURIComponent(supabaseMatch[2]),
    };
  }

  // Já é só o caminho (sem http)
  if (!cleanUrl.startsWith('http')) {
    return { bucket: 'psychologist-documents', path: cleanUrl };
  }

  return undefined;
};

/** Gera um link assinado (curto) para o documento; sem permissão, devolve null. */
export const signedDocumentUrl = async (
  url?: string | null,
  expiresInSeconds = 300,
): Promise<string | null> => {
  const ref = extractDocumentRef(url);
  if (!ref) return null;
  const { data } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, expiresInSeconds);
  return data?.signedUrl ?? null;
};

/**
 * Abre o documento em nova aba com link assinado; se não der para assinar,
 * usa o link guardado (só http/https). A aba é aberta antes do `await` para o
 * navegador não bloquear como pop-up.
 */
export const openStorageDocument = async (url?: string | null): Promise<void> => {
  const tab = window.open('about:blank', '_blank');
  if (tab) tab.opener = null;

  let target: string | null = null;
  try {
    target = await signedDocumentUrl(url);
  } catch {
    target = null;
  }
  target = safeHttpUrl(target ?? url);

  if (!target) {
    tab?.close();
    return;
  }
  if (tab) tab.location.href = target;
  else window.open(target, '_blank', 'noopener,noreferrer');
};
