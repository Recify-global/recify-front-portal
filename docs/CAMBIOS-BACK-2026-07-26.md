# Cambios backend pendientes — Recify

Última actualización: 27 de julio de 2026

## Resumen

| ID | Severidad | Área | Estado |
|---|---|---|---|
| BACK-P1-001 | P1 | Rate limit global | Pendiente |
| BACK-P1-002 | P1 | Fechas de Histórico | Pendiente |
| BACK-P1-003 | P1 | Acreditable en creación | Pendiente |
| BACK-P2-001 | P2 | Búsqueda global de Facturas | Pendiente |

---

# BACK-P1-001 — Rate limit global

## Estado

Pendiente.

## Evidencia confirmada

- Respuesta observada: `429 Too Many Requests`.
- `RateLimit-Policy: 100;w=900`.
- `RateLimit-Remaining: 0`.
- `Retry-After` presente.
- Histórico realiza aproximadamente tres lecturas por cambio efectivo:
  - tickets;
  - daily-report;
  - KPIs.
- El proceso backend no se cayó.
- No se observó desconexión de MongoDB.
- Frontend ya evita una nueva request al pulsar el preset activo.
- Frontend evita retry automático de 429 en los flujos auditados.

No incluir identificadores reales, tokens o cookies.

## Problema

La misma cuota global puede agotarse mediante navegación normal o QA intensivo y después bloquear:

- tickets;
- KPIs;
- daily-report;
- uploads;
- otras operaciones principales.

No es únicamente un problema local de UX.

## Requerimiento backend

- Revisar si `100 requests / 900 segundos` es apropiado para navegación autenticada.
- Separar límites por clase de operación:
  - lecturas;
  - escrituras;
  - uploads;
  - operaciones sensibles.
- Evitar que consultas de dashboard bloqueen uploads.
- Revisar la configuración de IP y proxy.
- Mantener `Retry-After` y headers públicos de rate limit.
- Definir la política por usuario, compañía, IP y endpoint.
- Agregar logging seguro del evento sin tokens ni datos sensibles.
- Confirmar si respuestas `304` consumen cuota y documentar la decisión.

No solicitar eliminar completamente el rate limit.

## Criterios de aceptación

1. Navegar y alternar filtros razonablemente no bloquea uploads.
2. Lecturas no consumen la misma cuota crítica que escrituras/uploads.
3. Un 429 incluye `Retry-After`.
4. No se exponen internals.
5. La política funciona detrás del proxy real.
6. Existen tests automatizados de cuota y recuperación.

---

# BACK-P1-002 — `dateTo` inclusivo en Histórico

## Estado

Pendiente y confirmado contra API real.

## Endpoints afectados

- `GET /api/v1/companies/:companyId/tickets`
- `GET /api/v1/companies/:companyId/dashboard/daily-report`

Endpoint relacionado para comparación:

- `GET /api/v1/companies/:companyId/dashboard/kpis`

## Evidencia

Fecha de referencia:

`2026-07-27`

| Filtro | dateFrom | dateTo | Ticket 27 | Ticket 26 |
|---|---|---|---|---|
| Hoy | 2026-07-27 | 2026-07-27 | No | No esperado |
| Ayer | 2026-07-26 | 2026-07-26 | No esperado | Sí |
| 7 días | 2026-07-21 | 2026-07-27 | No | Sí |
| 30 días | 2026-06-28 | 2026-07-27 | No | Sí |
| 60 días | 2026-05-29 | 2026-07-27 | No | Sí |
| 90 días | 2026-04-29 | 2026-07-27 | No | Sí |
| Último año | 2025-07-27 | 2026-07-27 | No | Sí |
| Todo el historial | ausente | ausente | Sí | Sí |

Para 15 días:

- rango calculado frontend y cubierto por tests;
- QA indicó el mismo comportamiento;
- la request exacta no quedó capturada;
- no inventar evidencia adicional.

Tickets y daily-report reciben fechas civiles `YYYY-MM-DD`.

KPIs reciben el mismo rango como límites completos:

- inicio: `00:00:00.000`;
- fin: `23:59:59.999`;
- offset del timezone de compañía.

El valor wire exacto del ticket no quedó capturado. La UI lo muestra como `27/07/2026` y aparece al consultar sin fechas.

No se aplicó workaround de `+1 día`.

## Problema

Tickets y daily-report excluyen registros del día civil indicado por `dateTo`.

Esto provoca:

