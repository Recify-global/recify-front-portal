# Auditoría frontend del merge de main en KAN-36 — 15 de julio de 2026

## Estado inicial

- Rama original preservada: `KPIBranch` → `bd685fd`.
- Rama estable: `KPIBranch-stable-main-sync-2026-07-15`.
- Renombre: `KPIBranch-stable-main-sync-2026-07-15` → `KAN-36`.
- HEAD estable / `PRE_MERGE_HEAD`: `f8e33be`.
- `origin/main` / `MAIN_HEAD`: `e9023f4`.
- `main` local: `e9023f4`, idéntica a `origin/main`.
- Commits nuevos: `315bc1b`, `463b9b2`, `1de0fae`, `bf47567`, `99e4ca0`,
  `42585c7`, `e9023f4`.
- Working tree inicial: limpio, sin staged, untracked, stash ni operación abierta.
- Ancestría: `f8e33be` y `da93d9a` ya eran ancestros de `origin/main`.

## Cambios introducidos por main

| Área | Cambio | Archivos | Impacto |
|---|---|---|---|
| Facturas | Listado, detalle, matching, delete y estados | `InvoicesPage.tsx`, componentes `Invoice*` | Funcionalidad nueva |
| Upload | PDF CFDI en el flujo de upload | `UploadPage.tsx`, `upload.service.ts` | Comparte superficie crítica con upload tenant-safe |
| Queries | Hooks y mutations de facturas | `use-invoices.ts` | Nuevas query keys tenant-scoped |
| Routing | Ruta y navegación de facturas | `App.tsx`, `AppSidebar.tsx` | Nueva pantalla protegida |
| Contratos | Tipos de factura y `ticket.invoiceId` | `invoice.ts`, `ticket.ts` | Contrato nuevo |
| API | Endpoints tenant-scoped de facturas | `endpoints.ts`, `invoices.service.ts` | Rutas incluyen `companyId` |
| URLs | Apertura del PDF firmado | `InvoicesPage.tsx`, `InvoiceUploadResult.tsx` | Se endureció a HTTPS |
| Configuración | Main solo agregaba líneas vacías a `.env` | `.env` | Cambio descartado; valor local intacto |
| Dependencias | Sin cambios | `package.json`, `package-lock.json` | Ninguno |

Inventario: 17 archivos en el diff original, 9 agregados, 8 modificados, 0 eliminados,
`+1591/-19`. No hubo cambios en Vite, TypeScript, ESLint, Tailwind ni dependencias.

## Conflictos

El merge `git merge --no-ff --no-commit origin/main` fue automático, sin entradas
unmerged ni marcadores, porque `f8e33be` ya era ancestro de `origin/main`.

| Archivo | KAN-36 | Main | Resolución |
|---|---|---|---|
| `UploadPage.tsx` | Upload ticket con generación y abort | Añade upload PDF | Integración de main + mismos guards para PDF |
| `use-upload-ticket.ts` | Invalidación por compañía de origen | Añade invalidación de facturas | Main ya combinaba ambos lados correctamente |
| `use-invoices.ts` | No existía | Hooks de facturas | Upload recibe `companyId` y `signal` explícitos |
| `.env` | Valor local estable | Solo whitespace | Se preservó exactamente KAN-36 |

## Seguridad

### FRONT-P0-001

- Estado: preservado y extendido al nuevo upload de factura.
- Evidencia ticket: `originCompanyId`, `ActiveUploadContext`, generación,
  `AbortController`, `companyIdRef`, `isCurrentFlow`, `saveClaimRef` e invalidaciones
  por compañía de origen.
- Evidencia factura: `runInvoiceUpload` inicia contexto con la compañía de origen,
  pasa `companyId` y `AbortSignal`, ignora respuestas stale/abortadas y usa claim
  síncrono contra doble ejecución.
