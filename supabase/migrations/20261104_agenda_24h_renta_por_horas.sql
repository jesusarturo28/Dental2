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

-- 5) Un solo sillón: dos citas o rentas nunca se cruzan, sin importar la especialista
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_no_overlap;
ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap
    EXCLUDE USING gist (tsrange(appointment_date + start_time, appointment_date + end_time, '[)') WITH &&)
    WHERE (public.appointment_holds_slot(status));

-- 6) Horarios libres: se descuenta cualquier cita del sillón, no solo las de esa especialista
CREATE OR REPLACE FUNCTION public.get_available_slots(p_specialist_id uuid, p_service_id uuid, p_date date, p_step_minutes integer DEFAULT 30, p_exclude_appointment_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(slot_start time without time zone, slot_end time without time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_duration INTEGER;
    v_now TIMESTAMP := (NOW() AT TIME ZONE 'America/Mexico_City');
BEGIN
    IF public.current_user_role() IS NULL THEN
        RAISE EXCEPTION 'No autorizado.';
    END IF;
    IF p_step_minutes IS NULL OR p_step_minutes <= 0 THEN
        RAISE EXCEPTION 'Intervalo inválido.';
    END IF;

    SELECT s.duration_minutes INTO v_duration FROM services s WHERE s.id = p_service_id AND s.active;
    IF v_duration IS NULL THEN RAISE EXCEPTION 'Servicio no encontrado o inactivo.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM specialists sp WHERE sp.id = p_specialist_id AND sp.active) THEN
        RAISE EXCEPTION 'Especialista no encontrado o inactivo.';
    END IF;

    RETURN QUERY
    SELECT g.ts::TIME, (g.ts + make_interval(mins => v_duration))::TIME
    FROM business_hours bh
    CROSS JOIN LATERAL generate_series(
        p_date + bh.opening_time,
        p_date + bh.closing_time - make_interval(mins => v_duration),
        make_interval(mins => p_step_minutes)
    ) AS g(ts)
    WHERE bh.active
      AND bh.day_of_week = EXTRACT(DOW FROM p_date)::INT
      AND g.ts > v_now
      AND NOT EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.appointment_date = p_date
            AND public.appointment_holds_slot(a.status)
            AND a.id IS DISTINCT FROM p_exclude_appointment_id
            AND (a.appointment_date + a.start_time) < g.ts + make_interval(mins => v_duration)
            AND (a.appointment_date + a.end_time)   > g.ts
      )
      AND NOT EXISTS (
          SELECT 1 FROM calendar_blocks cb
          WHERE (cb.specialist_id IS NULL OR cb.specialist_id = p_specialist_id)
            AND cb.start_datetime < ((g.ts + make_interval(mins => v_duration)) AT TIME ZONE 'America/Mexico_City')
            AND cb.end_datetime   > (g.ts AT TIME ZONE 'America/Mexico_City')
      )
    ORDER BY g.ts;
END;
$function$;
