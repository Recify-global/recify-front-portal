import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraCaptureDialog } from '@/components/recify/CameraCaptureDialog';

function createMockStream() {
  const stop = vi.fn();
  const track = { stop, kind: 'video', readyState: 'live' };
  return {
    stream: {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream,
    stop,
  };
}

function mediaError(name: string) {
  const err = new DOMException(name, name);
  return err;
}

describe('CameraCaptureDialog', () => {
  const getUserMedia = vi.fn();
  let playMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getUserMedia.mockReset();

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    playMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(HTMLVideoElement.prototype, 'play', {
      configurable: true,
      value: playMock,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      get: () => 640,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      get: () => 480,
    });

    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = vi
      .fn()
      .mockReturnValue('data:image/jpeg;base64,AAAA');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(new Blob(['img'], { type: 'image/jpeg' })),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('NotAllowedError: una sola llamada a getUserMedia y mensaje de permiso', async () => {
    getUserMedia.mockRejectedValueOnce(mediaError('NotAllowedError'));

    render(
      <CameraCaptureDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Permiso de cámara denegado/i),
      ).toBeInTheDocument();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
  });

  it('NotReadableError: una sola llamada a getUserMedia', async () => {
    getUserMedia.mockRejectedValueOnce(mediaError('NotReadableError'));

    render(
      <CameraCaptureDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/La cámara está en uso por otra aplicación/i),
      ).toBeInTheDocument();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('SecurityError: una sola llamada a getUserMedia', async () => {
    getUserMedia.mockRejectedValueOnce(mediaError('SecurityError'));

    render(
      <CameraCaptureDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/No se pudo iniciar la cámara/i),
      ).toBeInTheDocument();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('OverconstrainedError: fallback a video:true con audio:false', async () => {
    const { stream } = createMockStream();
    getUserMedia
      .mockRejectedValueOnce(mediaError('OverconstrainedError'))
      .mockResolvedValueOnce(stream);

    render(
      <CameraCaptureDialog open onOpenChange={vi.fn()} onCapture={vi.fn()} />,
    );

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalledTimes(2);
    });

    expect(getUserMedia.mock.calls[0][0]).toEqual({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
    expect(getUserMedia.mock.calls[1][0]).toEqual({
      video: true,
      audio: false,
    });

    await waitFor(() => {
      const video = document.querySelector('video');
      expect(video).not.toBeNull();
      expect(video?.srcObject).toBe(stream);
    });
  });

  it('doble confirmación ejecuta onCapture una sola vez', async () => {
    const { stream } = createMockStream();
    getUserMedia.mockResolvedValue(stream);
    const onCapture = vi.fn();
    const onOpenChange = vi.fn();

    let releaseBlob: ((blob: Blob) => void) | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        blob: () =>
          new Promise<Blob>((resolve) => {
            releaseBlob = resolve;
          }),
      }),
    );

    render(
      <CameraCaptureDialog
        open
        onOpenChange={onOpenChange}
        onCapture={onCapture}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Capturar/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Capturar/i }));

    const usePhoto = await screen.findByRole('button', { name: /Usar foto/i });
    fireEvent.click(usePhoto);
    fireEvent.click(usePhoto);

    await waitFor(() => {
      expect(usePhoto).toBeDisabled();
    });

    expect(fetch).toHaveBeenCalledTimes(1);

    releaseBlob?.(new Blob(['img'], { type: 'image/jpeg' }));

    await waitFor(() => {
      expect(onCapture).toHaveBeenCalledTimes(1);
    });

    const file = onCapture.mock.calls[0][0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/jpeg');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('fallo al crear archivo libera el lock y no llama onCapture', async () => {
    const { stream } = createMockStream();
    getUserMedia.mockResolvedValue(stream);
    const onCapture = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('blob failed')),
    );

    render(
      <CameraCaptureDialog open onOpenChange={vi.fn()} onCapture={onCapture} />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Capturar/i })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Capturar/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Usar foto/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/No se pudo preparar la imagen capturada/i),
      ).toBeInTheDocument();
    });

    expect(onCapture).not.toHaveBeenCalled();

    const retry = screen.getByRole('button', { name: /Reintentar/i });
    expect(retry).toBeEnabled();

    getUserMedia.mockClear();
    const { stream: stream2 } = createMockStream();
    getUserMedia.mockResolvedValue(stream2);
    fireEvent.click(retry);

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled();
    });
  });
});
