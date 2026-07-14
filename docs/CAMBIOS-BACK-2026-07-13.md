# Cambios backend requeridos — 12 de julio de 2026

## Feature

KPIs financieros del Histórico.

## Reglas de producto confirmadas — 12 de julio de 2026

- Incluir todos los estados excepto `duplicate` y `failed`.
- Método más usado por cantidad de movimientos.
- En empate, mostrar todos los métodos empatados.
- `other` y métodos vacíos no participan en el ganador.
- Los métodos no identificados se muestran como `Sin especificar`.
- El sistema es temporalmente MXN-only.
- Los KPIs respetan compañía, fecha y categoría.
- La búsqueda textual no modifica KPIs.
- `dateTo` debe ser inclusivo.
- Timezone temporal: `America/Chihuahua`.
- Último mes: 30 días móviles incluyendo hoy.
- Último año: 12 meses móviles incluyendo hoy.

## Devoluciones y reembolsos

El contrato actual no define un tipo explícito para devoluciones o reembolsos.

Frontend no debe inferirlos mediante:

- Importes negativos.
- Categoría.
- Texto OCR.
- Notas.

Se requiere una regla contractual o un tipo de movimiento explícito antes de incorporarlos a ingresos, egresos o saldo.

## Estado actual del frontend (post Ticket 2/3)

- Página: `src/pages/HistoryPage.tsx`.
- Listado: `useTickets({ page: 1, limit: 100 })` — solo para tabla.
- KPIs: `useFinancialKpis` → `GET /dashboard/summary` + `GET /dashboard/by-payment-method`.
- Compañía: `companyId` en path y query keys.
- Fechas KPI: `dateFrom`/`dateTo` como inicio/fin de día civil en `America/Chihuahua`.

## Contratos dashboard verificados (código backend, solo lectura)

### Summary

- Endpoint: `GET /api/v1/companies/:companyId/dashboard/summary`
- Params aceptados: `period`, `dateFrom`, `dateTo`, `type`
- **No acepta:** `category`, `status`
- Response real:

```json
{
  "period": { "from": "...", "to": "..." },
  "totals": {
    "ingresos": { "count": 0, "amount": 0 },
    "egresos": { "count": 0, "amount": 0 },
    "balance": 0
  },
  "byStatus": {},
  "totalTickets": 0,
  "avgAmount": 0,
  "topPaymentMethod": { "paymentMethod": "card", "count": 1 }
}
```

- Completo sobre el match: sí (agregación Mongo, no página).
- Incluye `duplicate` y `failed`: sí (no hay filtro de exclusión).

### By payment method

- Endpoint: `GET /api/v1/companies/:companyId/dashboard/by-payment-method`
- Params: iguales a summary (`period`, `dateFrom`, `dateTo`, `type`)
- **No acepta:** `category`, `status`
- Response real: array

```json
[
  {
    "paymentMethod": "card",
    "count": 12,
    "amount": 1000,
    "percentage": 40
  }
]
```

- `percentage` es por **monto**, no por conteo.
- Completo sobre el match: sí.

### Daily report

- No usado para KPIs: paginado (`limit` máx. 100) y no es fuente de agregados globales.

## Brechas confirmadas (actualizado)

### Brecha A — Exclusión de estados en agregados

- Campo o endpoint faltante: filtro de estados en `summary` / `by-payment-method`, o exclusión fija de `duplicate` y `failed`.
- Evidencia: `buildMatch` solo aplica `companyId`, fechas y `type`.
- KPI afectado: los cuatro.
- Severidad: P1 (bloquea cierre exacto según reglas de producto).
- Bloqueante: sí para veredicto ✅.

### Brecha B — Categoría en agregados

- Campo o endpoint faltante: `category` en query de `summary` y `by-payment-method`.
- Evidencia: validator `baseQuery` no declara `category`.
- KPI afectado: los cuatro cuando hay categoría seleccionada.
- Severidad: P1.
- Bloqueante: sí para KPIs por categoría.
- Workaround frontend: cards muestran `No disponible` si hay categoría activa.

### Brecha C — Moneda contractual

- Temporalmente producto confirma MXN-only.
- Sigue recomendable exponer `currency` en contrato.

### Brecha D — Devoluciones / reembolsos

