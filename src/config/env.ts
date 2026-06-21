import { z } from 'zod';

/**
 * Validación y acceso centralizado a las variables de entorno expuestas por
 * Vite (todo lo que empieza por `VITE_`).
 *
 * Las variables se validan UNA sola vez al cargar el módulo. Si falta una
 * variable obligatoria o tiene un formato incorrecto, la app falla en arranque
 * en desarrollo con un mensaje claro en consola en lugar de fallar después en
 * runtime con un error críptico.
 *
 * Cualquier módulo que necesite leer config debe importar `env` desde aquí en
 * lugar de tocar `import.meta.env` directamente.
 */
const envSchema = z.object({
  // Vacío o ausente = usar URLs relativas (mismo dominio).
  // Si se define, debe ser una URL absoluta válida.
  VITE_API_URL: z
    .string()
    .refine(
      (value) => value === '' || /^https?:\/\/.+/i.test(value),
      'VITE_API_URL debe ser una URL http(s) absoluta o quedar vacía',
    )
    .optional()
    .default(''),
});

type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(import.meta.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`[config] Variables de entorno inválidas:\n${issues}`);
  }
  return parsed.data;
}

const parsed = loadEnv();

export const env = {
  apiUrl: parsed.VITE_API_URL.replace(/\/$/, ''),
} as const;

export type AppEnv = typeof env;
