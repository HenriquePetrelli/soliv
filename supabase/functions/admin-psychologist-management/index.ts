import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { adminMfaSatisfied } from "../_shared/adminMfa.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface ApproveRequest {
  profileId: string;
}

interface RejectRequest {
  profileId: string;
  reason: string;
}

const generateApprovalEmailTemplate = (psychologistName: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cadastro Aprovado</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Cadastro Aprovado!</h1>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 20px;">
      <h2 style="color: #1a202c; margin: 0 0 20px 0; font-size: 22px;">Olá, ${psychologistName}!</h2>
      
      <p style="color: #4a5568; line-height: 1.6; margin: 0 0 20px 0; font-size: 16px;">
        Temos o prazer de informar que seu cadastro como psicólogo em nossa plataforma foi <strong>aprovado com sucesso</strong>!
      </p>
      
      <p style="color: #4a5568; line-height: 1.6; margin: 0 0 20px 0; font-size: 16px;">
        Agora você pode fazer login na plataforma e começar a utilizar todos os recursos disponíveis para profissionais.
      </p>
      
      <div style="background-color: #f7fafc; border-left: 4px solid #48bb78; padding: 20px; margin: 20px 0; border-radius: 4px;">
        <p style="color: #2d3748; margin: 0; font-size: 16px;">
          <strong>Próximos passos:</strong><br>
          1. Acesse a plataforma com suas credenciais<br>
          2. Complete seu perfil profissional<br>
          3. Comece a atender seus pacientes
        </p>
      </div>
      
      <p style="color: #4a5568; line-height: 1.6; margin: 20px 0; font-size: 16px;">
        Bem-vindo à nossa plataforma! Estamos ansiosos para trabalhar junto com você.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f7fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="color: #718096; margin: 0; font-size: 14px;">
        Equipe da Plataforma de Saúde Mental<br>
        © ${new Date().getFullYear()} - Todos os direitos reservados
      </p>
    </div>
  </div>
</body>
</html>
`;

const generateRejectionEmailTemplate = (psychologistName: string, reason: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Informações sobre seu Cadastro</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Informações sobre seu Cadastro</h1>
    </div>
    
    <!-- Content -->
    <div style="padding: 40px 20px;">
      <h2 style="color: #1a202c; margin: 0 0 20px 0; font-size: 22px;">Olá, ${psychologistName}</h2>
      
      <p style="color: #4a5568; line-height: 1.6; margin: 0 0 20px 0; font-size: 16px;">
        Agradecemos seu interesse em se juntar à nossa plataforma. Após a análise de sua solicitação de cadastro, 
        identificamos alguns pontos que precisam ser revisados.
      </p>
      
      <div style="background-color: #fed7d7; border-left: 4px solid #f56565; padding: 20px; margin: 20px 0; border-radius: 4px;">
        <h3 style="color: #c53030; margin: 0 0 10px 0; font-size: 18px;">Motivo da Não Aprovação:</h3>
        <p style="color: #742a2a; margin: 0; font-size: 16px; white-space: pre-line;">${reason}</p>
      </div>
      
      <p style="color: #4a5568; line-height: 1.6; margin: 20px 0; font-size: 16px;">
        Caso tenha dúvidas sobre os pontos mencionados ou deseje esclarecer alguma informação, 
        entre em contato conosco. Teremos prazer em auxiliá-lo.
      </p>
      
      <p style="color: #4a5568; line-height: 1.6; margin: 20px 0; font-size: 16px;">
        Agradecemos novamente seu interesse e permanecemos à disposição.
      </p>
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f7fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
      <p style="color: #718096; margin: 0; font-size: 14px;">
        Equipe da Plataforma de Saúde Mental<br>
        © ${new Date().getFullYear()} - Todos os direitos reservados
      </p>
    </div>
  </div>
</body>
</html>
`;

const validateInput = (data: Record<string, unknown>, requiredFields: string[]): string | null => {
  for (const field of requiredFields) {
    const value = data[field];
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return `Missing required field: ${field}`;
    }
  }
  return null;
};

const validateUUID = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

