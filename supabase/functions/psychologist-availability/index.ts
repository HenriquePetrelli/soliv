// NÃO USADA: nenhuma tela do app chama esta função. A gestão real de
// disponibilidade semanal do psicólogo (e a leitura pelo paciente ao
// agendar) usa a tabela public.psychologist_availability diretamente
// (SELECT aberto por RLS) e a RPC set_psychologist_availability para
// escrita — ver src/hooks/usePsychologistAvailability.ts e
// src/hooks/useAvailableTimeSlots.ts. Este arquivo ficou órfão e o POST
// abaixo nunca persistiu nada de verdade; mantido apenas por histórico.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { monitored } from "../_shared/monitoring.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AvailabilitySlot {
  date: string;
  time_slots: string[];
  is_available: boolean;
}

Deno.serve(monitored("psychologist-availability", async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'GET') {
      // Get psychologist availability
      const url = new URL(req.url);
      const psychologistId = url.searchParams.get('psychologist_id');
      const startDate = url.searchParams.get('start_date');
      const endDate = url.searchParams.get('end_date');

      if (!psychologistId) {
        return new Response(
          JSON.stringify({ error: 'psychologist_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get existing appointments for the psychologist in the date range
      let query = supabase
        .from('appointments')
        .select('scheduled_at, status')
        .eq('psychologist_id', psychologistId)
        .neq('status', 'cancelled');

      if (startDate) {
        query = query.gte('scheduled_at', startDate);
      }
      if (endDate) {
        query = query.lte('scheduled_at', endDate);
      }

      const { data: appointments, error: appointmentsError } = await query;

      if (appointmentsError) {
        console.error('Error fetching appointments:', appointmentsError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch appointments' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Generate availability slots (next 14 days if no date range specified)
      const start = startDate ? new Date(startDate) : new Date();
      const end = endDate ? new Date(endDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      
      const availability: AvailabilitySlot[] = [];
      const bookedSlots = new Set(appointments?.map(apt => apt.scheduled_at) || []);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const timeSlots = [];
        
        // Generate time slots from 7 AM to 11:50 PM (7-23:50) in 10-minute intervals
        for (let hour = 7; hour < 24; hour++) {
          for (let minute = 0; minute < 60; minute += 10) {
            const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            const fullDateTime = `${dateStr}T${timeSlot}:00`;
            
            if (!bookedSlots.has(fullDateTime)) {
              timeSlots.push(timeSlot);
            }
          }
        }

        availability.push({
          date: dateStr,
          time_slots: timeSlots,
          is_available: timeSlots.length > 0
        });
      }

      return new Response(
        JSON.stringify({ availability }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      // Update psychologist availability (for future implementation)
      const { availability_slots } = await req.json();

      // This would update psychologist's custom availability
      // For now, we'll just return success
      return new Response(
        JSON.stringify({ message: 'Availability updated successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in psychologist-availability function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));