- Test nuevo: PDF iniciado en A, cambio A→B, abort y respuesta tardía ignorada.
- Regresiones activas: ninguna P0 encontrada.

### FRONT-P1-001

- Estado base preservado: un solo `QueryClient`, `cancelQueries()`,
  `queryClient.clear()`, cleanup selectivo de storage, cleanup idempotente,
  dedupe de `401`, `403` sin logout y navegación con `replace`.
- Los hooks de upload de factura no invalidan caché durante cierre de sesión.
- La carrera “cleanup A termina después de login B” quedó mitigada con
  `authSessionGeneration` y guards en storage, caché y navegación
  (`MAIN-MERGE-P1-001`, corregido 15-jul-2026).
- Regresión introducida por main: ninguna después del hardening del upload PDF.

### Seguridad general

- Multitenancy: query keys, endpoints y mutations de facturas incluyen `companyId`.
- Auth: la ruta de facturas está dentro de `ProtectedRoute`; el backend sigue siendo la
  autoridad y el frontend no introduce API keys.
- XSS: datos OCR/factura se renderizan como texto JSX; no se añadió HTML crudo.
- URLs: PDFs solo se abren si son URLs HTTPS absolutas; `noopener,noreferrer`.
- Errores: persiste el patrón heredado `FRONT-P1-006` de mostrar algunos mensajes del
  backend; no fue ampliado fuera de la funcionalidad nueva.
- Secrets: búsqueda por patrones no encontró secretos en código.
- Dependencias: no cambiaron.

## Funcionalidad

- Histórico: tabla, filtros, edición inline, imagen, delete y estados se preservaron;
  el Drawer se eliminó posteriormente por decisión de producto.
- KPIs: no fueron modificados; siguen usando endpoint backend, compañía y rango.
- Upload: ticket, preview, OCR, persistencia, PATCH, batch y cámara preservados; PDF
  añadido con aislamiento equivalente.
- Imágenes: tickets usan un modal interno reutilizable; PDFs conservan su flujo
  independiente con validación HTTPS.
- Facturas: ruta, listado, filtros, detalle, matching, missing-ticket, unlink y delete.
- Edición: tests de edición inline pasan.
- Batch: generación, compañía de origen y aborts preservados.
- Cámara: funcional; el race de reapertura indicado abajo queda para ticket posterior.

## Race conditions

| ID | Flujo | Escenario | Evidencia | Severidad |
|---|---|---|---|---|
| KAN36-RACE-001 | Upload | Preprocess anterior termina después de uno nuevo | Generación + `isCurrentFlow` | Protegido |
| KAN36-RACE-002 | Upload | A→B durante upload/PATCH | Contexto de origen + abort + test | Protegido |
| KAN36-RACE-003 | Upload PDF | A responde después de cambiar a B | Guard añadido + test | Protegido |
| KAN36-RACE-004 | Upload | Doble click antes del render | `saveClaimRef` / `invoiceClaimRef` | Protegido |
| KAN36-RACE-005 | Auth | Varios 401 | `cleanupInFlight` | Protegido |
| MAIN-MERGE-P1-001 | Auth | Logout A seguido de login B | `authSessionGeneration` + guards | Protegido en código |
| KAN36-RACE-006 | Histórico | Detalle A responde después de B | IDs y `companyId` verificados | Protegido |
| KAN36-RACE-007 | Imágenes | Error viejo después de URL nueva | Estado asociado a URL | Protegido |
| KAN36-RACE-008 | KPIs | Request vieja después de filtros nuevos | Query key incluye compañía/rango | Protegido |
| KAN36-RACE-009 | Batch | Finalizador viejo modifica lote nuevo | `generationRef` + `isStale` | Protegido |
| KAN36-P2-003 | Cámara | Stream viejo resuelve tras cerrar/reabrir | Solo comprueba `openRef`; no hay generación | P2 heredado |
| KAN36-RACE-010 | Facturas | Upload A responde en B | Contexto, abort y stale guard | Protegido |
| KAN36-P2-004 | Facturas | Mutation de match/delete termina tras A→B | Vista se limpia; toast/QA de callbacks pendiente | P2 / QA runtime |

