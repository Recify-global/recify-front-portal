# Backend ↔ Frontend gaps — Recify

## Contexto

Documento vivo de faltantes, dudas o contratos incompletos detectados en el **audit inicial backend → frontend** (2026-05-26).  
**Última re-verificación backend:** 2026-07-08 — revisión estática de `recify-back-api` (sin HTTP en runtime).

Complementa: [`backend-requirements.md`](./backend-requirements.md) (requerimientos más detallados).

### Resumen rápido (2026-07-08)

| Área | Estado backend | Impacto frontend actual |
|------|----------------|-------------------------|
| `GET /companies` | ✅ Existe, paginado, scoped al usuario | Selector sidebar puede usar nombres reales |
| `GET /tickets` filtros `category` / `dateFrom` / `dateTo` | ✅ Validator + service | Histórico aún filtra client-side (`limit: 100`) |
| `GET /tickets` filtros `reviewStatus` / `paymentMethod` | ❌ Service sí; validator no | Tipos frontend prometen más de lo que aplica |
| `GET /tickets` `search` | ❌ No implementado | Búsqueda solo client-side |
| `vendor` top-level en ticket | ✅ Modelo + upload | Histórico puede mostrar comercio en tickets nuevos |
| `imageUrl` / `subtotal` / `tax` / `folio` en GET tickets | ❌ Solo en `rawData` (`select: false`) | Preview upload ≠ detalle histórico |
| `items[]` estructurados | ❌ Prompt Gemini + strip | GAP-015 sigue abierto |
| Daily-report GET/PATCH | ✅ Proyecta `imageUrl` + `vendor`; PATCH amplio | Histórico no usa daily-report para listado |

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
- **Problema (actualizado 2026-07-08):** `rawData` en modelo Ticket tiene `select: false`. La URL se guarda en `rawData.imageUrl` al upload, pero no llega en lecturas de `GET /tickets`. **Excepción:** `GET /dashboard/daily-report` y su PATCH sí proyectan `imageUrl` desde `rawData` antes de eliminarlo.
- **Impacto frontend:** `TicketImagePreview` muestra fallback "Sin imagen" en histórico aunque la imagen exista en R2. Daily-report no se usa hoy para listado de Histórico.
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

### GAP-003 — Campos OCR (`subtotal`, `tax`, `folio`, `imageUrl`) no expuestos en GET tickets

- **Severidad:** P1
- **Pantalla afectada:** Histórico, detalle ticket, Upload (post-guardado vía refetch)
- **Endpoint relacionado:** `GET /tickets`, `GET /tickets/:id`
- **Problema (actualizado 2026-07-08):** `vendor` ya es campo top-level en el modelo y se persiste en upload (`upload.controller.js`). `GET /tickets` **sí** devuelve `vendor` en tickets guardados así. Pero `subtotal`, `tax`, `folio`, `vendorRFC`, `ocrText` e `imageUrl` siguen solo en `rawData` con `select: false`; el controller no proyecta esos campos.
- **Impacto frontend:** Comercio mejora en tickets nuevos; subtotal/IVA/folio/imagen/notas siguen con fallbacks o datos perdidos al refetch desde Histórico.
- **Contrato esperado:** Proyección mínima en GET: `vendor`, `subtotal`, `tax`, `folio`, `imageUrl` (o `rawData` parcial tipado).
- **Bloquea ticket actual:** parcial (histórico sigue incompleto en montos desglosados e imagen)
- **Notas para backend:** Daily-report ya proyecta `imageUrl` y `vendor` desde `rawData` (`dailyReport.service.js`); homologar proyección en `GET /tickets` y `GET /tickets/:id`.

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

### GAP-006 — Sin edición de notas; `folio`/`vendorRFC` no persistibles

- **Ticket relacionado:** KAN-15
- **Severidad:** P2
- **Pantalla afectada:** Histórico, Upload
- **Endpoint relacionado:** `PATCH /tickets/:id`, `PATCH /dashboard/daily-report/:ticketId`
- **Problema (actualizado 2026-07-08):** `vendor` **sí** es editable vía `PATCH /dashboard/daily-report/:ticketId` (`EDITABLE_FIELDS` incluye `vendor`). Siguen sin existir `description`/`concepto`/`notes` como campo de producto. `folio` y `vendorRFC` se extraen en preprocess pero solo viven en `rawData`; no hay PATCH para ellos.
- **Impacto frontend:** Comercio editable en Histórico (dashboard PATCH). Notas, folio y RFC siguen solo lectura; no se pueden corregir desde UI.
- **Contrato esperado:** PATCH acepte `notes` humana, `folio`, `vendorRFC` (top-level o en proyección parcial de `rawData`).
- **Bloquea ticket actual:** no
- **Workaround frontend permitido:** no para notas/folio (no simular persistencia)
- **Notas para backend:** KAN-15 usa dashboard PATCH para campos principales + `vendor`. Ampliar `EDITABLE_FIELDS` o exponer campos OCR editables.

