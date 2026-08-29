-- Tabla de Anteproyectos (Pre-Project Planning)
CREATE TABLE IF NOT EXISTS pre_projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid REFERENCES clients(id),
  title           text NOT NULL,
  status          text DEFAULT 'draft',  -- 'draft' | 'ready' | 'converted'
  created_by      uuid,
  
  -- Análisis técnico
  technical_analysis  jsonb DEFAULT '{}'::jsonb,
  
  -- Planificación día a día
  daily_plan      jsonb DEFAULT '[]'::jsonb,
  
  -- Estructura logística
  logistics       jsonb DEFAULT '{}'::jsonb,
  
  -- Estructura de costos
  cost_structure  jsonb DEFAULT '{}'::jsonb,
  
  -- Cálculo de materiales
  material_calculations jsonb DEFAULT '[]'::jsonb,
  
  -- Metadata
  notes           text,
  converted_project_id uuid REFERENCES projects(id),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE pre_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_pre_projects ON pre_projects FOR ALL TO public USING (true) WITH CHECK (true);
