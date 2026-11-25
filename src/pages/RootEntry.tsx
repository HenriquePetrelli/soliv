import { lazy } from 'react';
import { Capacitor } from '@capacitor/core';

// "/" no navegador: página de apresentação, como no site das grandes
// (Headspace, Calm, Zenklub, Nubank). No app instalado: direto o login, pois
// quem baixou o app já decidiu usar e as lojas não pedem vitrine dentro dele.
const Landing = lazy(() => import('./Landing'));
const Index = lazy(() => import('./Index'));

const RootEntry = () => (Capacitor.isNativePlatform() ? <Index /> : <Landing />);

export default RootEntry;
