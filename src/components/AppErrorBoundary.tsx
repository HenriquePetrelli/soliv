import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Phone } from 'lucide-react';
import { reportError } from '@/lib/monitoring';

interface State {
  error: Error | null;
}

/**
 * Última barreira: se uma tela quebrar, mostra uma saída em vez da página em
 * branco — inclusive o CVV, porque quem está no app pode estar em crise.
 * Um chunk que falhou ao carregar (deploy novo com o app aberto) se resolve
 * recarregando, então isso é oferecido primeiro.
 */
class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AppErrorBoundary', error, info.componentStack);
    reportError(error, { origem: 'AppErrorBoundary' });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-10 w-10 text-warning" aria-hidden="true" />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-foreground">Algo deu errado nesta tela</h1>
            <p className="text-sm text-muted-foreground">Recarregue para continuar. Seus dados estão salvos.</p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-11 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Recarregar
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium text-foreground"
            >
              Ir para o início
            </button>
          </div>
          <a href="tel:188" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
            <Phone className="h-4 w-4" aria-hidden="true" />
            Precisa conversar agora? CVV: 188
          </a>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