## Hallazgos

### KAN36-P0-001 — Upload PDF no aislaba respuestas tardías

- Severidad: P0, corregido antes de completar el merge.
- Área: multitenancy / upload.
- Archivo: `UploadPage.tsx`, `use-invoices.ts`.
- Evidencia: main enviaba el PDF con la compañía capturada por closure, pero sin
  generación, `AbortSignal` ni guard antes de actualizar UI.
- Escenario: upload en A, cambio a B, respuesta A mostrada bajo B.
- Impacto: fuga visual cross-tenant.
- Fix: contexto de origen, controller, stale guard, session guard y claim síncrono.
- QA: test automatizado pasa; falta QA browser con API real.

### KAN36-P1-001 — PDF podía abrir protocolos no seguros

- Severidad: P1, corregido antes de completar el merge.
- Área: URLs.
- Archivos: `invoice-display.ts`, `InvoicesPage.tsx`, `InvoiceUploadResult.tsx`.
- Evidencia: `window.open(fileUrl)` aceptaba cualquier string del response.
- Fix: `resolveInvoiceFileUrl` permite únicamente HTTPS absoluto.
- QA: test unitario cubre HTTPS, HTTP, `javascript:`, `data:` y URL relativa.

### MAIN-MERGE-P1-001 — Cleanup tardío de A puede borrar sesión B

- Severidad: P1, **corregido en código** (15-jul-2026).
- Área: auth / sesión / race condition.
- Archivos: `storage.ts`, `session-cleanup.ts`, `SessionCacheBoundary.tsx`,
  `use-auth.ts`, tests de sesión/logout.
- Fix: `authSessionGeneration` incrementa en cada `setAuthSession`; el cleanup captura
  la generación al iniciar y solo limpia storage, caché y navegación si sigue coincidiendo.
- Tests: 6 nuevos (logout/401 + login B, caché B, dedupe por generación, navegación).
- QA runtime: pendiente.

### KAN36-P2-001 — `uuid` frontend no refleja nulabilidad documentada

- Severidad: P2, abierto.
- Área: contrato de facturas.
- Archivo: `types/invoice.ts`, `InvoicesPage.tsx`.
- Evidencia: `uuid: string` y `uuid.toLowerCase()`, mientras el contrato permite UUID
  nulo cuando OCR no lo obtiene.
- Escenario: buscar por RFC con una factura sin UUID puede lanzar error.
- Fix mínimo: modelar `string | null` y normalizar búsqueda/render.
- QA: respuesta real de factura sin folio fiscal.

### KAN36-P2-002 — Listado de facturas limitado a 100 y filtrado en cliente

- Severidad: P2, abierto.
- Área: facturas / paginación.
- Archivo: `InvoicesPage.tsx`.
- Evidencia: `useInvoices({ page: 1, limit: 100 })`; tabs y filtros operan sobre esa
  primera página.
- Impacto: conteos y resultados incompletos con más de 100 facturas.
- Fix mínimo: paginación UI o filtros server-side.
- QA: compañía con más de 100 facturas.

### KAN36-P2-003 — Cámara puede aceptar stream de una apertura anterior

- Severidad: P2 heredado, abierto.
- Área: cámara.
- Archivo: `CameraCaptureDialog.tsx`.
- Evidencia: `getUserMedia()` tardío solo valida el booleano `openRef`; cerrar y reabrir
  antes de resolver vuelve a dejarlo en `true`.
- Fix mínimo: generación por apertura y stop del stream stale.
- QA: mock de dos promises `getUserMedia`.

### KAN36-P2-004 — Callbacks tardíos de mutations de factura requieren QA

