# Session cookie migration gate

The frontend currently uses a bearer JWT in localStorage. This remains a known
hardening gap because an XSS could read the token.

The observed deployment is split between a Vercel frontend and
`recify-back-api.onrender.com`. Those are different sites. A cross-site
HttpOnly cookie would require `SameSite=None; Secure` and can still be blocked
as a third-party cookie by browsers. Migrating only part of the flow would make
authentication unreliable, so this change intentionally does not introduce a
cookie fallback.

Before migrating:

1. Put frontend and API on same-site custom domains, for example
   `app.example.com` and `api.example.com`.
2. Confirm the exact production CORS allowlist and proxy TLS behavior.
3. Implement the session cookie, `GET /auth/me`, `POST /auth/logout`,
   `credentials: include`, and CSRF protection as one release.
4. Require an allowlisted `Origin` plus a session-bound CSRF token for unsafe
   cookie-authenticated requests.
5. Remove the JWT from response bodies and delete `recify.token` migration
   residue only after cookie auth passes browser QA.

Until then, CSP and output hardening reduce XSS likelihood but do not remove
the localStorage token risk.
