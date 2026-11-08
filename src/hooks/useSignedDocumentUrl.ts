import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { safeHttpUrl } from '@/lib/safeUrl';

export const useSignedDocumentUrl = (
  documentPath?: string,
  bucket: string = 'psychologist-documents',
  rawFallbackUrl?: string
) => {
  // O link de reserva vem do banco (texto do psicólogo): só http(s).
  const fallbackUrl = safeHttpUrl(rawFallbackUrl) ?? undefined;
  const [signedUrl, setSignedUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSignedUrl = async () => {
    if (!documentPath) {
      setLoading(false);
      setSignedUrl(fallbackUrl || '');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: urlError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(documentPath, 3600); // 1 hora de expiração

      if (data?.signedUrl) {
        setSignedUrl(data.signedUrl);
        return;
      }

      // Bucket público ou sem permissão de assinatura: usa URL pública
      const { data: publicData } = supabase.storage
        .from(bucket)
        .getPublicUrl(documentPath);

      const publicUrl = publicData?.publicUrl || fallbackUrl;

      if (!publicUrl) {
        throw new Error(urlError?.message || 'URL do documento não disponível');
      }

      setSignedUrl(publicUrl);
    } catch (err) {
      console.error('Error generating signed URL:', err);
      if (fallbackUrl) {
        setSignedUrl(fallbackUrl);
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSignedUrl();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, [documentPath, bucket, fallbackUrl]);


  const retry = () => {
    fetchSignedUrl();
  };

  return { 
    signedUrl, 
    loading, 
    error, 
    retry 
  };
};