- Hoy sin tickets del día actual.
- Rangos 7/15/30/60/90 días sin movimientos del último día.
- Último año sin movimientos del día actual.
- Posible desalineación entre listado y KPIs.

## Semántica requerida

Preferencia:

- `dateFrom` incluye todo el día civil inicial.
- `dateTo` incluye todo el día civil final.
- El timezone utilizado es el de la compañía.
- Tickets, daily-report y KPIs comparten la misma regla.

Alternativamente, backend puede definir un límite superior exclusivo, pero debe:

- documentarlo formalmente;
- aplicarlo igual en todos los endpoints;
- devolver un contrato estable para frontend.

No obligar al frontend a sumar un día sin un contrato común.

## Criterios de aceptación

1. Un ticket del `2026-07-27`, a cualquier hora, aparece con:
   - `dateFrom=2026-07-27`;
   - `dateTo=2026-07-27`.
2. Ayer incluye todo `2026-07-26`.
3. Un rango 21–27 incluye ambos extremos.
4. Todos los presets incluyen completamente su día final.
5. Tickets, daily-report y KPIs quedan alineados.
6. Existen tests con registros a:
   - 00:00;
   - mediodía;
   - 23:59.
7. Existen tests de cambio de mes y año.
8. El contrato documenta timezone y semántica de límites.

---

# BACK-P1-003 — Default persistente de Acreditable

## Estado

Pendiente.

## Evidencia frontend

- Endpoint:
  `POST /api/v1/companies/:companyId/upload/ticket`
- Payload actual:
  multipart `FormData` con el campo `image`.
- `isAccreditable` no forma parte del contrato frontend de creación.
- Upload individual, cámara y batch comparten `uploadTicket`.
- El frontend no ejecuta un segundo PATCH después de crear.
- La UI utiliza `?? true` únicamente cuando el valor está ausente.
- Un `false` explícito se conserva.

## Problema

El requisito de producto es que todo ticket nuevo nazca y persista con:

`isAccreditable = true`

El fallback visual no corrige un `false` persistido.

## Requerimiento backend

Aplicar una de estas opciones:

1. Default persistente `true` al crear cuando el campo no se recibe.
2. Aceptar `isAccreditable` dentro del contrato de creación.

Debe:

- aplicar a individual, cámara y batch;
- preservar cambios posteriores a `false`;
- no sobrescribir un `false` explícito;
- no requerir un PATCH adicional por ticket;
- no ejecutar backfill automático de tickets históricos.

## Criterios de aceptación

1. Un ticket nuevo queda persistido con `true`.
2. Tras recargar sigue mostrando Sí.
3. Cambiar manualmente a No persiste `false`.
4. Un `false` explícito no se transforma otra vez en `true`.
5. Los tres flujos de carga usan la misma semántica.

---

# BACK-P2-001 — Búsqueda global de Facturas

## Estado

Pendiente no bloqueante.

## Endpoint

`GET /api/v1/companies/:companyId/invoices`

## Contrato observado

Parámetros frontend existentes:

- `matchStatus`;
- `type`;
- `issuerRfc`;
- `dateFrom`;
- `dateTo`;
- `page`;
- `limit`.

No existe un parámetro documentado para búsqueda global por:

- nombre/razón social del emisor;
- UUID o folio fiscal.

## Comportamiento frontend temporal

- La paginación server-side ya permite navegar todo el inventario.
- RFC se envía cuando el texto tiene formato admitido.
- Emisor y UUID se buscan únicamente dentro de la página visible.
- La UI indica esta limitación.
- No se descargan todas las páginas.

## Capacidad requerida

Agregar búsqueda server-side paginada por:

- emisor;
- UUID/folio fiscal.

Puede ser un parámetro `q` o campos dedicados, pero backend debe definir el contrato real.

## Criterios de aceptación

1. Busca sobre todo el inventario de la compañía.
2. Conserva paginación.
3. Conserva aislamiento por `companyId`.
4. Devuelve `data`, `total`, `page`, `limit` y `pages`.
5. Puede combinarse con los filtros existentes cuando corresponda.
6. No requiere descargar todas las páginas.
7. Backend agrega índices apropiados según su arquitectura.

---

# Dependencias descartadas durante la auditoría

- IVA: backend ya acepta `tax`; resuelto en frontend.
- UUID nullable de Facturas: bug frontend resuelto.
- Paginación de Facturas: implementada usando el contrato existente.
- Cálculo y edición civil de fechas: corregidos en frontend; la dependencia restante es la semántica de `dateTo` en la API.
