-- Create appointments table for scheduling
CREATE TABLE public.appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL,
  psychologist_id UUID NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  appointment_type TEXT NOT NULL DEFAULT 'regular' CHECK (appointment_type IN ('regular', 'emergency')),
  notes TEXT,
  session_summary TEXT,
  video_room_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create emergency_requests table for SOS functionality
CREATE TABLE public.emergency_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'completed', 'cancelled')),
  accepted_by UUID,
  accepted_at TIMESTAMP WITH TIME ZONE,
  video_room_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create patient_progress table for tracking user progress
CREATE TABLE public.patient_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  anxiety_level INTEGER CHECK (anxiety_level >= 1 AND anxiety_level <= 10),
  stress_level INTEGER CHECK (stress_level >= 1 AND stress_level <= 10),
  mood_rating INTEGER CHECK (mood_rating >= 1 AND mood_rating <= 10),
  technique_used TEXT,
  session_duration INTEGER, -- in minutes
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create psychologist availability table
CREATE TABLE public.psychologist_availability (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  psychologist_id UUID NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0 = Sunday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.psychologist_availability ENABLE ROW LEVEL SECURITY;

-- Create policies for appointments
CREATE POLICY "Patients can view their own appointments" 
ON public.appointments 
FOR SELECT 
USING (patient_id = auth.uid());

CREATE POLICY "Psychologists can view their appointments" 
ON public.appointments 
FOR SELECT 
USING (psychologist_id = auth.uid());

CREATE POLICY "Patients can create appointments" 
ON public.appointments 
FOR INSERT 
WITH CHECK (patient_id = auth.uid());

CREATE POLICY "Patients can update their own appointments" 
ON public.appointments 
FOR UPDATE 
USING (patient_id = auth.uid());

CREATE POLICY "Psychologists can update their appointments" 
ON public.appointments 
FOR UPDATE 
USING (psychologist_id = auth.uid());

-- Create policies for emergency requests
CREATE POLICY "Patients can view their own emergency requests" 
ON public.emergency_requests 
FOR SELECT 
USING (patient_id = auth.uid());

CREATE POLICY "Psychologists can view all emergency requests" 
ON public.emergency_requests 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND user_type = 'psychologist'
  )
);

CREATE POLICY "Patients can create emergency requests" 
ON public.emergency_requests 
FOR INSERT 
WITH CHECK (patient_id = auth.uid());

CREATE POLICY "Psychologists can update emergency requests" 
ON public.emergency_requests 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND user_type = 'psychologist'
  )
);

-- Create policies for patient progress
CREATE POLICY "Patients can view their own progress" 
ON public.patient_progress 
FOR SELECT 
USING (patient_id = auth.uid());

CREATE POLICY "Patients can create their own progress" 
ON public.patient_progress 
FOR INSERT 
WITH CHECK (patient_id = auth.uid());

CREATE POLICY "Patients can update their own progress" 
ON public.patient_progress 
FOR UPDATE 
USING (patient_id = auth.uid());

-- Create policies for psychologist availability
CREATE POLICY "Everyone can view psychologist availability" 
ON public.psychologist_availability 
FOR SELECT 
USING (true);

CREATE POLICY "Psychologists can manage their own availability" 
ON public.psychologist_availability 
FOR ALL 
USING (psychologist_id = auth.uid());

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_appointments_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_emergency_requests_updated_at
BEFORE UPDATE ON public.emergency_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_psychologist_availability_updated_at
BEFORE UPDATE ON public.psychologist_availability
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_appointments_patient_id ON public.appointments(patient_id);
CREATE INDEX idx_appointments_psychologist_id ON public.appointments(psychologist_id);
CREATE INDEX idx_appointments_scheduled_at ON public.appointments(scheduled_at);
CREATE INDEX idx_emergency_requests_patient_id ON public.emergency_requests(patient_id);
CREATE INDEX idx_emergency_requests_status ON public.emergency_requests(status);
CREATE INDEX idx_patient_progress_patient_id ON public.patient_progress(patient_id);
CREATE INDEX idx_patient_progress_session_date ON public.patient_progress(session_date);
CREATE INDEX idx_psychologist_availability_psychologist_id ON public.psychologist_availability(psychologist_id);