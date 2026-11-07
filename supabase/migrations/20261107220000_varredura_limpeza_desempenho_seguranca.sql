-- Varredura do Supabase (2026-11-07): limpeza, desempenho e segurança.
--
-- 1. Limpeza: funções sem uso (nem app, edge functions, rotinas, gatilhos,
--    políticas ou outras funções) e a tabela default_weekly_goals (sem uso).
-- 2. Índices: chaves estrangeiras sem índice, subscribers por user_id e
--    stripe_customer_id; índices duplicados removidos (as gravações ficam
--    mais leves).
-- 3. Políticas (RLS): só para quem está logado (antes "public", que inclui
--    visitante sem login), exceto estados, cidades e sintomas (cadastro);
--    auth.uid() e is_super_admin() calculados uma vez por consulta, não por
--    linha; políticas da mesma tabela e ação unificadas (mesma regra).
-- 4. Permissões: visitante sem login (anon) sem acesso a tabelas e funções,
--    exceto o necessário para o cadastro; funções internas e de gatilho
--    fechadas para o app.
-- 5. Lembretes de hábitos: validação do fuso sem varrer pg_timezone_names
--    (183 ms por chamada).

-- ===========================================================================
-- 1. Limpeza
-- ===========================================================================
DROP FUNCTION IF EXISTS public.sync_consultation_counts();
DROP FUNCTION IF EXISTS public.can_access_document(text,text);
DROP FUNCTION IF EXISTS public.can_upload_document(text,text);
DROP FUNCTION IF EXISTS public.cleanup_rejected_psychologist(uuid);
DROP FUNCTION IF EXISTS public.get_patient_statistics(uuid);
DROP FUNCTION IF EXISTS public.reset_patient_weekly_goals_array();
DROP FUNCTION IF EXISTS public.validate_route_access(uuid,text);
DROP FUNCTION IF EXISTS public.get_psychologist_document_url(text);
DROP FUNCTION IF EXISTS public.validate_cpf(text);
DROP FUNCTION IF EXISTS public.validate_crp(text);
DROP FUNCTION IF EXISTS public.calculate_psychologist_average_rating(uuid);
DROP FUNCTION IF EXISTS public.update_weekly_goals_updated_at();
DROP TABLE IF EXISTS public.default_weekly_goals;

-- ===========================================================================
-- 2. Índices
-- ===========================================================================
CREATE INDEX IF NOT EXISTS admin_audit_log_admin_id_idx ON public.admin_audit_log (admin_id);
CREATE INDEX IF NOT EXISTS admin_users_granted_by_idx ON public.admin_users (granted_by);
CREATE INDEX IF NOT EXISTS appointment_problem_reports_appointment_id_idx ON public.appointment_problem_reports (appointment_id);
CREATE INDEX IF NOT EXISTS appointments_extra_credit_id_idx ON public.appointments (extra_credit_id);
CREATE INDEX IF NOT EXISTS emergency_requests_extra_credit_id_idx ON public.emergency_requests (extra_credit_id);
CREATE INDEX IF NOT EXISTS group_favorites_group_id_idx ON public.group_favorites (group_id);
CREATE INDEX IF NOT EXISTS group_testimonials_sintoma_id_idx ON public.group_testimonials (sintoma_id);
CREATE INDEX IF NOT EXISTS notifications_appointment_id_idx ON public.notifications (appointment_id);
CREATE INDEX IF NOT EXISTS patient_weekly_goals_goal_id_idx ON public.patient_weekly_goals (goal_id);
CREATE INDEX IF NOT EXISTS payment_logs_psychologist_id_idx ON public.payment_logs (psychologist_id);
CREATE INDEX IF NOT EXISTS psychologist_presence_current_emergency_id_idx ON public.psychologist_presence (current_emergency_id);
CREATE INDEX IF NOT EXISTS psychologists_reviewed_by_idx ON public.psychologists (reviewed_by);
CREATE INDEX IF NOT EXISTS safety_plan_suggestions_psychologist_id_idx ON public.safety_plan_suggestions (psychologist_id);
CREATE INDEX IF NOT EXISTS safety_plan_suggestions_saved_plan_id_idx ON public.safety_plan_suggestions (saved_plan_id);
CREATE INDEX IF NOT EXISTS sos_trace_events_session_id_idx ON public.sos_trace_events (session_id);
CREATE INDEX IF NOT EXISTS subscribers_organization_id_idx ON public.subscribers (organization_id);
CREATE INDEX IF NOT EXISTS subscribers_user_id_idx ON public.subscribers (user_id);
CREATE INDEX IF NOT EXISTS suporte_psicologo_psicologo_id_idx ON public.suporte_psicologo (psicologo_id);
CREATE INDEX IF NOT EXISTS support_tickets_user_id_idx ON public.support_tickets (user_id);
CREATE INDEX IF NOT EXISTS subscribers_stripe_customer_id_idx ON public.subscribers (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS extra_credits_appointment_id_idx ON public.extra_credits (appointment_id) WHERE appointment_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_psychologist_presence_unique;
DROP INDEX IF EXISTS public.idx_patients_email;
DROP INDEX IF EXISTS public.idx_patients_cpf;
DROP INDEX IF EXISTS public.idx_patients_user_id;
DROP INDEX IF EXISTS public.idx_psychologists_email;
DROP INDEX IF EXISTS public.idx_psychologists_crp_unique;
DROP INDEX IF EXISTS public.idx_psychologists_user_id;
DROP INDEX IF EXISTS public.mental_health_screenings_user_created_idx;
DROP INDEX IF EXISTS public.session_feedback_session_user_unique;
DROP INDEX IF EXISTS public.idx_patient_mood_logs_patient_date;

-- ===========================================================================
-- 3. Políticas (RLS)
-- ===========================================================================
DROP POLICY "Deny public access to payments" ON public."psychologist_payments";
DROP POLICY "Only admins can view the audit log" ON public."admin_audit_log";
CREATE POLICY "Only admins can view the audit log" ON public."admin_audit_log" AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin((SELECT auth.uid())));
DROP POLICY "Super admins can delete admin_users" ON public."admin_users";
CREATE POLICY "Super admins can delete admin_users" ON public."admin_users" AS PERMISSIVE FOR DELETE TO authenticated
  USING ((SELECT public.is_super_admin()));
