-- Migration: Create payable_accounts and payable_payments tables

CREATE TABLE IF NOT EXISTS public.payable_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  description text,
  total_amount_usd numeric NOT NULL DEFAULT 0,
  project_id uuid,
  contact_info text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payable_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT payable_accounts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.payable_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payable_account_id uuid NOT NULL,
  amount_usd numeric NOT NULL,
  description text,
  reference text,
  date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payable_payments_pkey PRIMARY KEY (id),
  CONSTRAINT payable_payments_account_id_fkey FOREIGN KEY (payable_account_id) REFERENCES public.payable_accounts (id) ON DELETE CASCADE
);

-- RLS Policies (Assuming mostly open for authenticated users based on current app style, but we can enable RLS and add basic policies if needed. For now, we will create the tables).
