-- Tabla de solicitudes de acceso al sistema
CREATE TABLE IF NOT EXISTS public.access_requests (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL,
  message       text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  reviewed_at   timestamptz,
  reviewed_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Índice para búsquedas frecuentes por estado y email
CREATE INDEX IF NOT EXISTS idx_access_requests_status ON public.access_requests(status);
CREATE INDEX IF NOT EXISTS idx_access_requests_email  ON public.access_requests(email);

-- RLS: Activar seguridad a nivel de fila
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- Política: cualquier persona (incluso sin cuenta) puede INSERTAR una solicitud
CREATE POLICY "Anyone can submit access request"
  ON public.access_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Política: solo admins autenticados pueden VER solicitudes
CREATE POLICY "Admins can view access requests"
  ON public.access_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- Política: solo admins autenticados pueden ACTUALIZAR solicitudes (aprobar/rechazar)
CREATE POLICY "Admins can update access requests"
  ON public.access_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