- Severidad: P2, abierto.
- Área: facturas / race.
- Archivos: `InvoiceMatchPanel.tsx`, `InvoicesPage.tsx`.
- Evidencia: la vista se cierra en cambio de compañía y backend recibe companyId, pero
  callbacks async pueden emitir toast después del cambio.
- Impacto: feedback stale; no se demostró lectura/escritura cross-tenant.
- Fix mínimo: contexto/generación de compañía en acciones de factura.
- QA: cambiar A→B durante match, unlink y delete.

Los hallazgos heredados `FRONT-P1-003` a `FRONT-P3-004` siguen referenciados en
`FRONTEND-AUDIT-2026-07-13.md`; no se corrigieron en este merge.

## Presets de fecha — 15 de julio de 2026

- Presets anteriores: `Último mes` y `Último año`.
- Presets actuales: `7 días`, `15 días`, `30 días`, `60 días`, `90 días` y
  `Último año`.
- `Último mes` se eliminó de la UI y fue sustituido por el inequívoco `30 días`.
- Fuente de verdad: `DATE_PRESETS` y `dateRangeForPreset()` en
  `src/utils/financial-kpis.ts`.
- Semántica: rangos inclusivos; N días significa hoy y los N−1 días anteriores.
- Zona horaria: fechas civiles en `America/Chihuahua`; KPIs convierten a inicio/fin
  del día con offset `-06:00`.
- Default: `Último año` continúa como rango móvil de 12 meses.
- Histórico y KPIs comparten `dateFromFilter`/`dateToFilter`. Las queries de tickets,
  daily report y KPIs incluyen compañía y ambas fechas en sus query keys.
- Fechas manuales: conservadas; un rango no reconocido deja todos los presets sin
  marcar, y seleccionar un preset reemplaza ambas fechas.
- Accesibilidad/responsive: botones semánticos con `aria-pressed`, focus del componente
  Button y contenedor `flex-wrap`.
- Tests: cálculos fijos de 7/15/30/60/90 días, detección, zona horaria y requests/query
  keys compartidas.
- QA browser/Network: pendiente.

## Eliminación de notas del análisis — 15 de julio de 2026

- Se retiraron las dos secciones `TicketNotes` del resultado de preprocess en
  `UploadPage`.
- Se eliminó el estado exclusivo `analysisRaw`, sus setters y el import sin uso.
- `mapPreprocessTicket` ya no copia `notes`/`notas` al estado `rawData` del preview.
- El draft editable ya era una allowlist sin notas y permanece así.
- El upload continúa enviando únicamente el archivo multipart.
- El PATCH posterior continúa construido mediante allowlist y no contiene `notes`,
  `null`, string vacío ni `undefined`.
- `TicketNotes` se eliminó al quedar sin consumidores después de retirar el Drawer.
  `formatTicketNotes` y el soporte remoto se conservan porque el mapper aún los usa;
  no cambió el contrato backend.
- Tests: preprocess con notas no las renderiza; no hay textarea; upload/PATCH continúan
  sin propiedades de notas.
- QA con OCR/backend real: pendiente.

## Drawer de Histórico y modal interno de imagen — 15 de julio de 2026

- Se eliminó `HistoryTicketDrawer.tsx`, su apertura por fila, el botón “Consultar
  ticket”, los estados de selección/detalle y la query `useTicket`.
- Se eliminó también `TicketNotes.tsx` al confirmar que no tenía otros consumidores.
- Histórico conserva `/tickets` y `dashboard/daily-report`; ya no solicita detalle
  individual al seleccionar filas.
- Se creó `TicketImageDialog.tsx` como único modal de imagen para Histórico y análisis.
- `TicketImagePreview` dejó de renderizar enlaces `target="_blank"`: su acción entrega
  la URL activa al modal, incluida la URL blob fallback.
- El botón de tabla solo se habilita con una URL admitida por
  `resolveTicketImageUrl`; sin URL segura muestra “Sin imagen”.
