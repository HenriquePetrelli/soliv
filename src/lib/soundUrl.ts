import { Capacitor } from '@capacitor/core';

/**
 * Os 16 sons somam ~440 MB: dentro do app instalado eles passariam do limite
 * do Google Play (200 MB por download). No site continuam saindo do próprio
 * site; nos apps Android e iOS vêm do bucket público "sounds" do Supabase
 * Storage (mesmos arquivos, mesmo caminho), tocados aos poucos pela internet.
 */
export const SOUNDS_STORAGE_BASE = 'https://ihrrgmmsfuvlasmzdmwf.supabase.co/storage/v1/object/public/sounds';

export const isNativeApp = () => Capacitor.isNativePlatform();

/** "/sounds/sleep/rain.mp3" -> endereço certo para o site ou para o app. */
export const soundUrl = (path: string) =>
  isNativeApp() ? `${SOUNDS_STORAGE_BASE}/${path.replace(/^\/?sounds\//, '')}` : path;
