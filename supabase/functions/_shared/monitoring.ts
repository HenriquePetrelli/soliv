/**
 * Erros das edge functions no Grafana Cloud (Loki).
 *
 * `monitored("nome", handler)` envolve o handler de uma função: se ele lançar
 * uma exceção ou responder 5xx, uma linha vai para o Loki com o nome da
 * função, o método, o status e o texto do erro (limpo de dados pessoais).
 * O envio não atrasa a resposta e nunca derruba a função.
 *
 * Desligado enquanto os secrets abaixo não existirem no Supabase:
 *   GRAFANA_LOKI_URL   ex.: https://logs-prod-024.grafana.net
 *   GRAFANA_LOKI_USER  número do usuário do Loki (Grafana Cloud → Loki → Details)
 *   GRAFANA_LOKI_TOKEN token de acesso com permissão logs:write
 */

type Handler = (req: Request) => Response | Promise<Response>;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const SECRET = /\b(?:sk|rk|pk|whsec|sb_secret)_[A-Za-z0-9_]+/g;
const LONG_NUMBER = /\b\d{8,}\b/g;
const URL_TAIL = /(\bhttps?:\/\/[^\s"'?#]*)[?#][^\s"']*/g;

export const scrubText = (text: string): string =>
  text
    .replace(URL_TAIL, "$1")
    .replace(JWT, "[token]")
    .replace(SECRET, "[segredo]")
    .replace(EMAIL, "[email]")
    .replace(UUID, ":id")
    .replace(LONG_NUMBER, "[numero]")
    .slice(0, 1000);

const describe = (error: unknown): string => {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  const message = (error as { message?: unknown } | null)?.message;
  if (typeof message === "string") return message;
  return typeof error === "string" ? error : "Erro desconhecido";
};

interface EdgeErrorReport {
  fn: string;
  method?: string;
  status?: number;
  message: string;
}

const env = (name: string) => {
  try {
    // Lido de globalThis: este arquivo também roda nos testes do app (sem Deno).
    const denoEnv = (globalThis as { Deno?: { env: { get(name: string): string | undefined } } }).Deno?.env;
    return denoEnv?.get(name)?.trim() || undefined;
  } catch {
    return undefined;
  }
};

async function sendToLoki(report: EdgeErrorReport): Promise<void> {
  const url = env("GRAFANA_LOKI_URL");
  const user = env("GRAFANA_LOKI_USER");
  const token = env("GRAFANA_LOKI_TOKEN");
  if (!url || !user || !token) return;

  const line = JSON.stringify({
    level: "error",
    fn: report.fn,
    method: report.method,
    status: report.status,
    message: scrubText(report.message),
  });
  const body = {
    streams: [
      {
        stream: { app: "soliv", source: "edge-function", fn: report.fn, level: "error" },
        values: [[`${Date.now()}000000`, line]],
      },
    ],
  };
  try {
    await fetch(`${url.replace(/\/+$/, "")}/loki/api/v1/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${user}:${token}`)}`,
      },
      body: JSON.stringify(body),
      signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(3000) : undefined,
    });
  } catch {
    // Sem Grafana não é motivo para a função falhar.
  }
}

/** Envia sem segurar a resposta (EdgeRuntime.waitUntil quando existe). */
function dispatch(report: EdgeErrorReport) {
  const task = sendToLoki(report);
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task);
}

/** Registra um erro tratado dentro da função (opcional; o 5xx já é registrado). */
export function reportEdgeError(fn: string, error: unknown, extra?: { method?: string; status?: number }) {
  dispatch({ fn, method: extra?.method, status: extra?.status, message: describe(error) });
}

async function errorText(response: Response): Promise<string> {
  try {
    const text = await response.clone().text();
    try {
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
      const value = parsed.error ?? parsed.message;
      if (typeof value === "string") return value;
    } catch {
      // corpo não é JSON
    }
    return text || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export function monitored(fn: string, handler: Handler): Handler {
  return async (req: Request) => {
    try {
      const response = await handler(req);
      if (response.status >= 500) {
        dispatch({ fn, method: req.method, status: response.status, message: await errorText(response) });
      }
      return response;
    } catch (error) {
      dispatch({ fn, method: req.method, status: 500, message: describe(error) });
      throw error;
    }
  };
}