DROP POLICY "Super admins can insert admin_users" ON public."admin_users";
CREATE POLICY "Super admins can insert admin_users" ON public."admin_users" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_super_admin()));
DROP POLICY "Only super admins can view admin_users" ON public."admin_users";
CREATE POLICY "Only super admins can view admin_users" ON public."admin_users" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM admin_users a
  WHERE ((a.user_id = (SELECT auth.uid())) AND (a.is_active = true))))));
DROP POLICY "Super admins can update admin_users" ON public."admin_users";
CREATE POLICY "Super admins can update admin_users" ON public."admin_users" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));
DROP POLICY "Psychologist deletes own private notes" ON public."appointment_private_notes";
CREATE POLICY "Psychologist deletes own private notes" ON public."appointment_private_notes" AS PERMISSIVE FOR DELETE TO authenticated
  USING ((psychologist_id = (SELECT auth.uid())));
DROP POLICY "Psychologist writes own private notes" ON public."appointment_private_notes";
CREATE POLICY "Psychologist writes own private notes" ON public."appointment_private_notes" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((psychologist_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM appointments a
  WHERE ((a.id = appointment_private_notes.appointment_id) AND (a.psychologist_id = (SELECT auth.uid())))))));
DROP POLICY "Psychologist reads own private notes" ON public."appointment_private_notes";
CREATE POLICY "Psychologist reads own private notes" ON public."appointment_private_notes" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((psychologist_id = (SELECT auth.uid())));
DROP POLICY "Psychologist updates own private notes" ON public."appointment_private_notes";
CREATE POLICY "Psychologist updates own private notes" ON public."appointment_private_notes" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((psychologist_id = (SELECT auth.uid())))
  WITH CHECK ((psychologist_id = (SELECT auth.uid())));
DROP POLICY "Participantes veem os relatos da consulta" ON public."appointment_problem_reports";
CREATE POLICY "Participantes veem os relatos da consulta" ON public."appointment_problem_reports" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM appointments a
  WHERE ((a.id = appointment_problem_reports.appointment_id) AND (((SELECT auth.uid()) = a.patient_id) OR ((SELECT auth.uid()) = a.psychologist_id))))) OR (SELECT public.is_super_admin())));
DROP POLICY "Lembretes enviados são internos do sistema" ON public."appointment_reminders_sent";
CREATE POLICY "Lembretes enviados são internos do sistema" ON public."appointment_reminders_sent" AS PERMISSIVE FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);
DROP POLICY "Patients can view their own appointments" ON public."appointments";
DROP POLICY "Psychologists can view their appointments" ON public."appointments";
DROP POLICY "Super admins can view all appointments" ON public."appointments";
-- Unifica: Patients can view their own appointments; Psychologists can view their appointments; Super admins can view all appointments
CREATE POLICY "appointments: select (3 regras unificadas)" ON public."appointments" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((patient_id = (SELECT auth.uid()))) OR ((psychologist_id = (SELECT auth.uid()))) OR ((SELECT public.is_super_admin())));
DROP POLICY "Patients can update their own appointments" ON public."appointments";
DROP POLICY "Psychologists can update their appointments" ON public."appointments";
-- Unifica: Patients can update their own appointments; Psychologists can update their appointments
CREATE POLICY "appointments: update (2 regras unificadas)" ON public."appointments" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((patient_id = (SELECT auth.uid()))) OR ((psychologist_id = (SELECT auth.uid()))));
DROP POLICY "Admins read archived payouts" ON public."archived_psychologist_payouts";
CREATE POLICY "Admins read archived payouts" ON public."archived_psychologist_payouts" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin()));
DROP POLICY "Enable read access for everyone on brazilian_cities" ON public."brazilian_cities";
CREATE POLICY "Enable read access for everyone on brazilian_cities" ON public."brazilian_cities" AS PERMISSIVE FOR SELECT TO public
  USING (true);
DROP POLICY "Enable read access for everyone on brazilian_states" ON public."brazilian_states";
CREATE POLICY "Enable read access for everyone on brazilian_states" ON public."brazilian_states" AS PERMISSIVE FOR SELECT TO public
  USING (true);
DROP POLICY "Psychologists read their own archived care records" ON public."care_record_archive";
CREATE POLICY "Psychologists read their own archived care records" ON public."care_record_archive" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((psychologist_id = (SELECT auth.uid())));
DROP POLICY "Pacientes podem criar conversas" ON public."conversas";
CREATE POLICY "Pacientes podem criar conversas" ON public."conversas" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((paciente_id = (SELECT auth.uid())) AND (status = 'ativa'::text) AND pode_criar_conversa((SELECT auth.uid()), psicologo_id)));
DROP POLICY "Pacientes podem ver suas conversas" ON public."conversas";
DROP POLICY "Psicólogos podem ver suas conversas" ON public."conversas";
-- Unifica: Pacientes podem ver suas conversas; Psicólogos podem ver suas conversas
CREATE POLICY "conversas: select (2 regras unificadas)" ON public."conversas" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((paciente_id = (SELECT auth.uid()))) OR ((psicologo_id = (SELECT auth.uid()))));
DROP POLICY "Pacientes podem atualizar suas conversas" ON public."conversas";
DROP POLICY "Psicólogos podem atualizar suas conversas" ON public."conversas";
-- Unifica: Pacientes podem atualizar suas conversas; Psicólogos podem atualizar suas conversas
CREATE POLICY "conversas: update (2 regras unificadas)" ON public."conversas" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((paciente_id = (SELECT auth.uid()))) OR ((psicologo_id = (SELECT auth.uid()))));
DROP POLICY "Patients manage their own emergency contacts" ON public."emergency_contacts";
CREATE POLICY "Patients manage their own emergency contacts" ON public."emergency_contacts" AS PERMISSIVE FOR ALL TO authenticated
  USING (((SELECT auth.uid()) = patient_id))
  WITH CHECK ((((SELECT auth.uid()) = patient_id) AND (EXISTS ( SELECT 1
   FROM safety_plans sp
  WHERE ((sp.id = emergency_contacts.plan_id) AND (sp.patient_id = (SELECT auth.uid())))))));
