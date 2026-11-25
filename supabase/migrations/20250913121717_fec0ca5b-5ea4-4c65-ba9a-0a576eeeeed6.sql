-- Create user_preferences table for media device settings
create table if not exists public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  mic_device_id text,
  camera_device_id text,
  speaker_device_id text,
  background_blur boolean default false,
  updated_at timestamptz not null default now()
);

-- Ensure one preference row per user
alter table public.user_preferences
  add constraint user_preferences_user_id_unique unique (user_id);

-- Enable Row Level Security
alter table public.user_preferences enable row level security;

-- RLS policies
create policy "Users can select their own preferences"
  on public.user_preferences
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own preferences"
  on public.user_preferences
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own preferences"
  on public.user_preferences
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Update updated_at automatically
create trigger update_user_preferences_updated_at
before update on public.user_preferences
for each row
execute function public.update_updated_at_column();