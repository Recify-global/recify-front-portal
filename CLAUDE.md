# CLAUDE.md — Auditoría de Seguridad del Frontend Recify

> **Proyecto:** `recify-front-portal`
> **Stack:** Vite + React 18 + TypeScript + Radix UI / shadcn + TanStack Query + React Router v6 + Zod
> **Fecha de auditoría:** 2026-06-21
> **Auditor:** Claude (Opus 4.7)
> **Alcance:** Código fuente en `src/`, configuración (`vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `.env.example`), dependencias (`package.json`).

---

## 1. Resumen Ejecutivo

Se realizó una auditoría exhaustiva del portal frontend de Recify. El proyecto utiliza tecnologías modernas y aplica algunas buenas prácticas (sanitización de tipos en mappers, manejo automático del 401, validación de `companyId` en hooks). Sin embargo, existen **brechas críticas en el manejo de sesión y autenticación** que deben abordarse antes de salir a producción.

### Estadísticas

| Severidad      | Hallazgos |
|----------------|-----------|
| Crítica        | 4         |
| Alta           | 7         |
| Media          | 6         |
| Baja           | 6         |
| Positivos (✓)  | 7         |
| **Total**      | **30**    |

Adicionalmente, `npm audit` reportó **20 vulnerabilidades en dependencias** (1 crítica, 12 altas, 6 moderadas, 1 baja) — detalle en B-06.

### Riesgos Principales

1. **Tokens JWT en `localStorage`** — vulnerable a XSS (cualquier script malicioso lee la sesión).
2. **`innerHTML` directo** en componente de preview de imágenes.
3. **`dangerouslySetInnerHTML`** en `chart.tsx` sin sanitización de color CSS.
4. **Sin validación con Zod** en login/registro, a pesar de tener la librería disponible.
5. **Sin timeout** en `fetch` — solicitudes pueden quedarse colgadas indefinidamente.
6. **Sin Content-Security-Policy** en `index.html`.
7. **`tsconfig` con `strict: false`** — permite errores de tipo y `any` implícito.

### Esfuerzo Estimado de Remediación

| Severidad | Esfuerzo  |
|-----------|-----------|
| Crítica   | 2-3 días  |
| Alta      | 4-5 días  |
| Media     | 2-3 días  |
| Baja      | 1-2 días  |
| **Total** | **9-13 días** (desarrollo + testing) |

---

## 2. Hallazgos por Severidad

### 2.1 🔴 Críticos

#### C-01. Tokens JWT almacenados en `localStorage`

- **Archivo:** `src/auth/storage.ts:11-46`
- **OWASP:** A02:2021 – Cryptographic Failures (CWE-522)
- **Descripción:** El token JWT y la información de usuario se persisten en `localStorage` sin cifrar. `localStorage` es accesible desde cualquier script ejecutado en el contexto del navegador (XSS, extensiones maliciosas, devtools).
- **Impacto:** Cualquier XSS resulta en robo de sesión, suplantación de identidad y acceso completo a la API en nombre del usuario.
- **Remediación recomendada:**
  - **Preferida:** Migrar al backend a cookies `HttpOnly; Secure; SameSite=Strict`. El frontend deja de manejar el token explícitamente.
  - **Alternativa:** Usar `sessionStorage` (no persiste tras cerrar pestaña) + tokens de corta duración + refresh tokens.

#### C-02. `innerHTML` directo en `TicketImagePreview`

- **Archivo:** `src/components/recify/TicketImagePreview.tsx:47-52`
- **OWASP:** A03:2021 – Injection (CWE-95)
- **Descripción:** En el handler `onError` de una `<img>` se invoca `wrapper.innerHTML = '...'` para mostrar un fallback. Aunque el HTML actual es estático, el patrón es peligroso y propenso a romperse si se modifica con datos del backend.
- **Remediación:** Renderizar el fallback con React (estado `imgError`) en lugar de manipular DOM imperativamente.
  ```tsx
  const [imgError, setImgError] = useState(false);
  return imgError ? <FallbackImage /> : <img onError={() => setImgError(true)} />;
  ```

#### C-03. `dangerouslySetInnerHTML` en `chart.tsx` sin validar valores CSS

- **Archivo:** `src/components/ui/chart.tsx:70-85`
- **OWASP:** A03:2021 – Injection
- **Descripción:** Se inyectan estilos CSS dinámicos usando `dangerouslySetInnerHTML`. Los valores de `color`/`theme` provienen del `config` del gráfico; si en el futuro alguno proviene de datos del backend, sería un vector de inyección CSS / exfiltración.
- **Remediación:** Validar formato de color con regex antes de insertar (`/^(#[0-9a-f]{3,8}|rgb\(...\)|var\(--[\w-]+\))$/i`) o usar CSS variables vía `style={}` en lugar de inyectar tags `<style>`.

#### C-04. Sin validación de esquemas (Zod) en login/registro

- **Archivos:** `src/pages/AuthPage.tsx:65-109`, `src/services/auth.service.ts`
- **OWASP:** A01:2021 – Broken Access Control
- **Descripción:** `zod` está en `package.json` pero no se usa para validar credenciales antes del envío. Solo se comprueba presencia básica de campos.
- **Remediación:**
  ```ts
  import { z } from 'zod';

  const LoginSchema = z.object({
    email: z.string().email().max(255),
    password: z.string().min(8).max(128),
  });
  const RegisterSchema = LoginSchema.extend({
    name: z.string().min(2).max(100),
  });
  ```

---

### 2.2 🟠 Altos

#### A-01. Sin timeout en `fetch`

- **Archivo:** `src/api/http.ts:39-100`
- **OWASP:** A05:2021 – Security Misconfiguration
- **Descripción:** Si el backend no responde, la promesa nunca rechaza. UX degradada y conexiones colgadas.
- **Remediación:** Usar `AbortController` con `setTimeout(30000)`. Devolver `ApiRequestError('Timeout', 0)` si se aborta.

#### A-02. Sin validación periódica de sesión / refresh token

- **Archivo:** `src/hooks/use-auth.ts:26-65`, `src/auth/storage.ts`
- **OWASP:** A07:2021 – Identification and Authentication Failures
- **Descripción:** Una vez que el token existe en `localStorage`, el frontend asume que es válido hasta que un request devuelve 401. Tampoco se decodifica `exp` del JWT.
- **Remediación:**
  - Añadir `jwt-decode` para leer `exp` y considerar el token inválido localmente cuando expire.
  - Implementar refresh-token flow (interceptor que reintenta tras refrescar).
  - Validar sesión cada 5 min con un endpoint `/auth/verify`.

#### A-03. Headers de seguridad faltantes en cliente HTTP

- **Archivo:** `src/api/http.ts:39-100`
- **OWASP:** A04:2021 – Insecure Design
- **Descripción:** Las requests no incluyen `X-Requested-With`, no validan `Content-Type` de las respuestas, y no especifican `credentials`.
- **Remediación:** Añadir `X-Requested-With: XMLHttpRequest`, validar que las respuestas JSON tengan `application/json`, definir `credentials: 'same-origin'` o `'include'` explícitamente.

#### A-04. Sin Content-Security-Policy

- **Archivo:** `index.html`
- **OWASP:** A05:2021 – Security Misconfiguration
- **Descripción:** No hay CSP definido (ni meta tag ni header). En caso de XSS, no hay barrera adicional contra carga de scripts externos.
- **Remediación:** Añadir CSP via header HTTP en el servidor que sirve la SPA:
  ```
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.recify.io; object-src 'none'; base-uri 'self'; frame-ancestors 'none';
  ```

#### A-05. Logout sólo limpia `localStorage` (no revoca en backend)

- **Archivo:** `src/hooks/use-auth.ts:51-54`
- **OWASP:** A07:2021 – Identification and Authentication Failures
- **Descripción:** No se llama a `POST /auth/logout`. Un token robado sigue siendo válido hasta su expiración natural.
- **Remediación:** Llamar a `POST /auth/logout` (best-effort, sin bloquear) antes de `clearAuthSession()`.

#### A-06. `companyId` se confía sólo desde `localStorage`

- **Archivo:** `src/guards/ProtectedRoute.tsx:14-35`
- **OWASP:** A01:2021 – Broken Access Control
- **Descripción:** El guard sólo verifica que `companyId` exista en storage. Un atacante puede modificar el valor en devtools. Aunque el backend debería validarlo, el frontend no debe confiar ciegamente.
- **Remediación:** Validar que `companyId` ∈ `user.companies` antes de renderizar las rutas protegidas.

#### A-07. Rutas sin autorización por roles

- **Archivo:** `src/App.tsx:14-34`, `src/guards/ProtectedRoute.tsx`
- **OWASP:** A01:2021 – Broken Access Control
- **Descripción:** No hay `RoleProtectedRoute`. Cualquier usuario autenticado ve todas las rutas, aunque el backend rechace mutaciones.
- **Remediación:** Crear un `RoleProtectedRoute` que acepte `allowedRoles: UserRole[]`.

---

### 2.3 🟡 Medios

#### M-01. Mensajes de error del backend expuestos sin sanitizar

- **Archivo:** `src/api/http.ts:66-70`
- **OWASP:** A01:2021 – Broken Access Control / Information Disclosure
- **Descripción:** Se muestra al usuario el `message` crudo de la respuesta de la API. Permite enumeration attacks (`Email already exists`, etc.) y posible filtrado de stack traces en 5xx.
- **Remediación:** Mapear códigos HTTP a mensajes seguros; sólo permitir mensajes literales del backend en 409/422 (conflictos de validación).

#### M-02. URLs `href` sin validar protocolo

- **Archivo:** `src/components/recify/TicketImagePreview.tsx:29-30`
- **OWASP:** A03:2021 – Injection
- **Descripción:** Se usa `href={imageUrl}` sin verificar que sea `http://` o `https://`. Una URL `javascript:` ejecutaría código.
- **Remediación:** Helper `isSafeUrl()` que use `new URL()` y exija `['http:', 'https:'].includes(protocol)`.

#### M-03. TypeScript sin `strict`

- **Archivo:** `tsconfig.json`, `tsconfig.app.json`
- **OWASP:** A05:2021 – Security Misconfiguration
- **Descripción:** `strict: false`, `noImplicitAny: false`, `strictNullChecks: false`. El compilador no detecta accesos a `undefined`/`null` ni `any` accidentales.
- **Remediación:** Activar `strict: true` progresivamente (puede requerir ajustes en código existente).

#### M-04. Sin protección CSRF en endpoints de mutación

- **Archivo:** `src/api/http.ts`, todos los `services/*.service.ts`
- **OWASP:** A01:2021 – Broken Access Control (CSRF)
- **Descripción:** Si el backend usa cookies para auth (post-migración a HttpOnly), las requests deben incluir un token CSRF o usar el patrón double-submit.
- **Remediación:** Implementar endpoint `GET /csrf-token` y agregar `X-CSRF-Token` a todas las mutaciones.

#### M-05. Sin rate limiting en cliente (login en particular)

- **Archivo:** `src/pages/AuthPage.tsx:65-109`
- **OWASP:** A05:2021 – Security Misconfiguration
- **Descripción:** El cliente no limita intentos consecutivos. Aunque la responsabilidad real recae en el backend, una capa cliente reduce ruido.
- **Remediación:** Pequeña clase `RateLimiter` (5 intentos / 60s) que deshabilita el botón de login.

#### M-06. Sin tests de seguridad

- **Archivo:** `src/test/`
- **OWASP:** A04:2021 – Insecure Design
- **Descripción:** Los tests existentes verifican lógica de negocio, no escenarios de seguridad (XSS en notas, manejo de 401, validación de inputs).
- **Remediación:** Añadir `auth.security.test.tsx` con casos de XSS, 401, intentos de payloads maliciosos.

---

### 2.4 🟢 Bajos

#### B-01. `VITE_API_URL` expone URL del backend al cliente

- **Archivo:** `.env.example`, `src/api/http.ts:6-10`
- **OWASP:** A05:2021 – Security Misconfiguration
- **Descripción:** `VITE_*` se inlinea en el bundle final. La URL del backend es trivial de descubrir.
- **Remediación:** Usar URLs relativas (`/api/v1/...`) si el frontend y el backend comparten dominio (recomendado). Si no, validar contra una allow-list de hosts conocidos.

#### B-02. Enlaces placeholder `href="#"`

- **Archivo:** `src/pages/AuthPage.tsx:289,295,297`
- **Descripción:** "¿Olvidaste tu contraseña?", "Términos de servicio", "Política de privacidad" apuntan a `#`.
- **Remediación:** Implementar las páginas o usar URLs reales (legal, soporte).

#### B-03. Cookie de sidebar sin flags de seguridad

- **Archivo:** `src/components/ui/sidebar.tsx:68`
- **OWASP:** A02:2021 – Cryptographic Failures
- **Descripción:** `document.cookie = ...` sin `Secure` ni `SameSite`. No es sensible (estado UI), pero es buena práctica.
- **Remediación:** Añadir `; SameSite=Lax; Secure` (cuando `protocol === 'https:'`).

#### B-04. Dependencia `lovable-tagger` sin documentar

- **Archivo:** `package.json:82`, `vite.config.ts`
- **OWASP:** A06:2021 – Vulnerable and Outdated Components
- **Descripción:** Plugin de desarrollo cuya función no está documentada. Verificar si se necesita en producción y si tiene CVEs.
- **Remediación:** Documentar en README; ejecutar `npm audit` y `npm outdated` regularmente; considerar `snyk` o GitHub Dependabot.

#### B-06. Vulnerabilidades en dependencias confirmadas por `npm audit`

- **Fuente:** `npm audit` (ejecutado 2026-06-21) — **20 vulnerabilidades** (1 crítica, 12 altas, 6 moderadas, 1 baja).
- **OWASP:** A06:2021 – Vulnerable and Outdated Components
- **Vulnerabilidades relevantes (runtime / producción):**
  - 🔴 **`react-router` / `react-router-dom` (high):** _React Router has unexpected external redirect via untrusted paths_ y _same-origin redirect with path starting `//` causes open redirect via protocol-relative URL reinterpretation_. **Crítico** porque la app usa `react-router-dom@6.30.1` y maneja redirecciones tras login.
  - 🟠 `postcss` (moderate): _XSS via Unescaped `</style>` in CSS Stringify Output_.
- **Vulnerabilidades en herramientas de build/dev (no llegan a producción, pero sí a desarrolladores):**
  - 🔴 **`vitest` (critical):** _When Vitest UI server is listening, arbitrary file can be read and executed_.
  - 🟠 **`vite` (high):** múltiples — bypass de `server.fs.deny`, path traversal en `.map` handling, etc.
  - 🟠 `esbuild` (moderate): cualquier sitio web puede enviar requests al dev server y leer respuesta.
  - 🟠 `rollup` (high): arbitrary file write via path traversal.
  - 🟠 `lodash`, `glob`, `ws`, `minimatch`, `picomatch`, `form-data`, `flatted`, `ajv`, `js-yaml`, `yaml`, `brace-expansion` con CVEs varios (ReDoS, prototype pollution, code injection).
- **Remediación inmediata:**
  ```bash
  # 1) Actualizar react-router-dom a una versión parcheada
  npm install react-router-dom@latest
  # 2) Aplicar fixes automáticos compatibles
  npm audit fix
  # 3) Revisar manualmente los breaking changes (con --force solo si es necesario)
  npm audit fix --force   # ⚠️ revisar cambios mayores antes
  # 4) Añadir a CI/CD
  echo "npm audit --audit-level=high" >> .github/workflows/ci.yml
  ```
- **Recomendación adicional:** Integrar Dependabot o Renovate para alertas automáticas; revisar `npm audit` antes de cada release.

#### B-05. Sin Subresource Integrity (SRI) — si se cargan scripts externos

- **Archivo:** `index.html`
- **Descripción:** Si en el futuro se agregan CDNs externas, deberían incluir atributo `integrity="..."`.
- **Remediación:** Si se mantiene todo el bundle local (recomendado), no aplica. Si se agrega un CDN, añadir SRI.

---

### 2.5 ✅ Buenas Prácticas Detectadas

1. **Manejo automático del 401** en `src/api/http.ts:87-93` que limpia la sesión y redirige al login.
2. **Sincronización multi-pestaña** del estado de auth en `ProtectedRoute.tsx` (escucha `storage` events).
3. **Tipos TypeScript con uniones discriminadas** en `src/types/auth.ts` y `src/types/ticket.ts`.
4. **Sanitización en mappers** (`asNumber`, `asString`, `normalizeStatus`) en `src/mappers/ticket.mapper.ts:39-60`.
5. **Componentes Radix UI** — accesibilidad y seguridad por defecto (sin XSS en componentes interactivos).
6. **Guard de `companyId`** en hooks de TanStack Query (`src/hooks/use-tickets.ts:10-16`) — no se ejecuta query si no hay compañía.
7. **JSON parsing seguro** en `src/auth/storage.ts:53-66` (try/catch + limpieza de valor corrupto).

---

## 3. Plan de Remediación Recomendado

### Fase 1 — Críticos (2-3 días)

1. Migrar sesión a HttpOnly cookies o, transicionalmente, a `sessionStorage` + JWT corto.
2. Reescribir `TicketImagePreview` con estado React en lugar de `innerHTML`.
3. Sanitizar valores de color en `chart.tsx`.
4. Agregar validación Zod a login/registro/cambio de contraseña.

### Fase 2 — Altos (4-5 días)

5. Añadir timeout (`AbortController`) a `apiRequest`.
6. Implementar refresh token + decodificación de `exp` con `jwt-decode`.
7. Headers de seguridad (`X-Requested-With`, validación `Content-Type`, `credentials`).
8. Configurar CSP estricto en el servidor (Nginx/Vercel/CloudFront).
9. Logout que llame a `POST /auth/logout`.
10. Validar `companyId` contra `user.companies` en `ProtectedRoute`.
11. Crear `RoleProtectedRoute` y aplicar en rutas administrativas.

### Fase 3 — Medios (2-3 días)

12. Sanitización de mensajes de error del backend.
13. Helper `isSafeUrl()` aplicado a todos los `href` dinámicos.
14. Activar `strict: true` en TypeScript.
15. CSRF tokens (si se migra a cookies).
16. Rate limiter cliente en login.
17. Suite de tests de seguridad.

### Fase 4 — Bajos (1-2 días)

18. Migrar a URLs relativas para la API.
19. Completar links placeholder.
20. Flags `Secure; SameSite` en cookies.
21. Documentar `lovable-tagger` y configurar Dependabot.

---

## 4. Mejoras Adicionales (No Estrictamente de Seguridad)

- **Manejo de errores global:** Boundary de errores en React (`ErrorBoundary`) para evitar pantallas blancas.
- **Logging estructurado:** Reemplazar `console.log/warn` por wrapper que respete entorno (silencioso en prod).
- **Observability:** Integrar Sentry / Datadog RUM para detectar errores client-side en producción.
- **Lazy loading de rutas:** Usar `React.lazy()` para reducir bundle inicial.
- **Headers HTTP en hosting:** Configurar también `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
- **CI/CD:** Añadir `npm audit --audit-level=high`, `eslint-plugin-security`, y SAST (Snyk/Semgrep) al pipeline.

---

## 5. Mapeo OWASP Top 10 (2021) ↔ Hallazgos

| OWASP                                              | Hallazgos             |
|----------------------------------------------------|-----------------------|
| A01 – Broken Access Control                        | C-04, A-06, A-07, M-01, M-04 |
| A02 – Cryptographic Failures                       | C-01, B-03            |
| A03 – Injection                                    | C-02, C-03, M-02      |
| A04 – Insecure Design                              | A-03, M-06            |
| A05 – Security Misconfiguration                    | A-01, A-04, M-03, M-05, B-01, B-02 |
| A06 – Vulnerable & Outdated Components             | B-04                  |
| A07 – Identification & Authentication Failures     | A-02, A-05            |

A08, A09 y A10 no se aplican directamente al frontend (cubiertos en backend / infraestructura).

---

## 6. Referencias

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [OWASP Cheat Sheet: XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [OWASP Cheat Sheet: JWT for Java](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html)
- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [React Docs: dangerouslySetInnerHTML](https://react.dev/reference/react-dom/components/common#dangerously-setting-the-inner-html)
- [Auth0: Token Storage](https://auth0.com/docs/secure/security-guidance/data-security/token-storage)

---

_Documento generado como auditoría inicial. Recomendado re-auditar tras la Fase 1 y antes del despliegue a producción._
