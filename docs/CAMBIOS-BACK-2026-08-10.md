# Recify — Necesidades backend — 2026-08-10

## Feature: Mi equipo

### Contexto

El frontend necesita mostrar y administrar, según permisos, a los integrantes de la compañía activa.

### Hallazgos frontend

- Endpoint existente: ninguno para listar, consultar o administrar integrantes de una compañía.
- Campos disponibles: la sesión solo expone el usuario autenticado con `_id`, `name`, `email`, `role`, `companies`, `status` y timestamps opcionales. No existe un contrato de listado de integrantes.
- Roles disponibles: `admin`, `accountant` y `viewer`. No existe una equivalencia confirmada hacia los roles de producto `Admin` y `Usuario`.
- Permisos disponibles: únicamente el `role` global del usuario autenticado y su lista de `companies`; no existe un contrato de permisos por compañía.
- Operaciones faltantes: listado de integrantes, actualización de rol, invitación y eliminación o desactivación.

### Requerimientos mínimos

#### TEAM-BACK-001 — Listar integrantes

- Método esperado: `GET`.
- Ruta conceptual: recurso de integrantes anidado bajo la compañía activa, siguiendo la convención existente de recursos por compañía. El nombre definitivo del recurso debe establecerlo backend.
- Tenant scope: `companyId` obligatorio y validado por backend contra la sesión autenticada.
- Permiso mínimo: usuario autenticado con acceso de lectura a la compañía. Admin y Usuario deben poder consultar.
- Query params: paginación; búsqueda por nombre o correo y filtro por rol si backend decide soportarlos.
- Response mínima: listado paginado con identificador estable, nombre, correo, rol canónico y estado real. La fecha de incorporación solo debe incluirse si backend confirma su semántica.
- Errores esperados: `401` sin sesión, `403` sin permiso y respuesta segura para compañía inexistente o inaccesible.

#### TEAM-BACK-002 — Actualizar rol

- Método esperado: `PATCH`.
- Ruta conceptual: integrante específico dentro de la compañía.
- Tenant scope: compañía e integrante validados por backend.
- Permiso mínimo: Admin confirmado por backend.
- Payload: únicamente el rol canónico permitido. Backend debe definir la equivalencia entre `admin | accountant | viewer` y los roles de producto `Admin | Usuario`; el frontend no la asumirá.
- Response mínima: integrante actualizado con los mismos campos seguros del listado.
- Errores esperados: `400` o `422` para rol inválido, `401`, `403`, `404` seguro y `409` para una restricción de negocio confirmada.

#### TEAM-BACK-003 — Invitar integrante

- Método esperado: `POST`.
- Ruta conceptual: recurso de invitaciones de la compañía.
- Tenant scope: compañía validada contra la sesión.
- Permiso mínimo: Admin confirmado por backend.
- Payload: correo y rol canónico permitido.
- Response mínima: estado real de la invitación sin tokens, secretos ni datos internos.
- Errores esperados: `400` o `422`, `401`, `403` y `409` para una invitación o membresía ya existente.

#### TEAM-BACK-004 — Eliminar o desactivar integrante

- Método esperado: `DELETE` o `PATCH`, según la semántica definitiva elegida por backend.
- Ruta conceptual: integrante específico dentro de la compañía.
- Tenant scope: compañía e integrante validados por backend.
- Permiso mínimo: Admin confirmado por backend.
- Payload: ninguno para eliminación o estado permitido para desactivación.
- Response mínima: confirmación sin exponer datos internos.
- Errores esperados: `401`, `403`, `404` seguro y `409` cuando una regla de negocio confirmada impida la operación.

### Seguridad requerida

- Scope obligatorio por `companyId`.
- El usuario debe pertenecer a la compañía.
- Solo Admin puede modificar.
- Usuario solo puede consultar.
- Deny-by-default.
- No confiar en el role enviado por cliente.
- No permitir modificar al último Admin si esa regla aplica y el producto la confirma.
- No permitir escalamiento de privilegios.
- Respuestas sin secretos ni datos internos.
- `401` para no autenticado.
- `403` para autenticado sin permiso.
- `404` sin filtrar existencia cross-tenant cuando corresponda.
- Los permisos y el rol efectivo deben resolverse en backend para la compañía objetivo.

### Fuera de alcance frontend

- Modelo de datos.
- Migraciones.
- Implementación backend.
- Políticas definitivas no confirmadas.

## Feature: Dashboard

### Hallazgos de contrato backend

#### DASHBOARD-BACK-001 — Semántica de `last_N_days`

Los presets de analytics se resuelven actualmente como `now - N days → now`. Ese intervalo no equivale exactamente a N días civiles inclusivos: puede abarcar partes de N + 1 fechas del calendario, mientras el label frontend comunica “N días”.

Frontend mantiene el preset contractual sin ajustes `+1/-1` ni cambios silenciosos del request. Backend/producto debe confirmar si la semántica canónica es una ventana móvil de N × 24 horas o N días civiles inclusivos.

#### DASHBOARD-BACK-002 — Heatmap sparse

`GET .../dashboard/heatmap` devuelve únicamente fechas con actividad porque la agregación agrupa tickets existentes; no genera una fila por cada día del rango. Esto no bloquea al frontend: el calendario construye el rango completo y fusiona la respuesta sparse, usando cero solo para días ausentes.

Conviene alinear comentarios y documentación del endpoint para explicitar que `days` es sparse.

