# Auditoría frontend de seguridad, arquitectura y calidad — 13 de julio de 2026

## Resumen ejecutivo

- Rama: `KPIBranch`
- Commit base de este fix: `78c3265 docs: add frontend security audit and refresh backend gaps`
- Scope: frontend Recify (`Recify-Front`), incluyendo los fixes locales sin commit de `FRONT-P0-001` y `FRONT-P1-001`
- Archivos revisados: auth, HTTP, guards, hooks, services, mappers, utils, History, Upload, batch, cámara, KPIs, edición inline, docs
- P0: 1
- P1: 9
- P2: 10
- P3: 4
- Estado general: el aislamiento del upload individual y la limpieza de sesión/caché fueron corregidos en código y pruebas automatizadas; ambos quedan pendientes de QA runtime.

## Arquitectura actual

- Auth: `src/auth/storage.ts` + `src/hooks/use-auth.ts`; JWT y usuario en `localStorage`; perfil persistido con validación mínima; `ProtectedRoute` exige perfil, token y `companyId`
- HTTP: `src/api/http.ts` (`fetch` centralizado, Bearer, 401 usa cleanup idempotente de sesión; 403 conserva sesión); rutas en `src/api/endpoints.ts`
- Queries: React Query con `companyId` en keys de tickets, detalle, daily-report y KPIs
- Mutations: upload, PATCH daily-report, delete; History captura `originCompanyId`
- Multitenancy: selector valida pertenencia; History limpia drawer/drafts; batch aborta/limpia al cambiar compañía
- Histórico: tabla ampliada + drawer read-only + edición inline (working tree)
- Upload: individual + batch + cámara
- Imágenes: `resolveTicketImageUrl` / `selectTicketImageUrl`; enriquecimiento vía daily-report
- KPIs: `GET /dashboard/kpis` vía `useFinancialKpis`
- Edición: drafts por fila; payload sin `reviewStatus`; concurrencia máxima 2

```text
UI → hook → service → apiRequest → endpoints → mapper → React Query cache → UI
```

## Hallazgos prioritarios

### FRONT-P0-001 — Upload individual puede persistir trabajo de compañía A bajo compañía B

- Severidad: P0
- Estado anterior: Abierto
- Estado: 🔎 Corregido en código; pendiente QA runtime
- Área: Multitenancy / Upload
- Evidencia: `UploadPage` conserva `ticket`, `selectedFile`, `previewUrl` y drafts locales sin reset al cambiar `companyId`. `useUploadTicket` usa el `companyId` activo al momento del `mutate`. Batch sí limpia cola al cambiar compañía; Upload no.
- Archivo: `src/pages/UploadPage.tsx`, `src/hooks/use-upload-ticket.ts`
- Flujo afectado: analizar en A → cambiar a B → Guardar
- Riesgo: ticket/imagen de A se escribe en B
- Escenario reproducible: usuario con dos compañías; analizar en A; cambiar selector; guardar sin reanalizar
- Fix mínimo recomendado: reset + abort al cambiar compañía; capturar `originCompanyId` al seleccionar archivo; bloquear save si el origen ≠ compañía activa
- Fix aplicado: contexto `{ companyId, generation }` capturado al aceptar el archivo; `AbortController` por operación; guards stale; limpieza total al cambiar compañía; claim síncrono anti doble click; compañía de origen explícita en preprocess, upload, PATCH e invalidación
- Archivos: `src/pages/UploadPage.tsx`, `src/hooks/use-upload-ticket.ts`, `src/hooks/use-tickets.ts`, `src/services/dashboard.service.ts`, `src/utils/individual-upload-flow.ts`
- Tests: 20 pruebas nuevas en `individual-upload-flow.test.ts`, `upload-ticket-hooks.test.tsx` y `upload-page-isolation.test.tsx`; suite completa: 64/64
- QA: no ejecutado en navegador conectado; pendientes los casos Network A→B
- Estado final: 🔎 Corregido en código; pendiente QA runtime
- Fecha: 13 de julio de 2026
- Backend requerido: no (mitigación frontend obligatoria; backend ya debe validar membership)
- QA requerido: cambio de compañía durante preprocess y durante save

