// Chatbot del sitio de la Dra. Estefani Amza.
// Recibe la conversación desde la burbuja de chat del sitio, contesta con Claude usando
// los servicios y horarios de la base de datos, y puede registrar solicitudes de cita.
//
// Secretos necesarios (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY  — clave de la API de Claude
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase automáticamente.

import Anthropic from "npm:@anthropic-ai/sdk@0.130.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = "claude-opus-5-5";
const WHATSAPP = "55 7354 1129";
const MAX_MESSAGES = 30;
const MAX_CHARS = 1000;

const ALLOWED_ORIGINS = [
  /^https:\/\/estefaniamza\.netlify\.app$/,
  /^https:\/\/[a-z0-9-]+--estefaniamza\.netlify\.app$/, // vistas previas de Netlify
  /^https:\/\/jesusarturo28\.github\.io$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// ---------- Información de la clínica (se recarga cada 10 minutos) ----------

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
let clinicInfo = { text: "", loadedAt: 0 };

const money = (n: number) =>
  "$" + Number(n).toLocaleString("es-MX", { maximumFractionDigits: 0 });

async function loadClinicInfo(): Promise<string> {
  if (clinicInfo.text && Date.now() - clinicInfo.loadedAt < 10 * 60 * 1000) {
    return clinicInfo.text;
  }
  const [services, hours] = await Promise.all([
    db.from("services")
      .select("name, category, base_price, sessions_min, sessions_max, sessions_note")
      .eq("active", true).order("category").order("name"),
    db.from("business_hours")
      .select("day_of_week, opening_time, closing_time, active")
      .order("day_of_week"),
  ]);
  if (services.error) throw services.error;
  if (hours.error) throw hours.error;

  const serviceLines = (services.data ?? []).map((s) => {
    const price = s.base_price ? `desde ${money(s.base_price)} MXN` : "precio en valoración";
    let sessions = "";
    if (s.sessions_note) sessions = `; sesiones: ${s.sessions_note}`;
    else if (s.sessions_min && s.sessions_max) {
      sessions = s.sessions_min === s.sessions_max
        ? `; ${s.sessions_min} sesión(es)`
        : `; ${s.sessions_min} a ${s.sessions_max} sesiones`;
    }
    return `- [${s.category}] ${s.name}: ${price}${sessions}`;
  });

  const hourLines = (hours.data ?? []).map((h) =>
    h.active
      ? `- ${DAYS[h.day_of_week]}: ${h.opening_time.slice(0, 5)} a ${h.closing_time.slice(0, 5)}`
      : `- ${DAYS[h.day_of_week]}: cerrado`
  );

  clinicInfo = {
    text: `## Servicios y precios de referencia\n${serviceLines.join("\n")}\n\n## Horario de atención\n${hourLines.join("\n")}`,
    loadedAt: Date.now(),
  };
  return clinicInfo.text;
}

function systemPrompt(info: string): string {
  return `Eres el asistente virtual del consultorio de la Dra. Estefani Amza, "Odontología Integral", en la Ciudad de México. Atiendes a pacientes y posibles pacientes en el chat del sitio web.

## Tu forma de hablar
- Español de México, cálido, amable y tranquilo. Muchos pacientes tienen miedo al dentista: transmite confianza y trato gentil.
- Respuestas cortas (2 a 4 frases). Es un chat en el celular. Sin títulos ni tablas; usa listas cortas solo si ayudan.
- Trata de "tú" al paciente.

## Datos del consultorio
- Dirección: Riobamba 952, Lindavista Sur, Gustavo A. Madero, C.P. 07300, CDMX.
- WhatsApp y teléfono: ${WHATSAPP} (https://wa.me/525573541129).
- Instagram: @dra.estefaniamza
- Tratamientos: limpieza dental, ortodoncia, endodoncia, resinas, implantes, cirugía bucal (extracciones y terceros molares), odontopediatría (niñas, niños y adolescentes), diseño de sonrisa, blanqueamiento, carillas, coronas, prótesis y rehabilitación oral.

${info}

## Precios
- Da precios solo como "desde $X" usando la lista de arriba, y aclara siempre que el costo final se define en la consulta de valoración porque depende de cada caso.
- Si un tratamiento no está en la lista, di que se cotiza en la valoración. Nunca inventes precios, promociones, descuentos ni formas de pago.

## Lo que NO haces
- No das diagnósticos ni recetas medicamentos. Si describen síntomas, muestra empatía y recomienda una valoración.
- Urgencias (dolor fuerte, sangrado que no para, hinchazón de cara, golpe o diente roto, fiebre): pide que escriban de inmediato por WhatsApp al ${WHATSAPP}. Si hay dificultad para respirar o tragar, o la hinchazón es muy grande, que acudan a urgencias de un hospital.
- No confirmas citas ni prometes horarios exactos: solo registras la solicitud y el equipo confirma por WhatsApp.
- Si no sabes algo o el tema no es del consultorio, dilo con amabilidad y ofrece el WhatsApp.

## Agendar una cita
Cuando alguien quiera una cita, pide (de una o dos cosas a la vez, sin interrogar):
1. Nombre completo
2. Teléfono a 10 dígitos (de preferencia con WhatsApp)
3. Servicio o motivo de la consulta (si no sabe, "Consulta / valoración")
4. Día y horario de preferencia
Cuando tengas los cuatro datos, confírmalos en un mensaje corto y usa la herramienta registrar_solicitud_cita. Después dile que el equipo le escribirá por WhatsApp para confirmar el horario. Si la herramienta devuelve error, explica el problema (por ejemplo, teléfono incompleto) o sugiere escribir por WhatsApp.

Es un chat en tiempo real: empieza tu respuesta visible de inmediato.`;
}

const tools: Anthropic.Tool[] = [{
  name: "registrar_solicitud_cita",
  description:
    "Registra una solicitud de cita para que el equipo del consultorio la confirme por WhatsApp. Úsala solo cuando el paciente ya dio nombre, teléfono de 10 dígitos, servicio y horario de preferencia.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      nombre: { type: "string", description: "Nombre completo del paciente" },
      telefono: { type: "string", description: "Teléfono a 10 dígitos" },
      servicio: { type: "string", description: "Servicio o motivo de consulta" },
      horario_preferido: { type: "string", description: "Día y horario de preferencia, tal como lo dijo el paciente" },
      comentario: { type: "string", description: "Notas útiles para el equipo (síntomas, dudas). Cadena vacía si no hay." },
    },
    required: ["nombre", "telefono", "servicio", "horario_preferido", "comentario"],
    additionalProperties: false,
  },
}];

