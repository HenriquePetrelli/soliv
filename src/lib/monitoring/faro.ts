import { getWebInstrumentations, initializeFaro, type Faro } from '@grafana/faro-web-sdk';
import { scrubDeep } from './scrub';

export interface FaroSettings {
  url: string;
  environment: string;
  version: string;
  sampleRate: number;
}

/**
 * Liga o Grafana Faro (Frontend Observability). Pensado para caber no plano
 * gratuito e não levar dado pessoal:
 * - sem console (o app ainda tem muitos logs com ids e conteúdo);
 * - sem tempos de cada requisição (as URLs do Supabase levam ids nos filtros);
 * - sem usuário (só a sessão anônima do próprio Faro);
 * - tudo passa pela limpeza de scrub.ts antes de sair.
 */
export function startFaro(settings: FaroSettings): Faro {
  return initializeFaro({
    url: settings.url,
    app: {
      name: 'soliv',
      version: settings.version,
      environment: settings.environment,
    },
    instrumentations: getWebInstrumentations({
      captureConsole: false,
      enablePerformanceInstrumentation: false,
      enableContentSecurityPolicyInstrumentation: false,
    }),
    sessionTracking: {
      enabled: true,
      persistent: true,
      samplingRate: settings.sampleRate,
    },
    trackResources: false,
    trackGeolocation: false,
    webVitalsInstrumentation: { trackAttributionSources: false },
    ignoreErrors: [
      'ResizeObserver loop',
      'AbortError',
      'The operation was aborted',
    ],
    beforeSend: (item) => scrubDeep(item),
  });
}