- El helper común rechaza además referencias protocol-relative (`//host`) para evitar
  que una ruta aparente se resuelva contra un host externo.
- La selección de Histórico conserva ticket, compañía y URL segura. El cambio de
  compañía cierra y limpia el modal.
- El análisis reutiliza el blob existente, no crea una segunda URL y reemplaza/cierra
  el modal antes de revocar el blob anterior.
- Loading y error están asociados a la URL renderizada; callbacks tardíos de A no
  alteran la imagen B.
- Accesibilidad: `Dialog` con título, descripción, focus trap, Escape/backdrop estándar
  y botón visible “Cerrar”. La imagen usa alt específico y `object-contain`.
- Responsive: contenido limitado a `90vh`, imagen a `70vh` y scroll interno.
- Tests actualizados: ausencia de fila interactiva/Drawer, botón con/sin imagen, URL
  insegura, cierre accesible, fallback blob, callback stale, cambio de archivo y
  cambio de compañía.
- QA browser manual: pendiente.

## Corrección de imágenes fallidas en modal — 15 de julio de 2026

### Hallazgo QA runtime

- Algunos tickets abrían el modal pero mostraban “No fue posible cargar la imagen”.
- El helper aceptaba la URL; el fallo ocurría en la carga del `<img>` (403/URL vencida).

### Causa confirmada

- **Categoría:** C — URL firmada vencida en caché + prioridad incorrecta de fuentes.
- **Evidencia:** el backend firma `imageUrl` al leer (`ticket.service`, `dailyReport.service`, TTL 1h). Histórico mezclaba `daily-report` **antes** que `/tickets`, pudiendo usar una firma más antigua cuando las queries se refrescaban en momentos distintos. `getTicketImageUrl` también prefería `rawData.imageUrl` sobre el `imageUrl` top-level ya firmado.
- **Archivo responsable:** `HistoryPage.tsx`, `ticket-display.ts`, `ticket-image.ts`.
- **¿Requiere backend?** No para el fix principal; el backend ya re-firma en lectura.

### Fix aplicado

- `mergeTicketImageUrl`: prioriza `ticket.imageUrl` (listado) sobre daily-report.
- `getTicketImageUrl`: prioriza campos top-level firmados antes que `rawData`.
- `resolveTicketImageUrl`: conserva la cadena HTTPS original (no re-serializa query firmada); rechaza `data:`, `file:`, `ftp:`; mantiene bloqueo de `token` de sesión, no de `X-Amz-Signature`.
- Modal: botón **Reintentar** refetchea tickets + daily-report una vez y actualiza la URL si cambió.
- Preview: resetea estado load/error al cambiar URL; callbacks asociados a la imagen activa.
- Tests: URLs firmadas, merge, prioridad rawData, retry, esquemas bloqueados.

### QA runtime pendiente

- Repetir con tickets que antes fallaban (mínimo 3) y confirmar carga o error legítimo.

## Checks

- TypeScript: ✅ `npx tsc --noEmit`.
- ESLint dirigido: ✅ sin errores en archivos modificados y áreas críticas.
- ESLint global: ⚠️ solo 3 errores históricos (`command.tsx`, `textarea.tsx`,
  `tailwind.config.ts`) y 7 warnings históricos de Fast Refresh.
- Tests dirigidos del modal/Histórico/Upload: ✅ 39/39.
- Tests completos actuales: ✅ 105/105, 12 archivos.
- Build: ✅ Vite production build.
- `git diff --check`: ✅.
- Marcadores de conflicto: ✅ ninguno en `src` o `docs`.

## Limitaciones

- No se ejecutó QA browser con dos compañías y backend real.
- No se reprodujo runtime de auth A→B ni mutations de matching A→B.
- No se validó una factura real sin UUID.
- No se verificó paginación con más de 100 facturas.
- Backend no fue modificado ni ejecutado.

