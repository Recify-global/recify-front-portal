# Backend ↔ Frontend gaps — Recify

## Contexto

Documento vivo de faltantes, dudas o contratos incompletos detectados en el **audit inicial backend → frontend** (2026-05-26).  
Fuente: revisión estática de código en `recify-back-api` y `Recify-Front` (sin llamadas HTTP en runtime en este ticket).

Complementa: [`backend-requirements.md`](./backend-requirements.md) (requerimientos más detallados).

---

## Gaps abiertos

### GAP-001 — Guardar ticket re-ejecuta OCR + Gemini

- **Ticket relacionado:** KAN-15, KAN-15 análisis
- **Severidad:** P1
- **Pantalla afectada:** Upload (`/app/upload`)
- **Endpoint relacionado:** `POST /companies/:companyId/upload/preprocess`, `POST /companies/:companyId/upload/ticket`
- **Problema:** Preprocess analiza sin persistir. Upload vuelve a correr el mismo pipeline (`processTicketImage`) y crea ticket con el **segundo** resultado. Frontend solo reenvía el archivo al guardar.
- **Impacto frontend:** Totales/categoría/comercio cambian entre preview y guardado; UX inconsistente; doble costo/latencia IA. En pantalla de análisis, las ediciones del preview solo pueden persistirse para campos soportados aplicando un PATCH posterior al ticket creado.
- **Contrato esperado:** Persistir payload del preprocess (JSON estructurado + imagen) sin segunda corrida IA, o token `preprocessId` reutilizable.
- **Ejemplo de request esperado si aplica:**
  ```json
  {
    "preprocessId": "tmp_123",
    "ticket": {
      "type": "egreso",
      "date": "2026-06-01T00:00:00.000Z",
      "amount": 120,
      "category": "Restaurantes y Alimentos",
      "paymentMethod": "card"
    }
  }
  ```
- **Ejemplo de response esperado:**
  ```json
  {
    "success": true,
    "data": {
      "imageUrl": "https://...",
      "ticket": { "_id": "...", "amount": 1234.5, "status": "processed" }
    }
  }
  ```
  donde `amount` coincide con el preview mostrado al usuario.
- **Bloquea ticket actual:** sí (upload confiable)
- **Workaround frontend permitido:** parcial — crear ticket con upload y aplicar PATCH dashboard posterior para campos soportados (`type`, `date`, `amount`, `category`, `paymentMethod`, `status`, `reviewStatus`). No aplica para `vendor`, `folio`, `notes`.
- **Notas para backend:** Verificado en `upload.controller.js` y `UploadPage.handleSave`.

---

### GAP-002 — `imageUrl` no disponible en GET tickets

- **Ticket relacionado:** KAN-15
- **Severidad:** P1
- **Pantalla afectada:** Histórico (`/app/history`), preview de imagen
- **Endpoint relacionado:** `GET /companies/:companyId/tickets`, `GET /companies/:companyId/tickets/:id`
- **Problema:** `rawData` en modelo Ticket tiene `select: false`. La URL se guarda en `rawData.imageUrl` al upload, pero no llega en lecturas posteriores.
- **Impacto frontend:** `TicketImagePreview` muestra fallback "Sin imagen" en histórico aunque la imagen exista en R2.
- **Contrato esperado:** Campo top-level `imageUrl` en ticket GET, o proyección explícita de `rawData.imageUrl`.
- **Ejemplo de response esperado:**
  ```json
  {
    "success": true,
    "data": {
      "_id": "...",
      "amount": 500,
      "imageUrl": "https://r2.../tickets/uuid.jpg"
    }
  }
  ```
- **Bloquea ticket actual:** sí (imagen en histórico)
- **Workaround frontend permitido:** parcial — conservar `imagenUrl` ya presente en el estado visual, pero no inventar URLs.
- **Notas para backend:** `POST /upload/ticket` sí devuelve `imageUrl` en wrapper `data`, no dentro del ticket persistido accesible vía GET. La respuesta de PATCH dashboard tampoco debe usarse como reemplazo completo si no trae imagen.

---

### GAP-003 — Campos OCR (`vendor`, `subtotal`, `tax`) no expuestos en GET

