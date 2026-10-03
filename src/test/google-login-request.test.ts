import { afterEach, describe, expect, it, vi } from 'vitest';
import { googleLoginRequest } from '@/services/auth.service';
import type { AuthUser } from '@/types/auth';

const user: AuthUser = {
  _id: 'user-google',
  name: 'Usuario Google',
  email: 'google@recify.test',
  platformRole: null,
  memberships: [
    { membershipId: 'membership-a', companyId: 'company-a', companyName: 'A', companyStatus: 'active', companyTimezone: 'America/Mexico_City', role: 'accountant', status: 'active' },
  ],
  status: 'active',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('googleLoginRequest', () => {
  it('POSTs only idToken to /auth/google', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          success: true,
          message: 'Success',
          data: { user, token: 'recify-jwt' },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await googleLoginRequest({ idToken: 'gis-id-token' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1/auth/google');
    expect(options.method).toBe('POST');
    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(body).toEqual({ idToken: 'gis-id-token' });
    expect(body).not.toHaveProperty('email');
    expect(body).not.toHaveProperty('role');
    expect(body).not.toHaveProperty('companies');
    expect(body).not.toHaveProperty('googleId');
    expect(body).not.toHaveProperty('name');
  });
});
