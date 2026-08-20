-- Migración: Base de Habilidades y Aprendizaje Continuo para Agentes de Construct PP

CREATE TABLE IF NOT EXISTS agent_learned_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('alias', 'supplier', 'rule', 'pricing', 'correction', 'general')),
  skill_key TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence NUMERIC DEFAULT 1.0,
  source TEXT DEFAULT 'auto_learned', -- 'user_instruction', 'auto_learned', 'correction'
  usage_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_learned_skills_key ON agent_learned_skills (skill_key);
CREATE INDEX IF NOT EXISTS idx_agent_learned_skills_cat ON agent_learned_skills (category);
CREATE INDEX IF NOT EXISTS idx_agent_learned_skills_created ON agent_learned_skills (created_at DESC);

-- Habilitar RLS
ALTER TABLE agent_learned_skills ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para administradores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_learned_skills' AND policyname = 'Admins manage agent learned skills'
  ) THEN
    CREATE POLICY "Admins manage agent learned skills"
      ON agent_learned_skills FOR ALL
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
      );
  END IF;
END $$;