- **Severidad:** P1
- **Pantalla afectada:** Histórico, detalle ticket, Upload (post-guardado vía refetch)
- **Endpoint relacionado:** `GET /tickets`, `GET /tickets/:id`
- **Problema:** Comercio, subtotal, IVA y notas se derivan en frontend de `rawData`, que no se incluye en GET.
- **Impacto frontend:** Mapper cae en fallbacks (`categoria` como comercio, total = subtotal, `moneda: 'MXN'` hardcoded, notas genéricas).
- **Contrato esperado:** Proyección mínima: `vendor`, `subtotal`, `tax`, `imageUrl` (o `rawData` parcial tipado).
- **Bloquea ticket actual:** parcial (histórico muestra datos pobres/incorrectos)
- **Notas:** No inventar en frontend; requiere backend.

---

### GAP-004 — Sin idempotencia en upload

- **Severidad:** P1
- **Pantalla afectada:** Upload
- **Endpoint relacionado:** `POST /upload/ticket`
- **Problema:** Cada guardado hace `ticketService.create` sin deduplicación.
- **Impacto frontend:** Reintentos o doble clic crean tickets duplicados con posibles montos distintos.
- **Contrato esperado:** `Idempotency-Key` o hash de imagen → 409 o ticket existente.
- **Bloquea ticket actual:** no (workaround UX: deshabilitar botón), sí para producción
- **Notas:** —

---

### GAP-005 — PATCH tickets vs PATCH dashboard (campos distintos)

- **Ticket relacionado:** KAN-15
- **Severidad:** P1
- **Pantalla afectada:** Histórico (edición manual)
- **Endpoint relacionado:** `PATCH /tickets/:id` vs `PATCH /dashboard/daily-report/:ticketId`
- **Problema:** Dashboard PATCH acepta `type`, `date`, `amount`. Tickets PATCH solo `status`, `reviewStatus`, `category`, `paymentMethod`.
- **Impacto frontend:** Dos contratos distintos; riesgo de flujos duplicados si no se centraliza edición.
- **Contrato esperado:** Un solo contrato de edición documentado, o ampliar PATCH tickets.
- **Bloquea ticket actual:** no (con workaround)
- **Workaround frontend permitido:** sí — KAN-15 usa **solo** `PATCH /dashboard/daily-report/:ticketId` en Histórico.
- **Notas:** Postman documenta `_editableFields` en daily-report. `useUpdateTicket` (PATCH tickets) ya no se usa en Histórico.

---

### GAP-006 — Sin edición de descripción/concepto/vendor

- **Ticket relacionado:** KAN-15
- **Severidad:** P2
- **Pantalla afectada:** Histórico, Upload
- **Endpoint relacionado:** PATCH tickets, PATCH dashboard
- **Problema:** No existe campo `description`/`concepto`. `vendor` vive en `rawData` y no es PATCH-able.
- **Impacto frontend:** Comercio y notas se muestran **solo lectura** en el detalle; no están en el formulario de edición KAN-15.
- **Contrato esperado:** PATCH acepte `rawData.vendor`, `rawData.notes` o campos top-level.
- **Bloquea ticket actual:** no
- **Workaround frontend permitido:** no (no simular persistencia)
- **Notas para backend:** KAN-15 excluye vendor/notas del scope de edición. El frontend formatea notas para no mostrar JSON crudo, pero no puede persistir correcciones.

---

### GAP-007 — Filtros `reviewStatus` / `paymentMethod` en GET /tickets ignorados por validator

- **Severidad:** P2
- **Pantalla afectada:** Histórico (filtros futuros)
- **Endpoint relacionado:** `GET /companies/:companyId/tickets`
- **Problema:** `ticket.service.findAll` soporta `reviewStatus` y `paymentMethod`, pero `ticket.validator.js` `listSchema` no los declara → Zod los elimina del query parseado.
- **Impacto frontend:** Tipos frontend (`TicketsListParams`) prometen filtros que el endpoint no aplica hoy.
- **Contrato esperado:** Añadir query params al validator o documentar que solo daily-report los soporta.
- **Bloquea ticket actual:** no (histórico filtra client-side)
- **Notas:** Daily-report sí valida esos filtros.

---

### GAP-008 — Shape de `GET /dashboard/daily-report` ≠ `Paginated<T>`

