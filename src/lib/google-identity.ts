export const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/** Official GIS `renderButton` width range, in pixels. */
export const GIS_BUTTON_MIN_WIDTH_PX = 200;
export const GIS_BUTTON_MAX_WIDTH_PX = 400;

export function gisButtonWidthPx(hostWidth: number): number {
  const measured = Math.floor(hostWidth);
  if (!Number.isFinite(measured) || measured <= 0) return GIS_BUTTON_MIN_WIDTH_PX;
  return Math.min(GIS_BUTTON_MAX_WIDTH_PX, Math.max(GIS_BUTTON_MIN_WIDTH_PX, measured));
}

export function getGoogleClientId(): string | undefined {
  const value = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function isGoogleIdentityReady(): boolean {
  return Boolean(window.google?.accounts?.id);
}

export function loadGoogleIdentityScript(): Promise<void> {
  if (isGoogleIdentityReady()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const fail = () => {
      reject(new Error('Google Identity Services failed to load'));
    };

    const succeedIfReady = () => {
      if (isGoogleIdentityReady()) {
        resolve();
        return;
      }
      fail();
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', succeedIfReady, { once: true });
      existing.addEventListener('error', fail, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = succeedIfReady;
    script.onerror = fail;
    document.head.appendChild(script);
  });
}
