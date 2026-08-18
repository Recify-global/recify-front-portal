# Recify — Necesidades backend — 2026-08-10

## Feature: Mi equipo

Actualizado: 2026-08-17. El frontend de Mi equipo ya está implementado y espera este contrato. No se inventó URL, método HTTP ni persistencia local.

### Contexto

La pantalla **Mi equipo** lista integrantes de la compañía activa y permite cambiar el rol entre únicamente:

```ts
type TeamRole = 'admin' | 'user'
```

No se deben exponer ni aceptar otros roles (`owner`, `manager`, `editor`, `viewer`, `accountant`, `superadmin`, etc.) en este recurso.

El `UserRole` global de sesión (`admin | accountant | viewer`) **no** es el rol de compañía. Backend debe definir si existe equivalencia; el frontend no la asume ni la mapea.

### Hallazgos frontend

- Endpoint existente: ninguno para listar o actualizar integrantes de una compañía.
- La sesión solo expone el usuario autenticado: `_id`, `name`, `email`, `role` (global), `companies`, `status`.
- No existe `CompanyMember` ni permisos por compañía.
- La UI no llama ninguna ruta de miembros. El punto de integración es `src/services/team.service.ts` (`listTeamMembers`, `updateTeamMemberRole`) + mapper `src/mappers/team.mapper.ts`.
- La autorización en UI es solo UX. Backend debe autorizar de verdad.

### Requerimientos mínimos

#### TEAM-BACK-001 — Listar integrantes

- Operación: obtener los miembros de la compañía activa.
- Ruta/método: los define backend. Recurso anidado bajo la compañía, siguiendo el resto de `/companies/:companyId/...`.
- Tenant scope: `companyId` obligatorio; validar autenticación y acceso a esa compañía.
- Permiso mínimo: usuario autenticado con acceso de lectura a la compañía. Quién puede consultar es decisión de producto/backend.
- Response mínima (cada integrante):

```ts
{
  id: string // o `_id`; el mapper acepta ambos
  email: string
  role: 'admin' | 'user'
}
```

Campos opcionales si ya existen con semántica confirmada:

```ts
name?: string | null
firstName?: string | null
lastName?: string | null
avatarUrl?: string | null
status?: 'active' | 'inactive' | 'suspended' | null
```

No incluir fecha de incorporación hasta confirmar su semántica.

- Errores esperados: `401` sin sesión, `403` sin permiso, respuesta segura (`404` o equivalente) para compañía inexistente o inaccesible. Payload de error sin secretos ni datos internos.

#### TEAM-BACK-002 — Actualizar rol

- Operación conceptual: `companyId` + `memberId` + `role: 'admin' | 'user'`.
- Ruta/método: los define backend.
- Tenant scope: compañía e integrante validados en servidor. El miembro debe pertenecer a esa compañía (evitar IDOR).
- Permiso mínimo: el servidor confirma quién puede cambiar roles. No confiar en el rol enviado por el cliente.
- Payload: únicamente el rol canónico `admin | user`. Rechazar cualquier otro valor (`400`/`422`).
- Response mínima: el integrante actualizado con los mismos campos seguros del listado.
- Errores esperados: `400`/`422` rol inválido, `401`, `403`, `404` seguro, `409` si una regla de negocio confirmada lo impide.

### Seguridad requerida (backend)

- Usuario autenticado.
- Acceso a la compañía objetivo.
- Permisos suficientes resueltos en servidor para esa compañía (deny-by-default).
- El integrante pertenece a esa compañía.
- Rol permitido exclusivamente `admin | user`.
- Evitar escalamiento de privilegios.
- Evitar IDOR.
- Validar payload.
- No confiar en el role enviado por el cliente.
- Respuestas controladas: `401`, `403`, `404` sin filtrar existencia cross-tenant cuando corresponda.
- Sin secretos, hashes, tokens ni datos internos.

### Decisiones de producto/backend pendientes

No implementadas en frontend porque no están confirmadas:

- Impedir dejar una compañía sin administradores.
- Permitir o bloquear que un usuario cambie su propio rol (incl. de `admin` a `user`).
- Relación entre `UserRole` global (`admin | accountant | viewer`) y `TeamRole` de compañía (`admin | user`).
- Si el permiso de edición es por compañía o global.
- Invitaciones, alta, baja o desactivación de integrantes.

#### TEAM-BACK-003 — Invitar integrante (fuera del alcance UI actual)

- Método esperado: `POST`. Recurso de invitaciones de la compañía.
- Permiso mínimo: Admin confirmado por backend.
- Payload: correo y rol `admin | user`.
- Sin tokens ni secretos en la respuesta.
- Errores: `400`/`422`, `401`, `403`, `409` si ya existe invitación o membresía.

#### TEAM-BACK-004 — Eliminar o desactivar integrante (fuera del alcance UI actual)

- Método: `DELETE` o `PATCH`, según semántica que elija backend.
- Permiso mínimo: Admin confirmado por backend.
- Errores: `401`, `403`, `404` seguro, `409` si una regla confirmada lo impide (p. ej. último admin, si producto lo define).

### Fuera de alcance frontend

- Modelo de datos, migraciones e implementación backend.
- Inventar URLs o mapeos de roles.
- Políticas no confirmadas (último admin, self-service de rol).

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
