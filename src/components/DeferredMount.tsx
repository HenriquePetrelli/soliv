import { useEffect, useState, type ReactNode } from 'react';
import { afterPageSettles } from '@/lib/idle';

/** Monta os filhos só depois que a página carregou e o navegador ficou ocioso. */
const DeferredMount = ({ children, minDelayMs = 0 }: { children: ReactNode; minDelayMs?: number }) => {
  const [ready, setReady] = useState(false);
  useEffect(() => afterPageSettles(() => setReady(true), { minDelayMs }), [minDelayMs]);
  return ready ? <>{children}</> : null;
};

export default DeferredMount;
