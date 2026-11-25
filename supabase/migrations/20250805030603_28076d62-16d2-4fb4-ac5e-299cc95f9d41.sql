-- Adicionar colunas faltantes na tabela psychologists
ALTER TABLE psychologists 
ADD COLUMN IF NOT EXISTS cpf TEXT,
ADD COLUMN IF NOT EXISTS professional_email TEXT;

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_psychologists_cpf ON psychologists(cpf);
CREATE INDEX IF NOT EXISTS idx_psychologists_prof_email ON psychologists(professional_email);