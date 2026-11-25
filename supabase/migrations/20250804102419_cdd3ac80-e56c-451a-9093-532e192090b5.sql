-- Create brazilian_states table
CREATE TABLE public.brazilian_states (
  abbreviation TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Create brazilian_cities table  
CREATE TABLE public.brazilian_cities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  state TEXT REFERENCES public.brazilian_states(abbreviation),
  UNIQUE(name, state)
);

-- Create patients table
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  cpf TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL,
  city TEXT NOT NULL,
  phone TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_patients_user_id ON public.patients(user_id);
CREATE INDEX idx_patients_email ON public.patients(email);
CREATE INDEX idx_patients_cpf ON public.patients(cpf);
CREATE INDEX idx_brazilian_cities_state ON public.brazilian_cities(state);

-- Enable RLS on tables
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brazilian_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brazilian_cities ENABLE ROW LEVEL SECURITY;

-- RLS policies for patients table
CREATE POLICY "Users can view their own patient data" 
ON public.patients 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own patient data" 
ON public.patients 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own patient data" 
ON public.patients 
FOR UPDATE 
USING (auth.uid() = user_id);

-- RLS policies for public access to states and cities
CREATE POLICY "Everyone can view states" 
ON public.brazilian_states 
FOR SELECT 
USING (true);

CREATE POLICY "Everyone can view cities" 
ON public.brazilian_cities 
FOR SELECT 
USING (true);

-- Populate brazilian_states with all states
INSERT INTO public.brazilian_states (abbreviation, name) VALUES
('AC', 'Acre'),
('AL', 'Alagoas'),
('AP', 'Amapá'),
('AM', 'Amazonas'),
('BA', 'Bahia'),
('CE', 'Ceará'),
('DF', 'Distrito Federal'),
('ES', 'Espírito Santo'),
('GO', 'Goiás'),
('MA', 'Maranhão'),
('MT', 'Mato Grosso'),
('MS', 'Mato Grosso do Sul'),
('MG', 'Minas Gerais'),
('PA', 'Pará'),
('PB', 'Paraíba'),
('PR', 'Paraná'),
('PE', 'Pernambuco'),
('PI', 'Piauí'),
('RJ', 'Rio de Janeiro'),
('RN', 'Rio Grande do Norte'),
('RS', 'Rio Grande do Sul'),
('RO', 'Rondônia'),
('RR', 'Roraima'),
('SC', 'Santa Catarina'),
('SP', 'São Paulo'),
('SE', 'Sergipe'),
('TO', 'Tocantins');

-- Sample cities for major states (you can expand this with full IBGE data)
INSERT INTO public.brazilian_cities (name, state) VALUES
-- São Paulo
('São Paulo', 'SP'),
('Campinas', 'SP'),
('Santos', 'SP'),
('São Bernardo do Campo', 'SP'),
('Santo André', 'SP'),
('Osasco', 'SP'),
('Guarulhos', 'SP'),

-- Rio de Janeiro
('Rio de Janeiro', 'RJ'),
('Niterói', 'RJ'),
('Duque de Caxias', 'RJ'),
('Nova Iguaçu', 'RJ'),
('Petrópolis', 'RJ'),

-- Minas Gerais
('Belo Horizonte', 'MG'),
('Uberlândia', 'MG'),
('Contagem', 'MG'),
('Juiz de Fora', 'MG'),

-- Paraná
('Curitiba', 'PR'),
('Londrina', 'PR'),
('Maringá', 'PR'),
('Ponta Grossa', 'PR'),

-- Rio Grande do Sul
('Porto Alegre', 'RS'),
('Caxias do Sul', 'RS'),
('Pelotas', 'RS'),
('Santa Maria', 'RS'),

-- Bahia
('Salvador', 'BA'),
('Feira de Santana', 'BA'),
('Vitória da Conquista', 'BA'),
('Camaçari', 'BA'),

-- Santa Catarina
('Florianópolis', 'SC'),
('Joinville', 'SC'),
('Blumenau', 'SC'),
('Chapecó', 'SC'),

-- Ceará
('Fortaleza', 'CE'),
('Caucaia', 'CE'),
('Juazeiro do Norte', 'CE'),
('Maracanaú', 'CE'),

-- Pernambuco
('Recife', 'PE'),
('Jaboatão dos Guararapes', 'PE'),
('Olinda', 'PE'),
('Caruaru', 'PE'),

-- Distrito Federal
('Brasília', 'DF'),

-- Goiás
('Goiânia', 'GO'),
('Aparecida de Goiânia', 'GO'),
('Anápolis', 'GO'),

-- Pará
('Belém', 'PA'),
('Ananindeua', 'PA'),
('Santarém', 'PA'),

-- Amazonas
('Manaus', 'AM'),
('Parintins', 'AM'),

-- Maranhão
('São Luís', 'MA'),
('Imperatriz', 'MA'),

-- Espírito Santo
('Vitória', 'ES'),
('Vila Velha', 'ES'),
('Cariacica', 'ES'),

-- Mato Grosso
('Cuiabá', 'MT'),
('Várzea Grande', 'MT'),

-- Mato Grosso do Sul
('Campo Grande', 'MS'),
('Dourados', 'MS'),

-- Alagoas
('Maceió', 'AL'),

-- Paraíba
('João Pessoa', 'PB'),
('Campina Grande', 'PB'),

-- Piauí
('Teresina', 'PI'),

-- Rio Grande do Norte
('Natal', 'RN'),
('Mossoró', 'RN'),

-- Sergipe
('Aracaju', 'SE'),

-- Tocantins
('Palmas', 'TO'),

-- Acre
('Rio Branco', 'AC'),

-- Amapá
('Macapá', 'AP'),

-- Rondônia
('Porto Velho', 'RO'),

-- Roraima
('Boa Vista', 'RR');

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_patients_updated_at 
BEFORE UPDATE ON public.patients 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();