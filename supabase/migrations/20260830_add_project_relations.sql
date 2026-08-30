-- Migración: agregar parent_project_id e is_additional a la tabla projects
-- Ejecutar en Supabase Dashboard > SQL Editor si se desea persistencia en columnas directas

ALTER TABLE projects ADD COLUMN IF NOT EXISTS parent_project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_additional BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_projects_parent_project_id ON projects(parent_project_id);
