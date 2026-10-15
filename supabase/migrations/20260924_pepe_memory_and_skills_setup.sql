-- Migración Completa de Memoria y Aprendizaje para Pepe IA (Web y Telegram)
-- Constructora P&P Construye

-- 1. Tabla de Historial Conversacional
CREATE TABLE IF NOT EXISTS public.telegram_chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id BIGINT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  message_text TEXT NOT NULL,
  action_taken TEXT,
  record_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_chat_history_chat_created 
ON public.telegram_chat_history (telegram_chat_id, created_at DESC);

ALTER TABLE public.telegram_chat_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'telegram_chat_history' AND policyname = 'Admins manage telegram chat history'
  ) THEN
    CREATE POLICY "Admins manage telegram chat history"
      ON public.telegram_chat_history FOR ALL
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
      );
  END IF;
END $$;

-- 2. Tabla de Habilidades y Reglas Aprendidas por el Asistente
CREATE TABLE IF NOT EXISTS public.agent_learned_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('alias', 'supplier', 'rule', 'pricing', 'correction', 'general')),
  skill_key TEXT NOT NULL,
  description TEXT NOT NULL,
  confidence NUMERIC DEFAULT 1.0,
  source TEXT DEFAULT 'auto_learned',
  usage_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_learned_skills_key ON public.agent_learned_skills (skill_key);
CREATE INDEX IF NOT EXISTS idx_agent_learned_skills_cat ON public.agent_learned_skills (category);
CREATE INDEX IF NOT EXISTS idx_agent_learned_skills_created ON public.agent_learned_skills (created_at DESC);

ALTER TABLE public.agent_learned_skills ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_learned_skills' AND policyname = 'Admins manage agent learned skills'
  ) THEN
    CREATE POLICY "Admins manage agent learned skills"
      ON public.agent_learned_skills FOR ALL
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
      );
  END IF;
END $$;
