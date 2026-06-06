-- Migration: Add commitment_id to payable_accounts table

ALTER TABLE public.payable_accounts
  ADD COLUMN IF NOT EXISTS commitment_id uuid REFERENCES public.project_commitments(id) ON DELETE SET NULL;