### FRONT-P1-001 — React Query no se limpia en logout

- Severidad: P1
- Estado anterior: Abierto
- Estado: 🔎 Corregido en código; pendiente QA runtime
- Área: Sesión / caché
- Evidencia: `logout` solo llama `clearAuthSession()` y navega; no hay `queryClient.clear()` ni `removeQueries` en el repo. `QueryClient` es singleton en `App.tsx`.
- Archivo: `src/hooks/use-auth.ts`, `src/App.tsx`
- Flujo afectado: logout → login de otro usuario/sesión en la misma pestaña
- Riesgo: flash de tickets/KPIs del usuario o compañía anterior
- Escenario reproducible: ver Histórico, logout, login con otra cuenta que comparta compañía o navegue rápido a Histórico
- Fix mínimo recomendado: `queryClient.clear()` (y cancelar queries) en logout; opcionalmente al login exitoso
- Causa: el QueryClient real no estaba conectado al ciclo de sesión; el 401 limpiaba únicamente storage y `getStoredUser` permitía una sesión parcial con perfil inválido
- Fix: `SessionCacheBoundary` registra la instancia del provider; logout manual y 401 comparten un coordinador idempotente que cancela queries, limpia QueryCache/MutationCache, elimina las tres keys auth y luego navega con `replace`; 403 no termina sesión; callbacks tardíos de upload, batch e Histórico no muestran toasts ni invalidan durante el cierre
- Archivos: `src/App.tsx`, `src/api/http.ts`, `src/auth/SessionCacheBoundary.tsx`, `src/auth/session-cleanup.ts`, `src/auth/storage.ts`, `src/guards/ProtectedRoute.tsx`, `src/hooks/use-auth.ts`, `src/hooks/use-tickets.ts`, `src/hooks/use-upload-ticket.ts`, `src/components/recify/BatchUploadDialog.tsx`, `src/pages/HistoryPage.tsx`
- Tests: 13 pruebas nuevas de cleanup, storage, logout, 401/403, response tardía, segundo usuario, login, cambio de compañía y guard; suite completa: 77/77
- QA: no ejecutado en navegador conectado; pendientes logout con drawer/query/mutation, Back, segundo usuario y Network 401/403
- Estado final: 🔎 Corregido en código; pendiente QA runtime
- Fecha: 13 de julio de 2026
- Backend requerido: no
- QA requerido: logout/login en misma pestaña con datos cacheados

### FRONT-P1-002 — Respuesta tardía de preprocess individual sin guard de compañía

- Severidad: P1
- Estado: 🔎 Mitigado dentro de FRONT-P0-001; pendiente QA runtime
- Área: Asincronía / Upload
- Evidencia: `runPreprocess` aplica `setTicket` / `setState('done')` sin `AbortController`, sin `companyIdRef` y sin chequeo stale. El servicio sí acepta `signal`, pero Upload no lo pasa.
- Archivo: `src/pages/UploadPage.tsx`
- Flujo afectado: analizar en A → cambiar a B antes de la respuesta
- Riesgo: UI de B muestra análisis de A; combina con FRONT-P0-001 al guardar
- Fix mínimo recomendado: generation/ref + abort al cambiar compañía/archivo; ignorar respuesta stale
- Backend requerido: no

### FRONT-P1-003 — JWT y perfil en `localStorage` (superficie XSS)

- Severidad: P1
- Estado: Abierto (riesgo arquitectónico aceptado hoy)
- Área: Autenticación
- Evidencia: `setAuthSession` persiste `recify.token` y `recify.user`; `http.ts` lee el token para `Authorization`
- Archivo: `src/auth/storage.ts`, `src/api/http.ts`
- Riesgo: cualquier XSS futuro puede exfiltrar sesión
- Fix mínimo recomendado: CSP estricta + sanitización continua; largo plazo cookies httpOnly (requiere backend)
- Backend requerido: sí para migración a cookie httpOnly
- Nota: no hay evidencia de token en URL ni en logs del frontend