---

### GAP-007 — Filtros `reviewStatus` / `paymentMethod` en GET /tickets ignorados por validator

- **Severidad:** P2
- **Pantalla afectada:** Histórico (filtros futuros server-side)
- **Endpoint relacionado:** `GET /companies/:companyId/tickets`
- **Problema (actualizado 2026-07-08):** `ticket.service.findAll` soporta `reviewStatus` y `paymentMethod`, pero `ticket.validator.js` `listSchema` **no** los declara → Zod los elimina. Por contraste, `category`, `dateFrom` y `dateTo` **ya están** en el validator y el service los aplica.
- **Impacto frontend:** `TicketsListParams` promete `reviewStatus` y `paymentMethod`, pero `GET /tickets` no los aplica. Categoría y fechas podrían usarse server-side, pero Histórico hoy sigue filtrando client-side.
- **Contrato esperado:** Añadir `reviewStatus` y `paymentMethod` al `listSchema` de tickets, o documentar que solo daily-report los soporta.
- **Bloquea ticket actual:** no (histórico filtra client-side)
- **Notas:** `GET /dashboard/daily-report` sí valida y aplica `reviewStatus`, `paymentMethod`, `category`, `dateFrom`, `dateTo`.

---

### GAP-008 — Shape de `GET /dashboard/daily-report` ≠ `Paginated<T>`; PATCH parcial