- Ver sección dedicada arriba.

## Contrato mínimo requerido (actualizado)

```text
GET /api/v1/companies/:companyId/dashboard/summary
  ?dateFrom=<ISO inclusivo>
  &dateTo=<ISO inclusivo fin de día>
  &category=<opcional>
  &excludeStatus=duplicate,failed
  (o status filter equivalente)

GET /api/v1/companies/:companyId/dashboard/by-payment-method
  ?mismos filtros
```

Los agregados deben calcularse sobre todos los registros del período, no sobre una página.

## Trabajo frontend posible actualmente

- Disponible:
  - KPIs por compañía + rango de fechas desde agregados reales.
  - Método más usado por frecuencia, empates y “Sin especificar”.
  - Presets Último mes / Último año.
  - P0 multitenant del detalle corregido.
- Parcial:
  - Sin categoría: KPIs visibles pero incluyen `duplicate`/`failed` hasta que backend excluya.
  - Con categoría: KPIs `No disponible`.
- Bloqueado:
  - KPIs exactos según todas las reglas de producto confirmadas.

## Notas

Este documento no implica cambios realizados en backend ni aprobación del contrato propuesto.

## Persistencia y consulta de imágenes de tickets

### Estado actual

- Campo entregado por preprocess: ninguno persistente. `POST /upload/preprocess`
  devuelve `{ ocrText, ticket }`; el frontend usa un `blob:` local para preview.
- Campo entregado al guardar: `imageUrl` junto a `ocrText` y `ticket` en
  `POST /upload/ticket`.
- Campo almacenado: `rawData.imageUrl`.
- Campo entregado por listado: ninguno. `GET /tickets` no selecciona `rawData`
  ni proyecta `imageUrl`.
- Campo entregado por detalle: ninguno. `GET /tickets/:id` tampoco selecciona
  `rawData` ni proyecta `imageUrl`.
- Daily report: proyecta `rawData.imageUrl` como `imageUrl`. El frontend lo
  consume como enriquecimiento de la misma página 1 / límite 100 que ya
  muestra Histórico; no se usa para calcular KPIs.
- Accesibilidad de la URL: el upload construye una URL de R2 a partir de
  `CLOUDFLARE_R2_PUBLIC_URL` o del endpoint R2. Debe verificarse en el entorno
  que esa URL sea realmente pública o firmada y responda con `Content-Type`
  de imagen.
- Requiere autenticación: no existe un endpoint frontend-verificable para
  descargar el blob con bearer token. Un `<img>` no puede adjuntar ese token.
- Estabilidad de la URL: no está documentada (pública permanente vs firmada
  con expiración).

### Brecha confirmada

La referencia se persiste en `rawData.imageUrl`, pero los endpoints primarios
de Histórico (`GET /tickets` y `GET /tickets/:id`) no la exponen. El frontend
puede enriquecer los tickets visibles mediante `GET /dashboard/daily-report`,
pero esto mantiene dos consultas y no sustituye un contrato homogéneo de
ticket.

Además, si la URL devuelta por upload apunta a un bucket/endpoint no público,
el preview remoto falla. El frontend conserva el `blob:` local durante la
sesión de Upload como fallback, pero eso no resuelve consultas históricas.

### Contrato mínimo requerido

Cada ticket persistido debería exponer una referencia estable en listado y
detalle:

```json
{
  "imageUrl": "https://..."
}
```

Alternativamente, backend puede ofrecer un endpoint autenticado y
company-scoped para descargar la imagen. El contrato debe indicar si la URL es
pública permanente o firmada y su expiración.

### Requisitos de seguridad

- Validar que el ticket pertenece a la compañía solicitada.
- No exponer rutas internas del servidor.
- No incluir tokens en la URL.
- No devolver rutas de filesystem.
- No permitir acceso cruzado entre compañías.
- Devolver un `Content-Type` de imagen correcto.
- Usar URLs firmadas con expiración adecuada o endpoint autenticado.

### Flujos afectados

- Pantalla posterior al guardado (mitigada con preview local durante la sesión).
- Histórico (mitigado para la página visible mediante daily-report).
- Drawer de detalle (mitigado para la página visible mediante daily-report).
- Apertura en nueva pestaña.
