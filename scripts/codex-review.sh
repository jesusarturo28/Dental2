#!/usr/bin/env bash
# Revisión adversarial con Codex del trabajo hecho por Claude.
# Uso:
#   scripts/codex-review.sh                 # cambios sin commit (staged, unstaged, untracked)
#   scripts/codex-review.sh --base main     # rama actual contra main
#   scripts/codex-review.sh --commit <sha>  # un commit concreto
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
command -v codex >/dev/null 2>&1 || bash scripts/codex-setup.sh

if ! codex login status >/dev/null 2>&1 && [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "codex-review: Codex no tiene credenciales. Define OPENAI_API_KEY en el entorno." >&2
  exit 2
fi

case "${1:-}" in
  "")       DIFF="$(git diff HEAD; git ls-files --others --exclude-standard | while read -r f; do git diff --no-index /dev/null "$f" || true; done)"
            DESC="cambios sin commit" ;;
  --base)   git fetch -q origin "$2" 2>/dev/null || true
            BASE="$(git rev-parse -q --verify "origin/$2" || echo "$2")"
            DIFF="$(git diff "$(git merge-base "$BASE" HEAD)"...HEAD)"
            DESC="rama $(git branch --show-current) contra $2" ;;
  --commit) DIFF="$(git show "$2")"; DESC="commit $2" ;;
  *)        echo "Uso: $0 [--base <rama> | --commit <sha>]" >&2; exit 1 ;;
esac

if [ -z "$DIFF" ]; then echo "codex-review: no hay cambios que revisar ($DESC)." ; exit 0; fi

read -r -d '' PROMPT <<'TXT' || true
Eres un revisor ADVERSARIAL. Otro agente de IA (Claude) escribió estos cambios y
asume que están bien; tu trabajo es demostrar que no lo están.

Reglas:
- No elogies ni resumas. Solo reporta problemas.
- Busca activamente: bugs de lógica, casos borde, HTML/CSS/JS roto, enlaces o rutas
  rotas, problemas de accesibilidad, responsive en móvil, SEO (title, meta, sitemap),
  seguridad (XSS, secretos o claves expuestas, políticas RLS de Supabase demasiado
  abiertas, datos de pacientes expuestos), y regresiones en lo que ya funcionaba.
- Cuestiona las suposiciones: ¿el cambio hace realmente lo que se pidió? ¿Qué se olvidó?
- Para cada hallazgo da: severidad (CRÍTICO/ALTO/MEDIO/BAJO), archivo:línea, el
  escenario concreto que falla y la corrección propuesta.
- Si de verdad no encuentras nada, responde solo "SIN HALLAZGOS" y qué revisaste.
- Responde en español.
TXT

PROMPT="$PROMPT

Revisa: $DESC. El diff va en el bloque <stdin>. Puedes leer cualquier archivo del
repositorio para ver el contexto completo; no modifiques nada."

OUT="$(mktemp)"; LOG="$(mktemp)"
if printf '%s\n' "$DIFF" | codex exec --sandbox read-only -c approval_policy='"never"' -o "$OUT" "$PROMPT" >"$LOG" 2>&1; then
  cat "$OUT"
else
  echo "codex-review: Codex falló. Últimas líneas del log:" >&2
  grep -E "ERROR|error" "$LOG" | tail -5 >&2 || tail -5 "$LOG" >&2
  exit 3
fi
