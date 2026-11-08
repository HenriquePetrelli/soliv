import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { errorMessage } from '../_shared/errors.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

// Interpolated into raw HTML email content below (title/subject too, via
// in-app notification text) — none of it is user-safe by default:
// psychologist_name comes from the psychologist's own profile full_name,
// proposal_notes from their own free-text reschedule message. Neither is
// sanitized upstream, so without escaping here a psychologist could embed
// an <a>/<img> phishing link that renders live in a patient's real inbox.
const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // This endpoint creates a notification/sends an email for an arbitrary
    // recipient id taken straight from the request body — it must only
    // ever be reachable server-to-server (from psychologist-schedule and
    // auto-decline-appointments, both of which already call it with the
    // service-role key), never by a signed-up user's own token. Without
    // this check, any authenticated user could make the platform send a
    // real email — with attacker-chosen appointment/proposal text — to any
    // other user's real address.
    const authHeader = req.headers.get('Authorization');
    const callerToken = authHeader?.replace('Bearer ', '') ?? '';
    if (callerToken !== Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  const {
    patient_id, 
    psychologist_id, 
    appointment_id, 
    status, 
    psychologist_name,
    appointment_date,
    proposed_date = null,
    proposal_notes = null,
    patient_response = null
  } = await req.json();

  console.log('Sending notification for appointment:', appointment_id, 'status:', status);

  let recipientId, recipientProfile;

  // Determine who should receive the notification
  if (psychologist_id) {
    // Notification for psychologist
    recipientId = psychologist_id;
    
    // Get psychologist data from profiles
    const { data: psychologist, error: psychologistError } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .eq('user_id', psychologist_id)
      .maybeSingle();

    if (psychologistError) {
      console.error('Error fetching psychologist:', psychologistError);
      throw psychologistError;
    }
    
    recipientProfile = psychologist;
  } else {
    // Notification for patient
    recipientId = patient_id;
    
    // Get patient data from profiles
    const { data: patient, error: patientError } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .eq('user_id', patient_id)
      .maybeSingle();

    if (patientError) {
      console.error('Error fetching patient:', patientError);
      throw patientError;
    }
    
    recipientProfile = patient;
  }

  // Get user email from auth.users
  const { data: user, error: userError } = await supabase.auth.admin.getUserById(recipientId);
  
  if (userError) {
    console.error('Error fetching user:', userError);
    throw userError;
  }

  const recipientEmail = user.user.email;

  // HTML-escaped variants for the raw email templates below — psychologist_name
  // and proposal_notes ultimately come from a psychologist's own profile
  // name / free-text reschedule message, neither sanitized upstream.
  const safeRecipientName = escapeHtml(recipientProfile?.full_name);
  const safePsychName = escapeHtml(psychologist_name);
  const safeApptDate = escapeHtml(appointment_date);
  const safeProposedDate = escapeHtml(proposed_date);
  const safeProposalNotes = escapeHtml(proposal_notes);

  let title, message, emailSubject, emailContent;

  if (psychologist_id) {
    // Notifications for psychologist
    switch (status) {
      case 'scheduled':
        title = 'Reagendamento Aceito';
        message = `O paciente aceitou sua proposta de reagendamento para ${proposed_date}.`;
        emailSubject = 'Reagendamento aceito - Soliv';
        emailContent = `
          <h2>Reagendamento Aceito</h2>
          <p>Olá ${safeRecipientName || 'Doutor(a)'},</p>
          <p>O paciente aceitou sua proposta de reagendamento.</p>
          <ul>
            <li><strong>Nova data confirmada:</strong> ${safeProposedDate}</li>
          </ul>
          <p>A consulta está confirmada para o novo horário.</p>
          <p>Atenciosamente,<br>Equipe Soliv</p>
        `;
        break;

      case 'declined':
        title = 'Reagendamento Recusado';
        message = `O paciente recusou sua proposta de reagendamento.`;
        emailSubject = 'Reagendamento recusado - Soliv';
        emailContent = `
          <h2>Reagendamento Recusado</h2>
          <p>Olá ${safeRecipientName || 'Doutor(a)'},</p>
          <p>Infelizmente o paciente recusou sua proposta de reagendamento para ${safeProposedDate}.</p>
          <p>A consulta foi cancelada definitivamente.</p>
          <p>Atenciosamente,<br>Equipe Soliv</p>
        `;
        break;

      default:
        throw new Error('Invalid status for psychologist notification');
    }
  } else {
    // Notifications for patient
    switch (status) {
      case 'scheduled':
        title = 'Consulta Confirmada';
        message = `Sua consulta com ${psychologist_name} foi confirmada para ${appointment_date}.`;
        emailSubject = 'Consulta confirmada - Soliv';
        emailContent = `
          <h2>Consulta Confirmada</h2>
           <p>Olá ${safeRecipientName || 'Paciente'},</p>
          <p>Sua consulta foi confirmada!</p>
          <ul>
            <li><strong>Psicólogo:</strong> ${safePsychName}</li>
            <li><strong>Data:</strong> ${safeApptDate}</li>
          </ul>
          <p>Prepare-se para sua sessão e lembre-se de estar em um ambiente tranquilo.</p>
          <p>Atenciosamente,<br>Equipe Soliv</p>
        `;
        break;

      case 'declined':
        title = 'Consulta Recusada';
        message = `Sua consulta com ${psychologist_name} foi recusada. Você pode agendar com outro profissional.`;
        emailSubject = 'Consulta recusada - Soliv';
        emailContent = `
          <h2>Consulta Recusada</h2>
           <p>Olá ${safeRecipientName || 'Paciente'},</p>
          <p>Infelizmente sua consulta agendada para ${safeApptDate} com ${safePsychName} foi recusada.</p>
          <p>Não se preocupe! Você pode agendar uma nova consulta com outro psicólogo disponível em nossa plataforma.</p>
          <p>Atenciosamente,<br>Equipe Soliv</p>
        `;
        break;

      case 'reschedule_proposed':
        title = 'Nova Proposta de Horário';
        message = `${psychologist_name} sugeriu um novo horário: ${proposed_date}. ${proposal_notes || ''}`;
        emailSubject = 'Nova proposta de horário - Soliv';
        emailContent = `
          <h2>Nova Proposta de Horário</h2>
          <p>Olá ${safeRecipientName || 'Paciente'},</p>
          <p>O psicólogo ${safePsychName} não pôde confirmar sua consulta para ${safeApptDate}, mas sugeriu um novo horário:</p>
          <ul>
            <li><strong>Novo horário proposto:</strong> ${safeProposedDate}</li>
            ${proposal_notes ? `<li><strong>Observações:</strong> ${safeProposalNotes}</li>` : ''}
          </ul>
          <p>Acesse o aplicativo para aceitar ou recusar esta proposta.</p>
          <p>Atenciosamente,<br>Equipe Soliv</p>
        `;
        break;
      
      default:
        throw new Error('Invalid status for patient notification');
    }
  }

  // Create in-app notification. The `patient_id` column is really just
  // "recipient id" — it's reused for a psychologist recipient the same way
  // the chat/achievement notification triggers already do, since the RLS
  // policy on this table only checks that column against auth.uid(),
  // regardless of the recipient's user type.
  const notificationData = {
    appointment_id,
    title,
    message,
    status: 'unread',
    patient_id: recipientId,
    // Também vai para o celular (a função notification-push envia a cada minuto).
    push: true,
    link: psychologist_id ? '/psychologist-dashboard' : '/appointments',
  };

  const { error: notificationError } = await supabase
    .from('notifications')
    .insert(notificationData);

  if (notificationError) {
    console.error('Error creating notification:', notificationError);
    throw notificationError;
  }

  // Send email notification
  const { error: emailError } = await resend.emails.send({
    from: 'Soliv <notifications@soliv.app>',
    to: [recipientEmail],
    subject: emailSubject,
    html: emailContent,
  });

    if (emailError) {
      console.error('Error sending email:', emailError);
      // Don't throw error - notification was created successfully
    }

    console.log('Notification sent successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Notification sent successfully' 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: unknown) {
    console.error('Error in send-appointment-notification:', error);
    return new Response(
      JSON.stringify({ error: errorMessage(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});