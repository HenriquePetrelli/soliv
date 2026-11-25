-- Create notification_logs table for tracking FCM notifications
CREATE TABLE public.notification_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  topic TEXT,
  recipient_count INTEGER DEFAULT 1,
  fcm_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own notification logs" 
ON public.notification_logs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own notification logs" 
ON public.notification_logs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create FCM tokens table for storing user device tokens
CREATE TABLE public.fcm_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  device_info JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies for FCM tokens
CREATE POLICY "Users can manage their own FCM tokens" 
ON public.fcm_tokens 
FOR ALL 
USING (auth.uid() = user_id);

-- Create trigger for FCM tokens timestamp updates
CREATE TRIGGER update_fcm_tokens_updated_at
BEFORE UPDATE ON public.fcm_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for better performance
CREATE INDEX idx_notification_logs_user_id ON public.notification_logs(user_id);
CREATE INDEX idx_notification_logs_created_at ON public.notification_logs(created_at);
CREATE INDEX idx_fcm_tokens_user_id ON public.fcm_tokens(user_id);
CREATE INDEX idx_fcm_tokens_active ON public.fcm_tokens(is_active) WHERE is_active = true;