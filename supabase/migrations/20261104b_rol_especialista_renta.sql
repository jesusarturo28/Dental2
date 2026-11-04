-- Especialistas que rentan la unidad: solo ven disponibilidad y apartan horas
-- Estefani Amza | Odontología Integral · 4 nov 2026

-- 1) Rol nuevo y liga de cada cuenta con su especialista
INSERT INTO roles (name, description)
VALUES ('Especialista', 'Renta la unidad dental por horas: ve la disponibilidad y aparta o cancela sus propias horas')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS specialist_id uuid REFERENCES specialists(id);

-- 2) Precio de la hora suelta (sin mensualidad): $200 por hora
UPDATE services SET base_price = (duration_minutes / 60) * 200 WHERE category = 'Renta';

-- 3) Servicios: el personal de la clínica ve todos; las especialistas solo las opciones de renta
DROP POLICY IF EXISTS services_select ON services;
CREATE POLICY services_select ON services FOR SELECT TO authenticated
USING (
    current_user_role() = ANY (ARRAY['Administrador', 'Recepción', 'Odontólogo'])
    OR (current_user_role() = 'Especialista' AND category = 'Renta')
);

-- 4) Especialista ligada a la cuenta que inició sesión
CREATE OR REPLACE FUNCTION public.current_specialist_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
    SELECT specialist_id FROM users WHERE auth_user_id = auth.uid() AND active
$$;

-- 5) Calendario de la unidad sin datos de pacientes: solo "Ocupado", "Bloqueado" o "Mi renta"
CREATE OR REPLACE FUNCTION public.get_space_calendar(p_from date, p_to date)
RETURNS TABLE(kind text, appointment_id uuid, day date, start_time time, end_time time, mine boolean, label text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_spec uuid := public.current_specialist_id();
BEGIN
    IF public.current_user_role() IS NULL THEN RAISE EXCEPTION 'No autorizado.'; END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 62 THEN
        RAISE EXCEPTION 'Rango de fechas inválido (máximo 62 días).';
    END IF;
    RETURN QUERY
    SELECT 'cita'::text,
           CASE WHEN a.specialist_id = v_spec THEN a.id END,
           a.appointment_date, a.start_time, a.end_time,
           COALESCE(a.specialist_id = v_spec, false),
           CASE WHEN a.specialist_id = v_spec THEN 'Mi renta' ELSE 'Ocupado' END
    FROM appointments a
    WHERE a.appointment_date BETWEEN p_from AND p_to
      AND public.appointment_holds_slot(a.status)
    UNION ALL
    SELECT 'bloqueo', NULL, (cb.start_datetime AT TIME ZONE 'America/Mexico_City')::date,
           (cb.start_datetime AT TIME ZONE 'America/Mexico_City')::time,
           (cb.end_datetime AT TIME ZONE 'America/Mexico_City')::time,
           false, 'No disponible'
    FROM calendar_blocks cb
    WHERE (cb.specialist_id IS NULL OR cb.specialist_id = v_spec)
      AND (cb.start_datetime AT TIME ZONE 'America/Mexico_City')::date BETWEEN p_from AND p_to
    ORDER BY 3, 4
    LIMIT 2000;
END;
$$;

-- 6) Apartar horas: la especialista solo puede apartar a su nombre y solo horas de renta
CREATE OR REPLACE FUNCTION public.book_space(p_date date, p_start time, p_hours integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
    v_spec uuid := public.current_specialist_id();
    v_service uuid;
    v_id uuid;
BEGIN
    IF public.current_user_role() IS DISTINCT FROM 'Especialista' THEN
        RAISE EXCEPTION 'No autorizado.';
    END IF;
    IF v_spec IS NULL THEN
        RAISE EXCEPTION 'Tu cuenta todavía no está ligada a un especialista. Pide a la administradora que la configure.';
    END IF;
    IF p_hours IS NULL OR p_hours < 1 OR p_hours > 12 THEN
        RAISE EXCEPTION 'Elige entre 1 y 12 horas.';
    END IF;
    IF (p_date + p_start) <= (NOW() AT TIME ZONE 'America/Mexico_City') THEN
        RAISE EXCEPTION 'Elige un horario a futuro.';
    END IF;
    SELECT id INTO v_service FROM services
    WHERE category = 'Renta' AND active AND duration_minutes = p_hours * 60
    LIMIT 1;
    IF v_service IS NULL THEN RAISE EXCEPTION 'No hay renta de % horas disponible.', p_hours; END IF;

    INSERT INTO appointments (patient_id, service_id, specialist_id, appointment_date, start_time, status, notes)
    VALUES (NULL, v_service, v_spec, p_date, p_start, 'Confirmada', 'Apartado por la especialista')
    RETURNING id INTO v_id;
    RETURN v_id;
EXCEPTION WHEN exclusion_violation THEN
    RAISE EXCEPTION 'Ese horario ya no está disponible. Elige otro.' USING ERRCODE = '23P01';
END;
$$;

-- 7) Cancelar una renta propia que todavía no empieza
CREATE OR REPLACE FUNCTION public.cancel_space_booking(p_appointment_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_spec uuid := public.current_specialist_id();
BEGIN
    IF public.current_user_role() IS DISTINCT FROM 'Especialista' OR v_spec IS NULL THEN
        RAISE EXCEPTION 'No autorizado.';
    END IF;
    UPDATE appointments a
    SET status = 'Cancelada por paciente',
        cancellation_reason = COALESCE(NULLIF(btrim(p_reason), ''), 'Cancelada por la especialista')
    WHERE a.id = p_appointment_id
      AND a.specialist_id = v_spec
      AND a.patient_id IS NULL
      AND public.appointment_holds_slot(a.status)
      AND (a.appointment_date + a.start_time) > (NOW() AT TIME ZONE 'America/Mexico_City');
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Solo puedes cancelar tus propias rentas que todavía no empiezan.';
    END IF;
END;
$$;

-- 8) Estas funciones solo las usan cuentas con sesión iniciada
REVOKE EXECUTE ON FUNCTION public.current_specialist_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_space_calendar(date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.book_space(date, time, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_space_booking(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_specialist_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_space_calendar(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.book_space(date, time, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_space_booking(uuid, text) TO authenticated;
