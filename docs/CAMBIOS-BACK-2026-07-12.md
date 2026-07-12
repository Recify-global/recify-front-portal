# Cambios backend requeridos — 12 de julio de 2026

## Feature

KPIs financieros del Histórico.

## Estado actual del frontend

- Página: `src/pages/HistoryPage.tsx`.
- Hook: `useTickets({ page: 1, limit: 100 })`.
- Servicio: `listTickets`.
- Endpoint: `GET /api/v1/companies/:companyId/tickets`.
- Response: `{ data: Ticket[], total, page, limit, pages }`.
- Paginación: sí; Histórico solo carga la página 1 con límite 100.
- Filtros disponibles: el tipo frontend declara `type`, `status`, `reviewStatus`, `paymentMethod`, `sourceId`, `category`, `dateFrom`, `dateTo`, `page` y `limit`. El audit previo documenta soporte efectivo de backend para `type`, `status`, `category`, `dateFrom`, `dateTo`, `page` y `limit`.
- Compañía: `companyId` forma parte del path y de la query key.

## Datos actualmente disponibles

- Monto: `amount: number`.
- Fecha: `date: string`.
- Tipo de movimiento: `type: "ingreso" | "egreso"`.
- Método de pago: `paymentMethod: "card" | "cash" | "transfer" | "other"`.
- Estado: `status: "pending" | "processed" | "failed" | "duplicate"` y `reviewStatus?: "pendiente" | "revisado"`.
- Moneda: no existe campo contractual; el mapper frontend usa `"MXN"` como fallback.

## Brechas confirmadas

### Brecha 1

- Campo o endpoint faltante: agregados financieros completos para el período solicitado, o un contrato documentado y tipado de los endpoints dashboard existentes.
- Evidencia: Histórico carga únicamente `page=1&limit=100`; la respuesta expone `total` y `pages`, pero las cards actuales reducen solo `data`. Aunque existen `/dashboard/summary` y `/dashboard/by-payment-method`, sus servicios frontend retornan `Record<string, unknown>` y no hay shape de response verificable en frontend.
- KPI afectado: ingresos totales, egresos totales, saldo neto y método de pago más usado.
- Riesgo de resolverlo solo en frontend: presentar una página parcial como el total financiero real del período.
- Severidad: P0 si se muestra como total real; P1 como defecto de implementación.
- Bloqueante: sí.

### Brecha 2

- Campo o endpoint faltante: moneda contractual por ticket o garantía contractual explícita de una única moneda para la compañía.
- Evidencia: `BackendTicket` no declara moneda y `mapBackendTicket` usa `"MXN"` cuando no encuentra valores no tipados en `rawData`.
- KPI afectado: ingresos totales, egresos totales y saldo neto.
- Riesgo de resolverlo solo en frontend: sumar importes de monedas distintas o etiquetar importes como MXN sin respaldo contractual.
- Severidad: P1 si existen múltiples monedas; pendiente de decisión de producto si todo el sistema es exclusivamente MXN.
- Bloqueante: sí hasta confirmar la regla de moneda.

### Brecha 3

- Campo o endpoint faltante: semántica contractual de inclusión de estados, duplicados, cancelaciones, devoluciones y reembolsos en agregados.
- Evidencia: el contrato visible ofrece `pending`, `processed`, `failed` y `duplicate`, pero no define cuáles participan en KPIs ni cómo representar devoluciones/reembolsos.
- KPI afectado: los cuatro KPIs.
- Riesgo de resolverlo solo en frontend: totales y frecuencias financieramente incorrectos.
- Severidad: P1 por regla de negocio.
- Bloqueante: sí.

### Brecha 4

- Campo o endpoint faltante: semántica de rango de fechas y zona horaria para agregados.
- Evidencia: el frontend declara `dateFrom`/`dateTo`, pero no tiene contrato que precise inclusividad de `dateTo`, formato, timezone o si el filtro usa fecha civil de la compañía. La compañía puede tener timezone, pero Histórico no lo consume.
- KPI afectado: los cuatro KPIs.
- Riesgo de resolverlo solo en frontend: excluir movimientos del último día o asignarlos a otro día.
- Severidad: P1.
- Bloqueante: sí para exactitud por período.

## Contrato mínimo requerido

### Request propuesta

Mantener el estilo actual de rutas scoped por compañía y aceptar únicamente filtros acordados:

```text
GET /api/v1/companies/:companyId/dashboard/summary?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&category=<opcional>
GET /api/v1/companies/:companyId/dashboard/by-payment-method?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&category=<opcional>
```

La documentación del contrato debe precisar:

- `dateFrom` y `dateTo` inclusivos.
- Zona horaria usada (preferentemente la de la compañía).
- Estados incluidos.
- Tratamiento de duplicados, errores, devoluciones y reembolsos.
- Moneda única o agrupación por moneda.

### Response propuesta

Respuesta mínima sugerida, sujeta a aprobación de backend y producto:

```json
{
  "success": true,
  "data": {
    "dateFrom": "2026-07-01",
    "dateTo": "2026-07-31",
    "timezone": "America/Mexico_City",
    "currency": "MXN",
    "incomeTotal": 0,
    "expenseTotal": 0,
    "netBalance": 0,
    "paymentMethods": [
      {
        "paymentMethod": "card",
        "movementCount": 0,
        "amountTotal": 0
      }
    ]
  }
}
```

Los agregados deben calcularse sobre todos los registros del período, no sobre una página.

## Reglas de negocio pendientes

- Ingresos: confirmar estados válidos y si todo `type="ingreso"` participa.
- Egresos: confirmar estados válidos y si todo `type="egreso"` participa.
- Saldo: confirmar fórmula `ingresos - egresos` y tratamiento de devoluciones.
- Métodos de pago: definir si “más usado” es por cantidad o monto.
- Empates: definir representación.
- Tickets sin método: el enum actual incluye `other`, pero no distingue explícitamente “sin especificar”.
- Cancelaciones: no existe estado `cancelled` en el contrato frontend actual.
- Devoluciones: no existe tipo explícito en el contrato frontend actual.
- Tickets pendientes: definir si participan.
- Zona horaria: confirmar timezone de compañía e inclusividad del último día.
- Moneda: confirmar MXN único o agregación separada.

## Trabajo frontend posible actualmente

- Disponible: mostrar y filtrar la página cargada, sin presentarla como total global.
- Parcial: enviar `dateFrom`, `dateTo`, `category` y paginación al listado una vez acordada una estrategia de tabla; esto no resuelve por sí solo agregados completos.
- Bloqueado: mostrar los cuatro KPIs como métricas financieras exactas del período.

## Notas

Este documento no implica cambios realizados en backend ni aprobación del contrato propuesto.
