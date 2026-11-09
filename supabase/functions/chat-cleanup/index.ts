import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { isTrustedCaller } from "../_shared/guards.ts";
import { monitored } from "../_shared/monitoring.ts";

// Apaga do armazenamento as fotos de conversas que não existem mais e, nas
// conversas que continuam, as fotos cuja mensagem já foi apagada.
//
// A rotina diária `gerenciar_expiracao_conversas` apaga a conversa (e as
// mensagens) 3 meses depois de aberta, mas o banco não apaga arquivos: as
// fotos ficavam em `documents/chat-images/<conversa>/...` para sempre. Cada
// conversa tem a sua pasta, então basta olhar as pastas sem conversa.
// Chamada pelo pg_cron uma vez por dia.
//
// Uma conversa reaberta por consultas seguidas pode durar mais de 3 meses;
// a rotina apaga cada mensagem com mais de 3 meses (política de privacidade),
// então as fotos dessas mensagens também saem daqui. Foto sem mensagem com
// menos de 1 dia fica: pode ser um envio ainda em andamento.

const BUCKET = "documents";
const ROOT = "chat-images";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const GRACE_MS = 24 * 60 * 60 * 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(monitored("chat-cleanup", async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null);
  // Só o pg_cron (x-cron-secret) ou outra função (service role).
  if (!(await isTrustedCaller(req))) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    // 1. Pastas de conversa (as entradas sem id são "pastas").
    const folders: string[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase.storage.from(BUCKET).list(ROOT, { limit: PAGE, offset });
      if (error) throw error;
      for (const entry of data ?? []) if (!entry.id && UUID.test(entry.name)) folders.push(entry.name);
      if (!data || data.length < PAGE) break;
    }

    // 2. Quais dessas conversas ainda existem.
    const existing = new Set<string>();
    for (let i = 0; i < folders.length; i += 200) {
      const chunk = folders.slice(i, i + 200);
      const { data, error } = await supabase.from("conversas").select("id").in("id", chunk);
      if (error) throw error;
      for (const row of data ?? []) existing.add(row.id as string);
    }
    const orphans = folders.filter((id) => !existing.has(id));

    const listFiles = async (folder: string) => {
      const files: { path: string; createdAt: number }[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase.storage.from(BUCKET).list(`${ROOT}/${folder}`, { limit: PAGE, offset });
        if (error) throw error;
        for (const entry of data ?? []) {
          if (entry.id) {
            files.push({ path: `${ROOT}/${folder}/${entry.name}`, createdAt: Date.parse(entry.created_at ?? '') || 0 });
          }
        }
        if (!data || data.length < PAGE) break;
      }
      return files;
    };

    const removeAll = async (paths: string[]) => {
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
        if (error) throw error;
      }
      return paths.length;
    };

    // 3. Apaga os arquivos das pastas sem conversa.
    let removed = 0;
    for (const folder of orphans) {
      removed += await removeAll((await listFiles(folder)).map((f) => f.path));
    }

    // 4. Conversas que continuam: fotos sem mensagem (mensagem com mais de 3
    //    meses já apagada, ou envio desistido), com mais de 1 dia.
    let removedOld = 0;
    const cutoff = Date.now() - GRACE_MS;
    for (const folder of existing) {
      const candidates = (await listFiles(folder)).filter((f) => f.createdAt > 0 && f.createdAt < cutoff);
      if (!candidates.length) continue;
      const referenced = new Set<string>();
      for (let i = 0; i < candidates.length; i += 200) {
        const { data, error } = await supabase
          .from("mensagens")
          .select("imagem_url")
          .eq("conversa_id", folder)
          .in("imagem_url", candidates.slice(i, i + 200).map((f) => f.path));
        if (error) throw error;
        for (const row of data ?? []) referenced.add(row.imagem_url as string);
      }
      removedOld += await removeAll(candidates.filter((f) => !referenced.has(f.path)).map((f) => f.path));
    }

    return json({
      folders: folders.length,
      orphanFolders: orphans.length,
      removedFiles: removed,
      removedUnreferencedFiles: removedOld,
    });
  } catch (error) {
    console.error("chat-cleanup failed:", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}));
