# Cambios backend requeridos — 13 de julio de 2026

Documento de pendientes contractuales para el frontend. Actualizado tras auditoría del 13 de julio de 2026.

Referencia frontend de seguridad/calidad: `docs/FRONTEND-AUDIT-2026-07-13.md`.

## Reglas de producto (KPIs)

- Incluir todos los estados excepto `duplicate` y `failed`.
- Método más usado por cantidad de movimientos.
- Empates: mostrar todos los métodos empatados.
- `other` y métodos vacíos no participan en el ganador.
- Métodos no identificados → `Sin especificar` en UI.
- Sistema temporalmente MXN-only.
- KPIs respetan compañía, fecha y categoría.
- Búsqueda textual no modifica KPIs.
- `dateTo` inclusivo.
- Timezone temporal de producto: `America/Chihuahua` (el backend usa timezone de compañía; default documentado `America/Mexico_City`).
- Último mes / último año: rangos móviles incluyendo hoy.

## Devoluciones y reembolsos

❌ Pendiente — el contrato no define tipo explícito de devolución/reembolso. Frontend no debe inferirlos por importe negativo, categoría u OCR.

---

## KPIs — endpoint actual del frontend

El Histórico consume:

```text
GET /api/v1/companies/:companyId/dashboard/kpis
  ?dateFrom=<ISO>
  &dateTo=<ISO>
```

Respuesta esperada (contrato tipado frontend):

```json
{
  "period": { "from": "...", "to": "..." },
  "totalIncome": { "amount": 0, "count": 0 },
  "totalExpenses": { "amount": 0, "count": 0 },
  "netBalance": 0,
  "topPaymentMethod": { "paymentMethod": "card", "count": 1 }
}
```

`summary` y `by-payment-method` siguen existiendo, pero ya no son la fuente primaria de las cards del Histórico.

### Brechas KPI

#### Exclusión de `duplicate` / `failed`

- Estado: ❌ Pendiente
- Evidencia (13 jul 2026): `buildMatch` en dashboard solo aplica `companyId`, fechas y opcionalmente `type`; `/dashboard/kpis` agrega sobre ese match.
- Impacto: totales pueden incluir tickets que producto quiere excluir.
- Frontend: muestra métricas con la limitación documentada (`includesAllStatuses`).

#### Filtro `category`

- Estado: ❌ Pendiente
- Evidencia: validator de `kpis` no acepta `category` (400 si se envía).
- Impacto: con categoría activa el frontend muestra `No disponible`.
- Workaround frontend: no consultar KPIs cuando hay categoría.

#### Empates de método de pago

- Estado: 🔎 Pendiente de verificación
- Evidencia: `/dashboard/kpis` devuelve un único `topPaymentMethod` (`$limit: 1`).
- Impacto: regla de producto “mostrar todos los empatados” no se puede cumplir solo con este campo.
- Frontend: muestra el top que entrega backend.

#### Moneda

- Estado: ⚠️ Parcialmente resuelto (producto MXN-only)
- Sigue recomendable exponer `currency` en contrato de ticket/agregados.

### Contrato KPI mínimo requerido

```text
GET /dashboard/kpis
  ?dateFrom=
  &dateTo=
  &category=            (opcional)
  + exclusión fija o filtro de status que omita duplicate,failed
  + semántica de empate para top payment method (lista o regla documentada)
```

---

## Imágenes de tickets

### Estado actual

- `POST /upload/ticket` entrega `imageUrl` en el wrapper de respuesta.
- Persistencia: `rawData.imageUrl`.
- `GET /tickets` y `GET /tickets/:id`: eliminan `rawData` y **no** proyectan `imageUrl` top-level.
- `GET /dashboard/daily-report`: proyecta `imageUrl` (workaround frontend actual para la página visible).

### Brecha

- Estado: ❌ Pendiente
- Evidencia (13 jul 2026): `ticket.service` `findAll`/`findById` hacen `delete ticket.rawData` sin asignar `imageUrl`.
- Impacto: Histórico depende de dual-fetch daily-report; detalle frío sin enrich puede quedar sin imagen.
- Workaround frontend: enriquecer listado visible con daily-report; preview local `blob:` en Upload.

### Contrato mínimo

```json
{ "imageUrl": "https://..." }
```

en listado y detalle, company-scoped, sin tokens en query, con política clara (pública vs firmada).

### Seguridad requerida

- Validar pertenencia a compañía.
- No exponer filesystem ni rutas internas.
- No tokens en URL.
- Content-Type de imagen correcto.

---

## Edición inline del Histórico

### Endpoint actual

