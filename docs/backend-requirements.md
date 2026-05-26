# Requerimientos pendientes para Backend — Recify

> Generado el 2026-05-25. Solo documenta lo que no puede resolverse en frontend con los endpoints actuales.

---

## 1. Contexto

El frontend consume la API REST de `recify-back-api`. Esta lista detalla los bloqueos reales detectados durante la auditoría del código frontend. No incluye deseos de producto; solo necesidades técnicas concretas.

---

## 2. Funcionalidades frontend bloqueadas por backend

### 2.1 Imagen del ticket en listado e histórico (prioridad alta)

**Problema:** `GET /companies/:companyId/tickets` y `GET .../tickets/:id` no devuelven `imageUrl` ni ninguna URL de imagen porque el modelo tiene `rawData` con `select: false`. El frontend lee `ticket.rawData.imageUrl` pero ese campo no llega en las respuestas de los endpoints de tickets.

**Impacto:** En Histórico la preview de imagen queda siempre en estado "Sin imagen", aunque la imagen exista en Cloudflare R2.

**Solución sugerida (una de las siguientes):**

- Proyectar `rawData.imageUrl` como campo de primer nivel (`imageUrl`) en la respuesta de ticket, o
- Añadir `select: '+rawData.imageUrl'` en las queries de detalle, o
- Crear `GET /companies/:companyId/tickets/:id/image-url` que devuelva solo `{ imageUrl }`.

**Contrato sugerido:**
```json
{
  "_id": "...",
  "amount": 1200,
  "status": "processed",
  "imageUrl": "https://r2.cloudflarestorage.com/..."
}
```

---

### 2.2 Edición de campos OCR post-análisis (prioridad media)

**Campos actualmente editables vía PATCH `/tickets/:id`:** `status`, `reviewStatus`, `category`, `paymentMethod`.

**Campos que el usuario ve pero no puede guardar:** `comercio` (vendor), `fecha`, `hora`, `subtotal`, `IVA`, `total`, `moneda`.

Estos campos vienen de `rawData` (OCR), el cual no es editable hoy.

**Solución sugerida:**

- Ampliar PATCH `/tickets/:id` para aceptar `rawData.vendor`, `rawData.subtotal`, `rawData.tax`, etc., o
- Nuevo endpoint `PATCH /tickets/:id/extracted-fields` con body tipado para campos OCR.

---

### 2.3 Onboarding: registro con empresa (prioridad alta)

**Problema:** `POST /auth/register` crea el usuario con `companies: []`. No existe flujo self-service para que el usuario recién registrado cree o se asocie a una empresa.

**Impacto:** Cualquier usuario que se registra solo queda bloqueado (el guard de rutas exige `companyId` en sesión).

**Solución actual:** script admin `node scripts/assign-company.js <email>`.

**Solución sugerida:**

- `POST /auth/register` que acepte opcionalmente `company: { name, rfc, timezone }` y cree la empresa + vínculo en una transacción, o
- Permitir que un usuario autenticado sin empresa haga `POST /companies` y se auto-asigne.

---

### 2.4 Descarga de ticket como archivo (prioridad baja)

**Problema:** No existe endpoint para descargar o exportar un ticket en PDF/CSV.

**Impacto:** El botón "Descargar" fue eliminado del frontend por no tener soporte backend.

**Solución sugerida:** `GET /companies/:companyId/tickets/:id/export?format=pdf|csv`

---

### 2.5 OAuth Google (prioridad baja)

**Problema:** No existe `POST /auth/google` ni equivalente OAuth.

**Impacto:** El botón "Continuar con Google" está visible pero deshabilitado con tooltip informativo.

---

## 3. Campos faltantes o inconsistentes en contratos

| Campo | Endpoint | Situación |
|-------|----------|-----------|
| `imageUrl` | `GET /tickets`, `GET /tickets/:id` | No se proyecta (`rawData.select:false`) |
| `vendor` / `comercio` | `GET /tickets` | Solo disponible dentro de `rawData` (no accesible) |
| `subtotal`, `tax` | `GET /tickets` | Ídem, dentro de `rawData` |
| `reviewStatus` | `GET /tickets` listado | Devuelto en modelo pero no en todos los filtros de búsqueda UI |

---

## 4. Endpoints necesarios o mejoras requeridas

| Endpoint | Método | Prioridad | Motivo |
|----------|--------|-----------|--------|
| `/tickets/:id` (PATCH ampliado) | PATCH | Media | Campos OCR editables |
| `/auth/register` (con empresa) | POST | Alta | Onboarding bloqueado |
| `/tickets/:id/export` | GET | Baja | Descarga ticket |
| `/auth/google` | POST | Baja | OAuth |
| `/tickets` o `/tickets/:id` | GET | Alta | Exponer `imageUrl` en respuesta |

---

## 5. Casos de error esperados (contratos frontend ya maneja)

- `401` → limpia sesión y redirige a `/auth` automáticamente.
- `403` → usuario sin acceso a empresa (`requireCompanyAccess`).
- `400` → errores de validación Zod con `errors[]` detallado.
- `409` → email duplicado en registro, RFC duplicado en empresa.
- `404` → ticket o empresa no encontrada.
- `500` → error interno; el frontend muestra mensaje genérico.

---

## 6. Prioridad sugerida

| Prioridad | Ítem |
|-----------|------|
| 🔴 Alta | Exponer `imageUrl` en respuestas de tickets |
| 🔴 Alta | Onboarding: registro + empresa |
| 🟡 Media | Edición campos OCR vía PATCH |
| 🟢 Baja | Descarga de ticket |
| 🟢 Baja | OAuth Google |
