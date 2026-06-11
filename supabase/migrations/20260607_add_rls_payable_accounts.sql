-- Migration: Add RLS policies for payable_accounts and payable_payments

-- 1. Habilitar seguridad de nivel de fila
ALTER TABLE public.payable_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payable_payments ENABLE ROW LEVEL SECURITY;

-- 2. Limpiar políticas viejas si existen
DROP POLICY IF EXISTS admin_all_payable_accounts ON public.payable_accounts;
DROP POLICY IF EXISTS observer_read_payable_accounts ON public.payable_accounts;
DROP POLICY IF EXISTS admin_all_payable_payments ON public.payable_payments;
DROP POLICY IF EXISTS observer_read_payable_payments ON public.payable_payments;

-- 3. Políticas para payable_accounts (Cuentas por pagar)
CREATE POLICY admin_all_payable_accounts ON public.payable_accounts
  FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY observer_read_payable_accounts ON public.payable_accounts
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'viewer');

-- 4. Políticas para payable_payments (Abonos)
CREATE POLICY admin_all_payable_payments ON public.payable_payments
  FOR ALL TO authenticated
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY observer_read_payable_payments ON public.payable_payments
  FOR SELECT TO authenticated
  USING (public.get_my_role() = 'viewer');
