# Sesión con cookie HttpOnly

La sesión de Recify vive en la cookie `__Host-recify_session`. El navegador la envía con `credentials: 'include'`. JavaScript no puede leerla y el JSON de login, registro, Google y `/auth/me` no incluye el JWT.

## Qué guarda el cliente

- `recify.token` solo se borra. No se vuelve a escribir.
- `recify.user` no es fuente de verdad y también se borra al confirmar sesión.
- `recify.companyId` recuerda la empresa elegida y solo se usa si `/auth/me` sigue autorizándola.
- `recify.sessionSignal` (`in:<timestamp>` o `out:<timestamp>`) sincroniza pestañas. No contiene el JWT.

Al abrir la app el cliente consulta `GET /auth/me`. 200 restaura el perfil. 401 deja la sesión anónima. 403 marca prohibido. Un fallo de red deja el estado `offline` y no cierra sesión por sí solo.

## Logout

`POST /auth/logout` debe confirmar la revocación antes de redirigir a `/auth`. Si la llamada falla, la interfaz oculta los datos privados y permanece en cierre de sesión con reintento. Esa llamada fallida no prueba que el servidor haya revocado la cookie.

Un logout confirmado incrementa `tokenVersion` del usuario y deja inválidas las cookies anteriores en todos los dispositivos. Un segundo logout, o un logout con una cookie ya reemplazada por un login nuevo, no vuelve a incrementar el contador.

## Localhost

La cookie es `Secure` también en desarrollo. Chrome, Firefox y Safari actuales tratan `http://localhost` como contexto seguro y aceptan esa cookie. Un host http que no sea localhost no la guardará. El frontend de Vite está en `http://localhost:8080` y la API en `http://localhost:3000`; el origen del frontend debe estar en `CORS_ORIGIN` y los requests mutables envían `Origin`.

## Producción

El frontend público es `https://app.recify.com.mx` y la API es `https://api.recify.com.mx`. Comparten el sitio `recify.com.mx`, así que `SameSite=Lax` envía la cookie en las solicitudes con credenciales. `SESSION_HOSTS` debe ser exactamente `api.recify.com.mx,app.recify.com.mx`. Un sufijo como `vercel.app`, `onrender.com`, `com` o `com.au` no autoriza a otros hosts. El par `*.vercel.app` y `*.onrender.com` sigue siendo cross-site y el API no arranca con esa configuración.

## Logout y una sesión nueva

El navegador guarda la cookie que llegue última. El servidor no puede ordenar dos respuestas HTTP independientes. Si el logout sigue en vuelo y empieza un login en esta pestaña, o otra pestaña señala una sesión nueva, el cliente aborta el logout para que esa respuesta no borre la cookie nueva. Si el navegador ya aplicó el `Set-Cookie` de borrado, esa respuesta no se puede deshacer: la sesión nueva queda revocada y la interfaz no debe mostrar datos privados.