async function runTool(input: Record<string, string>): Promise<{ text: string; booked: boolean }> {
  const { data, error } = await db.rpc("submit_chat_appointment_request", {
    p_name: input.nombre,
    p_phone: input.telefono,
    p_service: input.servicio,
    p_preferred: input.horario_preferido,
    p_message: input.comentario,
  });
  if (error) {
    console.error("submit_chat_appointment_request", error);
    return { text: "Error al guardar la solicitud. Pide al paciente escribir por WhatsApp.", booked: false };
  }
  if (!data?.ok) return { text: `No se guardó: ${data?.error ?? "error desconocido"}`, booked: false };
  return {
    text: data.duplicate
      ? "Ya existía una solicitud reciente con ese teléfono; el equipo la tiene."
      : "Solicitud registrada. El equipo confirmará por WhatsApp.",
    booked: true,
  };
}

// ---------- Utilidades HTTP ----------

function corsHeaders(origin: string | null): HeadersInit {
  const ok = origin && ALLOWED_ORIGINS.some((r) => r.test(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : "https://estefaniamza.netlify.app",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

async function clientKey(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconocido";
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("chat:" + ip));
  return Array.from(new Uint8Array(hash)).slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type ChatMessage = { role: "user" | "assistant"; content: string };

function validMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const out: ChatMessage[] = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const content = m.content.trim().slice(0, MAX_CHARS);
    if (!content) return null;
    // Junta mensajes seguidos del mismo rol para que la conversación alterne.
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n" + content;
    else out.push({ role: m.role, content });
  }
  if (out[0].role !== "user" || out[out.length - 1].role !== "user") return null;
  return out;
}

const FALLBACK_REPLY =
  `Perdón, en este momento no puedo responder. Escríbenos por WhatsApp al ${WHATSAPP} y con gusto te atendemos.`;

// ---------- Servidor ----------

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, origin);
  if (!origin || !ALLOWED_ORIGINS.some((r) => r.test(origin))) {
    return json({ error: "Origen no permitido" }, 403, origin);
  }

  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400, origin);
  }
  const history = validMessages(body.messages);
  if (!history) return json({ error: "Conversación inválida" }, 400, origin);

  const { data: allowed, error: limitError } = await db.rpc("chatbot_allow", { p_key: await clientKey(req) });
  if (limitError) console.error("chatbot_allow", limitError);
  if (allowed === false) {
    return json({
      reply: `Has enviado muchos mensajes seguidos. Para seguir atendiéndote, escríbenos por WhatsApp al ${WHATSAPP}.`,
      booked: false,
    }, 200, origin);
  }

  try {
    const info = await loadClinicInfo();
    const today = new Date().toLocaleDateString("es-MX", {
      timeZone: "America/Mexico_City", weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
    let booked = false;

    for (let i = 0; i < 4; i++) {
      const response = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 4096,
        betas: ["server-side-fallback-2026-07-01"],
        // Si el modelo rechaza una petición por sus filtros de seguridad, la API la reintenta con otro modelo.
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        system: [
          { type: "text", text: systemPrompt(info), cache_control: { type: "ephemeral" } },
          { type: "text", text: `Hoy es ${today} (hora de la Ciudad de México).` },
        ],
        tools,
        messages,
      // deno-lint-ignore no-explicit-any
      } as any);

      if (response.stop_reason === "refusal") return json({ reply: FALLBACK_REPLY, booked }, 200, origin);

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;
          if (block.name !== "registrar_solicitud_cita") {
            results.push({ type: "tool_result", tool_use_id: block.id, content: "Herramienta desconocida", is_error: true });
            continue;
          }
          const result = await runTool(block.input as Record<string, string>);
          booked ||= result.booked;
          results.push({ type: "tool_result", tool_use_id: block.id, content: result.text, is_error: !result.booked });
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      const reply = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return json({ reply: reply || FALLBACK_REPLY, booked }, 200, origin);
    }
    return json({ reply: FALLBACK_REPLY, booked }, 200, origin);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.error("Límite de la API de Claude", err.message);
    else if (err instanceof Anthropic.AuthenticationError) console.error("Falta o es inválida ANTHROPIC_API_KEY");
    else if (err instanceof Anthropic.APIError) console.error("Error de la API de Claude", err.status, err.message);
    else console.error("Error inesperado", err);
    return json({ reply: FALLBACK_REPLY, booked: false }, 200, origin);
  }
});