- **Ticket relacionado:** KAN-15
- **Severidad:** P2
- **Pantalla afectada:** Dashboard / reportes (futuro)
- **Endpoint relacionado:** `GET /dashboard/daily-report`, `PATCH /dashboard/daily-report/:ticketId`
- **Problema:** Response GET real: `{ filters, tickets, page, limit, total, pages }`. La respuesta PATCH puede venir con shape parcial y metadatos (`_editPath`, `_editableFields`) sin todos los campos visuales de `GET /tickets/:id`.
- **Impacto frontend:** Si el frontend reemplaza el ticket visual completo con esa respuesta, puede perder imagen/notas/campos de detalle.
- **Contrato esperado:** Tipar `{ filters, tickets[], page, limit, total, pages }` + respuesta PATCH con ticket completo o contrato claro de campos parciales.
- **Ejemplo de response esperado si aplica:**
  ```json
  {
    "success": true,
    "data": {
      "_id": "...",
      "type": "egreso",
      "date": "2026-06-01T00:00:00.000Z",
      "amount": 120,
      "category": "Restaurantes y Alimentos",
      "paymentMethod": "card",
      "status": "processed",
      "reviewStatus": "revisado",
      "imageUrl": "https://..."
    }
  }
  ```
- **Bloquea ticket actual:** no (servicio no usado en páginas aún)
- **Workaround frontend permitido:** sí — invalidar/refetch y no reemplazar estado visual completo con response PATCH parcial.
- **Notas para backend:** Recomendado homologar respuesta PATCH con GET detalle o documentar que es parcial.

---

### GAP-009 — Registro sin empresa (onboarding)

- **Severidad:** P1
- **Pantalla afectada:** Auth (`/auth`)
- **Endpoint relacionado:** `POST /auth/register`
- **Problema:** Register crea `companies: []` por defecto. Rutas `/app/*` exigen `companyId` en sesión.
- **Impacto frontend:** Usuario nuevo no entra a la app sin script admin.
- **Contrato esperado:** Register con company embebida o endpoint self-service post-registro.
- **Bloquea ticket actual:** sí (onboarding real)
- **Notas:** —

---

### GAP-010 — URLs de imagen R2: pública vs firmada no documentada

- **Severidad:** P2
- **Pantalla afectada:** Histórico, preview click → nueva pestaña
- **Endpoint relacionado:** Upload R2, GET tickets
- **Problema:** URL construida con `CLOUDFLARE_R2_PUBLIC_URL || CLOUDFLARE_R2_ENDPOINT`. No hay endpoint de URL firmada ni TTL documentado.
- **Impacto frontend:** Si bucket no es público, preview/link fallará ("Imagen no disponible").
- **Contrato esperado:** Documentar si URL es pública permanente o exponer `GET /tickets/:id/image-url` con signed URL.
- **Bloquea ticket actual:** depende de config R2 del entorno
- **Notas:** Requiere verificación en entorno desplegado.

---

### GAP-011 — Sin campo `currency` en modelo Ticket

- **Severidad:** P2
- **Pantalla afectada:** Upload, Histórico
- **Endpoint relacionado:** Ticket model, preprocess structured JSON
- **Problema:** Gemini prompt no pide moneda; modelo no tiene `currency`. Frontend asume `MXN`.
- **Impacto frontend:** Moneda siempre MXN en UI; no hay dato backend.
- **Contrato esperado:** Campo opcional `currency` en ticket o structured preprocess.
- **Bloquea ticket actual:** no
- **Notas:** —

---

### GAP-012 — Rutas dashboard: prefijo `/dashboard/` vs docs previas

- **Severidad:** P3
- **Pantalla afectada:** Integración general
- **Endpoint relacionado:** Dashboard analytics
- **Problema:** Rutas reales son `/companies/:companyId/dashboard/summary` (etc.), no `/companies/:companyId/summary`.
- **Impacto frontend:** `endpoints.ts` ya usa prefijo correcto; riesgo si alguien integra con path viejo.
- **Contrato esperado:** Documentación unificada con prefijo `/dashboard/`.
- **Bloquea ticket actual:** no
- **Notas:** Frontend alineado; Postman alineado.

---

### GAP-013 — Confianza / confidence no es contrato de producto

