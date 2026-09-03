# [BACK] Dashboard cash-flow: garantizar net por periodo y totales

## Tipo
Backend

## Área
Dashboard

## Contexto

La sección “Flujo de caja” del Dashboard frontend consume `GET /companies/:companyId/dashboard/cash-flow` para mostrar, por periodo (semana o mes):

- Ingresos
- Egresos
- Balance neto

También muestra un resumen del rango con los mismos tres conceptos.

El frontend debe ser solo presentación: formatear y pintar los valores ya resueltos. No debe calcular ingresos, egresos, balance ni totales.

## Problema actual

**Comportamiento observado (desde frontend):**

- El service `getCashFlow` tipa la respuesta como `unknown`.
- El tipo canónico de UI (`CashFlowView`) sí requiere `buckets[].net`, `totalIncome`, `totalExpense` y `netTotal`.
- `normalizeCashFlow` no trata esos campos como un contrato estable:
  - si un bucket no trae `net` / `balance` / `neto` / `netBalance`, calcula `net = income - expense`;
  - no lee `totalIncome`, `totalExpense` ni `netTotal` del payload;
  - siempre suma `income`/`expense` de los buckets y deriva `netTotal = totalIncome - totalExpense`.
- Los tests de normalización usan alias de payload (`series`, `expenses`, `balance`), no un contrato único.

**Comportamiento esperado:**

- El endpoint entrega, ya resueltos, `income`, `expense` y `net` por periodo, y los tres totales del rango.
- El signo de `net` / `netTotal` se conserva (un balance de `-904` llega como `-904`).
- El frontend puede pintar esos campos sin sumar, restar ni inferir.

No se inspeccionó la implementación interna del backend. El gap se declara porque el consumidor frontend no tiene un contrato tipado que garantice esos valores y hoy los sintetiza.

## Evidencia desde frontend

- Endpoint: `GET /companies/:companyId/dashboard/cash-flow`
- Parámetros enviados hoy: `datePreset` **o** `dateFrom`/`dateTo`, más `groupBy=week|month`
- Tipos canónicos de UI: `CashFlowBucket` y `CashFlowView` en `src/types/dashboard-analytics.ts`
- Service: `src/services/dashboard-analytics.service.ts` → `Promise<unknown>`
- Compensación actual: `normalizeCashFlow` en `src/utils/dashboard-analytics.ts`

Respuesta que el consumidor de UI necesita (forma canónica):

```ts
interface CashFlowBucket {
  label: string;
  periodStart: string | null;
  income: number;
  expense: number;
  net: number;
}

interface CashFlowView {
  period: { from: string | null; to: string | null };
  groupBy: 'week' | 'month';
  buckets: CashFlowBucket[];
  totalIncome: number;
  totalExpense: number;
  netTotal: number;
}
```

## Requerimiento backend

El endpoint de cash-flow debe devolver, para la compañía solicitada y el filtro de fechas/`groupBy` recibidos:

1. Una lista ordenada de periodos con `income`, `expense` y `net` ya calculados.
2. Totales del rango: `totalIncome`, `totalExpense`, `netTotal` ya calculados.
3. `groupBy` efectivo (`week` | `month`).
4. Rango efectivo (`period.from` / `period.to`) si el resto de analítica del Dashboard ya lo expone.

Los nombres de campo deben ser estables. El frontend no debe seguir aceptando alias ni reconstruir montos.

## Contrato esperado

```json
{
  "period": { "from": "2026-08-01T00:00:00.000Z", "to": "2026-08-31T23:59:59.999Z" },
  "groupBy": "month",
  "buckets": [
    {
      "periodStart": "2026-08-01T00:00:00.000Z",
      "label": "ago 2026",
      "income": 0,
      "expense": 904,
      "net": -904
    }
  ],
  "totalIncome": 0,
  "totalExpense": 904,
  "netTotal": -904
}
```

`label` puede omitirse si backend prefiere entregar solo `periodStart`/`groupBy` y deja la etiqueta visual al frontend. `income`, `expense`, `net` y los tres totales no son opcionales.

## Reglas de negocio

- Semántica de qué movimientos entran en ingresos, egresos y net: **PENDIENTE DE DEFINICIÓN** (el frontend no debe redefinirla).
- Semántica de `groupBy=week` vs `groupBy=month` (inicio de semana, zona horaria, buckets vacíos): **PENDIENTE DE DEFINICIÓN** respecto al contrato canónico; el request actual ya envía `groupBy`.
- `net` y `netTotal` pueden ser negativos; no se envían en valor absoluto.
- Los montos corresponden únicamente a la compañía del path.

## Seguridad / multitenancy

- Autorizar por `companyId` del path y membresía del usuario.
- No devolver datos de otra compañía.
- Conservar permisos y contrato de error existentes (401 / 403 / 400).
- No exponer tokens, payloads de sesión ni identificadores ajenos al dashboard.

## Criterios de aceptación

- El endpoint responde `income`, `expense` y `net` en cada bucket.
- El endpoint responde `totalIncome`, `totalExpense` y `netTotal` en la raíz.
- Los valores pertenecen solo a la compañía solicitada.
- `groupBy=week` y `groupBy=month` conservan su semántica acordada.
- Un balance negativo se serializa negativo (`-904`, no `904`).
- El frontend no necesita `income - expense` ni sumar buckets para pintar Flujo de caja ni el resumen.
- Errores siguen el contrato HTTP estándar de la API.
- El comportamiento queda cubierto por tests backend.

## Impacto frontend

Cuando este contrato sea estable, se podrá eliminar de `normalizeCashFlow` (ticket frontend separado):

- el fallback `net = income - expense`;
- la suma de `totalIncome` / `totalExpense`;
- el cálculo `netTotal = totalIncome - totalExpense`;
- la lectura de alias de campos (`balance`, `expenses`, `series`, etc.).

No forma parte de este ticket backend ni del ticket visual de la gráfica de barras.

## Fuera de alcance

- Cambio de la gráfica de barras en frontend.
- Recalcular KPIs de otras secciones del Dashboard.
- Redefinir filtros de fecha globales.
- Inspección o refactors internos del backend no necesarios para cumplir el contrato.