DROP POLICY "Patients can view their own emergency requests" ON public."emergency_requests";
DROP POLICY "Psychologists can view open or own emergency requests" ON public."emergency_requests";
DROP POLICY "Super admins can view all emergency requests" ON public."emergency_requests";
-- Unifica: Patients can view their own emergency requests; Psychologists can view open or own emergency requests; Super admins can view all emergency requests
CREATE POLICY "emergency_requests: select (3 regras unificadas)" ON public."emergency_requests" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((patient_id = (SELECT auth.uid()))) OR (((accepted_by = (SELECT auth.uid())) OR ((status = 'pending'::text) AND (accepted_by IS NULL) AND psychologist_can_attend((SELECT auth.uid()))))) OR ((SELECT public.is_super_admin())));
DROP POLICY "Patients can update their own emergency requests" ON public."emergency_requests";
DROP POLICY "Psychologists can update open or own emergency requests" ON public."emergency_requests";
DROP POLICY "Super admins can manage all emergency requests" ON public."emergency_requests";
-- Unifica: Patients can update their own emergency requests; Psychologists can update open or own emergency requests; Super admins can manage all emergency requests
CREATE POLICY "emergency_requests: update (3 regras unificadas)" ON public."emergency_requests" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((patient_id = (SELECT auth.uid()))) OR ((psychologist_can_attend((SELECT auth.uid())) AND ((accepted_by = (SELECT auth.uid())) OR ((status = 'pending'::text) AND (accepted_by IS NULL))))) OR ((SELECT public.is_super_admin())))
  WITH CHECK (((patient_id = (SELECT auth.uid()))) OR (((accepted_by = (SELECT auth.uid())) OR (accepted_by IS NULL))) OR ((SELECT public.is_super_admin())));
DROP POLICY "Paciente vê os próprios avulsos" ON public."extra_credits";
CREATE POLICY "Paciente vê os próprios avulsos" ON public."extra_credits" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = (SELECT auth.uid())) OR (SELECT public.is_super_admin())));
DROP POLICY "Users can delete their own FCM tokens" ON public."fcm_tokens";
CREATE POLICY "Users can delete their own FCM tokens" ON public."fcm_tokens" AS PERMISSIVE FOR DELETE TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Users can insert their own FCM tokens" ON public."fcm_tokens";
CREATE POLICY "Users can insert their own FCM tokens" ON public."fcm_tokens" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Users can view their own FCM tokens" ON public."fcm_tokens";
CREATE POLICY "Users can view their own FCM tokens" ON public."fcm_tokens" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Users can update their own FCM tokens" ON public."fcm_tokens";
CREATE POLICY "Users can update their own FCM tokens" ON public."fcm_tokens" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Usuários podem deletar seus próprios favoritos" ON public."group_favorites";
CREATE POLICY "Usuários podem deletar seus próprios favoritos" ON public."group_favorites" AS PERMISSIVE FOR DELETE TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Usuários podem criar seus próprios favoritos" ON public."group_favorites";
CREATE POLICY "Usuários podem criar seus próprios favoritos" ON public."group_favorites" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Usuários podem visualizar seus próprios favoritos" ON public."group_favorites";
CREATE POLICY "Usuários podem visualizar seus próprios favoritos" ON public."group_favorites" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Usuários podem deletar seus próprios likes" ON public."group_testimonial_likes";
CREATE POLICY "Usuários podem deletar seus próprios likes" ON public."group_testimonial_likes" AS PERMISSIVE FOR DELETE TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Usuários podem criar seus próprios likes" ON public."group_testimonial_likes";
CREATE POLICY "Usuários podem criar seus próprios likes" ON public."group_testimonial_likes" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Usuários veem só as próprias curtidas" ON public."group_testimonial_likes";
CREATE POLICY "Usuários veem só as próprias curtidas" ON public."group_testimonial_likes" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((SELECT auth.uid()) = user_id) OR (SELECT public.is_super_admin())));
DROP POLICY "Usuários podem trocar a própria curtida" ON public."group_testimonial_likes";
CREATE POLICY "Usuários podem trocar a própria curtida" ON public."group_testimonial_likes" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Admins can view testimonial reports" ON public."group_testimonial_reports";
CREATE POLICY "Admins can view testimonial reports" ON public."group_testimonial_reports" AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_super_admin((SELECT auth.uid())));
DROP POLICY "Usuários podem deletar seus próprios depoimentos" ON public."group_testimonials";
CREATE POLICY "Usuários podem deletar seus próprios depoimentos" ON public."group_testimonials" AS PERMISSIVE FOR DELETE TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Usuários podem criar seus próprios depoimentos" ON public."group_testimonials";
CREATE POLICY "Usuários podem criar seus próprios depoimentos" ON public."group_testimonials" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Authors can view their own testimonials" ON public."group_testimonials";
CREATE POLICY "Authors can view their own testimonials" ON public."group_testimonials" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Usuários podem editar seus próprios depoimentos" ON public."group_testimonials";
CREATE POLICY "Usuários podem editar seus próprios depoimentos" ON public."group_testimonials" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Users manage their own habit events" ON public."habit_events";
CREATE POLICY "Users manage their own habit events" ON public."habit_events" AS PERMISSIVE FOR ALL TO authenticated
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK ((((SELECT auth.uid()) = user_id) AND (EXISTS ( SELECT 1
   FROM user_habits h
  WHERE ((h.id = habit_events.habit_id) AND (h.user_id = (SELECT auth.uid())))))));
DROP POLICY "Users record their own legal acceptances" ON public."legal_acceptances";
CREATE POLICY "Users record their own legal acceptances" ON public."legal_acceptances" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((((SELECT auth.uid()) = user_id) AND (accepted_at <= (now() + '00:01:00'::interval))));
DROP POLICY "Admins read legal acceptances" ON public."legal_acceptances";
DROP POLICY "Users read their own legal acceptances" ON public."legal_acceptances";
-- Unifica: Admins read legal acceptances; Users read their own legal acceptances
CREATE POLICY "legal_acceptances: select (2 regras unificadas)" ON public."legal_acceptances" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT public.is_super_admin())) OR (((SELECT auth.uid()) = user_id)));
DROP POLICY "Usuários podem criar mensagens nas suas conversas" ON public."mensagens";
CREATE POLICY "Usuários podem criar mensagens nas suas conversas" ON public."mensagens" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((autor_id = (SELECT auth.uid())) AND (EXISTS ( SELECT 1
   FROM conversas c
  WHERE ((c.id = mensagens.conversa_id) AND ((c.paciente_id = (SELECT auth.uid())) OR (c.psicologo_id = (SELECT auth.uid()))) AND (c.status = 'ativa'::text))))));
