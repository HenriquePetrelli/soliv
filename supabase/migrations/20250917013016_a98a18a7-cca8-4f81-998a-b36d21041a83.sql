-- Add columns to track mute and camera status for both users
ALTER TABLE public.webrtc_sessions 
ADD COLUMN patient_muted BOOLEAN DEFAULT false,
ADD COLUMN psychologist_muted BOOLEAN DEFAULT false,
ADD COLUMN patient_camera_off BOOLEAN DEFAULT false,
ADD COLUMN psychologist_camera_off BOOLEAN DEFAULT false;