-- Tareas de Seguimiento por Proyecto
CREATE TABLE IF NOT EXISTS project_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid REFERENCES projects(id) ON DELETE CASCADE,
  phase         text,
  title         text NOT NULL,
  sort_order    integer DEFAULT 0,
  completed     boolean DEFAULT false,
  completed_at  timestamptz,
  completed_by  uuid,
  notes         text,
  due_date      date,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_project_tasks ON project_tasks FOR ALL TO public USING (true) WITH CHECK (true);

-- Agregar columna notes a projects si no existe
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notes TEXT;
