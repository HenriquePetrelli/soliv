CREATE POLICY "Patients can delete their own notifications" ON public.notifications FOR DELETE USING (patient_id = auth.uid());
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;