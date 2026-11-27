// Handles push notifications while the app is closed or in the background.
// The Firebase Web config isn't a secret (it identifies the project, it
// doesn't authenticate anything). A service worker can't read
// import.meta.env, so the app passes it in the registration URL
// (src/lib/firebase.ts → firebaseServiceWorkerUrl). Before, this file had
// "REPLACE_WITH_..." placeholders and background push never worked.

// Tocar na notificação abre a tela certa (data.url: consultas, chat, hábito,
// fila do SOS) NA ABA DO APP QUE JÁ ESTÁ ABERTA. Registrado antes do
// Firebase: o Firebase abriria uma aba nova sempre que o app estivesse em
// outra tela. Para as mensagens dele, este ouvinte assume o clique.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const fcm = data.FCM_MSG || null;
  if (fcm) event.stopImmediatePropagation();
  const candidates = [data.url, fcm && fcm.data && fcm.data.url, fcm && fcm.fcmOptions && fcm.fcmOptions.link];
  const toPath = (value) => {
    if (typeof value !== 'string') return null;
    // "//site.com" e "/\\site.com" o navegador trata como outro site.
    if (/^\/(?![\/\\])/.test(value) && !/[\u0000-\u001f\\]/.test(value)) return value;
    try {
      const url = new URL(value);
      return url.origin === self.location.origin ? url.pathname + url.search : null;
    } catch {
      return null;
    }
  };
  // Só caminhos do próprio app.
  const target = candidates.map(toPath).find(Boolean) || (fcm && fcm.data && fcm.data.type === 'sos' ? '/psychologist-dashboard' : '/');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const sameOrigin = clients.filter((c) => c.url.startsWith(self.location.origin));
      const client = sameOrigin.find((c) => c.focused) || sameOrigin[0];
      if (client) {
        // O app aberto troca de tela sem recarregar (PushBridge recebe o aviso).
        client.postMessage({ type: 'soliv-push-open', url: target });
        return 'focus' in client ? client.focus() : undefined;
      }
      return self.clients.openWindow(target);
    }),
  );
});

importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;
const config = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

if (config.apiKey && config.projectId && config.messagingSenderId && config.appId) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  // Mensagens com "notification" o próprio Firebase já mostra (e abre o
  // fcm_options.link ao tocar); aqui só as que vêm só com dados.
  messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return;
    const { title, body } = payload.data || {};
    if (!title) return;

    self.registration.showNotification(title, {
      body: body || '',
      icon: '/favicon.ico',
      data: payload.data || {},
    });
  });
}

