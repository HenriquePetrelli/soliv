import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { monitored } from "../_shared/monitoring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(monitored("initiate-webrtc", async (req) => {
  console.log(`${req.method} request received to initiate-webrtc`);

  if (req.method === "OPTIONS") {
    console.log("CORS preflight request");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    console.log("Environment check:", {
      hasUrl: !!SUPABASE_URL,
      hasServiceKey: !!SUPABASE_SERVICE_ROLE_KEY,
      urlStart: SUPABASE_URL?.substring(0, 20)
    });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing environment variables");
      return new Response(JSON.stringify({ error: "Supabase env not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log all incoming headers for debugging
    console.log("Request headers:", Object.fromEntries(req.headers.entries()));

    // Extract and validate JWT token
    const authHeader = req.headers.get("Authorization") ?? "";
    console.log("Auth header present:", !!authHeader, "Format check:", authHeader.startsWith("Bearer "));
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("Invalid authorization header format");
      return new Response(JSON.stringify({ error: "Token de autenticação ausente ou mal formatado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.split(" ")[1];
    console.log("Token extracted, length:", token?.length);
    
    // Validate token with Supabase Admin client
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    console.log("Validating token with Supabase admin client...");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      console.error("Auth validation failed:", {
        error: authError,
        hasUser: !!user,
        errorMessage: authError?.message,
        errorStatus: authError?.status
      });
      return new Response(JSON.stringify({ error: "Token inválido ou expirado", debug: authError?.message }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Authentication successful for user:", user.id, "Email:", user.email);

    if (req.method !== "POST") {
      console.error("Invalid method:", req.method);
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Safe JSON parsing with detailed validation
    let requestBody;
    let rawBody;
    
    try {
      rawBody = await req.text();
      console.log("Raw request body:", rawBody, "Length:", rawBody.length);
      
      if (!rawBody || rawBody.trim() === '') {
        console.error("Empty request body received");
        return new Response(JSON.stringify({ 
          error: "Corpo da requisição inválido ou ausente",
          code: "EMPTY_BODY",
          details: "Request body is empty or missing. This function requires a valid JSON body with emergency_request_id and user_type."
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      requestBody = JSON.parse(rawBody);
      console.log("Parsed request body:", requestBody);
    } catch (parseError) {
      console.error("JSON parsing failed:", {
        error: parseError.message,
        rawBody: rawBody?.substring(0, 200) + (rawBody?.length > 200 ? '...' : ''),
        contentType: req.headers.get("content-type")
      });
      return new Response(JSON.stringify({ 
        error: "Corpo da requisição inválido ou ausente",
        code: "INVALID_JSON",
        details: `JSON parsing failed: ${parseError.message}. Expected JSON with emergency_request_id and user_type.`
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const { emergency_request_id, user_type } = requestBody;

    // Validate required fields
    if (!emergency_request_id && !user_type) {
      console.error("Both required fields missing");
      return new Response(JSON.stringify({ 
        error: "Campos obrigatórios ausentes: emergency_request_id e user_type",
        code: "MISSING_REQUIRED_FIELDS",
        details: "Both emergency_request_id and user_type are required"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!emergency_request_id) {
      console.error("Missing emergency_request_id");
      return new Response(JSON.stringify({ 
        error: "Campo obrigatório ausente: emergency_request_id",
        code: "MISSING_EMERGENCY_REQUEST_ID",
        details: "emergency_request_id is required"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!user_type) {
      console.error("Missing user_type");
      return new Response(JSON.stringify({ 
        error: "Campo obrigatório ausente: user_type",
        code: "MISSING_USER_TYPE",
        details: "user_type is required"
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate field types and values
    if (typeof emergency_request_id !== 'string' && typeof emergency_request_id !== 'number') {
      console.error("Invalid emergency_request_id type:", typeof emergency_request_id);
      return new Response(JSON.stringify({ 
        error: "emergency_request_id deve ser string ou número",
        code: "INVALID_EMERGENCY_REQUEST_ID_TYPE",
        details: `Expected string or number, got ${typeof emergency_request_id}`
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!['psychologist', 'patient'].includes(user_type)) {
      console.error("Invalid user_type:", user_type);
      return new Response(JSON.stringify({ 
        error: "user_type deve ser 'psychologist' ou 'patient'",
        code: "INVALID_USER_TYPE",
        details: `Expected 'psychologist' or 'patient', got '${user_type}'`
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Validation successful:", { emergency_request_id, user_type });

    // Create client with user's token for RLS
    const supabaseClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: {
        headers: { Authorization: `Bearer ${token}` }
      }
    });

    console.log("Checking emergency request:", emergency_request_id, "for user:", user.id, "type:", user_type);

    // Verify the emergency request exists and user has permission
    // Try with admin client first to get complete data
    const { data: emergencyRequest, error: emergencyError } = await supabaseAdmin
      .from("emergency_requests")
      .select("id, status, patient_id, accepted_by")
      .eq("id", emergency_request_id)
      .single();

    console.log("Emergency request query result:", {
      data: emergencyRequest,
      error: emergencyError,
      errorCode: emergencyError?.code,
      errorMessage: emergencyError?.message
    });

    if (emergencyError || !emergencyRequest) {
      console.error("Emergency request not found:", {
        error: emergencyError,
        requestId: emergency_request_id,
        userId: user.id,
        userType: user_type
      });
      return new Response(JSON.stringify({ 
        error: "Solicitação de emergência não encontrada ou não existe",
        code: "EMERGENCY_REQUEST_NOT_FOUND",
        debug: emergencyError?.message || "Request not found"
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // O tipo vem do cliente: confirma no banco que quem diz ser psicólogo é
    // um psicólogo aprovado (senão um paciente pegaria um SOS pendente).
    if (user_type === "psychologist") {
      const { data: canAttend } = await supabaseAdmin.rpc("psychologist_can_attend", { p_user_id: user.id });
      if (!canAttend) {
        return new Response(JSON.stringify({ error: "Acesso negado" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Verify user has access to this emergency request
    const hasAccess = (user_type === "patient" && emergencyRequest.patient_id === user.id) ||
                     (user_type === "psychologist" && (
                       emergencyRequest.accepted_by === user.id || 
                       (emergencyRequest.status === 'pending' && emergencyRequest.accepted_by === null)
                     ));

    console.log("Access check:", {
      userType: user_type,
      userId: user.id,
      patientId: emergencyRequest.patient_id,
      acceptedBy: emergencyRequest.accepted_by,
      status: emergencyRequest.status,
      hasAccess
    });

    if (!hasAccess) {
      console.error("User does not have access to this emergency request");
      return new Response(JSON.stringify({ error: "Unauthorized access to this emergency request" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for existing WebRTC session
    console.log("Checking for existing WebRTC session...");
    const { data: existingSession, error: existingError } = await supabaseAdmin
      .from("webrtc_sessions")
      .select("*")
      .eq("emergency_request_id", emergency_request_id)
      .single();

    console.log("Existing session check:", {
      found: !!existingSession,
      error: existingError,
      sessionId: existingSession?.id
    });

    if (existingSession) {
      console.log("Returning existing session:", existingSession.id);
      return new Response(JSON.stringify({
        success: true,
        session_id: existingSession.id,
        stun_servers: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"]
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create new WebRTC session with extended expiration
    const sessionData: {
      emergency_request_id: string;
      status: string;
      expires_at: string;
      patient_id?: string;
      psychologist_id?: string;
    } = {
      emergency_request_id,
      status: "pending",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours from now
    };

    if (user_type === "psychologist") {
      sessionData.psychologist_id = user.id;
      sessionData.patient_id = emergencyRequest.patient_id; // Include patient_id for psychologists
    } else {
      sessionData.patient_id = user.id;
      // For patients, try to get psychologist_id if already accepted
      if (emergencyRequest.accepted_by) {
        sessionData.psychologist_id = emergencyRequest.accepted_by;
      }
    }

    console.log("Creating new WebRTC session with data:", sessionData);

    // Use admin client for session creation to avoid RLS issues
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("webrtc_sessions")
      .insert(sessionData)
      .select()
      .single();

    console.log("Session creation result:", {
      success: !!session,
      error: sessionError,
      sessionId: session?.id,
      errorCode: sessionError?.code,
      errorMessage: sessionError?.message
    });

    if (sessionError) {
      console.error("Failed to create WebRTC session:", {
        error: sessionError,
        sessionData,
        emergencyRequest
      });
      return new Response(JSON.stringify({ 
        error: "Falha ao criar sessão de vídeo", 
        code: "SESSION_CREATION_FAILED",
        details: sessionError.message
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("WebRTC session successfully created:", session.id, "for user:", user.id);

    return new Response(JSON.stringify({
      success: true,
      session_id: session.id,
      stun_servers: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"]
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Unexpected error in initiate-webrtc:", {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    return new Response(JSON.stringify({ 
      error: "Erro interno no servidor", 
      details: error.message,
      type: error.name 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}));