#### DASHBOARD-BACK-003 — Total global de gastos por proveedor

`GET .../dashboard/expenses-by-vendor` calcula correctamente cada `percentage` contra el total global, pero no expone ese `totalAmount` en la raíz. El frontend puede respetar los porcentajes sin ese campo y no lo requiere como P0/P1.

Si producto necesita mostrar el gasto global además del Top N visible, sería útil exponer `totalAmount` como dato contractual.

#### DASHBOARD-BACK-004 — Definición canónica de `invoicedPercentage`

Backend define `invoicedPercentage` por conteo de tickets. El Dashboard actual presenta cobertura por monto (`invoiced.amount / totalAmount`), que es la unidad visual dominante.

Producto/backend debe definir cuál porcentaje es canónico y nombrar explícitamente la unidad para evitar mezclar cobertura por conteo con cobertura por monto. Mientras se define, frontend mantiene el cálculo por monto y presenta los conteos solo como información independiente.

## Feature: Dashboard

### DASH-BACK-001 — Semántica de `last_N_days`

- Endpoint: los seis endpoints de analítica bajo `GET /companies/:companyId/dashboard/*`.
- Comportamiento actual: `last_N_days` se resuelve como `startOfDay(now - N days) → now`. Esto abarca parte del día actual y puede cubrir N+1 fechas civiles.
- Comportamiento esperado: documentar si el preset es una ventana rodante o exactamente N días civiles inclusivos. El nombre y la UI deben compartir esa definición.
- Request de ejemplo: `GET /companies/:companyId/dashboard/cash-flow?datePreset=last_7_days&groupBy=week`.
- Evidencia frontend: el selector muestra “7 días” como siete fechas civiles inclusivas, pero envía el preset sin compensaciones.
- Impacto: la fecha inicial visible puede no coincidir con los registros incluidos por backend.
- Severidad: P2.
- Recomendación contractual: definir una única semántica para todos los endpoints; no requiere workaround frontend.

### DASH-BACK-002 — Heatmap sparse

- Endpoint: `GET /companies/:companyId/dashboard/heatmap`.
- Comportamiento actual: la agregación devuelve únicamente fechas con tickets.
- Comportamiento esperado: documentar explícitamente que `days` es sparse; comentarios que sugieran un row por cada día deben aclararse.
- Response de ejemplo: `{ "days": [{ "date": "2026-08-01", "income": 0, "expenses": 100, "count": 1 }] }`, aunque el rango incluya más fechas.
- Evidencia frontend: el calendario crea 13 semanas y fusiona `days` por `YYYY-MM-DD`; las ausencias dentro del período se representan con actividad cero.
- Impacto: ninguno bloqueante; el frontend ya completa el calendario sin fabricar actividad.
- Severidad: P3.
- Recomendación contractual: mantener el payload sparse si se desea, pero formalizarlo.

### DASH-BACK-003 — Total global en gastos por proveedor

- Endpoint: `GET /companies/:companyId/dashboard/expenses-by-vendor`.
- Comportamiento actual: cada vendor incluye `percentage` calculado contra el gasto global, pero el root no expone `totalAmount`.
- Comportamiento esperado: opcionalmente exponer `totalAmount` si producto necesita mostrar el gasto global junto con un top limitado.
- Request de ejemplo: `GET /companies/:companyId/dashboard/expenses-by-vendor?limit=20`.
- Evidencia frontend: el porcentaje contractual ya puede mostrarse correctamente; la suma de filas retornadas solo representa el subset.
- Impacto: no bloquea la corrección visual actual, pero impide reconstruir el total global cuando existen vendors fuera del límite.
- Severidad: P3.
- Recomendación contractual: agregar `totalAmount` en root únicamente si se confirma esa necesidad de producto.

### DASH-BACK-004 — Definición de cobertura de facturación

- Endpoint: `GET /companies/:companyId/dashboard/invoiced-vs-uninvoiced`.
- Comportamiento actual: `invoicedPercentage` se calcula por conteo de tickets.
- Comportamiento esperado: definir canónicamente si “cobertura de facturación” significa porcentaje por conteo o por monto.
- Response de ejemplo: dos tickets facturados por $100 y dos no facturados por $300 producen `invoicedPercentage: 50`, mientras por monto la cobertura es 25%.
- Evidencia frontend: Dashboard utiliza `invoiced.amount / totalAmount` y su copy indica explícitamente cobertura por monto.
- Impacto: consumidores distintos pueden mostrar porcentajes diferentes con el mismo nombre.
- Severidad: P2.
- Recomendación contractual: conservar ambos datos si son útiles, pero nombrarlos inequívocamente (`invoicedCountPercentage` e `invoicedAmountPercentage`).

## Feature: Facturas

### INVOICES-FILTERS-BACK-001 — Búsqueda global de facturas

- Filtro: búsqueda por emisor, RFC o UUID.
- Endpoint: `GET /companies/:companyId/invoices`.
- Estado actual: solo existe `issuerRfc` server-side.
- Limitación frontend: FE no puede buscar correctamente nombre del emisor ni UUID sobre todo el inventario paginado. Filtrar únicamente la página actual no es una solución aceptable.
- Comportamiento esperado: búsqueda tenant-scoped, server-side, paginada y combinable con `matchStatus`, `type`, `issuerRfc` o un parámetro de query global, `dateFrom` y `dateTo`.
- Severidad: P2.
- Impacto: no bloquea producción de los demás filtros.
