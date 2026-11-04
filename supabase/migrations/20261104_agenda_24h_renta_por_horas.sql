-- Agenda abierta las 24 horas y renta del consultorio por horas
-- Estefani Amza | Odontología Integral · 4 nov 2026

-- 1) Horario de la clínica: todo el día (la última cita debe terminar antes de medianoche)
UPDATE business_hours SET opening_time = '00:00', closing_time = '23:59', active = true;

-- 2) Renta de espacio por horas: un servicio por cada duración (1 a 12 horas).
--    El precio queda en 0 hasta confirmarlo; se puede editar en Servicios.
INSERT INTO services (name, description, category, base_price, duration_minutes, active)
SELECT 'Renta de consultorio · ' || h || (CASE WHEN h = 1 THEN ' hora' ELSE ' horas' END),
       'Renta del espacio a un especialista por horas', 'Renta', 0, h * 60, true
FROM generate_series(1, 12) AS h
WHERE NOT EXISTS (SELECT 1 FROM services s WHERE s.category = 'Renta' AND s.duration_minutes = h * 60);

-- 3) Una renta no lleva paciente; cualquier otra cita sí
ALTER TABLE appointments ALTER COLUMN patient_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.appointments_rental_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
    IF NEW.patient_id IS NULL AND NOT EXISTS (
        SELECT 1 FROM services s WHERE s.id = NEW.service_id AND s.category = 'Renta'
    ) THEN
        RAISE EXCEPTION 'Elige un paciente.';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_appointments_rental_guard ON appointments;
CREATE TRIGGER trg_appointments_rental_guard BEFORE INSERT OR UPDATE ON appointments
FOR EACH ROW EXECUTE FUNCTION public.appointments_rental_guard();

-- 4) Calendario y agenda del día muestran también las rentas (LEFT JOIN a pacientes)
CREATE OR REPLACE FUNCTION public.get_calendar_range(p_from date, p_to date)
 RETURNS TABLE(kind text, item_id uuid, day date, start_time time without time zone, end_time time without time zone, patient_id uuid, patient_name text, service_name text, specialist_id uuid, specialist_name text, status text, is_emergency boolean, reason text)
 LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
BEGIN
    IF public.current_user_role() IS NULL THEN RAISE EXCEPTION 'No autorizado.'; END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 62 THEN
        RAISE EXCEPTION 'Rango de fechas inválido (máximo 62 días).';
    END IF;
    RETURN QUERY
    SELECT 'cita'::text, a.id, a.appointment_date, a.start_time, a.end_time,
           a.patient_id, COALESCE(p.first_name || ' ' || p.last_name, 'Renta de espacio'), sv.name,
           sp.id, sp.name, a.status::text, a.is_emergency, NULL::text
    FROM appointments a
    LEFT JOIN patients p ON p.id = a.patient_id
    JOIN services sv ON sv.id = a.service_id
    JOIN specialists sp ON sp.id = a.specialist_id
    WHERE a.appointment_date BETWEEN p_from AND p_to
      AND (public.appointment_holds_slot(a.status) OR a.status IN ('Atendida','No se presentó'))
    UNION ALL
    SELECT 'bloqueo', cb.id, (cb.start_datetime AT TIME ZONE 'America/Mexico_City')::date,
           (cb.start_datetime AT TIME ZONE 'America/Mexico_City')::time,
           (cb.end_datetime AT TIME ZONE 'America/Mexico_City')::time,
           NULL, NULL, NULL, cb.specialist_id, sp.name, NULL, false, cb.reason
    FROM calendar_blocks cb
    LEFT JOIN specialists sp ON sp.id = cb.specialist_id
    WHERE (cb.start_datetime AT TIME ZONE 'America/Mexico_City')::date BETWEEN p_from AND p_to
    ORDER BY 3, 4
    LIMIT 2000;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_agenda(p_date date DEFAULT NULL::date)
 RETURNS TABLE(appointment_id uuid, start_time time without time zone, end_time time without time zone, patient_id uuid, patient_name text, service_name text, specialist_name text, status appointment_status, is_emergency boolean)
 LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
DECLARE v_date DATE := COALESCE(p_date, (NOW() AT TIME ZONE 'America/Mexico_City')::DATE);
BEGIN
    IF public.current_user_role() IS NULL THEN RAISE EXCEPTION 'No autorizado.'; END IF;
    RETURN QUERY
    SELECT a.id, a.start_time, a.end_time, a.patient_id,
           COALESCE(p.first_name || ' ' || p.last_name, 'Renta de espacio'),
           sv.name, sp.name, a.status, a.is_emergency
    FROM appointments a
    LEFT JOIN patients p ON p.id = a.patient_id
    JOIN services sv ON sv.id = a.service_id
    JOIN specialists sp ON sp.id = a.specialist_id
    WHERE a.appointment_date = v_date AND a.status <> 'Reprogramada'
    ORDER BY a.start_time, sp.name
    LIMIT 100;
END;
$function$;
