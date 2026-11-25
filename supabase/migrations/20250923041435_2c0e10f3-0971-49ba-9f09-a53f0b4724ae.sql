-- Create support_tickets table
CREATE TABLE public.support_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  email TEXT NOT NULL,
  phone TEXT,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can create their own support tickets"
  ON public.support_tickets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own support tickets"
  ON public.support_tickets
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Super admins can view all support tickets"
  ON public.support_tickets
  FOR SELECT
  USING (is_super_admin());

CREATE POLICY "Super admins can update all support tickets"
  ON public.support_tickets
  FOR UPDATE
  USING (is_super_admin());

-- Create function to update updated_at
CREATE TRIGGER update_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();