DROP POLICY "Usuários podem ver mensagens das suas conversas" ON public."mensagens";
CREATE POLICY "Usuários podem ver mensagens das suas conversas" ON public."mensagens" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM conversas c
  WHERE ((c.id = mensagens.conversa_id) AND ((c.paciente_id = (SELECT auth.uid())) OR (c.psicologo_id = (SELECT auth.uid())))))));
DROP POLICY "Patients manage their own screenings" ON public."mental_health_screenings";
CREATE POLICY "Patients manage their own screenings" ON public."mental_health_screenings" AS PERMISSIVE FOR ALL TO authenticated
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Psychologists view shared screenings of their patients" ON public."mental_health_screenings";
CREATE POLICY "Psychologists view shared screenings of their patients" ON public."mental_health_screenings" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((shared_with_psychologist AND (EXISTS ( SELECT 1
   FROM appointments a
  WHERE ((a.patient_id = mental_health_screenings.user_id) AND (a.psychologist_id = (SELECT auth.uid())) AND (a.status = ANY (ARRAY['scheduled'::text, 'confirmed'::text, 'in_progress'::text, 'completed'::text])))))));
DROP POLICY "Users can create their own notification logs" ON public."notification_logs";
CREATE POLICY "Users can create their own notification logs" ON public."notification_logs" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Users can view their own notification logs" ON public."notification_logs";
CREATE POLICY "Users can view their own notification logs" ON public."notification_logs" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Patients can delete their own notifications" ON public."notifications";
CREATE POLICY "Patients can delete their own notifications" ON public."notifications" AS PERMISSIVE FOR DELETE TO authenticated
  USING ((patient_id = (SELECT auth.uid())));
DROP POLICY "Patients can view their own notifications" ON public."notifications";
CREATE POLICY "Patients can view their own notifications" ON public."notifications" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((patient_id = (SELECT auth.uid())));
DROP POLICY "Patients can update their own notifications" ON public."notifications";
CREATE POLICY "Patients can update their own notifications" ON public."notifications" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((patient_id = (SELECT auth.uid())));
DROP POLICY "Admins manage organization members" ON public."organization_members";
CREATE POLICY "Admins manage organization members" ON public."organization_members" AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));
DROP POLICY "Users read their own memberships" ON public."organization_members";
CREATE POLICY "Users read their own memberships" ON public."organization_members" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = (SELECT auth.uid())));
DROP POLICY "Admins manage organizations" ON public."organizations";
CREATE POLICY "Admins manage organizations" ON public."organizations" AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));
DROP POLICY "Users insert their own presence" ON public."participant_presence";
CREATE POLICY "Users insert their own presence" ON public."participant_presence" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Session participants can view presence" ON public."participant_presence";
DROP POLICY "Users view their own presence" ON public."participant_presence";
-- Unifica: Session participants can view presence; Users view their own presence
CREATE POLICY "participant_presence: select (2 regras unificadas)" ON public."participant_presence" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((EXISTS ( SELECT 1
   FROM webrtc_sessions ws
  WHERE ((ws.id = participant_presence.session_id) AND ((ws.patient_id = (SELECT auth.uid())) OR (ws.psychologist_id = (SELECT auth.uid()))))))) OR (((SELECT auth.uid()) = user_id)));
DROP POLICY "Users update their own presence" ON public."participant_presence";
CREATE POLICY "Users update their own presence" ON public."participant_presence" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Users can insert their own achievements" ON public."patient_achievements";
CREATE POLICY "Users can insert their own achievements" ON public."patient_achievements" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Users can view their own achievements" ON public."patient_achievements";
CREATE POLICY "Users can view their own achievements" ON public."patient_achievements" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Users can update their own achievements" ON public."patient_achievements";
CREATE POLICY "Users can update their own achievements" ON public."patient_achievements" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Patients can view their own mood logs" ON public."patient_mood_logs";
CREATE POLICY "Patients can view their own mood logs" ON public."patient_mood_logs" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT auth.uid()) = patient_id));
DROP POLICY "Patients can create their own progress" ON public."patient_progress";
CREATE POLICY "Patients can create their own progress" ON public."patient_progress" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((patient_id = (SELECT auth.uid())));
DROP POLICY "Patients can view their own progress" ON public."patient_progress";
CREATE POLICY "Patients can view their own progress" ON public."patient_progress" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((patient_id = (SELECT auth.uid())));
DROP POLICY "Patients can update their own progress" ON public."patient_progress";
CREATE POLICY "Patients can update their own progress" ON public."patient_progress" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((patient_id = (SELECT auth.uid())));
DROP POLICY "Patients can view their own statistics" ON public."patient_statistics";
CREATE POLICY "Patients can view their own statistics" ON public."patient_statistics" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT auth.uid()) = patient_id));
DROP POLICY "Users can view their own weekly goals" ON public."patient_weekly_goals";
CREATE POLICY "Users can view their own weekly goals" ON public."patient_weekly_goals" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Admins can delete patients" ON public."patients";
CREATE POLICY "Admins can delete patients" ON public."patients" AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_super_admin((SELECT auth.uid())));
DROP POLICY "Users can insert their own patient data" ON public."patients";
CREATE POLICY "Users can insert their own patient data" ON public."patients" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Admins can view all patients" ON public."patients";
DROP POLICY "Super admins can view all patients" ON public."patients";
DROP POLICY "Users can view their own patient data" ON public."patients";
-- Unifica: Admins can view all patients; Super admins can view all patients; Users can view their own patient data
CREATE POLICY "patients: select (3 regras unificadas)" ON public."patients" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_super_admin((SELECT auth.uid()))) OR ((SELECT public.is_super_admin())) OR (((SELECT auth.uid()) = user_id)));
DROP POLICY "Admins can update all patients" ON public."patients";
DROP POLICY "Users can update their own patient data" ON public."patients";
-- Unifica: Admins can update all patients; Users can update their own patient data
CREATE POLICY "patients: update (2 regras unificadas)" ON public."patients" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((is_super_admin((SELECT auth.uid()))) OR (((SELECT auth.uid()) = user_id)))
  WITH CHECK ((is_super_admin((SELECT auth.uid()))) OR (((SELECT auth.uid()) = user_id)));
