-- SQL de Backfill: Generar cuentas por pagar para compromisos huérfanos
-- Este script toma todos los compromisos existentes en la base de datos
-- que NO tienen una cuenta por pagar asociada, y las crea automáticamente.

INSERT INTO payable_accounts (name, type, total_amount_usd, project_id, commitment_id, description, status)
SELECT 
  COALESCE(pc.provider, 'Proveedor sin nombre'),
  CASE pc.category
    WHEN 'materials' THEN 'proveedor'
    WHEN 'labor' THEN 'obrero'
    WHEN 'equipment' THEN 'alquiler'
    WHEN 'subcontract' THEN 'subcontratista'
    ELSE 'otro'
  END,
  pc.amount_usd,
  pc.project_id,
  pc.id,
  pc.description,
  'active'
FROM project_commitments pc
WHERE NOT EXISTS (
  SELECT 1 FROM payable_accounts pa WHERE pa.commitment_id = pc.id
);
