---
id: 2025-11-06_testing-firestore-v1
date: 2025-11-06
area: testing|security
modules: [rules, inboundPackages, boxes, shipments, ui]
status: adopted
supersedes: []
obsoleted_by: []
---

## Resumen técnico
Se implementó una suite de pruebas:
- Vitest (unit/integration/UI), Playwright (E2E), Firebase Emulator para reglas.
- Reglas Firestore (multi-rol y clientId) validadas: inboundPackages (transiciones), boxes (clientId inmutable), shipments (lectura por pertenencia).

## Decisiones tomadas
- Ejecutar reglas sólo con `RUN_RULES=1` y `firebase emulators:exec` para aislar permisos.
- Sembrar datos con `env.withSecurityRulesDisabled()` durante el seed, y validar **lecturas** con reglas activas.
- Separar scripts: `test`, `test:rules`, `test:all`, `e2e`.

## Errores / Lecciones aprendidas
- PostCSS/Tailwind en Vercel: remover `--turbopack` en build y usar Tailwind v3 + shape de PostCSS canónica.
- No mezclar Tailwind v3 con `@tailwindcss/postcss` (v4).
- En tests de reglas, pasar **todos** los campos exigidos por las reglas (no sólo `status`).

## Estado actual
- 8 test files / 13 tests passing (incluye rules).
- Build en Vercel exitoso con `next build`.

## Próximos pasos
- Agregar E2E básicos (login admin, flujo cliente).
- Documentar en `/docs/testing.md` y enlazar en README.