const checkAdminPermission = async (req: Request): Promise<{ authorized: boolean; userId?: string }> => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { authorized: false };
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return { authorized: false };
    }

    // Check if user is admin using the secure function. is_admin() was left
    // as a permanent `SELECT false` stub by an old migration and never
    // fixed — every other admin-only function in this codebase already
    // uses is_super_admin(), so this one is switched to match instead of
    // trying to resurrect the broken one.
    const { data: isAdmin, error: adminError } = await supabase
      .rpc('is_super_admin', { user_id_param: user.id });

    // Também exige a verificação em duas etapas (token aal2).
    if (adminError || !isAdmin || !(await adminMfaSatisfied(authHeader))) {
      return { authorized: false };
    }

    return { authorized: true, userId: user.id };
  } catch (error) {
    console.error('Error checking admin permission:', error);
    return { authorized: false };
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();

    // Check admin permission for all operations
    const { authorized } = await checkAdminPermission(req);
    if (!authorized) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Admin access required" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Get pending psychologists
    if (req.method === "GET" && path === "pending") {
      const { data: pendingPsychologists, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_type", "psychologist")
        .eq("registration_status", "pending")
        .order("created_at", { ascending: false });

      if (error) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch pending psychologists" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      return new Response(
        JSON.stringify({ psychologists: pendingPsychologists }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Approve psychologist
    if (req.method === "POST" && path === "approve") {
      let requestData;
      try {
        requestData = await req.json();
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON in request body" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const validationError = validateInput(requestData, ['profileId']);
      if (validationError) {
        return new Response(
          JSON.stringify({ error: validationError }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const { profileId } = requestData;

      if (!validateUUID(profileId)) {
        return new Response(
          JSON.stringify({ error: "Invalid profile ID format" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Get psychologist details
      const { data: psychologist, error: fetchError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", profileId)
        .single();

      if (fetchError || !psychologist) {
        return new Response(
          JSON.stringify({ error: "Psychologist not found" }),
          {
            status: 404,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      // Update status to approved
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ registration_status: "approved" })
        .eq("id", profileId);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: "Failed to approve psychologist" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      // Send approval email
      if (resend && psychologist.professional_email) {
        try {
          await resend.emails.send({
            from: "Plataforma Saúde Mental <onboarding@resend.dev>",
            to: [psychologist.professional_email],
            subject: "Cadastro Aprovado - Bem-vindo à Plataforma!",
            html: generateApprovalEmailTemplate(psychologist.full_name),
          });
        } catch (emailError) {
          console.error("Failed to send approval email:", emailError);
        }
      }

      return new Response(
        JSON.stringify({ message: "Psychologist approved successfully" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Reject psychologist
    if (req.method === "POST" && path === "reject") {
      let requestData;
      try {
        requestData = await req.json();
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid JSON in request body" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const validationError = validateInput(requestData, ['profileId', 'reason']);
      if (validationError) {
        return new Response(
          JSON.stringify({ error: validationError }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const { profileId, reason } = requestData;

      if (!validateUUID(profileId)) {
        return new Response(
          JSON.stringify({ error: "Invalid profile ID format" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (reason.length > 1000) {
        return new Response(
          JSON.stringify({ error: "Reason text is too long (max 1000 characters)" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Get psychologist details
      const { data: psychologist, error: fetchError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", profileId)
        .single();

      if (fetchError || !psychologist) {
        return new Response(
          JSON.stringify({ error: "Psychologist not found" }),
          {
            status: 404,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      // Send rejection email before deleting
      if (resend && psychologist.professional_email) {
        try {
          await resend.emails.send({
            from: "Plataforma Saúde Mental <onboarding@resend.dev>",
            to: [psychologist.professional_email],
            subject: "Informações sobre seu Cadastro",
            html: generateRejectionEmailTemplate(psychologist.full_name, reason),
          });
        } catch (emailError) {
          console.error("Failed to send rejection email:", emailError);
        }
      }

      // Delete the psychologist record
      const { error: deleteError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", profileId);

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: "Failed to reject psychologist" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      return new Response(
        JSON.stringify({ message: "Psychologist rejected successfully" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Get psychologist details
    if (req.method === "GET" && url.searchParams.has("id")) {
      const profileId = url.searchParams.get("id");
      
      const { data: psychologist, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", profileId)
        .single();

      if (error || !psychologist) {
        return new Response(
          JSON.stringify({ error: "Psychologist not found" }),
          {
            status: 404,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      return new Response(
        JSON.stringify({ psychologist }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("Error in admin-psychologist-management function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);