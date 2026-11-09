import { lazy, Suspense, useEffect, useState } from 'react';
import { getBlockedNotice, subscribeBlockedNotice } from '@/utils/psychologistBlock';

const BlockedAccountNotice = lazy(() => import('./BlockedAccountNotice'));

/** Só baixa a janela do aviso quando há uma conta bloqueada para avisar. */
const BlockedAccountNoticeHost = () => {
  const [needed, setNeeded] = useState(() => !!getBlockedNotice());
  useEffect(() => subscribeBlockedNotice((n) => n && setNeeded(true)), []);
  if (!needed) return null;
  return (
    <Suspense fallback={null}>
      <BlockedAccountNotice />
    </Suspense>
  );
};

export default BlockedAccountNoticeHost;
