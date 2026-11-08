import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTrustedCaller } from "../_shared/guards.ts";
import { firebaseServiceAccount, getAccessToken, sendToTokens } from "../_shared/fcm.ts";
import { ROUND_BUDGET_MS, mapLimit } from "../_shared/batch.ts";

// Lembretes de "Meus hábitos", chamados pelo pg_cron a cada 15 minutos.
//
// Quem decide o que está devido é claim_due_habit_reminders(): água dentro da
// janela e do intervalo escolhidos, enquanto a meta do dia não foi batida; e
// uma mensagem por dia para quem está parando de fumar/beber e para os outros
// hábitos do dia; no remédio, um lembrete em cada horário de dose ainda não
// marcada. A função marca cada lembrete como enviado na mesma operação, então
// chamadas repetidas não disparam lembretes a mais. Se o Firebase falhar, o
// lembrete é devolvido (release_habit_reminders) e sai na rodada seguinte.
//
// O texto aparece na tela bloqueada: não diz o nome do remédio nem do que a
// pessoa está largando (é dado de saúde; alguém pode ver o celular).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface DueReminder {
  habit_id: string;
  user_id: string;
  kind: string;
  title: string | null;
  daily_goal: number | null;
  today_total: number;
  quit_started_at: string | null;
  settings: Record<string, unknown> | null;
  /** Remédio: o horário da dose que está sendo lembrada. */
  due_slot?: string | null;
}

const formatMl = (ml: number) =>
  ml >= 1000 ? `${(ml / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L` : `${Math.round(ml)} ml`;

const daysSince = (iso: string | null) =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : 0;

