/* Página del personal | Estefani Amza Odontología Integral
 * Usa Supabase con la clave publicable. La seguridad real está en la base de datos:
 * cada consulta respeta el rol de quien inició sesión (RLS y validaciones en funciones).
 */
(function () {
    'use strict';

    const SUPABASE_URL = 'https://poqkhcwkbjsvbvttyghc.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_oI5y_BS3duhQOeDqDZdZbQ_LpjE5m_j';
    const TZ = 'America/Mexico_City';
    const WA_CLINIC = '525573541129';

    // Hay que leer el enlace del correo (invitación o recuperación) antes de que Supabase lo limpie
    const INITIAL_HASH = window.location.hash || '';
    // Se lee como parámetros: el enlace trae "token_type=bearer" y "type=recovery", y solo importa el segundo
    const LINK_PARAMS = new URLSearchParams(INITIAL_HASH.replace(/^#/, ''));
    const LINK_TYPE = LINK_PARAMS.get('type') || '';
    const LINK_ERROR = LINK_PARAMS.get('error_description') || '';

    const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    const state = {
        role: null, me: null, tab: 'inicio',
        services: [], specialists: [], sources: [],
        agendaDate: null, quoteStatus: '', patientQuery: '',
        calMonth: null, calDay: null, calSpecialist: '',
        rentaFilter: 'activos'
    };

    const OPEN_STATUSES = ['Solicitud nueva', 'Pendiente de confirmar', 'Confirmada'];

    // ------------------------------------------------------------------
    // Utilidades
    // ------------------------------------------------------------------
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    function esc(v) {
        return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function todayMX() {
        return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
    }

    function addDays(iso, n) {
        const d = new Date(iso + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().slice(0, 10);
    }

    function fmtDate(iso, opts) {
        if (!iso) return '—';
        const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
        return new Intl.DateTimeFormat('es-MX', Object.assign({ timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }, opts || {})).format(d);
    }

    function fmtDateLong(iso) {
        return fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    function fmtDateTime(ts) {
        if (!ts) return '—';
        return new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
    }

    const fmtTime = t => (t ? String(t).slice(0, 5) : '');
    const money = n => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pct = n => (n === null || n === undefined ? '—' : Number(n).toLocaleString('es-MX', { maximumFractionDigits: 1 }) + '%');
    const digits = s => String(s || '').replace(/\D/g, '').slice(-10);

    function waLink(phone, text) {
        const d = digits(phone);
        if (d.length !== 10) return '';
        return 'https://wa.me/52' + d + (text ? '?text=' + encodeURIComponent(text) : '');
    }

    function canEdit() { return state.role === 'Administrador' || state.role === 'Recepción'; }
    function isAdmin() { return state.role === 'Administrador'; }

    function toast(msg, type) {
        const el = document.createElement('div');
        el.className = 'toast ' + (type || '');
        el.setAttribute('role', 'status');
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), type === 'error' ? 6000 : 3200);
    }

    function errMsg(e) {
        if (!e) return 'Ocurrió un error.';
        const m = e.message || String(e);
        if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión. Revisa tu internet e intenta de nuevo.';
        // Mensajes de inicio de sesión de Supabase, en español
        if (e.code === 'over_email_send_rate_limit' || /rate limit|only request this after/i.test(m))
            return 'Ya se enviaron varios correos seguidos. Espera alrededor de una hora antes de pedir otro.';
        if (e.code === 'same_password' || /different from the old/i.test(m)) return 'La contraseña nueva debe ser distinta a la anterior.';
        if (e.code === 'weak_password' || /weak|at least \d+ characters/i.test(m)) return 'La contraseña es muy débil. Usa al menos 10 caracteres y combina letras y números.';
        if (e.code === 'reauthentication_needed') return 'Por seguridad, cierra sesión y vuelve a entrar antes de cambiar la contraseña.';
        if (e.code === 'session_not_found' || /Auth session missing/i.test(m)) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
        return m;
    }

    async function rpc(name, args) {
        const { data, error } = await sb.rpc(name, args || {});
        if (error) throw error;
        return data;
    }

    async function q(promise) {
        const { data, error } = await promise;
        if (error) throw error;
        return data;
    }

    // Une acciones a botones con data-act dentro de root
    function bind(root, handlers) {
        $$('[data-act]', root).forEach(el => {
            const fn = handlers[el.dataset.act];
            if (!fn) return;
            el.addEventListener('click', ev => {
                ev.preventDefault();
                ev.stopPropagation();
                fn(el, ev);
            });
        });
    }

    // Botón ocupado mientras corre una acción
    async function busy(btn, fn) {
        if (btn) btn.disabled = true;
        try { return await fn(); }
        finally { if (btn) btn.disabled = false; }
    }

    function storeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function storeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }

    // ------------------------------------------------------------------
    // Ventana (modal)
    // ------------------------------------------------------------------
    function openModal(title, html) {
        const root = $('#modal-root');
        const back = document.createElement('div');
        back.className = 'modal-back';
        back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
            <div class="modal-head"><h2>${esc(title)}</h2><button class="close-x" aria-label="Cerrar">&times;</button></div>
            <div class="modal-body">${html}</div></div>`;
        root.appendChild(back);
        const close = () => back.remove();
        $('.close-x', back).addEventListener('click', close);
        back.addEventListener('mousedown', ev => { if (ev.target === back) close(); });
        // Enfoca el primer campo visible (no los que están ocultos dentro de la ventana)
        const first = $$('input:not([type=hidden]), select, textarea', back).find(el => el.offsetParent !== null);
        if (first) first.focus();
        return { el: back, body: $('.modal-body', back), close };
    }

    function confirmBox(title, text, okLabel, danger) {
        return new Promise(resolve => {
            const m = openModal(title, `<p>${esc(text)}</p><div class="actions">
                <button class="btn ${danger ? 'btn-bad' : 'btn-primary'}" data-act="ok">${esc(okLabel || 'Aceptar')}</button>
                <button class="btn btn-ghost" data-act="no">Cancelar</button></div>`);
            bind(m.body, { ok: () => { m.close(); resolve(true); }, no: () => { m.close(); resolve(false); } });
            $('.close-x', m.el).addEventListener('click', () => resolve(false));
        });
    }

    // ------------------------------------------------------------------
    // Acceso
    // ------------------------------------------------------------------
    function showAuth(which) {
        $('#app').classList.add('hidden');
        $('#auth').classList.remove('hidden');
        ['login-form', 'forgot-form', 'password-form', 'no-access'].forEach(id => $('#' + id).classList.toggle('hidden', id !== which));
    }

    $('#login-form').addEventListener('submit', async ev => {
        ev.preventDefault();
        const err = $('#login-error');
        err.textContent = '';
        const btn = $('button[type=submit]', ev.target);
        await busy(btn, async () => {
            const { error } = await sb.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-pass').value });
            if (error) {
                err.textContent = /invalid/i.test(error.message) ? 'Correo o contraseña incorrectos.' : errMsg(error);
                return;
            }
            await startApp();
        });
    });

    $('#show-forgot').addEventListener('click', () => {
        $('#forgot-email').value = $('#login-email').value;
        showAuth('forgot-form');
    });
    $('#back-login').addEventListener('click', () => showAuth('login-form'));

    $('#forgot-form').addEventListener('submit', async ev => {
        ev.preventDefault();
        const err = $('#forgot-error');
        err.textContent = '';
        await busy($('button[type=submit]', ev.target), async () => {
            const { error } = await sb.auth.resetPasswordForEmail($('#forgot-email').value.trim(), {
                redirectTo: window.location.origin + window.location.pathname
            });
            if (error) { err.textContent = errMsg(error); return; }
            toast('Listo. Si el correo está registrado, te llegará un enlace en unos minutos.', 'ok');
            showAuth('login-form');
        });
    });

    $('#password-form').addEventListener('submit', async ev => {
        ev.preventDefault();
        const err = $('#password-error');
        err.textContent = '';
        const p1 = $('#new-pass').value, p2 = $('#new-pass2').value;
        if (p1.length < 10) { err.textContent = 'La contraseña debe tener al menos 10 caracteres.'; return; }
        if (p1 !== p2) { err.textContent = 'Las contraseñas no coinciden.'; return; }
        await busy($('button[type=submit]', ev.target), async () => {
            const { error } = await sb.auth.updateUser({ password: p1 });
            if (error) { err.textContent = errMsg(error); return; }
            toast('Contraseña guardada.', 'ok');
            history.replaceState(null, '', window.location.pathname);
            await startApp();
        });
    });

    async function logout() {
        await sb.auth.signOut();
        state.role = null;
        state.me = null;
        $('#view').innerHTML = '';
        showAuth('login-form');
    }
    $('#logout').addEventListener('click', logout);

    // Cambiar contraseña estando dentro (no necesita correo)
    $('#change-pass').addEventListener('click', () => {
        const m = openModal('Cambiar contraseña', `<form id="cp">
            <p class="muted small">Usa al menos 10 caracteres. Evita contraseñas que uses en otros sitios.</p>
            <div class="field"><label>Contraseña nueva</label><input name="p1" type="password" autocomplete="new-password" minlength="10" required></div>
            <div class="field"><label>Repite la contraseña</label><input name="p2" type="password" autocomplete="new-password" minlength="10" required></div>
            <p class="form-error" id="cp-error"></p>
            <div class="actions"><button class="btn btn-primary" type="submit">Guardar contraseña</button><button class="btn btn-ghost" type="button" data-act="close">Cancelar</button></div></form>`);
        bind(m.body, { close: () => m.close() });
        $('#cp', m.body).addEventListener('submit', ev => {
            ev.preventDefault();
            const f = ev.target, err = $('#cp-error', m.body);
            err.textContent = '';
            if (f.p1.value.length < 10) { err.textContent = 'La contraseña debe tener al menos 10 caracteres.'; return; }
            if (f.p1.value !== f.p2.value) { err.textContent = 'Las contraseñas no coinciden.'; return; }
            busy($('button[type=submit]', f), async () => {
                const { error } = await sb.auth.updateUser({ password: f.p1.value });
                if (error) { err.textContent = errMsg(error); return; }
                m.close();
                toast('Contraseña guardada. Úsala la próxima vez que entres.', 'ok');
            });
        });
    });
    $('#no-access-logout').addEventListener('click', logout);

    sb.auth.onAuthStateChange(event => {
        if (event === 'PASSWORD_RECOVERY') showAuth('password-form');
        if (event === 'SIGNED_OUT' && !$('#app').classList.contains('hidden')) showAuth('login-form');
    });

    // ------------------------------------------------------------------
    // Arranque de la aplicación
    // ------------------------------------------------------------------
    const TABS = [
        { id: 'inicio', label: 'Inicio', roles: 'all' },
        { id: 'solicitudes', label: 'Solicitudes', roles: 'edit' },
        { id: 'agenda', label: 'Agenda', roles: 'all' },
        { id: 'calendario', label: 'Calendario', roles: 'all' },
        { id: 'pacientes', label: 'Pacientes', roles: 'all' },
        { id: 'cotizaciones', label: 'Cotizaciones', roles: 'all' },
        { id: 'seguimientos', label: 'Seguimientos', roles: 'edit' },
        { id: 'renta', label: 'Renta', roles: 'edit' },
        { id: 'equipo', label: 'Equipo', roles: 'admin' }
    ];

    async function startApp() {
        let role;
        try { role = await rpc('current_user_role'); }
        catch (e) { showAuth('login-form'); $('#login-error').textContent = errMsg(e); return; }
        if (!role) { showAuth('no-access'); return; }
        state.role = role;

        const { data: { user } } = await sb.auth.getUser();
        try {
            state.me = await q(sb.from('users').select('id,name,email').eq('auth_user_id', user.id).maybeSingle());
        } catch (e) { state.me = null; }
        $('#user-name').textContent = (state.me && state.me.name) || (user && user.email) || '';
        $('#user-role').textContent = role;

        await loadCatalogs();

        $('#auth').classList.add('hidden');
        $('#app').classList.remove('hidden');
        state.agendaDate = state.agendaDate || todayMX();
        const saved = storeGet('personal_tab');
        const visible = visibleTabs().map(t => t.id);
        state.tab = visible.includes(saved) ? saved : 'inicio';
        renderTabs();
        go(state.tab);
        refreshRequestCount();
    }

    async function loadCatalogs() {
        try {
            const [services, specialists, sources] = await Promise.all([
                q(sb.from('services').select('id,name,category,base_price,duration_minutes,sessions_min,sessions_max,sessions_note,active').eq('active', true).order('category').order('name')),
                q(sb.from('specialists').select('id,name,specialty,active').eq('active', true).order('name')),
                q(sb.from('patient_sources').select('id,name').eq('active', true).order('name'))
            ]);
            state.services = services || [];
            state.specialists = specialists || [];
            state.sources = sources || [];
        } catch (e) {
            toast('No se pudieron cargar los catálogos: ' + errMsg(e), 'error');
        }
    }

    function visibleTabs() {
        return TABS.filter(t => t.roles === 'all' || (t.roles === 'edit' && canEdit()) || (t.roles === 'admin' && isAdmin()));
    }

    function renderTabs() {
        const nav = $('#tabs');
        nav.innerHTML = visibleTabs().map(t =>
            `<button class="tab ${t.id === state.tab ? 'active' : ''}" data-tab="${t.id}">${esc(t.label)}${t.id === 'solicitudes' ? '<span class="count hidden" id="req-count"></span>' : ''}</button>`
        ).join('');
        $$('.tab', nav).forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));
    }

    async function refreshRequestCount() {
        if (!canEdit()) return;
        try {
            const rows = await rpc('get_open_requests', { p_limit: 200 });
            const el = $('#req-count');
            if (!el) return;
            const n = (rows || []).length;
            el.textContent = n;
            el.classList.toggle('hidden', n === 0);
        } catch (e) { /* el contador es opcional */ }
    }

    function go(tab) {
        state.tab = tab;
        storeSet('personal_tab', tab);
        $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        window.scrollTo(0, 0);
        const view = $('#view');
        view.innerHTML = '<p class="loading">Cargando…</p>';
        const fn = { inicio: renderInicio, solicitudes: renderSolicitudes, agenda: renderAgenda, calendario: renderCalendario, pacientes: renderPacientes, cotizaciones: renderCotizaciones, seguimientos: renderSeguimientos, renta: renderRenta, equipo: renderEquipo }[tab];
        Promise.resolve(fn(view)).catch(e => {
            view.innerHTML = `<div class="note">No se pudo cargar esta sección: ${esc(errMsg(e))}</div>
                <button class="btn" id="retry">Intentar de nuevo</button>`;
            $('#retry').addEventListener('click', () => go(tab));
        });
    }

    // ------------------------------------------------------------------
    // Componentes compartidos
    // ------------------------------------------------------------------
    function statusChip(s) {
        const map = {
            'Confirmada': 'ok', 'Atendida': 'ok', 'Aceptada': 'ok', 'Completado': 'ok', 'Convertida en cita': 'ok', 'Activo': 'ok',
            'Pendiente de confirmar': 'warn', 'Solicitud nueva': 'warn', 'Nueva': 'warn', 'Pendiente': 'warn', 'Enviada': 'info', 'En seguimiento': 'info', 'En proceso': 'info', 'En revisión': 'info',
            'Cancelada por paciente': 'bad', 'Cancelada por clínica': 'bad', 'No se presentó': 'bad', 'Rechazada': 'bad', 'Vencida': 'bad', 'Descartada': 'gray', 'Cancelado': 'gray',
            'Reprogramada': 'gray', 'Borrador': 'gray', 'Inactivo': 'gray',
            'Nuevo': 'warn', 'Contactado': 'info', 'Visita agendada': 'info', 'Contrato firmado': 'ok', 'Descartado': 'gray'
        };
        return `<span class="chip ${map[s] || ''}">${esc(s)}</span>`;
    }

    function serviceOptions(selected) {
        let html = '<option value="">Selecciona un servicio</option>';
        let cat = null;
        state.services.forEach(s => {
            if (s.category !== cat) {
                if (cat !== null) html += '</optgroup>';
                cat = s.category;
                html += `<optgroup label="${esc(cat || 'Otros')}">`;
            }
            html += `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)} · ${esc(s.duration_minutes)} min${sessionsLabel(s) ? ' · ' + esc(sessionsLabel(s)) : ''} · ${money(s.base_price)}</option>`;
        });
        if (cat !== null) html += '</optgroup>';
        return html;
    }

    function sessionsLabel(s) {
        if (s.sessions_note) return s.sessions_note;
        if (!s.sessions_min) return '';
        const a = s.sessions_min, b = s.sessions_max || a;
        const n = a === b ? String(a) : a + ' a ' + b;
        return n + (b === 1 ? ' sesión' : ' sesiones');
    }

    function specialistOptions(selected) {
        return '<option value="">Selecciona un especialista</option>' + state.specialists.map(s =>
            `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}${s.specialty ? ' · ' + esc(s.specialty) : ''}</option>`).join('');
    }

    function sourceOptions(selected) {
        return '<option value="">Sin fuente</option>' + state.sources.map(s =>
            `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    }

    // Buscador de pacientes dentro de un formulario. Devuelve una función que da el id elegido.
    function patientPicker(container, preset) {
        container.innerHTML = `<label>Paciente</label>
            <div class="pp-chosen ${preset ? '' : 'hidden'}" style="display:flex;gap:.5rem;align-items:center;margin-bottom:.4rem">
                <strong class="pp-name">${esc(preset ? preset.name : '')}</strong>
                <button type="button" class="link-btn pp-change">Cambiar</button></div>
            <div class="pp-search ${preset ? 'hidden' : ''}">
                <input type="search" class="pp-input" placeholder="Busca por nombre o teléfono" autocomplete="off">
                <div class="pp-results" style="margin-top:.4rem"></div></div>`;
        let chosen = preset ? preset.id : null;
        const input = $('.pp-input', container), results = $('.pp-results', container);
        let timer;
        input.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(async () => {
                const term = input.value.trim();
                if (term.length < 2) { results.innerHTML = ''; return; }
                try {
                    const rows = await rpc('search_patients', { p_query: term, p_status: 'Activo', p_limit: 8 });
                    results.innerHTML = (rows || []).length ? rows.map(r =>
                        `<button type="button" class="slot" data-id="${r.id}" data-name="${esc(r.first_name + ' ' + r.last_name)}">${esc(r.first_name + ' ' + r.last_name)} · ${esc(r.phone)}</button>`).join(' ')
                        : '<p class="muted small">Sin resultados. Primero registra al paciente en Pacientes.</p>';
                    $$('button', results).forEach(b => b.addEventListener('click', () => {
                        chosen = b.dataset.id;
                        $('.pp-name', container).textContent = b.dataset.name;
                        $('.pp-chosen', container).classList.remove('hidden');
                        $('.pp-search', container).classList.add('hidden');
                    }));
                } catch (e) { results.innerHTML = `<p class="form-error">${esc(errMsg(e))}</p>`; }
            }, 250);
        });
        $('.pp-change', container).addEventListener('click', () => {
            chosen = null;
            $('.pp-chosen', container).classList.add('hidden');
            $('.pp-search', container).classList.remove('hidden');
            input.focus();
        });
        return () => chosen;
    }

    // ------------------------------------------------------------------
    // INICIO
    // ------------------------------------------------------------------
    async function renderInicio(view) {
        const kind = storeGet('personal_period') || 'hoy';
        view.innerHTML = `<div class="toolbar"><h2>Resumen</h2>
            <select id="period" aria-label="Periodo">
                <option value="hoy">Hoy</option><option value="semana">Esta semana</option><option value="mes">Este mes</option></select></div>
            <div id="kpis"><p class="loading">Cargando…</p></div>
            <h2 style="margin-top:1.4rem">Agenda de hoy</h2><div id="today"></div>`;
        const sel = $('#period');
        sel.value = kind;
        sel.addEventListener('change', () => { storeSet('personal_period', sel.value); loadKpis(sel.value); });
        await Promise.all([loadKpis(kind), loadTodayAgenda()]);
    }

    async function loadKpis(kind) {
        const box = $('#kpis');
        if (!box) return;
        try {
            const per = (await rpc('dashboard_period', { p_kind: kind }))[0];
            const k = (await rpc('get_dashboard_kpis', { p_from: per.period_from, p_to: per.period_to }))[0];
            const card = (label, value, hint) => `<div class="kpi"><div class="label">${esc(label)}</div><div class="value">${value}</div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
            box.innerHTML = `<p class="muted small">Del ${esc(fmtDate(k.periodo_desde))} al ${esc(fmtDate(k.periodo_hasta))}</p><div class="kpis">
                ${card('Citas', k.total_citas, `${k.citas_confirmadas} confirmadas · ${k.citas_pendientes} por confirmar`)}
                ${card('Pacientes atendidos', `${k.pacientes_atendidos}<span class="muted" style="font-size:1rem"> / ${k.meta_periodo}</span>`, `Meta: ${k.meta_diaria} al día · ${pct(k.cumplimiento_pct)}`)}
                ${card('Ocupación de agenda', pct(k.ocupacion_pct), `${k.minutos_ocupados} de ${k.minutos_disponibles} min`)}
                ${canEdit() ? card('Solicitudes por atender', k.solicitudes_nuevas_actual + k.solicitudes_en_revision_actual, `${k.solicitudes_nuevas_actual} nuevas · ${k.solicitudes_en_revision_actual} en revisión`) : ''}
                ${card('Por confirmar', k.pendientes_confirmar_actual, 'Citas próximas sin confirmar')}
                ${card('Citas sin cerrar', k.citas_sin_cerrar, 'Días pasados sin marcar resultado')}
                ${canEdit() ? card('Seguimientos', k.seguimientos_pendientes, `${k.seguimientos_vencidos} vencidos`) : ''}
                ${card('Pacientes nuevos', k.pacientes_nuevos, `${k.pacientes_recurrentes} recurrentes`)}
                ${card('Cotizaciones', `${k.cotizaciones_aceptadas}<span class="muted" style="font-size:1rem"> / ${k.cotizaciones_enviadas}</span>`, `Aceptadas / enviadas · ${money(k.valor_aceptado)}`)}
                ${card('Cancelaciones', k.citas_canceladas, `${k.no_shows} no se presentaron`)}
            </div>`;
        } catch (e) {
            box.innerHTML = `<div class="note">${esc(errMsg(e))}</div>`;
        }
    }

    async function loadTodayAgenda() {
        const box = $('#today');
        if (!box) return;
        const rows = await rpc('get_dashboard_agenda', { p_date: todayMX() });
        box.innerHTML = (rows || []).length ? rows.map(agendaCard).join('') : '<div class="empty">No hay citas para hoy.</div>';
        bindAgenda(box, loadTodayAgenda);
    }

    // ------------------------------------------------------------------
    // SOLICITUDES DEL SITIO
    // ------------------------------------------------------------------
    async function renderSolicitudes(view) {
        const rows = await rpc('get_open_requests', { p_limit: 100 });
        view.innerHTML = `<div class="toolbar"><h2>Solicitudes de cita</h2>
            <button class="btn btn-ghost btn-sm" data-act="reload">Actualizar</button></div>
            <p class="muted small">Llegan del formulario del sitio web. Liga cada una a un paciente y agéndala, o descártala.</p>
            <div id="req-list">${(rows || []).length ? rows.map(requestCard).join('') : '<div class="empty">No hay solicitudes pendientes. 🎉</div>'}</div>`;
        const el = $('#req-count');
        if (el) { el.textContent = rows.length; el.classList.toggle('hidden', rows.length === 0); }

        const byId = Object.fromEntries((rows || []).map(r => [r.id, r]));
        bind(view, {
            reload: () => go('solicitudes'),
            review: btn => busy(btn, async () => {
                try {
                    await q(sb.from('appointment_requests').update({ status: 'En revisión' }).eq('id', btn.dataset.id));
                    go('solicitudes');
                } catch (e) { toast(errMsg(e), 'error'); }
            }),
            discard: async btn => {
                if (!await confirmBox('Descartar solicitud', 'La solicitud se marcará como descartada y saldrá de la lista.', 'Descartar', true)) return;
                try {
                    await q(sb.from('appointment_requests').update({ status: 'Descartada' }).eq('id', btn.dataset.id));
                    toast('Solicitud descartada.');
                    go('solicitudes');
                } catch (e) { toast(errMsg(e), 'error'); }
            },
            link: btn => linkExistingModal(byId[btn.dataset.id]),
            create: btn => {
                const r = byId[btn.dataset.id];
                patientModal(null, requestToPatient(r), async newId => {
                    await rpc('link_request_to_patient', { p_request_id: r.id, p_patient_id: newId });
                    toast('Paciente creado y ligado a la solicitud.', 'ok');
                    go('solicitudes');
                });
            },
            schedule: btn => {
                const r = byId[btn.dataset.id];
                appointmentModal({ requestId: r.id, patient: { id: r.patient_id, name: r.contact_name }, note: [r.service_text, r.preferred_text].filter(Boolean).join(' · '), onDone: () => go('solicitudes') });
            },
            patient: btn => openPatient(btn.dataset.id)
        });
    }

    function requestCard(r) {
        const wa = waLink(r.contact_phone, `Hola ${r.contact_name || ''}, te escribimos de Estefani Amza | Odontología Integral por tu solicitud de cita.`);
        const possible = (r.possible_patient_ids || []).length;
        return `<div class="card">
            <div class="card-head"><h3>${esc(r.contact_name || 'Sin nombre')}</h3>${statusChip(r.status)}</div>
            <div class="meta">
                <span>📱 ${esc(r.contact_phone || '—')}</span>
                ${r.service_text ? `<span>🦷 ${esc(r.service_text)}</span>` : ''}
                ${r.preferred_text ? `<span>📅 ${esc(r.preferred_text)}</span>` : ''}
                ${r.source_text ? `<span>📢 ${esc(r.source_text)}</span>` : ''}
                <span class="muted">Recibida ${esc(fmtDateTime(r.created_at))}</span>
            </div>
            ${r.message ? `<p>💬 ${esc(r.message)}</p>` : ''}
            ${r.patient_id ? `<p class="small">Ligada al paciente: <button class="link-btn" data-act="patient" data-id="${r.patient_id}">ver ficha</button></p>`
                : possible ? `<div class="note info">Este teléfono ya está registrado en ${possible} paciente${possible > 1 ? 's' : ''}. Lígala para no duplicar.</div>` : ''}
            <div class="actions">
                ${wa ? `<a class="btn btn-wa btn-sm" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
                ${r.patient_id ? `<button class="btn btn-primary btn-sm" data-act="schedule" data-id="${r.id}">Agendar cita</button>`
                    : `${possible ? `<button class="btn btn-primary btn-sm" data-act="link" data-id="${r.id}">Ligar a paciente existente</button>` : ''}
                       <button class="btn ${possible ? '' : 'btn-primary'} btn-sm" data-act="create" data-id="${r.id}">Crear paciente</button>`}
                ${r.status === 'Nueva' ? `<button class="btn btn-sm" data-act="review" data-id="${r.id}">Marcar en revisión</button>` : ''}
                <button class="btn btn-ghost btn-sm" data-act="discard" data-id="${r.id}">Descartar</button>
            </div></div>`;
    }

    function requestToPatient(r) {
        const parts = String(r.contact_name || '').trim().split(/\s+/).filter(Boolean);
        let first = parts.join(' '), last = '';
        if (parts.length >= 3) { first = parts.slice(0, parts.length - 2).join(' '); last = parts.slice(-2).join(' '); }
        else if (parts.length === 2) { first = parts[0]; last = parts[1]; }
        const src = state.sources.find(s => s.id === r.source_id);
        return { first_name: first, last_name: last, phone: r.contact_phone || '', whatsapp: '', email: r.contact_email || '', source_id: src ? src.id : null };
    }

    async function linkExistingModal(r) {
        let patients = [];
        try {
            patients = await q(sb.from('patients').select('id,first_name,last_name,phone,email').in('id', r.possible_patient_ids));
        } catch (e) { toast(errMsg(e), 'error'); return; }
        const m = openModal('Ligar a paciente existente', `<p class="muted">Elige el paciente que corresponde a <strong>${esc(r.contact_name)}</strong> (${esc(r.contact_phone)}).</p>
            ${patients.map(p => `<div class="card"><div class="card-head"><h3>${esc(p.first_name + ' ' + p.last_name)}</h3>
                <button class="btn btn-primary btn-sm" data-act="pick" data-id="${p.id}">Ligar</button></div>
                <div class="meta"><span>📱 ${esc(p.phone)}</span>${p.email ? `<span>✉️ ${esc(p.email)}</span>` : ''}</div></div>`).join('')}`);
        bind(m.body, {
            pick: btn => busy(btn, async () => {
                try {
                    await rpc('link_request_to_patient', { p_request_id: r.id, p_patient_id: btn.dataset.id });
                    m.close();
                    toast('Solicitud ligada al paciente.', 'ok');
                    go('solicitudes');
                } catch (e) { toast(errMsg(e), 'error'); }
            })
        });
    }

    // ------------------------------------------------------------------
    // PACIENTES
    // ------------------------------------------------------------------
    async function renderPacientes(view) {
        view.innerHTML = `<div class="toolbar"><h2>Pacientes</h2>
            <input type="search" id="p-search" placeholder="Buscar por nombre, teléfono o correo" value="${esc(state.patientQuery)}">
            ${canEdit() ? '<button class="btn btn-primary" data-act="new">Nuevo paciente</button>' : ''}</div>
            <div id="p-list"><p class="loading">Cargando…</p></div>`;
        bind(view, { new: () => patientModal(null, null, id => openPatient(id)) });
        const input = $('#p-search');
        let timer;
        input.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => { state.patientQuery = input.value.trim(); loadPatients(); }, 300);
        });
        await loadPatients();
    }

    async function loadPatients() {
        const box = $('#p-list');
        if (!box) return;
        const rows = await rpc('search_patients', { p_query: state.patientQuery || null, p_order: state.patientQuery ? 'name' : 'registered', p_limit: 50 });
        const total = rows && rows[0] ? Number(rows[0].total_count) : 0;
        box.innerHTML = (rows || []).length
            ? `<p class="muted small">${total} paciente${total === 1 ? '' : 's'}${total > rows.length ? ` · mostrando ${rows.length}` : ''}</p>` + rows.map(p => `
                <div class="card row-link" data-act="open" data-id="${p.id}">
                    <div class="card-head"><h3>${esc(p.first_name + ' ' + p.last_name)}</h3>${statusChip(p.status)}</div>
                    <div class="meta"><span>📱 ${esc(p.phone)}</span>${p.email ? `<span>✉️ ${esc(p.email)}</span>` : ''}
                        ${p.source_name ? `<span>📢 ${esc(p.source_name)}</span>` : ''}<span class="muted">Última actividad: ${esc(fmtDate(p.last_activity))}</span></div>
                </div>`).join('')
            : `<div class="empty">${state.patientQuery ? 'No se encontraron pacientes con esa búsqueda.' : 'Todavía no hay pacientes registrados.'}</div>`;
        bind(box, { open: el => openPatient(el.dataset.id) });
    }

    // Formulario de paciente: crear (id null) o editar. onSaved(id) se llama al guardar.
    function patientModal(patient, prefill, onSaved) {
        const p = Object.assign({ first_name: '', last_name: '', phone: '', whatsapp: '', email: '', birth_date: '', source_id: null, administrative_notes: '', status: 'Activo' }, prefill || {}, patient || {});
        const m = openModal(patient ? 'Editar paciente' : 'Nuevo paciente', `<form id="pf">
            <div class="grid-2">
                <div class="field"><label>Nombre(s)</label><input name="first_name" required value="${esc(p.first_name)}"></div>
                <div class="field"><label>Apellidos</label><input name="last_name" required value="${esc(p.last_name)}"></div>
                <div class="field"><label>Teléfono</label><input name="phone" type="tel" required value="${esc(p.phone)}" placeholder="10 dígitos"></div>
                <div class="field"><label>WhatsApp (si es distinto)</label><input name="whatsapp" type="tel" value="${esc(p.whatsapp)}"></div>
                <div class="field"><label>Correo</label><input name="email" type="email" value="${esc(p.email)}"></div>
                <div class="field"><label>Fecha de nacimiento</label><input name="birth_date" type="date" value="${esc(p.birth_date)}"></div>
                <div class="field"><label>¿Cómo nos conoció?</label><select name="source_id">${sourceOptions(p.source_id)}</select></div>
                ${patient ? `<div class="field"><label>Estado</label><select name="status"><option ${p.status === 'Activo' ? 'selected' : ''}>Activo</option><option ${p.status === 'Inactivo' ? 'selected' : ''}>Inactivo</option></select></div>` : ''}
            </div>
            <div class="field"><label>Notas administrativas</label><textarea name="administrative_notes">${esc(p.administrative_notes)}</textarea></div>
            <p class="form-error" id="pf-error"></p><div id="pf-dup"></div>
            <div class="actions"><button class="btn btn-primary" type="submit">Guardar</button><button class="btn btn-ghost" type="button" data-act="cancel">Cancelar</button></div>
        </form>`);
        bind(m.body, { cancel: () => m.close() });
        const form = $('#pf', m.body);

        async function save(force) {
            const f = Object.fromEntries(new FormData(form).entries());
            const errBox = $('#pf-error', m.body);
            errBox.textContent = '';
            $('#pf-dup', m.body).innerHTML = '';
            try {
                let id;
                if (patient) {
                    await q(sb.from('patients').update({
                        first_name: f.first_name.trim(), last_name: f.last_name.trim(), phone: f.phone.trim(),
                        whatsapp: f.whatsapp.trim() || null, email: f.email.trim() || null, birth_date: f.birth_date || null,
                        source_id: f.source_id || null, status: f.status, administrative_notes: f.administrative_notes
                    }).eq('id', patient.id));
                    id = patient.id;
                } else {
                    id = await rpc('create_patient', {
                        p_first_name: f.first_name.trim(), p_last_name: f.last_name.trim(), p_phone: f.phone.trim(),
                        p_whatsapp: f.whatsapp.trim() || null, p_email: f.email.trim() || null, p_birth_date: f.birth_date || null,
                        p_source_id: f.source_id || null, p_notes: f.administrative_notes || null, p_force: !!force
                    });
                }
                m.close();
                toast(patient ? 'Paciente actualizado.' : 'Paciente registrado.', 'ok');
                if (onSaved) await onSaved(id);
            } catch (e) {
                if (e.code === '23505' && /patient_id=/.test(e.details || '')) {
                    const dupId = (e.details.match(/patient_id=([0-9a-f-]+)/) || [])[1];
                    $('#pf-dup', m.body).innerHTML = `<div class="note">${esc(e.message)}
                        <div class="actions"><button class="btn btn-sm btn-primary" type="button" data-act="opendup">Abrir paciente existente</button>
                        <button class="btn btn-sm" type="button" data-act="force">Es otra persona: registrar de todos modos</button></div></div>`;
                    bind($('#pf-dup', m.body), {
                        opendup: () => {
                            m.close();
                            if (onSaved && prefill && !patient) onSaved(dupId); else openPatient(dupId);
                        },
                        force: btn => busy(btn, () => save(true))
                    });
                } else {
                    errBox.textContent = errMsg(e);
                }
            }
        }
        form.addEventListener('submit', ev => { ev.preventDefault(); busy($('button[type=submit]', form), () => save(false)); });
    }

    async function openPatient(id) {
        state.tab = 'pacientes';
        $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === 'pacientes'));
        const view = $('#view');
        view.innerHTML = '<p class="loading">Cargando…</p>';
        window.scrollTo(0, 0);
        try {
            const [p, overview, appts, quotes] = await Promise.all([
                q(sb.from('patients').select('*, source:patient_sources(name)').eq('id', id).maybeSingle()),
                rpc('get_patient_overview', { p_patient_id: id }),
                rpc('get_patient_appointments', { p_patient_id: id, p_limit: 20 }),
                rpc('search_quotes', { p_patient_id: id, p_limit: 20 })
            ]);
            if (!p) { view.innerHTML = '<div class="note">El paciente no existe o no tienes acceso.</div>'; return; }
            const o = (overview || [])[0] || {};
            const name = p.first_name + ' ' + p.last_name;
            const wa = waLink(p.whatsapp || p.phone, `Hola ${p.first_name}, te escribimos de Estefani Amza | Odontología Integral.`);
            view.innerHTML = `<p><button class="link-btn" data-act="back">← Volver a pacientes</button></p>
                <div class="card">
                    <div class="card-head"><h2 style="margin:0">${esc(name)}</h2>${statusChip(p.status)}</div>
                    <div class="meta"><span>📱 ${esc(p.phone)}</span>${p.whatsapp && digits(p.whatsapp) !== digits(p.phone) ? `<span>WhatsApp: ${esc(p.whatsapp)}</span>` : ''}
                        ${p.email ? `<span>✉️ ${esc(p.email)}</span>` : ''}${p.birth_date ? `<span>🎂 ${esc(fmtDate(p.birth_date))}</span>` : ''}
                        ${p.source ? `<span>📢 ${esc(p.source.name)}</span>` : ''}<span class="muted">Registrado ${esc(fmtDate(p.registration_date))}</span></div>
                    ${p.administrative_notes ? `<p class="small">📝 ${esc(p.administrative_notes)}</p>` : ''}
                    <div class="actions">
                        ${wa ? `<a class="btn btn-wa btn-sm" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
                        ${canEdit() ? `<button class="btn btn-primary btn-sm" data-act="appt">Agendar cita</button>
                        <button class="btn btn-sm" data-act="quote">Nueva cotización</button>
                        <button class="btn btn-sm" data-act="followup">Nuevo seguimiento</button>
                        <button class="btn btn-ghost btn-sm" data-act="edit">Editar datos</button>` : ''}
                    </div>
                </div>
                <div class="kpis">
                    <div class="kpi"><div class="label">Próxima cita</div><div class="value" style="font-size:1.05rem">${o.next_date ? esc(fmtDate(o.next_date) + ' · ' + fmtTime(o.next_time)) : '—'}</div>
                        <div class="hint">${o.next_service ? esc(o.next_service) : 'Sin próxima cita'}</div></div>
                    <div class="kpi"><div class="label">Última cita</div><div class="value" style="font-size:1.05rem">${o.last_date ? esc(fmtDate(o.last_date)) : '—'}</div>
                        <div class="hint">${o.last_service ? esc(o.last_service + ' · ' + o.last_status) : ''}</div></div>
                    <div class="kpi"><div class="label">Citas en total</div><div class="value">${esc(o.total_citas || 0)}</div></div>
                </div>
                <h3>Citas</h3>
                ${(appts || []).length ? appts.map(a => `<div class="card"><div class="card-head"><strong>${esc(fmtDate(a.appointment_date))} · ${esc(fmtTime(a.start_time))}</strong>${statusChip(a.status)}</div>
                    <div class="meta"><span>🦷 ${esc(a.service_name)}</span><span>👩‍⚕️ ${esc(a.specialist_name)}</span></div></div>`).join('') : '<div class="empty">Sin citas registradas.</div>'}
                <h3 style="margin-top:1.2rem">Cotizaciones</h3>
                ${(quotes || []).length ? quotes.map(qt => `<div class="card row-link" data-act="openquote" data-id="${qt.quote_id}"><div class="card-head"><strong>${esc(fmtDate(qt.quote_date))} · ${money(qt.total)}</strong>${statusChip(qt.status)}</div></div>`).join('') : '<div class="empty">Sin cotizaciones.</div>'}`;
            const reload = () => openPatient(id);
            bind(view, {
                back: () => go('pacientes'),
                edit: () => patientModal(p, null, reload),
                appt: () => appointmentModal({ patient: { id, name }, onDone: reload }),
                quote: () => quoteModal({ id, name }, reload),
                followup: () => followUpModal({ id, name }, reload),
                openquote: el => quoteDetail(el.dataset.id, reload)
            });
        } catch (e) {
            view.innerHTML = `<div class="note">${esc(errMsg(e))}</div>`;
        }
    }

    // ------------------------------------------------------------------
    // AGENDA
    // ------------------------------------------------------------------
    async function renderAgenda(view) {
        const d = state.agendaDate || todayMX();
        view.innerHTML = `<div class="toolbar"><h2>Agenda</h2>
                <button class="btn btn-ghost btn-sm" data-act="prev" aria-label="Día anterior">←</button>
                <input type="date" id="a-date" value="${d}" style="flex:0 1 170px">
                <button class="btn btn-ghost btn-sm" data-act="next" aria-label="Día siguiente">→</button>
                <button class="btn btn-ghost btn-sm" data-act="today">Hoy</button>
                ${canEdit() ? '<button class="btn btn-primary" data-act="new">Nueva cita</button>' : ''}</div>
            <p class="muted" style="text-transform:capitalize">${esc(fmtDateLong(d))}</p>
            ${noSpecialistsNote()}
            <div id="a-list"><p class="loading">Cargando…</p></div>`;
        const setDate = v => { state.agendaDate = v; go('agenda'); };
        bind(view, {
            prev: () => setDate(addDays(d, -1)),
            next: () => setDate(addDays(d, 1)),
            today: () => setDate(todayMX()),
            new: () => appointmentModal({ date: d, onDone: () => go('agenda') }),
            addspec: () => specialistModal()
        });
        $('#a-date').addEventListener('change', ev => ev.target.value && setDate(ev.target.value));
        const box = $('#a-list');
        const rows = await rpc('get_dashboard_agenda', { p_date: d });
        box.innerHTML = (rows || []).length ? rows.map(agendaCard).join('') : '<div class="empty">No hay citas este día.</div>';
        bindAgenda(box, () => go('agenda'));
    }

    // ------------------------------------------------------------------
    // Calendario mensual
    // ------------------------------------------------------------------
    // Horario de citas normales (último paciente a la 1 pm) y horario de urgencias
    const CAL_OPEN = 7 * 60, CAL_CLOSE = 14 * 60;
    const CAL_URGENT = 'Urgencias: 22:00 a 6:00';
    const CAL_COLORS = ['#8C52FF', '#0f766e', '#d9480f', '#0369a1', '#c2255c', '#5c940d', '#9a5b00'];
    const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

    const toMin = t => { const [h, m] = String(t).split(':'); return (+h) * 60 + (+m); };
    const fromMin = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    const capFirst = t => String(t).charAt(0).toUpperCase() + String(t).slice(1);
    const shortName = n => String(n || '').replace(/^(dra?\.?|doctora?)\s+/i, '');

    function specColor(id) {
        const i = state.specialists.findIndex(s => s.id === id);
        return i < 0 ? '#837599' : CAL_COLORS[i % CAL_COLORS.length];
    }

    async function renderCalendario(view) {
        const today = todayMX();
        const month = state.calMonth || today.slice(0, 7);
        state.calMonth = month;
        const first = month + '-01';
        const dow = new Date(first + 'T12:00:00Z').getUTCDay();
        const gridStart = addDays(first, -dow);
        const nextMonth = addDays(addDays(first, 32).slice(0, 7) + '-01', 0);
        const lastDay = addDays(nextMonth, -1);
        const weeks = Math.ceil((dow + Number(lastDay.slice(8))) / 7);
        const gridEnd = addDays(gridStart, weeks * 7 - 1);
        const title = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(first + 'T12:00:00Z'));
        const filter = state.calSpecialist;

        view.innerHTML = `<div class="toolbar"><h2>${esc(capFirst(title))}</h2>
                <button class="btn btn-ghost btn-sm" data-act="prev" aria-label="Mes anterior">←</button>
                <button class="btn btn-ghost btn-sm" data-act="today">Hoy</button>
                <button class="btn btn-ghost btn-sm" data-act="next" aria-label="Mes siguiente">→</button></div>
            <div class="cal-filters">
                <button class="cal-filter ${filter ? '' : 'on'}" data-act="filter" data-id="">Todos</button>
                ${state.specialists.map(s => `<button class="cal-filter ${filter === s.id ? 'on' : ''}" data-act="filter" data-id="${s.id}" style="--c:${specColor(s.id)}"><i></i>${esc(s.name)}</button>`).join('')}
            </div>
            <p class="muted small">Citas de 7:00 a 14:00 (último paciente a la 1 pm) · ${esc(CAL_URGENT)}. Toca un día para ver sus horarios.</p>
            <div class="cal" id="cal"><p class="loading">Cargando…</p></div>
            <div id="cal-day"></div>`;

        const setMonth = m => { state.calMonth = m; state.calDay = null; go('calendario'); };
        bind(view, {
            prev: () => setMonth(addDays(first, -1).slice(0, 7)),
            next: () => setMonth(nextMonth.slice(0, 7)),
            today: () => { state.calMonth = today.slice(0, 7); state.calDay = today; go('calendario'); },
            filter: b => { state.calSpecialist = b.dataset.id; go('calendario'); }
        });

        let rows = await rpc('get_calendar_range', { p_from: gridStart, p_to: gridEnd });
        rows = (rows || []).filter(r => !filter || r.specialist_id === filter || (r.kind === 'bloqueo' && !r.specialist_id));
        const byDay = {};
        rows.forEach(r => { (byDay[r.day] = byDay[r.day] || []).push(r); });

        let html = WEEKDAYS.map((w, i) => `<div class="cal-head ${i === 0 ? 'sun' : ''}">${w}</div>`).join('');
        for (let i = 0; i < weeks * 7; i++) {
            const d = addDays(gridStart, i);
            const items = (byDay[d] || []).filter(r => r.kind === 'cita');
            const blocks = (byDay[d] || []).filter(r => r.kind === 'bloqueo');
            const out = d.slice(0, 7) !== month;
            const MAX = 3;
            const chips = items.slice(0, MAX).map(r =>
                `<span class="cal-chip ${r.is_emergency ? 'urg' : ''}" style="--c:${specColor(r.specialist_id)}">${esc(fmtTime(r.start_time))}<span class="nm"> ${esc(shortName(r.specialist_name))}</span></span>`).join('');
            html += `<button class="cal-cell ${out ? 'out' : ''} ${d === today ? 'today' : ''} ${d === state.calDay ? 'sel' : ''}" data-act="day" data-d="${d}">
                <span class="cal-num ${i % 7 === 0 ? 'sun' : ''}">${Number(d.slice(8))}</span>
                ${chips}
                ${items.length > MAX ? `<span class="cal-more">+${items.length - MAX} más</span>` : ''}
                ${blocks.length ? '<span class="cal-chip blk">Bloqueado</span>' : ''}
            </button>`;
        }
        const cal = $('#cal');
        cal.innerHTML = html;
        bind(cal, { day: b => { state.calDay = b.dataset.d; $$('.cal-cell', cal).forEach(c => c.classList.toggle('sel', c === b)); renderCalDay(byDay[b.dataset.d] || [], b.dataset.d); } });
        if (state.calDay && state.calDay >= gridStart && state.calDay <= gridEnd) renderCalDay(byDay[state.calDay] || [], state.calDay);
    }

    function renderCalDay(rows, d) {
        const box = $('#cal-day');
        const specs = state.calSpecialist ? state.specialists.filter(s => s.id === state.calSpecialist) : state.specialists;
        const citas = rows.filter(r => r.kind === 'cita');
        const blocks = rows.filter(r => r.kind === 'bloqueo');
        const normal = citas.filter(r => !r.is_emergency);
        const urg = citas.filter(r => r.is_emergency);

        // Cuadrícula de media hora por especialista dentro del horario normal
        const busyAt = (sid, m) => normal.find(r => r.specialist_id === sid && toMin(r.start_time) <= m && toMin(r.end_time) > m);
        const blockedAt = (sid, m) => blocks.find(b => (!b.specialist_id || b.specialist_id === sid) && toMin(b.start_time) <= m && toMin(b.end_time) > m);
        let grid = '';
        if (specs.length) {
            grid = `<div class="table-wrap"><table class="cal-day-grid"><thead><tr><th>Hora</th>${specs.map(s => `<th style="color:${specColor(s.id)}">${esc(s.name)}</th>`).join('')}</tr></thead><tbody>`;
            for (let m = CAL_OPEN; m < CAL_CLOSE; m += 30) {
                grid += `<tr><td class="h">${fromMin(m)}</td>` + specs.map(s => {
                    const a = busyAt(s.id, m);
                    if (a) {
                        const startsHere = toMin(a.start_time) === m || m === CAL_OPEN;
                        return `<td class="busy" style="--c:${specColor(s.id)}">${startsHere ? `<button class="link-btn" data-act="patient" data-id="${a.patient_id}">${esc(a.patient_name)}</button><span>${esc(a.service_name)} · ${esc(fmtTime(a.start_time))}–${esc(fmtTime(a.end_time))}</span>` : ''}</td>`;
                    }
                    const b = blockedAt(s.id, m);
                    if (b) return `<td class="blk">${esc(b.reason || 'Bloqueado')}</td>`;
                    return '<td class="free">Libre</td>';
                }).join('') + '</tr>';
            }
            grid += '</tbody></table></div>';
        } else {
            grid = '<div class="note">Todavía no hay especialistas registrados.</div>';
        }
        const free = specs.map(s => {
            let n = 0;
            for (let m = CAL_OPEN; m < CAL_CLOSE; m += 30) if (!busyAt(s.id, m) && !blockedAt(s.id, m)) n++;
            return `<span class="chip" style="background:#fff;border:1px solid ${specColor(s.id)};color:${specColor(s.id)}">${esc(s.name)}: ${n * 30} min libres</span>`;
        }).join(' ');

        box.innerHTML = `<div class="card cal-day-card">
            <div class="card-head"><h3>${esc(capFirst(fmtDateLong(d)))}</h3>
                ${canEdit() ? '<button class="btn btn-primary btn-sm" data-act="new">Nueva cita</button>' : ''}</div>
            <div class="meta">${free}</div>
            ${grid}
            <h3 style="margin-top:1rem">Urgencias (22:00 a 6:00)</h3>
            ${urg.length ? urg.map(r => `<div class="meta"><span class="chip bad">${esc(fmtTime(r.start_time))}–${esc(fmtTime(r.end_time))}</span><span>${esc(r.patient_name)}</span><span>🦷 ${esc(r.service_name)}</span><span>👩‍⚕️ ${esc(r.specialist_name)}</span></div>`).join('') : '<p class="muted small">Sin urgencias registradas este día.</p>'}
        </div>`;
        bind(box, {
            patient: el => openPatient(el.dataset.id),
            new: () => appointmentModal({ date: d, onDone: () => go('calendario') })
        });
        box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function noSpecialistsNote() {
        if (state.specialists.length) return '';
        return `<div class="note">Todavía no hay especialistas registrados, así que no se pueden agendar citas.
            ${isAdmin() ? '<div class="actions"><button class="btn btn-sm btn-primary" data-act="addspec">Agregar especialista</button></div>' : ' Pide a la administradora que los agregue.'}</div>`;
    }

    function agendaCard(a) {
        const open = OPEN_STATUSES.includes(a.status);
        return `<div class="card"><div class="agenda-item">
            <div class="time">${esc(fmtTime(a.start_time))}<div class="muted small" style="font-weight:500">${esc(fmtTime(a.end_time))}</div></div>
            <div class="body">
                <div class="card-head"><h3><button class="link-btn" style="font-size:1.05rem;font-weight:700;text-decoration:none;color:inherit" data-act="patient" data-id="${a.patient_id}">${esc(a.patient_name)}</button></h3>
                    <span>${a.is_emergency ? '<span class="chip bad">Emergencia</span> ' : ''}${statusChip(a.status)}</span></div>
                <div class="meta"><span>🦷 ${esc(a.service_name)}</span><span>👩‍⚕️ ${esc(a.specialist_name)}</span></div>
                ${canEdit() && open ? `<div class="actions">
                    ${a.status !== 'Confirmada' ? `<button class="btn btn-sm btn-ok" data-act="status" data-st="Confirmada" data-id="${a.appointment_id}">Confirmar</button>` : ''}
                    <button class="btn btn-sm btn-ok" data-act="status" data-st="Atendida" data-id="${a.appointment_id}">Atendida</button>
                    <button class="btn btn-sm" data-act="noshow" data-id="${a.appointment_id}">No se presentó</button>
                    <button class="btn btn-sm" data-act="resched" data-id="${a.appointment_id}">Reprogramar</button>
                    <button class="btn btn-sm btn-bad" data-act="cancel" data-id="${a.appointment_id}">Cancelar</button>
                </div>` : ''}
            </div></div></div>`;
    }

    function bindAgenda(box, reload) {
        bind(box, {
            patient: el => openPatient(el.dataset.id),
            status: btn => busy(btn, async () => {
                try {
                    await q(sb.from('appointments').update({ status: btn.dataset.st }).eq('id', btn.dataset.id));
                    toast('Cita marcada como ' + btn.dataset.st.toLowerCase() + '.', 'ok');
                    reload();
                } catch (e) { toast(errMsg(e), 'error'); }
            }),
            noshow: async btn => {
                if (!await confirmBox('No se presentó', 'La cita se cerrará como "No se presentó". Después podrás darle seguimiento al paciente.', 'Confirmar')) return;
                try {
                    await q(sb.from('appointments').update({ status: 'No se presentó' }).eq('id', btn.dataset.id));
                    reload();
                } catch (e) { toast(errMsg(e), 'error'); }
            },
            cancel: btn => cancelModal(btn.dataset.id, reload),
            resched: btn => rescheduleModal(btn.dataset.id, reload)
        });
    }

    function cancelModal(id, reload) {
        const m = openModal('Cancelar cita', `<form id="cf">
            <div class="field"><label>¿Quién cancela?</label><select name="st"><option>Cancelada por paciente</option><option>Cancelada por clínica</option></select></div>
            <div class="field"><label>Motivo</label><textarea name="reason" required placeholder="Ej. El paciente tuvo un imprevisto"></textarea></div>
            <p class="form-error" id="cf-error"></p>
            <div class="actions"><button class="btn btn-bad" type="submit">Cancelar cita</button><button class="btn btn-ghost" type="button" data-act="close">Volver</button></div></form>`);
        bind(m.body, { close: () => m.close() });
        $('#cf', m.body).addEventListener('submit', ev => {
            ev.preventDefault();
            const f = Object.fromEntries(new FormData(ev.target).entries());
            busy($('button[type=submit]', ev.target), async () => {
                try {
                    await q(sb.from('appointments').update({ status: f.st, cancellation_reason: f.reason.trim() }).eq('id', id));
                    m.close();
                    toast('Cita cancelada.');
                    reload();
                } catch (e) { $('#cf-error', m.body).textContent = errMsg(e); }
            });
        });
    }

    // Lista de horarios libres para un especialista, servicio y fecha
    async function loadSlots(box, specialistId, serviceId, date, onPick, excludeId) {
        box.innerHTML = '';
        if (!specialistId || !serviceId || !date) { box.innerHTML = '<p class="muted small">Elige servicio, especialista y fecha para ver los horarios libres.</p>'; return; }
        box.innerHTML = '<p class="muted small">Buscando horarios…</p>';
        try {
            const rows = await rpc('get_available_slots', { p_specialist_id: specialistId, p_service_id: serviceId, p_date: date, p_step_minutes: 30, p_exclude_appointment_id: excludeId || null });
            if (!(rows || []).length) { box.innerHTML = '<p class="muted small">No hay horarios libres ese día.</p>'; return; }
            box.innerHTML = '<div class="slots">' + rows.map(s => `<button type="button" class="slot" data-t="${esc(s.slot_start)}">${esc(fmtTime(s.slot_start))}</button>`).join('') + '</div>';
            $$('.slot', box).forEach(b => b.addEventListener('click', () => {
                $$('.slot', box).forEach(x => x.classList.remove('selected'));
                b.classList.add('selected');
                onPick(b.dataset.t);
            }));
        } catch (e) { box.innerHTML = `<p class="form-error">${esc(errMsg(e))}</p>`; }
    }

    // Nueva cita. opts: { patient:{id,name}, date, requestId, note, onDone }
    function appointmentModal(opts) {
        if (!state.specialists.length) {
            const m = openModal('Nueva cita', noSpecialistsNote());
            bind(m.body, { addspec: () => { m.close(); specialistModal(); } });
            return;
        }
        const fromRequest = !!opts.requestId;
        const m = openModal(fromRequest ? 'Agendar solicitud' : 'Nueva cita', `<form id="af">
            ${opts.note ? `<div class="note info">El paciente pidió: ${esc(opts.note)}</div>` : ''}
            <div class="field" id="af-patient"></div>
            <div class="grid-2">
                <div class="field"><label>Servicio</label><select name="service" required>${serviceOptions()}</select></div>
                <div class="field"><label>Especialista</label><select name="specialist" required>${specialistOptions(state.specialists.length === 1 ? state.specialists[0].id : '')}</select></div>
                <div class="field"><label>Fecha</label><input name="date" type="date" required value="${esc(opts.date || todayMX())}"></div>
                ${fromRequest ? '' : `<div class="field"><label>Estado</label><select name="status"><option>Confirmada</option><option>Pendiente de confirmar</option></select></div>`}
            </div>
            <div class="field"><label class="check"><input type="checkbox" name="emergency"> Emergencia (permite agendar fuera del horario)</label></div>
            <div class="field" id="af-slots-wrap"><label>Horario</label><div id="af-slots"></div></div>
            <div class="field hidden" id="af-time-wrap"><label>Hora de inicio</label><input name="time" type="time"></div>
            <div class="field"><label id="af-notes-label">Notas</label><textarea name="notes"></textarea></div>
            <p class="form-error" id="af-error"></p>
            <div class="actions"><button class="btn btn-primary" type="submit">Agendar</button><button class="btn btn-ghost" type="button" data-act="close">Cancelar</button></div>
        </form>`);
        bind(m.body, { close: () => m.close() });
        const form = $('#af', m.body);
        const getPatient = patientPicker($('#af-patient', m.body), opts.patient && opts.patient.id ? opts.patient : null);
        let slot = null;
        const refresh = () => {
            slot = null;
            loadSlots($('#af-slots', m.body), form.specialist.value, form.service.value, form.date.value, t => { slot = t; });
        };
        ['service', 'specialist', 'date'].forEach(n => form[n].addEventListener('change', refresh));
        form.emergency.addEventListener('change', () => {
            const em = form.emergency.checked;
            $('#af-time-wrap', m.body).classList.toggle('hidden', !em);
            $('#af-slots-wrap', m.body).classList.toggle('hidden', em);
            $('#af-notes-label', m.body).textContent = em ? 'Motivo de la emergencia (obligatorio)' : 'Notas';
        });
        refresh();

        form.addEventListener('submit', ev => {
            ev.preventDefault();
            const err = $('#af-error', m.body);
            err.textContent = '';
            const patientId = getPatient();
            const em = form.emergency.checked;
            const start = em ? form.time.value : slot;
            if (!patientId) { err.textContent = 'Elige un paciente.'; return; }
            if (!start) { err.textContent = em ? 'Escribe la hora de inicio.' : 'Elige un horario.'; return; }
            if (em && !form.notes.value.trim()) { err.textContent = 'Escribe el motivo de la emergencia.'; return; }
            busy($('button[type=submit]', form), async () => {
                try {
                    if (fromRequest) {
                        await rpc('convert_request_to_appointment', {
                            p_request_id: opts.requestId, p_service_id: form.service.value, p_specialist_id: form.specialist.value,
                            p_date: form.date.value, p_start: start, p_is_emergency: em, p_notes: form.notes.value.trim() || null
                        });
                    } else {
                        await rpc('create_appointment', {
                            p_patient_id: patientId, p_service_id: form.service.value, p_specialist_id: form.specialist.value,
                            p_date: form.date.value, p_start: start, p_status: form.status.value, p_notes: form.notes.value.trim() || null, p_is_emergency: em
                        });
                    }
                    m.close();
                    toast('Cita agendada.', 'ok');
                    if (opts.onDone) opts.onDone();
                } catch (e) {
                    err.textContent = errMsg(e);
                    if (!em) refresh();
                }
            });
        });
    }

    async function rescheduleModal(id, reload) {
        let a;
        try { a = await q(sb.from('appointments').select('id,service_id,specialist_id,appointment_date').eq('id', id).single()); }
        catch (e) { toast(errMsg(e), 'error'); return; }
        const m = openModal('Reprogramar cita', `<form id="rf">
            <div class="grid-2">
                <div class="field"><label>Nueva fecha</label><input name="date" type="date" required value="${esc(a.appointment_date)}"></div>
                <div class="field"><label>Especialista</label><select name="specialist">${specialistOptions(a.specialist_id)}</select></div>
            </div>
            <div class="field"><label>Horario</label><div id="rf-slots"></div></div>
            <div class="field"><label>Motivo</label><input name="reason" placeholder="Ej. El paciente pidió cambiar la hora"></div>
            <p class="form-error" id="rf-error"></p>
            <div class="actions"><button class="btn btn-primary" type="submit">Reprogramar</button><button class="btn btn-ghost" type="button" data-act="close">Cancelar</button></div></form>`);
        bind(m.body, { close: () => m.close() });
        const form = $('#rf', m.body);
        let slot = null;
        const refresh = () => { slot = null; loadSlots($('#rf-slots', m.body), form.specialist.value, a.service_id, form.date.value, t => { slot = t; }, id); };
        form.date.addEventListener('change', refresh);
        form.specialist.addEventListener('change', refresh);
        refresh();
        form.addEventListener('submit', ev => {
            ev.preventDefault();
            if (!slot) { $('#rf-error', m.body).textContent = 'Elige un horario.'; return; }
            busy($('button[type=submit]', form), async () => {
                try {
                    await rpc('reschedule_appointment', { p_appointment_id: id, p_new_date: form.date.value, p_new_start: slot, p_new_specialist_id: form.specialist.value || null, p_reason: form.reason.value.trim() || null });
                    m.close();
                    toast('Cita reprogramada.', 'ok');
                    reload();
                } catch (e) { $('#rf-error', m.body).textContent = errMsg(e); refresh(); }
            });
        });
    }

    function specialistModal() {
        const m = openModal('Agregar especialista', `<form id="sf">
            <div class="field"><label>Nombre</label><input name="name" required placeholder="Ej. Dra. Estefani Amza"></div>
            <div class="grid-2">
                <div class="field"><label>Especialidad</label><input name="specialty" placeholder="Ej. Odontología general"></div>
                <div class="field"><label>Teléfono</label><input name="phone" type="tel"></div>
            </div>
            <div class="field"><label>Correo</label><input name="email" type="email"></div>
            <p class="form-error" id="sf-error"></p>
            <div class="actions"><button class="btn btn-primary" type="submit">Guardar</button><button class="btn btn-ghost" type="button" data-act="close">Cancelar</button></div></form>`);
        bind(m.body, { close: () => m.close() });
        $('#sf', m.body).addEventListener('submit', ev => {
            ev.preventDefault();
            const f = Object.fromEntries(new FormData(ev.target).entries());
            busy($('button[type=submit]', ev.target), async () => {
                try {
                    await q(sb.from('specialists').insert({ name: f.name.trim(), specialty: f.specialty.trim() || null, phone: f.phone.trim() || null, email: f.email.trim() || null }));
                    await loadCatalogs();
                    m.close();
                    toast('Especialista agregado.', 'ok');
                    go(state.tab);
                } catch (e) { $('#sf-error', m.body).textContent = errMsg(e); }
            });
        });
    }

    // ------------------------------------------------------------------
    // COTIZACIONES
    // ------------------------------------------------------------------
    const QUOTE_STATUSES = ['Borrador', 'Enviada', 'En seguimiento', 'Aceptada', 'Rechazada', 'Vencida'];

    async function renderCotizaciones(view) {
        view.innerHTML = `<div class="toolbar"><h2>Cotizaciones</h2>
            <select id="qs" aria-label="Estado"><option value="">Todos los estados</option>${QUOTE_STATUSES.map(s => `<option ${s === state.quoteStatus ? 'selected' : ''}>${s}</option>`).join('')}</select>
            ${canEdit() ? '<button class="btn btn-primary" data-act="new">Nueva cotización</button>' : ''}</div>
            <div id="q-list"><p class="loading">Cargando…</p></div>`;
        bind(view, { new: () => quoteModal(null, () => go('cotizaciones')) });
        $('#qs').addEventListener('change', ev => { state.quoteStatus = ev.target.value; go('cotizaciones'); });
        const rows = await rpc('search_quotes', { p_status: state.quoteStatus || null, p_limit: 50 });
        const box = $('#q-list');
        box.innerHTML = (rows || []).length ? rows.map(r => `
            <div class="card row-link" data-act="open" data-id="${r.quote_id}">
                <div class="card-head"><h3>${esc(r.patient_name)}</h3><span>${r.is_overdue ? '<span class="chip bad">Vencida</span> ' : ''}${statusChip(r.status)}</span></div>
                <div class="meta"><strong>${money(r.total)}</strong><span>Creada ${esc(fmtDate(r.quote_date))}</span>${r.expiration_date ? `<span>Vigente hasta ${esc(fmtDate(r.expiration_date))}</span>` : ''}</div>
            </div>`).join('') : '<div class="empty">No hay cotizaciones.</div>';
        bind(box, { open: el => quoteDetail(el.dataset.id, () => go('cotizaciones')) });
    }

    function quoteModal(patient, onDone) {
        const m = openModal('Nueva cotización', `<form id="qf">
            <div class="field" id="qf-patient"></div>
            <div class="table-wrap"><table class="items"><thead><tr><th>Concepto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th><th></th></tr></thead><tbody id="qf-rows"></tbody></table></div>
            <div class="actions"><button type="button" class="btn btn-sm" data-act="add">+ Agregar concepto</button></div>
            <div class="grid-2" style="margin-top:.8rem">
                <div class="field"><label>Descuento general ($)</label><input name="discount" type="number" min="0" step="0.01" value="0"></div>
                <div class="field"><label>Vigente hasta</label><input name="expiration" type="date" value="${addDays(todayMX(), 30)}"></div>
            </div>
            <div class="field"><label>Notas</label><textarea name="notes"></textarea></div>
            <div class="total-line" id="qf-total">Total: $0.00</div>
            <p class="form-error" id="qf-error"></p>
            <div class="actions"><button class="btn btn-primary" type="submit">Guardar como borrador</button><button class="btn btn-ghost" type="button" data-act="close">Cancelar</button></div></form>`);
        const form = $('#qf', m.body);
        const getPatient = patientPicker($('#qf-patient', m.body), patient);
        const tbody = $('#qf-rows', m.body);

        const recalc = () => {
            let sum = 0;
            $$('tr', tbody).forEach(tr => {
                const sub = (Number($('.qty', tr).value) || 0) * (Number($('.price', tr).value) || 0);
                $('.sub', tr).textContent = money(sub);
                sum += sub;
            });
            const total = Math.max(0, sum - (Number(form.discount.value) || 0));
            $('#qf-total', m.body).textContent = 'Total: ' + money(total);
        };
        const addRow = () => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><select class="svc">${serviceOptions()}</select></td>
                <td class="num"><input class="qty" type="number" min="1" step="1" value="1" style="width:4.5rem"></td>
                <td class="num"><input class="price" type="number" min="0" step="0.01" value="0" style="width:7rem"></td>
                <td class="num sub">$0.00</td>
                <td><button type="button" class="close-x" aria-label="Quitar">&times;</button></td>`;
            tbody.appendChild(tr);
            $('.svc', tr).addEventListener('change', ev => {
                const s = state.services.find(x => x.id === ev.target.value);
                if (s) $('.price', tr).value = Number(s.base_price || 0).toFixed(2);
                recalc();
            });
            $('.qty', tr).addEventListener('input', recalc);
            $('.price', tr).addEventListener('input', recalc);
            $('.close-x', tr).addEventListener('click', () => { tr.remove(); recalc(); });
        };
        bind(m.body, { add: addRow, close: () => m.close() });
        form.discount.addEventListener('input', recalc);
        addRow();

        form.addEventListener('submit', ev => {
            ev.preventDefault();
            const err = $('#qf-error', m.body);
            err.textContent = '';
            const patientId = getPatient();
            if (!patientId) { err.textContent = 'Elige un paciente.'; return; }
            const items = $$('tr', tbody).map(tr => {
                const s = state.services.find(x => x.id === $('.svc', tr).value);
                return s ? { service_id: s.id, description: s.name, quantity: Number($('.qty', tr).value) || 1, unit_price: Number($('.price', tr).value) || 0 } : null;
            }).filter(Boolean);
            if (!items.length) { err.textContent = 'Agrega al menos un concepto.'; return; }
            busy($('button[type=submit]', form), async () => {
                try {
                    const id = await rpc('create_quote', {
                        p_patient_id: patientId, p_expiration_date: form.expiration.value || null, p_notes: form.notes.value.trim() || null,
                        p_items: items, p_discount: Number(form.discount.value) || 0
                    });
                    m.close();
                    toast('Cotización guardada como borrador.', 'ok');
                    quoteDetail(id, onDone);
                } catch (e) { err.textContent = errMsg(e); }
            });
        });
    }

    async function quoteDetail(id, onChange) {
        let qt, items;
        try {
            [qt, items] = await Promise.all([
                q(sb.from('quotes').select('*, patient:patients(first_name,last_name)').eq('id', id).single()),
                q(sb.from('quote_items').select('*').eq('quote_id', id).order('created_at'))
            ]);
        } catch (e) { toast(errMsg(e), 'error'); return; }
        const s = qt.status;
        const expired = qt.expiration_date && qt.expiration_date < todayMX();
        const m = openModal('Cotización', `
            <div class="card-head"><h3>${esc(qt.patient.first_name + ' ' + qt.patient.last_name)}</h3>${statusChip(s)}</div>
            <div class="meta"><span>Creada ${esc(fmtDate(qt.quote_date))}</span>${qt.expiration_date ? `<span>Vigente hasta ${esc(fmtDate(qt.expiration_date))}</span>` : ''}${qt.sent_at ? `<span>Enviada ${esc(fmtDateTime(qt.sent_at))}</span>` : ''}</div>
            <div class="table-wrap"><table class="items"><thead><tr><th>Concepto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Subtotal</th></tr></thead><tbody>
                ${items.map(i => `<tr><td>${esc(i.description)}</td><td class="num">${esc(Number(i.quantity))}</td><td class="num">${money(i.unit_price)}</td><td class="num">${money(i.subtotal)}</td></tr>`).join('')}
            </tbody></table></div>
            ${Number(qt.discount) ? `<p style="text-align:right;margin:.5rem 0 0">Descuento: −${money(qt.discount)}</p>` : ''}
            <div class="total-line">Total: ${money(qt.total)}</div>
            ${qt.notes ? `<p class="small">📝 ${esc(qt.notes)}</p>` : ''}
            ${canEdit() ? `<div class="actions">
                ${s === 'Borrador' ? '<button class="btn btn-wa" data-act="send">Enviar por WhatsApp</button>' : ''}
                ${['Enviada', 'En seguimiento'].includes(s) ? '<button class="btn btn-wa btn-sm" data-act="resend">Reenviar por WhatsApp</button>' : ''}
                ${s === 'Enviada' ? '<button class="btn btn-sm" data-act="st" data-st="En seguimiento">En seguimiento</button>' : ''}
                ${['Enviada', 'En seguimiento'].includes(s) ? `<button class="btn btn-ok btn-sm" data-act="st" data-st="Aceptada">Aceptada</button>
                    <button class="btn btn-bad btn-sm" data-act="st" data-st="Rechazada">Rechazada</button>
                    ${expired ? '<button class="btn btn-sm" data-act="st" data-st="Vencida">Marcar vencida</button>' : ''}` : ''}
            </div>` : ''}
            <p class="form-error" id="qd-error"></p>`);

        const err = $('#qd-error', m.body);
        // La ventana de WhatsApp se abre antes de esperar a la base de datos para que el navegador no la bloquee
        async function openWhatsApp() {
            const w = window.open('', '_blank');
            try {
                const msg = (await rpc('get_quote_message', { p_quote_id: id }))[0];
                const url = 'https://wa.me/' + msg.whatsapp_number + '?text=' + encodeURIComponent(msg.message);
                if (w) w.location.href = url; else window.location.href = url;
            } catch (e) { if (w) w.close(); throw e; }
        }
        const refresh = () => { m.close(); if (onChange) onChange(); quoteDetail(id, onChange); };
        bind(m.body, {
            send: btn => busy(btn, async () => {
                try {
                    await q(sb.from('quotes').update({ status: 'Enviada' }).eq('id', id));
                    await openWhatsApp();
                    toast('Cotización marcada como enviada.', 'ok');
                    refresh();
                } catch (e) { err.textContent = errMsg(e); }
            }),
            resend: btn => busy(btn, async () => { try { await openWhatsApp(); } catch (e) { err.textContent = errMsg(e); } }),
            st: btn => busy(btn, async () => {
                try {
                    await q(sb.from('quotes').update({ status: btn.dataset.st }).eq('id', id));
                    toast('Cotización: ' + btn.dataset.st + '.', 'ok');
                    refresh();
                } catch (e) { err.textContent = errMsg(e); }
            })
        });
    }

    // ------------------------------------------------------------------
    // SEGUIMIENTOS
    // ------------------------------------------------------------------
    const FOLLOW_TYPES = ['Cotización sin respuesta', 'Paciente sin próxima cita', 'No se presentó', 'Solicitud pendiente', 'Seguimiento administrativo', 'Otro'];

    async function renderSeguimientos(view) {
        const [statsRows, rows] = await Promise.all([rpc('get_follow_up_stats'), rpc('get_follow_up_queue', { p_limit: 100 })]);
        const st = (statsRows || [])[0] || {};
        view.innerHTML = `<div class="toolbar"><h2>Seguimientos</h2><button class="btn btn-primary" data-act="new">Nuevo seguimiento</button></div>
            <div class="kpis">
                <div class="kpi"><div class="label">Vencidos</div><div class="value">${esc(st.vencidos || 0)}</div></div>
                <div class="kpi"><div class="label">Para hoy</div><div class="value">${esc(st.hoy || 0)}</div></div>
                <div class="kpi"><div class="label">Próximos</div><div class="value">${esc(st.proximos || 0)}</div></div>
                <div class="kpi"><div class="label">Sin próxima cita</div><div class="value">${esc(st.pacientes_sin_proxima_cita || 0)}</div><div class="hint">Pacientes atendidos sin cita futura</div></div>
            </div>
            ${(st.cotizaciones_sin_seguimiento || st.no_shows_sin_seguimiento) ? `<div class="note info">Hay ${esc(st.cotizaciones_sin_seguimiento || 0)} cotizaciones enviadas y ${esc(st.no_shows_sin_seguimiento || 0)} faltas sin seguimiento. Créalos desde la ficha del paciente o con "Nuevo seguimiento".</div>` : ''}
            <div id="f-list">${(rows || []).length ? rows.map(followCard).join('') : '<div class="empty">No hay seguimientos pendientes.</div>'}</div>`;
        bind(view, {
            new: () => followUpModal(null, () => go('seguimientos')),
            patient: el => openPatient(el.dataset.id),
            progress: btn => busy(btn, async () => {
                try { await q(sb.from('follow_ups').update({ status: 'En proceso' }).eq('id', btn.dataset.id)); go('seguimientos'); }
                catch (e) { toast(errMsg(e), 'error'); }
            }),
            done: btn => closeFollowUpModal(btn.dataset.id, 'Completado'),
            drop: btn => closeFollowUpModal(btn.dataset.id, 'Cancelado')
        });
    }

    function followCard(f) {
        const bucket = { 'Vencido': '<span class="chip bad">Vencido</span>', 'Hoy': '<span class="chip warn">Hoy</span>' }[f.bucket] || '';
        return `<div class="card">
            <div class="card-head"><h3><button class="link-btn" style="font-size:1.05rem;font-weight:700;text-decoration:none;color:inherit" data-act="patient" data-id="${f.patient_id}">${esc(f.patient_name)}</button></h3>
                <span>${bucket} ${statusChip(f.status)}</span></div>
            <div class="meta"><span>📌 ${esc(f.type)}</span><span>📅 ${esc(fmtDate(f.scheduled_date))}</span>${f.responsible_name ? `<span>👤 ${esc(f.responsible_name)}</span>` : ''}
                ${f.quote_id ? `<span>Cotización ${money(f.quote_total)} · ${esc(f.quote_status)}</span>` : ''}
                ${f.appointment_date ? `<span>Cita ${esc(fmtDate(f.appointment_date))} ${esc(fmtTime(f.appointment_time))}</span>` : ''}</div>
            ${f.next_action ? `<p class="small">➡️ ${esc(f.next_action)}</p>` : ''}
            <div class="actions">
                ${f.status === 'Pendiente' ? `<button class="btn btn-sm" data-act="progress" data-id="${f.follow_up_id}">En proceso</button>` : ''}
                <button class="btn btn-sm btn-ok" data-act="done" data-id="${f.follow_up_id}">Completar</button>
                <button class="btn btn-sm btn-ghost" data-act="drop" data-id="${f.follow_up_id}">Cancelar</button>
            </div></div>`;
    }

    function closeFollowUpModal(id, status) {
        const done = status === 'Completado';
        const m = openModal(done ? 'Completar seguimiento' : 'Cancelar seguimiento', `<form id="ff">
            <div class="field"><label>${done ? 'Resultado' : 'Motivo'}</label><textarea name="result" required placeholder="${done ? 'Ej. Agendó cita para el martes' : 'Ej. El paciente pidió no ser contactado'}"></textarea></div>
            <p class="form-error" id="ff-error"></p>
            <div class="actions"><button class="btn ${done ? 'btn-ok' : 'btn-bad'}" type="submit">${done ? 'Completar' : 'Cancelar seguimiento'}</button><button class="btn btn-ghost" type="button" data-act="close">Volver</button></div></form>`);
        bind(m.body, { close: () => m.close() });
        $('#ff', m.body).addEventListener('submit', ev => {
            ev.preventDefault();
            const result = ev.target.result.value.trim();
            busy($('button[type=submit]', ev.target), async () => {
                try {
                    await q(sb.from('follow_ups').update({ status, result }).eq('id', id));
                    m.close();
                    toast(done ? 'Seguimiento completado.' : 'Seguimiento cancelado.', 'ok');
                    go('seguimientos');
                } catch (e) { $('#ff-error', m.body).textContent = errMsg(e); }
            });
        });
    }

    function followUpModal(patient, onDone) {
        const m = openModal('Nuevo seguimiento', `<form id="nf">
            <div class="field" id="nf-patient"></div>
            <div class="grid-2">
                <div class="field"><label>Tipo</label><select name="type">${FOLLOW_TYPES.map(t => `<option>${esc(t)}</option>`).join('')}</select></div>
                <div class="field"><label>Fecha para hacerlo</label><input name="date" type="date" required value="${addDays(todayMX(), 1)}"></div>
            </div>
            <div class="field"><label>Siguiente acción</label><input name="next" placeholder="Ej. Llamar para confirmar si acepta el tratamiento"></div>
            <div class="field"><label>Notas</label><textarea name="notes"></textarea></div>
            <p class="form-error" id="nf-error"></p>
            <div class="actions"><button class="btn btn-primary" type="submit">Crear</button><button class="btn btn-ghost" type="button" data-act="close">Cancelar</button></div></form>`);
        bind(m.body, { close: () => m.close() });
        const getPatient = patientPicker($('#nf-patient', m.body), patient);
        $('#nf', m.body).addEventListener('submit', ev => {
            ev.preventDefault();
            const f = ev.target;
            const patientId = getPatient();
            if (!patientId) { $('#nf-error', m.body).textContent = 'Elige un paciente.'; return; }
            busy($('button[type=submit]', f), async () => {
                try {
                    await rpc('create_follow_up', { p_type: f.type.value, p_scheduled_date: f.date.value, p_patient_id: patientId, p_next_action: f.next.value.trim() || null, p_notes: f.notes.value.trim() || null });
                    m.close();
                    toast('Seguimiento creado.', 'ok');
                    if (onDone) onDone();
                } catch (e) { $('#nf-error', m.body).textContent = errMsg(e); }
            });
        });
    }


    // ------------------------------------------------------------------
    // EQUIPO (solo Administrador)
    // ------------------------------------------------------------------
    // ------------------------------------------------------------------
    // Renta del consultorio: doctores interesados (formulario de /renta/)
    // ------------------------------------------------------------------
    const RENTA_STATUSES = ['Nuevo', 'Contactado', 'Visita agendada', 'Contrato firmado', 'Descartado'];
    const RENTA_ACTIVE = ['Nuevo', 'Contactado', 'Visita agendada'];

    async function renderRenta(view) {
        const rows = await q(sb.from('rental_leads').select('*').order('created_at', { ascending: false }).limit(300));
        const count = st => rows.filter(r => r.status === st).length;
        const f = state.rentaFilter;
        const shown = rows.filter(r => f === 'todos' ? true : f === 'activos' ? RENTA_ACTIVE.includes(r.status) : r.status === f);
        const filterOpts = [['activos', 'En proceso'], ['todos', 'Todos'], ...RENTA_STATUSES.map(s => [s, s])]
            .map(([v, l]) => `<option value="${esc(v)}" ${v === f ? 'selected' : ''}>${esc(l)}</option>`).join('');

        view.innerHTML = `<div class="toolbar"><h2>Interesados en rentar</h2>
            <button class="btn btn-ghost btn-sm" data-act="reload">Actualizar</button></div>
            <p class="muted small">Doctores que dejaron sus datos en la página de renta del consultorio.</p>
            <div class="kpis">
                <div class="kpi"><div class="label">Nuevos</div><div class="value">${count('Nuevo')}</div><div class="hint">Por contactar</div></div>
                <div class="kpi"><div class="label">Contactados</div><div class="value">${count('Contactado')}</div></div>
                <div class="kpi"><div class="label">Visita agendada</div><div class="value">${count('Visita agendada')}</div></div>
                <div class="kpi"><div class="label">Contrato firmado</div><div class="value">${count('Contrato firmado')}</div></div>
            </div>
            <div class="field" style="max-width:260px"><label for="renta-filter">Mostrar</label><select id="renta-filter">${filterOpts}</select></div>
            <div id="renta-list">${shown.length ? shown.map(rentaCard).join('') : '<div class="empty">No hay interesados en esta lista.</div>'}</div>`;

        $('#renta-filter', view).addEventListener('change', ev => { state.rentaFilter = ev.target.value; go('renta'); });
        $$('select[data-status]', view).forEach(sel => sel.addEventListener('change', async () => {
            sel.disabled = true;
            try {
                await q(sb.from('rental_leads').update({ status: sel.value, updated_at: new Date().toISOString() }).eq('id', sel.dataset.status));
                toast('Estado actualizado: ' + sel.value + '.', 'ok');
                go('renta');
            } catch (e) { toast(errMsg(e), 'error'); sel.disabled = false; }
        }));
        const byId = Object.fromEntries(rows.map(r => [r.id, r]));
        bind(view, {
            reload: () => go('renta'),
            notes: btn => rentaNotesModal(byId[btn.dataset.id])
        });
    }

    function rentaCard(r) {
        const wa = waLink(r.phone, `Hola ${r.name || ''}, te escribimos de Estefani Amza | Odontología Integral por tu interés en rentar el consultorio en Lindavista.`);
        const statusOpts = RENTA_STATUSES.map(s => `<option ${s === r.status ? 'selected' : ''}>${esc(s)}</option>`).join('');
        return `<div class="card">
            <div class="card-head"><h3>${esc(r.name)}</h3>${statusChip(r.status)}</div>
            <div class="meta">
                <span>📱 ${esc(r.phone)}</span>
                ${r.specialty ? `<span>🦷 ${esc(r.specialty)}</span>` : ''}
                ${r.package ? `<span>💲 ${esc(r.package)}</span>` : ''}
                ${r.preferred_hours ? `<span>📅 ${esc(r.preferred_hours)}</span>` : ''}
                ${r.has_patients ? `<span>👥 Pacientes en la zona: ${esc(r.has_patients)}</span>` : ''}
                ${r.license_number ? `<span>🎓 Cédula ${esc(r.license_number)}</span>` : ''}
                ${r.email ? `<span>✉️ ${esc(r.email)}</span>` : ''}
                <span class="muted">Recibido ${esc(fmtDateTime(r.created_at))}</span>
            </div>
            ${r.message ? `<p>💬 ${esc(r.message)}</p>` : ''}
            ${r.notes ? `<div class="note info">📝 ${esc(r.notes)}</div>` : ''}
            <div class="actions">
                ${wa ? `<a class="btn btn-wa btn-sm" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
                <select data-status="${r.id}" aria-label="Cambiar estado de ${esc(r.name)}" style="width:auto">${statusOpts}</select>
                <button class="btn btn-ghost btn-sm" data-act="notes" data-id="${r.id}">${r.notes ? 'Editar notas' : 'Agregar notas'}</button>
            </div></div>`;
    }

    function rentaNotesModal(r) {
        const m = openModal('Notas: ' + r.name, `<form id="rn">
            <div class="field"><label>Notas internas</label><textarea name="notes" rows="5" maxlength="2000" placeholder="Ej. Visita el jueves 5 pm. Interesado en 40 horas por la tarde.">${esc(r.notes || '')}</textarea></div>
            <p class="form-error" id="rn-error"></p>
            <div class="actions"><button class="btn btn-primary" type="submit">Guardar</button><button class="btn btn-ghost" type="button" data-act="close">Cancelar</button></div></form>`);
        bind(m.body, { close: () => m.close() });
        $('#rn', m.body).addEventListener('submit', ev => {
            ev.preventDefault();
            const notes = ev.target.notes.value.trim() || null;
            busy($('button[type=submit]', ev.target), async () => {
                try {
                    await q(sb.from('rental_leads').update({ notes, updated_at: new Date().toISOString() }).eq('id', r.id));
                    m.close();
                    toast('Notas guardadas.', 'ok');
                    go('renta');
                } catch (e) { $('#rn-error', m.body).textContent = errMsg(e); }
            });
        });
    }

    async function renderEquipo(view) {
        const [rows, roles] = await Promise.all([rpc('admin_list_staff'), q(sb.from('roles').select('id,name').order('name'))]);
        state.roles = roles || [];
        view.innerHTML = `<div class="toolbar"><h2>Equipo</h2><button class="btn btn-primary" data-act="new">Agregar persona</button></div>
            <p class="muted small">Quién puede entrar a esta página y qué puede hacer. Recepción gestiona pacientes, agenda, cotizaciones y seguimientos; Odontólogo solo consulta.</p>
            ${(rows || []).map(staffCard).join('')}`;
        const byId = Object.fromEntries((rows || []).map(r => [r.id, r]));
        bind(view, {
            new: () => staffModal(null),
            edit: btn => staffModal(byId[btn.dataset.id]),
            invite: btn => busy(btn, () => sendInvite(byId[btn.dataset.id]))
        });
    }

    function accessStatus(u) {
        if (!u.has_account) return '<span class="chip gray">Sin invitar</span>';
        if (u.last_sign_in_at) return `<span class="chip ok">Entró por última vez ${esc(fmtDateTime(u.last_sign_in_at))}</span>`;
        if (u.confirmed_at) return '<span class="chip ok">Cuenta lista</span>';
        return `<span class="chip warn">Invitación enviada${u.invited_at ? ' ' + esc(fmtDateTime(u.invited_at)) : ''}, falta aceptarla</span>`;
    }

    function staffCard(u) {
        return `<div class="card">
            <div class="card-head"><h3>${esc(u.name)}${u.is_me ? ' <span class="muted small">(tú)</span>' : ''}</h3>
                <span><span class="chip">${esc(u.role_name || 'Sin rol')}</span> ${u.active ? '' : '<span class="chip gray">Inactivo</span>'}</span></div>
            <div class="meta">${u.email ? `<span>✉️ ${esc(u.email)}</span>` : '<span class="muted">Sin correo</span>'}${u.phone ? `<span>📱 ${esc(u.phone)}</span>` : ''}</div>
            <div>${accessStatus(u)}</div>
            <div class="actions">
                ${u.active && u.email && !u.is_me ? `<button class="btn btn-sm btn-primary" data-act="invite" data-id="${u.id}">${u.has_account ? 'Enviar enlace de contraseña' : 'Enviar invitación'}</button>` : ''}
                <button class="btn btn-sm btn-ghost" data-act="edit" data-id="${u.id}">Editar</button>
            </div></div>`;
    }

    // Llama a la función del servidor que manda el correo de invitación
    async function sendInvite(u) {
        try {
            const { data, error } = await sb.functions.invoke('invite-staff', { body: { user_id: u.id } });
            if (error) {
                let msg = error.message;
                try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* sin detalle */ }
                throw new Error(msg);
            }
            toast(data && data.sent === 'invite'
                ? `Invitación enviada a ${u.email}. Le llegará un correo para crear su contraseña.`
                : `Le enviamos a ${u.email} un enlace para crear su contraseña.`, 'ok');
            if (state.tab === 'equipo') go('equipo');
        } catch (e) { toast(errMsg(e), 'error'); }
    }

    function staffModal(u) {
        const roleOpts = sel => (state.roles || []).map(r => `<option value="${r.id}" ${r.id === sel ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
        const recep = (state.roles || []).find(r => r.name === 'Recepción');
        const m = openModal(u ? 'Editar persona' : 'Agregar persona', `<form id="tf">
            <div class="field"><label>Nombre</label><input name="name" required value="${esc(u ? u.name : '')}"></div>
            <div class="grid-2">
                <div class="field"><label>Correo</label><input name="email" type="email" required value="${esc(u ? u.email : '')}" ${u && u.has_account ? 'readonly title="Ya tiene cuenta: el correo no se cambia aquí"' : ''}></div>
                <div class="field"><label>Teléfono</label><input name="phone" type="tel" value="${esc(u ? u.phone : '')}"></div>
                <div class="field"><label>Rol</label><select name="role_id" required>${roleOpts(u ? u.role_id : recep && recep.id)}</select></div>
                ${u ? `<div class="field"><label>Estado</label><select name="active"><option value="true" ${u.active ? 'selected' : ''}>Activo</option><option value="false" ${u.active ? '' : 'selected'}>Inactivo (ya no puede entrar)</option></select></div>` : ''}
            </div>
            ${u ? '' : '<div class="field"><label class="check"><input type="checkbox" name="invite" checked> Enviarle ahora el correo de invitación</label></div>'}
            <p class="form-error" id="tf-error"></p>
            <div class="actions"><button class="btn btn-primary" type="submit">Guardar</button><button class="btn btn-ghost" type="button" data-act="close">Cancelar</button></div></form>`);
        bind(m.body, { close: () => m.close() });
        $('#tf', m.body).addEventListener('submit', ev => {
            ev.preventDefault();
            const f = ev.target;
            const row = { name: f.name.value.trim(), email: f.email.value.trim(), phone: f.phone.value.trim() || null, role_id: f.role_id.value };
            busy($('button[type=submit]', f), async () => {
                try {
                    if (u) {
                        row.active = f.active.value === 'true';
                        await q(sb.from('users').update(row).eq('id', u.id));
                        m.close();
                        toast('Datos guardados.', 'ok');
                        go('equipo');
                    } else {
                        row.active = true;
                        const created = await q(sb.from('users').insert(row).select('id,name,email').single());
                        // Si ya existía una cuenta de acceso con ese correo, se liga en este momento
                        await rpc('admin_link_staff_account', { p_user_id: created.id }).catch(() => false);
                        m.close();
                        if (f.invite.checked) await sendInvite(created); else toast('Persona agregada.', 'ok');
                        go('equipo');
                    }
                } catch (e) {
                    $('#tf-error', m.body).textContent = /users_email_key|duplicate/i.test(e.message || '') ? 'Ya hay una persona con ese correo.' : errMsg(e);
                }
            });
        });
    }

    // ------------------------------------------------------------------
    // Inicio de la página
    // ------------------------------------------------------------------
    (async function init() {
        const { data: { session } } = await sb.auth.getSession();
        if (LINK_ERROR) {
            showAuth('login-form');
            $('#login-error').textContent = /expired|invalid/i.test(LINK_ERROR)
                ? 'El enlace del correo ya expiró o no es válido. Pide uno nuevo con "Olvidé mi contraseña".'
                : LINK_ERROR;
            history.replaceState(null, '', window.location.pathname);
            return;
        }
        if (session && (LINK_TYPE === 'invite' || LINK_TYPE === 'recovery')) { showAuth('password-form'); return; }
        if (session) { await startApp(); return; }
        showAuth('login-form');
    })();
})();
