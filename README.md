# Dental2 — Estefani Amza | Odontología Integral

Versión preparada para GitHub Pages.

## Estructura

- `index.html` — sitio principal
- `styles.css` — estilos
- `images/logo_estefani_amza.png` — logo aprobado integrado
- `images/tooth_source_preview.png` — referencia del diente
- `.nojekyll` — compatibilidad con GitHub Pages

## Video del hero

El HTML conserva la ruta:

`images/video 1.mp4`

Para mantener el video de portada, agrega el archivo con ese nombre dentro de `images/`.
Si no está presente, el sitio conserva el fondo/overlay y usa el logo como poster de respaldo.

## Publicar con GitHub Pages

En GitHub:
1. Abre el repositorio `jesusarturo28/Dental2`.
2. Sube el contenido de esta carpeta a la rama `main`.
3. Ve a **Settings → Pages**.
4. Selecciona **Deploy from a branch**.
5. Elige `main` y `/ (root)`.
6. Guarda.

El sitio es HTML/CSS/JS estático y no requiere build.

## Chatbot del sitio (asistente virtual)

- `chat.js` y `chat.css` — burbuja de chat (arriba del botón de WhatsApp).
- `supabase/functions/chatbot/index.ts` — función del servidor que contesta con Claude usando los servicios, precios y horarios de la base de datos, y registra solicitudes de cita (origen `Chat web`, estado `Nueva`).
- `supabase/migrations/20261020_chatbot.sql` — límite de mensajes por visitante y función para guardar las solicitudes del chat.

Para que funcione hay que agregar el secreto `ANTHROPIC_API_KEY` en Supabase → Edge Functions → Secrets.
Para cambiar lo que dice el bot sobre precios u horarios, edita las tablas `services` y `business_hours`; el bot las vuelve a leer cada 10 minutos.