const MEAL_LABELS: Record<string, string> = {
  breakfast: "café da manhã",
  lunch: "almoço",
  snack: "lanche",
  dinner: "jantar",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const buildMessage = (r: DueReminder): { title: string; body: string } => {
  const total = Number(r.today_total ?? 0);
  const goal = Number(r.daily_goal ?? 0);
  switch (r.kind) {
    case "water": {
      const missing = Math.max(0, goal - total);
      return {
        title: "Hora de beber água",
        body: total === 0
          ? `Comece o dia com um copo. A meta de hoje é ${formatMl(goal)}.`
          : `Você já bebeu ${formatMl(total)}. Faltam ${formatMl(missing)} para a meta.`,
      };
    }
    case "sleep":
      return { title: "Como você dormiu?", body: "Anote as horas de sono de hoje em Meus hábitos." };
    case "movement":
      return {
        title: "Bora se mexer?",
        body: total > 0 ? `Você já fez ${Math.round(total)} min hoje. Faltam ${Math.max(0, Math.round(goal - total))} min.` : `A meta de hoje é ${Math.round(goal)} min de movimento.`,
      };
    case "caffeine": {
      const cutoff = typeof r.settings?.cutoff_time === "string" ? r.settings.cutoff_time : null;
      return {
        title: "Último café do dia?",
        body: cutoff
          ? `Depois das ${cutoff}, a cafeína pode atrapalhar o sono. Hoje: ${Math.round(total)} mg de ${Math.round(goal)} mg.`
          : `Hoje: ${Math.round(total)} mg de ${Math.round(goal)} mg.`,
      };
    }
    case "meals": {
      const meal = MEAL_LABELS[r.due_slot ?? ""];
      if (meal) {
        return {
          title: `Hora do ${meal}`,
          body: "Já comeu? Marque em Meus hábitos. Ficar muitas horas sem comer pode aumentar a ansiedade.",
        };
      }
      return {
        title: "Já comeu?",
        body: total >= goal
          ? "Refeições do dia em dia. Que bom!"
          : "Ficar muitas horas sem comer pode aumentar a ansiedade. Marque as refeições em Meus hábitos.",
      };
    }
    case "medication":
      return {
        title: `Hora do remédio${r.due_slot ? ` (${r.due_slot})` : ""}`,
        body: "Marque em Meus hábitos quando tomar.",
      };
    case "screen_time":
      return {
        title: "Hora de desacelerar",
        body: "Que tal deixar o celular de lado na próxima hora? O sono agradece.",
      };
    case "joy":
      return {
        title: "Já fez algo que te faz bem hoje?",
        body: "Ler, ouvir música, caminhar: um momento seu também é autocuidado.",
      };
    case "quit_smoking":
    case "quit_alcohol":
    case "quit_custom": {
      const days = daysSince(r.quit_started_at);
      return {
        title: days === 0 ? "Hoje é o primeiro dia" : `${plural(days, "dia", "dias")} seguidos`,
        body: days === 0
          ? "Um dia de cada vez. Se a vontade vier, registre em Meus hábitos e respire junto com o app."
          : "Você está indo muito bem. Um dia de cada vez.",
      };
    }
    default:
      return { title: "Meus hábitos", body: "Que tal registrar o seu dia?" };
  }
};

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Só o pg_cron (x-cron-secret) ou outra função (service role).
  if (!(await isTrustedCaller(req))) return json({ error: "Unauthorized" }, 401);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // Lotes de até 500 (claim_due_habit_reminders) enquanto houver lembrete
    // devido e tempo. Antes pegava todos de uma vez: com milhares no mesmo
    // horário, a função estourava o tempo e os já marcados não eram enviados.
    const started = Date.now();
    const serviceAccount = firebaseServiceAccount();
    let accessToken: string | null = null;
    let totalDue = 0;
    let sent = 0;
    let totalRetry = 0;

    while (Date.now() - started < ROUND_BUDGET_MS) {
      const { data: due, error } = await supabase.rpc("claim_due_habit_reminders");
      if (error) throw error;
      const reminders = (due ?? []) as DueReminder[];
      if (reminders.length === 0) break;
      totalDue += reminders.length;

      // Um acesso ao Google para a rodada inteira (antes era um por lembrete).
      if (serviceAccount && !accessToken) {
        try {
          accessToken = await getAccessToken(serviceAccount);
        } catch (err) {
          console.error("habit-reminders: sem acesso ao Firebase", err);
        }
      }
      if (!serviceAccount || !accessToken) {
        if (!serviceAccount) console.error("habit-reminders: Firebase não configurado");
        await supabase.rpc("release_habit_reminders", { p_habit_ids: reminders.map((r) => r.habit_id) });
        totalRetry += reminders.length;
        break;
      }

      const userIds = [...new Set(reminders.map((r) => r.user_id))];
      const { data: tokens, error: tokensError } = await supabase
        .from("fcm_tokens")
        .select("user_id, token")
        .in("user_id", userIds)
        .neq("is_active", false);
      if (tokensError) throw tokensError;

      const tokensByUser = new Map<string, string[]>();
      for (const t of tokens ?? []) {
        const list = tokensByUser.get(t.user_id) ?? [];
        list.push(t.token);
        tokensByUser.set(t.user_id, list);
      }

      const retry: string[] = [];
      const deadTokens = new Set<string>();
      await mapLimit(reminders, 50, async (reminder) => {
        const userTokens = tokensByUser.get(reminder.user_id);
        if (!userTokens?.length) return;
        const message = buildMessage(reminder);
        const url = `/habitos/${reminder.habit_id}`;
        const results = await sendToTokens(serviceAccount, accessToken!, userTokens, {
          ...message,
          url,
          data: { type: "habit_reminder", habit_id: reminder.habit_id },
          // Lembrete velho não serve: depois de 2 h o Firebase descarta.
          ttlSeconds: 2 * 3600,
          // O lembrete novo do mesmo hábito substitui o anterior no aparelho.
          tag: `habit-${reminder.habit_id}`,
        });
        results.filter((r) => r.dead).forEach((r) => deadTokens.add(r.token));
        if (results.some((r) => r.ok)) sent += 1;
        else if (results.some((r) => r.transient)) retry.push(reminder.habit_id);
      });
      if (deadTokens.size > 0) {
        await supabase.from("fcm_tokens").update({ is_active: false }).in("token", [...deadTokens]);
      }
      if (retry.length > 0) {
        const { error: releaseError } = await supabase.rpc("release_habit_reminders", { p_habit_ids: retry });
        if (releaseError) console.error("habit-reminders: não foi possível devolver", releaseError);
        totalRetry += retry.length;
        // Falha passageira devolvida à fila: não repete nesta rodada (evita laço).
        break;
      }
      if (reminders.length < 500) break;
    }

    return json({ due: totalDue, sent, retry: totalRetry });
  } catch (error) {
    console.error("habit-reminders error:", error);
    return json({ error: "Falha ao processar lembretes" }, 500);
  }
});
