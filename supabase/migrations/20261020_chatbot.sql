-- Chatbot del sitio web: límite de uso y registro de solicitudes de cita desde el chat.
-- Ambas funciones solo las puede llamar la función del servidor (service_role), nunca el navegador.

CREATE TABLE IF NOT EXISTS public.chatbot_usage (
    id         bigserial PRIMARY KEY,
    client_key text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chatbot_usage_key_time ON public.chatbot_usage (client_key, created_at);
CREATE INDEX IF NOT EXISTS chatbot_usage_time ON public.chatbot_usage (created_at);
ALTER TABLE public.chatbot_usage ENABLE ROW LEVEL SECURITY;

-- Devuelve true si el visitante todavía puede enviar mensajes y registra el uso.
-- Límites: 30 mensajes por hora por visitante y 600 por hora en total.
CREATE OR REPLACE FUNCTION public.chatbot_allow(p_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    DELETE FROM chatbot_usage WHERE created_at < now() - interval '2 days';
    IF (SELECT count(*) FROM chatbot_usage
        WHERE client_key = p_key AND created_at > now() - interval '1 hour') >= 30
       OR (SELECT count(*) FROM chatbot_usage
           WHERE created_at > now() - interval '1 hour') >= 600 THEN
        RETURN false;
    END IF;
    INSERT INTO chatbot_usage (client_key) VALUES (left(p_key, 100));
    RETURN true;
END;
$$;

-- Guarda una solicitud de cita tomada por el chatbot. Queda como 'Nueva' para que el personal la confirme.
CREATE OR REPLACE FUNCTION public.submit_chat_appointment_request(
    p_name text, p_phone text, p_service text DEFAULT NULL,
    p_preferred text DEFAULT NULL, p_message text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_name   text := btrim(COALESCE(p_name, ''));
    v_phone  text := btrim(COALESCE(p_phone, ''));
    v_norm   text := public.normalize_phone(p_phone);
    v_source uuid;
BEGIN
    IF char_length(v_name) < 2 OR char_length(v_name) > 120 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Falta el nombre completo.');
    END IF;
    IF v_norm IS NULL OR char_length(v_norm) <> 10 OR char_length(v_phone) > 30 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'El teléfono debe tener 10 dígitos.');
    END IF;

    -- Mismo teléfono en las últimas 24 horas: no se duplica.
    IF EXISTS (SELECT 1 FROM appointment_requests
               WHERE origin = 'Chat web' AND contact_phone_normalized = v_norm
                 AND created_at > now() - interval '24 hours') THEN
        RETURN jsonb_build_object('ok', true, 'duplicate', true);
    END IF;
    IF (SELECT count(*) FROM appointment_requests
        WHERE origin = 'Chat web' AND created_at > now() - interval '1 hour') >= 30 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Demasiadas solicitudes; pide al paciente escribir por WhatsApp.');
    END IF;

    SELECT id INTO v_source FROM patient_sources WHERE name = 'Sitio web' AND active LIMIT 1;

    INSERT INTO appointment_requests
        (source_id, message, status, origin, contact_name, contact_phone,
         service_text, preferred_text, source_text)
    VALUES
        (v_source, NULLIF(left(btrim(COALESCE(p_message, '')), 1000), ''), 'Nueva', 'Chat web',
         v_name, v_phone,
         NULLIF(left(btrim(COALESCE(p_service, '')), 100), ''),
         NULLIF(left(btrim(COALESCE(p_preferred, '')), 200), ''),
         'Chatbot del sitio');

    RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.chatbot_allow(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_chat_appointment_request(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chatbot_allow(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_chat_appointment_request(text, text, text, text, text) TO service_role;
