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

[shell_environment_policy]
inherit = "core"
TOML
fi

# Login con API key si está disponible como variable de entorno.
if [ -n "${OPENAI_API_KEY:-}" ]; then
  if ! codex login status >/dev/null 2>&1; then
    printenv OPENAI_API_KEY | codex login --with-api-key >/dev/null 2>&1 || true
  fi
fi
exit 0
