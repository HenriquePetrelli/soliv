// Envio pelo Firebase Cloud Messaging (API HTTP v1), compartilhado pelas
// funções que mandam push (fila de avisos, SOS, hábitos).
//
// - Um token de acesso do Google por instância, reaproveitado por ~50 min
//   (antes cada push pedia um token novo ao Google).
// - Cada aparelho tem o seu resultado: só desativa o token que o Firebase diz
//   que não existe mais (UNREGISTERED). Antes, qualquer "INVALID_ARGUMENT"
//   (inclusive um texto de push malformado) desativava os aparelhos.
// - "Falha passageira" (Firebase fora, limite de envio) volta como tal, para
//   a fila tentar de novo.

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Tela do app aberta ao tocar (só caminhos do próprio app). */
  url?: string | null;
  data?: Record<string, string>;
  /** SOS: entrega imediata e descarta se não chegar em poucos minutos. */
  urgent?: boolean;
  /** Validade do push em segundos (depois disso o Firebase descarta). */
  ttlSeconds?: number;
  /** Mesma etiqueta substitui o aviso anterior no aparelho (não empilha). */
  tag?: string;
}

export interface TokenResult {
  token: string;
  ok: boolean;
  /** O aparelho não existe mais: o token deve ser desativado. */
  dead: boolean;
  /** Falha passageira: vale tentar de novo depois. */
  transient: boolean;
  error?: string;
}

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const pemToArrayBuffer = (pem: string): ArrayBuffer => {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

/** Variável de ambiente (Deno); o arquivo também é testado fora do Deno. */
const env = (name: string): string =>
  (globalThis as { Deno?: { env: { get(key: string): string | undefined } } }).Deno?.env.get(name) ?? '';

export const isInternalPath = (url: unknown): url is string => typeof url === 'string' && /^\/(?!\/)/.test(url);

/** Conta de serviço do Firebase pelos secrets; null se não configurada. */
export const firebaseServiceAccount = (): ServiceAccount | null => {
  const account = {
    client_email: env('FIREBASE_CLIENT_EMAIL'),
    private_key: env('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    project_id: env('FIREBASE_PROJECT_ID'),
  };
  return account.client_email && account.private_key && account.project_id ? account : null;
};

let cachedToken: { value: string; expiresAt: number; email: string } | null = null;

/** Token OAuth2 do Google para o FCM (JWT assinado com a conta de serviço). */
export const getAccessToken = async (serviceAccount: ServiceAccount): Promise<string> => {
  if (cachedToken && cachedToken.email === serviceAccount.client_email && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const unsigned = `${base64url(encoder.encode(JSON.stringify(header)))}.${base64url(encoder.encode(JSON.stringify(claims)))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned));
  const jwt = `${unsigned}.${base64url(new Uint8Array(signature))}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!response.ok) throw new Error(`Failed to obtain FCM access token: ${await response.text()}`);
  const { access_token, expires_in } = await response.json();
  cachedToken = {
    value: access_token,
    expiresAt: Date.now() + Math.min(Number(expires_in) || 3600, 3600) * 1000 - 10 * 60_000,
    email: serviceAccount.client_email,
  };
  return access_token;
};

/** Monta a mensagem do FCM (web, Android e iPhone) para um aparelho. */
export const buildFcmMessage = (token: string, message: PushMessage) => {
  const url = isInternalPath(message.url) ? message.url : undefined;
  const ttl = Math.max(0, Math.round(message.ttlSeconds ?? 24 * 3600));
  const data: Record<string, string> = { ...(message.data ?? {}) };
  if (url) data.url = url;
  return {
    token,
    notification: { title: message.title, body: message.body },
    data,
    android: {
      priority: message.urgent ? 'HIGH' : 'NORMAL',
      ttl: `${ttl}s`,
      ...(message.tag ? { notification: { tag: message.tag } } : {}),
    },
    apns: {
      headers: {
        'apns-priority': message.urgent ? '10' : '5',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + ttl),
        ...(message.tag ? { 'apns-collapse-id': message.tag.slice(0, 64) } : {}),
      },
      // Sem `sound` o iPhone mostra o aviso calado (o Android usa o som do canal).
      payload: { aps: { sound: 'default' } },
    },
    webpush: {
      headers: { TTL: String(ttl), Urgency: message.urgent ? 'high' : 'normal' },
      ...(message.tag ? { notification: { tag: message.tag, renotify: true } } : {}),
      // Tocar no aviso (web) abre a tela certa.
      ...(url ? { fcm_options: { link: url } } : {}),
    },
  };
};

type FcmErrorBody = { error?: { status?: string; message?: string; details?: Array<{ errorCode?: string }> } };

const fcmErrorCode = (body: FcmErrorBody): string | undefined => {
  const details = Array.isArray(body?.error?.details) ? body.error.details : [];
  for (const d of details) if (typeof d?.errorCode === 'string') return d.errorCode;
  return typeof body?.error?.status === 'string' ? body.error.status : undefined;
};

/** Manda a mesma mensagem para vários aparelhos, com o resultado de cada um. */
export const sendToTokens = async (
  serviceAccount: ServiceAccount,
  accessToken: string,
  tokens: string[],
  message: PushMessage,
): Promise<TokenResult[]> =>
  Promise.all(
    [...new Set(tokens)].map(async (token): Promise<TokenResult> => {
      try {
        const response = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: buildFcmMessage(token, message) }),
        });
        if (response.ok) return { token, ok: true, dead: false, transient: false };
        const body = (await response.json().catch(() => ({}))) as FcmErrorBody;
        const code = fcmErrorCode(body);
        const invalidToken = code === 'INVALID_ARGUMENT' && /registration token/i.test(String(body?.error?.message ?? ''));
        const dead = code === 'UNREGISTERED' || response.status === 404 || invalidToken;
        const transient = !dead && (response.status === 429 || response.status >= 500 || code === 'UNAVAILABLE' || code === 'INTERNAL' || code === 'QUOTA_EXCEEDED');
        return { token, ok: false, dead, transient, error: code ?? String(response.status) };
      } catch (err) {
        // Rede caiu no meio: passageiro.
        return { token, ok: false, dead: false, transient: true, error: String(err) };
      }
    }),
  );