- **Severidad:** P3
- **Pantalla afectada:** UI (limpieza)
- **Endpoint relacionado:** Preprocess structured (Gemini no devuelve confidence)
- **Problema:** Legacy UI tenía `confianza`; backend no expone score estable.
- **Impacto frontend:** Eliminar de UI (hecho en páginas); queda componente legacy `ConfidenceIndicator.tsx` y `dummy-tickets.ts`.
- **Contrato esperado:** Ninguno (no pedir confidence al backend).
- **Bloquea ticket actual:** no
- **Notas:** Solo deuda frontend legacy.

---

### GAP-014 — Contrato de notas no estructurado

- **Ticket relacionado:** KAN-31
- **Severidad:** P2
- **Pantalla afectada:** Upload (`/app/upload`), Histórico (`/app/history`)
- **Endpoint relacionado:** `POST /upload/preprocess`, `POST /upload/ticket`, `GET /tickets`, `GET /tickets/:id`
- **Problema:** Las notas/datos adicionales pueden llegar mezclados como string plano, string JSON, `rawData`, `ocrText` o campos sueltos (`vendor`, `folio`, `subtotal`, etc.) sin contrato estable de nota humana editable vs datos estructurados.
- **Impacto frontend:** Si se renderiza directo, aparece JSON crudo u OCR gigante; si se filtra demasiado, se pierde información útil como comercio, RFC, folio, importes o método de pago.
- **Contrato esperado:** Separar nota humana editable de datos estructurados y OCR completo.
- **Ejemplo de response esperado:**
  ```json
  {
    "notes": "Nota humana editable",
    "vendor": "OXXO",
    "vendorRFC": "ABC123456XYZ",
    "folio": "12345",
    "ocrText": "Texto OCR completo o excerpt",
    "items": [
      { "name": "Producto", "quantity": 1, "amount": 50 }
    ],
    "structured": {
      "subtotal": 100,
      "tax": 16,
      "amount": 116,
      "paymentMethod": "card",
      "category": "food",
      "type": "expense"
    }
  }
  ```
- **Bloquea ticket actual:** no
- **Workaround frontend permitido:** sí — formatear defensivamente con whitelist de campos útiles y ocultar campos técnicos.
- **Notas para backend:** Idealmente `notes` debería ser un campo humano separado; `ocrText` debería consumirse como dato técnico o excerpt, no como nota final.

---

### GAP-015 — Productos/conceptos del ticket no vienen estructurados o no llegan al frontend

- **Ticket relacionado:** KAN-31
- **Severidad:** P1
- **Pantalla afectada:** Upload (`/app/upload`), Histórico (`/app/history`)
- **Endpoint relacionado:** `POST /upload/preprocess`, `POST /upload/ticket`, `GET /tickets`, `GET /tickets/:id`
- **Problema:** Tickets reales como Alsuper contienen productos, cantidades, unidades y precios, pero el backend actual no devuelve partidas estructuradas. El prompt de Gemini indica explícitamente "solo resumen; no partidas ni arreglo items" y "No incluyas items ni listas de productos"; además `preprocess.service.js` elimina `parsed.items` y `upload.controller.js` elimina `structuredSummary.items` antes de guardar. `rawData` se guarda con `select: false`, por lo que Histórico tampoco recibe OCR/rawData en `GET /tickets` ni `GET /tickets/:id`. En QA también se observó que esos datos pueden llegar como transcripción OCR/Gemini en inglés o tabla markdown dentro de texto.
- **Impacto frontend:** La sección "Productos detectados" puede mostrar `items/products/lineItems/concepts` si algún endpoint los trae y tiene un workaround para parsear tablas markdown simples, pero no debe depender de texto OCR/Gemini en inglés para construir UI confiable. Si no hay productos estructurados o tabla parseable, debe mostrar fallback limpio.
- **Contrato esperado:**
  ```json
  {
    "items": [
      {
        "name": "Leche evaporada",
        "quantity": 1,
        "unit": "pieza",
        "unitPrice": 24.9,
        "total": 24.9
      },
      {
        "name": "Plátano",
        "quantity": 0.38,
        "unit": "kg",
        "unitPrice": 18.89,
        "total": 7.18
      }
    ],
    "notes": "Nota humana opcional",
    "vendor": "Walmart",
    "folio": "12345",
    "paymentMethod": "credit_card",
    "type": "expense"
  }
  ```