DROP POLICY "Super admins can manage all payment logs" ON public."payment_logs";
CREATE POLICY "Super admins can manage all payment logs" ON public."payment_logs" AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));
DROP POLICY "Psychologists view their own payment logs" ON public."payment_logs";
CREATE POLICY "Psychologists view their own payment logs" ON public."payment_logs" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((psychologist_id IN ( SELECT p.id
   FROM psychologists p
  WHERE (p.user_id = (SELECT auth.uid())))));
DROP POLICY "Admins veem os itens de repasse" ON public."payout_items";
CREATE POLICY "Admins veem os itens de repasse" ON public."payout_items" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin()));
DROP POLICY "Usuários podem deletar suas próprias entradas" ON public."private_journals";
CREATE POLICY "Usuários podem deletar suas próprias entradas" ON public."private_journals" AS PERMISSIVE FOR DELETE TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Usuários podem criar suas próprias entradas" ON public."private_journals";
CREATE POLICY "Usuários podem criar suas próprias entradas" ON public."private_journals" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Usuários podem ver suas próprias entradas" ON public."private_journals";
CREATE POLICY "Usuários podem ver suas próprias entradas" ON public."private_journals" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Usuários podem editar suas próprias entradas" ON public."private_journals";
CREATE POLICY "Usuários podem editar suas próprias entradas" ON public."private_journals" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Users can insert their own profile" ON public."profiles";
CREATE POLICY "Users can insert their own profile" ON public."profiles" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Users can view their own profile" ON public."profiles";
CREATE POLICY "Users can view their own profile" ON public."profiles" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((SELECT auth.uid()) = user_id) OR ((SELECT public.is_super_admin()) AND (user_type = ANY (ARRAY['patient'::user_type, 'psychologist'::user_type])))));
DROP POLICY "Users can update their own profile (restricted)" ON public."profiles";
CREATE POLICY "Users can update their own profile (restricted)" ON public."profiles" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK ((((SELECT auth.uid()) = user_id) AND (user_type = ( SELECT profiles_1.user_type
   FROM profiles profiles_1
  WHERE (profiles_1.user_id = (SELECT auth.uid()))))));
DROP POLICY "Psychologists can manage their own availability" ON public."psychologist_availability";
CREATE POLICY "Psychologists can manage their own availability" ON public."psychologist_availability" AS PERMISSIVE FOR ALL TO authenticated
  USING ((psychologist_id = (SELECT auth.uid())));
DROP POLICY "Everyone can view psychologist availability" ON public."psychologist_availability";
CREATE POLICY "Everyone can view psychologist availability" ON public."psychologist_availability" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY "Psychologists can manage their own availability overrides" ON public."psychologist_availability_overrides";
CREATE POLICY "Psychologists can manage their own availability overrides" ON public."psychologist_availability_overrides" AS PERMISSIVE FOR ALL TO authenticated
  USING ((psychologist_id = (SELECT auth.uid())))
  WITH CHECK ((psychologist_id = (SELECT auth.uid())));
DROP POLICY "Everyone can view availability overrides" ON public."psychologist_availability_overrides";
CREATE POLICY "Everyone can view availability overrides" ON public."psychologist_availability_overrides" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY "Psychologists insert their own booking rules" ON public."psychologist_booking_rules";
CREATE POLICY "Psychologists insert their own booking rules" ON public."psychologist_booking_rules" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = psychologist_id));
DROP POLICY "Authenticated users can read booking rules" ON public."psychologist_booking_rules";
CREATE POLICY "Authenticated users can read booking rules" ON public."psychologist_booking_rules" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY "Psychologists update their own booking rules" ON public."psychologist_booking_rules";
CREATE POLICY "Psychologists update their own booking rules" ON public."psychologist_booking_rules" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((SELECT auth.uid()) = psychologist_id))
  WITH CHECK (((SELECT auth.uid()) = psychologist_id));
DROP POLICY "Super admins can manage all payments" ON public."psychologist_payments";
CREATE POLICY "Super admins can manage all payments" ON public."psychologist_payments" AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin()))
  WITH CHECK ((SELECT public.is_super_admin()));
DROP POLICY "Psychologists can view their own payments" ON public."psychologist_payments";
CREATE POLICY "Psychologists can view their own payments" ON public."psychologist_payments" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((psychologist_id IN ( SELECT psychologists.id
   FROM psychologists
  WHERE (psychologists.user_id = (SELECT auth.uid())))));
DROP POLICY "Psychologists can manage their own presence" ON public."psychologist_presence";
CREATE POLICY "Psychologists can manage their own presence" ON public."psychologist_presence" AS PERMISSIVE FOR ALL TO authenticated
  USING ((psychologist_id = (SELECT auth.uid())));
DROP POLICY "Psychologists can insert their own presence" ON public."psychologist_presence";
CREATE POLICY "Psychologists can insert their own presence" ON public."psychologist_presence" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((psychologist_id = (SELECT auth.uid())));
DROP POLICY "Authenticated users can view psychologist presence" ON public."psychologist_presence";
DROP POLICY "Psychologists can select their own presence" ON public."psychologist_presence";
-- Unifica: Authenticated users can view psychologist presence; Psychologists can select their own presence
CREATE POLICY "psychologist_presence: select (2 regras unificadas)" ON public."psychologist_presence" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((true) OR ((psychologist_id = (SELECT auth.uid()))));
DROP POLICY "Psychologists can update their own presence" ON public."psychologist_presence";
CREATE POLICY "Psychologists can update their own presence" ON public."psychologist_presence" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((psychologist_id = (SELECT auth.uid())));
DROP POLICY "Users can create their own registration" ON public."psychologist_registrations";
CREATE POLICY "Users can create their own registration" ON public."psychologist_registrations" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Super admins can view all registrations" ON public."psychologist_registrations";
DROP POLICY "Users can view their own registration" ON public."psychologist_registrations";
-- Unifica: Super admins can view all registrations; Users can view their own registration
CREATE POLICY "psychologist_registrations: select (2 regras unificadas)" ON public."psychologist_registrations" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT public.is_super_admin())) OR (((SELECT auth.uid()) = user_id)));
DROP POLICY "Super admins can update all registrations" ON public."psychologist_registrations";
CREATE POLICY "Super admins can update all registrations" ON public."psychologist_registrations" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin()));
DROP POLICY "Psychologists can manage their own vacations" ON public."psychologist_vacations";
CREATE POLICY "Psychologists can manage their own vacations" ON public."psychologist_vacations" AS PERMISSIVE FOR ALL TO authenticated
  USING ((psychologist_id = (SELECT auth.uid())))
  WITH CHECK ((psychologist_id = (SELECT auth.uid())));
