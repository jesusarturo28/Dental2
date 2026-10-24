#!/usr/bin/env bash
# Instala el CLI de Codex y lo deja listo como revisor adversarial.
# Se ejecuta automáticamente al iniciar una sesión de Claude Code (SessionStart hook).
set -uo pipefail

if ! command -v codex >/dev/null 2>&1; then
  npm install -g @openai/codex >/dev/null 2>&1 || { echo "codex-setup: no se pudo instalar @openai/codex" >&2; exit 0; }
fi

mkdir -p "$HOME/.codex"
if [ ! -f "$HOME/.codex/config.toml" ]; then
  cat > "$HOME/.codex/config.toml" <<'TOML'
# Codex como revisor: solo lectura, sin pedir aprobaciones.
model_reasoning_effort = "high"
approval_policy = "never"
sandbox_mode = "read-only"
# Usar la cuenta de ChatGPT (plan de pago), no la API de pago por uso.
forced_login_method = "chatgpt"

[shell_environment_policy]
inherit = "core"
TOML
fi

# El login es con la cuenta de ChatGPT y no se puede automatizar: en cada contenedor
# nuevo hay que ejecutar `codex login --device-auth` y aprobar el código en el navegador.
exit 0
