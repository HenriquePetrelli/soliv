import { FileText, ExternalLink, Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useSignedDocumentUrl } from '@/hooks/useSignedDocumentUrl';
import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { openSafeUrl } from '@/lib/safeUrl';

interface DocumentViewerProps {
  documentPath?: string;
  bucket?: string;
  fallbackUrl?: string;
}

export const DocumentViewer = ({ documentPath, bucket, fallbackUrl }: DocumentViewerProps) => {
  const { signedUrl, loading, error, retry } = useSignedDocumentUrl(documentPath, bucket, fallbackUrl);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleDownload = async () => {
    if (!signedUrl) return;
    
    try {
      const response = await fetch(signedUrl, {
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error(`Falha ao baixar: ${response.statusText}`);
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (documentPath || signedUrl).split('/').pop() || 'documento';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
      
      toast.success('Download iniciado');
    } catch (err) {
      console.error('Erro no download:', err);
      toast.error('Falha ao baixar documento');
    }
  };

  const openInNewTab = () => {
    openSafeUrl(signedUrl);
  };

  if (!documentPath && !fallbackUrl) {
    return (
      <Alert>
        <FileText className="h-4 w-4" />
        <AlertDescription>
          Nenhum documento anexado
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !signedUrl) {
    return (
      <div className="border rounded-lg p-8 bg-muted/30">
        <div className="text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
           <p className="text-sm text-muted-foreground mb-2">
             {error?.message || 'Erro ao carregar documento'}
           </p>
           {error?.message?.includes('403') && (
             <p className="text-xs text-destructive mb-4">
               Erro de permissão - verifique se você tem acesso
             </p>
           )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={retry}
            className="gap-2"
          >
            <ExternalLink className="h-3 w-3" />
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  const filename = (documentPath || signedUrl.split('?')[0]).split('/').pop() || 'documento';
  const extension = filename.split('.').pop()?.toLowerCase() || '';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension);
  const isPDF = extension === 'pdf';

  if (!isClient) {
    return (
      <div className="border rounded-lg overflow-hidden">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-muted/30">
      <div className="p-3 border-b bg-background/50 flex justify-between items-center">
        <span className="text-sm font-medium text-muted-foreground truncate max-w-[200px]">
          Documento: {filename}
        </span>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleDownload}
            className="gap-2"
          >
            <Download className="h-3 w-3" />
            Download
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={openInNewTab}
            className="gap-2"
          >
            <ExternalLink className="h-3 w-3" />
            Abrir
          </Button>
        </div>
      </div>

      <div className="w-full min-h-[400px] max-h-[600px] overflow-auto">
        {isImage && (
          <div className="p-4 flex items-center justify-center bg-muted/10">
            <img 
              src={signedUrl} 
              alt="Documento"
              className="max-w-full max-h-[500px] object-contain rounded shadow-sm"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
        
        {isPDF && (
          <div className="w-full h-[500px]">
            <iframe 
              src={`${signedUrl}#toolbar=0&navpanes=0&scrollbar=0`}
              className="w-full h-full border-none"
              title="Visualização do PDF"
              sandbox="allow-same-origin"
            />
          </div>
        )}
        
        {!isImage && !isPDF && (
          <div className="p-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-4">
              Tipo de documento não suportado para visualização
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDownload}
              className="gap-2"
            >
              <Download className="h-3 w-3" />
              Baixar arquivo
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};