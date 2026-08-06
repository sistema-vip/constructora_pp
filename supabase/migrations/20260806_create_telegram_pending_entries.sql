-- Migración para soporte de Bot de Telegram en Construct PP

-- 1. Agregar telegram_chat_id a profiles si no existe
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT UNIQUE;

-- 2. Crear tabla telegram_pending_entries
CREATE TABLE IF NOT EXISTS telegram_pending_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tipo de registro ('cost', 'partner_advance', 'client_payment', 'commitment')
  entry_type TEXT NOT NULL DEFAULT 'cost',
  
  -- Datos parseados por IA
  description TEXT NOT NULL,
  amount_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  category TEXT,                            -- materials, labor, equipment, subcontract, other
  provider TEXT,                            -- proveedor (para costs/commitments)
  partner_name TEXT,                        -- nombre del socio (para partner_advances)
  quantity NUMERIC(10,4) DEFAULT 1,
  unit_price_usd NUMERIC(12,2),
  payment_reference TEXT,                   -- referencia de pago (para client_payments)
  date DATE DEFAULT CURRENT_DATE,
  
  -- Vinculación con proyectos (puede ser NULL si la IA no logra asociar)
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Contexto y auditoría IA
  raw_message TEXT NOT NULL,                -- Mensaje original recibido por Telegram
  ai_parsed_data JSONB,                     -- Respuesta JSON de Gemini
  suggested_client_name TEXT,               -- Nombre de cliente deducido
  suggested_project_name TEXT,              -- Nombre de proyecto deducido
  confidence_score NUMERIC(3,2) DEFAULT 0,  -- Confianza de la IA (0.00 - 1.00)
  
  -- Estado del pendiente ('pending', 'approved', 'rejected')
  status TEXT NOT NULL DEFAULT 'pending'    
    CHECK (status IN ('pending', 'approved', 'rejected')),
  
  -- Metadata de Telegram
  telegram_chat_id BIGINT NOT NULL,
  telegram_message_id BIGINT,
  telegram_user_name TEXT,
  
  -- Marcas de tiempo y auditoría
  created_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  
  -- Referencia al registro creado tras aprobación
  created_record_id UUID,
  created_record_table TEXT                 -- 'project_costs', 'partner_advances', etc.
);

-- Habilitar RLS
ALTER TABLE telegram_pending_entries ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para administradores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'telegram_pending_entries' AND policyname = 'Admins manage telegram entries'
  ) THEN
    CREATE POLICY "Admins manage telegram entries"
      ON telegram_pending_entries FOR ALL
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
      );
  END IF;
END $$;
