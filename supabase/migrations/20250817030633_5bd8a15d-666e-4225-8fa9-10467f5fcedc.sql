-- Create WebRTC sessions table for native video calling
CREATE TABLE webrtc_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  emergency_request_id UUID REFERENCES emergency_requests(id) ON DELETE CASCADE,
  psychologist_id UUID,
  patient_id UUID,
  offer JSONB,
  answer JSONB,
  ice_candidates JSONB[] DEFAULT array[]::JSONB[],
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '2 hours')
);

-- Enable RLS
ALTER TABLE webrtc_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies for WebRTC sessions
CREATE POLICY "Enable access to WebRTC sessions" 
ON webrtc_sessions
FOR SELECT USING (
  psychologist_id = auth.uid() OR
  patient_id = auth.uid()
);

CREATE POLICY "Enable insert for authenticated users" 
ON webrtc_sessions
FOR INSERT WITH CHECK (
  psychologist_id = auth.uid() OR
  patient_id = auth.uid()
);

CREATE POLICY "Enable update for participants" 
ON webrtc_sessions
FOR UPDATE USING (
  psychologist_id = auth.uid() OR
  patient_id = auth.uid()
);

-- Indexes for performance
CREATE INDEX idx_webrtc_sessions_emergency ON webrtc_sessions(emergency_request_id);
CREATE INDEX idx_webrtc_sessions_psychologist ON webrtc_sessions(psychologist_id);
CREATE INDEX idx_webrtc_sessions_patient ON webrtc_sessions(patient_id);

-- Enable realtime for WebRTC sessions
ALTER PUBLICATION supabase_realtime ADD TABLE webrtc_sessions;