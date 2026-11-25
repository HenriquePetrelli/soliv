-- Verificar se a foreign key já existe e criar se necessário
DO $$
BEGIN
    -- Verificar se a constraint já existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_appointments_psychologist_id' 
        AND table_name = 'appointments'
    ) THEN
        -- Criar a foreign key
        ALTER TABLE public.appointments 
        ADD CONSTRAINT fk_appointments_psychologist_id 
        FOREIGN KEY (psychologist_id) 
        REFERENCES public.psychologists(user_id) 
        ON DELETE CASCADE;
        
        RAISE NOTICE 'Foreign key constraint created successfully';
    ELSE
        RAISE NOTICE 'Foreign key constraint already exists';
    END IF;
END
$$;