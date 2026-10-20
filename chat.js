// Burbuja de chat del sitio. Habla con la función "chatbot" de Supabase.
(function () {
    const ENDPOINT = 'https://poqkhcwkbjsvbvttyghc.supabase.co/functions/v1/chatbot';
    const STORAGE_KEY = 'ea_chat_v1';
    const WHATSAPP_URL = 'https://wa.me/525573541129';
    const GREETING = '¡Hola! 👋 Soy el asistente virtual de la Dra. Estefani Amza. Puedo resolver tus dudas sobre tratamientos, precios y horarios, o ayudarte a solicitar una cita. ¿En qué te ayudo?';
    const QUICK_REPLIES = ['Quiero agendar una cita', '¿Cuánto cuesta una limpieza?', '¿Cuál es su horario?', '¿Dónde están ubicados?'];

    // Conversación: solo mensajes reales (el saludo no se envía al servidor).
    let messages = [];
    let sending = false;
    try { messages = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { messages = []; }
    const save = () => { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30))); } catch (e) { } };

    const track = (event, origin) => { if (typeof window.trackContact === 'function') window.trackContact(event, origin); };

    // ---------- Interfaz ----------
    const launcher = document.createElement('button');
    launcher.className = 'chat-launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'Abrir chat con el asistente');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.innerHTML = '<i class="fa-solid fa-comment-dots" aria-hidden="true"></i><span class="chat-launcher-label">¿Dudas? Pregúntame</span>';

    const panel = document.createElement('section');
    panel.className = 'chat-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat con el asistente virtual');
    panel.hidden = true;
    panel.innerHTML = `
        <div class="chat-header">
            <div class="chat-avatar" aria-hidden="true"><i class="fa-solid fa-tooth"></i></div>
            <div class="chat-title">
                <strong>Asistente de la Dra. Estefani</strong>
                <span>Respuestas automáticas · el equipo confirma tu cita</span>
            </div>
            <button type="button" class="chat-close" aria-label="Cerrar chat"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="chat-log" aria-live="polite"></div>
        <div class="chat-quick"></div>
        <form class="chat-form">
            <label class="sr-only" for="chat-input">Escribe tu mensaje</label>
            <textarea id="chat-input" rows="1" maxlength="1000" placeholder="Escribe tu mensaje…" autocomplete="off"></textarea>
            <button type="submit" class="chat-send" aria-label="Enviar"><i class="fa-solid fa-paper-plane"></i></button>
        </form>
        <p class="chat-foot">Asistente con IA: puede equivocarse. Para urgencias escribe por <a href="${WHATSAPP_URL}" target="_blank" rel="noopener">WhatsApp</a>.</p>`;

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    const log = panel.querySelector('.chat-log');
    const quick = panel.querySelector('.chat-quick');
    const form = panel.querySelector('.chat-form');
    const input = panel.querySelector('textarea');
    const sendBtn = panel.querySelector('.chat-send');

    // Convierte texto en nodos seguros: saltos de línea, **negritas** y enlaces.
    function renderText(el, text) {
        const parts = text.split(/(https?:\/\/[^\s)]+|\*\*[^*]+\*\*|\n)/g);
        for (const part of parts) {
            if (!part) continue;
            if (part === '\n') el.appendChild(document.createElement('br'));
            else if (/^https?:\/\//.test(part)) {
                const a = document.createElement('a');
                a.href = part; a.target = '_blank'; a.rel = 'noopener';
                a.textContent = part.includes('wa.me') ? 'Escribir por WhatsApp' : part;
                el.appendChild(a);
            } else if (/^\*\*.+\*\*$/.test(part)) {
                const b = document.createElement('strong');
                b.textContent = part.slice(2, -2);
                el.appendChild(b);
            } else el.appendChild(document.createTextNode(part));
        }
    }

    function addBubble(role, text) {
        const div = document.createElement('div');
        div.className = 'chat-msg chat-msg-' + role;
        renderText(div, text);
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
        return div;
    }

    function renderAll() {
        log.innerHTML = '';
        addBubble('assistant', GREETING);
        messages.forEach(m => addBubble(m.role, m.content));
        quick.innerHTML = '';
        if (messages.length === 0) {
            QUICK_REPLIES.forEach(q => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'chat-chip';
                b.textContent = q;
                b.addEventListener('click', () => send(q));
                quick.appendChild(b);
            });
        }
    }

    function setOpen(open) {
        panel.hidden = !open;
        launcher.classList.toggle('is-open', open);
        launcher.setAttribute('aria-expanded', String(open));
        document.body.classList.toggle('chat-open', open);
        if (open) {
            renderAll();
            setTimeout(() => input.focus(), 50);
            track('chat_open', 'chat');
        }
    }

    async function send(text) {
        text = (text || '').trim();
        if (!text || sending) return;
        sending = true;
        sendBtn.disabled = true;
        quick.innerHTML = '';
        messages.push({ role: 'user', content: text.slice(0, 1000) });
        save();
        addBubble('user', text);
        input.value = '';
        autoGrow();

        const typing = document.createElement('div');
        typing.className = 'chat-msg chat-msg-assistant chat-typing';
        typing.setAttribute('aria-label', 'El asistente está escribiendo');
        typing.innerHTML = '<span></span><span></span><span></span>';
        log.appendChild(typing);
        log.scrollTop = log.scrollHeight;

        let reply;
        try {
            const res = await fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: messages.slice(-30) }),
            });
            const data = await res.json();
            reply = data.reply;
            if (data.booked) track('generate_lead', 'chat');
        } catch (e) {
            reply = null;
        }
        typing.remove();
        if (!reply) {
            reply = 'No pude conectarme en este momento. Escríbenos por WhatsApp: ' + WHATSAPP_URL;
            addBubble('assistant', reply);
            messages.pop(); // permite volver a intentar sin duplicar la pregunta
            save();
        } else {
            messages.push({ role: 'assistant', content: reply });
            save();
            addBubble('assistant', reply);
        }
        sending = false;
        sendBtn.disabled = false;
        input.focus();
    }

    function autoGrow() {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 110) + 'px';
    }

    launcher.addEventListener('click', () => setOpen(panel.hidden));
    panel.querySelector('.chat-close').addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) setOpen(false); });
    form.addEventListener('submit', e => { e.preventDefault(); send(input.value); });
    input.addEventListener('input', autoGrow);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
    });
})();