### FRONT-P1-004 — URLs protocol-relative (`//host/...`) bypassan resolución segura de imagen

- Severidad: P1
- Estado: Abierto
- Área: XSS / imágenes
- Evidencia: en el `catch` de `resolveTicketImageUrl`, cualquier string que empiece con `/` se resuelve con `new URL(raw, base)`. `//evil.example/x.jpg` se interpreta como host absoluto y pasa el filtro de protocolo si es `https:`.
- Archivo: `src/utils/ticket-image.ts` (aprox. líneas 48–55)
- Flujo afectado: preview de ticket / apertura en nueva pestaña
- Riesgo: cargar o abrir origen no confiable si el backend o OCR entregan esa forma
- Fix mínimo recomendado: aceptar solo rutas relativas `raw.startsWith('/') && !raw.startsWith('//')`; test unitario
- Backend requerido: no

### FRONT-P1-005 — Eliminar ticket sin confirmación

- Severidad: P1
- Estado: Abierto
- Área: Mutaciones destructivas / accesibilidad
- Evidencia: botón basura llama `onDelete` inmediato; solo existe `AlertDialog` para cancelar edición, no para borrar
- Archivo: `src/components/recify/HistoryTicketTable.tsx`, `src/pages/HistoryPage.tsx`
- Riesgo: borrado irreversible por click accidental
- Fix mínimo recomendado: reutilizar `AlertDialog` existente antes de `deleteMutation`
- Backend requerido: no

### FRONT-P1-006 — Mensajes de error backend crudos en toasts

- Severidad: P1
- Estado: Abierto
- Área: Errores / observabilidad
- Evidencia: `ApiRequestError.message` (proveniente de `parsed?.message`) se muestra en Upload, Auth y batch; History inline ya usa mensaje genérico
- Archivo: `src/api/http.ts`, `src/pages/UploadPage.tsx`, `src/pages/AuthPage.tsx`, `src/hooks/use-batch-upload.ts`
- Riesgo: filtrado de mensajes internos / detalles de validación no sanitizados
- Fix mínimo recomendado: mapa de mensajes por status; log interno opcional; UI con copy fijo
- Backend requerido: no (aunque backend ya sanitiza 500 en prod)

### FRONT-P1-007 — KPIs no se invalidan tras mutaciones

- Severidad: P1
- Estado: Abierto
- Área: React Query / finanzas
- Evidencia: invalidaciones cubren `tickets`, `dashboard-daily-report`, `dashboard-summary`, `dashboard-by-payment-method`, pero no `dashboard-kpis` (key real de `useFinancialKpis`)
- Archivo: `src/hooks/use-tickets.ts`, `src/pages/HistoryPage.tsx`, `src/hooks/use-financial-kpis.ts`
- Riesgo: cards financieras stale tras editar/borrar/subir
- Fix mínimo recomendado: invalidar `['dashboard-kpis', companyId]` en mutations relevantes
- Backend requerido: no

### FRONT-P1-008 — Upload post-save PATCH sin `companyId` explícito

- Severidad: P1
- Estado: 🔎 Mitigado dentro de FRONT-P0-001; pendiente QA runtime
- Área: Mutaciones / Upload
- Evidencia: `updateMutation.mutateAsync({ ticketId, payload })` omite `companyId` que ahora exige `useUpdateDashboardTicket` (working tree/History). La corrección de campos post-upload puede fallar o comportarse de forma inconsistente.
- Archivo: `src/pages/UploadPage.tsx` (handleSave)
- Fix mínimo recomendado: pasar `companyId` de origen capturado al iniciar el flujo
- Backend requerido: no

## Autenticación y sesión

Ver FRONT-P1-001, FRONT-P1-003.

Sólido:

- 401 limpia sesión y dispara sync a `ProtectedRoute`
- Storage centralizado; no hay token en query params del cliente
- `setActiveCompany` valida membresía en UI

Pendiente de verificación runtime:

