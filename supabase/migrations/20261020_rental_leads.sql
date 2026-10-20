-- Interesados en rentar el consultorio (formulario de /renta/).
-- El navegador solo puede guardar por la función submit_rental_lead; solo el personal puede leerlos.

CREATE TABLE IF NOT EXISTS public.rental_leads (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL,
    phone             text NOT NULL,
    phone_normalized  text NOT NULL,
    email             text,
    specialty         text,
    license_number    text,
    package           text,
    preferred_hours   text,
    has_patients      text,
    message           text,
    status            text NOT NULL DEFAULT 'Nuevo'
                      CHECK (status IN ('Nuevo', 'Contactado', 'Visita agendada', 'Contrato firmado', 'Descartado')),
    notes             text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rental_leads_created ON public.rental_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS rental_leads_phone ON public.rental_leads (phone_normalized, created_at);
ALTER TABLE public.rental_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rental_leads_select ON public.rental_leads;
CREATE POLICY rental_leads_select ON public.rental_leads FOR SELECT TO authenticated
    USING (public.current_user_role() = ANY (ARRAY['Administrador', 'Recepción']));
DROP POLICY IF EXISTS rental_leads_update ON public.rental_leads;
CREATE POLICY rental_leads_update ON public.rental_leads FOR UPDATE TO authenticated
    USING (public.current_user_role() = ANY (ARRAY['Administrador', 'Recepción']))
    WITH CHECK (public.current_user_role() = ANY (ARRAY['Administrador', 'Recepción']));

CREATE OR REPLACE FUNCTION public.submit_rental_lead(
    p_name text, p_phone text, p_email text DEFAULT NULL, p_specialty text DEFAULT NULL,
    p_license text DEFAULT NULL, p_package text DEFAULT NULL, p_hours text DEFAULT NULL,
    p_has_patients text DEFAULT NULL, p_message text DEFAULT NULL, p_website text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_name  text := btrim(COALESCE(p_name, ''));
    v_phone text := btrim(COALESCE(p_phone, ''));
    v_email text := NULLIF(btrim(COALESCE(p_email, '')), '');
    v_norm  text := public.normalize_phone(p_phone);
BEGIN
    -- Campo oculto: si viene lleno es un bot. Se responde "ok" sin guardar.
    IF NULLIF(btrim(COALESCE(p_website, '')), '') IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true);
    END IF;
    IF char_length(v_name) < 3 OR char_length(v_name) > 120 THEN
        RAISE EXCEPTION 'Escribe tu nombre completo.' USING ERRCODE = '22023';
    END IF;
    IF v_norm IS NULL OR char_length(v_norm) <> 10 OR char_length(v_phone) > 30 THEN
        RAISE EXCEPTION 'Escribe un teléfono de 10 dígitos.' USING ERRCODE = '22023';
    END IF;
    IF v_email IS NOT NULL AND (char_length(v_email) > 160
        OR v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
        RAISE EXCEPTION 'El correo no parece válido.' USING ERRCODE = '22023';
    END IF;
    IF char_length(COALESCE(p_message, '')) > 1000
       OR char_length(COALESCE(p_hours, '')) > 300
       OR char_length(COALESCE(p_specialty, '')) > 100
       OR char_length(COALESCE(p_license, '')) > 30
       OR char_length(COALESCE(p_package, '')) > 60
       OR char_length(COALESCE(p_has_patients, '')) > 60 THEN
        RAISE EXCEPTION 'Alguno de los textos es demasiado largo.' USING ERRCODE = '22023';
    END IF;

    -- Mismo teléfono en las últimas 24 horas: no se duplica.
    IF EXISTS (SELECT 1 FROM rental_leads
               WHERE phone_normalized = v_norm AND created_at > now() - interval '24 hours') THEN
        RETURN jsonb_build_object('ok', true);
    END IF;
    IF (SELECT count(*) FROM rental_leads WHERE created_at > now() - interval '1 hour') >= 30 THEN
        RAISE EXCEPTION 'Recibimos muchas solicitudes. Escríbenos por WhatsApp al 55 7354 1129.'
            USING ERRCODE = '54000';
    END IF;

    INSERT INTO rental_leads (name, phone, phone_normalized, email, specialty, license_number,
                              package, preferred_hours, has_patients, message)
    VALUES (v_name, v_phone, v_norm, v_email,
            NULLIF(btrim(COALESCE(p_specialty, '')), ''),
            NULLIF(btrim(COALESCE(p_license, '')), ''),
            NULLIF(btrim(COALESCE(p_package, '')), ''),
            NULLIF(btrim(COALESCE(p_hours, '')), ''),
            NULLIF(btrim(COALESCE(p_has_patients, '')), ''),
            NULLIF(btrim(COALESCE(p_message, '')), ''));
    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_rental_lead(text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_rental_lead(text, text, text, text, text, text, text, text, text, text) TO anon, authenticated;
REVOKE ALL ON TABLE public.rental_leads FROM anon;
