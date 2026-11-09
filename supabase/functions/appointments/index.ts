import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { errorMessage } from '../_shared/errors.ts';
import { monitored } from "../_shared/monitoring.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Monthly quota reset must follow the calendar month as lived in
// America/Sao_Paulo, not Deno's UTC clock — otherwise a use late on the
// last day of the month gets attributed to the next month.
const brazilYearMonth = (date: Date) => {
  const brazil = new Date(date.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return { year: brazil.getFullYear(), month: brazil.getMonth() };
};
/** Início do mês corrente no horário de Brasília (UTC-3, sem horário de verão). */
const brazilMonthStartIso = (now: Date): string => {
  const { year, month } = brazilYearMonth(now);
  return `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00-03:00`;
};

/** Primeiro dia do mês corrente em Brasília, como data (para `sos_last_used`). */
const brazilMonthStartDate = (now: Date): string => brazilMonthStartIso(now).slice(0, 10);

const isSameBrazilMonth = (a: Date, b: Date) => {
  const ym1 = brazilYearMonth(a);
  const ym2 = brazilYearMonth(b);
  return ym1.year === ym2.year && ym1.month === ym2.month;
};

type Block = { start_time: string; end_time: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** Subtracts `blocked` from each range in `ranges`, truncating/splitting as needed. */
const subtractRange = (ranges: Block[], blocked: Block): Block[] => {
  const result: Block[] = [];
  for (const r of ranges) {
    const noOverlap = blocked.end_time <= r.start_time || blocked.start_time >= r.end_time;
    if (noOverlap) {
      result.push(r);
      continue;
    }
    if (blocked.start_time > r.start_time) result.push({ start_time: r.start_time, end_time: blocked.start_time });
    if (blocked.end_time < r.end_time) result.push({ start_time: blocked.end_time, end_time: r.end_time });
  }
  return result;
};

/**
 * Server-side mirror of the same rule the patient-facing booking flow
 * already enforces (useAvailableTimeSlots / psychologistAvailability.ts):
 * a 50-minute slot is only real if it fits inside the psychologist's base
 * weekly schedule, combined with that exact date's overrides, and the
 * psychologist isn't on vacation that day. Needed here because the old
 * check only validated a fixed 7h+ window (with a dead upper bound —
 * `hour >= 24` can never be true) against no one's actual agenda.
 */
const isWithinPsychologistAvailability = async (
  supabase: ReturnType<typeof createClient>,
  psychologistId: string,
  scheduledAtISO: string
): Promise<boolean> => {
  const scheduledDate = new Date(scheduledAtISO);
  const brazilTime = new Date(scheduledDate.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dateISO = `${brazilTime.getFullYear()}-${String(brazilTime.getMonth() + 1).padStart(2, '0')}-${String(brazilTime.getDate()).padStart(2, '0')}`;
  const dayOfWeek = brazilTime.getDay();
  const startMin = brazilTime.getHours() * 60 + brazilTime.getMinutes();
  const endMin = startMin + 50;

  const [{ data: vacation }, { data: baseRows }, { data: overrideRows }] = await Promise.all([
    supabase
      .from('psychologist_vacations')
      .select('start_date')
      .eq('psychologist_id', psychologistId)
      .lte('start_date', dateISO)
      .gte('end_date', dateISO)
      // limit(1), não maybeSingle(): com dois períodos sobrepostos o
      // maybeSingle() dava erro, voltava vazio e o dia contava como livre.
      .limit(1),
    supabase
      .from('psychologist_availability')
      .select('start_time, end_time')
      .eq('psychologist_id', psychologistId)
      .eq('day_of_week', dayOfWeek)
      .eq('is_available', true),
    supabase
      .from('psychologist_availability_overrides')
      .select('start_time, end_time, type')
      .eq('psychologist_id', psychologistId)
      .eq('date', dateISO),
  ]);

  if ((vacation ?? []).length > 0) return false;

  let ranges: Block[] = (baseRows ?? []).map((r: { start_time: string; end_time: string }) => ({ start_time: r.start_time.slice(0, 5), end_time: r.end_time.slice(0, 5) }));
  const overrides = (overrideRows ?? []).map((r: { start_time: string; end_time: string; type: string }) => ({ start_time: r.start_time.slice(0, 5), end_time: r.end_time.slice(0, 5), type: r.type as string }));
  for (const o of overrides) {
    if (o.type === 'bloqueio') ranges = subtractRange(ranges, o);
  }
  for (const o of overrides) {
    if (o.type === 'abertura') ranges = [...ranges, { start_time: o.start_time, end_time: o.end_time }];
  }

  return ranges.some((r) => timeToMinutes(r.start_time) <= startMin && endMin <= timeToMinutes(r.end_time));
};

// Psicólogo da consulta para a tela. Se ele foi excluído, a consulta fica no
// histórico do paciente com o nome guardado (psychologist_name).
type PsychologistInfo = { full_name: string | null; specialization: string | null };
const psychologistOf = (appointment: {
  psychologists?: PsychologistInfo | PsychologistInfo[] | null;
  psychologist_name?: string | null;
}) => {
  const joined = Array.isArray(appointment.psychologists) ? appointment.psychologists[0] : appointment.psychologists;
  if (joined) return joined;
  return appointment.psychologist_name ? { full_name: appointment.psychologist_name, specialization: null } : null;
};

serve(monitored("appointments", async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Invalid authentication');
    }

    // Verify user type from profile - only patients and psychologists can access appointments
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('user_id', user.id)
      .single();

    if (!profile || (profile.user_type !== 'patient' && profile.user_type !== 'psychologist')) {
      throw new Error('Access denied. Invalid user type.');
    }

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const action = url.searchParams.get('action');

      if (action === 'psychologists') {
        // Get available psychologists from psychologists table
        const { data: psychologists, error } = await supabase
          .from('psychologists')
          .select('user_id, full_name, specialization')
          .eq('approved', true)
          .eq('approval_status', 'approved');

        if (error) throw error;

        return new Response(
          JSON.stringify(psychologists),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      if (action === 'history') {
        // Get patient's appointment history
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '10');
        const offset = (page - 1) * limit;

        const { data: appointments, error } = await supabase
          .from('appointments')
          .select(`
            *,
            psychologists!psychologist_id(
              full_name, 
              specialization
            )
          `)
          .eq('patient_id', user.id)
          .order('scheduled_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        // Transform data to ensure psychologist is properly structured
        const transformedAppointments = appointments?.map(appointment => ({
          ...appointment,
          psychologist: psychologistOf(appointment)
        })) || [];

        return new Response(
          JSON.stringify(transformedAppointments),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Get upcoming appointments
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
          *,
          psychologists!psychologist_id(
            full_name, 
            specialization
          )
        `)
        .eq('patient_id', user.id)
        // Inclui as que já começaram: a sala fica aberta até 15 min depois do
        // fim (src/lib/consultationWindow.ts). Antes, a consulta sumia da lista
        // no horário de início e quem caiu da chamada não conseguia voltar.
        .gte('scheduled_at', new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString())
        .order('scheduled_at', { ascending: true });

      if (error) {
        console.error('Error fetching appointments:', error);
        throw error;
      }

      // Transform data to ensure psychologist is properly structured
      const transformedAppointments = appointments?.map(appointment => ({
        ...appointment,
        psychologist: psychologistOf(appointment)
      })) || [];

      return new Response(
        JSON.stringify(transformedAppointments),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (req.method === 'POST') {
      // Create new appointment
      let requestBody = {};
      
      try {
        const text = await req.text();
        
        if (text && text.trim()) {
          requestBody = JSON.parse(text);
        } else {
          console.log('Empty request body');
        }
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        return new Response(
          JSON.stringify({ error: 'Invalid JSON format in request body' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      
      const { psychologist_id, scheduled_at, duration, appointment_type, notes, request_id } = requestBody as Record<string, unknown> & {
        psychologist_id?: string;
        scheduled_at?: string;
        notes?: unknown;
        request_id?: unknown;
      };
      void duration;

      // Id do pedido gerado no aparelho: se a resposta se perdeu e o app
      // tentar de novo, devolve o pedido já criado (antes a segunda tentativa
      // dizia "limite mensal já utilizado" e a pessoa achava que não agendou).
      const requestId = typeof request_id === 'string' && UUID_RE.test(request_id) ? request_id : null;
      if (requestId) {
        const { data: existing } = await supabase
          .from('appointments')
          .select(`
            *,
            psychologists!psychologist_id(
              full_name,
              specialization
            )
          `)
          .eq('id', requestId)
          .maybeSingle();
        if (existing) {
          if (existing.patient_id !== user.id) throw new Error('Pedido inválido.');
          return new Response(
            JSON.stringify({
              success: true,
              appointment: {
                ...existing,
                psychologist: Array.isArray(existing.psychologists) ? existing.psychologists[0] : existing.psychologists,
              },
              message: 'Consulta solicitada com sucesso! Aguardando confirmação do psicólogo.',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }

      // Cap how many booking attempts one patient can make in a short
      // window — nothing legitimate needs more than a handful per hour,
      // and the quota/conflict checks below still do real work per call.
      const { data: withinBookingLimit } = await supabase.rpc('check_rate_limit', {
        p_key: `appointments:${user.id}`,
        p_max_requests: 10,
        p_window_seconds: 3600,
      });
      if (withinBookingLimit === false) {
        throw new Error('Muitas tentativas de agendamento em pouco tempo. Aguarde um pouco antes de tentar novamente.');
      }

      if (!psychologist_id || !scheduled_at) {
        throw new Error('Psychologist ID and scheduled time are required');
      }
      if (Number.isNaN(new Date(scheduled_at).getTime())) {
        throw new Error('Horário inválido.');
      }

      // The GET action=psychologists listing only ever shows approved
      // psychologists, but this endpoint is callable directly with any
      // psychologist_id — without this check a patient could book with a
      // pending/rejected/blocked account (availability rows can outlive
      // approval, e.g. set up before rejection).
      const { data: targetPsychologist } = await supabase
        .from('psychologists')
        .select('approved, approval_status, is_blocked, blocked_until')
        .eq('user_id', psychologist_id)
        .maybeSingle();

      const psychBlocked = targetPsychologist?.is_blocked === true &&
        (!targetPsychologist?.blocked_until || new Date(targetPsychologist.blocked_until) > new Date());

      if (!targetPsychologist || !targetPsychologist.approved || targetPsychologist.approval_status !== 'approved' || psychBlocked) {
        throw new Error('Psicólogo indisponível para agendamento.');
      }

      // Sempre 'regular'. Antes o tipo vinha do app e 'emergency' pulava a
      // checagem de plano (Flex ou Completo) e da cota: qualquer paciente agendava
      // consultas sem limite chamando a API (e cada uma entrava no repasse).
      // Atendimento de emergência é o SOS, que tem fluxo próprio.
      void appointment_type;
      const finalAppointmentType = 'regular';
      const safeNotes = typeof notes === 'string' ? notes.slice(0, 1000) : null;

      // Cota de consulta no servidor (Flex e Completo, 1x/mês) — a checagem
      // da tela pode ser pulada chamando este endpoint direto. No Flex, a
      // consulta e o SOS dividem o mesmo atendimento do mês.
      let subscriberRow: { subscribed: boolean | null; subscription_tier: string | null; subscription_end: string | null; cancel_at_period_end: boolean | null; appointments_used_this_month: boolean; appointments_last_used: string | null; sos_used_this_month: boolean | null; sos_last_used: string | null } | null = null;
      let isFlex = false;
      // Sem cota do plano (sem plano, Essencial ou cota do mês usada): usa
      // uma consulta avulsa já paga, se houver (tabela extra_credits).
      let useExtraCredit = false;
      const { count: extraAvailable } = await supabase
        .from('extra_credits')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('kind', 'appointment')
        .eq('status', 'available');
      const hasExtraCredit = (extraAvailable ?? 0) > 0;
      if (finalAppointmentType === 'regular') {
        const { data: subRow } = await supabase
          .from('subscribers')
          .select('subscribed, subscription_tier, subscription_end, cancel_at_period_end, appointments_used_this_month, appointments_last_used, sos_used_this_month, sos_last_used')
          .eq('user_id', user.id)
          .maybeSingle();
        subscriberRow = subRow;

        // Plano ativo de verdade: assinado e dentro da validade (o plano
        // vencido só some quando a rotina diária roda).
        const tier = String(subRow?.subscription_tier ?? '').toLowerCase();
        isFlex = tier === 'flex';
        const planActive =
          subRow?.subscribed === true &&
          (tier === 'flex' || tier === 'completo') &&
          (!subRow?.subscription_end || new Date(subRow.subscription_end).getTime() > Date.now());
        const nowForQuota = new Date();
        const lastUsed = subscriberRow?.appointments_last_used ? new Date(subscriberRow.appointments_last_used) : null;
        const sameMonth = lastUsed ? isSameBrazilMonth(lastUsed, nowForQuota) : false;
        const planQuotaUsed = Boolean(subscriberRow?.appointments_used_this_month && sameMonth);
        const flexSosUsed = isFlex && Boolean(subscriberRow?.sos_used_this_month && subscriberRow?.sos_last_used &&
          subscriberRow.sos_last_used >= brazilMonthStartDate(nowForQuota));
        const planUsable = Boolean(subscriberRow) && planActive && !planQuotaUsed && !flexSosUsed;

        if (!planUsable && hasExtraCredit) {
          useExtraCredit = true;
        } else if (!subscriberRow || !planActive) {
          throw new Error('O agendamento de consultas está disponível apenas nos planos Flex e Completo, ou como consulta avulsa.');
        } else if (planQuotaUsed) {
          throw new Error('Limite mensal de consultas agendadas já utilizado (1x/mês).');
        } else if (flexSosUsed) {
          // Flex: o SOS do mês já gastou o atendimento.
          throw new Error('Limite mensal de atendimento já utilizado em um SOS (FLEX: SOS ou consulta, 1x/mês).');
        }

        // Plano que não vai renovar: a consulta depois do fim seria cancelada
        // quando o plano terminar, então nem é marcada.
        if (!useExtraCredit && subRow?.cancel_at_period_end && subRow.subscription_end &&
            new Date(scheduled_at).getTime() >= new Date(subRow.subscription_end).getTime()) {
          const endLabel = new Date(subRow.subscription_end).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          throw new Error(`Seu plano termina em ${endLabel}. Agende até essa data ou renove o plano.`);
        }

      }

      // Psychologist's own booking rules (defaults when never configured).
      // Mirrors src/lib/bookingRules.ts, which only decides what the patient
      // is shown — this endpoint is callable directly, so it must re-check.
      const { data: rulesRow } = await supabase
        .from('psychologist_booking_rules')
        .select('buffer_minutes, min_notice_hours, max_advance_days')
        .eq('psychologist_id', psychologist_id)
        .maybeSingle();
      const bufferMin = rulesRow?.buffer_minutes ?? 0;
      const minNoticeHours = rulesRow?.min_notice_hours ?? 2;
      const maxAdvanceDays = rulesRow?.max_advance_days ?? 30;

      const appointmentStart = new Date(scheduled_at);
      const appointmentEnd = new Date(appointmentStart.getTime() + 50 * 60 * 1000);
      const nowMs = Date.now();

      if (appointmentStart.getTime() < nowMs + minNoticeHours * 60 * 60 * 1000) {
        throw new Error(
          minNoticeHours > 0
            ? `Este psicólogo pede pelo menos ${minNoticeHours}h de antecedência. Escolha um horário mais à frente.`
            : 'Não é possível agendar em um horário que já passou.'
        );
      }
      if (appointmentStart.getTime() > nowMs + (maxAdvanceDays + 1) * 24 * 60 * 60 * 1000) {
        throw new Error(`A agenda deste psicólogo só abre até ${maxAdvanceDays} dias à frente.`);
      }

      // Conflicts: every status that holds the slot (confirmed/in_progress
      // included — before, only pending/scheduled were checked, so a
      // confirmed consultation could be double-booked), keeping the
      // psychologist's buffer free on both sides.
      const windowMs = (3 * 60 + bufferMin) * 60 * 1000;
      const { data: conflictingAppointments, error: conflictError } = await supabase
        .from('appointments')
        .select('id, scheduled_at, duration')
        .eq('psychologist_id', psychologist_id)
        .in('status', ['pending', 'scheduled', 'confirmed', 'in_progress'])
        .gte('scheduled_at', new Date(appointmentStart.getTime() - windowMs).toISOString())
        .lte('scheduled_at', new Date(appointmentEnd.getTime() + windowMs).toISOString());

      if (conflictError) {
        console.error('Error checking conflicts:', conflictError);
        throw new Error('Erro ao verificar conflitos de horário');
      }

      // Horários que o psicólogo propôs a outro paciente e ainda esperam
      // resposta também ficam reservados.
      const { data: proposedRows, error: proposedError } = await supabase
        .from('appointments')
        .select('proposed_scheduled_at, duration')
        .eq('psychologist_id', psychologist_id)
        .eq('status', 'reschedule_proposed')
        .gte('proposed_scheduled_at', new Date(appointmentStart.getTime() - windowMs).toISOString())
        .lte('proposed_scheduled_at', new Date(appointmentEnd.getTime() + windowMs).toISOString());
      if (proposedError) {
        console.error('Error checking proposed slots:', proposedError);
        throw new Error('Erro ao verificar conflitos de horário');
      }
      const holding = [
        ...(conflictingAppointments ?? []),
        ...(proposedRows ?? []).map((r: { proposed_scheduled_at: string; duration: number | null }) => ({ scheduled_at: r.proposed_scheduled_at, duration: r.duration })),
      ];

      const bufferMs = bufferMin * 60 * 1000;
      for (const existing of holding) {
        const existingStart = new Date(existing.scheduled_at).getTime();
        const existingEnd = existingStart + (existing.duration || 50) * 60 * 1000;
        const free =
          appointmentEnd.getTime() + bufferMs <= existingStart ||
          appointmentStart.getTime() >= existingEnd + bufferMs;
        if (!free) {
          throw new Error('Este horário já está ocupado. Escolha outro horário disponível.');
        }
      }

      const scheduledDate = new Date(scheduled_at);

      // 10-minute interval check (Brazil timezone) — kept separate from the
      // agenda check below since it's a pure formatting rule, not tied to
      // any one psychologist.
      const brazilTime = new Date(scheduledDate.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
      const minutes = brazilTime.getMinutes();

      if (minutes % 10 !== 0) {
        throw new Error('Consultas só podem ser agendadas em intervalos de 10 minutos (ex: 08:00, 08:10, 08:20, etc.).');
      }

      // Real agenda check — the old rule only validated a fixed 7h+ window
      // (with a dead upper bound: hour >= 24 can never be true), accepting
      // any time on any day for any psychologist regardless of what they
      // actually configured. The client (useAvailableTimeSlots) already
      // only shows real slots, but this endpoint is callable directly.
      const fitsSchedule = await isWithinPsychologistAvailability(supabase, psychologist_id, scheduled_at);
      if (!fitsSchedule) {
        throw new Error('Esse horário não está disponível na agenda do psicólogo selecionado.');
      }

      // Reserva a consulta do mês de forma atômica ANTES de criar o pedido:
      // dois pedidos ao mesmo tempo passavam pela checagem acima antes de
      // qualquer um marcar a cota, e o paciente ficava com duas no mês.
      const appointmentId = requestId ?? crypto.randomUUID();
      let extraCreditId: string | null = null;
      if (useExtraCredit) {
        const { data: creditId, error: creditError } = await supabase.rpc('consume_extra_credit', {
          p_user_id: user.id,
          p_kind: 'appointment',
          p_emergency_request_id: null,
          p_appointment_id: appointmentId,
        });
        if (creditError) throw creditError;
        if (!creditId) throw new Error('Limite mensal de consultas agendadas já utilizado (1x/mês).');
        extraCreditId = creditId as string;
      } else {
      let reserveQuery = supabase
        .from('subscribers')
        .update({ appointments_used_this_month: true, appointments_last_used: new Date().toISOString() })
        .eq('user_id', user.id)
        .or(`appointments_used_this_month.eq.false,appointments_last_used.is.null,appointments_last_used.lt.${brazilMonthStartIso(new Date())}`);
      if (isFlex) {
        // Flex: também não pode ter SOS no mês (os dois filtros valem juntos).
        reserveQuery = reserveQuery.or(`sos_used_this_month.eq.false,sos_last_used.is.null,sos_last_used.lt.${brazilMonthStartDate(new Date())}`);
      }
      const { data: reserved, error: reserveError } = await reserveQuery.select('id');
      if (reserveError) throw reserveError;
      if (!reserved || reserved.length === 0) {
        throw new Error('Limite mensal de consultas agendadas já utilizado (1x/mês).');
      }
      }

      const { data: appointment, error } = await supabase
        .from('appointments')
        .insert({
          id: appointmentId,
          extra_credit_id: extraCreditId,
          patient_id: user.id,
          psychologist_id,
          scheduled_at,
          duration: 50, // Fixed 50-minute duration
          appointment_type: finalAppointmentType,
          notes: safeNotes,
          status: 'pending' // Start as pending, waiting for psychologist confirmation
        })
        .select(`
          *,
          psychologists!psychologist_id(
            full_name, 
            specialization
          )
        `)
        .single();

      if (error) {
        // O pedido não foi criado: devolve a cota (ou o avulso) reservada.
        if (extraCreditId) {
          await supabase.rpc('return_extra_credit', { p_credit_id: extraCreditId });
        } else {
          await supabase
            .from('subscribers')
            .update({ appointments_used_this_month: false })
            .eq('user_id', user.id);
        }
        throw error;
      }

      // Transform appointment to ensure psychologist is properly structured
      const transformedAppointment = {
        ...appointment,
        psychologist: psychologistOf(appointment)
      };

      // TODO: Send confirmation email/SMS
      // Removed sensitive logging for security

      return new Response(
        JSON.stringify({
          success: true,
          appointment: transformedAppointment,
          message: 'Consulta solicitada com sucesso! Aguardando confirmação do psicólogo.'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  } catch (error: unknown) {
    console.error('Error in appointments function:', errorMessage(error));
    const msg = errorMessage(error) || 'Erro interno';
    // Validation/business errors → 400/409/429 (not 500) — these are
    // expected outcomes (agenda full, plan restriction, quota used, rate
    // limited), not server malfunctions.
    const isConflict = /ocupado/i.test(msg);
    const isRateLimited = /muitas (tentativas|solicitações)/i.test(msg);
    const isValidation = /obrigat|inválid|intervalo|entre 07h|10 minutos|required|dispon|limite mensal|anteced|agenda|planos flex|plano termina|passou/i.test(msg);
    const status = isConflict ? 409 : isRateLimited ? 429 : isValidation ? 400 : 500;
    return new Response(
      JSON.stringify({ error: msg }),
      {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
}));