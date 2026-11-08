import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { errorCode, errorMessage } from '../_shared/errors.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

type Block = { start_time: string; end_time: string };

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
 * a 50-minute slot is only real if it fits inside the psychologist's
 * base weekly schedule, combined with that exact date's overrides, and
 * the psychologist isn't on vacation that day. Needed here because the
 * reschedule-proposal endpoint used to accept any time the psychologist
 * (or a direct API call) sent, with no check against their own agenda.
 */
const isWithinPsychologistAvailability = async (
  supabase: SupabaseClient,
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

/** Erro de regra de negócio: vira 4xx com a mensagem para a pessoa (não 500). */
class HttpError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const SLOT_MS = 50 * 60 * 1000;

/**
 * Garante que o horário não bate com outra consulta que segura a agenda do
 * psicólogo: pedidos pendentes, confirmadas, em andamento e horários já
 * propostos a outro paciente, mantendo o intervalo entre consultas que o
 * psicólogo configurou. O banco recusa sobreposição de novo
 * (prevent_appointment_overlap), mesmo com dois pedidos ao mesmo tempo.
 */
const assertNoConflict = async (
  supabase: SupabaseClient,
  psychologistId: string,
  startISO: string,
  excludeId: string,
) => {
  const start = new Date(startISO).getTime();
  const from = new Date(start - 4 * 60 * 60 * 1000).toISOString();
  const to = new Date(start + 4 * 60 * 60 * 1000).toISOString();
  const [{ data, error }, { data: proposed, error: proposedError }, { data: rules }] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, scheduled_at, duration')
      .eq('psychologist_id', psychologistId)
      .in('status', ['pending', 'scheduled', 'confirmed', 'in_progress'])
      .neq('id', excludeId)
      .gte('scheduled_at', from)
      .lte('scheduled_at', to),
    supabase
      .from('appointments')
      .select('id, proposed_scheduled_at, duration')
      .eq('psychologist_id', psychologistId)
      .eq('status', 'reschedule_proposed')
      .neq('id', excludeId)
      .gte('proposed_scheduled_at', from)
      .lte('proposed_scheduled_at', to),
    supabase
      .from('psychologist_booking_rules')
      .select('buffer_minutes')
      .eq('psychologist_id', psychologistId)
      .maybeSingle(),
  ]);
  if (error) throw error;
  if (proposedError) throw proposedError;
  const bufferMs = (rules?.buffer_minutes ?? 0) * 60 * 1000;
  const others = [
    ...((data ?? []) as { scheduled_at: string; duration: number | null }[]),
    ...((proposed ?? []) as { proposed_scheduled_at: string; duration: number | null }[]).map((r) => ({
      scheduled_at: r.proposed_scheduled_at,
      duration: r.duration,
    })),
  ];
  for (const other of others) {
    const otherStart = new Date(other.scheduled_at).getTime();
    const otherEnd = otherStart + (other.duration || 50) * 60 * 1000;
    if (start < otherEnd + bufferMs && otherStart < start + SLOT_MS + bufferMs) {
      throw new HttpError('Esse horário já está ocupado por outra consulta.', 409);
    }
  }
};

/** Etapas permitidas para o psicólogo, a partir do status atual. */
const PSYCHOLOGIST_TRANSITIONS: Record<string, string[]> = {
  pending: ['scheduled', 'declined', 'reschedule_proposed'],
  scheduled: ['reschedule_proposed', 'in_progress', 'completed'],
  confirmed: ['reschedule_proposed', 'in_progress', 'completed'],
  in_progress: ['completed'],
};