DROP POLICY "Everyone can view vacations" ON public."psychologist_vacations";
CREATE POLICY "Everyone can view vacations" ON public."psychologist_vacations" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY "Allow psychologist registration" ON public."psychologists";
CREATE POLICY "Allow psychologist registration" ON public."psychologists" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Approved psychologists are visible to all authenticated users" ON public."psychologists";
DROP POLICY "Enable admin access to all psychologists" ON public."psychologists";
DROP POLICY "Enable read access for own profile" ON public."psychologists";
-- Unifica: Approved psychologists are visible to all authenticated users; Enable admin access to all psychologists; Enable read access for own profile
CREATE POLICY "psychologists: select (3 regras unificadas)" ON public."psychologists" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((approved = true) AND (approval_status = 'approved'::text) AND ((SELECT auth.role()) = 'authenticated'::text))) OR ((SELECT public.is_super_admin())) OR ((user_id = (SELECT auth.uid()))));
DROP POLICY "Enable admin update access" ON public."psychologists";
DROP POLICY "Users can update their own psychologist profile" ON public."psychologists";
-- Unifica: Enable admin update access; Users can update their own psychologist profile
CREATE POLICY "psychologists: update (2 regras unificadas)" ON public."psychologists" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((SELECT public.is_super_admin())) OR (((SELECT auth.uid()) = user_id)));
DROP POLICY "Patients view delivered suggestions" ON public."safety_plan_suggestions";
CREATE POLICY "Patients view delivered suggestions" ON public."safety_plan_suggestions" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((patient_id = (SELECT auth.uid())) AND (status <> 'draft'::text)));
DROP POLICY "Patients manage their own safety plan" ON public."safety_plans";
CREATE POLICY "Patients manage their own safety plan" ON public."safety_plans" AS PERMISSIVE FOR ALL TO authenticated
  USING (((SELECT auth.uid()) = patient_id))
  WITH CHECK (((SELECT auth.uid()) = patient_id));
DROP POLICY "Only super admins can view security audit log" ON public."security_audit_log";
CREATE POLICY "Only super admins can view security audit log" ON public."security_audit_log" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin()));
DROP POLICY "Users can create their own feedback" ON public."session_feedback";
CREATE POLICY "Users can create their own feedback" ON public."session_feedback" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Super admins can view all feedback" ON public."session_feedback";
DROP POLICY "Users can view their own feedback" ON public."session_feedback";
-- Unifica: Super admins can view all feedback; Users can view their own feedback
CREATE POLICY "session_feedback: select (2 regras unificadas)" ON public."session_feedback" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT public.is_super_admin())) OR (((SELECT auth.uid()) = user_id)));
DROP POLICY "Participants read SOS chat state" ON public."sos_chat_state";
CREATE POLICY "Participants read SOS chat state" ON public."sos_chat_state" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((SELECT auth.uid()) = patient_id) OR ((SELECT auth.uid()) = psychologist_id)));
DROP POLICY "Somente o sistema acessa acompanhamentos de SOS" ON public."sos_followups_sent";
CREATE POLICY "Somente o sistema acessa acompanhamentos de SOS" ON public."sos_followups_sent" AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
DROP POLICY "Participants read SOS messages" ON public."sos_messages";
CREATE POLICY "Participants read SOS messages" ON public."sos_messages" AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_sos_participant(request_id));
DROP POLICY "Authenticated users can log their own trace events" ON public."sos_trace_events";
CREATE POLICY "Authenticated users can log their own trace events" ON public."sos_trace_events" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((actor_user_id = (SELECT auth.uid())));
DROP POLICY "Admins can view all trace events" ON public."sos_trace_events";
DROP POLICY "Participants can view trace events of their calls" ON public."sos_trace_events";
-- Unifica: Admins can view all trace events; Participants can view trace events of their calls
CREATE POLICY "sos_trace_events: select (2 regras unificadas)" ON public."sos_trace_events" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT public.is_super_admin())) OR (((actor_user_id = (SELECT auth.uid())) OR (EXISTS ( SELECT 1
   FROM emergency_requests er
  WHERE ((er.id = sos_trace_events.emergency_request_id) AND ((er.patient_id = (SELECT auth.uid())) OR (er.accepted_by = (SELECT auth.uid())))))))));
DROP POLICY "select_own_subscription" ON public."subscribers";
CREATE POLICY "select_own_subscription" ON public."subscribers" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = (SELECT auth.uid())) OR ((user_id IS NULL) AND (email = (SELECT auth.email())))));
DROP POLICY "Users can update their own subscription SOS usage" ON public."subscribers";
CREATE POLICY "Users can update their own subscription SOS usage" ON public."subscribers" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = (SELECT auth.uid())))
  WITH CHECK ((user_id = (SELECT auth.uid())));
DROP POLICY "Psychologists can create their own support tickets" ON public."suporte_psicologo";
CREATE POLICY "Psychologists can create their own support tickets" ON public."suporte_psicologo" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = psicologo_id));
DROP POLICY "Psychologists can view their own support tickets" ON public."suporte_psicologo";
DROP POLICY "Super admins can view all psychologist support tickets" ON public."suporte_psicologo";
-- Unifica: Psychologists can view their own support tickets; Super admins can view all psychologist support tickets
CREATE POLICY "suporte_psicologo: select (2 regras unificadas)" ON public."suporte_psicologo" AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((SELECT auth.uid()) = psicologo_id)) OR ((SELECT public.is_super_admin())));
DROP POLICY "Super admins can update all psychologist support tickets" ON public."suporte_psicologo";
CREATE POLICY "Super admins can update all psychologist support tickets" ON public."suporte_psicologo" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin()));
DROP POLICY "Todos podem visualizar grupos de apoio" ON public."support_groups";
CREATE POLICY "Todos podem visualizar grupos de apoio" ON public."support_groups" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);
DROP POLICY "Users can create their own support tickets" ON public."support_tickets";
CREATE POLICY "Users can create their own support tickets" ON public."support_tickets" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Super admins can view all support tickets" ON public."support_tickets";
DROP POLICY "Users can view their own support tickets" ON public."support_tickets";
-- Unifica: Super admins can view all support tickets; Users can view their own support tickets
CREATE POLICY "support_tickets: select (2 regras unificadas)" ON public."support_tickets" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT public.is_super_admin())) OR (((SELECT auth.uid()) = user_id)));
DROP POLICY "Super admins can update all support tickets" ON public."support_tickets";
CREATE POLICY "Super admins can update all support tickets" ON public."support_tickets" AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin()));
DROP POLICY "Enable read access for everyone on transtornos_sintomas" ON public."transtornos_sintomas";
CREATE POLICY "Enable read access for everyone on transtornos_sintomas" ON public."transtornos_sintomas" AS PERMISSIVE FOR SELECT TO public
  USING (true);