- Manipulación directa de `recify.companyId` en DevTools (FRONT-P2-001): depende de ACL backend 403

## Multitenancy

Ver FRONT-P0-001, FRONT-P1-002.

Sólido:

- Query keys con `companyId`
- History: drawer, imagen, drafts y edits amarrados a compañía de origen
- Batch: generation + AbortController + clear al cambiar compañía
- `selectTicketImageUrl` exige compañía + ticket

## Contratos y validación

### FRONT-P2-004 — `apiRequest<T>` confía en casts sin schema runtime

- Severidad: P2
- Área: Contratos
- Evidencia: `return (parsed?.data ?? parsed) as T`
- Fix: parsers Zod/guards en bordes críticos (auth, ticket, KPIs ya tienen `parseKpis` parcial)

### FRONT-P2-005 — Mapper convierte montos inválidos a `0` y status desconocido a `processed`

- Severidad: P2
- Área: Contratos / finanzas
- Evidencia: `mapBackendTicket` usa `Math.max(0, asNumber(amount) ?? 0)` y `normalizeStatus` default `processed`
- Fix: distinguir desconocido vs cero; default `pending`

No se encontró uso de `any` en `src/`.

## XSS y contenido no confiable

Ver FRONT-P1-004.

Sólido:

- OCR/notas/productos como texto React (`TicketNotes`, celdas de tabla)
- Sin `dangerouslySetInnerHTML` en flujos de ticket (solo chart UI estático)
- `rel="noopener noreferrer"` en preview de imagen
- Rechazo de `javascript:` y query keys sensibles de token

## Archivos, cámara e imágenes

### FRONT-P2-006 — Validación MIME solo por `file.type`

- Severidad: P2
- Área: Upload
- Evidencia: Upload/batch validan MIME del navegador; backend debe revalidar (confirmado en contrato upload 10MB)
- Fix frontend: magic bytes opcional; no sustituye backend

Sólido:

- `revokeObjectURL` en Upload, batch y unmount
- Cámara detiene tracks al cerrar
- Enrichment de `imageUrl` vía daily-report documentado

## Asincronía y races

Ver FRONT-P0-001, FRONT-P1-002.

### FRONT-P2-007 — Save de History tras cambio de compañía puede persistir sin feedback UI

- Severidad: P2
- Área: Edición inline
- Evidencia: tras requests, si `companyIdRef !== originCompanyId` hace `return` sin toast
- Fix: toast discreto “guardado en la compañía original” o cancelar requests al cambiar compañía

### FRONT-P3-001 — Doble click en “Usar foto” de cámara

- Severidad: P3
- Área: Cámara
- Evidencia: `handleConfirm` sin lock in-flight

## React Query y caché

Ver FRONT-P1-001, FRONT-P1-007.

Sólido: no hay `placeholderData`/`keepPreviousData` que mezcle compañías; keys incluyen filtros de fecha en KPIs.

### FRONT-P2-008 — Batch save solo invalida `tickets`

- Severidad: P2
- Área: Caché
- Evidencia: `BatchUploadDialog` no invalida daily-report ni KPIs
- Fix: alinear invalidaciones con History/upload

## Edición y mutaciones

Sólido (working tree Histórico):

- Solo filas dirty
- Sin `reviewStatus` en payload
- Concurrencia ≤ 2
- Claim anti doble click
- `originCompanyId` en save/delete
- Cancelación con `AlertDialog`

Ver FRONT-P1-005, FRONT-P1-008.

## KPIs financieros

### FRONT-P1-009 — Agregados KPI incluyen `duplicate`/`failed` y se muestran como métricas del período

- Severidad: P1
- Estado: Abierto (brecha backend + UI honesta parcial)
- Área: Finanzas
- Evidencia: `useFinancialKpis` documenta `includesAllStatuses: true`; backend `buildMatch` no excluye status; frontend no usa `isKpiExcludedStatus` en runtime. Ante categoría, UI muestra `No disponible` (correcto). No se suman los primeros 100 tickets para KPIs.
- Archivo: `src/hooks/use-financial-kpis.ts`, backend `dashboard/helpers.js` / `kpis.service.js`
- Fix frontend mínimo: mantener unavailable/disclaimer explícito si producto exige exclusión exacta; no inventar filtrado client-side sobre página
- Backend requerido: sí — exclusión de status y filtro `category` en `/dashboard/kpis`