serve(async (req) => {
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

    // Get user profile to check user type
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_type')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('User profile not found.');
    }

    const userType = profile.user_type;

    // Only psychologists can access GET endpoints (view appointments)
    if (req.method === 'GET') {
      if (userType !== 'psychologist') {
        throw new Error('Access denied. Psychologist access required for viewing appointments.');
      }
      const url = new URL(req.url);
      const action = url.searchParams.get('action');

      if (action === 'upcoming') {
        // Get upcoming appointments for today and next 7 days
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);

        const { data: appointments, error } = await supabase
          .from('appointments')
          .select('*')
          .eq('psychologist_id', user.id)
          .gte('scheduled_at', today.toISOString())
          .lte('scheduled_at', nextWeek.toISOString())
          .eq('status', 'scheduled')
          .order('scheduled_at', { ascending: true });

        if (error) {
          console.error('Error fetching upcoming appointments:', error);
          throw error;
        }

        // Fetch patient names separately
        const patientIds = appointments?.map(a => a.patient_id) || [];
        const { data: patients, error: patientsError } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', patientIds);

        if (patientsError) {
          console.error('Error fetching patient profiles:', patientsError);
          // Continue without patient names rather than failing
        }

        // Map patient names to appointments
        const appointmentsWithPatients = appointments?.map(appointment => ({
          ...appointment,
          patient: patients?.find(p => p.user_id === appointment.patient_id) || { full_name: 'Paciente' }
        })) || [];

        return new Response(
          JSON.stringify(appointmentsWithPatients),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      if (action === 'pending') {
        // Get pending appointments awaiting psychologist confirmation
        const { data: appointments, error } = await supabase
          .from('appointments')
          .select('*')
          .eq('psychologist_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: true });

        if (error) {
          console.error('Error fetching pending appointments:', error);
          throw error;
        }

        // Fetch patient names separately
        const patientIds = appointments?.map(a => a.patient_id) || [];
        const { data: patients, error: patientsError } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', patientIds);

        if (patientsError) {
          console.error('Error fetching patient profiles:', patientsError);
        }

        // Map patient names to appointments
        const appointmentsWithPatients = appointments?.map(appointment => ({
          ...appointment,
          patient: patients?.find(p => p.user_id === appointment.patient_id) || { full_name: 'Paciente' }
        })) || [];

        return new Response(
          JSON.stringify(appointmentsWithPatients),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      if (action === 'history') {
        // Get appointment history with pagination
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '10');
        const offset = (page - 1) * limit;

        const { data: appointments, error } = await supabase
          .from('appointments')
          .select('*')
          .eq('psychologist_id', user.id)
          .order('scheduled_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          console.error('Error fetching appointment history:', error);
          throw error;
        }

        // Fetch patient names separately
        const patientIds = appointments?.map(a => a.patient_id) || [];
        const { data: patients, error: patientsError } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', patientIds);

        if (patientsError) {
          console.error('Error fetching patient profiles:', patientsError);
        }

        // Map patient names to appointments
        const appointmentsWithPatients = appointments?.map(appointment => ({
          ...appointment,
          patient: patients?.find(p => p.user_id === appointment.patient_id) || { full_name: 'Paciente' }
        })) || [];

        // Get total count for pagination
        const { count, error: countError } = await supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('psychologist_id', user.id);

        if (countError) {
          console.error('Error counting appointments:', countError);
          throw countError;
        }

        return new Response(
          JSON.stringify({
            appointments: appointmentsWithPatients,
            totalCount: count,
            currentPage: page,
            totalPages: Math.ceil((count || 0) / limit)
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      // Default: get today's appointments. "Today" must mean Brazil's
      // calendar day, not the UTC day this edge function's runtime happens
      // to be in — building the boundary from a raw `new Date()` here used
      // Deno's UTC getters, so for ~21h/day (every hour except 21h-24h BRT)
      // this returned the wrong window: mostly tomorrow's appointments,
      // missing almost all of today's.
      const now = new Date();
      const brazilNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      const y = brazilNow.getFullYear();
      const m = brazilNow.getMonth();
      const d = brazilNow.getDate();
      // America/Sao_Paulo has been fixed at UTC-3 since Brazil ended DST in 2019.
      const startOfDay = new Date(Date.UTC(y, m, d, 3, 0, 0));
      const endOfDay = new Date(Date.UTC(y, m, d + 1, 3, 0, 0));

      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('psychologist_id', user.id)
        .gte('scheduled_at', startOfDay.toISOString())
        .lt('scheduled_at', endOfDay.toISOString())
        .order('scheduled_at', { ascending: true });

      if (error) {
        console.error('Error fetching today\'s appointments:', error);
        throw error;
      }

      // Fetch patient names separately
      const patientIds = appointments?.map(a => a.patient_id) || [];
      const { data: patients, error: patientsError } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', patientIds);

      if (patientsError) {
        console.error('Error fetching patient profiles:', patientsError);
      }

      // Map patient names to appointments
      const appointmentsWithPatients = appointments?.map(appointment => ({
        ...appointment,
        patient: patients?.find(p => p.user_id === appointment.patient_id) || { full_name: 'Paciente' }
      })) || [];

      return new Response(
        JSON.stringify(appointmentsWithPatients),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

  if (req.method === 'POST' || req.method === 'PUT') {
    // Handle both POST (for rescheduling) and PUT (for other updates)
    let requestBody;
    try {
      const rawBody = await req.text();
      if (!rawBody || rawBody.trim() === '') {
        // Return empty appointments array for GET-like requests without body
        console.log('Empty body received, treating as GET request');
        return new Response(
          JSON.stringify([]),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      requestBody = JSON.parse(rawBody);
    } catch (parseError) {
      console.error('JSON parsing failed:', parseError);
      // Return empty array instead of error for parsing failures
      return new Response(
        JSON.stringify([]),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { 
      appointmentId, 
      status, 
      sessionSummary, 
      proposedScheduledAt, 
      proposalNotes,
      rescheduleResponse,
      action // New field to identify the action type
    } = requestBody;

    if (!appointmentId) {
      throw new Error('Appointment ID is required');
    }

    // Check permissions based on user type and action
    if (userType === 'patient') {
      // Patients can only respond to reschedule proposals
      if (action !== 'respond_reschedule') {
        throw new Error('Access denied. Patients can only respond to reschedule proposals.');
      }
      if (!['scheduled', 'declined'].includes(status)) {
        throw new Error('Invalid status for patient response. Must be "scheduled" or "declined".');
      }
    } else if (userType === 'psychologist') {
      // Psychologists can perform all actions, but a proposed time must
      // actually fall inside their own configured schedule.
      if (status === 'reschedule_proposed' && proposedScheduledAt) {
        const fitsSchedule = await isWithinPsychologistAvailability(supabase, user.id, proposedScheduledAt);
        if (!fitsSchedule) {
          throw new Error('O horário proposto está fora da sua agenda configurada.');
        }
      }
    } else {
      throw new Error('Access denied. Invalid user type.');
    }

    // Get appointment details for notifications
    let appointmentQuery = supabase
      .from('appointments')
      .select(`
        *,
        psychologists!inner(full_name)
      `)
      .eq('id', appointmentId);

    // Add user-specific filtering
    if (userType === 'psychologist') {
      appointmentQuery = appointmentQuery.eq('psychologist_id', user.id);
    } else if (userType === 'patient') {
      appointmentQuery = appointmentQuery.eq('patient_id', user.id);
    }

    const { data: appointment, error: appointmentError } = await appointmentQuery.single();

    if (appointmentError) {
      console.error('Error fetching appointment:', appointmentError);
      throw appointmentError;
    }

    // Regras de cada etapa. Antes qualquer status era aceito a qualquer
    // momento: o paciente podia "aceitar uma proposta" numa consulta pendente
    // (confirmando sozinho, sem o psicólogo), confirmar horário que já passou
    // ou que conflita com outra consulta, propor horário no passado etc.
    const nowMs = Date.now();
    const startMs = new Date(appointment.scheduled_at).getTime();
    if (userType === 'patient') {
      if (appointment.status !== 'reschedule_proposed') {
        throw new HttpError('Não há proposta de novo horário para responder nesta consulta.', 409);
      }
      if (status === 'scheduled') {
        const proposed = appointment.proposed_scheduled_at;
        if (!proposed || new Date(proposed).getTime() <= nowMs) {
          throw new HttpError('O horário proposto já passou. Agende um novo horário.', 409);
        }
        await assertNoConflict(supabase, appointment.psychologist_id, proposed, appointment.id);
        // O psicólogo pode ter mudado a agenda (férias, bloqueio) depois de propor.
        if (!(await isWithinPsychologistAvailability(supabase, appointment.psychologist_id, proposed))) {
          throw new HttpError('O psicólogo não está mais disponível nesse horário. Recuse a proposta e agende outro horário.', 409);
        }
      }
    } else if (status && status !== appointment.status) {
      if (!(PSYCHOLOGIST_TRANSITIONS[appointment.status] ?? []).includes(status)) {
        throw new HttpError('Esta consulta não pode mais ser alterada desse jeito.', 409);
      }
      if (status === 'scheduled') {
        if (startMs <= nowMs) {
          throw new HttpError('O horário desta consulta já passou. Recuse ou proponha outro horário.', 409);
        }
        await assertNoConflict(supabase, user.id, appointment.scheduled_at, appointment.id);
      }
      if (status === 'reschedule_proposed') {
        if (!proposedScheduledAt || new Date(proposedScheduledAt).getTime() <= nowMs) {
          throw new HttpError('Escolha um novo horário no futuro.', 400);
        }
        if (appointment.status !== 'pending' && startMs <= nowMs) {
          throw new HttpError('A consulta já começou e não pode mais ser remarcada.', 409);
        }
        await assertNoConflict(supabase, user.id, proposedScheduledAt, appointment.id);
      }
      if (status === 'in_progress' && nowMs < startMs - 10 * 60 * 1000) {
        throw new HttpError('A sala abre 10 minutos antes do horário da consulta.', 409);
      }
      if (status === 'completed' && nowMs < startMs) {
        throw new HttpError('Só dá para concluir a consulta depois do horário de início.', 409);
      }
      // Concluir conta para o repasse: só consultas em que a chamada conectou
      // os dois lados (a sessão de vídeo tem `connected_at`). Vale também para
      // consulta "em andamento": ela fica assim assim que UM lado entra na
      // sala, então o psicólogo sozinho conseguia concluir e receber.
      if (status === 'completed') {
        const { data: session } = appointment.video_room_id
          ? await supabase.from('webrtc_sessions').select('connected_at, media_seconds, media_tracked').eq('id', appointment.video_room_id).maybeSingle()
          : { data: null };
        // `connected_at` só é gravado quando os dois lados confirmam áudio/vídeo
        // passando (report_call_media); a resposta da oferta sozinha não basta.
        if (!session?.connected_at) {
          throw new HttpError('Esta consulta não chegou a acontecer pela chamada do app, então não pode ser concluída.', 409);
        }
        // E só conta com pelo menos 5 minutos de chamada com os dois conectados
        // (salas antigas, sem essa contagem, seguem a regra de antes).
        if (session.media_tracked && (session.media_seconds ?? 0) < 300) {
          throw new HttpError('A chamada durou menos de 5 minutos com os dois conectados, então a consulta não conta. Se ela foi interrompida, marque como "Consulta interrompida" para devolver a consulta do mês ao paciente.', 409);
        }
      }
    }

    if (typeof sessionSummary === 'string' && sessionSummary.length > 10000) {
      throw new HttpError('O resumo da sessão pode ter até 10.000 caracteres.', 400);
    }
    if (typeof proposalNotes === 'string' && proposalNotes.length > 1000) {
      throw new HttpError('A mensagem da proposta pode ter até 1.000 caracteres.', 400);
    }

    const updateData: Record<string, string | null> = {};
    if (status) updateData.status = status;
    if (sessionSummary) updateData.session_summary = sessionSummary;
    if (proposedScheduledAt) updateData.proposed_scheduled_at = proposedScheduledAt;
    if (proposalNotes) updateData.proposal_notes = proposalNotes;

    // When the patient accepts a reschedule proposal, the appointment's
    // actual scheduled_at must move to the proposed time — otherwise the
    // status flips to "scheduled" but every part of the app (call entry
    // window, "today"/"upcoming" lists, the psychologist's agenda) keeps
    // operating off the old, already-superseded time.
    if (userType === 'patient' && action === 'respond_reschedule' && status === 'scheduled' && appointment.proposed_scheduled_at) {
      updateData.scheduled_at = appointment.proposed_scheduled_at;
      updateData.proposed_scheduled_at = null;
      updateData.proposal_notes = null;
    }

    // Build update query with appropriate user filtering. Só grava se a
    // consulta ainda está como foi lida: se o paciente cancelou (ou o pedido
    // expirou) enquanto o psicólogo respondia, aceitar não pode ressuscitar a
    // consulta (a consulta do mês já tinha sido devolvida).
    let updateQuery = supabase
      .from('appointments')
      .update(updateData)
      .eq('id', appointmentId)
      .eq('status', appointment.status);

    // Add user-specific filtering
    if (userType === 'psychologist') {
      updateQuery = updateQuery.eq('psychologist_id', user.id);
    } else if (userType === 'patient') {
      updateQuery = updateQuery.eq('patient_id', user.id);
    }

    const { data: updatedAppointment, error } = await updateQuery
      .select()
      .maybeSingle();

    if (error) {
      console.error('Error updating appointment:', error);
      throw error;
    }
    if (!updatedAppointment) {
      throw new HttpError('Esta consulta mudou enquanto você respondia (por exemplo, foi cancelada). Atualize a tela.', 409);
    }

    // The appointment never happened — give the patient's monthly (Flex/Completo)
    // appointment slot back. It was marked used at booking time (in the
    // `appointments` function), before anyone confirmed the request; a
    // decline (by either side, direct or after a reschedule proposal)
    // must not permanently burn that slot.
    if (status === 'declined' && appointment.appointment_type === 'regular') {
      // Só devolve se a cota marcada for a desta consulta (pedida no mesmo
      // mês). Uma consulta pedida no fim do mês anterior e recusada agora não
      // pode liberar a consulta do mês atual.
      const { error: quotaError } = await supabase.rpc('release_appointment_quota', {
        p_appointment_id: appointment.id,
      });
      if (quotaError) {
        console.error('Error releasing appointment quota:', quotaError);
        // Don't fail the request over this — the decline itself already succeeded.
      }
    }

    // Send notifications based on who made the change
    if (status && ['scheduled', 'declined', 'reschedule_proposed'].includes(status)) {
      try {
        let notificationData;
        
        if (userType === 'psychologist' && !rescheduleResponse) {
          // Psychologist action - notify patient
          notificationData = {
            patient_id: appointment.patient_id,
            appointment_id: appointmentId,
            status: status,
            psychologist_name: appointment.psychologists.full_name,
            appointment_date: new Date(appointment.scheduled_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            proposed_date: proposedScheduledAt ? new Date(proposedScheduledAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null,
            proposal_notes: proposalNotes
          };
        } else if (userType === 'patient' && action === 'respond_reschedule') {
          // Patient response - notify psychologist
          notificationData = {
            psychologist_id: appointment.psychologist_id,
            appointment_id: appointmentId,
            status: status,
            patient_response: status === 'scheduled' ? 'accepted' : 'declined',
            appointment_date: new Date(appointment.scheduled_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            proposed_date: appointment.proposed_scheduled_at ? new Date(appointment.proposed_scheduled_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null
          };
        }

        if (notificationData) {
          await supabase.functions.invoke('send-appointment-notification', {
            body: notificationData
          });
        }
      } catch (notificationError) {
        console.error('Error sending notification:', notificationError);
        // Don't fail the request if notification fails
      }
    }

    // Generate appropriate success message
    let message = 'Consulta atualizada com sucesso';
    if (userType === 'psychologist') {
      if (status === 'reschedule_proposed') {
        message = 'Proposta de reagendamento enviada com sucesso';
      } else if (status === 'scheduled') {
        message = 'Consulta confirmada com sucesso';
      } else if (status === 'declined') {
        message = 'Consulta recusada com sucesso';
      }
    } else if (userType === 'patient' && action === 'respond_reschedule') {
      if (status === 'scheduled') {
        message = 'Reagendamento aceito com sucesso';
      } else if (status === 'declined') {
        message = 'Reagendamento recusado com sucesso';
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        appointment: updatedAppointment,
        message: message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  } catch (error: unknown) {
    console.error('Error in psychologist-schedule function:', error);
    return new Response(
      JSON.stringify({ error: errorMessage(error) }),
      {
        // 23P01: o banco recusou horário sobreposto (prevent_appointment_overlap).
        status: error instanceof HttpError ? error.status : errorCode(error) === '23P01' ? 409 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});