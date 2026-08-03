/**
 * Política de caché en memoria para listados/detalles de tickets y facturas.
 * No se aplica como default global del QueryClient.
 */
export const ENTITY_QUERY_CACHE = {
  staleTime: 30_000,
  gcTime: 5 * 60_000,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} as const;