Sólido:

- Búsqueda no afecta KPIs
- Default último año
- Rango inválido no consulta
- Moneda MXN

### FRONT-P2-009 — Tabla (máx. 100 + filtros client) puede divergir del conjunto KPI

- Severidad: P2
- Área: Finanzas / UX
- Evidencia: `useTickets({ page: 1, limit: 100 })` + filtros locales de status/categoría
- Impacto: filas visibles ≠ universo del agregado

## Errores y observabilidad

Ver FRONT-P1-006.

Sólido: History inline y errores de cámara usan copy de usuario; abort en batch no se reporta como fallo de negocio en el patrón stale.

## Configuración y dependencias

### FRONT-P2-010 — `.env` versionado y ausente en `.gitignore`

- Severidad: P2
- Estado: Abierto
- Área: Configuración
- Evidencia: `git ls-files .env` → tracked; contenido actual `VITE_API_URL=http://localhost:3000`; `.gitignore` no incluye `.env`
- Riesgo: filtrar secretos futuros si alguien agrega claves al mismo archivo
- Fix: agregar `.env` a `.gitignore`, dejar `.env.example`, retirar tracking (sin borrar local)

### FRONT-P2-011 — Dependencias con advisories npm (no verificadas como explotables en app)

- Severidad: P2 (pendiente de verificación de explotabilidad)
- Evidencia: `npm audit --omit=dev` reportó 10 issues (7 high / 3 moderate), incluyendo `react-router` open-redirect XSS advisory, `lodash`, `glob`, `minimatch`, `picomatch`, `postcss`, `yaml`
- Nota: no se ejecutó `npm audit fix`; no se afirma explotabilidad en el flujo Recify sin PoC
- Fix sugerido: ticket aparte de actualización controlada + QA de rutas

### FRONT-P3-002 — `VITE_API_URL` vacío cae a same-origin

- Severidad: P3 / misconfiguración
- Evidencia: `resolveBaseUrl()` retorna `''` si falta la variable

## Accesibilidad

Ver FRONT-P1-005.

### FRONT-P3-003 — Controles de búsqueda sin nombre accesible completo

- Severidad: P3
- Área: A11y
- Evidencia: input de Histórico con placeholder; botón clear sin `aria-label` estable

### FRONT-P3-004 — Batch usa `window.confirm` al cerrar

- Severidad: P3
- Área: A11y / UX
- Evidencia: `BatchUploadDialog` vs `AlertDialog` en History

## Deuda arquitectónica

- Dual fetch tickets + daily-report para imágenes
- Invalidaciones inconsistentes entre upload/batch/history
- Documento backend desactualizado respecto a `/dashboard/kpis` (corregido en esta auditoría documental)
- Helpers financieros (`resolveMostUsedPaymentMethod`) parcialmente no usados por el path KPI actual

## Matriz priorizada