- Método: `PATCH`
- Ruta: `/companies/:companyId/dashboard/daily-report/:ticketId`
- Campos aceptados (verificado en `ticketUpdateBody` / `_editableFields`):
  `type`, `date`, `amount`, `category`, `paymentMethod`, `vendor`, `status`, `reviewStatus`

### Campos frontend

| Campo | Lectura | Edición | Estado |
|---|---|---|---|
| Comercio (`vendor`) | Sí | Sí | ✅ Resuelto (contrato) |
| Fecha/hora (`date`) | Sí | Sí | ✅ Resuelto (contrato) |
| Total (`amount`) | Sí | Sí | ✅ Resuelto (contrato) |
| Método | Sí | Sí | ✅ Resuelto (contrato) |
| Tipo | Sí | Sí | ✅ Resuelto (contrato) |
| Estatus | Sí | Sí | ✅ Resuelto (contrato) |
| Categoría | Sí | Sí | ✅ Resuelto (contrato) |
| Subtotal | Derivado / limitado | No | ❌ Pendiente (read-only UI) |
| IVA | Derivado / limitado | No | ❌ Pendiente (read-only UI) |
| Moneda | MXN UI | No | ⚠️ Parcial (MXN-only) |
| Productos/notas | Parcial (OCR/`rawData`) | No | ❌ Pendiente |
| Revisión | Existe en contrato | No debe mostrarse | ⚠️ UI: oculto a propósito |

### Lectura de subtotal / IVA / productos

- Estado: ❌ Pendiente
- Evidencia: daily-report elimina `rawData` al decorar; listado/detalle estándar también.
- Impacto: UI deriva o muestra vacío; no inventar edición.

### Revisión

`reviewStatus` permanece en contrato. Producto: no mostrar ni editar en UI. Frontend de Histórico no lo envía en edición inline.

### Seguridad

- Backend debe validar ticket ∈ compañía de la ruta.
- Ignorar/rechazar campos no permitidos.
- No aceptar `companyId` de body para cambiar de tenant.

---

## Upload / preprocess

### Doble OCR al guardar

- Estado: ❌ Pendiente (comportamiento conocido)
- Evidencia documental + flujo frontend: preprocess analiza; `POST /upload/ticket` vuelve a ejecutar pipeline OCR.
- Impacto: costo, latencia, posible divergencia respecto a ediciones del usuario (mitigadas parcialmente con PATCH posterior).
- Workaround frontend: PATCH daily-report tras upload si el draft difiere.

### Endpoint batch dedicado

- Estado: 🔎 Pendiente de verificación / no requerido hoy
- Frontend implementa batch con el endpoint individual y concurrencia client-side.

---

## Fechas y timezone

- Estado: ⚠️ Parcialmente resuelto
- Backend normaliza a medianoche TZ de compañía.
- Frontend KPIs usan límites civiles `America/Chihuahua` para el producto actual.
- 🔎 Verificar alineación exacta cuando la compañía use otra TZ IANA.

---

## Resueltos recientemente

### Endpoint dedicado `/dashboard/kpis`

- Estado: ✅ Resuelto (consumo frontend)
- Evidencia: servicio backend `kpis.service.js` + hook `useFinancialKpis` + tipado `DashboardKpisResponse`
- Fecha verificada: 13 de julio de 2026
- Nota: resuelve la necesidad de agregar desde página 100; **no** resuelve exclusión de status ni categoría.

### Edición de `vendor` vía daily-report PATCH

- Estado: ✅ Resuelto (contrato)
- Evidencia: `ticketUpdateBody` incluye `vendor` max 200; `_editableFields` lo lista
- Fecha verificada: 13 de julio de 2026

### Proyección de `vendor` en GET tickets

- Estado: ✅ Resuelto (lectura)
- Evidencia: `backfillVendor` garantiza clave `vendor` (null si falta)
- Fecha verificada: 13 de julio de 2026

---

## Workarounds frontend que continúan

| Workaround | Puede retirarse cuando |
|---|---|
| Dual-fetch daily-report para `imageUrl` | `GET /tickets` y `GET /tickets/:id` proyecten `imageUrl` |
| KPIs `No disponible` con categoría | `/dashboard/kpis` acepte `category` |
| Disclaimer / `includesAllStatuses` | Agregados excluyan `duplicate`/`failed` |
| PATCH post-upload por re-OCR | Upload persista resultado preprocess o acepte campos editados sin reanalizar |

## Workarounds que no deben retirarse aún

- Ninguno de la tabla anterior está listo para retiro sin evidencia runtime de contrato nuevo.

---

## Notas

Este documento no implica cambios realizados en backend ni aprobación del contrato propuesto.
No eliminar pendientes sin verificar response real y consumo frontend.
