-- Una especialista desactivada desde el panel (Equipo → Especialistas) ya no puede apartar horas
CREATE OR REPLACE FUNCTION public.book_space(p_date date, p_start time without time zone, p_hours integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- FOR SHARE: si Administración la desactiva al mismo tiempo, una operación espera a la otra
    PERFORM 1 FROM specialists WHERE id = v_spec AND active FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tu perfil de especialista está desactivado. Pide a la administradora que lo reactive.';
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
$function$;