DROP POLICY "Users manage their own habits" ON public."user_habits";
CREATE POLICY "Users manage their own habits" ON public."user_habits" AS PERMISSIVE FOR ALL TO authenticated
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Users can insert their own preferences" ON public."user_preferences";
CREATE POLICY "Users can insert their own preferences" ON public."user_preferences" AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Users can select their own preferences" ON public."user_preferences";
CREATE POLICY "Users can select their own preferences" ON public."user_preferences" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((SELECT auth.uid()) = user_id));
DROP POLICY "Users can update their own preferences" ON public."user_preferences";
CREATE POLICY "Users can update their own preferences" ON public."user_preferences" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));
DROP POLICY "Enable access to WebRTC sessions" ON public."webrtc_sessions";
CREATE POLICY "Enable access to WebRTC sessions" ON public."webrtc_sessions" AS PERMISSIVE FOR SELECT TO authenticated
  USING (((psychologist_id = (SELECT auth.uid())) OR (patient_id = (SELECT auth.uid()))));
DROP POLICY "Enable update for participants" ON public."webrtc_sessions";
CREATE POLICY "Enable update for participants" ON public."webrtc_sessions" AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((psychologist_id = (SELECT auth.uid())) OR (patient_id = (SELECT auth.uid()))))
  WITH CHECK (((psychologist_id = (SELECT auth.uid())) OR (patient_id = (SELECT auth.uid()))));
DROP POLICY "Anyone can view active weekly goals" ON public."weekly_goals";
CREATE POLICY "Anyone can view active weekly goals" ON public."weekly_goals" AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