| ID | Severidad | Área | Resumen | Backend | Complejidad | Estado |
|---|---|---|---|---:|---:|---|
| FRONT-P0-001 | P0 | Multitenant | Upload A→B write | No | Media | Corregido; pendiente QA |
| FRONT-P1-001 | P1 | Sesión | Cache tras logout | No | Baja | Corregido; pendiente QA |
| FRONT-P1-002 | P1 | Upload | Preprocess stale | No | Media | Corregido; pendiente QA |
| FRONT-P1-003 | P1 | Auth | JWT en localStorage | Parcial | Alta | Abierto |
| FRONT-P1-004 | P1 | Imágenes | `//` URL bypass | No | Baja | Abierto |
| FRONT-P1-005 | P1 | Delete | Sin confirmación | No | Baja | Abierto |
| FRONT-P1-006 | P1 | Errores | Toast crudo | No | Baja | Abierto |
| FRONT-P1-007 | P1 | Cache | KPIs stale | No | Baja | Abierto |
| FRONT-P1-008 | P1 | Upload | PATCH sin companyId | No | Baja | Corregido; pendiente QA |
| FRONT-P1-009 | P1 | KPIs | Incluye duplicate/failed | Sí | Media | Abierto |
| FRONT-P2-001 | P2 | Auth | companyId DevTools | Sí ACL | Baja | Pendiente verificación |
| FRONT-P2-002 | P2 | Upload | Invalidación stale company | No | Baja | Abierto |
| FRONT-P2-003 | P2 | Auth | Perfil en localStorage | No | Media | Abierto |
| FRONT-P2-004 | P2 | Contratos | Casts sin schema | No | Alta | Abierto |
| FRONT-P2-005 | P2 | Mapper | 0 / processed defaults | No | Media | Abierto |
| FRONT-P2-006 | P2 | Upload | MIME client-only | Sí | Baja | Abierto |
| FRONT-P2-007 | P2 | Edición | Save sin feedback al switch | No | Baja | Abierto |
| FRONT-P2-008 | P2 | Cache | Batch invalidación incompleta | No | Baja | Abierto |
| FRONT-P2-009 | P2 | UX | Tabla 100 vs KPIs | Parcial | Media | Abierto |
| FRONT-P2-010 | P2 | Config | `.env` tracked | No | Baja | Abierto |
| FRONT-P2-011 | P2 | Deps | npm audit highs | No | Media | Pendiente verificación |
| FRONT-P3-001 | P3 | Cámara | Doble confirm | No | Baja | Abierto |
| FRONT-P3-002 | P3 | Config | API URL vacía | No | Baja | Abierto |
| FRONT-P3-003 | P3 | A11y | Search labels | No | Baja | Abierto |
| FRONT-P3-004 | P3 | A11y | window.confirm batch | No | Baja | Abierto |

## Orden recomendado de corrección

1. FRONT-P0-001 (+ FRONT-P1-002, FRONT-P1-008 en el mismo ticket de Upload)
2. QA runtime de FRONT-P0-001 y FRONT-P1-001
3. FRONT-P1-004 (URL `//`)
4. FRONT-P1-005 (confirm delete)
5. FRONT-P1-007 + FRONT-P2-008 (invalidaciones)
6. FRONT-P1-006 (errores)
7. FRONT-P1-009 + trabajo backend de KPIs
8. FRONT-P2 / P3 restantes
9. FRONT-P1-003 solo con diseño auth backend

## Reglas para futuros fixes

- Un ticket por hallazgo o grupo estrechamente relacionado
- Audit inicial → fix mínimo → tests → checks → QA → veredicto
- No mezclar refactors
- No tocar backend sin autorización
- No declarar resuelto sin evidencia runtime

## Checks sugeridos

- TypeScript: `npx tsc --noEmit` aprobado
- ESLint dirigido: aprobado sin errores ni warnings
- ESLint global: falla por 3 errores preexistentes fuera del scope (`command.tsx`, `textarea.tsx`, `tailwind.config.ts`)
- Tests: `npm run test` aprobado, 77/77
- Build: `npm run build` aprobado; warnings preexistentes de Browserslist/chunk
- QA manual: no ejecutado; FRONT-P0-001 y FRONT-P1-001 quedan pendientes de verificación en navegador conectado

## Limitaciones de la auditoría

- Casos no probados: QA browser/Network de A→B upload, logout/segundo usuario/401/403 y delete accidental
- Backend inspeccionado en lectura local (`recify-back-api`) para contrastar contratos; no se modificó
- Runtime/navegadores: no probados en esta fase
- `npm audit` no implica explotabilidad confirmada en Recify
- FRONT-P0-001 cuenta con cobertura automatizada, pero no se declara cerrado sin QA runtime A→B
- FRONT-P1-001 cuenta con cobertura automatizada, pero no se declara cerrado sin QA runtime de logout y cambio de usuario
