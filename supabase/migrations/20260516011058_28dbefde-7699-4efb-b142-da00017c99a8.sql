-- 1) notifications: require authenticated insert
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
CREATE POLICY "Authenticated users can create notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- 2) subscribers: restrict insert to own user_id
DROP POLICY IF EXISTS "insert_subscription" ON public.subscribers;
CREATE POLICY "Users can insert their own subscription"
ON public.subscribers
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 3) admin_users: split ALL into per-command with strict INSERT
DROP POLICY IF EXISTS "Only super admins can manage admin_users" ON public.admin_users;

CREATE POLICY "Super admins can insert admin_users"
ON public.admin_users
FOR INSERT
TO authenticated
WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can update admin_users"
ON public.admin_users
FOR UPDATE
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can delete admin_users"
ON public.admin_users
FOR DELETE
TO authenticated
USING (public.is_super_admin());

-- 4) documents bucket: tighten UPDATE/DELETE to folder owner
DROP POLICY IF EXISTS "Authenticated can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update documents" ON storage.objects;

CREATE POLICY "Owners can update their documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Owners can delete their documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Tighten anonymous upload: require authenticated + own folder
DROP POLICY IF EXISTS "Public can upload documents" ON storage.objects;
CREATE POLICY "Authenticated can upload to their documents folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);