import './lib/installRequestDedupe'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { preloadRoute } from './lib/routePreload'
import { silenceVerboseLogsInProduction } from './lib/productionLogging'
import { currentFrameContext, isUntrustedFrame, renderFrameBlockedNotice } from './lib/frameGuard'
import { startMonitoring } from './lib/monitoring'

let storage: Storage | null = null
try {
  storage = window.localStorage
} catch {
  // storage blocked (private mode): diagnostics flag just can't be read
}
silenceVerboseLogsInProduction(import.meta.env.PROD, window.location.search, storage)

// Outro site exibindo o Soliv num iframe: não monta o app (clickjacking).
if (isUntrustedFrame(currentFrameContext())) {
  renderFrameBlockedNotice()
} else {
  // Código da tela deste endereço já começa a baixar, junto com a conferência
  // da conta (antes esperava a conferência terminar).
  preloadRoute(window.location.pathname)
  // Erros do app no Grafana Cloud (desligado sem VITE_FARO_URL).
  void startMonitoring(import.meta.env)
  createRoot(document.getElementById("root")!).render(<App />);
}
