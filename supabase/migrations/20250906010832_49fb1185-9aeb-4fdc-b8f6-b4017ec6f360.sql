-- Remove any existing duplicate foreign keys and constraints
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    -- Remove any existing foreign key constraints on appointments.psychologist_id
    FOR constraint_record IN
        SELECT conname 
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'appointments' 
        AND c.contype = 'f'
        AND c.conkey @> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = t.oid AND attname = 'psychologist_id')]
    LOOP
        EXECUTE format('ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
        RAISE NOTICE 'Dropped constraint: %', constraint_record.conname;
    END LOOP;

    -- Create a single, well-defined foreign key
    ALTER TABLE public.appointments 
    ADD CONSTRAINT appointments_psychologist_fk 
    FOREIGN KEY (psychologist_id) 
    REFERENCES public.psychologists(user_id) 
    ON DELETE CASCADE;
    
    RAISE NOTICE 'Created single foreign key constraint: appointments_psychologist_fk';
END
$$;