- **Ticket relacionado:** KAN-15
- **Severidad:** P2
- **Pantalla afectada:** Dashboard / reportes (futuro), Histórico (edición vía PATCH)
- **Endpoint relacionado:** `GET /dashboard/daily-report`, `PATCH /dashboard/daily-report/:ticketId`
- **Problema (actualizado 2026-07-08):** Response GET sigue siendo `{ filters, tickets, page, limit, total, pages }` (no `Paginated<T>` plano). **Mejora:** daily-report ahora proyecta `imageUrl` y `vendor` desde `rawData` antes de eliminarlo. PATCH acepta `vendor` y devuelve ticket con `_editPath`, `_editableFields`. Sigue siendo respuesta parcial: sin `subtotal`, `tax`, `folio`, `items`, `ocrText`.
- **Impacto frontend:** Edición Histórico vía dashboard PATCH funciona para campos principales + `vendor`. No reemplazar estado visual completo con respuesta PATCH si faltan imagen/notas/desglose.
- **Contrato esperado:** Tipar shape custom de daily-report; PATCH con ticket completo o contrato explícito de campos parciales.
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
      "vendor": "OXXO",
      "status": "processed",
      "reviewStatus": "revisado",
      "imageUrl": "https://...",
      "_editableFields": ["type", "date", "amount", "category", "paymentMethod", "vendor", "status", "reviewStatus"]
    }
  }
  ```
- **Bloquea ticket actual:** no
- **Workaround frontend permitido:** sí — invalidar/refetch tras PATCH; no reemplazar ticket visual completo con response parcial.
- **Notas para backend:** Homologar proyección `imageUrl`/`vendor` en `GET /tickets` o documentar que Histórico debería migrar a daily-report para listado enriquecido.

---

### GAP-009 — Registro sin empresa (onboarding)

- **Severidad:** P1
- **Pantalla afectada:** Auth (`/auth`), selector de compañía
- **Endpoint relacionado:** `POST /auth/register`, `POST /companies`
- **Problema (actualizado 2026-07-08):** Register crea `companies: []` por defecto. Rutas `/app/*` exigen `companyId` en sesión. `POST /companies` existe pero requiere `rfc` (12–13 caracteres) y no está integrado al flujo de registro — no hay onboarding atómico.
- **Impacto frontend:** Usuario nuevo no entra a la app sin script admin o flujo manual en dos pasos (registro + crear empresa con RFC). Selector multitenant queda vacío si `user.companies` es `[]`.
- **Contrato esperado:** Register con company embebida, o endpoint self-service post-registro que cree empresa + asigne al usuario.
- **Bloquea ticket actual:** sí (onboarding real)
- **Notas:** Relacionado con GAP-016: el listado `GET /companies` ya funciona cuando el usuario tiene membresías.

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
- **Notas:** Sin cambios en backend (2026-07-08).

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

### GAP-016 — Selector multitenant: frontend listo; onboarding y nombres dependen de membresía

- **Ticket relacionado:** selector sidebar (2026-07-08)
- **Severidad:** P2 _(bajó de P1: endpoint backend ya existe)_
- **Pantalla afectada:** Sidebar (selector de compañía)
- **Endpoint relacionado:** `GET /companies` (`listMyCompanies`), `POST /auth/login`
- **Problema (actualizado 2026-07-08):** **Backend resuelto parcialmente.** `GET /api/v1/companies` existe (`company.routes.js`), filtra por `user.companies` vía `scopeCompaniesByAccess`, devuelve paginado `{ data, total, page, limit, pages }` con `_id`, `name`, `status`, `timezone`. El frontend ya cruza esa lista con `AuthUser.companies` y persiste `recify.companyId`. Lo que sigue abierto: usuarios sin empresas (GAP-009); selector degradado si el listado falla o no trae `name`; discrepancia si `user.companies` y `GET /companies` no coinciden.
- **Impacto frontend:** Selector funcional cuando hay ≥2 compañías con nombre. Fallback seguro: “Compañía actual” sin inventar opciones.
- **Contrato esperado:**
  ```json
  {
    "success": true,
    "data": {
      "data": [
        {
          "_id": "6a14d23fde7ffd67973d12b3",
          "name": "Mi negocio",
          "status": "active",
          "timezone": "America/Mexico_City"
        }
      ],
      "total": 1,
      "page": 1,
      "limit": 20,
      "pages": 1
    }
  }
  ```
- **Bloquea ticket actual:** no (UI con fallback)
- **Workaround frontend permitido:** sí — `setActiveCompany` validado contra `user.companies`; sin mocks.
- **Notas para backend:** Garantizar que login/register devuelvan `user.companies` alineado al listado. Resolver onboarding (GAP-009).

---

### GAP-017 — Histórico filtra client-side; backend ya soporta parte de filtros server-side

- **Ticket relacionado:** selector + filtros Histórico (2026-07-08)
- **Severidad:** P2
- **Pantalla afectada:** Histórico (`/app/history`)
- **Endpoint relacionado:** `GET /companies/:companyId/tickets`
- **Problema (actualizado 2026-07-08):** Histórico carga `useTickets({ page: 1, limit: 100 })` y filtra categoría/fechas **en frontend**. El backend **ya valida y aplica** `category`, `dateFrom`, `dateTo` en `GET /tickets` (`ticket.validator.js` + `ticket.service.js`). No aplica aún: `search`, `reviewStatus`, `paymentMethod` (validator). Frontend no envía params server-side todavía.
- **Impacto frontend:** Filtros actuales funcionan sobre máximo 100 tickets. Tickets fuera del lote no aparecen aunque el backend podría filtrarlos si el frontend pasara query params + paginación.
- **Contrato esperado (query params en GET /tickets):**
  - **Ya soportados en backend:** `category`, `dateFrom`, `dateTo`, `type`, `status`, `page`, `limit`
  - **Faltan en backend:** `search`, `reviewStatus`, `paymentMethod` (en validator de tickets)
- **Bloquea ticket actual:** no para UX básica; sí para histórico completo y filtros confiables
- **Workaround frontend permitido:** sí — filtros client-side sobre lote cargado (implementado).
- **Próximo paso frontend (sin tocar backend):** opcionalmente enviar `category`/`dateFrom`/`dateTo` al API cuando se quiera cerrar el gap de los 100 tickets.
- **Notas para backend:** Añadir `reviewStatus`, `paymentMethod` y `search` al `listSchema` si producto los necesita en Histórico.

---

### GAP-018 — `search` no implementado en GET /tickets

- **Severidad:** P2
- **Pantalla afectada:** Histórico (búsqueda)
- **Endpoint relacionado:** `GET /companies/:companyId/tickets`
- **Problema:** No existe query param `search` en `ticket.validator.js` ni lógica en `ticket.service.js`. La búsqueda de Histórico es 100% client-side (TanStack global filter).
- **Impacto frontend:** No se puede buscar por comercio/categoría/folio en todo el histórico de la compañía, solo en los tickets ya cargados.
- **Contrato esperado:** `?search=<texto>` con match en `vendor`, `category`, `folio` (si se expone), u otros campos acordados.
- **Bloquea ticket actual:** no
- **Notas:** Daily-report tampoco implementa `search`; solo filtros estructurados.

---

### GAP-019 — Campos de preprocess visibles en Upload no refetchables desde GET /tickets

- **Severidad:** P1
- **Pantalla afectada:** Upload (preview) vs Histórico (detalle)
- **Endpoint relacionado:** `POST /upload/preprocess`, `POST /upload/ticket`, `GET /tickets/:id`
- **Problema:** Preprocess devuelve `ticket` con `subtotal`, `tax`, `folio`, `vendorRFC`, etc. Upload guarda esos valores en `rawData` (select: false) y solo promueve algunos a top-level (`vendor`, `type`, `date`, `amount`, `category`, `paymentMethod`). Al refetch desde Histórico, subtotal/IVA/folio/imagen/OCR no están disponibles.
- **Impacto frontend:** Preview de Upload puede mostrar más detalle que el detalle en Histórico para el mismo ticket, incluso sin contar la doble corrida IA (GAP-001).
- **Contrato esperado:** Misma proyección mínima en preprocess response, upload response y GET detalle/listado.
- **Bloquea ticket actual:** parcial (inconsistencia UX upload ↔ histórico)
- **Notas:** Relacionado con GAP-002, GAP-003, GAP-015.

---

### GAP-020 — `folio` y `vendorRFC` extraídos por Gemini pero no modelo ni PATCH

- **Severidad:** P2
- **Pantalla afectada:** Upload, Histórico
- **Endpoint relacionado:** preprocess, upload, PATCH tickets, PATCH daily-report
- **Problema:** El prompt Gemini pide `folio` y `vendorRFC` (`preprocess.service.js`). Se guardan dentro de `rawData` pero no hay campos top-level en `ticket.model.js` ni en `EDITABLE_FIELDS` de daily-report.
- **Impacto frontend:** Folio puede mostrarse si llegara en respuesta; hoy depende de `rawData` oculto. No editable desde UI.
- **Contrato esperado:** Campos top-level `folio`, `vendorRFC` en ticket + PATCH opcional.
- **Bloquea ticket actual:** no
- **Notas:** Relacionado con GAP-006 y GAP-014.

---

## Gaps cerrados

### GAP-012 — Rutas dashboard: prefijo `/dashboard/` vs docs previas

- **Cerrado:** 2026-07-08
- **Motivo:** Rutas reales y `endpoints.ts` del frontend ya usan `/companies/:companyId/dashboard/*`. Postman y código backend alineados.
- **Evidencia:** `recify-back-api/src/routes/dashboard.routes.js`, `Recify-Front/src/api/endpoints.ts`

---

## Referencia rápida: endpoints (verificados en código, 2026-07-08)

| Endpoint | Existe | Base path real | Notas |
|----------|--------|----------------|-------|
| `POST /auth/register` | ✅ | `/api/v1/auth/register` | `companies: []` por defecto (GAP-009) |
| `POST /auth/login` | ✅ | `/api/v1/auth/login` | Devuelve `user.companies[]` |
| `GET /companies` | ✅ | `/api/v1/companies` | Paginado; scoped a usuario (GAP-016) |
| `GET /companies/:id` | ✅ | `/api/v1/companies/:id` | Requiere acceso a la compañía |
| `POST /companies` | ✅ | `/api/v1/companies` | Requiere `rfc`; no integrado a register |
| `GET /companies/:companyId/tickets` | ✅ | `/api/v1/companies/:companyId/tickets` | Filtros: `category`, `dateFrom`, `dateTo` ✅; `reviewStatus`, `paymentMethod`, `search` ❌ |
| `GET /companies/:companyId/tickets/:id` | ✅ | `/api/v1/companies/:companyId/tickets/:id` | Sin proyección `rawData` |
| `PATCH /companies/:companyId/tickets/:id` | ✅ | `/api/v1/companies/:companyId/tickets/:id` | Solo `status`, `reviewStatus`, `category`, `paymentMethod` |
| `DELETE /companies/:companyId/tickets/:id` | ✅ | `/api/v1/companies/:companyId/tickets/:id` | — |
| `POST /upload/preprocess` | ✅ | `/api/v1/companies/:companyId/upload/preprocess` | `{ ocrText, ticket }`; sin `items` |
| `POST /upload/ticket` | ✅ | `/api/v1/companies/:companyId/upload/ticket` | Re-ejecuta IA (GAP-001) |
| `GET /dashboard/summary` | ✅ | `/api/v1/companies/:companyId/dashboard/summary` | — |
| `GET /dashboard/by-date` | ✅ | `/api/v1/companies/:companyId/dashboard/by-date` | — |
| `GET /dashboard/by-category` | ✅ | `/api/v1/companies/:companyId/dashboard/by-category` | — |
| `GET /dashboard/by-payment-method` | ✅ | `/api/v1/companies/:companyId/dashboard/by-payment-method` | — |
| `GET /dashboard/daily-report` | ✅ | `/api/v1/companies/:companyId/dashboard/daily-report` | Proyecta `imageUrl`, `vendor`; filtros completos |
| `PATCH /dashboard/daily-report/:ticketId` | ✅ | `/api/v1/companies/:companyId/dashboard/daily-report/:ticketId` | Incluye `vendor` en campos editables |

Auth en todos los de company: `Authorization: Bearer <JWT>` + acceso a `companyId`.

**Shape paginado real (companies y tickets):** `{ success, data: { data: T[], total, page, limit, pages } }` — alineado a `Paginated<T>` del frontend, no a ejemplos Postman con `meta` separado.