## Próximos tickets

1. QA runtime de `MAIN-MERGE-P1-001`, `FRONT-P0-001` y `FRONT-P1-001`.
2. Corregir nulabilidad de UUID y añadir pruebas contractuales.
3. Implementar paginación/filtros backend en Facturas.
4. Añadir generación a cámara.
5. Añadir guards runtime a match/unlink/delete de facturas.
6. QA browser A→B de upload, auth, facturas, batch, cámara e imágenes.

## Veredicto

⚠️ Merge completado con hallazgos o QA runtime pendiente.

No quedan P0/P1 nuevos activos. Los dos hallazgos bloqueantes introducidos por main
fueron corregidos y cubiertos. Los P2 y el P1 heredado quedan documentados para tickets
posteriores.

### Veredicto del ticket de imágenes

🔎 Fix implementado; falta repetir QA con imágenes reales que antes fallaban.

---

## Tickets acreditables en Histórico — 16 de julio de 2026

### Decisión de producto

- Campo canónico: `isAccreditable: boolean` (`true` = Sí, `false` = No).
- Default y tickets antiguos: `false`.
- Columna compacta **Acreditable** con ícono de ayuda y tooltip:
  `Indica si este ticket puede utilizarse para un proceso de acreditación.`
- Switch por fila con texto `Sí`/`No` y `aria-label` por comercio.
- Persistencia vía PATCH existente `dashboard/daily-report/:ticketId`
  (mismo body que tickets); payload mínimo `{ isAccreditable }`.

### Estabilización 16-jul (asincronía del switch)

**Causa:** el merge de Histórico priorizaba `daily-report.isAccreditable` sobre
`/tickets`. Tras un PATCH, la invalidación refetchaba ambas fuentes a distinta
velocidad: un daily-report stale con `false` podía sobrescribir un listado ya
actualizado a `true` (parpadeo / sensación asíncrona). Además un solo
`accreditableSavingId` bloqueaba *todas* las filas en el handler mientras la UI
solo deshabilitaba una.

**Fix:**
- Prioridad: `ticket.isAccreditable ?? dailyTicket.isAccreditable ?? false`.
- Switch controlado (`checked`), sin optimistic update: permanece en el valor
  actual hasta confirmar el backend.
- Pending por ticket con `Set` + ref síncrono (A y B independientes; finalizer
  de A no libera B; doble click no dispara dos PATCH).
- Tras éxito: `setQueriesData` en queries de `originCompanyId` con el valor
  confirmado, además de la invalidación existente.
- Cambio de compañía limpia el Set de pending.

### Caché y carreras

- Mutation reutiliza `useUpdateDashboardTicket` (invalidación por `companyId` de origen).
- Durante el PATCH se deshabilita solo el switch de esa fila.
- Tras éxito/error se compara `companyIdRef` con `originCompanyId` para no
  toast/contaminar la compañía B.

### Tests

- `src/test/history-accreditable.test.tsx` — columna, pending sin cambio visual,
  prioridad de merge, pending independiente, payload, A→B, error.
- `history-inline-editing.test.tsx` actualizado con la nueva columna y props.

### QA runtime

- ✅ Evidencia local: PATCH `.../daily-report/:ticketId` 200 seguido de refetch
  de `/tickets` y daily-report (tamaños de respuesta varían con true/false).
- Suites automáticas: backend 47/47, frontend 123/123.

### Auditoría final / cierre

| Ítem | Estado |
|---|---|
| Prioridad `/tickets` → daily → false | ✅ |
| Switch controlado, sin optimistic | ✅ |
| Pending `Set` + ref por ticket | ✅ |
| Cache por `originCompanyId` | ✅ |
| TypeScript / tests / build | ✅ |
| ESLint dirigido | ✅ (errores globales históricos ajenos) |
| Veredicto | ✅ Default persistido y switch estable con QA runtime aprobado |
