-- Fix function search path issues
CREATE OR REPLACE FUNCTION public.validate_cpf(cpf_input TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Remove any non-digit characters
  cpf_input := regexp_replace(cpf_input, '[^0-9]', '', 'g');
  
  -- Check if has exactly 11 digits
  IF length(cpf_input) != 11 THEN
    RETURN FALSE;
  END IF;
  
  -- Check for invalid sequences (all same digits)
  IF cpf_input ~ '^(.)\1{10}$' THEN
    RETURN FALSE;
  END IF;
  
  -- CPF validation algorithm
  DECLARE
    sum_1 INTEGER := 0;
    sum_2 INTEGER := 0;
    digit_1 INTEGER;
    digit_2 INTEGER;
    i INTEGER;
  BEGIN
    -- Calculate first check digit
    FOR i IN 1..9 LOOP
      sum_1 := sum_1 + (substring(cpf_input, i, 1)::INTEGER * (11 - i));
    END LOOP;
    
    digit_1 := 11 - (sum_1 % 11);
    IF digit_1 >= 10 THEN
      digit_1 := 0;
    END IF;
    
    -- Calculate second check digit
    FOR i IN 1..10 LOOP
      sum_2 := sum_2 + (substring(cpf_input, i, 1)::INTEGER * (12 - i));
    END LOOP;
    
    digit_2 := 11 - (sum_2 % 11);
    IF digit_2 >= 10 THEN
      digit_2 := 0;
    END IF;
    
    -- Check if calculated digits match
    RETURN digit_1 = substring(cpf_input, 10, 1)::INTEGER 
       AND digit_2 = substring(cpf_input, 11, 1)::INTEGER;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_crp(crp_input TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Allow null values
  IF crp_input IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Remove any whitespace
  crp_input := trim(crp_input);
  
  -- Check minimum length (should have some content)
  IF length(crp_input) < 3 THEN
    RETURN FALSE;
  END IF;
  
  -- Check maximum reasonable length
  IF length(crp_input) > 20 THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;