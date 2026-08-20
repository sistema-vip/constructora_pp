-- Migración: Historial de mensajes y memoria conversacional para el Bot de Telegram

CREATE TABLE IF NOT EXISTS telegram_chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id BIGINT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  message_text TEXT NOT NULL,
  action_taken TEXT,
  record_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_chat_history_chat_created 
ON telegram_chat_history (telegram_chat_id, created_at DESC);

-- Habilitar RLS
ALTER TABLE telegram_chat_history ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para administradores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'telegram_chat_history' AND policyname = 'Admins manage telegram chat history'
  ) THEN
    CREATE POLICY "Admins manage telegram chat history"
      ON telegram_chat_history FOR ALL
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
      );
  END IF;
END $$;
