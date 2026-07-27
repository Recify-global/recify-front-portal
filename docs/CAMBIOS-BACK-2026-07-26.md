# Cambios o revisión requerida en backend — 26 de julio de 2026

## Contexto

Durante QA del frontend en la branch `KAN-43`, el Histórico de tickets presentó un error al alternar periodos.

## Reproducción

1. Seleccionar Hoy.
2. Seleccionar 15 días.
3. Seleccionar 30 días.
4. Volver a 15 días.
5. Pulsar nuevamente 15 días.
6. Observar el fallo.

## Endpoint afectado

- Método: `GET`
- Rutas:
  - `/api/v1/companies/:companyId/tickets`
  - `/api/v1/companies/:companyId/dashboard/daily-report`
  - `/api/v1/companies/:companyId/dashboard/kpis`
- Parámetros:
  - companyId: omitido; se conservó el mismo identificador de compañía en toda la prueba.
  - dateFrom/dateTo para tickets y daily report: `YYYY-MM-DD`.
  - dateFrom/dateTo para KPIs: inicio y fin del día en ISO con offset `-06:00`.
- Request válida según contrato frontend: Sí.
- Datos sensibles omitidos: token, cookies, credenciales e identificador real de compañía.

## Resultado esperado

- Respuesta exitosa y estable para el mismo rango.
- La repetición de una request válida no debe producir un error interno.
- Tabla y KPIs deben poder consultarse repetidamente.

## Resultado real

- Status: la comprobación de health durante el fallo respondió `429 Too Many Requests`; no se capturó por separado el status de cada uno de los tres endpoints en DevTools.
- Response sanitizado: `{"success":false,"message":"Too many requests, please try again later"}`.
- Frecuencia: el agotamiento de cuota es determinístico; su manifestación en la UI depende de cuántas requests se hayan acumulado.
- ¿Intermitente o determinístico?: parece intermitente desde UI porque depende del número de requests acumuladas en la ventana.
- ¿El proceso backend se cayó?: No; siguió respondiendo.
- ¿MongoDB permaneció conectado?: no hubo desconexión o error de MongoDB en el log disponible.

## Evidencia

- Requests anteriores con los mismos rangos respondieron `200` o `304`.
- La secuencia genera tres consultas por cambio de rango: tickets, daily report y KPIs.
- Una consulta pública de health durante el fallo respondió:
  - `HTTP/1.1 429 Too Many Requests`
  - `RateLimit-Policy: 100;w=900`
  - `RateLimit-Remaining: 0`
  - `Retry-After: 749`
- Log backend sanitizado: los rangos fueron consistentes y no mostraron fechas mezcladas ni `dateFrom > dateTo`.
- Diferencia observada entre el periodo de llamadas exitosas y el fallo: la cuota del API quedó en cero dentro de una política de 100 requests por 900 segundos; no cambió el contrato del rango. Debe confirmarse en DevTools que cada endpoint afectado recibió el mismo `429`.

## Clasificación

- Severidad: P2 para QA local del Histórico.
- Backend/API o entorno: política global del API / entorno local de QA.
- Bloquea flujo principal: temporalmente, hasta que se restablece la ventana del rate limit.
- Afecta tabla: Sí.
- Afecta KPIs: Sí.
- Afecta aislamiento por compañía: no se identificó mezcla de compañías.

## Hipótesis

> Hipótesis pendiente de validación por backend: aplicar el mismo límite global a health y a las tres lecturas del Histórico hace que una sesión de QA intensiva agote rápidamente la cuota. No se revisó código backend durante esta auditoría.

## Revisión requerida en backend

- Verificar si el límite global actual es el deseado para navegación autenticada y QA local.
- Validar si las respuestas `304` deben contabilizarse igual que respuestas con payload.
- Agregar logging seguro del evento de rate limit sin incluir tokens ni datos sensibles.
- Revisar que el `429` conserve el formato de error público y no exponga internals.
- Revisar estabilidad de las tres consultas concurrentes del Histórico bajo la cuota prevista.
- No se solicita eliminar la protección ni aumentar límites sin análisis de seguridad y capacidad.

## Contrato que el frontend está enviando

- Formato de fechas:
  - tickets/daily report: `YYYY-MM-DD`.
  - KPIs: ISO de inicio/fin del día con `-06:00`.
- Zona horaria: `America/Chihuahua`.
- Rango inclusivo: Sí.
- Parámetros estables: Sí; mismo `companyId` y rangos válidos durante la secuencia.

## Frontend

- Cambios correctivos requeridos en frontend: Ninguno confirmado para este fallo.
- El frontend no debe esconder el error servidor.
- Seleccionar nuevamente el preset ya activo no cambia estado ni dispara otra request.
- No se modificó backend durante esta auditoría.

## Default persistente de Acreditable

- El frontend interpreta valores ausentes o `null` como `true`.
- El backend debe confirmar si el campo tiene default persistente `true` para tickets nuevos.
- El upload multipart actual del frontend no admite enviar este campo.
- No se realizó backfill de tickets históricos ni PATCH automático al cargar.
- Un `false` explícito se conserva siempre.

## QA de aceptación para backend

1. Ejecutar la misma request válida al menos diez veces.
2. Alternar Hoy, 15 días y 30 días.
3. Confirmar respuestas estables dentro de la cuota prevista.
4. Confirmar que MongoDB no se desconecta.
5. Confirmar que el proceso no se cae.
6. Confirmar que la respuesta `429` no expone internals.
7. Confirmar y documentar el comportamiento esperado cuando las tres consultas del Histórico agotan la cuota.

## Estado

- Pendiente de revisión de backend/política de rate limiting.
- Frontend puede continuar con otras features: Sí, una vez restablecida la ventana de rate limit; el QA intensivo seguirá limitado mientras la política permanezca igual.