- **Bloquea ticket actual:** sí para mostrar productos reales cuando backend no los entrega; no bloquea el fallback frontend.
- **Workaround frontend permitido:** sí — buscar line items en claves conocidas si ya vienen en respuesta, parsear tablas markdown simples como solución frágil, no renderizar JSON crudo, bloquear transcripciones OCR/Gemini visibles y mostrar método/tipo como campos propios.
- **Workaround frontend prohibido:** inventar productos desde OCR plano si no vienen de forma confiable.
- **Notas para backend:** Exponer `items[]` tipado en preprocess, upload y GET detalle/listado. Separar `notes` humana de OCR/rawData. Ampliar `paymentMethod` si producto necesita distinguir `credit_card` y `debit_card`.
- **Resultado debug (2026-06-12, script local `recify-back-api/scripts/debug-gemini-ticket-output.js`):**
  - **Diagnóstico tickets reales (Alsuper, QA + audit código):** **B** — productos en tabla markdown dentro del texto OCR (DeepInfra), no en JSON estructurado.
  - **Diagnóstico Gemini estructurado:** **C/D** — Gemini devuelve solo resumen (`type`, `date`, `amount`, `subtotal`, `tax`, `category`, `paymentMethod`, `vendor`, `folio`); sin `items`/`products`/`lineItems` ni antes ni después del strip en producción.
  - **Campo donde vienen productos (cuando existen):** texto OCR (`ocrText`) — transcripción en inglés con tabla markdown (`| Quantity | Description | Unit Price | Total Price |`).
  - **Campo donde NO vienen:** respuesta JSON de Gemini (`structured` / `ticket` en preprocess); el prompt prohíbe `"items"` y `preprocess.service.js` hace `delete parsed.items` antes de devolver.
  - **Ejemplo de shape real observado en QA (OCR, excerpt):**
    ```
    Here is a detailed transcription of the items and costs from the receipt:
    **Store Name:** alsuper **Location:** Jimenez, Chih.
    | Quantity | Description | Unit Price | Total Price |
    | :--- | :--- | :--- | ...
    ```
  - **Ejemplo de shape real Gemini (preprocess/upload, sin items):**
    ```json
    {
      "type": "egreso",
      "date": "2026-06-01T00:00:00.000Z",
      "amount": 123.45,
      "subtotal": 106.42,
      "tax": 17.03,
      "category": "Supermercado y Abarrotes",
      "paymentMethod": "card",
      "vendor": "alsuper",
      "vendorRFC": null,
      "folio": "12345"
    }
    ```
  - **Smoke test script (logo.png, no ticket):** OCR 258 chars, Gemini JSON válido con 10 claves de resumen, `items` count 0, sin tabla markdown — confirma pipeline pero no sustituye ticket Alsuper.
  - **Contrato esperado (sin cambios):** ver bloque `items[]` arriba en este gap.
  - **Acción backend (GAP-015):** ampliar prompt Gemini para devolver `items[]` tipado; dejar de eliminar `parsed.items`; exponer en preprocess, upload y GET; no usar OCR crudo como notas de usuario.

---

## Gaps cerrados

_(Vacío — mover aquí cuando backend resuelva.)_

---

## Referencia rápida: endpoints del PR (verificados en código)

| Endpoint | Existe | Base path real |
|----------|--------|----------------|
| `POST /auth/register` | ✅ | `/api/v1/auth/register` |
| `POST /auth/login` | ✅ | `/api/v1/auth/login` |
| `POST /upload/preprocess` | ✅ | `/api/v1/companies/:companyId/upload/preprocess` |
| `POST /upload/ticket` | ✅ | `/api/v1/companies/:companyId/upload/ticket` |
| `GET /dashboard/summary` | ✅ | `/api/v1/companies/:companyId/dashboard/summary` |
| `GET /dashboard/by-date` | ✅ | `/api/v1/companies/:companyId/dashboard/by-date` |
| `GET /dashboard/by-category` | ✅ | `/api/v1/companies/:companyId/dashboard/by-category` |
| `GET /dashboard/by-payment-method` | ✅ | `/api/v1/companies/:companyId/dashboard/by-payment-method` |
| `GET /dashboard/daily-report` | ✅ | `/api/v1/companies/:companyId/dashboard/daily-report` |
| `PATCH /dashboard/daily-report/:ticketId` | ✅ | `/api/v1/companies/:companyId/dashboard/daily-report/:ticketId` |

Auth en todos los de company: `Authorization: Bearer <JWT>` + acceso a `companyId`.
