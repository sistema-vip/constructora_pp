-- Migración: Tabla de sesiones deterministas para Bot de Telegram
-- Reemplaza la lógica de estado basada en historial de chat (que causaba bucles)
-- por un estado explícito y persistente en base de datos.

CREATE TABLE IF NOT EXISTS telegram_sessions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_chat_id  BIGINT      NOT NULL UNIQUE,

  -- Estado actual de la conversación (máquina de estados)
  -- Valores: 'awaiting_expense_data' | 'awaiting_project' | 'awaiting_project_selection'
  state             TEXT        NOT NULL,

  -- Datos del gasto recopilados paso a paso
  amount            NUMERIC(14,4),
  currency          TEXT        NOT NULL DEFAULT 'USD',
  description       TEXT,
  provider          TEXT,
  payment_reference TEXT,
  category          TEXT        NOT NULL DEFAULT 'materials',

  -- Proyecto resuelto (cuando se confirma)
  project_id        UUID        REFERENCES projects(id) ON DELETE SET NULL,
  client_name       TEXT,

  -- Opciones de proyecto cuando hay ambigüedad (JSON array)
  project_options   JSONB,

  -- Metadata
  telegram_user_name TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- La sesión expira automáticamente en 30 minutos
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 minutes')
);

-- Índice para búsqueda rápida por chat_id
CREATE INDEX IF NOT EXISTS idx_telegram_sessions_chat_id
  ON telegram_sessions (telegram_chat_id);

-- RLS: solo el service_role puede acceder (el bot usa la clave de servicio)
ALTER TABLE telegram_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'telegram_sessions'
    AND policyname = 'Service role manages telegram sessions'
  ) THEN
    CREATE POLICY "Service role manages telegram sessions"
      ON telegram_sessions FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_telegram_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_telegram_sessions_updated_at ON telegram_sessions;
CREATE TRIGGER trg_telegram_sessions_updated_at
  BEFORE UPDATE ON telegram_sessions
  FOR EACH ROW EXECUTE FUNCTION update_telegram_sessions_updated_at();
