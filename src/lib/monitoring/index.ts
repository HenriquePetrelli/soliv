import type { Faro } from '@grafana/faro-web-sdk';

/**
 * Monitoramento de erros do app (Grafana Cloud, Frontend Observability).
 *
 * Fica desligado enquanto VITE_FARO_URL estiver vazio, e só roda no build
 * publicado. O SDK é baixado à parte, depois que o app começa a carregar, para
 * não pesar na primeira tela; erros que acontecerem antes disso ficam numa
 * fila e são enviados assim que ele chega.
 */

type Pending = { error: unknown; context?: Record<string, string> };

let faro: Faro | null = null;
const pending: Pending[] = [];
const MAX_PENDING = 20;

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Erro desconhecido');

function push(faroInstance: Faro, { error, context }: Pending) {
  faroInstance.api.pushError(toError(error), context ? { context } : undefined);
}

/** Registra um erro tratado pelo app (ex.: tela que quebrou no ErrorBoundary). */
export function reportError(error: unknown, context?: Record<string, string>) {
  if (faro) {
    push(faro, { error, context });
  } else if (pending.length < MAX_PENDING) {
    pending.push({ error, context });
  }
}

export interface MonitoringEnv {
  PROD: boolean;
  MODE: string;
  VITE_FARO_URL?: string;
  VITE_FARO_SAMPLE_RATE?: string;
  VITE_APP_VERSION?: string;
}

export function parseSampleRate(raw: string | undefined): number {
  const value = Number(raw);
  if (raw === undefined || raw.trim() === '' || !Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export function isMonitoringEnabled(env: MonitoringEnv): boolean {
  return env.PROD && Boolean(env.VITE_FARO_URL?.trim());
}

export async function startMonitoring(env: MonitoringEnv): Promise<boolean> {
  if (!isMonitoringEnabled(env) || faro) return false;
  // Até o SDK chegar, erros soltos vão para a fila; depois ele mesmo os pega.
  const onError = (event: ErrorEvent) => reportError(event.error ?? event.message, { origem: 'window.onerror' });
  const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason, { origem: 'promise' });
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  try {
    const { startFaro } = await import('./faro');
    faro = startFaro({
      url: env.VITE_FARO_URL!.trim(),
      environment: env.MODE,
      version: env.VITE_APP_VERSION || 'web',
      sampleRate: parseSampleRate(env.VITE_FARO_SAMPLE_RATE),
    });
    pending.splice(0).forEach((item) => push(faro!, item));
    return true;
  } catch {
    // Monitoramento nunca derruba o app.
    pending.length = 0;
    return false;
  } finally {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  }
}
