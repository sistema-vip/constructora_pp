-- Migración: agregar columna archived_at a la tabla projects
-- Ejecutar en Supabase Dashboard > SQL Editor

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_archived_at
  ON projects (archived_at)
  WHERE archived_at IS NULL;