-- ===========================================================================
-- 4. Permissões
-- ===========================================================================
-- Visitante sem login: nada nas tabelas, exceto o que o cadastro lê.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
GRANT SELECT ON public.brazilian_states, public.brazilian_cities, public.transtornos_sintomas TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- Funções: visitante só checa o código da empresa no cadastro.
REVOKE EXECUTE ON FUNCTION public.organizations_after_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.organization_members_after_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.normalize_invite_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_organization_manager(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_organization_dashboard(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rotate_organization_invite_code(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_add_organization_manager(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_organization_members(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.score_mental_health_screening() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.format_br_datetime(timestamp with time zone) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_psychologist_document_links() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_reopen_finished_call() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.normalize_plan_tier(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.plan_tier_rank(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.plan_tier_has_appointments(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.plan_tier_limits(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_patient_client_write() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_psychologist_client_write() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_organization_entitlement() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_testimonial_client_write() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_journal_daily_limit() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_extra_credit_link() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_admins_new_psychologist_registration() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_registration_client_insert() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_webrtc_client_update() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_notification_client_update() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_notification_push_text() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_user_habit_fields() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.progress_local_date(date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_screening_client_write() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.clean_safety_plan_items(text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.safety_plan_items_ok(text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_group_paid_write() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_testimonial_like_author() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_private_note_update() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_appointments_on_plan_end() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.recalc_psychologist_rating_from_feedback() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_emergency_status_transition() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.release_psychologist_on_emergency_end() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.protect_emergency_request_columns() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.keep_sos_triage() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_achievement_unlocked() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_safety_plan_recommendation() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.deliver_post_crisis_plans_on_end() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_organization_code(text) TO anon;

-- Funções internas e de gatilho: só o servidor (os gatilhos continuam
-- funcionando; o Postgres não confere EXECUTE ao disparar um gatilho).
REVOKE EXECUTE ON FUNCTION public.organizations_after_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.organization_members_after_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_invite_code(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_organization_manager(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.score_mental_health_screening() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.format_br_datetime(timestamp with time zone) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_type(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_psychologist_document_links() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_reopen_finished_call() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_plan_tier(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.plan_tier_rank(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.plan_tier_has_appointments(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.plan_tier_limits(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_patient_client_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_psychologist_client_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_organization_entitlement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_free_plan_journal_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_testimonial_client_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_journal_daily_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_extra_credit_link() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins_new_psychologist_registration() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_registration_client_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_webrtc_client_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_notification_client_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_notification_push_text() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_user_habit_fields() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.progress_local_date(date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_screening_client_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_group_paid_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_testimonial_like_author() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_private_note_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_appointments_on_plan_end() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_psychologist_rating_from_feedback() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_emergency_status_transition() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_psychologist_on_emergency_end() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_emergency_request_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.keep_sos_triage() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_achievement_unlocked() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_safety_plan_recommendation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deliver_post_crisis_plans_on_end() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.organizations_after_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.organization_members_after_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_invite_code(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_organization_manager(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.score_mental_health_screening() TO service_role;
GRANT EXECUTE ON FUNCTION public.format_br_datetime(timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_type(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_psychologist_document_links() TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_reopen_finished_call() TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_plan_tier(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.plan_tier_rank(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.plan_tier_has_appointments(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.plan_tier_limits(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_patient_client_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_psychologist_client_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_organization_entitlement() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_free_plan_journal_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_testimonial_client_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_journal_daily_limit() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_extra_credit_link() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_admins_new_psychologist_registration() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_registration_client_insert() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_webrtc_client_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_notification_client_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_notification_push_text() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_user_habit_fields() TO service_role;
GRANT EXECUTE ON FUNCTION public.progress_local_date(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_screening_client_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_group_paid_write() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_testimonial_like_author() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_private_note_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_appointments_on_plan_end() TO service_role;
GRANT EXECUTE ON FUNCTION public.recalc_psychologist_rating_from_feedback() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_emergency_status_transition() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_psychologist_on_emergency_end() TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_emergency_request_columns() TO service_role;
GRANT EXECUTE ON FUNCTION public.keep_sos_triage() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_achievement_unlocked() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_safety_plan_recommendation() TO service_role;
GRANT EXECUTE ON FUNCTION public.deliver_post_crisis_plans_on_end() TO service_role;

ALTER FUNCTION public.normalize_invite_code(text) SET search_path = '';

-- ===========================================================================
-- 5. Lembretes de hábitos: fuso válido sem varrer pg_timezone_names
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.is_valid_timezone(p_tz text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO ''
AS $function$
BEGIN
  IF p_tz IS NULL OR p_tz = '' THEN
    RETURN false;
  END IF;
  PERFORM now() AT TIME ZONE p_tz;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.is_valid_timezone(text) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.claim_due_habit_reminders()
 RETURNS TABLE(habit_id uuid, user_id uuid, kind text, title text, daily_goal numeric, today_total numeric, quit_started_at timestamp with time zone, settings jsonb, due_slot text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT h.*,
           (now() AT TIME ZONE h.timezone) AS local_now
    FROM public.user_habits h
    WHERE h.archived_at IS NULL
      AND h.reminders_enabled
      AND public.is_valid_timezone(h.timezone)
      AND EXISTS (SELECT 1 FROM public.fcm_tokens t WHERE t.user_id = h.user_id AND t.is_active IS NOT FALSE)
  ),
  totals AS (
    SELECT c.id,
           c.local_now,
           COALESCE((
             SELECT sum(e.amount) FROM public.habit_events e
              WHERE e.habit_id = c.id AND e.kind = 'intake' AND e.local_date = c.local_now::date
           ), 0) AS total,
           EXISTS (
             SELECT 1 FROM public.habit_events e
             WHERE e.habit_id = c.id AND e.kind IN ('intake', 'check') AND e.local_date = c.local_now::date
           ) AS logged_today
    FROM candidates c
  ),
  -- Horários com lembrete próprio que estão valendo agora (até 2 h depois) e
  -- ainda não foram marcados: doses do remédio (settings.times, marcadas em
  -- details.slot) e refeições (settings.meal_times, marcadas em details.meal).
  slots AS (
    SELECT c.id, s.t AS slot, s.t AS at_time
    FROM candidates c
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(c.settings -> 'times') = 'array' THEN c.settings -> 'times' ELSE '[]'::jsonb END
    ) AS s(t)
    WHERE c.kind = 'medication'
      AND s.t ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND NOT EXISTS (
        SELECT 1 FROM public.habit_events e
        WHERE e.habit_id = c.id AND e.kind = 'intake'
          AND e.local_date = c.local_now::date AND e.details ->> 'slot' = s.t
      )
    UNION ALL
    SELECT c.id, m.key, m.value
    FROM candidates c
    CROSS JOIN LATERAL jsonb_each_text(
      CASE WHEN jsonb_typeof(c.settings -> 'meal_times') = 'object' THEN c.settings -> 'meal_times' ELSE '{}'::jsonb END
    ) AS m(key, value)
    WHERE c.kind = 'meals'
      AND m.value ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      AND NOT EXISTS (
        SELECT 1 FROM public.habit_events e
        WHERE e.habit_id = c.id AND e.kind = 'intake'
          AND e.local_date = c.local_now::date AND e.details ->> 'meal' = m.key
      )
  ),
  med_slots AS (
    SELECT s.id, s.slot, s.at_time
    FROM slots s
    JOIN candidates c ON c.id = s.id
    WHERE c.local_now::time >= s.at_time::time
      AND c.local_now::time - s.at_time::time < interval '2 hours'
      AND (c.last_reminder_at IS NULL
           OR (c.last_reminder_at AT TIME ZONE c.timezone) < (c.local_now::date + s.at_time::time))
  ),
  -- Hábitos que avisam por horário (remédio; refeições com horários).
  slotted AS (
    SELECT c.id FROM candidates c
    WHERE c.kind = 'medication'
       OR (c.kind = 'meals' AND jsonb_typeof(c.settings -> 'meal_times') = 'object')
  ),
  due AS (
    SELECT c.id, c.last_reminder_at
    FROM candidates c
    JOIN totals t ON t.id = c.id
    WHERE (
        c.id IN (SELECT id FROM slotted)
        AND EXISTS (SELECT 1 FROM med_slots m WHERE m.id = c.id)
      )
      OR (
        c.id NOT IN (SELECT id FROM slotted)
        AND c.local_now::time >= c.reminder_start
        -- Já feito hoje: sono/algo que me faz bem anotados, meta batida.
        AND NOT (c.kind IN ('sleep', 'joy') AND t.logged_today)
        AND NOT (c.kind IN ('water', 'movement', 'meals') AND c.daily_goal IS NOT NULL AND t.total >= c.daily_goal)
        AND (
          -- Um por dia, até 3 horas depois do horário escolhido.
          (c.reminder_interval_minutes IS NULL
            AND c.local_now::time - c.reminder_start < interval '3 hours'
            AND (c.last_reminder_at IS NULL OR (c.last_reminder_at AT TIME ZONE c.timezone)::date < c.local_now::date))
          OR
          -- A cada N minutos dentro da janela, enquanto a meta do dia não foi batida.
          (c.reminder_interval_minutes IS NOT NULL
            AND c.local_now::time <= c.reminder_end
            AND (c.daily_goal IS NULL OR t.total < c.daily_goal)
            AND (c.last_reminder_at IS NULL
                 OR now() - c.last_reminder_at >= make_interval(mins => c.reminder_interval_minutes - 5)))
        )
      )
  ),
  claimed AS (
    UPDATE public.user_habits h
    SET last_reminder_at = now()
    FROM due
    WHERE h.id = due.id
      -- Se outra execução já marcou este lembrete, não envia de novo.
      AND h.last_reminder_at IS NOT DISTINCT FROM due.last_reminder_at
    RETURNING h.*
  )
  SELECT cl.id, cl.user_id, cl.kind, cl.title, cl.daily_goal, t.total, cl.quit_started_at, cl.settings,
         (SELECT m.slot FROM med_slots m WHERE m.id = cl.id ORDER BY m.at_time DESC LIMIT 1)
  FROM claimed cl
  JOIN totals t ON t.id = cl.id;
END;
$function$
;
