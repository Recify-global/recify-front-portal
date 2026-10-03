import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UploadHelpDialog } from '@/components/recify/UploadHelpDialog';
import { MAX_TICKET_FILES_PER_BATCH } from '@/utils/upload-file';

afterEach(cleanup);

describe('UploadHelpDialog', () => {
  it('shows a discoverable secondary help action', () => {
    render(<UploadHelpDialog />);

    expect(
      screen.getByRole('button', { name: '¿Cómo subir mis archivos?' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens with the real Ticket and Factura upload guidance', () => {
    render(<UploadHelpDialog />);

    fireEvent.click(screen.getByRole('button', { name: '¿Cómo subir mis archivos?' }));

    expect(
      screen.getByRole('dialog', { name: '¿Cómo subir tus archivos?' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Sube una foto clara de tu Ticket')).toBeInTheDocument();
    expect(screen.getByText('Foto clara')).toBeInTheDocument();
    expect(screen.getByText('Foto borrosa')).toBeInTheDocument();
    expect(screen.getByText('Puedes subir varios Tickets al mismo tiempo.')).toBeInTheDocument();
    expect(
      screen.getByText('Formatos: JPG, PNG, WEBP o GIF · máximo 10 MB por imagen.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${MAX_TICKET_FILES_PER_BATCH} Tickets por carga`),
    ).toBeInTheDocument();
    expect(screen.getByText('Sube tu Factura en PDF')).toBeInTheDocument();
    expect(screen.getByText('Archivo PDF original')).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'LI' &&
          element.textContent ===
            'Las Facturas deben cargarse en formato PDF · máximo 10 MB.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('No uses fotografías para este flujo.')).toBeInTheDocument();
  });

  it('closes explicitly and returns focus to the trigger', async () => {
    render(<UploadHelpDialog />);
    const trigger = screen.getByRole('button', { name: '¿Cómo subir mis archivos?' });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes with Escape', async () => {
    render(<UploadHelpDialog />);

    fireEvent.click(screen.getByRole('button', { name: '¿Cómo subir mis archivos?' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
