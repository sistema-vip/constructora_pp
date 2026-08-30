-- PASO 2: Crear tablas nuevas
-- Ejecuta esto DESPUÉS de que el Paso 1 corra sin errores

CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  role        text NOT NULL DEFAULT 'viewer',
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  title           text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'proposal',
  start_date      date,
  end_date        date,
  budget_usd      numeric(12,2),
  budget_ves      numeric(18,2) DEFAULT 0,
  progress_pct    integer DEFAULT 0,
  proposal_number integer,
  notes           text,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  amount_usd  numeric(12,2) NOT NULL,
  amount_ves  numeric(18,2) DEFAULT 0,
  date        date,
  reference   text,
  description text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_extras (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount_usd  numeric(12,2) NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_costs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  description    text NOT NULL,
  category       text,
  quantity       numeric(10,4),
  unit           text,
  unit_price_usd numeric(12,2),
  total_usd      numeric(12,2),
  provider       text,
  date           date,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_commitments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  description    text NOT NULL,
  amount_usd     numeric(12,2),
  date           date,
  reference      text,
  provider       text,
  category       text,
  quantity       numeric(10,4),
  unit_price_usd numeric(12,2),
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_advances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  partner_name text NOT NULL,
  amount_usd   numeric(12,2) NOT NULL,
  description  text,
  date         date,
  created_at   timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.global_settings (
  setting_key   text PRIMARY KEY,
  setting_value jsonb,
  created_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_extras      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_costs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_advances    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs          ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbls text[] := ARRAY[
    'profiles','projects','project_payments','project_extras',
    'project_costs','project_commitments','partner_advances',
    'global_settings','audit_logs'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'service_role_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY service_role_all ON public.%I FOR ALL USING (true)', t
      );
    END IF;
  END LOOP;
END $$;
