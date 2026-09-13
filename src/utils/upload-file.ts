export const GENERIC_BINARY_MIME = 'application/octet-stream';

export const TICKET_IMAGE_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

export const TICKET_IMAGE_TRANSPORT_MIME_TYPES: readonly string[] = [
  ...TICKET_IMAGE_MIME_TYPES,
  GENERIC_BINARY_MIME,
  '',
];

export const TICKET_IMAGE_ACCEPT = TICKET_IMAGE_MIME_TYPES.join(',');
export const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TICKET_FILES_PER_BATCH = 5;

export type TicketImageValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export function validateTicketImageFile(
  file: File | null | undefined,
  options: {
    allowedMimeTypes?: readonly string[];
    maxBytes?: number;
  } = {},
): TicketImageValidationResult {
  if (!file) {
    return { ok: false, message: 'Selecciona una imagen para continuar.' };
  }
  if (file.size <= 0) {
    return { ok: false, message: 'El archivo está vacío.' };
  }

  const allowedMimeTypes =
    options.allowedMimeTypes ?? TICKET_IMAGE_TRANSPORT_MIME_TYPES;
  if (!allowedMimeTypes.includes((file.type || '').toLowerCase())) {
    return {
      ok: false,
      message: 'Formato no permitido. Usa JPG, PNG, WEBP o GIF.',
    };
  }

  const maxBytes = options.maxBytes ?? MAX_UPLOAD_FILE_BYTES;
  if (file.size > maxBytes) {
    return {
      ok: false,
      message: `Supera el máximo de ${Math.round(maxBytes / (1024 * 1024))} MB.`,
    };
  }

  return { ok: true };
}
