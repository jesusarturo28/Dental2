---
name: codex-review
description: Revisión adversarial del trabajo de Claude usando el CLI de Codex (OpenAI). Úsala antes de cada commit/push o cuando el usuario pida "revisa con codex", "segunda opinión" o "revisión adversarial".
---

# Revisión adversarial con Codex

Codex actúa como segundo revisor, independiente y escéptico, del trabajo de Claude.

## Cuándo
- Siempre antes de hacer commit o push de cambios en este repositorio.
- Cuando el usuario pida una revisión, segunda opinión o "revisa con codex".

## Cómo
1. Ejecuta el revisor sobre los cambios:
   - Cambios sin commit: `bash scripts/codex-review.sh`
   - Rama completa: `bash scripts/codex-review.sh --base main`
   - Un commit: `bash scripts/codex-review.sh --commit <sha>`
   Usa un timeout largo (10 min). Codex corre en modo solo lectura.
2. Trata cada hallazgo como una afirmación a verificar, no como orden:
   comprueba si es real leyendo el código.
3. Corrige los hallazgos reales (CRÍTICO/ALTO siempre; MEDIO/BAJO si son correctos y baratos).
4. Vuelve a ejecutar la revisión hasta que no queden hallazgos CRÍTICO/ALTO válidos.
5. Al usuario dile en pocas líneas qué encontró Codex, qué corregiste y qué descartaste y por qué.

## Si falla
- Código 2 / "sin credenciales": hay que iniciar sesión con `codex login --device-auth` (cuenta de ChatGPT); pídele al usuario que apruebe el código.
- "CONNECT tunnel failed 403": la política de red no permite `api.openai.com`.
En ambos casos díselo al usuario; no inventes resultados de revisión.
